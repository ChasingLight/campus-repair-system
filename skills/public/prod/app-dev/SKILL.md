---
name: app-dev
description: 当主 Agent 识别到项目的 `project_type = "app"` 时，使用此 skill 指导该 App 项目的开发生命周期——基于 `coze init --template expo`（Expo + React Native + Express monorepo）从零创建、导入存量项目适配、UI 设计与 Expo 高级场景的渐进式参考读取、Expo Router 路由规范、样式与组件选型、前后端通信与 API 测试、预览链路（coze CLI）。部署由 `general-deploy` skill 统一承接，本 skill 只在其需要时提供 App 部署事实。本 skill 承接 App 类型内部的开发专业细节，不接管主 Agent 的整体工作流。
---

# App Dev Skill

## 1. 定位

本 skill 是 App 类型（`project_type = "app"`）的**常驻开发指引**，面向**基于 `coze init --template expo` 的 Expo + React Native + Express monorepo** 的移动应用开发。主 Agent 在项目初始化阶段识别出 `project_type = "app"` 后，会声明加载本 skill，之后对该 App 项目的所有具体开发、预览决策均以本 skill 为准（部署决策归 `general-deploy` skill）。

定位是：精通 Expo + React Native（前端）+ Express（后端）的全栈移动应用专家，编写现代、优雅、移动优先且 Web 兼容、交互闭环、真实数据驱动的 App 代码。

**职责边界：**
- 承接：App 的脚手架初始化、UI 设计、Expo Router 路由规范、样式与组件选型、React Hooks 与交互、前后端通信与 API 测试、文件上传/媒体、SSE 流式集成、预览命令与验证、App 特有的踩坑预防。
- 不承接：类型识别、`.coze` 双文件体系管理、`[subprojects]` 注册、`sub_id` 生成、`.preview` 文件格式、端口约束（5000 对外暴露、9000 禁用）、`AGENTS.md` 体系、**部署链路（归 `general-deploy` skill）**等——这些由主 Agent SP / general-deploy 定义，本 skill 遵循不重复。

当本 skill 的建议与主 SP 的核心不变量冲突时，以主 SP 为准。

**技术细节以项目实际为准：** 模板会随版本演进，凡涉及目录约定、可用组件、配置入口、命令等具体细节，**初始化后必须先读项目根的 `README.md` 与 `AGENTS.md`**，以项目实际文件为最终依据；本 skill 给出的是稳定的规范与方法。

## 2. 何时使用 / 何时不使用

**使用：**
- `.coze` 的 `[project].project_type = "app"`，且主 Agent 已声明加载本 skill。
- 涉及该 App 项目的：从零创建、导入适配、页面/组件开发、路由配置、前后端通信、后端接口、文件上传、流式集成、预览链路、相关调试和排障（部署链路走 `general-deploy` skill）。

**不使用：**
- 当前操作的项目不是 App 类型（按《类型 skill 路由表》路由到对应 skill）。
- 任务属于主 Agent SP 的通用职责（类型识别、`.coze` 管理、工作流编排、端口约束）。

## 3. 核心开发哲学

- **智能自适应**：简单修改直接动手；复杂功能先思考再行动。
- **结果导向**：代码不仅要能跑，还要易读、易维护，符合 Expo / React Native 最佳实践。
- **移动优先、Web 兼容**：当前环境是 Expo + React Native（Mobile First, Web Compatible），预览跑在 Web 端。优先选兼容三端（Android + iOS + Web）的库；**禁止使用 Web API**（`window`、`document`、`localStorage` 等），必须用 Expo / RN 官方库。
- **设计先行**：新增或重做可见页面前，必须先按第 9.1 节读取 UI 设计参考、确定页面层级和视觉方向，再编写 JSX 与样式；不能把组件库的默认样式当作 UI 设计。
- **前后端并行 / 后端优先**：涉及后端时尽量前后端并行开发；不能并行时优先开发后端，待 API 就绪再对接前端。
- **真实交付，禁止糊弄**：禁止 Mock 数据、占位符代码、TODO 注释、死按钮（有 UI 入口但点击无响应）、占位图容器伪装图片。凡规划要实现的功能必须完整交付且交互闭环。

## 4. 支持的子场景

| 子场景 | 说明 | 主要逻辑位置 |
|---|---|---|
| 从零创建 App 项目 | `coze init --template expo` 初始化 monorepo | 第 5 节 |
| 导入存量 App 项目 | 识别 Expo monorepo 结构并适配 | 第 6 节 |
| 目录结构与职责 | client/server 分层、路由与实现分离 | 第 7 节 |
| Expo Router 路由 | Stack / Tabs 决策、路由一致性、页面开发顺序 | 第 8 节 |
| UI 设计、样式与组件 | 视觉风格选择、布局设计、项目现有样式体系与组件选型 | 第 9 节 |
| Hooks 与交互 | 三段式结构、列表 Hook 禁令、CRUD+Modal | 第 10 节 |
| 后端与前后端通信 | `/api/v1`、Express 路由顺序、接口注释 | 第 11 节 |
| Expo 高级场景、文件上传与媒体 | 瀑布流、文件上传、音频、保存到相册、顶部 Tab | 第 12 节 |
| 集成服务 | 技能优先、SSE 流式 | 第 13 节 |
| 预览链路 | coze CLI 启动 + 验证 | 第 14 节 |
| 部署链路 | 由 `general-deploy` skill 承接 | 第 15 节 |
| 验证与交付 | pnpm validate、curl 冒烟、路由自检 | 第 16 节 |

## 5. 从零创建 App 项目

### 5.1 脚手架初始化（coze CLI）

App 项目通过 Coze CLI 初始化 Expo + Express monorepo（前后端同处一个仓库、用 pnpm workspace 统一管理）模板：

```bash
cd ${COZE_WORKSPACE_PATH} && coze init --template expo
```

- Coze CLI 已内置到沙箱环境中，可直接使用，无需安装。可用 `coze --help` 或 `coze <command> --help` 获取说明。
- 模板是基于 pnpm workspace 的 monorepo：前端 Expo 代码在 `client/`，后端 Express 代码在 `server/`。

**初始化检查顺序（CRITICAL：先确认项目，再探索）：**
- 任何任务开始时，在执行任何"项目探索"之前，必须先确认 `${COZE_WORKSPACE_PATH}` 下已存在可用的 Expo monorepo 结构（`client/`、`server/`、根 `package.json`）。
- 若目录为空或缺关键文件，先执行上面的 `coze init --template expo`。
- 若已存在项目（已有 `client/`+`server/` / `client/app.config.ts`），跳过 `coze init`，按导入路径处理（第 6 节）。

### 5.2 初始化后必读（CRITICAL）

初始化完成后，**必须**立刻读取项目根目录的 `README.md` 与 `AGENTS.md`，明确：
- **目录结构**：清晰区分前端（`client/`，Expo/React Native）与后端（`server/`，Express）的位置和职责。
- **样式与主题方案**：Tailwind/Uniwind、design tokens 入口、组件库位置。
- **运行规范**：启动命令、校验命令、依赖安装约定、路径别名。

**在完成阅读、构建好清晰的项目结构图谱之前，不要开始编写业务代码。** 模板细节以项目实际 `README.md` / `AGENTS.md` 为准。

### 5.3 新建后立即完成的事情

新建后必须确保（与主 SP《项目初始化》衔接）：

1. 在**保留模板预置的 `[dev]` / `[deploy]` / `entrypoint` / `requires` / `validate` 接线不动**的前提下，补齐根 `.coze` 中平台读取所需的字段：`project_type = "app"`、合法 `sub_id`（`openssl rand -hex 4` 生成，创建后不可改）、`name`、`[preview].preview_enable`、`[subprojects].path = ["."]`。
2. `.cozeproj/` 脚手架脚本与 `.coze` 的 `[dev]/[deploy]` 命令是模板核心接线，**禁止破坏**；其中 `[deploy]` 只是部署流程的模板输入事实，不代表本 skill 已完成部署配置，最终部署配置仍由 `general-deploy` 按主 SP《部署配置 gate》确认。
3. 预览链路相关的 `.preview` 留到预览真正触发时再处理（见第 14 节）。
4. 主题模式：分析用户需求，若明确要求固定"暗色"或"亮色"，按项目 `README.md` 指引修改 `client/components/ColorSchemeUpdater.tsx` 的 `DEFAULT_THEME`（默认 `system` 跟随系统，无偏好则不动）。

`.coze` 补齐后示例（脚本路径以模板预置实际为准，不要改其值）：

```toml
[project]
sub_id = "e5d4c3b2"
name = "my-app"
entrypoint = "server.js"
requires = ["nodejs-24"]
project_type = "app"

[preview]
preview_enable = "enabled"

[dev]
build = ["bash", ".cozeproj/scripts/dev_build.sh"]
run = ["bash", ".cozeproj/scripts/dev_run.sh"]
validate = ["bash", ".cozeproj/scripts/validate.sh"]

[deploy]
build = ["bash", ".cozeproj/scripts/prod_build.sh"]
run = ["bash", ".cozeproj/scripts/prod_run.sh"]
build_app_dir = "./client"

[subprojects]
path = ["."]
```

## 6. 导入存量 App 项目

### 6.1 识别信号
- monorepo 结构：`client/` + `server/` + 根 `package.json`（pnpm workspace）。
- Expo 依赖：`expo`、`expo-router`、`react-native`。
- 配置文件：`client/app.config.ts` / `client/app.json`、`client/global.css`。

### 6.2 适配策略
- 读取工作区 `AGENTS.md`（若存在）→ 读 `README.md` 熟悉目录结构、样式方案、可用组件与命令。
- 判断项目状态：**新项目**（README 为模板内容 / `screens` 仅 demo 页）vs **老项目**（有业务页面）。
- 尊重现有栈，不强制重构；在 `AGENTS.md` 中记录识别结果。
- 确认 `.coze` 是否合法；缺 `sub_id` 则生成并写入，缺 `project_type`/`preview_enable` 补齐。

### 6.3 实例可预览性评估（实例落地性）

主 SP 的《预览能力注册表》只回答"`app` 类型原则上可预览"（✅），具体某个项目能否真正预览由本 skill 评估。初始化阶段 `preview_enable` 乐观写 `"enabled"`；进入预览链路时按下表评估，落不了地就回写 `"disabled"` 并告知用户原因。

| 情形 | 实例可预览 | 处理 |
|---|---|---|
| 从零创建（`coze init --template expo`） | ✅ | 必然可预览，保持 `"enabled"`，按 14 节起预览 |
| 导入的 Expo monorepo（含 `client/` Expo Web 入口 + `.cozeproj` 接线） | ✅ | 保持 `"enabled"` |
| 导入的 App 项目**非 Expo / 无可运行的 Web 预览入口 / 无 coze 接线** | ❌ | 回写 `"disabled"`，说明"当前预览链路只支持 coze Expo 模板结构"，不破坏其它配置 |

**回写为 `"disabled"` 后**：该项目仍可正常开发——改代码、修 bug、加功能、导入适配照常进行，本 skill 的开发规范在其栈适用范围内仍然适用；只是无法通过 `coze dev` 起常驻预览做可视验证，改用 `pnpm validate` / 构建等手段兜底，并向用户说明预览缺口。不要因为预览不可用就拒绝开发该项目。

## 7. 目录结构与职责

> 以下为模板默认约定，实际以项目 `README.md` / `AGENTS.md` 为准。

| 路径 | 职责 |
|---|---|
| `client/app/` | Expo Router 路由目录，**仅放路由配置**（`_layout.tsx`、re-export 文件） |
| `client/screens/` | 页面实现目录，与 `app/` 路由一一对应 |
| `client/components/` | 可复用组件；`Screen.tsx` 为页面容器（**所有页面必用**） |
| `client/hooks/` | 自定义 Hooks，含 `useSafeRouter` |
| `client/contexts/` | React Context（如 `AuthContext`） |
| `client/global.css` | Tailwind/Uniwind design tokens 入口（定制主题改这里） |
| `client/assets/` | 静态资源（本地图片用 `require()` 引用） |
| `server/src/index.ts` | Express 服务端入口 |

**路径别名**：`@/` 指向 `client/`，用 `@/components/Screen` 而非 `../../../components/Screen`。

## 8. Expo Router 路由规范

### 8.1 Stack vs Tabs 决策
- **用 Tab Bar（Tabs 导航）**：3-5 个同层级、高频的顶级入口，每个 Tab 有独立导航栈。
- **不用 Tab Bar（Stack 导航）**：单一线性流程（A→B→C），无并列顶级入口。模板默认无 Tab Bar。
- 页面内的顶部子分类 Tab 不属于 Expo Router 的底部 Tab；命中该场景时读取 `references/expo-advanced/top-tab-navigation.md`。

### 8.2 目录结构与配置

**方案一：无 Tab Bar（Stack）**
```
client/app/
├── _layout.tsx        # 根布局（Stack 导航配置）
├── index.tsx          # 应用入口（re-export screens）
├── detail.tsx         # 详情页（params 传数据）
└── +not-found.tsx     # 404
```
> 无 Tab Bar 场景**不得**创建 `(tabs)` 目录。

**方案二：有 Tab Bar（Tabs）**
```
client/app/
├── _layout.tsx              # 根布局（含 <Stack.Screen name="(tabs)" />）
├── (tabs)/
│   ├── _layout.tsx          # Tab 导航配置
│   ├── index.tsx            # 默认 Tab（必须存在）
│   ├── discover.tsx
│   └── profile.tsx
├── detail.tsx               # Tab 外独立页面
└── +not-found.tsx
```
> **CRITICAL**：`app/index.tsx` 优先级高于 `(tabs)/index.tsx`，会导致首页无 Tab Bar。**有 `(tabs)/index.tsx` 时必须删除 `app/index.tsx`**。

**改 `client/app/_layout.tsx` 前必须先读它**，保留以下关键逻辑：`../global.css` 引入（Tailwind 生效关键）、`<Provider>` 包裹、`<Toast />`。

Tab 布局取色用 Uniwind 的 `useCSSVariable`（与模板一致，**不要**用旧的 `useTheme`），并对 Web 端做高度修复：

```tsx
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [background, muted, accent, border] = useCSSVariable([
    '--color-background', '--color-muted', '--color-accent', '--color-border',
  ]) as string[];

  let tabBarStyle = { backgroundColor: background, borderTopWidth: 1, borderTopColor: border };
  if (Platform.OS === 'web') {
    tabBarStyle = { ...tabBarStyle, height: 'auto' };  // 修复 Web 高度异常（必须保留）
  }

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle, tabBarActiveTintColor: accent, tabBarInactiveTintColor: muted }}>
      {/* name 必须与文件名完全一致 */}
      <Tabs.Screen name="index" options={{ title: '首页', tabBarIcon: ({ color }) => <FontAwesome6 name="house" size={20} color={color} /> }} />
      <Tabs.Screen name="discover" options={{ title: '发现', tabBarIcon: ({ color }) => <FontAwesome6 name="compass" size={20} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: '我的', tabBarIcon: ({ color }) => <FontAwesome6 name="user" size={20} color={color} /> }} />
    </Tabs>
  );
}
```

路由文件只放 re-export：`export { default } from "@/screens/home";`

### 8.3 路由一致性强制规则（CRITICAL）

| 规则 | 说明 | 违反后果 |
|---|---|---|
| 根布局必须存在 | `client/app/_layout.tsx` 必须存在 | 应用白屏 |
| Tab name = 文件名 | `<Tabs.Screen name="discover" />` 对应 `(tabs)/discover.tsx` | Tab 点击白屏/无响应 |
| 默认 Tab 必须存在 | `(tabs)/index.tsx` 必须存在 | "Unmatched Route" |
| screens 目录必须存在 | re-export 的 `@/screens/xxx` 必须存在 | 编译失败 |
| Tabs 模式删 app/index | 有 `(tabs)/index.tsx` 时删 `app/index.tsx` | 首页无 Tab Bar |

**禁止**：入口文件用 `<Redirect />`；只建 `Tabs.Screen` 配置不建对应文件；无 Tab 场景建 `(tabs)`。

排查速查：Tab 不显示 → 检查 name 与文件名是否一致；点 Tab 白屏 → 对应 `.tsx` 不存在；启动白屏 → `_layout.tsx` 缺失/语法错；`Unable to resolve "@/..."` → screens 目录不存在或路径错。

### 8.4 页面开发强制顺序（CRITICAL）

```
0. 新增或重做可见页面时，先按第 9.1 节完成 UI 设计参考读取与风格/布局决策
1. 再创建 client/screens/{pageName}/index.tsx   → 完整 UI 与逻辑，确保可渲染
2. 再创建 client/app/{pageName}.tsx             → 仅 re-export screens
3. 最后改 _layout 配置                           → 添加 Stack.Screen / Tabs.Screen
```
违反此顺序会导致路由指向空文件 → 点击白屏 → "Unmatched Route"。

### 8.5 导航方式（CRITICAL）

**严禁**使用原生 `useRouter` / `useLocalSearchParams`（特殊字符编解码问题、类型丢失、不支持嵌套对象），**必须**用 `@/hooks/useSafeRouter` 的 `useSafeRouter` / `useSafeSearchParams`：

```tsx
import { Link } from 'expo-router';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';

const router = useSafeRouter();
router.push('/detail', { id: 123, uri: 'file:///path/%40test.mp3' }); // 发送端不需手动 encode
router.replace('/home', { tab: 'settings' });
router.back();

// 接收端不需手动 decode，类型安全（id 保持 number）
const { id, uri } = useSafeSearchParams<{ id: number; uri: string }>();
```
注意：`(tabs)` 等路由分组名不要写在路径里。

### 8.6 首帧导航就绪与认证重定向（仅含登录功能时）

**禁止**在 `useEffect` 中无条件导航。必须同时检查 `rootState.key`（导航就绪）、`isLoading`（鉴权就绪）、`segments`（路径防抖），防止崩溃或死循环：

```tsx
const rootState = useRootNavigationState();
const segments = useSegments();
const { isAuthenticated, isLoading } = useAuth();

useEffect(() => {
  if (!rootState?.key || isLoading) return;       // 待机检测
  const inLoginRoute = segments.includes('login'); // 路径检测
  if (!isAuthenticated && !inLoginRoute) router.replace('/login');
  if (isAuthenticated && inLoginRoute) router.replace('/');
}, [rootState?.key, isAuthenticated, isLoading, segments]);
```

## 9. 样式与组件

### 9.1 UI 设计参考（CRITICAL，渐进读取）

新增页面、重做现有页面视觉层级或进行整套 UI 改版前，必须先读取 `references/ui-design/guide.md`，依据产品类型选择最适配的一种视觉风格，并读取其对应的 `references/ui-design/styles/*.md`。先确定导航层级、页面布局、配色、字号/间距、卡片/按钮等关键视觉决策，再开始编写页面 JSX 和样式。

- 对导入的成熟项目，既有设计系统、品牌规范或用户提供的设计稿优先；仍需读取该参考的质量要求，但不得用预设风格破坏既有品牌。
- 仅改不可见逻辑、接口、文案或不改变布局层级的局部样式时，不要求重新读取；新增页面或实质重做视觉界面时不得跳过。
- 将选定风格和页面布局决策沉淀到任务计划或交付说明，确保后续页面与预览验收有可追溯的设计依据。

### 9.2 Tailwind / Uniwind（CRITICAL）
模板样式基于 Tailwind v4 + Uniwind，写法是 `className`（**不是** 旧的 `createStyles(theme)` / `StyleSheet` 工厂模式）：

```tsx
<View className="flex-1 bg-white dark:bg-gray-900 p-4">
  <Text className="text-lg font-bold text-foreground">Hello</Text>
</View>
```
- 默认先写 `className`，常规样式（颜色、间距、圆角、flex 等）收敛在类名中。
- 暗/亮色用 `dark:` 变体或语义 token（如 `text-foreground`、`text-muted`）。

### 9.3 主题定制
- design tokens 入口是 `client/global.css`，定制主题色应**阅读并修改 `global.css`**（以项目实际为准）。
- 主题模式（跟随系统/固定暗/固定亮）改 `client/components/ColorSchemeUpdater.tsx` 的 `DEFAULT_THEME`。

### 9.4 组件选型（按项目实际）
- 先检查 `package.json`、项目文档和现有页面，复用已经引入的组件库、设计系统或基础组件；不得为满足本 skill 引入、替换或假定任何指定组件库。
- 需要新增组件依赖时，按需求、Expo SDK 兼容性、Android/iOS/Web 兼容性、维护状态和现有设计体系评估；Expo/RN 官方能力可满足时优先使用。
- 组件库默认样式不能替代第 9.1 节的 UI 设计；库未覆盖的部分使用 React Native 基础组件或项目既有模式实现。

### 9.5 页面容器与图标
- 所有页面**必须**用 `@/components/Screen` 包裹（自动处理安全区、键盘避让、状态栏、沉浸式）。
- 图标用 `@expo/vector-icons` 的 `FontAwesome6`（与模板一致）。

### 9.6 输入与图片
- 文本输入必须用 `TextInput`（`react-native`）或封装的 Input 组件，**禁止**用 `Text` 等纯展示组件当输入框。
- 图片必须用真实组件渲染：`<Image source={{ uri: imageUrl }} />`（`expo-image`），`imageUrl` 来自后端接口或对象存储签名 URL。**严禁**用图标+文字、色块+文字、空 View 容器伪装图片；**严禁** `via.placeholder.com` 等失效/虚构地址。

## 10. React Hooks 与交互

### 10.1 Hooks 基础
- **三段式结构**：声明区（所有 Hooks）→ 守卫/早退区 → 渲染区。严禁在条件/循环/嵌套函数中调用 Hook。
- **引用稳定性**：组件/列表项组件定义在**文件顶层**，不在 render 内定义（否则输入框失焦、无限重渲染）。
- **Effect 依赖**：只依赖原始类型值（string/number/boolean）或稳定引用；对象/数组/函数经 `useMemo`/`useCallback` 稳定化，或依赖其具体字段（如 `params.id` 而非 `params`）；清理定时器/订阅，处理异步竞态。

### 10.2 列表渲染 Hook 禁令（CRITICAL）
`renderItem` / `Array.map` 内（含其调用的普通函数）**禁止**直接或间接调用任何 Hook（包括 `useAnimatedStyle` 等三方 Hook），否则报 `Rendered more hooks than during the previous render`。正确做法：把需要 Hook 的渲染逻辑抽成定义在**文件顶层**的独立 React 组件。

```tsx
// ✅ 顶层组件，各实例有独立 Hook 调用链
function CardItem({ card }) {
  const animatedStyle = useAnimatedStyle(() => ({ /* ... */ }));
  return <Animated.View style={animatedStyle} />;
}
// 父组件
{cards.map((card) => <CardItem key={card.id} card={card} />)}
```

### 10.3 页面返回刷新（useFocusEffect）
列表页/详情页等数据可能在别处被改的场景，**必须**用 `useFocusEffect`（Expo Router 保持页面在栈中不卸载，`useEffect` 返回时不重新执行）：

```tsx
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
useFocusEffect(useCallback(() => { fetchData(); }, []));
```

### 10.4 CRUD + Modal 标准
字段少、需保持上下文、高频的增删改用"列表 + 内置 Modal"：`editingItem` 为空=新增、有值=编辑回显；保存先校验再调 API，成功后关 Modal 并刷新列表。Modal 表单用 `KeyboardAvoidingView` + `ScrollView`（Header/Body/Footer 三段），按钮用 `TouchableOpacity` 区分主次。

### 10.5 动画 transform 字符串拼接
**禁止**将 `withTiming()`/`withSpring()` 返回值直接与字符串拼接（Android 可能产生无效浮点格式崩溃）。必须先用纯数字算好再传给动画函数：

```tsx
// ✅ 正确
const rotateValue = offset * 3;
return { transform: [{ rotate: withTiming(`${rotateValue}deg`) }] };
```

## 11. 后端与前后端通信

### 11.1 API 前缀与访问域名（CRITICAL）
- 所有 Express API 路由**必须**用统一前缀 `/api/v1`，完整端点：`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/{resource}`。
- `EXPO_PUBLIC_BACKEND_BASE_URL` 由系统注入，**禁止**用 `export` 修改；前端直接用 `process.env.EXPO_PUBLIC_BACKEND_BASE_URL` 构建 URL，不需兜底。
- 端口：前端 Expo Web 对外 **5000**，后端 Express **9091**（模板预置，非保留的 9000）。

### 11.2 Express 路由定义顺序（CRITICAL）
Express 按定义顺序自上而下匹配，**动态路由定义在静态路由之前会导致静态路由永不匹配**。必须按优先级排列：

| 优先级 | 类型 | 示例 |
|---|---|---|
| 1 | 精确静态 | `/me`、`/stats` |
| 2 | 多段静态 | `/settings/profile` |
| 3 | 前缀静态+后缀动态 | `/role/:roleId` |
| 4 | 单参数动态 | `/:id` |
| 5 | 多参数动态 | `/:id/posts/:postId` |
| 6 | 通配符 | `/*`（始终最后） |

```typescript
// ✅ 路由文件用相对路径，挂载时加前缀
router.get('/me', getCurrentUser);
router.get('/:id', getUserById);
router.get('/*', handleFallback);
export default router;
// server/src/index.ts
app.use('/api/v1/users', userRouter);  // → /api/v1/users/me
```
路由文件内不要重复写挂载前缀（`router.get('/', ...)` 而非 `router.get('/users', ...)`）。

### 11.3 前端 fetch 接口注释（CRITICAL）
每个调后端的 fetch 前必须加注释，写明服务端文件、HTTP 方法+路由、请求参数**及类型**（以服务端实际接收类型为准）：

```tsx
/**
 * 服务端文件：server/src/index.ts
 * 接口：POST /api/v1/transactions
 * Body：amount: string, categoryId: number, description?: string
 */
const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount, categoryId, description }),
});
```

### 11.4 依赖管理（CRITICAL）
**禁止** `npm` / `yarn`，分目录安装：

| 目录 | 命令 |
|---|---|
| `client/` | `npx expo install <pkg>`（Expo 自动选 SDK 兼容版本） |
| `server/` | `pnpm add <pkg>` |

`npx expo install` 因网络失败时重试 2 次，仍失败改 `pnpm add`。

**官方库优先**：能用 Expo 官方库（`expo-*`）就不用社区库。常见强制替换：`localStorage`→`@react-native-async-storage/async-storage`；触觉反馈→`expo-haptics`；剪贴板→`expo-clipboard`；图片→`expo-image`；录音/播放→`expo-av`；权限→各 Expo 模块自带 `requestPermissionsAsync()`（禁 `PermissionsAndroid`/`react-native-permissions`）。

**禁止动态导入**：前后端均用文件顶部静态 `import`，禁 `import()`/`require()` 加载 JS/TS 依赖（客户端 Metro 需静态分析、服务端 ES Module 不支持 `require`）。**例外**：客户端本地静态资源（assets 图片）必须用 `require('@/assets/xxx')`，且使用前确认文件存在。

## 12. Expo 高级场景、文件上传与媒体

### 12.1 场景参考路由（CRITICAL，渐进读取）

不要在普通 App 开发任务中一次性读取全部高级规则；命中下列任一场景时，必须在实现前读取对应的直接参考文件。一个任务可命中多项。

| 命中场景 | 必须读取 |
|---|---|
| 瀑布流、Pinterest/小红书式双列不等高图片流、交错卡片 | `references/expo-advanced/masonry-layout.md` |
| 上传图片、视频、音频或文件；拍照提交；头像/内容发布；页面间传递本地文件 | `references/expo-advanced/file-upload.md` |
| 录音、语音输入、音效或音频播放 | `references/expo-advanced/audio-record-play.md` |
| 下载或保存图片到设备相册 | `references/expo-advanced/save-to-gallery.md` |
| 页面内顶部子分类 Tab（不是底部 Tab Bar） | `references/expo-advanced/top-tab-navigation.md` |

场景判断、适用边界和参考文件索引见 `references/expo-advanced/guide.md`。未命中时不读取，以控制上下文；命中时参考文件的具体实现约束优先于本节的一般性描述。

### 12.2 文件上传与媒体基础约束

- **前端→后端上传**：用 `FormData`（**禁止** JSON body 传 Base64）；后端 `multer` 接收 `req.file`（**禁止**从 `req.body` 读）。
- **后端处理**：下游要 URL → 传对象存储返回公网签名 URL；要文件引用 → 返回对象存储 key；要 Base64/二进制 → 直接转。**禁止**服务端接口定义本地 URI 参数（本地 URI 仅客户端有效）。
- `expo-file-system` 用 `/legacy` 路径 + 静态 import + `as any`：
  ```typescript
  import * as FileSystem from 'expo-file-system/legacy';
  const content = await (FileSystem as any).readAsStringAsync(fileUri);
  ```
- 前端页面间传文件用 URI 字符串，禁传 Base64。
- 涉及文件上传/媒体时，对象存储按平台集成能力规范实现（见第 13 节）。

## 13. 集成服务

- **技能优先**：平台提供的集成能力（数据库、对象存储、LLM、搜索、上传等）**强制**优先使用，**严禁**自建未托管方案（自建 SQLite、自调 OpenAI API），除非用户明确指定。
- **拒绝幻觉编程**：每个集成的使用都源自真实平台集成文档/规范，禁凭空猜测 API/字段/URL。
- **禁 Mock 冒充**：需要真实调用的集成不得用假数据、硬编码、模拟响应冒充；兜底只能是真实调用失败后的错误处理。

### 13.1 LLM 流式输出（CRITICAL）
涉及 LLM 的功能默认 SSE 流式，**严禁**等全部生成后一次性返回。
- **后端（Express）**：SSE + POST 接口；`res.write()` 逐块发送不缓冲；结束发 `data: [DONE]\n\n`；响应头：
  ```typescript
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  ```
- **前端（RN）**：必须用 `react-native-sse`（RN 的 `fetch` 不完整支持 `ReadableStream`），创建实例自动连接，`addEventListener('message', ...)` 监听，收到 `[DONE]` 关闭连接。**必须**实时增量展示文本，禁止流式期间显示"加载中"占位到结束才一次性渲染。

## 14. 预览链路

### 14.1 预览入口：coze CLI
App 的预览用 Coze CLI（**不**手写 `[dev]` shell 脚本）：
- `coze dev`：首次启动 / 重启前后端服务（先杀占用端口进程再起，带热更新），前端对外 **5000**，后端 **9091**。
- `coze build` / `coze start`：生产构建 / 启动。

`.coze` 的 `[dev]` 已由模板预置指向 `.cozeproj/scripts`，最终对外暴露 5000，遵循主 SP 端口不变量。

### 14.2 热更新（重要约束）
- `coze dev` 起的前后端带热更新，改代码自动重新编译，**默认等自动编译完成即可，无需重启**。
- 仅在改了配置文件（`tsconfig.json`、`app.config.ts`）、`.env`、或热更新明确失效报错时才重启。
- 重启**只执行** `cd ${COZE_WORKSPACE_PATH} && coze dev`，**不要**用 `pnpm dev`、`npm run dev`、`kill`、`pkill` 等任何其它方式。

### 14.3 `.preview` 文件
按主 SP《`.preview` 文件规范》生成，首次创建加入 `.gitignore`：
```toml
[preview.port]
expose_port = 5000
```

### 14.4 预览验证
服务存活检测只过滤 LISTEN 状态：
```bash
curl -I --max-time 3 http://localhost:5000              # Expo Web 前端
curl --max-time 3 http://localhost:9091/api/v1/health   # Express 后端
ss -lptn 'sport = :5000'                                 # 返回监听进程 pid
```
- **禁止** `lsof`（检测不出 IPv6、配合 kill 误杀）、`netstat | grep 5000`（误检 50001）、`ps aux | grep node`（只证进程在不证端口监听）、裸 `curl localhost:5000`（卡死阻塞 shell）。
- 验证不通过不得声称服务正常，必须如实报告并修复。
- 预览是常驻服务，启动后保持运行，不随意终止。**任何情况不 kill 9000 端口。**
- 面向用户沟通**不要**用 `localhost:5000` 引导访问；提示用户在右侧预览区查看。

### 14.5 日志与排障
先取证再诊断根因再修复，修复后只读最新日志做最小验证（`tail -n 50`）。保留首个错误点、完整堆栈、关键时间戳。日志位置以项目实际为准（如 `logs/client.log` 或平台 bypass 日志）；触发读日志：测试不通过 / 服务启动失败 / 接口超时或 500 / 编译失败。

## 15. 部署链路

App 项目的部署由 `general-deploy` skill 统一处理（`.coze` 的 `[deploy]`、构建/启动命令、上线流程），本 skill 不展开。general-deploy 需要时，提供本类型部署事实即可：Expo 模板是 `client/` + `server/` 的 pnpm workspace；模板预置生产构建/启动脚本通常位于 `.cozeproj/scripts/prod_build.sh`、`.cozeproj/scripts/prod_run.sh`；App 构建产物目录事实以模板 `.coze` 中的 `build_app_dir = "./client"` 为准；实际路径和命令必须以当前项目文件为准。

已有模板 `[deploy]` 只能作为 general-deploy 判断和确认的输入，不是跳过部署配置 gate 的依据。

## 16. 验证与交付

App 项目**不要调用 `test_run` 验证 App 内容**；按本节执行静态检查、适用的 `app_check`、API curl、预览存活和日志检查。

### 16.1 静态校验（交付前硬门槛）
```bash
pnpm validate                  # = lint:client + lint:server（各自 tsc --noEmit + eslint）
```
- 所有任务交付前必须执行 `pnpm validate` 并修复所有 error。未执行或仍有 error，**禁止交付**。
- 也可分别 `pnpm -w lint:client` / `pnpm -w lint:server`。
- 前端涉及 plugin 配置改动时额外跑 `cd client && npx expo config > /dev/null` 验证。

### 16.2 后端验证（如有后端代码）
凡写了 Express 代码，必须用 `curl` 真实调用验证：返回 JSON 正确、无 500。
```bash
curl http://localhost:9091/api/v1/health
curl -X POST -H "Content-Type: application/json" -d '{"key":"value"}' http://localhost:9091/api/v1/resource
```
核对前后端匹配：路径、HTTP 方法、参数名、文件上传 name、响应结构层级一致。把"接口实现 + curl 测试 + 前后端匹配验证"作为同一工作单元完成。

### 16.3 路由一致性检查（`app_check`）
当本次改动新增、删除、重命名 `client/screens/` 下的页面，或改动 `client/app/` 路由文件、`_layout.tsx`、Stack/Tabs 配置时，**必须调用 `app_check` 工具**进行路由配置检查；不要只靠人工检查替代。

- 在路由相关文件完成修改后、最终交付前调用一次 `app_check`。
- 根据检查结果修复可适用的问题；若建议与当前项目结构不适用，说明原因并保留本节的人工核对。
- 同时核对：每个 `Tabs.Screen`/`Stack.Screen` 的 name 都有对应 `.tsx`；每个路由文件 re-export 的 screens 目录存在；Tabs 模式已删 `app/index.tsx`。

### 16.4 完工标准
执行到用户需求被满足为止，不以"任务量大"为由中途停问"是否继续"；基础架构（空页面、配置）不等于功能完成。涉及后端的须完成 API 测试+前后端匹配才算完成。构建/校验失败自动分析报错修正并重走验证，直到通过。交付时简洁告知已实现功能，提示在右侧预览区查看。

## 17. 交付前校验（App 项目特有）

在主 SP《交付前校验清单》之上，App 项目另外检查：
1. 根 `.coze` 含 `project_type = "app"`、合法 `sub_id`（8 位十六进制）、`name`、`preview_enable`，且模板预置的 `[dev]`/`[deploy]`/`entrypoint`/`validate` 接线未被破坏。
2. 若进入预览：`.preview` 已生成且 `expose_port = 5000` 并加入 `.gitignore`；`coze dev` 启动后 `curl -I localhost:5000` + `ss -lptn 'sport = :5000'` 确认 5000 监听存活；后端 `curl localhost:9091/api/v1/health` 正常。
3. `pnpm validate` 通过、无 error。
4. 涉及后端接口的：curl 冒烟通过 + 前后端匹配验证通过。
5. 路由一致性：路由相关改动已调用 `app_check`，检查结果中的适用问题已处理或已说明不适用；name 与文件双向一致，Tabs 模式已删 `app/index.tsx`。
6. 新增或重做可见页面已按第 9.1 节读取 UI 设计参考并在预览中核对风格/布局；组件选型遵循第 9.4 节，页面用项目现有的页面容器（模板默认 `@/components/Screen`）包裹，无占位图/死按钮/Mock 数据。
7. 日志无新增未处理错误。
8. `AGENTS.md` 记录技术栈、目录结构、路由模式、预览方式（coze dev + 5000/9091）、常见坑点。

## 18. 非协商规则

- App 项目预览统一通过 `coze dev` 启动、前端对外暴露 5000、后端 9091；重启只用 `cd ${COZE_WORKSPACE_PATH} && coze dev`，不用其它方式。
- 不得对 Node.js 项目使用 `npm` 或 `yarn`；`client/` 用 `npx expo install`，`server/` 用 `pnpm add`。
- 不破坏模板预置的 `.cozeproj/` 脚本与 `.coze` 的 `[dev]/[deploy]` 接线；只补齐主 SP 要求的 `project_type`/`sub_id`/`name`/`[preview]`/`[subprojects]`。
- 所有后端 API 用 `/api/v1` 前缀，前端用 `process.env.EXPO_PUBLIC_BACKEND_BASE_URL` 构建 URL，不硬编码域名/IP/localhost。
- 路由 name 必须与文件名一致；有 `(tabs)/index.tsx` 时删 `app/index.tsx`；导航用 `useSafeRouter`/`useSafeSearchParams`。
- App 项目不要调用 `test_run` 验证 App 内容；按第 16 节完成静态检查、适用的 `app_check`、API curl、预览存活和日志检查。
- 样式与组件实现遵循项目现有体系；页面用项目现有的页面容器（模板默认 `@/components/Screen`）包裹。
- 新增或实质重做可见页面，必须先按第 9.1 节读取 UI 设计参考及选定风格；命中第 12.1 节的 Expo 高级场景时，必须先读取对应专项参考。
- 禁 Web API（`window`/`document`/`localStorage`），官方库优先；禁动态导入 JS/TS 依赖。
- 禁 Mock 数据/占位代码/死按钮/占位图冒充真实交付；禁 Mock 冒充真实集成。
- LLM 集成默认 SSE 流式，实时增量展示。
- 未执行 `pnpm validate` 或仍有 error，禁止交付；涉及后端接口未完成 curl 测试与前后端匹配，不得标记完成。
- 不使用、不 kill 9000 端口；端口检测禁用 `lsof`。
- 不得把未通过存活验证的预览声称为"预览成功"。
- 不得修改已创建 `.coze` 的 `[project].sub_id`。
- 技术细节（目录、组件、配置入口、命令）以项目实际 `README.md` / `AGENTS.md` 为准。
