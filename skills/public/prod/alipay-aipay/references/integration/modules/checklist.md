# Coze Node.js AI 网页应用收款校验清单

代码实现后、集成收口前必须逐项核对。自动无法取得的证据标记为“人工待验证”，不得推断通过。默认只渲染最终摘要；用户要求明细时再展开。

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 一、密钥与配置安全

| 校验项 | 通过要求 |
| --- | --- |
| 敏感值保护 | 私钥、用户提供的应用公钥、签名串、完整支付表单和沙箱账号密码不进入源码、日志、对话摘要、测试快照或普通临时文件；支付宝接口返回、绑定同一 appId 并安全导出的支付宝公钥只允许登记 application-result/closeout runner 原样展示，其他位置仍禁止输出 |
| 沙箱配置 | `READY` 时服务端的 `alipay-sdk-config.ts` 从规范化项目根读取 `.alipay-sandbox.json`，固定使用 PKCS#1 的 `appIds[0].appPrivateKey`、`appId` 和 `alipayPublicKey`，不读取 PKCS#8 的 `appPrivatePkcsKey`；待配置时加载器明确失败，不使用占位值 |
| 沙箱网关 | `alipay-sdk-config.ts` 源码显式使用唯一完整地址 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；不使用旧地址、HTTP、仅 hostname、缺少 `/gateway.do` 或其他变体 |
| 文件保护 | `.alipay-sandbox.json` 未被 Git 跟踪，项目根 `.gitignore` 含精确 `/.alipay-sandbox.json`，Coze 运行环境中的文件权限为 `0600` |
| 稳定定位 | 服务端从实际 Node.js package 根定位 `alipay-sdk-config.ts` 和其读取的沙箱配置；Next.js 不从编译后 `__dirname` 反推项目根，仅在开发、构建和启动目录均已核验时使用 `process.cwd()`；其他框架也不依赖 Agent 启动目录、Skill 目录或猜测路径 |
| 模式一致 | AI 网页应用收款目标路径固定使用公钥模式和普通执行 API，不调用证书执行 API，也不读取或推断证书字段 |
| 签名算法 | Node.js 沙箱与生产支付宝 SDK 初始化均固定使用 `RSA2` |
| 无验证旁路 | 沙箱与生产共用验证控制流，不存在 Mock、测试或沙箱开关触发的固定成功、跳过验签或支付旁路 |
| 项目保护 | 既有结构、文件和无关能力保留；没有未经独立确认的删除、清空或整体覆盖 |

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 二、接口覆盖

必须实际实现以下六项，不能以 TODO、伪代码或仅测试文件代替：

- `alipay.trade.page.pay`
- `alipay.trade.query`
- `alipay.trade.refund`
- `alipay.trade.fastpay.refund.query`
- `alipay.trade.close`
- 异步通知处理入口

下单固定使用 `product_code=FAST_INSTANT_TRADE_PAY` 和 Node.js SDK `pageExec()`；HTML 表单交给浏览器显式提交，不能当 URL 跳转。商户订单号、商品和应付金额必须由服务端根据可信业务事实生成并持久化，不直接采用客户端购物车、localStorage、展示价格或请求金额，无效价格不得兜底为 `0` 后继续下单。

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 三、通知与支付结果

| 校验项 | 通过要求 |
| --- | --- |
| 通知验签 | 接收完整 POST 表单并先用当前 SDK 已确认的 API 验签 |
| 归属校验 | 验签后校验本地订单、`app_id`、`out_trade_no`、`total_amount`、`seller_id`/`seller_email` |
| 状态判断 | 只有 `TRADE_SUCCESS|TRADE_FINISHED` 可认定付款成功；排除退款、关单和其他事件 |
| 幂等与响应 | 使用持久化事实幂等处理；通知事件与订单状态在同一数据库事务中提交，全部成功后才返回纯文本 `success` |
| 查询兜底 | 未收到通知、网络异常或结果未知时调用 `alipay.trade.query`；主动查询必须有限次重试并有停止条件，不得无限轮询、直接推断或要求重复付款 |
| 查询失败 | 非 `10000` 保持状态未知；`40004/Business Failed` 必须结合实际 `sub_code`、`sub_msg`、trace 标识、环境、appId、网关和精确订单号排查，不归因沙箱延迟/清理，不承诺生产必然成功 |
| `notify_url` | 本地验收可暂时省略但代码必须存在；生产必须完成公网 HTTPS、无重定向的通知联调；通知地址由项目真实 POST 路由构造，不要求用户在对话中单独拍板 |

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 四、回跳与浏览器体验

用户未明确关闭同步回跳时，`return_url` 必须对应真实 GET 路由；路由无 404、500、认证/重定向循环，单页应用可直接刷新。真实回跳先验签，或使用与当前会话绑定的服务端订单标识，再通过查询或已验签通知展示结果。前台参数不得改写订单为已支付。

购买操作默认在点击后显示应用内 loading，向服务端创建支付，并用 inert `template` 提取隐藏 form；校验 POST 和当前固定 HTTPS 网关，移除 `target` 后通过 `HTMLFormElement.prototype.submit.call(form)` 在当前 browsing context 提交。禁止 `window.confirm/alert/prompt`、依赖 `innerHTML` 中的脚本、为等待 React 渲染默认引入 state/effect、全屏白色遮罩、`document.open/write/close`、`window.open()`、新标签页、把支付 HTML 当 URL，或把 `form.action` 与 hidden input 拼成 GET URL 跳转；错误必须在应用内联展示。只有用户明确要求或项目既定体验需要时才保留应用内确认 modal。新项目的商户内部字段统一为 `outTradeNo` 和 `tradeStatus`，URL 构造、结果页读取与查询响应保持一致，并以 `UNKNOWN` 兜底；不得把 camelCase 名称称为支付宝官方字段。

必须提供真实项目启动命令和可在浏览器打开的支付页地址。仅取得 HTML 表单不算完成付款体验。Coze 预览须实际验证点击支付后没有浏览器原生对话框或新标签页，且当前 browsing context 发出固定网关 POST；iframe 或浏览器策略阻断时记录真实证据，不得改成 `_blank` 规避。Agent 无浏览器/UI 证据或用户尚未实际付款时，按实际情况列为人工待验证；不得称“沙箱测试通过”。

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 五、退款与关闭

| 校验项 | 通过要求 |
| --- | --- |
| 金额 | 使用十进制定点金额，累计退款不超过原订单实付金额 |
| 退款幂等 | 新退款使用新 `out_request_no`；同一次未知结果重试复用原编号、金额和参数 |
| 退款成功 | `fund_change=Y`，或退款查询 `refund_status=REFUND_SUCCESS` |
| 关闭交易 | 只关闭未付款交易；默认流程不发起真实生产关单 |

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 六、Coze 上线边界

| 校验项 | 通过要求 |
| --- | --- |
| 当前生效配置 | 当前 Skill 只接受 `SANDBOX_ACTIVE|UNRESOLVED`；沙箱加载器和固定沙箱网关可唯一证明时为 `SANDBOX_ACTIVE`，无法确认或出现生产/沙箱混用时为 `UNRESOLVED` |
| 生产加载器 | 当前 Skill 不新增、不核验 `integration-alipay` 生产加载器，不注入生产 `appId`，不配置正式网关 |
| 全局密钥卡片 | 后续生产链路的完整口径统一见 `coze-runtime.md`；当前 checklist 和代码/开通过程不唤起卡片、不处理生产私钥；用户主动触发上线前准备交接时才由当前 Skill 调用 `integration_detail('integration-alipay')` |
| 独立生产技能 | 卡片处理完成后由独立 `alipay-payment-production-integration` 技能处理正式网关、生产 appId、项目配置替换和检查；当前 checklist 不触发或模拟 |
| 沙箱上线阻断 | 项目根 `alipay-sandbox-check.mjs` 与 `scripts/build.sh` 受管块完整；沙箱阶段 `development` 检查通过；非 `DEV` 构建会执行项目内 guard，并在 `alipay-sdk-config.ts`（旧 Python 兼容 `alipay_sdk_config.py`）中仍命中沙箱域名或沙箱网关时退出 |
| 上线安全 | 生产上线前仍需在独立生产链路中完成 HTTPS、密钥管理、日志脱敏、异步通知和有限次交易查询补偿验证 |

当前 checklist 不接收 `COZE_CREDENTIAL_STATE` 或 `PRODUCTION_CONVERSION_STATE`。`SANDBOX_ACTIVE` 下缺少沙箱加载器或固定沙箱网关属于阻断缺陷；生产密钥卡片、生产 appId 注入和正式网关替换均不作为本轮代码开发通过项。

<!-- ALIPAY_AIPAY_CHECKLIST_PRODUCTS:webpay -->
## 七、结果输出

内部状态只允许：通过、失败、人工待验证、不适用。最终 `overallResult` 只允许“通过、部分通过、未通过”：

- “通过”：`failedItems=无`、`manualItems=无`、`blockingDefectState=NONE`，且所有适用项有本轮证据；`SANDBOX_ACTIVE` 还要求 `sandboxConfigState=READY`。
- “部分通过”：仅剩沙箱待配置或 UI/公网通知等非阻塞人工项。
- “未通过”：存在接口、安全、加载器、必要依据、`UNRESOLVED` 当前配置或其他阻断缺陷。

`failedItems` 和 `manualItems` 必须包含明确下一步，无项目时传“无”。最终 action、参数、审计收口和 Full Process 转移只以 `../flow.md` 步骤 8 为准；同一次流程只渲染一次最终结果。
