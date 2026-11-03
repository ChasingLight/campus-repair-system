# Python HTTP Service Template

当仓库明显命中下面这些特征，且没有更强的 Agent / Workflow 语义时，使用这份 reference：

- 存在 `scripts/setup.sh`
- 存在 `scripts/http_run.sh`
- 常见还会存在 `scripts/local_run.sh`
- 存在 `src/main.py`
- 存在 `pyproject.toml` 或 `requirements.txt`
- 不存在平台项目类型 Agent / Automation 这类强语义输入
- 不存在明确的 `src/agents/agent.py`、`agent_llm_config.json`、`src/graphs/graph.py`、`StateGraph` 等 Agent / Workflow 结构信号

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "src/main.py"
requires = ["python-3.11"]

[deploy]
build = ["bash", "scripts/setup.sh"]
run = ["bash", "scripts/http_run.sh", "-p", "5000"]
deps = ["git"]

[deploy.profile]
kind = "service"
flavor = "web"

[deploy.backend]
enabled = true
```

## Notes

- 这个模板用于普通 Python HTTP service；如果仓库或平台项目类型明确是 Agent，应改用 `python-agent-service.md` 并写 `flavor = "agent"`。
- 如果仓库或平台项目类型明确是 Workflow / Automation，应改用 `python-workflow-service.md` 并写 `flavor = "workflow"`。
- 不要仅凭 `src/main.py -m http` 就把所有 Python 项目都压成 `flavor = "web"`；先判断业务语义，再判断 HTTP 启动形态。
- `project.requires = ["python-3.11"]` 是这份模板的规范值，同时也在 runtime whitelist 中；如果仓库或现有 `.coze` 有更强的 Python 主版本信号，应先与 runtime whitelist 对齐再决定是否调整。
- 不要把这套模板改写成直接 `python src/main.py ...`，因为包装脚本通常还处理参数、环境变量和工作目录。
- 这类 HTTP 服务端口固定为 `5000`；如果仓库脚本里出现其他默认端口，不要直接照抄到 `.coze`，除非用户明确要求。
- `deploy.build` 和 `deploy.run` 保持脚本入口形式，不要改成 `bash -c` / `bash -lc` 一类内联命令。
- 如果脚本位于 `scripts/` 目录，通常应先从 `SCRIPT_DIR` 回到上一层项目根目录再执行安装或启动；不要默认沿用调用时的当前目录。
- 不要因为“Python 项目通常用 3.12”就把这里的 `python-3.11` 自动升级；只有用户明确要求迁移，或有更强的团队/平台依据时才改。
- 只有用户明确要求时才处理 `[dev]`；本 skill 默认不新增 `[dev]`。

## Script Authoring

当仓库命中了这套模板、`deploy.build` / `deploy.run` 的底层行为已经明确，但脚本文件缺失时，可以补齐下面两个脚本：

- `scripts/setup.sh`
- `scripts/http_run.sh`

不要顺手生成 `local_run.sh` 或其他 dev 脚本；本 skill 默认不处理 `[dev]`。

### `setup.sh`

职责：

- 只负责安装依赖和准备运行环境
- 优先沿用仓库已确认的安装方式；如果项目有 `pyproject.toml` 且仓库已使用 `uv`，优先走 `uv`
- 需要兼容 `requirements.txt` 的 pip 回退路径时，保持回退逻辑，但不要额外扩展到未验证的安装方案

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if command -v uv >/dev/null 2>&1 && [ -f "pyproject.toml" ]; then
  if [ -n "${PIP_TARGET:-}" ]; then
    echo "[setup] Deploy mode (uv): installing to PIP_TARGET=$PIP_TARGET"
    uv export --frozen --no-hashes --no-dev | uv pip install --no-cache --target "$PIP_TARGET" -r -
  else
    echo "[setup] Devbox mode (uv): installing to .venv"
    if [ -f "uv.lock" ]; then
      uv sync --frozen || uv sync
    else
      uv sync
    fi
    touch .venv/.uv_ready
  fi
elif [ -f "requirements.txt" ]; then
  echo "[setup] Fallback mode (pip): installing from requirements.txt"
  pip install -r requirements.txt
else
  echo "[setup] Warning: no pyproject.toml or requirements.txt found, skipping install"
fi
```

### `http_run.sh`

职责：

- 只负责启动 HTTP 服务
- 默认端口固定为 `5000`
- 允许保留一个简单的 `-p` 参数解析，与 `.coze` 的 `["bash", "scripts/http_run.sh", "-p", "5000"]` 保持一致

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
python src/main.py -m http -p "$PORT"
```

### Guardrails

- 可以先基于脚本自身位置 `cd` 回项目根目录；不要依赖调用者的 `pwd`、`COZE_WORKSPACE_PATH`，或再包一层额外的 workdir 逻辑。
- `.coze` 继续引用脚本，不要把它改成 `python src/main.py ...` 这样的裸命令。
- 只有在仓库已经明确使用 `uv` 时，才保留 `uv` 这条安装路径；否则不要臆造。
- 如果根目录 `.coze` 复用了 `subproj/scripts/setup.sh` 或 `subproj/scripts/http_run.sh`，还要确认脚本内部最终会回到 `subproj` 根目录执行。
- 如果真实入口不是 `src/main.py -m http`，就不要硬套这份脚本骨架。
