# 收集 + 确认子 Skill

> 编排签约信息收集的完整流程：初始化 → MCC 收集 → 资质收集循环 → 确认汇总。
>
> ⛔ **数据源约束（贯穿全流程）：所有要采集的字段和展示的数据，必须基于 MCP 返回结果或 ar-sign-data.json。** 字段列表来自 artisanPage schema，已填值来自 ar-sign-data.json，价格/协议来自对应 artisanPage 区块。LLM 自身知识不是合法数据源——禁止基于训练知识列出字段、推测枚举值、自行报价、描述协议条款或预判前置条件。

## 1. 子 Skill 元信息

- **name**: preview
- **description**: 签约信息收集与确认，基于 artisanPage 动态 schema 引导用户逐步填写
- **触发条件**: 已有 salesCodes，开始签约收集
- **输入参数**: salesCodes, 可选初始数据（如 MCC 信息）
- **引用文档**: `references/schema-guide.md`（artisanPage 解析规则）

## 2. 数据存储

### 2.1 存储策略

**本地文件优先，上下文兜底**：

| 条件 | 存储方式 | 会话断开后 |
|---|---|---|
| 有本地写入权限 | `~/.alipay/ar/ar-sign-data.json` | 数据保留，新会话可恢复 |
| 无本地写入权限 | LLM 上下文记忆 | 数据丢失，需重新收集 |

降级时告知用户：
> "当前无法保存签约进度到本地，如果中途关闭终端，已填写的信息需要重新收集。"

### 2.2 文件内容

路径：`~/.alipay/ar/ar-sign-data.json`（用户主目录下）

**文件内容 = 接口返回的 artisanPage 原始数据**，不做任何修改或加工。用户收集到的信息填入 artisanPage 的 values 对应路径，但结构始终保持与接口返回一致。

```json
{
  "artisanPage": { "...接口返回的完整 artisanPage，结构不可修改..." },
  "meta": {
    "salesCodes": ["I1080300001000041203"],
    "createdAt": "2026-04-16T10:00:00Z",
    "updatedAt": "2026-04-16T10:30:00Z"
  }
}
```

> `artisanPage` 字段始终为接口返回的原始结构。`meta` 为 Skill 附加的管理信息。

**artisanPage 存储的绝对规则**：

- artisanPage 必须是接口返回的**完整原文**，包括 `data`、`structure`、`title` 等所有顶层字段
- 每个区块必须保留**全部字段**（`basic`、`data`、`id`、`loadMode`、`status`、`type` 等），不可省略
- ❌ **禁止提取 values 单独存储** — 必须保留完整的 schema + values + 区块元信息
- ❌ **禁止精简、重组、或只保留"有用"的字段** — 接口返回什么就存什么
- ❌ **禁止 LLM 用自己的理解重新构造 artisanPage** — LLM 不得手动处理 JSON 存储
- ❌ **禁止因"JSON 太大"、"转义字符复杂"等原因简化数据** — 这些是脚本的工作，不是 LLM 的

**存储方式：必须通过脚本执行，禁止 LLM 手动写入 `~/.alipay/ar/ar-sign-data.json`**。

使用 `scripts/save_preview_response.py` 将 previewFormView 响应原样存储：

```bash
# 从文件存储（推荐：先用 2>/dev/null 保存纯 JSON，再传入脚本）
alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null > ~/.alipay/ar/tmp/preview_response.json
python3 scripts/save_preview_response.py -r ~/.alipay/ar/tmp/preview_response.json

# 从管道存储（MCP 返回直接传入，同样必须 2>/dev/null）
alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null | python3 scripts/save_preview_response.py
```

> **⚠️ MCP 调用必须加 `2>/dev/null`**，否则 stderr 的调试信息（ANSI 转义码、表格边框）会混入 stdout，污染 JSON 数据。

脚本内部逻辑（禁止 LLM 自行实现，直接调脚本）：
1. 读取 previewFormView 响应 JSON
2. 提取 `data.artisanPage` 原文（不做任何修改）
3. 验证结构完整性（data、structure、title、各区块字段）
4. 附加 meta 信息（salesCodes、时间戳）
5. 写入 `~/.alipay/ar/ar-sign-data.json`

### 2.3 读写时机

每次用户交互的数据流：

```
用户输入
  → 读取 `~/.alipay/ar/ar-sign-data.json` 中的 artisanPage
  → 将用户输入填入对应 values 路径（见下方 pageData 组装规则）
  → 调用 previewFormView MCP（传入组装好的 pageData）
  → 用接口返回的新 artisanPage 原样覆盖写入 `~/.alipay/ar/ar-sign-data.json`
  → 展示下一步
```

#### pageData 组装规则

> **⚠️ 这是最关键的规则，违反会导致后端报错或数据丢失。每次调用 previewFormView 和 apply 前必须严格按此规则组装 pageData。**

pageData 是所有区块 values 的合并，格式为：

```json
{
  "blockId1": { ...该区块的完整 values... },
  "blockId2": { ...该区块的完整 values... },
  ...
}
```

**组装方式：必须通过脚本执行，禁止 LLM 手动拼接 JSON**。

> **前置条件**：需要本地安装 Python 3.6+（仅使用标准库，无需额外 pip 依赖）。macOS 自带 python3，一般无需额外安装。

**脚本选择规则**：

| 条件 | 使用脚本 | 说明 |
|---|---|---|
| `~/.alipay/ar/ar-sign-data.json` **不存在** | `scripts/init_preview_request.py` | 首次调用，无需 pageData |
| `~/.alipay/ar/ar-sign-data.json` **已存在** | `scripts/build_preview_request.py` | 从文件提取 pageData + merge 变更 |

> **⚠️ 已有 `~/.alipay/ar/ar-sign-data.json` 时禁止使用 init_preview_request.py**（脚本会自动检测并报错）。包括填入 MCC、更新字段等所有"已有数据后的操作"，都必须用 `build_preview_request.py`。

使用 `scripts/build_preview_request.py` 组装完整的 previewFormView request：

```bash
# 无变更，仅提取当前 pageData 组装 request
python3 scripts/build_preview_request.py

# 修改单个字段
python3 scripts/build_preview_request.py webSiteInfo.webStatus=OFFLINE

# 修改多个字段
python3 scripts/build_preview_request.py webSiteInfo.webStatus=OFFLINE webSiteInfo.webLink=https://example.com

# 输出到文件
python3 scripts/build_preview_request.py webSiteInfo.webStatus=OFFLINE -o ~/.alipay/ar/tmp/request.json

# 仅输出 pageData（不含 request 包装）
python3 scripts/build_preview_request.py --page-data-only webSiteInfo.webStatus=OFFLINE
```

脚本内部逻辑（禁止 LLM 自行实现，直接调脚本）：
1. 读取 `~/.alipay/ar/ar-sign-data.json`，遍历 `artisanPage.data` 下每个 blockId，提取 `artisanPage.data.<blockId>.data.values`，合并为 pageData
2. 将用户变更字段写入对应路径
3. 用 meta.salesCodes + 固定参数（callMode、channelCode、orderType）包装为完整 request
4. 输出合法 JSON

**调用 previewFormView MCP 的完整流程**：

```bash
# 1. 用脚本组装 request JSON
python3 scripts/build_preview_request.py webSiteInfo.webStatus=OFFLINE -o ~/.alipay/ar/tmp/preview_request.json

# 2. 调用 MCP（必须用 2>/dev/null 丢弃 stderr 调试输出，只保留 stdout 纯 JSON）
alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null > ~/.alipay/ar/tmp/preview_response.json

# 3. 用脚本存储返回结果
python3 scripts/save_preview_response.py -r ~/.alipay/ar/tmp/preview_response.json
```

> **⚠️ MCP 调用必须加 `2>/dev/null`**：CLI 的调试信息（ANSI 转义码、表格边框、日志）输出到 stderr，JSON 响应输出到 stdout。不加会导致文件被污染，脚本无法解析。详见 `references/mcp-guide.md §2.4 MCP 输出规范`。

**绝对禁止**：

- ❌ **禁止 LLM 手动拼接 pageData JSON** — 必须通过脚本组装，确保 JSON 合法性和数据完整性
- ❌ **禁止从对话记忆中拼凑 pageData** — 脚本从 `~/.alipay/ar/ar-sign-data.json` 文件读取完整 values
- ❌ **禁止只传变更区块** — 脚本自动包含所有业务区块的完整 values（自动跳过 basicArInfo、editPriceInfo 等后端自处理区块），后端依赖全量数据做联动计算
- ❌ **禁止省略 null 值字段** — values 中的 null 字段必须保留，后端依赖字段存在性
- ❌ **禁止用对话中看到的旧值覆盖文件中的值** — 文件是唯一数据源，对话记忆不可靠
- ❌ **禁止修改 values 的结构** — 保持与接口返回一致，只改具体字段的值

**完整转换示例**：

假设 previewFormView 首次返回的 artisanPage 保存在 `~/.alipay/ar/ar-sign-data.json` 中，用户说「把网站状态改为未上线」：

**步骤 1：从文件提取所有区块 values**

`~/.alipay/ar/ar-sign-data.json` 中 artisanPage 的结构：

```
artisanPage.data
  ├── businessInfo.data.values  = { "businessInfo": { "mccInfo": { "mccCode": "<mccCode>", ... } } }
  ├── basicArInfo.data.values   = { "basicArInfo": { "basicArInfo": { "effectType": "02", ... } } }
  ├── webSiteInfo.data.values   = { "webSiteInfo": { "webStatus": "ONLINE", "webLink": null, "loa": null, "screenshot": null, ... } }
  ├── editPriceInfo.data.values = { "editPriceInfo": { ... } }
  ├── protocolInfo.data.values  = { "protocolInfo": { ... } }
  └── unifiedCg#null_0.data.values = { "unifiedCg#null_0": { ... } }
```

遍历每个区块，提取 `.data.values` 并合并为一个对象：

```json
// pageData（合并后）
{
  "businessInfo": { "mccInfo": { "mccCode": "<mccCode>", ... } },
  "basicArInfo": { "basicArInfo": { "effectType": "02", ... } },
  "webSiteInfo": { "webStatus": "ONLINE", "webLink": null, "loa": null, "screenshot": null, ... },
  "editPriceInfo": { ... },
  "protocolInfo": { ... },
  "unifiedCg#null_0": { ... }
}
```

> 注意：每个区块的 values 中，顶层 key 就是 blockId（如 `{ "webSiteInfo": {...} }`），合并时取内层对象。最终 pageData 的 key 就是各 blockId。

**步骤 2：仅更新用户变更的字段**

用户说「网站状态改为未上线」→ 对应字段为 `webSiteInfo.webStatus`，值从 `"ONLINE"` 改为 `"OFFLINE"`：

```json
// 只改这一个字段，其他所有字段（包括 null 值）原封不动
pageData["webSiteInfo"]["webStatus"] = "OFFLINE"
```

**步骤 3：传入 API**

```json
{
  "request": {
    "salesProductCodes": ["I1080300001000041203"],
    "callMode": "INTERACTION",
    "channelCode": "B_SK_SH_RPC",
    "orderType": "NEW_SIGN",
    "pageData": {
      "businessInfo": { "mccInfo": { "mccCode": "<mccCode>", ... } },
      "basicArInfo": { "basicArInfo": { "effectType": "02", ... } },
      "webSiteInfo": { "webStatus": "OFFLINE", "webLink": null, "loa": null, "screenshot": null, ... },
      "editPriceInfo": { ... },
      "protocolInfo": { ... },
      "unifiedCg#null_0": { ... }
    }
  },
  "ctx": {}
}
```

> 对比变更前后，整个 pageData 中只有 `webSiteInfo.webStatus` 从 `"ONLINE"` 变为 `"OFFLINE"`，其余完全一致。

**关键原则**：
- `~/.alipay/ar/ar-sign-data.json` 中的 artisanPage 必须是接口返回的原始数据，Skill 不对其做任何结构修改
- 用户收集的信息只填入 values 对应路径，作为下次 previewFormView 调用的入参
- 接口返回后，用新的完整 artisanPage 覆盖本地，不做 merge

| 事件 | 操作 |
|---|---|
| 首次 previewFormView 返回成功 | 创建文件，写入 artisanPage |
| 用户提供字段值 | 读取文件 → merge → 调 previewFormView → 覆盖写入 |
| apply 提交成功 | 清理整个 `~/.alipay/ar/` 目录 |
| 用户主动重新开始签约 | 清理整个 `~/.alipay/ar/` 目录 |
| 用户切换产品（salesCodes 变更） | 清理整个 `~/.alipay/ar/` 目录，用新 salesCodes 重新初始化 |
| 用户修改 MCC 类目 | 清理整个 `~/.alipay/ar/` 目录，用 salesCodes + 新 mccCode 重新初始化 |
| 文件存在超过 7 天 | 视为过期，清理整个 `~/.alipay/ar/` 目录 |

> **清理规则：所有删除/清空场景统一执行 `rm -rf ~/.alipay/ar/`，同时清除持久数据和临时文件。不存在只删 ar-sign-data.json 而保留 tmp/ 的情况。实际清理路径以 `~/.alipay/arSignConfig.json` 配置为准（默认 `~/.alipay/ar/`）。**

### 2.4 恢复逻辑

新对话开始时检查 `~/.alipay/ar/ar-sign-data.json`：

| 文件状态 | 处理 |
|---|---|
| 存在且未过期（< 7 天） | 告知用户有未完成的签约，询问是否继续 |
| 存在但已过期（>= 7 天） | 清理整个 `~/.alipay/ar/` 目录，告知数据已过期，需重新开始 |
| 不存在 | 正常开始新流程 |

## 3. 流程总览

```
确认产品 → 首次 previewFormView → MCC 收集 → previewFormView（带 MCC）→ 资质收集循环（多轮）→ 确认汇总
                                                              ↑                    |
                                                              |    用户修改普通字段   |
                                                              +--------------------+

用户修改 MCC/产品 → 清理 ~/.alipay/ar/ → 重新从头开始
```

### 阶段说明

| 阶段 | 是否展示 checklist 进度 | 说明 |
|---|---|---|
| 确认产品 | 否 | 纯对话确认 salesCode，由产品推荐 Skill 处理 |
| 首次 previewFormView | 否 | 用 salesCode 调 previewFormView，获取 artisanPage（pid 由网关自动注入） |
| MCC 收集 | 否 | 从 artisanPage 找到 mccV2 字段，调用外部 mcc-recommend Skill 推荐；不可用时直接询问用户 |
| previewFormView（带 MCC） | 否 | MCC 填入后再调 previewFormView，获取更新后的 artisanPage |
| 资质收集循环 | **是** | 展示 checklist + 逐区块收集，每收集完一个区块调一次 previewFormView |
| 确认汇总 | 否 | 展示全部信息（含价格、协议），用户确认后提交 |

## 4. 初始化阶段

### 产品切换判断

当用户说"我要签约 XXX 产品"时，先判断当前会话状态：

| 当前状态 | 用户请求的产品 | 处理方式 |
|---|---|---|
| 无进行中的签约 | 任意 | 直接开始初始化 |
| 有进行中的签约 | 与当前产品**相同** | 继续当前流程，不重新开始 |
| 有进行中的签约 | 与当前产品**不同** | 询问用户："当前正在进行「{当前产品名}」的签约，切换到「{新产品名}」将清空已填写的信息，是否确认？" |

- 用户确认切换 → 清理整个 `~/.alipay/ar/` 目录，用新的 salesCodes 重新初始化
- 用户取消 → 继续当前流程

> 判断"是否相同产品"：比较当前 salesCodes 与用户请求的 salesCodes 是否一致。

### 初始化步骤

> ⛔ **确认 salesCode 后必须立即执行以下步骤，禁止插入 LLM 自行发起的前置询问（如"是否有营业执照""网站是否上线"）。** 需要收集什么由 previewFormView 返回的 schema 决定，不由 LLM 预设。

1. **弱校验**（引用 SKILL.md §6.1 规则）：
   - 检查 salesCodes 是否传入（pid 由网关自动注入，无需校验）
   - 不通过 → 引导用户确认签约产品

2. **prefill 预读取（init 阶段）**：
   - 如配置了 prefillFile，读取文件查找 init 阶段可用的值
   - **init 阶段只能使用 prefill 中的两类数据**：
     - `salesProductCodes` / `salesCodes` — 作为 `-s` 参数传入
     - `mccCode` / `businessInfo.mccInfo.mccCode` — 作为 `--mcc` 参数传入
   - 其他字段（如 webSiteInfo、contactInfo 等）在 init 阶段无法使用，因为尚无 artisanPage 和 pageData，留到资质收集阶段处理
   - prefill 文件不存在或解析失败则静默跳过

3. **首次调用 previewFormView**：

   > ⛔ **禁止自行组装请求 JSON。** 必须用 `init_preview_request.py` 生成。

   - 使用 `references/mcp-guide.md §2.4` 中的环境配置调用 MCP
   - 传入 salesProductCodes（Skill 内部 salesCodes 映射而来）
   - 首次调用无需传入 pageData（尚无用户数据）
   - 如有初始 MCC 信息（来自 prefill 或外部传入），传入 `--mcc` 参数
   - **必须通过脚本生成 request，禁止 LLM 手动拼接 JSON**

   ```bash
   # 1. 用脚本生成首次 request
   python3 scripts/init_preview_request.py -s I1080300001000041203 -o ~/.alipay/ar/tmp/preview_request.json

   # 如已有 MCC 信息（来自 prefill 或外部传入），带上 --mcc
   python3 scripts/init_preview_request.py -s I1080300001000041203 --mcc <mccCode> -o ~/.alipay/ar/tmp/preview_request.json

   # 2. 调用 MCP（必须 2>/dev/null）
   alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null > ~/.alipay/ar/tmp/preview_response.json

   # 3. 存储返回结果
   python3 scripts/save_preview_response.py -r ~/.alipay/ar/tmp/preview_response.json
   ```

4. **处理返回**：
   - 后端返回 errorCode → 展示 errorMessage 给用户，终止流程
   - 返回成功 → 获取 artisanPage 数据，告知用户产品名称（`artisanPage.title`）

5. **MCC 处理**：
   - 读取 mccCode 位置：`artisanPage.data.businessInfo.data.values.businessInfo.mccInfo.mccCode`
   - **判断是否需要 MCC 推荐**：
     - 当前 mccCode 为默认值 `A0003_B0223` → **必须**尝试调用外部 mcc-recommend Skill 为用户推荐类目；Skill 不可用时降级为直接询问用户
     - 当前 mccCode 非默认值 → 使用已有值，跳过 MCC 收集
     - 用户主动要求更换 MCC → 尝试调用 mcc-recommend Skill 重新推荐
   - **⛔ mccCode 来源校验**（详见 SKILL.md §3.1）：
     - mccCode 只能来自 mcc-recommend Skill 的输出或 prefill 文件中的明确编码
     - 禁止接受用户手动输入的 mccCode、LLM 编造的 mccCode、文档示例中的 mccCode
     - 拦截时引导用户描述经营场景，通过 mcc-recommend Skill 推荐
     - 脚本层会兜底拦截默认值和格式不合法的 mccCode
   - **MCC 变更后的处理**：
     - 清理整个 `~/.alipay/ar/` 目录
     - 构造 pageData：仅包含 businessInfo 区块 values，其中 mccCode 为新值
     - 用 salesProductCodes + pageData 调用 previewFormView
     - 用返回的 artisanPage 写入 `~/.alipay/ar/ar-sign-data.json`
   - 进入资质收集循环

6. **进入资质收集循环**

## 5. 资质收集循环

### 5.1 checklist 构建

进入资质收集前，先从 artisanPage 构建 checklist：

1. 遍历 `structure.children`，获取区块顺序
2. 对每个区块，取 `basic.title` 作为 checklist 项名称
3. **排除以下区块**——⛔ **这些区块在收集阶段完全不存在于 checklist 中，不以任何形式（包括"不展示""跳过"等标注）出现在进度列表里**：
   - `basicArInfo` 区块（视为 hidden，完全忽略）
   - 价格模块（editPriceInfo / customPrice 相关区块）
   - 协议模块（protocolInfo / frontProtocol 相关区块）
   - 所有字段均为 `hidden=true` 的区块
   - 所有字段均为仅展示类 widget 的区块

   > 错误示例：checklist 中出现"🔲 价格模块 — 不展示"或"🔲 协议模块 — 收集阶段跳过"。这违反了"不纳入 checklist"的规则——不纳入意味着用户根本看不到这些条目。
4. 判断每个区块状态：
   - 该区块所有 required 字段已有值 → `completed`（✅）
   - 当前正在收集的区块 → `in_progress`（🔘）
   - 尚未开始的区块 → `pending`（🔲）

### 5.2 每轮收集步骤

每轮固定 5 个步骤：

#### 步骤 1：字段分析

遍历当前区块，分析哪些字段需要用户操作：

1. **只从 `schema.properties` 获取字段列表** — 递归遍历 schema 树，直到找到含 `widget` 的叶子字段（参考 `references/schema-guide.md` §1）
2. 按 `order` 升序排列叶子字段
3. 对每个字段判断：
   - `hidden=true` → **跳过，不向用户展示也不采集**（数据由接口自行处理）
   - `required=true` + values 中无值（null/空串/未出现） → **需要收集**
   - `required=true` + values 中已有非空值 → **展示当前值，用户可主动修改，不强制重新输入**
   - `disabled=true` → 不可编辑，仅展示
   - `required=false` → **不主动收集**，但用户可主动提供值（LLM 不拒绝，按正常字段处理传入脚本）

> ⛔ **`required=true` 不等于"需要向用户收集"——它只表示"提交时必须有值"。** 已有值的字段（包括默认值、复用值、prefill 值）展示当前值供用户知晓，用户可选择修改或跳过，但 LLM 不得主动要求用户逐个确认或重新填写。
>
> **已有值不等于用户已确认。** 默认值和复用值可能不符合用户实际情况，因此：
> - 展示已有值时标注来源（如"当前值：OFFLINE"），让用户自行判断是否需要修改
> - 用户无异议则保留当前值继续推进，不追问"是否确认"
> - 禁止 LLM 基于自身判断认定"这个默认值不对，应该问用户"——值是否合适由用户和后端校验决定
>
> **MCC 字段特殊判断**：mccCode 的"需要收集"不看 required，而看**值是否为默认值 `A0003_B0223`**。非默认值 → 已有有效类目，展示当前值；默认值 → 需要推荐类目（走 mcc-recommend Skill）。

> **⚠️ 绝对规则：字段是否存在、是否需要收集，必须且只能依据 schema 判断。**
>
> - ❌ **禁止从 values 推断字段** — values 中可能存在 schema 中没有的字段（如 `screenshot: null`），这些是联动后才可能出现的字段，当前不存在于 schema 中就不收集
> - ❌ **禁止凭"字段名看起来需要"就展示给用户** — 只有 schema 中明确定义且 required=true 的字段才需要收集
> - ✅ **schema 是唯一真相** — 后端通过 schema 控制当前状态下哪些字段可见/必填，联动变化（如 webStatus 从 ONLINE 改为 OFFLINE 后新增 screenshot）会在下次 previewFormView 返回的新 schema 中体现

> **核心原则：不可见（hidden=true）的字段和 `basicArInfo` 区块，永远不向用户展示、不采集、不做任何对客交互。** 这些数据由接口内部维护，Skill 完全忽略。

> 详细判断规则参考 `references/schema-guide.md` §2。

#### 步骤 2：展示 checklist + 当前区块

> 展示的区块列表、字段名称、字段类型均来自 artisanPage schema，已填值来自 ar-sign-data.json。禁止从 LLM 知识中补充字段或修改 label。
>
> ⛔ **对客展示规则（贯穿收集和确认全阶段）：**
> - **字段名称**：使用 schema 中的 `title`（如"网站页面截图"），**禁止展示程序字段名**（如 `screenshot`、`webStatus`、`mccCode`）
> - **已有值展示**：枚举类字段使用 `enums[].key` 展示名（如"未上线"），不展示原始 value（如"OFFLINE"）；非枚举字段直接展示 value
> - **技术元数据**：`type`（string/array/object）、`widget` 名称、`required` 布尔值、`enums` 来源标注等**一律不展示给用户**
> - **选项列表**：直接列出选项名称，不标注"来自 schema enums"等内部信息
> - **V1 兜底字段**（仅 `ImageUpload`/`ImageUploadV2`/`ackInputV2`，⚠️ `webSiteShotV2` 不在此列）：告知"此项暂不支持在线操作，请前往支付宝商家中心完成"，不阻断整体流程，继续收集其他字段

**每次交互必须包含两部分内容：**

**Part 1 — 资质清单进度**

> checklist 可展示区块名称、状态符号和简要说明，但**说明内容必须来自 ar-sign-data.json 的 schema 和 values**，禁止 LLM 自行编写描述。

每个 checklist 条目的格式：`状态符号 区块title（状态）— 说明`

说明内容的数据源规则：

| 内容 | 合法数据源 | 用户看到的示例 |
|---|---|---|
| 区块名称 | `basic.title` | "网站信息" |
| 已完成字段的值 | 枚举字段用 `enums[].key` 反查展示名；非枚举字段直接展示 value | "经营类目：零售-超市" |
| 待收集字段名称 | `schema.properties` 中的 `title` | "待收集：网站页面截图" |

```
✅ 经营信息 — 经营类目：零售-超市
🔘 网站信息（进行中）— 网站状态：未上线，待收集：网站页面截图
🔲 联系人（待开始）
```

⛔ **禁止的做法**：
```
✅ 经营信息 — mccCode: <mccCode>                     ← 禁止展示程序字段名和原始 value
🔘 网站信息 — webStatus=OFFLINE，缺少截图              ← 禁止展示字段名，"缺少截图"是 LLM 描述
🔘 网站信息 — 网站信息不完整，需要补充                  ← 完全是 LLM 自行编写
```

**Part 2 — 当前区块收集**

> ⛔ **必须展示具体字段并引导收集，禁止只描述状态。** 正确做法是用 schema 中的 `title` 作为字段名引导用户，用 `description`/`placeholder` 补充说明，用 `enums[].key` 列出选项。
>
> 禁止在对客展示中出现：程序字段名（`screenshot`）、技术类型（`array`）、widget 名称（`webSiteShotV2`）、"来自 schema enums"等内部标注。这些是 LLM 解析 schema 的内部过程，不是给用户看的。

根据当前区块待收集字段数量选择交互模式：

| 条件 | 模式 | 交互方式 |
|---|---|---|
| 当前区块待收集字段 = 1 | `single_field` | 对话式直接收集 |
| 当前区块待收集字段 >= 2 | `form` | 表单式一次性展示所有字段，收集完成后一起提交 |

#### 步骤 2.1 按 widget 类型选择交互方式

参考 `references/schema-guide.md` §3，widget 按交互形态分组处理：

- **文本输入类**（`input` / `DebounceInput` / `Password` / `TextArea` / `InputNumber`）：
  - 使用 `title` 作为字段名："请输入 **{title}**"
  - 使用 `description` 补充说明，`placeholder` 作为输入提示
  - 如有 `rules`，用 `rules[].message` 提前告知格式要求
  - 如有 `props.maxLength`，告知长度限制
  - `InputNumber` 需提示只能填数字

- **选择类**（`radio` / `select` / `checkboxes`）：
  - 列出 `enums` 中的选项：`key` 为展示名，`value` 为实际值
  - 如选项有 `extra` 说明，附带展示
  - `radio` / `select` 为单选，`checkboxes` 为多选（值为数组）
  - 选项 <= 4 个时，优先使用结构化选择交互（如弹窗选项）
  - 选项 > 4 个时，列出编号列表，用户回复编号或名称

- **截图/图片类**（`webSiteShotV2` / `ImageUpload` / `ImageUploadV2`）：
  - `webSiteShotV2` 是**已支持**的截图组件，正常收集，**不走 V1 兜底**
  - 请用户提供图片 URL（picUrl）
  - 如字段 `type=array` + 有 `enums`：按 enums 顺序逐项收集，用 `enums[].key` 说明每项含义（详见 `schema-guide.md §6.1`）
  - LLM 必须按 enums 定义的顺序组装数组，未提供的位置用 `{"picUrl": ""}` 占位
  - 传入脚本时将完整数组作为 JSON 值传入

  **示例**：schema 中 screenshot 有 3 个 enums `[首页截图, 商品或服务页截图, 支付页面截图]`

  交互：
  ```
  请提供以下 3 张网站截图的 URL：
  1. 首页截图
  2. 商品或服务页截图
  3. 支付页面截图
  ```

  用户回复后，按 enums 顺序组装传入脚本：
  ```bash
  python3 scripts/build_preview_request.py 'webSiteInfo.screenshot=[{"picUrl":"https://首页.png"},{"picUrl":"https://商品页.png"},{"picUrl":"https://支付页.png"}]'
  ```

- **待定 widget**（`ackInputV2`）：
  - V1 兜底：告知用户"此项（{title}）暂不支持在当前环境中操作，请前往支付宝商家中心完成"
  - 跳过该字段继续收集其他字段

- **仅展示类**（`frontProtocol` / `customPrice` / `criticalFrontAttr`）：
  - 收集阶段跳过，确认汇总时展示

#### 步骤 2.5：prefill 候选映射

如配置了 prefillFile（通过 `ar-sign config --show` 查看路径），在向用户收集字段前：

1. **读取 prefill JSON 文件**（用 Read 工具），解析失败则静默跳过，不影响流程
2. **去重**：检查 `~/.alipay/ar/tmp/prefill_result.json`（如存在），已出现在 `applied`/`pending`/`skipped` 中的 key **跳过**，不再重复处理
3. **对当前区块的待收集字段**，在 prefill 数据中查找对应值（排除已处理的 key），生成候选映射并**按置信度分级**（LLM 判断是初筛，最终以脚本路径校验和后端校验为准）：

   | 置信度 | 条件（必须同时满足） | 处理 |
   |---|---|---|
   | **高** | ① key 为标准 `blockId.fieldName` 路径 ② **当前 schema 中存在该字段** ③ LLM 初筛 value 类型与 schema type 一致 | 允许尝试自动写入，传给 build_preview_request.py |
   | **中** | key 为中文名/缩写，LLM 推理出对应字段但不完全确定 | **展示给用户确认**后再填入 |
   | **低** | key 无法对应到当前 schema 中任何字段，或 value 类型明显不匹配 | 跳过，不填入 |

4. **mccCode 特殊处理**：⛔ **禁止 LLM 自行生成 mccCode。** prefill 值必须是明确的编码格式（`Axxxx_Bxxxx`）才允许传入。若 prefill 给的是中文类目名（如"零售-超市"）或模糊描述，**禁止 LLM 将其转换为 mccCode**——必须走 mcc-recommend Skill 推荐或让用户提供明确编码。mccCode 通常在 init 阶段（§4 步骤 2）通过 `--mcc` 参数处理，如 init 阶段已处理则此处无需重复。详见 SKILL.md §3.1「mccCode 来源与校验规则」
5. **枚举/类目字段**：禁止仅凭 LLM 猜测，必须对照 schema enums 校验或使用对应推荐能力（如 mcc-recommend）
6. **结果处理**：
   - **全部高置信度命中** → 跳过用户交互，将值作为 CLI 参数传入 `build_preview_request.py`，直接调 previewFormView（进入步骤 4）
   - **部分命中（含中置信度）** → 高置信度值自动写入，中置信度值展示给用户确认，仅向用户收集未命中字段
   - **无命中** → 按常规流程向用户询问
7. **更新 prefill 初筛摘要**（追加写入文件 + 向用户展示，不覆盖已有记录）：
   > ⚠️ **初筛摘要 ≠ 最终写入结果。** "已尝试填入"仅表示 LLM 初筛通过并已传入脚本，脚本或后端仍可能拒绝。最终以 previewFormView 返回的 artisanPage 为准。

   - 写入 `~/.alipay/ar/tmp/prefill_result.json`（路径通过 `config_utils.get_prefill_result_path()` 获取，与其他临时文件统一管理，`ar-sign clean` 时自动删除）：
   ```json
   {
     "applied": [{"key": "<blockId.fieldName>", "value": "<value>"}],
     "pending": [{"key": "<原始 key>", "mappedKey": "<blockId.fieldName>", "value": "<value>"}],
     "skipped": [{"key": "<原始 key>", "reason": "<原因>"}]
   }
   ```
   - 同时向用户展示可读摘要：
   ```
   prefill 初筛结果（最终以后端校验为准）：
     ✅ 已尝试填入：<blockId.fieldName>=<value>, ...
     ❓ 待确认：<原始 key> → <blockId.fieldName>=<value>
     ⏭️ 已跳过：<原始 key>, ...
   ```

> ⛔ **禁止低置信度映射静默写入。** 高置信度 ≠ 正确，自动写入失败（脚本报 PATH_NOT_FOUND 或后端报 checkedError）时，降级为向用户收集。prefill 值不直接写入 ar-sign-data.json，而是作为 build_preview_request.py 的 CLI 参数传入，经 previewFormView 后端校验后由接口返回的新 artisanPage 写入。
>
> ⛔ **禁止对同一 prefill key 重复处理。** 每个 key 只初筛一次，结果记录在 prefill_result.json 中。后续 previewFormView 循环中遇到同一 key 时，从 prefill_result.json 读取状态直接跳过，不重新匹配、不重新写入脚本。

> **⚠️ prefill 仅作用于 previewFormView 收集阶段。apply 必须基于 ar-sign-data.json 数据，不读取 prefill 文件。**

#### 步骤 3：接收用户输入

用户提供值后：

1. 将用户提供的值 merge 到对应 values 路径
   - 路径规则：`values.<blockId>.<fieldName>`
   - 对嵌套字段（type=object），merge 到对应子路径
2. LLM 字段匹配：当用户一次输入多个值时，**仅在以下范围内匹配**，禁止跨区块猜测或凭空生成字段：
   - **优先**：当前区块待收集字段集合
   - **其次**：已采集的字段集合（用于用户修改已填值）
   - ⛔ **禁止**：匹配其他区块的未展示字段、凭空生成 schema 中不存在的字段

#### 步骤 4：调用 previewFormView

> ⛔ **请求 JSON 必须由脚本生成，禁止自行组装。** 用 `build_preview_request.py` 生成文件，用 `$(cat file.json)` 传入 CLI。

每收集完一个区块，调用 `ar-sign.previewFormView`（使用 `references/mcp-guide.md §2.4` 环境配置）：

1. **组装 pageData**：**严格按 §2.3 pageData 组装规则执行**，通过 `python3 scripts/build_preview_request.py [field=value...] -o ~/.alipay/ar/tmp/preview_request.json` 生成
2. **调用 MCP**：`alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null > ~/.alipay/ar/tmp/preview_response.json`
3. **存储返回**：`python3 scripts/save_preview_response.py -r ~/.alipay/ar/tmp/preview_response.json`，用后端返回的新 artisanPage **完整替换** `~/.alipay/ar/ar-sign-data.json`（非增量合并）。salesCodes 自动从 `preview_request.json` 或已有 `ar-sign-data.json` 中获取，无需手动传入 `-s`
4. **重新分析 schema**：**必须从新返回的 schema 重新判断字段列表**，禁止沿用上一轮的字段判断。后端会根据用户填写的值联动更新 schema（如新增/移除字段、改变 required 状态），旧 schema 的字段列表可能已失效
5. **更新 checklist 状态**

> **⚠️ 再次强调：pageData 必须包含所有业务区块的完整 values（脚本自动跳过 basicArInfo、editPriceInfo 等后端自处理区块），不能只传变更的区块。后端依赖全量 pageData 做联动计算，缺区块会导致系统异常。**

> **⚠️ 联动规则：每次 previewFormView 返回后，字段可能发生以下变化，必须以最新 schema 为准：**
> - 某些字段从 schema 中**消失**（不再需要收集）
> - 某些字段**新增**到 schema 中（需要新收集）
> - 某些字段的 `required`/`hidden`/`disabled` 状态**改变**

#### 步骤 5：处理返回

按优先级处理后端返回：

| 优先级 | 条件 | 处理 |
|---|---|---|
| 最高 | 后端返回 errorCode | 展示 errorMessage 给用户，如有 bizTips 一并展示 |
| 次高 | 后端返回 checkedError | 提取校验错误，引导用户修正对应字段 |
| 次高 | artisanPage 中某区块 `status != "OK"` | 提示该区块异常，展示异常信息 |
| 正常 | **当前区块**出现新增 required 字段（之前 schema 中不存在） | 继续收集当前区块的新字段（回到步骤 1，不切换区块） |
| 正常 | 仍有 required 字段无值 | 继续收集下一个区块（回到步骤 1） |
| 完成 | 所有 required 字段均已有值，无阻断错误 | 进入确认汇总 |

## 6. 确认汇总阶段

### 触发条件

所有 required 字段均已有 values，且无阻断错误。

### 汇总生成规则

> ⛔ **确认汇总中展示的所有数据必须来自 ar-sign-data.json（由 save_preview_response.py 写入）。** 禁止从对话记忆、LLM 知识或其他来源补充任何字段或值。

1. 按 `structure.children` 顺序遍历**所有**区块（包括收集阶段隐藏的价格和协议）
2. 对每个区块提取 `basic.title` + 字段 label/value 对
3. label 取字段 `title`，value 取 `values` 中的对应值
4. **合约价格展示**：
   - 从 `editPriceInfo.data.values.priceInquiryInfo.pricingInfo[0].priceDesc` 获取完整价格描述
   - **必须展示 priceDesc 全文**，包含费率值、有效期、到期后政策、参考链接等关键信息，用户需要完整知悉
   - ❌ **禁止截断** — 不可用 `.split('\n')[0]`、取首行、取摘要等方式截取部分内容
   - ❌ **禁止只提取费率数字** — 如不可只展示 "0.6%"，必须展示完整 priceDesc
   - ❌ **禁止重新组织或改写 priceDesc 内容** — 原文展示，保留换行和链接
5. **敏感信息脱敏**：
   - 手机号：中间 4 位用 `*` 替代（如 `138****0000`）
   - 邮箱：`@` 前仅保留首尾字符（如 `z***g@example.com`）
6. **待定 widget 标注**：V1 兜底跳过的字段标注为"待线上补充"

### 确认汇总输出格式

```json
{
  "status": "ready_to_apply",
  "productName": "电脑网站支付",
  "summary": [
    {
      "title": "经营信息",
      "items": [
        { "label": "经营类目", "value": "零售-超市/便利店" }
      ]
    },
    {
      "title": "网站信息",
      "items": [
        { "label": "网站名称", "value": "我的商城" },
        { "label": "网站地址", "value": "https://example.com" }
      ]
    },
    {
      "title": "合约价格",
      "items": [
        { "label": "费率详情", "value": "服务费依据交易金额*相应费率，按标准单笔计费计算...\n当交易场景为电脑网站，具体费率值为：0.6%。\n当前费率有效期至2027-03-31 23:59:59，到期后若无其他费率政策，则按照标准服务费率计费收取..." }
      ]
    },
    {
      "title": "协议",
      "items": [
        { "label": "支付宝支付服务合同", "value": "已确认" }
      ]
    }
  ],
  "pendingFields": [
    { "label": "店铺门头照", "reason": "待线上补充" }
  ],
  "artisanPageData": { "...完整 artisanPage 数据（含填写后的 values），供 apply 使用..." }
}
```

## 7. 确认后处理

| 用户反馈 | 处理方式 |
|---|---|
| 确认无误 | 签约 Skill 收到确认信号，主动调用 apply 子 Skill，传入 artisanPageData |
| 修改普通字段（资质、联系人等） | 回到收集循环，按 §2.3 pageData 组装规则从文件读取完整 values，增量覆盖对应字段，重新调用 previewFormView |
| 修改 MCC 类目或更换产品 | 清理整个 `~/.alipay/ar/` 目录，重新从初始化开始 |

## 8. 收集进行中输出格式

收集过程中，每轮输出：

```json
{
  "status": "collecting",
  "productName": "电脑网站支付",
  "checklist": [
    { "title": "经营信息", "state": "completed" },
    { "title": "店铺信息", "state": "in_progress" },
    { "title": "联系人", "state": "pending" },
    { "title": "其他信息", "state": "pending" }
  ],
  "currentStep": {
    "title": "店铺信息",
    "mode": "form",
    "fields": [
      { "name": "shopName", "label": "店铺名称", "widget": "input", "required": true, "value": null },
      { "name": "shopPhoto", "label": "店铺门头照", "widget": "ImageUploadV2", "required": true, "value": null },
      { "name": "shopAddress", "label": "店铺地址", "widget": "input", "required": true, "value": null }
    ]
  }
}
```
