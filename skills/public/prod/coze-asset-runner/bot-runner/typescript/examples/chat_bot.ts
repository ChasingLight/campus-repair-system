/**
 * This example describes how to chat with a bot using non-streaming mode. The
 * API creates a chat, then polls until completion, and finally retrieves the
 * messages.
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

// Create a bot instance in Coze, copy the last number from the web link as the bot's ID.
const botId = "{bot_id}";

// Call the chat API in non-streaming mode.
const response = await fetch(`${cozeApiBase}/v3/chat`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    bot_id: botId,
    user_id: "default_user",
    stream: false,
    additional_messages: [
      {
        role: "user",
        content: "hello",
        content_type: "text",
      },
    ],
    auto_save_history: true,
  }),
});

const chatResult = await response.json();
console.log("chat created:", JSON.stringify(chatResult, null, 2));

const conversationId = chatResult.data.conversation_id;
const chatId = chatResult.data.id;

// Poll the retrieve API until the chat status is completed, failed, or canceled.
const terminalStatuses = ["completed", "failed", "canceled"];
let retrieveResult: any;

while (true) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
    chat_id: chatId,
  });

  const retrieveResponse = await fetch(
    `${cozeApiBase}/v3/chat/retrieve?${params}`,
    {
      headers,
    }
  );

  retrieveResult = await retrieveResponse.json();
  if (terminalStatuses.includes(retrieveResult.data.status)) {
    break;
  }

  // Wait 1 second before polling again.
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.log("chat status:", JSON.stringify(retrieveResult, null, 2));

// Retrieve the chat messages.
const messageParams = new URLSearchParams({
  conversation_id: conversationId,
  chat_id: chatId,
});

const messageResponse = await fetch(
  `${cozeApiBase}/v3/chat/message/list?${messageParams}`,
  {
    headers,
  }
);

const messageResult = await messageResponse.json();
console.log("messages:", JSON.stringify(messageResult, null, 2));
