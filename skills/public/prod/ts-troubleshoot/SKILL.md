---
name: ts-troubleshoot
description: 产物代码自检阶段 tsc/lint/build 报错且模型自身无法给出有效修复建议时加载。覆盖 TS 类型错误（TSxxxx）、ESLint 规则违反、语法解析错误和构建失败。
---

# TS Troubleshoot — TypeScript/ESLint 报错修复方案库

## 概述

产物代码自检阶段（tsc/lint/build）报错且模型自身无法给出有效修复建议时的修复方案库。覆盖三个检查阶段：

1. **静态检查**（`pnpm ts-check` + `pnpm lint`）
2. **接口烟测**（`smoke_test`）
3. **服务探活**（`service_probe`）

## 输出格式（必须）

按下面结构输出，避免发散：
1. **阶段判定**：静态检查 / 烟测 / 探活（给出依据：命令名/错误码/关键词）
2. **错误分类**：匹配下方路由表，确定参考文件
3. **根因**：一句话
4. **修复步骤（最小闭环）**：1-5 步可执行命令或改动点
5. **复跑验证**：给出用户应复跑的同一条命令
6. **仍失败时需要补充的信息**：列出缺失项（不要泛泛要"更多日志"）

## 修复铁律（六条，必须遵守）

> 反复失败中最常见的模式是"修了旧错引入新错"，以下规则是防止恶性循环的关键。

1. **先修最上游错误**：同文件第一条错误是后续级联错误的根因，只修第一条再复跑
2. **读类型再动手**：TS2339/2322/2345 修复前**必须先 read_file 获取目标类型定义**，不要凭记忆猜属性名
3. **同文件批量修**：同一文件的多个错误合并为一次 edit_file，逐条修会引入新错
4. **React Hooks 规则零容忍**：purity/immutability/setState-in-effect 不要试图"绕过"，必须按 `react-hooks.md` 中的正确模式重写
5. **JSX 写完必检查配对**：每个 `<Tag>` 确认有 `</Tag>`，每个 `{` 确认有 `}`
6. **import 先查再写**：TS2304/2305/2307 修复前先确认模块/导出是否真实存在，不要凭记忆补 import

## 错误路由表

> 按修复难度排序（最难修的排最前）。匹配到对应特征后，打开参考文件按步骤修复。

### 第一梯队：顽固错误（高频且难以自修复）

| 匹配特征 | 参考文件 | 一句话策略 |
|----------|---------|-----------|
| `react-hooks/purity` 或 `Math.random is an impure function` 或 `Date.now is an impure function` | `references/react-hooks.md` | 非纯调用移入 useState 初始化器或 useEffect |
| `react-hooks/set-state-in-effect` 或 `Calling setState synchronously within an effect` | `references/react-hooks.md` | 用派生计算替代 effect + setState，异步回调中 setState 是允许的 |
| `react-hooks/immutability` | `references/react-hooks.md` | 展开运算符创建新对象/数组，禁止就地修改 |
| `react-hooks/static-components` | `references/react-hooks.md` | 组件定义提到模块顶层，不要嵌套在其他组件内 |
| `react-hooks/preserve-manual-memoization` | `references/react-hooks.md` | useMemo/useCallback 内只做纯计算，不含副作用 |
| `Cannot access variable before it is declared` | `references/react-hooks.md` | 调整声明顺序，Hooks 和变量先声明后使用 |
| `react-hooks/rules-of-hooks` | `references/react-hooks.md` | Hook 只在组件顶层调用，不在条件/循环中 |
| `react-hooks/exhaustive-deps` | `references/react-hooks.md` | 补全依赖数组，或用 useMemo 稳定引用 |

### 第二梯队：TS 类型错误（修复前需先读取类型定义）

| 匹配特征 | 参考文件 | 一句话策略 |
|----------|---------|-----------|
| `TS2339` Property does not exist | `references/ts-types.md` | **先读类型定义**，确认实际属性名再修 |
| `TS2345` Argument type mismatch | `references/ts-types.md` | 用 `as const`、类型标注或类型守卫 |
| `TS2322` Type not assignable | `references/ts-types.md` | null check（`?? ''`）或类型守卫窄化 |
| `TS7006` Parameter implicitly any | `references/ts-types.md` | 标注参数类型，或标注源数组类型让回调自动推断 |
| `TS2304` Cannot find name | `references/config-deps.md` | 检查 import 是否缺失，或变量是否拼写错误 |
| `TS2305` No exported member | `references/config-deps.md` | 确认模块实际 export 列表，修正导入名 |
| `TS2307` Cannot find module | `references/config-deps.md` | 安装依赖或修正 import 路径/别名 |

### 第三梯队：语法解析错误（基础但容易反复）

| 匹配特征 | 参考文件 | 一句话策略 |
|----------|---------|-----------|
| `TS1005` `;`/`}`/`,` expected | `references/syntax-parse.md` | 只看第一条报错，向上回溯找未闭合的括号/模板字符串 |
| `TS17008`/`TS17002` JSX closing tag | `references/syntax-parse.md` | 逐层检查开/闭标签配对 |
| `TS1381` Unexpected token in JSX | `references/syntax-parse.md` | JSX 中 `}` 需写成 `{'}'}` 或 `&rbrace;` |
| `TS1127` Invalid character | `references/syntax-parse.md` | 全角标点替换为半角 |
| `TS1128` Declaration expected | `references/syntax-parse.md` | 检查多余的 `}` |
| `TS1109` Expression expected | `references/syntax-parse.md` | JSX `{}` 内不能写 `if`/`for`，改用三元/`.map()` |

### 第四梯队：配置与依赖

| 匹配特征 | 参考文件 | 一句话策略 |
|----------|---------|-----------|
| `TS7026`/`TS17004`/`TS2875` JSX 相关 | `references/config-deps.md` | `pnpm add -D @types/react @types/react-dom` + tsconfig jsx |
| 大量 `TS2307` 指向 `@/` 路径 | `references/config-deps.md` | 配置 tsconfig paths + 构建工具 alias |
| ESLint 规则违反（非 react-hooks） | `references/lint-rules.md` | 先跑 `pnpm lint --fix`，再手动修剩余 |
| Parsing error | `references/lint-rules.md` | 安装 `@typescript-eslint/parser` |
| ESLint config/plugin 缺失 | `references/lint-rules.md` | 安装缺失的 eslint-config/plugin 包 |

### 第五梯队：构建错误

| 匹配特征 | 参考文件 | 一句话策略 |
|----------|---------|-----------|
| `Failed to resolve import` / `Module not found` | `references/build.md` | 安装依赖或配置构建工具 alias |
| `pnpm build` 中的 Type error | `references/build.md` | 本质是 tsc 错误，参考 ts-types.md |
| `out of memory` / `heap` | `references/build.md` | `NODE_OPTIONS="--max-old-space-size=4096"` |
| PostCSS / Tailwind 缺失 | `references/build.md` | `pnpm add -D tailwindcss postcss autoprefixer` |

## 快速修复速查

> 无需打开参考文件的最高频场景。

### 1. React Hooks purity（Math.random / Date.now）
```typescript
// ❌ render 中直接调用
const id = Math.random().toString(36).slice(2);

// ✅ useState 初始化器
const [id] = useState(() => Math.random().toString(36).slice(2));
```

### 2. React Hooks immutability（直接修改 state）
```typescript
// ❌ 直接修改
items.push(newItem); setItems(items);

// ✅ 创建新数组
setItems([...items, newItem]);
```

### 3. React Hooks setState-in-effect
```typescript
// ❌ useEffect 内同步 setState
useEffect(() => { setTotal(items.reduce(...)); }, [items]);

// ✅ 直接计算派生值（不需要 effect）
const total = useMemo(() => items.reduce(...), [items]);
```

### 4. TS2339 — useState 未标注类型
```typescript
// ❌ 推断为 {}
const [data, setData] = useState({})

// ✅ 显式标注
const [data, setData] = useState<UserProfile | null>(null)
```

### 5. TS7006 — 回调参数隐式 any
```typescript
// ❌
items.map((item) => ...)

// ✅ 标注源数组类型，回调自动推断
const items: Product[] = fetchItems()
items.map((item) => ...)  // item 自动推断为 Product
```

### 6. TS2322 — string | null 赋给 string
```typescript
// ❌
const token: string = localStorage.getItem('token')

// ✅
const token: string = localStorage.getItem('token') ?? ''
```

### 7. TS2345 — 字面量类型 widening
```typescript
// ❌ role 推断为 string
const msg = [{ role: 'user', content: text }]

// ✅ as const
const msg = [{ role: 'user' as const, content: text }]
```

### 8. TS2307 — 路径别名未配置
```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### 9. TS7026/TS17004 — JSX 类型/配置缺失
```bash
pnpm add -D @types/react @types/react-dom
```
确认 `tsconfig.json` 中存在 `"jsx": "react-jsx"`。

### 10. ESLint 大量格式错误 — 先自动修复
```bash
pnpm lint --fix
```

## 需要的输入

- 完整报错输出（至少包含：文件路径、行列号、错误码/规则名、错误信息）
- 使用的具体命令（`npx tsc --noEmit` / `pnpm lint` / `pnpm build` 等）
- 若是 monorepo，补充执行命令与执行目录
- 若涉及 JSX / 模块解析 / 路径别名，补充 `tsconfig.json` 相关片段
- 若是构建失败，补充构建工具及版本（查看 `package.json` 中的 build script 确认底层工具）

## 当错误码不在表里

- 先按报错文本判断大类：语法/解析 → `syntax-parse.md`、类型错误 → `ts-types.md`、模块/依赖 → `config-deps.md`、ESLint 规则 → `lint-rules.md` 或 `react-hooks.md`、构建 → `build.md`
- 如果同一个文件同一行反复报错，优先修"最上游"的错误（通常是第一条）
- 若大量报错来自 `node_modules`，优先检查 tsconfig 的 `include/exclude` 与依赖版本兼容性
- 语法和配置错误可能导致类型错误和构建失败的级联，务必从上游开始修
