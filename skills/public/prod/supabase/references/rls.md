# Row Level Security (RLS) 策略配置

> **⚠️ 强制要求：所有表必须启用 RLS**
>
> 即使是公开数据表，也必须启用 RLS。未启用 RLS 的表可通过 anon key 直接读写所有数据，存在严重安全风险。

> **🔄 架构升级说明**
>
> 当前架构已做出以下变更：
> 1. **RLS 自动开启**：数据库触发器会在建表时自动执行 `ENABLE ROW LEVEL SECURITY`，无需手动操作（手动执行也无副作用，幂等操作）
> 2. **后端 Client 使用 service_role_key**：后端 client 已从 anon key 切换为 service_role_key，该 key 天然绕过 RLS
> 3. **场景 A（公开读写）不再需要创建 Policy**：使用 service_role_key 时，RLS 虽然开启但不会阻拦请求，无需配置任何 policy
>
> **存量项目迁移**：如果你的项目中 `supabase-client` 文件仍使用 anon key 初始化（检查 `getSupabaseClient()` 无 token 时是否 fallback 到 anon_key），请用最新模板文件覆盖：
> - TypeScript：重新复制 `supabase-client.ts` 模板到项目
> - Python：重新复制 `supabase_client.py` 模板到项目
>
> 新版 client 无 token 时优先使用 service_role_key，确保后端操作不受 RLS 限制。

## 配置前决策流程

配置 RLS 前，按顺序完成以下判断：

### 步骤零：确认 Client 使用 service_role_key

在用户项目中查找 `supabase-client.ts` 或 `supabase_client.py` 文件，用以下方式机械判定：

**TypeScript 项目**：在 `supabase-client.ts` 中搜索关键字 `COZE_SUPABASE_SERVICE_ROLE_KEY`
**Python 项目**：在 `supabase_client.py` 中搜索关键字 `COZE_SUPABASE_SERVICE_ROLE_KEY`

```
找到 COZE_SUPABASE_SERVICE_ROLE_KEY → 新版 client，继续步骤一
未找到（或文件中仅出现 COZE_SUPABASE_ANON_KEY）→ 旧版 client，必须先用最新模板覆盖项目中的 client 文件，再继续
```

> **为什么必须检查**：新版 client 后端使用 service_role_key 绕过 RLS，场景 A 无需创建 policy。旧版 client 仅使用 anon key，受 RLS 约束——如果按新版配置（不创建 policy）会导致所有操作被拒绝。

### 步骤一：确认项目是否有登录功能

在项目代码中搜索以下关键字，**命中任一即视为有 Auth**：

**TypeScript**：`signInWithPassword`, `signInWithOAuth`, `signUp`, `auth.getSession`, `auth.getUser`, `onAuthStateChange`
**Python**：`sign_in_with_password`, `sign_in_with_oauth`, `sign_up`, `auth.get_session`, `auth.get_user`

```
命中任一关键字 → 有 Auth，继续步骤二
全部未命中 → 无 Auth，直接使用场景 A（公开读写）
```

> **关键**：无登录功能时，`auth.role()` 始终返回 `anon`，`auth.uid()` 始终返回 `NULL`。使用场景 B/C/D 会导致操作失败或数据不可见。

### 步骤二：确定数据归属类型

仅在项目已实现 Auth 时考虑：

| 数据归属 | 场景 | 示例 |
|:--|:--|:--|
| 所有人可读写 | A | 公告板、公共配置 |
| 所有人可读，登录用户可写 | B | 博客文章、商品展示 |
| 仅登录用户可读写 | C | 内部数据、会员内容 |
| 用户仅能操作自己的数据 | D | 订单、日记、私人设置 |

### 步骤三：场景 D 额外检查

选择场景 D 时，确认：
- 表中存在 `user_id` 字段
- `user_id` 已设置 `default: auth.uid()`

## 常见误区

| 误区 | 错误思路 | 正确思路 |
|:--|:--|:--|
| 业务直觉覆盖技术约束 | 日记是私人的 → 用场景 D | 项目无 Auth → 只能用场景 A |
| 见 user_id 就用场景 D | Schema 有 user_id → 用场景 D | 先判断 Auth 状态，再决定策略 |
| 追求"最安全"策略 | 场景 D 最严格 → 默认用 D | 无 Auth 用 D → 操作全部失败 |

> **核心原则**：安全策略必须匹配项目能力。没有 Auth 系统就无法区分用户身份。

## 策略速查表

| 场景 | 说明 | 需要 Auth | 需要 user_id | 需要创建 Policy |
|:--|:--|:--:|:--:|:--:|
| A. 公开读写 | 所有人可读写 | ✗ | ✗ | ✗ |
| B. 公开读 + 登录写 | 所有人可读，登录用户可写 | ✓ | ✗ | ✓ |
| C. 仅登录用户 | 登录用户才能读写 | ✓ | ✗ | ✓ |
| D. 用户私有 | 用户只能操作自己的数据 | ✓ | ✓ | ✓ |

> 场景 A 不需要创建 policy：后端使用 service_role_key 天然绕过 RLS，无 policy 反而能阻断 anon key 的未授权访问。若项目仍使用旧版 anon key client，参见场景 A 的「旧版 client 兼容」附注。

**速记**：无 Auth = 场景 A（无需 policy），有 Auth 可选 B/C/D。

## 操作步骤

### 1. 启用 RLS

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

### 2. 创建策略（场景 B/C/D）

场景 A 使用 service_role_key 时**跳过此步**——只需步骤 1 即可。

场景 B/C/D 根据决策结果选择对应 SQL 模板执行。

> **幂等处理**：策略已存在时 `CREATE POLICY` 会报错，需先删除：
> ```sql
> DROP POLICY IF EXISTS "策略名称" ON table_name;
> CREATE POLICY "策略名称" ON table_name ...;
> ```

## 策略 SQL 模板

> **命名规范**：Policy 名称必须包含实际表名前缀（如 `posts_允许公开读取`）。模板中所有 `table_name` 都是占位符，**必须替换为实际表名**。
>
> **⚠️ 性能关键**：所有模板中的 `auth.uid()` 和 `auth.role()` 都已用 `(SELECT ...)` 包裹。这不是可选优化——不包裹时函数每行调用一次，百万行表上有 100x+ 性能差距。同时确保策略引用的字段（如 `user_id`）上有索引。

### 场景 A：公开读写

适用于无登录功能的项目或公开数据表。

> **⚠️ 执行前必须确认**：步骤零判定结果为「新版 client」（含 `COZE_SUPABASE_SERVICE_ROLE_KEY`）时，才可使用下方的"无需创建 policy"方案。如为旧版 client，必须使用本节末尾「旧版 client 兼容」中的 SQL。

使用 service_role_key 的后端 client 天然绕过 RLS，**只需确认 RLS 已启用，无需创建任何 policy**。

```sql
-- 确认 RLS 已启用（数据库触发器会自动开启，此处为双保险，幂等操作）
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- 无需创建任何 policy
-- service_role_key 绕过 RLS，所有操作正常执行
-- 同时，即使 anon key 泄露，因为没有 policy，anon 角色无法读写任何数据
```

> **安全优势**：RLS 开启但无 policy = anon 角色被完全阻断。即使 anon key 泄露，攻击者也无法通过它访问数据。

> **旧版 client 兼容（仅 anon key）**：如果步骤零判定为旧版 client 且暂时无法更新，需要为 anon 角色创建公开 policy 才能正常读写。创建以下 policy 后尽快迁移 client：
> ```sql
> ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
>
> CREATE POLICY "table_name_允许公开读取" ON table_name
>   FOR SELECT USING (true);
>
> CREATE POLICY "table_name_允许公开写入" ON table_name
>   FOR INSERT WITH CHECK (true);
>
> CREATE POLICY "table_name_允许公开更新" ON table_name
>   FOR UPDATE USING (true) WITH CHECK (true);
>
> CREATE POLICY "table_name_允许公开删除" ON table_name
>   FOR DELETE USING (true);
> ```
> 迁移到新版 client 后，删除以上 policy 即可。

### 场景 B：公开读 + 登录写

前提：项目已实现 Supabase Auth。

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_name_允许公开读取" ON table_name
  FOR SELECT USING (true);

CREATE POLICY "table_name_登录用户可写入" ON table_name
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "table_name_登录用户可更新" ON table_name
  FOR UPDATE USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "table_name_登录用户可删除" ON table_name
  FOR DELETE USING ((SELECT auth.role()) = 'authenticated');
```

### 场景 C：仅登录用户

前提：项目已实现 Supabase Auth。

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_name_登录用户可读" ON table_name
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "table_name_登录用户可写入" ON table_name
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "table_name_登录用户可更新" ON table_name
  FOR UPDATE USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "table_name_登录用户可删除" ON table_name
  FOR DELETE USING ((SELECT auth.role()) = 'authenticated');
```

### 场景 D：用户私有数据

前提：
1. 项目已实现 Supabase Auth
2. 表中包含 `user_id` 字段

**user_id 字段定义：**

TypeScript (Drizzle)：
```typescript
import { sql } from "drizzle-orm";
import { uuid } from "drizzle-orm/pg-core";

user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
```

Python (SQLAlchemy)：
```python
from sqlalchemy import text
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy.dialects.postgresql import UUID

user_id: Mapped[str] = mapped_column(
    UUID(as_uuid=False),
    nullable=False,
    server_default=text("auth.uid()")
)
```

> 使用 `auth.uid()` 作为默认值，Supabase 会在插入时自动填充当前用户 ID，防止客户端伪造。

**RLS 策略：**

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_name_用户读取自己的数据" ON table_name
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "table_name_用户插入自己的数据" ON table_name
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "table_name_用户更新自己的数据" ON table_name
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "table_name_用户删除自己的数据" ON table_name
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
```

## 常见错误示例

```sql
-- ❌ 错误 1：忘记启用 RLS（表完全开放，anon key 可直接读写）
CREATE TABLE posts (id serial PRIMARY KEY, title text);
-- 缺少：ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- ❌ 错误 2：使用 anon key 的旧版 client，启用 RLS 但无策略（所有操作被拒绝）
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
-- anon 角色无任何 policy 授权 → SELECT/INSERT/UPDATE/DELETE 全部失败

-- ❌ 错误 3：无 Auth 项目使用 auth.uid()
CREATE POLICY "用户私有" ON diaries
  FOR SELECT USING (auth.uid() = user_id);
-- auth.uid() 始终为 NULL，数据永远不可见

-- ❌ 错误 4：无 Auth 项目使用 auth.role() = 'authenticated'
CREATE POLICY "登录可写" ON posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- auth.role() 始终为 'anon'，写入永远失败

-- ❌ 错误 5：使用 service_role_key 时仍为场景 A 创建公开 policy
-- 功能不受影响，但为 anon 角色开放了不必要的权限，削弱了安全防线
CREATE POLICY "公开读写" ON diaries FOR SELECT USING (true);

-- ❌ 错误 6：auth.uid()/auth.role() 未用 (SELECT ...) 包裹（严重性能问题）
CREATE POLICY "用户私有" ON orders
  FOR SELECT USING (auth.uid() = user_id);
-- auth.uid() 每行调用一次，百万行表上有 100x+ 性能差距
-- ✅ 正确写法：USING ((SELECT auth.uid()) = user_id)

-- ✅ 正确：场景 A + service_role_key（只需启用 RLS，不创建 policy）
ALTER TABLE diaries ENABLE ROW LEVEL SECURITY;
-- RLS 开启 + 无 policy = anon 被完全阻断，service_role_key 正常绕过

-- ✅ 正确：场景 A + 旧版 anon key（必须创建公开 policy）
ALTER TABLE diaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公开读写" ON diaries FOR SELECT USING (true);
CREATE POLICY "公开写入" ON diaries FOR INSERT WITH CHECK (true);
```

## 自检清单

- [ ] 确认 client 文件使用 service_role_key（非 anon key），如未更新请先迁移
- [ ] 确认项目是否有 Auth
- [ ] 场景选择是否匹配 Auth 状态
- [ ] 无 Auth 项目是否仅使用场景 A
- [ ] 场景 A + service_role_key：确认只需启用 RLS，无需创建 policy
- [ ] 场景 A + 旧版 anon key：确认已创建公开 policy（并尽快迁移 client）
- [ ] 场景 D 是否已添加 user_id 字段
- [ ] 策略中 auth.uid()/auth.role() 是否用 (SELECT ...) 包裹
- [ ] user_id 列是否有索引
- [ ] 是否测试了数据读写操作
