# Vite Frontend-as-Service Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 存在 `package.json`
- 存在 `vite.config.ts` 或 `vite.config.js`
- 存在 `index.html`
- 存在 `src/main.*`、`src/index.*` 或其他典型前端入口
- 不存在明确的服务端入口或现成服务壳，例如 `server/server.ts`、`server/index.ts`、`app.js`、`main.go`、`src/main.py`

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "index.html"
requires = ["nodejs-24"]

[deploy]
build = ["bash", "scripts/build.sh"]
run = ["bash", "scripts/run.sh"]

[deploy.profile]
kind = "service"
flavor = "web"
```

## Notes

- 当前平台不支持把 Vite 纯前端项目按纯静态站点单独部署；即便仓库只有前端代码，也要按 `service` 方式交付。
- 这类项目的关键不是把 `.coze` 停在“前端构建完成”，而是要补齐一个能在服务端把构建产物提供出来的 `deploy.run`。
- `project.requires = ["nodejs-24"]` 是这份模板的规范值，同时也在 runtime whitelist 中；如果仓库或现有 `.coze` 有更强的 Node 主版本信号，应先与 runtime whitelist 对齐再决定是否调整。
- 端口固定为 `5000`；不要把 Vite 开发端口 `5173`、`4173` 或其他本地预览端口直接写进 `.coze`。
- `deploy.build` 和 `deploy.run` 保持脚本入口形式，不要改成 `bash -c` / `bash -lc` / `pnpm vite build` / `pnpm vite preview` 这类内联命令。
- 如果脚本位于 `scripts/` 目录，通常应先从 `SCRIPT_DIR` 回到上一层项目根目录再执行安装、构建或启动；不要默认沿用调用时的当前目录。
- 如果仓库其实已经有明确的服务端壳，例如 Express、Koa、Fastify 或自定义 Node server，不要命中这份模板，应优先复用现有服务壳对应的脚本和入口。

## Script Authoring

当仓库命中了这套模板、`deploy.build` / `deploy.run` 的底层行为已经明确，但脚本文件缺失时，可以补齐下面两个脚本：

- `scripts/build.sh`
- `scripts/run.sh`

不要顺手生成 dev 脚本；本 skill 默认不处理 `[dev]`。

### `build.sh`

职责：

- 只负责安装依赖和构建前端产物
- 优先沿用仓库已确认的包管理器；常见是 `pnpm`
- 不要在 build 脚本里启动服务

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building frontend with Vite..."
pnpm vite build
```

### `run.sh`

职责：

- 只负责启动一个服务进程来提供构建产物
- 端口固定为 `5000`
- 不要依赖 Vite dev server 或 `vite preview`

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${DEPLOY_RUN_PORT:-5000}"

exec npx serve dist -l "$PORT"
```

### Guardrails

- 可以先基于脚本自身位置 `cd` 回项目根目录；不要依赖调用者的 `pwd`、`COZE_WORKSPACE_PATH`，或额外的 workdir 包装。
- 不要把 `.coze` 写成 `pnpm vite preview`；那是预览命令，不是这里的规范部署方式。
- 只有在 `package.json`、锁文件或现有脚本已经足够证明使用 `pnpm` 时，才写 `pnpm`。
- 如果根目录 `.coze` 复用了 `subproj/scripts/build.sh` 或 `subproj/scripts/run.sh`，还要确认脚本内部最终会回到 `subproj` 根目录执行，而不是留在仓库根。
- 如果构建产物目录不是 `dist`，要先确认仓库配置里的真实输出目录，再调整脚本，不要想当然写死。
