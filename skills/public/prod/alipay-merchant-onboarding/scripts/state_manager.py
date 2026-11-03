#!/usr/bin/env python3
"""
共享内存状态管理器（mmap + fcntl 实现）
用于替代文件存储，支持多进程间的状态共享和互斥访问。

使用方式：
    python3 state_manager.py init                    # 初始化共享内存状态
    python3 state_manager.py get <field>             # 获取字段值
    python3 state_manager.py set <field> <value>     # 设置字段值
    python3 state_manager.py set-json <field> <json> # 设置 JSON 对象字段
    python3 state_manager.py show                    # 显示完整状态
    python3 state_manager.py reset                   # 重置状态
    python3 state_manager.py delete                  # 删除共享内存
    python3 state_manager.py exists                  # 检查状态是否存在
"""

import json
import sys
import os
import mmap
import fcntl

# mmap 文件路径（/tmp 下，系统重启自动清除，无需手动清理）
MMAP_FILE = f"/tmp/.alipay_onboarding_{os.environ.get('USER', 'default')}.mm"
MMAP_SIZE = 65536  # 64KB

# 默认状态结构
DEFAULT_STATE = {
    "userId": "",
    "status": "init",
    "currentStep": "",
    "productName": "",
    "salesCode": "",
    "scope": "",
    "mccCode": "",
    "mccName": "",
    "mccLevel1Name": "",
    "mccLevel2Name": "",
    "deviceCode": "",
    "verificationCode": "",
    "browserUrl": "",
    "qrcodeExpireTime": "",
    "collect_information": {
        "pc_home_page_image": "",
        "pc_shop_page_image": "",
        "pc_payment_image": ""
    },
    "ar_sign_data": {},
    "authToken": "",
    "merchantPid": "",
    "appId": ""
}


def _open_mmap(create=False):
    """打开 mmap 文件，返回 (fd, mm) 或 (None, None)。

    create=True: 文件不存在则创建并填充零字节
    create=False: 文件不存在则返回 (None, None)
    """
    if create:
        fd = os.open(MMAP_FILE, os.O_RDWR | os.O_CREAT, 0o600)
        # 确保文件大小
        size = os.fstat(fd).st_size
        if size < MMAP_SIZE:
            os.ftruncate(fd, MMAP_SIZE)
        mm = mmap.mmap(fd, MMAP_SIZE, access=mmap.ACCESS_WRITE)
        return fd, mm
    else:
        if not os.path.exists(MMAP_FILE):
            return None, None
        fd = os.open(MMAP_FILE, os.O_RDWR)
        mm = mmap.mmap(fd, MMAP_SIZE, access=mmap.ACCESS_WRITE)
        return fd, mm


def _close_mmap(fd, mm):
    """安全关闭 mmap 和 fd"""
    try:
        mm.flush()
    except Exception:
        pass
    try:
        mm.close()
    except Exception:
        pass
    try:
        os.close(fd)
    except Exception:
        pass


def _read_from_mmap(mm):
    """从 mmap 读取 JSON 数据"""
    end = 0
    while end < MMAP_SIZE and mm[end] != 0:
        end += 1
    if end == 0:
        return None
    return json.loads(mm[:end].decode('utf-8'))


def _write_to_mmap(mm, state):
    """将 JSON 数据写入 mmap"""
    state_json = json.dumps(state, ensure_ascii=False)
    encoded = state_json.encode('utf-8')
    if len(encoded) >= MMAP_SIZE:
        print(f"❌ 错误: 状态数据过大 ({len(encoded)} bytes)，超过共享内存大小 ({MMAP_SIZE} bytes)", file=sys.stderr)
        sys.exit(1)
    mm[:len(encoded)] = encoded
    mm[len(encoded)] = 0  # null 终止符
    # 清零剩余空间
    mm[len(encoded) + 1:MMAP_SIZE] = b'\x00' * (MMAP_SIZE - len(encoded) - 1)


def init_state():
    """初始化共享内存状态"""
    fd, mm = _open_mmap(create=True)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        _write_to_mmap(mm, DEFAULT_STATE)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)
    print("✅ 共享内存状态已初始化")


def get_state():
    """读取完整状态"""
    fd, mm = _open_mmap(create=False)
    if fd is None:
        return None
    try:
        fcntl.flock(fd, fcntl.LOCK_SH)
        state = _read_from_mmap(mm)
        return state
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)


def save_state(state):
    """保存状态到共享内存"""
    fd, mm = _open_mmap(create=False)
    if fd is None:
        # 文件不存在，先初始化
        init_state()
        fd, mm = _open_mmap(create=False)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        _write_to_mmap(mm, state)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        _close_mmap(fd, mm)


def get_field(field_path):
    """获取字段值，支持嵌套路径如 'collect_information.pc_home_page_image'"""
    state = get_state()
    if state is None:
        print("")
        return

    keys = field_path.split('.')
    value = state
    try:
        for key in keys:
            if key.isdigit():
                value = value[int(key)]
            else:
                value = value[key]
        if isinstance(value, (dict, list)):
            print(json.dumps(value, ensure_ascii=False))
        else:
            print(value if value is not None else "")
    except (KeyError, IndexError, TypeError):
        print("")


def set_field(field_path, value):
    """设置字段值，支持嵌套路径"""
    state = get_state()
    if state is None:
        import copy
        state = copy.deepcopy(DEFAULT_STATE)

    keys = field_path.split('.')

    # 导航到目标字段的父级
    current = state
    for key in keys[:-1]:
        if key.isdigit():
            current = current[int(key)]
        else:
            if key not in current:
                current[key] = {}
            current = current[key]

    # 设置最终字段
    final_key = keys[-1]
    if final_key.isdigit():
        current[int(final_key)] = value
    else:
        current[final_key] = value

    save_state(state)


def set_json_field(field_path, json_value):
    """设置 JSON 对象字段"""
    try:
        parsed_value = json.loads(json_value)
        set_field(field_path, parsed_value)
    except json.JSONDecodeError as e:
        print(f"❌ 错误: 无效的 JSON 值: {e}", file=sys.stderr)
        sys.exit(1)


def show_state():
    """显示完整状态"""
    state = get_state()
    if state is None:
        print("{}")
    else:
        print(json.dumps(state, ensure_ascii=False, indent=2))


def reset_state():
    """重置状态到默认值"""
    fd, mm = _open_mmap(create=False)
    if fd is None:
        init_state()
    else:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            _write_to_mmap(mm, DEFAULT_STATE)
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            _close_mmap(fd, mm)
        print("✅ 状态已重置")


def delete_state():
    """删除共享内存"""
    if not os.path.exists(MMAP_FILE):
        print("⚠️ 共享内存不存在")
        return
    try:
        os.unlink(MMAP_FILE)
        print("✅ 共享内存已删除")
    except OSError as e:
        print(f"❌ 删除失败: {e}", file=sys.stderr)
        sys.exit(1)


def exists_state():
    """检查状态是否存在且已初始化"""
    state = get_state()
    if state is not None and state.get("status", "init") != "init":
        print("true")
    else:
        print("false")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    command = sys.argv[1]

    if command == "init":
        init_state()
    elif command == "get":
        if len(sys.argv) < 3:
            print("用法: state_manager.py get <field>", file=sys.stderr)
            sys.exit(1)
        get_field(sys.argv[2])
    elif command == "set":
        if len(sys.argv) < 4:
            print("用法: state_manager.py set <field> <value>", file=sys.stderr)
            sys.exit(1)
        set_field(sys.argv[2], sys.argv[3])
    elif command == "set-json":
        if len(sys.argv) < 4:
            print("用法: state_manager.py set-json <field> <json>", file=sys.stderr)
            sys.exit(1)
        set_json_field(sys.argv[2], sys.argv[3])
    elif command == "show":
        show_state()
    elif command == "reset":
        reset_state()
    elif command == "delete":
        delete_state()
    elif command == "exists":
        exists_state()
    else:
        print(f"❌ 未知命令: {command}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()