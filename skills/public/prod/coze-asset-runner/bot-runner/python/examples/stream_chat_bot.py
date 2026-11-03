"""
This example describes how to chat with a bot using streaming (SSE). The API
returns results incrementally via Server-Sent Events.

Each SSE block consists of two lines — an event line and a data line:

    event:conversation.message.delta
    data:{"id":"...","role":"assistant","type":"answer","content":"Hi",...}

SSE event types:
- conversation.chat.created: chat created
- conversation.message.delta: incremental message content
- conversation.message.completed: a single message finished
- conversation.chat.completed: chat completed (includes token usage)
- done: stream ended (data is "[DONE]")

Deep thinking mode:
  During the thinking phase the delta's `content` field is empty and
  `reasoning_content` carries the model's chain-of-thought text.  Once
  thinking finishes, `content` holds the actual answer and
  `reasoning_content` is absent from subsequent deltas.
"""

import json
import os

import requests

# Get an access_token through personal access token or oauth.
coze_api_token = os.environ["COZE_WORKLOAD_API_TOKEN"]
# The default access is api.coze.cn, but if you need to access api.coze.com,
# please use COZE_API_BASE_URL to configure the api endpoint to access.
coze_api_base = os.environ.get("COZE_API_BASE_URL", "https://api.coze.cn")

headers = {"Authorization": f"Bearer {coze_api_token}", "Content-Type": "application/json"}
# Optional: extra HTTP headers, semicolon-separated (e.g. COZE_EXTRA_HEADERS="key1=val1;key2=val2")
for pair in os.environ.get("COZE_EXTRA_HEADERS", "").split(";"):
    pair = pair.strip()
    if "=" in pair:
        k, v = pair.split("=", 1)
        headers[k.strip()] = v.strip()

# Create a bot instance in Coze, copy the last number from the web link as the bot's ID.
bot_id = '{bot_id}'

# Call the chat API with streaming enabled.
# The response is an SSE stream that returns events as they happen.
response = requests.post(
    f"{coze_api_base}/v3/chat",
    headers=headers,
    json={
        "bot_id": bot_id,
        "user_id": "example_user",
        "stream": True,
        "additional_messages": [
            {
                "role": "user",
                "content": "hello",
                "content_type": "text",
            },
        ],
        "auto_save_history": True,
    },
    stream=True,
)

# Process the SSE stream by parsing event/data pairs.
# Standard SSE format delivers event type and data on separate lines:
#   event:conversation.message.delta
#   data:{"id":"...","content":"Hi","reasoning_content":""}
#
# In deep thinking mode, during the thinking phase `content` is empty and
# `reasoning_content` carries the thinking text.  Once thinking finishes,
# `content` holds the real answer and `reasoning_content` is absent.

current_event = None

for line in response.iter_lines(decode_unicode=True):
    if not line:
        # Blank line marks the end of an SSE block; reset state.
        current_event = None
        continue

    if line.startswith("event:"):
        current_event = line[len("event:"):].strip()
        continue

    if line.startswith("data:"):
        raw_data = line[len("data:"):].strip()

        # The final "done" event carries data "[DONE]", not JSON.
        if current_event == "done" or raw_data == "[DONE]":
            print("\n[Stream finished]", flush=True)
            break

        try:
            data = json.loads(raw_data)
        except json.JSONDecodeError:
            continue

        if current_event == "conversation.message.delta":
            # Only handle assistant answer fragments.
            if data.get("type") == "answer":
                reasoning = data.get("reasoning_content")
                content = data.get("content", "")
                if reasoning:
                    # Deep-thinking phase: show reasoning text.
                    print(reasoning, end="", flush=True)
                elif content:
                    # Normal answer content.
                    print(content, end="", flush=True)

        elif current_event == "conversation.chat.completed":
            usage = data.get("usage", {})
            print(
                f"\n[Chat completed] token_count={usage.get('token_count', 'N/A')}, "
                f"input_count={usage.get('input_count', 'N/A')}, "
                f"output_count={usage.get('output_count', 'N/A')}",
                flush=True,
            )
