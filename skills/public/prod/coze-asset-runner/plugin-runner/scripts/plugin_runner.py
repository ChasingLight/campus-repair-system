#!/usr/bin/env python3
"""Coze Plugin Runner - CLI tool for calling Coze platform plugin tools."""

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
    cli_headers = getattr(args, "header", None)
    extra_headers = parse_extra_headers(os.environ.get("COZE_EXTRA_HEADERS"), cli_headers)
    return {"token": token, "base_url": base_url, "extra_headers": extra_headers}

def make_headers(token, extra_headers=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if extra_headers:
        h.update(extra_headers)
    return h

def api_get(base_url, path, token, params=None, extra_headers=None):
    """Make a GET request and return the JSON response."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    try:
        resp = requests.get(url, headers=make_headers(token, extra_headers), timeout=60)
        data = resp.json()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    if data.get("code", 0) != 0:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        sys.exit(1)
    return data

def api_post(base_url, path, token, body, extra_headers=None):
    """Make a POST request and return the JSON response."""
    url = f"{base_url}{path}"
    try:
        resp = requests.post(url, headers=make_headers(token, extra_headers), json=body, timeout=60)
        data = resp.json()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    if data.get("code", 0) != 0:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        sys.exit(1)
    return data

# ── Plugin subcommands ──────────────────────────────────────────────

def cmd_list(args):
    """List available plugins from the plugin store."""
    cfg = get_config(args)
    page_size = getattr(args, "page_size", None) or 20
    fetch_all = getattr(args, "all", False)
    params = {}
    if getattr(args, "keyword", None):
        params["keyword"] = args.keyword
    if getattr(args, "is_official", None) is not None:
        params["is_official"] = str(args.is_official).lower()

    if fetch_all:
        page_num = 1
        all_items = []
        while True:
            params.update({"page_num": page_num, "page_size": page_size})
            data = api_get(cfg["base_url"], "/v1/stores/plugins", cfg["token"], params, extra_headers=cfg.get("extra_headers"))
            items = data.get("data", {}).get("items", [])
            all_items.extend(items)
            if not data.get("data", {}).get("has_more", False):
                break
            page_num += 1
        result = {"code": 0, "data": {"items": all_items, "total": len(all_items)}}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        params.update({
            "page_num": getattr(args, "page_num", None) or 1,
            "page_size": page_size,
        })
        data = api_get(cfg["base_url"], "/v1/stores/plugins", cfg["token"], params, extra_headers=cfg.get("extra_headers"))
        print(json.dumps(data, ensure_ascii=False, indent=2))

def cmd_info(args):
    """Get plugin details: tool list and schemas."""
    cfg = get_config(args)
    data = api_get(cfg["base_url"], f"/v1/plugins/{args.plugin_id}", cfg["token"], extra_headers=cfg.get("extra_headers"))
    print(json.dumps(data, ensure_ascii=False, indent=2))

def cmd_run(args):
    """Run a plugin tool."""
    cfg = get_config(args)
    try:
        arguments = json.loads(args.arguments) if args.arguments else {}
    except json.JSONDecodeError:
        print("Error: --args must be a valid JSON string.", file=sys.stderr)
        sys.exit(1)

    body = {
        "tool_name": args.tool_name,
        "arguments": arguments
    }
    data = api_post(cfg["base_url"], f"/v1/plugins/{args.plugin_id}/tools/call", cfg["token"], body, extra_headers=cfg.get("extra_headers"))
    print(json.dumps(data, ensure_ascii=False, indent=2))

# ── CLI ───────────────────────────────────────────────────────────────

def _add_common_args(parser):
    parser.add_argument("--token", help="API token (overrides COZE_WORKLOAD_API_TOKEN)")
    parser.add_argument("--base-url", help="API base URL (overrides COZE_API_BASE_URL)")
    parser.add_argument("--header", action="append", help='Extra HTTP header (key=value), repeatable. E.g. --header "key1=val1"')

def main():
    parser = argparse.ArgumentParser(description="Coze Plugin Runner")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_list = subparsers.add_parser("list", help="List available plugins from the plugin store")
    p_list.add_argument("--keyword", help="Search keyword for plugin name (fuzzy match)")
    p_list.add_argument("--is-official", type=lambda x: x.lower() == "true", help="Filter official plugins (true/false)")
    p_list.add_argument("--page-num", type=int)
    p_list.add_argument("--page-size", type=int)
    p_list.add_argument("--all", action="store_true", help="Auto-paginate to fetch all plugins")
    _add_common_args(p_list)

    p_info = subparsers.add_parser("info", help="Get plugin details and tool list")
    p_info.add_argument("plugin_id", help="Plugin ID")
    _add_common_args(p_info)

    p_run = subparsers.add_parser("run", help="Call a plugin tool")
    p_run.add_argument("plugin_id", help="Plugin ID")
    p_run.add_argument("--tool", dest="tool_name", required=True, help="Tool name to call")
    p_run.add_argument("--args", dest="arguments", help="JSON string of tool arguments")
    _add_common_args(p_run)

    args = parser.parse_args()
    if args.command == "list":
        cmd_list(args)
    elif args.command == "info":
        cmd_info(args)
    elif args.command == "run":
        cmd_run(args)

if __name__ == "__main__":
    main()
