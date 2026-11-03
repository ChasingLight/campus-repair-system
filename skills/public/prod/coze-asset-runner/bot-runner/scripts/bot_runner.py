#!/usr/bin/env python3
"""Coze Bot Runner - CLI tool for calling Coze platform bot (agent) APIs."""

import argparse
import json
import os
import sys
import time
from urllib.parse import urlencode

import requests

DEFAULT_BASE_URL = "https://api.coze.cn"
DEFAULT_USER_ID = "default_user"
POLL_INTERVAL = 1        # seconds between status polls
POLL_MAX_ATTEMPTS = 120  # ~2 minutes max wait


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
        resp = requests.get(url, headers=make_headers(token, extra_headers), timeout=60)
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


def api_post(base_url, path, token, body, silent=False, params=None, extra_headers=None):
    """Make a POST request and return the JSON response."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    try:
        resp = requests.post(url, headers=make_headers(token, extra_headers), json=body, timeout=60)
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


def api_put(base_url, path, token, body, silent=False, params=None, extra_headers=None):
    """Make a PUT request and return the JSON response."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    try:
        resp = requests.put(url, headers=make_headers(token, extra_headers), json=body, timeout=60)
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


def api_delete(base_url, path, token, params=None, silent=False, extra_headers=None):
    """Make a DELETE request and return the JSON response."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    try:
        resp = requests.delete(url, headers=make_headers(token, extra_headers), timeout=60)
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


def api_post_stream(base_url, path, token, body, params=None, extra_headers=None):
    """Make a POST request with SSE streaming, print raw SSE events to stdout.

    SSE format: each block has an event line and a data line on separate lines:
        event:conversation.message.delta
        data:{"content":"Hi","reasoning_content":""}
    See examples/stream_chat_bot.py for how to parse these events properly.
    """
    url = f"{base_url}{path}"
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    try:
        resp = requests.post(url, headers=make_headers(token, extra_headers), json=body, stream=True, timeout=600)
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    has_error = False
    for line in resp.iter_lines(decode_unicode=True):
        if line:
            print(line, flush=True)
            lower = line.lower()
            if "event:error" in lower or "event: error" in lower:
                has_error = True
            if "conversation.chat.failed" in line:
                has_error = True
    if has_error:
        sys.exit(1)


# ── Bot subcommands ──────────────────────────────────────────────────

def cmd_list(args):
    """List published bots in a workspace."""
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
            data = api_get(cfg["base_url"], "/v1/bots", cfg["token"], params, silent=True, extra_headers=cfg.get("extra_headers"))
            items = data.get("data", {}).get("items", [])
            all_items.extend(items)
            total = data.get("data", {}).get("total", 0)
            if len(all_items) >= total:
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
        api_get(cfg["base_url"], "/v1/bots", cfg["token"], params, extra_headers=cfg.get("extra_headers"))


def cmd_info(args):
    """Get bot details: capabilities, plugins, workflows, knowledge, prompt."""
    cfg = get_config(args)
    api_get(cfg["base_url"], f"/v1/bots/{args.bot_id}", cfg["token"],
            {"is_published": "true" if not getattr(args, "draft", False) else "false"},
            extra_headers=cfg.get("extra_headers"))


def cmd_chat(args):
    """Non-streaming chat: POST, poll until done, then print messages."""
    cfg = get_config(args)
    user_id = getattr(args, "user_id", None) or DEFAULT_USER_ID
    body = {
        "bot_id": args.bot_id,
        "user_id": user_id,
        "stream": False,
        "additional_messages": [
            {"role": "user", "content": args.message, "content_type": "text"}
        ],
        "auto_save_history": True,
    }
    # conversation_id is a query param for /v3/chat, NOT a body param
    query_params = {}
    if getattr(args, "conversation_id", None):
        query_params["conversation_id"] = args.conversation_id

    data = api_post(cfg["base_url"], "/v3/chat", cfg["token"], body, silent=True,
                    params=query_params or None, extra_headers=cfg.get("extra_headers"))
    chat_data = data.get("data", {})
    chat_id = chat_data.get("id")
    conversation_id = chat_data.get("conversation_id")
    print(f"Chat started: chat_id={chat_id}, conversation_id={conversation_id}", file=sys.stderr)

    # Poll until complete
    terminal_statuses = {"completed", "failed", "canceled", "requires_action"}
    status = ""
    poll_data = {}
    for _ in range(POLL_MAX_ATTEMPTS):
        time.sleep(POLL_INTERVAL)
        poll_data = api_get(
            cfg["base_url"], "/v3/chat/retrieve", cfg["token"],
            {"conversation_id": conversation_id, "chat_id": chat_id},
            silent=True, extra_headers=cfg.get("extra_headers"),
        )
        status = poll_data.get("data", {}).get("status", "")
        if status in terminal_statuses:
            break
    else:
        print("Error: Timed out waiting for chat to complete.", file=sys.stderr)
        sys.exit(1)

    if status in ("failed", "canceled"):
        print(json.dumps(poll_data, ensure_ascii=False, indent=2))
        sys.exit(1)

    # Fetch and print messages
    api_get(cfg["base_url"], "/v3/chat/message/list", cfg["token"],
            {"conversation_id": conversation_id, "chat_id": chat_id},
            extra_headers=cfg.get("extra_headers"))


def cmd_stream(args):
    """Streaming chat via SSE."""
    cfg = get_config(args)
    user_id = getattr(args, "user_id", None) or DEFAULT_USER_ID
    body = {
        "bot_id": args.bot_id,
        "user_id": user_id,
        "stream": True,
        "additional_messages": [
            {"role": "user", "content": args.message, "content_type": "text"}
        ],
        "auto_save_history": True,
    }
    query_params = {}
    if getattr(args, "conversation_id", None):
        query_params["conversation_id"] = args.conversation_id
    api_post_stream(cfg["base_url"], "/v3/chat", cfg["token"], body,
                    params=query_params or None, extra_headers=cfg.get("extra_headers"))


def cmd_history(args):
    """List messages from a specific chat (GET /v3/chat/message/list)."""
    cfg = get_config(args)
    api_get(cfg["base_url"], "/v3/chat/message/list", cfg["token"],
            {"conversation_id": args.conversation_id, "chat_id": args.chat_id},
            extra_headers=cfg.get("extra_headers"))


def cmd_cancel(args):
    """Cancel an ongoing chat."""
    cfg = get_config(args)
    api_post(cfg["base_url"], "/v3/chat/cancel", cfg["token"],
             {"conversation_id": args.conversation_id, "chat_id": args.chat_id},
             extra_headers=cfg.get("extra_headers"))


# ── Conversation subcommands ─────────────────────────────────────────

def cmd_create_conversation(args):
    """Create a new conversation (optionally with initial messages)."""
    cfg = get_config(args)
    body = {}
    if getattr(args, "bot_id", None):
        body["bot_id"] = args.bot_id
    if getattr(args, "name", None):
        body["name"] = args.name
    api_post(cfg["base_url"], "/v1/conversation/create", cfg["token"], body,
             extra_headers=cfg.get("extra_headers"))


def cmd_get_conversation(args):
    """Get conversation info by conversation_id."""
    cfg = get_config(args)
    api_get(cfg["base_url"], "/v1/conversation/retrieve", cfg["token"],
            {"conversation_id": args.conversation_id},
            extra_headers=cfg.get("extra_headers"))


def cmd_list_conversations(args):
    """List conversations for a bot."""
    cfg = get_config(args)
    params = {
        "bot_id": args.bot_id,
        "page_num": getattr(args, "page_num", None) or 1,
        "page_size": getattr(args, "page_size", None) or 50,
        "sort_order": (getattr(args, "sort_order", None) or "desc").lower(),
    }
    api_get(cfg["base_url"], "/v1/conversations", cfg["token"], params,
            extra_headers=cfg.get("extra_headers"))


def cmd_edit_conversation(args):
    """Update conversation name (PUT /v1/conversations/:conversation_id)."""
    cfg = get_config(args)
    api_put(cfg["base_url"], f"/v1/conversations/{args.conversation_id}", cfg["token"],
            {"name": args.name}, extra_headers=cfg.get("extra_headers"))


def cmd_delete_conversation(args):
    """Delete a conversation (DELETE /v1/conversations/:conversation_id)."""
    cfg = get_config(args)
    api_delete(cfg["base_url"], f"/v1/conversations/{args.conversation_id}", cfg["token"],
               extra_headers=cfg.get("extra_headers"))


def cmd_clear_context(args):
    """Clear conversation context (POST /v1/conversations/:conversation_id/clear)."""
    cfg = get_config(args)
    api_post(cfg["base_url"], f"/v1/conversations/{args.conversation_id}/clear", cfg["token"], {},
             extra_headers=cfg.get("extra_headers"))


# ── Message subcommands ──────────────────────────────────────────────

def cmd_add_message(args):
    """Add a message to a conversation (POST /v1/conversation/message/create)."""
    cfg = get_config(args)
    body = {
        "role": args.role,
        "content": args.content,
        "content_type": "text",
    }
    api_post(cfg["base_url"], "/v1/conversation/message/create", cfg["token"], body,
             params={"conversation_id": args.conversation_id},
             extra_headers=cfg.get("extra_headers"))


def cmd_list_messages(args):
    """List messages in a conversation (POST /v1/conversation/message/list)."""
    cfg = get_config(args)
    body = {"order": getattr(args, "order", None) or "desc"}
    if getattr(args, "chat_id", None):
        body["chat_id"] = args.chat_id
    if getattr(args, "limit", None):
        body["limit"] = args.limit
    api_post(cfg["base_url"], "/v1/conversation/message/list", cfg["token"], body,
             params={"conversation_id": args.conversation_id})


def cmd_get_message(args):
    """Get a specific message by message_id."""
    cfg = get_config(args)
    api_get(cfg["base_url"], "/v1/conversation/message/retrieve", cfg["token"],
            {"conversation_id": args.conversation_id, "message_id": args.message_id},
            extra_headers=cfg.get("extra_headers"))


def cmd_modify_message(args):
    """Modify a message (POST /v1/conversation/message/modify)."""
    cfg = get_config(args)
    body = {}
    if getattr(args, "content", None):
        body["content"] = args.content
        body["content_type"] = getattr(args, "content_type", None) or "text"
    api_post(cfg["base_url"], "/v1/conversation/message/modify", cfg["token"], body,
             params={"conversation_id": args.conversation_id, "message_id": args.message_id},
             extra_headers=cfg.get("extra_headers"))


def cmd_delete_message(args):
    """Delete a message (POST /v1/conversation/message/delete)."""
    cfg = get_config(args)
    api_post(cfg["base_url"], "/v1/conversation/message/delete", cfg["token"], {},
             params={"conversation_id": args.conversation_id, "message_id": args.message_id})


# ── CLI ───────────────────────────────────────────────────────────────

def _add_common_args(parser):
    parser.add_argument("--token", help="API token (overrides COZE_WORKLOAD_API_TOKEN)")
    parser.add_argument("--base-url", help="API base URL (overrides COZE_API_BASE_URL)")
    parser.add_argument("--header", action="append", help='Extra HTTP header (key=value), repeatable. E.g. --header "key1=val1"')


def _add_chat_args(parser):
    parser.add_argument("bot_id", help="Bot ID")
    parser.add_argument("--message", required=True, help="Message content to send")
    parser.add_argument("--user-id", help="User ID for context isolation (default: default_user)")
    parser.add_argument("--conversation-id", help="Reuse existing conversation (multi-turn chat)")
    _add_common_args(parser)


def main():
    parser = argparse.ArgumentParser(description="Coze Bot Runner")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # ── Bot commands ──
    p_list = subparsers.add_parser("list", help="List published bots in workspace")
    p_list.add_argument("--workspace-id", help="Workspace ID (overrides COZE_PROJECT_SPACE_ID)")
    p_list.add_argument("--page-num", type=int)
    p_list.add_argument("--page-size", type=int)
    p_list.add_argument("--all", action="store_true", help="Auto-paginate to fetch all bots")
    _add_common_args(p_list)

    p_info = subparsers.add_parser("info", help="Get bot details and capabilities")
    p_info.add_argument("bot_id", help="Bot ID")
    p_info.add_argument("--draft", action="store_true", help="Show draft version instead of published")
    _add_common_args(p_info)

    p_chat = subparsers.add_parser("chat", help="Chat with bot (non-streaming, polls until done)")
    _add_chat_args(p_chat)

    p_stream = subparsers.add_parser("stream", help="Chat with bot (streaming SSE)")
    _add_chat_args(p_stream)

    p_history = subparsers.add_parser("history", help="List messages from a chat")
    p_history.add_argument("conversation_id", help="Conversation ID")
    p_history.add_argument("chat_id", help="Chat ID")
    _add_common_args(p_history)

    p_cancel = subparsers.add_parser("cancel", help="Cancel an ongoing chat")
    p_cancel.add_argument("conversation_id", help="Conversation ID")
    p_cancel.add_argument("chat_id", help="Chat ID")
    _add_common_args(p_cancel)

    # ── Conversation commands ──
    p_cc = subparsers.add_parser("create-conversation", help="Create a new conversation")
    p_cc.add_argument("--bot-id", help="Associate conversation with a bot")
    p_cc.add_argument("--name", help="Conversation name")
    _add_common_args(p_cc)

    p_gc = subparsers.add_parser("get-conversation", help="Get conversation info")
    p_gc.add_argument("conversation_id", help="Conversation ID")
    _add_common_args(p_gc)

    p_lc = subparsers.add_parser("list-conversations", help="List conversations for a bot")
    p_lc.add_argument("bot_id", help="Bot ID")
    p_lc.add_argument("--page-num", type=int)
    p_lc.add_argument("--page-size", type=int)
    p_lc.add_argument("--sort-order", choices=["ASC", "DESC"], help="Sort order (default: DESC)")
    _add_common_args(p_lc)

    p_ec = subparsers.add_parser("edit-conversation", help="Update conversation name")
    p_ec.add_argument("conversation_id", help="Conversation ID")
    p_ec.add_argument("--name", required=True, help="New conversation name (max 100 chars)")
    _add_common_args(p_ec)

    p_dc = subparsers.add_parser("delete-conversation", help="Delete a conversation")
    p_dc.add_argument("conversation_id", help="Conversation ID")
    _add_common_args(p_dc)

    p_clr = subparsers.add_parser("clear-context", help="Clear conversation context (start new section)")
    p_clr.add_argument("conversation_id", help="Conversation ID")
    _add_common_args(p_clr)

    # ── Message commands ──
    p_am = subparsers.add_parser("add-message", help="Add a message to a conversation")
    p_am.add_argument("conversation_id", help="Conversation ID")
    p_am.add_argument("--role", required=True, choices=["user", "assistant"], help="Message role")
    p_am.add_argument("--content", required=True, help="Message content")
    _add_common_args(p_am)

    p_lm = subparsers.add_parser("list-messages", help="List messages in a conversation")
    p_lm.add_argument("conversation_id", help="Conversation ID")
    p_lm.add_argument("--chat-id", help="Filter by chat ID")
    p_lm.add_argument("--limit", type=int, help="Max results (default: 50)")
    p_lm.add_argument("--order", choices=["asc", "desc"], help="Sort order (default: desc)")
    _add_common_args(p_lm)

    p_gm = subparsers.add_parser("get-message", help="Get a specific message")
    p_gm.add_argument("conversation_id", help="Conversation ID")
    p_gm.add_argument("message_id", help="Message ID")
    _add_common_args(p_gm)

    p_mm = subparsers.add_parser("modify-message", help="Modify a message")
    p_mm.add_argument("conversation_id", help="Conversation ID")
    p_mm.add_argument("message_id", help="Message ID")
    p_mm.add_argument("--content", required=True, help="New message content")
    p_mm.add_argument("--content-type", choices=["text", "object_string"], help="Content type (default: text)")
    _add_common_args(p_mm)

    p_dm = subparsers.add_parser("delete-message", help="Delete a message")
    p_dm.add_argument("conversation_id", help="Conversation ID")
    p_dm.add_argument("message_id", help="Message ID")
    _add_common_args(p_dm)

    args = parser.parse_args()

    commands = {
        "list": cmd_list,
        "info": cmd_info,
        "chat": cmd_chat,
        "stream": cmd_stream,
        "history": cmd_history,
        "cancel": cmd_cancel,
        "create-conversation": cmd_create_conversation,
        "get-conversation": cmd_get_conversation,
        "list-conversations": cmd_list_conversations,
        "edit-conversation": cmd_edit_conversation,
        "delete-conversation": cmd_delete_conversation,
        "clear-context": cmd_clear_context,
        "add-message": cmd_add_message,
        "list-messages": cmd_list_messages,
        "get-message": cmd_get_message,
        "modify-message": cmd_modify_message,
        "delete-message": cmd_delete_message,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
