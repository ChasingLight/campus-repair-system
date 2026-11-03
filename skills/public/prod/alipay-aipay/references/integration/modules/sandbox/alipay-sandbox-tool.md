# 快速沙箱 MCP 契约

本文只由 [`sandbox-setup-guide.md` 的条件参考路由](sandbox-setup-guide.md#条件参考路由) 在需要核对冻结 MCP 契约时读取，记录 `sandbox_config.sh` 内部使用的固定实现。正常路径不预读；运行时 Agent 不直调 MCP，只执行 flow 登记的 `sandbox ensure|reverify|verify|summary`。

## 固定调用

```bash
PLATFORM="<PLATFORM>" \
PLATFORM_ID="<PLATFORM_ID>" \
ALIPAYCLI_BIZ_INFO='{"skill":"alipay-aipay","skill_version":"coze_v1"}' \
PRODUCT="WEBPAY" \
alipay-cli mcp call alipay-anonymous-sandbox.createAnonymousSandbox \
  --data '{"request":{"appType":"PUBLICAPP"}}' \
  --json
```

- MCP 方法固定 `alipay-anonymous-sandbox.createAnonymousSandbox`。
- 请求体固定 `{"request":{"appType":"PUBLICAPP"}}`。
- CLI 上下文固定携带 `PRODUCT=WEBPAY`；`PRODUCT` 和其他 CLI 上下文都不写进请求 JSON。
- `PLATFORM` 由 Coze 定制运行时固定为 `coze`。
- `PLATFORM_ID` 由 `common.sh` 初始化；Coze 环境优先使用宿主 `COZE_PROJECT_ID`，缺失时沿用当前 run id 规则。该值不对客输出。
- `ALIPAYCLI_BIZ_INFO` 由 `common.sh` 固定生成当前维护上报标识 `coze_v1` 并覆盖外部同名值；能从当前 Coze 环境取得合法 `COZE_PROJECT_SPACE_ID` 时同一 JSON 还会携带 `skill_user_id`，否则只省略该字段。只有维护者明确切换下一标识时才更新。

脚本固定执行 `result.content[0].text` 信封解包；无信封时只接受唯一合法业务 JSON。只有 `success === true` 且 `data` 满足 `sandbox-setup-guide.md` 的 Node.js 必含字段时才允许落盘。解析失败不能当作空结果。

## 结果边界

成功候选的 `data` 至少包含：`appIds[0].appId`、PKCS#1 的 `appPrivateKey`、`alipayPublicKey`、`appPublicKey`，以及商家和买家测试账号必含字段。真实结构按原样写入 `.alipay-sandbox.json`，不得扁平化或改写密钥；Node.js 不读取 PKCS#8 的 `appPrivatePkcsKey`。

单次 `ensure` 的创建总预算固定为初次加最多 2 次，所有可重试分类共用该上限且成功立即停止：明确证明连接前未发送、结构化响应明确 `success=false`，或 `success=true` 但候选 `data` 缺少必含字段时，每次间隔 3 秒后重试。timeout、连接中断、服务不稳定或发送阶段不明都视为可能已发出，禁止自动重放；响应信封或业务 JSON 无法唯一解析时也不重放。已有配置的只读复核可按固定预算重试。预算耗尽后由 `ensure|reverify` 渲染待配置终态，不暴露原始响应、`traceId`、密钥或账号密码。

参数或返回结构无法按当前契约唯一确认时停止并交由维护者核对，禁止尝试近似 MCP 方法或临场增加参数。
