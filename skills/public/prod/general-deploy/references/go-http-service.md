# Go HTTP Service Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 存在 `go.mod`
- 存在单一 HTTP 入口，例如根目录 `main.go`
- 使用标准库 `net/http` 或其他明确的 HTTP 服务入口
- 服务通过 `PORT` 环境变量或等价参数监听端口
- 仓库没有比这更强的现成 deploy 脚本、wrapper 或 Make target

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "main.go"
requires = ["golang-1.25"]

[deploy]
build = ["bash", "scripts/build.sh"]
run = ["bash", "scripts/run.sh", "-p", "5000"]

[deploy.profile]
kind = "service"
flavor = "web"
```

## Notes

- `project.requires = ["golang-1.25"]` 对应 bundled asset `simple-go-http-service` 的 `go.mod`。如果真实仓库从 `go.mod` 能明确识别出 `1.26`，则应先与 runtime whitelist 对齐再改成 `golang-1.26`。
- 这类仓库通常语义上是后端服务，deploy 表面仍然是 HTTP 服务，因此 `flavor = "web"` 是合理的。
- 优先复用仓库里已有的 deploy 脚本、Make target 或 wrapper；只有在完整扫描后确认缺失、且这个简单模板能覆盖真实行为时，才补建下面的脚本。
- 不要把 `.coze` 写成 `go build ...` / `go run ...` 这样的裸命令；仍然应让 `.coze` 指向脚本入口。
- 如果你看到类似 `build = ["go", "build", ...]` 或 `run = ["go", "run", ...]` 这样的配置，不要把它当作这个模板的“已完成状态”；这说明脚本入口没有落盘，应继续修正。
- 这类 HTTP 服务端口固定为 `5000`；如果源码默认写了 `8080`、`8888` 等其他值，补脚本时也要把 deploy 入口统一收敛到 `5000`，除非用户明确要求保留其他端口。
- 如果脚本位于 `scripts/` 目录，通常应先从 `SCRIPT_DIR` 回到上一层项目根目录再执行构建或启动；不要默认沿用调用时的当前目录。
- 默认不要补写 `deploy.deps`；只有仓库事实明确需要原生依赖时才写。如果没有明确依赖，也不要写成 `deps = []`。

## Script Authoring

当仓库命中了这套模板、`deploy.build` / `deploy.run` 的底层行为已经明确，但脚本文件缺失时，可以补齐下面两个脚本：

- `scripts/build.sh`
- `scripts/run.sh`

不要顺手生成 `[dev]` 对应脚本；本 skill 默认不处理 `[dev]`。

### `build.sh`

职责：

- 只负责构建可执行文件
- 先基于脚本自身位置回到项目根目录再执行
- 优先把产物写到稳定路径，例如 `bin/service`

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

mkdir -p bin
go build -o bin/service .
```

如果仓库不是根目录单一主程序，或真正入口不在当前包，就不要套这份骨架；改为使用仓库里真实的构建入口。

### `run.sh`

职责：

- 只负责启动 HTTP 服务
- 默认端口固定为 `5000`
- 允许保留一个简单的 `-p` 参数解析，与 `.coze` 的 `["bash", "scripts/run.sh", "-p", "5000"]` 保持一致

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT=5000

usage() {
  echo "Usage: $0 -p <port>"
}

while getopts "p:h" opt; do
  case "$opt" in
    p)
      PORT="$OPTARG"
      ;;
    h)
      usage
      exit 0
      ;;
    \?)
      echo "Invalid option: -$OPTARG"
      usage
      exit 1
      ;;
  esac
done

export PORT
exec ./bin/service
```

### Guardrails

- 只有在构建产物路径和启动方式都清晰时，才补 `scripts/build.sh` / `scripts/run.sh`。
- 如果仓库依赖 `air`、`gin`、`cobra`、`make run` 或其他自定义启动链路，就不要强套这份模板。
- 可以先基于脚本自身位置 `cd` 回项目根目录；不要依赖调用者的 `pwd`、`COZE_WORKSPACE_PATH`，或其他额外的 workdir 包装。
- `.coze` 继续引用脚本，不要为了省事改成内联 shell 命令。
- 如果根目录 `.coze` 复用了 `subproj/scripts/build.sh` 或 `subproj/scripts/run.sh`，还要确认脚本内部最终会回到 `subproj` 根目录执行。
- 如果真实入口不在根目录 `main.go`，或 `PORT` 并不是启动入口支持的方式，就不要照抄这份 reference。
