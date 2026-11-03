# 构建错误

> 构建阶段（`pnpm build`）失败。按构建工具分场景诊断。注意：构建通常先跑类型检查，类型错误应先查 `ts-types.md`。

---

## Vite

### Failed to resolve import — 模块解析失败

**报错**：`[vite] Internal server error: Failed to resolve import "xxx" from "src/yyy.ts". Does the file exist?`

**根因**：npm 包未安装、路径别名未配、文件路径大小写不匹配

**修复**：

**场景 A — 包未安装**
```bash
pnpm add <package>
```

**场景 B — 路径别名未配置**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**场景 C — 大小写不匹配**
macOS 文件系统不区分大小写，但 Linux CI 区分。检查 import 路径与实际文件名大小写是否一致。

---

### Rollup failed to resolve — external 依赖问题

**报错**：`[rollup] Could not resolve 'xxx' from 'src/yyy.ts'`

**修复**：
- 检查依赖是否在 `dependencies`（非仅 `devDependencies`）
- 对 Node.js 内置模块（`fs`、`path`、`crypto`），如果在浏览器环境使用，需要 polyfill
- 在 `vite.config.ts` 中通过 `build.rollupOptions.external` 排除不需要打包的依赖

---

### Pre-transform error — 插件处理失败

**报错**：`[vite] Pre-transform error: ...`

**修复**：
```bash
# Sass 缺失
pnpm add -D sass

# Less 缺失
pnpm add -D less
```

---

## Next.js

### pnpm build 类型错误（Next.js 项目）

**报错**：`Type error: ...`（pnpm build 输出）

**根因**：Next.js 的 `pnpm build` 默认会先跑 TypeScript 类型检查。这些错误本质是 tsc 错误。

**修复**：参考 `ts-types.md` 对应的 TS 错误码修复。修复后重新 `pnpm build`。

如果需要临时跳过类型检查以测试构建（不推荐长期使用）：
```javascript
// next.config.js
module.exports = {
  typescript: {
    ignoreBuildErrors: true,
  },
};
```

---

### Image Optimization 配置问题

**报错**：`Error: Invalid src prop on next/image` / `hostname "xxx" is not configured under images in next.config.js`

**修复**：
```javascript
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
      },
    ],
  },
};
```

---

### getStaticProps / getServerSideProps 类型错误

**修复**：确保返回 `{ props: { ... } }` 格式，并使用 Next.js 提供的类型：
```typescript
import type { GetStaticProps, GetServerSideProps } from 'next';

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: { data: ... },
  };
};
```

---

## 通用构建问题

### out of memory — Node.js 内存不足

**报错**：`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`

**修复**：
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm build
```

---

### PostCSS / Tailwind 配置缺失

**报错**：`[postcss] ... Cannot find module 'tailwindcss'`

**修复**：
```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

---

### ENOSPC / EMFILE — 文件系统限制

**报错**：`Error: ENOSPC: System limit for number of file watchers reached`

**修复**：
```bash
# Linux
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# macOS
ulimit -n 10240
```

---

### CSS @import 解析失败

**报错**：`[vite] [postcss] Failed to find 'xxx'` / `Can't resolve './xxx.css'`

**修复**：
- 检查 `@import` 路径是否正确
- Vite 中 CSS 的 `@import` 支持 `~` 前缀引用 node_modules，但不支持 tsconfig 的 `@/` 别名
- 若要在 CSS 中使用别名，需在 `vite.config.ts` 的 `css.preprocessorOptions` 中配置
