/**
 * This example describes how to get plugin details and tool schemas by plugin ID.
 */

// Get an access_token through personal access token or oauth.
const cozeApiToken = process.env.COZE_WORKLOAD_API_TOKEN!;
// The default access is api.coze.cn, but if you need to access api.coze.com,
// please use COZE_API_BASE_URL to configure the api endpoint to access.
const cozeApiBase = process.env.COZE_API_BASE_URL || "https://api.coze.cn";

// Create a plugin in Coze, copy the plugin ID from the web console.
const pluginId = "{plugin_id}";

// Call the coze plugin API to get plugin details and tool schemas.
const response = await fetch(`${cozeApiBase}/v1/plugins/${pluginId}`, {
  headers,
});

const result = await response.json();
console.log("plugin info:", JSON.stringify(result, null, 2));
