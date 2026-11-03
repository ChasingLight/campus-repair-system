---
name: douyinpay-payment-integration
description: >-
  抖音支付（DouyinPay）端到端接入集成助手。提供支付产品选型、前置准备引导、
  服务端SDK集成（Go/Java/PHP/Node.js）、签名验签、代码生成与接入质量校验的全流程支持。
  覆盖 APP支付、JSAPI支付、H5支付、Native支付、分账等核心产品，
  以及退款、账单、回调通知、证书管理、错误码排查等配套能力。
  当用户提到"抖音支付"、"DouyinPay"、"抖音Pay"、"抖音支付商家平台"，
  或涉及抖音支付官方域名 pay.douyinpay.com，api.douyinpay.com
  或涉及抖音支付的接入集成、接口调用、SDK使用、代码示例、参数说明、
  支付流程、域名配置等场景时，使用此 Skill。
---

# 抖音支付集成

本 Skill 帮助在 coze 平台完成抖音支付接入。敏感凭证由 coze 集成托管、运行时注入，服务端通过 `@coze/workload-identity` 读取后初始化抖音支付 SDK，**禁止手填、禁止硬编码、禁止入库**。

## 1. 重要：通过 douyinpay-config.ts coze 凭证托管与配置（lib/douyinpay-config.ts）

**初始化约定**：

- 服务端统一通过 `lib/douyinpay-config.ts` 完成初始化，并对外导出 `getDouyinPayConfig()`、`getDouyinPayClient()`、`isDouyinPayConfigured()`；不要生成顶层 `await` 或同步初始化的 `douyinpayConfig` 常量，避免 CommonJS、SSR、构建阶段导入时直接失败。
- 通过 `@coze/workload-identity` 的 `getIntegrationCredential("integration-douyinpay")` 读取托管凭证（集成标识名以 `integration_detail` 实际返回为准）。
- **商户号 `mchid` 与应用 `appid`**：优先从上下文中的「商户入驻结果」获取（入驻抖音支付商家平台得到商户号，在抖音开放平台创建应用得到 AppID / ClientKey）。获取后**必须先向用户确认无误再写入**；若上下文中没有，则提醒用户前往[抖音支付商家平台](https://pay.douyinpay.com)获取后告知 Agent，信息获取后直接写 `douyinpay-config.ts` 内
- **私钥格式化**：托管凭证里的 `signPrivateKey` 可能是一行 PEM 或包含字面量 `\n`，传给 SDK 前必须先格式化为标准 PEM；不要在日志中输出原始私钥。
- **回调通知地址 `notifyUrl`**：host 部分由 `COZE_PROJECT_DOMAIN_DEFAULT` 注入，平台注入值已是 `https://` 开头；不要额外补协议，只需去除末尾 `/` 后拼接实际承接回调的 API 路径（如 `/api/payment/notify`），不要照搬模板路径。
- **安全**：凭证读取失败、字段不完整或 SDK 初始化失败时必须直接 `throw Error`，让用户知道需要修正配置；错误信息只说明缺少/错误的配置项，**不输出任何凭证字段值**；私钥与密钥不得记入日志。不要生成演示模式、静默降级或返回 `null` 的支付链路。

**`lib/douyinpay-config.ts` 目标代码模板**：

```ts
import {
  createAutoClientRSA,
  type DouyinPaySdk,
} from "@byted/douyinpay-nodejs";
import { Client } from "@coze/workload-identity";

export interface DouyinPayConfigType {
  mchid: string;
  appid: string;
  merchantCertSerialNo: string;
  privateKey: string;
  apiEncryptKey: string;
  notifyUrl: string;
}

interface DouyinPayCredential {
  certSerialNo: string;
  signPrivateKey: string;
  apiSecretKey: string;
}

function formatPemPrivateKey(key: string): string {
  const normalized = key.trim().replace(/\\n/g, "\n");
  if (normalized.includes("\n")) return normalized;

  const match = normalized.match(
    /^(-----BEGIN ([A-Z ]*PRIVATE KEY)-----)([A-Za-z0-9+/=\s]+)(-----END \2-----)$/,
  );
  if (!match) return normalized;

  const [, header, , body, footer] = match;
  const lines = body.replace(/\s/g, "").match(/.{1,64}/g) || [];
  return `${header}\n${lines.join("\n")}\n${footer}`;
}

function assertDouyinPayCredential(credential: unknown): DouyinPayCredential {
  if (!credential || typeof credential !== "object") {
    throw new Error("抖音支付集成字段不完整");
  }

  const value = credential as Record<string, unknown>;
  if (
    typeof value.certSerialNo !== "string" ||
    typeof value.signPrivateKey !== "string" ||
    typeof value.apiSecretKey !== "string"
  ) {
    throw new Error("抖音支付集成字段不完整");
  }

  return {
    certSerialNo: value.certSerialNo,
    signPrivateKey: value.signPrivateKey,
    apiSecretKey: value.apiSecretKey,
  };
}

// 从 coze 托管凭证读取抖音支付集成详情
async function loadDouyinPayCredential(): Promise<DouyinPayCredential> {
  const client = new Client();
  try {
    const raw = await client.getIntegrationCredential("integration-douyinpay");
    const credential = typeof raw === "string" ? JSON.parse(raw) : raw;
    return assertDouyinPayCredential(credential);
  } catch {
    // 只提示未配置，绝不输出任何凭证字段值
    throw new Error(
      "抖音支付集成未配置或字段不完整，请检查抖音支付凭证托管配置",
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

let _config: DouyinPayConfigType | undefined;
let _client: DouyinPaySdk | undefined;
let _initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (_config && _client) return;

  if (!_initPromise) {
    _initPromise = (async () => {
      try {
        const credential = await loadDouyinPayCredential();
        const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT || "";

        const nextConfig: DouyinPayConfigType = {
          // 商户号：从商户入驻结果获取，写入前需经用户确认；无则提醒用户去 pay.douyinpay.com 获取，默认不要从环境变量读取
          mchid: "MCH_ID_FROM_CONTEXT_OR_USER",
          // 应用 AppID（开放平台 ClientKey）：来源同上，写入前需经用户确认，获取后直接写 `douyinpay-config.ts` 内，默认不要从环境变量读取
          appid: "APP_ID_FROM_CONTEXT_OR_USER",
          // 商家公钥证书序列号（HTTP Authorization 头中的 serial_no）
          merchantCertSerialNo: credential.certSerialNo,
          // 商家公钥证书（RSA）对应的私钥 PEM 内容
          privateKey: formatPemPrivateKey(credential.signPrivateKey),
          // 接口加密密钥（对称密钥，用于 AES-256-GCM 解密回调报文中的敏感信息）
          apiEncryptKey: credential.apiSecretKey,
          // 支付结果回调通知地址：host 由 coze 域名注入，API 路径按实际承接回调的业务路由填写
          notifyUrl: `${domain}/api/payment/notify`,
        };

        const nextClient = await createAutoClientRSA({
          mchid: nextConfig.mchid,
          serial: nextConfig.merchantCertSerialNo,
          privateKey: nextConfig.privateKey,
          key: nextConfig.apiEncryptKey,
        });

        _config = nextConfig;
        _client = nextClient;
      } catch (err) {
        _config = undefined;
        _client = undefined;
        _initPromise = null;
        throw err;
      }
    })();
  }

  await _initPromise;
}

export async function getDouyinPayConfig(): Promise<DouyinPayConfigType> {
  await ensureInitialized();
  if (!_config) {
    throw new Error("抖音支付 SDK 初始化失败，请检查抖音支付线上配置");
  }
  return _config;
}

export async function getDouyinPayClient(): Promise<DouyinPaySdk> {
  await ensureInitialized();
  if (!_client) {
    throw new Error("抖音支付 SDK 初始化失败，请检查抖音支付线上配置");
  }
  return _client;
}

export function isDouyinPayConfigured(): boolean {
  return _client !== undefined;
}
```

## 2. 完整接入指引（内层文档）

凭证初始化之外的完整能力——文档检索/全文获取/密钥生成等工具、支付产品选型、接入路由表、编码规范、客户端 SDK、回调与错误码排查——以 `rawSKILL.md` 为唯一正文来源：

```bash
cat rawSKILL.md
```

进行产品接入、生成代码、排查问题前，**必须**先阅读该内层文档并遵循其中的工具调用、全局规范与流程要求；
