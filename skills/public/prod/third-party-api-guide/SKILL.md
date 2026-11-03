---
name: third-party-api-guide
description: 指导Skill脚本中第三方API的授权类型判断、凭证工具调用与代码生成；当Skill的脚本需要调用任何第三方API或外部服务接口时，必须加载本Skill完成授权配置
---

# 第三方API调用指南

## 凭证铁律

以下规则贯穿全流程，违反任何一条都会导致脚本运行失败:

1. **导入来源**: 必须 `from coze_workload_identity import requests`（或 httpx），禁止使用标准库的 requests。此包已预装，不写入 Skill 的 dependency
2. **凭证读取**: 必须通过 `os.getenv("COZE_{CREDENTIAL_NAME}_{SKILL_ID}")` 获取，credential_name 转大写
3. **禁止的凭证传递方式**:
   - 函数参数（如 `def call_api(token)`）
   - 命令行参数（如 `--token`, `--api-key`）
   - 脚本内占位符（如 `YOUR_TOKEN_HERE`）
4. **凭证命名**: `credential_name` 在同一 Skill 内唯一，格式为 `<服务名>_<用途>`（如 `feishu_doc`、`openai_chat`）

## 操作步骤

### 第一步:确定API调用方式

在生成代码前，按优先级确认如何调用目标 API:

| 优先级 | 信息来源 | 操作 |
|--------|---------|------|
| 1 | 用户提供的接口文档 | 直接参考其中的认证方式、请求格式、参数说明 |
| 2 | 网络搜索 | `web_search(query="<API名称> API 调用方式 认证")` |
| 3 | 已有知识 | 以上均无结果时，基于已知信息确定 |

### 第二步:判断授权类型

```
无需授权 ────────────────────────────────────→ 直接跳到第四步

需要授权 → 按以下规则判断 auth_type:
  ├─ 微信公众号相关(含 wechat/weixin/公众号关键词)
  │    → auth_type = 2 (WeChatOfficialAccount)
  │
  ├─ 需通过 OAuth 协议获取 access_token
  │  (飞书、Gmail、微博、GitHub 等)
  │    → auth_type = 3 (OAuth)
  │    注: 飞书API若无明确指定，默认用 user_access_token → auth_type=3
  │
  └─ 直接使用固定 API Key/Token，无需令牌交换
       → auth_type = 1 (ApiKey)
```

注意: 同一三方平台的不同服务可能需要**分别授权**（如飞书云文档、飞书多维表格各自独立配置凭证）

### 第三步:调用 skill_credentials 工具

根据 auth_type 选择对应调用方式:

#### auth_type=1 (ApiKey)

当前仅支持单个 env_variable。若需要多个，向用户提示不支持，改用占位符方式生成代码。

```python
skill_credentials(
    credential_name="openai_key",                    # Skill内唯一
    auth_type=1,
    allowed_domain="api.openai.com",                 # 三方服务域名
    credential_tips="<引导用户获取凭证的步骤说明>",
    env_variable_list=[{
        "variable_name": "API_KEY",
        "api_key_location": 2,                       # 1=Query参数, 2=Header
        "api_key_param_name": "Authorization",       # Header名称
        "api_key_prefix": "Bearer "                  # 前缀(无则留空)
    }]
)
```

#### auth_type=2 (微信公众号)

```python
skill_credentials(
    credential_name="wechat_official",
    auth_type=2,
    credential_tips="登录微信开发者平台，进入我的业务选目标业务，在基础信息看AppID，在开发密钥启用/重置AppSecret。"
)
```

#### auth_type=3 (OAuth)

```python
skill_credentials(
    credential_name="feishu_doc",
    auth_type=3,
    allowed_domain="open.feishu.cn",
    credential_tips="<引导用户创建OAuth应用并获取Client ID/Secret的步骤>",
    custom_oauth_url={
        authorization_url: "<OAuth授权页URL>",
        token_url: "<令牌交换URL>"
    }
)
```

### 第四步:生成代码

#### 通用代码骨架

所有三方调用脚本均基于此骨架生成，按授权类型调整标注 `【差异点】` 的部分:

```python
import os
from coze_workload_identity import requests  # 【铁律】必须从此包导入

def <function_name>(<业务参数>):
    """<功能描述>"""

    # 1. 获取凭证
    skill_id = "<实际skill_id值>"
    credential = os.getenv("COZE_<CREDENTIAL_NAME>_<SKILL_ID>")
    if not credential:
        raise ValueError("缺少凭证配置，请检查环境变量")

    # 2. 构建请求 ——【差异点: 授权方式】见下方适配表
    url = "<API_URL>"
    headers = {"Content-Type": "application/json"}

    # 3. 发起请求
    try:
        response = requests.<method>(url, headers=headers, json={...}, timeout=30)
        if response.status_code >= 400:
            raise Exception(f"HTTP请求失败: {response.status_code}, {response.text}")
        data = response.json()

        # 4. 业务错误处理 ——【差异点: 错误判断】见下方适配表
        if <error_condition>:
            raise Exception(f"API错误: {<error_detail>}")

        return <业务结果>

    except requests.exceptions.RequestException as e:
        raise Exception(f"请求失败: {str(e)}")
```

#### 按授权类型适配

将骨架中的 `【差异点】` 替换为以下内容。每种类型的凭证传递方式**必须根据第一步获取的 API 文档确定**，下方仅列出常见模式供参考。

**auth_type=1 (ApiKey)** -- 凭证变量名用 `credential`

凭证传递方式因 API 而异，必须查文档确认，常见有三种:

```python
# 模式A: 放在 Header 中（最常见，但 Header 名和前缀各 API 不同）
# 例: OpenAI 用 Authorization: Bearer，有的 API 用 X-API-Key 无前缀
headers["<Header名>"] = f"<前缀>{credential}"
# 实际举例:
headers["Authorization"] = f"Bearer {credential}"   # OpenAI 风格
headers["X-API-Key"] = credential                    # 无前缀风格

# 模式B: 放在 Query 参数中
# 例: 某些地图/天气类 API 用 ?key=xxx 或 ?appkey=xxx
url = f"https://api.example.com/endpoint?<参数名>={credential}"

# 模式C: 放在请求体中
# 例: 少数 API 要求在 JSON body 里传 api_key 字段
payload["api_key"] = credential
```

错误判断: 按目标 API 的响应格式处理。常见模式为检查 `"error" in data` 或 HTTP 状态码。

**auth_type=2 (微信公众号)** -- 凭证变量名用 `access_token`

从环境变量拿到的凭证已经是可用的 access_token，**不需要再通过 APP_ID + APP_SECRET 换取**。微信 API 统一将 token 放在 Query 参数中:

```python
access_token = os.getenv("COZE_<CREDENTIAL_NAME>_<SKILL_ID>")
url = f"https://api.weixin.qq.com/cgi-bin/<接口路径>?access_token={access_token}"
```

错误判断: `data.get("errcode", 0) != 0`，错误信息: `data.get("errmsg", "未知错误")`

**auth_type=3 (OAuth)** -- 凭证变量名用 `access_token`

从环境变量拿到的凭证已经是 OAuth 流程换取后的 access_token，通常放在 Header 中:

```python
access_token = os.getenv("COZE_<CREDENTIAL_NAME>_<SKILL_ID>")
headers["Authorization"] = f"Bearer {access_token}"
```

错误判断: 按目标平台的响应格式处理。飞书常见 `data.get("code", 0) != 0` + `data.get("msg")`，GitHub 常见 HTTP 状态码 + `data.get("message")`。
