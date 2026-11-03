# Workflow Runner - Python

## 环境依赖

- Python 3.8+
- `requests` 库（已预装）

## 脚本使用

脚本路径：`workflow-runner/scripts/workflow_runner.py`

### 列出工作流

```bash
python workflow-runner/scripts/workflow_runner.py list --workspace-id YOUR_WORKSPACE_ID
```

输出示例：
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "items": [
      {
        "workflow_id": "7123456789012345678",
        "workflow_name": "My Workflow",
        "description": "A sample workflow"
      }
    ],
    "has_more": false
  }
}
```

### 查询工作流详情

```bash
python workflow-runner/scripts/workflow_runner.py info 7123456789012345678
```

### 同步执行

```bash
python workflow-runner/scripts/workflow_runner.py run 7123456789012345678 --parameters '{"input_text": "Hello"}'
```

### 异步执行

```bash
python workflow-runner/scripts/workflow_runner.py run-async 7123456789012345678 --parameters '{"input_text": "Hello"}'
# 返回 execute_id 后查询结果
python workflow-runner/scripts/workflow_runner.py history 7123456789012345678 EXECUTE_ID
```

### 流式执行

```bash
python workflow-runner/scripts/workflow_runner.py stream 7123456789012345678 --parameters '{"input_text": "Hello"}'
```

### 恢复中断

```bash
python workflow-runner/scripts/workflow_runner.py resume 7123456789012345678 \
  --event-id EVT_ID --resume-data '回答内容' --interrupt-type 1
```

## 在代码中直接调用

每个示例都是完整可运行的 Python 脚本，使用 `requests` 库直接调用 HTTP API。

**环境变量：**
- `COZE_WORKLOAD_API_TOKEN`（必填）— API 认证 token
- `COZE_API_BASE_URL`（可选，默认 `https://api.coze.cn`）— API 地址
- `COZE_PROJECT_SPACE_ID`（list 时必填）— workspace ID

| 示例文件 | 说明 | API 端点 |
|---------|------|---------|
| [list_workflows.py](examples/list_workflows.py) | 列出已发布的工作流 | `GET /v1/workflows` |
| [get_workflow_info.py](examples/get_workflow_info.py) | 查询工作流详情及入参结构 | `GET /v1/workflows/{id}` |
| [run_workflow.py](examples/run_workflow.py) | 同步执行工作流 | `POST /v1/workflow/run` |
| [run_workflow_async.py](examples/run_workflow_async.py) | 异步执行工作流 | `POST /v1/workflow/run` (is_async=true) |
| [stream_workflow.py](examples/stream_workflow.py) | 流式执行工作流（SSE） | `POST /v1/workflow/stream_run` |
| [resume_workflow.py](examples/resume_workflow.py) | 恢复中断的工作流（非流式） | `POST /v1/workflow/resume` |
| [stream_resume_workflow.py](examples/stream_resume_workflow.py) | 恢复中断的工作流（流式） | `POST /v1/workflow/stream_resume` |
| [query_workflow_history.py](examples/query_workflow_history.py) | 查询异步执行结果 | `GET /v1/workflows/{id}/run_histories/{execute_id}` |
