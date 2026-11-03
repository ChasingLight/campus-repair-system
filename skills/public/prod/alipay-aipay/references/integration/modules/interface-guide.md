# AI 网页应用收款接口与示例索引

本文件是 `integration_context_runner.mjs` 的唯一产品、契约、示例和沙箱验收路由事实源。当前 Skill 固定服务 Coze Node.js 项目，不做产品或语言分流；代码开发还会固定加载 `coze-development-guide.md`，其读取顺序由 runner 的 `required_reading` 唯一给出。

## 默认读取路由

| productType | 产品 | 必读本地契约 | 必读示例目录 | 沙箱验收动作 | 沙箱参考 |
| --- | --- | --- | --- | --- | --- |
| `webpay` | AI 网页应用收款 | `interface-contract/webpay-interface-contract.md`、`interface-contract/common-trade-contract.md`、`interface-contract/notify-url-contract.md` | `2-网站支付`、`1-通用接口` | `WEB_PAYMENT_EXPERIENCE` | `sandbox/sandbox-setup-guide.md` |

代码示例只保留 `code-examples/nodejs/`：专用下单示例固定为 `2-网站支付/统一收单下单并支付页面接口代码示例.md`；交易查询、退款、退款查询、关闭交易和异步通知固定读取 `1-通用接口/` 下对应示例。从 `references/integration/flow.md` 读取时路径前缀为 `modules/code-examples/nodejs/`。

AI 网页应用收款覆盖 PC 网页和手机浏览器网页/H5，底层接口固定 `alipay.trade.page.pay`。用户未明确关闭同步回跳时，还必须按 `alipay-sdk-reminder.md` 实现同步回跳结果页；支付成功仍只以验签通过的异步通知或交易查询为准。

本地未上线时，可按 `../flow.md` 的本地生产参数验收模式先完成结果确认链路验证；正式上线前仍必须补齐公网 HTTPS `notify_url`、验签、幂等、关键字段校验、`success` 回写和有限次补偿查询。在线文档仅在本地依据缺失、字段不确定、排查官方错误码、用户明确要求或官方能力变化时作为 fallback。
