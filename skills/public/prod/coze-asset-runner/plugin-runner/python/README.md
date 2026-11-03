# Plugin Runner - Python

## 环境依赖

- Python 3.8+
- `requests` 库

## 脚本使用

脚本路径：`plugin-runner/scripts/plugin_runner.py`

### 列出可用插件

```bash
python plugin-runner/scripts/plugin_runner.py list
python plugin-runner/scripts/plugin_runner.py list --keyword "语音识别"
python plugin-runner/scripts/plugin_runner.py list --is-official true --page-size 10
python plugin-runner/scripts/plugin_runner.py list --all
```

### 获取插件详情（及工具 Schema）

```bash
python plugin-runner/scripts/plugin_runner.py info YOUR_PLUGIN_ID
```

输出示例：
```json
{
  "code": 0,
  "data": {
    "tools": [
      {
        "name": "asr_lite",
        "description": "语音转文字",
        "inputSchema": {
          "type": "object",
          "properties": {
            "audio_url": { "type": "string" }
          },
          "required": ["audio_url"]
        }
      }
    ]
  }
}
```

### 执行插件工具

根据 `info` 返回的 `inputSchema` 构造参数。

```bash
python plugin-runner/scripts/plugin_runner.py run YOUR_PLUGIN_ID \
  --tool asr_lite \
  --args '{"audio_url": "https://example.com/test.mp3"}'
```

## 在代码中直接调用

每个示例都是完整可运行的 Python 脚本，使用 `requests` 库直接调用 HTTP API。

**环境变量：**
- `COZE_WORKLOAD_API_TOKEN`（必填）— API 认证 token
- `COZE_API_BASE_URL`（可选，默认 `https://api.coze.cn`）— API 地址

| 示例文件 | 说明 | API 端点 |
|---------|------|---------|
| [list_plugins.py](examples/list_plugins.py) | 列出插件商店中的可用插件 | `GET /v1/stores/plugins` |
| [get_plugin_info.py](examples/get_plugin_info.py) | 查询插件详情及工具 Schema | `GET /v1/plugins/{id}` |
| [call_plugin_tool.py](examples/call_plugin_tool.py) | 执行插件工具 | `POST /v1/plugins/{id}/tools/call` |
