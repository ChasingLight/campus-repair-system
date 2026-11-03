"""
This example describes how to query the execution result of an asynchronous
workflow run. Use the execute_id returned by the async run API
(see run_workflow_async.py).
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

# The execute_id returned by the async run API.
execute_id = '{execute_id}'

# Call the workflow run histories API to get the execution result.
response = requests.get(
    f"{coze_api_base}/v1/workflows/{workflow_id}/run_histories/{execute_id}",
    headers=headers,
)

result = response.json()
print("execution history:", json.dumps(result, ensure_ascii=False, indent=2))
