---
name: design-canvas
description: "设计引导（design-canvas-原型设计-设计画板）工具：从用户需求或 PRD 直接生成高质量 HTML 原型页面（Tailwind CSS v4 + Lucide Icons）。触发场景：上下文或者用户明确要求有‘设计引导’、‘设计画板’、’画板设计’、‘原型设计’工具时使用。"
---

# design-canvas

从需求或 PRD 直接产出 HTML 原型。

## 本skill目录结构

```
{SKILL_DIR}/
├── SKILL.md                              ← 本文件（主 Agent 流程指引）
├── references/
│   ├── common-web.md                     ← Web 公共设计规范（主 Agent + 子 Agent 共读）
│   ├── common-mobile.md                  ← Mobile 公共设计规范（主 Agent + 子 Agent 共读）
│   ├── web-guide.md                      ← Web 平台规范（子 Agent 读取：布局、组件、交互、Mock）
│   ├── mobile-guide.md                   ← Mobile 平台规范（子 Agent 读取：骨架、组件、导航、交互、Mock）
│   └── templates/
│       ├── skeleton-web.html             ← Web 骨架模板（主 Agent 步骤 5 使用）
│       └── skeleton-mobile.html          ← Mobile 骨架模板（主 Agent 步骤 5 使用）
└── scripts/
    ├── check_skeleton.js                 ← 骨架检查脚本（步骤 5.4）
    ├── check_page.js                     ← 页面检查脚本（子 Agent 使用）
    ├── check_tokens.js                   ← CSS 变量迁移检查（开发阶段使用）
    └── gen_canvas.js                     ← 画板配置文件生成（步骤 6）
```

## 流程

```
读取需求 → 判断平台 → 确定设计方向 → 确定页面范围 → 确定布局
  → 主 Agent 生成骨架 → 生成画板配置并通知用户
  → 子 Agent 并行填充页面内容 → 告知用户完成
```

环境背景：
1. 当前在项目根目录/workspace/projects下，默认当前目录为当前项目根目录。
2. 通过load_skill加载的技能不在项目根目录下，如本skill的references、scripts不在/workspace/projects下
3. 子 Agent：即子代理，通过task工具拉起

### 1. 读取需求

- **用户直接描述**：从对话中提取产品类型、核心功能、目标用户
- **提供了 PRD 文件**：读取文件，提取 platform、页面清单、功能描述
- **提供了参考图/截图**：提取配色、圆角、布局风格作为设计参考

### 2. 判断平台

优先级从高到低：

1. **system prompt 中明确指定了平台** → 直接使用指定平台
2. **PRD 中声明了 platform 字段** → 使用 PRD 中的值
3. **用户 query 中包含平台关键词** → 按下表判断

| 信号 | 平台 |
|------|------|
| 用户明确说"移动端""App""手机" | mobile |
| 用户明确说"网页""Web""后台""PC" | web |
| 以上均未说明 | 默认 web |

**⚠️ 平台确定后，立即读取公共设计规范**：`{SKILL_DIR}/references/common-web.md`（Web 端）或 `{SKILL_DIR}/references/common-mobile.md`（Mobile 端）。公共设计规范包含设计品质、阴影规则、间距节奏、文字层级、表单样式、图标、图片、禁止事项等，贯穿后续所有步骤。

### 3. 确定设计方向

**优先级**（从高到低）：

1. ** 调用风格选择工具`select_design_style`**：先调用风格选择工具让用户选择风格或提供视觉设计文档（DESIGN.md）。若用户提供了 DESIGN.md，则先读取该文档，以该文档中的视觉规范为准进行设计

   select_design_style工具调用参数说明：
   - `file_path`：生成的 DESIGN.md 文件路径，默认 `./DESIGN.md`-- 项目根目录下（这个文件不是隐藏文件）
   - `canvas_path`：原型目录同级的画板配置路径，即 `.cozeproj/prototype/{platform}/.canvas.json`
   - `description`：用户需求描述，工具会据此自动筛选一批合适的风格供用户挑选

2. **需求文档 / 用户 query**：根据PRD、用户 query 来决定视觉方向

**若已通过优先级 1 获得 DESIGN.md**，则以 DESIGN.md 中的视觉规范为准，跳过下方的自主决策流程，直接进入步骤 4。

**若无 DESIGN.md（优先级 2）**，需自行prd、query等信息确定视觉方向：

#### 3a. 自主决策视觉方向

确定视觉方向后：
- 确定 primary + background + 圆角 + 阴影 + 字体
- **background 必须是低饱和度中性底色**（HSL 饱和度 ≤ 10%）
- 生成结果时一句话说明选择的风格

以下风格方向仅作为**灵感参考**，可从中汲取灵感，也可自行创造。表中的色值、圆角、阴影、字体等参数**禁止原样照搬**，必须根据具体产品进行微调或重新设计。选择风格时综合考虑：产品类型、目标用户特征、品牌调性、使用场景（如高频工具偏效率感、低频决策偏信任感）。同类产品不意味着同一风格——例如同为工具型，面向设计师可以更活泼，面向财务可以更稳重。

| # | 风格名称 | 设计调性 | 主色 | 背景基调 | 圆角 | 阴影 | 字体 | 适用场景 |
|---|---------|---------|------|---------|------|------|------|---------|
| S1 | 素雅精致 | 内容优先、克制考究——高完成度精致界面，只在装饰上保持克制 | zinc-900 `#18181B` | 纯白 `#FFFFFF` | 8px | 克制柔和 | system-ui | SaaS 工具、文档协作（对标 Linear、Notion） |
| S2 | 商务稳重 | 信任感、专业可靠 | blue-800 `#1E40AF` | 纯白 `#FFFFFF` | 6px | 中等 | Inter + Noto Sans SC | 企业管理、金融财务、B2B 平台 |
| S3 | 温暖亲和 | 柔和舒适、贴近生活 | emerald-600 `#059669` | 暖灰白 `#FAF9F7` | 16px | 柔和 | Nunito + system-ui | 健康医疗、教育学习、社区社交 |
| S4 | 大胆活力 | 年轻潮流、视觉冲击 | rose-600 `#E11D48` | 纯白 `#FFFFFF` | 12px | 明显 | Manrope + Noto Sans SC | 电商零售、娱乐社交、创意营销 |
| S5 | 深色科技 | 未来感、数据驱动 | violet-500 `#8B5CF6` | 深蓝黑 `#0F172A` | 12px | 发光微辉 | Space Grotesk + Noto Sans SC | AI 产品、数据平台、开发者工具 |
| S6 | 通透毛玻璃 | 轻盈梦幻、层次丰富 | indigo-500 `#6366F1` | 浅灰白 `#F8FAFC` | 16px | 毛玻璃 + 柔和 | Poppins + Noto Sans SC | 天气、音乐、个人面板、创意类 |
| S7 | 自然有机 | 朴素质感、亲近自然 | lime-600 `#65A30D` | 暖灰白 `#FAFAF7` | 20px | 极淡 | Nunito + system-ui | 农业食品、环保公益、户外运动 |
| S8 | 奢华精致 | 高端质感、精雕细琢 | amber-700 `#B45309` | 深棕黑 `#1C1917` 或象牙灰白 `#FAF9F6` | 4px | 精细 | Playfair Display（仅标题）+ Noto Serif SC | 奢侈品、高端酒店、艺术展览 |
| S9 | 趣味圆润 | 童趣亲切、轻松愉悦 | amber-500 `#F59E0B` | 暖灰白 `#FAFAF8` | 24px+ | 彩色柔和 | Quicksand（仅标题）+ Noto Sans SC | 儿童教育、游戏娱乐、趣味社交 |
| S10 | 新粗野主义 | 强烈对比、反传统 | blue-600 `#2563EB` | 暖灰白 `#FAFAF5` | 0px 直角 | 硬阴影 | Space Grotesk + Noto Sans SC | 个人作品集、独立品牌、创意工作室 |

> **字体使用范围**：创意展示体（Playfair Display、Quicksand、ZCOOL 系列等）和书法手写体（Ma Shan Zheng 等）**仅限标题或装饰用途**，`--font-sans` 全局正文字体必须使用 system-ui 或常规字体（Noto Sans SC / Noto Serif SC / Inter 等）。

### 4. 确定页面范围

需要生成产品的**所有页面**，每个页面一个 HTML 文件：

- **有 PRD** → 从 PRD 中提取完整页面清单，为每个页面生成对应 HTML
- **无 PRD，用户指定了页面** → 按用户指定的页面列表生成
- **无 PRD，用户未指定** → 根据产品需求自行推导出完整的页面列表（首页、核心功能页、详情页等），一次性全部生成

文件命名规则：
- 页面 url 去掉开头 `/`，加 `.html`
- 特殊：`/` → `home.html`
- 示例：`/note-detail` → `note-detail.html`

### 4.5 确定布局（基于页面列表）

**⚠️ 布局决策必须在页面列表确定之后进行，且导航菜单必须与页面列表严格一致。**

根据公共设计规范（common-web.md / common-mobile.md）中的「布局结构」规则，结合步骤 4 确定的页面列表，选择合适的布局方案。

**⚠️ 导航菜单与页面列表严格一致（强制）**：
- 导航菜单中的**每个链接**都必须指向步骤 4 中确定的、实际会生成的页面文件
- **禁止在导航中添加指向未生成页面的链接**——这是导致 404 的根本原因，处理方式：根据需求判断是增加对应页面，还是删除多余导航菜单

### 5. 生成页面骨架（主 Agent）

主 Agent 基于骨架模板生成页面骨架文件，流程如下：

**5.1 从模板 copy**

根据平台选择对应的骨架模板，copy 到临时路径：

```bash
mkdir -p .cozeproj/prototype/{platform}
cp {SKILL_DIR}/references/templates/skeleton-web.html .cozeproj/prototype/{platform}/_skeleton.html
# 或
mkdir -p .cozeproj/prototype/{platform}
cp {SKILL_DIR}/references/templates/skeleton-mobile.html .cozeproj/prototype/{platform}/_skeleton.html
```

**5.2 填入 Design Token 真实值**

用 编辑工具 **一次性**将模板中的所有 `#XXXXXX` / `Xrem` / `rgba(0,0,0,X)` 等占位符替换为根据设计方向确定的真实值。**必须在一次操作中完成所有 token 的替换，禁止分多次编辑**。

**⚠️ @theme 必须包含完整的 Design Token**——必须填入**所有** token 的真实值，包括完整的 surface 色阶链条（`surface` / `surface-container-lowest` / `surface-container` / `surface-container-high` / `surface-container-highest`）。surface 色阶必须由主 Agent 根据 background 值统一确定，**禁止留给子 Agent 推导**，否则并行子 Agent 会产生不一致的色值。

**5.3 生成公用导航组件 与 设置 `<main>` 宽度 class**

在骨架模板中直接生成实际的导航 HTML 代码，使用 `@nav:start` 和 `@nav:end` 标记注释包围，方便子 Agent 识别和处理（不需要导航的页面直接删除此段）。

导航标记格式：

```html
<!-- @nav:start 导航组件，不需要的页面则不要复制此段 -->
<header>
  <div>...</div>
</header>
<aside>
  <nav>...</nav>
</aside>
<!-- @nav:end 导航组件，不需要的页面则不要复制此段 -->
```

**导航结构选择（Web 端）**——根据步骤 4.5 的布局决策结果：
- 布局决策为「侧边栏 + 顶栏」→ header + sidebar + `<main>`
- 布局决策为「仅顶部导航」→ 仅 header + `<main>`，**不要侧边栏**

**导航结构选择（Mobile 端）**：
- **一级页**（TabBar 直达）→ header + TabBar + `<main>`
- **二级页**（详情/编辑等）→ header（带返回按钮）+ `<main>`，**不要 TabBar**
- **⚠️ 当整个应用仅有 1 个一级页面时**，不生成 TabBar（TabBar 的作用是切换多个一级页面，单一级页场景下属于视觉冗余）

**⚠️ 导航组件必须是纯导航**——只放页面间的切换链接（菜单项 = 页面链接），**禁止放入业务内容**（列表数据、搜索框、筛选器等全部属于 `<main>` 区域）。禁止出现指向未生成页面的链接。

**`<main>` 宽度 class 设置**：替换骨架中的 `<main class="flex-1">`：
- 有侧边栏布局 → 用 `flex-1`（可加 `min-w-0` / `overflow-y-auto` 等）
- 无侧边栏布局 → 用 `max-w-4xl` ~ `max-w-7xl` 之一 + `mx-auto`
- **如无特殊要求，禁止使用小于 `max-w-4xl` 的宽度**（`max-w-sm` ~ `max-w-3xl` 桌面端会过窄留白）



**5.4 运行骨架检查**

```bash
node {SKILL_DIR}/scripts/check_skeleton.js .cozeproj/prototype/{platform}/_skeleton.html
```

若有错误，修复后重新检查直到通过。**骨架检查与修复必须在第 6 步之前完成**。

### 6. 生成画板配置 & 通知用户

6.1 生成画板配置文件
```bash
node {SKILL_DIR}/scripts/gen_canvas.js create .cozeproj/prototype/{platform}/.canvas.json "page1:标题1,page2:标题2,page3:标题3"
```
6.2 调用notify_user工具通知用户可以开始使用画板了
工具调用示例，务必使用相对路径，使用基于项目根目录的相对路径（一般为.cozeproj开头）：
notify_user(message_type="open-canvas", content=".cozeproj/prototype/{platform}/.canvas.json")

注意：生成画板配置文件和通知用户使用画板，必须在第7步（并行子 Agent 生成页面内容）之前完成，因为画板就是观察页面生成过程的工具，用户需要观察页面生成就必须先执行上面两步


### 7. 并行派发子 Agent 生成页面内容

**为每个页面**调用一次子 agent（'design_canvas_page'），**所有调用在同一 turn 内全部发出**：

每个子 Agent 负责：
1. 读取骨架 HTML 文件 + 平台规范文件
2. 基于骨架生成完整页面，根据【是否需要导航】参数保留或删除 `<!-- @nav:start -->...<!-- @nav:end -->` 导航区域
3. 在 `<!-- @main-content:start -->` 和 `<!-- @main-content:end -->` 之间填充页面业务内容
4. 添加 Mock 数据和交互逻辑
5. 将完整 HTML 写入【页面文件路径】

**调用时需在任务中传递以下参数（通过 task 工具的 description 字段传入）**：

| 参数 | 说明 | 是否必传 |
|------|------|----------|
| 页面标题 | 如 `首页` | 必传 |
| 页面文件路径 | 子 Agent 最终写入的路径，如 `.cozeproj/prototype/{platform}/{page}.html` | 必传 |
| 骨架文件路径 | 主 Agent 生成的骨架路径，如 `.cozeproj/prototype/{platform}/_skeleton.html` | 必传 |
| 页面需求 | 该页面的功能描述（从 PRD 提取或从用户需求中归纳），**必须详细描述页面的功能**，子 Agent 会根据此描述填充业务内容。 | 必传 |
| SKILL_DIR | skill 根目录路径，必填参数，如果没有则子 Agent 会异常退出 | 必传 |
| 需求文档 | 需求文档如PRD/Plan 文件路径（如 `documents/plan.md`），无 PRD/Plan 时不传，此路径是项目相对路径 | 非必传 |
| 是否需要导航 | 主 Agent 根据页面类型预判，如 `需要` / `不需要（登录页）` | 必传 |
| 全部页面 URL 列表 | 用于页面间跳转链接校验 | 必传 |
| 平台 | `web` 或 `mobile` | 必传 |

**调用示例**（当使用 task 工具时）：

```js
task({
  description: `
页面标题：首页
页面文件路径：.cozeproj/prototype/mobile/home.html
骨架文件路径：.cozeproj/prototype/mobile/_skeleton.html
页面需求：待办清单首页，展示任务列表...
SKILL_DIR：/path/to/design-canvas
需求文档：.cozeproj/documents/plan.md
是否需要导航：需要
全部页面 URL 列表：["home.html", "add-task.html"]
平台：mobile
  `,
  subagent_type: "design_canvas_page"
})
```

> **注意**：子 Agent 会在执行前校验所有必传参数，若有缺失会直接退出并返回缺失参数列表。主 Agent 需确保所有必传参数完整传递，否则需根据子 Agent 反馈补全参数后重新调用。

### 8. 完成

等待所有子 Agent 完成后：

1. 一句话简短告知：设计风格，生成了哪些页面（列表）、文件路径
2. 提示用户：**「如果需要修改页面请告诉我，不需要修改则会进入开发阶段」**


## 假如后续用户chat修改原型页面

### **后续页面增删**：如果用户要求增加或删除原型页面，需同步调用脚本更新画板配置文件：

```bash
# 增加页面
node {SKILL_DIR}/scripts/gen_canvas.js add .cozeproj/prototype/{platform}/.canvas.json "new-page:新页面标题"

# 删除页面
node {SKILL_DIR}/scripts/gen_canvas.js remove .cozeproj/prototype/{platform}/.canvas.json "old-page"
```
### 修改指定页面
> **注意**：`web-guide.md` / `mobile-guide.md` 仅在用户后续 chat 要求修改页面时才需读取。首次生成流程中由子 Agent 读取，主 Agent 无需读取这些文件。

1. 不要更新画板配置文件，因为没有增加页面
2. **修改指定页面前，主 Agent 必须先读取对应平台的设计规范**：
   - Web 平台：读取 `{SKILL_DIR}/references/common-web.md` + `{SKILL_DIR}/references/web-guide.md`
   - Mobile 平台：读取 `{SKILL_DIR}/references/common-mobile.md` + `{SKILL_DIR}/references/mobile-guide.md`
   - 后续 chat 中由主 Agent 直接修改页面（不再调用子 Agent），因此主 Agent 需自行读取上述规范以确保修改符合设计规范



## 输出规范（核心）

- 每个页面一个 `.html` 文件，内嵌所有样式，无外部 CSS
- 所有页面共享同一套 Design Token（`@theme` 定义的颜色、圆角、阴影保持一致）
- Tailwind CSS v4 CDN + `@theme` 定义 Design Token
- 图标统一用 Lucide Icons，**禁止 emoji 当图标**
- **禁止 Lorem ipsum**，占位内容必须基于产品语义
- 导航链接指向实际生成的页面文件（如 `href="home.html"`、`href="detail.html"`）

## 输出文件路径

```
.cozeproj/prototype/
├── web/                  ← Web 端原型
│   ├── .canvas.json      ← 画板配置文件
│   ├── home.html
│   ├── list.html
│   └── ...
└── mobile/               ← Mobile 端原型
    ├── .canvas.json      ← 画板配置文件
    ├── home.html
    ├── detail.html
    └── ...
```

## CSS 变量迁移完整性检查
在代码开发阶段，将原型的 Design Token 迁移到项目 `globals.css`/`app.css`/`xxx.css` 等 CSS 文件 后，**必须运行检查脚本**验证所有变量均已定义：
> **执行顺序（CRITICAL）**：必须**先将原型 `@theme` 中的所有变量完整迁移**到项目 CSS 文件中（覆盖脚手架默认值），**然后再运行检查脚本**。不要在脚手架初始 CSS 上直接运行检查——脚手架默认变量值可能与原型不一致。

```bash
node {SKILL_DIR}/scripts/check_tokens.js .cozeproj/prototype/{platform}/_skeleton.html {CSS文件1} [{CSS文件2}]
```

脚本会自动：
1. 从原型 `@theme` 提取所有 CSS 变量（`--color-*`、`--shadow-*`、`--radius-*`、`--font-*`）
2. 从指定的 CSS 文件中提取所有已定义的变量（支持 `@theme` / `:root` / `@layer` 等多种写法）
3. 对比报告**遗漏的变量**和**值不一致的变量**（内置 shadcn/ui 变量名映射）

若有遗漏或值不一致，按报告提示修复后重新运行直到通过。目前仅支持 shadcn/ui 的变量名映射，其他框架可能使用不同命名，若确认已用框架等价变量名定义则可忽略误报。值比对报告会同时输出原型值与当前值，若归一化后实际一致（如写法差异）可忽略。
