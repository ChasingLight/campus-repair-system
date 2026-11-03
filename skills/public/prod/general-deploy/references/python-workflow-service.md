# Python Workflow Service Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 平台项目类型为 Automation，或用户意图、现有 `.coze`、项目模板语义明确指向 Workflow
- 存在 `pyproject.toml` 或 `requirements.txt`
- 存在 `src/main.py`
- 存在 `src/graphs/graph.py`、`src/graphs/state.py`、LangGraph `StateGraph` 编排或等价工作流节点结构
- 存在 `scripts/setup.sh`
- 存在 `scripts/http_run.sh`

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "src/main.py"
requires = ["python-3.12"]

[deploy]
build = ["bash", "scripts/setup.sh"]
run = ["bash", "scripts/http_run.sh", "-p", "5000"]
deps = ["moreutils"]

[deploy.profile]
kind = "service"
flavor = "workflow"

[deploy.backend]
enabled = true
```

## Notes

- `flavor = "workflow"` 表示项目语义和 UI / 提示词子类，不要因为最终通过 HTTP 服务启动就改成 `flavor = "web"`。
- 平台 project type `Automation` 可视为 workflow 强信号。
- `project.requires` 应先参考现有 `.coze`、`pyproject.toml` 的 `requires-python`、`.python-version` 和 runtime whitelist。样例 Workflow 项目使用 `python-3.12`。
- 这类项目通常通过 `python src/main.py -m http -p <port>` 对外提供服务，部署端口固定为 `5000`。
- `deploy.build` 和 `deploy.run` 保持脚本入口形式，不要改成 `bash -c` / `bash -lc` 或直接 `python src/main.py ...`。
- `deploy.deps` 只有在现有配置或仓库事实明确需要时写入；当前 Workflow 样例明确使用 `deps = ["moreutils"]`。
- 如果脚本内部依赖调用时当前目录，应确认 `.coze` 所在目录执行时就是项目根目录；否则应修脚本工作目录解析。
- 对根 `.coze` 调度 `projects/scripts/http_run.sh` 的结构，`.coze` 路径保持相对根目录，但脚本内部必须从 `SCRIPT_DIR` 回到 `projects` 子项目根。
- Workflow / Automation 常见会在 lifespan 阶段初始化数据库或异步任务运行时。若数据库不是 HTTP 服务启动的硬前置条件，应捕获 `get_engine()` / 平台环境变量获取异常，允许图编译和 HTTP 服务继续启动；不要让 `PGDATABASE_URL` 获取失败直接阻断健康启动。
- 如果确实强依赖数据库，应在报告中明确这是业务代码/运行时依赖风险，不要把它归因到 `.coze` 的 `flavor` 或 `kind`。

## Script Expectations

已有脚本应满足这些职责：

- `setup.sh`：安装依赖，优先支持 `uv`，必要时回退 `requirements.txt`。
- `http_run.sh`：只启动 HTTP 服务，支持 `-p <port>`，最终监听 `5000`。
- `pack.sh` / `local_run.sh`：如果存在，通常属于打包或本地运行辅助，不是 deploy 必填字段。

如果脚本缺失，只有在完整扫描后确认没有更合适脚本、且仓库的安装/启动动作已经明确时，才补齐脚本；不要凭 LangGraph 依赖直接编造完整部署脚本。
