# Contracts

## 一期工具范围

一期只保留发布主链路与状态查询所需工具。仅支持 `WEBAPP`。执行基座固定为 `alipay-cli`。

## CLI MCP Tool 映射

- `apprelease.queryApplicationList`：查询同类型已有应用
- `apprelease.createApplication`：创建应用
- `apprelease.createKeyConfirmPage`：生成公钥确认页，markdown链接
- `apprelease.queryApplicationSecurityKey`：查询应用公钥状态
- `apprelease.submitApplicationAudit`：提交审核
- `apprelease.queryApplicationInfo`：轻量状态查询
- `apprelease.queryApplicationDetail`：补充详情
- `queryKeyConfirmParams` / `addOrModifyApplicationRSAKey` 不作为 skill 内可直接替代的 CLI MCP tool 节点；一期不把它们纳入发布子 skill 的 tool 面

## CLI 前置能力

- 登录态检查命令：`alipay-cli diagnose auth --json`
- 未登录时的非交互登录命令：
  - `alipay-cli login --non-interactive --json`
  - `alipay-cli login --complete --json`
- 调试或初始化时可执行：`alipay-cli mcp list apprelease --json`

## MCP tool 最小入参

说明：

- 以下都是最小 `request` payload
- `identityContext` 不显式传，默认由 CLI OAuth / MCP 注入
- `createApplication.createScene` 在 CLI 场景固定传 `"cli"`
- 显式分步模式下，可按 `alipay-cli mcp list apprelease --json` 返回的 tool 入参描述补充可选字段
- 不确定字段名或映射关系时，先查 `mcp list`，不要猜字段

### queryApplicationList

WEBAPP 最小入参：

```json
{
  "request": {
    "appTypes": ["WEBAPP"]
  }
}
```

显式分步模式：

- 用户可以输入应用名称与 logo
- 字段映射以 `mcp list apprelease` 中 `createApplication` 的入参描述为准
- 未提供时仍使用最小入参，底层 TR 负责默认补齐

说明：

- `uid` 不显式传入
- 只允许列出 `ON_LINE` 应用；无可列应用时直接走新建应用路径

### createApplication

WEBAPP 最小入参：

```json
{
  "request": {
    "applicationType": "WEBAPP",
    "createScene": "cli"
  }
}
```

### queryApplicationInfo

```json
{
  "request": {
    "appId": "2021001234567890"
  }
}
```

显式分步模式：

- 允许用户直接输入 `appId`
- 只查询用户指定的 `appId`

### queryApplicationDetail

```json
{
  "request": {
    "appId": "2021001234567890"
  }
}
```

显式分步模式：

- 允许用户直接输入 `appId`
- 只查询用户指定的 `appId`

### createKeyConfirmPage

```json
{
  "request": {
    "appId": "2021001234567890",
    "signType": "RSA2",
    "publicKey": "MIIBIjANBgkqhkiG..."
  }
}
```

说明：

- 必须先引导用户前往 [支付宝密钥生成工具文档](https://opendocs.alipay.com/common/02kipk) 使用密钥工具生成应用公私钥
- `publicKey` 必须由用户自行输入并提供
- skill 不自动生成、不推断、不改写 `publicKey`
- 不向用户表达“帮你生成公钥”这类含义
- 公钥相关提示必须补充安全提醒，提示用户谨慎保管、避免泄露
- `signType` 默认 `"RSA2"`
- 用户未明确提供 `publicKey` 时，不调用 `createKeyConfirmPage`

### queryApplicationSecurityKey

通用最小入参：

```json
{
  "request": {
    "appId": "2021001234567890"
  }
}
```

skill 等待用户确认 公钥是否设置成功时的最小入参：

```json
{
  "request": {
    "appId": "2021001234567890",
    "publicKey": "MIIBIjANBgkqhkiG..."
  }
}
```

说明：

- 不传 `publicKey` 时，仅返回当前应用密钥配置
- 显式分步模式下，允许用户直接输入 `appId` 查询
- 判断“应用公钥是否存在”时，只看 `signType="RSA2"` 的项
- 仅当该项的 `certInfoDTO` 不为 `null` 且 `certInfoDTO.publicKey` 不为 `null` 时，才视为应用公钥存在
- 否则视为应用公钥不存在，进入设置应用公钥
- 提审前还要从 `signType="RSA2"` 的项里取 `alipayPublicKey`，写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`（不存在则创建，存在则覆盖）
- 若 `alipayPublicKey` 缺失，则直接返回错误，让用户决定下一步
- 只有轮询刚设置的公钥是否生效时才传 `publicKey`

### submitApplicationAudit

```json
{
  "request": {
    "appId": "2021001234567890"
  }
}
```

`applicationType` 可缺省，服务端会按 `appId` 反查。

## createKeyConfirmPage 返回

- `confirmPageUrl`：给 PC 页面；透出时必须提示用户该链接只有 10 分钟有效期
- PC 链接过期时，提示用户触发刷新
- 用户明确触发刷新时，重新调用 `apprelease.createKeyConfirmPage` 生成新的链接 markdown输出

## 提审前轻检查

提审前只做 4 项轻检查：
- 应用存在
- 应用类型在一期范围内
- 应用公钥已确认存在
- 当前状态允许提审

补充动作：
- 提审前再查一次 `apprelease.queryApplicationSecurityKey`
- 只取 `signType="RSA2"` 的项
- 将该项的 `alipayPublicKey` 写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`（不存在则创建，存在则覆盖）
- **提审成功后告知用户文件路径**

## 创建前复用规则

- 先用 `apprelease.queryApplicationList` 查询当前主体下同类型应用
- 查询结果只允许向用户列出 `ON_LINE` 应用
- 只有 `ON_LINE` 状态的应用允许复用
- 用户自己明确要求复用某个 `appId` 时，也必须先查该应用状态
- 状态不是 `ON_LINE` 时，禁止复用，继续按新建应用路径处理
- `ON_LINE` 应用允许用户选择“复用上线应用”或“新建应用”
- 若用户选择复用 `ON_LINE` 应用：
  - 调 `apprelease.queryApplicationSecurityKey`
  - 只取 `signType="RSA2"` 的项
  - 将该项的 `alipayPublicKey` 写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`（不存在则创建，存在则覆盖）
  - 写入成功后告知用户文件路径
  - 告知用户后终止当前发布流程，不继续设置公钥或提审
  - 直接进入 `createApplication`
- 未命中同类型应用时，进入 `createApplication`

## 子能力边界

- `创建应用`：只负责创建
- `设置应用公钥`：只负责发起设钥并判断是否完成
- `提交应用审核`：只负责提交审核
- `恢复发布流程`：只负责识别卡点并接回正确阶段
- `查询发布状态`：只负责读取当前状态

## 非 tool 步骤

- 扫码确认
- App 端核身
- `mobilegw` 链路
- CLI 展示文案

## 对上输出

- 高层结论：
  - 发布成功
  - 提审已提交，等待审核
  - 需要用户完成扫码确认 / App 端核身
  - 发布失败
- 结构化详情：
  - `appId`
  - `applicationType`
  - `当前阶段`
  - `当前状态`
  - `是否可恢复`
  - `是否需要去 O 站继续查看`
  - `失败原因`
  - `下一步建议`

## 说明

- 失败、恢复与超时见 `references/failure-handling.md`
- CLI 命令见 `references/cli-command-templates.md`
