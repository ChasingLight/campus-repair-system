# Lint 错误（ESLint）

> ESLint 规则违反属于代码质量问题。优先跑 `eslint --fix` 自动修复格式类错误，再手动处理需要理解语义的规则。
>
> **注意**：React Hooks 相关规则（purity/immutability/set-state-in-effect/rules-of-hooks/exhaustive-deps 等）已独立到 `react-hooks.md`，本文档不再覆盖。

---

## 先跑自动修复

在逐条分析之前，先执行一次自动修复，可消除大量格式类错误：

```bash
pnpm lint --fix
```

`--fix` 可自动修复的规则包括：`indent`、`semi`、`quotes`、`comma-dangle`、`no-trailing-spaces`、`eol-last`、`@typescript-eslint/no-unused-vars`（仅删除 import）等。

**修复后仍有报错才需逐条分析。**

---

## no-unused-vars / @typescript-eslint/no-unused-vars — 未使用的变量

**报错**：`'xxx' is defined but never used.`

**修复**：
- 删除未使用的 import 或变量声明
- 函数参数如果是回调签名要求的，前缀加 `_`（如 `_event`）
- 解构中不需要的字段用 rest 跳过：`const { unused, ...rest } = obj`

```typescript
// ❌ Bad
import { Button, Card } from './components'; // Card 未使用
const data = fetchData();                    // data 未使用

// ✅ Good
import { Button } from './components';
fetchData();
```

**可自动修复**：部分（`--fix` 可移除未使用的 import，但不会删除变量声明）

---

## import/no-unresolved — 模块路径无法解析

**报错**：`Unable to resolve path to module 'xxx'.`

**修复**：

**场景 A — 包未安装**：`pnpm add <package>`

**场景 B — 路径别名未配置**：安装 `eslint-import-resolver-typescript`
```bash
pnpm add -D eslint-import-resolver-typescript
```
```json
// .eslintrc.json
{
  "settings": {
    "import/resolver": {
      "typescript": {
        "alwaysTryTypes": true
      }
    }
  }
}
```

---

## @typescript-eslint/no-explicit-any — 禁止显式 any

**报错**：`Unexpected any. Specify a proper type annotation.`

**修复**：
- 用具体类型替换 `any`
- 不确定类型时用 `unknown` 代替 `any`，在使用时做类型收窄

```typescript
// ❌ Bad
function handle(data: any) { ... }

// ✅ Good
function handle(data: unknown) {
  if (typeof data === 'string') { ... }
}
// 或使用具体接口
function handle(data: UserData) { ... }
```

---

## Parsing error — ESLint 解析失败

**报错**：`Parsing error: Unexpected token` / `Parsing error: 'xxx' expected`

**根因**：ESLint 使用的 parser 无法解析文件语法。

**修复**：

**场景 A — TypeScript 项目缺少 parser**
```bash
pnpm add -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
```
```json
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "ecmaFeatures": { "jsx": true }
  }
}
```

**场景 B — Vue 项目**
```bash
pnpm add -D vue-eslint-parser
```
```json
{
  "parser": "vue-eslint-parser",
  "parserOptions": {
    "parser": "@typescript-eslint/parser"
  }
}
```

---

## no-restricted-syntax — 禁止的语法模式

**报错**：`Using 'xxx' is not allowed.`

**修复**：查看项目 `.eslintrc` 中的 `no-restricted-syntax` 配置，了解具体禁止了什么语法，按项目约定调整代码。

---

## @next/next/no-html-link-for-pages — 应使用 Next.js Link

**报错**：`Do not use an \`<a>\` element to navigate to \`/xxx\`. Use \`<Link />\` from \`next/link\` instead.`

**修复**
```typescript
// ❌ Bad
<a href="/about">About</a>

// ✅ Good
import Link from 'next/link'
<Link href="/about">About</Link>
```

---

## @next/next/no-img-element — 应使用 Next Image

**报错**：`Using \`<img>\` could result in slower LCP and higher bandwidth. Consider using \`<Image />\` from \`next/image\`.`

**修复**
```typescript
// ❌ Bad
<img src="/photo.jpg" alt="photo" />

// ✅ Good
import Image from 'next/image'
<Image src="/photo.jpg" alt="photo" width={400} height={300} />
```

---

## 配置问题 — ESLint 本身无法启动

**报错**：`ESLint couldn't find the config "xxx"` / `Failed to load plugin 'xxx'`

**修复**：
```bash
# 根据报错安装缺失的包
pnpm add -D eslint-config-<name>
# 或
pnpm add -D eslint-plugin-<name>
```

常见缺失组合：
| extends / plugin | 需安装 |
|------------------|--------|
| `plugin:react/recommended` | `eslint-plugin-react` |
| `plugin:@typescript-eslint/recommended` | `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` |
| `plugin:vue/vue3-recommended` | `eslint-plugin-vue` |
| `prettier` | `eslint-config-prettier` |
| `next/core-web-vitals` | `eslint-config-next` |
