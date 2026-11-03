#!/usr/bin/env python3
"""
支付宝开放平台接口查询基础模块。

提供核心的请求构建、签名、执行等功能，供 sandbox 和 online 脚本共用。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient
from alipay.aop.api.constant.CommonConstants import THREAD_LOCAL
from alipay.aop.api.constant.ParamConstants import P_BIZ_CONTENT, P_METHOD, P_VERSION
from alipay.aop.api.util.WebUtils import do_post

from alipay.aop.api.exception.Exception import ResponseException as AlipayResponseException

OFFICIAL_GATEWAY_URL = "https://openapi.alipay.com/gateway.do"
ONLINE_SUPPORTED_TOOLS = (
    "payment_diagnosis",
    "withholding_agreement_info_query",
    "preauth_auth_info_query",
    "trade_info_query",
    "refund_diagnosis",
    "async_notify_diagnosis",
    "preauth_diagnosis",
    "withholding_diagnosis",
)
SANDBOX_SUPPORTED_TOOLS = ("payment_diagnosis",)


def normalize_biz_env(raw: str) -> str:
    """biz_content.env：online（线上） / sandbox（沙箱）。"""
    r = (raw or "").strip().lower()
    if r in ("online", "sandbox"):
        return r
    raise ValueError(f"非法 env: {raw!r}，应为 online 或 sandbox")


def normalize_tool(raw: str, env: str) -> str:
    """校验并返回 tool 参数。"""
    tool = (raw or "").strip()
    if not tool:
        raise ValueError("缺少 tool 参数")
    if env == "sandbox":
        if tool not in SANDBOX_SUPPORTED_TOOLS:
            raise ValueError(
                f"sandbox 环境仅支持 tool={SANDBOX_SUPPORTED_TOOLS[0]}，当前为 {tool!r}"
            )
        return tool
    if env == "online":
        if tool not in ONLINE_SUPPORTED_TOOLS:
            raise ValueError(
                "online 环境 tool 非法："
                f"{tool!r}。支持值：{', '.join(ONLINE_SUPPORTED_TOOLS)}"
            )
        return tool
    raise ValueError(f"未知 env: {env!r}")


def normalize_pem(raw: str, header: str, footer: str) -> str:
    """规范化 PEM 格式。"""
    s = raw.strip().replace("\\n", "\n")
    if header in s:
        return s
    body = "".join(s.split())
    lines = [body[i : i + 64] for i in range(0, len(body), 64)]
    return f"{header}\n" + "\n".join(lines) + f"\n{footer}\n"


def _openssl_rsa_traditional_pkcs1_pem(pem_in: str) -> str:
    r = subprocess.run(
        ["openssl", "rsa", "-traditional"],
        input=pem_in.encode(),
        capture_output=True,
        timeout=10,
        check=True,
    )
    return r.stdout.decode()


def application_private_key_to_pkcs1_pem(raw: str) -> str:
    """将应用私钥转换为 PKCS1 PEM 格式。"""
    key = (raw or "").strip()
    if not key:
        raise RuntimeError("缺少应用私钥")
    s = key.replace("\\n", "").replace("\n", "").replace("\r", "").replace(" ", "").replace("\t", "")
    s = re.sub(r"-----BEGIN[^-]+-----", "", s)
    s = re.sub(r"-----END[^-]+-----", "", s)
    if not s:
        raise RuntimeError("应用私钥去掉 PEM 头尾与空白后为空")
    pkcs8_pem = f"-----BEGIN PRIVATE KEY-----\n{s}\n-----END PRIVATE KEY-----\n"
    pkcs1_pem = f"-----BEGIN RSA PRIVATE KEY-----\n{s}\n-----END RSA PRIVATE KEY-----\n"
    last_err: str | None = None
    for candidate in (pkcs8_pem, pkcs1_pem):
        try:
            return _openssl_rsa_traditional_pkcs1_pem(candidate)
        except FileNotFoundError as e:
            raise RuntimeError("需要 openssl 解析应用私钥，请安装 OpenSSL 并加入 PATH") from e
        except subprocess.CalledProcessError as e:
            last_err = (e.stderr or b"").decode(errors="replace") or str(e)
            continue
    raise RuntimeError(f"无法解析应用私钥（请确认 Base64 完整且与开放平台密钥一致）: {last_err}")


def build_client(
    app_id: str,
    app_private_key: str,
    alipay_public_key: str,
    gateway_url: str = OFFICIAL_GATEWAY_URL,
) -> DefaultAlipayClient:
    """构建支付宝客户端。"""
    app_private_key_pem = application_private_key_to_pkcs1_pem(app_private_key)

    if "BEGIN" in alipay_public_key:
        alipay_pub = alipay_public_key
    else:
        alipay_pub = normalize_pem(
            alipay_public_key,
            "-----BEGIN PUBLIC KEY-----",
            "-----END PUBLIC KEY-----",
        )

    cfg = AlipayClientConfig()
    cfg.server_url = gateway_url
    cfg.app_id = app_id
    cfg.app_private_key = app_private_key_pem
    cfg.alipay_public_key = alipay_pub
    cfg.charset = "utf-8"
    cfg.sign_type = "RSA2"
    return DefaultAlipayClient(alipay_client_config=cfg, logger=None)


def _robust_decode(raw: bytes | str) -> bytes:
    """容错解码响应。"""
    if isinstance(raw, str):
        return raw.encode("utf-8")
    if not isinstance(raw, bytes):
        return str(raw).encode("utf-8")
    for enc in ("utf-8", "gb18030", "latin-1"):
        try:
            return raw.decode(enc).encode("utf-8")
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace").encode("utf-8")


def execute_allow_non_utf8_response(client: object, request: object) -> str:
    """执行请求，并在响应解码前做一次 gb18030/utf-8 兜底。"""
    from alipay.aop.api.constant.CommonConstants import ALIPAY_SDK_PYTHON_VERSION

    cfg = getattr(client, "_DefaultAlipayClient__config")
    THREAD_LOCAL.uuid = str(uuid.uuid1())
    THREAD_LOCAL.logger = None
    headers = {
        "Content-type": "application/x-www-form-urlencoded;charset=" + cfg.charset,
        "Cache-Control": "no-cache",
        "Connection": "Keep-Alive",
        "User-Agent": ALIPAY_SDK_PYTHON_VERSION,
        "log-uuid": THREAD_LOCAL.uuid,
    }
    query_string, params = client._DefaultAlipayClient__prepare_request(request)
    multipart = request.get_multipart_params()
    if multipart and len(multipart) > 0:
        from alipay.aop.api.util.WebUtils import do_multipart_post

        response = do_multipart_post(
            cfg.server_url, query_string, headers, params, multipart, cfg.charset, cfg.timeout
        )
    else:
        response = do_post(cfg.server_url, query_string, headers, params, cfg.charset, cfg.timeout)
    fixed = _robust_decode(response)
    preview = fixed.decode("utf-8", errors="replace")
    if preview.lstrip().startswith("<") or "<!DOCTYPE" in preview[:500].upper():
        hint = (
            "网关返回了 HTML 而非 JSON。常见原因：\n"
            "  1) 当前应用未在开放平台「接口列表」中开通 alipay.open.atechspay.tool.query；\n"
            "  2) method 名称与开放平台上架版本不一致；\n"
            "  3) 请求打到错误环境。\n"
            f"响应片段：{preview[:400]}..."
        )
        if "invalid-method" in preview or "不存在的方法名" in preview:
            raise RuntimeError(
                "支付宝提示 invalid-method / 不存在的方法名：请先在开放平台给本应用添加 "
                "「alipay.open.atechspay.tool.query」接口能力后再调用本脚本。\n" + hint
            ) from None
        raise RuntimeError(hint) from None
    try:
        return client._DefaultAlipayClient__parse_response(fixed)
    except AlipayResponseException as e:
        err = str(e)
        if "response shape maybe illegal" in err and ("<!DOCTYPE" in err or "invalid-method" in err):
            raise RuntimeError(
                "响应非标准 JSON（多为未开通接口时的 HTML 调试页）。"
                "请在开放平台为应用开通 alipay.open.atechspay.tool.query。"
            ) from e
        raise


class AlipayOpenAtechspayToolQueryRequest:
    """最小 Request：method=biz_content JSON，适配 DefaultAlipayClient.execute。"""

    def __init__(self, biz: dict[str, object]) -> None:
        self._biz = biz
        self._version = "1.0"
        self.need_encrypt = False
        self._udf_params: dict[str, str] = {}

    def get_params(self) -> dict:
        params = {
            P_METHOD: "alipay.open.atechspay.tool.query",
            P_VERSION: self._version,
            P_BIZ_CONTENT: json.dumps(self._biz, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        }
        if self._udf_params:
            params.update(self._udf_params)
        return params

    def get_multipart_params(self) -> dict:
        return {}

    def add_other_text_param(self, key: str, value: str) -> None:
        self._udf_params[key] = value


def build_debug_curl(client: object, request: object, app_auth_token: str | None = None) -> str:
    """输出一条等价 curl（含实时 sign），方便与开放平台文档逐项对照。"""
    cfg = getattr(client, "_DefaultAlipayClient__config")
    query_string, params = client._DefaultAlipayClient__prepare_request(request)
    gateway = cfg.server_url
    if "?" in gateway:
        gateway = gateway.split("?", 1)[0]
    lines = [f"curl '{gateway}?{query_string}' \\"]
    if app_auth_token:
        lines.append(f"  -F 'app_auth_token={app_auth_token}' \\")
    biz_content = params.get("biz_content", "")
    if isinstance(biz_content, str):
        biz_content = biz_content.replace("'", "'\"'\"'")
    lines.append(f"  -F 'biz_content={biz_content}'")
    return "\n".join(lines)


def extract_trace_id(inner: dict) -> str | None:
    """标准化 trace_id 提取。"""
    for k in ("trace_id", "traceId"):
        v = inner.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    sub_msg = inner.get("sub_msg")
    if isinstance(sub_msg, str):
        m = re.search(r"traceId=([0-9a-zA-Z]+)", sub_msg)
        if m:
            return m.group(1)
    return None


def print_observability(inner: dict) -> None:
    """标准化观测输出：trace_id / code / sub_code / task_id（stderr 单行 JSON）。"""
    diagnosis = inner.get("diagnosis_info")
    task_id = None
    if isinstance(diagnosis, dict):
        task_id = diagnosis.get("task_id")
    obs = {
        "trace_id": extract_trace_id(inner),
        "code": inner.get("code"),
        "sub_code": inner.get("sub_code"),
        "task_id": task_id,
    }
    print("# OBS " + json.dumps(obs, ensure_ascii=False), file=sys.stderr)


def run_query(
    *,
    env: str,
    keyword: str,
    tool: str,
    app_id: str,
    app_private_key: str,
    alipay_public_key: str,
    start_time: str | None = None,
    end_time: str | None = None,
    debug_curl: bool = False,
    app_auth_token: str | None = None,
    gateway_url: str | None = None,
) -> dict:
    """执行查询的核心逻辑。"""
    biz_env = normalize_biz_env(env)
    biz_tool = normalize_tool(tool, biz_env)

    biz: dict[str, object] = {
        "env": biz_env,
        "keyword": keyword,
        "tool": biz_tool,
    }
    if start_time:
        biz["start_time"] = start_time
    if end_time:
        biz["end_time"] = end_time

    client = build_client(
        app_id=app_id,
        app_private_key=app_private_key,
        alipay_public_key=alipay_public_key,
        gateway_url=gateway_url or OFFICIAL_GATEWAY_URL,
    )

    req = AlipayOpenAtechspayToolQueryRequest(biz)
    if app_auth_token:
        req.add_other_text_param("app_auth_token", app_auth_token)
    if debug_curl:
        print("# --- debug curl (signed, one-time) ---", file=sys.stderr)
        print(build_debug_curl(client, req, app_auth_token=app_auth_token), file=sys.stderr)
        print("# --- end debug curl ---", file=sys.stderr)
    raw = execute_allow_non_utf8_response(client, req)
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)