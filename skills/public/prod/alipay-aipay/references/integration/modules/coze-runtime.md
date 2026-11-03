# Coze 运行时与生产链路边界

本文只说明当前 `alipay-aipay` Coze 定制版在 Coze Node.js 项目中的运行时边界，以及上线前与独立生产链路的交接口径。代码修改顺序、Coze 预览收银台和框架适配统一读取 [`coze-development-guide.md`](coze-development-guide.md)。

## 当前 Skill 边界

- 当前 Skill 只支持 Coze、Node.js 和 AI 网页应用收款。
- Integration 只完成沙箱代码开发、本地验收和防误上线 guard；Onboarding 只完成网站支付签约和 `WEBAPP` 应用发布。
- 当前 Skill 不执行生产上线、沙箱/demo 转正式、生产 appId 注入、正式网关替换或生产配置检查。
- 代码开发和产品开通过程不调用 `integration_detail`，不读取 Coze“支付宝支付密钥托管”卡片，不触发或模拟 `alipay-payment-production-integration`。
- 用户主动触发上线前准备时，当前 Skill 只负责交接顺序：先调用 Coze 宿主 `integration_detail('integration-alipay')` 唤起全局密钥卡片，再衔接独立 `alipay-payment-production-integration`；不得把生产配置替换合并回当前 Skill。
- 生产环境应用私钥不得发送给 Agent，也不得写入源码、日志、`.env`、测试快照或普通临时文件。

## 沙箱运行时

项目当前生效配置应保持沙箱开发路径：

- 沙箱网关固定为 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`，不得从 `.alipay-sandbox.json` 推导或缩写。
- 沙箱 `READY` 时，服务端代码通过 `alipay-sdk-config.ts` 从当前项目根读取已验证的 `.alipay-sandbox.json`，使用 `appIds[0].appId`、PKCS#1 `appIds[0].appPrivateKey` 和 `appIds[0].alipayPublicKey` 初始化 Node.js SDK，固定 `RSA2`。
- 沙箱 pending 时，加载器必须明确失败，不得写入占位 appId、密钥或回退到生产/示例配置。
- 代码不得新增自动环境切换分支，不得在生产凭证缺失时回退沙箱，也不得把生产私钥、公钥或 token 写入项目。

## 防误上线 guard

代码实现后按 flow 执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox-check install-build-guard "$PROJECT_PATH" Node.js
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox-check verify-build-guard "$PROJECT_PATH" Node.js
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox-check development "$PROJECT_PATH" Node.js
```

`install-build-guard` 固定维护项目根 `alipay-sandbox-check.mjs` 和 Coze 原始构建入口 `scripts/build.sh` 中唯一受管块。`scripts/build.sh` 受管块在 `COZE_PROJECT_ENV=DEV` 时跳过；变量缺失或任何非 `DEV` 值均运行项目内 guard，失败后显式 `exit 1`。该 guard 只检查明确命名的支付宝 SDK 配置入口：Node.js 以 `alipay-sdk-config.ts` 为准，旧 Python 兼容 `alipay_sdk_config.py`；它只在这些入口中检查沙箱域名，不参与 SDK 运行时选环境。

当前 Skill 的 runtime gateway 只公开上述沙箱开发相关动作，不公开 production 检查动作作为当前流程能力。后续独立生产技能可以按自身发布契约处理生产配置替换和验收。

## 未来生产交接

本节只在用户明确提出上线前准备、正式上线、生产配置替换、支付密钥托管，或已经完成代码开发和产品开通后要求继续上线时读取。

当用户在代码开发和产品开通完成后需要上线，或主动要求替换为生产配置时，流程顺序固定为：

1. 当前 Skill 提醒用户前往支付宝 AI 付站点（https://aipay.alipay.com/?from=alipay-aipay-skill-coze）首页-一站式接入-AI网页应用收款-产品开通节点查看产品开通状态。
2. 确认产品已开通后，用户可以在 Coze 主动触发上线前准备流程。
3. 当前 Skill 执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message production-credential-handoff`，先把 stdout 原文可见送达。
4. 送达后立即调用 Coze 宿主工具 `integration_detail('integration-alipay')`。该调用会检查并按需唤起全局“支付宝支付密钥托管”卡片；它不是 shell 命令、Skill runtime、MCP 调用或项目运行时 `getIntegrationCredential()`。当前 Skill 自身不读取托管凭证；若后续独立生产链路需要读取它们，应由其自己的 workload-identity runtime 负责，不是当前 Skill 的动作。禁止尝试近似工具名。
5. 如果全局范围未配置，Coze 展示全局密钥配置卡片，由用户维护产品开通过程已确认的同一生产 appId 对应的 `app_private_key`（应用私钥）和 `alipay_public_key`（支付宝公钥）。如果没有弹出卡片，可能是当前 Coze 编程平台已经配置了全局支付宝支付密钥；查看入口：扣子编程首页 → 左侧栏集成管理 → 外部集成 → 支付宝支付密钥托管。生产 `appId` 不在卡片内。配置前必须确认生产 appId、支付宝公钥和应用私钥属于同一套生产应用；上线前准备应优先沿用本轮 application-result/closeout 已确认的最新生产 appId；如后续无法唯一确认生产 appId，只能要求用户提供 appId，不得索取应用私钥。若用户后续明确改用其他生产 appId，以最新确认的同一套生产应用为准，旧 appId 不再继续用于上线交接。
6. `integration_detail('integration-alipay')` 调用完成后，才允许触发独立 `alipay-payment-production-integration` 技能完成上线前正式网关、生产 appId、项目配置替换和检查。宿主工具不可用、调用失败或名称不匹配时，只保留手工入口并停止，不得跳过卡片直接触发独立生产技能。

Coze 的支付宝支付密钥配置是全局一份，替换会影响仍使用上一套密钥的部署。当前 Skill 只能在上线前准备交接中唤起卡片；不得读取、解析、输出或保存卡片中的应用私钥，也不得把卡片调用结果解释为生产 appId 已配置、项目已替换或生产交易已验证。

## 字段契约

用户询问 Coze 支付宝支付密钥配置有哪些字段、`appId` 是否在卡片内、是否随卡片保存/自动配置/自动注入，或要求核对相关说法时，只执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message credential-field-contract
```

stdout 是完整答复。禁止用 `integration_detail` 查询字段，也禁止自由补充卡片字段。
