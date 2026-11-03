# Taro Miniprogram + Backend Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 存在 `project.config.json`、`app.json` 或小程序配置
- 存在 `src/app.config.ts`、`src/app.tsx` 或典型 Taro 目录结构
- `package.json` 中存在 `@tarojs/*` 依赖，或存在 `taro build --type weapp` / `taro build --type tt` 脚本
- 存在 `server/package.json` 或其他明确后端服务入口
- 存在 `.cozeproj/scripts/deploy_build.sh`
- 存在 `.cozeproj/scripts/deploy_run.sh`

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "server.js"
requires = ["nodejs-24"]

[deploy]
build = ["bash", ".cozeproj/scripts/deploy_build.sh"]
run = ["bash", ".cozeproj/scripts/deploy_run.sh"]
deps = ["git"]

[deploy.profile]
kind = "miniprogram"

[deploy.backend]
enabled = true
```

## Notes

- 这类仓库是小程序项目，部署画像使用 `kind = "miniprogram"`，不要写成 `kind = "service"`。
- `deploy.profile.flavor` 只属于 service 项目；这里不要写 `flavor = "web"`、`agent` 或 `workflow`。
- `deploy.backend.enabled = true` 表示该小程序包含后端服务壳。本期不支持纯前端小程序部署；如果找不到 `server/`、后端入口或可运行服务脚本，不要写 `enabled = false`，应停止说明缺失信号。
- `project.entrypoint = "server.js"` 是当前 Taro 小程序模板的规范入口占位；如果现有 `.coze` 已经写了可用入口且与模板不冲突，优先保留。
- `project.requires = ["nodejs-24"]` 是这份模板的规范值，同时也在 runtime whitelist 中；如果仓库或现有 `.coze` 有更强的 Node 主版本信号，应先与 runtime whitelist 对齐再决定是否调整。
- 对外后端服务端口固定为 `5000`；通常由 deploy run 脚本读取 `DEPLOY_RUN_PORT`、`PORT` 或等价变量保证。不要把小程序本地预览、Taro dev server 或 NestJS dev 端口写成 deploy 端口。
- `deploy.deps = ["git"]` 是当前模板样例的明确依赖，可以按 reference 写入；如果真实仓库已有不同且可验证的依赖配置，优先保留不冲突项。
- 不要把 `.coze` 命令改写成 `pnpm build`、`taro build`、`pnpm --filter server start` 或其他裸命令；保持脚本入口形式。
- 如果已有 `[dev]` 中的 `pack`、`validate` 等字段，只做保留或必要修正；默认不要主动新增 `[dev]`。

## Script Expectations

已有脚本应满足这些职责：

- `deploy_build.sh`：安装依赖，构建 Taro H5 / weapp / tt 产物，并构建后端服务产物。
- `deploy_run.sh`：只启动后端 HTTP 服务，默认或最终监听 `5000`。
- `pack.sh` / `validate.sh`：如果存在，通常属于 dev / 校验辅助，不是 deploy 必填字段。

如果脚本缺失，只有在完整扫描后确认没有更合适脚本、且仓库的安装/构建/启动动作已经明确时，才补齐脚本；不要凭 Taro 依赖直接编造完整部署脚本。
