---
name: miniprogram-dev
description: 当主 Agent 识别到项目的 `project_type = "miniprogram"` 时，使用此 skill 指导该小程序项目的开发生命周期——从零创建、导入存量项目适配、基于 Taro 的跨端开发规范、组件与样式约束、网络请求与前后端匹配、预览链路（coze CLI）。部署由 `general-deploy` skill 统一承接，本 skill 只在其需要时提供小程序部署事实。本 skill 承接小程序类型内部的开发专业细节，不接管主 Agent 的整体工作流。
---

# Mini Program Dev Skill

## 1. 定位

本 skill 是小程序类型（`project_type = "miniprogram"`）的**常驻开发指引**，面向**基于 Taro 框架**的跨端小程序开发。主 Agent 在项目初始化阶段识别出 `project_type = "miniprogram"` 后，会声明加载本 skill，之后对该小程序项目的所有具体开发、预览决策均以本 skill 为准（部署决策归 `general-deploy` skill）。

定位是：基于 Taro 框架开发小程序的专家，编写现代、优雅、跨端一致、性能良好的小程序代码。

**职责边界：**
- 承接：小程序的框架选型、脚手架初始化、Taro 跨端开发规范、组件库与样式约束、网络请求与前后端匹配、API 测试、录音/上传等原生能力跨端适配、预览命令与验证、小程序特有的踩坑预防。
- 不承接：类型识别、`.coze` 双文件体系管理、`[subprojects]` 注册、`sub_id` 生成、`.preview` 文件格式、端口约束（5000 对外暴露、9000 禁用）、`AGENTS.md` 体系、**部署链路（归 `general-deploy` skill）**等——这些由主 Agent SP / general-deploy 定义，本 skill 遵循不重复。

当本 skill 的建议与主 SP 的核心不变量冲突时，以主 SP 为准。

## 2. 何时使用 / 何时不使用

**使用：**
- `.coze` 的 `[project].project_type = "miniprogram"`，且主 Agent 已声明加载本 skill。
- 涉及该小程序项目的：从零创建、导入适配、页面/组件开发、跨端兼容、网络请求、后端接口、预览链路、相关调试和排障（部署链路走 `general-deploy` skill）。

**不使用：**
- 当前操作的项目不是小程序类型（按《类型 skill 路由表》路由到对应 skill）。
- 任务属于主 Agent SP 的通用职责（类型识别、`.coze` 管理、工作流编排、端口约束）。

## 3. 核心开发哲学

- **智能自适应**：简单修改直接动手；复杂功能先思考再行动。
- **结果导向**：代码不仅要能跑，还要易读、易维护，符合小程序最佳实践。
- **跨端一致性**：充分利用 Taro 的跨端能力，确保代码在微信小程序、抖音小程序、H5 等平台表现一致。
- **性能优先**：小程序对性能敏感，需注意包体积、渲染性能、网络请求优化。
- **调试透明**：在前端网络请求封装中，显式 `console.log` 打印所有请求的 URL、Method、参数（Params/Body）、Header 以及响应结果（Response Data），确保数据流向清晰可查。

## 4. 支持的子场景

| 子场景 | 说明 | 主要逻辑位置 |
|---|---|---|
| 从零创建小程序项目 | 使用 Taro 脚手架初始化 | 第 5 节 |
| 导入存量小程序项目 | 识别 Taro 结构并适配 | 第 6 节 |
| 页面与组件开发规范 | 直写首页、组件选型、页面配置 | 第 7 节 |
| 组件库与样式 | `@/components/ui`、Tailwind、图标 | 第 8 节 |
| 网络请求与前后端匹配 | Network 封装、API 测试 | 第 9 节 |
| 跨端兼容 | H5/小程序差异速查表（模板见 reference） | 第 10 节 |
| 原生能力跨端适配 | 录音、上传、相机等（细节见 reference） | 第 11 节 |
| 预览链路 | coze CLI 启动 + 验证 | 第 12 节 |
| 部署链路 | 由 `general-deploy` skill 承接（含打包配置检查） | 第 13 节 |

## 5. 从零创建小程序项目

### 5.1 默认框架：Taro

小程序项目的**默认框架是 Taro**（React 语法 + 跨端编译）。从零创建小程序项目时默认使用 Taro 模板。

### 5.2 脚手架初始化（coze CLI）

小程序项目通过 Coze CLI 初始化 Taro 模板：

```bash
coze init ${COZE_WORKSPACE_PATH} --template taro
```

- Coze CLI 已内置到沙箱环境中，可直接使用，无需安装。
- 可使用 `coze --help` 或 `coze <command> --help` 获取详细使用说明。

**初始化检查顺序（CRITICAL：先确认项目，再探索）：**
- 任何任务开始时，在执行任何"项目探索"（glob、读 `README.md`、读 `src/app.config.ts`）之前，必须先确认 `${COZE_WORKSPACE_PATH}` 下已经存在可用的 Taro 项目结构。
- 若目录为空，或缺少关键文件（如 `package.json` / `src/app.config.ts`），先执行上面的 `coze init`。
- 在确认项目可用之前，只允许做**最小化的存在性检查**（例如根目录 `glob`，深度 0）；**禁止**读取/扫描 `README.md`、`src/**` 等探索性文件，直到完成初始化。
- 若 `${COZE_WORKSPACE_PATH}` 下已存在项目（已有 `package.json` / `src/app.config.ts`），跳过 `coze init`，按导入路径处理。

### 5.3 新建后立即完成的事情

新建小程序项目后必须确保（与主 SP《项目初始化》衔接）：
1. `.coze` 包含合法的 `sub_id`、`name`、`project_type = "miniprogram"`；`[subprojects].path` 默认 `["."]`。
2. `package.json` 包管理器为 pnpm。
3. 预览链路相关的 `.preview`、`[dev]` 留到预览真正触发时再处理（见第 12 节）。

## 6. 导入存量小程序项目

### 6.1 识别信号
- Taro 配置：`config/index.*`、`src/app.config.ts`
- 小程序工程配置：`project.config.json`（微信）、`project.tt.json`（抖音）
- 依赖：`@tarojs/taro`、`@tarojs/components`、`@tarojs/cli`
- 页面结构：`src/pages/**`、`*.config.ts` 页面配置

### 6.2 适配策略
- 读取工作区 `AGENTS.md`（若存在）→ 读 `README.md` 与 `src/app.config.ts` 熟悉项目说明、可用组件与页面结构。
- 判断项目状态：**新项目**（README 为模板内容 / `src/pages` 仅有 index 页面）vs **老项目**（有业务描述 / 多个业务页面）。
- 尊重现有栈，不强制重构；在 `AGENTS.md` 中记录识别结果。
- 确认 `.coze` 是否合法；若缺失 `sub_id`，生成并写入。

### 6.3 探索原则（老项目适用）
1. README 与 components 优先：先并行读取 `README.md`。
2. 按需深入：只读取与当前任务相关的文件。
3. 避免全量扫描：禁止无目的地遍历整个项目。
4. 利用 `src/app.config.ts`：这是了解页面结构的最快入口。

## 7. 页面与组件开发规范

### 7.1 直写首页
- 绝大多数用户需求（"写一个待办清单"、"写一个登录页"）都应直接修改 `src/pages/index/index.tsx`。
- **禁止**保留空白首页并自动跳转到新创建的页面。
- 仅在用户明确规划了多页面导航流程（如"首页点列表进详情页"）时，才创建新页面。

### 7.2 清理旧代码
- 编写新功能时，不要保留 `src/pages/index/index.tsx` 中原有的 Demo 代码（如 Hello Taro 文本），直接覆盖重写为用户需要的功能。

### 7.3 新页面组件选型前置（CRITICAL）
- 只要是"创建页面 / 重写页面 / 大幅改版页面"，在写 JSX 之前必须先思考这个页面需要哪些 UI 单元，例如按钮、输入框、卡片、标签、Tabs、弹窗、空状态、加载态、底部操作栏。
- 这些 UI 单元必须先映射到 `src/components/ui` 中已有组件；只有页面结构容器或组件库未覆盖的原生能力，才使用 `@tarojs/components`。
- 不要直接用 `View/Text` 手搓快捷操作项、标签胶囊、推荐卡片、输入框、发送按钮、弹层、分段切换等本应优先复用组件库的 UI。

### 7.4 页面配置文件规范（`.config.ts`）
- 禁止显式导入 `definePageConfig`，Taro 在编译时全局注入。
- `definePageConfig` 仅在小程序端存在，H5 端运行时未定义，必须做兼容处理：
```ts
export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '页面标题' })
  : { navigationBarTitleText: '页面标题' }
```

### 7.5 设计指南（design_guidelines.md）
把设计指南当作 UI 实现的输入和交付证据，而不是事后补写的文档。

**触发与顺序（CRITICAL）：**
- 完成 Taro 初始化后、首次写入任何页面 JSX/TSX、`src/app.css` 或 `src/app.config.ts` 前，先检查根目录 `design_guidelines.md`。
- 文件存在：必须完整读取，并提取下面的设计清单；文件不存在且为新项目首次开发、创建/重写页面、UI 大改或用户要求换风格：必须创建。简单 bug 修复、纯文案调整、纯后端任务可跳过创建。
- 复杂任务的 `write_todos` 必须单列“生成/读取并应用设计指南”任务；未完成设计清单和页面组件映射前，不得把该任务标为完成或开始写 UI。

**生成与更新：**
- 用 `write_file` 创建，控制在 150 行以内，按项目实际裁剪：品牌定位、配色方案（含 Tailwind 类名）、字体层级、间距系统、组件选型原则、导航结构、小程序约束。
- 设计必须体现产品特征和明确禁忌，避免只产出“主色 + 圆角卡片”的通用组合。
- 设计指南只写“视觉规范 + 组件选型原则”：按钮、输入框、弹窗、Tabs、Toast、Card 等通用 UI 优先 `@/components/ui/*`，不要写组件实现教学或手搓通用组件示例。
- 新建或更新指南后，根据其色值**增量更新** `src/app.css` 的 `:root,page,root-portal` 变量。禁止覆盖整个文件、替换 `@import url('weapp-tailwindcss');`、删除上述选择器或修改其外的既有代码。

**编码前消费（CRITICAL）：**
- 开始页面 JSX 前，基于指南明确：主/辅色 Tailwind 类名、容器/间距规则、导航结构、空/加载/错误状态的视觉方向。
- 先查看 `src/components/ui`，把页面的按钮、输入、卡片、标签、Tabs、弹窗、Toast 等 UI 单元映射到可复用组件；组件库未覆盖时才使用原生组件或补齐公共组件。
- UI 实现中只能使用指南定义的色彩、间距和组件原则；若因需求需要偏离，先更新指南再编码，避免文档与界面漂移。

## 8. 组件库与样式

### 8.1 组件库 `@/components/ui`
- Taro 版 shadcn/ui 组件库位于 `@/components/ui` 路径下，使用 `ls src/components/ui` 可查看所有可用组件，可随意使用或修改该目录下的源代码。
- 常用组件：Button、Input、Textarea、Card、Badge、Tabs、Dialog、AlertDialog、Drawer、Sheet、Select、Checkbox、RadioGroup、Switch、Slider、Progress、Skeleton、Toast、Sonner、Avatar、Accordion、Table、Pagination、Calendar、Carousel、InputOTP、Tooltip、Popover、DropdownMenu 等（完整清单以 `ls src/components/ui` 实际结果为准）。

**CRITICAL 执行约束：**
- 只要涉及"通用 UI 组件"（按钮/输入框/弹窗/表单控件/菜单/提示/卡片/表格/标签页等），必须先在 `src/components/ui` 查找并优先使用；存在即从 `@/components/ui/*` 导入。
- 禁止用 `View/Text` + Tailwind 手搓上述通用组件的外观与交互，除非组件库确实缺失。
- 组件库缺失时，优先把组件补齐到 `src/components/ui`（可复用、可维护），再在页面中引用；不要在页面里临时造轮子。
- 只对必要情况（组件库缺失，或 View、Text、Camera、Canvas 等无需封装的原生组件）才直接使用 `@tarojs/components`。
- 页面级 ESLint 作为兜底：若页面直接使用原生 `Input`，或用 `View/Text` 手搓通用 UI，校验会报错。

示例：
```tsx
// ✅ 优先使用 ui 组件
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@tarojs/components'

<Card>
  <CardContent className="p-4">
    <Button onClick={() => {}}>
      <Text>提交</Text>
    </Button>
  </CardContent>
</Card>
```

### 8.2 样式开发（Tailwind 优先）
项目已集成 Tailwind CSS 4 + weapp-tailwindcss（同时支持微信和抖音小程序）。

**CRITICAL：**
- 默认先写 `className`，再考虑 `style`。颜色、间距、圆角、边框、阴影、排版、flex/grid、宽高等常规样式必须收敛在 Tailwind 类名中。
- 禁止使用 `w-[340px]`、`text-[14px]`、`p-[16px]` 这类带 `px` 的 Tailwind 任意值。
- 禁止使用 `style={{ width: '200px' }}`、`fontSize: '14px'` 这类硬编码尺寸。Taro 会通过 `pxtransform` 将尺寸转换为跨端单位（小程序 `rpx`、H5 `rem`），直接写 `px` 容易导致跨端显示不一致。
- `style` 只允许用于少量跨端兼容修正；`.css` 只用于动画、关键帧、复杂选择器、第三方组件覆盖等 Tailwind 明显不适合的场景，且范围最小。

```tsx
// ❌ 硬编码 px，跨端不一致
<View className="w-[340px] h-[200px] p-[16px]"><Text className="text-[14px]">内容</Text></View>
// ✅ 使用 Tailwind 预设类名
<View className="w-full max-w-sm h-48 p-4"><Text className="text-sm">内容</Text></View>
```

### 8.3 图标库（lucide-react-taro）
项目使用 `lucide-react-taro`（Lucide 的 Taro 适配版，已预装）。

**渲染原理（小程序端）**：每个 icon 不是用 `<svg />` 渲染，而是把 SVG 编码成 `data:image/svg+xml,...`，再用 `<Image />` 渲染。因此 `className` 只作用在 `<Image />` 本身（布局/外边距/对齐），**不会**作用到 SVG 内部的 `stroke/fill`，也不会继承 `currentColor`。

```tsx
import { House, Settings, Camera } from 'lucide-react-taro'
// ✅ 用 color/size/strokeWidth 控制图标
<Camera size={48} color="#1890ff" strokeWidth={1.5} />
<House className="mr-2" size={18} color="#1890ff" />
// ❌ className 的 text-* 不会改变 icon 颜色
<House className="text-red-500 w-8 h-8" />
```

查找/校验图标：
```bash
npx taro-lucide-find --list
npx taro-lucide-find arrow-up user settings --json
```

### 8.4 TabBar 导航与图标
如果 design_guidelines 定义了 TabBar 导航：
1. 修改 `src/app.config.ts`，配置 `tabBar` 字段。
2. 创建 TabBar 中定义的所有页面文件，并在 `pages` 数组中注册。
3. 用 CLI 生成 TabBar 图标（小程序 TabBar 不支持 base64/SVG，只能用本地 PNG）：
```bash
npx taro-lucide-tabbar House ShoppingCart User -c "#999999" -a "#1890ff" -o ./src/assets/tabbar -s 81
```
（`-c` 未选中色 = `tabBar.color`，`-a` 选中色 = `tabBar.selectedColor`，`-o` 输出目录，`-s` 尺寸推荐 81）
4. `iconPath` / `selectedIconPath` 必须以 `./` 开头（如 `'./assets/tabbar/house.png'`），否则 Taro 无法正确处理路径。
5. TabBar 页面跳转用 `switchTab()`，普通页面用 `navigateTo()`。

### 8.5 图片与视频资源
- 图片、视频等静态资源必须通过平台对象存储管理，代码中使用返回的 URL 引用；需要上传能力时按平台集成能力规范实现（见第 14 节）。
- 仅 TabBar 图标允许放在 `src/assets/tabbar/` 下（小程序 TabBar 强制本地 PNG），其余一律走对象存储。
- 禁止把大图片/视频直接打包进项目（包体积超限）；禁止使用 `via.placeholder.com`、`/images/placeholder.jpg`、`example.com` 等占位/虚构地址。

### 8.6 命名规范
- 文件名 kebab-case（`user-profile.tsx`）；组件名 PascalCase（`UserProfile`）；变量/函数 camelCase（`getUserInfo`）；常量 UPPER_SNAKE_CASE（`API_BASE_URL`）；类型/接口 PascalCase（`UserInfo`）；CSS 用 Tailwind。

### 8.7 代码清洁（避免编译期未使用变量错误）
- 禁止"预防性导入"未使用的 React hooks 和 Taro API。
- 禁止声明未使用的 `useState`/变量/函数。
- 完成每个文件后逐行自查未使用的 import / 变量 / 函数，发现立即删除，不要留到编译检查阶段。

## 9. 网络请求与前后端匹配

### 9.1 包管理器
**必须使用 pnpm**，禁止 npm/yarn：`pnpm add` / `pnpm add -D` / `pnpm install` / `pnpm remove`。

### 9.2 Network 封装（强制）
`Network` 是对 `Taro.request`、`Taro.uploadFile`、`Taro.downloadFile` 的封装，自动添加项目域名前缀，参数与 Taro 一致。

- **禁止**直接使用 `Taro.request` / `Taro.uploadFile` / `Taro.downloadFile`，统一用 `Network.request` / `Network.uploadFile` / `Network.downloadFile`。
- **禁止**自己封装 Network 类/库/文件，必须 `import { Network } from '@/network'`。
- 如无必要，**禁止**修改 `@/network` 中的文件，即使遇到 tsc 类型报错。

```typescript
import { Network } from '@/network'

const data = await Network.request({ url: '/api/hello' })
const result = await Network.request({ url: '/api/user/login', method: 'POST', data: { username, password } })
await Network.uploadFile({ url: '/api/upload', filePath: tempFilePath, name: 'file' })
await Network.downloadFile({ url: '/api/download/file.pdf' })
```

### 9.3 URL 构建规范（CRITICAL）
- **禁止硬编码 `localhost` 或域名**到请求 URL；始终使用 `/api/xxx` 形式的相对路径，让 Network 自动处理域名拼接。
- 禁止在业务代码中用 `fetch` 直接调用 API。
- 工作原理：H5 开发环境靠 Vite proxy 把 `/api` 代理到本地后端；小程序端 / 生产环境靠 Network 按项目域名配置拼接。

```typescript
// ✅ 相对路径
await Network.request({ url: '/api/knowledge/chat', method: 'POST', data: { message } })
// ❌ 硬编码地址
await Network.request({ url: 'http://localhost:3000/api/...' })
```

### 9.4 后端接口规范（NestJS）
- 后端入口已配置 `app.setGlobalPrefix('api')`，所有路由自动加 `/api` 前缀。
- 在 `@Controller()` / `@Get()` / `@Post()` 路径中**禁止**手动加 `api` 字样。
  - ✅ `@Controller('users')` → 实际路由 `/api/users`
  - ❌ `@Controller('api/users')` → 实际路由 `/api/api/users`
- 显式处理 HTTP 状态码，所有成功请求（包括默认返回 201 的 POST）统一返回 HTTP 200。

### 9.5 接口数据解包（防御性编程）
警惕"嵌套 Data"陷阱：
- 第一层 `res.data`：`Taro.request` 返回对象中的 HTTP 响应体。
- 第二层 `res.data.data`：NestJS 信封模式常把业务数据再封装在 `data` 字段（`{ code, msg, data }`）。

约束：先 `console.log(res.data)` 确认结构再访问；拒绝盲目直连；优先用可选链 `?.`；可定义 `ApiResponse<T>` 接口提示层级。

### 9.6 后端开发与 API 测试（CRITICAL 流程）
若任务涉及后端接口开发，遵循以下顺序，并把"接口实现 + API 测试 + 前后端匹配验证"作为**同一个工作单元**完成，不拆成独立步骤：

1. **先开发前端模块**：实现 UI 界面 + 调用逻辑（此时后端未实现，前端请求失败是正常的）。
2. **再开发后端接口**（三合一）：
   - ① 实现 NestJS Controller / Service 代码
   - ② API 接口测试：用 curl 验证 HTTP 200 且响应结构正确
   - ③ 前后端匹配验证：核对前后端 URL、方法、参数名、响应解析一致
3. 执行交付前校验（见第 13 节）。
4. 验证步骤必须在编译检查之前完成。

curl 测试示例：
```bash
curl -X GET http://localhost:3000/api/users
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"username":"test","password":"123456"}'
curl -X POST http://localhost:3000/api/upload -F "file=@test.txt"
```
验证要点：HTTP 200；响应体符合 `{ code, msg, data }`；业务数据在 `data` 字段；错误参数返回合理错误信息。

**前后端匹配检查表：**

| 维度 | 前端 | 后端 | 检查 |
|---|---|---|---|
| 请求路径 | `Network.request({ url: '/api/users' })` | `@Controller('users')` + `@Get()` | 路径一致 |
| HTTP 方法 | `method: 'POST'` | `@Post()` | 方法一致 |
| 请求参数名 | `data: { username, password }` | `@Body() body: {...}` | 参数一致 |
| 文件上传 name | `name: 'file'` | `FileInterceptor('file')` | name 一致 |
| 响应结构 | `res.data.data.userId` | `return { data: { userId } }` | 结构匹配 |

常见匹配问题：404（路径不匹配，检查装饰器路径）；后端收到 `undefined`（参数名不一致）；405（HTTP 方法错误）；前端取到 `undefined`（数据结构层级，打印 `res.data` 确认）；上传 400（`name` 与 `FileInterceptor('name')` 不一致）。

## 10. H5 / 小程序跨端兼容（CRITICAL）

### 跨端速查表
- Taro 原生 Text 换行/白屏：垂直排列的 Text 必须加 `block` 类。
- Taro 原生 Input/Textarea 样式：H5 端 inline 导致样式失效 → 用 `View` 包裹，样式放外层 View。
- Input/Button Flex：H5 不支持 → `View` 包装，flex 放 View 上，Input 用 `width: 100%`。
- Fixed + Flex：H5 Tailwind 失效 → 用 inline `style={{ position: 'fixed', display: 'flex' }}`。
- 底部 TabBar 重叠：底部固定元素 `bottom: 50`+，列表加底部内边距。
- 原生组件（Camera/Map/Canvas/Video/RecorderManager）：H5 不可用 → 平台判断 + H5 降级。
- 文件上传：H5 readFile 报错 → 用 `Network.uploadFile(tempFilePath)`。
- 后端文件读取：小程序 `file.path` / H5 `file.buffer` → 同时支持两种。
- 文件上传 400 Boundary：手动设置了 Content-Type → 删除 Content-Type header，让 Taro 自动处理。

### 平台检测（直接判断，禁止 useState+useEffect）
```tsx
// ✅ 同时支持微信和抖音小程序
const isMiniApp = [Taro.ENV_TYPE.WEAPP, Taro.ENV_TYPE.TT].includes(Taro.getEnv())
// ❌ 状态延迟导致初始渲染错误 / H5 白屏
const [isMiniApp, setIsMiniApp] = useState(false)
useEffect(() => { setIsMiniApp(...) }, [])
```

### 代码模板
各条目的可套用代码模板（Text 换行 / Input 包裹 / Input+Button Flex / Fixed+Flex / 原生组件 H5 降级）见 `references/cross-platform-cookbook.md`，命中上述问题时读取。

## 11. 原生能力跨端适配

涉及**录音、文件 / 图片上传、相机**等原生能力时，先记住以下硬约束，完整适配模板与踩坑见 `references/cross-platform-cookbook.md`：

- **平台检测先行**：所有原生能力先用 `Taro.getEnv()` 判断平台，为 H5 端提供降级提示，不得在 H5 直接调用小程序专有 API。
- **录音**：在 `useEffect` 中初始化 `RecorderManager`，不在组件顶层调用；交互触发前再次检测平台。
- **上传**：前端用 `Network.uploadFile(tempFilePath)`，不手动 readFile、不手动设 `Content-Type`；后端 Multer 同时支持 `file.path`（小程序）/ `file.buffer`（H5）。存储按平台集成能力规范落地（见第 14 节）。

## 12. 预览链路

### 12.1 实例可预览性评估（实例落地性）

主 SP 的《预览能力注册表》只回答"`miniprogram` 类型原则上可预览"（✅），具体某个项目能否真正预览由本 skill 评估。初始化阶段 `preview_enable` 乐观写 `"enabled"`；进入预览链路时按下表评估，落不了地就回写 `"disabled"` 并告知用户原因。

| 情形 | 实例可预览 | 处理 |
|---|---|---|
| 从零创建（`coze init --template taro`） | ✅ | 必然可预览，保持 `"enabled"`，按 12.2 起预览 |
| 导入的 Taro / 平台默认框架小程序项目 | ✅ | 保持 `"enabled"` |
| 导入的小程序项目**不使用 Taro / 平台默认框架** | ❌ | 回写 `"disabled"`，说明"当前预览链路只支持 Taro / 平台默认框架小程序"，不写 `[dev]` |

**回写为 `"disabled"` 后**：该小程序项目仍可正常开发——改代码、修 bug、加功能、导入适配照常进行，本 skill 的开发/跨端/网络请求等规范在其栈适用范围内仍然适用；只是无法通过 `coze dev` 起常驻预览做可视验证，改用 `pnpm validate` / `pnpm build` 等手段兜底，并向用户说明预览缺口。不要因为预览不可用就拒绝开发该项目。

### 12.2 预览入口：coze CLI
小程序的预览入口与 web 不同，使用 Coze CLI（**不**用手写 `[dev]` shell 脚本）：

- `coze dev`：启动开发环境，**默认端口 5000**，支持热更新（同时启动前端与后端 dev 进程）
- `coze build`：构建生产版本
- `coze start`：启动生产环境

`.coze` 的 `[dev]` 入口指向 coze 开发命令，最终对外暴露 5000 端口（遵循主 SP 的端口不变量）。

### 12.3 `.preview` 文件
按主 SP《`.preview` 文件规范》生成：
```toml
[preview.port]
expose_port = 5000
```
首次创建时加入 `.gitignore`。

### 12.4 热更新（重要约束）
- `coze dev` 启动的前后端进程带热更新，修改**源码**（页面、组件、样式、逻辑）自动重新编译。
- **默认策略**：改源码后等待自动编译完成即可，无需重启。
- **改配置文件不会热生效，必须手动重启**：`config/index.*`（含 `projectName`）、`app.config.ts`、`nest-cli.json`、`tsconfig.json`、`.env` 等。**改完配置后页面没变化是正常的，不代表改错了位置——先重启再验证，不要立刻推翻刚才的改动去别处找。**
- 需要重启时只执行：`cd /workspace/projects && coze dev`。**不要**用 `pnpm dev`、`npm run dev`、`kill`、`pkill` 等任何其他方式。

### 12.5 H5 预览常见定制（确定入口，勿刨源码）
H5 预览态的一些表现由 Taro 配置决定，入口固定，直接改对应处并按 12.4 重启即可，**不要去 `node_modules` 里逆向找来源**：
- **页面/站点标题**：H5 `<title>` 来自 `config/index.*` 的 `projectName`（同时也是 `project.config.json` 的小程序名）。改这里，重启生效。
- **HTML 模板入口**：Taro Vite 模式的 HTML 模板是 `src/index.html`（Vite root 为 `src/`），不是项目根目录的 `index.html`。需要定制 meta/lang/根节点时改这个文件。
- **导航栏标题/颜色**：小程序端导航栏来自 `app.config.ts` 的 `window` 与各页面 `*.config.ts`，与 H5 `<title>` 是两套，别混改。

### 12.6 预览验证
- 服务存活检测**只过滤 TCP 状态为 LISTEN 的进程**，精准定位服务端，排除连接端：
```bash
curl -I --max-time 3 http://localhost:5000
ss -tuln 2>/dev/null | grep -E ':5000[[:space:]]' | grep -q LISTEN && echo "监听中" || echo "未监听"
ss -lptn 'sport = :5000'    # 返回启动端口的进程 pid
```
- **禁止**：任何 `lsof` 命令（检测不出 IPv6 端口，且结合 kill 会误杀）；`netstat -tunlp | grep 5000`（可能误检 50001）；`ps aux | grep node`（只证明进程在，不证明端口监听）；裸 `curl localhost:5000`（服务卡死会阻塞 shell）。
- 验证不通过时不得声称服务正常，必须如实报告并修复。
- 预览是常驻服务，不是一次性测试，启动后保持运行，不得随意终止。
- **禁止按进程名模糊杀进程**（`pkill -f 'taro'`、`pkill -f 'vite'`、`kill $(pgrep ...)` 等）。`dev_run.sh` 以前台 `wait` 守着子进程，任一子进程被 SIGKILL 会触发它的 `cleanup_on_exit` 把整个进程树清掉、5000 端口直接空掉——预览随之消失（排查问题时尤其容易踩，杀的不是目标进程而是预览本身）。需要停服务只按《12.6 预览验证》存活检测拿到的确切 PID 操作，或用 `coze dev` 重启。
- 任何情况下**不 kill 9000 端口**。
- 面向用户沟通时不要用 `localhost:5000` 引导访问；提示用户在右侧预览区配置并绑定开放平台 AppID，完成授权后平台自动展示预览二维码扫码预览。

### 12.7 日志与调试
- `/tmp/coze-logs/dev.log`：`coze dev` 的完整 stdout/stderr（Taro 编译 + NestJS Server），服务启动失败、编译错误、接口 500 都在此。
- `/app/work/logs/bypass/console.log`：浏览器控制台日志，页面渲染异常、前端 JS 报错的首选入口。
- 触发读日志：测试不通过 / 服务启动失败 / 接口超时或 500 / 编译失败。前端问题优先 `console.log → dev.log`；后端问题优先 `dev.log → console.log`。
```bash
tail -n 20 /tmp/coze-logs/dev.log
grep -nE "Error|Exception|Traceback|ERROR" /tmp/coze-logs/dev.log | tail -n 20
```
- 先取证，再诊断根因，修复后只读最新日志（`tail -n 20`）做最小验证。

## 13. 验证与交付

### 13.1 校验（交付前强制）
```bash
pnpm validate
```
- 所有任务在交付前都必须执行 `pnpm validate`（TypeScript + ESLint），并修复所有 error。未执行或仍有 error，禁止交付。

### 13.2 编译检查（仅首次开发 / 复杂改动时强制）
```bash
pnpm build    # 或 pnpm build:web / build:weapp / build:tt / build:server
```
- 仅在新项目首次开发、新功能开发、涉及构建链路/路由/配置/UI 大改、用户明确要求时强制执行并等待成功。
- 非首次开发类简单改动（如仅修复几行 bug）默认不跑 `pnpm build`，执行 `pnpm validate` 即可。

### 13.3 小程序打包配置检查
检查 `project.config.json`（微信）和 `project.tt.json`（抖音），确保排除 assets 目录不被打入小程序包：
```json
"packOptions": { "ignore": [ { "type": "folder", "value": "./assets" } ] }
```
若缺失或值不正确，直接修改对应配置文件补上。

### 13.4 设计一致性检查（涉及 UI 时）
- 新项目、创建/重写页面、UI 大改或换风格时，`design_guidelines.md` 已在首次 UI 写入前创建并被读取；简单 bug/纯后端任务跳过时有明确理由。
- 配色、容器、间距、导航与空/加载/错误状态和 design_guidelines 一致；通用组件优先 `@/components/ui/*`；无 `View/Text` 手搓通用 UI；TabBar 已配置且图标已生成；无硬编码 `px`。

### 13.5 部署链路
小程序部署由 `general-deploy` skill 统一处理（`.coze` 的 `[deploy]`、上线流程），本 skill 不展开。general-deploy 需要时提供本类型部署事实即可：小程序构建/启动走 `coze build` / `coze start`，部署前应完成 13.1–13.3 的校验与打包配置检查。

### 13.6 完工标准（Definition of Done）
- 任务必须执行到用户需求被满足为止，不得以"任务量大"为由中途停止询问"是否继续"；基础架构（数据库表、空页面、配置文件）不等于功能完成。
- 若涉及后端接口，"开发后端接口"必须在内部完成 API 测试 + 前后端匹配验证后才算完成。
- `pnpm validate` 为交付前硬门槛，任何情况下不得跳过；首次开发或复杂改动额外要求 `pnpm build` 成功。
- 构建失败时自动分析报错并修正，重新走完整验证流程，直到通过。
- 交付时简洁告知用户已实现的功能，并提示在右侧预览区绑定 AppID 扫码预览。

## 14. 集成服务

- 集成服务（数据库、对象存储、大语言模型、搜索、上传等）按主 SP《集成服务使用协议》和平台提供的集成能力规范实现。
- **技能优先**：凡平台提供的集成能力，强制优先使用，严禁自建未托管方案（如自建 SQLite 连接、自调 OpenAI API），除非用户明确指定。
- **拒绝幻觉编程**：每个集成服务的使用都必须源自真实的平台集成文档/规范，禁止凭空猜测使用方式。
- **上传/存储**：涉及文件/图片上传时，同时落实"对象存储能力"和"跨端上传规范"（前端 `Network.uploadFile` 正确用法、后端 Multer `file.path`/`file.buffer` 双模式、Content-Type boundary 修复），缺一会导致跨端兼容问题。
- **LLM 集成**：默认流式返回。

## 15. 交付前校验（小程序项目特有）

在主 SP《交付前校验清单》之上，小程序项目另外检查：
1. `.coze` 的 `project_type = "miniprogram"`，`preview_enable` 按《预览能力注册表》写入。
2. 若进入预览：`.preview` 已生成且 `expose_port = 5000` 并加入 `.gitignore`；`coze dev` 启动后 `curl + ss` 确认 5000 监听存活。
3. `pnpm validate` 通过、无 error；首次开发 / 复杂改动已 `pnpm build` 成功。
4. `project.config.json` / `project.tt.json` 的 `packOptions.ignore` 已排除 assets。
5. 涉及后端接口的：API 测试通过 + 前后端匹配验证通过。
6. 通用组件优先来自 `@/components/ui/*`，无 `View/Text` 手搓通用 UI，无硬编码 `px`。
7. 涉及 UI 时，`design_guidelines.md` 已生成或读取，并已完成第 13.4 节的设计一致性检查。
8. 日志（`dev.log` / `console.log`）无新增未处理错误。
9. `AGENTS.md` 记录了技术栈、页面结构、预览方式（coze CLI + 5000）、常见坑点。

## 16. 非协商规则

- 小程序项目预览统一通过 `coze dev` 启动、对外暴露 5000；重启只用 `cd /workspace/projects && coze dev`，不用其他方式。
- 不得对 Node.js 项目使用 `npm` 或 `yarn`。
- 不直接使用 `Taro.request/uploadFile/downloadFile`，统一用 `@/network` 的 `Network`；不自行封装 Network。
- 不硬编码 `localhost` / 域名到请求 URL，统一用 `/api/xxx` 相对路径。
- 通用 UI 组件优先 `@/components/ui/*`，不用 `View/Text` 手搓。
- 新项目、页面创建/重写、UI 大改或换风格时，未在首次 UI 写入前完成 `design_guidelines.md` 的创建/读取和设计清单，不得交付。
- 不硬编码 `px`，常规样式收敛在 Tailwind。
- 涉及后端接口时，未完成 API 测试与前后端匹配验证，不得标记完成。
- 未执行 `pnpm validate` 或仍有 error，禁止交付。
- 不使用、不 kill 9000 端口；端口检测禁用 `lsof`。
- 不得把未通过存活验证的预览声称为"预览成功"。
- 不得修改已创建 `.coze` 的 `[project].sub_id`。
