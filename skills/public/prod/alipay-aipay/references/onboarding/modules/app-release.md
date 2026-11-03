# 应用发布业务语义

本模块只由 [`../flow.md` 的条件参考路由](../flow.md#条件参考路由) 在应用分支命中业务语义触发条件时读取，用于解释应用类型、候选复用、创建、公钥与提审边界。运行时命令以 flow 为准；参数、MCP payload、用户确认后的单次查询、解析和终态由 `scripts/app.sh` 实现。正常路径不预读本模块，也不从本模块复制命令或构造 MCP。

## 当前主流程 MCP 调用

| MCP 方法 | 用途 |
| --- | --- |
| `apprelease.queryApplicationList` | 查询应用列表 |
| `apprelease.createApplication` | 创建应用 |
| `apprelease.queryApplicationInfo` | 查询应用详情 |
| `apprelease.createKeyConfirmPage` | 创建应用公钥确认页 |
| `apprelease.queryApplicationSecurityKey` | 查询 RSA2 应用公钥和支付宝公钥 |
| `apprelease.submitApplicationAudit` | 提交应用审核 |

应用方法统一使用 `{"request":{...}}`，不得混入签约的 `ctx`。完整请求只在脚本维护。

### 参数结构对照表

| MCP 方法 | 脚本约束 |
| --- | --- |
| `apprelease.queryApplicationList` | 只传 `request.appTypes` |
| `apprelease.createApplication` | 固定创建 `WEBAPP`，只传 `applicationType` 和 `createScene` |
| `apprelease.queryApplicationInfo` | 传当前完整 `appId` |
| `apprelease.createKeyConfirmPage` | 传当前 `appId`、`RSA2` 和用户公钥 |
| `apprelease.queryApplicationSecurityKey` | 传当前 `appId`，可带同一用户公钥 |
| `apprelease.submitApplicationAudit` | 传当前完整 `appId` |

## 类型与候选

- AI 网页应用收款固定使用 `WEBAPP`。
- 应用列表请求只按 `appTypes` 查询；返回项只能称为同类型候选，不得声称已绑定当前支付产品。

`ON_LINE` 才可复用。空候选收材料；非空接受当前 appId 或 `新建+材料`；仅未上线时可 `暂不新建`；无效选择不写。复用前脚本重新按 `WEBAPP` 查询应用列表，并确认所选 appId 仍是唯一 `ON_LINE` 候选，再查询详情和密钥；列表无法证明时停止并刷新候选。材料齐后由固定组合入口轻量查询并比较快照：`UNCHANGED` 创建并生成公钥页；`CHANGED_EMPTY` 零写入送达空事实后，以新快照和原材料同回合重跑，不等待回复；`CHANGED_NONEMPTY` 零写入送达新候选后重选：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app create-from-snapshot --product-type webpay --sales-code I1080300001000041203 --application-type WEBAPP --previous-candidates-json "$APP_CANDIDATES_JSON" --public-key "<用户明确提供的完整publicKey>"
```

组合入口只编排既有 `list -> comparator -> create -> key`。写入前 `CONTRACT_ERROR` 直接停止，`SNAPSHOT_REFRESH_REQUIRED` 回到 discovery 刷新候选，`PREWRITE_FAILED` 才允许原样恢复一次；耗尽按 flow 收口。子步骤只转发登记终态，技术正文和 marker 禁止对客。授权 marker 优先回到 auth 和 discovery；写入前恢复后可继续，写入后禁止重放。创建 `UNKNOWN` 只用登记的 `app list` 刷新事实且仍不得归因候选差异；公钥页 `FAILED|UNKNOWN` 只查公钥状态，确认已生效后新建应用执行 `app audit`、复用应用执行 `app reuse`，否则按原终态收口。独立 `app key` 只用于复用缺钥应用、唯一 `KEY_NOT_STARTED`、公钥页写前本地权限阻断，或用户明确报告已交付的有效页面已过期/无法扫码；公钥页终态缺失、重复或冲突不证明写入未发生，必须按 `UNKNOWN` 核验。`app create` 仅由组合入口调用。

材料齐或非空明确新建即确认创建；之后只补缺项。`WEBAPP` 只需用户公钥，首次收集固定使用 `APP_WEB_INITIAL`：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message material-collect --category application --state APP_WEB_INITIAL --product-type "$PRODUCT_TYPE"
```

新建 `WEBAPP` 时，首次等待或创建写操作前必须展示 `https://opendocs.alipay.com/isv/02kipk`。空候选事实消息和应用资料首次收集消息都包含该官方地址，并说明：支付宝开放平台密钥工具默认生成 PKCS#8 格式的应用私钥，可通过工具格式转换获取 PKCS#1 格式的应用私钥；Node.js 只使用 PKCS#1。转换必须由用户在官方工具内自行完成，私钥不得提供给 Agent。Coze 不下载、不安装、不启动工具，也不生成或转换密钥。材料齐且重查允许才创建、设钥和提审。

## 公钥边界

应用公钥必须由用户自行生成并明确提供。Agent 禁止生成密钥对、请求或处理私钥、补全/改写公钥、添加 PEM 头尾，或在缺少公钥时调用 `createKeyConfirmPage`。公钥输入只用于当前 `app.sh key|verify-key|verify-key-and-audit`，不得在回复、摘要、普通日志、跨会话状态或宽权限临时文件中复述或保存。

CLI 子命令均传 `--product-type` 并由脚本上报 `PRODUCT`；`appId/publicKey` 保持位置参数。正常新建由 `create-from-snapshot` 输出公钥页；仅上述独立设钥场景执行 `runtime.mjs app key --product-type "$PRODUCT_TYPE" <appId> <publicKey>`。两者都先独立送达包含可点击链接的 stdout，然后停止并等待用户扫码确认完成；不得自动轮询、手写消息、搜索或改写 URL、填写页面或代扫码。pending 不得与 `application.key.page` 合并。

只展示校验后的实际 `confirmPageUrl` 裸 URL，禁二维码链接和 `alipays://`。不推定有效期；只有已成功交付 `READY_TO_OPEN` 页面且用户明确反馈该实际页面已过期或无法扫码时才重建，PENDING、失败、未知或 Agent 猜测均不得重建。

`app.sh key` 成功须输出 `KEY_PAGE_RESULT=READY_TO_OPEN` 和 `KEY_PAGE:READY_TO_OPEN`；响应不明、URL 非法、消息失败或终态缺失/冲突均为 `UNKNOWN`，禁生成第二页。后续查询只使用 flow 登记的显式 appId 和同一应用公钥。

RSA2 状态只看应用公钥字段，支付宝公钥不能反证。用户明确完成表达交给 `onboarding_recovery_runner.mjs application-key` 后，`verify-key|verify-key-and-audit` 每次只查一次；未确认时继续等待用户，不主动轮询。

## 提审与结果

新建确认后用 `verify-key-and-audit` 复用最终密钥响应完成双公钥 guard 并提审；复用缺钥时 `verify-key` 后再 `reuse`。公钥页写入结果经 `reconcile-key` 确认已生效时，新建应用使用 `audit` 完成双公钥 guard 与提审，复用应用只执行 `reuse` 复核 `ON_LINE`、双公钥并导出支付宝公钥。公钥未确认或 guard 失败禁提审。

`APPLICATION_CREATE_RESULT=SUCCESS|FAILED|UNKNOWN` 区分创建；未知只刷新列表事实，不归因候选差异。`KEY_PAGE_RESULT=FAILED|UNKNOWN` 在调用后都只用同一公钥执行一次 `reconcile-key`，不生成第二页；`CONFIRMED` 后才按应用来源执行新建应用提审或复用应用复核。授权恢复后重新发现并只做阶段允许的最新只读动作；写前本地权限阻断可原样重试一次，发送状态不明时保持 `UNKNOWN`。`APPLICATION_AUDIT_RESULT=SUBMITTED|FAILED|UNKNOWN` 区分提审，未知不重提；`FLOW:AUDIT_SUBMITTED` 仅来自成功或只读核验。`/workspace/projects` 探针失败输出 `APP_FLOW:RETRY_WITH_WORKSPACE_PERMISSION` 和 `ALIPAY_PUBLIC_KEY_EXPORT_STATUS=RETRY_WITH_WORKSPACE_PERMISSION`，取权重试一次且不重开页面；仍失败输出 `ALIPAY_PUBLIC_KEY_EXPORT_STATUS=MANUAL_CONFIGURATION_REQUIRED`，由 `customer-messages.json` 的应用人工配置目录文案引导。

应用分支取得唯一 appId 时按根意图输出结果。`onboarding_only` 必须先独立使用以下命令，再执行不带 `--application-operation-*` 的 closeout；`full_process` 紧邻 closeout 且尚未独立送达时，可按 flow 合并进 closeout 并省略以下命令，其他情况仍独立使用：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message application-result --app-id "$APP_ID" --actual-status "$ACTUAL_STATUS" [--next-action "$NEXT_ACTION"] [--app-key-save-path "$APP_KEY_SAVE_PATH"]
```

输出实际 appId、状态和下一步；没有唯一 appId 时禁止执行本命令或传 closeout 应用操作参数，只由 closeout 展示分支状态。若当前 `reuse|verify-key|verify-key-and-audit|audit` 已取得唯一 `ALIPAY_PUBLIC_KEY_EXPORT_STATUS=EXPORTED` 和 `ALIPAY_PUBLIC_KEY_FILE`，必须把固定 `/workspace/projects/<appId>-alipayPublicKey.keytext` 原样作为 `APP_KEY_SAVE_PATH` 传入。runner 会校验该文件绑定同一 appId、非链接、权限 `0600` 且包含安全单行 RSA2 内容，再在登记应用结果中同时展示“支付宝公钥（请原样复制）”、公钥原文和保存路径；Agent 不得自行读取、复述或把公钥放入参数、marker、日志、遥测或自由话术。待审核、待设钥、需人工配置、失败或未知不得称发布完成。`APP_FLOW:RETRY_WITH_WORKSPACE_PERMISSION` 不渲染结果；`MANUAL_CONFIGURATION_REQUIRED` 固定传“需人工配置”且省略 `--next-action` 和 `--app-key-save-path`，先恢复安全导出；需要上线或替换生产配置时，后续先引导用户前往支付宝 AI 付站点（https://aipay.alipay.com/?from=alipay-aipay-skill-coze）首页-一站式接入-AI网页应用收款-产品开通节点查看产品开通状态，确认产品已开通后再由用户在 Coze 主动触发上线前准备流程。写操作仅 `NOT_SENT` 自动重试；`MAYBE_SENT` 查询核验，无法确认进入 `UNKNOWN`，禁止同名猜测或重复创建/提审。

当前 `alipay-aipay` Skill 在应用发布和 Onboarding 执行阶段不调用 `integration_detail`，也不触发或模拟 `alipay-payment-production-integration`。产品开通过程确认的生产 appId 和导出的支付宝公钥只作为后续生产链路依据：确认产品已开通后，用户可以在 Coze 主动触发上线前准备流程；当前 Skill 必须先调用 `integration_detail('integration-alipay')` 打开或检查全局支付宝支付密钥托管，缺失时展示全局卡片让用户自行维护同一 appId 对应的支付宝公钥和 PKCS#1 应用私钥；如果没有弹出卡片，可能是当前 Coze 编程平台已经配置了全局支付宝支付密钥，查看入口：扣子编程首页 → 左侧栏集成管理 → 外部集成 → 支付宝支付密钥托管；卡片处理完成后才由独立生产配置技能完成项目正式配置替换。Coze 的支付宝支付密钥配置是全局一份，替换会影响仍使用上一套密钥的部署。配置前必须确认生产 appId、支付宝公钥和应用私钥属于同一套生产应用；如后续无法唯一确认生产 appId，只能要求用户提供 appId，不得索取应用私钥。Agent 禁止请求、接收、读取或校验用户持有的 PKCS#1 应用私钥。
