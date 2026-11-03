---
name: plugin-runner
description: 调用扣子平台上的插件（包括官方插件、三方插件及用户自定义插件）。支持列出可用插件、查询插件下的工具列表、参数 Schema，并能直接执行插件工具。当用户需要在代码中集成特定插件能力（如语音识别、新闻搜索等）时使用此技能。平台技能，开发能力，让 agent 生成 HTTP 调用代码。
license: MIT
---

# Plugin Runner

直接调用扣子平台上的插件工具（Tools）。

**重要：** 此技能通过 HTTP OpenAPI 调用插件，不依赖 coze-coding-dev-sdk，也**不使用 MCP 协议**。

> **OpenAPI vs MCP：** 扣子平台的插件同时支持 OpenAPI 和 MCP 两种调用方式。查询插件详情（`info`）时返回的 `mcp_json` 字段包含 MCP Server 配置，但该配置**仅适用于 MCP 客户端**（如 IDE 插件、MCP 兼容的 Agent 框架等），无法在本技能的 HTTP 调用场景下使用。**本技能统一使用 OpenAPI 方式调用插件**，与 Bot Runner、Workflow Runner 保持一致。请忽略返回结果中的 `mcp_json` 字段。

## [CRITICAL] 强制前置步骤 — 写代码之前必须完成

**⛔ 禁止跳过此步骤直接生成代码。使用硬编码占位 ID（如 "test_plugin_id"）等同于 Mock 数据，违反禁止 Mock 原则。**

无论哪种使用场景，如果用户没有明确指定 `plugin_id`，**必须按顺序执行以下两步**：

1. **获取 plugin_id** — 使用 CLI `list` 命令列出可用插件，展示给用户选择：
   ```bash
   python plugin-runner/scripts/plugin_runner.py list
   ```
2. **获取工具定义** — 使用 CLI `info` 命令查看选中插件的工具列表及参数 Schema：
   ```bash
   python plugin-runner/scripts/plugin_runner.py info <用户选定的plugin_id>
   ```

**只有拿到真实的 plugin_id 和工具 Schema 后，才能进入下一步（执行工具或生成代码）。**

## 两种使用场景

本技能提供两套工具，适用于不同场景：

### 场景一：Builder Agent 自身执行（CLI 脚本）

当 Builder Agent 需要**自己动手**操作插件时，使用 `scripts/` 下的 CLI 脚本。典型场景：
- 帮用户查找可用的插件（`list`）
- 查看插件的工具定义和参数（`info`）
- 测试执行插件工具、验证参数是否正确（`run`）
- 调试排查插件调用问题

→ 参见下方 [脚本调用](#脚本调用) 部分

### 场景二：生成用户代码（代码模板）

当用户需要**在自己的项目中集成插件调用**时，Builder Agent 应参考 `examples/` 下的示例文件生成代码。典型场景：
- 用户说"帮我写一个调用插件的代码"
- 用户需要在应用中集成插件工具调用逻辑
- 用户需要可直接复制到项目中使用的代码

→ 参见下方 [代码示例](#代码示例) 部分

## 核心功能

1. **列出可用插件**：从插件商店列出可用插件，支持关键词搜索和筛选。
2. **查询插件详情**：获取插件内包含的所有工具名称、描述及其入参/出参 Schema。
3. **执行插件工具**：根据获取到的 Schema，构造参数并同步执行工具。

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `COZE_WORKLOAD_API_TOKEN` | 是 | 无 | API 认证 Token (PAT/SAT) |
| `COZE_API_BASE_URL` | 否 | `https://api.coze.cn` | API Base URL |
| `COZE_EXTRA_HEADERS` | 否 | 无 | 自定义 HTTP 请求头，分号分隔，如 `key1=val1;key2=val2` |

配置优先级：参数传入 > 环境变量 > 默认值

CLI 脚本还支持 `--header "key=value"` 参数（可重复），优先级高于环境变量。

## 支持的语言

- **Python**: 参见 [python/README.md](plugin-runner/python/README.md) 了解脚本使用和代码示例
- **TypeScript**: 参见 [typescript/README.md](plugin-runner/typescript/README.md) 了解脚本使用和代码示例

## 使用流程

### 流程一：Builder Agent 自身执行（使用 CLI）

1. **[必做] 列出可用插件**：使用 `list` 指令浏览可用插件，**让用户选择**要调用的插件
2. **[必做] 获取工具定义**：使用 `info` 指令查看目标插件（`plugin_id`）有哪些工具，以及每个工具需要什么参数
3. **执行调用**：根据 `info` 返回的 `inputSchema`，使用 `run` 指令并传入 `tool_name` 和 JSON 格式的 `arguments`

### 流程二：生成用户项目代码（使用代码模板）

1. **[必做] 确定插件**：如果用户未指定 plugin_id，**必须**先用 CLI `list` 列出可用插件让用户选择，再用 `info` 查看工具 Schema。**禁止**使用占位符 ID 生成代码。
2. **确定语言**：Python → 参考 `python/examples/`；TypeScript → 参考 `typescript/examples/`
3. **读取示例文件**：根据用户需要的调用方式，读取对应的示例文件
4. **生成代码**：照示例风格生成完整可运行的代码，将 `{plugin_id}` 替换为用户选定的**实际** plugin_id（来自 `list` 返回），将工具名和参数替换为 `info` 返回的**实际**定义

### 自检清单（生成代码前必须确认）
- [ ] plugin_id 是否来自 `list` 命令返回或用户明确指定？（禁止硬编码占位值）
- [ ] tool_name 和参数结构是否来自 `info` 命令返回？（禁止凭空猜测参数名和类型）
- [ ] 代码中的 HTTP 调用方式是否与示例文件一致？

## 代码示例

**重要：** 生成用户代码时，必须先阅读对应的示例文件，照其风格生成完整可运行的代码。

| 示例文件（Python / TypeScript） | 说明 | API 端点 |
|-------------------------------|------|---------|
| [list_plugins.py](plugin-runner/python/examples/list_plugins.py) / [.ts](plugin-runner/typescript/examples/list_plugins.ts) | 列出插件商店中的可用插件 | `GET /v1/stores/plugins` |
| [get_plugin_info.py](plugin-runner/python/examples/get_plugin_info.py) / [.ts](plugin-runner/typescript/examples/get_plugin_info.ts) | 查询插件详情及工具 Schema | `GET /v1/plugins/{id}` |
| [call_plugin_tool.py](plugin-runner/python/examples/call_plugin_tool.py) / [.ts](plugin-runner/typescript/examples/call_plugin_tool.ts) | 执行插件工具 | `POST /v1/plugins/{id}/tools/call` |

## 脚本调用

### Python 版本
```bash
# 列出可用插件
python plugin-runner/scripts/plugin_runner.py list
python plugin-runner/scripts/plugin_runner.py list --keyword "语音识别"
python plugin-runner/scripts/plugin_runner.py list --is-official true --all

# 获取详情
python plugin-runner/scripts/plugin_runner.py info <plugin_id>

# 执行工具
python plugin-runner/scripts/plugin_runner.py run <plugin_id> --tool <tool_name> --args '{"key": "value"}'
```

### TypeScript 版本
```bash
# 列出可用插件
npx tsx plugin-runner/scripts/plugin_runner.ts list
npx tsx plugin-runner/scripts/plugin_runner.ts list --keyword "语音识别"
npx tsx plugin-runner/scripts/plugin_runner.ts list --is-official true --all

# 获取详情
npx tsx plugin-runner/scripts/plugin_runner.ts info <plugin_id>

# 执行工具
npx tsx plugin-runner/scripts/plugin_runner.ts run <plugin_id> --tool <tool_name> --args '{"key": "value"}'
```

## 注意事项

- **统一使用 OpenAPI**：本技能仅通过 HTTP OpenAPI 调用插件。虽然插件也支持 MCP 协议（`info` 返回的 `mcp_json` 字段），但 MCP 配置仅适用于 MCP 客户端环境，请忽略该字段
- `info` 返回的 `mcp_json` 字段示例（**不要使用**）：
  ```json
  {
    "mcp_json": "{\"mcpServers\":{\"plugin_name\":{\"url\":\"https://mcp.coze.cn/v1/plugins/xxx\",\"headers\":{\"Authorization\":\"Bearer ${COZE_API_TOKEN}\"}}}}"
  }
  ```
- 所有调用均需要有效的 API Token（PAT/SAT）
- `arguments` 参数为 JSON 对象（`Map[String, Any]`），不要传 JSON 字符串
