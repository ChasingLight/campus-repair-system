# Web 公共设计规范

> 主 Agent 和子 Agent 共同遵守的 Web 端设计规范。

---

## 布局结构

有需求文档按照需求文档确定，没有则根据应用类型选择布局：

| 应用类型 | 推荐布局 |
|---------|---------|
| 管理后台 / SaaS / 工具平台（独立导航页面 ≥ 3） | 侧边栏 + 顶栏 + `flex-1` 主内容区 |
| 管理后台 / SaaS / 工具平台（独立导航页面 < 3） | 顶部导航 + `max-w-7xl mx-auto` 内容 |
| 营销官网 | 顶部导航 + `max-w-7xl mx-auto` 内容 + 页脚 |
| 内容/阅读/单功能应用 | 顶部导航 + `max-w-4xl mx-auto` 正文区 |

> 「独立导航页面」指需要在导航菜单中占据一个入口的页面（一般是一个相对独立的功能模块入口），不包括详情页、编辑页等从列表页跳转进入的二级页面。

**侧边栏的使用原则**：
- 侧边栏**仅适用于有多个独立功能模块的应用**（如管理后台当有多个相对独立的功能模块需要入口时）——单功能应用（笔记、待办等）不需要侧边栏，用顶部导航即可
- 侧边栏中**只放页面导航链接**（图标 + 页面名称），**禁止放入业务内容**（列表数据、搜索框、筛选器等属于 `<main>` 区域）
- 如果侧边栏只有 1-2 个菜单项，说明不需要侧边栏，改用顶部导航
- **⚠️ 导航（侧边栏/顶部导航）中的每个菜单项必须指向实际生成的页面文件，禁止出现指向未生成页面的悬空链接，如果没有该页面，则不要生成该菜单项**

**宽度规范**：
- **有侧边栏的布局**：主内容区使用 `flex-1` 铺满侧边栏旁的剩余空间，不要额外设置 `max-w-*` 限宽。常见于管理后台、SaaS 工具等
- **无侧边栏的布局**：内容区使用 `max-w-7xl mx-auto`（或 `max-w-6xl` / `max-w-4xl`，视内容密度而定）居中限宽。常见于营销官网、内容平台、博客等
- ⚠️ **`<main>` 的 max-w 下限为 `max-w-4xl`**——禁止使用 `max-w-sm` / `max-w-md` / `max-w-lg` / `max-w-xl` / `max-w-2xl` / `max-w-3xl`，这些值在桌面端会导致主内容区过窄、大量留白

**⚠️ 无侧边栏布局的顶栏对齐规则（强制）**：

当页面没有侧边栏时，`<header>` 的**内部内容**必须与 `<main>` 使用**相同的 `max-w` 和 `mx-auto`** 居中对齐。header 的背景色可以全宽铺满，但内部的 Logo、导航、按钮等元素必须包裹在一个限宽容器中，确保与下方内容区左右边缘对齐。

```
✅ 正确：header 背景全宽，内部内容 max-w-4xl mx-auto → 与 main 对齐
❌ 错误：header 内容贴左右边缘（px-6），main 用 max-w-4xl mx-auto → 宽屏上顶栏与内容区视觉断裂
```

> 有侧边栏的布局不需要此规则——sidebar + flex-1 天然保证顶栏和内容区宽度一致。

**`<main>` 分区规则（强制）**：
- `<main>` 是**唯一**的主内容区标签，整个 `<body>` 中只允许出现**一个** `<main>`
- `<main>` **之前**的内容为公共导航区（header / sidebar 等），`<main>` **之内**为页面业务内容
- 必须在 `<main>` 前后添加注释标记，便于脚本精确提取：
  - `<main>` 开标签之前：`<!-- @main-content:start -->`
  - `</main>` 闭标签之后：`<!-- @main-content:end -->`


```html
<body class="bg-background text-on-surface min-h-screen">

  <header class="bg-surface sticky top-0 z-40 h-16 flex items-center justify-between px-6">
    <div class="flex items-center gap-2">
      <i data-lucide="rocket" class="text-primary w-5 h-5"></i>
      <span class="font-bold text-lg">产品名</span>
    </div>
    <nav class="flex items-center gap-1">
      <a href="#" class="px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-md"
         aria-current="page">当前页</a>
      <a href="#" class="px-3 py-1.5 text-sm font-medium text-on-surface-variant
                         hover:text-on-surface hover:bg-surface-container rounded-md transition-colors">其他页</a>
    </nav>
    <button class="bg-primary text-on-primary px-4 py-2 rounded-md text-sm font-medium hover:opacity-90">操作</button>
  </header>

  <div class="flex" style="height: calc(100vh - 4rem)">
    <aside class="w-60 shrink-0 bg-surface-container overflow-y-auto">
      <div class="p-3 space-y-0.5">
        <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-md bg-primary/10 text-primary font-medium text-sm"
           aria-current="page">
          <i data-lucide="gauge" class="w-4 h-4"></i>仪表盘
        </a>
        <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-md text-on-surface-variant
                           hover:bg-surface-container hover:text-on-surface font-medium text-sm transition-colors">
          <i data-lucide="file-text" class="w-4 h-4"></i>内容
        </a>
      </div>
    </aside>

    <!-- @main-content:start -->
    <main class="flex-1 min-w-0 overflow-y-auto bg-background p-6">
      <!-- 页面内容 -->
    </main>
    <!-- @main-content:end -->
  </div>

  <script>lucide.createIcons();</script>
</body>
```

---

## 全局组件一致性

所有页面的全局组件必须保持完全一致的样式和结构：

| 组件 | 一致性要求 |
|-----|----------|
| **顶部导航栏 (Header)** | 高度、背景色、Logo、导航链接、用户菜单在所有页面中完全一致 |
| **侧边栏 (Sidebar)** | 宽度、背景色、菜单项样式、图标在所有页面中完全一致 |

**⚠️ 导航组件中只放页面导航链接**，不放业务内容（列表、搜索框、筛选器等）。业务内容全部在 `<main>` 中实现。

**nav 激活态**：根据当前页面设置对应菜单项为激活态，添加 `aria-current="page"` 属性。

**是否需要 nav 的判断规则**：

| 页面类型 | header/topbar | sidebar |
|---------|-------------|---------|
| 管理后台/SaaS 页（多模块） | ✅ 需要 | ✅ 需要 |
| 内容/营销页 | ✅ 需要 | ❌ 不需要 |
| 单功能应用（笔记、待办等） | ✅ 需要 | ❌ 不需要 |
| 创建/编辑/专注操作页 | ✅ 简化版（仅返回按钮 + 标题） | ❌ 不需要 |
| 登录/注册页 | ❌ 不需要 | ❌ 不需要 |
| 全屏/沉浸页 | ❌ 不需要 | ❌ 不需要 |

---

## 设计品质

参考 Linear、Notion、Stripe、Vercel 等顶级产品的设计精髓——配色、层次、间距、字重、阴影都要精心推敲。

### Surface 色阶

- **background 应为极低饱和度的中性底色**，主题色彩通过 primary 和装饰元素体现
- **surface 色阶必须保持中性色调**，不要把 primary 的色相混入 surface 系统
- `surface-container` 是 Tonal Fill（输入框/搜索框背景色）的关键层，它必须与 background 有可感知的色差
- `background` 和 `surface` 可以相同（靠 `shadow-card` 区分卡片），按需分层

### 区域分割优先级

1. **Shadow 卡片**——`bg-surface` + `shadow-card` 浮在 `bg-background` 之上。当 `background ≈ surface` 时，`shadow-card` 的 opacity 应在 **0.08 ~ 0.15** 之间
2. **背景色层级**——sidebar 与主内容用不同 surface 层级区分，表头用 `bg-surface-container`
3. **Ghost Borders**——低透明度边框（如 `border border-outline-variant/10`），适用于高密度数据表

### Shadow 使用限制

- **禁止与 overflow:hidden 共存**：当卡片的直接父容器设置了 `overflow: hidden`（如轮播容器等），shadow 会被裁剪而不可见。此时必须降级为背景色层级（卡片用 `bg-surface-container-lowest` 与 `bg-background` 产生色差）或 Ghost Border（`border border-outline-variant/20`）

### 边框规则

- **⚠️ 禁止未弱化的实线 border**：如需使用边框，必须通过透明度弱化为 Ghost Borders（透明度 ≤ 30%，如 `border border-outline-variant/20`）

---

## 间距节奏

**间距要疏密有致，禁止全局等距**：
- **元素内部紧凑**：标题与副标题 `gap-1`，图标与文字 `gap-2`，表单 label 与 input `gap-1.5`
- **区块之间拉开**：不同功能区之间 `gap-8` ~ `gap-12`，section 之间用明显的间距跳变建立节奏
- **卡片内 padding 适度**：内容型卡片 `p-4` ~ `p-5`，不要一律 `p-6` ~ `p-8`
- **Feed 流/列表场景**：一屏应至少展示 3 条完整内容，卡片间距 `gap-3` ~ `gap-4`

---

## 文字层级（4 级）

| 层级 | 用途 | 样式 | 颜色 |
|------|------|------|------|
| L1 | 页面大标题 | `text-2xl font-bold` | `text-on-surface` |
| L2 | 卡片标题 | `text-base font-semibold` | `text-on-surface` |
| L3 | 正文 | `text-sm font-normal` | `text-on-surface` |
| L4 | 时间戳/辅助 | `text-xs font-normal` | `text-on-surface-variant` |

相邻层级之间必须有明显的视觉差异（字号差 ≥ 1 级或字重差 ≥ 1 级 + 颜色变化）。

---

## 表单元素样式（⚠️ CRITICAL）

所有表单元素统一使用背景色填充（Tonal Fill）：`border-none bg-surface-container rounded-md px-3 py-2 focus:ring-2 focus:ring-primary/30`

✅ 推荐：无边框 + 背景色填充 + focus 时 ring 反馈
❌ 禁止：`bg-transparent focus:outline-none`（缺少 border 声明 → 黑色默认边框）
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
<i data-lucide="pencil" class="w-5 h-5 text-on-surface-variant"></i>
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
3. **禁止在不同页面使用不同的全局组件样式**（header/sidebar 在所有页面中必须一致）
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
14. **禁止 `max-w-sm`~`max-w-3xl` 限宽主内容区**
