#!/usr/bin/env python3
"""Shared configuration utilities for ar-sign-skill scripts."""

import json
import os

HOME_DIR = os.path.expanduser("~")
CONFIG_PATH = os.path.join(HOME_DIR, ".alipay", "arSignConfig.json")
DEFAULT_DATA_DIR = os.path.join(HOME_DIR, ".alipay", "ar")
DATA_FILE_NAME = "ar-sign-data.json"
PREFILL_RESULT_FILE_NAME = "prefill_result.json"
TMP_DIR_NAME = "tmp"


def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def resolve_data_dir(cli_override=None):
    if cli_override is not None:
        return os.path.abspath(cli_override)

    config = load_config()
    data_dir = config.get("ar-sign", {}).get("dataDir")

    if data_dir:
        if not os.path.isabs(data_dir):
            data_dir = os.path.join(HOME_DIR, data_dir)
        return os.path.abspath(data_dir)

    return DEFAULT_DATA_DIR


def get_data_file_path(cli_override=None):
    if cli_override is not None:
        return os.path.abspath(cli_override)
    return os.path.join(resolve_data_dir(), DATA_FILE_NAME)


def get_tmp_dir(cli_override=None):
    return os.path.join(resolve_data_dir(cli_override), TMP_DIR_NAME)


def get_prefill_result_path(cli_override=None):
    return os.path.join(get_tmp_dir(cli_override), PREFILL_RESULT_FILE_NAME)


def get_tmp_file_path(filename, cli_override=None):
    """获取 tmp 目录下指定文件的完整路径。"""
    return os.path.join(get_tmp_dir(cli_override), filename)


def get_prefill_file_path(cli_override=None):
    if cli_override is not None:
        return os.path.abspath(cli_override)
    config = load_config()
    path = config.get("ar-sign", {}).get("prefillFile")
    if path:
        if not os.path.isabs(path):
            path = os.path.join(HOME_DIR, path)
        return os.path.abspath(path)
    return None
