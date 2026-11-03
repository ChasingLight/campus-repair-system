"""
This example describes how to get plugin details and tool schemas by plugin ID.
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

# Create a plugin in Coze, copy the plugin ID from the web console.
plugin_id = '{plugin_id}'

# Call the coze plugin API to get plugin details and tool schemas.
response = requests.get(
    f"{coze_api_base}/v1/plugins/{plugin_id}",
    headers=headers,
)

result = response.json()
print("plugin info:", json.dumps(result, ensure_ascii=False, indent=2))
