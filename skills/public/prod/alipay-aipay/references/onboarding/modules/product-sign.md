# 产品签约业务语义

本模块只由 [`../flow.md` 的条件参考路由](../flow.md#条件参考路由) 在签约分支命中业务语义触发条件时读取，用于说明签约状态、材料和写操作边界。运行时命令与分支以 flow 为准；请求参数、错误检测和解析由 `scripts/query_sign_status.sh`、`scripts/sign_status_parser.sh` 与 `scripts/ar_sign_apply.sh` 实现。正常路径不预读本模块。

## 当前主流程 MCP 能力

| MCP 方法 | 用途 |
| --- | --- |
| `ar-sign.apply` | 提交当前产品签约申请 |
| `ar-query.queryArInfosBySalesProd` | 查询当前 salesCode 的签约状态 |

查询和提交都使用 `{"request":{...},"ctx":{}}`。完整 payload 只在脚本中维护；Agent 不从本模块自行构造 MCP 调用。

## 签约状态

`scripts/sign_status_parser.sh` 是授权内查询与独立签约查询的唯一解析实现。只有实际响应包含合法 `resultObj.arInfoList`，并唯一输出匹配的 `SIGN_STATUS`、`FLOW:*`、`AUTH_SIGN_QUERY_REUSABLE=true` 和 `AUTH_SIGN_REUSE_RECEIPT`，授权结果才优先通过回执复用；结构缺失、冲突或不可唯一解析时必须独立查询。兼容窗口内旧 `SIGN_STATUS + FLOW:*` 双参数仍可复用，`FLOW:` 前缀可带可不带，但 runner 必须重新校验产品、salesCode、状态和 flow 一致。

| 状态 | 业务处理 |
| --- | --- |
| `NOT_SIGNED` | 按当前产品收集并校验材料，完整后直接提交 |
| `SIGN_SUBMITTED` | 已提交等待生效，禁止重复签约 |
| `SIGNED_EFFECTIVE` | 已生效，禁止重复签约 |
| `OTHER_STATUS` | 展示实际状态并待核验，禁止提交 |
| `QUERY_FAILED` | 只阻断签约分支，不推断为空或未签约 |

合法复用组合固定为：`NOT_SIGNED + 当前产品未签约 FLOW`、`SIGNED_EFFECTIVE|SIGN_SUBMITTED + 当前产品已签约 FLOW`、`OTHER_STATUS + FLOW:OTHER_STATUS`。不得把 `OTHER_STATUS` 映射为已签约或未签约。

现有查询请求不含 MCC，已验证响应也没有权威 MCC 字段。授权链路只能表述为授权 URL 精确绑定目标 MCC；没有新证据时不得增加响应 MCC 比较或修改 MCP payload。

## 材料与提交

- AI 网页应用收款签约材料闭集只有首页、商品页、支付页三张截图，以及当前 `MCC_CONTEXT_RECEIPT` 明确要求时的特殊资质材料。支付页必须展示支付宝付款方式并等待用户付款，不得替换为支付成功页。签约截图和特殊资质材料必须来自用户真实经营页面或真实资质文件；严禁 Agent 或任何 AI 生成、改写、伪造、代补、修图、套用示例图或虚构材料。特殊资质名称、组合和上传材料类型只能按当前 MCC 查询回执展示，禁止扩写、改名、解释为额外条件或补造材料要求。不得索取真实姓名、身份证号、手机号、邮箱、店铺/网站名称、经营地址、网站域名或其他身份/经营字段；当前 MCP 和 runner 没有这些输入，禁止凭经验补充。

材料缺失或校验失败时只使用 flow 登记的 `materials.category.collect` stdout，禁止自由话术索取材料，不得提交。完整通过后直接执行签约脚本，不增加额外确认点。截图上传只走带当前 `--product-type` 的 `scripts/upload_screenshots.sh`，特殊资质上传只走带当前 `--mcc-context-receipt` 的 `scripts/upload_special_license.sh`，提交必须绑定同一 `MCC_CONTEXT_RECEIPT` 并只复用脚本实际返回的三个图片引用和可选 `SPECIAL_LICENSE_JSON`；上传结果未知或任一引用缺失时不得提交，保留本地材料并在收口列出重新上传待办。

提交成功只表示申请已受理，不等于签约生效；应用分支按自身前置条件继续，不依赖本次签约写成功。写操作仅明确 `NOT_SENT` 时可自动重试；`MAYBE_SENT` 必须先用现有签约查询核验，无法确认进入 `UNKNOWN`，禁止重复提交。

提交脚本必须输出动作级结果事实：`SIGN_APPLY_RESULT=SUCCESS` 表示提交已受理并继续；`SIGN_APPLY_RESULT=UNKNOWN` 表示响应不明且查询无法核验，签约分支进入未知待办；`SIGN_APPLY_RESULT=FAILED` 表示明确失败或明确未发送重试耗尽。唯一 `AUTH_FLOW:*` 优先于同时出现的动作结果：先按 flow 恢复授权并重新发现，不从旧输出直接提交；唯一写前 `CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION` 才允许取权后原样重试一次。三种业务结果不改变 MCP payload，也不能阻断应用的独立前置分支。

签约写操作取得唯一 `SIGN_APPLY_RESULT=SUCCESS|FAILED|UNKNOWN` 后，立即执行 `onboarding-message signing-result --result "$SIGN_APPLY_RESULT"`。runner 固定派生实际状态和下一步，先可见送达，再继续独立应用分支；禁止传入费率或自拟结果文案。最终收口映射以 flow 的 `SIGNING_RESULT_MAP` 为准；`OTHER_STATUS` 保留为“其他状态待核验”，查询失败或提交结果不明映射为“结果未知”。不得展示未登记审核规则、费率承诺、可收款时间或原始响应；费率、额度和生效问题引导用户在支付宝商家平台查询。
