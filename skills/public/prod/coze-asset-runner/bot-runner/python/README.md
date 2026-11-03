# Bot Runner - Python

## 环境依赖

- Python 3.8+
- `requests` 库（已预装）

## 脚本使用

脚本路径：`bot-runner/scripts/bot_runner.py`

### 列出智能体

```bash
python bot-runner/scripts/bot_runner.py list --workspace-id YOUR_WORKSPACE_ID
```

输出示例：
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "7123456789012345678",
        "name": "My Assistant",
        "description": "A helpful assistant",
        "is_published": true
      }
    ],
    "total": 1
  }
}
```

### 查询智能体详情（能力配置）

```bash
python bot-runner/scripts/bot_runner.py info 7123456789012345678
```

返回内容包括：系统提示词（`prompt_info`）、集成的插件列表（`plugin_info_list`）、工作流列表（`workflow_info_list`）、知识库配置（`knowledge`）、模型信息（`model_info`）等。

### 同步对话（等待完成后输出）

```bash
python bot-runner/scripts/bot_runner.py chat 7123456789012345678 --message "你好，介绍一下你自己"
```

支持多轮对话（复用会话上下文）：
```bash
# 第一轮，保存返回的 conversation_id
python bot-runner/scripts/bot_runner.py chat 7123456789012345678 --message "你好"

# 第二轮，传入 conversation_id 继续同一个会话
python bot-runner/scripts/bot_runner.py chat 7123456789012345678 --message "继续" \
  --conversation-id CONVERSATION_ID
```

### 流式对话（实时输出 SSE）

```bash
python bot-runner/scripts/bot_runner.py stream 7123456789012345678 --message "你好，介绍一下你自己"
```

### 查询历史消息

```bash
python bot-runner/scripts/bot_runner.py history CONVERSATION_ID CHAT_ID
```

### 取消进行中的对话

```bash
python bot-runner/scripts/bot_runner.py cancel CONVERSATION_ID CHAT_ID
```

## 在代码中直接调用

每个示例都是完整可运行的 Python 脚本，使用 `requests` 库直接调用 HTTP API。

**环境变量：**
- `COZE_WORKLOAD_API_TOKEN`（必填）— API 认证 token
- `COZE_API_BASE_URL`（可选，默认 `https://api.coze.cn`）— API 地址
- `COZE_PROJECT_SPACE_ID`（list 时必填）— workspace ID

| 示例文件 | 说明 | API 端点 |
|---------|------|---------|
| [list_bots.py](examples/list_bots.py) | 列出已发布的智能体 | `GET /v1/bots` |
| [get_bot_info.py](examples/get_bot_info.py) | 查询智能体详情及能力配置 | `GET /v1/bots/{bot_id}` |
| [chat_bot.py](examples/chat_bot.py) | 非流式对话（轮询等待完成） | `POST /v3/chat` |
| [stream_chat_bot.py](examples/stream_chat_bot.py) | 流式对话（SSE） | `POST /v3/chat` |
