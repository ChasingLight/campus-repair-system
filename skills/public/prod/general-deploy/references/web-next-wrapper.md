# Web Next Wrapper Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 存在 `.cozeproj/scripts/deploy_build.sh`
- 存在 `.cozeproj/scripts/deploy_run.sh`
- 常见还会存在 `.cozeproj/scripts/dev_build.sh` 和 `.cozeproj/scripts/dev_run.sh`
- 存在 `package.json`
- 项目是 Next.js 或类似的 Node HTTP 服务

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "server.js"
requires = ["nodejs-24"]

[deploy]
build = ["bash", ".cozeproj/scripts/deploy_build.sh"]
run = ["bash", ".cozeproj/scripts/deploy_run.sh"]

[deploy.profile]
kind = "service"
flavor = "web"

[deploy.backend]
enabled = true
```

## Notes

- 不要把这套模板“简化”为直接写 `pnpm run build` 或 `pnpm run start`；包装脚本通常还处理工作目录、端口和其他环境细节。
- `project.requires = ["nodejs-24"]` 是这份模板的规范值，同时也在 runtime whitelist 中；如果仓库或现有 `.coze` 有更强的 Node 主版本信号，应先与 runtime whitelist 对齐再决定是否调整。
- 这类 HTTP 服务端口固定为 `5000`；如果脚本需要端口参数或环境变量，应由脚本自身处理，不要在 `.coze` 里用 `bash -c` / `bash -lc` 注入。
- 如果包装脚本内部已经固定使用 `pnpm`，就保留 `pnpm`，不要改写成 `npm` 或 `yarn`。
- `.cozeproj/scripts` 下的脚本通常不在项目根目录；如果脚本需要访问 `package.json`、`.next`、`node_modules` 或其他项目文件，应先基于脚本自身位置回到项目根目录，通常是 `SCRIPT_DIR/../..`，不要默认沿用调用时的当前目录。
- 只有用户明确要求时才处理 `[dev]`；本 skill 默认不新增 `[dev]`。
- 如果现有 `.coze` 已经写了同一路径的包装脚本命令，优先保留。

## Script Authoring

当仓库命中了这套模板、`deploy.build` / `deploy.run` 的底层命令也已经明确，但脚本文件缺失时，可以补齐下面两个脚本：

- `.cozeproj/scripts/deploy_build.sh`
- `.cozeproj/scripts/deploy_run.sh`

不要顺手生成 `dev_build.sh` / `dev_run.sh`；本 skill 默认不处理 `[dev]`。

### `deploy_build.sh`

职责：

- 只负责安装依赖和构建
- 使用仓库已经确认的包管理器；这套模板默认是 `pnpm`
- 不要在 build 脚本里启动服务

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

echo "Installing dependencies..."
pnpm install

echo "Building the project..."
pnpm run build

echo "Build completed successfully!"
```

### `deploy_run.sh`

职责：

- 只负责启动 HTTP 服务
- 端口固定为 `5000`
- 可以保留一个很薄的包装函数，但不要把复杂逻辑堆进脚本

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

PORT="${DEPLOY_RUN_PORT:-5000}"

start_service() {
  echo "Starting HTTP service on port ${PORT} for deploy..."
  pnpm run start --port "${PORT}"
}

start_service
```

### Guardrails

- 可以先基于脚本自身位置 `cd` 回项目根目录；不要依赖调用者的 `pwd`、`COZE_WORKSPACE_PATH`，或额外的 workdir 包装。对于 `.cozeproj/scripts/*`，项目根目录通常是脚本目录的上上级。
- 不要把 `.coze` 改成 `pnpm run build` / `pnpm run start` 这种裸命令；仍然要让 `.coze` 指向脚本。
- 只有在 `package.json`、锁文件或现有脚本已经足够证明使用 `pnpm` 时，才写 `pnpm`。
- 如果根目录 `.coze` 或上层项目复用了 `subproj/.cozeproj/scripts/...`，还要确认 `pnpm install` / `pnpm run build` / `pnpm run start` 实际发生在 `subproj` 根目录，而不是仓库根。
- 如果仓库不是 `next start --port` 这一类启动方式，就不要套这份脚本骨架。
