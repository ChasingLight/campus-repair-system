# 登录注册账户管理 框架指引

> 只搭框架。具体认证方式（密码 / OTP / OAuth / Passkey / 2FA）作为 provider 后续插拔。

## 0. 先选 Tier

| Tier | 适用 | 授权 |
| --- | --- | --- |
| **T1** 单角色 | 个人工具 / MVP | `@RequireAuth`，登录即全权 |
| **T2** 角色分级 | 中后台、双角色 SaaS | `users.role` 枚举 + `@RequireRole` |
| **T3** RBAC | 多角色 / 多租户 / 合规 | 角色-权限-用户 + `@RequirePermission` |

T1→T2→T3 单向加法升级，前 6 节框架共享，差异仅在 authorization。判定：管理员/普通做不同事 → ≥T2；≥3 角色或多租户或合规 → T3。

## 1. 模块切分

```
account/
├── identity/        用户主体、profile、生命周期
├── credential/      登录方式抽象（password/oauth/...）
├── session/         token 签发 / 刷新 / 吊销 / 多端
└── authorization/   T1=@RequireAuth · T2=role 枚举 · T3=RBAC
```

业务表外键一律到 `users.id`（UUIDv7/雪花），**不**外键 email/phone/username。

## 2. 数据模型

```sql
users(id PK, status, created_at, deleted_at)
user_profiles(user_id FK, nickname, avatar, locale, ...)

user_credentials(
  id, user_id FK,
  type,             -- 'password' | 'email_otp' | 'oauth_github' | ...
  identifier,
  secret_ref,       -- 哈希或外部凭证引用
  verified_at,
  metadata JSON,    -- 方式特有字段，新增方式不改表
  UNIQUE(type, identifier)
)

sessions(id, user_id FK, device, ip, ua, issued_at, last_active_at, revoked_at)

-- [T1] 无授权表
-- [T2] users 加列 role VARCHAR(32) DEFAULT 'user'
-- [T3] roles / permissions / role_permissions / user_roles(scope?)
```

`type` 字符串/枚举，新增登录方式 = 加值，不改表。

## 3. CredentialProvider（核心扩展点）

```ts
interface CredentialProvider {
  type: string;
  register?(input): Promise<{ user_id, credential_id }>;
  authenticate(input): Promise<{ user_id } | AuthError>;
  bind?(user_id, input): Promise<void>;
  unbind?(user_id, credential_id): Promise<void>;
}
```

统一登录路由 `POST /api/auth/login { type, payload }` → `providers.get(type).authenticate()` → `session.issue()`。新增方式不改路由、不改 session。

## 4. SessionService（与凭证解耦）

```ts
interface SessionService {
  issue(user_id, deviceCtx): Promise<Tokens>;
  refresh(refreshToken): Promise<Tokens>;
  resolve(accessToken): Promise<{ user_id } | null>;
  revoke(session_id): Promise<void>;
  revokeAll(user_id): Promise<void>;     // 改密 / 解绑 / 风控触发
  list(user_id): Promise<SessionInfo[]>;
}
```

切换 token 实现（JWT ↔ opaque）只动这里。

## 5. 用户状态机

```
guest →register→ pending →verify→ active ↔ disabled
                                     ↓ soft delete
                                  deleted →purge→ (物理删)
```

判定集中在 `UserStateMachine`，业务接口不写 `if (user.status === ...)`。

## 6. 路由分层 & 中间件链

```
/api/auth/*       未登录可达：login / register / refresh / forgot
/api/account/*    已登录本人：profile / credentials / sessions / 注销
/api/admin/*      [T2/T3] 管理员
/api/<biz>/*      业务

链：requestId → rateLimit → csrf → sessionResolve → permissionCheck → handler
```

业务 handler 只看 `ctx.user_id` 与 `ctx.permissions`，不接触 token / cookie / credential。

## 7. 授权（按 Tier）

- **[T1]** 仅 `@RequireAuth()`。**不**未雨绸缪建空表。
- **[T2]** `users.role` 枚举 + `@RequireRole('admin')`；前端 AuthStore 暴露 `role`。判定权全在后端。
- **[T3]** `@RequirePermission('order.refund')`；前端 `permissions: string[]` 仅做 UI 显隐；多租户用 `user_roles.scope` 承载 tenant_id；提供 `hasPermission` 工具。

## 8. 接口框架

```
POST   /api/auth/register        { type, payload }
POST   /api/auth/login           { type, payload }
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/challenge       { type, payload }   # OTP/PKCE 通用挑战入口
GET    /api/account/me
PATCH  /api/account/me
GET    /api/account/credentials
POST   /api/account/credentials  { type, payload }   # 绑定新方式
DELETE /api/account/credentials/:id
GET    /api/account/sessions
DELETE /api/account/sessions/:id
DELETE /api/account                                   # 注销
```

错误统一：`{ code: "AUTH.XXX", message, traceId }`。

## 9. 基础设施位（留接口，不绑实现）

`RateLimiter` / `CaptchaVerifier` / `Notifier` / `RiskEngine` / `AuditLog` / `SecretStore` 给抽象 + 空 stub，按需替换。

## 10. 前端框架

- **AuthStore**：`user, status('guest'|'authed'|'loading')`；T2 加 `role`；T3 加 `permissions`。**永不**暴露 token。
- **请求层**：拦截 401 → refresh → 失败跳登录。业务不 try/catch 401。
- **路由守卫**：基于 status + 当前 Tier 授权字段集中决策。
- **登录页**：根据后端 `enabledProviders` 动态渲染按钮。

## 11. 优先评估第三方

框架前先问：真要自建吗？多数项目应用 **Auth.js / Clerk / Supabase Auth / Authing / Lucia / Keycloak**。仅强合规、自主可控、独特会话/授权诉求才自建。

## 12. Tier 升级路径

- T1→T2：加 `role` 列、`@RequireRole`、AuthStore 加 `role`
- T2→T3：建 RBAC 四表、迁移 `users.role` → `user_roles`，`@RequireRole` 与 `@RequirePermission` 过渡共存
- 禁止反向降级（数据已散落）

## 13. 测试账号（强约定）

框架完工必须内置测试账号。**门控铁律**：仅 `COZE_PROJECT_ENV === 'DEV'` 时注入种子与启用登录分支。

```ts
const isDev = process.env.COZE_PROJECT_ENV === 'DEV';
if (isDev) await seedTestAccounts();
if (isDev && isTestAccount(id)) return loginAsTestAccount(id, pw);
```

编码注意：
- ❌ 不用 `NODE_ENV !== 'production'`（staging 误开）
- ❌ 不进迁移脚本、不进生产产物（构建期 define + DCE 剔除）
- ❌ `COZE_PROJECT_ENV` 不暴露给前端
- ❌ 不绕过限流/审计/风控以外的安全控件
- ✅ 非 DEV 检测到测试账号 → error 日志 + 拒绝启动
- ✅ 单测：PROD 下测试账号登录必须 401

**按 Tier 内置账号**（identifier 仅示例，密码强随机生成）：

| Tier | 账号 |
| --- | --- |
| T1 | `dev_user@coze.dev` |
| T2 | `dev_admin@coze.dev`(admin) / `dev_user@coze.dev`(user) |
| T3 | root / admin / auditor / user 各一；多租户加 `dev_tenantA_admin` / `dev_tenantB_admin` 验 scope |

**交付协议**：框架搭好后，对话中告知用户：① 所选 Tier + 账号 identifier ② 一次性随机密码明文（仅对话给，不写文件、不进 git）③ 仅 `COZE_PROJECT_ENV=DEV` 生效 ④ 启动方式 `export COZE_PROJECT_ENV=DEV` ⑤ 提示首次登录后旋转/删除。

## 14. 验收清单

**基础（任何 Tier）**：
- [ ] schema 已建，迁移可重复执行
- [ ] `CredentialProvider` 接口/registry 就绪，`dummy` provider 可挂入
- [ ] `SessionService` 完整：issue/refresh/resolve/revoke/revokeAll/list
- [ ] 中间件链跑通，`ctx.user_id` 业务侧可用
- [ ] 接口返回正确 401/403/统一错误
- [ ] 用 dummy provider 跑通 注册→登录→受保护接口→刷新→登出
- [ ] 前端 AuthStore + 路由守卫 + 401 拦截器接通
- [ ] 基础设施 stub 就位

**按 Tier**：
- [T1] `@RequireAuth` 拦截未登录；**无任何 role/permission 字段或分支**
- [T2] `users.role` 就位；`@RequireRole('admin')` 拦截；前端 `role` 接通
- [T3] RBAC 四表 + `@RequirePermission` + `permissions` + `hasPermission`；多租户 scope 隔离生效

**测试账号**：
- [ ] `COZE_PROJECT_ENV=DEV` 严格门控
- [ ] PROD 拒登单测已加
- [ ] 不在迁移脚本、不在生产产物
- [ ] 已通过对话告知凭据 + DEV 限制

框架通过后再按需 plug-in 具体登录方式，每种独立 PR / 独立测试。
