#!/bin/bash

set -u

MODE="${1:-}"
if [ "$MODE" != "check" ] && [ "$MODE" != "integration-check" ]; then
  echo "用法: bash alipay_cli_env.sh <check|integration-check> [--product-type webpay]" >&2
  exit 1
fi
shift

case "${BASH_SOURCE[0]}" in
  */*) SCRIPT_DIR="${BASH_SOURCE[0]%/*}" ;;
  *) SCRIPT_DIR="." ;;
esac
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common.sh"

PRODUCT_TYPE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --product-type)
      [ "$#" -ge 2 ] || { echo "❌ 缺少参数值: $1" >&2; exit 1; }
      PRODUCT_TYPE="$2"
      shift 2
      ;;
    *)
      echo "❌ 未知参数: $1" >&2
      exit 1
      ;;
  esac
done

if [ -n "$PRODUCT_TYPE" ]; then
  [ "$PRODUCT_TYPE" = "webpay" ] || { echo "❌ 产品类型非法，Coze 定制版仅支持 webpay" >&2; exit 1; }
  init_alipay_cli_product "$PRODUCT_TYPE" || exit 1
else
  unset PRODUCT
fi

if [ "$MODE" = "integration-check" ]; then
  emit_stage_metric_async "integration.env_prepare.start"
fi

prepare_jq() {
  node "${SCRIPT_DIR}/managed_jq.mjs" prepare >/dev/null
}

prepare_alipay_cli() {
  node "${SCRIPT_DIR}/managed_alipay_cli.mjs" prepare >/dev/null
}

MISSING=()
command -v node >/dev/null 2>&1 || MISSING+=("node")

if command -v node >/dev/null 2>&1; then
  if ! alipay_aipay_jq_ready; then
    prepare_jq || true
    alipay_aipay_activate_user_tools >/dev/null 2>&1 || true
  fi
  if ! alipay_aipay_cli_ready; then
    prepare_alipay_cli || true
    alipay_aipay_activate_user_tools >/dev/null 2>&1 || true
  fi
fi

alipay_aipay_jq_ready || MISSING+=("jq")
alipay_aipay_cli_ready || MISSING+=("alipay-cli")

if [ "${#MISSING[@]}" -eq 0 ]; then
  echo "CLI_ENV:READY"
else
  printf '%s' '{}' \
    | ALIPAY_AIPAY_RENDERER_MANAGED_CALLER=alipay_cli_env.sh \
      node "${SCRIPT_DIR}/render_customer_message.mjs" environment.coze.unavailable --variant DEFAULT
  emit_control "CLI_ENV:UNAVAILABLE"
  emit_control "CLI_ENV_MISSING=$(IFS=,; echo "${MISSING[*]}")"
  exit 1
fi
