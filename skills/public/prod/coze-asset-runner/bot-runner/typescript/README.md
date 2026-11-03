# Bot Runner - TypeScript

## 环境依赖

- Node.js 18+ 或 Bun（内置 fetch API）
- `tsx`（用于直接运行 `.ts` 文件，已预装）

## 脚本使用

脚本路径：`bot-runner/scripts/bot_runner.ts`

### 列出智能体

```bash
npx tsx bot-runner/scripts/bot_runner.ts list --workspace-id YOUR_WORKSPACE_ID
# 或
bun bot-runner/scripts/bot_runner.ts list --workspace-id YOUR_WORKSPACE_ID
```

### 查询智能体详情（能力配置）

```bash
npx tsx bot-runner/scripts/bot_runner.ts info 7123456789012345678
```

返回内容包括：系统提示词（`prompt_info`）、集成的插件列表（`plugin_info_list`）、工作流列表（`workflow_info_list`）、知识库配置（`knowledge`）、模型信息（`model_info`）等。

### 同步对话（等待完成后输出）

```bash
npx tsx bot-runner/scripts/bot_runner.ts chat 7123456789012345678 --message "你好，介绍一下你自己"
```

支持多轮对话：
```bash
npx tsx bot-runner/scripts/bot_runner.ts chat 7123456789012345678 --message "继续" \
  --conversation-id CONVERSATION_ID
```

### 流式对话（实时输出 SSE）

```bash
npx tsx bot-runner/scripts/bot_runner.ts stream 7123456789012345678 --message "你好，介绍一下你自己"
```

### 查询历史消息

```bash
npx tsx bot-runner/scripts/bot_runner.ts history CONVERSATION_ID CHAT_ID
```

### 取消进行中的对话

```bash
npx tsx bot-runner/scripts/bot_runner.ts cancel CONVERSATION_ID CHAT_ID
```

## 在代码中直接调用

每个示例都是完整可运行的 TypeScript 脚本，使用 `fetch` API 直接调用 HTTP API。

**环境变量：**
- `COZE_WORKLOAD_API_TOKEN`（必填）— API 认证 token
- `COZE_API_BASE_URL`（可选，默认 `https://api.coze.cn`）— API 地址
- `COZE_PROJECT_SPACE_ID`（list 时必填）— workspace ID

| 示例文件 | 说明 | API 端点 |
|---------|------|---------|
| [list_bots.ts](examples/list_bots.ts) | 列出已发布的智能体 | `GET /v1/bots` |
| [get_bot_info.ts](examples/get_bot_info.ts) | 查询智能体详情及能力配置 | `GET /v1/bots/{bot_id}` |
| [chat_bot.ts](examples/chat_bot.ts) | 非流式对话（轮询等待完成） | `POST /v3/chat` |
| [stream_chat_bot.ts](examples/stream_chat_bot.ts) | 流式对话（SSE） | `POST /v3/chat` |
