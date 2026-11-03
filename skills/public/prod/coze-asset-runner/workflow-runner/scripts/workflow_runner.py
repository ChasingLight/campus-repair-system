#!/usr/bin/env python3
"""Coze Workflow Runner - CLI tool for calling Coze platform workflow APIs."""

import argparse
import json
import os
import sys
from urllib.parse import urlencode

import requests

DEFAULT_BASE_URL = "https://api.coze.cn"


def parse_extra_headers(env_value=None, cli_headers=None):
    """Parse extra headers from env var and CLI args. CLI overrides env."""
    headers = {}
    if env_value:
        for pair in env_value.split(";"):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                headers[k.strip()] = v.strip()
    if cli_headers:
        for pair in cli_headers:
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                headers[k.strip()] = v.strip()
    return headers


def get_config(args):
    """Resolve config with priority: args > env > defaults."""
    token = getattr(args, "token", None) or os.environ.get("COZE_WORKLOAD_API_TOKEN")
    if not token:
        print("Error: API token is required. Set COZE_WORKLOAD_API_TOKEN or use --token.", file=sys.stderr)
        sys.exit(1)
    base_url = (getattr(args, "base_url", None) or os.environ.get("COZE_API_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    workspace_id = getattr(args, "workspace_id", None) or os.environ.get("COZE_PROJECT_SPACE_ID")
    cli_headers = getattr(args, "header", None)
    extra_headers = parse_extra_headers(os.environ.get("COZE_EXTRA_HEADERS"), cli_headers)
    return {"token": token, "base_url": base_url, "workspace_id": workspace_id, "extra_headers": extra_headers}


def make_headers(token, extra_headers=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if extra_headers:
        h.update(extra_headers)
    return h


def api_get(base_url, path, token, params=None, silent=False, extra_headers=None):
    """Make a GET request and return the JSON response."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    try:
        resp = requests.get(url, headers=make_headers(token, extra_headers), timeout=600)
        data = resp.json()
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError:
        print(f"Error: HTTP {resp.status_code} - failed to parse response", file=sys.stderr)
        sys.exit(1)
    if not silent:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    if data.get("code", 0) != 0:
        if silent:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        sys.exit(1)
    return data


def api_post(base_url, path, token, body, extra_headers=None):
    """Make a POST request and return the JSON response."""
    url = f"{base_url}{path}"
    try:
        resp = requests.post(url, headers=make_headers(token, extra_headers), json=body, timeout=600)
        data = resp.json()
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError:
        print(f"Error: HTTP {resp.status_code} - failed to parse response", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(data, ensure_ascii=False, indent=2))
    if data.get("code", 0) != 0:
        sys.exit(1)
    return data


def api_post_stream(base_url, path, token, body, extra_headers=None):
    """Make a POST request with SSE streaming, print events to stdout."""
    url = f"{base_url}{path}"
    try:
        resp = requests.post(url, headers=make_headers(token, extra_headers), json=body, stream=True, timeout=600)
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    has_error = False
    for line in resp.iter_lines(decode_unicode=True):
        if line:
            print(line, flush=True)
            if line.strip() in ("event:Error", "event: Error"):
                has_error = True
    if has_error:
        sys.exit(1)


# ── Subcommand handlers ──────────────────────────────────────────────

def cmd_list(args):
    cfg = get_config(args)
    if not cfg["workspace_id"]:
        print("Error: workspace_id is required. Set COZE_PROJECT_SPACE_ID or use --workspace-id.", file=sys.stderr)
        sys.exit(1)
    page_size = getattr(args, "page_size", None) or 20
    fetch_all = getattr(args, "all", False)
    if fetch_all:
        page_num = 1
        all_items = []
        while True:
            params = {
                "workspace_id": cfg["workspace_id"],
                "publish_status": "published_online",
                "page_num": page_num,
                "page_size": page_size,
            }
            data = api_get(cfg["base_url"], "/v1/workflows", cfg["token"], params, silent=True, extra_headers=cfg.get("extra_headers"))
            items = data.get("data", {}).get("items", [])
            all_items.extend(items)
            if not data.get("data", {}).get("has_more", False):
                break
            page_num += 1
        result = {"code": 0, "data": {"items": all_items, "total": len(all_items)}}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        params = {
            "workspace_id": cfg["workspace_id"],
            "publish_status": "published_online",
            "page_num": getattr(args, "page_num", None) or 1,
            "page_size": page_size,
        }
        api_get(cfg["base_url"], "/v1/workflows", cfg["token"], params, extra_headers=cfg.get("extra_headers"))


def cmd_info(args):
    cfg = get_config(args)
    params = {"include_input_output": "true"}
    api_get(cfg["base_url"], f"/v1/workflows/{args.workflow_id}", cfg["token"], params, extra_headers=cfg.get("extra_headers"))


def _build_run_body(args, is_async=False):
    if args.bot_id and args.app_id:
        print("Error: --bot-id and --app-id cannot be used together.", file=sys.stderr)
        sys.exit(1)
    body = {"workflow_id": args.workflow_id}
    if args.parameters:
        body["parameters"] = json.loads(args.parameters)
    if args.bot_id:
        body["bot_id"] = args.bot_id
    if args.app_id:
        body["app_id"] = args.app_id
    if is_async:
        body["is_async"] = True
    return body


def cmd_run(args):
    cfg = get_config(args)
    body = _build_run_body(args, is_async=False)
    api_post(cfg["base_url"], "/v1/workflow/run", cfg["token"], body, extra_headers=cfg.get("extra_headers"))


def cmd_run_async(args):
    cfg = get_config(args)
    body = _build_run_body(args, is_async=True)
    api_post(cfg["base_url"], "/v1/workflow/run", cfg["token"], body, extra_headers=cfg.get("extra_headers"))


def cmd_stream(args):
    cfg = get_config(args)
    body = _build_run_body(args, is_async=False)
    api_post_stream(cfg["base_url"], "/v1/workflow/stream_run", cfg["token"], body, extra_headers=cfg.get("extra_headers"))


def cmd_resume(args):
    cfg = get_config(args)
    body = {
        "workflow_id": args.workflow_id,
        "event_id": args.event_id,
        "resume_data": args.resume_data,
        "interrupt_type": int(args.interrupt_type),
    }
    api_post(cfg["base_url"], "/v1/workflow/resume", cfg["token"], body, extra_headers=cfg.get("extra_headers"))


def cmd_stream_resume(args):
    cfg = get_config(args)
    body = {
        "workflow_id": args.workflow_id,
        "event_id": args.event_id,
        "resume_data": args.resume_data,
        "interrupt_type": int(args.interrupt_type),
    }
    api_post_stream(cfg["base_url"], "/v1/workflow/stream_resume", cfg["token"], body, extra_headers=cfg.get("extra_headers"))


def cmd_history(args):
    cfg = get_config(args)
    path = f"/v1/workflows/{args.workflow_id}/run_histories/{args.execute_id}"
    api_get(cfg["base_url"], path, cfg["token"], extra_headers=cfg.get("extra_headers"))


# ── CLI ───────────────────────────────────────────────────────────────

def _add_common_args(parser):
    parser.add_argument("--token", help="API token (overrides COZE_WORKLOAD_API_TOKEN)")
    parser.add_argument("--base-url", help="API base URL (overrides COZE_API_BASE_URL)")
    parser.add_argument("--header", action="append", help='Extra HTTP header (key=value), repeatable. E.g. --header "key1=val1"')


def _add_run_args(parser):
    parser.add_argument("workflow_id", help="Workflow ID to execute")
    parser.add_argument("--parameters", help="JSON string of input parameters")
    parser.add_argument("--bot-id", help="Bot ID (cannot use with --app-id)")
    parser.add_argument("--app-id", help="App ID (cannot use with --bot-id)")
    _add_common_args(parser)


def _add_resume_args(parser):
    parser.add_argument("workflow_id", help="Workflow ID")
    parser.add_argument("--event-id", required=True, help="Interrupt event ID")
    parser.add_argument("--resume-data", required=True, help="User response data")
    parser.add_argument("--interrupt-type", required=True, help="Interrupt type code")
    _add_common_args(parser)


def main():
    parser = argparse.ArgumentParser(description="Coze Workflow Runner")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    p_list = subparsers.add_parser("list", help="List published workflows")
    p_list.add_argument("--workspace-id", help="Workspace ID (overrides COZE_PROJECT_SPACE_ID)")
    p_list.add_argument("--page-num", type=int, help="Page number")
    p_list.add_argument("--page-size", type=int, help="Page size")
    p_list.add_argument("--all", action="store_true", help="Auto-paginate to fetch all workflows")
    _add_common_args(p_list)

    # info
    p_info = subparsers.add_parser("info", help="Get workflow details")
    p_info.add_argument("workflow_id", help="Workflow ID")
    _add_common_args(p_info)

    # run
    p_run = subparsers.add_parser("run", help="Run workflow synchronously")
    _add_run_args(p_run)

    # run-async
    p_run_async = subparsers.add_parser("run-async", help="Run workflow asynchronously")
    _add_run_args(p_run_async)

    # stream
    p_stream = subparsers.add_parser("stream", help="Run workflow with streaming")
    _add_run_args(p_stream)

    # resume
    p_resume = subparsers.add_parser("resume", help="Resume interrupted workflow")
    _add_resume_args(p_resume)

    # stream-resume
    p_stream_resume = subparsers.add_parser("stream-resume", help="Resume interrupted workflow (streaming)")
    _add_resume_args(p_stream_resume)

    # history
    p_history = subparsers.add_parser("history", help="Query async execution result")
    p_history.add_argument("workflow_id", help="Workflow ID")
    p_history.add_argument("execute_id", help="Execution ID")
    _add_common_args(p_history)

    args = parser.parse_args()

    commands = {
        "list": cmd_list,
        "info": cmd_info,
        "run": cmd_run,
        "run-async": cmd_run_async,
        "stream": cmd_stream,
        "resume": cmd_resume,
        "stream-resume": cmd_stream_resume,
        "history": cmd_history,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
