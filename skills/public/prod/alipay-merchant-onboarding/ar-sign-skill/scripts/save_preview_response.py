#!/usr/bin/env python3
"""
将 previewFormView MCP 返回的完整响应存储为 ar-sign-data.json。

从 previewFormView 接口返回的 JSON 中提取 artisanPage 原文，
附加 meta 信息后写入 ar-sign-data.json。

严格保证 artisanPage 原样存储，不做任何精简、提取或重组。

用法:
  # 从文件读取 previewFormView 响应并存储（已有 ar-sign-data.json 时无需 -s）
  python3 save_preview_response.py --response ~/.alipay/ar/tmp/preview_result.json

  # 首次保存时需指定 salesCodes
  python3 save_preview_response.py --response ~/.alipay/ar/tmp/preview_result.json --sales-codes I1080300001000041203

  # 从 stdin 读取（支持管道）
  cat ~/.alipay/ar/tmp/preview_result.json | python3 save_preview_response.py --sales-codes I1080300001000041203

  # 指定输出路径（默认 ~/.alipay/ar/ar-sign-data.json）
  python3 save_preview_response.py --response ~/.alipay/ar/tmp/preview_result.json --output /path/to/ar-sign-data.json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_utils import get_data_file_path


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
    import re
    return re.sub(r'\x1b\[[0-9;]*m', '', text)


def extract_json_from_raw(content):
    """
    从任意格式的 CLI 输出中提取 JSON。

    支持的输入格式：
    1. 纯 JSON
    2. CLI 简单输出: "✅ MCP 调用成功\n{...}"
    3. CLI 表格输出: 带 │ ─ 边框的 HTTP RESPONSE 表格
    4. 带 ANSI 转义码的输出
    5. LLM 已解析后传入的 JSON 字符串
    """
    # 移除 ANSI 转义码
    content = strip_ansi(content)

    # 移除表格边框字符（│ ┌ ┐ └ ┘ ─ 等）
    import re
    content = re.sub(r'[│┌┐└┘─┬┴├┤┼╭╮╰╯]', '', content)

    # 找到第一个 { 开始的 JSON
    json_start = content.find("{")
    if json_start == -1:
        return None

    # 从 { 开始，尝试找到匹配的完整 JSON
    # 使用逐步扩展的方式找到合法 JSON 的结束位置
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
                    # 这个 { } 配对不是合法 JSON，继续找下一个
                    continue
    return None


def unwrap_mcp_response(parsed):
    """
    逐层剥壳 MCP 响应，直到拿到业务数据。

    可能的包装层：
    1. jsonrpc 包装: { "id": 1, "jsonrpc": "2.0", "result": { "content": [...] } }
    2. MCP content 包装: { "content": [{ "text": "..." }] }
    3. content[].text 是字符串（需要再 json.loads）或已经是 dict
    4. 业务数据: { "resultObj": {...}, "success": true, ... }
    5. 直接是 artisanPage
    """
    if not isinstance(parsed, dict):
        return parsed

    # jsonrpc 包装: 取 result
    if "jsonrpc" in parsed and "result" in parsed:
        parsed = parsed["result"]

    # MCP content 包装: 取 content[0].text
    if isinstance(parsed, dict) and "content" in parsed and isinstance(parsed["content"], list):
        content_list = parsed["content"]
        if content_list:
            text_val = content_list[0].get("text", content_list[0])
            # text 可能是字符串（需要解析）或已经是 dict
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


def load_response(filepath=None):
    """
    从文件或 stdin 读取 preview 接口返回的 JSON。

    自动处理各种 CLI 输出格式：ANSI 转义码、表格边框、jsonrpc 包装、MCP content 包装。
    逐层剥壳直到拿到业务数据。
    """
    if filepath:
        if not os.path.exists(filepath):
            error_exit("FILE_NOT_FOUND", f"响应文件不存在: {filepath}")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    else:
        content = sys.stdin.read()

    if not content.strip():
        error_exit("EMPTY_INPUT", "输入为空。")

    # 尝试直接解析（纯 JSON 输入）
    try:
        parsed = json.loads(content.strip())
        return unwrap_mcp_response(parsed)
    except json.JSONDecodeError:
        pass

    # 从混杂内容中提取 JSON
    parsed = extract_json_from_raw(content)
    if parsed is None:
        error_exit(
            "INVALID_JSON",
            "无法从输入中提取 JSON 数据。",
            f"输入前 300 字符: {content[:300]}"
        )

    return unwrap_mcp_response(parsed)


def extract_artisan_page(response):
    """
    从 previewFormView 响应中提取 artisanPage。

    支持多种结构：
    1. 真实 MCP 响应: { "resultObj": { "render": { "data": { artisanPage } } }, "success": true }
       artisanPage = resultObj.render.data（含 data、structure、title）
    2. Mock 响应: { "data": { "artisanPage": {...} }, "success": true }
    3. 直接 artisanPage: { "data": {...}, "structure": {...} }
    """
    # 检查接口错误
    error_code = response.get("errorCode")
    if response.get("success") is False or (error_code and error_code != ""):
        error_exit(
            "API_ERROR",
            f"preview 接口返回错误: {response.get('errorMessage', error_code or '未知错误')}",
            response.get("bizTips", "请检查接口调用参数是否正确。")
        )

    # 真实 MCP 响应: resultObj.render.data
    result_obj = response.get("resultObj")
    if result_obj and isinstance(result_obj, dict):
        render = result_obj.get("render")
        if render and isinstance(render, dict):
            render_data = render.get("data")
            if render_data and isinstance(render_data, dict) and "structure" in render_data:
                return render_data

    # Mock 响应: data.artisanPage
    if "data" in response and isinstance(response["data"], dict):
        data = response["data"]
        if "artisanPage" in data:
            return data["artisanPage"]
        if "structure" in data and "data" in data:
            return data

    # 直接就是 artisanPage
    if "structure" in response and "data" in response:
        return response

    error_exit(
        "INVALID_RESPONSE",
        "无法从响应中提取 artisanPage，未找到预期的数据结构。",
        f"响应顶层 key: {list(response.keys())}。预期包含 resultObj.render.data 或 data.artisanPage。"
    )


def validate_artisan_page(artisan_page):
    """验证 artisanPage 结构完整性。"""
    # artisanPage 内部的 data 字段包含各区块
    # 真实数据结构: artisanPage = { "data": { "data": {区块}, "structure": {...}, ... }, ... }
    # 或: artisanPage = { "data": {区块}, "structure": {...}, "title": ... }

    # 找到区块所在位置
    data = artisan_page.get("data")
    if not data or not isinstance(data, dict):
        error_exit(
            "INCOMPLETE_ARTISAN_PAGE",
            "artisanPage.data 缺失或格式错误。",
            "artisanPage.data 应包含区块数据或嵌套 data 结构。"
        )

    # 检查 structure 是否存在（可能在顶层或 data 内）
    has_structure = "structure" in artisan_page or "structure" in data
    if not has_structure:
        error_exit(
            "INCOMPLETE_ARTISAN_PAGE",
            "artisanPage 中未找到 structure 字段。",
            "structure 定义了区块展示顺序，缺失会导致流程异常。"
        )

    # 找到区块字典
    blocks = data.get("data") if isinstance(data.get("data"), dict) else data
    if not blocks or not isinstance(blocks, dict):
        return

    block_count = 0
    for block_id, block in blocks.items():
        if not isinstance(block, dict):
            continue
        # 只检查看起来像区块的对象（有 basic 或 id 字段）
        if "basic" in block or "id" in block:
            block_count += 1
            expected_block_keys = {"basic", "data", "id"}
            actual_block_keys = set(block.keys())
            missing_block = expected_block_keys - actual_block_keys
            if missing_block:
                print(json.dumps({
                    "warning": True,
                    "warningType": "INCOMPLETE_BLOCK",
                    "message": f"区块 '{block_id}' 缺少字段: {missing_block}，可能数据不完整。",
                }, ensure_ascii=False), file=sys.stderr)

    if block_count == 0:
        print(json.dumps({
            "warning": True,
            "warningType": "NO_BLOCKS_FOUND",
            "message": "未在 artisanPage 中找到区块数据。",
        }, ensure_ascii=False), file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="将 previewFormView 响应原样存储为 ar-sign-data.json"
    )
    parser.add_argument(
        "--response", "-r",
        help="previewFormView 响应 JSON 文件路径（不指定则从 stdin 读取）"
    )
    parser.add_argument(
        "--sales-codes", "-s",
        nargs="+",
        required=False,
        help="salesProductCodes 列表（可选：不传时自动从已有 ar-sign-data.json 或 preview_request.json 中获取）"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="输出路径（默认从 ~/.alipay/arSignConfig.json 或 ~/.alipay/ar/ 解析）"
    )

    args = parser.parse_args()

    if args.output is None:
        args.output = get_data_file_path()

    # 自动获取 salesCodes：CLI 参数 > 已有 ar-sign-data.json > preview_request.json
    sales_codes = args.sales_codes
    if not sales_codes:
        existing_path = args.output
        if os.path.exists(existing_path):
            try:
                with open(existing_path, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
                sales_codes = existing_data.get("meta", {}).get("salesCodes")
            except (json.JSONDecodeError, IOError):
                pass
    if not sales_codes:
        request_path = os.path.join(os.path.dirname(args.output), "tmp", "preview_request.json")
        if os.path.exists(request_path):
            try:
                with open(request_path, "r", encoding="utf-8") as f:
                    request_data = json.load(f)
                sales_codes = request_data.get("request", {}).get("salesProductCodes")
            except (json.JSONDecodeError, IOError):
                pass
    if not sales_codes:
        error_exit(
            "NO_SALES_CODES",
            "未指定 --sales-codes/-s，且无法从已有 ar-sign-data.json 或 preview_request.json 中获取。",
            "请通过 -s 参数传入 salesProductCodes。"
            )

    # 1. 读取 previewFormView 响应
    response = load_response(args.response)

    # 2. 提取 artisanPage 原文（自动检查接口错误）
    artisan_page = extract_artisan_page(response)

    # 3. 验证完整性
    validate_artisan_page(artisan_page)

    # 4. 组装 ar-sign-data.json
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ar_sign_data = {
        "artisanPage": artisan_page,
        "meta": {
            "salesCodes": sales_codes,
            "createdAt": now,
            "updatedAt": now,
        }
    }

    # 5. 写入文件
    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(ar_sign_data, f, ensure_ascii=False, indent=2)

    # 6. 输出确认
    data = artisan_page.get("data", {})
    blocks = data.get("data", data) if isinstance(data, dict) else {}
    block_ids = [k for k, v in blocks.items() if isinstance(v, dict) and ("basic" in v or "id" in v)]
    print(json.dumps({
        "success": True,
        "message": f"ar-sign-data.json 已保存到 {args.output}",
        "artisanPageTitle": artisan_page.get("title") or data.get("title"),
        "blockCount": len(block_ids),
        "blockIds": block_ids,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
