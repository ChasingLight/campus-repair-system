# MCP 调用约定

> 签约 Skill 后端 MCP 能力声明、参数映射、调用规范、错误处理与输出格式。
> 被 references/preview.md、references/apply.md 引用。

> ⛔ **硬约束：previewFormView 和 apply 的请求 JSON 必须由 `scripts/` 下的脚本生成，禁止自行组装。**
> 脚本内含业务规则（MCC 拆分、SKIP_BLOCKS 过滤、pageData 合并、固定参数注入），这些规则会随版本演进。自行组装会丢失这些规则，导致静默错误或数据丢失。

## 2. 后端能力声明

本 Skill 依赖 5 个后端 MCP 能力，对应 3 个 MCP Facade。

### 2.1 MCP Server 与 Facade 映射

| MCP Server | MCP Facade | 方法 | MCP tool 名称 |
|---|---|---|---|
| `ar-sign` | `ProductOpenMcpFacade` | `previewFormView` | `ar-sign.previewFormView` |
| `ar-sign` | `ProductOpenMcpFacade` | `apply` | `ar-sign.apply` |
| `ar-query` | `McpArQueryFacade` | `queryArInfosBySalesProd` | `ar-query.queryArInfosBySalesProd` |
| `ar-query` | `McpArQueryFacade` | `queryArInfosByBackProd` | `ar-query.queryArInfosByBackProd` |
| `ar-order-query` | `McpBizOrderQueryFacade` | `queryBizOrder` | `ar-order-query.queryBizOrder` |
| `ar-order-query` | `McpBizOrderQueryFacade` | `queryBizOrdersByAccount` | `ar-order-query.queryBizOrdersByAccount` |

### 2.2 能力详情

| 能力名称 | Skill 侧参数 | MCP 实际参数 | 返回 | 职责 |
|---|---|---|---|---|
| `previewFormView` | salesCodes + values（可选） | `McpPreviewFormViewRequest { salesProductCodes, callMode, pageData, ... }` | `ResultDTO<McpPreviewFormViewResponse>` 含 artisanPage | 初始化/刷新签约页面 |
| `apply` | 完整 artisanPage 数据 | `McpApplyRequest { businessProperty, salesProductCodes, ... }` | `ResultDTO<McpApplyResponse>` 含 orderNo | 提交签约申请 |
| `queryArInfosBySalesProd` | salesProductCodes | `McpQueryArBySalesProdRequest { salesProductCodes }` | `ResultDTO<McpQueryArBySalesProdResponse>` 含 arInfoList | 按前台产品查合约 |
| `queryArInfosByBackProd` | backProdCodes | `McpQueryArByBackProdRequest { backProdCodes }` | `ResultDTO<McpQueryArByBackProdResponse>` 含 arInfoList | 按后台产品查合约 |
| `queryBizOrder` | orderNo | `McpQueryBizOrderRequest { orderNo }` | `ResultDTO<McpBizOrderBasicInfoResponse>` | 按订单号查签约订单 |
| `queryBizOrdersByAccount` | accountNo + salesCode | `McpQueryBizOrderByAccountRequest { purchaserAccountNo, salesCode }` | `ResultDTO<McpBizOrderBasicInfoResponse>` | 按账号查签约订单 |

### 2.3 参数映射规则

> ⛔ **以下映射规则已内置于 `scripts/` 脚本中，禁止自行实现这些映射逻辑。** 此表仅供理解参考，不可作为组装 JSON 的依据。

| Skill 参数 | MCP 参数 | 处理方 |
|---|---|---|
| `salesCodes` | `salesProductCodes` | 脚本自动映射 |
| artisanPage values | `pageData` | 脚本从 ar-sign-data.json 提取合并 |
| （固定值） | `callMode="INTERACTION"` | 脚本自动注入 |
| （固定值） | `channelCode="B_SK_SH_RPC"` | 脚本自动注入 |
| （固定值） | `orderType="NEW_SIGN"` | 脚本自动注入 |

> `pid` 通过 CLI 授权登录后由网关自动获取，Skill **不需要向用户收集 pid**。
> `McpOperateContext` 需传入空对象 `{}`，脚本自动生成。

### 2.4 调用约定

通过 `alipay-cli` 调用 MCP tool。**切换环境只需修改下方环境配置，所有子 Skill 引用此处。**

#### CLI 前置检查

每次进入签约流程前，先检测 CLI 是否可用：

```bash
# 1. 检测是否已安装
which alipay-cli

# 3. 验证安装成功
alipay-cli version```

若安装失败，告知用户：
> "alipay-cli 安装失败，请参考文档手动安装后重试。"

#### 环境配置

```
CLI命令: alipay-cli
```

#### MCP 输出规范

CLI 的调试信息（ANSI 转义码、表格边框、日志）输出到 **stderr**，JSON 响应输出到 **stdout**。调用 MCP 时**必须**用 `2>/dev/null` 丢弃 stderr，只保留 stdout 的纯 JSON：

```bash
# ✅ 正确：2>/dev/null 丢弃 stderr，stdout 为纯 JSON
alipay-cli mcp call <server>.<tool> -d '<json>' 2>/dev/null

# ✅ 正确：保存结果到文件
alipay-cli mcp call <server>.<tool> -d '<json>' 2>/dev/null > ~/.alipay/ar/tmp/response.json

# ❌ 错误：tee 会同时输出到终端和文件，文件包含调试输出
alipay-cli mcp call ... 2>&1 | tee ~/.alipay/ar/tmp/response.txt

# ❌ 错误：2>&1 把 stderr 混入 stdout，文件包含 ANSI 转义码和表格
alipay-cli mcp call ... > ~/.alipay/ar/tmp/response.txt 2>&1
```

> **⚠️ 不加 `2>/dev/null` 会导致文件被 ANSI 转义码、表格边框（│ ─ ┌ ┐）、调试日志污染，脚本无法解析。**

#### 调用示例

> ⛔ **previewFormView 和 apply 的请求 JSON 禁止自行组装，必须通过脚本生成后传入 CLI。** 以下示例中的 `-d "$(cat ...)"` 读取的是脚本输出的文件，不是手写的 JSON。

```bash
# previewFormView — 首次调用（无 ar-sign-data.json）
python3 scripts/init_preview_request.py -s I1080300001000041203 -o ~/.alipay/ar/tmp/preview_request.json
alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null > ~/.alipay/ar/tmp/preview_response.json
python3 scripts/save_preview_response.py -r ~/.alipay/ar/tmp/preview_response.json

# previewFormView — 后续调用（已有 ar-sign-data.json，修改字段）
python3 scripts/build_preview_request.py webSiteInfo.webStatus=OFFLINE -o ~/.alipay/ar/tmp/preview_request.json
alipay-cli mcp call ar-sign.previewFormView -d "$(cat ~/.alipay/ar/tmp/preview_request.json)" 2>/dev/null > ~/.alipay/ar/tmp/preview_response.json
python3 scripts/save_preview_response.py -r ~/.alipay/ar/tmp/preview_response.json

# apply — 提交签约申请
python3 scripts/build_apply_request.py -o ~/.alipay/ar/tmp/apply_request.json
alipay-cli mcp call ar-sign.apply -d "$(cat ~/.alipay/ar/tmp/apply_request.json)" 2>/dev/null
```

查询类接口参数简单，可直接构造：

```bash
# 按前台产品查合约
alipay-cli mcp call ar-query.queryArInfosBySalesProd -d '{"request":{"salesProductCodes":["I1080300001000041203"]},"ctx":{}}' 2>/dev/null

# 按后台产品查合约
alipay-cli mcp call ar-query.queryArInfosByBackProd -d '{"request":{"backProdCodes":["I1011000100000000005"]},"ctx":{}}' 2>/dev/null

# 按订单号查订单
alipay-cli mcp call ar-order-query.queryBizOrder -d '{"request":{"orderNo":"ORD20260411160001"},"ctx":{}}' 2>/dev/null

# 按账号+产品查订单
alipay-cli mcp call ar-order-query.queryBizOrdersByAccount -d '{"request":{"purchaserAccountNo":"2088xxx","salesCode":"I1080300001000041203"},"ctx":{}}' 2>/dev/null
```

## 7. 后端错误处理

### 7.1 后端返回结构

后端 MCP 接口统一使用 `ResultDTO<T>` 包装返回：

| 字段 | 类型 | 说明 |
|---|---|---|
| `errorCode` | string | 错误码 |
| `errorMessage` | string | 错误描述 |
| `bizTips` | string | 业务提示信息（可展示给用户） |
| `needRetry` | boolean | 是否建议重试 |

apply 响应额外包含 `checkedError` 字段，表示字段校验错误。

### 7.2 Skill 层错误处理规则

| 场景 | 处理方式 |
|---|---|
| 后端返回 errorCode | 展示 errorMessage 给用户；如有 bizTips 一并展示 |
| `needRetry=true` | 告知用户可以重试 |
| apply 返回 checkedError | 提取校验错误信息，引导用户修正对应字段 |
| Skill 弱校验不通过 | 直接告知用户缺少哪些参数 |

Skill 层面**不做自动重试**，展示错误信息由用户决定下一步。

## 8. Skill 对外输出格式

### 8.1 收集进行中

```json
{
  "status": "collecting",
  "productName": "电脑网站支付",
  "checklist": [
    { "title": "经营信息", "state": "completed", "desc": "经营类目：零售-超市" },
    { "title": "店铺信息", "state": "in_progress", "desc": "网站状态：未上线，待收集：网站页面截图" },
    { "title": "联系人", "state": "pending" }
  ],
  "currentStep": {
    "title": "店铺信息",
    "mode": "form",
    "fields": [
      { "name": "shopName", "label": "店铺名称", "widget": "input", "required": true, "value": null },
      { "name": "shopPhoto", "label": "店铺门头照", "widget": "ImageUploadV2", "required": true, "value": null }
    ]
  }
}
```

- `checklist`：全局进度，渲染时用 ✅（completed）🔘（in_progress）🔲（pending）。`desc` 必须从 ar-sign-data.json 的 schema/values 中提取，使用 `title` 作为字段名、`enums[].key` 作为枚举展示名，禁止展示程序字段名（如 `mccCode`、`webStatus`）或技术元数据（如 `type`、`widget`）
- `currentStep.mode`：`single_field`（单字段，对话式）或 `form`（>=2 字段，表单式收集）
- `currentStep.fields`：内部结构化数据，对客展示时只使用 `label`，**禁止展示 `name`（程序字段名）、`widget`（组件类型）、`type`（数据类型）等技术字段**
- 不含价格模块和协议模块

### 8.2 收集完成，可提交

```json
{
  "status": "ready_to_apply",
  "productName": "电脑网站支付",
  "summary": [
    {
      "title": "经营信息",
      "items": [
        { "label": "经营类目", "value": "零售-超市/便利店" }
      ]
    },
    {
      "title": "网站信息",
      "items": [
        { "label": "网站名称", "value": "我的商城" },
        { "label": "网站地址", "value": "https://example.com" }
      ]
    },
    {
      "title": "合约价格",
      "items": [
        { "label": "费率", "value": "0.6%" }
      ]
    },
    {
      "title": "协议",
      "items": [
        { "label": "支付宝支付服务合同", "value": "已确认" }
      ]
    }
  ],
  "pendingFields": [
    { "label": "店铺门头照", "reason": "待线上补充" }
  ]
}
```

- `summary`：按区块展示所有已收集信息，**包含**价格和协议
- `pendingFields`：V1 兜底跳过的字段（如图片上传），标注原因
- 敏感信息脱敏（手机号中间 4 位用 `*`，邮箱 `@` 前仅保留首尾）

### 8.3 提交完成

```json
{
  "status": "submitted",
  "orderNo": "ORD20260411160001",
  "message": "签约申请已提交，预计1~3个工作日完成审核。"
}
```
