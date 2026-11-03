# CLI Command Templates

本文件提供发布子 skill 一期能力对应的 CLI 命令模板。默认约定：

- CLI: `alipay-cli`
- server: `apprelease`
- 输出: `--json`

## 1. 登录态检查

```bash
alipay-cli diagnose auth --json
```

## 2. 非交互登录

发起登录：

```bash
alipay-cli login --non-interactive --json
```

：等待用户确认，调用：

```bash
alipay-cli login --complete --json
```

## 3. MCP server / tool 可用性检查

```bash
alipay-cli mcp list apprelease --json
```

## 4. queryApplicationList

WEBAPP:

```bash
alipay-cli mcp call apprelease.queryApplicationList \
  -d '{"request":{"appTypes":["WEBAPP"]}}' \
  --json
```

说明：

- `uid` 不在命令里显式传，默认由 CLI OAuth 会话和 MCP 链路注入
- 本命令用于创建前检查当前主体下是否已有可阻断或可复用的同类型应用

## 5. createApplication

WEBAPP:

```bash
alipay-cli mcp call apprelease.createApplication \
  -d '{"request":{"applicationType":"WEBAPP","createScene":"cli"}}' \
  --json
```

显式分步模式：

- 用户提供应用名称或 logo 时，可以补充到 `request`
- 字段名以 `alipay-cli mcp list apprelease --json` 中 `createApplication` 的入参描述为准
- 不确定映射时先查 `mcp list`，不要猜字段

## 6. queryApplicationInfo

```bash
alipay-cli mcp call apprelease.queryApplicationInfo \
  -d '{"request":{"appId":"2021001234567890"}}' \
  --json
```

显式分步模式下允许用户指定 `appId`。

## 7. queryApplicationDetail

```bash
alipay-cli mcp call apprelease.queryApplicationDetail \
  -d '{"request":{"appId":"2021001234567890"}}' \
  --json
```

显式分步模式下允许用户指定 `appId`。

## 8. createKeyConfirmPage

前置说明：

- 必须先引导用户前往 [支付宝密钥生成工具文档](https://opendocs.alipay.com/common/02kipk) 使用密钥工具生成应用公私钥
- `publicKey` 必须由用户自己输入并提供
- skill 不自动生成、不推断、不改写 `publicKey`
- `signType` 默认传 `"RSA2"`
- 若用户未明确提供 `publicKey`，不继续调用该命令

```bash
alipay-cli mcp call apprelease.createKeyConfirmPage \
  -d '{"request":{"appId":"2021001234567890","signType":"RSA2","publicKey":"MIIBIjANBgkqhkiG..."}}' \
  --json
```

说明：

- 返回值里会同时包含 `confirmPageUrl`
- 透出 markdown `confirmPageUrl` 跳转链接 和 有效期 10 分钟
- 若 PC 链接过期，用户明确触发刷新时，重新调用本命令生成新的链接

## 9. queryApplicationSecurityKey

通用查询：

```bash
alipay-cli mcp call apprelease.queryApplicationSecurityKey \
  -d '{"request":{"appId":"2021001234567890"}}' \
  --json
```

skill 等待用户确认 查询公钥是否设置成功：

```bash
alipay-cli mcp call apprelease.queryApplicationSecurityKey \
  -d '{"request":{"appId":"2021001234567890","publicKey":"MIIBIjANBgkqhkiG..."}}' \
  --json
```

创建前检查某个已有应用是否已配置公钥：

```bash
alipay-cli mcp call apprelease.queryApplicationSecurityKey \
  -d '{"request":{"appId":"2021001234567890"}}' \
  --json
```

提审前额外动作：

- 再查一次 `queryApplicationSecurityKey`
- 只取 `signType="RSA2"` 的项
- 将该项的 `alipayPublicKey` 写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`（不存在则创建，存在则覆盖）
- 若缺少该值，直接返回错误，不继续提审

提审成功后：

- 告知用户 `✅ 支付宝公钥已保存至: /workspace/projects/<appId>-alipayPublicKey.keytext`

## 10. submitApplicationAudit

```bash
alipay-cli mcp call apprelease.submitApplicationAudit \
  -d '{"request":{"appId":"2021001234567890"}}' \
  --json
```

## 11. diagnose 建议命令

认证问题：

```bash
alipay-cli diagnose auth --json
```

网络问题：

```bash
alipay-cli diagnose network --json
```

配置问题：

```bash
alipay-cli diagnose config --json
```

## 12. 说明

- 所有模板都以 `request` 包一层，和当前 MCP tool 入参结构保持一致
- `identityContext` 不在命令里显式传，默认由 CLI OAuth 会话和 MCP 链路注入
- `applicationType` 在 `submitApplicationAudit` 中可缺省，不作为最小模板字段
