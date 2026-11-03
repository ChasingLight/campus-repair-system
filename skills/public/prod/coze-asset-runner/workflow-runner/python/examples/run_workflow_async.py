"""
This example describes how to run a workflow asynchronously. The API returns
an execute_id immediately, and you can query the result later using the
history API (see query_workflow_history.py).
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

# Call the coze workflow run API with is_async=True to execute asynchronously.
# The API returns immediately with an execute_id (timeout for execution: 24 hours).
response = requests.post(
    f"{coze_api_base}/v1/workflow/run",
    headers=headers,
    json={
        "workflow_id": workflow_id,
        "is_async": True,
        "parameters": {
            "input": "hello",
        },
    },
)

result = response.json()
print("async run result:", json.dumps(result, ensure_ascii=False, indent=2))

# The execute_id can be used to query the result later:
# execute_id = result["data"]
# See query_workflow_history.py for how to query the execution result.
