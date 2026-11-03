---
name: web-dev
description: 当主 Agent 识别到项目的 `project_type = "web"` 时，使用此 skill 指导该 web 项目的开发生命周期——从零创建、导入存量项目适配、开发规范、预览链路、以及交付前统一用 `test_run` 完成验收。部署由 `general-deploy` skill 统一承接，本 skill 只在其需要时提供 web 部署事实。本 skill 承接 web 类型内部的开发专业细节，不接管主 Agent 的整体工作流。
---

# Web Dev Skill

## 1. 定位

本 skill 是 web 类型的**常驻开发指引**。主 Agent 在项目初始化阶段识别出 `project_type = "web"` 后，会声明加载本 skill，之后对该 web 项目的所有具体开发、预览决策均以本 skill 为准（部署决策归 `general-deploy` skill）。

**职责边界：**
- 承接：web 项目的框架选型、脚手架初始化、开发模式、组件规范、状态管理、API 调用模式、预览命令、调试技巧、web 特有的踩坑预防。
- 不承接：类型识别、`.coze` 双文件体系管理、`[subprojects]` 注册、`sub_id` 生成、`.preview` 文件格式、端口约束（5000 对外暴露、9000 禁用）、**部署链路（归 `general-deploy` skill）**等——这些由主 Agent SP / general-deploy 定义，本 skill 遵循不重复。

当本 skill 的建议与主 SP 的核心不变量冲突时，以主 SP 为准。

## 2. 何时使用

- `.coze` 的 `[project].project_type = "web"`，且主 Agent 已声明加载本 skill。
- 涉及该 web 项目的：从零创建、导入适配、代码实现、框架选型、UI/交互、预览链路、相关调试和排障（部署链路走 `general-deploy` skill）。

## 3. 何时不使用

- 当前操作的项目不是 `web` 类型（按《类型 skill 路由表》路由到对应 skill）。
- 任务属于主 Agent SP 的通用职责（类型识别、`.coze` 管理、工作流编排、端口约束）。

## 4. 支持的子场景

| 子场景 | 说明 | 主要逻辑位置 |
|---|---|---|
| 从零创建 web 项目 | 使用默认脚手架初始化 | 第 5 节 |
| 导入存量 web 项目 | 不强制使用默认框架，尊重现有栈 | 第 6 节 |
| 开发规范与最佳实践 | 默认栈、代码组织、API 调用 | 第 7 节 |
| 预览链路 | 填写 `.coze [dev]`、生成 `.preview`、启动验证 | 第 8 节 |
| 交付验收 | 统一用 `test_run` 做静态检查 + 接口冒烟，通过后才 `done` | 第 11 节 |
| 部署链路 | 由 `general-deploy` skill 承接 | 第 9 节 |

## 5. 从零创建 web 项目

### 5.1 默认框架：Next.js

web 项目的**默认推荐框架是 Next.js**。当用户没有明确指定框架偏好时，新建 web 项目默认使用 Next.js。用户指定了其他框架（Vite + React、Nuxt、Remix、SvelteKit、Vue 等）时，尊重用户选择，不强行切换。

### 5.2 脚手架初始化（Coze CLI）

web 项目通过 Coze CLI 初始化。Coze CLI 已内置到沙箱环境中，可直接使用，无需安装；可用 `coze --help` 查看支持的模板。

**CLI 支持三种模板：**

```bash
# Next.js（复杂全栈项目、默认选项；需要后端 API Routes / SSR / 多页面）
coze init ${COZE_WORKSPACE_PATH} --template nextjs

# Vite（轻量级纯前端 SPA、仪表盘、落地页、快速原型）
coze init ${COZE_WORKSPACE_PATH} --template vite

# 原生极简（用户明确要求单文件纯 HTML / CDN 引库 / no build step）
coze init ${COZE_WORKSPACE_PATH} --template native-static
```

**模板选择规则：**
- 默认走 `nextjs`。只有用户明确指定 Vite / React SPA / 纯前端 SPA，或明确要求不用 Next.js / 不要服务端能力时，才用 `vite`；不要仅因需求看起来是轻量页面、小游戏、仪表盘或单页交互就擅自改用 Vite。
- 用户明确表达"单 HTML / 纯原生 / CDN 引库 / no build step / 直接在浏览器打开"等意图时用 `native-static`。
- 进入 `native-static` 时**禁止**手动从零创建 `index.html` 和 `.coze`，必须用上面的命令初始化；HTML 主文件名必须是 `index.html`。
- **CLI 不支持的技术栈（如 Vue、Svelte）走自定义模式**：用对应技术栈的官方命令初始化（如 `pnpm create vue@latest ...`），再按主 SP《`.coze` 规范》手写 `.coze`，确保 `[dev].run` 能起 5000 端口服务。

**初始化产物与约束：**
- 通过 `coze init` 创建的模板项目已预置 `.coze`，能自动处理 build/run（5000 端口）和 HMR；模板模式下 **`.coze` 无需改动**。
- Next.js 模板默认开启 `src/` 目录，并在 `src/components/ui/` 预装 shadcn/ui 组件。
- 模板初始首页是兜底页，按用户需求**直接覆盖**，不要在兜底页基础上叠加。

**初始化后自检（CRITICAL）：**
- 项目必须创建在工作区根目录 `${COZE_WORKSPACE_PATH}` 下，**禁止**留在子目录。
- 若 CLI 把项目建在了子目录，用 `mv` 移动到工作区根目录（父目录已有 `.git`，以父目录为准，注意一并移动隐藏文件），再删空子目录。

### 5.3 新建后立即完成的事情

新建 web 项目后必须确保：
1. `.coze` 包含合法的 `sub_id`、`name`、`project_type = "web"`；`[subprojects].path` 默认 `["."]`（参见主 SP《`.coze` 规范》；模板预置的 `.coze` 若缺这些字段需补齐，但不改动其 `[dev]`/`[deploy]` 启动逻辑）。
2. `.gitignore` 中包含 `.preview`（若框架默认未生成）。
3. `package.json` 的包管理器锁定为 pnpm（`pnpm-lock.yaml` 存在；`npm` 和 `yarn` 的 lock 文件若存在应移除）。

> 模板模式下，预览链路（第 8 节）所需的 `[dev]` 多由模板 `.coze` 预置；只有自定义模式或预置缺失时，才按第 8 节自行补写 `.coze[dev]` 与预览脚本。

## 6. 导入存量 web 项目

### 6.1 识别入口
- 读取工作区 `AGENTS.md`（若存在）。
- 识别框架：检查 `next.config.*`、`vite.config.*`、`nuxt.config.*`、`remix.config.*`、`package.json` 的 `scripts` 与 `dependencies`。
- 识别渲染模式：SSR / CSR / SSG / ISR；App Router 还是 Pages Router；是否有 API Routes 或 Server Actions。
- 识别 UI 体系：组件库（shadcn/ui、Ant Design、Material UI 等）、样式方案（Tailwind、CSS Modules、CSS-in-JS）。
- 识别状态管理：Zustand / Redux / Jotai / React Query / SWR / 无。

### 6.2 适配策略
- **不强制迁移到默认框架**。存量项目继续使用其原有栈，除非用户明确要求迁移。
- 在 `AGENTS.md` 中记录识别结果，便于后续会话快速恢复。
- 确认 `package.json` 包管理器：若发现 `package-lock.json` 或 `yarn.lock`，与用户确认迁移到 pnpm 的方式，不要擅自删除。
- 确认 `.coze` 是否合法；若缺失 `sub_id`，生成并写入。

### 6.3 实例可预览性评估（实例落地性）

主 SP 的《预览能力注册表》只回答"`web` 类型原则上可预览"（✅），具体某个**导入项目**能否真正预览，由本 skill 评估。初始化阶段 `preview_enable` 乐观写 `"enabled"`；进入预览链路时按下表评估，落不了地就回写 `"disabled"` 并告知用户原因。

| 情形 | 实例可预览 | 处理 |
|---|---|---|
| 从零脚手架创建（nextjs/vite/native-static） | ✅ | 必然可预览，保持 `"enabled"` |
| 导入项目有 dev server（Next.js/Vite/Nuxt 等支持栈） | ✅ | 保持 `"enabled"`，按第 8 节起预览 |
| 导入项目只有构建产物、无 dev server | ✅（需配静态服务器） | 用框架自带 preview 或最小静态服务器承载（见 8.5） |
| 导入项目用我们不支持的栈/工具链、无可运行的预览入口 | ❌ | 回写 `"disabled"`，说明"当前预览链路不支持该栈"，不写 `[dev]` |
| 纯库（npm package），无可访问界面 | ❌ | 回写 `"disabled"` |

**回写为 `"disabled"` 后**：该 web 项目仍可正常开发——改代码、修 bug、加功能、导入适配照常进行，本 skill 第 7 节开发规范仍适用；只是无法通过常驻预览做可视验证，改用构建/类型检查/lint 兜底，并向用户说明预览缺口。不要因为预览不可用就拒绝开发该项目。

## 7. 开发规范

### 7.1 技术栈偏好
| 维度 | 默认推荐 | 备注 |
|---|---|---|
| 框架 | Next.js (App Router) | Vite + React / Nuxt / Remix 等按用户需求 |
| 包管理器 | pnpm | **强制**，禁止 npm/yarn |
| 语言 | TypeScript | 存量 JS 项目不强制迁移 |
| 样式 | Tailwind CSS | 存量项目尊重现有方案 |
| 组件库 | shadcn/ui（如需系统化组件） | 按项目需要 |
| 数据请求 | 项目已有方案优先 | 新建默认 `fetch` + React Query / SWR |
| 状态管理 | 优先 React 自带能力 + URL state | 复杂场景用 Zustand |
| 表单 | React Hook Form + Zod | 按需引入 |

### 7.2 代码组织
- App Router 项目遵循 `app/` 目录约定；Pages Router 遵循 `pages/` 约定。
- API 相关代码集中于 `app/api/`（App Router）或 `pages/api/`（Pages Router）。
- 组件按功能分层：`components/ui/`（基础组件）、`components/<feature>/`（业务组件）。
- 工具函数统一放 `lib/` 或 `utils/`；类型定义放 `types/` 或就近声明。

### 7.3 全栈项目内的前后端通信
- 当前版本是**单产物形态**：web 项目内若同时包含前端与后端（如 Next.js 全栈、带 API Routes / Server Actions 的项目），前后端在同一进程或同一构建内协作。
- 前端调用本项目自身的后端接口时，使用**相对路径**（如 `/api/...`），不要硬编码任何域名、IP 或 `localhost`。
- 若 web 项目需要调用一个**外部已部署服务**，把该服务的地址作为项目自身的运行时配置（环境变量 / 配置文件）管理，并在 `AGENTS.md` 中记录来源；不要把地址散落硬编码在业务代码里。

### 7.4 AI / LLM 能力集成
- 默认采用流式返回（SSE、ReadableStream、`next/server` 流式响应）。
- 遵循项目现有集成方式或平台托管能力；不凭空猜测 SDK 接口、URL、鉴权格式。

## 8. 预览链路

### 8.1 前置检查
进入预览链路前确认主 Agent 已判断该项目 `preview_enable = "enabled"`（查《预览能力注册表》，web 类型为 ✅）。

### 8.2 `.preview` 文件
按主 SP《`.preview` 文件规范》生成或更新：
```toml
[preview.port]
expose_port = 5000            # 当前版本单产物单预览，固定 5000
```

- 首次创建时加入 `.gitignore`。

### 8.3 `.coze` 的 `[dev]` 填写
web 项目的预览链路分为 **build** 和 **run** 两步，分别对应 `.coze` 的 `[dev].build` 和 `[dev].run`：

```toml
[dev]
build = ["bash", "scripts/build.sh"]
run = ["bash", "scripts/run.sh"]
```

脚本的实际文件名按脚手架生成或存量项目现有约定即可（如 `scripts/build.sh` / `scripts/run.sh`、`scripts/coze-preview-build.sh` / `scripts/coze-preview-run.sh` 等），skill 不硬性约定。

### 8.4 预览脚本

**build 脚本职责与限制：**
- 只做短时准备：安装依赖、校验环境、执行一次性预备动作
- 失败即退出，**不启动常驻进程**
- Node 项目统一用 `pnpm`
- 使用 `set -euo pipefail`
- 基于脚本自身位置定位项目目录，不依赖调用处的 CWD

最简 build 脚本示例：
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

pnpm install --frozen-lockfile
```

**run 脚本职责与限制：**
- 启动常驻预览服务
- 使用 `set -euo pipefail`
- 基于脚本自身位置定位项目目录，不依赖调用处的 CWD
- 从 `.preview` 读取 `expose_port`，读取不到 fallback 到 5000
- 绑定 `0.0.0.0`（IPv4 全接口），禁止绑定 `127.0.0.1` 或 `[::1]`
- 具备幂等性：每次执行先清理 `expose_port` 上的残留进程再重新启动
- 用 `exec` 启动最终常驻进程
- **绝不** kill 9000 端口

最简 run 脚本示例：
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 从 .preview 读取 expose_port，读取不到 fallback 5000
EXPOSE_PORT=$(awk -F '[ =]+' '/^expose_port/ {gsub(/[^0-9]/, "", $2); print $2; exit}' .preview 2>/dev/null || echo 5000)
export PORT="$EXPOSE_PORT"

# 清理残留（绝不碰 9000）
fuser -k "${EXPOSE_PORT}/tcp" 2>/dev/null || true
sleep 1

# Next.js 默认启动
exec pnpm exec next dev --hostname 0.0.0.0 --port "$EXPOSE_PORT"
```

**框架特定启动命令：**
- Next.js: `pnpm exec next dev --hostname 0.0.0.0 --port "$EXPOSE_PORT"`
- Vite: `pnpm exec vite --host 0.0.0.0 --port "$EXPOSE_PORT"`
- 已有 package script：只有在 `pnpm run dev -- --host 0.0.0.0 --port "$EXPOSE_PORT"` 能干净映射到底层时才这样包装；否则直接调框架 CLI。

### 8.5 静态预览
若项目没有 dev server 只有构建产物：
- build 脚本负责执行构建（产出 `dist/` 或 `.next/` 等）
- run 脚本用最小必要的静态服务器（如 `serve`）在 `EXPOSE_PORT` 提供产物
- 尽量选框架自带的 preview 能力（如 `vite preview`、`next start`），不默认引入新依赖

### 8.6 验证：预览存活自检 vs 交付验收

**代码层面的验证（静态检查、类型检查、lint、服务探活、接口冒烟）一律通过 `test_run` 工具执行，见第 11 节。严禁用 `exec_shell` 跑 `pnpm lint/build/ts-check` 或 `curl http://localhost:5000` 来"先自己看看行不行"从而绕过 `test_run`。**

预览刚拉起、需要快速确认服务是否起来时，可临时用以下命令排障（**仅排障，不作为验收证据，也不得替代 `test_run`**）：
- `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:5000` 是否返回 `200`
- `ss -lptn "sport = :5000"` 监听地址是否为 `0.0.0.0:5000`（不是 `[::1]:` 或 `127.0.0.1:`）

**服务存活 ≠ 页面可用**：HTTP 200 + 端口监听只证明服务起来了，不证明页面真的渲染正常。声称"预览可用/页面正常"前，还要读浏览器 console 日志（见第 10 节）确认无运行时报错、页面渲染出预期内容，而不是凭 200 下结论。

> 说明：`localhost:5000` 这类地址仅供 agent 在沙箱内自检，**不要**作为访问入口告诉用户。

### 8.7 HMR / 热更新
- Next.js / Vite 等框架在 dev 模式下默认启用 HMR；保留其原生能力，不额外改动。
- 若 HMR 在沙箱环境下失效，先查 WebSocket 端口、proxy 设置、是否绑定到 `0.0.0.0`，再决定是否降级为整页刷新。

## 9. 部署链路

web 项目的部署由 `general-deploy` skill 统一处理（`.coze` 的 `[deploy]`、构建/启动命令、上线流程），本 skill 不展开。general-deploy 需要时，提供本类型部署事实即可：Next.js 构建产物在 `.next/`、Vite + React SPA 在 `dist/`（纯静态，需静态服务器承载）、Node SSR 项目启动时从环境变量读端口。

## 10. 调试与常见问题

排障日志入口（`/app/work/logs/bypass/`）：
- `console.log`：浏览器控制台输出，前端运行时报错、页面渲染异常的首选定位入口。
- `dev.log`：dev server 的 stdout/stderr，服务启动失败、编译错误看这里。
- `app.log`：应用运行时日志。

前端问题先读 `console.log`，服务/构建问题先读 `dev.log`，按报错给出的位置定位后再改（见主 SP《工具与调试》）。

### 10.1 HMR 不生效
- 检查是否监听 `0.0.0.0`；若绑定到 `127.0.0.1` 或 `[::1]`，外部访问不到，HMR 的 WebSocket 也会失败。
- 检查是否有反向代理吃掉 WebSocket upgrade header。

### 10.2 端口已占用
- 先确认是不是上次预览进程没退出；优先复用可用的旧进程，其次通过 `fuser -k 5000/tcp` 清理后再拉起。
- 绝不碰 9000 端口。

### 10.3 构建时依赖冲突
- 优先检查 `pnpm-lock.yaml` 是否过期；确认没有意外的 npm/yarn lock 文件干扰。
- 使用 `pnpm install --frozen-lockfile` 锁定依赖；只有在明确需要升级时才重新解析 lock。

### 10.4 接口 404 / 取不到数据
- 确认前端调用的是相对路径（`/api/...`），不是硬编码的 `localhost` 或外部域名。
- 确认 API Route / Server Action 的路径与前端调用一致；打印响应体确认数据嵌套层级再取值。

## 11. 交付前校验：test_run 验收协议（web 项目特有）[CRITICAL]

web 项目的交付验收**只认 `test_run`**——它是执行静态检查、服务探活与接口冒烟的唯一指定工具，严禁用 shell 命令替代。在主 SP《交付前校验清单》之上，web 项目必须按下面协议验收通过后才能 `done`。

### 11.1 唯一工具与硬性时序
- 所有构建 / 静态检查 / 类型检查 / lint / 服务探活 / 接口冒烟，一律走 `test_run`；禁止用 `exec_shell` 跑 `pnpm lint`、`pnpm build`、`pnpm ts-check`、`curl http://localhost:5000` 等做自验证。
- 流程是：改完代码 → `test_run` → 有失败就修 → **重新 `test_run` 回验失败项**（已通过的无需重复），直到通过。
- **最后一次成功的 `test_run` 必须发生在最后一次代码修改之后**：只要 `test_run` 通过后又改动了任何代码，就必须重新跑，否则视同未验证。
- `test_run` 未通过前**禁止调用 `done`**。

### 11.2 接口冒烟（有 API 时必做，且 `commands` 不得为空）
- 项目存在 API 路由（`app/api/**/route.ts`、`pages/api/**` 或框架等价物）时，**必须**先扫描列出接口清单，再为**每个**接口至少构造一条真实 curl 放进 `test_run` 的 `commands`，覆盖率要求 100%。
- **只跑 `{"commands":[]}` 就交付 = 后端从未被真实请求过，视同未完成验证。** 空数组仅在"项目确实没有任何 API""或已知代码未变、仅复核静态检查+探活"时才允许。
- 一次性把所有接口的 curl 放进**同一个** `commands` 数组；不要分多次调用，也不要先空跑一轮只看 lint 再补冒烟。
- 构造**有效参数**触发正常业务逻辑：GET 无需 `-d`；POST/PUT 带 `-H 'Content-Type: application/json' -d '{...}'`；动态路由用合理测试 ID。
- **HTTP 200 ≠ 通过**：必须看响应体是正常业务数据（如 `{"success":true,...}`）；返回 `{"error":...}` 或缺字段即失败，修参数/代码后重测。
- 端口按惯例写 `localhost:5000` 即可，多 worktree 场景 `test_run` 会自动改写到当前 worktree 的 dev server 端口。

调用示例：
```json
{
  "commands": [
    "curl -s http://localhost:5000/api/foo",
    "curl -s -X POST -H 'Content-Type: application/json' -d '{\"topic\":\"AI\",\"count\":3}' http://localhost:5000/api/bar"
  ]
}
```

### 11.3 修复策略
- `test_run` 返回多类错误时**并行分析、并行修复、一次性重跑**，禁止"修一个错→跑一次→再修下一个"的串行循环。
- 同一问题"测试-修复"尝试 **5 次**仍失败，立即停止并在总结中如实告知用户。

### 11.4 web 项目结构自检（test_run 之外的静态项）
1. `.gitignore` 包含 `.preview`。
2. 包管理器为 pnpm，`pnpm-lock.yaml` 存在且一致；无 `package-lock.json` 或 `yarn.lock` 残留。
3. 预览 build / run 脚本均从 `.preview` 读取端口、未 hardcode；run 脚本绑定 `0.0.0.0`、使用 `exec` 启动常驻进程、具备端口清理的幂等性。
4. 前端调用本项目接口使用相对路径，未硬编码域名 / IP / localhost。
5. `AGENTS.md` 记录了当前 web 项目的技术栈、路由模式、数据获取方式、预览脚本位置、常见坑点。

## 12. 非协商规则

- web 项目预览对外只暴露 5000，不 hardcode 端口到代码里——必须从 `.preview` 读取，读不到 fallback 5000。
- 不得对 Node.js 项目使用 `npm` 或 `yarn`。
- 前端调用本项目接口统一走相对路径，不硬编码域名 / IP / localhost。
- **代码验证只用 `test_run`**：禁止用 `exec_shell` 的 `pnpm lint/build/ts-check`、`curl http://localhost:5000` 等自验证绕过 `test_run`。
- **有 API 的项目 `test_run` 的 `commands` 不得为空**：每个接口至少一条真实 curl，空数组交付视同未验证。
- **最后一次代码修改之后必须有一次成功的 `test_run`，`test_run` 未通过前禁止 `done`。**
- 不得把仅"端口返回 200"当作"预览/页面成功"：页面可用需读 console 日志确认无运行时报错、渲染正常。
- 不得修改已创建 `.coze` 的 `[project].sub_id`。
