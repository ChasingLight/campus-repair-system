#!/usr/bin/env python3
"""抖音支付商户入驻断点状态管理器（mmap + fcntl）。

只保存非敏感、非业务真相字段。业务状态必须通过 dypay-cli 或后端实时查询。

使用方式：
    python3 state_manager.py init
    python3 state_manager.py exists
    python3 state_manager.py get <field>
    python3 state_manager.py set <field> <value>
    python3 state_manager.py set-json <field> <json>
    python3 state_manager.py show
    python3 state_manager.py reset
    python3 state_manager.py delete
"""

from __future__ import annotations

import copy
import fcntl
import json
import mmap
import os
import sys
from typing import Any


MMAP_FILE = f"/tmp/.douyinpay_onboarding_{os.environ.get('USER', 'default')}.mm"
MMAP_SIZE = 65536

DEFAULT_STATE: dict[str, Any] = {
    "entry_mode": "",
    "product_name": "Native 支付",
    "product_code": "CO_PAY_NATIVE",
    "category_name": "其他互联网服务",
    "materials": {
        "homepage_image_url": "",
        "sales_page_image_url": "",
    },
}

ALLOWED_PATHS = {
    "entry_mode",
    "product_name",
    "product_code",
    "category_name",
    "materials.homepage_image_url",
    "materials.sales_page_image_url",
}

MEANINGFUL_PATHS = {
    "entry_mode",
    "materials.homepage_image_url",
    "materials.sales_page_image_url",
}


class StateError(Exception):
    """State manager error."""


def _open_mmap(create: bool = False):
    if create:
        fd = os.open(MMAP_FILE, os.O_RDWR | os.O_CREAT, 0o600)
        if os.fstat(fd).st_size < MMAP_SIZE:
            os.ftruncate(fd, MMAP_SIZE)
        mm = mmap.mmap(fd, MMAP_SIZE, access=mmap.ACCESS_WRITE)
        return fd, mm

    if not os.path.exists(MMAP_FILE):
        return None, None
    fd = os.open(MMAP_FILE, os.O_RDWR)
    mm = mmap.mmap(fd, MMAP_SIZE, access=mmap.ACCESS_WRITE)
    return fd, mm


def _close_mmap(fd, mm) -> None:
    if mm is not None:
        try:
            mm.flush()
        except Exception:
            pass
        try:
            mm.close()
        except Exception:
            pass
    if fd is not None:
        try:
            os.close(fd)
        except Exception:
            pass


def _read_from_mmap(mm) -> dict[str, Any] | None:
    end = 0
    while end < MMAP_SIZE and mm[end] != 0:
        end += 1
    if end == 0:
        return None
    return json.loads(mm[:end].decode("utf-8"))


def _write_to_mmap(mm, state: dict[str, Any]) -> None:
    state_json = json.dumps(state, ensure_ascii=False)
    encoded = state_json.encode("utf-8")
    if len(encoded) >= MMAP_SIZE:
        raise StateError(f"状态数据过大: {len(encoded)} bytes >= {MMAP_SIZE} bytes")
    mm[: len(encoded)] = encoded
    mm[len(encoded)] = 0
    mm[len(encoded) + 1 : MMAP_SIZE] = b"\x00" * (MMAP_SIZE - len(encoded) - 1)


def _validate_path(field_path: str) -> None:
    if field_path not in ALLOWED_PATHS:
        allowed = ", ".join(sorted(ALLOWED_PATHS))
        raise StateError(f"禁止写入字段: {field_path}. 允许字段: {allowed}")


def _get_path(state: dict[str, Any], field_path: str) -> Any:
    current: Any = state
    for key in field_path.split("."):
        if not isinstance(current, dict) or key not in current:
            return ""
        current = current[key]
    return current


def _set_path(state: dict[str, Any], field_path: str, value: Any) -> None:
    _validate_path(field_path)
    keys = field_path.split(".")
    current: Any = state
    for key in keys[:-1]:
        if key not in current or not isinstance(current[key], dict):
            current[key] = {}
        current = current[key]
    current[keys[-1]] = value


def _is_meaningful(state: dict[str, Any]) -> bool:
    for path in MEANINGFUL_PATHS:
        value = _get_path(state, path)
        if value not in ("", None, {}, []):
            return True
    return False


def init_state() -> None:
    fd, mm = _open_mmap(create=True)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        _write_to_mmap(mm, copy.deepcopy(DEFAULT_STATE))
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)
    print("✅ 抖音支付入驻断点状态已初始化")


def get_state() -> dict[str, Any] | None:
    fd, mm = _open_mmap(create=False)
    if fd is None:
        return None
    try:
        fcntl.flock(fd, fcntl.LOCK_SH)
        return _read_from_mmap(mm)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)


def save_state(state: dict[str, Any]) -> None:
    fd, mm = _open_mmap(create=False)
    if fd is None:
        init_state()
        fd, mm = _open_mmap(create=False)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        _write_to_mmap(mm, state)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)


def get_field(field_path: str) -> None:
    state = get_state()
    if state is None:
        print("")
        return
    value = _get_path(state, field_path)
    if isinstance(value, (dict, list)):
        print(json.dumps(value, ensure_ascii=False))
    else:
        print(value if value is not None else "")


def set_field(field_path: str, value: Any) -> None:
    state = get_state()
    if state is None:
        state = copy.deepcopy(DEFAULT_STATE)
    _set_path(state, field_path, value)
    save_state(state)


def set_json_field(field_path: str, json_value: str) -> None:
    try:
        parsed_value = json.loads(json_value)
    except json.JSONDecodeError as exc:
        raise StateError(f"无效 JSON 值: {exc}") from exc
    set_field(field_path, parsed_value)


def show_state() -> None:
    state = get_state()
    if state is None:
        print("{}")
    else:
        print(json.dumps(state, ensure_ascii=False, indent=2))


def reset_state() -> None:
    fd, mm = _open_mmap(create=False)
    if fd is None:
        init_state()
        return
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        _write_to_mmap(mm, copy.deepcopy(DEFAULT_STATE))
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)
    print("✅ 抖音支付入驻断点状态已重置")


def delete_state() -> None:
    if not os.path.exists(MMAP_FILE):
        print("⚠️ 抖音支付入驻断点状态不存在")
        return
    os.unlink(MMAP_FILE)
    print("✅ 抖音支付入驻断点状态已删除")


def exists_state() -> None:
    state = get_state()
    print("true" if state is not None and _is_meaningful(state) else "false")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 0

    command = sys.argv[1]
    try:
        if command == "init":
            init_state()
        elif command == "exists":
            exists_state()
        elif command == "get":
            if len(sys.argv) < 3:
                raise StateError("用法: state_manager.py get <field>")
            get_field(sys.argv[2])
        elif command == "set":
            if len(sys.argv) < 4:
                raise StateError("用法: state_manager.py set <field> <value>")
            set_field(sys.argv[2], sys.argv[3])
        elif command == "set-json":
            if len(sys.argv) < 4:
                raise StateError("用法: state_manager.py set-json <field> <json>")
            set_json_field(sys.argv[2], sys.argv[3])
        elif command == "show":
            show_state()
        elif command == "reset":
            reset_state()
        elif command == "delete":
            delete_state()
        else:
            raise StateError(f"未知命令: {command}")
    except StateError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
