# AI 网页应用收款异步通知契约

sourceUrl:

- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/async-notify-verify.md>

`notify_url` 是商家 Node.js 服务端接收支付宝 POST 表单通知的地址，不是前端页面地址。真实生产或公网联调必须使用由项目代码/服务端实际构造出的、可公网访问且不重定向的 HTTPS 地址，不是用户在对话里单独拍板的输入项。用户未额外指定域名时，默认使用 Coze 当前项目的 `COZE_PROJECT_DOMAIN_DEFAULT` 作为域名前缀；用户明确指定域名时，必须使用当前 Coze 项目的实际域名，自定义域名可参考 `COZE_PROJECT_DOMAIN_ALL` 核对。通知 path 必须对应项目真实 POST 路由，新项目可使用 `/api/pay/notify`，已有项目可沿用真实通知路由。本地生产参数验收可暂时省略，但通知处理代码和交易查询兜底仍必须实现；没有地址时省略字段，不能传 `undefined`、`null`、空字符串或占位 URL。

## 处理链路

1. 使用 URL encoded/form 解析接收完整 POST 表单，不能按 JSON 解析。
2. 验签前保留所有参数、字段名和值；使用当前项目 `alipay-sdk` 已确认存在的验签 API 验证 `sign`。
3. 用通知中的 `app_id` 选择本地支付配置和支付宝公钥，但不把通知内容视为可信预期值。
4. 验签通过后按 `out_trade_no` 查询持久化订单，并以本地配置或订单事实校验 `app_id`、`total_amount`、`seller_id`/`seller_email`。
5. 仅 `TRADE_SUCCESS|TRADE_FINISHED` 且不是退款、关单或其他事件时认定付款成功；至少排除 `out_biz_no`、`gmt_refund`、`refund_fee` 等事件特征。
6. 使用持久化订单状态、`notify_id`、`out_trade_no`、`trade_no` 和事件类型保证幂等；通知幂等记录与订单状态更新必须在同一数据库事务中提交，避免先占用通知 ID 后订单更新失败。进程内 Map 或锁只适合非生产演示。
7. 业务处理成功后返回纯文本 `success`；验签失败或处理失败返回 `fail`。
8. 未收到通知或状态未知时调用 `alipay.trade.query` 补偿查询；前端或服务端主动查询必须有限次重试并有停止条件，不能无限轮询。

默认至少处理：`notify_type`、`notify_id`、`sign_type`、`sign`、`trade_no`、`app_id`、`out_trade_no`、`trade_status`、`total_amount`、`seller_id` 或 `seller_email`。

退款、关闭等非付款成功事件在验签和业务归属校验通过后可返回 `success` 避免重试，但不得把订单改成已支付。用户付款后可能不会回到下单页或结果页，`notify_url` 是商户不依赖前端回跳确认付款结果的关键链路；没有完成公网通知联调时只能表述为本地验收，不能表述为生产就绪。

本地示例固定为 `../code-examples/nodejs/1-通用接口/异步通知处理代码示例.md`。示例中的验签方法必须先由目标项目实际安装的 `alipay-sdk` 类型定义或实现确认。
