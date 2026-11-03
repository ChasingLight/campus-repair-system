# Alipay-SDK Reminder

<SDK_INTEGRATION_RULES>
以下各项为接入支付宝 SDK 的相关规则，**严禁在未阅读全部内容的情况下编写任何 SDK 相关代码**。每条规则均来自真实集成踩坑，请逐条阅读并确认后再继续，编写代码遵守规则。
</SDK_INTEGRATION_RULES>

---

# 🚨 致命错误速查表（输出代码前必须确认）

| 错误 | 后果 | 正确做法 | 文档位置 |
|-----|------|---------|---------|
| 私钥字段选错 | 签名验签失败，接口报错 | 以沙箱返回结果为准，使用 `appPrivatePkcsKey` | 检查点 1 |
| `new Date().toISOString()` | 时间戳格式错误，支付宝拒收 | `yyyy-MM-dd HH:mm:ss`（空格分隔）| 时间戳章节 |
| `import AlipaySdk from 'alipay-sdk'` | TypeError: 不是构造函数 | 先查 .d.ts 确认导出方式 | 检查点 2 |
| `exec('alipay.trade.page.pay')` | 无法获取支付表单，返回 JSON 而非 HTML | 用 `pageExecute()` 或 `pageExec()` | 检查点 3 |
| `window.location.href = paymentHtml` | 页面只显示 URL 参数，无法跳转支付宝 | 渲染 HTML 表单并自动提交 | 前端支付表单处理 |
| 验签失败时猜测私钥格式问题 | 错误归因，浪费时间排查密钥 | 先检查请求参数完整性（如 return_url 是否传入），详见验签失败排查原则 | 验签失败排查原则 |
| `ERR_OSSL_UNSUPPORTED` 时推断私钥格式有问题 | 错误归因，实际是 SDK 配置参数错误（如私钥字段选错） | 确认使用 `appPrivatePkcsKey` 字段，禁止添加 PEM 头尾或做格式转换 | 私钥格式防误判规则 |

**⚠️ 以上每项错误都会导致集成失败，输出代码前必须逐条确认。**

---

<BLOCKING_CHECKPOINT>
## ⛔ 阻塞检查点 — 编写任何 SDK 代码前必须逐条确认

**强制要求：在输出任何 SDK 代码之前，必须逐条确认以上 4 项检查均已通过，未确认即输出代码视为违规。**

---

### ✅ 检查点 1：私钥格式

**事实：** 以沙箱创建返回结果为准，Node.js / Python 使用沙箱返回的 `appPrivatePkcsKey` 字段。

→ 详见下方「快速沙箱应用私钥格式」

---

### ✅ 检查点 2：SDK 导入格式

**事实：** `alipay-sdk` 的导入方式取决于包的实际导出方式，**绝不能凭猜测选择**，必须通过以下流程确定：
1. 查看 `package.json` 的 `exports` / `type` 字段 → 确定模块类型（ESM / CJS）和入口路径
2. 查看类型定义文件（`.d.ts`）中的 `export` 语句 → 确定是命名导出还是默认导出
3. 命名导出 → `import { AlipaySdk } from 'alipay-sdk'`；默认导出 → `import AlipaySdk from 'alipay-sdk'`

**对比示例：**
```javascript
// ✅ 正确 - 命名导出（需查 .d.ts 确认）
import { AlipaySdk } from 'alipay-sdk';

// ❌ 错误 - 默认导出（如果包实际是命名导出会报错）
import AlipaySdk from 'alipay-sdk';
// TypeError: AlipaySdk is not a constructor
```

**常见错误：** 想当然使用 `import AlipaySdk from 'alipay-sdk'`（默认导出语法），但实际包可能是命名导出，将导致 `TypeError: AlipaySdk is not a constructor`。

→ 详见下方「alipay-sdk 导入格式判断流程」

---

### ✅ 检查点 3：alipay.trade.page.pay 方法选择

**事实：** `alipay.trade.page.pay` 是页面跳转类 API，**严禁使用 `exec()` 方法**，必须使用 `pageExecute()` 或其别名 `pageExec()`。

**对比示例：**
```javascript
// ✅ 正确 - 页面跳转类 API 使用 pageExecute()
const htmlForm = alipayClient.pageExecute('alipay.trade.page.pay', {
  bizContent: { out_trade_no: '123', total_amount: '10.00', ... }
});
// 返回：<form action="...">...</form> HTML 字符串

// ❌ 错误 - 对页面跳转类 API 使用 exec()
const result = await alipayClient.exec('alipay.trade.page.pay', {
  bizContent: { out_trade_no: '123', total_amount: '10.00', ... }
});
// 返回：JSON 对象，无法用于页面跳转，这是最常见的集成错误！
```

| 方法 | 用途 | 返回值 | 示例 |
| --- | --- | --- | --- |
| `pageExecute()` | 页面跳转类 API（如：支付） | HTML 表单字符串 | 电脑 / 手机网站支付 |
| `pageExec()` | pageExecute 的别名 | HTML 表单字符串 | 电脑 / 手机网站支付 |
| `exec()` | 服务端 API（查询 / 退款） | Promise<JSON 对象> | 交易查询、退款 |

**对支付接口调用 exec() 将不会得到可用的支付表单，是最常见的集成错误之一。**

### 前端支付表单处理

`pageExecute()` / `pageExec()` 返回的是包含自动提交脚本的 HTML `<form>` 字符串，前端**必须将此 HTML 渲染到页面并自动提交表单**，禁止使用 `window.location.href` 跳转。

**❌ 错误写法**：
```javascript
// paymentHtml 是 HTML 表单字符串，不是 URL
if (data.paymentHtml) {
  window.location.href = data.paymentHtml; // 页面只显示 ?method=alipay.trade.page.pay... 参数，无法跳转
}
```

**✅ 正确写法**：
```javascript
if (data.paymentHtml) {
  const container = document.createElement('div');
  container.innerHTML = data.paymentHtml;
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.zIndex = '9999';
  container.style.background = 'white';
  document.body.appendChild(container);
  const form = container.querySelector('form');
  if (form) form.submit();
}
```

**核心原因**：

| 方法 | 返回值 | 前端处理方式 |
| --- | --- | --- |
| `pageExecute('alipay.trade.page.pay', {...})` | HTML 表单字符串 | 渲染到页面并自动提交 form |
| `pageExec('alipay.trade.wap.pay', {...})` | HTML 表单字符串 | 渲染到页面并自动提交 form |
| `exec('alipay.trade.query', {...})` | JSON 对象 | 直接使用返回数据 |

---

**确认方式：** 在生成代码前，自问自答以下五个问题——
1. 我使用的私钥是沙箱返回的 `appPrivatePkcsKey` 字段吗？→ 是 → 继续
2. 我确定的导入方式是通过查看 .d.ts 文件得出的吗？→ 是 → 继续
3. 我用的是 pageExecute()/pageExec() 而非 exec() 吗？→ 是 → 继续
4. 时间戳格式是 yyyy-MM-dd HH:mm:ss 吗？→ 是 → 继续
5. 前端是否将 pageExecute() 返回的 HTML 表单渲染并自动提交，而非使用 window.location.href 跳转？→ 是 → 继续

**五条全部"是"方可输出代码，任何一条为"否"则返回对应章节重读。**
</BLOCKING_CHECKPOINT>

---

## 快速沙箱应用私钥格式

Node.js 和 Python 以沙箱创建返回结果为准，使用沙箱返回的 `appPrivatePkcsKey` 字段。

### ⛔ 私钥格式防误判规则（严禁违反）

**沙箱返回两个私钥字段，必须选对：**

| 字段 | 格式 | 是否使用 |
|------|------|---------|
| `appPrivateKey` | PKCS#8 格式 | ❌ 不使用 |
| `appPrivatePkcsKey` | PKCS#1 格式 | ✅ 必须使用 |

**严禁以下误判行为：**

| 误判行为 | 为什么错 | 正确做法 |
|---------|---------|---------|
| 看到 `ERR_OSSL_UNSUPPORTED` 就推断私钥格式有问题 | 该错误通常是 SDK 配置参数错误（如私钥字段选错、字符编码问题），**不是**私钥格式本身有问题 | 先确认使用了 `appPrivatePkcsKey` 字段，再检查其他配置参数 |
| 手动添加 PEM 头尾（`-----BEGIN RSA PRIVATE KEY-----` / `-----END RSA PRIVATE KEY-----`） | SDK 内部自动处理 PEM 格式，手动添加头尾会导致格式错误 | 直接使用沙箱返回的原始值，不做任何格式处理 |
| 手动添加 PEM 头尾（`-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`） | 同上，PKCS#8 头尾也不应手动添加 | 直接使用沙箱返回的原始值，不做任何格式处理 |
| 将 `appPrivatePkcsKey` 转换为 PKCS#8 格式 | 禁止任何格式转换，SDK 直接支持 PKCS#1 | 使用原始值，不做转换 |
| 将 PKCS#8 转换为 PKCS#1 格式 | 同上，禁止反向转换 | 使用原始值，不做转换 |
| 对私钥内容做 Base64 解码/重新编码 | 无需任何编码处理 | 直接使用沙箱返回的原始字符串 |
| 因为字段名含 "Pkcs" 就认为是 PKCS#8 格式 | `appPrivatePkcsKey` 是 **PKCS#1** 格式，"Pkcs" 仅表示这是 PKCS 系列标准之一，不代表 PKCS#8 | 使用 `appPrivatePkcsKey`，记住它是 PKCS#1 |

**核心原则：沙箱返回的 `appPrivatePkcsKey` 值直接使用，禁止任何格式处理（添加头尾、格式转换、编码处理、换行符调整）。**

### ⛔ 连环误判链（严禁陷入）

遇到 `ERR_OSSL_UNSUPPORTED` 时，agent 容易陷入以下**越错越远**的连环推理，**每一步都是错的**，必须识别并阻断：

```
❌ 连环误判链（严禁陷入）：

第 1 步（误判起点）：看到 ERR_OSSL_UNSUPPORTED → 推断"私钥格式有问题"
    ↓
第 2 步（错误修复）：认为"PKCS#1 私钥应该以 -----BEGIN RSA PRIVATE KEY----- 开头"
    → 手动添加 PEM 头尾 → 错误仍在
    ↓
第 3 步（错误归因）：认为"Node.js 18+ 用了 OpenSSL 3.0，旧格式不被支持"
    ↓
第 4 步（越错越远）：认为"应该用 PKCS#8 格式，以 -----BEGIN PRIVATE KEY----- 开头"
    → 将私钥转换为 PKCS#8 格式 → 错误更严重
```

**正确做法**：看到 `ERR_OSSL_UNSUPPORTED`，**立即停止所有格式操作**，按以下顺序排查：
1. 确认使用了 `appPrivatePkcsKey` 字段（而非 `appPrivateKey`）
2. 确认私钥值为沙箱返回的原始值，未做任何修改
3. 检查其他 SDK 配置参数（charset、signType 等）

**关键事实**：
- Node.js 18+ 的 OpenSSL 3.0 **完全支持** PKCS#1 格式，`ERR_OSSL_UNSUPPORTED` 不是因为格式不被支持
- SDK 内部自动处理 PEM 格式，**永远不需要**手动添加 `-----BEGIN RSA PRIVATE KEY-----` 或 `-----BEGIN PRIVATE KEY-----`
- 任何"格式转换"操作只会让问题更严重，永远不能解决问题

## SDK 对待两类 API 的处理方式不同

开放平台提供了支持主流开发语言的 SDK 接入的方式。对于页面跳转类 API，SDK 不会也无法像系统调用类 API 一样自动请求支付宝并获得结果，而是在接受 request 请求对象后，为开发者生成前台页面请求需要的完整 form 表单的 html（包含自动提交脚本），商家直接将这个表单的 String 输出到 http response 中即可。

## alipay-sdk 导入格式判断

`alipay-sdk` 的导入方式取决于包的实际导出方式，**绝不能凭猜测选择**。

### 判断流程

1. **查看 package.json**：确认模块类型（ESM/CJS）和入口路径
   ```bash
   cat node_modules/alipay-sdk/package.json
   ```
   重点看 `type`、`exports`、`main`、`types` 字段。

2. **查看类型定义文件**：确认导出方式
   ```bash
   cat node_modules/alipay-sdk/dist/types/index.d.ts
   ```
   注意：类型定义文件路径以 package.json 中 `types` 字段为准。

3. **选择导入语法**：
   - 命名导出（`export class AlipaySdk`）→ `import { AlipaySdk } from 'alipay-sdk'`
   - 默认导出（`export default`）→ `import AlipaySdk from 'alipay-sdk'`
   - 混合导出 → `import AlipaySdk, { AlipaySdkConfig } from 'alipay-sdk'`

### 优先级

类型定义（.d.ts）> 官方文档 > 源码

### 注意

- package.json 的 `exports` 字段是入口路径配置，不是导出方式
- 包的导出方式可能随版本更新而改变，务必验证

## 验签失败（invalid-signature）排查原则

遇到 `invalid-signature`（验签出错）时，**严禁凭猜测归因到私钥格式或环境兼容性**，必须按以下顺序逐项排查：

### ⛔ 常见误诊（严禁）

| 错误推断 | 实际情况 |
|---------|---------|
| "Node.js 18+ 不支持 PKCS#1" | **错误**，PKCS#1 完全被支持 |
| "Node.js 18+ 的 OpenSSL 3.0 不支持 PKCS#1，导致 ERR_OSSL_UNSUPPORTED" | **错误**，OpenSSL 3.0 完全支持 PKCS#1，该错误是 SDK 配置参数问题（如私钥字段选错），与格式无关 |
| "私钥格式有问题" | 沙箱文档明确要求用 `appPrivatePkcsKey`（PKCS#1），格式正确 |
| "密钥本身有问题" | 沙箱返回的密钥配置通常是正确的 |
| "需要添加 PEM 头尾或转换格式来修复 ERR_OSSL_UNSUPPORTED" | **错误**，任何格式操作只会让问题更严重，正确做法是检查 SDK 配置参数 |

### ✅ 正确排查顺序

**原则：先验证实际请求内容，再怀疑密钥配置。**

1. **检查请求参数完整性**（最常见原因）
   - 支付宝验签时校验所有请求参数是否匹配。如果 `return_url`、`notify_url` 等参数在配置中定义但未传入支付请求，或传入但未参与签名，将导致验签失败。
   - **排查方法**：打印或检查实际发送给支付宝的请求参数，确认 `return_url`、`notify_url` 等参数是否正确包含在请求中。
   ```bash
   # 检查实际请求中是否包含 return_url
   # 在服务端日志中打印请求参数，确认 return_url 存在
   ```

2. **检查私钥来源**
   - 确认使用的是沙箱返回的 `appPrivatePkcsKey` 字段，而非自行生成或其他来源。

3. **检查 signType 是否一致**
   - 请求中的 `sign_type` 必须为 `RSA2`，与配置保持一致。

4. **检查私钥格式完整性**
   - 私钥内容无多余空格、换行符。

5. **检查网关地址**
   - 沙箱环境必须使用沙箱网关 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`，生产环境使用 `https://openapi.alipay.com/gateway.do`。

> **核心教训**：验签失败 ≠ 私钥问题。应先通过日志/输出验证实际请求行为（参数是否完整传入），而非基于技术传言做假设。

---

## 时间戳格式化

支付宝要求时间戳格式为 `yyyy-MM-dd HH:mm:ss`（空格分隔，非 ISO 格式）。

### Node.js
```javascript
function formatAlipayTimestamp(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ❌ 错误：new Date().toISOString() → "2026-04-29T14:30:00.000Z"
```

### Python
```python
from datetime import datetime

def format_alipay_timestamp(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")

# ❌ 错误：datetime.isoformat() → "2026-04-29T14:30:00"
```
