"""
This example describes how to chat with a bot in non-streaming mode. After
creating a chat, it polls the retrieve API until the chat completes, then
fetches the final messages.
"""

import json
import os
import time

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

# Call the chat API to create a non-streaming chat.
response = requests.post(
    f"{coze_api_base}/v3/chat",
    headers=headers,
    json={
        "bot_id": bot_id,
        "user_id": "example_user",
        "stream": False,
        "additional_messages": [
            {
                "role": "user",
                "content": "hello",
                "content_type": "text",
            },
        ],
        "auto_save_history": True,
    },
)

chat_result = response.json()
print("chat created:", json.dumps(chat_result, ensure_ascii=False, indent=2))

# Extract conversation_id and chat_id from the response for polling.
conversation_id = chat_result["data"]["conversation_id"]
chat_id = chat_result["data"]["id"]

# Poll the retrieve API until the chat status is completed, failed, or canceled.
while True:
    time.sleep(1)
    retrieve_resp = requests.get(
        f"{coze_api_base}/v3/chat/retrieve",
        headers=headers,
        params={
            "conversation_id": conversation_id,
            "chat_id": chat_id,
        },
    )
    retrieve_result = retrieve_resp.json()
    status = retrieve_result["data"]["status"]
    print(f"chat status: {status}")

    if status in ("completed", "failed", "canceled"):
        break

# Once completed, fetch the chat messages.
msg_resp = requests.get(
    f"{coze_api_base}/v3/chat/message/list",
    headers=headers,
    params={
        "conversation_id": conversation_id,
        "chat_id": chat_id,
    },
)

msg_result = msg_resp.json()
print("messages:", json.dumps(msg_result, ensure_ascii=False, indent=2))
