# 登录授权业务语义

本模块只由 [`../flow.md` 的条件参考路由](../flow.md#条件参考路由) 在步骤 3 命中授权语义触发条件时读取。运行时命令、确认、终态和失败分支以 flow 为准；参数校验、URL 构造、状态保护和解析由 `scripts/auth.sh` 实现。正常路径不预读本模块。

## 产品授权范围

| 产品 | salesCode | scope |
| --- | --- | --- |
| AI 网页应用收款 | `I1080300001000041203` | `app:all,fast_instant_trade_pay:write` |

产品名称、salesCode、scope、MCC 名称和编码必须属于同一固定上下文。`auth.sh` 在任何 `whoami`、`login`、`login --complete` 或 `logout` 前完成机器校验；参数冲突返回 `AUTH_FLOW:CONTEXT_MISMATCH`，不执行外部动作。

固定上下文通过后，`auth.sh` 将 CLI `PRODUCT` 设置为 `WEBPAY`；该值只作为 CLI 上报上下文，不进入授权或签约 MCP 请求 JSON。

## 授权状态语义

- `AUTH_FLOW:SKIP|AUTH_SUCCESS`：当前本机登录态、scope 和当前 MCC 上下文均已通过脚本校验。
- `AUTH_FLOW:READY_TO_OPEN`：当前授权页已生成并完成白名单及上下文校验，可以交付可点击链接后停止并等待用户扫码完成确认。
- `AUTH_STATE:SAVE_FAILED`：授权页 stdout 已经安全生成并交付，但本地短时状态文件未能保存；不得重新生成页面，`wait|confirm` 仍使用 flow 登记命令的显式上下文。
- `AUTH_FLOW:PENDING`：用户确认后的单次恢复查询尚未得到有效本机登录态；不等于失败，也不证明用户未扫码。
- `AUTH_FLOW:EXPIRED`：当前页面实际返回过期，旧页面和旧回复失效，重新执行 flow 登记的 init。
- `AUTH_FLOW:SCOPE_MISMATCH|MCC_MISMATCH`：只能走 `auth.sh mismatch`。统一 runtime 的 `auth init` 在底层 init 唯一返回 mismatch 且 stdout 为空时，会在同一命令内自动调用既有 `auth.sh mismatch`，抑制中间 mismatch 终态并只透传最终结果；`wait|confirm` 返回 mismatch 时仍按 flow 显式调用 mismatch。logout 后置条件未成立前不得重授权；仍登录返回 `AUTH_FLOW:LOGOUT_STILL_LOGGED_IN`。
- `AUTH_FLOW:AUTH_REQUIRED`：`whoami` 或已认证资源校验已证明当前 CLI 会话失效，且脚本已完成既有 logout 后置条件处理；按 flow 原样重新执行当前上下文的 `auth init` 一次，旧授权页不再作为恢复依据，再次命中时停止循环。
- `AUTH_FLOW:RETRY_WITH_NETWORK`：当前 Agent 环境无法确认结果，申请联网权限后原样重试同一命令；不得解释为用户本机登录失败。
- `AUTH_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION`：授权状态命令 preflight 失败，或实际输出命中 CLI 私有状态写失败证据。可恢复阶段 stdout 为空；仅允许当前受控 runtime 命令访问 CLI 私有状态目录后原样重试一次；`wait|confirm` 保留短时授权状态，不重建授权页。Agent 禁止读取、列举、打印或复制已有凭据与日志；拒绝、不支持或重试仍命中同一 marker 时才输出最小失败说明。

CLI `login --complete` 成功只表示页面侧确认完成，不代表本机已取得可用登录态。返回成功但状态字段不在白名单时，脚本先用 `whoami` 复核：有效登录继续 scope/MCC 校验，仍未形成登录态则保持 `PENDING`，不可确认则 `RETRY_WITH_NETWORK`。脚本仍需复核 `whoami`、scope，并以固定授权 URL 绑定 MCC；当前后端查询没有权威 MCC 返回字段，禁止声称做了响应 MCC 等值比较。

## 页面与恢复

授权页只允许 `https://aipay.alipay.com/cli-auth`，必含唯一 `deviceCode/productCode/mccCode`，只允许可选 `platform`；禁止 CLI `verification_url`、额外参数、重复参数和 fragment。页面 stdout 必须先作为独立阻塞消息送达，然后等待用户扫码完成确认；不得执行 `auth.sh wait` 或任何自动轮询，后续 pending 或收口不得合并进同一回复。

用户明确表示扫码完成后，按 flow 登记命令把用户原始回复和当前 `USER_INPUT_ID` 交给统一 runtime 的 `onboarding-recovery auth-confirm`；runner 复用统一肯定语义判定器并对该用户消息幂等计数，接受 `继续`、`好了`、`已完成`、`确认`、`OK` 和兼容输入 `1`，每次接受只执行一次 `auth.sh confirm`。否定、疑问、取消、修改意见或含糊输入不查询。

授权对客正文只由 `auth.sh` 调用消息目录生成。授权页必须要求用户扫码完成后回复确认；pending 的自然语言提示和允许回复不在本模块维护副本。

## 状态保护

短时授权上下文使用当前用户私有临时目录和 `0600` 原子文件，拒绝符号链接。状态可见时显式参数必须逐项一致；状态不可见时仅允许完整显式上下文降级。新 init 只有先通过固定上下文校验才可替换旧状态；上下文改变且 CLI 仍登录时必须进入 mismatch，不得复用旧 deviceCode。

任何授权 token、deviceCode、未脱敏 CLI/MCP 输出和临时 URL 都不得进入普通日志、对话摘要、跨会话状态或宽权限临时文件。只有经过脚本白名单和当前上下文校验、且当前动作必须交付的授权 URL 可以进入该动作唯一对客正文。
