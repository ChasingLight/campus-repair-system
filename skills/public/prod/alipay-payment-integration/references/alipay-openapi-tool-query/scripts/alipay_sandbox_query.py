#!/usr/bin/env python3
"""
支付宝开放平台接口查询 - 沙箱环境版本。

沙箱环境下，所有凭据（appId、应用私钥、支付宝公钥）均通过命令行参数传入。

用法示例：
  python scripts/alipay_sandbox_query.py \\
    --keyword ORDER_xxx \\
    --tool payment_diagnosis \\
    --app-id 2021000000000000 \\
    --app-private-key "MIIEvgIBADANBg..." \\
    --alipay-public-key "MIIBIjANBgkq..."
"""
from __future__ import annotations

import argparse
import json
import sys

from alipay_query_base import (
    OFFICIAL_GATEWAY_URL,
    print_observability,
    run_query,
)


SANDBOX_GATEWAY_URL = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="支付宝开放平台接口查询 - 沙箱环境版本",
        epilog="注意：沙箱环境仅支持 payment_diagnosis 工具。",
    )
    ap.add_argument(
        "--keyword", "-k",
        required=True,
        help="排查关键词 traceId / trade_no / out_trade_no 等",
    )
    ap.add_argument(
        "--tool", "-t",
        default="payment_diagnosis",
        help="查询工具（沙箱仅支持 payment_diagnosis）",
    )
    ap.add_argument(
        "--app-id",
        required=True,
        help="沙箱应用 AppID",
    )
    ap.add_argument(
        "--app-private-key",
        required=True,
        help="应用私钥（PKCS1 或 PKCS8 PEM 格式，或纯 Base64）",
    )
    ap.add_argument(
        "--alipay-public-key",
        required=True,
        help="支付宝公钥（PEM 格式或纯 Base64）",
    )
    ap.add_argument(
        "--start-time",
        help="起始时间 yyyy-MM-dd HH:mm:ss",
    )
    ap.add_argument(
        "--end-time",
        help="结束时间 yyyy-MM-dd HH:mm:ss",
    )
    ap.add_argument(
        "--app-auth-token",
        help="代调用场景可选",
    )
    ap.add_argument(
        "--debug-curl",
        action="store_true",
        help="打印等价 curl（含实时 sign）到 stderr",
    )
    ap.add_argument(
        "--gateway-url",
        default=SANDBOX_GATEWAY_URL,
        help=f"网关地址（默认沙箱网关 {SANDBOX_GATEWAY_URL}）",
    )
    args = ap.parse_args()

    try:
        obj = run_query(
            env="sandbox",
            keyword=args.keyword,
            tool=args.tool,
            app_id=args.app_id,
            app_private_key=args.app_private_key,
            alipay_public_key=args.alipay_public_key,
            start_time=args.start_time,
            end_time=args.end_time,
            debug_curl=args.debug_curl,
            app_auth_token=args.app_auth_token,
            gateway_url=args.gateway_url,
        )
    except (RuntimeError, ValueError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(3)

    inner = obj.get("alipay_open_atechspay_tool_query_response") or obj
    print_observability(inner)
    print(json.dumps(inner, ensure_ascii=False, indent=2))

    code = inner.get("code")
    if code != "10000":
        sys.exit(2 if code else 1)


if __name__ == "__main__":
    main()