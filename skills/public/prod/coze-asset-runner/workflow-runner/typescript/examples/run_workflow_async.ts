/**
 * This example describes how to run a workflow asynchronously. The API returns
 * an execute_id immediately, and you can query the result later using the
 * history API (see query_workflow_history.ts).
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

// Call the coze workflow run API with is_async=true to execute asynchronously.
// The API returns immediately with an execute_id (timeout for execution: 24 hours).
const response = await fetch(`${cozeApiBase}/v1/workflow/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    workflow_id: workflowId,
    is_async: true,
    parameters: {
      input: "hello",
    },
  }),
});

const result = await response.json();
console.log("async run result:", JSON.stringify(result, null, 2));

// The execute_id can be used to query the result later:
// const executeId = result.data;
// See query_workflow_history.ts for how to query the execution result.
