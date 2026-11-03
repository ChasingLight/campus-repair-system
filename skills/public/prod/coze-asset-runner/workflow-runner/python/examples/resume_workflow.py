"""
This example describes how to resume an interrupted workflow (non-streaming).
When a streaming workflow encounters a question node (Interrupt event), you can
use this API to provide the user's answer and continue execution.
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

# The event_id from the Interrupt SSE event.
event_id = '{event_id}'

# The user's answer to the question node.
resume_data = 'user answer here'

# The interrupt type code from the Interrupt event.
interrupt_type = 1

# Call the coze workflow resume API to continue the interrupted workflow.
response = requests.post(
    f"{coze_api_base}/v1/workflow/resume",
    headers=headers,
    json={
        "workflow_id": workflow_id,
        "event_id": event_id,
        "resume_data": resume_data,
        "interrupt_type": interrupt_type,
    },
)

result = response.json()
print("resume result:", json.dumps(result, ensure_ascii=False, indent=2))
