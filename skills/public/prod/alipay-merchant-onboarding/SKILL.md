---
name: alipay-merchant-onboarding
description: 支付宝商家入驻流程编排。触发条件：用户说"我要入驻"、"我要签约"、"申请成为商家"、"支付宝商家入驻"、"支付宝商家签约"、"支付商家开通"、"开始上线"、"商家申请"、"商户入驻"、"我要创建应用"、"创建应用"、"发布应用"、"应用创建"、"应用发布"。支持个人开发者入驻，覆盖产品推荐、类目选择、资料采集、产品签约、应用创建全流程。使用 alipay-cli 真实 CLI 工具。
---

# 支付宝商家入驻 Skill

个人开发者支付宝商家入驻一站式解决方案。

---

## 📋 使用声明

**使用本 skill 即表示同意：**

1. 使用本服务需遵守法律法规、自行审核测试并承担使用责任，我方不对使用效果、正确性担保；
2. 基于支付安全风控需要，我方需收集日志文件、环境信息等；
3. 禁止在代码、大模型对话等公网透露敏感信息（密码、API Keys、私钥等）。

---

## ⚠️ 全局规范

### ⛔ 用户项目文件修改铁律（最高优先级）

**禁止直接修改用户项目中的 TypeScript 文件，特别是配置文件。**

```
❌ 禁止：直接修改用户项目中的 .ts / .tsx / .js 文件
❌ 禁止：修改 alipay-sdk-config.ts 或类似的支付配置文件
❌ 禁止：修改任何 src/ 目录下的业务代码

✅ 正确：输出配置内容让用户自行复制
✅ 正确：告知用户需要修改的文件路径和具体内容
✅ 正确：提供配置示例，由用户手动集成
```

> **核心原则：只输出配置信息，不触碰用户代码文件。**

---

### ⛔ 应用公钥管理铁律（最高优先级）

**应用公钥相关的所有操作必须严格遵守以下规则，适用于 application-publish 子技能及任何涉及公钥的场景。**

> **核心原则：公钥由用户自行生成，skill 只负责接收和配置，不生成、不推断、不改写、不透出生成逻辑。**

#### 1. 禁止行为（强制执行）

```
❌ 禁止：自动为用户生成公钥或密钥对
❌ 禁止：向用户表示可以"帮助生成公钥"、"帮助生成密钥对"、"我来生成应用公私钥"
❌ 禁止：提供任何密钥生成代码、命令或脚本（如 openssl、ssh-keygen 等）
❌ 禁止：请求、接收或处理用户的私钥信息
❌ 禁止：向用户透出公钥生成逻辑或内部处理细节
❌ 禁止：在用户未明确提供 publicKey 时调用 createKeyConfirmPage
❌ 禁止：自动生成、推断、补全、改写或添加前后缀到 publicKey
❌ 禁止：输出 "Step 1"、"Step 2"、"步骤1"、"步骤2" 等步骤编号标记
❌ 禁止：输出 "正在执行 Step 3..."、"进入 Step 4..." 等带步骤号的进度提示
❌ 禁止：输出 "Branch A"、"Branch B"、"Branch C"、"分支 A"、"分支 B"、"分支 C" 等步骤编号标记
❌ 禁止：在用户可见的任何位置展示内部流程步骤编号
```

#### 2. 必须行为（强制执行）

```
✅ 必须：使用 write_todos 进行支付宝商家入驻流程
✅ 必须：引导用户前往支付宝开放平台官方密钥生成工具
✅ 必须：使用标准引导话术（见下方）
✅ 必须：只接受用户明确输入的完整 publicKey
✅ 必须：提醒用户妥善保管私钥，切勿泄露给任何人
✅ 必须：publicKey 相关提示必须包含安全提醒
```

#### 3. 标准引导话术

**设置应用公钥时，必须使用以下标准话术引导用户：**

```
请前往支付宝开放平台密钥生成工具（https://opendocs.alipay.com/common/02kipk）下载并使用官方工具生成应用公私钥对，生成后将应用公钥提供给我继续后续流程。

⚠️ 私钥请妥善保管，切勿泄露给任何人。
```

#### 4. 密钥安全规范

| 规范项 | 要求 |
|--------|------|
| 公钥来源 | 用户自行生成，skill 只接收用户明确提供的 publicKey |
| 私钥处理 | 严禁接收、存储、记录或传输私钥 |
| 密钥生成工具 | 仅引导用户使用支付宝官方工具（https://opendocs.alipay.com/common/02kipk） |
| signType 默认值 | RSA2 |

#### 5. 子技能调用传递

**当主技能调用 application-publish 子技能时，公钥管理规则同样适用：**

- 子技能 Read 文件方式调用时，公钥规则自动继承
- 子技能文档中的公钥规则已被本铁律覆盖，以本铁律为准
- 任何涉及 `createKeyConfirmPage` 的调用，必须先确保用户已自行生成公钥

> **本节铁律适用于所有涉及应用公钥的操作场景，子技能文档中的相关规则引用本节，不另行定义。**

---

### ⛔ alipay-cli MCP 调用铁律（最高优先级）

**所有 alipay-cli mcp call 命令必须严格按照技能文档中定义的参数名、参数结构、参数数量执行，一字不改。模型不得自行发挥、不得脑补、不得简化。**

> **核心原则：照着文档抄，不要自己编。文档没写的参数不加，文档写了的参数不减。**
> **详细规范、违反 vs 正确对照、完整禁止清单见：** `references/mcp-methods.md`

```
✅ 必须：严格按照技能文档中的调用示例和参数结构执行，一字不改
✅ 必须：JSON 嵌套结构与文档定义完全一致（包括 request / ctx 包裹层级）
✅ 必须：MCP 返回结果无需完整呈现给用户，提取关键信息即可，但流程逻辑必须完整执行

❌ 禁止：自行推断或猜测参数名、省略文档定义的参数、添加未定义的参数
❌ 禁止：修改参数结构、缩写参数名、修改参数类型
❌ 禁止：alipay-cli mcp list、调用未列出的方法、绕过子 Skill 直接调用
❌ 禁止：因返回结果过长而跳过处理步骤、自行虚拟未定义的 MCP 方法
❌ 禁止：使用后端 Facade 类名作为 MCP 调用的 server 名（如 McpArQueryFacade → 必须用 ar-query）
```

#### MCP 方法路由（谁调什么）

**主技能可直接调用：**

| 类型 | 命令 | 用途 |
|------|------|------|
| CLI 子命令 | `alipay-cli file upload <FILE_PATH> -s payMerchantcodeSkill` | 文件上传（用于资料采集） |
| ar-sign CLI | `./ar-sign-skill/ar-sign apply --data '<json>'` | 直接提交签约申请（跳过 previewFormView） |

**签约查询与产品推荐委托 ar-sign-skill 子技能（Read 文件方式）：**

| 委托场景 | 子技能文档 | 说明 |
|----------|------------|------|
| 产品推荐 | `ar-sign-skill/references/recommend-product.md` | 根据用户场景推荐签约产品 |
| 签约状态查询 | `ar-sign-skill/references/query-ar.md` | 查询合约/订单签约状态 |

**其他 MCP 方法必须转发到对应子技能，主技能禁止直接调用：**

| 路由目标 | MCP Server | 方法名 | 用途 |
|----------|------------|--------|------|
| **→ application-publish** | `apprelease` | `queryApplicationList` | 查询应用列表 |
| **→ application-publish** | `apprelease` | `createApplication` | 创建应用 |
| **→ application-publish** | `apprelease` | `queryApplicationInfo` | 查询应用信息 |
| **→ application-publish** | `apprelease` | `queryApplicationDetail` | 查询应用详情 |
| **→ application-publish** | `apprelease` | `createKeyConfirmPage` | 创建密钥确认页 |
| **→ application-publish** | `apprelease` | `queryApplicationSecurityKey` | 查询应用安全密钥 |
| **→ application-publish** | `apprelease` | `submitApplicationAudit` | 提交应用审核 |
| **→ service-market** | `a2a-pay-service` | `discoverBazaarServicesForMcp` | 查询已注册服务 |
| **→ service-market** | `a2a-pay-service` | `saveBazaarServiceForMcp` | 提交服务注册 |

#### ⛔ MCP Server 名 vs Facade 类名（严禁混淆）

**alipay-cli mcp call 使用 `<server>.<tool>` 格式。子技能文档中出现的 Facade 类名是后端内部标识，绝不能作为 CLI 的 server 名。**

已反复出错，必须牢记以下映射：

| ❌ 错误（Facade 类名，会返回 Server not found） | ✅ 正确（Server.Tool 格式） |
|---|---|
| `McpArQueryFacade.queryArInfosBySalesProd` | **`ar-query.queryArInfosBySalesProd`** |
| `McpArQueryFacade.queryArInfosByBackProd` | **`ar-query.queryArInfosByBackProd`** |
| `McpArOrderQueryFacade.queryBizOrder` | **`ar-order-query.queryBizOrder`** |
| `McpArOrderQueryFacade.queryBizOrdersByAccount` | **`ar-order-query.queryBizOrdersByAccount`** |

**规则：看到 `McpXxxFacade.methodName` → 替换为 `server-name.methodName`（server 名取 Facade 类名前的 `Mcp` 到 `Facade` 之间的部分，转为小写短横线格式）。**

```
❌ alipay-cli mcp call McpArQueryFacade.queryArInfosBySalesProd -d '...' --json 2>/dev/null
   → 报错 "Server not found" 或 HTTP 400

✅ alipay-cli mcp call ar-query.queryArInfosBySalesProd -d '{"request":{"salesProductCodes":["${SALES_CODE}"]},"ctx":{}}' 2>/dev/null
   → 正常返回签约状态
```

**⚠️ 子技能文档（如 query-ar.md、mcp-guide.md）中的 "MCP 映射" 列可能标注 Facade 类名，这仅用于内部对照，实际 CLI 调用时必须使用上表右侧的 `server.tool` 格式。**

---

## ⛔ 应用相关 MCP 调用铁律（最高优先级）

**应用相关 MCP 调用必须严格遵守 application-publish 子技能的定义，禁止受签约流程上下文影响。**

> **核心原则：不同 MCP 调用有不同的参数结构，禁止混用！**
> **详细规范见：** `references/mcp-methods.md` → 应用相关 MCP 调用铁律

#### 1. 应用查询正确格式

```bash
# ✅ 正确：应用查询标准格式
alipay-cli mcp call apprelease.queryApplicationList \
  -d '{"request":{"appTypes":["WEBAPP"]}}' \
  --json 2>/dev/null

# ❌ 错误：受签约上下文影响添加 ctx 参数（应用 MCP 调用不需要 ctx）
alipay-cli mcp call apprelease.queryApplicationList \
  -d '{"request":{"appTypes":["WEBAPP"]},"ctx":{}}' \
  --json 2>/dev/null

# ❌ 错误：受签约查询上下文影响使用错误参数
alipay-cli mcp call apprelease.queryApplicationList \
  -d '{"request":{"salesProductCodes":["I1080300001000041203"]}}' \
  --json 2>/dev/null

# ❌ 错误：省略 request 包裹层
alipay-cli mcp call apprelease.queryApplicationList \
  -d '{"appTypes":["WEBAPP"]}' \
  --json 2>/dev/null
```

#### 2. 不同 MCP 调用的参数结构差异

| MCP 调用类型 | 参数结构 | ctx 参数 |
|--------------|----------|----------|
| ar-sign / ar-query | `{"request":{...},"ctx":{}}` | ✅ **必须包含** |
| apprelease | `{"request":{...}}` | ❌ **不需要** |

```
⚠️ 重要区别：
  - ar-sign 签约相关 MCP 调用：需要 ctx 参数
  - apprelease 应用相关 MCP 调用：不需要 ctx 参数

  禁止在 apprelease 调用中添加 ctx 参数！
  禁止在 apprelease 查询中使用 salesProductCodes 参数！
```

#### 3. 应用相关 MCP 调用参数对照表

| 方法 | 必需参数 | 正确参数结构 |
|------|----------|--------------|
| `queryApplicationList` | `appTypes` | `{"request":{"appTypes":["WEBAPP"]}}` |
| `createApplication` | `applicationType`, `createScene` | `{"request":{"applicationType":"WEBAPP","createScene":"cli"}}` |
| `queryApplicationInfo` | `appId` | `{"request":{"appId":"..."}}` |
| `queryApplicationDetail` | `appId` | `{"request":{"appId":"..."}}` |
| `createKeyConfirmPage` | `appId`, `signType`, `publicKey` | `{"request":{"appId":"...","signType":"RSA2","publicKey":"..."}}` |
| `queryApplicationSecurityKey` | `appId` | `{"request":{"appId":"..."}}` |
| `submitApplicationAudit` | `appId` | `{"request":{"appId":"..."}}` |

> **完整参数定义和调用示例见：** `application-publish/references/cli-command-templates.md` 和 `application-publish/references/contracts.md`

#### 4. 禁止行为

```
❌ 在 apprelease 调用中添加 ctx 参数（受 ar-sign 签约上下文影响）
❌ 在 apprelease 查询中使用 salesProductCodes 参数（受签约查询上下文影响）
❌ 在 apprelease 调用中省略 request 包裹层
❌ 在 apprelease 调用中使用错误的参数名（如 appType 而非 appTypes）
❌ 在 apprelease 调用中传递文档未定义的额外字段
❌ 受之前 MCP 调用的参数结构影响而混用参数格式
```

---

## ⛔ 登录授权链接铁律（最高优先级）

**授权链接必须由 skill 按照本文档规定的格式自行构造，严禁使用 CLI login 返回的 verification_url。**

> **核心原则：授权链接自己构造，不要用 CLI 出参的 verification_url。**

#### 1. 授权链接构造规范

```
✅ 必须：按以下格式自行构造授权链接

BROWSER_URL="https://aipay.alipay.com/cli-auth?deviceCode=${DEVICE_CODE}&productCode=${SALES_CODE}&mccCode=${MCC_CODE}"

参数来源：
  - deviceCode  ← 从 login 返回的 device_code 字段获取
  - productCode ← 当前入驻的产品码（salesCode）
  - mccCode     ← 当前选择的经营类目编码

❌ 禁止：使用 CLI login 返回的 verification_url 字段
❌ 禁止：将 verification_url 透出给用户
❌ 禁止：拼造或猜测授权链接格式
❌ 禁止：省略授权链接中的任何参数
❌ 禁止：修改授权链接的域名或路径
```

#### ⛔ 重新授权三参数铁律（最高优先级）

**无论是首次授权还是重新授权，构造授权链接时必须带上 deviceCode、productCode、mccCode 三个参数，缺一不可！**

> **核心原则：三参数合一，缺一即失败。重新授权时尤其注意 mccCode 不可丢失！**

```
✅ 必须：首次授权时带上三个参数
✅ 必须：重新授权时带上三个参数
✅ 必须：登录过期重新授权时带上三个参数
✅ 必须：Scope 不足重新授权时带上三个参数
✅ 必须：授权信息不匹配重新授权时带上三个参数

❌ 禁止：重新授权时省略任何参数
❌ 禁止：认为重新授权只需要 deviceCode
❌ 禁止：认为 productCode/mccCode 在重新授权时可选
❌ 禁止：重新授权时遗漏 mccCode（mccCode 是运行时变量，需从上下文获取不会自动保留）
```

**重新授权场景参数来源：**

| 场景 | deviceCode 来源 | productCode 来源 | mccCode 来源 |
|------|-----------------|------------------|--------------|
| 首次授权 | login 返回的 device_code | Step 2 方案规划确认的 salesCode | Step 2 MCC 推荐的类目编码 |
| 登录过期重新授权 | 新 login 返回的 device_code | 状态文件 salesCode 字段 | 运行时上下文变量（需确保传递） |
| Scope 不足重新授权 | 新 login 返回的 device_code | 状态文件 salesCode 字段 | 运行时上下文变量（需确保传递） |
| 授权信息不匹配重新授权 | 新 login 返回的 device_code | 状态文件 salesCode 字段 | 运行时上下文变量（需确保传递） |

**⚠️ 模型执行铁律：**

```
执行重新授权时，模型必须：
  1. 执行新 login 命令获取新的 deviceCode
  2. 从状态文件读取 salesCode 作为 productCode
  3. 从上文运行时变量获取 mccCode（如 mccCode 已丢失，需重新询问用户类目）
  4. 校验三个参数均有值后，构造授权链接
  5. 输出授权信息给用户

参数校验（必须执行）：
  if [ -z "$DEVICE_CODE" ] || [ -z "$SALES_CODE" ] || [ -z "$MCC_CODE" ]; then
    echo "❌ 授权链接参数不完整，无法生成授权链接"
    exit 1
  fi
```

**禁止行为：**

```
❌ 禁止：在重新授权场景只使用 deviceCode 构造授权链接
❌ 禁止：假设 mccCode 会自动从状态文件恢复（mccCode 是运行时变量，不写状态文件）
❌ 禁止：在 mccCode 丢失时跳过参数校验直接生成链接
❌ 禁止：因"重新授权"而省略三参数中的任何一个
```

#### 2. login 返回值处理规范

```
从 login 返回中只提取以下字段，其余字段一律忽略：

✅ 必须提取：device_code       → 用于构造授权链接的 deviceCode 参数
✅ 必须提取：verification_code → 展示给用户的安全确认码
✅ 必须提取：expires_in       → 授权链接有效期（秒），禁止硬编码，必须从返回值解析
❌ 禁止使用：verification_url  → 此链接无法授权，严禁透出给用户
❌ 禁止使用：其他字段          → 忽略，不透出
```

> **login 返回解析脚本和授权信息输出格式见：** `references/authorization.md` → 授权信息展示规范

#### 3. 授权信息展示铁律（⛔ 必须严格遵守）

**向用户透出授权链接时，必须固定展示以下 4 项信息 + 授权链接 缺一不可：**

```
1. 产品类型（productName）
2. 经营类目（mccName + mccCode，合并为一行展示）
3. 确认码（verificationCode）+ 安全确认提示
4. 授权链接有效期（从 expires_in 解析，禁止硬编码）
5. 授权链接（Markdown 可点击格式：[点击跳转进行授权](BROWSER_URL)）

❌ 禁止：条件性隐藏任何字段、只展示链接不展示产品/类目/确认码
❌ 禁止：类目名称和编码分开两行展示、使用纯文本链接
❌ 禁止：自动轮询检查授权状态、循环调用 login --complete
❌ 禁止：未经用户确认直接执行登录命令、自行修改 scope 格式或值
❌ 禁止：不要提示用户在页面输入此确认码，不需要输入！！只需要核对

✅ 必须：使用 2>/dev/null 确保脚本不存在时不报错
```


> **完整输出格式模板和示例见：** `references/authorization.md` → 授权信息展示规范

#### 4. 总禁止清单

```
❌ 透出 CLI 返回的 verification_url（无法授权）
❌ 使用 verification_url 作为授权链接
❌ 拼造或猜测授权链接格式
❌ 省略授权链接参数（deviceCode、productCode、mccCode 缺一不可）
❌ 修改授权链接域名或路径
❌ 未经用户确认直接执行登录命令
❌ 自动轮询检查授权状态
❌ 循环调用 login --complete
❌ 自行修改 scope 格式或值
❌ 条件性隐藏授权信息字段（4 项必须全部展示）
❌ 只展示授权链接不展示产品/类目/确认码
❌ 将经营类目名称和编码分两行独立展示
❌ 使用纯文本链接（必须用 Markdown 可点击格式）
```

> **📄 授权完整流程、登录脚本、参数校验见：** `references/authorization.md`

---

## 子技能调用

> **⚠️ 重要：所有子技能均通过 Read 文件方式渐进式调用，不使用 Skill 工具。**
>
> 原因：Skill 工具调用子技能会报错 `Unknown skill: claude-code-teams:alipay-merchant-onboarding/xxx`

### 子技能清单

| 子技能 | 触发时机 | 功能 | 调用方式 |
|--------|----------|------|----------|
| `ar-sign-skill` | 方案规划 + 签约阶段 | 产品推荐、签约状态查询、签约提交（`./ar-sign-skill/ar-sign apply`） | **Read 文件** + **CLI 直调** |
| `mcc-recommender` | 方案规划阶段 | 推荐经营类目（最多 3 个） | **Read 文件** |
| `service-market` | 并行流程（服务注册分支，仅智能收） | 服务注册 | **Read 文件** |
| `application-publish` | 并行流程（应用创建分支） | 应用创建与密钥配置 | **Read 文件** |

### ⚠️ 统一调用方式（Read 文件）

**所有子技能都通过 Read 工具渐进式调用：**

```markdown
# 调用 mcc-recommender
Read tool call:
  file_path: "mcc-recommender/SKILL.md"

# 调用 ar-sign-skill
Read tool call:
  file_path: "ar-sign-skill/SKILL.md"

# 调用 application-publish
Read tool call:
  file_path: "application-publish/SKILL.md"

# 调用 service-market
Read tool call:
  file_path: "service-market/SKILL.md"
```

### 调用原则

1. **渐进式读取**：先读取子技能的 SKILL.md，根据需要再读取 references/ 目录下的详细文档
2. **按需深入**：不要一次性读取所有参考文档，根据当前步骤逐步读取
3. **MCP 调用封装**：所有 MCP 调用逻辑封装在子技能文档中，读取后按照文档指引执行

> **详细说明见：** `references/subskills.md`

---

## ⛔ 任务管理规范（最高优先级）

**入驻流程必须使用 TaskCreate/TaskUpdate/TaskList 进行任务管理，确保流程可追踪、可断点续传。**

### 任务清单

| ID | 任务名称 | 说明 |
|----|----------|------|
| 1 | 凭证检查与入口询问 | 检测支付宝凭证，确定流程入口 |
| 2 | CLI 前置检查 | 检测并安装 alipay-cli |
| 3 | 方案规划 | 产品推荐 + MCC 推荐 + 用户确认 |
| 4 | 登录授权 | whoami → scope校验 → login → 用户扫码 |
| 5 | 签约状态查询 | 查询是否已签约 |
| 6 | 资料采集 | 按产品类型采集资料（截图/服务信息） |
| 7 | 产品签约 | 提交签约申请（Branch A） |
| 8 | 服务注册 | 仅智能收产品（Branch B） |
| 9 | 应用创建与发布 | 创建应用、配置公钥、提审（Branch C） |
| 10 | 支付能力集成 | 调用 alipay-payment-production-integration |

### 执行规则

```
✅ 流程启动时：设置系统环境变量
   - PLATFORM_ID=$COZE_PROJECT_ID（从现有环境变量获取）
   - PLATFORM=COZE
✅ 流程开始时：使用 TaskCreate 创建上述 10 个任务（status: pending）
✅ 开始执行：使用 TaskUpdate 将当前任务状态设为 in_progress
✅ 执行完成：使用 TaskUpdate 将当前任务状态设为 completed
✅ 遇到阻塞：使用 TaskUpdate 标记当前任务状态，等待用户操作后继续
✅ 断点续传：使用 TaskList 查看待办任务，从第一个 pending/in_progress 任务继续
✅ 流程结束：使用 TaskList 展示所有任务完成状态

❌ 禁止：不创建任务直接执行
❌ 禁止：跳过任务创建步骤
❌ 禁止：任务状态不更新
```

### 任务依赖关系

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6
                                          ↓
                          ┌───────────────┼───────────────┐
                          ↓               ↓               ↓
                       Task 7          Task 8          Task 9
                      (签约)         (服务注册)      (应用创建)
                          └───────────────┴───────┬───────┘
                                                  ↓
                                              Task 10
                                            (支付能力集成)
```

- Task 7/8/9 可并行执行
- Task 8 仅智能收产品需要
- Task 10 等待 Task 9 完成后触发

---

## 执行流程

```
Step -1: 系统环境变量初始化（流程启动时执行）
    ├─ 设置 PLATFORM_ID=$COZE_PROJECT_ID（从现有环境变量获取）
    ├─ 设置 PLATFORM=COZE
    └─ 设置 PRODUCT=<产品类型>（在方案规划步骤确定后更新）
    ↓
Step 0: 凭证检查与入口询问（前置步骤）
    ├─ 执行凭证检测脚本 scripts/check_credential.py
    │   └─ 检测是否存在支付宝集成凭证（integration-alipay）
    ├─ ⛔ 分支 A：存在凭证
    │   ├─ 输出：✅ 检测到支付宝凭证已存在
    │   ├─ 提示：将为您调用 alipay-payment-production-integration 进行上线集成配置...
    │   └─ 调用 alipay-payment-production-integration skill → 流程结束
    └─ ⛔ 分支 B：不存在凭证
        ├─ 输出：❌ 未检测到支付宝凭证
        ├─ 询问用户：您是否想成为支付宝商家？请选择：
        │   ├─ 选项 1："我要入驻" → 成为支付宝商家，开始商家入驻流程
        │   ├─ 选项 2："我已经是商家" → 已完成商家入驻，进行上线集成配置
        │   └─ 选项 3："退出" → 结束流程
        ├─ 用户选择"我要入驻" → 进入 Step 1 CLI 前置检查
        ├─ 用户选择"我已经是商家" → 调用 alipay-payment-production-integration skill → 流程结束
        └─ 用户选择"退出" → 输出感谢语，流程结束
    ↓
Step 1: CLI 前置检查
    ├─ 检测 alipay-cli version
    └─ 不存在 → curl -fsSL https://opengw.alipay.com/alipaycli/install | bash
    ↓
Step 2: 初始化与断点检测
    ↓
Step 3: 方案规划（同一时间只签约1个产品）
    ├─ 3.0 智能推荐前置（优先路径：一次性推荐产品+MCC）
    │   ├─ 读取环境变量 COZE_PROJECT_TYPE
    │   ├─ 根据环境变量确定产品类型（智能收/电脑网站支付）
    │   ├─ 结合用户上下文推断经营类目（MCC）
    │   ├─ 一次性输出：产品类型 + 经营类目 + 推荐逻辑
    │   ├─ 询问用户"以上推荐是否符合您的业务？"
    │   │   ├─ 用户确认"符合" → 直接进入 3.3 保存方案（跳过3.1/3.2）
    │   │   └─ 用户否认"不符合" → 进入 3.1 产品推荐（降级路径）
    │   └─ 无环境变量 → 进入 3.1 产品推荐（降级路径）
    ├─ 3.1 产品推荐（降级路径，委托 ar-sign-skill/references/recommend-product.md）
    │   ├─ 询问用户："请简单描述一下您的业务内容"
    │   ├─ 根据用户描述和上下文信息 → 自动推荐最适合的产品
    │   ├─ ⛔ 后端限制：仅可实际操作 电脑网站支付 或 智能收
    │   └─ 展示推荐结果 + 产品说明 → 用户确认
    │       ├─ 认可推荐 → 进入 3.2 MCC 推荐
    │       └─ 不认可 → 请用户补充描述，重新推荐
    ├─ 3.2 MCC 推荐（降级路径，读取 mcc-recommender/SKILL.md）
    │   ├─ 根据用户业务描述匹配经营类目
    │   ├─ ⛔ 最多展示 3 个类目供用户选择（按匹配度排序）
    │   ├─ 输出编号表格让用户选择（1/2/3）
    │   └─ 用户选择后，MCC_CODE="${level1_code}_${level2_code}"
    └─ 3.3 保存方案
    ↓
Step 4: 登录授权（whoami → scope校验 → login → 输出授权链接 → 等待用户确认）
    ├─ whoami 检查登录状态
    ├─ ⛔ Scope 校验：根据当前产品计算所需 scope，比对已授权 scope
    │   ├─ scope 包含所需权限 → 继续
    │   └─ scope 缺失 → 计算完整 scope → 重新登录授权
    └─ 输出授权信息，等待用户确认
    ↓
Step 5: 授权后处理
    ├─ 查询签约状态（委托 ar-sign-skill/references/query-ar.md）
    │   ├─ SIGNED → 跳过签约，直接进入并行流程
    │   ├─ SIGNING → 跳过签约，直接进入并行流程
    │   └─ NOT_SIGNED → 进入签约流程
    ↓
Step 6: 资料采集（按产品类型，签约前完成）
    ├─ 电脑网站支付: 上传3张截图 → fileKey
    └─ 智能收: 收集5项服务注册入参 → service_market_data（状态文件）
    ↓
Step 7: 签约、服务注册、应用创建（多方并行，每分支先校验 scope）
    ├─ ⛔ Step 7 前置：Scope 校验
    │   ├─ Branch A 需要：电脑网站支付→fast_instant_trade_pay:write，智能收→machine_pay:write
    │   ├─ Branch B 需要：agmnt:write（仅智能收）
    │   ├─ Branch C 需要：app:all
    │   └─ scope 不足 → 重新授权（按场景计算完整 scope）
    ├─ Branch A: 产品签约 → 直接调用 ./ar-sign-skill/ar-sign apply --data '<json>'
    ├─ Branch B: 服务注册（转发 service-market 子技能，仅智能收产品）
    └─ Branch C: 应用创建（转发 application-publish 子技能）
    ↓
Step 7.5: 支付能力集成配置
    ├─ ⛔ 触发条件：Branch C 返回成功结果（含 appId、alipayPublicKeySaved）
    ├─ appId 从 application-publish 子技能返回结果中获取
    ├─ 调用 alipay-payment-production-integration skill，传入 appId
    └─ 该 skill 接管后续的支付能力集成流程
    ↓
Step 8: 流程结束
    ├─ 输出入驻结果(最终是否完成 根据每个环节的业务是否都完成 签约-审核通过 应用审核通过 服务市场审核通过等等)
    └─ 清理状态文件（备份后删除）
```

### Step 0: 凭证检查与入口询问（前置步骤）

**流程开始时执行凭证检查，根据检查结果决定后续路径。**

#### 执行凭证检测

执行脚本检查支付宝集成凭证是否存在：

```bash
python3 scripts/check_credential.py
```

**脚本返回值：**

| 返回值 | 含义 | 处理方式 |
|--------|------|----------|
| 0 | 存在凭证 | 直接调用 `alipay-payment-production-integration` skill |
| 1 | 不存在凭证 | 询问用户选择后续路径 |

#### 分支处理规范

**分支 A：存在支付宝凭证**

```
✅ 检测到支付宝凭证已存在

将为您调用 alipay-payment-production-integration 进行上线集成配置...
```

然后调用 `alipay-payment-production-integration` skill，当前入驻流程结束。

**分支 B：不存在支付宝凭证**

```
❌ 未检测到支付宝凭证

您是否想成为支付宝商家？请选择：

  1️⃣ 我要入驻 — 成为支付宝商家，开始商家入驻流程
  2️⃣ 我已经是商家 — 已完成商家入驻，进行上线集成配置
  3️⃣ 退出 — 结束对话

请输入选项编号（1/2/3）或直接描述您的需求。
```

| 用户输入 | 处理方式 |
|----------|----------|
| "1" / "我要入驻" / "是" / "继续" | 进入 Step 1 CLI 前置检查，开始商家入驻流程 |
| "2" / "我已经是商家" / "已有商家" | 调用 `alipay-payment-production-integration` skill → 流程结束 |
| "3" / "否" / "退出" / "取消" | 输出感谢语，流程结束 |

#### 执行逻辑（⛔ 必须严格遵守）

```
流程开始（用户触发入驻相关关键词）
    │
    ▼
Step -1: 设置系统环境变量
    ├─ PLATFORM_ID=$COZE_PROJECT_ID
    ├─ PLATFORM=COZE
    └─ PRODUCT=<产品类型>（在方案规划步骤确定后更新）
    │
    ▼
执行凭证检测脚本 scripts/check_credential.py
    │
    ├─ 返回值 = 0（存在凭证）──→ 输出提示语
    │                           └─ 调用 alipay-payment-production-integration skill
    │                              └─ 流程结束
    │
    └─ 返回值 = 1（不存在凭证）──→ 输出询问话术，等待用户选择
                                   │
                                   ├─ 用户选择"我要入驻" ──→ 进入 Step 1 CLI 前置检查
                                   │
                                   ├─ 用户选择"我已经是商家" ──→ 调用 alipay-payment-production-integration skill
                                   │                              └─ 流程结束
                                   │
                                   └─ 用户选择"退出" ──→ 输出感谢语
                                                        └─ 流程结束
```

#### 禁止行为

```
❌ 禁止：跳过凭证检查直接进入 CLI 前置检查
❌ 禁止：用户选择"退出"后强制继续流程
❌ 禁止：存在凭证时不调用 alipay-payment-production-integration skill
❌ 禁止：不输出提示语直接跳转
❌ 禁止：不存在凭证时不提供三个选项
❌ 禁止：用户选择"我已经是商家"后不调用 alipay-payment-production-integration skill
```

---

### Step 3: 方案规划（优先推荐 + 降级澄清）

**方案规划采用"智能推荐优先，用户确认下降级"的策略。优先根据环境变量和上下文直接推荐，用户确认后直接使用；用户否认或无环境变量时，降级到原有澄清流程。**

#### 3.0 智能推荐前置（优先路径）

**核心思想：读取环境变量 `COZE_PROJECT_TYPE`，结合用户上下文一次性推荐产品类型 + 经营类目，用户确认后跳过所有澄清流程。**

##### 执行流程

```
Step 3.0 智能推荐前置
    │
    ├─ 读取环境变量 COZE_PROJECT_TYPE
    │   │
    │   ├─ 环境变量存在
    │   │   │
    │   │   ├─ 根据 COZE_PROJECT_TYPE 确定产品类型
    │   │   │   • ai_agent / 智能体 / AI服务 → 智能收
    │   │   │   • webapp / general_web / 网站 / 网页 → 电脑网站支付
    │   │   │   • ecommerce / 电商 → 电脑网站支付
    │   │   │   • saas / 软件服务 → 智能收
    │   │   │   • api_service / API服务 → 智能收
    │   │   │   • retail / 零售 → 电脑网站支付
    │   │   │
    │   │   ├─ 结合用户上下文推断经营类目（MCC）
    │   │   │   • 分析用户对话历史、项目描述、业务场景
    │   │   │   • 匹配最适合的经营类目（一级类目 > 二级类目）
    │   │   │   • 输出 MCC_CODE 格式：Axxxx_Bxxxx
    │   │   │
    │   │   ├─ 输出智能推荐结果（产品 + 经营类目 + 推荐逻辑）
    │   │   │
    │   │   └─ 询问用户："以上推荐是否符合您的业务？"
    │   │       │
    │   │       ├─ 用户确认"符合"/"是的"/"对" → 进入 Step 3.3 保存方案
    │   │       │
    │   │       └─ 用户否认"不符合"/"不对"/"不是" → 进入 Step 3.1 产品推荐（降级）
    │   │
    │   └─ 环境变量不存在或值不匹配 → 进入 Step 3.1 产品推荐（降级）
```

##### 产品类型映射规则

| COZE_PROJECT_TYPE | 推荐产品 | salesCode | Scope |
|-------------------|----------|-----------|-------|
| `ai_agent` / `智能体` / `AI服务` | 智能收 | I1080300001000160457 | `app:all,machine_pay:write,agmnt:write` |
| `webapp` / `general_web` / `网站` / `网页` | 电脑网站支付 | I1080300001000041203 | `app:all,fast_instant_trade_pay:write` |
| `ecommerce` / `电商` | 电脑网站支付 | I1080300001000041203 | `app:all,fast_instant_trade_pay:write` |
| `saas` / `软件服务` | 智能收 | I1080300001000160457 | `app:all,machine_pay:write,agmnt:write` |
| `api_service` / `API服务` | 智能收 | I1080300001000160457 | `app:all,machine_pay:write,agmnt:write` |
| `retail` / `零售` | 电脑网站支付 | I1080300001000041203 | `app:all,fast_instant_trade_pay:write` |

##### MCC 推断规则（结合用户上下文）

**推断优先级：**

1. **项目类型 + 业务场景关键词匹配**
   - 从用户对话历史中提取业务场景关键词
   - 结合项目类型推断最适合的经营类目

2. **常见场景 MCC 映射：**

| 业务场景关键词 | 一级类目 | 二级类目 | MCC_CODE |
|----------------|----------|----------|----------|
| 电商、零售、网店、商城 | 零售批发 | 网络零售 | A0002_B0115 |
| 宠物、猫、狗、宠物用品 | 零售批发 | 宠物/宠物用品 | A0002_B0033 |
| 餐饮、外卖、奶茶、咖啡 | 餐饮 | 餐饮服务 | A0003_B0001 |
| 教育、培训、课程 | 教育 | 教育培训 | A0010_B0001 |
| 软件、SaaS、API、技术服务 | 信息技术服务 | 软件服务 | A0002_B0114 |
| AI、智能体、机器人 | 信息技术服务 | 软件服务 | A0002_B0114 |
| 旅游、酒店、机票 | 旅游 | 旅游服务 | A0007_B0001 |
| 医疗、健康、诊所 | 医疗健康 | 医疗服务 | A0008_B0001 |

3. **无法推断时的默认值：**
   - 智能收 → 信息技术服务 > 软件服务 (A0002_B0114)
   - 电脑网站支付 → 零售批发 > 网络零售 (A0002_B0115)

##### 智能推荐输出格式

**一次性输出推荐方案（必须包含 4 项内容）：**

```
📋 检测到您的项目类型为 general_web（通用网页）。

根据这个项目类型，结合您之前创建的猫抓板电商网站业务，为您推荐：

| 项目 | 推荐配置 |
|------|----------|
| 产品类型 | 电脑网站支付 |
| 经营类目 | 零售批发 > 宠物/宠物用品 (A0002_B0033) |
| 适用场景 | PC 网页下单支付、电商网站收款 |
| 需要资料 | 3 张网站截图（首页、商品页、支付页） |

**推荐逻辑**：
  • 项目类型 general_web 适配电脑网站支付（PC网页支付链路）
  • 业务关键词"猫抓板""电商网站"匹配宠物用品零售场景
  • 经营类目选择零售批发-宠物/宠物用品

请问以上推荐是否符合您的业务？
  • 输入"符合"确认使用此方案
  • 输入"不符合"将进入详细选择流程
```

**⚠️ 输出内容必须包含 4 项（强制要求）：**

| 项目 | 说明 | 来源 |
|------|------|------|
| 产品类型 | 智能收 / 电脑网站支付 | 根据 COZE_PROJECT_TYPE 映射 |
| 经营类目 | 一级类目 > 二级类目 (MCC_CODE) | 根据项目类型 + 用户上下文推断 |
| 适用场景 | 产品适用的业务场景描述 | 根据产品类型生成固定文案 |
| 需要资料 | 签约所需的资料清单 | 根据产品类型生成固定文案 |

**适用场景文案（按产品类型）：**

| 产品类型 | 适用场景 |
|----------|----------|
| 电脑网站支付 | PC 网页下单支付、电商平台收款、官网在线支付 |
| 智能收 | AI 智能体按调用付费、API 服务收款、数字内容售卖 |

**需要资料文案（按产品类型）：**

| 产品类型 | 需要资料 |
|----------|----------|
| 电脑网站支付 | 3 张网站截图（首页、商品页、支付页） |
| 智能收 | 5 项服务注册信息（服务名称、服务描述、服务地址、服务单价、请求示例） |

##### 用户确认处理

| 用户输入 | 处理方式 |
|----------|----------|
| "符合" / "是的" / "对" / "确认" / "好的" | 直接使用推荐结果，进入 Step 3.3 保存方案 |
| "不符合" / "不对" / "不是" / "不满意" | 进入 Step 3.1 产品推荐（降级路径） |
| 其他输入 | 视为否认，进入 Step 3.1 产品推荐（降级路径） |

##### 智能推荐配置存储

用户确认智能推荐后，直接保存以下信息：

```bash
# 保存到状态文件
python3 "$STATE_MANAGER" set productName "电脑网站支付"  # 或 "智能收"
python3 "$STATE_MANAGER" set salesCode "I1080300001000041203"  # 或 "I1080300001000160457"
python3 "$STATE_MANAGER" set scope "app:all,fast_instant_trade_pay:write"  # 或对应scope

# MCC_CODE 作为运行时变量，不写入状态文件
MCC_CODE="A0002_B0033"  # 从智能推荐结果获取
```

---

#### 3.1 产品推荐（降级路径）

**当智能推荐前置失败（无环境变量或用户否认）时，进入原有产品推荐流程。**

> **详细流程见：** `ar-sign-skill/references/recommend-product.md`

##### 核心规则

```
✅ 必须：只询问一句"请简单描述一下您的业务内容"
✅ 必须：根据用户描述和上下文信息智能分析场景，自动推荐最适合的产品
✅ 必须：推荐结果出来后展示产品信息
✅ 必须：用户确认后进入 MCC 推荐

❌ 禁止：追问多个问题（如经营场景、技术能力、支付方式偏好等）
❌ 禁止：在推荐前向用户展示"我们支持哪些产品"
❌ 禁止：主动询问"您想签约哪个产品"（应先推荐）
```

---

#### 3.2 MCC 推荐（降级路径）

**当用户确认产品推荐后，进入经营类目推荐。**

> **详细流程见：** `mcc-recommender/SKILL.md` 及本文件「⛔ MCC 经营类目推荐规范（最高优先级）」章节

##### 核心规则

```
✅ 必须：最多推荐 3 个经营类目（按匹配度排序）
✅ 必须：输出编号表格让用户选择（1/2/3）
✅ 必须：用户可选择序号确认，或补充描述重新推荐

❌ 禁止：推荐超过 3 个类目
❌ 禁止：跳过用户确认直接使用推荐结果
```

---

#### 3.3 保存方案

**方案确认后保存产品信息和 MCC 编码。**

```bash
# 保存到状态文件
python3 "$STATE_MANAGER" set productName "<产品名称>"
python3 "$STATE_MANAGER" set salesCode "<产品码>"
python3 "$STATE_MANAGER" set scope "<对应scope>"

# MCC_CODE 作为运行时变量，不写入状态文件
```

#### 方案规划流程总结

| 路径 | 触发条件 | 流程 |
|------|----------|------|
| **优先路径** | 环境变量存在 + 用户确认符合 | Step 3.0（一次性推荐产品+MCC）→ Step 3.3 |
| **降级路径** | 无环境变量 / 用户否认 | Step 3.0 → Step 3.1（产品推荐）→ Step 3.2（MCC推荐）→ Step 3.3 |

**优先路径优势：** 用户只需确认一次，即可跳过产品推荐和 MCC 推荐两个步骤。

---

### ⚠️ 并行流程执行规范

**签约、服务注册、应用创建三方互不依赖，可并行执行。**

```
✅ 必须：并行启动三个分支，缩短整体耗时
✅ 必须：签约、服务注册、应用创建同时进行
✅ 必须：全程自动化执行，直到全部完成或遇到不可修复错误

❌ 禁止：顺序执行三个分支（应并行）
❌ 禁止：等待某个分支完成后再启动其他分支
❌ 禁止：询问用户是否继续下一步操作
```

**执行原则：多方并行 → 全部完成 → 流程结束，一气呵成！**

### ⛔ 签约规范（统一入口，规则集中）

> **本节是签约相关的唯一权威定义，其他章节引用本节，不另行定义。**

#### 1. 职责划分

| 步骤 | 操作 | 执行方 | 方式 |
|------|------|--------|------|
| Step 3.0 | 智能推荐前置（环境变量推断） | 主技能 | 读取 `COZE_PROJECT_TYPE` 环境变量 |
| Step 3.1 | 产品推荐（降级路径） | ar-sign-skill 子技能 | Read `ar-sign-skill/references/recommend-product.md` |
| Step 3.2 | MCC 推荐（降级路径） | mcc-recommender 子技能 | Read `mcc-recommender/SKILL.md` |
| Step 4 | 签约状态查询 | ar-sign-skill 子技能 | Read `ar-sign-skill/references/query-ar.md` |
| Step 5 | 资料采集 | 主技能 | 上传截图(fileKey) / 收集服务注册入参 |
| Step 6 Branch A | 签约提交 | 主技能直调 | `./ar-sign-skill/ar-sign apply --data '<json>'` |

#### 2. 签约状态查询（委托 ar-sign-skill）

**⚠️ 签约状态查询由 ar-sign-skill 子技能处理，主技能禁止直接调用 ar-query MCP。**

查询方式：Read `ar-sign-skill/references/query-ar.md`，按文档指引传入 salesProductCodes 查询。

**状态处理：**

| 状态 | 说明 | 后续处理 |
|------|------|----------|
| `SIGNED` | 已签约 | 跳过签约，直接进入应用创建 |
| `SIGNING` | 签约中 | 跳过签约，直接进入应用创建 |
| `NOT_SIGNED` 或 无合约记录 | 未签约 | 进入资料采集 → 签约提交 |

#### 3. 签约提交命令（`ar-sign apply`）

**当签约状态为 NOT_SIGNED 时，主技能直接调用 `./ar-sign-skill/ar-sign apply --data` 提交签约申请，跳过 previewFormView 流程。**

```bash
# 在技能根目录下执行
./ar-sign-skill/ar-sign apply --data '<apply_json>'
```

**`ar-sign apply` 内部行为：**
- 校验 JSON 结构（request/ctx 包裹层级、salesProductCodes 非空、mccCode 格式）
- 调用 `alipay-cli mcp call ar-sign.apply` 提交签约
- 返回结构化结果（success/orderNo/errorCode）

#### 4. apply JSON 结构（按产品类型）

**电脑网站支付（salesCode = I1080300001000041203）：**

```json
{
  "request": {
    "bizFeatures": {},
    "bizRequestNo": "<UUID>",
    "businessProperty": {
      "mccCode": "<MCC_CODE>",
      "webAppDTO": {
        "placeType": "ONLINE_WEBAPP",
        "appType": "PC_WEB",
        "appStatus": "OFFLINE",
        "screenshot": ["<HOME_FILE_KEY>", "<SHOP_FILE_KEY>", "<PAY_FILE_KEY>"]
      }
    },
    "channelCode": "B_SK_SH_RPC",
    "extension": {},
    "orderType": "NEW_SIGN",
    "salesProductCodes": ["I1080300001000041203"]
  },
  "ctx": {}
}
```

**智能收（salesCode = I1080300001000160457，无 webAppDTO）：**

```json
{
  "request": {
    "bizFeatures": {},
    "bizRequestNo": "<UUID>",
    "businessProperty": {
      "mccCode": "<MCC_CODE>"
    },
    "channelCode": "B_SK_SH_RPC",
    "extension": {},
    "orderType": "NEW_SIGN",
    "salesProductCodes": ["I1080300001000160457"]
  },
  "ctx": {}
}
```

#### 5. apply JSON 变量来源

| 变量 | 来源 | 说明 |
|------|------|------|
| `bizRequestNo` | 主技能生成 | UUID，通过 `python3 -c "import uuid; print(uuid.uuid4())"` 生成 |
| `mccCode` | Step 2 方案规划 | 动态值，格式 `Axxxx_Bxxxx`，来自 MCC 推荐（运行时变量，不持久化） |
| `screenshot` 数组 | Step 5 资料采集 | 动态值，来自 `alipay-cli file upload` 返回的 fileKey（仅电脑网站支付） |
| `channelCode` | 固定值 | `"B_SK_SH_RPC"` |
| `orderType` | 固定值 | `"NEW_SIGN"` |
| `bizFeatures` | 固定值 | `{}` |
| `extension` | 固定值 | `{}` |
| `webAppDTO.placeType` | 固定值（电脑网站支付） | `"ONLINE_WEBAPP"` |
| `webAppDTO.appType` | 固定值（电脑网站支付） | `"PC_WEB"` |
| `webAppDTO.appStatus` | 固定值（电脑网站支付） | `"OFFLINE"` |

#### 6. 电脑网站支付 vs 智能收 对比

| 对比项 | 电脑网站支付 | 智能收 |
|--------|-------------|--------|
| salesProductCodes | `["I1080300001000041203"]` | `["I1080300001000160457"]` |
| businessProperty.webAppDTO | **需要**（含截图） | **不需要** |
| businessProperty.mccCode | 需要 | 需要 |
| 资料采集 | 3张截图 fileKey → screenshot 数组 | 5项服务注册入参（service_market_data） |

#### 7. 签约提交完整示例

> **📄 带变量替换的完整 bash 示例见：** `references/flow.md` Step 6

**关键步骤提示：**

```bash
# 1. 每次签约前生成新 UUID
BIZ_REQUEST_NO=$(python3 -c "import uuid; print(uuid.uuid4())")

# 2. 从共享内存读取截图 fileKey（电脑网站支付）
HOME_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_home_page_image)
SHOP_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_shop_page_image)
PAY_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_payment_image)

# 3. mccCode 为运行时变量（来自 Step 2 方案规划，不持久化到状态文件）

# 4. screenshot 是字符串数组（fileKey），不是对象数组
```

#### 8. apply 返回结果处理

| 结果 | 字段 | 处理 |
|------|------|------|
| 成功 | `success: true` + `orderNo` | 展示订单号，告知申请已提交 |
| 失败 | `success: false` + `errorCode` | 展示错误信息，根据 `needRetry` 引导重试 |
| 校验错误 | `checkedError` | 提取校验错误，引导用户修正后重新提交 |

#### 9. 签约规范禁止行为

```
❌ 禁止：主技能直接调用 alipay-cli mcp call ar-sign.apply（必须通过 ./ar-sign-skill/ar-sign apply）
❌ 禁止：主技能调用 ar-sign.previewFormView（主技能直接 apply，无需 preview）
❌ 禁止：签约查询绕过子技能（必须通过 ar-sign-skill/references/query-ar.md）
❌ 禁止：省略 bizRequestNo（必须生成 UUID 并填入）
❌ 禁止：省略 webAppDTO（电脑网站支付必须有截图）
❌ 禁止：智能收传入 webAppDTO（智能收不需要该字段）
❌ 禁止：修改 channelCode（固定 B_SK_SH_RPC）
❌ 禁止：修改 orderType（固定 NEW_SIGN）
❌ 禁止：使用默认 mccCode A0003_B0223（必须使用 Step 2 推荐的类目）
❌ 禁止：修改 JSON 结构（必须保留 request/ctx 包裹层级）
❌ 禁止：修改 bizFeatures/extension 固定值（均为空对象 {}）
```

### ⚠️ 登录授权规范

> **⛔ 授权链接构造 + 展示规范见上方「⛔ 登录授权链接铁律（最高优先级）」章节（唯一权威定义）**
>
> **📄 完整授权流程见：** `references/authorization.md`

#### 核心流程

```
Step 0: CLI 前置检查 → 检测 alipay-cli 是否已安装
Step 1: 授权前用户确认 → 输出产品类型和经营类目，等待用户确认
Step 2: 执行登录 → login --non-interactive --scope "$SCOPE" --json
Step 3: 生成授权链接 + 输出授权信息 → 按铁律构造 BROWSER_URL，按铁律展示 4 项信息
Step 4: 等待用户确认 → 不再使用轮询机制
Step 5: 执行授权确认 → login --complete --json
```

#### ⛔ Scope 校验铁律（最高优先级）

**执行任何操作前必须校验当前 scope 是否包含该操作所需权限，缺失则重新授权。**

```
⚠️ 核心规则（务必遵守）：
  - app:all                → 仅授权应用创建与管理（Branch C: application-publish）
  - machine_pay:write      → 仅授权智能收产品签约（Branch A: 智能收签约）
  - fast_instant_trade_pay:write → 仅授权电脑网站支付签约（Branch A: 电脑网站支付签约）
  - agmnt:write            → 仅授权服务注册（Branch B: service-market）
  - 各 scope 权限独立，互不包含
  - 用户同一时间只能操作 1 个产品
```

**校验时机：** 以下节点必须执行 scope 校验

1. **Step 3 登录后** — 根据当前产品校验 scope 是否完整
2. **Step 4 签约查询前** — 校验签约操作所需 scope
3. **Step 5 资料采集后、Step 6 前** — 校验所有分支所需 scope
4. **MCP 调用返回认证错误时** — 立即校验是否 scope 缺失

**校验与重新授权逻辑：**

> **📄 完整 scope 校验脚本和重新授权流程见：** `references/authorization.md` → 权限检查

**核心规则：** 从 `whoami` 获取当前 scope → 根据产品码计算所需 scope → 逐项校验 → 缺失则停止操作并引导重新授权。

#### Scope 对照表

> **产品与 Scope 的完整映射见「⛔ 产品支持铁律」章节的产品码/Scope 映射表。**

### ⛔ Scope 权限与操作对照铁律（最高优先级）

**每个 scope 仅授权特定操作，超出范围必须重新授权。**

> **核心原则：scope 权限精确匹配，缺失即重新授权，不假设、不跳过。**

#### Scope 与操作对照表

| Scope | 授权操作 | 包含的产品/分支 | 不包含的操作 |
|-------|----------|-----------------|-------------|
| `app:all` | 应用创建与管理（查询/创建/公钥/提审） | Branch C: application-publish | 签约、服务注册 |
| `machine_pay:write` | 智能收产品签约 | Branch A: 签约（智能收） | 电脑网站支付签约、服务注册 |
| `fast_instant_trade_pay:write` | 电脑网站支付签约 | Branch A: 签约（电脑网站支付） | 智能收签约、服务注册 |
| `agmnt:write` | 服务注册（服务市场上架） | Branch B: service-market（仅智能收） | 签约、应用创建 |

#### 操作与必需 Scope 对照表

**每项操作执行前必须校验当前 scope 是否包含对应权限，不匹配则触发重新授权。**

| 操作 | 必需 Scope | 所属分支 | 触发条件 |
|------|-----------|----------|----------|
| 签约查询（智能收） | `machine_pay:write` | Branch A | salesCode = I1080300001000160457 |
| 签约申请（智能收） | `machine_pay:write` | Branch A | salesCode = I1080300001000160457 |
| 签约查询（电脑网站支付） | `fast_instant_trade_pay:write` | Branch A | salesCode = I1080300001000041203 |
| 签约申请（电脑网站支付） | `fast_instant_trade_pay:write` | Branch A | salesCode = I1080300001000041203 |
| 服务注册 | `agmnt:write` | Branch B | 仅智能收产品 |
| 服务查询 | `agmnt:write` | Branch B | 仅智能收产品 |
| 应用创建/查询/公钥/提审 | `app:all` | Branch C | 所有产品 |

#### Scope 校验流程

```
每次执行操作前：
  1. 从 whoami 获取当前 scope
  2. 根据操作类型确定必需 scope（查上表）
  3. 检查当前 scope 是否包含必需权限
     ├─ 包含 → 继续执行操作
     └─ 缺失 → 停止操作，提示用户重新授权
```

#### 权限不足时的重新授权

**当检测到当前 scope 不包含操作所需权限时，必须停止操作并引导用户重新授权。**

> **📄 完整重新授权流程和提示话术见：** `references/authorization.md` → 登录过期重新授权

**重新授权 Scope 计算（同一时间只能操作 1 个产品）：**

| 操作场景 | 需要 Scope | 登录命令 |
|----------|-----------|----------|
| 操作电脑网站支付 | `app:all,fast_instant_trade_pay:write` | `login --non-interactive --scope "app:all,fast_instant_trade_pay:write" --json` |
| 操作智能收 | `app:all,machine_pay:write,agmnt:write` | `login --non-interactive --scope "app:all,machine_pay:write,agmnt:write" --json` |

#### 权限校验禁止行为

```
❌ 禁止：scope 不匹配时仍继续执行操作
❌ 禁止：假设 app:all 包含签约或服务注册权限
❌ 禁止：跳过 scope 校验直接调用 MCP
❌ 禁止：用产品签约 scope 替代服务注册 scope（各 scope 独立）
❌ 禁止：在 scope 缺失时不告知用户直接重新登录
❌ 禁止：重新登录时遗漏必需 scope（必须按对照表计算完整 scope）
✅ 必须：执行任何操作前先校验 scope
✅ 必须：scope 缺失时停止操作并提示用户
✅ 必须：重新授权时根据操作场景计算完整 scope
✅ 必须：scope 校验失败时明确告知用户缺少哪个权限
```

---

## ⛔ MCC 经营类目推荐规范（最高优先级）

**经营类目推荐必须严格遵守数量限制，最多向用户展示 3 个类目供选择。**

### 核心规则

```
✅ 必须：最多推荐 3 个经营类目（按匹配度排序）
✅ 必须：输出编号表格让用户选择（1/2/3）
✅ 必须：用户可选择序号确认，或补充描述重新推荐
✅ 必须：单个匹配结果时可直接确认

❌ 禁止：推荐超过 3 个类目
❌ 禁止：直接输出 JSON 数据给用户
❌ 禁止：不提供选择直接使用唯一结果
❌ 禁止：跳过用户确认直接使用推荐结果
```

### 推荐流程

```
1. 读取 mcc-recommender/SKILL.md
2. 根据用户经营描述语义匹配经营类目
3. 按匹配度排序，取前 3 个结果
4. 输出编号表格供用户选择
5. 用户选择后，构造 MCC_CODE="${level1_code}_${level2_code}"
```

### 输出格式（编号表格）

**多匹配结果时（2-3 个）：**

```
📋 根据您的描述，为您推荐以下经营类目：

| 序号 | 一级类目 | 二级类目 | 匹配说明 |
|------|----------|----------|----------|
| 1 | 餐饮 | 饮品/甜品 | 奶茶店属于饮品店铺 |
| 2 | 餐饮 | 快餐小吃 | 奶茶店可能兼营小吃 |
| 3 | 零售批发 | 食品饮料 | 瓶装饮料零售 |

请选择：
  • 输入序号（1/2/3）选择对应类目
  • 输入更详细的描述，重新推荐类目
```

**单一匹配结果时：**

```
📋 根据您的描述，为您推荐：

| 一级类目 | 二级类目 | 匹配说明 |
|----------|----------|----------|
| 餐饮 | 饮品/甜品 | 奶茶店属于饮品店铺 |

请选择：
  • 输入"确认"使用此类目
  • 输入更详细的描述，重新推荐类目
```

### MCC 编码格式

```
MCC_CODE = "${level1_code}_${level2_code}"
例如：A0002_B0114（零售批发 > 互联网综合电商平台）
```

### 用户选择处理

| 用户输入 | 处理方式 |
|----------|----------|
| 输入数字序号（1/2/3） | 选择对应类目，构造 MCC_CODE |
| 输入更详细描述 | 重新匹配，返回新推荐列表（最多 3 个） |
| 输入"确认"（单推荐时） | 确认使用推荐的类目 |

### 详细文档

> **完整 MCC 推荐规范、匹配规则、类目参考见：** `mcc-recommender/SKILL.md` 及 `mcc-recommender/references/mcc_reference.md`

---

## 引用文档

| 文档 | 用途 |
|------|------|
| `references/mcp-methods.md` | MCP 方法声明、调用规范 |
| `references/state-management.md` | 状态文件结构、读写规范 |
| `references/cli-commands.md` | **CLI 命令规范（完整版）** |
| `references/authorization.md` | **登录授权流程规范（完整版）** |
| `references/error-handling.md` | 错误类型、处理方式 |
| `references/products.md` | 产品配置、MCC 格式、资料采集 |
| `references/subskills.md` | 子技能调用关系 |
| `references/flow.md` | 完整执行流程 |
| `references/faq.md` | **FAQ 常见问题解答（用户咨询问题时查阅）** |

---

## ⛔ 产品支持铁律（最高优先级）

**本期仅支持以下 2 个产品可实际办理。推荐时应先根据用户场景智能推荐，推荐结果出来后再说明产品信息。**

### 内部限制规则（不对外暴露）

```
⚠️ 内部规则（禁止向用户提前暴露）：
  - 推荐前：不主动告知"我们支持哪些产品"
  - 推荐时：根据用户场景智能推荐，给出首推产品
  - 推荐后：展示推荐的产品信息及推荐理由
  - 若推荐非下面 2 个产品：说明"该产品可推荐，当前暂不支持办理，请前往b.alipay.com-产品中心办理"
```

| 产品名称 | salesCode | 需要资料采集 | Scope |
|----------|-----------|--------------|-------|
| 电脑网站支付 | I1080300001000041203 | 是（3张截图 → fileKey） | `app:all,fast_instant_trade_pay:write` |
| 智能收 | I1080300001000160457 | 是（5项服务注册入参） | `app:all,machine_pay:write,agmnt:write` |

### 产品定义

**电脑网站支付**
- 定义：用户在 PC 网页发起支付，跳转支付宝完成付款
- 适用场景：PC 官网、电商网站、在线教育、政务缴费网站
- 资料采集：3 张网站截图（首页/商品/支付页）→ fileKey → apply JSON 的 screenshot 字段

**智能收**
- 定义：面向 AI 智能体的机器支付收款产品
- 适用场景：API、数字内容、算力资源、智能体按调用付费
- 资料采集：5 项服务注册入参（serviceName、serviceDesc、resourceUrl、pricing、schemaUrl）

### 产品与产品码、Scope 映射

| 产品 | salesCode | Scope | 资料采集内容 | apply JSON 特殊字段 |
|------|-----------|-------|-------------|-------------------|
| 电脑网站支付 | `I1080300001000041203` | `app:all,fast_instant_trade_pay:write` | 3 张截图 fileKey | `webAppDTO`（含 screenshot） |
| 智能收 | `I1080300001000160457` | `app:all,machine_pay:write,agmnt:write` | 5 项服务注册入参 | 无 `webAppDTO` |

### 禁止行为

```
❌ 禁止：在推荐前向用户展示"我们支持哪些产品"
❌ 禁止：主动询问"您想签约哪个产品"（应先根据上下文推荐）
❌ 禁止：将内部产品限制列表暴露给用户
❌ 禁止：推荐非上述 2 个产品后不说明"当前暂不可办理"
❌ 禁止：混淆产品码（电脑网站支付和智能收的产品码是固定值，不可修改）
❌ 禁止：混淆 Scope（每个产品对应固定的 Scope，不可混用）
❌ 禁止：电脑网站支付使用智能收的 Scope（反之亦然）
```

---

## 环境配置

```
CLI命令: alipay-cli
状态管理: scripts/state_manager.py（Python 共享内存）
凭证检查: scripts/check_credential.py（支付宝集成凭证检测）
备份目录: ~/.alipay/alipay-merchant-onboarding/archive/
技能目录: ./（当前技能目录）
```

> **详细说明见：** `references/state-management.md`

---

## ⚠️ 状态清理（流程结束后）

**当流程全部走完后，可以选择性导出备份后删除共享内存状态。**

```
清理时机：Step 8 流程结束后
清理条件：签约状态（MCP 查询）为 SIGNED 且应用创建成功后，由用户确认执行
清理步骤：备份状态到 archive/ → 删除共享内存
```

**清理规范：**

```
✅ 必须：签约状态（MCP 查询）为 SIGNED 且应用创建成功后才执行清理
✅ 必须：通过 MCP 真实查询判断流程完成，禁止依赖本地 status/appId 字段
❌ 禁止：非完成状态执行清理
❌ 禁止：通过 status/appId 字段判断完成状态（这些字段禁止写入状态文件）
❌ 禁止：未备份直接删除
```

> **📄 完整清理脚本和目录结构见：** `references/flow.md` Step 8、`references/state-management.md`

---

## ⛔ CLI 命令规范

**所有 alipay-cli 命令必须严格按照文档定义的格式执行。命令名称、参数、选项一字不改。**

> **📄 完整 CLI 命令规范、安装检测脚本、禁止命令表见：** `references/cli-commands.md`

### 核心规则

```
✅ 版本检查：alipay-cli version（不是 --version）
✅ 命令格式：--json 和 2>/dev/null 同时使用（获取纯 JSON 输出）
✅ 登录必须携带 --scope 参数
❌ 禁止：alipay-cli mcp list、alipay-cli --version、自行创造参数
❌ 禁止：主技能直接调用 ar-sign.apply（必须通过 ./ar-sign-skill/ar-sign apply）
```

### CLI 前置检查

**在执行任何 CLI 操作之前，必须先检测 alipay-cli 是否已安装。**

> **📄 详细检测逻辑和安装流程见：** `references/authorization.md` → CLI 前置检查

---

## ⚠️ 签约相关处理

> **⛔ 签约相关的所有规则（职责划分、签约状态查询、签约提交命令、apply JSON 结构、变量来源、示例、返回结果处理、禁止行为）统一定义在上方「⛔ 签约规范（统一入口，规则集中）」章节，本节仅提供快速索引。**

### 快速索引

| 签约操作 | 查看 |
|----------|------|
| 职责划分（谁做什么） | ⛔ 签约规范 → 第 1 节：职责划分 |
| 签约状态查询 | ⛔ 签约规范 → 第 2 节：签约状态查询 |
| 签约提交命令与 JSON 结构 | ⛔ 签约规范 → 第 3-6 节 |
| apply JSON 变量来源 | ⛔ 签约规范 → 第 5 节：变量来源 |
| 签约提交完整示例 | ⛔ 签约规范 → 第 7 节 |
| 返回结果处理 | ⛔ 签约规范 → 第 8 节 |
| 禁止行为 | ⛔ 签约规范 → 第 9 节 |

---

## ⚠️ Shell 编码规范

### 状态管理规范

**状态读写必须使用 `scripts/state_manager.py`，禁止直接操作 JSON 文件或使用 heredoc 写入状态。**

> **📄 完整规范见：** `references/state-management.md`

#### ⛔ 状态字段铁律（最高优先级）

**状态文件只允许存在以下 5 个字段，禁止写入任何其他字段：**

```json
{
  "productName": "电脑网站支付|智能收",
  "salesCode": "I1080300001000041203|I1080300001000160457",
  "scope": "app:all,fast_instant_trade_pay:write|app:all,machine_pay:write,agmnt:write",
  "collect_information": {
    "pc_home_page_image": "fileKey（仅电脑网站支付）",
    "pc_shop_page_image": "fileKey（仅电脑网站支付）",
    "pc_payment_image": "fileKey（仅电脑网站支付）"
  },
  "service_market_data": {
    "serviceName": "服务名称（仅智能收）",
    "serviceDesc": "服务描述（仅智能收）",
    "resourceUrl": "服务地址（仅智能收）",
    "pricing": "服务单价（仅智能收）",
    "schemaUrl": "请求示例（仅智能收）"
  }
}
```

**字段写入时机：**

| 字段 | 写入时机 | 来源 |
|------|----------|------|
| `productName` | Step 2 方案规划确认后 | 用户选择 |
| `salesCode` | Step 2 方案规划确认后 | 产品映射 |
| `scope` | Step 2 方案规划确认后 | salesCode 映射 |
| `collect_information` | Step 5 截图上传后 | `alipay-cli file upload` 返回的 fileKey |
| `service_market_data` | Step 5 服务注册入参采集后 | 用户提供的 5 项服务注册入参 |

**禁止写入的字段：**

```
❌ status（禁止用本地状态判断流程进度，应通过 MCP 真实查询）
❌ mccCode / mccName / mccLevel1Name / mccLevel2Name（运行时变量，不持久化）
❌ deviceCode / verificationCode / browserUrl（临时变量，不持久化）
❌ ar_sign_data（由 ar-sign-skill 子技能内部管理）
❌ appId / merchantPid / authToken / userId（由子技能返回，不持久化到主状态）
❌ 任何其他字段
```

**写入示例：**

```bash
STATE_MANAGER=<skill-dir>/scripts/state_manager.py

# ✅ 正确：只写入允许的 5 个字段
python3 "$STATE_MANAGER" set productName "电脑网站支付"
python3 "$STATE_MANAGER" set salesCode "I1080300001000041203"
python3 "$STATE_MANAGER" set scope "app:all,fast_instant_trade_pay:write"
python3 "$STATE_MANAGER" set-json collect_information '{"pc_home_page_image":"key1","pc_shop_page_image":"key2","pc_payment_image":"key3"}'
python3 "$STATE_MANAGER" set-json service_market_data '{"serviceName":"天气查询","serviceDesc":"城市天气查询服务","resourceUrl":"https://api.example.com/weather","pricing":"0.01","schemaUrl":"{\"city\":\"北京\"}"}'

# ✅ 正确：读取字段
PRODUCT_NAME=$(python3 "$STATE_MANAGER" get productName)
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)
SERVICE_NAME=$(python3 "$STATE_MANAGER" get service_market_data.serviceName)

# ❌ 禁止：写入非允许字段
python3 "$STATE_MANAGER" set status "planning"          # ❌ 禁止
python3 "$STATE_MANAGER" set mccCode "A0002_B0115"      # ❌ 禁止，mccCode 为运行时变量
python3 "$STATE_MANAGER" set deviceCode "xxx"            # ❌ 禁止
python3 "$STATE_MANAGER" set-json ar_sign_data '{}'      # ❌ 禁止
```

### Heredoc 的正确使用场景

Heredoc 用于构造 `./ar-sign-skill/ar-sign apply --data` 的 JSON 参数（非状态管理）：

```bash
# ✅ 正确：用 heredoc 构造 apply JSON（电脑网站支付）
BIZ_REQUEST_NO=$(python3 -c "import uuid; print(uuid.uuid4())")
./ar-sign-skill/ar-sign apply --data "$(cat <<EOF
{
  "request": {
    "bizFeatures": {},
    "bizRequestNo": "${BIZ_REQUEST_NO}",
    "businessProperty": {
      "mccCode": "${MCC_CODE}",
      "webAppDTO": {
        "placeType": "ONLINE_WEBAPP",
        "appType": "PC_WEB",
        "appStatus": "OFFLINE",
        "screenshot": ["${HOME_KEY}", "${SHOP_KEY}", "${PAY_KEY}"]
      }
    },
    "channelCode": "B_SK_SH_RPC",
    "extension": {},
    "orderType": "NEW_SIGN",
    "salesProductCodes": ["${SALES_CODE}"]
  },
  "ctx": {}
}
EOF
)"
```

### 规范总结

| 场景 | 推荐方式 |
|------|----------|
| 读取状态字段 | `python3 "$STATE_MANAGER" get <field>` |
| 写入状态字段 | `python3 "$STATE_MANAGER" set <field> <value>`（仅 5 个允许字段） |
| 写入嵌套对象 | `python3 "$STATE_MANAGER" set-json <field> '<json>'`（collect_information 或 service_market_data） |
| 初始化状态 | `python3 "$STATE_MANAGER" init` |
| 查看完整状态 | `python3 "$STATE_MANAGER" show` |
| 重置状态 | `python3 "$STATE_MANAGER" reset` |
| 写入模板文件（apply JSON） | 生成 UUID + `cat << 'EOF'` + 变量替换（传给 `./ar-sign-skill/ar-sign apply --data`） |

---

## 关键判断节点

> **⚠️ 所有 CLI 调用后都必须检测错误。详见 `references/error-handling.md`**

### 登录状态判断

> **📄 完整登录检测脚本见：** `references/authorization.md` → 登录状态检查

```bash
LOGGED_IN=$(alipay-cli whoami --json 2>&1 | jq -r '.data.logged_in // false')
```

### 签约状态判断

**⚠️ 签约状态查询和签约提交详见「⛔ 签约规范（统一入口，规则集中）」章节。**

- 签约状态查询：Read `ar-sign-skill/references/query-ar.md`，按文档指引传入 salesProductCodes 查询
- 签约提交：`./ar-sign-skill/ar-sign apply --data '<json>'`

### 错误检测优先级

检测错误时按以下优先级判断：

| 优先级 | 错误类型 | 关键词 | 处理方式 |
|--------|----------|--------|----------|
| 1 | MCP 认证错误 | `HTTP 401`, `Authorization is empty`, `非法的认证信息` | 检查登录态，重新授权 |
| 2 | Scope 权限不足 | `scope`, `permission`, `is not auth`, `权限不足` | 校验 scope，按产品重新授权 |
| 3 | MCP 服务不稳定 | `MCP 服务不稳定`, `服务暂时不可用` | 重试或提示稍后 |
| 4 | MCP 服务错误 | `MCP 调用失败`, `connection refused`, `timeout` | 检查网络后重试 |
| 5 | 授权信息不匹配 | `mccCode is not auth`, `salesProductCodes is not auth` | 重新授权对应 scope |
| 6 | 业务错误 | `errorCode` 存在 | 根据 errorMessage 处理 |

> **完整错误处理见：** `references/error-handling.md`

### ⚠️ 资料采集规范（Step 5，签约前必须完成）

**资料采集在签约前统一完成，按产品类型采集不同内容。同一时间只签约 1 个产品，只需采集对应产品的资料。**

#### 产品与采集内容对照

| 产品 | salesCode | 采集内容 | 存储位置 | 用途 |
|------|-----------|----------|----------|------|
| 电脑网站支付 | I1080300001000041203 | 3张截图（首页/商品/支付页） | `collect_information`（状态文件） | 签约提交 apply JSON 的 screenshot 字段 |
| 智能收 | I1080300001000160457 | 5项服务注册入参 | `service_market_data`（状态文件） | service-market 提交使用 |

#### 采集时机

**在用户完成扫码授权（Step 3）并确认签约状态为 NOT_SIGNED 后，立即进入资料采集（Step 5）。**

#### 电脑网站支付 — 截图上传采集

**⚠️ 采集流程：用户提供文件路径（可拖入终端） → skill 自动调用 `alipay-cli file upload` 上传 → 获取 fileKey → 写入共享内存。禁止向用户索取 fileKey。**

```
📋 电脑网站支付需要 3 张网站截图，请提供截图文件路径（可直接拖入终端）：

  1. 首页截图 — 网站首页完整截图（JPG/PNG，≤10MB）
  2. 商品页截图 — 商品或服务页面截图（JPG/PNG，≤10MB）
  3. 支付页截图 — 支付页面截图（JPG/PNG，≤10MB）

示例：/Users/xxx/screenshots/home.png
```

用户提供路径后，skill 自动上传并写入共享内存：

```bash
# 用户提供了 3 张截图的文件路径
# Step 1: 通过 alipay-cli file upload 上传文件，获取 fileKey
HOME_KEY=$(alipay-cli file upload "$HOME_IMG" -s payMerchantcodeSkill --json 2>/dev/null \
  | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // empty')
SHOP_KEY=$(alipay-cli file upload "$SHOP_IMG" -s payMerchantcodeSkill --json 2>/dev/null \
  | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // empty')
PAY_KEY=$(alipay-cli file upload "$PAY_IMG" -s payMerchantcodeSkill --json 2>/dev/null \
  | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // empty')

# Step 2: 校验上传结果（任一 fileKey 为空则上传失败）
if [ -z "$HOME_KEY" ] || [ -z "$SHOP_KEY" ] || [ -z "$PAY_KEY" ]; then
  echo "❌ 截图上传失败，请检查文件路径后重试"
  [ -z "$HOME_KEY" ] && echo "  - 首页截图上传失败"
  [ -z "$SHOP_KEY" ] && echo "  - 商品页截图上传失败"
  [ -z "$PAY_KEY" ] && echo "  - 支付页截图上传失败"
  exit 1
fi

# Step 3: 写入共享内存
python3 "$STATE_MANAGER" set collect_information.pc_home_page_image "$HOME_KEY"
python3 "$STATE_MANAGER" set collect_information.pc_shop_page_image "$SHOP_KEY"
python3 "$STATE_MANAGER" set collect_information.pc_payment_image "$PAY_KEY"

echo "✅ 截图上传成功"
echo "  - 首页: $HOME_KEY"
echo "  - 商品页: $SHOP_KEY"
echo "  - 支付页: $PAY_KEY"
```

**⚠️ 禁止行为：**

```
❌ 禁止：要求用户提供 fileKey（用户无法获取）
❌ 禁止：跳过 alipay-cli file upload 上传步骤
❌ 禁止：未校验 fileKey 是否为空就写入共享内存
✅ 正确：要求用户提供文件路径 → skill 自动上传 → 获取 fileKey
```

#### 智能收 — 服务注册入参采集

```
📋 智能收需要提供服务注册信息（共 5 项）：

  1. 服务名称（1-50 字符）— 如：天气查询
  2. 服务描述（1-500 字符）— 简要描述服务功能
  3. 服务地址（URL）— 可访问的 API 地址，如：https://api.example.com/weather
  4. 服务单价（元）— 最低 0.01 元
  5. 请求示例（JSON）— 接口请求示例，如：{"city": "北京"}

请依次提供以上信息。
```

采集完成后写入共享内存状态（service_market_data 字段）：

```bash
# 智能收的服务注册入参采集后写入状态文件
python3 "$STATE_MANAGER" set-json service_market_data "{
  \"serviceName\": \"$SERVICE_NAME\",
  \"serviceDesc\": \"$SERVICE_DESC\",
  \"resourceUrl\": \"$RESOURCE_URL\",
  \"pricing\": \"$PRICING\",
  \"schemaUrl\": \"$SCHEMA_URL\"
}"

# 验证写入
SERVICE_DATA=$(python3 "$STATE_MANAGER" get service_market_data)
if [ -z "$SERVICE_DATA" ] || [ "$SERVICE_DATA" = "null" ]; then
  echo "❌ 服务注册数据写入失败"
  exit 1
fi

echo "✅ 服务注册信息已保存"
```

**⚠️ service-market 子技能从共享内存读取入参：**

```bash
# service-market 子技能在 Step 6 并行执行时，从状态文件读取入参
SERVICE_NAME=$(python3 "$STATE_MANAGER" get service_market_data.serviceName)
SERVICE_DESC=$(python3 "$STATE_MANAGER" get service_market_data.serviceDesc)
RESOURCE_URL=$(python3 "$STATE_MANAGER" get service_market_data.resourceUrl)
PRICING=$(python3 "$STATE_MANAGER" get service_market_data.pricing)
SCHEMA_URL=$(python3 "$STATE_MANAGER" get service_market_data.schemaUrl)
```

#### 断点续传（资料采集阶段恢复）

```bash
# 电脑网站支付：检查是否已有截图 fileKey
COLLECT_INFO=$(python3 "$STATE_MANAGER" get collect_information)
# 有完整 fileKey → 跳过截图上传，直接使用已有数据

# 智能收：检查是否已有服务注册入参
SERVICE_DATA=$(python3 "$STATE_MANAGER" get service_market_data)
# 有完整入参 → 跳过信息采集，直接使用已有数据
if [ -n "$SERVICE_DATA" ] && [ "$SERVICE_DATA" != "null" ] && [ "$SERVICE_DATA" != "{}" ]; then
  echo "✅ 已有服务注册数据，跳过采集步骤"
fi
```

#### 签约前检查清单

**⚠️ 在进入 Step 6 并行流程前，必须确认以下条件：**

```
□ 已通过 ar-sign-skill/references/query-ar.md 查询签约状态
□ 查询结果 arStatus 为 NOT_SIGNED 或 arInfos 为空
□ 已根据产品类型完成资料采集：

  电脑网站支付：
  □ collect_information 三项 fileKey 已写入共享内存
  □ 准备好 apply JSON 中的 bizRequestNo（UUID）和 mccCode

  智能收：
  □ service_market_data 五项入参已写入共享内存
  □ 准备好 apply JSON 中的 bizRequestNo（UUID）和 mccCode
```

> **apply JSON 构造详见「⛔ 签约规范（统一入口，规则集中）」第 4-7 节**

> **详细流程见：** `references/flow.md` Step 5

---

## 触发词

- "我要入驻"、"我要签约"、"申请成为商家"
- "支付宝商家入驻"、"支付宝商家签约"、"支付商家开通"
- "开始上线"、"商家申请"、"商户入驻"
- "我要创建应用"、"创建应用"、"发布应用"、"应用创建"、"应用发布"
- "服务注册"、"注册服务"、"我要注册服务"、"MCP 服务注册"