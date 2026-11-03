#!/usr/bin/env python3
"""
生成首次 previewFormView 调用的 request JSON。

首次调用 preview 时尚无 ar-sign-data.json，不需要 pageData，
只需 salesProductCodes + 固定参数即可。

用法:
  # 输出到 stdout
  python3 init_preview_request.py -s I1080300001000041203

  # 多个产品编码
  python3 init_preview_request.py -s I1080300001000041203 I1080300001000041204

  # 输出到文件
  python3 init_preview_request.py -s I1080300001000041203 -o ~/.alipay/ar/tmp/preview_request.json

  # 带已有 MCC（从 MCC Skill 获取后传入）
  python3 init_preview_request.py -s I1080300001000041203 --mcc <mccCode>
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_utils import get_data_file_path, get_tmp_file_path

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


def validate_mcc_code(mcc_code):
    """校验 mccCode：格式必须为 Axxxx_Bxxxx，且不能是默认值。"""
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


def build_init_request(sales_codes, mcc_code=None):
    """组装首次 previewFormView request。"""
    request = {
        "request": {
            "salesProductCodes": sales_codes,
            "callMode": "INTERACTION",
            "channelCode": "B_SK_SH_RPC",
            "orderType": "NEW_SIGN",
        },
        "ctx": {}
    }

    if mcc_code:
        validate_mcc_code(mcc_code)
        request["request"]["mccCode"] = mcc_code

    return request


def main():
    parser = argparse.ArgumentParser(
        description="生成首次 previewFormView 调用的 request JSON"
    )
    parser.add_argument(
        "--sales-codes", "-s",
        nargs="+",
        required=False,
        help="salesProductCodes 列表"
    )
    parser.add_argument(
        "--mcc",
        help="已有的 mccCode（如 A0002_B0013），可选"
    )
    parser.add_argument(
        "--output", "-o",
        help="输出到文件（默认输出到数据目录的 tmp/preview_request.json）"
    )

    args = parser.parse_args()

    # -o 未指定时默认输出到 tmp 目录
    if args.output is None:
        args.output = get_tmp_file_path("preview_request.json")

    if not args.sales_codes:
        error_exit(
            "NO_SALES_CODES",
            "缺少必需参数 --sales-codes/-s（salesProductCodes 列表）。",
            "init_preview_request.py 是首次签约调用，必须通过 -s 参数指定要签约的产品编码。示例: python3 scripts/init_preview_request.py -s I1080300001000041203"
        )

    # 检查是否已有 ar-sign-data.json，防止误用
    data_path = get_data_file_path()
    if os.path.exists(data_path):
        print(json.dumps({
            "error": True,
            "errorType": "SIGN_DATA_EXISTS",
            "message": f"已存在签约数据文件: {os.path.abspath(data_path)}",
            "hint": "已有进行中的签约数据，不应使用 init_preview_request.py。请使用 build_preview_request.py 更新字段后调用 preview。如需重新开始，请先删除该文件。",
        }, ensure_ascii=False, indent=2))
        sys.exit(1)

    result = build_init_request(
        sales_codes=args.sales_codes,
        mcc_code=args.mcc,
    )

    output = json.dumps(result, ensure_ascii=False, indent=2)

    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"已输出到 {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
