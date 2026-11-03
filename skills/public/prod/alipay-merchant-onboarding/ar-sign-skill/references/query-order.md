# 订单查询子 Skill

> 查询签约订单的过程数据：开通中的状态、驳回原因。完全独立，不依赖 previewFormView 阶段的本地数据。

## 1. 子 Skill 元信息

- **name**: query-order
- **description**: 查询签约订单过程数据，支持按订单号或按账号+产品查询
- **触发条件**: 用户询问"订单进度"、"订单号xxx状态"、"开通进度"等

## 2. 两种查询方式

### 2.1 按订单号查询

**Skill 侧参数**：

| 参数 | 必填 | 说明 |
|---|---|---|
| orderNos | 是 | 签约订单号列表（最多5个） |

**MCP 映射**：`McpBizOrderQueryFacade.queryBizOrder`

**MCP 请求参数**：`McpQueryBizOrderRequest { tntInstId, orderNos }`

**入参填充方式**：

| 参数 | 填充来源 | 说明 |
|---|---|---|
| tntInstId | 网关自动注入 | Skill 不感知 |
| orderNos | Skill 侧传入 | 从用户对话中提取或会话上下文获取 |
| 操作者信息 | 上下文自动注入 | Skill 不感知 |

### 2.2 按账号+产品查询

用户没有订单号时，通过账号和产品码查询订单列表。

**Skill 侧参数**：

| 参数 | 必填 | 说明 |
|---|---|---|
| salesCodes | 是 | 前台产品码列表（最多5个） |

**MCP 映射**：`McpBizOrderQueryFacade.queryBizOrdersByAccount`

**MCP 请求参数**：`McpQueryBizOrderByAccountRequest { tntInstId, channelCode=B_SK_SH_RPC, salesCodes }`

**入参填充方式**：

| 参数 | 填充来源 | 说明 |
|---|---|---|
| tntInstId | 网关自动注入 | Skill 不感知 |
| channelCode | 固定填入 `B_SK_SH_RPC` | Skill 不感知 |
| salesCodes | Skill 侧传入 | 从用户对话中提取或会话上下文获取 |
| 购买者账号 | 上下文自动填充 | 根据当前操作者身份自动获取，Skill 不感知 |
| 操作者信息 | 上下文自动注入 | Skill 不感知 |

## 3. 路由规则

Skill 根据已有参数自动路由：

| 已有参数 | 路由到 | 说明 |
|---|---|---|
| 有 orderNo | → `queryBizOrder` | 按订单号查，单个订单号包装为 `orderNos: ["xxx"]` 传入 |
| 有 salesCode，无 orderNo | → `queryBizOrdersByAccount` | 按产品码查，单个产品码包装为 `salesCodes: ["xxx"]` 传入 |
| 都没有 | 不调接口，引导用户提供 | 见下方 §5 |

## 4. 返回结构

两个接口统一返回 `ResultDTO<McpBizOrderBasicInfoListResponse>`，内含 `bizOrderList`（列表）。

### 4.1 McpBizOrderBasicInfoResponse（订单基础信息）

| 字段 | 说明 |
|---|---|
| `orderNo` | 订单号 |
| `orderState` | 订单主状态 |
| `orderStateDesc` | 订单主状态描述 |
| `orderSubState` | 订单子状态 |
| `orderSubStateDesc` | 订单子状态描述 |
| `orderLineInfoList` | 订单行列表（见下方 OrderLineBasicInfo） |
| `gmtCreate` | 创建时间 |
| `gmtModified` | 最后修改时间 |
| `gmtSubmitted` | 提交时间 |
| `gmtFinished` | 完成时间 |
| `rejectReasons` | 驳回原因列表（订单被驳回时，汇总订单行的审核备注） |

### 4.2 OrderLineBasicInfo（订单行基础信息）

| 字段 | 说明 |
|---|---|
| `orderLineNo` | 订单明细行号 |
| `salesCode` | 前台产品码 |
| `salesProductName` | 前台产品名称 |
| `fulfilCode` | 后台产品码 |
| `fulfilProductName` | 后台产品名称 |

## 5. 结果展示指导

向用户展示查询结果时：

1. **有订单**：展示订单号、状态描述（优先展示 `orderStateDesc`/`orderSubStateDesc`）、产品名称、关键时间节点
2. **多条订单**（列表查询）：按时间倒序展示，突出最新一条
3. **订单被驳回**：额外展示 `rejectReasons` 中的驳回原因，引导用户根据原因修正后重新提交
4. **无订单**：告知用户未找到进行中的订单

### 参数不足时

引导用户提供：
> "请提供订单号，或者提供产品码来查询。"

### 超出数量限制时

单次查询最多支持5个订单号或产品码，超出时自动取前5个查询，并告知用户：
> "单次最多查询5条记录，已查询前5条，如需查询其余记录请再次提供。"

后端返回 errorCode 时，展示 errorMessage 给用户。如有 bizTips 一并展示。