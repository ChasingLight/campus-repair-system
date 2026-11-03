#!/usr/bin/env python3
"""
组装 apply MCP 的完整 request JSON（businessProperties 格式）。

从 ar-sign-data.json 提取数据，转换为 businessProperties 格式的 apply request。
不使用 pageData，而是将数据映射到 businessProperties 结构。

转换规则（pageData → businessProperties）：
  - businessInfo.mccInfo.mccCode       → businessProperties[0].mccCode
  - webSiteInfo.webStatus              → businessProperties[0].businessPlaces[0].appStatus
  - webSiteInfo.screenshot[].picUrl    → businessProperties[0].businessPlaces[0].screenshot[]（扁平化为 URL 数组）
  - placeType 固定为 "ONLINE_WEBAPP"（电脑网站）
  - protocolInfo、unifiedCg# 等区块不传入 businessProperties

用法:
  # 输出到 stdout
  python3 build_apply_request.py

  # 输出到文件
  python3 build_apply_request.py -o ~/.alipay/ar/tmp/apply_request.json

  # 指定 ar-sign-data.json 路径
  python3 build_apply_request.py --data /path/to/ar-sign-data.json
"""

import argparse
import json
import os
import re
import sys
import uuid

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
    """从 ar-sign-data.json 提取所有区块的 values。"""
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

    page_data = {}
    for block_id, block in blocks.items():
        values = block.get("data", {}).get("values")
        if values and isinstance(values, dict):
            page_data.update(values)

    return page_data


def convert_to_business_property(page_data):
    """
    将 pageData 转换为 businessProperty 格式（ApplyBusinessPropertyMcpDTO）。

    转换规则：
    - businessInfo.mccInfo.mccCode → businessProperty.mccCode
    - webSiteInfo → businessProperty.webAppDTO（BusinessWebAppDTO）
      - webStatus → appStatus
      - screenshot[].picUrl → screenshot[]（扁平化为 URL 字符串数组）
      - placeType 固定为 "ONLINE_WEBAPP"
    - protocolInfo、unifiedCg# 等区块不进入 businessProperty
    """
    business_info = page_data.get("businessInfo", {})
    web_site_info = page_data.get("webSiteInfo", {})

    # 提取 mccCode
    mcc_info = business_info.get("mccInfo", {})
    mcc_code = mcc_info.get("mccCode")
    if not mcc_code:
        error_exit(
            "MISSING_MCC",
            "pageData 中缺少 businessInfo.mccInfo.mccCode。",
            "MCC 类目编码缺失，请确认已完成 MCC 收集。"
        )

    # 校验 mccCode 格式和默认值
    if not re.match(MCC_CODE_PATTERN, mcc_code):
        error_exit(
            "INVALID_MCC_FORMAT",
            f"mccCode 格式错误: '{mcc_code}'，期望格式为 Axxxx_Bxxxx（如 A0002_B0013）。",
            "请引导用户通过 mcc-recommend Skill 重新采集经营类目。"
        )
    if mcc_code == DEFAULT_MCC_CODE:
        error_exit(
            "DEFAULT_MCC_NOT_ALLOWED",
            f"mccCode 不能为默认值 {DEFAULT_MCC_CODE}，必须通过经营类目推荐获取实际类目编码后才能提交申请。",
            "请引导用户通过 mcc-recommend Skill 采集经营类目，或让用户从支持的类目中选择。禁止直接使用默认值提交。"
        )

    # 构造 webAppDTO（BusinessWebAppDTO）
    web_app_dto = {
        "placeType": "ONLINE_WEBAPP",
        "appType": "PC_WEB",
    }

    # webStatus → appStatus
    web_status = web_site_info.get("webStatus")
    if web_status:
        web_app_dto["appStatus"] = web_status

    # screenshot[].picUrl → screenshot[]（扁平化）
    screenshot = web_site_info.get("screenshot")
    if screenshot and isinstance(screenshot, list):
        flat_urls = []
        for item in screenshot:
            if isinstance(item, dict):
                url = item.get("picUrl", "")
                if url:
                    flat_urls.append(url)
            elif isinstance(item, str):
                if item:
                    flat_urls.append(item)
        if flat_urls:
            web_app_dto["screenshot"] = flat_urls

    # 组装 businessProperty（ApplyBusinessPropertyMcpDTO）
    business_property = {
        "mccCode": mcc_code,
        "webAppDTO": web_app_dto,
    }

    return business_property


def build_request(business_property, sales_codes):
    """组装完整的 apply MCP request（businessProperty 格式）。"""
    return {
        "request": {
            "bizFeatures": {},
            "bizRequestNo": str(uuid.uuid4()),
            "businessProperty": business_property,
            "channelCode": "B_SK_SH_RPC",
            "extension": {},
            "orderType": "NEW_SIGN",
            "salesProductCodes": sales_codes,
        },
        "ctx": {}
    }


def main():
    parser = argparse.ArgumentParser(
        description="从 ar-sign-data.json 组装 apply MCP 的完整 request（businessProperties 格式）"
    )
    parser.add_argument(
        "--data", "-d",
        default=None,
        help="ar-sign-data.json 路径（默认从 ~/.alipay/arSignConfig.json 或 ~/.alipay/ar/ 解析）"
    )
    parser.add_argument(
        "--output", "-o",
        help="输出到文件（默认输出到数据目录的 tmp/apply_request.json）"
    )

    args = parser.parse_args()

    if args.data is None:
        args.data = get_data_file_path()

    # -o 未指定时默认输出到 tmp 目录
    if args.output is None:
        args.output = get_tmp_file_path("apply_request.json")

    # 1. 读取 ar-sign-data.json
    ar_sign_data = load_ar_sign_data(args.data)

    # 2. 提取 pageData（作为中间数据）
    page_data = extract_page_data(ar_sign_data)

    # 3. 转换为 businessProperty
    business_property = convert_to_business_property(page_data)

    # 4. 获取 salesProductCodes
    sales_codes = ar_sign_data.get("meta", {}).get("salesCodes")
    if not sales_codes:
        error_exit(
            "NO_SALES_CODES",
            "ar-sign-data.json 中无 meta.salesCodes。",
            "签约数据文件缺少产品编码，请删除该文件并引导用户重新开始签约流程。"
        )

    # 5. 组装 request
    output = build_request(business_property, sales_codes)

    result = json.dumps(output, ensure_ascii=False, indent=2)

    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"已输出到 {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
