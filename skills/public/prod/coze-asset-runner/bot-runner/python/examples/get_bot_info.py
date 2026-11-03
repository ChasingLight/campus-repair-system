"""
This example describes how to get the details of a bot, including its prompt,
plugins, workflows, and knowledge configuration.
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

# Call the get bot info API to retrieve the bot's details.
response = requests.get(
    f"{coze_api_base}/v1/bots/{bot_id}",
    headers=headers,
)

result = response.json()
print("bot info:", json.dumps(result, ensure_ascii=False, indent=2))
