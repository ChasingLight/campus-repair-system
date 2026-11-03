/**
 * This example describes how to resume an interrupted workflow (non-streaming).
 * When a streaming workflow encounters a question node (Interrupt event), you can
 * use this API to provide the user's answer and continue execution.
 */

// Get an access_token through personal access token or oauth.
const cozeApiToken = process.env.COZE_WORKLOAD_API_TOKEN!;
// The default access is api.coze.cn, but if you need to access api.coze.com,
// please use COZE_API_BASE_URL to configure the api endpoint to access.
const cozeApiBase = process.env.COZE_API_BASE_URL || "https://api.coze.cn";

// Create a workflow instance in Coze, copy the last number from the web link as the workflow's ID.
const workflowId = "{workflow_id}";

// The event_id from the Interrupt SSE event.
const eventId = "{event_id}";

// The user's answer to the question node.
const resumeData = "user answer here";

// The interrupt type code from the Interrupt event.
const interruptType = 1;

// Call the coze workflow resume API to continue the interrupted workflow.
const response = await fetch(`${cozeApiBase}/v1/workflow/resume`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    workflow_id: workflowId,
    event_id: eventId,
    resume_data: resumeData,
    interrupt_type: interruptType,
  }),
});

const result = await response.json();
console.log("resume result:", JSON.stringify(result, null, 2));
