---
name: bot-runner
description: 调用用户有权限访问的扣子智能体（Bot），集成于开发产物中。支持列出智能体、查询详情与能力配置、发起对话（同步/流式）、查询对话消息、取消进行中的对话、管理会话（创建/查看/修改/删除/清除上下文）、管理消息（创建/查看/修改/删除）。当用户需要在代码中调用扣子平台上已发布的智能体时使用此技能。平台技能，开发能力，让 agent 生成 HTTP 调用代码。
license: MIT
---

# Bot Runner

调用扣子平台上已发布的智能体（Bot）。支持列出、查询详情、同步/流式对话、查询历史消息、管理会话和消息的完整生命周期。

**重要：** 此技能直接调用扣子开放平台 HTTP API，不依赖 coze-coding-dev-sdk。

## [CRITICAL] 强制前置步骤 — 写代码之前必须完成

**⛔ 禁止跳过此步骤直接生成代码。使用硬编码占位 ID（如 "test_bot_id"）等同于 Mock 数据，违反禁止 Mock 原则。**

无论哪种使用场景，如果用户没有明确指定 `bot_id`，**必须按顺序执行以下两步**：

1. **获取 bot_id** — 使用 CLI `list` 命令列出当前空间中已发布的智能体，展示给用户选择：
   ```bash
   python bot-runner/scripts/bot_runner.py list
   ```
2. **获取能力配置** — 使用 CLI `info` 命令查看选中智能体的能力配置（插件、工作流、知识库、提示词）：
   ```bash
   python bot-runner/scripts/bot_runner.py info <用户选定的bot_id>
   ```

**只有拿到真实的 bot_id 和能力配置后，才能进入下一步（对话或生成代码）。**

## 两种使用场景

本技能提供两套工具，适用于不同场景：

### 场景一：Builder Agent 自身执行（CLI 脚本）

当 Builder Agent 需要**自己动手**操作智能体时，使用 `scripts/` 下的 CLI 脚本。典型场景：
- 帮用户查找可用的智能体（`list`）
- 查看智能体的能力配置（`info`）
- 测试与智能体对话、验证是否正常工作（`chat` / `stream`）
- 调试排查对话问题

→ 参见下方 [脚本调用](#脚本调用) 部分

### 场景二：生成用户代码（代码模板）

当用户需要**在自己的项目中集成智能体对话**时，Builder Agent 应参考 `examples/` 下的示例文件生成代码。典型场景：
- 用户说"帮我写一个调用智能体的代码"
- 用户需要在应用中集成智能体对话逻辑
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

- **Python**: 参见 [python/README.md](bot-runner/python/README.md) 了解脚本使用和代码示例
- **TypeScript**: 参见 [typescript/README.md](bot-runner/typescript/README.md) 了解脚本使用和代码示例

## 使用流程

### 流程一：Builder Agent 自身执行（使用 CLI）

1. **[必做] 列出智能体**：使用 `list` 子命令查看用户可用的已发布智能体，**让用户选择**要调用的智能体
2. **[必做] 查看详情**：使用 `info` 子命令查看选中智能体的能力配置（插件、工作流、知识库、提示词等），了解该智能体能做什么、如何与它对话
3. **选择对话方式**：
   - 用户无特殊要求 → `chat`（同步对话，自动等待完成后输出）
   - 用户提到"流式"/"实时输出" → `stream`（流式对话，SSE 响应）
4. **查看历史消息**（可选）：使用 `history` 查询某次对话的完整消息列表
5. **取消对话**（可选）：使用 `cancel` 取消进行中的对话

### 会话管理流程

1. **创建会话**：使用 `create-conversation` 创建新会话，可选关联 bot_id
2. **查看会话**：使用 `get-conversation` 查看单个会话信息，`list-conversations` 列出 bot 下所有会话
3. **修改会话**：使用 `edit-conversation` 更新会话名称
4. **清除上下文**：使用 `clear-context` 在同一会话中开启新话题（清除模型可见的历史消息）
5. **删除会话**：使用 `delete-conversation` 删除不再需要的会话

### 消息管理流程

1. **添加消息**：使用 `add-message` 向会话中添加消息
2. **查看消息**：使用 `list-messages` 列出会话中的消息，`get-message` 查看单条消息
3. **修改消息**：使用 `modify-message` 修改消息内容
4. **删除消息**：使用 `delete-message` 删除消息

### 流程二：生成用户项目代码（使用代码模板）

1. **[必做] 确定智能体**：如果用户未指定 bot_id，**必须**先用 CLI `list` 列出可用智能体让用户选择，再用 `info` 查看能力配置。**禁止**使用占位符 ID 生成代码。
2. **确定语言**：Python → 参考 `python/examples/`；TypeScript → 参考 `typescript/examples/`
3. **读取示例文件**：根据用户需要的对话方式，读取对应的示例文件
4. **生成代码**：照示例风格生成完整可运行的代码，将 `{bot_id}` 替换为用户选定的**实际** bot_id（来自 `list` 返回）

### 自检清单（生成代码前必须确认）
- [ ] bot_id 是否来自 `list` 命令返回或用户明确指定？（禁止硬编码占位值）
- [ ] 代码中的 HTTP 调用方式是否与示例文件一致？

## 代码示例

**重要：** 生成用户代码时，必须先阅读对应的示例文件，照其风格生成完整可运行的代码。

| 示例文件（Python / TypeScript） | 说明 | API 端点 |
|-------------------------------|------|---------|
| [list_bots.py](bot-runner/python/examples/list_bots.py) / [.ts](bot-runner/typescript/examples/list_bots.ts) | 列出已发布的智能体 | `GET /v1/bots` |
| [get_bot_info.py](bot-runner/python/examples/get_bot_info.py) / [.ts](bot-runner/typescript/examples/get_bot_info.ts) | 查询智能体详情及能力配置 | `GET /v1/bots/{bot_id}` |
| [chat_bot.py](bot-runner/python/examples/chat_bot.py) / [.ts](bot-runner/typescript/examples/chat_bot.ts) | 非流式对话（轮询等待完成） | `POST /v3/chat` |
| [stream_chat_bot.py](bot-runner/python/examples/stream_chat_bot.py) / [.ts](bot-runner/typescript/examples/stream_chat_bot.ts) | 流式对话（SSE） | `POST /v3/chat` |

## 脚本调用

脚本位于 `bot-runner/scripts/` 目录，支持以下子命令：

```bash
# ── 智能体命令 ──
python bot-runner/scripts/bot_runner.py list [--workspace-id ID] [--page-num N] [--page-size N]
python bot-runner/scripts/bot_runner.py info <bot_id> [--draft]

# ── 对话命令 ──
python bot-runner/scripts/bot_runner.py chat <bot_id> --message "你的问题" [--user-id ID] [--conversation-id ID]
python bot-runner/scripts/bot_runner.py stream <bot_id> --message "你的问题" [--user-id ID] [--conversation-id ID]
python bot-runner/scripts/bot_runner.py history <conversation_id> <chat_id>
python bot-runner/scripts/bot_runner.py cancel <conversation_id> <chat_id>

# ── 会话管理命令 ──
python bot-runner/scripts/bot_runner.py create-conversation [--bot-id ID] [--name NAME]
python bot-runner/scripts/bot_runner.py get-conversation <conversation_id>
python bot-runner/scripts/bot_runner.py list-conversations <bot_id> [--page-num N] [--page-size N] [--sort-order ASC|DESC]
python bot-runner/scripts/bot_runner.py edit-conversation <conversation_id> --name "新名称"
python bot-runner/scripts/bot_runner.py delete-conversation <conversation_id>
python bot-runner/scripts/bot_runner.py clear-context <conversation_id>

# ── 消息管理命令 ──
python bot-runner/scripts/bot_runner.py add-message <conversation_id> --role user --content "消息内容"
python bot-runner/scripts/bot_runner.py list-messages <conversation_id> [--chat-id ID] [--limit N] [--order asc|desc]
python bot-runner/scripts/bot_runner.py get-message <conversation_id> <message_id>
python bot-runner/scripts/bot_runner.py modify-message <conversation_id> <message_id> --content "修改后的内容" [--content-type text|object_string]
python bot-runner/scripts/bot_runner.py delete-message <conversation_id> <message_id>

# 所有命令均支持 --token, --base-url 参数覆盖环境变量
```

TypeScript 版本使用相同的子命令：
```bash
npx tsx bot-runner/scripts/bot_runner.ts <command> [options]
```

## 注意事项

- 智能体必须已发布，未发布的智能体无法通过 API 调用
- `chat` 命令会自动轮询等待对话完成（最长 2 分钟），期间打印 chat_id 和 conversation_id 以便追踪
- `--conversation-id` 用于多轮对话：复用同一个会话 ID 可保持上下文（对话记忆）
- `--user-id` 用于隔离不同用户的对话数据，默认使用 `"default_user"`
- **SSE 流格式**：流式对话返回标准 SSE（Server-Sent Events）格式，`event:` 和 `data:` 在**不同行**上：
  ```
  event:conversation.message.delta
  data:{"content":"Hi","reasoning_content":"","type":"answer",...}
  ```
  事件类型包括：`conversation.chat.created`、`conversation.message.delta`（流式文字增量）、`conversation.message.completed`（消息完成）、`conversation.chat.completed`（对话完成）、`conversation.chat.failed`（失败）、`error`（错误）、`done`（流结束）
- **深度思考模式（reasoning_content）**：如果智能体启用了深度思考模式，`delta` 事件中思考阶段 `content` 为空，`reasoning_content` 包含思考过程文本；思考结束后 `content` 为实际回答内容，`reasoning_content` 不再出现。详见 `examples/stream_chat_bot.py` 中的解析示例
- `info` 命令返回的 `plugin_info_list` 和 `workflow_info_list` 展示了该智能体集成了哪些插件和工作流
- `clear-context` 只清除模型可见的历史消息，不会删除消息本身，通过 `list-messages` 仍可查看
- `delete-message` 删除 type=answer 的消息时会同步删除关联的 function_call 等中间态消息
