---
name: supabase-auth
description: 用户登录注册认证能力。当用户提到以下任何需求时必须加载：登录、注册、登出、Sign in、Sign up、Sign out、用户认证、身份验证、Auth、OAuth、SSO、账号体系、会话管理、Token验证、登录页面、注册页面、登录态、鉴权、权限校验、邮箱登录、手机号登录、验证码登录、密码重置、忘记密码、用户系统、账户管理、session管理、小程序登录、微信小程序、抖音小程序、支付宝小程序、多人协作。适用于：生成或修改登录/注册页面UI（Web端、移动端App、小程序端）、配置邮箱或手机号登录方式、获取Supabase连接凭证(URL/AnonKey)、实现业务接口登录态验证与身份鉴权、接入第三方登录。
dependencies:
- supabase
---

# Supabase Auth 登录能力指南

> 📌 **依赖说明**：本 Skill 依赖 **supabase** Skill，加载时会自动加载。如果 supabase Skill 与本 Skill 存在冲突（如 Auth 相关的接口调用方式、Header 约定等），**以本 supabase-auth Skill 为准**。

---

## 🔴 强制执行流程（必须按顺序执行，禁止跳步）

### Step 1: 确认现有登录模块状态

检查项目中是否已有登录模块：
- **没有登录模块** → 继续 Step 2
- **已有 Supabase Auth 登录模块** → 继续 Step 2（增量修改）
- **已有非 Supabase 的自定义登录模块** → 🔴 必须询问用户是否切换到 Supabase Auth（切换会导致原有用户数据丢失），用户确认后才能继续

### Step 2: 获取 Auth 配置

```bash
npx coze-coding-ai supabase auth get-config-v2
```

项目 ID 只从项目根目录 `.coze` 或 `.cozeproj/.coze` 的 `[project].project_id` 读取，不使用 `COZE_PROJECT_ID`。合法的十进制 `project_id` 选择带项目范围的 Integration Auth 接口：`COZE_API_TOKEN` 只从运行进程环境读取；没有合法项目 ID 的旧环境继续使用 workload 兼容的 Auth V2 接口。`app_id` 可选。两种路径都能读取应用名称、图标信息及邮箱/手机号登录配置，也都能更新应用名称和邮箱/手机号登录配置。图标不属于 `update-config-v2` 的可写字段，更新 Auth 配置时会保留当前图标。两者的差异仅在鉴权和路由：前者使用用户 token 与 `.coze` 项目 scope，后者使用 workload token，且不携带项目 scope headers。

🔴 此步必须执行，不可跳过。根据返回的配置决定开启哪些登录方式（邮箱/手机号），未开启的方式**禁止生成对应代码**。

### Step 3: 读取参考文档并实现

根据用户需求类型，用 Read 工具读取对应文档：

| 需求类型 | 必读文档 | 说明 |
| --- | --- | --- |
| 修改 Auth 配置（开关登录方式等） | [references/auth-config.md](references/auth-config.md) | CLI 命令查询/更新配置 |
| 生成/修改登录页面（Web 端） | [references/client-login.md](references/client-login.md) + [references/client-login-ui-web.md](references/client-login-ui-web.md) | 先读登录能力实现，再读 Web UI 规范 |
| 生成/修改登录页面（移动端 App） | [references/client-login.md](references/client-login.md) + [references/client-login-ui-app.md](references/client-login-ui-app.md) | 先读登录能力实现，再读 App UI 规范 |
| 生成/修改登录页面（小程序端） | [references/client-login.md](references/client-login.md) + [references/client-login-ui-miniprogram.md](references/client-login-ui-miniprogram.md) | 先读登录能力实现，再读小程序 UI 规范（含 SDK 适配） |
| 业务接口鉴权（登录态验证） | [references/verify-session.md](references/verify-session.md) | 前端携带 x-session，服务端校验 token |

### Step 4: 配置更新后必须刷新 UI

如果在流程中使用了 `update-config-v2` 命令更新了配置，必须：
1. 重新执行 `get-config-v2` 获取最新配置
2. 根据新配置和 UI 规范文档重新更新登录模块 UI

---

## 关键约束（必须遵守）

1. **配置驱动**：登录方式完全由 Auth 配置决定，`external_email_enabled=false` 时禁止生成邮箱登录代码，`external_phone_enabled=false` 时禁止生成手机号登录代码
2. **登录态 Header**：key 固定为 `x-session`，前后端必须一致。前端将 supabase session 中的 access_token 放入 `x-session` header；后端从该 header 取 token 调用 supabase 验证用户身份
3. **SMTP 配置不透出**：邮箱登录依赖的 SMTP 配置属于内部配置，不要向用户展示或让用户手动配置
4. **增量修改优先**：已有登录页时优先做增量修改，应用 icon 和名称从 auth 配置的 `icon_url` 和 `name` 字段获取
5. **Next.js Image 域名配置**：使用 `icon_url` 展示应用图标时，必须在 `next.config.js` 中配置允许的外部图片域名，否则会报错
6. **不要编写测试文件**
