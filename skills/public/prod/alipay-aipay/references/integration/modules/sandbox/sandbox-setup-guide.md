# Node.js 沙箱配置指南

本文是 Coze Node.js 项目沙箱配置的维护契约。运行时 Agent 只执行 Integration flow 登记的 `sandbox ensure|reverify|verify|summary`；禁止对 `.alipay-sandbox.json` 追加临时 `jq`、`cat`、`grep`、`ls`、`stat` 或自制解析脚本。

## 条件参考路由

本指南只由 Integration flow 在登记的沙箱协议异常或用户明确要求沙箱配置与重试详情时读取，正常成功路径不预读。只有需要核对 `sandbox_config.sh` 使用的固定 MCP 方法、请求 JSON、CLI 上下文字段、响应信封/必含字段或创建是否允许重试时，才继续完整读取[快速沙箱 MCP 契约](alipay-sandbox-tool.md)。该契约只用于核对脚本冻结实现，不授权 Agent 直调 MCP、改名、试近似方法或临场增加参数。

## 快速沙箱固定流程

Coze 由 `sandbox_config.sh` 在一次动作内完成：

1. 配置不存在时调用冻结的 `createAnonymousSandbox`，存在时只验证，禁止覆盖或要求删除后重建。
2. 从唯一合法响应中提取候选 `data`，校验必含字段后才原子写入项目根 `.alipay-sandbox.json`。
3. 确认文件未被 Git 跟踪，`.gitignore` 含精确 `/.alipay-sandbox.json`，权限为 `0600`。
4. 创建/验证阶段 stdout 为空，只通过 `ALIPAY_AIPAY_INTERNAL:` 行返回路径和 `FLOW:SANDBOX_CONFIG_READY`。
5. 既定重试耗尽后渲染唯一 `sandbox.configuration.pending/CREATE|VERIFY` 并返回对应待配置 marker；待配置不阻止不依赖沙箱字段的代码实现。

配置必须包含且非空：

| 字段 | 用途 |
| --- | --- |
| `appIds[0].appId` | 沙箱应用 ID |
| `appIds[0].appPrivateKey` | Node.js PKCS#1 应用私钥 |
| `appIds[0].alipayPublicKey` | 支付宝公钥 |
| `appIds[0].appPublicKey` | 应用公钥 |
| `sandboxAccounts.partner.userId` | 沙箱商家标识 |
| `sandboxAccounts.user.userId` | 沙箱买家标识 |
| `sandboxAccounts.user.email` | 沙箱买家登录账号 |
| `sandboxAccounts.user.logonPassword` | 沙箱买家登录密码 |
| `sandboxAccounts.user.payPassword` | 沙箱买家支付密码 |

候选字段不完整时不得落盘；已有配置不完整、不安全、被 Git 跟踪或权限不合格时不得使用。Node.js 固定使用 `appPrivateKey` 对应的 PKCS#1 原始字符串，禁止换用 PKCS#8 的 `appPrivatePkcsKey`；不加 PEM 头尾、不转格式、不复制到源码或额外 `.env`。

`.alipay-sandbox.json` 不包含网关字段。Node.js 项目当前沙箱生效配置必须在源码中显式使用唯一完整地址 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；旧地址 `openapi.alipaydev.com`、HTTP、仅 hostname、缺少 `/gateway.do` 或其他变体都不得使用，也不得在同一源码中保留可切换或回退到沙箱的生产配置。

## 配置后置校验

仅 `sandboxConfigState=READY` 时接入配置并检查：

- 服务端从 runner 确认的实际 Node.js package 根稳定定位 `.alipay-sandbox.json`。Next.js 不从编译后 `__dirname` 反推项目根，仅在实际开发、构建和启动目录已核验时使用 `process.cwd()`；其他框架按启动与部署证据选择稳定锚点。
- 从同一个 `appIds[0]` 映射 `appId`、PKCS#1 的 `appPrivateKey` 和 `alipayPublicKey`，不读取 `appPrivatePkcsKey`。
- SDK 初始化固定使用 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` 和 `RSA2`。
- 加载器没有截断、包装、替换或重新编码字段；任何错误都失败关闭。
- 源码、普通日志和额外配置中没有敏感值副本。

待配置时仍实现完整接口和加载边界，但配置缺失/无效必须明确失败，禁止占位 APPID、示例密钥或生产配置回退。

## 摘要与付款体验

代码开发和配置后置校验完成后，Coze 运行环境才执行：

```bash
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" sandbox summary webpay "$PROJECT_PATH" Node.js
```

脚本统一渲染一张摘要和配置提醒。只有该摘要允许展示已验证快速沙箱的应用/账号标识、买家登录账号及密码、沙箱标识和配置路径；私钥、公钥、原始配置和完整 MCP 响应始终禁止展示。

付款体验必须从目标项目取得真实启动命令和浏览器支付页地址：

- 默认实现并验证真实 `return_url`；用户明确关闭同步回跳时确认请求未传该字段，并保留通知、交易查询和订单查询页。
- `curl` 取得 HTML 表单只算接口冒烟检查，不能替代浏览器入口。
- 使用唯一托管入口输出实际体验指引：

  ```bash
  node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" integration-message webpay-sandbox-experience --start-command "$START_COMMAND" --payment-url "$PAYMENT_URL" --return-mode "$RETURN_MODE"
  ```

  `RETURN_MODE` 只允许 `RETURN|NO_RETURN`。该入口只接收真实启动命令、浏览器支付页地址和回跳模式；账号与密码只使用前面已展示的沙箱摘要，不得再次作为参数传入。任一必需值未知时不渲染半模板，列入人工待验证。
- 用户未实际付款或缺少 UI 证据时不得表述为“沙箱测试通过”。支付结果仍只以验签通知或交易查询为准。

## 重试与失败

| 场景 | 固定处理 |
| --- | --- |
| 创建调用明确连接前未发送 | 与本次创建共用“初次 + 最多 2 次”总预算，每次间隔 3 秒；仅限 DNS 失败、connection refused 或宿主连接前禁网 |
| 创建调用 timeout、断连、服务不稳定或发送阶段不明 | 禁止自动重放，进入 `CREATE_PENDING`；只有用户明确接受可能新建一个沙箱并要求再次创建时，才执行一次 `ensure` |
| 创建返回结构化 `success=false` | 与本次创建共用“初次 + 最多 2 次”总预算，每次间隔 3 秒；任一次成功立即停止 |
| 创建返回 `success=true` 但候选字段不完整 | 不落盘；与本次创建共用“初次 + 最多 2 次”总预算，每次间隔 3 秒；任一次字段完整即停止 |
| 已有配置字段复核失败 | 只读复核最多重试 2 次，每次间隔 3 秒，随后进入 `VERIFY_PENDING`；恢复时只执行 `reverify`，不得删除、覆盖或重建 |
| 待配置 | 跳过字段使用、摘要、配置后置校验和付款体验；最终只能“部分通过”或“未通过” |

全部可重试创建场景共用三次总调用上限，不按错误分类叠加预算。禁止编造、猜测、补全或模拟任何字段；禁止把脚本协议失败降级为配置待处理；禁止重复创建可能已经发出的写请求。
