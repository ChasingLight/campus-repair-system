/**
 * This example describes how to run a workflow with streaming (SSE). The API
 * returns results incrementally via Server-Sent Events.
 *
 * SSE event types:
 * - Message: workflow output data
 * - Error: execution error
 * - Interrupt: workflow paused, needs user input (use resume API to continue)
 * - Done: execution completed
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

// Call the coze workflow stream_run API to execute with streaming.
// The response is an SSE stream that returns events as they happen.
const response = await fetch(`${cozeApiBase}/v1/workflow/stream_run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    workflow_id: workflowId,
    parameters: {
      input: "hello",
    },
  }),
});

// Process the SSE stream.
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  process.stdout.write(chunk);
}
