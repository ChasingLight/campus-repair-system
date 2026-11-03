"""
This example describes how to list plugins from the plugin store. You can
optionally filter by keyword to search for specific plugins.
"""

import json
import os

import requests

# Get an access_token through personal access token or oauth.
coze_api_token = os.environ["COZE_WORKLOAD_API_TOKEN"]
# The default access is api.coze.cn, but if you need to access api.coze.com,
# please use COZE_API_BASE_URL to configure the api endpoint to access.
coze_api_base = os.environ.get("COZE_API_BASE_URL", "https://api.coze.cn")

headers = {"Authorization": f"Bearer {coze_api_token}"}
# Optional: extra HTTP headers, semicolon-separated (e.g. COZE_EXTRA_HEADERS="key1=val1;key2=val2")
for pair in os.environ.get("COZE_EXTRA_HEADERS", "").split(";"):
    pair = pair.strip()
    if "=" in pair:
        k, v = pair.split("=", 1)
        headers[k.strip()] = v.strip()

# Call the coze plugin store API to list available plugins.
# You can optionally pass a keyword param to search for specific plugins.
response = requests.get(
    f"{coze_api_base}/v1/stores/plugins",
    headers=headers,
    params={
        "page_num": 1,
        "page_size": 20,
    },
)

result = response.json()
print("plugin list:", json.dumps(result, ensure_ascii=False, indent=2))
