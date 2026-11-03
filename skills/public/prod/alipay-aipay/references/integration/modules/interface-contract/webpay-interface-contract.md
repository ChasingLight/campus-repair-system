# AI 网页应用收款本地接口契约

本文是 AI 网页应用收款专用下单接口的默认本地依据。在线文档只在本地契约或示例缺失、字段不确定、排查官方错误码、用户明确要求或官方能力变化时作为 fallback 读取。

sourceUrl:

- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/ai-web-app-payment-integration-guide.md>
- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/alipay-trade-page-pay.md>

## 默认范围

AI 网页应用收款必须覆盖：`alipay.trade.page.pay`、交易查询、退款、退款查询、关闭交易、异步通知和默认同步回跳结果页。

查询、退款、退款查询、关闭交易读取 `common-trade-contract.md`；异步通知读取 `notify-url-contract.md`。

## 下单接口

`alipay.trade.page.pay` 是 AI 网页应用收款唯一默认下单接口，电脑网页、手机浏览器网页和 H5 场景均使用该接口，不改用其他网页支付产品接口。

公共参数：

| 字段 | 要求 |
| --- | --- |
| `method` | 固定 `alipay.trade.page.pay` |
| `notify_url` | 生产或公网联调时传入；本地生产参数验收模式可临时不传，但通知处理代码必须存在 |
| `return_url` | 用户未明确关闭同步回跳时默认传入；未指定回跳页面时指向支付结果页，新项目默认 `/pay/result`，已有项目沿用当前项目实际 GET 路由 |

业务参数：

| 字段 | 要求 |
| --- | --- |
| `out_trade_no` | 必填，商户订单号，商户侧唯一 |
| `total_amount` | 必填，单位元，精确到小数点后两位，范围 `[0.01,100000000]` |
| `subject` | 必填，订单标题 |
| `product_code` | 必填且固定 `FAST_INSTANT_TRADE_PAY` |

`out_trade_no`、`subject` 和 `total_amount` 必须由服务端依据可信商品与订单事实生成并持久化；客户端只提交商品标识、数量等业务输入。不得直接信任客户端购物车、localStorage、展示价格或请求金额，也不得把无效价格兜底为 `0` 后继续创建订单或发起支付。

## 响应与结果

- Node.js 必须使用页面跳转方法 `pageExec`，不能使用普通 `exec`。
- 本 Skill 固定使用 `pageExec('alipay.trade.page.pay', 'POST', ...)`，把响应作为 HTML form 内容交给浏览器显式提交，禁止当作 URL，也禁止把 `form.action`、hidden input、`URLSearchParams` 或 `FormData` 拼成 query string 后用 GET 跳转。没有当前 SDK 实际返回或官方资料时，不得额外声称 GET 必然产生不完整签名或无效 URL。
- `curl` 获取到 HTML form 只能证明接口有响应，不能替代浏览器付款入口和沙箱付款体验。
- `return_url` 或前台页面只作支付结束通知，不能作为付款成功依据；付款成功以验签通过的异步通知或交易查询为准。

## 浏览器提交体验

1. 默认在用户点击支付后显示应用内 loading，向服务端创建支付并立即提交返回的表单，不增加第二次确认。禁止在支付流程调用 `window.confirm()`、`window.alert()` 或 `window.prompt()`；错误在当前应用内联展示。只有用户明确要求或项目既定体验包含订单确认时，才使用应用自有 modal 展示商品名、金额和订单号，并在其唯一确认回调提交；取消时不发起支付。
2. 使用 inert `template` 解析 `pageExec()` 返回 HTML，只提取 `<form>`，以隐藏节点追加到当前文档并显式调用 `HTMLFormElement.prototype.submit.call(form)`。该原生调用避免名为 `submit` 的控件遮蔽方法；React 不会普遍拦截原生 form 提交。通过 `innerHTML` 插入的 `<script>` 不会执行，禁止依赖返回 HTML 内嵌脚本完成提交；也不得以“DOMParser 会执行脚本”为由解释统一选择 `template`。
3. 表单只允许 HTTPS 的沙箱或生产固定网关 `/gateway.do`，并使用 POST。前端校验不得把沙箱域名写成唯一白名单；应以当前生效配置返回的固定完整网关为准，不在浏览器里自行猜环境或拼接环境列表。移除 `target` 后在当前 browsing context 提交，不打开新标签页，不增加全屏白色遮罩，也不使用 `document.open()`、`document.write()` 或 `document.close()` 替换当前文档。禁止因 `form.submit()` 未触发可见跳转，就改为 `window.location.href = form.action`，或遍历 hidden input 拼 URL 后 GET 跳转。Coze 预览是否允许 iframe 内跨域导航必须以实际浏览器证据为准；平台阻止时不得静默改成新标签页或 GET 跳转。
4. 表单缺失、方法或目标不合法时在应用内展示受控错误并保留当前页面；不得弹浏览器原生对话框或静默无反应。
5. 默认从创建支付请求的异步处理函数直接解析并提交，不为等待框架渲染而引入 state/effect。项目明确保留应用内确认 modal 时在其唯一确认回调中提交；确需 effect 时必须一次性消费待提交状态，避免重复渲染造成二次下单跳转。

## 商户结果页字段契约

支付宝 OpenAPI 请求与通知字段继续使用官方 snake_case，例如 `out_trade_no`、`trade_status`。`outTradeNo` 和 `tradeStatus` 是商户项目内部字段，不得描述为支付宝固定回跳参数。

- 新生成项目统一让商户 `return_url` 自带查询参数 `outTradeNo`，结果页读取同名参数；商户查询 API 先归一化 `alipay_trade_query_response` 包裹和顶层响应，再将支付宝查询响应的 `trade_status` 映射为 `tradeStatus`。已有项目存在其他内部命名时可保留，但 URL 构造、结果页读取和查询 API 响应必须完全一致。
- 结果页根据 `tradeStatus` 渲染时必须提供 `UNKNOWN` 配置，并使用 `statusConfig[tradeStatus] || statusConfig.UNKNOWN` 一类兜底；缺失或未知状态展示中性结果，不读取 `statusConfig[undefined].icon`，也不将订单改为已支付。
- 回跳参数只能定位订单上下文，真实状态仍来自服务端交易查询或已验签异步通知；不得直接信任前台参数。结果页若主动轮询交易查询，必须设置有限次数、间隔和停止条件，禁止无限查询占用资源。

新项目结果页至少保持以下映射关系；框架语法可调整，字段名和兜底语义不得漂移：

```javascript
const outTradeNo = new URLSearchParams(window.location.search).get('outTradeNo');
const tradeStatus = data.tradeStatus || 'UNKNOWN';
const config = statusConfig[tradeStatus] || statusConfig.UNKNOWN;
```
