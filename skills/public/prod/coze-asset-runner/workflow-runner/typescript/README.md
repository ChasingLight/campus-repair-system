# Workflow Runner - TypeScript

## 环境依赖

- Node.js 18+（内置 `fetch` API）

## 在代码中直接调用

每个示例都是完整可运行的 TypeScript 脚本，使用 `fetch` API 直接调用 HTTP API。

**环境变量：**
- `COZE_WORKLOAD_API_TOKEN`（必填）— API 认证 token
- `COZE_API_BASE_URL`（可选，默认 `https://api.coze.cn`）— API 地址
- `COZE_PROJECT_SPACE_ID`（list 时必填）— workspace ID

| 示例文件 | 说明 | API 端点 |
|---------|------|---------|
| [list_workflows.ts](examples/list_workflows.ts) | 列出已发布的工作流 | `GET /v1/workflows` |
| [get_workflow_info.ts](examples/get_workflow_info.ts) | 查询工作流详情及入参结构 | `GET /v1/workflows/{id}` |
| [run_workflow.ts](examples/run_workflow.ts) | 同步执行工作流 | `POST /v1/workflow/run` |
| [run_workflow_async.ts](examples/run_workflow_async.ts) | 异步执行工作流 | `POST /v1/workflow/run` (is_async=true) |
| [stream_workflow.ts](examples/stream_workflow.ts) | 流式执行工作流（SSE） | `POST /v1/workflow/stream_run` |
| [resume_workflow.ts](examples/resume_workflow.ts) | 恢复中断的工作流（非流式） | `POST /v1/workflow/resume` |
| [stream_resume_workflow.ts](examples/stream_resume_workflow.ts) | 恢复中断的工作流（流式） | `POST /v1/workflow/stream_resume` |
| [query_workflow_history.ts](examples/query_workflow_history.ts) | 查询异步执行结果 | `GET /v1/workflows/{id}/run_histories/{execute_id}` |
