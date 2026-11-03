/**
 * This example describes how to execute a specific tool within a plugin.
 * The arguments field is an object (Map), not a JSON string.
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

// Create a plugin in Coze, copy the plugin ID from the web console.
const pluginId = "{plugin_id}";

// Specify the tool name and arguments to call.
// The arguments field is an object (Map), not a JSON string.
const toolName = "{tool_name}";
const arguments_ = {
  key: "value",
};

// Call the coze plugin tool API to execute the specified tool.
const response = await fetch(
  `${cozeApiBase}/v1/plugins/${pluginId}/tools/call`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      tool_name: toolName,
      arguments: arguments_,
    }),
  },
);

const result = await response.json();
console.log("plugin tool result:", JSON.stringify(result, null, 2));
