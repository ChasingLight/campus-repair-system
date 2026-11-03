/**
 * This example describes how to list published bots in a workspace.
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

// The workspace ID where the bots are located.
const workspaceId = process.env.COZE_PROJECT_SPACE_ID!;

// Call the list bots API. Supports pagination via page_num and page_size.
const params = new URLSearchParams({
  workspace_id: workspaceId,
  publish_status: "published_online",
  page_num: "1",
  page_size: "20",
});

const response = await fetch(`${cozeApiBase}/v1/bots?${params}`, {
  headers,
});

const result = await response.json();
console.log("bots:", JSON.stringify(result, null, 2));
