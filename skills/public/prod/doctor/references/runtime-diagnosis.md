# 运行时问题诊断

## 可用工具

### exec_sql（数据库查询）

```
exec_sql(sql: str, env: 'develop' | 'product') -> QueryResult
```

`develop` 可读写；`product` SELECT 可直接执行，INSERT / UPDATE / DELETE 须用户明确确认后执行，DDL 禁止。详细 SQL 诊断模板见 [sql-patterns.md](sql-patterns.md)。

### db diagnose（数据库整体诊断）

```bash
coze-coding-ai db diagnose --env <env>
```

`--env` 参数：`develop`（默认，开发环境）| `product`（生产环境）

一次性获取数据库健康状态，适合在怀疑 DB 存在性能或连接问题时优先执行，避免手写 SQL 逐项排查。

**返回字段说明：**

| 字段路径 | 优先级 | 说明 |
|---------|--------|------|
| `pg_metrics.connection_stats` | P0 | `max_connections` 最大连接数、`total_connections` 当前连接数、`connection_usage_pct` 使用率%、`connections_by_state` 按状态（idle/active/…）分组 |
| `pg_metrics.top_queries_by_total_time` | P0 | 按累计耗时排序的 Top 20 查询，含 `query`、`calls`、`avg_ms`、`total_ms`、`rows` |
| `pg_metrics.top_queries_by_frequency` | P0 | 按调用次数排序的 Top 20 查询，字段同上 |
| `pg_metrics.slow_queries` | P0 | 平均执行时间 > 100ms 的慢查询 |
| `pg_metrics.blocked_queries` | P1 | 被阻塞的查询，含阻塞方/被阻塞方 PID、SQL、阻塞时长 |
| `pg_metrics.long_running_queries` | P1 | 长时间运行的查询，含 PID、持续时间、状态、SQL |
| `pg_metrics.database_size` | P1 | 数据库整体大小 |
| `pg_metrics.table_sizes` | P1 | 各表大小列表 |
| `supabase_metrics.rate_limited_429_count` | P0 | Supabase 429 限流次数，> 0 表示已触发限流 |

**典型诊断场景：**
- 连接数 `connection_usage_pct` 接近 100% → 连接池泄漏或并发过高
- `slow_queries` 非空 → 有慢查询，结合 `top_queries_by_total_time` 定位
- `rate_limited_429_count` > 0 → 触发 Supabase 限流，需降低请求频率或升级套餐
- `blocked_queries` 非空 → 存在锁竞争，查看阻塞链

### 本地日志（develop 环境）

**日志文件（按项目类型）：**

先执行 `echo $COZE_PROJECT_TYPE` 获取项目类型，再按下表选择日志文件：

| 文件 | 用途 | 适用项目类型 |
|------|------|------------|
| `app.log` | 主流程 + 关键错误，后端/服务问题首选 | 全部 |
| `console.log` | 浏览器控制台，前端/端侧问题首选 | `general_web` / `app` / `wechat_mini_program` |
| `dev.log` | 补充调试信息 | `general_web` |
| `/tmp/coze-logs/dev.log` | 热更新编译日志 | `wechat_mini_program` |

**按报错场景选择日志（优先级从左到右）：**

| 报错场景 | 关键词特征 | 优先读取 |
|---------|-----------|---------|
| 页面白屏 / 渲染异常 / 资源加载失败 | `fetch`、`DOM`、`render`、`WebSocket` | `console.log` → `app.log` |
| 服务启动失败 / 接口 500 / 超时 / 构建失败 | `500`、`timeout`、`connection refused`、`build` | `app.log` → `dev.log` → `console.log` |
| 热更新失效 / 编译报错（vibeMiniApp） | 代码改动后页面不更新 | `/tmp/coze-logs/dev.log` → `app.log` |
| 无法判断 | — | 默认 `app.log`（后端优先） |

**常用命令（单次 ≤ 50 行）：**

```bash
# 最新日志
tail -n 50 /app/work/logs/bypass/app.log

# 搜索错误行
grep -nE "Error|Exception|WARN|ERROR" /app/work/logs/bypass/app.log | tail -n 50

# 定点读取上下文（先 grep 拿行号，再取范围）
sed -n "<start>,<end>p" /app/work/logs/bypass/app.log
```

**新增日志规范：**
- 使用标准 logging 工具，禁止 print/println
- 包含稳定关键字（模块名 / 请求 ID / 错误码），便于 grep 定位
- 禁止输出密钥、token、密码等敏感信息
- 后台进程重定向须写入 `/app/work/logs/bypass/`，禁止写入 `/tmp` 等目录

### 生产环境日志（product 环境）

使用 `search_runtime_log` 工具查询。

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `query` | 否 | 关键词搜索 |
| `start_time` / `end_time` | 否 | 毫秒时间戳，需同时传；不传默认最近 30 分钟 |
| `limit` | 否 | 每页条数，默认 20，最大 100 |
| `cursor` | 否 | 分页游标，第一页传空，后续传上次返回的 `next_cursor` |
| `deploy_history_id` | 否 | 指定部署版本 |

**返回结构：**

```json
{
  "logs": [
    { "time": "1774332844000", "content": "...", "commit_hash_short": "abc1234" }
  ],
  "next_cursor": "<cursor_for_next_page>"
}
```

**使用要点：**
- 优先用 `query` 过滤关键词（如 `Error`、`Exception`），避免拉取全量日志
- `next_cursor` 非空时表示还有下一页，传入 `cursor` 参数继续翻页
- 单次 `limit` 不超过 **50**，分批分析

---

## 诊断流程

### 1. 收集关键信息

确认以下信息（用户已提供则跳过）：
- **问题描述**：报错信息、异常行为、预期结果
- **发生环境**：develop / product / 两者均有
- **触发条件**：哪个功能、哪类请求、是否可复现、什么时候开始的
- **最近有无变更**：代码上线、配置修改、数据迁移、权限变更 ← 优先问，能过滤大多数问题
- **影响范围**：全量用户 / 特定用户，全部请求 / 特定接口

### 2. 形成假设

**在调用任何工具之前，先根据症状说出怀疑方向**，再有针对性地验证：

| 现象 | 优先怀疑 | 验证方向 |
|------|---------|---------|
| 服务启动失败 / 接口 500 / 超时 | 代码错误、依赖缺失、配置错误 | 读日志找 traceback |
| 数据不展示 / 数据异常 | DB 数据问题、查询逻辑错误 | `exec_sql` 查数据状态 |
| DB 性能慢 / 连接数告警 / 限流 | 慢查询、连接池泄漏、请求频率过高 | `db diagnose` |
| develop 正常 product 异常 | 数据量差异、配置差异、最近上线变更 | 对比两环境数据 + 变更记录 |
| 操作后数据未更新 | 事务未提交、写入逻辑未触发 | 查 `updated_at`、事务状态 |

> 如果有最近变更，优先从变更内容推断根因，再用工具验证，而不是从头扫描日志。

### 3. 有针对性地调查

**先判断是否需要读日志**：若测试输出、编译报错、用户描述已足够定位根因（如 `TypeError at line 42`、`Module not found`），直接进入第 4 步修复，无需读日志。

信息不足时，每次调用工具前先说明目的和预期：

- 怀疑代码错误 → 读日志，找 traceback 定位到具体代码行
- 怀疑数据问题 → `exec_sql` 查数据状态，详细模板见 [sql-patterns.md](sql-patterns.md)
- 怀疑 DB 健康 → `db diagnose` 一次性获取全貌，再聚焦异常字段

**develop 环境读日志：**
1. 执行 `echo $COZE_PROJECT_TYPE` 确认项目类型
2. 按「本地日志」章节的场景优先级选择日志文件
3. 提取完整 traceback 和关键 ERROR/WARN 行，基于堆栈定位代码位置

**product 环境读日志：**
1. 调用 `search_runtime_log`，用 `query` 过滤关键词（如 `Error`、`Exception`）
2. 提取关键日志行，定位根因；如需翻页，传入 `next_cursor`

**如果第一个假设被证伪，明确说出结论并调整方向：**
> "connection_usage_pct 只有 40%，不是连接池问题。慢查询列表有 3 条 avg_ms > 2000ms，根因在这里。"

### 4. 输出诊断报告

```
## 诊断结论
**根因**：<一句话>
**证据**：
- <日志行 / 查询结果>
**影响范围**：<记录数 / 用户数 / 功能>

## 修复建议
1. **<步骤>**：<操作>

## 预防措施（可选）
- <如何避免再次发生>
```

### 5. 给出验证方法

修复建议之后，说明如何确认问题已解决：

| 问题类型 | 验证方式 |
|---------|---------|
| 接口报错 / 500 | 重新触发该请求，确认返回正常 |
| 数据异常 | 执行同一查询，确认数据已修复 |
| DB 性能 | 重新运行 `db diagnose`，确认慢查询消失 / 连接数下降 |
| 服务启动失败 | 重新读取日志，确认无新的 ERROR |

### 6. 无法定位时的升级路径

如果所有可用工具都查完仍无法定位根因，明确告知用户下一步：

- 开启更详细的日志级别（DEBUG），复现后重新排查
- 提供具体的请求参数 / 用户 ID，进行定向查询
- 检查网络层或第三方依赖（外部 API、消息队列等）的状态
- 若问题仅在 product 出现且无法复现，考虑回滚最近一次变更观察是否恢复
