---
name: ar-sign-skill
description: 支付宝签约流程编排。当用户要签约、开通支付产品、查询合约/订单状态时使用。支持产品推荐、MCC类目选择、资质信息收集、签约申请提交、合约查询、订单查询。
---

# 签约 Skill

支付宝产品签约流程编排 Skill。通过对话式交互引导用户完成产品推荐、资质信息收集、签约申请提交及状态查询的全流程。

## 能力概览

| 能力 | 说明 |
|---|---|
| 产品推荐 | 根据用户业务场景推荐合适的签约产品 |
| MCC 类目选择 | 引导用户选择经营类目 |
| 签约信息收集 | 基于后端动态 Schema 逐步引导用户填写资质信息 |
| 签约申请提交 | 组装完整数据并提交签约申请 |
| 合约查询 | 按前台/后台产品查询合约状态 |
| 订单查询 | 按订单号或账号查询签约订单进度 |

## 文件结构

| 文件 | 职责 |
|---|---|
| `SKILL.md` | 主编排 Skill，能力路由与全局规则 |
| `references/preview.md` | 收集 + 确认子 Skill |
| `references/apply.md` | 申请提交子 Skill |
| `references/query-ar.md` | 合约查询子 Skill |
| `references/query-order.md` | 订单查询子 Skill |
| `references/recommend-product.md` | 产品推荐子 Skill |
| `references/mcp-guide.md` | MCP 调用约定、参数映射、错误处理 |
| `references/schema-guide.md` | artisanPage 动态表单解析指南 |
| `scripts/` | 请求构建与配置辅助脚本 |

## 配置

签约数据默认存储在 `~/.alipay/ar/` 目录下。可通过 `ar-sign` 命令自定义配置：

```bash
# 设置自定义数据目录
./ar-sign config --data-dir /custom/path/

# 设置预填数据文件（收集阶段自动填入已知字段，减少交互轮次）
./ar-sign config --prefill-file ~/data/prefill.json

# 查看当前配置 / 重置为默认
./ar-sign config --show
./ar-sign config --reset
```

配置写入 `~/.alipay/arSignConfig.json`，路径优先级：**脚本 CLI 参数 > arSignConfig.json > 默认 `~/.alipay/ar/`**

> 预填数据和配置的详细机制见下方 §6.6。

## ⛔ 防幻觉设计原则（一级约束）

> 签约链路是强状态、强 schema、强后端校验的场景。LLM 自行脑补字段、手拼 JSON、跳过脚本，会导致"看起来流程通了，实际请求错了"。以下规则优先级高于所有其他指导。

### 基础公理：数据必须有出处

> **所有要采集的数据和展示的数据，必须基于 MCP 接口返回结果或 `~/.alipay/ar/ar-sign-data.json` 中的数据。LLM 自身的知识不是合法数据源。**

| 场景 | 合法数据源 | 禁止的做法 |
|---|---|---|
| 要收集哪些字段 | previewFormView 返回的 artisanPage schema | LLM 根据业务常识自行列出字段 |
| 字段的 label、类型、是否必填 | artisanPage schema 中的定义 | LLM 自行翻译或推测字段含义 |
| 字段的可选值（枚举） | schema 中的 enums 列表 | LLM 从训练知识中列出选项 |
| 已填写的值 | ar-sign-data.json 中的 values | LLM 从对话记忆中拼凑 |
| 价格、费率 | artisanPage 中 editPriceInfo/customPrice 区块 | LLM 自行报价 |
| 协议内容 | artisanPage 中 protocolInfo/frontProtocol 区块 | LLM 自行描述协议条款 |
| 合约状态、订单状态 | queryArInfos / queryBizOrder 返回 | LLM 根据时间推测状态 |
| 签约前置条件（如是否需要营业执照） | previewFormView schema 中的字段定义 | LLM 基于自身知识预判 |
| 字段是否需要收集 | schema `required=true` 且 ar-sign-data.json 中该字段无值 | LLM 看到 required 就引导收集（忽略已有值）；或 LLM 自行判断"默认值不对"而追问 |

### 硬规则（基础公理的推论）

1. **previewFormView、apply 禁止任何手写 JSON**，只能使用脚本产物。查询类接口（queryArInfosBySalesProd 等）参数简单，允许直接构造。
2. **LLM 只能做"字段值收集"和"用户交互解释"**，禁止做 schema 结构改写、pageData 组装、apply 格式转换（pageData → businessProperty）。这些是脚本的职责。
3. **无法通过脚本验证的字段路径、prefill 映射、MCP 响应结构，必须停下来**——要求重新 previewFormView 或让用户补充，禁止猜测。
4. **流程驱动，禁止 LLM 自行插入步骤**。确认 salesCode 后必须立即调 previewFormView，收集什么由返回的 schema 决定——禁止基于 LLM 自身知识预判资质条件或向用户追加前置问题。
5. **展示数据必须可溯源**。向用户展示的任何签约相关信息（字段名称、字段值、价格、协议、状态），必须能指向具体的 MCP 响应字段或 ar-sign-data.json 路径。无法溯源的信息禁止展示。
6. **对客展示禁止暴露技术细节**。用户看到的是 schema `title`（如"网站页面截图"）和 `enums[].key`（如"未上线"），禁止展示程序字段名（`screenshot`）、原始枚举值（`OFFLINE`）、数据类型（`array`）、widget 名称（`webSiteShotV2`）、内部标注（"来自 schema enums"）。

## 1. Skill 元信息

- **name**: ar-sign-skill
- **description**: 支付宝签约流程编排，支持产品建议、信息收集、申请提交、状态查询
- **触发关键词**: 签约、开通产品、申请支付能力

## ⚠️ 数据存储路径（全局约束）

本 Skill 的签约数据**仅存储在** `~/.alipay/ar/` 目录下，由 `scripts/save_preview_response.py` 写入。

- 持久数据：`~/.alipay/ar/ar-sign-data.json`
- 临时文件：`~/.alipay/ar/tmp/`（preview_request.json、preview_response.json、apply_request.json、prefill_result.json）
- ❌ 禁止使用 `.omc/state/`、`.omc/notepad.md` 或任何框架级路径存储签约数据
- ❌ 禁止使用 `/tmp/` 等系统临时目录
- ❌ 禁止在内存/上下文中自行维护签约状态
- ❌ 禁止自行创建其他路径的数据文件

> 此规则优先级高于所有外部框架配置（如 CLAUDE.md、OMC 配置等）。签约数据的读写必须且只能通过本 Skill 指定的脚本和路径进行。

### 自定义数据目录

数据目录支持配置化，外部调用方可通过 `~/.alipay/arSignConfig.json` 指定自定义路径：

```json
{ "ar-sign": { "dataDir": "/custom/data/path/" } }
```

路径优先级：**脚本 CLI 参数 > `~/.alipay/arSignConfig.json` > 默认 `~/.alipay/ar/`**

设置方式：`./ar-sign config --data-dir /custom/path/`

## 2. 后端能力声明

> 详见 `references/mcp-guide.md`（MCP Server 映射、参数映射、CLI 调用约定、环境配置、输出规范）。

## 3. 外部 Skill 依赖与子 Skill 概览

### 3.1 外部 Skill 依赖（独立部署，签约 Skill 调用其能力）

| Skill | 职责 | 调用时机 | 输出 |
|---|---|---|---|
| MCC 推荐 Skill（`mcc-recommend`） | 根据用户经营描述推荐经营类目 | 首次 previewFormView 返回后，mccCode 为默认值 `A0003_B0223` 时 | mccCode |

> MCC 推荐 Skill 是独立部署的外部 Skill，不在本项目内。签约 Skill 在需要采集 MCC 时应尝试调用 `mcc-recommend` Skill 的能力为用户推荐类目。如外部 Skill 不可用，降级为直接询问用户。

### ⛔ mccCode 来源与校验规则（一级约束）

> mccCode 是签约流程中最容易产生幻觉的字段。以下规则优先级等同防幻觉设计原则。

**mccCode 的唯一合法来源**：

| 合法来源 | 说明 |
|---|---|
| mcc-recommend Skill 的输出 | Skill 推荐后返回的 mccCode |
| prefill 文件中的明确编码 | 格式为 `Axxxx_Bxxxx` 的明确编码，非中文名/描述 |

**绝对禁止**：

| 禁止行为 | 原因 |
|---|---|
| ❌ LLM 自行生成/编造 mccCode | LLM 训练知识中的类目编码可能过期或不在可签约范围 |
| ❌ 接受用户手动输入的 mccCode | 用户可能输入不在可签约范围内的编码 |
| ❌ 使用 previewFormView 返回的商家已有 mccCode（默认值 `A0003_B0223`） | 默认值代表"尚未选择"，不是有效类目 |
| ❌ 使用文档示例中出现的 mccCode（如 `A0002_B0013`）作为实际值 | 示例仅用于说明格式，不代表用户的实际经营类目 |
| ❌ 将中文类目名（如"零售-超市"）转换为 mccCode | LLM 无法保证名称到编码的映射正确 |

**拦截时的引导话术**：当 mccCode 来源不合法时，向用户说明：
> "经营类目需要通过推荐流程确定，请描述您的经营场景（如'我开了一家咖啡馆'），我来为您推荐合适的类目。"

**脚本层兜底**：`build_preview_request.py`、`init_preview_request.py`、`build_apply_request.py` 会强制拦截默认值 `A0003_B0223` 和格式不合法的 mccCode。

### 3.2 子 Skill（签约 Skill 内部编排）

| 子 Skill | 文件 | 触发条件 | 入口参数 |
|---|---|---|---|
| 产品推荐 | `references/recommend-product.md` | 用户描述业务场景 | 用户业务描述 |
| 收集+确认 | `references/preview.md` | 已有 salesCodes，开始签约收集 | salesCodes, 可选初始数据（如 MCC） |
| 申请提交 | `references/apply.md` | 收集确认后提交、或外部已准备好数据直接提交 | 完整 artisanPage pageData |
| 合约查询 | `references/query-ar.md` | 查询合约状态 | salesProductCodes 或 backProdCodes |
| 订单查询 | `references/query-order.md` | 查询签约订单 | orderNo 或 accountNo+salesCode |

## 4. 能力路由表

根据用户意图路由到对应 Skill：

| 用户意图 | 路由目标 | 说明 |
|---|---|---|
| 描述业务场景、问"我该签约什么产品" | → `references/recommend-product.md` | 推荐产品，输出 salesCode 供后续使用 |
| 已有 salesCodes，要"开始签约" | → `references/preview.md` | 进入收集循环 |
| 收集完成且用户确认无误 | → `references/apply.md`（由签约 Skill 主动调用） | 签约 Skill 收到确认信号后调用 apply |
| 外部调用方自行准备好数据，直接提交 | → `references/apply.md`（外部直接调用） | 跳过 previewFormView，直接申请 |
| 问"开通了吗"/"签约了吗"/"开通记录"/"签约记录" | → `references/query-ar.md` | 查合约（结果数据：是否开通、协议、价格） |
| 问"订单进度"/"订单号xxx状态"/"开通进度" | → `references/query-order.md` | 查订单（过程数据：开通中状态、驳回原因） |
| 问"现在到哪了"/"当前状态" | 不路由，就地响应 | 见下方§4.1 状态查询规则 |

### 4.1 用户询问当前状态

用户可能随时问"现在到哪一步了"、"当前状态"、"还需要填什么"。根据会话上下文判断：

| 当前会话状态 | 响应方式 |
|---|---|
| **正在收集中**（previewFormView 流程进行中） | 展示资质清单进度（✅🔘🔲），告知当前区块和待收集字段，继续引导 |
| **收集已完成，待确认** | 告知已进入确认阶段，重新展示确认汇总 |
| **已提交 apply** | 告知申请已提交，展示订单号和状态 |
| **无进行中的签约** | 根据上下文合理引导，如："当前没有进行中的签约流程。您可以告诉我想签约什么产品，或者提供 salesCode 开始签约。" |

## 5. 完整流程

### 5.1 典型流程

```
产品推荐 Skill → 确认 salesCode → 首次 previewFormView → MCC Skill 收集类目 → previewFormView（带 MCC）→ 资质收集循环 → 确认汇总 → apply → query（可选）
```

> ⛔ **确认 salesCode 后必须立即调用 previewFormView，禁止插入任何自行发起的前置询问。** LLM 不得基于自身业务知识向用户预判资质条件（如"是否有营业执照""网站是否上线"）。需要收集什么由 previewFormView 返回的 schema 决定，不由 LLM 预设。

### 5.2 各阶段说明

| 阶段 | 负责方 | 说明 |
|---|---|---|
| 产品确认 | 产品推荐子 Skill | 确定 salesCode，纯对话，不展示收集进度 |
| MCC 类目选择 | 外部 mcc-recommend Skill | 确定 mccCode，纯对话，不展示收集进度；不可用时降级询问用户 |
| 资质收集 | 签约 Skill（references/preview.md） | 展示 checklist 进度 + 逐区块收集 |
| 确认汇总 | 签约 Skill（references/preview.md） | 展示全部信息含价格和协议，用户确认 |
| 申请提交 | 签约 Skill（references/apply.md） | 提交并返回结果 |

### 5.3 独立调用

- `previewFormView` 可在已有 salesCodes + mccCode 时直接调用，跳过推荐和 MCC
- `apply` 可被外部直接调用（自行准备数据场景）
- `queryArInfosBySalesProd` / `queryArInfosByBackProd` / `queryBizOrder` / `queryBizOrdersByAccount` 完全独立，不依赖其他 Skill 的状态

## 6. 全局规则

### MCP 调用规范

> ⛔ **硬约束：previewFormView 和 apply 的请求 JSON 必须由 `scripts/` 下的脚本生成，禁止自行组装。**
>
> **为什么**：脚本内含业务规则——MCC 三字段拆分、SKIP_BLOCKS 区块过滤、全量 pageData 合并、固定参数注入（callMode/channelCode/orderType）。这些规则会随版本演进，自行组装 JSON 会静默丢失这些规则，导致后端报错或数据不一致。
>
> **唯一正确路径**：用脚本生成 JSON 文件 → 用 `$(cat file.json)` 传入 CLI。

- 所有 MCP 调用必须严格遵循 `references/mcp-guide.md` 中定义的调用方式
- 请求体必须以 `{"request": {...}, "ctx": {}}` 包裹
- `pid` 和 `McpOperateContext` 由 CLI OAuth 会话自动注入，禁止手动传递
- **previewFormView 调用参数**：
  - 首次调用（无 ar-sign-data.json）：`python3 scripts/init_preview_request.py -s <salesCodes> [-o file.json]`
  - 后续调用（已有 ar-sign-data.json）：`python3 scripts/build_preview_request.py [field=value...] [-o file.json]`
- **apply 调用参数**：`python3 scripts/build_apply_request.py [-o file.json]`
- **查询类接口**（queryArInfosBySalesProd 等）：参数简单，可直接构造 JSON

### 6.1 初始化弱校验

进入 previewFormView 或 apply 前，先做弱校验：

| 参数 | 校验规则 |
|---|---|
| `salesCodes` | 必须传入，且为非空列表 |

> `pid` 由 CLI 网关自动注入，不需要 Skill 校验。

不通过时直接告知用户缺少哪些参数，不调用后端。

### 6.2 修改规则

| 修改内容 | 处理方式 |
|---|---|
| MCC 类目 | 清理整个 `~/.alipay/ar/` 目录，用 salesProductCodes + 新 mccCode 重新调用 previewFormView |
| 更换产品（salesCodes 变更） | 清理整个 `~/.alipay/ar/` 目录，重新走 previewFormView 初始化 |
| 资质、属性、联系人等其他字段 | 按 references/preview.md §2.3 pageData 组装规则从文件读取完整 values，增量覆盖对应字段，继续 previewFormView |

### 6.3 pageData 组装规则（全局约束）

> **⚠️ 此规则适用于所有调用 previewFormView 和 apply 的场景，违反会导致后端报错或数据丢失。**

每次调用 previewFormView 或 apply 时，pageData 的组装必须遵循以下规则（详见 references/preview.md §2.3）：

1. **从 `~/.alipay/ar/ar-sign-data.json` 读取**：遍历 `artisanPage.data` 下每个 blockId，提取 `artisanPage.data.<blockId>.data.values`，合并为顶层 pageData 对象
2. **仅 merge 用户变更的字段**：在完整 pageData 基础上，仅更新用户本次交互变更的字段
3. **传入完整 pageData**：所有区块的 values 必须包含，禁止只传变更区块

**绝对禁止**：
- ❌ 禁止从对话记忆中拼凑 pageData — 文件是唯一数据源
- ❌ 禁止只传变更区块 — 必须传所有业务区块的完整 values（脚本自动跳过 basicArInfo、editPriceInfo 等后端自处理区块）
- ❌ 禁止省略 null 值字段 — 后端依赖字段存在性

### 6.4 特殊区块处理

| 区块类型 | 收集阶段 | 确认阶段 |
|---|---|---|
| 价格模块（editPriceInfo / customPrice） | ⛔ **完全不出现**——不纳入 checklist，不以任何形式展示 | 展示给用户确认 |
| 协议模块（protocolInfo / frontProtocol） | ⛔ **完全不出现**——不纳入 checklist，不以任何形式展示 | 展示给用户确认 |
| 其他业务区块 | 正常收集，纳入 checklist | 展示给用户确认 |

> "不纳入 checklist"= 用户在收集阶段的进度列表中**根本看不到**这些区块。禁止以"不展示""跳过""待确认阶段展示"等任何标注形式出现在 checklist 中。

### 6.5 一期范围约束

- 面向**个人开发者**
- 当前支持签约的产品：**智能收**、**电脑网站支付**
- 暂不支持：JSAPI 支付、手机网站支付、APP 支付（后续扩展）
- MCC 类目由外部 mcc-recommend Skill 推荐后传入签约 Skill
- 产品推荐由子 Skill（`references/recommend-product.md`）处理
- 不含负向链路（解约），引导用户去支付宝商家中心处理

> 向用户介绍产品时，不要用"在线办理"等措辞（其他渠道也是在线的）。直接说"当前支持签约的产品"即可。
> 产品选择时，不主动提供"两个都要"等组合选项。但如果用户主动说"我要同时签约 A 和 B"，则支持多产品同时签约（传入多个 salesCodes）。

### 6.6 预填数据文件（Prefill）

> **prefill 是"候选资料来源"，不是"自动填字段"。** 用于减少用户输入，但最终写入仍需经过 schema 匹配、脚本校验、previewFormView 后端校验和确认汇总。

配置：`ar-sign config --prefill-file <路径>`

文件格式：扁平 key-value JSON，key **建议**为 `blockId.fieldName` 路径，也接受中文名等非标准格式：

```json
{
  "webSiteInfo.webStatus": "OFFLINE",
  "businessInfo.mccInfo.mccCode": "<mccCode>",
  "contactInfo.contactName": "张三"
}
```

#### 核心机制：LLM 候选映射（初筛）+ 脚本执行写入（门控）

**prefill 文件由 LLM 读取和初筛匹配，但所有写入必须经过脚本路径校验和 previewFormView 后端校验。** LLM 的置信度判断只是"初筛"——即使 LLM 认为高置信度，最终也可能被脚本报路径错误或被后端校验拒绝。高置信度的含义是"允许尝试自动写入"，不是"一定正确"。

工作流：
1. LLM 在 init 阶段读取 prefill 文件，提取 `salesProductCodes` 和 `mccCode`（如有），作为 `init_preview_request.py` 的 `-s` / `--mcc` 参数
2. 首次 previewFormView 返回后拿到 schema
3. LLM 读取 prefill 文件，对照**当前** schema 生成候选映射
4. **去重**：检查 `~/.alipay/ar/tmp/prefill_result.json`，已出现在 `applied`/`pending`/`skipped` 中的 key **跳过**，不再重复处理
5. **按置信度分级处理**候选映射（见下方）
6. 确定的映射作为 CLI 参数（`blockId.fieldName=value`）传入 build_preview_request.py
7. **脚本路径校验**：build_preview_request.py 校验路径是否存在于当前 pageData 中，路径不存在会报 PATH_NOT_FOUND 警告
8. **previewFormView 后端校验**：最终由后端判断值是否合法，校验失败展示错误让用户修正
9. **更新 prefill 初筛摘要**（见下方）——追加写入，不覆盖已有记录

> ⛔ **禁止对同一 prefill key 重复处理。** 每个 key 只初筛一次，结果记录在 prefill_result.json 中。后续 previewFormView 循环中遇到同一 key 时，直接跳过。

#### 候选映射置信度分级

| 置信度 | 条件（必须同时满足） | 处理 |
|---|---|---|
| **高** | ① key 为标准 `blockId.fieldName` 路径 ② **当前 schema 中存在该字段**（而非旧 schema 或猜测） ③ LLM 初筛 value 类型与 schema type 一致 | 允许尝试自动写入，传给 build_preview_request.py |
| **中** | key 为中文名/缩写/非标准格式，LLM 推理出对应字段但不完全确定；或 value 类型看似合理但无法确认 | **展示给用户确认后**再填入 |
| **低** | key 无法对应到当前 schema 中任何字段；或 value 与 schema 类型明显不匹配 | 跳过，不填入 |

> ⛔ **禁止低置信度映射静默写入。** 宁可多问一次用户，也不能让幻觉污染签约资料。
>
> **高置信度 ≠ 正确**。LLM 的 type/enums 判断是初筛，最终以脚本路径校验（PATH_NOT_FOUND）和后端校验（checkedError）为准。自动写入失败时，降级为向用户收集。

#### prefill 初筛摘要

每次 prefill 匹配处理后，必须输出一份**初筛摘要**并写入 `~/.alipay/ar/tmp/prefill_result.json`。

> ⚠️ **初筛摘要 ≠ 最终写入结果。** "已自动填入"仅表示 LLM 初筛通过并已传入脚本，脚本路径校验（PATH_NOT_FOUND）或 previewFormView 后端校验仍可能拒绝。最终写入以 previewFormView 返回的 artisanPage 为准。

文件格式：

```json
{
  "applied": [{"key": "<blockId.fieldName>", "value": "<value>"}],
  "pending": [{"key": "<原始 key>", "mappedKey": "<blockId.fieldName>", "value": "<value>"}],
  "skipped": [{"key": "<原始 key>", "reason": "<原因>"}]
}
```

同时向用户展示可读摘要：

```
prefill 初筛结果（最终以后端校验为准）：
  ✅ 已尝试填入：<blockId.fieldName>=<value>, ...
  ❓ 待确认（请确认是否正确）：<原始 key> → <blockId.fieldName>=<value>
  ⏭️ 已跳过（未识别或不匹配）：<原始 key>, ...
```

此文件路径通过 `config_utils.get_prefill_result_path()` 获取，与其他临时文件统一管理。`ar-sign clean` 清理数据目录时自动删除。如无 prefill 文件或文件为空，不输出摘要、不创建结果文件。

#### 特殊字段处理

- **mccCode**：⛔ **禁止 LLM 自行生成 mccCode。** prefill 提供的值必须是明确的编码格式（如 `Axxxx_Bxxxx`），才允许作为 `--mcc` 或 `businessInfo.mccInfo.mccCode=` 传入。若 prefill 给的是中文类目名（如"零售-超市"）或模糊描述，**禁止 LLM 将其转换为 mccCode**——必须走 mcc-recommend Skill 推荐或让用户提供明确编码。详见上方 §3.1「mccCode 来源与校验规则」
- **枚举类字段**：必须对照 schema 的 enums 列表校验，值不在枚举中时降为中置信度，需用户确认
- **证照/图片类字段**：prefill 可提供 URL，但需确认 URL 有效性

#### 行为规则

- Skill 只读文件，不负责文件的创建和清理
- **init 阶段（首次 previewFormView）**：prefill 只能提供 `salesProductCodes` 和 `mccCode`，因为此时尚无 artisanPage，其他字段留到收集阶段处理
- 未命中的字段正常向用户收集
- prefill 值由 previewFormView 接口校验，校验失败展示错误让用户修正
- 确认汇总阶段展示所有字段（含 prefill 自动填入的字段），用户统一确认
- **仅作用于 previewFormView 流程（init + 收集）**，apply 必须基于 ar-sign-data.json 数据

#### 硬规则

1. prefill 文件不是权威数据源，只是候选输入源
2. LLM 允许做字段候选匹配，但禁止直接修改 ar-sign-data.json
3. 所有 prefill 命中的字段必须通过 build_preview_request.py 进入 previewFormView
4. 低置信度映射禁止静默写入，必须停下来让用户确认或跳过
5. 自动填入的 prefill 字段必须在确认汇总阶段展示给用户确认

#### 异常处理

| 场景 | 处理 |
|---|---|
| prefill 文件不存在 | 静默跳过，正常流程 |
| JSON 解析失败 | 静默跳过，不影响现有数据，正常流程 |
| key 无法匹配到任何 schema 字段（低置信度） | 跳过该 key，继续处理其他 key |
| value 与 schema 类型/枚举不匹配 | 降为中/低置信度，需用户确认或跳过 |

## 7. 后端错误处理

> 详见 `references/mcp-guide.md` §7。

## 8. Skill 对外输出格式

> 详见 `references/mcp-guide.md` §8。

## 9. 职责边界

| 职责 | 外层 / 平行 Skill | 签约 Skill | 后端服务 |
|---|---|---|---|
| 身份校验与授权 | **负责** | 不负责 | 不负责 |
| 意图识别与路由 | **负责** | 不负责 | 不负责 |
| 产品推荐 | **负责**（产品推荐 Skill） | 不负责 | 不负责 |
| MCC 类目确认 | **负责**（外部 mcc-recommend Skill） | 不负责 | 不负责 |
| 自然语言 → 结构化 patch | **负责** | 不负责 | 不负责 |
| 图片识别与分类 | **负责** | 不负责 | 不负责 |
| 异常处理与重试 | **负责** | 直接展示错误 | 返回错误 |
| McpOperateContext 注入 | **负责**（网关） | 不负责 | 不负责 |
| 编排 收集→确认→提交 流程 | 不负责 | **负责** | 不负责 |
| 动态 schema 解析 | 不负责 | **负责** | 不负责 |
| 维护本地 artisanPage 数据 | 不负责 | **负责** | 不负责 |
| 参数映射（salesCodes → salesProductCodes 等） | 不负责 | **负责** | 不负责 |
| 字段含义与 schema 定义 | 不负责 | 不负责 | **负责** |
| 字段校验 | 不负责 | 不负责 | **负责** |
| 业务规则判断 | 不负责 | 不负责 | **负责** |
| 安全风控与鉴权 | 不负责 | 不负责 | **负责** |
| 价格与协议计算 | 不负责 | 不负责 | **负责** |
| 是否可申请判定 | 不负责 | 不负责 | **负责** |

## 10. 已知限制与待补充项

### 已确认的联动行为

previewFormView 接口存在字段联动：用户填写某个字段后，后端会动态更新 schema（新增/移除字段、改变 required 状态）。每次 previewFormView 返回后**必须从新 schema 重新分析字段列表**，禁止沿用上一轮的字段判断。

> 具体哪些字段会触发联动由后端配置决定，Skill 侧不硬编码联动规则，统一依赖"每次 previewFormView 返回后重新分析 schema"机制处理。

### 非阻塞项（V1 用兜底策略）

- [ ] 产品建议的知识小作文内容（产品推荐 Skill 依赖）
- [ ] 验证码场景（`ackInputV2`）：如何触发发送验证码，V1 兜底提示去商家中心操作
- [ ] 图片上传（`ImageUploadV2`）：上传流程待明确，V1 兜底提示去商家中心操作

## 11. 引用文件

| 文件 | 用途 |
|---|---|
| `references/mcp-guide.md` | MCP 调用约定、参数映射、错误处理、输出格式 |
| `references/schema-guide.md` | artisanPage 结构解析规则（被 references/preview.md 引用） |
| `references/recommend-product.md` | 产品推荐子 Skill |
| `references/preview.md` | 收集+确认子 Skill |
| `references/apply.md` | 申请提交子 Skill |
| `references/query-ar.md` | 合约查询子 Skill |
| `references/query-order.md` | 订单查询子 Skill |
