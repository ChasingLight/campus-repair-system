/**
 * Coze Plugin Runner - CLI tool for calling Coze platform plugin tools.
 * Run with: npx tsx plugin_runner.ts <command> [options]
 */

const DEFAULT_BASE_URL = "https://api.coze.cn";

// ── Config ──────────────────────────────────────────────────────────

interface Config {
  token: string;
  baseUrl: string;
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

const BOOLEAN_FLAGS = new Set(["all"]);
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
  const cliHeaders = opts["header"] ? opts["header"].split("\n") : undefined;
  const extraHeaders = parseExtraHeaders(process.env.COZE_EXTRA_HEADERS, cliHeaders);
  return { token, baseUrl, extraHeaders };
}

function makeHeaders(token: string, extraHeaders?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return h;
}

// ── HTTP helpers ────────────────────────────────────────────────────

async function apiGet(baseUrl: string, path: string, token: string, params?: Record<string, string | number | undefined>, extraHeaders?: Record<string, string>) {
  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  try {
    const resp = await fetch(url, { headers: makeHeaders(token, extraHeaders) });
    const data = await resp.json();
    if (data.code !== 0) {
      console.log(JSON.stringify(data, null, 2));
      process.exit(1);
    }
    return data;
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}

async function apiPost(baseUrl: string, path: string, token: string, body: Record<string, any>, extraHeaders?: Record<string, string>) {
  const url = `${baseUrl}${path}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: makeHeaders(token, extraHeaders),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.code !== 0) {
      console.log(JSON.stringify(data, null, 2));
      process.exit(1);
    }
    return data;
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}

// ── Subcommands ─────────────────────────────────────────────────────

const commands: Record<string, (opts: Record<string, string>) => Promise<void>> = {
  list: async (opts) => {
    const cfg = getConfig(opts);
    const pageSize = opts["page-size"] || "20";
    const fetchAll = "all" in opts;
    const params: Record<string, string | number | undefined> = {};
    if (opts["keyword"]) params.keyword = opts["keyword"];
    if (opts["is-official"] != null) params.is_official = opts["is-official"];

    if (fetchAll) {
      let pageNum = 1;
      const allItems: any[] = [];
      while (true) {
        const data = await apiGet(cfg.baseUrl, "/v1/stores/plugins", cfg.token, {
          ...params,
          page_num: pageNum,
          page_size: pageSize,
        }, cfg.extraHeaders);
        const items = data?.data?.items || [];
        allItems.push(...items);
        if (!data?.data?.has_more) break;
        pageNum++;
      }
      console.log(JSON.stringify({ code: 0, data: { items: allItems, total: allItems.length } }, null, 2));
    } else {
      const data = await apiGet(cfg.baseUrl, "/v1/stores/plugins", cfg.token, {
        ...params,
        page_num: opts["page-num"] || "1",
        page_size: pageSize,
      }, cfg.extraHeaders);
      console.log(JSON.stringify(data, null, 2));
    }
  },

  info: async (opts) => {
    const cfg = getConfig(opts);
    const pluginId = opts["_0"];
    if (!pluginId) {
      console.error("Error: plugin_id is required.");
      process.exit(1);
    }
    const data = await apiGet(cfg.baseUrl, `/v1/plugins/${pluginId}`, cfg.token, undefined, cfg.extraHeaders);
    console.log(JSON.stringify(data, null, 2));
  },

  run: async (opts) => {
    const cfg = getConfig(opts);
    const pluginId = opts["_0"];
    const toolName = opts["tool"];
    const argsStr = opts["args"];

    if (!pluginId || !toolName) {
      console.error("Error: plugin_id and --tool are required.");
      process.exit(1);
    }

    let args = {};
    if (argsStr) {
      try {
        args = JSON.parse(argsStr);
      } catch (e) {
        console.error("Error: --args must be a valid JSON string.");
        process.exit(1);
      }
    }

    const body = {
      tool_name: toolName,
      arguments: args,
    };
    const data = await apiPost(cfg.baseUrl, `/v1/plugins/${pluginId}/tools/call`, cfg.token, body, cfg.extraHeaders);
    console.log(JSON.stringify(data, null, 2));
  },
};

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage: plugin_runner.ts <command> [options]

Commands:
  list                                List available plugins from the plugin store
  info <plugin_id>                    Get plugin details and tool list
  run <plugin_id>                     Call a plugin tool

Options:
  --keyword TEXT             Search keyword for plugin name, fuzzy match (for list)
  --is-official BOOL         Filter official plugins: true/false (for list)
  --page-num NUM             Page number (for list)
  --page-size NUM            Page size (for list)
  --all                      Auto-paginate to fetch all plugins (for list)
  --tool NAME                Tool name to call (required for run)
  --args JSON                JSON string of tool arguments (for run)
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
