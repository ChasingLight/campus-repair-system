#!/usr/bin/env python3
"""
组装 previewFormView MCP 的完整 request JSON。

从 ar-sign-data.json 提取所有区块 values，merge 用户变更字段，
输出可直接传入 ar-sign.previewFormView 的完整 request。

用法:
  # 无变更，仅从文件提取当前 pageData 组装 request
  python3 build_preview_request.py

  # 修改 webSiteInfo.webStatus 为 OFFLINE
  python3 build_preview_request.py webSiteInfo.webStatus=OFFLINE

  # 同时修改多个字段
  python3 build_preview_request.py webSiteInfo.webStatus=OFFLINE webSiteInfo.webLink=https://example.com

  # 指定 ar-sign-data.json 路径（默认 ~/.alipay/ar/ar-sign-data.json）
  python3 build_preview_request.py --data /path/to/ar-sign-data.json webSiteInfo.webStatus=OFFLINE

  # 指定 salesProductCodes（默认从 ar-sign-data.json 的 meta.salesCodes 读取）
  python3 build_preview_request.py --sales-codes I1080300001000041203

  # 输出到文件
  python3 build_preview_request.py webSiteInfo.webStatus=OFFLINE -o request.json

输出:
  标准 JSON，可直接作为 alipay-cli mcp call ar-sign.previewFormView -d 的参数
"""

import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_utils import get_data_file_path, get_tmp_file_path


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


def load_ar_sign_data(filepath):
    """读取 ar-sign-data.json，返回解析后的 dict。"""
    if not os.path.exists(filepath):
        error_exit(
            "NO_SIGN_DATA",
            f"签约数据文件不存在: {filepath}",
            "没有进行中的签约流程，请引导用户重新选择产品开始签约。"
        )
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        error_exit(
            "INVALID_JSON",
            f"ar-sign-data.json 不是合法 JSON: {e}",
            "签约数据文件已损坏，请删除该文件并引导用户重新开始签约流程。"
        )


def extract_page_data(ar_sign_data):
    """
    从 ar-sign-data.json 提取所有区块的 values，合并为 pageData。

    遍历 artisanPage.data 下每个 blockId，提取 block.data.values，
    将其中的内容合并到 pageData 顶层。

    例如 artisanPage.data.webSiteInfo.data.values = {"webSiteInfo": {"webStatus": "ONLINE", ...}}
    合并后 pageData = { "webSiteInfo": {"webStatus": "ONLINE", ...}, ... }
    """
    artisan_page = ar_sign_data.get("artisanPage")
    if not artisan_page:
        error_exit(
            "INVALID_STRUCTURE",
            "ar-sign-data.json 中缺少 artisanPage 字段。",
            "签约数据文件结构异常，请删除该文件并引导用户重新开始签约流程。"
        )

    blocks = artisan_page.get("data")
    if not blocks or not isinstance(blocks, dict):
        error_exit(
            "INVALID_STRUCTURE",
            "artisanPage.data 缺失或格式错误。",
            "签约数据文件结构异常，请删除该文件并引导用户重新开始签约流程。"
        )

    # 以下区块不参与 preview 参数组装，由后端自行处理
    SKIP_BLOCKS = {"basicArInfo", "editPriceInfo"}

    page_data = {}
    for block_id, block in blocks.items():
        if block_id in SKIP_BLOCKS:
            continue
        values = block.get("data", {}).get("values")
        if values and isinstance(values, dict):
            page_data.update(values)

    return page_data


def set_nested_value(obj, dotted_key, value):
    """
    按点分路径设置嵌套字段值。

    例如 set_nested_value(obj, "webSiteInfo.webStatus", "OFFLINE")
    等价于 obj["webSiteInfo"]["webStatus"] = "OFFLINE"
    """
    keys = dotted_key.split(".")
    current = obj
    for key in keys[:-1]:
        if key not in current:
            error_exit(
                "PATH_NOT_FOUND",
                f"路径 '{dotted_key}' 中 '{key}' 在 pageData 中不存在。",
                f"当前 pageData 中可用的顶层 key 为: {list(obj.keys())}。请检查字段路径是否正确，如果路径错误请调整后重试；如果确认路径正确但数据中不存在，请重新向用户收集该区块的信息。"
            )
        if not isinstance(current[key], dict):
            error_exit(
                "PATH_NOT_OBJECT",
                f"路径 '{dotted_key}' 中 '{key}' 不是对象类型，无法继续向下查找。",
                f"'{key}' 的当前值为: {json.dumps(current[key], ensure_ascii=False)[:200]}。请检查路径是否正确。"
            )
        current = current[key]

    final_key = keys[-1]
    if final_key not in current:
        print(json.dumps({
            "warning": True,
            "warningType": "FIELD_NOT_IN_VALUES",
            "message": f"字段 '{dotted_key}' 在 values 中不存在，将新建。",
            "hint": f"该字段可能来自 schema 联动新增，或路径拼写有误。当前 '{keys[-2] if len(keys) > 1 else 'root'}' 下已有的 key: {list(current.keys())}",
        }, ensure_ascii=False), file=sys.stderr)

    # 尝试解析 JSON 值（支持数组、数字、布尔等）
    try:
        parsed = json.loads(value)
        current[final_key] = parsed
    except (json.JSONDecodeError, TypeError):
        current[final_key] = value


DEFAULT_MCC_CODE = "A0003_B0223"
MCC_CODE_PATTERN = r'^A\d{4}_B\d{4}$'


def validate_mcc_code(mcc_code):
    """
    校验 mccCode：格式必须为 Axxxx_Bxxxx，且不能是默认值 A0003_B0223。
    校验失败时调用 error_exit 终止。
    """
    import re
    if not re.match(MCC_CODE_PATTERN, mcc_code):
        error_exit(
            "INVALID_MCC_FORMAT",
            f"mccCode 格式错误: '{mcc_code}'，期望格式为 Axxxx_Bxxxx（如 A0002_B0013）。",
            "请引导用户通过 mcc-recommend Skill 重新采集经营类目。"
        )
    if mcc_code == DEFAULT_MCC_CODE:
        error_exit(
            "DEFAULT_MCC_NOT_ALLOWED",
            f"mccCode 不能为默认值 {DEFAULT_MCC_CODE}，必须通过经营类目推荐获取实际类目编码。",
            "请引导用户通过 mcc-recommend Skill 采集经营类目，或让用户从支持的类目中选择。禁止直接使用默认值提交。"
        )


def handle_mcc_update(obj, mcc_code):
    """
    处理 MCC 类目更新。

    传入 mccCode（如 A0002_B0013），自动拆分并写入 3 个字段：
    - businessInfo.mccInfo.mccCode
    - businessInfo.mccInfo.mccIndustry1
    - businessInfo.mccInfo.mccIndustry2
    """
    validate_mcc_code(mcc_code)
    parts = mcc_code.split("_")

    mcc_info = obj.get("businessInfo", {}).get("mccInfo")
    if mcc_info is None:
        error_exit(
            "PATH_NOT_FOUND",
            "pageData 中不存在 businessInfo.mccInfo。",
            f"当前 pageData 中可用的顶层 key 为: {list(obj.keys())}。请检查签约数据是否完整。"
        )

    mcc_info["mccCode"] = mcc_code
    mcc_info["mccIndustry1"] = parts[0]
    mcc_info["mccIndustry2"] = parts[1]


def parse_field_updates(args):
    """
    解析 key=value 格式的字段变更参数。

    返回 [(dotted_key, value), ...]
    """
    updates = []
    for arg in args:
        if "=" not in arg:
            print(f"错误: 参数格式错误 '{arg}'，期望 key=value 格式（如 webSiteInfo.webStatus=OFFLINE）", file=sys.stderr)
            sys.exit(1)
        key, value = arg.split("=", 1)
        updates.append((key, value))
    return updates


def build_request(page_data, sales_codes):
    """组装完整的 previewFormView MCP request。"""
    request = {
        "salesProductCodes": sales_codes,
        "callMode": "INTERACTION",
        "channelCode": "B_SK_SH_RPC",
        "orderType": "NEW_SIGN",
        "pageData": page_data,
    }

    # pageData 中有 mccCode 时，同步到 request 最外层
    mcc_code = page_data.get("businessInfo", {}).get("mccInfo", {}).get("mccCode")
    if mcc_code:
        request["mccCode"] = mcc_code

    return {"request": request, "ctx": {}}


def main():
    parser = argparse.ArgumentParser(
        description="从 ar-sign-data.json 组装 previewFormView MCP 的完整 request",
        epilog="示例: python3 build_preview_request.py webSiteInfo.webStatus=OFFLINE"
    )
    parser.add_argument(
        "--data", "-d",
        default=None,
        help="ar-sign-data.json 路径（默认从 ~/.alipay/arSignConfig.json 或 ~/.alipay/ar/ 解析）"
    )
    parser.add_argument(
        "--sales-codes", "-s",
        nargs="+",
        help="salesProductCodes 列表（默认从 meta.salesCodes 读取）"
    )
    parser.add_argument(
        "--output", "-o",
        help="输出到文件（默认输出到数据目录的 tmp/preview_request.json）"
    )
    parser.add_argument(
        "--page-data-only",
        action="store_true",
        help="仅输出 pageData 部分，不包含完整 request 包装"
    )
    parser.add_argument(
        "updates",
        nargs="*",
        help="字段变更，格式: blockId.fieldName=value（如 webSiteInfo.webStatus=OFFLINE）"
    )

    args = parser.parse_args()

    if args.data is None:
        args.data = get_data_file_path()

    # -o 未指定时默认输出到 tmp 目录
    if args.output is None:
        args.output = get_tmp_file_path("preview_request.json")

    # 1. 读取 ar-sign-data.json
    ar_sign_data = load_ar_sign_data(args.data)

    # 2. 提取 pageData
    page_data = extract_page_data(ar_sign_data)

    # 3. 应用用户变更
    updates = parse_field_updates(args.updates)
    for dotted_key, value in updates:
        # MCC 类目特殊处理：自动拆分写入 mccCode + mccIndustry1 + mccIndustry2
        if dotted_key == "businessInfo.mccInfo.mccCode":
            handle_mcc_update(page_data, value)
        else:
            set_nested_value(page_data, dotted_key, value)

    # 4. 获取 salesProductCodes
    sales_codes = args.sales_codes
    if not sales_codes:
        meta = ar_sign_data.get("meta", {})
        sales_codes = meta.get("salesCodes")
        if not sales_codes:
            error_exit(
                "NO_SALES_CODES",
                "未指定 salesProductCodes，且 ar-sign-data.json 中无 meta.salesCodes。",
                "请通过 --sales-codes 参数指定产品编码，或引导用户重新选择签约产品。"
            )

    # 5. 组装输出
    if args.page_data_only:
        output = page_data
    else:
        output = build_request(page_data, sales_codes)

    result = json.dumps(output, ensure_ascii=False, indent=2)

    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"已输出到 {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
