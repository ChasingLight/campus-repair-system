# Python Agent Service Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 平台项目类型、用户意图、现有 `.coze` 或项目模板语义明确指向 Agent
- 存在 `pyproject.toml` 或 `requirements.txt`
- 存在 `src/main.py`
- 存在 `src/agents/agent.py`、`agents/`、`agent_llm_config.json` 或等价智能体入口
- 存在 `scripts/setup.sh`
- 存在 `scripts/http_run.sh`

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
flavor = "agent"

[deploy.backend]
enabled = true
```

## Notes

- `flavor = "agent"` 表示项目语义和 UI / 提示词子类，不要因为最终通过 HTTP 服务启动就改成 `flavor = "web"`。
- `project.requires` 应先参考现有 `.coze`、`pyproject.toml` 的 `requires-python`、`.python-version` 和 runtime whitelist。样例 Agent 项目使用 `python-3.11`；如果真实仓库明确要求 `>=3.12`，应选择 whitelist 中对应的 `python-3.12`。
- 这类项目通常通过 `python src/main.py -m http -p <port>` 对外提供服务，部署端口固定为 `5000`。
- `deploy.build` 和 `deploy.run` 保持脚本入口形式，不要改成 `bash -c` / `bash -lc` 或直接 `python src/main.py ...`。
- `deploy.deps` 只有在现有配置或仓库事实明确需要时写入；当前 Agent 样例明确使用 `deps = ["git"]`。
- 如果现有 `scripts/http_run.sh` 默认端口不是 `5000`，但支持 `-p` 参数，应让 `.coze` 传入 `-p 5000`；不要保留不传端口的 deploy run。
- 如果脚本内部或业务代码依赖 `COZE_WORKSPACE_PATH`，不要依赖平台默认值；应基于脚本位置回到项目根目录，并在 `http_run.sh` 中导出 `COZE_WORKSPACE_PATH="$PROJECT_DIR"`。
- Agent 启动脚本应导出 `COZE_PROJECT_TYPE=agent`，避免运行时代码按 workflow 或普通 backend 分支加载。
- 如果 `agent_llm_config.json` 位于 `config/` 或其他项目内路径，必须确认运行时会从项目根解析到该文件；常见修复是固定 `COZE_WORKSPACE_PATH`，不要让它指到 `/opt/bytefaas` 这类外层目录。
- 如果项目发布需要数据库，但 `PGDATABASE_URL` 可能来自平台接口，数据库 URL 获取应优先读环境变量，再尝试 `coze_workload_identity`，必要时回退 `coze_coding_dev_sdk.database.get_db_url()`；不要让平台环境变量接口一次失败直接导致无降级启动失败，除非业务明确强依赖数据库。

## Script Expectations

已有脚本应满足这些职责：

- `setup.sh`：安装依赖，优先支持 `uv`，必要时回退 `requirements.txt`。
- `http_run.sh`：只启动 HTTP 服务，支持 `-p <port>`，最终监听 `5000`；应 `cd "$PROJECT_DIR"`，导出 `COZE_PROJECT_TYPE=agent` 和 `COZE_WORKSPACE_PATH="$PROJECT_DIR"` 后再启动。
- `pack.sh` / `local_run.sh`：如果存在，通常属于打包或本地运行辅助，不是 deploy 必填字段。

如果脚本缺失，只有在完整扫描后确认没有更合适脚本、且仓库的安装/启动动作已经明确时，才补齐脚本；不要凭 Python 依赖直接编造完整部署脚本。
