# 支付宝 AI 付 Skill
## 支持范围

仅支持 Coze Node.js 项目的 AI 网页应用收款；“网站支付”“H5 支付”等旧称仅作输入别名，对客仍用新名称。目标产品固定 `productType=webpay`，服务端语言固定 Node.js；明确要求 AI 按量付费、APP 支付、其他服务端语言、当面付、付款码、订单码支付、JSAPI 支付、预授权支付或商家扣款时不得改判，按 `normal/rejection-guide.md` 受控拒绝。

AI 网页应用收款覆盖 PC 网页和手机浏览器/H5，接口固定 `alipay.trade.page.pay`，签约固定 `productType=webpay`、`salesCode=I1080300001000041203`、`appType=PC_WEB`；`PC_WEB` 不表示仅 PC。

沙箱网关固定为完整地址 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；`.alipay-sandbox.json` 不提供网关字段，项目代码必须显式使用该固定值。旧地址 `openapi.alipaydev.com`、HTTP、仅 hostname、缺少 `/gateway.do` 或其他变体均禁止使用。

普通代码开发完成后，项目当前生效配置保持沙箱；`full_process` 只串行完成代码开发和产品开通，不执行生产上线、沙箱/demo 转正式或生产配置替换。Onboarding 收口必须提醒用户前往支付宝 AI 付站点（https://aipay.alipay.com/?from=alipay-aipay-skill-coze）首页-一站式接入-AI网页应用收款-产品开通节点查看产品开通状态。后续生产链路统一见 [`integration/modules/coze-runtime.md`](integration/modules/coze-runtime.md)；当前 Skill 的代码开发和产品开通过程不唤起卡片、不处理生产私钥。用户后续主动触发上线前准备时，当前 Skill 只负责按固定交接顺序先唤起 Coze 全局密钥卡片，再衔接独立生产配置技能。

所有网站支付业务 `alipay-cli` 调用固定携带 `PLATFORM=coze`、优先取非空 `COZE_PROJECT_ID` 的 `PLATFORM_ID`、`PRODUCT=WEBPAY` 和 `ALIPAYCLI_BIZ_INFO={"skill":"alipay-aipay","skill_version":"coze_v1"}`；能从当前 Coze 环境取得合法 `COZE_PROJECT_SPACE_ID` 时，同一 JSON 还必须带 `skill_user_id`。`COZE_PROJECT_ID` 缺失时 `PLATFORM_ID` 才回退当前 telemetry run context。匿名沙箱创建也必须携带同一组上下文。这些字段只用于 CLI 上报上下文，不写入 MCP 请求 JSON。`alipay-cli version` 的环境检测与安装复检不属于业务调用，不伪装成业务上报。

## 执行红线

1. **流程与确认**：按 flow 顺序执行；阻塞确认只认用户对当前摘要的明确回复，不以工具超时、默认值或 Task 状态代替，不增未登记操作、材料或确认。
2. **事实与依据**：禁止编造配置、状态、结果或规则；无当前实现、实际返回或官方依据时说明无法确认。额度解限、可收款时间和产品开通问题用[支付宝商家平台](https://b.alipay.com/page/portal/home)，代码、应用创建和发布问题用[支付宝开放平台](https://open.alipay.com/)或[支付宝技术支持](https://opensupport.alipay.com/support/intelligent-services?form=payskill)。静态扫描或提交成功不等于完成。
3. **CLI/MCP 契约**：优先用动作处脚本；依赖只经 `runtime.mjs env check|integration-check` 检测和按需自动准备。Node.js 是 runtime 启动前置，不由 Skill 安装或切换；`jq` 或 `alipay-cli` 缺失/功能异常时，由 env 入口统一安装到 `~/.local/bin` 并复检。自动准备失败时发送登记消息并停止。Agent 禁止把准备过程拆成自行执行的 `which alipay`、`command -v alipay`、`type alipay`、`npx alipay`、近似可执行名、直连安装器或包管理器。直调的完整 MCP 方法和 JSON 仅来自已读文档或 `alipay-cli mcp list <server> --json` 实时 schema。遇到 `Server not found`、`Method not found`、`Invalid params` 立即停下核对，禁止试近似名称。
4. **联网权限**：env 自动准备、`alipay-cli` 登录/MCP、上传和沙箱创建按联网命令处理；支持显式授权时首次即申请，详见 `normal/alipay-cli-env.md`。env 入口只允许在 `~/.local/bin` 准备登记的 `jq` 与 `alipay-cli`，不写系统目录、shell rc 或 Skill 目录。
5. **用户文件**：只改 runner 已校验的项目和用户明确要求的范围，不清空或删除既有项目；“新建/重做/换一个”不是删除授权。具体删除仍遵守 Integration flow 的清单、二次确认和禁删边界。
6. **材料、敏感信息与凭证字段**：Onboarding 材料请求只能使用 `material-collect` stdout；签约闭集只有首页、商品页、支付页三张截图，以及当前 MCC 回执明确要求时的特殊资质材料；应用闭集只有应用公钥。签约截图和特殊资质材料必须来自用户真实经营页面或真实资质文件，严禁 Agent 或任何 AI 生成、改写、伪造、代补、修图、套用示例图或虚构材料；特殊资质名称、组合和上传材料类型只能按当前 MCC 查询回执展示，禁止扩写、改名、解释为额外条件或补造材料要求。禁止另行索取真实姓名、身份证号、手机号、邮箱、店铺/网站名称、经营地址、网站域名或其他字段。应用公钥仅由用户生成并明确提供；禁止请求、接收、读取、校验、转换、保存、转发或复述生产私钥，禁止生成密钥对、补全/改写公钥或添加 PEM 头尾。Coze“支付宝支付密钥托管”卡片是全局一份，字段闭集只含 `app_private_key`、`alipay_public_key`；生产 `appId` 不在卡片内。禁止声称卡片含有、保存、持久化、自动配置或自动注入 `appId`，也禁止让用户在卡片中填写 `appId`。当前 Skill 只允许在用户主动触发上线前准备交接时调用 `integration_detail('integration-alipay')` 唤起卡片；该调用不得读取、解析、输出或保存卡片内生产私钥。用户提供的应用公钥仍禁止复述。应用动作从支付宝接口取得、已通过 RSA2 guard、绑定同一 appId 并安全导出的支付宝公钥，只允许由登记 application-result/closeout runner 校验文件后在应用结果中原样展示，不得放入参数、marker、日志、遥测或自由话术。敏感值、临时 URL 和沙箱资料遵守对应 flow/script 的白名单、权限和输出边界。
7. **沙箱与生产结论**：真实快速沙箱配置不得用占位值。沙箱生效代码只使用固定完整网关 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`，不得从配置猜测、缩写或使用旧地址。当前 Skill 不把项目转换为生产生效配置；生产上线或配置替换由 Coze 全局密钥卡片和独立 `alipay-payment-production-integration` 技能处理。`CREATE_PENDING|VERIFY_PENDING` 只允许继续代码实现，阻止字段使用、摘要、后置校验和付款体验。`CREATE_PENDING` 禁止自动重放，只有用户明确接受可能新建一个沙箱并要求再次创建时才执行一次 `ensure`；`VERIFY_PENDING` 恢复时只执行 `reverify`，不得删除、覆盖或重建现有配置。字段校验不等于支付测试。
8. **异步通知**：AI 网页应用收款必须实现通知。`notify_url` 用于接收支付宝侧异步发来的支付结果通知，项目代码按当前 Coze 项目实际域名和真实 POST 路由构造；用户未指定域名时默认用 `COZE_PROJECT_DOMAIN_DEFAULT`，用户指定域名时按 `COZE_PROJECT_DOMAIN_ALL` 核对当前项目自定义域名。本地无公网 HTTPS `notify_url` 时可不传并以交易查询验收，公网通知联调列为人工待验证；完备项目必须在异步通知之外提供有限次主动查询兜底，避免用户支付后未回到前端导致商户无法确认订单。生产上线前须恢复通知并完成验签、幂等、关键字段校验、`success` 回写和有限次补偿查询，否则不宣称生产就绪。
9. **受控页面**：授权链接仅由 `auth.sh` 按固定产品/MCC 生成，只允许 `https://aipay.alipay.com/cli-auth` 及登记参数，禁用 CLI `verification_url`；公钥页只展示 `createKeyConfirmPage` 实际返回且通过白名单校验的裸 URL。禁止搜索、改写、代填或自动操作页面。
10. **对客输出**：指定 runner/renderer/脚本时，stdout 是唯一对客正文，须原文回复且不加旁白；工具输出记录、折叠面板或日志不等于已对客发送。展示命令只执行登记单条命令，禁 `2>&1`、管道、`grep/sed/awk/tee`、临时包装或拆回 `jq/printf/renderer`。内部事实行均以 `ALIPAY_AIPAY_INTERNAL:` 开头；宿主合并输出时仍整行剔除，严禁对客。`integration.start.confirm`、`integration.production_credential.handoff` 和 `onboarding.plan.confirm` 成功时必须各自产生唯一 `ALIPAY_AIPAY_INTERNAL:CUSTOMER_MESSAGE_DELIVERY_REQUIRED=<messageId>`；下一动作先将 stdout 可见送达，不得以最终答复结束回合，送达前禁工具；送达后同回合继续，不等待回复。`integration.production_credential.handoff` 送达后的下一动作必须调用 Coze 宿主 `integration_detail('integration-alipay')` 唤起“支付宝支付密钥托管”卡片；该调用不是 shell、runtime、MCP 或项目运行时读取。卡片调用结束后才允许触发独立 `alipay-payment-production-integration` 技能；调用失败、宿主无该工具或名称不匹配时只保留手工入口并停止，不得尝试近似工具名或跳过卡片直接触发生产技能。`auth.page`、`application.key.page` 先独立送达包含可点击链接的 stdout，然后停止并等待用户明确回复已完成；不得自动轮询、不得合并 pending/收口。用户确认后只通过 `onboarding-recovery auth-confirm|application-key` 做一次状态查询。阻塞正文后等待；剔除内部行后正文为空则直接转移。
11. **确定性转移**：固定脚本终态后立即转移；只执行动作处登记命令，禁止追加 `jq/cat/grep/curl` 或临时脚本重复解析。失败只走登记恢复；项目自检不绕过 Skill 脚本或打印敏感配置。

## 标准消息

`normal/json/customer-messages.json` 是稳定对客正文唯一目录。Integration 启动使用 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message start-confirm`，收口使用 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message checklist-result`；Onboarding 的 MCC、发现、材料、候选、收口及授权、公钥页和错误均用登记 runtime 动作。用户询问 Coze 支付宝支付密钥配置有哪些字段、`appId` 是否在卡片内、是否随卡片保存/自动配置/自动注入，或要求核对/纠正相关说法时，只执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message credential-field-contract`，把 stdout 原文作为完整答复并停止自由补充；不得用 `integration_detail` 回答字段问题。`process.partial_result` 必须发送 closeout 动作的完整 stdout，缺少 AI 网页应用收款上线关键点、全局密钥配置影响或收款限制引导即未送达。仅无托管入口时直调 renderer：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" render --schema <messageId> --variant <VARIANT>
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" render <messageId> --variant <VARIANT> --input-json "$MESSAGE_INPUT_JSON"
```

动态 JSON 只取本轮事实；无变量传 `{}`，禁止字符串替换或 `eval`。正常路径禁止预跑 `render --schema` 或用 `jq`/消息目录探测字段。renderer 返回 `MESSAGE_RENDER_ERROR` 时必须先复查同一 `messageId` + `variant` schema，禁止猜枚举；非 0 即停止，不手写兜底。

`<SKILL_DIR>` 是启动器确定的当前 Skill 规范化绝对路径占位符，不是 shell 变量。Skill 自有受控 Node 和 Shell 入口必须使用文档登记的 `<SKILL_DIR>/references/...` 绝对路径单命令执行，禁止前置 `cd`、拼 `&&`、管道或退回相对路径；这些入口不新增权限确认或业务操作点。未登记命令和用户项目命令仍使用所在 Markdown 目录或 runner 已校验的项目根，不得借用 Skill 权限。

## 入口路由

根 [`../SKILL.md`](../SKILL.md) 已固定当前 Coze Skill 目录。运行时只按原始请求识别根意图并加载入口：

| 意图 | 判定 | 入口 | 后续按需加载 |
|---|---|---|---|
| 生产上线交接 | 只要求上线前准备、正式上线、生产配置替换、支付密钥托管、打开支付宝支付密钥卡片，或已完成代码开发和产品开通后要求继续上线；未要求本轮代码开发或产品开通 | 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message production-credential-handoff`，可见送达 stdout 后调用 Coze 宿主 `integration_detail('integration-alipay')`，再触发独立 `alipay-payment-production-integration` | [`integration/modules/coze-runtime.md`](integration/modules/coze-runtime.md) |
| `integration_only` | 只要求代码开发、支付集成，或“我已经是商家/已有商家”且明确要求把支付接入 Node.js 项目；未同时要求产品开通 | 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-bootstrap --root-intent integration_only --input-id "$USER_INPUT_ID"` | 产品/平台/语言依据 |
| `integration_only` | 只要求解释、定位或排查支付报错，没有要求修改代码 | 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-bootstrap --root-intent integration_only --input-id "$USER_INPUT_ID" --mode troubleshooting` | 只读取 Integration troubleshooting phase 和其登记依据 |
| `onboarding_only` | 只要求网站支付签约、我要签约、申请/我要成为商家、我要入驻、商家/商户入驻、产品开通或 `WEBAPP` 应用创建/发布，未同时要求代码开发 | 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-bootstrap --root-intent onboarding_only --input-id "$USER_INPUT_ID"` | 进入 `execute` 后只按 Onboarding flow 的“条件参考路由”读取当前命中的模块 |
| `full_process` | 明确要求完整接入、一站式，或同一请求同时要求代码开发和产品开通 | `normal/full-process-routing.md` | 先 Integration，满足衔接条件后 Onboarding |

`integration_only` 的 `integration-bootstrap` 只在同一 Node 进程串行执行 `telemetry start-run` 与 `flow integration entry`；`--mode troubleshooting` 则改为加载只读 `flow integration troubleshooting`。`onboarding_only` 的 `onboarding-bootstrap` 只串行执行 `telemetry start-run` 与 `flow onboarding entry`。两者均为无业务写入动作，执行后不得重复原子命令。`full_process` 不使用 bootstrap；衔接 Onboarding 时直接加载 `flow onboarding entry`，避免重复 `run.intent_detected`。排障请求一旦明确要求修改项目，必须回到默认 development 入口，不得在只读阶段改文件。

Coze 宿主 `integration_detail` 会唤起“支付宝支付密钥托管”卡片，不是只读环境检查；当前 `alipay-aipay` Coze 定制版只允许在“生产上线交接”入口按固定顺序调用一次 `integration_detail('integration-alipay')`，且必须早于独立 `alipay-payment-production-integration` 技能。普通代码开发、`full_process` 的 Integration 阶段、Onboarding 执行阶段、沙箱准备、代码验证和付款指引阶段禁止调用。生产上线、正式环境接入、支付密钥托管、沙箱/demo 转正式和生产配置替换的完整口径统一见 [`integration/modules/coze-runtime.md`](integration/modules/coze-runtime.md)；当前 Skill 不读取卡片字段、不处理生产私钥、不做生产配置替换。

Onboarding 支持模块不得扫描或默认预读。`onboarding_only` 与 `full_process` 进入 `execute` 后，统一以 [Onboarding flow 的条件参考路由](onboarding/flow.md#条件参考路由) 为唯一入口；只有表内实际阶段和触发条件同时成立时，才完整读取命中的模块。多个条件同时成立时按表内优先级读取，模块只解释已登记语义，不得改变 flow 动作、参数、重试或完成条件。

Integration 沙箱参考同样不得默认预读。只有 `prepare` 阶段登记的沙箱协议异常或用户明确询问沙箱配置与重试详情时，才按 [Integration flow 的步骤 1](integration/flow.md#步骤-1环境与沙箱准备) 先读取沙箱配置指南；冻结 MCP 契约只允许从该指南的二级条件入口继续读取。

用户只说“我已经是商家/已有商家”而未说明下一步时，先询问是要把支付接入/上线到 Node.js 项目，还是查询并继续网站支付签约或 `WEBAPP` 应用发布；澄清前不加载业务 flow、不查询账号、不创建沙箱或修改项目。回复同时要求两类事项时进入 `full_process`。

`full_process` 识别根意图后立即执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry start-run --root-intent full_process --input-id "$USER_INPUT_ID" --product-type webpay`。`integration_only` 和 `onboarding_only` 已由上表各自 bootstrap 包含同一次 `start-run`，不得重复执行本条 telemetry。命令创建/复用当前流程 `run_id`，并在遥测开启时记录 `run.intent_detected`：同一意图和产品继续复用，`UNKNOWN` 补全产品仍复用同一 `run_id`；明确换根意图或既有 run 已终态才重建。非空 `COZE_PROJECT_ID` 优先成为 `run_id`，再由现有 CLI 上下文作为 `PLATFORM_ID`，不得被显式 run ID 或本地生成值覆盖。业务 stage 只由登记 runner/script 异步记录。

遥测默认开启，`ALIPAY_AIPAY_TELEMETRY=0|false|off|no` 关闭事件/outbox/上传/flush；私有 run context 仍供 `PLATFORM_ID` 与终态生命周期。失败静默，不改变业务/消息/确认，stdout 空且 stderr 内部行不对客。`integration_only` 由 checklist 终结；Onboarding 由 closeout 或登记提前终止消息终结。上报权限不新增网络探针；实际低敏上传就是自然探测，collector 可达时不申请。任一终态后若 telemetry outbox 因 DNS、连接或超时失败积压，按 `normal/telemetry.md` 先本地状态判断，确实需要时按需申请补传权限；`flush-outbox` 前台小批量补传并优先发送 `run.terminal`，失败仍不影响业务收口。

用户输入计数是入口前置职责，统计窗口从首次触发本 Skill 的用户消息开始，到当前 `run_id` 的 `run.terminal` 事件生成为止。只计用户在 Agent 对话框发送的消息，不计宿主/系统/网页授权、扫码、Skill stage、runner 或工具调用。文字、图片/文件、空白/短确认、材料补充、确认回复和中途插话都按一条用户消息计；同一条消息含文字和图片/文件仍只计一条。`USER_INPUT_ID` 是当前用户消息的本地幂等键：Agent 从首次触发本 Skill 起，给每条新用户消息分配对话内单调序号，同一消息重试复用同一值。`USER_INPUT_ID` 不得包含或派生自用户输入内容、文件名、路径、截图/OCR、业务材料、stage 名或工具调用序号；运行时只保存其本地 hash，不上报。

`start-run` 自动把触发当前 run 的首条用户输入计为 `before-flow`；中断/压缩后以新 `USER_INPUT_ID` 重入同一未终态 run 时，`start-run` 按当前 phase 幂等补计该消息。Onboarding recovery 自动按当前 phase 幂等计数，禁止再为同一恢复回复额外执行 `telemetry count-user-input`。其他用户输入（中途打断、补材料、只上传图片/文件、只问问题等）若不经 onboarding recovery，先于任何 Skill 动作或业务答复按当前 phase 执行一次 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" telemetry count-user-input --phase before-flow|after-flow --input-id "$USER_INPUT_ID"`；重复同一 `USER_INPUT_ID` 不加计。`*.user_confirmed` 由 flow loader 自动标记起点但不计数，after-flow 从其后的下一条用户消息开始，前置澄清和候选不计 after-flow，`full_process` 不因 Onboarding 重置。closeout 默认从本地 run state 派生计数；状态为空时用首条输入的最小合法计数，状态不可用且已核对时才显式传三项，runner 拒绝缺项、负数、`after > total`、已观测 flow start 但 `after >= total`。`terminal_reason` 为终态 runner 写入的固定低敏枚举，禁自由文本、错误详情和业务响应。不新增业务确认点或独立上报；入队后当前 `run.terminal` 文件做短超时前台 drain，失败保留 outbox 且不影响业务收口，网络类失败进入通用补传判断。脚本以当前 `run_id` 为 `PLATFORM_ID`；Agent 不手写环境前缀或改 MCP payload；维护诊断/outbox/上传/flush 见 `normal/telemetry.md`。

三种入口的产品固定为 AI 网页应用收款，不执行产品推荐或 `product-clarify`。MCC 尚无检索输入时使用 `mcc-clarify`；已有经营描述后统一调用 `mcc resolve-plan` 实时查询当前产品支持类目、按需结合 Agent 提供的 `semantic-terms-json` 复核匹配并渲染方案。唯一 MCC 事实必须来自同一入口生成的 `MCC_CONTEXT_RECEIPT`，后续授权和签约都必须绑定该回执。不得拆回旧静态表、`mcc-search + mcc-candidates`、先旧检索失败后临时猜测，或为方案展示再拼 renderer 输入。

代码开发或完整接入未提供项目位置时，不向用户补问：固定令 `PROJECT_INPUT=当前项目`，把宿主提供的 Coze 当前工作区根作为 `USER_WORKSPACE_ROOT`，先执行 `resolve-project --intent existing`。不得把 Skill 目录、Agent 启动目录、用户 Home 或猜测的 Coze 绝对路径代替当前工作区根。只有默认根不可访问、不是可识别的 Node.js 项目根或无法唯一确定项目时，才用 `locate-projects` 和 `integration.context.required` 的既有分支澄清，校验完成前不修改任何目录。用户明确提供项目路径或要求新建项目时以原始输入为准；明确新建产物固定用 `resolve-project --intent new`，含名称或位置时由 Agent 解析 `TARGET_PROJECT_PATH` 并传 `--target-path`，runner 只校验路径和目录状态，不解析自然语言或把原话当目录名，纯默认新建才省略。所有路径经 `resolve-project` 后再用 `framework-resolve`：服务端语言固定 Node.js，框架缺失不补问；新项目默认 Express，现有项目从 Node.js 依赖推导或沿用结构，用户明确 Node.js 框架优先。

每轮代码开发只渲染一次非阻塞 `integration.start.confirm`，覆盖步骤 1 至步骤 8；对应 `CUSTOMER_MESSAGE_DELIVERY_REQUIRED` marker 唯一且 stdout 可见送达后，直接进入步骤 3，不生成或复验方案 receipt。after-flow 起点：`full_process=integration.user_confirmed` 且 Onboarding 不重置，`onboarding_only=onboarding.user_confirmed`，前置澄清/方案不计。Onboarding 只保留一次非阻塞方案展示；同样只有 marker 唯一且 stdout 已可见送达，才允许在 MCC 唯一事实有效后执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-execute-ready --product-type webpay`。该组合动作只串行加载 `flow onboarding execute` 并执行既有 `env check`，不跨用户输入、授权页或任何写操作；执行后不得再重复单独加载 execute phase 或重复环境检查。两类方案送达后都自动继续，不等待回复。签约材料完整后直接提交，新建应用公钥校验成功后直接提审。

扫码页是阻塞确认点：授权页和应用公钥确认页送达后立即停止当前流程，等待用户扫码完成后在 Agent 对话框回复确认；收到确认回复后经统一 `onboarding-recovery` 入口只查询一次状态，成功即推进，未确认则继续等待。不得自动轮询、不得用工具等待代替用户确认、不得在用户回复前调用 `auth wait`、`auth confirm`、`app verify-key` 或 `app verify-key-and-audit`。

`full_process` 代码开发方案送达前只准备项目、语言、Coze 环境和沙箱，并把原始请求中可安全抽取的经营描述保存为 `BUSINESS_DESCRIPTION`；若用户后续澄清或改选业务场景，以最新明确描述覆盖。方案送达后直接进入 Integration 步骤 3，满足条件自动进 Onboarding；仅沙箱待配置，或 READY 且只剩非阻塞人工验证时可部分通过，其他缺口停在 Integration；收口保留全部待办。用户中断后重新校验当前项目和服务端语言，从实际项目扫描恢复，同时优先恢复当前 run 中最新 `BUSINESS_DESCRIPTION` 作为 Onboarding MCC 查询输入；没有该事实时才重新澄清，不恢复旧方案状态。

仅代码开发结束时提醒仍需产品开通；仅产品开通结束时只说明本轮未核验代码开发或项目生产配置，不推断用户此前是否已完成代码。机器规则和消息目录不作为默认必读内容。
