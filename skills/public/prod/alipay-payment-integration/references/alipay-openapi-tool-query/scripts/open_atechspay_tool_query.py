#!/usr/bin/env python3
"""
开放平台统一接口：alipay.open.atechspay.tool.query（工具集排查：payment_diagnosis 等）。

依赖：alipay-sdk-python、python-dotenv、pycryptodome（可选，用于更稳健的验签/转码能力）

用法示例：
  python scripts/open_atechspay_tool_query.py \\
    --keyword ORDER_xxx --tool payment_diagnosis --env online
  # 沙箱：--env sandbox
"""
from __future__ import annotations

import argparse
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
from alipay.aop.api.constant.CommonConstants import THREAD_LOCAL  # noqa: E402
from alipay.aop.api.constant.ParamConstants import P_BIZ_CONTENT, P_METHOD, P_VERSION  # noqa: E402
from alipay.aop.api.util.WebUtils import do_post  # noqa: E402

from alipay.aop.api.exception.Exception import ResponseException as AlipayResponseException  # noqa: E402

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

# 环境分流凭据（优先使用环境专属变量，其次回退到通用变量）
_CRED_ENV_KEYS = {
    "online": (
        "ALIPAY_APP_ID_ONLINE",
        "ALIPAY_APP_PRIVATE_KEY_ONLINE",
        "ALIPAY_ALIPAY_PUBLIC_KEY_ONLINE",
    ),
    "sandbox": (
        "ALIPAY_APP_ID_SANDBOX",
        "ALIPAY_APP_PRIVATE_KEY_SANDBOX",
        "ALIPAY_ALIPAY_PUBLIC_KEY_SANDBOX",
    ),
}


def _load_env_file(env_file: str | None) -> None:
    """加载配置文件：优先 --env-file；否则按常见位置自动探测。"""
    if env_file:
        p = Path(env_file).expanduser().resolve()
        if not p.is_file():
            raise ValueError(f"--env-file 指定文件不存在: {p}")
        load_dotenv(p, override=False)
        return
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parents[0] / ".env",
    ]
    for p in candidates:
        if p.is_file():
            load_dotenv(p, override=False)
            break


def _normalize_biz_env(raw: str) -> str:
    """biz_content.env：online（线上） / sandbox（沙箱）。"""
    r = (raw or "").strip().lower()
    if r in ("online", "sandbox"):
        return r
    raise ValueError(f"非法 env: {raw!r}，应为 online 或 sandbox")


def _normalize_tool(raw: str, env: str) -> str:
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


def _apply_env_credentials(env: str) -> None:
    """
    按诊断环境切换凭据：
    - online: ALIPAY_*_ONLINE
    - sandbox: ALIPAY_*_SANDBOX
    若专属变量未配置，则回退到通用 ALIPAY_APP_ID / ALIPAY_APP_PRIVATE_KEY / ALIPAY_ALIPAY_PUBLIC_KEY。
    """
    if env not in _CRED_ENV_KEYS:
        raise ValueError(f"未知 env: {env!r}")
    app_id_k, app_pri_k, alipay_pub_k = _CRED_ENV_KEYS[env]
    selected = {
        "ALIPAY_APP_ID": os.environ.get(app_id_k) or os.environ.get("ALIPAY_APP_ID", ""),
        "ALIPAY_APP_PRIVATE_KEY": os.environ.get(app_pri_k) or os.environ.get("ALIPAY_APP_PRIVATE_KEY", ""),
        "ALIPAY_ALIPAY_PUBLIC_KEY": os.environ.get(alipay_pub_k)
        or os.environ.get("ALIPAY_ALIPAY_PUBLIC_KEY", ""),
    }
    missing = [k for k, v in selected.items() if not (v or "").strip()]
    if missing:
        raise ValueError(
            f"{env} 环境缺少必要凭据：{', '.join(missing)}。"
            "请配置对应 *_ONLINE / *_SANDBOX 变量，或通用 ALIPAY_* 变量。"
        )
    for k, v in selected.items():
        os.environ[k] = v


def _normalize_pem(raw: str, header: str, footer: str) -> str:
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


def _application_private_key_to_pkcs1_pem(raw: str) -> str:
    key = (raw or "").strip()
    if not key:
        raise RuntimeError("缺少环境变量 ALIPAY_APP_PRIVATE_KEY")
    s = key.replace("\\n", "").replace("\n", "").replace("\r", "").replace(" ", "").replace("\t", "")
    s = re.sub(r"-----BEGIN[^-]+-----", "", s)
    s = re.sub(r"-----END[^-]+-----", "", s)
    if not s:
        raise RuntimeError("ALIPAY_APP_PRIVATE_KEY 去掉 PEM 头尾与空白后为空")
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


def _build_client() -> DefaultAlipayClient:
    app_id = os.environ.get("ALIPAY_APP_ID", "").strip()
    if not app_id:
        raise RuntimeError("缺少环境变量 ALIPAY_APP_ID")
    app_private_key = _application_private_key_to_pkcs1_pem(os.environ.get("ALIPAY_APP_PRIVATE_KEY", ""))
    alipay_pub_raw = os.environ.get("ALIPAY_ALIPAY_PUBLIC_KEY", "").strip()
    if not alipay_pub_raw:
        raise RuntimeError("缺少环境变量 ALIPAY_ALIPAY_PUBLIC_KEY")
    if "BEGIN" in alipay_pub_raw:
        alipay_pub = alipay_pub_raw
    else:
        alipay_pub = _normalize_pem(
            alipay_pub_raw,
            "-----BEGIN PUBLIC KEY-----",
            "-----END PUBLIC KEY-----",
        )

    cfg = AlipayClientConfig()
    cfg.server_url = OFFICIAL_GATEWAY_URL
    cfg.app_id = app_id
    cfg.app_private_key = app_private_key
    cfg.alipay_public_key = alipay_pub
    cfg.charset = "utf-8"
    cfg.sign_type = "RSA2"
    return DefaultAlipayClient(alipay_client_config=cfg, logger=None)


def _robust_decode(raw: bytes | str) -> bytes:
    """个别网关/HTML 报错页为非 UTF-8，先容错再转成 UTF-8 bytes 交给 SDK 验签解析。"""
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


def _execute_allow_non_utf8_response(client: object, request: object) -> str:
    """与 DefaultAlipayClient.execute 相同，仅在响应解码前做一次 gb18030/utf-8 兜底。"""
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
    query_string, params = client._DefaultAlipayClient__prepare_request(request)  # type: ignore[union-attr]
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
        return client._DefaultAlipayClient__parse_response(fixed)  # type: ignore[union-attr,no-any-return]
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
        # 与 SDK Request 对齐，支持附加 app_auth_token 等公共参数
        self._udf_params[key] = value


def _build_debug_curl(client: object, request: object, app_auth_token: str | None = None) -> str:
    """
    输出一条等价 curl（含实时 sign），方便与开放平台文档逐项对照。
    不包含私钥，仅包含当前请求参数与签名结果。
    """
    cfg = getattr(client, "_DefaultAlipayClient__config")
    query_string, params = client._DefaultAlipayClient__prepare_request(request)  # type: ignore[union-attr]
    gateway = cfg.server_url
    if "?" in gateway:
        gateway = gateway.split("?", 1)[0]
    lines = [f"curl '{gateway}?{query_string}' \\"]
    if app_auth_token:
        lines.append(f"  -F 'app_auth_token={app_auth_token}' \\")
    biz_content = params.get("biz_content", "")
    if isinstance(biz_content, str):
        # 单引号包裹 shell 参数，需要转义内部单引号
        biz_content = biz_content.replace("'", "'\"'\"'")
    lines.append(f"  -F 'biz_content={biz_content}'")
    return "\n".join(lines)


def run(
    *,
    env: str,
    keyword: str,
    tool: str,
    start_time: str | None,
    end_time: str | None,
    debug_curl: bool = False,
    app_auth_token: str | None = None,
    gateway_url: str | None = None,
) -> dict:
    biz_env = _normalize_biz_env(env)
    biz_tool = _normalize_tool(tool, biz_env)
    _apply_env_credentials(biz_env)
    biz: dict[str, object] = {
        "env": biz_env,
        "keyword": keyword,
        "tool": biz_tool,
    }
    if start_time:
        biz["start_time"] = start_time
    if end_time:
        biz["end_time"] = end_time

    client = _build_client()
    cfg = getattr(client, "_DefaultAlipayClient__config")
    cfg.server_url = gateway_url or OFFICIAL_GATEWAY_URL
    req = AlipayOpenAtechspayToolQueryRequest(biz)
    if app_auth_token:
        req.add_other_text_param("app_auth_token", app_auth_token)
    if debug_curl:
        print("# --- debug curl (signed, one-time) ---", file=sys.stderr)
        print(_build_debug_curl(client, req, app_auth_token=app_auth_token), file=sys.stderr)
        print("# --- end debug curl ---", file=sys.stderr)
    raw = _execute_allow_non_utf8_response(client, req)
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


def _extract_trace_id(inner: dict) -> str | None:
    """
    标准化 trace_id 提取：
    1) 直接字段 trace_id / traceId
    2) sub_msg 中 errCheck?traceId=... 链接
    """
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


def _print_observability(inner: dict) -> None:
    """
    标准化观测输出：trace_id / code / sub_code / task_id（stderr 单行 JSON）。
    """
    diagnosis = inner.get("diagnosis_info")
    task_id = None
    if isinstance(diagnosis, dict):
        task_id = diagnosis.get("task_id")
    obs = {
        "trace_id": _extract_trace_id(inner),
        "code": inner.get("code"),
        "sub_code": inner.get("sub_code"),
        "task_id": task_id,
    }
    print("# OBS " + json.dumps(obs, ensure_ascii=False), file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description="alipay.open.atechspay.tool.query 命令行封装")
    ap.add_argument("--keyword", "-k", required=True, help="排查关键词 traceId / trade_no / out_trade_no 等")
    ap.add_argument(
        "--tool",
        "-t",
        default="payment_diagnosis",
        help="online 支持 8 个 tool；sandbox 仅支持 payment_diagnosis",
    )
    ap.add_argument(
        "--env",
        "-e",
        choices=("online", "sandbox"),
        default="online",
        help="biz_content.env：online 线上，sandbox 沙箱",
    )
    ap.add_argument("--start-time", help="起始时间 yyyy-MM-dd HH:mm:ss")
    ap.add_argument("--end-time", help="结束时间 yyyy-MM-dd HH:mm:ss")
    ap.add_argument("--app-auth-token", help="代调用场景可选")
    ap.add_argument("--debug-curl", action="store_true", help="打印等价 curl（含实时 sign）到 stderr")
    ap.add_argument(
        "--gateway-url",
        default=OFFICIAL_GATEWAY_URL,
        help="网关地址（默认正式网关 https://openapi.alipay.com/gateway.do）",
    )
    ap.add_argument("--env-file", help="可选：显式指定 .env 文件路径（默认自动探测）")
    args = ap.parse_args()

    try:
        _load_env_file(args.env_file)
        obj = run(
            env=args.env,
            keyword=args.keyword,
            tool=args.tool,
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
    _print_observability(inner)
    print(json.dumps(inner, ensure_ascii=False, indent=2))

    code = inner.get("code")
    if code != "10000":
        sys.exit(2 if code else 1)


if __name__ == "__main__":
    main()
