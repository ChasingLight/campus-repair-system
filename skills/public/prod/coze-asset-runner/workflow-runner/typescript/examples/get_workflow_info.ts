/**
 * This example describes how to get the details of a workflow, including its
 * input and output parameter schema.
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

// Call the get workflow info API. Set include_input_output to true to get the
// input/output parameter schema.
const params = new URLSearchParams({ include_input_output: "true" });

const response = await fetch(
  `${cozeApiBase}/v1/workflows/${workflowId}?${params}`,
  {
    headers,
  }
);

const result = await response.json();
console.log("workflow info:", JSON.stringify(result, null, 2));
