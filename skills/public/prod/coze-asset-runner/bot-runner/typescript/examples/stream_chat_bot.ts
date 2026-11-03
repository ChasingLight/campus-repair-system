/**
 * This example describes how to chat with a bot using streaming mode (SSE). The
 * API returns results incrementally via Server-Sent Events.
 *
 * SSE format from Coze:
 *   event:conversation.message.delta
 *   data:{"id":"...","role":"assistant","type":"answer","content":"Hi",...}
 *
 * Deep thinking mode:
 *   - While thinking: content is empty, reasoning_content contains the thought
 *   - After thinking: content contains the answer, reasoning_content is absent
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

// Call the chat API in streaming mode.
const response = await fetch(`${cozeApiBase}/v3/chat`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    bot_id: botId,
    user_id: "default_user",
    stream: true,
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

// Process the SSE stream.
// Chunks may contain partial lines, so we buffer incomplete data across reads.
const reader = response.body!.getReader();
const decoder = new TextDecoder();

let buffer = "";
let currentEvent = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  // Split buffer into complete lines; keep the last (possibly incomplete) piece.
  const lines = buffer.split("\n");
  buffer = lines.pop()!;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line marks the end of an SSE block; reset event state.
    if (trimmed === "") {
      currentEvent = "";
      continue;
    }

    // Track the current event type.
    if (trimmed.startsWith("event:")) {
      currentEvent = trimmed.slice("event:".length).trim();
      continue;
    }

    // Parse the data payload.
    if (trimmed.startsWith("data:")) {
      const raw = trimmed.slice("data:".length).trim();

      // The final "done" event sends data:[DONE] — not valid JSON.
      if (currentEvent === "done" || raw === "[DONE]") {
        console.log("\n[stream done]");
        continue;
      }

      try {
        const data = JSON.parse(raw);

        if (currentEvent === "conversation.message.delta") {
          // In deep-thinking mode, reasoning_content carries the thought while
          // content is empty. Once thinking finishes, content carries the answer.
          if (data.reasoning_content) {
            process.stdout.write(data.reasoning_content);
          } else if (data.content) {
            process.stdout.write(data.content);
          }
        } else if (currentEvent === "conversation.chat.completed") {
          console.log("\n[chat completed]", JSON.stringify(data, null, 2));
        }
      } catch {
        // Skip lines that are not valid JSON.
      }
    }
  }
}
