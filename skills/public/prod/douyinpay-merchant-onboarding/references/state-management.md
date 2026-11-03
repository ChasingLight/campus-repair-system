# 状态管理

本 Skill 使用本地 mmap 文件做最小断点恢复。状态只保存非敏感、非业务真相字段，不代表真实入驻、签约或密钥状态。

## 状态文件

```text
/tmp/.douyinpay_onboarding_${USER}.mm
```

系统重启或手动删除后状态丢失，不影响 CLI 登录凭证。

## 默认状态结构

```json
{
  "entry_mode": "",
  "product_name": "Native 支付",
  "product_code": "CO_PAY_NATIVE",
  "category_name": "其他互联网服务",
  "materials": {
    "homepage_image_url": "",
    "sales_page_image_url": ""
  }
}
```

## 允许写入字段

| 字段路径 | 说明 |
|---|---|
| `entry_mode` | `onboard` / `existing_merchant` 等入口分流 |
| `product_name` | 用户侧产品名，默认 `Native 支付` |
| `product_code` | CLI 产品码，默认 `CO_PAY_NATIVE` |
| `category_name` | 默认 `其他互联网服务` |
| `materials.homepage_image_url` | 域名首页截图上传后的 `file_url` |
| `materials.sales_page_image_url` | 销售/服务页截图上传后的 `file_url` |

写入其他字段必须失败。

## 禁止写入字段

不得写入：

- access token；
- refresh token；
- CLI credential 内容；
- 私钥；
- 接口加密密钥；
- 证书明文；
- 商户证书序列号；
- 邮箱；
- 商户简称；
- 身份证、银行卡、手机号；
- merchant_id；
- app_id；
- 签约状态；
- 申请 ID / 申请单号；
- 合约号；
- 本地 completion/status 字段。

原因：

- 敏感字段不应进入本地状态；
- 业务状态必须实时查询；
- 状态文件用于断点，不用于证明流程完成。

## 命令

```bash
python3 scripts/state_manager.py init
python3 scripts/state_manager.py exists
python3 scripts/state_manager.py get <field>
python3 scripts/state_manager.py set <field> <value>
python3 scripts/state_manager.py set-json <field> '<json>'
python3 scripts/state_manager.py show
python3 scripts/state_manager.py reset
python3 scripts/state_manager.py delete
```

## `exists` 语义

`exists` 返回 `true` 的条件：任一 meaningful field 已写入，例如：

- `entry_mode` 非空；
- `materials.homepage_image_url` 非空；
- `materials.sales_page_image_url` 非空。

`product_name`、`product_code`、`category_name` 是默认值，不单独构成历史进度。

## 恢复策略

恢复时只用于决定是否跳过资料重新采集：

- 已有产品与入口信息：可询问是否沿用；
- 已有截图 URL：可询问是否复用；
- 签约状态仍必须重新执行 `dypay-cli sign query-by-code --product-code CO_PAY_NATIVE --json`；
- 登录状态仍必须重新执行 `dypay-cli auth status --json`；
- 密钥状态仅以用户确认已完成商家平台配置为准，后续校验由支付集成 Skill 处理。

## 清理规则

流程完成后，必须清理本地断点状态。

清理命令：

```bash
python3 scripts/state_manager.py delete
```

不要删除 CLI 登录凭证，除非用户明确要求退出登录。
