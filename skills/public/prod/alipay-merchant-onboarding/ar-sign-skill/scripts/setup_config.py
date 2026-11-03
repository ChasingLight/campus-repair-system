#!/usr/bin/env python3
"""
设置签约 Skill 的配置。

将配置写入 ~/.alipay/arSignConfig.json，所有脚本通过 config_utils 读取。

用法:
  python3 scripts/setup_config.py --data-dir /custom/path/
  python3 scripts/setup_config.py --prefill-file prefill.json
  python3 scripts/setup_config.py --show
  python3 scripts/setup_config.py --reset
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_utils import (CONFIG_PATH, DEFAULT_DATA_DIR, load_config,
                          resolve_data_dir, get_prefill_file_path)


def save_config(config):
    config_dir = os.path.dirname(CONFIG_PATH)
    if config_dir and not os.path.exists(config_dir):
        os.makedirs(config_dir, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def cmd_set_data_dir(data_dir):
    config = load_config()
    if "ar-sign" not in config:
        config["ar-sign"] = {}
    config["ar-sign"]["dataDir"] = data_dir
    save_config(config)
    resolved = resolve_data_dir()
    print(json.dumps({
        "success": True,
        "message": f"数据目录已设置为: {data_dir}",
        "resolvedPath": resolved,
        "configPath": CONFIG_PATH,
    }, ensure_ascii=False, indent=2))


def cmd_set_prefill_file(prefill_file):
    config = load_config()
    if "ar-sign" not in config:
        config["ar-sign"] = {}
    config["ar-sign"]["prefillFile"] = prefill_file
    save_config(config)
    resolved = get_prefill_file_path()
    print(json.dumps({
        "success": True,
        "message": f"预填数据文件已设置为: {prefill_file}",
        "resolvedPath": resolved,
        "configPath": CONFIG_PATH,
    }, ensure_ascii=False, indent=2))


def cmd_show():
    config = load_config()
    ar_sign = config.get("ar-sign", {})
    configured_dir = ar_sign.get("dataDir")
    configured_prefill = ar_sign.get("prefillFile")
    resolved_dir = resolve_data_dir()
    resolved_prefill = get_prefill_file_path()
    print(json.dumps({
        "configPath": CONFIG_PATH,
        "configExists": os.path.exists(CONFIG_PATH),
        "configuredDataDir": configured_dir,
        "resolvedDataDir": resolved_dir,
        "defaultDataDir": DEFAULT_DATA_DIR,
        "usingDefault": configured_dir is None,
        "configuredPrefillFile": configured_prefill,
        "resolvedPrefillFile": resolved_prefill,
    }, ensure_ascii=False, indent=2))


def cmd_reset():
    config = load_config()
    if "ar-sign" in config:
        config["ar-sign"].pop("dataDir", None)
        config["ar-sign"].pop("prefillFile", None)
        if not config["ar-sign"]:
            del config["ar-sign"]
        if config:
            save_config(config)
        else:
            if os.path.exists(CONFIG_PATH):
                os.remove(CONFIG_PATH)
    print(json.dumps({
        "success": True,
        "message": "已重置为默认配置。",
        "resolvedDataDir": DEFAULT_DATA_DIR,
        "resolvedPrefillFile": None,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="设置签约 Skill 的配置"
    )
    parser.add_argument(
        "--data-dir",
        help="设置数据目录路径（相对路径基于用户主目录解析）"
    )
    parser.add_argument(
        "--prefill-file",
        help="设置预填数据文件路径（相对路径基于用户主目录解析）"
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="查看当前配置"
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="重置为默认配置"
    )

    args = parser.parse_args()

    if not any([args.data_dir, args.prefill_file, args.show, args.reset]):
        parser.print_help()
        sys.exit(1)

    if args.show and args.reset:
        print("错误: --show 和 --reset 不能同时使用", file=sys.stderr)
        sys.exit(1)

    if args.show:
        cmd_show()
    elif args.reset:
        cmd_reset()
    else:
        if args.data_dir:
            cmd_set_data_dir(args.data_dir)
        if args.prefill_file:
            cmd_set_prefill_file(args.prefill_file)


if __name__ == "__main__":
    main()
