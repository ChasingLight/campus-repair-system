---
name: alipay-payment-production-integration
description: 支付宝支付上线集成 Skill；用户要求"支付宝上线""支付宝正式环境""生产支付接入""支付密钥托管"，或需要把沙箱/demo 配置改成线上可用时使用。
---

# Alipay Payment Production Integration

## 目标

将项目中的支付宝支付从 demo、沙箱或手填配置改造成可上线的正式环境集成：

- 定位并修改 `alipay-sdk-config.ts`。
- 将硬编码的沙箱 `appId`、`privateKey`、`alipayPublicKey` 注释保留，改为正式 AppID + 线上托管凭证。
- 通过 `@coze/workload-identity` 获取公钥、私钥，并初始化 AlipaySDK。
- 完成静态检查、构建检查和最小可行验证。

## 何时使用

- 用户要求"支付宝上线""支付宝正式环境""生产支付接入"，或需要把沙箱/demo 配置改成线上可用。
- 项目中存在 `alipay-sdk-config.ts`，但仍包含沙箱网关、硬编码私钥或硬编码公钥。

> 沙箱 demo 调试开发交给 `alipay-payment-integration` Skill，不在本 Skill 范围内。

## 工作流程

1. 凭证检查
   1. 如果没有检查过，可以调用 `integration_detail('integration-alipay')` 查看凭证状态
   2. 如果存在凭证，或者用户配置完成，则提醒用户“密钥按空间维度托管，每个空间在同一时间只能托管一套密钥。若您在同一个空间有多个应用，且每个应用密钥不同，当您变更托管密钥时会导致前序已部署应用失效。”
2. **前置代码检查**
   - 定位 `alipay-sdk-config.ts`；如不存在，搜索 `AlipaySdk`、`alipaydev`、`appId`、`privateKey`。
   - 判断当前实现状态：无支付代码 / 沙箱硬编码 / 环境变量 / 已接入平台凭证。
   - 确认 `package.json` 是否已有 `@coze/workload-identity`；缺失时用 `pnpm add @coze/workload-identity --save` 安装。
3. **修改** **`alipay-sdk-config.ts`**
   - `appId` 使用正式 AppID：若上下文提供了 `2021` 开头的 AppID，直接使用；若未提供，提醒用户前往支付宝开放平台 "控制台" > 找到应用 > 复制 "AppID"(2021 开头)，可通过 [登录链接获取](https://open.alipay.com/develop/manage)。
   - 保留原有 `alipayClient` 和 `config` 导出语义，尽量减少其他文件改动。
   - 引入 `import { Client } from '@coze/workload-identity';`，用 `await client.getIntegrationCredential('<integration-name>')` 获取凭证，`finally` 中 `await client.close()`。
   - 字段映射：`app_private_key`、`alipay_public_key`。
   - 原文件里的沙箱 `appId`、`privateKey`、`alipayPublicKey`、`gateway` 等硬编码配置只注释掉，不直接删除。
   - 网关改为 `https://openapi.alipay.com/gateway.do`。
   - 若项目使用证书模式，按 schema 接入应用公钥证书、支付宝公钥证书、根证书字段。
   - 凭证缺失时 fail fast，错误信息只说明"支付宝线上凭证未配置"，不输出敏感字段，不在前端暴露密钥材料。

## `alipay-sdk-config.ts` 目标代码模板

```ts
import { AlipaySdk } from "alipay-sdk";
import { Client } from "@coze/workload-identity";

// 从托管凭证读取支付宝支付集成详情。
async function loadAlipayCredential(): Promise<{
  app_private_key: string;
  alipay_public_key: string;
}> {
  const client = new Client();
  try {
    const credential =
      await client.getIntegrationCredential("integration-alipay");
    return typeof credential === "string" ? JSON.parse(credential) : credential;
  } catch (err) {
    console.log("支付宝线上凭证未配置");
    throw err;
  } finally {
    await client.close();
  }
}

const credential = await loadAlipayCredential();

// 使用上下文提供的正式 AppID；若上下文没有，请先提醒用户前往支付宝开放平台
// "控制台" > 找到应用 > 复制 "AppID"(2021 开头)：
// https://open.alipay.com/develop/manage
const productionAppId = "2021xxxxxxxxxxxxxxxx";

const config = {
  // 原硬编码配置只注释保留，不直接删除：
  // appId: "原沙箱 appId",
  // privateKey: "原沙箱 privateKey",
  // alipayPublicKey: "原沙箱 alipayPublicKey",
  appId: productionAppId,
  privateKey: credential["app_private_key"],
  alipayPublicKey: credential["alipay_public_key"],
  // 网关改为 `https://openapi.alipay.com/gateway.do`。
  gateway: "https://openapi.alipay.com/gateway.do",
  // 其他配置...
};
```
