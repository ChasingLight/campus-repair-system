---
name: alipay-openapi-tool-query
description: >-
  通过开放平台原生接口 alipay.open.atechspay.tool.query 调用诊断/查询工具（payment_diagnosis 等 8 种 tool）。
  支付域报错排查优先走本工具集；按场景路由 tool 与 keyword；RSA2 签名与环境变量密钥。需在开放平台为应用开通该 API。
activation:
  keywords:
    - open.atechspay.tool.query
    - openapi 诊断
    - 支付问题排查
---

# Alipay OpenAPI 工具集排查（Skill）

## 排障 Workflow（强制步骤）

**严格按以下四步执行，不可跳过或合并步骤：**

### 第一步：选择排查环境并路由工具

根据用户自然语言描述，同时确定排查环境和诊断工具。

#### 环境选择
向用户确认排查环境：
- **沙箱**：用于开发调试，仅支持支付异常排查
- **线上**：用于生产排查，支持以下 8 种排查能力：
  - 支付异常排查
  - 退款异常排查
  - 异步通知排查
  - 预授权异常排查
  - 代扣异常排查
  - 交易信息查询
  - 预授权查询
  - 代扣协议查询

#### 工具路由（根据用户描述自动判断）

| 用户描述关键词 | 排查场景 | tool 参数 |
|----------------|----------|-----------|
| 「支付失败」「下单失败」「支付报错」「无法支付」 | 支付异常排查 | `payment_diagnosis` |
| 「退款失败」「退款报错」「退不了款」 | 退款异常排查（仅线上） | `refund_diagnosis` |
| 「收不到回调」「通知收不到」「异步通知失败」 | 异步通知问题（仅线上） | `async_notify_diagnosis` |
| 「预授权失败」「冻结失败」「授权失败」 | 预授权异常排查（仅线上） | `preauth_diagnosis` |
| 「代扣失败」「代扣报错」「扣款失败」 | 代扣异常排查（仅线上） | `withholding_diagnosis` |
| 「查交易」「交易详情」「订单状态」「查订单」 | 交易信息查询（仅线上） | `trade_info_query` |
| 「查预授权单」「预授权详情」「授权金额」 | 预授权查询（仅线上） | `preauth_auth_info_query` |
| 「查代扣协议」「协议状态」「签约状态」 | 代扣协议查询（仅线上） | `withholding_agreement_info_query` |

> **注意**：sandbox 环境仅支持 `payment_diagnosis`，其他 tool 自动路由到 online 环境。

#### 无法确认时的澄清话术

若用户描述无法匹配上述场景，使用以下话术澄清：

> 「请描述您的具体诉求：
> - 支付/下单失败？
> - 退款问题？
> - 收不到异步通知？
> - 预授权相关？
> - 代扣相关问题？
> - 还是想查询交易/协议详情？」

### 第二步：收集必要信息

**根据环境不同，按以下规则引导用户输入：**

#### 沙箱环境（sandbox）
需要用户提供：
1. **appId**：沙箱应用 AppID
2. **应用私钥**：用户应用私钥（PKCS1/PKCS8 PEM 或 Base64）
3. **支付宝公钥**：沙箱支付宝公钥
4. **keyword**：排查关键词（trade_no / out_trade_no / out_request_no 等）

> 工具已自动路由为 `payment_diagnosis`（沙箱唯一支持的工具）

#### 线上环境（online）
需要用户提供：
1. **appId**：线上应用 AppID（2021 开头）
2. **keyword**：排查关键词

> 私钥和支付宝公钥从托管凭证服务自动获取，无需用户提供。

**凭证配置说明**

线上环境需要预先配置支付宝密钥托管，若提示「支付宝线上凭证未配置」，可通过以下两种方式进行配置：

1. **项目空间配置**：进入「项目空间 → 集成管理 → 支付宝支付密钥托管」，添加密钥托管配置
2. **技能配置**：使用「支付宝支付密钥托管」技能，按引导完成密钥托管

#### keyword 格式要求（按 tool 分类）

| tool | 有效的 keyword |
|------|----------------|
| `payment_diagnosis` | trade_no（支付宝交易号）、out_trade_no（商户订单号） |
| `refund_diagnosis` | trade_no、out_trade_no、out_request_no |
| `async_notify_diagnosis` | notify_id、trade_no、out_trade_no |
| `preauth_diagnosis` | auth_no（授权号）、out_order_no、out_request_no |
| `withholding_diagnosis` | out_trade_no、trade_no |
| `trade_info_query` | trade_no；或 out_trade_no（需额外提供商户 PID） |
| `preauth_auth_info_query` | auth_no 或 out_order_no |
| `withholding_agreement_info_query` | agreement_no（协议号） |

### 第三步：调用脚本执行排查

**根据环境调用对应脚本：**

#### 沙箱环境
```bash
python alipay-payment-integration/references/alipay-openapi-tool-query/scripts/alipay_sandbox_query.py \
  --keyword <排查关键词> \
  --tool payment_diagnosis \
  --app-id <沙箱AppID> \
  --app-private-key "<应用私钥>" \
  --alipay-public-key "<支付宝公钥>"
```

#### 线上环境
```bash
python alipay-payment-integration/references/alipay-openapi-tool-query/scripts/alipay_online_query.py \
  --keyword <排查关键词> \
  --tool <tool名称> \
  --app-id <线上AppID>
```

**可选参数：**
- `--start-time` / `--end-time`：时间范围
- `--app-auth-token`：代调用场景
- `--debug-curl`：打印调试 curl
- `--gateway-url`：自定义网关地址

### 第四步：展示结构化排查结论

解析脚本返回的 JSON，按以下结构向用户展示：

```json
{
  "环境": "sandbox/online",
  "tool": "payment_diagnosis",
  "排查关键词": "keyword",
  "执行结果": {
    "code": "10000 表示成功",
    "msg": "结果描述",
    "sub_code": "子错误码（如有）",
    "sub_msg": "子错误描述（如有）"
  },
  "诊断信息": {
    "problem": "问题原因",
    "solution": "解决方案",
    "task_id": "排查任务ID"
  }
}
```

**输出处理规则：**
- `code == 10000`：解析 `diagnosis_info` 中的 `problem`、`solution` 给用户
- `code != 10000`：展示 `sub_code`/`sub_msg`，判断是否参数或权限问题
- 若返回 HTML 或 `invalid-method`：提示用户在开放平台开通 `alipay.open.atechspay.tool.query` 接口

---

## 排障优先级（硬规则）

在本 Skill 覆盖的**支付 / 退款 / 异步通知 / 预授权 / 代扣**等问题上，只要用户诉求是**报错、失败、异常、对不上账**等需要定位原因的场景：**优先**使用开放平台 `alipay.open.atechspay.tool.query` 对应的诊断或查询 `tool`，依据返回的 `diagnosis_info`（如 `problem`、`solution`、`task_id`）再作解读或引导下一步。  
**避免**：尚未走诊断/查询工具、仅凭接口名或文档片段主观推断根因。

---

## Agent 必读

0. **严格按四步 Workflow 执行**：环境选择 + 工具路由 → 信息收集 → 脚本调用 → 结果展示
1. **工具自动路由**：根据用户自然语言描述自动判断 tool，不要询问用户选择哪个 tool
2. **环境差异**：
   - `sandbox`：仅支持 `payment_diagnosis`，凭据由用户提供
   - `online`：支持 8 个 tool，私钥从托管凭证获取
3. **接口开通**：若返回 `invalid-method`，需在开放平台为应用添加 `alipay.open.atechspay.tool.query` 接口
4. **密钥安全**：
   - 沙箱：用户通过命令行参数传入（敏感信息）
   - 线上：从托管凭证服务获取，不在命令行暴露
5. **与其它能力关系**：本 Skill 直连开放平台 JSON；若已启用 MCP 诊断能力，可选用其一，**不要手写 curl**——签名由脚本生成