/**
 * This example describes how to query the execution result of an asynchronous
 * workflow run. Use the execute_id returned by the async run API
 * (see run_workflow_async.ts).
 */

// Get an access_token through personal access token or oauth.
const cozeApiToken = process.env.COZE_WORKLOAD_API_TOKEN!;
// The default access is api.coze.cn, but if you need to access api.coze.com,
// please use COZE_API_BASE_URL to configure the api endpoint to access.
const cozeApiBase = process.env.COZE_API_BASE_URL || "https://api.coze.cn";

// Build request headers. Optional: set COZE_EXTRA_HEADERS for debugging
// (e.g. COZE_EXTRA_HEADERS="key1=val1;key2=val2")
const headers: Record<string, string> = {
  Authorization: `Bearer ${cozeApiToken}`,
  "Content-Type": "application/json",
};
for (const pair of (process.env.COZE_EXTRA_HEADERS || "").split(";")) {
  const idx = pair.indexOf("=");
  if (idx > 0) headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
}

// Create a workflow instance in Coze, copy the last number from the web link as the workflow's ID.
const workflowId = "{workflow_id}";

// The execute_id returned by the async run API.
const executeId = "{execute_id}";

// Call the workflow run histories API to get the execution result.
const response = await fetch(
  `${cozeApiBase}/v1/workflows/${workflowId}/run_histories/${executeId}`,
  {
    headers,
  }
);

const result = await response.json();
console.log("execution history:", JSON.stringify(result, null, 2));
