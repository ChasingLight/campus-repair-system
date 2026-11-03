/**
 * Coze Workflow Runner - CLI tool for calling Coze platform workflow APIs.
 * Run with: npx tsx workflow_runner.ts <command> [options]
 * Or with: bun workflow_runner.ts <command> [options]
 */

const DEFAULT_BASE_URL = "https://api.coze.cn";

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

async function apiGet(baseUrl: string, path: string, token: string, params?: Record<string, string | undefined>, silent = false, extraHeaders?: Record<string, string>) {
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

async function apiPost(baseUrl: string, path: string, token: string, body: Record<string, any>, extraHeaders?: Record<string, string>) {
  let data: any;
  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: makeHeaders(token, extraHeaders),
      body: JSON.stringify(body),
    });
    data = await resp.json();
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
  if (data.code !== 0) process.exit(1);
  return data;
}

async function apiPostStream(baseUrl: string, path: string, token: string, body: Record<string, any>, extraHeaders?: Record<string, string>) {
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: makeHeaders(token, extraHeaders),
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
  if (!resp.body) {
    console.error("Error: No response body for streaming request.");
    process.exit(1);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let hasError = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    process.stdout.write(text);
    if (text.includes("event:Error") || text.includes("event: Error")) hasError = true;
  }
  console.log();
  if (hasError) process.exit(1);
}

// ── Subcommands ─────────────────────────────────────────────────────

function buildRunBody(opts: Record<string, string>, isAsync = false) {
  if (opts["bot-id"] && opts["app-id"]) {
    console.error("Error: --bot-id and --app-id cannot be used together.");
    process.exit(1);
  }
  const body: Record<string, any> = { workflow_id: opts["_0"] };
  if (opts["parameters"]) body.parameters = JSON.parse(opts["parameters"]);
  if (opts["bot-id"]) body.bot_id = opts["bot-id"];
  if (opts["app-id"]) body.app_id = opts["app-id"];
  if (isAsync) body.is_async = true;
  return body;
}

function buildResumeBody(opts: Record<string, string>) {
  return {
    workflow_id: opts["_0"],
    event_id: opts["event-id"],
    resume_data: opts["resume-data"],
    interrupt_type: parseInt(opts["interrupt-type"], 10),
  };
}

const commands: Record<string, (opts: Record<string, string>) => Promise<void>> = {
  list: async (opts) => {
    const cfg = getConfig(opts);
    if (!cfg.workspaceId) {
      console.error("Error: workspace_id is required. Set COZE_PROJECT_SPACE_ID or use --workspace-id.");
      process.exit(1);
    }
    const pageSize = opts["page-size"] || "20";
    const fetchAll = "all" in opts;
    if (fetchAll) {
      let pageNum = 1;
      const allItems: any[] = [];
      while (true) {
        const data = await apiGet(cfg.baseUrl, "/v1/workflows", cfg.token, {
          workspace_id: cfg.workspaceId,
          publish_status: "published_online",
          page_num: String(pageNum),
          page_size: pageSize,
        }, true, cfg.extraHeaders);
        const items = data?.data?.items || [];
        allItems.push(...items);
        if (!data?.data?.has_more) break;
        pageNum++;
      }
      console.log(JSON.stringify({ code: 0, data: { items: allItems, total: allItems.length } }, null, 2));
    } else {
      await apiGet(cfg.baseUrl, "/v1/workflows", cfg.token, {
        workspace_id: cfg.workspaceId,
        publish_status: "published_online",
        page_num: opts["page-num"] || "1",
        page_size: pageSize,
      }, false, cfg.extraHeaders);
    }
  },

  info: async (opts) => {
    const cfg = getConfig(opts);
    await apiGet(cfg.baseUrl, `/v1/workflows/${opts["_0"]}`, cfg.token, undefined, false, cfg.extraHeaders);
  },

  run: async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(cfg.baseUrl, "/v1/workflow/run", cfg.token, buildRunBody(opts), cfg.extraHeaders);
  },

  "run-async": async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(cfg.baseUrl, "/v1/workflow/run", cfg.token, buildRunBody(opts, true), cfg.extraHeaders);
  },

  stream: async (opts) => {
    const cfg = getConfig(opts);
    await apiPostStream(cfg.baseUrl, "/v1/workflow/stream_run", cfg.token, buildRunBody(opts));
  },

  resume: async (opts) => {
    const cfg = getConfig(opts);
    await apiPost(cfg.baseUrl, "/v1/workflow/resume", cfg.token, buildResumeBody(opts), cfg.extraHeaders);
  },

  "stream-resume": async (opts) => {
    const cfg = getConfig(opts);
    await apiPostStream(cfg.baseUrl, "/v1/workflow/stream_resume", cfg.token, buildResumeBody(opts));
  },

  history: async (opts) => {
    const cfg = getConfig(opts);
    await apiGet(cfg.baseUrl, `/v1/workflows/${opts["_0"]}/run_histories/${opts["_1"]}`, cfg.token);
  },
};

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage: workflow_runner.ts <command> [options]

Commands:
  list                   List published workflows
  info <workflow_id>     Get workflow details
  run <workflow_id>      Run workflow synchronously
  run-async <workflow_id> Run workflow asynchronously
  stream <workflow_id>   Run workflow with streaming
  resume <workflow_id>   Resume interrupted workflow
  stream-resume <wf_id>  Resume interrupted workflow (streaming)
  history <wf_id> <exec_id> Query async execution result

Common options:
  --token TOKEN          API token (overrides COZE_WORKLOAD_API_TOKEN)
  --base-url URL         API base URL (overrides COZE_API_BASE_URL)
  --workspace-id ID      Workspace ID (overrides COZE_PROJECT_SPACE_ID)
  --header "key=value"   Extra HTTP header for debugging (repeatable)`);
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
