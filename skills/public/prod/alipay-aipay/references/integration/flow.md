<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_CORE:START -->
# Coze Node.js AI 网页应用收款代码开发流程

本 flow 只支持 Coze Node.js 项目的 AI 网页应用收款，固定 `productType=webpay`。其他语言或支付产品不进入本流程，按 `../normal/rejection-guide.md` 受控拒绝。

## 按步读取

纯只读诊断只通过当前 Skill 绝对路径下的统一 runtime 加载 `troubleshooting`；代码开发只通过同一 runtime 依次加载 `entry`、`prepare`、`development --product-type webpay`、`implementation --product-type webpay`、`verification --product-type webpay`、`acceptance --product-type webpay`、`checklist --product-type webpay --project-path "$PROJECT_PATH"`。本 flow 是动作命令、固定值、失败转移和完成条件的唯一执行依据。

步骤 1 只有 `CLI_ENV:UNAVAILABLE`、环境协议异常或用户要求解释时才读取 `../normal/alipay-cli-env.md`；沙箱命令非 0、marker 缺失/重复/冲突、路径不一致、出现 `SANDBOX_ERROR`，或用户明确要求沙箱配置与重试详情时，才完整读取 [`modules/sandbox/sandbox-setup-guide.md`](modules/sandbox/sandbox-setup-guide.md)。只有该指南登记的冻结 MCP 契约核对条件成立时，才继续读取其链接的 `alipay-sandbox-tool.md`；正常 `ensure|reverify|verify|summary` 路径禁止预读二者。步骤 4 只按 `integration-context resolve` 的有序清单读取接口契约、Coze 开发指南、SDK、运行时和 Node.js 示例。步骤 8 的 loader 会附带 checklist，不再单独读取整份清单。

## 强制边界

- 先通过 runner 校验唯一 Node.js 项目，再准备沙箱；项目命令以校验后的规范化项目根为 workdir。
- 匿名沙箱固定携带 CLI 上报字段 `PRODUCT=WEBPAY`；`createAnonymousSandbox` 方法、`PUBLICAPP` 请求体、`PLATFORM`、`PLATFORM_ID` 和 `ALIPAYCLI_BIZ_INFO` 不变，CLI 上下文不写入请求 JSON。
- 沙箱网关唯一合法值为 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；该值不来自 `.alipay-sandbox.json`。旧地址、HTTP、仅 hostname、缺少 `/gateway.do` 或其他变体均为阻断缺陷。
- 步骤 2 的标准方案可见送达前禁止改代码；送达后同一工作回合自动继续，不等待回复。
- 必须实现下单、交易查询、退款、退款查询、关闭交易和异步通知。
- 默认不发起真实生产支付、退款或关单；支付结果只以验签通知或交易查询为准。
- 当前 Skill 不处理生产上线、沙箱/demo 转正式或生产配置替换；代码开发和产品开通过程不调用 `integration_detail`，也不触发或模拟 `alipay-payment-production-integration`。
- 当前 Skill 只提示用户前往支付宝 AI 付站点（https://aipay.alipay.com/?from=alipay-aipay-skill-coze）首页-一站式接入-AI网页应用收款-产品开通节点查看产品开通状态；确认产品已开通后，后续生产链路统一见 [`modules/coze-runtime.md`](modules/coze-runtime.md)。
- Agent 在当前 Skill 内不请求、读取或处理生产应用私钥。

### 标准消息与遥测

runner 或脚本 stdout 是该动作唯一对客正文；先剔除完整 `ALIPAY_AIPAY_INTERNAL:` 行，正文为空时静默转移。失败不得手写近似消息或拆回 renderer。`start-run` 已确定 `run_id`，阶段事件由 flow marker 异步上报；Agent 不手工补报。遥测失败不改变业务流程，诊断才读取 `../normal/telemetry.md`。

## 用户阻塞点索引

未提供项目路径时先自动校验 Coze 当前工作区根，不等待用户补齐；只有默认根不可访问、不是项目根或无法唯一确定时，才在步骤 1 通过登记消息等待用户选择或补充。代码开发方案不是确认点。用户另行要求删除具体文件时，先列出精确路径和影响，在独立轮次取得逐项明确确认；否则禁止删除、清空或强制覆盖。

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_CORE:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_ENTRY:START -->
## 生产上线边界

当前 Integration 只完成 Coze Node.js 项目的 AI 网页应用收款代码开发、沙箱配置接入、本地验收和防误上线 guard；不登记 `PRODUCTION_CREDENTIAL_REQUESTED`，不维护 `COZE_CREDENTIAL_STATE`，不维护 `PRODUCTION_CONVERSION_STATE`。用户在本轮原始请求或后续输入中要求“上线”“正式环境”“生产支付接入”“支付密钥托管”或“沙箱/demo 转正式”时，本 Skill 仍先完成当前代码开发边界，并在收口中提示后续独立生产链路；若原始请求中存在明确经营描述，应在 checklist handoff 中透传为 `BUSINESS_DESCRIPTION` 供后续 Onboarding 作为 `MCC_SEARCH_QUERY`。具体口径统一见 [`modules/coze-runtime.md`](modules/coze-runtime.md)。不得为了满足该表达在代码开发过程中调用 `integration_detail`、索取生产 appId、读取卡片或修改项目为生产配置；只有用户后续主动触发上线前准备交接时，才按 [`modules/coze-runtime.md`](modules/coze-runtime.md) 先唤起卡片再衔接独立生产 Skill。

后续生产链路的完整顺序、卡片字段、查看入口和全局影响统一见 [`modules/coze-runtime.md`](modules/coze-runtime.md)；当前 flow 不维护第二套生产步骤说明。

## 目标项目

目标必须是唯一可访问的 Node.js 项目根，并包含 `package.json`。用户未提供项目位置时，固定令 `PROJECT_INPUT=当前项目`，把宿主提供的 Coze 当前工作区根作为 `USER_WORKSPACE_ROOT`；不得使用 Skill 目录、Agent 启动目录、用户 Home 或猜测的 Coze 绝对路径代替。用户明确提供路径或要求新建项目时保留其原始 `PROJECT_INPUT` 并覆盖默认选择。所有后续检查、安装、写入、启动和验证固定使用 runner 返回的规范化绝对 `PROJECT_PATH`。

- 默认复用：未提供项目位置时不询问，直接对 `USER_WORKSPACE_ROOT` 执行 `resolve-project --project-input "当前项目" --intent existing`；只有校验失败才进入候选或澄清分支。
- 指定复用：用户提供明确路径时执行 `resolve-project --intent existing`。用户只给大概目录时先用 `locate-projects` 输出候选并等待选择；候选不能替代最终路径解析。
- 新项目：Agent 从用户名称或位置形成规范化绝对 `TARGET_PROJECT_PATH`，执行 `resolve-project --intent new --target-path`。只有原话严格为“新建项目”或“帮我新建默认项目”时才省略 `--target-path`，使用用户目录下安全默认目录。路径必须不存在或为空，禁止清空非空目录。
- “当前项目/当前目录”和相对路径也必须经 runner 解析；当前目录本身不是项目根时不得接受。

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message resolve-project --project-input "$PROJECT_INPUT" --base-path "$USER_WORKSPACE_ROOT" --intent existing
```

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message resolve-project --project-input "$PROJECT_INPUT" --target-path "$TARGET_PROJECT_PATH" --base-path "$USER_WORKSPACE_ROOT" --intent new
```

纯默认新建请求使用：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message resolve-project --project-input "$PROJECT_INPUT" --base-path "$USER_WORKSPACE_ROOT" --intent new
```

只有宿主未提供可用的当前工作区根，或默认根校验与候选定位后仍无法唯一确定项目时，才执行标准消息，送达 stdout 后立即等待：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message context-required --missing-items "项目路径"
```

定位候选时，`SEARCH_INPUT` 使用用户提供的搜索范围，未提供时固定“当前目录”：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message locate-projects --base-path "$USER_WORKSPACE_ROOT" --search-input "$SEARCH_INPUT" --format message
```

语言固定 `SERVER_LANGUAGE=Node.js`。新项目默认 Express；现有项目优先从 `package.json` 依赖推导，无法推导时沿用现有结构。用户明确框架时传第二条：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message framework-resolve --project-selection "$PROJECT_SELECTION" --project-path "$PROJECT_PATH" --language Node.js
```

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message framework-resolve --project-selection "$PROJECT_SELECTION" --project-path "$PROJECT_PATH" --language Node.js --framework "$USER_FRAMEWORK"
```

只接受唯一 JSON 中 `language=Node.js`、非空 `framework` 和合法 `frameworkSource=EXPLICIT|DEFAULT_NEW_PROJECT|PROJECT_INFERRED|PROJECT_STRUCTURE_FALLBACK`。新项目先按该框架初始化最小 Node.js 项目并校验 `package.json`，再以 `PREPARED_NEW_PROJECT` 继续。已有项目保持结构和其他支付能力，只做局部修改。

项目、框架和语言唯一后加载 `flow integration prepare`。
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_ENTRY:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_PREPARE:START -->
## 步骤 1：环境与沙箱准备

完成条件：

- [INT.ENV.PROJECT_LANGUAGE_READY] 唯一项目包含 `package.json`，服务端语言为 Node.js。
- [INT.CONTEXT.PLATFORM_RESOLVED] `integration-context platform` 返回唯一 Coze 脱敏事实，输出不得包含 `COZE_PROJECT_ID`。
- [INT.ENV.CLI_READY] `env integration-check` 完成检测、必要的用户级自动准备和复检，返回有效 `CLI_ENV:READY`。
- [INT.SANDBOX.PREPARATION_RECORDED] 沙箱状态唯一为 `READY|CREATE_PENDING|VERIFY_PENDING`。

先执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-context platform --server-language Node.js
```

只接受唯一 `ALIPAY_AIPAY_INTERNAL:INTEGRATION_PLATFORM_CONTEXT=<json>`，其中 `platform=coze`、`server_language=Node.js`、`product_hint=webpay`。随后执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" env integration-check
```

env 入口固定先检测，并在需要时自动准备 `jq`、`alipay-cli` 到 `~/.local/bin` 后复检。`CLI_ENV:READY` 时直接继续，不再重跑。唯一 `CLI_ENV:UNAVAILABLE` 表示本次自动准备或复检仍未成功：完整读取 `../normal/alipay-cli-env.md`，将当前 stdout 的登记消息原文送达并停止；内部 `CLI_ENV_MISSING` 只用于平台排查，禁止对客。stdout 为空或 marker 缺失、重复、冲突时停止核对。Agent 不得在统一入口之后自行执行 `which alipay`、`npx alipay`、近似命令、直连安装器或包管理器。

随后执行唯一快速沙箱入口：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox ensure "$PROJECT_PATH" Node.js
```

`ensure` 只按同一项目 `.alipay-sandbox.json` 是否存在分流：不存在时创建，存在时验证。禁止先读配置、重复创建或覆盖。单次创建的所有可重试场景共用“初次 + 最多 2 次”总预算：结构化响应明确 `success=false`、`success=true` 但缺少必含字段，或调用明确连接前未发送时，每次间隔 3 秒重试；任一次成功立即停止。timeout、断连、服务不稳定、发送阶段不明或响应无法唯一解析时不自动重放。接受的互斥终态：

- `READY`：退出码 0，唯一 `SANDBOX_ENSURE_ACTION=CREATED|VERIFIED`、同一项目 `SANDBOX_CONFIG_PATH` 和 `FLOW:SANDBOX_CONFIG_READY`；stdout 为空。
- `CREATE_PENDING|VERIFY_PENDING`：退出码 0，stdout 是唯一登记正文，内部路径和对应 `FLOW:SANDBOX_CONFIG_PENDING_*` 唯一，且没有 READY marker。发送正文后继续代码开发。`CREATE_PENDING` 表示本次安全重试预算已耗尽，或结果无法确认且可能已经创建；进入该终态后禁止自动重放。只有用户之后明确接受可能新建一个沙箱并要求再次创建时，才允许对同一项目执行一次 `sandbox ensure`。`VERIFY_PENDING` 只允许在用户要求恢复后执行 `sandbox reverify`，不得删除、覆盖或重建现有配置。
- 创建前本地 CLI 状态权限不足：退出码 77 且同时出现 CREATE pending、`SANDBOX_LOCAL_FS_PERMISSION_MODE=CREATE` 和 `CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION`。暂存 stdout，取得宿主权限后原样重试一次；重试仍待配置或无法授权时只发送选定的一份正文。

命令非 0、marker 缺失/重复/冲突、路径不一致或含 `SANDBOX_ERROR` 属于协议失败，停在本步骤；不得降级为 pending、直调 MCP 或追加诊断。创建请求可能已发出时禁止重放。

命中上述协议失败，或用户明确要求沙箱配置与重试详情时，才完整读取 [`modules/sandbox/sandbox-setup-guide.md`](modules/sandbox/sandbox-setup-guide.md)。只有该指南的“条件参考路由”要求核对固定 MCP 方法、请求、响应或创建重试边界时，才继续读取其链接的 `alipay-sandbox-tool.md`；读取参考不解除本步骤的停止条件，也不授权直调 MCP。

准备阶段不展示摘要、账号密码或“沙箱测试通过”。

## 步骤 2：非阻塞开发方案

产品固定 `PRODUCT_TYPE=webpay`、`PRODUCT_NAME=AI 网页应用收款`。使用步骤 1 的项目和框架事实执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message start-confirm --product-type webpay --product-name "AI 网页应用收款" --project-path "$PROJECT_PATH" --project-selection "$PROJECT_SELECTION" --language Node.js --framework "$FRAMEWORK" --framework-source "$FRAMEWORK_SOURCE"
```

runner 失败时不得手写方案或继续。成功必须有唯一 `CUSTOMER_MESSAGE_DELIVERY_REQUIRED=integration.start.confirm`；命令后的下一个动作先把 stdout 原文作为可见进行中消息送达，送达前禁止调用工具。该消息不是最终答复；送达后同一回合立即加载：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow integration development --product-type webpay
```

`full_process` 同样只由本步骤生成并送达这一次方案；父级 `../normal/full-process-routing.md` 不生成方案。
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_PREPARE:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_DEVELOPMENT:START -->
<!-- ALIPAY_AIPAY_STAGE:integration.user_confirmed -->
<!-- ALIPAY_AIPAY_STAGE:integration.pre_dev_reading.start -->
## 步骤 3：沙箱复核

步骤 1 为 pending 时保持原状态，不读取配置或重复展示消息。

仅在 `READY` 时执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox reverify "$PROJECT_PATH" Node.js
```

只接受同一路径的 `READY` 或 `VERIFY_PENDING`；`reverify` 出现创建终态属于协议失败。命中终态后禁止追加配置探测。

## 步骤 4：按固定顺序读取开发依据

执行一次：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-context resolve --product-type webpay --server-language Node.js
```

只接受唯一 `INTEGRATION_CONTEXT`。其中 `required_reading` 必须是无重复路径数组，首项固定为 `modules/interface-contract/webpay-interface-contract.md`，第二项固定为 `development_reference=modules/coze-development-guide.md`；完整集合必须恰好由该 `development_reference`、同一响应的 `sdk_reference`、`platform_reference`、全部 `contracts` 和全部 `examples` 组成。先完整读取首项接口契约，再读取 Coze 开发指南，随后严格按数组余下顺序完整读取；全部完成前禁止修改项目代码。路径必须位于当前 Integration 目录且真实存在；默认不联网。只有本地依据缺失、字段不确定、排查官方错误码、用户明确要求或官方能力变化时，才读取当前契约 `sourceUrl` 的直接官方页面；仍无依据时停止，禁止猜测。

读取完成后加载：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow integration implementation --product-type webpay
```
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_DEVELOPMENT:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_IMPLEMENTATION:START -->
<!-- ALIPAY_AIPAY_STAGE:integration.code_dev.start -->
## 步骤 5：代码实现

在 runner 已校验的项目根内实现并自检：

- [INT.CODE.INTERFACES_COMPLETE] `alipay.trade.page.pay`、交易查询、退款、退款查询、关闭交易和异步通知全部存在于非测试生产源码。
- [INT.CODE.NODE_SDK_VERIFIED] 已读取项目 `package.json`、当前模块制式，以及实际 `alipay-sdk` 的包元数据和类型定义；没有从示例猜导入或方法。
- [INT.CODE.CONFIG_VERIFIED] 沙箱 `READY` 时 `alipay-sdk-config.ts` 稳定读取同一项目根 `.alipay-sandbox.json` 的 PKCS#1 `appPrivateKey`、`appId`、`alipayPublicKey`，不读取 PKCS#8 `appPrivatePkcsKey`，并显式使用固定完整沙箱网关 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` 与 `RSA2`；pending 时配置缺失明确失败，无占位值。
- [INT.CODE.CONFIGURATION_PRESERVED] 当前 Skill 的代码开发结果固定为沙箱开发配置：沙箱 `READY` 时服务端通过 `alipay-sdk-config.ts` 读取 `.alipay-sandbox.json` 并使用固定沙箱网关；沙箱 pending 时加载器明确失败。不得新增 `integration-alipay` 生产加载器、生产 appId 注入、正式网关替换、自动环境切换或生产失败回退沙箱。现有项目若已有生产配置路径，本轮不修复、不转换、不作为完成依据；只在不破坏用户既有代码的前提下完成当前沙箱开发范围，无法保持边界时记录阻断缺陷。
- [INT.CODE.SANDBOX_DEPLOYMENT_GUARD] 项目 `scripts/build.sh` 已接入受管部署检查；开发构建可使用沙箱，任何非 `DEV` 构建都必须在 `alipay-sdk-config.ts`（旧 Python 兼容 `alipay_sdk_config.py`）中仍能命中沙箱域名时失败。
- [INT.WEBPAY.RETURN_IMPLEMENTED] 用户未明确关闭同步回跳时实现真实 `return_url` GET 路由；同步参数不作为付款成功依据。关闭回跳时仍保留通知、查询和订单查询页。
- [INT.WEBPAY.BROWSER_FLOW] 点击支付后显示应用内 loading，创建支付并提取隐藏 form，在当前页显式提交到固定 HTTPS 网关。无浏览器原生 `confirm/alert/prompt`、全屏白色遮罩、新标签页或 `innerHTML` 脚本依赖，不使用 `document.write`；只有用户明确要求或项目既定体验需要时才保留应用内确认 modal。
- [INT.WEBPAY.ORDER_AUTHORITY] 商户订单号、商品和应付金额只由服务端按可信业务事实生成并持久化；不信任客户端购物车、localStorage、展示价格或请求金额，不把无效价格兜底为 `0` 后继续下单。
- [INT.WEBPAY.RESULT_CONTRACT] 新项目的商户 `return_url`、结果页和查询 API 统一使用内部 `outTradeNo`/`tradeStatus`，已有项目至少端到端同名；状态渲染有 `UNKNOWN` 兜底，不把 camelCase 当作支付宝官方字段。
- [INT.CODE.SAFETY] 密钥不进入源码、日志、`.env`、测试快照或注释；沙箱与生产不互相回退，无支付验证旁路。

Node.js 下单固定 `pageExec()` 和 `FAST_INSTANT_TRADE_PAY`。异步通知接收表单、先验签、再校验订单归属和金额，持久化幂等后返回纯文本 `success`。退款使用十进制定点金额并区分新退款与未知结果重试。

依赖只在缺失时用项目现有包管理器安装并更新锁文件。保持现有框架、路由、数据层和错误处理；不得用内存订单替换生产持久化，也不得整体重建既有文件。

代码写入后从当前项目证据登记 `CONFIGURATION_STATE`：沙箱开发配置可唯一证明时为 `SANDBOX_ACTIVE`；无法确认当前生效配置或发现无法安全隔离的生产/沙箱混用时为 `UNRESOLVED`。当前 Skill 不把项目记为生产配置完成。沙箱开发的单一 SDK 入口固定为 `alipay-sdk-config.ts`，随后执行受管构建检查安装动作：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox-check install-build-guard "$PROJECT_PATH" Node.js
```

只接受唯一 `SANDBOX_BUILD_GUARD=INSTALLED` 内部终态。动作固定维护项目根 `alipay-sandbox-check.mjs` 和 Coze 原始构建入口 `scripts/build.sh` 中唯一受管标记块；不得手写、拆解或改名。`scripts/build.sh` 缺失、不是普通文件、受管标记异常或同名文件不属于本 Skill 时立即停止，不创建占位构建入口、不覆盖用户内容。安装成功后再加载：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow integration verification --product-type webpay
```
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_IMPLEMENTATION:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_VERIFICATION:START -->
<!-- ALIPAY_AIPAY_STAGE:integration.local_verify.start -->
### 配置与本地验证

先运行项目已有的语法、静态检查和定向测试；能修复的本轮问题先修复并重跑。不得为默认验证安装浏览器、切换 Node 版本或发起真实交易。随后先核验部署期 guard：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox-check verify-build-guard "$PROJECT_PATH" Node.js
```

当前 `CONFIGURATION_STATE=SANDBOX_ACTIVE` 时执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox-check development "$PROJECT_PATH" Node.js
```

第一条 guard 命令只接受唯一 `SANDBOX_BUILD_GUARD=VERIFIED`；开发配置检查只接受唯一 `SANDBOX_DEVELOPMENT_CHECK=PASSED`。`scripts/build.sh` 受管块在 `COZE_PROJECT_ENV=DEV` 时跳过；变量缺失或任何非 `DEV` 值均执行项目内 guard，失败显式 `exit 1`。该变量只控制构建检查，不参与 SDK 运行时选环境。开发检查只看 `alipay-sdk-config.ts`（旧 Python 兼容 `alipay_sdk_config.py`）中的 guard 缺失/改动、沙箱加载器缺失、沙箱配置字段映射缺失、固定完整沙箱网关缺失或网关非法；即使存在其他环境判断也不放行，先修复并原样重跑。

`CONFIGURATION_STATE=SANDBOX_ACTIVE` 且 `sandboxConfigState=READY` 时：

1. 严格核对服务端实际加载器、字段映射、PKCS#1 原始值、Git 忽略和无敏感副本。
2. 再执行 `sandbox verify "$PROJECT_PATH" Node.js`；只消费登记终态，不手工读配置。
3. 配置后置校验通过后执行摘要：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox summary webpay "$PROJECT_PATH" Node.js
```

本阶段不得调用 `integration_detail` 或其他宿主集成详情能力。该工具会唤起生产凭证配置卡片，不属于代码验证或沙箱配置。静态验证通过、沙箱配置 `READY` 或摘要已展示，都不代表沙箱付款已完成、生产凭证已配置、项目已转换为生产配置或整体“100% 就绪”。

暂无公网 HTTPS `notify_url` 时保留完整通知代码并省略请求字段，以交易查询验收，执行一次登记消息：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message local-acceptance-notice
```

该模式只能称本地验收，公网通知列为人工待验证。完成后加载：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow integration acceptance --product-type webpay
```
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_VERIFICATION:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_ACCEPTANCE:START -->
<!-- ALIPAY_AIPAY_STAGE:integration.sandbox_acceptance.start products=webpay -->
## 步骤 6：沙箱付款体验

只在 `CONFIGURATION_STATE=SANDBOX_ACTIVE`、沙箱 `READY` 且配置后置校验通过时执行；pending 或 `UNRESOLVED` 时跳过全部沙箱依赖动作并进入步骤 7。不得为展示沙箱体验临时切换或伪造配置。

从目标项目取得真实启动命令、支付页地址和回跳分支。禁止示例端口、占位 URL 或把 `curl` 取得的 HTML 表单当作用户入口。

默认回跳分支必须 GET 验证精确 `return_url` 无 404、500、认证或重定向循环；有浏览器能力时验证页面非空白和无可见错误，没有 UI 证据时记人工待验证。关闭回跳分支必须有用户先前明确表达，并确认请求未传 `return_url`，同时验证通知、交易查询和订单查询页。

上一步 `sandbox summary` 已负责展示一次经验证的沙箱配置；本步骤不得再次读取、传递或复述账号密码。`RETURN_MODE` 只允许 `RETURN|NO_RETURN`：默认回跳分支用 `RETURN`，用户已明确关闭同步回跳时用 `NO_RETURN`。执行唯一托管入口：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message webpay-sandbox-experience --start-command "$START_COMMAND" --payment-url "$PAYMENT_URL" --return-mode "$RETURN_MODE"
```

stdout 原文告诉用户该项目会使用前面展示并写入本机的沙箱配置，给出真实启动命令、支付页地址、沙箱买家登录方式和结果判断。任一参数未知或 runner 失败时不输出半模板，记录“未提供浏览器付款入口或完整操作指引，需先补齐”。

用户暂不付款不阻塞 checklist，但记录“已提供浏览器付款入口和操作指引，实际付款及结果验证仍以用户完成情况为准”。没有完整入口或配置 `UNRESOLVED` 时记录“未提供浏览器付款入口或完整操作指引，需先补齐”。只有用户实际完成且有查询或已验签通知证据时记录“已提供浏览器付款入口和操作指引；用户已完成一笔沙箱付款，结果只按实际核验证据记录”。任何分支都不得表述为“沙箱测试通过”。

## 步骤 7：安全与上线提醒

当前 Skill 不在本步骤唤起 Coze 密钥卡片，不读取卡片状态，不索取生产 appId，不把项目转换为生产配置。用户明确提出上线、正式环境、支付密钥托管或沙箱/demo 转正式时，也只把该需求记录到安全提醒和最终待办中；后续由 Coze 平台独立生产链路处理。

后续生产链路的完整提示口径统一见 [`modules/coze-runtime.md`](modules/coze-runtime.md)。当前 Integration 阶段不调用 `integration_detail`，不触发或模拟 `alipay-payment-production-integration`，也不请求、读取或处理生产应用私钥；用户后续主动触发上线前准备交接时，必须先通过 `integration_detail('integration-alipay')` 唤起卡片，再进入独立生产 Skill。

`ACCEPTANCE_SUMMARY` 只概括本轮沙箱/本地验收边界，不含项目 ID、凭证或原始结果。执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message safety-closeout --variant WEBPAY --acceptance-summary "$ACCEPTANCE_SUMMARY"
```

stdout 是唯一正文。`integration_only` 的最终 checklist 提醒仍需产品开通；`full_process` 只有代码、安全和依据无阻断时才继续 Onboarding。随后加载：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" flow integration checklist --product-type webpay --project-path "$PROJECT_PATH"
```
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_ACCEPTANCE:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_CHECKLIST:START -->
<!-- ALIPAY_AIPAY_STAGE:integration.checklist.start -->
## 步骤 8：最终 checklist

阶段 loader 输出唯一 `CHECKLIST_SCOPE_RECEIPT` 并附带当前全部适用清单。receipt 只绑定 `WEBPAY`、项目路径和当前快照，不证明检查通过。执行代码阅读、配置后置校验、已有语法/静态检查与无需安装依赖、联网或长期监听的定向测试；环境能力不足的项目记人工待验证，不扩展排查。

逐项汇总实际证据。可直接修复时先修复并重检；项目变化后旧 receipt 失效，必须重新加载 checklist 阶段。准备最终结论时执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message checklist-result --variant WEBPAY --project-path "$PROJECT_PATH" --scope-receipt "$CHECKLIST_SCOPE_RECEIPT" --configuration-state "$CONFIGURATION_STATE" --overall-result "$OVERALL_RESULT" --failed-items "$FAILED_ITEMS" --manual-items "$MANUAL_ITEMS" --webpay-experience-result "$WEBPAY_EXPERIENCE_RESULT" --sandbox-config-state "$SANDBOX_CONFIG_STATE" --blocking-defect-state "$BLOCKING_DEFECT_STATE" --execution-mode "$EXECUTION_MODE" --next-flow-reminder "$NEXT_FLOW_REMINDER"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message checklist-result --variant WEBPAY --project-path "$PROJECT_PATH" --scope-receipt "$CHECKLIST_SCOPE_RECEIPT" --configuration-state "$CONFIGURATION_STATE" --overall-result "$OVERALL_RESULT" --failed-items "$FAILED_ITEMS" --manual-items "$MANUAL_ITEMS" --webpay-experience-result "$WEBPAY_EXPERIENCE_RESULT" --sandbox-config-state "$SANDBOX_CONFIG_STATE" --blocking-defect-state "$BLOCKING_DEFECT_STATE" --execution-mode "$EXECUTION_MODE" --next-flow-reminder "$NEXT_FLOW_REMINDER" [--business-description "$BUSINESS_DESCRIPTION"]
```

参数契约：

- `OVERALL_RESULT` 只允许“通过、部分通过、未通过”。
- `FAILED_ITEMS`、`MANUAL_ITEMS` 是含下一步的单行值，无项目传“无”。
- `SANDBOX_CONFIG_STATE` 只允许 `READY|CREATE_PENDING|VERIFY_PENDING`。
- `CONFIGURATION_STATE` 只允许 `SANDBOX_ACTIVE|UNRESOLVED`，必须来自当前项目证据。沙箱开发配置可唯一证明时为 `SANDBOX_ACTIVE`；发现当前生效配置无法确认、生产/沙箱混用或不能安全保持当前 Skill 边界时为 `UNRESOLVED`。当前 Skill 不把项目配置记为生产完成。
- 接口、安全、当前配置对应的加载器或必要依据有缺口时 `BLOCKING_DEFECT_STATE=PRESENT`，否则 `NONE`。`UNRESOLVED` 必须为 `PRESENT`。单纯沙箱待配置、UI 或公网通知待验证不算阻断；生产密钥卡片和生产配置替换不属于当前 checklist。
- `WEBPAY_EXPERIENCE_RESULT` 必须逐字取前三个登记值之一，不得缩写、概括或改写；“当前为已有生产配置路径，本轮未切换到沙箱付款体验”不属于当前 Skill 的有效结果。
- `integration_only`：`EXECUTION_MODE=仅代码开发`，`NEXT_FLOW_REMINDER` 固定为“正式上线前还需完成支付产品-产品开通。”。
- `full_process`：`EXECUTION_MODE=完整接入`。`NEXT_FLOW_REMINDER` 必须逐字使用登记值：沙箱为 pending 时用“沙箱配置尚未完成，但不阻塞本轮继续支付产品-产品开通；完成配置后再进行沙箱测试。”；否则有人工待验证项时用“代码开发自动校验已完成，仍有人工待验证项；本轮继续产品开通。”；否则用“代码开发校验通过后将自动进入支付产品-产品开通；未通过时停留在代码开发。”。代码无阻断时，“通过”或仅有沙箱/UI/公网通知非阻塞项的“部分通过”继续 Onboarding；其他情况停在 Integration。
- runner 会在最终正文成功后输出唯一 `FULL_PROCESS_INTEGRATION_HANDOFF`，父级只能使用该 JSON 衔接，禁止从 `OVERALL_RESULT`、`MANUAL_ITEMS` 或正文再次推导另一套状态。若本轮原始请求提取到经营描述，handoff 还会附带 `business_description`，父级必须优先复用它作为 Onboarding 的 MCC 查询输入。

runner 固定 implementation audit 会再次执行同一上线防误用检查，覆盖 `.js/.mjs/.cjs/.ts/.tsx/.jsx/.html/.htm/.vue/.svelte` 中的当前项目源码。准备调用最终 `checklist-result` 前，Agent 可基于已读代码最多执行一轮直接修复；项目变化后旧 receipt 失效，必须重新加载 checklist 阶段并只重跑一次最终命令。最终 runner 若仍发现 audit 缺口，会直接把缺口合入本次 checklist 正文并收口为“未通过”，不再输出空 stdout 的修复 marker。禁止在同一批 audit finding 上反复改写、重跑或为了满足静态扫描迁移项目目录；语义已实现但静态扫描仍无法证明时，按未通过正文收口并保留具体缺口，不新增用户确认。

同一次流程只渲染一次最终结果，stdout 前后不追加第二份摘要。只有全部适用项有本轮证据、无人工项，且当前 `SANDBOX_ACTIVE` 路径的沙箱为 `READY` 时，才能称代码开发完成；`UNRESOLVED` 永远阻断。沙箱配置、配置后置校验、摘要、付款入口或用户付款都不得改写为笼统“沙箱测试通过”“沙箱已全部完成”或“100% 就绪”。

用户报告报错时才读取 `modules/troubleshooting-flow.md`。`full_process` 进入 Onboarding 后，Onboarding 不修改项目代码；本 Skill 不把项目操作权交回 Integration 执行生产配置转换。
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_CHECKLIST:END -->

<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_TROUBLESHOOTING:START -->
## AI 网页应用收款只读排障

本阶段只用于用户要求解释、定位或排查问题，且未要求修改代码。用户明确要求修复项目时不进入本阶段，使用 `integration-bootstrap` 的默认 `development` 模式。

1. 先确认报错接口或环节、沙箱/生产环境、可脱敏错误码与实际现象。信息不足时只询问当前缺项并等待，禁止猜原因或先改项目。
2. 完整读取 `modules/troubleshooting-flow.md`。需要项目证据且用户已提供项目路径时，只读检查相关 Node.js 源码、`package.json`、已安装 SDK 类型定义和非敏感配置结构；不创建沙箱、不安装依赖、不修改文件、不发起交易或业务写操作。
3. 结论只来自当前项目证据、已读本地契约、实际返回或登记官方资料。无法确认时明确说明缺少的证据和官方后续入口，不尝试近似 MCP 方法或恢复旧自动诊断工具。
4. 对客结论须包含“已确认事实、无法确认的部分、下一步”。有依据地定位并给出可执行排查结论时使用 `RESOLVED`；穷尽登记依据仍无法确认时使用 `UNRESOLVED`。在最终答复前执行静默终态：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message troubleshooting-terminal --outcome <RESOLVED|UNRESOLVED>
```

该命令 stdout 为空；只完成当前 `integration_only` run 的终态记录，不替代、增删或改写已准备的对客排障结论。尚在等待用户补充信息时不执行终态。
<!-- ALIPAY_AIPAY_FLOW:INTEGRATION_TROUBLESHOOTING:END -->
