# CLI Command Templates

本文件提供服务市场上架子 skill 的 CLI 命令模板。

- CLI: `alipay-cli`
- Server: `a2a-pay-service`
- 输出: `--json`

**⚠️ 注意：登录态检查和 MCP 可用性检查由主 skill 负责，本子技能不单独处理。**

## 1. discoverBazaarServicesForMcp（查询已上架服务）

查询当前用户已上架的服务列表：

```bash
alipay-cli mcp call a2a-pay-service.discoverBazaarServicesForMcp \
  -d '{"request":{}}' \
  --json 2>/dev/null
```

**返回示例：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "chargeType": "FREE",
        "httpMethod": "POST",
        "ownerId": "2088402443XXXXXX",
        "serviceName": "XXX",
        "resourceUrl": "https://api.example.com/openapi/xxxxx-service",
        "serviceSummary": "提供标准化企业服务调用接口",
        "serviceStatus": "ACTIVE",
        "paymentProtocol": "NONE",
        "category": "天气服务",
        "serviceId": "API_XXXXX"
      }
    ]
  }
}
```

**返回字段说明：**

| 字段 | 说明 |
|------|------|
| `serviceId` | 服务 ID |
| `serviceName` | 服务名称 |
| `serviceDesc` | 服务描述 |
| `resourceUrl` | 服务地址 |
| `pricing` | 服务单价 |
| `serviceStatus` | 服务状态（ACTIVE	生效	服务注册成功; INACTIVE	失效	服务审核被驳回，返回客服链接 https://pcrender.alipay.com/index?scene=znsbhzx; PENDING	审批中	已有服务注册的流程，但在等等结果中 |

**状态判断：**

- 返回空数组或 `services` 字段不存在 → 无已上架服务，进入信息收集流程
- 返回非空数组 → 展示已上架服务状态

## 2. saveBazaarServiceForMcp（提交服务上架）

提交服务上架申请：

```bash
alipay-cli mcp call a2a-pay-service.saveBazaarServiceForMcp \
  -d '{"request":{"serviceName":"天气查询","serviceDesc":"提供全球天气查询服务，支持全球主要城市的实时天气和预报查询","resourceUrl":"https://api.example.com/weather","pricing":"0.01","schemaUrl":"{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\",\"description\":\"城市名称\"}}}"}}' \
  --json 2>/dev/null
```

**参数说明：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceName` | string | 是 | 服务名称，长度 1-50 字符 |
| `serviceDesc` | string | 是 | 服务描述，长度 1-500 字符 |
| `resourceUrl` | string | 是 | 服务地址，需为可访问的 URL |
| `pricing` | string | 是 | 服务单价（元），必须 >= 0.01 |
| `schemaUrl` | string | 是 | 请求示例，JSON 格式字符串 |

**返回示例：**

```json
{
  "success": true,
  "data": {
    "serviceId": "xxx",
    "status": "PENDING"
  }
}
```

**返回字段说明：**

| 字段 | 说明 |
|------|------|
| `serviceId` | 服务 ID，用于后续查询 |
| `status` | 服务状态 |

## 3. 错误处理

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| `AUTH_ERROR` | 认证失败 | 重新登录 |
| `SERVICE_NAME_EXISTS` | 服务名称已存在 | 更换服务名称 |
| `INVALID_URL` | URL 格式无效 | 检查 URL 格式 |
| `INVALID_PRICING` | 价格无效 | 确保价格 >= 0.01 |
| `INVALID_SCHEMA` | Schema 格式无效 | 检查 JSON 格式 |

### 错误检测优先级

```bash
# 检测错误时按以下优先级判断
# 1. 认证错误：HTTP 401, Authorization is empty
# 2. 服务错误：MCP 调用失败, connection refused
# 3. 业务错误：errorCode 存在
```

## 4. 数据验证

### 服务名称验证

```bash
# 长度 1-50 字符，不得为空
if [ ${#SERVICE_NAME} -lt 1 ] || [ ${#SERVICE_NAME} -gt 50 ]; then
  echo "❌ 服务名称长度应在 1-50 字符之间"
fi
```

### 服务描述验证

```bash
# 长度 1-500 字符，不得为空
if [ ${#SERVICE_DESC} -lt 1 ] || [ ${#SERVICE_DESC} -gt 500 ]; then
  echo "❌ 服务描述长度应在 1-500 字符之间"
fi
```

### 价格验证

```bash
# 必须 >= 0.01
if ! [[ "$PRICING" =~ ^[0-9]+(\.[0-9]+)?$ ]] || [ $(echo "$PRICING < 0.01" | bc) -eq 1 ]; then
  echo "❌ 服务单价必须大于等于 0.01 元"
fi
```

### URL 验证

```bash
# 基本格式验证
if [[ ! "$RESOURCE_URL" =~ ^https?:// ]]; then
  echo "❌ 服务地址必须以 http:// 或 https:// 开头"
fi
```

### Schema 验证

```bash
# JSON 格式验证
if ! echo "$SCHEMA_URL" | jq . >/dev/null 2>&1; then
  echo "❌ 请求示例必须是有效的 JSON 格式"
fi
```

## 5. 运行时变量操作

### 获取服务数据（由主技能 Step 5 采集，运行时传递）

```bash
# ⚠️ 禁止从共享内存读取 service_market_data（状态文件仅允许 4 个字段）
# SERVICE_NAME, SERVICE_DESC, RESOURCE_URL, PRICING, SCHEMA_URL 由主技能运行时传入
```

### 提交结果处理（上架成功后）

```bash
# ⚠️ 禁止写入 service_market_data 到状态文件（不在允许的 4 个字段内）
# 注册结果作为运行时变量返回给主技能
```

## 6. 说明

- 所有模板都以 `request` 包一层，和当前 MCP tool 入参结构保持一致
- `identityContext` 不在命令里显式传，默认由 CLI OAuth 会话和 MCP 链路注入
- 价格单位为元，字符串类型
- `schemaUrl` 为 JSON 字符串，建议使用转义后的 JSON