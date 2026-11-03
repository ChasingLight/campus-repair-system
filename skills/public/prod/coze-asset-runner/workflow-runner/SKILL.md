---
name: workflow-runner
description: 调用用户有权限访问的扣子低代码工作流，集成于开发产物中。支持列出工作流、查询详情、同步/异步/流式执行工作流，以及恢复中断的工作流。当用户需要在代码中调用扣子平台上已发布的工作流时使用此技能。平台技能，开发能力，让 agent 生成 HTTP 调用代码。
license: MIT
---

# Workflow Runner

调用扣子平台上已发布的低代码工作流。支持列出、查询详情、同步/异步/流式执行，以及恢复中断的工作流。

**重要：** 此技能直接调用扣子开放平台 HTTP API，不依赖 coze-coding-dev-sdk。

## [CRITICAL] 强制前置步骤 — 写代码之前必须完成

**⛔ 禁止跳过此步骤直接生成代码。使用硬编码占位 ID（如 "test_workflow_id"）等同于 Mock 数据，违反禁止 Mock 原则。**

无论哪种使用场景，如果用户没有明确指定 `workflow_id`，**必须按顺序执行以下两步**：

1. **获取 workflow_id** — 使用 CLI `list` 命令列出当前空间中已发布的工作流，展示给用户选择：
   ```bash
   python workflow-runner/scripts/workflow_runner.py list
   ```
2. **获取入参结构** — 使用 CLI `info` 命令查看选中工作流的参数定义：
   ```bash
   python workflow-runner/scripts/workflow_runner.py info <用户选定的workflow_id>
   ```

**只有拿到真实的 workflow_id 和入参结构后，才能进入下一步（执行工作流或生成代码）。**

## 两种使用场景

本技能提供两套工具，适用于不同场景：

### 场景一：Builder Agent 自身执行（CLI 脚本）

当 Builder Agent 需要**自己动手**操作工作流时，使用 `scripts/` 下的 CLI 脚本。典型场景：
- 帮用户查找可用的工作流（`list`）
- 查看工作流的入参结构（`info`）
- 测试执行工作流、验证参数是否正确（`run` / `stream`）
- 调试排查工作流执行问题

→ 参见下方 [脚本调用](#脚本调用) 部分

### 场景二：生成用户代码（代码模板）

当用户需要**在自己的项目中集成工作流调用**时，Builder Agent 应参考 `examples/` 下的示例文件生成代码。典型场景：
- 用户说"帮我写一个调用工作流的代码"
- 用户需要在应用中集成工作流调用逻辑
- 用户需要可直接复制到项目中使用的代码

→ 参见下方 [代码示例](#代码示例) 部分

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `COZE_WORKLOAD_API_TOKEN` | 是 | 无 | API 认证 token |
| `COZE_PROJECT_SPACE_ID` | list 时必填 | 无 | workspace_id，也支持参数传入 |
| `COZE_API_BASE_URL` | 否 | `https://api.coze.cn` | API base URL，也支持参数传入 |
| `COZE_EXTRA_HEADERS` | 否 | 无 | 自定义 HTTP 请求头，分号分隔，如 `key1=val1;key2=val2` |

配置优先级：参数传入 > 环境变量 > 默认值

CLI 脚本还支持 `--header "key=value"` 参数（可重复），优先级高于环境变量。

## 支持的语言

- **Python**: 参见 [python/README.md](workflow-runner/python/README.md) 了解脚本使用和代码示例
- **TypeScript**: 参见 [typescript/README.md](workflow-runner/typescript/README.md) 了解脚本使用和代码示例

## 使用流程

### 流程一：Builder Agent 自身执行（使用 CLI）

1. **[必做] 列出工作流**：使用 `list` 子命令查看用户可用的已发布工作流，**让用户选择**要调用的工作流
2. **[必做] 查看详情**：使用 `info` 子命令查看选中工作流的入参结构，引导用户填写参数
3. **选择调用方式并执行**：
   - 用户无特殊要求 → `run`（同步调用）
   - 用户提到"异步"/"后台执行" → `run-async`（异步调用，返回 execute_id）
   - 用户提到"流式"/"实时输出" → `stream`（流式调用，SSE 响应）
4. **查询异步结果**（可选）：异步调用后使用 `history` 查询执行结果（单次查询，不轮询）

### 流程二：生成用户项目代码（使用代码模板）

1. **[必做] 确定工作流**：如果用户未指定 workflow_id，**必须**先用 CLI `list` 列出可用工作流让用户选择，再用 `info` 查看入参结构。**禁止**使用占位符 ID 生成代码。
2. **确定语言**：Python → 参考 `python/examples/`；TypeScript → 参考 `typescript/examples/`
3. **读取示例文件**：根据用户需要的调用方式，读取对应的示例文件
4. **生成代码**：照示例风格生成完整可运行的代码，将 `{workflow_id}` 替换为用户选定的**实际** workflow_id（来自 `list` 返回），将参数替换为 `info` 返回的**实际**入参结构

### 自检清单（生成代码前必须确认）
- [ ] workflow_id 是否来自 `list` 命令返回或用户明确指定？（禁止硬编码占位值）
- [ ] 入参结构是否来自 `info` 命令返回？（禁止凭空猜测参数名和类型）
- [ ] 代码中的 HTTP 调用方式是否与示例文件一致？

## 代码示例

**重要：** 生成用户代码时，必须先阅读对应的示例文件，照其风格生成完整可运行的代码。

| 示例文件（Python / TypeScript） | 说明 | API 端点 |
|-------------------------------|------|---------|
| [list_workflows.py](workflow-runner/python/examples/list_workflows.py) / [.ts](workflow-runner/typescript/examples/list_workflows.ts) | 列出已发布的工作流 | `GET /v1/workflows` |
| [get_workflow_info.py](workflow-runner/python/examples/get_workflow_info.py) / [.ts](workflow-runner/typescript/examples/get_workflow_info.ts) | 查询工作流详情及入参结构 | `GET /v1/workflows/{id}` |
| [run_workflow.py](workflow-runner/python/examples/run_workflow.py) / [.ts](workflow-runner/typescript/examples/run_workflow.ts) | 同步执行工作流 | `POST /v1/workflow/run` |
| [run_workflow_async.py](workflow-runner/python/examples/run_workflow_async.py) / [.ts](workflow-runner/typescript/examples/run_workflow_async.ts) | 异步执行工作流 | `POST /v1/workflow/run` (is_async=true) |
| [stream_workflow.py](workflow-runner/python/examples/stream_workflow.py) / [.ts](workflow-runner/typescript/examples/stream_workflow.ts) | 流式执行工作流（SSE） | `POST /v1/workflow/stream_run` |
| [resume_workflow.py](workflow-runner/python/examples/resume_workflow.py) / [.ts](workflow-runner/typescript/examples/resume_workflow.ts) | 恢复中断的工作流（非流式） | `POST /v1/workflow/resume` |
| [stream_resume_workflow.py](workflow-runner/python/examples/stream_resume_workflow.py) / [.ts](workflow-runner/typescript/examples/stream_resume_workflow.ts) | 恢复中断的工作流（流式） | `POST /v1/workflow/stream_resume` |
| [query_workflow_history.py](workflow-runner/python/examples/query_workflow_history.py) / [.ts](workflow-runner/typescript/examples/query_workflow_history.ts) | 查询异步执行结果 | `GET /v1/workflows/{id}/run_histories/{execute_id}` |

### 恢复流程

**仅当**用户明确说"恢复"/"resume"/"继续执行"并提供 event_id 时使用：

- `resume`：非流式恢复中断的工作流
- `stream-resume`：流式恢复中断的工作流

流式执行中如果收到 `Interrupt` 事件，说明工作流遇到问答节点需要用户输入，此时需要通过 resume 接口继续。

## 脚本调用

脚本位于 `workflow-runner/scripts/` 目录，支持以下子命令：

```bash
# 列出已发布的工作流
python workflow-runner/scripts/workflow_runner.py list [--workspace-id ID] [--page-num N] [--page-size N]

# 查看工作流详情
python workflow-runner/scripts/workflow_runner.py info <workflow_id>

# 同步执行
python workflow-runner/scripts/workflow_runner.py run <workflow_id> [--parameters '{"key":"value"}'] [--bot-id ID] [--app-id ID]

# 异步执行
python workflow-runner/scripts/workflow_runner.py run-async <workflow_id> [--parameters JSON] [--bot-id ID] [--app-id ID]

# 流式执行
python workflow-runner/scripts/workflow_runner.py stream <workflow_id> [--parameters JSON] [--bot-id ID] [--app-id ID]

# 非流式恢复
python workflow-runner/scripts/workflow_runner.py resume <workflow_id> --event-id ID --resume-data DATA --interrupt-type TYPE

# 流式恢复
python workflow-runner/scripts/workflow_runner.py stream-resume <workflow_id> --event-id ID --resume-data DATA --interrupt-type TYPE

# 查询异步执行结果（单次查询）
python workflow-runner/scripts/workflow_runner.py history <workflow_id> <execute_id>

# 所有命令均支持 --token, --base-url 参数覆盖环境变量
```

TypeScript 版本使用相同的子命令：
```bash
npx tsx workflow-runner/scripts/workflow_runner.ts <command> [options]
```

## 注意事项

- 工作流必须已发布，未发布的工作流无法执行
- `--bot-id` 和 `--app-id` 不能同时指定
- 同步执行超时 10 分钟（建议控制在 5 分钟内），异步执行超时 24 小时
- 请求大小限制 20 MB
- 流式响应的 SSE 事件类型：`Message`（消息）、`Error`（错误）、`Interrupt`（中断，需 resume）、`Done`（完成）
- 异步执行结果需通过 `history` 命令手动查询，脚本不做自动轮询
