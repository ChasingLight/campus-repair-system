# Node.js 支付宝 SDK 规则

本文是 Coze Node.js 项目接入 AI 网页应用收款时的 SDK 依据。编写或修改 SDK 代码前必须完整读取；不得从其他语言示例或其他支付产品推断调用方式。

## 导入与版本

`alipay-sdk` 的导入方式随实际版本和项目模块制式变化。先读取目标项目已安装包的 `package.json`，再按其中的 `types` 字段读取类型定义，确认 `type`、`exports`、`main`、命名导出和默认导出。优先级固定为：类型定义 > 当前官方文档 > SDK 源码。

- 目标项目已安装 SDK 时复用其版本和包管理器，不擅自升级。
- 缺少依赖时才按项目现有包管理器安装并更新锁文件。
- `code-examples/nodejs/` 中的 `require` 或 `import` 只展示调用位置，不能替代对当前包导出的检查。
- 异步通知示例中的 `checkNotifySignV2` 也必须先由当前包类型定义或实现确认；不存在时停止并查当前官方依据，禁止手写未经确认的验签替代品。

## 执行方法

`alipay.trade.page.pay` 是页面跳转类 API，必须使用 `pageExec()`，不能使用 `exec()`：

```javascript
const htmlForm = await alipaySdk.pageExec('alipay.trade.page.pay', 'POST', {
  bizContent: {
    out_trade_no: orderNo,
    total_amount: amount,
    subject,
    product_code: 'FAST_INSTANT_TRADE_PAY'
  },
  returnUrl,
  notifyUrl
});
```

交易查询、退款、退款查询和关闭交易使用 `exec()`。实际参数和状态判断以本地接口契约为准。

`pageExec()` 返回 HTML 表单，不是 URL。本 Coze Skill 固定由服务端把该表单作为支付接口响应字段交给前端，再由前端按 `interface-contract/webpay-interface-contract.md` 使用 inert `template` 提取、校验并在当前 browsing context 提交；不得另选“服务端直接返回整页 HTML”路线，也不得执行 `window.location.href = paymentHtml`、`window.location.href = form.action`，或把 hidden input 拼成 query string 后 GET 跳转。完整支付表单和签名串不得进入日志、对话或普通临时文件。

## 配置边界

1. 当前 Skill 只实现沙箱开发配置；确认产品已开通后，生产上线或替换正式配置由 Coze 全局密钥卡片和独立 `alipay-payment-production-integration` 技能处理。Node.js 项目的支付宝 SDK 配置入口固定为 `alipay-sdk-config.ts`，该文件负责从项目根读取 `.alipay-sandbox.json` 并组装 SDK；支付、安全和订单控制流不得存在 Mock、固定成功或跳过验签旁路。
2. `alipay-sdk-config.ts` 从 runner 确认的项目根定位 `.alipay-sandbox.json`，固定使用 `appIds[0].appPrivateKey`、`appId` 和 `alipayPublicKey`；该文件不包含网关，沙箱 SDK 初始化必须另行显式使用唯一完整地址 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`。禁止旧地址 `openapi.alipaydev.com`、HTTP、仅 hostname、缺少 `/gateway.do` 或其他变体。Next.js 不得从编译后可能落入 `.next/server/...` 的 `__dirname` 反推项目根；按 `coze-development-guide.md` 核验实际启动目录后可使用 `process.cwd()`，其他框架按实际启动与部署证据选择稳定锚点。任何方式都不得依赖 Agent 启动目录、Skill 目录或猜测路径。
3. Node.js 沙箱固定使用 `appPrivateKey` 对应的原始 PKCS#1 私钥字符串；禁止换用 PKCS#8 的 `appPrivatePkcsKey`，也禁止加 PEM 头尾、解码重编码、写入源码或额外 `.env`。
4. 后续生产链路中的 Node.js `app_private_key` 必须由用户确认为 PKCS#1。若支付宝开放平台密钥工具默认生成的是 PKCS#8 应用私钥，由用户在官方工具内手动转换为 PKCS#1 后再自行维护到 Coze 全局卡片；Agent 在当前 Skill 内不请求、读取、转换或复述私钥。
5. 当前 AI 网页应用收款目标路径固定使用 `alipayPublicKey` 公钥模式、`signType=RSA2` 和普通执行 API，不支持 `certificateExecute()`、`certExecute()` 或证书字段。既有项目中与本次目标无关的其他能力保持原状，但不得复用其证书配置初始化本次支付宝客户端。
6. 当前 Skill 的代码开发和产品开通过程不读取固定托管集成 `integration-alipay`，不注入生产 `appId`，不配置正式网关 `https://openapi.alipay.com/gateway.do`；上线前准备交接时再按 `coze-runtime.md` 的顺序处理。相关实现和验收属于独立生产配置技能。

遇到 `ERR_OSSL_UNSUPPORTED` 或 `DECODER routines::unsupported` 时，先检查项目读取值是否与可信配置原值一致、Node.js 沙箱是否误用了 `appPrivatePkcsKey`、生产私钥是否由用户确认为 PKCS#1，以及 SDK 实际支持的参数是否匹配。该错误本身不能证明需要添加 PEM 头尾、切换沙箱密钥字段或由 Agent 转换格式。

生产上线前必须确认生产 `appId` 与 Coze 全局卡片中的 `app_private_key`、`alipay_public_key` 属于同一生产应用；应用公钥只在支付宝侧登记，不作为当前 Skill 的项目运行时凭证注入。生产私钥格式不符时只使用支付宝官方密钥工具转换，Agent 不请求或处理生产私钥。

## 支付结果

- 同步回跳只用于用户体验，不能改写订单为已支付。
- 支付成功只接受验签通过的异步通知，或 `alipay.trade.query` 返回 `TRADE_SUCCESS|TRADE_FINISHED`。
- 网络超时、SDK 异常或结果未知时执行交易查询，不直接推断成功或失败，也不要求用户立即重复付款。
- 通知验签前保留完整表单参数；验签后继续校验 `app_id`、`out_trade_no`、`total_amount` 和 `seller_id`/`seller_email`，持久化幂等处理成功后只返回纯文本 `success`。

验签失败按以下顺序排查：

1. 实际发送、参与签名和验签的参数及编码是否一致。
2. 项目是否读取 `appPrivateKey` 原始值，且没有包装或污染。
3. `signType` 是否为 `RSA2`。
4. 沙箱与生产网关是否匹配当前配置。

不得因验签失败猜测或改写密钥。

## 同步回跳

用户未明确关闭同步回跳时默认配置 `return_url`，且必须对应项目内真实 GET 路由：

1. 从实际运行配置确定协议、主机、端口和路径，不使用示例域名或猜测端口。
2. 结果页不存在时在当前项目实现；无订单上下文时展示中性状态。
3. GET 验证精确地址无 404、500、认证循环或重定向循环；单页应用直接刷新也必须可用。
4. 真实回跳先验签，或用与当前用户会话绑定的服务端订单标识定位订单，再通过服务端查询或已验签通知状态展示结果。
5. 当前 Agent 有浏览器能力时验证页面非空白且无可见错误；没有能力时标记人工待验证，不新增确认点。

用户明确关闭同步回跳时不传 `return_url`，但仍必须保留异步通知、交易查询和商户订单查询页。

## 时间戳

需要支付宝时间戳时使用本地时间 `yyyy-MM-dd HH:mm:ss`，不能直接发送 ISO 字符串：

```javascript
function formatAlipayTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
```
