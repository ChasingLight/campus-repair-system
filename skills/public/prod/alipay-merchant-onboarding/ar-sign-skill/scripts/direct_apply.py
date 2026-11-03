#!/usr/bin/env python3
"""
外部直调 apply：接收完整 MCP 参数 JSON，校验后直接调用 ar-sign.apply。

跳过 previewFormView 流程，允许外围调用方自行组装参数直接提交签约申请。
脚本只做必要的结构校验和 MCP 调用，不做 pageData → businessProperty 转换。

用法:
  # 传入完整 MCP 参数 JSON
  python3 direct_apply.py --data '{"request": {"salesProductCodes": ["I1080300001000041203"], "businessProperty": {...}, "channelCode": "B_SK_SH_RPC", "orderType": "NEW_SIGN"}, "ctx": {}}'

校验规则:
  - request 和 ctx 必须存在
  - request.salesProductCodes 必须为非空列表
  - mccCode（如有）格式必须为 Axxxx_Bxxxx 且不能为默认值 A0003_B0223
  - businessProperty 不强制要求（部分场景不需要传资质）
"""

import argparse
import json
import os
import re
import subprocess
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DEFAULT_MCC_CODE = "A0003_B0223"
MCC_CODE_PATTERN = r'^A\d{4}_B\d{4}$'


def error_exit(error_type, message, hint=None):
    """输出结构化错误 JSON 到 stdout，供 LLM 解析处理。"""
    result = {
        "error": True,
        "errorType": error_type,
        "message": message,
    }
    if hint:
        result["hint"] = hint
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(1)


def strip_ansi(text):
    """移除 ANSI 转义码。"""
    return re.sub(r'\x1b\[[0-9;]*m', '', text)


def extract_json_from_raw(content):
    """从任意格式的 CLI 输出中提取 JSON。"""
    content = strip_ansi(content)
    content = re.sub(r'[│┌┐└┘─┬┴├┤┼╭╮╰╯]', '', content)

    json_start = content.find("{")
    if json_start == -1:
        return None

    depth = 0
    in_string = False
    escape_next = False
    for i in range(json_start, len(content)):
        c = content[i]
        if escape_next:
            escape_next = False
            continue
        if c == '\\' and in_string:
            escape_next = True
            continue
        if c == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                json_str = content[json_start:i + 1]
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    continue
    return None


def unwrap_mcp_response(parsed):
    """逐层剥壳 MCP 响应，直到拿到业务数据。"""
    if not isinstance(parsed, dict):
        return parsed

    if "jsonrpc" in parsed and "result" in parsed:
        parsed = parsed["result"]

    if isinstance(parsed, dict) and "content" in parsed and isinstance(parsed["content"], list):
        content_list = parsed["content"]
        if content_list:
            text_val = content_list[0].get("text", content_list[0])
            if isinstance(text_val, str):
                try:
                    parsed = json.loads(text_val)
                except json.JSONDecodeError:
                    error_exit(
                        "INVALID_JSON",
                        "MCP content[0].text 不是合法 JSON。",
                        f"text 前 200 字符: {text_val[:200]}"
                    )
            elif isinstance(text_val, dict):
                parsed = text_val

    return parsed


def validate_request(data):
    """校验输入 JSON 的必要字段。"""
    if not isinstance(data, dict):
        error_exit("INVALID_FORMAT", "输入必须是 JSON 对象。")

    request = data.get("request")
    if request is None or not isinstance(request, dict):
        error_exit(
            "MISSING_FIELD",
            "缺少 'request' 字段或格式错误。",
            '输入格式: {"request": {...}, "ctx": {}}'
        )

    if "ctx" not in data:
        error_exit(
            "MISSING_FIELD",
            "缺少 'ctx' 字段。",
            '输入格式: {"request": {...}, "ctx": {}}'
        )

    sales_codes = request.get("salesProductCodes")
    if not sales_codes or not isinstance(sales_codes, list) or len(sales_codes) == 0:
        error_exit(
            "MISSING_FIELD",
            "request.salesProductCodes 缺失或为空列表。",
            "必须提供至少一个产品编码。"
        )

    # 校验 mccCode（如果存在于 request 顶层或 businessProperty 内）
    mcc_code = request.get("mccCode")
    bp = request.get("businessProperty")
    if not mcc_code and bp and isinstance(bp, dict):
        mcc_code = bp.get("mccCode")

    if mcc_code:
        if not re.match(MCC_CODE_PATTERN, mcc_code):
            error_exit(
                "INVALID_MCC_FORMAT",
                f"mccCode 格式错误: '{mcc_code}'，期望格式为 Axxxx_Bxxxx。",
                "请检查 mccCode 格式是否正确。"
            )
        if mcc_code == DEFAULT_MCC_CODE:
            error_exit(
                "DEFAULT_MCC_NOT_ALLOWED",
                f"mccCode 不能为默认值 {DEFAULT_MCC_CODE}。",
                "请提供通过经营类目推荐获取的实际类目编码。"
            )


def call_mcp_apply(data):
    """调用 alipay-cli mcp call ar-sign.apply，返回解析后的响应。"""
    json_str = json.dumps(data, ensure_ascii=False)

    try:
        result = subprocess.run(
            ["alipay-cli", "mcp", "call", "ar-sign.apply", "-d", json_str],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        error_exit(
            "CLI_NOT_FOUND",
            "未找到 alipay-cli 命令。",
            "请确认 alipay-cli 已安装并在 PATH 中。"
        )
    except subprocess.TimeoutExpired:
        error_exit(
            "MCP_TIMEOUT",
            "MCP 调用超时（120秒）。",
            "请检查网络连接或稍后重试。"
        )

    stdout = result.stdout.strip()
    if not stdout:
        stderr_hint = result.stderr.strip()[:300] if result.stderr else ""
        error_exit(
            "EMPTY_RESPONSE",
            "MCP 调用返回为空。",
            f"退出码: {result.returncode}" + (f"，stderr: {stderr_hint}" if stderr_hint else "")
        )

    # 解析响应（复用 CLI 输出解析逻辑）
    try:
        parsed = json.loads(stdout)
        return unwrap_mcp_response(parsed)
    except json.JSONDecodeError:
        pass

    parsed = extract_json_from_raw(stdout)
    if parsed is None:
        error_exit(
            "INVALID_RESPONSE",
            "无法从 MCP 返回中提取 JSON。",
            f"返回前 300 字符: {stdout[:300]}"
        )

    return unwrap_mcp_response(parsed)


def format_result(response):
    """格式化 apply 响应为统一输出格式。"""
    error_code = response.get("errorCode")
    if response.get("success") is False or (error_code and error_code != ""):
        result = {
            "success": False,
            "errorCode": error_code,
            "errorMessage": response.get("errorMessage", "未知错误"),
        }
        biz_tips = response.get("bizTips")
        if biz_tips:
            result["bizTips"] = biz_tips
        if response.get("needRetry"):
            result["needRetry"] = True

        data = response.get("data") or response.get("resultObj") or {}
        checked_error = data.get("checkedError")
        if checked_error:
            result["checkedError"] = checked_error

        return result

    # 成功
    data = response.get("data") or response.get("resultObj") or {}
    result = {
        "success": True,
        "message": "签约申请已提交。",
    }
    order_no = data.get("orderNo")
    if order_no:
        result["orderNo"] = order_no

    return result


def main():
    parser = argparse.ArgumentParser(
        description="外部直调 apply：接收完整 MCP 参数，校验后调用 ar-sign.apply"
    )
    parser.add_argument(
        "--data", "-d",
        help="完整 MCP 参数 JSON 字符串"
    )

    args = parser.parse_args()

    if not args.data:
        error_exit(
            "NO_INPUT",
            "缺少必需参数 --data/-d。",
            '用法: ar-sign apply --data \'{"request": {"salesProductCodes": [...], ...}, "ctx": {}}\''
        )

    # 1. 解析 JSON
    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as e:
        error_exit("INVALID_JSON", f"--data 参数不是合法 JSON: {e}")

    # 2. 校验必要字段
    validate_request(data)

    # 3. 自动注入 bizRequestNo（每次调用唯一）
    if "bizRequestNo" not in data["request"]:
        data["request"]["bizRequestNo"] = str(uuid.uuid4())

    # 4. 调用 MCP
    response = call_mcp_apply(data)

    # 5. 格式化输出
    result = format_result(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
