#!/usr/bin/env python3
"""支付宝凭证检查脚本 - 返回 0=存在凭证, 1=不存在凭证"""

import sys


def main():
    try:
        from coze_workload_identity import Client
        cred = Client().get_integration_credential("integration-alipay")
        if cred is not None:
            print("存在支付宝凭证，调用 alipay-payment-production-integration")
            return 0
    except Exception:
        pass

    print("不存在支付宝凭证，咨询用户是否入驻")
    return 1


if __name__ == "__main__":
    sys.exit(main())