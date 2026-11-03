# 合约查询子 Skill

> 查询签约合约的结果数据：是否开通、开通内容（协议、价格）。完全独立，不依赖 previewFormView 阶段的本地数据。

## 1. 子 Skill 元信息

- **name**: query-ar
- **description**: 查询签约合约结果数据，支持按前台产品码或后台产品码查询
- **触发条件**: 用户询问"签约了吗"、"开通了吗"、"开通记录"、"合约状态"等

## 2. 两种查询方式

### 2.1 按前台产品码查询

面向用户和上层 Skill 的常用查询方式。

**Skill 侧参数**：

| 参数 | 必填 | 说明 |
|---|---|---|
| salesProductCodes | 是 | 前台产品码列表（最多5个） |

**MCP 映射**：`McpArQueryFacade.queryArInfosBySalesProd`

**MCP 请求参数**：`McpQueryArBySalesProdRequest { tntInstId, salesProductCodes }`

**入参填充方式**：

| 参数 | 填充来源 | 说明 |
|---|---|---|
| tntInstId | 网关自动注入 | Skill 不感知 |
| salesProductCodes | Skill 侧传入 | 从用户对话中提取或会话上下文获取 |
| 操作者信息 | 上下文自动注入 | Skill 不感知 |

### 2.2 按后台产品码查询

面向其他业务 Skill/Agent 的查询方式，用户一般不直接使用。

**Skill 侧参数**：

| 参数 | 必填 | 说明 |
|---|---|---|
| backProdCodes | 是 | 后台产品码列表（最多5个） |

**MCP 映射**：`McpArQueryFacade.queryArInfosByBackProd`

**MCP 请求参数**：`McpQueryArByBackProdRequest { tntInstId, merchantPid, backProdCodes }`

**入参填充方式**：

| 参数 | 填充来源 | 说明 |
|---|---|---|
| tntInstId | 网关自动注入 | Skill 不感知 |
| merchantPid | 上下文自动填充 | 根据当前操作者身份自动获取，Skill 不感知 |
| backProdCodes | Skill 侧传入 | 由调用方 Skill/Agent 提供 |
| 操作者信息 | 上下文自动注入 | Skill 不感知 |

## 3. 路由规则

Skill 根据已有参数自动路由：

| 已有参数 | 路由到 | 说明 |
|---|---|---|
| 有 salesProductCode | → `queryArInfosBySalesProd` | 按前台产品码查，单个产品码包装为 `salesProductCodes: ["xxx"]` 传入 |
| 有 backProdCode | → `queryArInfosByBackProd` | 按后台产品码查，单个产品码包装为 `backProdCodes: ["xxx"]` 传入 |
| 都没有 | 不调接口，引导用户提供 | 见下方 §5 |

## 4. 返回结构

后端返回 `ResultDTO<McpQueryArBySalesProdResponse>` 或 `ResultDTO<McpQueryArByBackProdResponse>`，内含 `arInfoList`。

每条 `ArInfo`：

| 字段 | 说明 |
|---|---|
| `arNo` | 合约号 |
| `arStatus` | 合约状态 |
| `arStatusDesc` | 合约状态描述 |
| `gmtValid` | 生效时间 |
| `gmtInvalid` | 失效时间 |
| `salesProductCode` | 前台产品码 |
| `salesProductName` | 前台产品名称 |
| `backProdCode` | 后台产品码 |
| `backProdName` | 后台产品名称 |
| `protocolInfo` | 协议信息（见下方 ArProtocolInfo） |
| `priceDesc` | 价格描述 |

### ArProtocolInfo（协议信息）

| 字段 | 说明 |
|---|---|
| `name` | 协议名称 |
| `protocolUrl` | 协议链接 |

## 5. 结果展示指导

向用户展示查询结果时：

1. **有合约**：必须展示以下全部信息
   - 产品名称、合约状态描述（优先展示 `arStatusDesc`）、生效/失效时间
   - **价格描述（`priceDesc`）**：⚠️ **必须原文完整展示**，这是用户最关心的核心信息，不可省略
   - 如有 `protocolInfo`，展示协议名称（`name`），用户需要时可提供协议链接（`protocolUrl`）

2. **价格描述展示规则**：`priceDesc` 必须原文完整展示
   - ✅ 正确：完整展示 priceDesc 全文，包含费率值、有效期、到期后政策、参考链接等所有内容
   - ❌ 禁止截断 — 不可只取首行、只取前几句、取摘要
   - ❌ 禁止只提取费率数字 — 如不可只展示 "0.6%"，必须展示完整 priceDesc
   - ❌ 禁止重新组织或改写 — 原文展示，保留换行、保留链接、保留所有条款

3. **无合约**（arInfoList 为空）：告知用户未找到开通记录，引导发起签约

4. **多条合约**：按产品分组展示，每条合约都必须完整展示价格描述

### 信息不完整时的处理

当价格描述或协议信息为空、不完整时，在展示结果后追加提示：

> 完整详情请前往 [商家中心](b.alipay.com) 查看。

触发条件（满足任一即追加）：
- `priceDesc` 为空或不完整（缺少费率、有效期等关键信息）
- `protocolInfo` 为空
- `protocolInfo.name` 或 `protocolInfo.protocolUrl` 为空

### 参数不足时

引导用户提供：
> "请提供要查询的产品名称或产品码，以便查询合约状态。"

### 超出数量限制时

单次查询最多支持5个产品码，超出时自动取前5个查询，并告知用户：
> "单次最多查询5条记录，已查询前5条，如需查询其余记录请再次提供。"

## 6. 错误处理

后端返回 errorCode 时，展示 errorMessage 给用户。如有 bizTips 一并展示。
