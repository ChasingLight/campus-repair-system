# Flow Skeleton

本流程仅面向 `WEBAPP`。执行基座固定为 `alipay-cli`，所有机读结果统一按 `--json` 解析。

## 主流程骨架

0. **前置初始化**：配置 .gitignore（防止密钥文件被提交）
1. 检查 CLI 登录态
2. 查询当前主体下同类型应用
3. 创建应用或复用已有应用
4. 设置应用公钥 → **写入支付宝公钥文件 → 提交审核 → 对客输出 → 调用 `alipay-payment-production-integration`**
5. 提交应用审核

> **调用 `alipay-payment-production-integration` 时机**：复用成功后 或 设置密钥成功后，均在**对客输出完成后**调用

## 模式

- 默认走自动主流程
- 只有用户明确要求“一步一步操作”“只创建应用”“只查应用”“只设置公钥”“只提审”等单步意图时，才进入显式分步模式
- 显式分步模式下，每一步执行前都以用户当前明确指令为准
- 单步 tool 报错时直接返回错误，不自动切换到其他路径

## 总体原则

- 意图不明确时先问，不自动调 tool
- tool 报错时直接把错误返回给用户，由用户决定下一步
- **公钥私钥敏感性（强制执行）**：
  - 设置应用公钥前，必须引导用户前往 [支付宝密钥生成工具文档](https://opendocs.alipay.com/common/02kipk) 使用官方密钥工具生成应用公私钥
  - **禁止向用户表示可以”帮助生成公钥”、”帮助生成密钥对”**
  - **禁止提供任何密钥生成代码、命令或脚本**
  - **禁止请求、接收或处理用户的私钥信息**
  - `publicKey` 只能以用户输入为准，skill 不生成、不推断、不改写
- 标准话术：”请前往支付宝开放平台密钥生成工具（https://opendocs.alipay.com/common/02kipk）下载并使用官方工具生成应用公私钥对，生成后将应用公钥提供给我继续后续流程。**私钥请妥善保管，切勿泄露给任何人。**”
- `signType` 默认 `”RSA2”`
- `apprelease.queryApplicationList` 的展示结果只允许列出 `ON_LINE` 应用
- 只有 `ON_LINE` 状态的应用可以复用；用户指定某个 `appId` 要复用时，也必须先查询该应用状态，确认 `ON_LINE` 后才能复用
- 未列出可复用应用时，直接新建应用
- 判断”应用公钥是否存在”时，只看 `queryApplicationSecurityKey` 返回里 `signType=”RSA2”` 的项；若该项的 `certInfoDTO` 不为 `null` 且 `certInfoDTO.publicKey` 不为 `null`，才视为应用公钥存在
- 提审前还要从 `signType=”RSA2”` 的项里取 `alipayPublicKey`，写入文件 `/workspace/projects/<appId>-alipayPublicKey.keytext`（不存在则创建，存在则覆盖）

**alipayPublicKey 文件写入规范：**
  - 文件路径：`/workspace/projects/<appId>-alipayPublicKey.keytext`
  - 写入行为：文件不存在则创建，存在则覆盖更新
  - 写入时机：获取到 `alipayPublicKey` 后立即写入
  - 写入内容：`alipayPublicKey` 原始值（纯文本）
  - 告知时机：
    1. **确认密钥状态时**：用户输入确认公钥，查询设置成功后
    2. **提交应用审核成功后**：`submitApplicationAudit` 返回成功后

## 前置阶段 0: 初始化 .gitignore

**⚠️ 技能启动时必须首先执行此步骤，防止密钥文件被意外提交到版本控制。**

```bash
# 确保 .gitignore 包含 *.keytext，防止密钥文件泄露
echo "*.keytext" >> "/workspace/projects/.gitignore"
```

**执行要求：**
- 在任何其他步骤之前执行一次
- 使用 `>>` 追加写入（不覆盖已有内容）
- 无需判断文件是否存在，直接追加即可

## 前置阶段 1: CLI 登录态检查

- 先执行 `alipay-cli diagnose auth --json`
- 若已登录，直接进入“查询已有应用”
- 若未登录，则执行非交互式登录，以下两个命令一定成对出现：
  - `alipay-cli login --non-interactive --json --scope app:all`，登录命令
  - `alipay-cli login --complete --json`，登录确认后都要执行该命令
- 可选补做 `mcp list apprelease --json`

## 阶段 2: 查询已有应用

- 先调 `apprelease.queryApplicationList`
- skill 只传 `appTypes`，`uid` 由 CLI OAuth / MCP 注入
- 只列出 `ON_LINE` 状态应用
- 若查询失败：直接返回错误，停止后续流程

分支规则：

1. 命中 `ON_LINE`：返回已有上线应用与 `appId`，让用户选择”复用上线应用”或”新建应用”
   - **复用成功后**：
     1. 调 `queryApplicationSecurityKey`，取 `signType=”RSA2”` 项的 `alipayPublicKey`
     2. 写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`
     3. **对客输出**（复用场景不输出审核订单号）：
        ```
        ✅ 应用复用成功

        | 项目 | 信息 |
        |------|------|
        | AppId | <appId> |
        | 应用状态 | ON_LINE（已上线） |
        | 支付宝公钥 | /workspace/projects/<appId>-alipayPublicKey.keytext |
        ```
     4. **输出完成后，调用 `alipay-payment-production-integration` 技能，传入 appId**
   - 新建：进入创建应用
2. 其余情况：进入创建应用

## 阶段 3: 创建应用

- 通过 `alipay-cli mcp call apprelease.createApplication --json` 发起创建
- 自动主流程只传最小必要字段
- 显式分步模式下，若用户提供应用名称或 logo，可以按 `mcp list apprelease` 中该 tool 的入参描述映射到 `createApplication` 请求
- 报错时直接返回错误
- 成功后进入设置应用公钥

## 阶段 4: 设置应用公钥

这是混合工作流节点，含人为介入流程节点

**⚠️ 公钥私钥敏感性规范（强制执行）：**
- **禁止向用户表示可以"帮助生成公钥"、"帮助生成密钥对"**
- **禁止提供任何密钥生成代码、命令或脚本**
- **禁止请求、接收或处理用户的私钥信息**
- **只能接收用户明确提供的 publicKey（应用公钥）**

**执行步骤：**

1. 必须先引导用户前往 [支付宝密钥生成工具文档](https://opendocs.alipay.com/common/02kipk) 使用官方密钥工具生成应用公私钥
   - 标准话术："请前往支付宝开放平台密钥生成工具（https://opendocs.alipay.com/common/02kipk）下载并使用官方工具生成应用公私钥对，生成后将应用公钥提供给我继续后续流程。**私钥请妥善保管，切勿泄露给任何人。**"
2. 只接受用户明确输入的完整 `publicKey`，不提示`publicKey`的输入格式，用户根据引导文档自己输入`publicKey`
   - skill 不自动生成、不补全、不替换、不生成前后缀
   - 用户未提供时，不继续调用 `createKeyConfirmPage`
3. 调 `createKeyConfirmPage`，`signType` 默认 `"RSA2"`

4. 输出扫码链接时，**必须同步告知用户"有效期10分钟"**
   - 例："密钥确认页已创建，请扫码确认公钥。**有效期10分钟，请尽快完成确认。**"
5. 用户扫码，App 端完成核身（人为流程）
6. 等待用户确认 调用`queryApplicationSecurityKey` 确认结果

补充：
- `confirmPageUrl` 给 PC 页面，**有效期10分钟**
- 若PC 链接已过期，提示用户触发刷新
- 用户明确触发刷新时，重新调用 `apprelease.createKeyConfirmPage` 生成新的 `confirmPageUrl` 和 `qrCodeUrl`
- 超时后重新发起公钥设置
- **用户输入确认，查询确认成功后**：
  1. 取 `signType="RSA2"` 项的 `alipayPublicKey` 写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`
  2. 调用 `submitApplicationAudit` 提交审核，获取审核订单号
  3. **对客输出**（新建应用需输出审核订单号）：
     ```
     ✅ 应用创建成功，已提交审核

     | 项目 | 信息 |
     |------|------|
     | AppId | <appId> |
     | 应用状态 | AUDITING（审核中） |
     | 审核订单号 | <auditOrderNo> |
     | 支付宝公钥 | /workspace/projects/<appId>-alipayPublicKey.keytext |
     ```
  4. **输出完成后，调用 `alipay-payment-production-integration` 技能，传入 appId**
- 失败口径见 `references/failure-handling.md`

## 阶段 5: 提交应用审核

- 只有确认应用公钥存在后，才继续提交审核
- 提审前先调 `queryApplicationSecurityKey`
  - 结果只看 `signType="RSA2"` 的项
  - 取该项的 `alipayPublicKey` 写入 `/workspace/projects/<appId>-alipayPublicKey.keytext`（不存在则创建，存在则覆盖）
  - 若缺少 `alipayPublicKey`，直接返回错误，由用户决定下一步
- 提审前用 `queryApplicationInfo` 为主、`queryApplicationDetail` 为辅做轻量检查
- 通过 `alipay-cli mcp call apprelease.submitApplicationAudit --json` 发起提审
- tool 报错时直接返回错误
- 审核提交返回结果中的审核单号不对客透出
- 若提审已提交但短轮询未收敛：提示去 O 站查看：https://open.alipay.com/develop/manage

## 阶段恢复提示

| 阶段 | 恢复动作 |
| --- | --- |
| 查询已有应用 | 重查列表，只列出 `ON_LINE` 应用；无可列应用时直接新建 |
| 创建应用 | 先查状态，再决定是否重入 |
| 设置应用公钥 | 回到设钥阶段，必要时重新发起 |
| 提交应用审核 | 先短轮询，未收敛时去 O 站查看 |

## 说明

- 主流程默认强推进
- 只在错误、用户决策节点或外部人工节点停住
- 详细契约见 `contracts.md`
- 失败收口见 `failure-handling.md`
