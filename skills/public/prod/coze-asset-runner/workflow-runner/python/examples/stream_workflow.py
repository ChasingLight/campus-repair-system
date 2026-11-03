"""
This example describes how to run a workflow with streaming (SSE). The API
returns results incrementally via Server-Sent Events.

SSE event types:
- Message: workflow output data
- Error: execution error
- Interrupt: workflow paused, needs user input (use resume API to continue)
- Done: execution completed
"""

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

# Call the coze workflow stream_run API to execute with streaming.
# The response is an SSE stream that returns events as they happen.
response = requests.post(
    f"{coze_api_base}/v1/workflow/stream_run",
    headers=headers,
    json={
        "workflow_id": workflow_id,
        "parameters": {
            "input": "hello",
        },
    },
    stream=True,
)

# Process the SSE stream line by line.
for line in response.iter_lines(decode_unicode=True):
    if line:
        print(line, flush=True)
