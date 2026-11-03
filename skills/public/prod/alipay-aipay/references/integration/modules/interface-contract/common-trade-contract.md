# AI 网页应用收款通用接口契约

本文是交易查询、退款、退款查询和关闭交易的本地依据。

sourceUrl:

- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/alipay-trade-query.md>
- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/alipay-trade-refund.md>
- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/alipay-trade-fastpay-refund-query.md>
- <https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/alipay-trade-close.md>

## 交易查询

接口固定 `alipay.trade.query`。`out_trade_no` 和 `trade_no` 二选一；同时存在时优先 `trade_no`。

SDK 请求成功不代表付款成功。业务状态必须显式映射：`TRADE_SUCCESS|TRADE_FINISHED` 为已支付，`WAIT_BUYER_PAY` 为待支付，`TRADE_CLOSED` 为已关闭，其他或缺失状态为未知。查询响应先归一化为同一对象再读字段，兼容 `alipay_trade_query_response` 包裹和顶层对象；再统一读取 `code`、`msg`、`trade_status`/`tradeStatus`。待支付和未知状态不得返回 HTTP 500，也不得判定支付成功；支付结果不明、未收到通知或重新下单前均应查询，重新下单前先关闭仍未支付的旧订单。前端轮询或服务端补偿查询必须使用有限次数、间隔和停止条件，禁止无限查询占用资源。

查询返回非 `10000` 时保持订单状态未知，并保留可脱敏诊断证据。`code=40004` 与 `msg=Business Failed` 本身不足以判断根因；必须继续核对实际 `sub_code`、`sub_msg`、响应中实际存在的 trace 标识、沙箱/生产环境、非敏感 appId、精确完整网关和本次使用的精确 `out_trade_no`，并确认查询与下单属于同一应用和环境。禁止仅凭 `40004` 声称沙箱订单同步延迟、定期清理或代码必然无误，也禁止承诺生产环境一定查询成功。证据不足时明确保持“未知”并按 `../troubleshooting-flow.md` 获取依据。

## 退款

接口固定 `alipay.trade.refund`。`refund_amount` 必填；`out_trade_no` 和 `trade_no` 二选一。金额使用十进制定点语义，并在调用前校验累计退款不超过原订单实付金额。

每次新退款使用新的 `out_request_no`；同一次退款遇到网络异常、超时或未知结果时，必须复用原 `out_request_no`、金额和请求参数。`code=10000` 只表示请求受理；只有 `fund_change=Y` 通常表示发生资金变化，`fund_change=N` 或缺失时必须通过退款查询确认。

## 退款查询

接口固定 `alipay.trade.fastpay.refund.query`。`out_request_no` 必填；`out_trade_no` 和 `trade_no` 二选一。退款查询与退款请求建议至少间隔 10 秒。只有 `refund_status=REFUND_SUCCESS` 表示退款成功。

## 关闭交易

接口固定 `alipay.trade.close`，用于关闭未付款交易。`out_trade_no` 和 `trade_no` 二选一，同时存在时优先 `trade_no`。关闭成功后交易不可继续支付。默认集成不得主动关闭真实生产交易。
