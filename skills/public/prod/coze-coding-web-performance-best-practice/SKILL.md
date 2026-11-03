---
name: coze-coding-web-performance-best-practice
description: 性能最佳实践
---

# Web 性能优化 Skills

## 1. 减少重绘与重排

- 使用 CSS class 切换代替逐属性修改样式
- 使用 `transform`/`opacity` 做动画，不用 `left`/`top`/`width`/`height`
- DOM 读写分离，避免布局抖动（先批量读再批量写）
- 频繁变化元素加 `will-change: transform`，动画结束后移除
- 使用 `contain: layout style paint` 限制重排/重绘范围
- 动画用 `requestAnimationFrame`，不用 `setTimeout`/`setInterval`

## 2. 首屏加载优化

- 内联首屏关键 CSS，非关键 CSS 延迟加载
- JS 使用 `defer`/`async`，非首屏脚本用动态 `import()`
- 首屏 LCP 图片加 `fetchpriority="high"`，禁止懒加载
- 非首屏图片加 `loading="lazy"`
- 使用 `preconnect`/`preload`/`prefetch` 优化资源加载时序
- 图片使用 WebP/AVIF 格式，带 `<picture>` fallback

## 3. 运行时性能

- 长任务（>50ms）拆分，保持 INP ≤ 200ms
- 长列表使用虚拟滚动，仅渲染可视区域 DOM
- 高频事件（scroll/resize/input）做防抖/节流
- CPU 密集计算移至 Web Worker

## 4. CLS 优化

- 所有图片/视频设置 `width`/`height` 或 `aspect-ratio`
- 字体用 `font-display: swap` + `size-adjust`
- 动态内容预留空间（`min-height` + `contain: layout`）
- 避免在视口顶部动态插入内容

## 5. Nextjs 优化

- 通过 `ReactDOM.preconnect`, `ReactDOM.preload`, `ReactDOM.prefetch` 优化资源加载时序
- 三方 CSS、字体等资源可在 `globals.css` 中顶部 (**@import 'tailwindcss' 之前**) 通过 `@import` 引入，或者使用 next/font，不要在 `head` 中引入，否则会导致 hydrate 问题。

## 6. 外部资源域名地域适配（CN 优先使用官方 .cn 域）

为避免跨境链路带来的高时延与间歇性失败，第三方资源域名需按访问区域选择最优可达域。

- 原则
  - 根据访问区域选择官方提供的区域域名或镜像；在中国大陆环境优先使用官方 .cn 域。
  - 仅使用官方域或自有 CDN 代理，谨慎使用来历不明的第三方镜像，确保稳定性与合规性。
  - 对不同区域的域名选择做成可配置（构建期或运行时），避免硬编码。

### 域名映射表

| 资源类型         | 全球域名               | 中国大陆域名          | 备注       |
| ---------------- | ---------------------- | --------------------- | ---------- |
| Google Fonts CSS | `fonts.googleapis.com` | `fonts.googleapis.cn` | 字体样式表 |

## ✅ 正例 vs ❌ 反例

### 使用 CN 环境字体域名，不要使用全球域名

**❌ 反例：CN 环境仍使用全球域名**

```
https://fonts.googleapis.com
https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap
```

**✅ 正例：CN 环境使用官方 `.cn` 域名**

```
https://fonts.googleapis.cn
https://fonts.googleapis.cn/css2?family=Inter:wght@400;600&display=swap"
```

### Nextjs 不要通过 head 进行资源优化，会导致 hydrate 问题

**✅ 正例：通过 globals.css 和 ReactDOM 优化资源加载时序**

```css
@import "https://fonts.googleapis.cn/css2?family=Inter:wght@400;600&display=swap";
@import "tailwindcss";
```

```tsx
// components/font-preload.tsx
"use client";
export function FontPreload() {
  ReactDOM.preconnect("https://fonts.googleapis.cn");
  ReactDOM.preconnect("https://fonts.gstatic.cn");
  return null;
}

// layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <FontPreload />
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
```
