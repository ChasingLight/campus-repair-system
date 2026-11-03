/**
 * This example describes how to run a workflow synchronously. The API will block
 * until the workflow completes and return the result directly.
 */

// Get an access_token through personal access token or oauth.
const cozeApiToken = process.env.COZE_WORKLOAD_API_TOKEN!;
// The default access is api.coze.cn, but if you need to access api.coze.com,
// please use COZE_API_BASE_URL to configure the api endpoint to access.
const cozeApiBase = process.env.COZE_API_BASE_URL || "https://api.coze.cn";

// Create a workflow instance in Coze, copy the last number from the web link as the workflow's ID.
const workflowId = "{workflow_id}";

// Call the coze workflow run API to execute the workflow synchronously.
// The run API will block until the workflow finishes (timeout: 10 minutes).
const response = await fetch(`${cozeApiBase}/v1/workflow/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    workflow_id: workflowId,
    parameters: {
      input: "hello",
    },
  }),
});

const result = await response.json();
console.log("workflow result:", JSON.stringify(result, null, 2));
