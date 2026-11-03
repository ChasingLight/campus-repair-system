# Plugin Runner - TypeScript

## 环境依赖

- Node.js 18+
- 推荐使用 `tsx` 运行

## 脚本使用

脚本路径：`plugin-runner/scripts/plugin_runner.ts`

### 列出可用插件

```bash
npx tsx plugin-runner/scripts/plugin_runner.ts list
npx tsx plugin-runner/scripts/plugin_runner.ts list --keyword "语音识别"
npx tsx plugin-runner/scripts/plugin_runner.ts list --is-official true --all
```

### 获取插件详情（及工具 Schema）

```bash
npx tsx plugin-runner/scripts/plugin_runner.ts info YOUR_PLUGIN_ID
```

### 执行插件工具

```bash
npx tsx plugin-runner/scripts/plugin_runner.ts run YOUR_PLUGIN_ID \
  --tool tool_name \
  --args '{"key": "value"}'
```

## 在代码中直接调用

每个示例都是完整可运行的 TypeScript 脚本，使用 `fetch` API 直接调用 HTTP API。

**环境变量：**
- `COZE_WORKLOAD_API_TOKEN`（必填）— API 认证 token
- `COZE_API_BASE_URL`（可选，默认 `https://api.coze.cn`）— API 地址

| 示例文件 | 说明 | API 端点 |
|---------|------|---------|
| [list_plugins.ts](examples/list_plugins.ts) | 列出插件商店中的可用插件 | `GET /v1/stores/plugins` |
| [get_plugin_info.ts](examples/get_plugin_info.ts) | 查询插件详情及工具 Schema | `GET /v1/plugins/{id}` |
| [call_plugin_tool.ts](examples/call_plugin_tool.ts) | 执行插件工具 | `POST /v1/plugins/{id}/tools/call` |
