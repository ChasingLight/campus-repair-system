# SDK 配置文件示例

本文档提供各语言的 SDK 配置文件示例代码，供集成参考。

## Node.js

文件名：`alipay-sdk-config.ts`

```javascript
import { AlipaySdk } from 'alipay-sdk';

// 配置参数
const config = {
  // 应用ID（沙箱返回的 appId）
  appId: '沙箱应用ID',

  // 应用私钥（沙箱返回的 appPrivatePkcsKey）
  privateKey: '应用私钥内容',

  // 支付宝公钥（沙箱返回的 alipayPublicKey）
  alipayPublicKey: '支付宝公钥内容',

  // 网关地址
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',

  // 签名方式
  signType: 'RSA2',

  // 字符编码格式
  charset: 'UTF-8',

  // 支付宝回调通知地址（在具体 API 调用时传入）
  notifyUrl: 'your_notify_url',

  // 支付宝返回地址（在具体 API 调用时传入）
  returnUrl: 'your_return_url',
};

// 初始化 SDK 客户端
const alipayClient = new AlipaySdk({
  appId: config.appId,
  privateKey: config.privateKey,
  alipayPublicKey: config.alipayPublicKey,
  gateway: config.gateway,
  signType: config.signType,
  charset: config.charset,
});

export { alipayClient, config };
```

## Python

文件名：`alipay_sdk_config.py`

```python
from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient

# 配置参数
config = AlipayClientConfig()
config.server_url = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
config.app_id = '沙箱应用ID'  # 沙箱返回的 appId
config.app_private_key = '应用私钥内容'  # 沙箱返回的 appPrivatePkcsKey
config.alipay_public_key = '支付宝公钥内容'  # 沙箱返回的 alipayPublicKey
config.charset = 'utf-8'
config.sign_type = 'RSA2'

# 初始化 SDK 客户端
alipay_client = DefaultAlipayClient(alipay_client_config=config)

# 支付宝回调通知地址（在具体 API 调用时传入）
NOTIFY_URL = 'your_notify_url'

# 支付宝返回地址（在具体 API 调用时传入）
RETURN_URL = 'your_return_url'
```

## 沙箱检测脚本

构建脚本 `build.sh` 中必须添加沙箱环境检测，防止将沙箱配置部署到线上环境。

详细脚本参考：[sandbox-check.sh](references/scripts/sandbox-check.sh)

## 密钥格式说明

- **严禁**额外对沙箱配置中的私钥进行格式转换
- 禁止自行生成应用私钥
- Node.js / Python 以沙箱创建返回结果为准，选用沙箱返回的 `appPrivatePkcsKey` 字段
- **禁止手动添加 PEM 头尾**（`-----BEGIN RSA PRIVATE KEY-----` / `-----END RSA PRIVATE KEY-----` 或 `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`）
- **禁止因 `ERR_OSSL_UNSUPPORTED` 错误而推断私钥格式有问题**，该错误通常是 SDK 配置参数错误，不是格式问题
- **应用私钥必须使用沙箱返回的 PKCS#1 格式的`appPrivatePkcsKey`**
- 详见 [SDK 说明文档](alipay-sdk-reminder.md) 检查点 1 及「私钥格式防误判规则」

## 配置填充流程

1. **获取沙箱信息**：创建快速沙箱后，记录返回的沙箱配置信息。
2. **创建配置文件**：在项目中创建对应语言的 `alipay-sdk-config` 文件，文件扩展名与语言匹配（Node.js 为 `.ts`，Python 为 `.py`）。要求 `alipay-sdk-config` 保存在服务端目录（如：Node.js 项目保存在 `src/lib`，Python 项目保存在 `app/lib` 等服务端目录），**禁止**直接创建在项目一级目录或前端目录。
3. **填充配置并初始化**：将沙箱返回的 `appId`、`appPrivatePkcsKey`、`alipayPublicKey` 等信息填充到配置文件，并完成 SDK 客户端初始化。
4. **验证配置**：确保配置文件中的私钥来自沙箱返回的 `appPrivatePkcsKey` 字段，禁止使用自行生成或编造的私钥。