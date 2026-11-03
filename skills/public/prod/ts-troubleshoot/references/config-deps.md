# 配置与依赖缺失

> 依赖未安装或 tsconfig 配置不全导致的批量报错，通常可一次性修复。

---

## 通用闭环（先做这一步）

**判定特征**
- tsc/vue-tsc 的第一条报错是"找不到模块/类型/JSX 配置"（如 TS2307/TS17004/TS7026/TS2875），且往往同类错误成片出现
- 报错与 `tsconfig.json`、类型声明、依赖安装强相关

**最小修复步骤（通用）**
1. 确认执行目录：monorepo 里在错的目录跑 tsc 会导致"找不到模块/类型"假象
2. 优先修第一条错误码（同类会级联消失）
3. 涉及别名时同时检查三处：`tsconfig.json` 的 `paths`、构建工具 alias（Vite/Next）、ESLint resolver（若也报 import/no-unresolved）

> **防止"修了 A 引入 B"**：补 import 或改路径时，先确认目标模块/导出**真实存在**。TS2304/TS2305/TS2307 是引用缺失的三兄弟，修一个时注意另外两个是否连带解决。

**复跑验证**
- 复跑触发该错误的同一条命令：`npx tsc --noEmit` / `pnpm ts-check`
- 目标：同类错误数量明显下降，或从"配置/依赖缺失"变为少量真实类型错误

**仍失败时需要补充**
- 报错的第一条错误全文 + 触发命令与执行目录
- 相关配置片段：`tsconfig.json`、`package.json` scripts、（如有）`vite.config.*` / `next.config.*`

---

## TS7026 — JSX 元素隐式 any

**报错**：`JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.`

**根因**：`@types/react` 未安装或版本不匹配

**修复**
```bash
pnpm add -D @types/react @types/react-dom
```

---

## TS17004 — 缺少 --jsx 标志

**报错**：`Cannot use JSX unless the '--jsx' flag is provided.`

**修复**
```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

---

## TS2875 — react/jsx-runtime 缺失

**报错**：`This JSX tag requires the module path 'react/jsx-runtime' to exist.`

**修复**
```bash
pnpm add -D @types/react@latest @types/react-dom@latest
```

---

## TS2307 — 找不到模块

**报错**：`Cannot find module 'xxx' or its corresponding type declarations.`

### 子场景 A：npm 包未安装

**高频缺失包**：`react`, `next/server`, `lucide-react`, `class-variance-authority`, `next`, `@radix-ui/*`, `sonner`, `axios`

**修复**
```bash
pnpm add <missing-package>
# 纯类型包：pnpm add -D @types/<package>
```

### 子场景 B：路径别名 `@/` 未配置

**修复**
```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### 子场景 C：Vue SFC 类型声明缺失

**修复**：创建类型声明文件
```typescript
// src/shims-vue.d.ts
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
```

### 子场景 D：CSS/资源文件类型声明缺失

**修复**
```typescript
// src/types/assets.d.ts
declare module '*.css' {}
declare module '*.scss' {}
declare module '*.svg' { const src: string; export default src; }
declare module '*.png' { const src: string; export default src; }
```

---

## TS2304 — 找不到名称

**报错**：`Cannot find name 'xxx'.`

### 子场景 A：SQL 函数写入 TS

**高频**：`gen_random_uuid`, `now`, `current_timestamp`

**修复**
```typescript
// ❌ Bad
values({ id: gen_random_uuid() })

// ✅ Good
import { sql } from 'drizzle-orm';
values({ id: sql`gen_random_uuid()` })
```

### 子场景 B：测试全局未声明

**高频**：`expect`, `describe`, `it`, `test`, `beforeEach`

**修复**
```bash
pnpm add -D @types/jest
# 或 tsconfig.json: { "compilerOptions": { "types": ["vitest/globals"] } }
```

### 子场景 C：组件/工具未 import

**高频**：`Button`, `Badge`, `Label`, `Link`, `TableCell`, `SelectItem`, `int`, `varchar`

**修复**：在使用前添加对应的 import 语句（或改成正确的导入来源/命名）

---

## TS2305 — 模块无导出成员

**报错**：`Module '"xxx"' has no exported member 'YYY'.`

**常见根因**
- import 了不存在的导出成员
- API 变更后旧名称失效
- 拼写错误
- 从错误的包中导入

**修复**
1. 在该包的类型声明/文档中确认实际导出（或在 IDE 自动补全中查）
2. 修正 import 名称，或换成正确的导入来源（default vs named export）
