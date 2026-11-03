---
name: doctor
description: 诊断并修复 develop/product 环境中的运行时问题与开发环境问题。当应用报错、接口 500 或超时、服务启动失败、数据异常或不展示、功能不符合预期、需要查看日志、DB 慢查询/连接数告警/Supabase限流时使用；也处理磁盘空间不足、.gitignore 缺失或不完整、git 历史大文件、.git 损坏或丢失、恢复历史版本等开发环境问题。
---

# Doctor — 问题诊断

## 全局安全规则（必须遵守）

| 约束 | 规则 |
|------|------|
| `product` 数据库 | SELECT 可直接执行；INSERT / UPDATE / DELETE **必须获得用户明确确认后**才能执行；**禁止** DDL |
| 本地日志读取 | 单次输出最多 **50 行**；**禁止** `mkdir -p /app/work/logs/bypass/`；**禁止**通配符读取（如 `*.log`） |
| 本地日志白名单 | 只可读取：`/app/work/logs/bypass/app.log`、`/app/work/logs/bypass/console.log`、`/app/work/logs/bypass/dev.log`、`/tmp/coze-logs/dev.log` |
| 敏感数据（PII） | 只返回统计值，不展示原始内容 |
| 高风险操作 | 删除/移动文件、改写 git 历史、恢复备份、清空目录等操作**必须获得用户明确确认**后才能执行 |

## 可用工具总览

| 工具 | 适用环境 | 用途 |
|------|---------|------|
| `exec_sql(sql, env)` | develop（读写）/ product（只读 SELECT） | 查询数据库 |
| `coze-coding-ai db diagnose --env <env>` | develop / product | DB 整体健康诊断（连接数、慢查询、限流） |
| 本地日志文件 | develop | 读取 app/console/dev 日志 |
| `search_runtime_log` | product | 查询生产环境日志 |
| shell 命令（du/find/git） | develop（沙箱环境） | 磁盘检查、git 状态与修复 |

详细参数和用法见各 references 子文件。

## 智能路由：问题分类

**第一步**：了解用户描述的现象（尚未收集时简要询问）。

**第二步**：执行 `echo $COZE_PROJECT_TYPE` 确认项目类型。

**第三步**：根据项目类型和现象，选择对应的诊断流程：

| 项目类型 | 问题类别 | 读取并执行 |
|---------|---------|-----------|
| 任意类型 | 磁盘空间不足 / git 问题 / .gitignore / 大文件 / 备份恢复 | [references/env-repair.md](references/env-repair.md) |
| `skill` / `assistant_agent` | 任何问题（无 DB 和日志工具） | 仅 [references/env-repair.md](references/env-repair.md) |
| `agent` / `workflow` / `app` / `general_web` / `wechat_mini_program` | 报错 / 接口500 / 超时 / 日志 / 数据异常 / DB性能 / 限流 | [references/runtime-diagnosis.md](references/runtime-diagnosis.md) |

> 若无法判断问题类别，先向用户询问具体现象，再按上表路由。若同时涉及运行时问题和环境问题，先处理运行时（定位根因），再处理环境（清理修复）。
