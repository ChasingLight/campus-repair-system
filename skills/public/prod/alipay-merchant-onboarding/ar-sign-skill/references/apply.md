# 申请提交子 Skill

> 提交签约申请。支持两种调用场景：内部流转（previewFormView 确认后）和外部直调（调用方自行准备数据）。
>
> ⛔ **数据源约束：apply 的所有数据必须来自 ar-sign-data.json（由脚本读取转换），结果展示必须基于 MCP 返回。** 禁止从对话记忆或 LLM 知识补充任何数据。

## 1. 子 Skill 元信息

- **name**: apply
- **description**: 提交签约申请，处理申请结果
- **触发条件**:
  - 场景 1（内部流转）：previewFormView 确认后，签约 Skill 收到确认信号，主动调用 apply
  - 场景 2（外部直调）：调用方自行准备好完整数据，跳过 previewFormView 直接提交

## 2. 输入参数

### 场景 1：内部流转

| 参数 | 来源 | 说明 |
|---|---|---|
| artisanPageData | previewFormView 确认汇总中的 `artisanPageData` | 完整 artisanPage 数据（含填写后的 values） |

### 场景 2：外部直调

| 参数 | 来源 | 说明 |
|---|---|---|
| businessProperty | 调用方自行组装 | 签约业务属性数据（ApplyBusinessPropertyMcpDTO） |
| salesCodes | 调用方提供 | 产品 salesCode 列表 |

> `pid` 由 CLI 网关自动注入，调用方无需提供。

### MCP 参数映射

Skill 组装 MCP 调用时：

| Skill 参数 | MCP 参数 |
|---|---|
| artisanPageData（经脚本转换为 businessProperty） | `McpApplyRequest.businessProperty` |
| salesCodes | `McpApplyRequest.salesProductCodes`（映射） |

> `McpOperateContext` 由网关注入，Skill 不感知。
> **注意**：apply 后端使用的是 `businessProperty`（非 pageData）。脚本负责从 artisanPage 的 pageData 转换为 businessProperty 格式，包含 MCC 提取、网站信息映射、截图 URL 扁平化等逻辑。

### request 构造（场景 1：内部流转）

**必须通过脚本组装，禁止 LLM 手动拼接 JSON**。

使用 `scripts/build_apply_request.py` 从 ~/.alipay/ar/ar-sign-data.json 组装完整的 apply request：

```bash
# 输出到文件
python3 scripts/build_apply_request.py -o ~/.alipay/ar/tmp/apply_request.json

# 调用 apply MCP（必须 2>/dev/null）
alipay-cli mcp call ar-sign.apply -d "$(cat ~/.alipay/ar/tmp/apply_request.json)" 2>/dev/null
```

脚本内部逻辑（禁止 LLM 自行实现，直接调脚本）：
1. 读取 ~/.alipay/ar/ar-sign-data.json，遍历所有区块提取 values（跳过 basicArInfo、editPriceInfo）
2. 将 pageData 转换为 businessProperty 格式（MCC 提取、网站信息映射、截图 URL 扁平化）
3. 包装为 `{"request": {"businessProperty": {...}, "channelCode": "B_SK_SH_RPC", "orderType": "NEW_SIGN", "salesProductCodes": [...]}, "ctx": {}}`

**绝对禁止**：
- ❌ 禁止 LLM 手动拼接 apply request JSON — 必须通过脚本组装
- ❌ 禁止 LLM 自行实现 pageData → businessProperty 转换 — 转换逻辑内含字段映射和扁平化规则
- ❌ 禁止从对话记忆拼凑 — 脚本从文件读取
- ❌ 禁止省略 null 值字段 — 后端依赖字段存在性

## 3. 流程

> ⛔ **apply 请求 JSON 必须由 `build_apply_request.py` 生成，禁止自行组装。** 脚本内含区块过滤（跳过 basicArInfo/editPriceInfo）和固定参数注入逻辑。

1. **参数检查**：确认 ~/.alipay/ar/ar-sign-data.json 存在
2. **组装 request**：`python3 scripts/build_apply_request.py -o ~/.alipay/ar/tmp/apply_request.json`
3. **调用 apply MCP**：`alipay-cli mcp call ar-sign.apply -d "$(cat ~/.alipay/ar/tmp/apply_request.json)" 2>/dev/null`
4. **处理返回结果**

> **⚠️ apply 请求必须通过脚本从 ~/.alipay/ar/ar-sign-data.json 读取并转换为 businessProperty 格式，禁止 LLM 手动处理。**

## 4. 返回结构

后端返回 `ResultDTO<McpApplyResponse>`：

| 字段 | 说明 |
|---|---|
| `errorCode` | 错误码（成功时为 null） |
| `errorMessage` | 错误描述 |
| `bizTips` | 业务提示信息 |
| `needRetry` | 是否建议重试 |
| `data.orderNo` | 签约订单号 |
| `data.checkedError` | 字段校验错误（如有） |

## 5. 结果展示指导

### 成功时

向用户展示：
1. **订单号**：`data.orderNo`
2. **状态**：告知申请已提交
3. **后续引导**：可通过订单号查询进度

### 失败时

| 后端返回 | 展示方式 |
|---|---|
| `errorCode` + `errorMessage` | 展示错误描述 |
| `bizTips` | 额外展示业务提示 |
| `needRetry=true` | 告知用户可以重试 |
| `checkedError` | 提取校验错误，引导用户修正字段后重新提交 |

### 重要提示

apply 成功后，告知用户：
> "签约申请已提交。本次收集的信息已完成使用，如需修改请重新发起签约流程。"

apply 成功后，清理整个 `~/.alipay/ar/` 目录（包括持久数据和临时文件）。
