#!/usr/bin/env python3
"""抖音支付凭证检查脚本。

退出码：
  0 = 存在抖音支付集成凭证
  1 = 不存在凭证或当前环境无法读取凭证

检查 key 为 integration-douyinpay。
脚本只输出是否存在，不输出凭证内容。
"""

import os
import sys


DEFAULT_CREDENTIAL_KEY = "integration-douyinpay"


def main() -> int:
    credential_key = DEFAULT_CREDENTIAL_KEY

    try:
        from coze_workload_identity import Client  # type: ignore

        credential = Client().get_integration_credential(credential_key)
        if credential is not None:
            print(f"✅ 检测到抖音支付集成凭证已存在（key={credential_key}）")
            return 0
    except Exception:
        # 缺少 SDK、无权限、非 Coze 环境等场景都视为未检测到凭证。
        pass

    print(f"❌ 未检测到抖音支付集成凭证（key={credential_key}）")
    return 1


if __name__ == "__main__":
    sys.exit(main())
