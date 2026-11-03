#!/usr/bin/env python3
"""
支付宝开放平台接口查询 - 线上环境版本。

线上环境下，仅传入 appId，应用私钥和支付宝公钥从托管凭证服务获取。

用法示例：
  python scripts/alipay_online_query.py \\
    --keyword ORDER_xxx \\
    --tool payment_diagnosis \\
    --app-id 2021000000000000

前置条件：
  - 配置托管凭证服务（integration-alipay）
  - 安装依赖：pip install coze-workload-identity
"""
from __future__ import annotations

import argparse
import json
import sys

from alipay_query_base import (
    OFFICIAL_GATEWAY_URL,
    ONLINE_SUPPORTED_TOOLS,
    print_observability,
    run_query,
)


def load_alipay_credential() -> dict:
    """
    从托管凭证读取支付宝支付集成详情。

    Returns:
        dict: 包含 app_private_key 和 alipay_public_key 的字典

    Raises:
        RuntimeError: 如果凭证未配置或获取失败
    """
    try:
        from coze_workload_identity import Client
    except ImportError:
        raise RuntimeError(
            "请安装 coze-workload-identity 依赖：pip install coze-workload-identity"
        )

    client = Client()
    try:
        credential = client.get_integration_credential("integration-alipay")
        if isinstance(credential, str):
            credential = json.loads(credential)
        return credential
    except Exception as err:
        print("支付宝线上凭证未配置", file=sys.stderr)
        raise RuntimeError(f"获取托管凭证失败: {err}") from err
    finally:
        client.close()


def main() -> None:
    ap = argparse.ArgumentParser(
        description="支付宝开放平台接口查询 - 线上环境版本",
        epilog=f"支持的工具：{', '.join(ONLINE_SUPPORTED_TOOLS)}",
    )
    ap.add_argument(
        "--keyword", "-k",
        required=True,
        help="排查关键词 traceId / trade_no / out_trade_no 等",
    )
    ap.add_argument(
        "--tool", "-t",
        default="payment_diagnosis",
        help=f"查询工具（支持：{', '.join(ONLINE_SUPPORTED_TOOLS)}）",
    )
    ap.add_argument(
        "--app-id",
        required=True,
        help="线上应用 AppID（2021 开头），可在支付宝开放平台控制台获取",
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
        default=OFFICIAL_GATEWAY_URL,
        help=f"网关地址（默认正式网关 {OFFICIAL_GATEWAY_URL}）",
    )
    args = ap.parse_args()

    try:
        # 从托管凭证获取私钥和支付宝公钥
        credential = load_alipay_credential()

        app_private_key = credential.get("app_private_key")
        alipay_public_key = credential.get("alipay_public_key")

        if not app_private_key:
            raise RuntimeError("托管凭证中缺少 app_private_key")
        if not alipay_public_key:
            raise RuntimeError("托管凭证中缺少 alipay_public_key")

        obj = run_query(
            env="online",
            keyword=args.keyword,
            tool=args.tool,
            app_id=args.app_id,
            app_private_key=app_private_key,
            alipay_public_key=alipay_public_key,
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