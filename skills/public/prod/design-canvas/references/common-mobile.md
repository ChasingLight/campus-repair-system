# Mobile 公共设计规范

> 主 Agent 和子 Agent 共同遵守的 Mobile 端设计规范。

---

## 页面骨架

**宽度规范**：移动端页面必须自适应铺满视口宽度。禁止在 `<body>` 或页面级容器上设置 `max-w-*` + `mx-auto` 限宽。内容区通过 `px-4` 等 padding 控制间距。局部元素（弹窗、表单等）仍可按需使用 `max-w-*`。

```html
<body class="bg-background text-on-surface">

  <!-- 顶部 Header（二级页加返回按钮） -->
  <header class="bg-background sticky top-0 z-40 h-14 flex items-center justify-between px-4">
    <button class="w-10 h-10 flex items-center justify-center text-on-surface-variant rounded-full
                   hover:bg-surface-container active:bg-surface-container-high transition-colors">
      <i data-lucide="arrow-left" class="w-5 h-5"></i>
    </button>
    <h1 class="text-base font-semibold text-on-surface">页面标题</h1>
    <button class="w-10 h-10 flex items-center justify-center text-on-surface-variant rounded-full
                   hover:bg-surface-container transition-colors">
      <i data-lucide="ellipsis-vertical" class="w-5 h-5"></i>
    </button>
  </header>

  <!-- @main-content:start -->
  <main class="overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
    <!-- 页面内容 -->
  </main>
  <!-- @main-content:end -->

  <!-- 底部 TabBar（一级页专用） -->
  <nav class="fixed bottom-0 left-0 right-0 z-40 bg-surface
              flex justify-around items-center h-14 pb-[env(safe-area-inset-bottom)]">
    <a href="#" class="flex flex-col items-center gap-0.5 px-5 py-1.5 text-primary"
       aria-current="page">
      <i data-lucide="home" class="w-5 h-5"></i>
      <span class="text-[10px] font-bold tracking-wide">首页</span>
    </a>
    <a href="#" class="flex flex-col items-center gap-0.5 px-5 py-1.5 text-on-surface-variant
                       hover:text-on-surface transition-colors">
      <i data-lucide="search" class="w-5 h-5"></i>
      <span class="text-[10px] font-bold tracking-wide">发现</span>
    </a>
    <a href="#" class="flex flex-col items-center gap-0.5 px-5 py-1.5 text-on-surface-variant
                       hover:text-on-surface transition-colors">
      <i data-lucide="user" class="w-5 h-5"></i>
      <span class="text-[10px] font-bold tracking-wide">我的</span>
    </a>
  </nav>

  <script>lucide.createIcons();</script>
</body>
```

**一级页 vs 二级页**：
- **一级页**（TabBar 直达）：有底部 TabBar，**无**返回按钮
- **二级页**（详情、设置等）：有返回按钮，**无**底部 TabBar

**TabBar 出现条件**：TabBar 的本质是多个一级页面之间的切换器，仅当应用存在 **多个一级页面** 时才需要 TabBar。
- 如果整个应用只有 1 个一级页面（单页工具、单一功能应用等），**禁止**添加底部 TabBar——此时 `<main>` 也无需为 TabBar 预留 `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`，可改为 `pb-[env(safe-area-inset-bottom)]` 或按内容自然收尾

---

## 全局组件一致性

所有页面的全局组件必须保持完全一致的样式和结构：

| 组件 | 一致性要求 |
|-----|----------|
| **顶部导航栏 (Header)** | 高度、背景色、字体、图标位置在所有页面中完全一致 |
| **底部导航栏 (TabBar)** | 高度、背景色、图标样式、选中状态在所有页面中完全一致 |

**⚠️ 顶栏与内容区一体化（强制）**：
- Header 必须使用 `bg-background`（与 body 一致），**禁止使用 `bg-surface` 或其他与 body 不同的背景色**——现代移动端 App（微信、备忘录、小红书等）的顶栏和内容区之间没有视觉分隔，是无缝一体的
- **禁止在 Header 与 紧跟着的控件 之间 添加 `border-b` 分隔线**
- **Header 必须使用 `sticky top-0` 定位，禁止 `fixed`**

**TabBar 激活态**：根据当前页面设置对应 tab 项为激活态，添加 `aria-current="page"` 属性。选中项 `text-primary`，未选中 `text-on-surface-variant`。

**TabBar 设计原则**：
- 所有 Tab 项统一尺寸、间距和视觉权重
- 保持左右对称，特殊按钮只能放中间
- 标签数量建议奇数（3 或 5 个）
- 避免在导航型 TabBar 中混入操作型按钮

---

## 设计品质

以 Apple HIG 的呼吸感为主，吸收 M3 的色调系统——大圆角、充裕留白、内容浮在背景上的"卡片漂浮感"。

- 最小点击区域 48×48px

### Surface 色阶

- **background 应为极低饱和度的中性底色**，主题色彩通过 primary 和装饰元素体现
- **surface 色阶必须保持中性色调**，不要把 primary 的色相混入 surface 系统
- `surface-container` 是 Tonal Fill（输入框/搜索框背景色）的关键层，它必须与 background 有可感知的色差
- 相邻层级之间应有肉眼可感知但不突兀的明度差，整个 surface 体系应停留在接近 background 的明度区间

### 区域分割优先级

1. **背景色层级**——利用 surface 色阶进行区域分割（移动端屏幕小，色阶比 shadow 更轻盈）
2. **Shadow**——卡片式布局场景使用 `shadow-card` 区分浮层
3. **Ghost Borders**——低透明度边框（如 `border border-outline-variant/10`），适用于高密度数据列表

### Shadow 使用限制

- **禁止与 overflow:hidden 共存**：当卡片的直接父容器设置了 `overflow: hidden`（如左滑删除、轮播容器等），shadow 会被裁剪而不可见。此时必须降级为背景色层级（卡片用 `bg-surface-container-lowest` 与 `bg-background` 产生色差）或 Ghost Border（`border border-outline-variant/20`）

### 边框规则

- **⚠️ 禁止未弱化的实线 border**：如需使用边框，必须通过透明度弱化为 Ghost Borders（透明度 ≤ 30%，如 `border border-outline-variant/20`）

---

## 间距节奏

**间距要疏密有致，禁止全局等距**：
- **元素内部紧凑**：标题与副标题 `gap-1`，图标与文字 `gap-2`，表单 label 与 input `gap-1.5`
- **区块之间拉开**：不同功能区之间 `gap-6` ~ `gap-8`，section 之间用明显的间距跳变建立节奏
- **卡片内 padding 适度**：内容型卡片 `p-3` ~ `p-4`，不要一律 `p-6`
- **Feed 流/列表场景**：一屏应至少展示 3 条完整内容，卡片间距 `gap-3`

---

## 文字层级（4 级）

| 层级 | 用途 | 样式 | 颜色 |
|------|------|------|------|
| L1 | 页面大标题 | `text-xl font-bold` | `text-on-surface` |
| L2 | 卡片/列表标题 | `text-base font-semibold` | `text-on-surface` |
| L3 | 正文/描述 | `text-sm font-normal` | `text-on-surface` |
| L4 | 时间戳/辅助 | `text-xs font-normal` | `text-on-surface-variant` |

相邻层级之间必须有明显的视觉差异（字号差 ≥ 1 级或字重差 ≥ 1 级 + 颜色变化）。

---

## 表单元素样式（⚠️ CRITICAL）

所有表单元素统一使用背景色填充（Tonal Fill）：`border-none bg-surface-container rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/30`

✅ 推荐：无边框 + 背景色填充 + focus 时 ring 反馈
❌ 禁止：`bg-transparent focus:outline-none`（缺少 border 声明）
❌ 不推荐：`border border-outline-variant`（实线边框缺乏现代感）

---

## 图标规范

统一使用 **Lucide Icons**（`<i data-lucide="icon-name"></i>` + `lucide.createIcons()`）：
- 图标颜色继承 `currentColor`，通过 Tailwind 颜色类控制
- 图标尺寸通过 `w-*` / `h-*` 类控制
- 图标名格式：`data-lucide="icon-name"`（kebab-case），在 https://lucide.dev/icons 搜索
- **选中态处理**：Lucide 为纯线条风格，选中态通过颜色区分：选中 `text-primary` + 加粗文字，未选中 `text-on-surface-variant`

```html
<i data-lucide="home" class="w-5 h-5 text-primary"></i>
<i data-lucide="user" class="w-5 h-5 text-on-surface-variant"></i>
<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-on-surface-variant/50"></i>
```

---

## 图片规范

所有图片必须包含 `src`、`alt`、`data-category` 三个属性：

```html
<img src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4" alt="山脉风景" data-category="自然风景">
```

- **src**：完整 URL（http/https），禁止 Base64 编码
- **alt**：中文描述，10-20 字；人物类需描述年龄性别特征
- **data-category** 可选值：人物 / 自然风景 / 动物 / 建筑城市 / 运动体育 / 交通工具 / 食物 / 服饰时尚 / 商业科技 / 游戏娱乐 / 艺术 / 其他

---

## UI 要素规范

1. 如果系统需要展示当前用户，用户名统一为 **"小初"**
2. 默认头像不用图片，使用圆圈内一个 **"初"** 字

---

## 禁止事项

1. **禁止在页面中定义自定义组件类**（`.btn-primary { }` 等），全部使用 utility class
2. **禁止引用外部 `global.css`**
3. **禁止在不同页面使用不同的全局组件样式**（header/TabBar 在所有页面中必须一致）
4. **禁止用 emoji 作为系统图标**
5. **禁止使用 FontAwesome、Material Icons 等非 Lucide 图标库**
6. **禁止非标准 token 命名**（用 `--color-primary`，不用 `--primary-color`）
7. **禁止 Lorem ipsum**，占位内容必须基于产品语义
8. **禁止添加「半透明渐变弧形装饰」**
9. **禁止实线高对比边框**（需加 `/10`~`/20` 透明度）
10. **禁止透明 input 背景**（必须 `bg-surface-container border-none`）
11. **列表/卡片等重复数据必须直接硬编码为完整 HTML 节点**，禁止通过 JS render 函数动态渲染
12. **禁止 Base64 编码嵌入图片**
13. **页面必须展示有内容的状态**，禁止默认展示空状态或将内容列表设为 `hidden`
14. **禁止在 `<body>` 上加 `max-w-*` 限宽**——移动端必须铺满视口
15. **禁止模拟手机外壳 / 顶部状态栏**（电量、信号）
16. **最小点击区域 < 48×48px**
17. **禁止 Header 使用 `fixed` 定位**——必须使用 `sticky top-0`
