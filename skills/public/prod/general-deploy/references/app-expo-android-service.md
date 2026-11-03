# Expo Android App + Backend Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 存在 `client/app.config.ts`、`client/app.config.js` 或 Expo / React Native 配置
- `client/package.json` 中存在 `expo`、`expo-router`、`react-native` 等 Android App / Expo / React Native 依赖
- 存在 `server/package.json` 或其他明确后端服务入口
- 存在 `.cozeproj/scripts/prod_build.sh`
- 存在 `.cozeproj/scripts/prod_run.sh`
- 根目录 `.coze` 或仓库结构明确指向 `build_app_dir = "./client"`

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "server.js"
requires = ["nodejs-24"]

[deploy]
build = ["bash", ".cozeproj/scripts/prod_build.sh"]
run = ["bash", ".cozeproj/scripts/prod_run.sh"]
build_app_dir = "./client"

[deploy.profile]
kind = "android"

[deploy.backend]
enabled = true
```

## Notes

- App 就是 Android：这类 Expo / React Native 仓库部署画像使用 `kind = "android"`，不要写成 `kind = "service"`，也不要引入单独的 `app` kind。
- `deploy.profile.flavor` 只属于 service 项目；这里不要写 `flavor = "web"`、`agent` 或 `workflow`。
- `deploy.backend.enabled = true` 表示该 Android App 包含后端服务壳。本期不支持纯前端 Android 部署；如果找不到 `server/`、后端入口或可运行服务脚本，不要写 `enabled = false`，应停止说明缺失信号。
- `deploy.build_app_dir` 必须指向真实客户端目录，常见为 `./client`。如果目录不存在，不要猜其他路径。
- `project.entrypoint = "server.js"` 是当前 Expo App 模板的规范入口占位；如果现有 `.coze` 已经写了可用入口且与模板不冲突，优先保留。
- `project.requires = ["nodejs-24"]` 是这份模板的规范值，同时也在 runtime whitelist 中；如果仓库或现有 `.coze` 有更强的 Node 主版本信号，应先与 runtime whitelist 对齐再决定是否调整。
- 对外后端服务端口固定为 `5000`；通常由 `prod_run.sh` 内的 `PORT="${PORT:-5000}"` 或等价逻辑保证，不要在 `.coze` 里改成 `3000`、`9091` 或 Expo dev server 端口。
- 不要把 `.coze` 命令改写成 `pnpm run build`、`pnpm --prefix server start`、`expo start` 或其他裸命令；保持脚本入口形式。
- 如果 `.cozeproj/scripts/prod_build.sh` / `prod_run.sh` 内部依赖当前目录，应确认它们从 `.coze` 所在目录执行时会落在 App 项目根目录。
- 对根 `.coze` 调度子项目脚本的结构，例如 `deploy.build = ["bash", "projects/.cozeproj/scripts/prod_build.sh"]`、`deploy.build_app_dir = "./projects/client"`、`[subprojects] path = ["projects"]`，脚本内部必须通过 `SCRIPT_DIR` 推导 `ROOT_DIR` 到 `projects` 目录；不要使用 `ROOT_DIR="$(pwd)"`，否则 BuildZip 阶段会在仓库根执行安装/构建。
- 默认不要新增 `[dev]`；如果已有 `[dev]`、`validate` 等字段，只做保留或必要修正。

## Script Expectations

已有脚本应满足这些职责：

- `prod_build.sh`：安装根工作区依赖，并构建后端服务产物，常见动作是 `pnpm install` 后在 `server/` 执行 `pnpm run build`。
- `prod_run.sh`：只启动后端 HTTP 服务，默认监听 `5000`，常见动作是在 `server/` 中以 `PORT=5000` 执行生产启动脚本。
- 两个脚本都应先计算 `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"`，再用 `ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"` 或等价逻辑回到包含 `client/`、`server/`、根 `package.json` 的 App 项目目录。

如果脚本缺失，只有在完整扫描后确认没有更合适脚本、且仓库的安装/构建/启动动作已经明确时，才补齐脚本；不要凭 Expo 依赖直接编造完整部署脚本。
