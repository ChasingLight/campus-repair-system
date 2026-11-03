# 类型系统错误

> 代码语法正确、依赖完整，但类型系统报错。这是产物生成阶段最高频的错误类别（占 TS 错误总量近 50%）。修复时**必须先 read_file 获取报错文件的上下文代码和相关类型定义**。
>
> **注意**：TS2339 是最容易反复修不好的类型错误。最常见的失败原因是"修了 TS2339 又引入 TS2304 或 TS1005"。修复时必须遵守下方的"防止恶性循环"规则。

---

## 防止恶性循环（修了 A 引入 B）

> 修复类型错误时最常见的失败模式是"修了旧错引入新错"。以下是最高频的恶性循环路径：
>
> - TS2339（属性不存在）↔ TS2304（变量找不到）：频繁互相转化
> - TS2339 ↔ TS1005（缺符号）：频繁互相转化
> - TS2304 ↔ TS2322（类型不兼容）：频繁互相转化

**防护原则：**
1. **修一个属性/变量名时，先搜索全文引用**：改了定义处，使用处也要同步改
2. **补 import 时确认模块和导出真实存在**：不要凭记忆写 import，先 read_file 目标模块
3. **修类型标注时不要破坏语法结构**：加 `: Type` 时检查周围的括号/逗号是否受影响
4. **同文件多个同类错误必须一次性批量修复**，不要逐条修一个跑一次

---

## 通用闭环（先做这一步）

**判定特征**
- tsc 输出的错误码为 TS2339/TS2322/TS7006/TS2345
- 不是语法错误（代码能解析）也不是配置问题（模块/配置都正常），而是"类型对不上"

**修复前必做**
1. `read_file` 读取报错文件，获取报错行 ±30 行上下文
2. 如果报错涉及自定义类型（如 `type 'UserProfile'`），找到并读取该类型的 interface/type 定义
3. 同一文件的同类错误**批量修复**，不要逐条修一个跑一次

**复跑验证**
- 复跑 `npx tsc --noEmit` / `pnpm ts-check`
- 目标：同类错误数下降。如果修复引入了新错误，检查是否改错了类型方向

**仍失败时需要补充**
- 报错文件中相关的 interface/type 定义全文
- `tsconfig.json` 的 `strict` / `noImplicitAny` 等配置

---

## TS2339 — 属性不存在（最高频，占 11.66%）

**报错**：`Property 'xxx' does not exist on type 'yyy'.`

> **反复修不好的根因**：模型不读类型定义就凭记忆猜属性名，改了一个又猜错另一个。**修复前必须先读取目标类型的 interface 定义。**

按 `type 'yyy'` 分子场景：

### 子场景 A：on type `{}` — 空对象未标注类型

**高频场景**：`useState({})`、`const data = {}`

**根因**：空对象字面量被推断为 `{}`，TS 认为上面没有任何属性。

**修复**
```typescript
// ❌ Bad — data 被推断为 {}
const [data, setData] = useState({})
data.name  // TS2339: Property 'name' does not exist on type '{}'

// ✅ Good — 显式标注类型
interface UserProfile { name: string; email: string }
const [data, setData] = useState<UserProfile>({ name: '', email: '' })

// ✅ Good — 允许 null 初始状态
const [data, setData] = useState<UserProfile | null>(null)
```

### 子场景 B：on type `never` — 数组初始化推断为 never[]

**高频场景**：`useState([])`、`const list = []`

**修复**
```typescript
// ❌ Bad
const [items, setItems] = useState([])
items[0].name  // TS2339: Property 'name' does not exist on type 'never'

// ✅ Good
const [items, setItems] = useState<Product[]>([])
```

### 子场景 C：on type `HTMLElement` — DOM 元素类型不够具体

**高频属性**：`value`、`srcdoc`、`contentWindow`、`checked`

**修复**
```typescript
// ❌ Bad
const el = document.getElementById('myInput')
el.value = 'test'  // TS2339: Property 'value' does not exist on type 'HTMLElement'

// ✅ Good — 用 as 断言为具体子类
const el = document.getElementById('myInput') as HTMLInputElement
el.value = 'test'
```

常用 DOM 子类速查：
| 属性 | 需要的类型 |
|------|-----------|
| `value`, `checked`, `files` | `HTMLInputElement` |
| `value` (textarea) | `HTMLTextAreaElement` |
| `value` (select) | `HTMLSelectElement` |
| `srcdoc`, `contentWindow` | `HTMLIFrameElement` |
| `getContext()` | `HTMLCanvasElement` |
| `play()`, `pause()` | `HTMLVideoElement` / `HTMLAudioElement` |

### 子场景 D：on type `Window & typeof globalThis` — 访问 window 自定义属性

**修复**
```typescript
// ❌ Bad
window.myApp = { version: '1.0' }

// ✅ Good — 声明全局类型
declare global {
  interface Window {
    myApp: { version: string }
  }
}
window.myApp = { version: '1.0' }
```

### 子场景 E：on type `ImportMeta` — Vite 环境变量

**修复**
```typescript
// ❌ Bad
const apiUrl = import.meta.env.VITE_API_URL  // TS2339

// ✅ Good — 创建 src/env.d.ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL: string
}
```

### 子场景 F：自定义类型缺少属性

**根因**：interface 定义和实际使用不一致（生成代码时定义了 interface 但遗漏了某些属性）。

**修复**：读取 interface 定义，补全缺失的属性字段。

---

## TS2322 — 类型不可赋值（占 6.12%）

**报错**：`Type 'xxx' is not assignable to type 'yyy'.`

### 子场景 A：`string | null` → `string`（最高频）

**高频来源**：`localStorage.getItem()`、`searchParams.get()`、`document.getElementById()`、`Array.find()`

**修复（三选一）**
```typescript
// ❌ Bad
const token: string = localStorage.getItem('token')  // TS2322

// ✅ 默认值
const token: string = localStorage.getItem('token') ?? ''

// ✅ 非空断言（确信存在时）
const token: string = localStorage.getItem('token')!

// ✅ 条件守卫
const raw = localStorage.getItem('token')
if (raw !== null) {
  doSomething(raw)  // raw 在此分支中是 string
}
```

### 子场景 B：联合类型 → 单一类型

**修复**：用类型守卫窄化
```typescript
// ❌ Bad
const result: SuccessResult = apiCall()  // 返回 SuccessResult | ErrorResult

// ✅ Good — 窄化后赋值
const response = apiCall()
if ('data' in response) {
  const result: SuccessResult = response
}
```

### 子场景 C：`string` → 字面量联合类型

**修复**：用 `as const` 或显式类型标注（见 TS2345 部分）。

---

## TS7006 — 参数隐式 any（占 5.40%）

**报错**：`Parameter 'xxx' implicitly has an 'any' type.`

**根因**：`tsconfig.json` 开启了 `strict` 或 `noImplicitAny`，回调/函数参数未标注类型。

### 高频模式速查

| 场景 | 修复 |
|------|------|
| `.map((item) => ...)` | `.map((item: Product) => ...)` |
| `.filter((x) => ...)` | `.filter((x: string) => ...)` |
| `.reduce((acc, cur) => ...)` | `.reduce((acc: number, cur: Item) => ..., 0)` |
| `onChange={(e) => ...}` | `onChange={(e: React.ChangeEvent<HTMLInputElement>) => ...}` |
| `onClick={(e) => ...}` | `onClick={(e: React.MouseEvent<HTMLButtonElement>) => ...}` |
| `onSubmit={(e) => ...}` | `onSubmit={(e: React.FormEvent<HTMLFormElement>) => ...}` |
| `onKeyDown={(e) => ...}` | `onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => ...}` |

### 批量修复技巧
同一文件多个 TS7006 时，先看上下文推断出各参数应有类型，一次性全部标注：
```typescript
// ❌ 同一文件中 5 个 TS7006
items.map((item) => ...)        // item: any
items.filter((item) => ...)     // item: any
items.sort((a, b) => ...)       // a: any, b: any

// ✅ 一次性修复 — 先确定 items 的类型（如 Product[]），然后所有回调自动推断
const items: Product[] = fetchItems()
items.map((item) => ...)        // item 自动推断为 Product
```

---

## TS2345 — 参数类型不匹配（占 4.95%）

**报错**：`Argument of type 'xxx' is not assignable to parameter of type 'yyy'.`

### 子场景 A：Literal type widening — `{ role: string }` 不兼容 `{ role: 'user' | 'assistant' }`

**修复（三选一）**
```typescript
// ❌ Bad — role 被推断为 string
const messages = [{ role: 'user', content: msg }]
sendChat(messages)  // TS2345

// ✅ as const — 最简洁
const messages = [{ role: 'user' as const, content: msg }]

// ✅ 显式类型标注
const messages: Message[] = [{ role: 'user', content: msg }]

// ✅ satisfies（TS 4.9+）
const messages = [{ role: 'user', content: msg }] satisfies Message[]
```

### 子场景 B：`string | undefined` → `string`

**修复**
```typescript
// ❌ Bad
const id = searchParams.get('id')  // string | null
fetchUser(id)  // TS2345

// ✅ Good
const id = searchParams.get('id')
if (id) {
  fetchUser(id)  // id 窄化为 string
}

// ✅ 或用 ?? 提供默认值
fetchUser(id ?? 'default')
```

### 子场景 C：`never[]` 的 push

**修复**
```typescript
// ❌ Bad
const results = []
results.push({ name: 'test' })  // TS2345

// ✅ Good
const results: Result[] = []
results.push({ name: 'test' })
```

### 子场景 D：`IncomingHttpHeaders` → `Record<string, string>`

**修复**
```typescript
// ❌ Bad
const headers = req.headers
callApi({ headers })  // TS2345

// ✅ Good — 提取需要的字段
const headers: Record<string, string> = {
  'content-type': req.headers['content-type'] ?? '',
  'authorization': req.headers['authorization'] ?? '',
}
```

---

## 修复原则总结

1. **先 read_file 再修**：类型错误不能盲修，必须先读取报错文件的代码上下文和相关类型定义
2. **同文件批量修复**：同一文件的多个同类错误合并为一次 edit_file，避免逐条修复引入新冲突
3. **优先修变量声明处**：很多 TS2339/TS7006 的根因在变量声明（如 `useState({})`），修好声明处后下游错误自动消失
4. **类型标注优于类型断言**：优先用 `: Type` 标注，其次用 `as const`，最后才用 `as Type`（断言可能掩盖真实错误）
5. **修复后验证**：修复 → 重新 `pnpm ts-check` → 如有新错再修 → 最多 3 轮
