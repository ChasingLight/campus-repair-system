/**
 * Coze Bot Runner - CLI tool for calling Coze platform bot (agent) APIs.
 * Run with: npx tsx bot_runner.ts <command> [options]
 * Or with: bun bot_runner.ts <command> [options]
 */

const DEFAULT_BASE_URL = "https://api.coze.cn";
const DEFAULT_USER_ID = "default_user";
const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 120;

// ── Config ──────────────────────────────────────────────────────────

interface Config {
  token: string;
  baseUrl: string;
  workspaceId?: string;
  extraHeaders: Record<string, string>;
}

function parseExtraHeaders(envValue?: string, cliHeaders?: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  if (envValue) {
    for (const pair of envValue.split(";")) {
      const trimmed = pair.trim();
      const idx = trimmed.indexOf("=");
      if (idx > 0) headers[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  if (cliHeaders) {
    for (const pair of cliHeaders) {
      const trimmed = pair.trim();
      const idx = trimmed.indexOf("=");
      if (idx > 0) headers[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return headers;
}

const BOOLEAN_FLAGS = new Set(["all", "draft"]);
const REPEATABLE_FLAGS = new Set(["header"]);

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      if (REPEATABLE_FLAGS.has(key)) {
        const val = args[++i] ?? "";
        result[key] = result[key] ? result[key] + "\n" + val : val;
      } else if (BOOLEAN_FLAGS.has(key)) {
        result[key] = "true";
      } else {
        result[key] = args[++i] ?? "";
      }
    } else {
      positional.push(args[i]);
    }
  }
  positional.forEach((v, i) => (result[`_${i}`] = v));
  return result;
}

function getConfig(opts: Record<string, string>): Config {
  const token = opts["token"] || process.env.COZE_WORKLOAD_API_TOKEN;
  if (!token) {
    console.error("Error: API token is required. Set COZE_WORKLOAD_API_TOKEN or use --token.");
    process.exit(1);
  }
  const baseUrl = (opts["base-url"] || process.env.COZE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const workspaceId = opts["workspace-id"] || process.env.COZE_PROJECT_SPACE_ID;
  const cliHeaders = opts["header"] ? opts["header"].split("\n") : undefined;
  const extraHeaders = parseExtraHeaders(process.env.COZE_EXTRA_HEADERS, cliHeaders);
  return { token, baseUrl, workspaceId, extraHeaders };
}

function makeHeaders(token: string, extraHeaders?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return h;
}

// ── HTTP helpers ────────────────────────────────────────────────────

async function apiGet(
  baseUrl: string,
  path: string,
  token: string,
  params?: Record<string, string | undefined>,
  silent = false,
  extraHeaders?: Record<string, string>,
) {
  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  let data: any;
  try {
    const resp = await fetch(url, { headers: makeHeaders(token, extraHeaders) });
    data = await resp.json();
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  if (!silent) console.log(JSON.stringify(data, null, 2));
  if (data.code !== 0) {
    if (silent) console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

async function apiPost(
  baseUrl: string,
  path: string,
  token: string,
  body: Record<string, any>,
  silent = false,
  params?: Record<string, string | undefined>,
  extraHeaders?: Record<string, string>,
) {
  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  let data: any;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: makeHeaders(token, extraHeaders),
      body: JSON.stringify(body),
    });
    data = await resp.json();
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  if (!silent) console.log(JSON.stringify(data, null, 2));
  if (data.code !== 0) {
    if (silent) console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

async function apiPut(
  baseUrl: string,
  path: string,
  token: string,
  body: Record<string, any>,
  silent = false,
  extraHeaders?: Record<string, string>,
) {
  const url = `${baseUrl}${path}`;
  let data: any;
  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: makeHeaders(token, extraHeaders),
      body: JSON.stringify(body),
    });
    data = await resp.json();
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  if (!silent) console.log(JSON.stringify(data, null, 2));
  if (data.code !== 0) {
    if (silent) console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

async function apiDelete(
  baseUrl: string,
  path: string,
  token: string,
  params?: Record<string, string | undefined>,
  silent = false,
  extraHeaders?: Record<string, string>,
) {
  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  let data: any;
  try {
    const resp = await fetch(url, {
      method: "DELETE",
      headers: makeHeaders(token, extraHeaders),
    });
    data = await resp.json();
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  if (!silent) console.log(JSON.stringify(data, null, 2));
  if (data.code !== 0) {
    if (silent) console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

async function apiPostStream(baseUrl: string, path: string, token: string, body: Record<string, any>, params?: Record<string, string | undefined>, extraHeaders?: Record<string, string>) {
  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: makeHeaders(token, extraHeaders),
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  if (!resp!.body) {
    console.error("Error: No response body for streaming request.");
    process.exit(1);
  }
  const reader = resp!.body.getReader();
  const decoder = new TextDecoder();
  let hasError = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    process.stdout.write(text);
    const lower = text.toLowerCase();
    if (lower.includes("event:error") || lower.includes("event: error")) hasError = true;
    if (text.includes("conversation.chat.failed")) hasError = true;
  }
  console.log();
  if (hasError) process.exit(1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Subcommands ─────────────────────────────────────────────────────

function buildChatBody(opts: Record<string, string>, stream: boolean) {
  // conversation_id is a query param for /v3/chat, not in the body
  return {
    bot_id: opts["_0"],
    user_id: opts["user-id"] || DEFAULT_USER_ID,
    stream,
    additional_messages: [
      { role: "user", content: opts["message"], content_type: "text" },
    ],
    auto_save_history: true,
  };
}

function buildChatParams(opts: Record<string, string>): Record<string, string | undefined> | undefined {
  return opts["conversation-id"] ? { conversation_id: opts["conversation-id"] } : undefined;
}

const commands: Record<string, (opts: Record<string, string>) => Promise<void>> = {
  list: async (opts) => {
    const cfg = getConfig(opts);
    if (!cfg.workspaceId) {
      console.error("Error: workspace_id is required. Set COZE_PROJECT_SPACE_ID or use --workspace-id.");
      process.exit(1);
    }
    const pageSize = opts["page-size"] || "20";
    const fetchAll = opts["all"] === "true";
    if (fetchAll) {
      let pageNum = 1;
      const allItems: any[] = [];
      while (true) {
        const data = await apiGet(cfg.baseUrl, "/v1/bots", cfg.token, {
          workspace_id: cfg.workspaceId,
          publish_status: "published_online",
          page_num: String(pageNum),
          page_size: pageSize,
        }, true, cfg.extraHeaders);
        const items = data?.data?.items || [];
        allItems.push(...items);
        const total = data?.data?.total ?? 0;
        if (allItems.length >= total) break;
        pageNum++;
      }
      console.log(JSON.stringify({ code: 0, data: { items: allItems, total: allItems.length } }, null, 2));
    } else {
      await apiGet(cfg.baseUrl, "/v1/bots", cfg.token, {
        workspace_id: cfg.workspaceId,
        publish_status: "published_online",
        page_num: opts["page-num"] || "1",
        page_size: pageSize,
      }, false, cfg.extraHeaders);
    }
  },

  info: async (opts) => {
    const cfg = getConfig(opts);
    const isDraft = opts["draft"] === "true";
    await apiGet(cfg.baseUrl, `/v1/bots/${opts["_0"]}`, cfg.token, {
      is_published: isDraft ? "false" : "true",
    }, false, cfg.extraHeaders);
  },

  chat: async (opts) => {
    const cfg = getConfig(opts);
    if (!opts["message"]) {
      console.error("Error: --message is required.");
      process.exit(1);
    }
    // Start chat — conversation_id is a query param, not in the body
    const startData = await apiPost(cfg.baseUrl, "/v3/chat", cfg.token, buildChatBody(opts, false), true, buildChatParams(opts), cfg.extraHeaders);
    const chatId = startData?.data?.id;
    const conversationId = startData?.data?.conversation_id;
    console.error(`Chat started: chat_id=${chatId}, conversation_id=${conversationId}`);

    // Poll for completion
    const terminalStatuses = new Set(["completed", "failed", "canceled", "requires_action"]);
    let status = "";
    let pollData: any;
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);
      pollData = await apiGet(cfg.baseUrl, "/v3/chat/retrieve", cfg.token, {
        conversation_id: conversationId,
        chat_id: chatId,
      }, true, cfg.extraHeaders);
      status = pollData?.data?.status || "";
      if (terminalStatuses.has(status)) break;
    }

    if (!terminalStatuses.has(status)) {
      console.error("Error: Timed out waiting for chat to complete.");
      process.exit(1);
    }
    if (status === "failed" || status === "canceled") {
      console.log(JSON.stringify(pollData, null, 2));
      process.exit(1);
    }

    // Fetch messages
    await apiGet(cfg.baseUrl, "/v3/chat/message/list", cfg.token, {
      conversation_id: conversationId,
      chat_id: chatId,
    });
  },

  stream: async (opts) => {
    const cfg = getConfig(opts);
    if (!opts["message"]) {
      console.error("Error: --message is required.");
      process.exit(1);
    }
    await apiPostStream(cfg.baseUrl, "/v3/chat", cfg.token, buildChatBody(opts, true), buildChatParams(opts), cfg.extraHeaders);
  },

  history: async (opts) => {
    const cfg = getConfig(opts);
    await apiGet(cfg.baseUrl, "/v3/chat/message/list", cfg.token, {
      conversation_id: opts["_0"],
      chat_id: opts["_1"],
    }, false, cfg.extraHeaders);
  },

  cancel: async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(cfg.baseUrl, "/v3/chat/cancel", cfg.token, {
      conversation_id: opts["_0"],
      chat_id: opts["_1"],
    }, false, undefined, cfg.extraHeaders);
  },

  // ── Conversation commands ──

  "create-conversation": async (opts) => {
    const cfg = getConfig(opts);
    const body: Record<string, any> = {};
    if (opts["bot-id"]) body["bot_id"] = opts["bot-id"];
    if (opts["name"]) body["name"] = opts["name"];
    await apiPost(cfg.baseUrl, "/v1/conversation/create", cfg.token, body, false, undefined, cfg.extraHeaders);
  },

  "get-conversation": async (opts) => {
    const cfg = getConfig(opts);
    await apiGet(cfg.baseUrl, "/v1/conversation/retrieve", cfg.token, {
      conversation_id: opts["_0"],
    }, false, cfg.extraHeaders);
  },

  "list-conversations": async (opts) => {
    const cfg = getConfig(opts);
    await apiGet(cfg.baseUrl, "/v1/conversations", cfg.token, {
      bot_id: opts["_0"],
      page_num: opts["page-num"] || "1",
      page_size: opts["page-size"] || "50",
      sort_order: (opts["sort-order"] || "desc").toLowerCase(),
    });
  },

  "edit-conversation": async (opts) => {
    const cfg = getConfig(opts);
    await apiPut(cfg.baseUrl, `/v1/conversations/${opts["_0"]}`, cfg.token, {
      name: opts["name"],
    });
  },

  "delete-conversation": async (opts) => {
    const cfg = getConfig(opts);
    await apiDelete(cfg.baseUrl, `/v1/conversations/${opts["_0"]}`, cfg.token, undefined, false, cfg.extraHeaders);
  },

  "clear-context": async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(cfg.baseUrl, `/v1/conversations/${opts["_0"]}/clear`, cfg.token, {}, false, undefined, cfg.extraHeaders);
  },

  // ── Message commands ──

  "add-message": async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(
      cfg.baseUrl,
      "/v1/conversation/message/create",
      cfg.token,
      {
        role: opts["role"],
        content: opts["content"],
        content_type: "text",
      },
      false,
      { conversation_id: opts["_0"] },
      cfg.extraHeaders,
    );
  },

  "list-messages": async (opts) => {
    const cfg = getConfig(opts);
    const body: Record<string, any> = { order: opts["order"] || "desc" };
    if (opts["chat-id"]) body["chat_id"] = opts["chat-id"];
    if (opts["limit"]) body["limit"] = Number(opts["limit"]);
    await apiPost(
      cfg.baseUrl,
      "/v1/conversation/message/list",
      cfg.token,
      body,
      false,
      { conversation_id: opts["_0"] },
      cfg.extraHeaders,
    );
  },

  "get-message": async (opts) => {
    const cfg = getConfig(opts);
    await apiGet(cfg.baseUrl, "/v1/conversation/message/retrieve", cfg.token, {
      conversation_id: opts["_0"],
      message_id: opts["_1"],
    }, false, cfg.extraHeaders);
  },

  "modify-message": async (opts) => {
    const cfg = getConfig(opts);
    const body: Record<string, any> = {};
    if (opts["content"]) {
      body["content"] = opts["content"];
      body["content_type"] = opts["content-type"] || "text";
    }
    await apiPost(
      cfg.baseUrl,
      "/v1/conversation/message/modify",
      cfg.token,
      body,
      false,
      { conversation_id: opts["_0"], message_id: opts["_1"] },
      cfg.extraHeaders,
    );
  },

  "delete-message": async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(
      cfg.baseUrl,
      "/v1/conversation/message/delete",
      cfg.token,
      {},
      false,
      { conversation_id: opts["_0"], message_id: opts["_1"] },
      cfg.extraHeaders,
    );
  },
};

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage: bot_runner.ts <command> [options]

Commands:
  list                                List published bots in workspace
  info <bot_id>                       Get bot details and capabilities
  chat <bot_id>                       Chat with bot (non-streaming, polls until done)
  stream <bot_id>                     Chat with bot (streaming SSE)
  history <conv_id> <chat_id>         List messages from a chat
  cancel <conv_id> <chat_id>          Cancel an ongoing chat
  create-conversation                 Create a new conversation
  get-conversation <conv_id>          Get conversation info
  list-conversations <bot_id>         List conversations for a bot
  edit-conversation <conv_id>         Update conversation name
  delete-conversation <conv_id>       Delete a conversation
  clear-context <conv_id>             Clear conversation context (new section)
  add-message <conv_id>               Add a message to a conversation
  list-messages <conv_id>             List messages in a conversation
  get-message <conv_id> <msg_id>      Get a specific message
  modify-message <conv_id> <msg_id>   Modify a message
  delete-message <conv_id> <msg_id>   Delete a message

Chat options:
  --message TEXT             Message to send (required for chat/stream)
  --user-id ID               User ID for context isolation (default: default_user)
  --conversation-id ID       Reuse an existing conversation (multi-turn chat)

List options:
  --workspace-id ID          Workspace ID (overrides COZE_PROJECT_SPACE_ID)
  --page-num N               Page number (default: 1)
  --page-size N              Page size (default: 20)
  --all                      Auto-paginate to fetch all bots

Info options:
  --draft                    Show draft version instead of published

Common options:
  --token TOKEN              API token (overrides COZE_WORKLOAD_API_TOKEN)
  --base-url URL             API base URL (overrides COZE_API_BASE_URL)
  --header "key=value"       Extra HTTP header for debugging (repeatable)`);
    process.exit(0);
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}. Use --help for usage.`);
    process.exit(1);
  }

  const opts = parseArgs(args.slice(1));
  await handler(opts);
}

main();
