---
name: coze-asset-runner
description: 扣子平台资产调用技能包。整合 Bot（智能体）、Plugin（插件）、Workflow（工作流）三类 Coze 1.5 资产的完整调用能力。通过 HTTP OpenAPI 直接调用扣子平台，不依赖 SDK。当用户需要在代码中集成扣子平台上的智能体对话、插件工具或工作流执行能力时使用此技能。平台技能，开发能力，让 agent 生成 HTTP 调用代码。
license: MIT
---

# Coze Asset Runner

扣子平台资产调用技能包 — 通过 HTTP OpenAPI 调用扣子平台上的 Bot（智能体）、Plugin（插件）、Workflow（工作流）。

## 能力概览

| 能力 | 适用场景 | 核心操作 | 详细文档 |
|------|----------|----------|----------|
| **Bot Runner** | 需要与已发布的智能体进行对话 | 列出/查询智能体、同步/流式对话、管理会话与消息 | [bot-runner/SKILL.md](bot-runner/SKILL.md) |
| **Plugin Runner** | 需要调用平台上的插件工具（如搜索、语音识别等） | 列出可用插件、查询插件详情与工具 Schema、执行插件工具 | [plugin-runner/SKILL.md](plugin-runner/SKILL.md) |
| **Workflow Runner** | 需要执行已发布的低代码工作流 | 列出/查询工作流、同步/异步/流式执行、恢复中断 | [workflow-runner/SKILL.md](workflow-runner/SKILL.md) |

## 如何选择

```
用户需要什么？
├─ 与智能体对话（聊天、问答）       → Bot Runner
├─ 调用特定工具（搜索、翻译等）     → Plugin Runner
└─ 执行自动化流程（数据处理等）     → Workflow Runner
```

- 不确定时，先用 **Bot Runner** 的 `info` 查看智能体集成了哪些插件和工作流，再决定是直接对话还是单独调用插件/工作流
- 如果用户明确提到了 plugin_id，使用 **Plugin Runner**
- 如果用户明确提到了 workflow_id，使用 **Workflow Runner**

## 环境变量

三个子能力共享以下环境变量：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `COZE_WORKLOAD_API_TOKEN` | 是 | 无 | API 认证 Token (PAT/SAT) |
| `COZE_PROJECT_SPACE_ID` | list 时必填 | 无 | workspace_id，也支持参数传入 |
| `COZE_API_BASE_URL` | 否 | `https://api.coze.cn` | API Base URL，也支持参数传入 |
| `COZE_EXTRA_HEADERS` | 否 | 无 | 自定义 HTTP 请求头，分号分隔，如 `key1=val1;key2=val2` |

配置优先级：参数传入 > 环境变量 > 默认值

### 自定义请求头

需要在 HTTP 请求中注入自定义 Header 时，有两种方式：

```bash
# 方式一：环境变量（适用于所有请求）
export COZE_EXTRA_HEADERS="key1=val1;key2=val2"

# 方式二：CLI 参数（可重复，优先级高于环境变量）
python bot-runner/scripts/bot_runner.py list --header "key1=val1" --header "key2=val2"
```

生成用户代码时，`examples/` 中的示例会自动读取 `COZE_EXTRA_HEADERS` 环境变量。

## 快速调用示例

### Bot Runner — 与智能体对话

```bash
# 列出可用智能体
python bot-runner/scripts/bot_runner.py list --workspace-id <workspace_id>

# 查看智能体详情
python bot-runner/scripts/bot_runner.py info <bot_id>

# 同步对话
python bot-runner/scripts/bot_runner.py chat <bot_id> --message "你好"

# 流式对话
python bot-runner/scripts/bot_runner.py stream <bot_id> --message "你好"
```

### Plugin Runner — 调用插件工具

```bash
# 列出可用插件
python plugin-runner/scripts/plugin_runner.py list
python plugin-runner/scripts/plugin_runner.py list --keyword "语音识别"

# 查看插件工具列表及参数
python plugin-runner/scripts/plugin_runner.py info <plugin_id>

# 执行插件工具
python plugin-runner/scripts/plugin_runner.py run <plugin_id> --tool <tool_name> --args '{"key": "value"}'
```

### Workflow Runner — 执行工作流

```bash
# 列出可用工作流
python workflow-runner/scripts/workflow_runner.py list --workspace-id <workspace_id>

# 查看工作流详情及入参
python workflow-runner/scripts/workflow_runner.py info <workflow_id>

# 同步执行
python workflow-runner/scripts/workflow_runner.py run <workflow_id> --parameters '{"key": "value"}'

# 流式执行
python workflow-runner/scripts/workflow_runner.py stream <workflow_id> --parameters '{"key": "value"}'
```

所有脚本均提供 TypeScript 版本，将 `python xxx.py` 替换为 `npx tsx xxx.ts` 即可。

## 支持的语言

- **Python**: 每个子能力的 `scripts/` 目录下提供 CLI `.py` 脚本，`python/examples/` 目录下提供可复用的代码模板
- **TypeScript**: 每个子能力的 `scripts/` 目录下提供 CLI `.ts` 脚本，`typescript/examples/` 目录下提供可复用的代码模板

## 注意事项

- **统一使用 OpenAPI**：三个子能力均通过 HTTP OpenAPI 调用扣子平台，不使用 SDK，也不使用 MCP 协议。Plugin 的 `info` 接口虽然会返回 `mcp_json` 字段（MCP Server 配置），但该配置仅适用于 MCP 客户端环境，在本技能中请忽略
- **SSE 流格式**：Bot Runner 的流式对话返回标准 SSE 格式，`event:` 和 `data:` 在**不同行**上。如果智能体启用了深度思考模式，`reasoning_content` 字段包含思考过程（此时 `content` 为空），思考结束后 `content` 才包含实际回答。详见 `bot-runner/python/examples/stream_chat_bot.py`
- 所有调用均需要有效的 API Token
- Bot 和 Workflow 必须已发布才能通过 API 调用
- 各子能力的完整参数说明、高级用法和注意事项请阅读对应的子 SKILL.md
