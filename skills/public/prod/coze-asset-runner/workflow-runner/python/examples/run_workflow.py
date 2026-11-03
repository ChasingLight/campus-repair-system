"""
This example describes how to run a workflow synchronously. The API will block
until the workflow completes and return the result directly.
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

# Create a workflow instance in Coze, copy the last number from the web link as the workflow's ID.
workflow_id = '{workflow_id}'

# Call the coze workflow run API to execute the workflow synchronously.
# The run API will block until the workflow finishes (timeout: 10 minutes).
response = requests.post(
    f"{coze_api_base}/v1/workflow/run",
    headers=headers,
    json={
        "workflow_id": workflow_id,
        "parameters": {
            "input": "hello",
        },
    },
)

result = response.json()
print("workflow result:", json.dumps(result, ensure_ascii=False, indent=2))
