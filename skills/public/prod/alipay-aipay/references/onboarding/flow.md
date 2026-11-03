<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_CORE:START -->
# AI 网页应用收款产品开通

本 flow 仅支持 Coze 的 AI 网页应用收款。产品事实固定为：

| 字段 | 固定值 |
|---|---|
| `productType` | `webpay` |
| CLI `PRODUCT` | `WEBPAY` |
| `salesCode` | `I1080300001000041203` |
| `scope` | `app:all,fast_instant_trade_pay:write` |
| 应用类型 | `WEBAPP` |
| 签约 `appType` | `PC_WEB` |

“网站支付”“H5 支付”只是输入别名；`PC_WEB` 覆盖 PC 网页和手机浏览器/H5。其他支付产品不得进入本 flow。

## 执行边界

1. 只按 `entry -> execute -> branch-summary -> signing/application -> closeout` 加载当前阶段，禁止预读整份 flow 或调用不存在的服务分支。
2. 每轮重新校验登录、scope、MCC，并查询签约与 WEBAPP 应用事实；查询失败不得当空列表，单分支失败不覆盖另一分支成功。
3. Onboarding 不修改用户应用源码或项目配置；唯一工作区写入是把已取得的支付宝公钥导出到固定 `/workspace/projects/<appId>-alipayPublicKey.keytext`，并确保 `/workspace/projects/.gitignore` 含 `*.keytext`。CLI/MCP 只走动作处 runtime 命令；方法、payload、错误解析和 `PLATFORM`、`PLATFORM_ID`、`ALIPAYCLI_BIZ_INFO`、`PRODUCT` 注入由既有脚本托管。
4. runner/script stdout 是唯一对客正文，内部事实行禁止对客；唯一 marker 缺失、重复或冲突时停止核对。
5. 应用公钥只能由用户提供并只用于当前应用动作；禁止生成、补全、改写、复述或保存公钥，禁止请求或处理生产私钥。
6. 写操作结果不明时只读核验；仍无法确认就记为结果未知，禁止重放写操作。
7. stage 由登记 runner 异步记录，Agent 不手工调用 telemetry；遥测失败不改变业务结果，诊断时才读取 `../normal/telemetry.md`。

未签约时一次收集首页、商品页、支付页三张截图。支付页是展示支付宝付款方式并等待用户支付的页面，不是支付成功页。应用分支仅处理 WEBAPP 和应用公钥。

## 条件参考路由

支持模块不属于正常路径默认上下文。只有已进入当前阶段并取得表内实际触发事实时，才完整读取对应文件；未命中时禁止扫描或预读。模块只解释已登记业务语义，不新增命令、MCP 调用、重试、确认或完成条件。

| 优先级 | 当前阶段 | 精确触发条件 | 完整读取 |
|---|---|---|---|
| 1 | 任一 Onboarding 阶段 | 登记 runner/script 非 0、marker 缺失/重复/冲突，或实际返回失败、恢复、`UNKNOWN` 终态，需要按登记分类解释或恢复；用户明确要求错误排查详情时也适用 | [`modules/error-handling.md`](modules/error-handling.md) |
| 2 | 步骤 3 登录授权 | 实际 `auth` 终态需要解释 scope、MCC、页面、登录态或恢复语义，或用户明确要求授权详情 | [`modules/authorization.md`](modules/authorization.md) |
| 3 | 步骤 4 / 步骤 5 / 步骤 6 签约分支 | 实际签约查询、复用回执、材料或提交结果需要解释登记业务语义，或用户明确要求签约详情 | [`modules/product-sign.md`](modules/product-sign.md) |
| 4 | 步骤 4 / 步骤 5 / 步骤 7 应用分支 | 实际候选、创建、公钥、核验、提审或复用结果需要解释登记业务语义，或用户明确要求应用发布详情 | [`modules/app-release.md`](modules/app-release.md) |
| 5 | 步骤 7 应用分支 | 当前应用动作实际导出支付宝公钥，需要说明后续 Coze 全局密钥配置和独立生产上线技能边界 | [`../integration/modules/coze-runtime.md`](../integration/modules/coze-runtime.md) |

同一异常同时命中错误和业务分支时，先读取 `modules/error-handling.md` 确认分类与恢复边界，再按需读取唯一受影响的业务模块；不读取未受影响分支。模块与当前 flow 或脚本冲突时立即停止核对，不自行选边或继续操作。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_CORE:END -->

<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_ENTRY:START -->
## 步骤 1：平台、主体与方案

`onboarding_only` 由 `onboarding-bootstrap` 进入本阶段；`full_process` 在 Integration 满足衔接条件后直接加载本阶段。

用户已明确要求用企业账号通过 Skill 开通时，不主动追问账号类型，直接执行并停止 Onboarding：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message enterprise-unsupported --variant <ONBOARDING_ONLY|FULL_PROCESS>
```

产品固定为 `webpay`，不得执行产品推荐或产品澄清。若父级 `full_process` 已传入 `BUSINESS_DESCRIPTION`，直接把它作为 `MCC_SEARCH_QUERY`；本轮用户若补充或修正经营描述，则用最新明确描述覆盖该值。没有经营描述或 MCC 时执行并等待：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message mcc-clarify --product-type webpay
```

已有经营描述时，允许 Agent 从用户原话中提取 0 到 12 个业务概念词作为 `SEMANTIC_TERMS_JSON`，但不得提供 MCC 编码或替代机器查询结果。执行唯一 MCC 解析入口：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" mcc resolve-plan --query "$MCC_SEARCH_QUERY" --product-type webpay [--semantic-terms-json "$SEMANTIC_TERMS_JSON"]
```

只接受唯一 `MCC_QUERY_RESULT=SUCCESS|FAILED` 和唯一 `MCC_RESOLUTION`；查询网络或 CLI 私有状态恢复按错误模块登记分支处理，不得拆回 Agent 自行调用 MCP：

- `UNIQUE`：必须同时有唯一 `MCC_CONTEXT_RECEIPT` 和唯一 `CUSTOMER_MESSAGE_DELIVERY_REQUIRED=onboarding.plan.confirm`。先原文送达 stdout，再绑定该回执进入同一工作回合的 `execute`，不等待回复。
- `MULTIPLE`：原文送达候选并保存唯一 `MCC_SELECTION_RECEIPT`，等待用户选当前候选。随后用原查询、所选编码、同一语义词 JSON 和 receipt 重跑同一入口；禁止序号外推或历史候选。
- `NONE`：原文送达无匹配消息并等待新的经营描述，优先继续补充真实经营内容，不要追问 MCC 编码。

已有唯一 MCC 事实时也只能由固定入口生成非阻塞方案：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message plan-confirm --product-type webpay --mcc-code "$MCC_CODE" --mcc-name "$MCC_NAME" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT" --mcc-qualification "$MCC_QUALIFICATION"
```

方案 marker 唯一且 stdout 已可见送达后，立即执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-execute-ready --product-type webpay
```

该组合入口在同一 Node 进程中依次加载一次 execute phase 并执行一次 `env check`。组合入口不可用时，原子 fallback 只能依次执行 `flow onboarding execute --product-type webpay` 和 `env check --product-type webpay`；组合入口或 fallback 任一已经开始后，禁止再执行另一套入口。产品或 MCC 变化使旧方案和候选失效，必须重新校验；不得增加确认点。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_ENTRY:END -->

<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_EXECUTE:START -->
<!-- ALIPAY_AIPAY_STAGE:onboarding.user_confirmed -->
## 步骤 2：环境检查

本区块已由 entry 的 `onboarding-execute-ready` 组合入口或其原子 fallback 加载。进入本区块后不得再次调用组合入口、重复加载 execute phase 或重复执行环境检查；只消费紧随本区块返回的本次 `env check` 结果：

- 唯一 `CLI_ENV:READY`：Node.js 及自动准备后的 `jq`、`alipay-cli` 功能检测均通过，进入授权。
- 唯一 `CLI_ENV:UNAVAILABLE`：本轮固定自动准备或复检未成功；完整读取 `../normal/alipay-cli-env.md`，将当前 stdout 的登记消息原文送达并停止，内部缺项 marker 禁止对客。
- 除上述登记 `UNAVAILABLE` 外的非 0、marker 缺失或冲突：停止核对，禁止推定环境就绪。

env 入口统一检测，并按需把 `jq`、`alipay-cli` 自动准备到 `~/.local/bin` 后复检。Agent 不得绕过入口自行执行 `which alipay`、`npx alipay`、近似命令、直连安装器或包管理器。

## 步骤 3：登录授权

固定上下文为当前 MCC 加以下产品事实：

```text
PRODUCT_NAME=AI 网页应用收款
SALES_CODE=I1080300001000041203
SCOPE=app:all,fast_instant_trade_pay:write
```

只执行 `auth` domain，禁止直调 `alipay-cli login`、展示 CLI `verification_url` 或解析原始输出：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" auth init --scope "$SCOPE" --sales-code "$SALES_CODE" --mcc-code "$MCC_CODE" --product-name "$PRODUCT_NAME" --mcc-name "$MCC_NAME" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT"
```

- `AUTH_FLOW:SKIP|AUTH_SUCCESS`：进入发现；合法 `AUTH_SIGN_REUSE_RECEIPT` 可原样复用签约事实。
- `AUTH_FLOW:READY_TO_OPEN`：先独立送达包含可点击链接的授权页 stdout，然后停止并等待用户扫码完成后的明确确认回复。`AUTH_STATE:SAVE_FAILED` 不得触发重建页面。
- init 的 scope/MCC mismatch 由 runtime 在同一命令内进入既有 mismatch；不得重复执行原子命令。
- `AUTH_FLOW:AUTH_REQUIRED`：失效会话后只原样重试 init 一次；再次命中停止循环。
- `AUTH_FLOW:RETRY_WITH_NETWORK|RETRY_WITH_LOCAL_FS_PERMISSION`：分别取得联网或 CLI 私有状态目录权限后原样重试当前命令一次；再次命中时，若 stdout 非空则原文送达，随后停止。
- `AUTH_FLOW:CONTEXT_MISMATCH`：废弃旧 deviceCode，用当前完整事实原样执行上面的 init 一次；再次命中停止，不清理状态文件或改写上下文。
- `AUTH_FLOW:LOGOUT_STILL_LOGGED_IN`：原文送达本次 stdout 后停止；logout 未由脚本证明成功前禁止 init、login 或发现。
- `AUTH_FLOW:FAILED`：若 stdout 非空则原文送达，随后停止；没有登记自动恢复，不得猜测成功或进入发现。

授权页送达后不得执行 `auth wait` 或任何自动轮询。只有用户明确表示扫码授权完成时，才执行一次恢复查询；成功进入发现，`PENDING` 表示仍未确认并继续等待用户处理，`EXPIRED` 先原文送达 stdout，再废弃旧页面并立即原样执行上面的 `auth init` 一次，新 init 仍只按其唯一终态转移：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-recovery auth-confirm --reply "$USER_REPLY" --input-id "$USER_INPUT_ID" --scope "$SCOPE" --sales-code "$SALES_CODE" --mcc-code "$MCC_CODE" --product-name "$PRODUCT_NAME" --mcc-name "$MCC_NAME" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT"
```

scope/MCC 不匹配时只执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" auth mismatch --scope "$SCOPE" --sales-code "$SALES_CODE" --mcc-code "$MCC_CODE" --product-name "$PRODUCT_NAME" --mcc-name "$MCC_NAME" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT"
```

scope/MCC mismatch 命令的唯一终态仍按上方规则转移，不得因它内部已执行 logout 和 init 而再次调用同一恢复。授权页 stdout 必须先独立送达，不能与 pending 或收口合并。

## 步骤 4：签约与应用发现

授权成功后自动执行唯一只读发现，不增加确认：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-discovery run --product-type webpay --sales-code I1080300001000041203 [--reuse-sign-receipt "$AUTH_SIGN_REUSE_RECEIPT"]
```

runner 只查询签约和 `WEBAPP` 应用。只接受唯一 `DISCOVERY_RESULT`，其中 `signing` 与 `application` 各自必须为 `SUCCESS|QUERY_FAILED`；应用成功还必须有 `application_type=WEBAPP` 和数组 `candidates`。stdout 保留受控错误并追加一次发现摘要，必须原文送达。

- `global_blocker=AUTHORIZATION_INVALID`：按唯一 `auth_recovery_action=INIT|MISMATCH` 回到授权，停止分支处理。
- `DISCOVERY_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION`：stdout 必须为空；取得 CLI 私有状态目录权限后原样重试一次。
- `DISCOVERY_FLOW:RETRY_WITH_NETWORK`：暂存首次 stdout，取得联网权限后原样重试一次；只送达最终应展示的一份 stdout。
- 单个业务或结构失败：只阻断对应分支，不得当空列表；继续另一成功分支。

无全局阻断后加载 `flow onboarding branch-summary`。不得重跑摘要或另写三方事实。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_EXECUTE:END -->

<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_BRANCH_SUMMARY:START -->
## 步骤 5：候选与材料

默认按签约、应用顺序处理独立分支；一次只展示一个可推进类别。已验证材料不得重复索取，提前提供的材料在轮到该分支时校验复用。所有材料请求只能来自下方 `material-collect` 的 stdout；签约字段闭集只有首页截图、商品页截图、支付页截图，以及当前 `MCC_CONTEXT_RECEIPT` 明确要求时的特殊资质材料；应用字段闭集只有应用公钥。不得自由补充真实姓名、身份证号、手机号、邮箱、店铺/网站名称、经营地址、网站域名、应用私钥或其他资料；runner 拒绝字段时停止核对，禁止绕过 runner 手写询问。

签约只有 `NOT_SIGNED` 才收集三张截图；`SIGNED_EFFECTIVE|SIGN_SUBMITTED|OTHER_STATUS` 禁止提交签约。签约截图和特殊资质材料必须来自用户真实经营页面或真实资质文件，严禁 Agent 或任何 AI 生成、改写、伪造、代补、修图、套用示例图或虚构材料。应用只有发现成功且候选数组合法时展示：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message application-candidates --application-type WEBAPP --candidates-json "$APP_CANDIDATES_JSON"
# 非空候选收到无效选择时
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message application-candidates --application-type WEBAPP --candidates-json "$APP_CANDIDATES_JSON" --selection-state invalid
```

空候选直接进入新建资料；非空候选必须取得唯一 `CUSTOMER_MESSAGE_DELIVERY_REQUIRED=application.candidate.select`，原文送达并等待用户选择当前 `ON_LINE` appId、或明确 `新建`。候选只含未上线应用时允许 `暂不新建`。候选变化使旧选择失效。

材料 runner 只接受 `signing|application` 与 `INITIAL|PARTIAL|INVALID|APP_WEB_INITIAL`，stdout 是该轮唯一材料请求正文：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message material-collect --category "$MATERIAL_CATEGORY" --state "$MATERIALS_STATE" --product-type webpay --missing-fields "$MISSING_FIELDS" [--special-qualification-json "$QUALIFICATION_GROUPS_JSON"]
```

`APP_WEB_INITIAL` 固定只收应用公钥，可省略 `--missing-fields`。签约材料只有在 `MCC_CONTEXT_RECEIPT` 解析出 `need_special_qual=true` 时，才允许把同一回执内的 `qualification_groups` 作为 `QUALIFICATION_GROUPS_JSON` 传给 `material-collect` 并把“特殊资质材料”加入缺失字段；特殊资质名称、组合和上传材料类型只能来自该回执，禁止 Agent 扩写、改名、解释为额外条件、补充材料清单或用常识替换字段。否则禁止索取特殊资质材料。查询失败、候选缺失或类型非法时禁止收料和写操作。轮到分支动作前分别加载 `flow onboarding signing --product-type webpay` 或 `flow onboarding application --product-type webpay`。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_BRANCH_SUMMARY:END -->

<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_SIGNING:START -->
<!-- ALIPAY_AIPAY_STAGE:onboarding.signing.start -->
## 步骤 6：产品签约

仅 `NOT_SIGNED` 且三张截图全部有效，并且当前 MCC 要求的特殊资质材料已按一个完整资质组合收齐时执行。截图按首页、商品页、支付页顺序上传；只取脚本内部事实中的三个图片引用，禁止对客或猜测。当前 MCC 不要求特殊资质时，不执行特殊资质上传，也不传特殊资质参数：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" screenshots --product-type webpay <img1> <img2> <img3>
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sign --product webpay --sales-code I1080300001000041203 --mcc-code "$MCC_CODE" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT" --picurl1 "$SCREENSHOT_HOME_REF" --picurl2 "$SCREENSHOT_SHOP_REF" --picurl3 "$SCREENSHOT_PAY_REF"
```

当前 MCC 要求特殊资质时，必须先选择 `material-collect` 基于同一 MCC 回执展示的一个完整资质组合。若所选组合包含回执返回的上传材料类型，只能按该组合内材料顺序上传用户提供的真实资质文件，并把同一上传动作返回的 `SPECIAL_LICENSE_JSON` 传给签约脚本；禁止生成、改写、伪造或补造特殊资质材料：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" special-license --product-type webpay --mcc-context-receipt "$MCC_CONTEXT_RECEIPT" --qualification-group-index "$SPECIAL_QUALIFICATION_GROUP_INDEX" --file "$SPECIAL_LICENSE_FILE_1" [--file "$SPECIAL_LICENSE_FILE_2" ...]
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sign --product webpay --sales-code I1080300001000041203 --mcc-code "$MCC_CODE" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT" --picurl1 "$SCREENSHOT_HOME_REF" --picurl2 "$SCREENSHOT_SHOP_REF" --picurl3 "$SCREENSHOT_PAY_REF" --special-qualification-group-index "$SPECIAL_QUALIFICATION_GROUP_INDEX" --special-license-json "$SPECIAL_LICENSE_JSON"
```

若所选资质组合没有返回任何上传材料类型，禁止执行 `special-license` 上传动作；只能在用户明确选择该组合后固定令 `SPECIAL_LICENSE_JSON=[]`，仍向签约脚本传入同一 `SPECIAL_QUALIFICATION_GROUP_INDEX`。Agent 不得把未返回上传材料类型解释为“无需上传”、不得补写文字条件或材料说明：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sign --product webpay --sales-code I1080300001000041203 --mcc-code "$MCC_CODE" --mcc-context-receipt "$MCC_CONTEXT_RECEIPT" --picurl1 "$SCREENSHOT_HOME_REF" --picurl2 "$SCREENSHOT_SHOP_REF" --picurl3 "$SCREENSHOT_PAY_REF" --special-qualification-group-index "$SPECIAL_QUALIFICATION_GROUP_INDEX" --special-license-json '[]'
```

每个动作先处理唯一恢复 marker，再读取业务结果：

- `CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION` 只证明 CLI 调用前被阻断；取得权限后原样重试当前动作一次，再次命中停止。
- 任一 `AUTH_FLOW:*` 优先于同时出现的上传或签约结果。按步骤 3 的对应终态恢复授权，授权成功后重新执行步骤 4 刷新签约和应用事实；禁止从旧输出直接提交或重放写操作。`LOGOUT_STILL_LOGGED_IN|FAILED` 仍按步骤 3 停止。
- 截图上传只有取得唯一三个图片引用才可提交。`SCREENSHOT_UPLOAD_RESULT=UNKNOWN` 或其他上传失败时，原文送达 stdout，不提交签约；保留用户已验证的本地截图，继续独立应用分支，并在 closeout 保留重新上传待办。
- 特殊资质上传只有取得唯一 `SPECIAL_LICENSE_JSON` 才可提交带资质签约。`SPECIAL_LICENSE_UPLOAD_RESULT=UNKNOWN|FAILED` 或资质上下文不匹配时，原文送达 stdout，不提交签约；保留用户已验证材料并在 closeout 保留重新上传待办。

材料完整后直接提交，不增加确认。签约脚本的非空 stdout 先原文送达；只接受唯一 `SIGN_APPLY_RESULT=SUCCESS|FAILED|UNKNOWN`，marker 缺失、重复或冲突时停止核对。取得唯一结果后立即执行并原文送达：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message signing-result --result "$SIGN_APPLY_RESULT"
```

- `SUCCESS`：还必须有 `FLOW:PC_WEB_SIGN_CONTINUE`，消息固定为“已提交，等待生效”，不轮询。
- `FAILED`：消息固定为“提交失败”，按脚本已交付的失败说明修正后才能重新发起产品开通。
- `UNKNOWN`：只读核验后仍不明，消息固定为“结果未知”；稍后重新查询签约状态，确认前禁止重复提交。

三种结果都先可见送达签约操作消息，再在同一回合继续独立应用分支；签约结果不作为应用分支的前置。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_SIGNING:END -->

<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_APPLICATION:START -->
<!-- ALIPAY_AIPAY_STAGE:onboarding.application.start -->
## 步骤 7：WEBAPP 应用发布

候选为空时，事实消息已展示密钥工具官方地址；缺公钥时只执行材料消息：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message material-collect --category application --state APP_WEB_INITIAL --product-type webpay
```

候选非空时只接受当前事实表中的完整 `ON_LINE` appId，或用户明确的 `新建`。复用命令会先按 `WEBAPP` 重新查询列表，所选 appId 不再属于最新 `ON_LINE` 候选时停止并重新展示候选。新建必须绑定最新候选快照与用户本轮完整公钥：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app create-from-snapshot --product-type webpay --sales-code I1080300001000041203 --application-type WEBAPP --previous-candidates-json "$APP_CANDIDATES_JSON" --public-key "<用户明确提供的完整publicKey>"
```

组合入口固定执行 `list -> snapshot compare -> create -> key page`：

- `APPLICATION_RECHECK_RESULT=UNCHANGED`：继续写入。
- `CHANGED_EMPTY|CHANGED_NONEMPTY`：零写入送达新事实；`CHANGED_EMPTY` 使用脚本返回的新 `APP_CANDIDATES_JSON` 和同一已验证公钥，在同一回合原样重跑组合入口一次；`CHANGED_NONEMPTY` 等待用户从新候选重选。
- `CONTRACT_ERROR`：参数契约失败，停止当前应用动作并按“失败”收口；禁止猜参数或重试。
- `SNAPSHOT_REFRESH_REQUIRED`：零写入，重新执行一次步骤 4 的 `onboarding-discovery run` 刷新签约和应用事实，再回到步骤 5；刷新仍失败则按查询失败记“结果未知”并收口。
- `PREWRITE_FAILED`：marker 证明尚未进入写操作，只允许用同一快照和同一公钥原样重跑组合入口一次；再次失败按“失败”收口。
- 创建 `FAILED`：禁止重放，按“失败”收口。创建 `UNKNOWN`：禁止重放，只执行一次 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app list --product-type webpay --sales-code I1080300001000041203 --application-type WEBAPP` 刷新事实；候选变化不能归因本次创建，最终仍记“结果未知”。
- 创建成功后，只有唯一 `APPLICATION_COMBINATION_RESULT=KEY_NOT_STARTED`，或公钥页子步骤唯一 `CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION` 且没有 `KEY_PAGE_RESULT`，才证明 `createKeyConfirmPage` 尚未调用；完成对应恢复后按唯一 `APP_ID` 独立执行一次 `app key`。其他公钥页终态缺失、重复或冲突一律记 `KEY_PAGE_RESULT=UNKNOWN`，禁止据此生成页面。
- 公钥页 `FAILED|UNKNOWN`：禁止重建页面，只执行一次 `reconcile-key`；`KEY_PAGE_RECONCILIATION=CONFIRMED` 时，本轮新建应用执行一次 `app audit`，复用的 `ON_LINE` 应用执行一次 `app reuse`。`NOT_CONFIRMED|QUERY_FAILED|CONTRACT_ERROR` 时按原公钥页终态记“失败”或“结果未知”并收口。

任一应用动作出现唯一 `AUTH_FLOW:*` 时，授权恢复优先于同时出现的应用结果：按步骤 3 恢复后重新执行步骤 4，并从最新应用事实或登记的只读核验继续，禁止直接重放创建、公钥页或提审。`CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION` 只有在脚本证明写调用尚未发生时才允许原样重试一次；写入已执行或是否发送不明时必须保持 `UNKNOWN` 并走只读核验。

复用与公钥动作只使用以下固定命令；`reuse` 内部固定执行 `WEBAPP` 列表复核，再查询所选应用状态和密钥：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app reuse --product-type webpay "<appId>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app key --product-type webpay "<appId>" "<用户明确提供的完整publicKey>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app reconcile-key --product-type webpay "<appId>" "<同一publicKey>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app verify-key --product-type webpay "<appId>" "<同一publicKey>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app verify-key-and-audit --product-type webpay "<appId>" "<同一publicKey>"
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" app audit --product-type webpay "<appId>"
```

公钥页成功必须同时有 `KEY_PAGE_RESULT=READY_TO_OPEN` 和 `KEY_PAGE:READY_TO_OPEN`。先独立送达包含可点击链接的页面 stdout，然后停止并等待用户扫码确认完成；不得合并 pending/收口，不得自动轮询或在用户确认前执行公钥查询。

用户明确完成后才执行一次恢复查询：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-recovery application-key --reply "$USER_REPLY" --input-id "$USER_INPUT_ID" --product-type webpay --mode <verify-key|verify-key-and-audit> --app-id "<appId>" --public-key "<同一publicKey>"
```

`FLOW:REUSE_NO_KEY` 不表示复用成功；先执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message application-reuse-no-key --app-id "$APP_ID"
```

取得用户公钥后再走同一公钥页流程。应用公钥确认且支付宝公钥实际导出后才可提审或认定配置完整。固定 `/workspace/projects` 写权限恢复只原样重试当前 app 命令一次；仍失败使用“需人工配置”，先恢复安全导出；需要手工继续时先引导用户前往支付宝 AI 付站点（https://aipay.alipay.com/?from=alipay-aipay-skill-coze）首页-一站式接入-AI网页应用收款-产品开通节点查看产品开通状态，后续生产链路统一见 [`../integration/modules/coze-runtime.md`](../integration/modules/coze-runtime.md)。禁止称完整或让用户把应用私钥发给 Agent。

### 应用结果与后续生产链路提示

当前 Skill 的应用分支只输出应用事实，不触发 Coze 密钥卡片或生产配置技能。应用动作取得唯一 `APP_ID` 时按实际状态独立执行并可见送达应用结果；若同一应用动作已实际确认 RSA2 应用公钥生效，并取得唯一 `ALIPAY_PUBLIC_KEY_EXPORT_STATUS=EXPORTED` 与 `ALIPAY_PUBLIC_KEY_FILE=/workspace/projects/<APP_ID>-alipayPublicKey.keytext`，必须把该固定路径作为 `APP_KEY_SAVE_PATH` 传入：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message application-result --app-id "$APP_ID" --actual-status "$ACTUAL_STATUS" --next-action "$NEXT_ACTION" --app-key-save-path "$ALIPAY_PUBLIC_KEY_FILE"
```

runner 会校验导出文件名绑定同一 appId、非链接、权限 `0600`，且包含安全单行 RSA2 支付宝公钥；通过时，应用结果 stdout 同时展示实际 appId、状态、支付宝公钥原文和保存路径。公钥不得进入命令参数、内部 marker、日志、遥测或 Agent 自由话术。没有唯一导出路径时省略 `--app-key-save-path`，不得猜测、读取或替换路径。

Onboarding 收口必须提醒用户前往支付宝 AI 付站点（https://aipay.alipay.com/?from=alipay-aipay-skill-coze）首页-一站式接入-AI网页应用收款-产品开通节点查看产品开通状态；后续生产链路的完整顺序、卡片字段、查看入口和全局影响统一见 [`../integration/modules/coze-runtime.md`](../integration/modules/coze-runtime.md)。Onboarding 执行阶段不调用 `integration_detail`，不触发或模拟 `alipay-payment-production-integration`，不读取卡片状态，不请求、接收、校验、保存或转发应用私钥；用户后续主动触发上线前准备交接时，当前 Skill 只按固定顺序先调用 `integration_detail('integration-alipay')` 唤起卡片，再衔接独立生产 Skill。`onboarding_only` 不修改项目；`full_process` 进入步骤 8 时只汇总本轮代码开发和产品开通结果，并优先沿用父级 handoff 里的 `BUSINESS_DESCRIPTION` 作为后续 MCC 事实输入。

恢复查询使用 `verify-key-and-audit` 时，成功即完成支付宝公钥导出和提审，不得再执行独立 `audit`；使用 `verify-key` 且取得 `FLOW:KEY_CONFIRMED` 后，重新执行一次 `app reuse`，以实际 `ON_LINE`、RSA2 双公钥和导出结果决定完成或人工配置。

只有已成功交付 `READY_TO_OPEN` 页面后，用户明确报告该实际页面已过期或无法扫码，才允许使用同一 appId 和同一公钥执行一次新的 `app key` 并重新交付页面；`PENDING`、`FAILED|UNKNOWN` 或 Agent 猜测页面失效都不构成重建授权。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_APPLICATION:END -->

<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_CLOSEOUT:START -->
## 步骤 8：收口

产品开通完成条件：签约由实际查询确认为已生效；应用实际为 `ON_LINE`、RSA2 应用公钥已生效且支付宝公钥已导出；产品分支待办为“无”。`onboarding_only` 满足这些事实且没有其他待办时可宣称产品开通完成。`full_process` 还必须同时满足代码开发“已完成”、沙箱 `READY`、项目当前配置为 `SANDBOX_ACTIVE`、总待办为“无”且没有人工待验证项，才可宣称本轮完整接入完成。完整接入完成不包含生产上线、生产 appId 注入、Coze 全局密钥配置或正式网关替换；这些只走后续独立生产链路。提交成功、待生效、待审核、人工配置、沙箱待配置、代码人工待验证、失败或结果未知均不得以“无待办”收口。

只执行托管收口并原文送达 stdout：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" onboarding-message closeout --product-type webpay --root-intent "$ROOT_INTENT" --signing-result "$SIGNING_RESULT" --application-result "$APPLICATION_RESULT" --remaining-actions "$REMAINING_ACTIONS" [--integration-result "$INTEGRATION_RESULT" --sandbox-config-state "$SANDBOX_CONFIG_STATE" --configuration-state "$CONFIGURATION_STATE"] [--manual-verification-items "$MANUAL_VERIFICATION_ITEMS"] [--application-operation-app-id "$APPLICATION_OPERATION_APP_ID"] [--application-operation-next-action "$APPLICATION_OPERATION_NEXT_ACTION"] [--application-operation-app-key-save-path "$APPLICATION_OPERATION_APP_KEY_SAVE_PATH"]
```

- `onboarding_only`：不传 Integration、沙箱、项目配置、人工待验证或任何 `--application-operation-*` 参数。有唯一 appId 的应用操作结果时，先按应用模块独立执行并送达 `onboarding-message application-result`，再执行不带应用操作参数的 closeout；没有唯一 appId 时只执行 closeout。
- `full_process`：必须同时传入唯一 Integration handoff 给出的 Integration 结果、沙箱状态和 `CONFIGURATION_STATE`，再按本 flow 的实际后续动作更新；禁止省略、重置或从 `REMAINING_ACTIONS` 反推。若唯一 appId 的应用操作紧邻收口、尚未独立送达，可用 `--application-operation-*` 合并 appId、实际状态、下一步和已导出的支付宝公钥路径；closeout runner 会从该固定路径核验并原样展示支付宝公钥，此时禁止再执行 `application-result`。若已经独立送达，则 closeout 不带这些参数。没有唯一 appId 时只执行 closeout。“需人工配置”不得传 next action 或保存路径。

runner 派生标题、后续衔接、生产上线关键点和收款限制，禁止手写、删减或重复输出。

<!-- SIGNING_RESULT_MAP:START -->
| `SIGNING_RESULT` | 本轮事实判据 |
|---|---|
| `未签约` | 查询实际返回 `NOT_SIGNED`，且本轮未取得后续提交成功事实 |
| `已提交，等待生效` | 查询实际返回 `SIGN_SUBMITTED`，或签约提交取得 `SIGN_APPLY_RESULT=SUCCESS` |
| `已生效` | 查询实际返回 `SIGNED_EFFECTIVE` |
| `其他状态待核验` | 查询实际返回 `OTHER_STATUS`；禁止改判为已签约或未签约 |
| `失败` | 签约提交取得明确 `SIGN_APPLY_RESULT=FAILED`，且无后续成功事实覆盖 |
| `结果未知` | 签约查询失败，或提交结果经只读核验仍无法确认 |
<!-- SIGNING_RESULT_MAP:END -->

<!-- APPLICATION_RESULT_MAP:START -->
| `APPLICATION_RESULT` | 本轮事实判据 |
|---|---|
| `待选择` | 候选已取得但用户尚未选择，或明确暂不新建 |
| `已创建，待设置公钥` | 创建成功后尚未生成有效公钥页，或复用返回 `FLOW:REUSE_NO_KEY` |
| `公钥待确认` | 公钥页已交付，但用户尚未回复确认，或单次恢复查询仍未确认 |
| `已提交审核，等待上线` | 提审成功但应用尚未满足完整上线条件 |
| `已上线且配置完整` | 应用 `ON_LINE`、RSA2 应用公钥已生效且支付宝公钥已实际导出 |
| `需人工配置` | `/workspace/projects` 导出权限恢复耗尽；先恢复安全导出，需要手工继续时先查看产品开通状态并按 [`../integration/modules/coze-runtime.md`](../integration/modules/coze-runtime.md) 继续后续生产链路 |
| `失败` | 组合入口 `CONTRACT_ERROR|PREWRITE_FAILED` 按登记恢复仍失败，或创建、公钥页、提审取得明确失败，且无后续成功事实覆盖 |
| `结果未知` | 查询失败或非幂等写入结果经只读核验仍无法确认 |
<!-- APPLICATION_RESULT_MAP:END -->

签约和应用状态必须使用消息目录登记枚举，禁止 Agent 自由改写；实际 appId、支付宝公钥原文和保存路径只允许由登记的 application-result/closeout runner 校验后输出。错误码或截图引用不得自由拼入结果。当前会话只保留产品/MCC、BUSINESS_DESCRIPTION、已验证材料、候选和脚本结果；新一轮请求重新校验授权并查询事实，不建立跨会话业务进度。
<!-- ALIPAY_AIPAY_FLOW:ONBOARDING_CLOSEOUT:END -->
