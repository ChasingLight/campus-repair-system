#!/bin/bash
#=============================================================================
# 脚本名称: common.sh
# 功能描述: 集成流程和签约流程共用的 shell 基础函数
# 调用前置: 无
#=============================================================================

alipay_aipay_jq_ready() {
  command -v jq >/dev/null 2>&1 \
    && jq --version >/dev/null 2>&1 \
    && jq -n -e --arg value ok '$value == "ok"' >/dev/null 2>&1
}

alipay_aipay_jq_at_path_ready() {
  local jq_path="${1:-}"
  [ -x "$jq_path" ] \
    && "$jq_path" --version >/dev/null 2>&1 \
    && "$jq_path" -n -e --arg value ok '$value == "ok"' >/dev/null 2>&1
}

alipay_aipay_cli_ready() {
  command -v alipay-cli >/dev/null 2>&1 || return 1

  local check_dir check_status
  check_dir="$(mktemp -d "${TMPDIR:-/tmp}/alipay-aipay-cli-check.XXXXXX")" || return 1
  XDG_CONFIG_HOME="$check_dir/config" \
  XDG_CACHE_HOME="$check_dir/cache" \
  XDG_DATA_HOME="$check_dir/data" \
    alipay-cli version >/dev/null 2>&1
  check_status=$?
  case "$check_dir" in
    /*/alipay-aipay-cli-check.*) rm -rf -- "$check_dir" ;;
  esac
  return "$check_status"
}

alipay_aipay_cli_at_path_ready() {
  local cli_path="${1:-}" check_dir check_status
  [ -x "$cli_path" ] || return 1
  check_dir="$(mktemp -d "${TMPDIR:-/tmp}/alipay-aipay-cli-check.XXXXXX")" || return 1
  XDG_CONFIG_HOME="$check_dir/config" \
  XDG_CACHE_HOME="$check_dir/cache" \
  XDG_DATA_HOME="$check_dir/data" \
    "$cli_path" version >/dev/null 2>&1
  check_status=$?
  case "$check_dir" in
    /*/alipay-aipay-cli-check.*) rm -rf -- "$check_dir" ;;
  esac
  return "$check_status"
}

alipay_aipay_user_bin() {
  case "${HOME:-}" in
    /*) [ "$HOME" != "/" ] || return 1 ;;
    *) return 1 ;;
  esac
  printf '%s/.local/bin' "$HOME"
}

# Coze 每次启动受控 Shell 时重新发现用户级工具，不依赖 shell rc 持久化。
alipay_aipay_activate_user_tools() {
  local user_bin
  user_bin="$(alipay_aipay_user_bin)" || return 1
  case ":${PATH:-}:" in
    *":$user_bin:"*) ;;
    *) PATH="${PATH:+$PATH:}$user_bin"; export PATH ;;
  esac
  if ! alipay_aipay_jq_ready && alipay_aipay_jq_at_path_ready "$user_bin/jq"; then
    jq() { "$HOME/.local/bin/jq" "$@"; }
  fi
  if ! alipay_aipay_cli_ready && alipay_aipay_cli_at_path_ready "$user_bin/alipay-cli"; then
    alipay-cli() { "$HOME/.local/bin/alipay-cli" "$@"; }
  fi
}

alipay_aipay_activate_user_tools >/dev/null 2>&1 || true

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ 缺少依赖命令: $1"
    return 1
  fi
}

ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE=77
ALIPAY_CLI_LOCAL_STATE_ACCESS_CONFIRMED=false
ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_PERMISSION_EXIT_CODE=77
ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_ACCESS_CONFIRMED=false

alipay_cli_credentials_dir() {
  case "${HOME:-}" in
    /*) [ "$HOME" != "/" ] || return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE" ;;
    *) return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE" ;;
  esac
  printf '%s/.alipay-cli/credentials' "$HOME"
}

alipay_cli_logs_dir() {
  local data_home="${XDG_DATA_HOME:-}"
  if [ -z "$data_home" ]; then
    case "${HOME:-}" in
      /*) [ "$HOME" != "/" ] || return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE" ;;
      *) return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE" ;;
    esac
    data_home="$HOME/.local/share"
  fi
  case "$data_home" in
    /*) ;;
    *) return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE" ;;
  esac
  printf '%s/alipay-cli/logs' "$data_home"
}

alipay_cli_has_local_state_permission_error() {
  local raw="${1:-}" permission_pattern private_state_pattern local_state_failure_pattern
  [ -n "$raw" ] || return 1

  permission_pattern='permission denied|operation not permitted|(^|[^[:alnum:]_])(EACCES|EPERM)([^[:alnum:]_]|$)'
  private_state_pattern='poll_state\.enc\.tmp|session\.enc|\.alipay-cli[/\\]credentials|alipay-cli[/\\]logs'
  local_state_failure_pattern='写入临时文件失败|删除凭据文件失败|can.?t rename log file'

  printf '%s' "$raw" | grep -qiE "$local_state_failure_pattern" && return 0
  printf '%s' "$raw" | grep -qiE "$permission_pattern" || return 1
  printf '%s' "$raw" | grep -qiE "$private_state_pattern"
}

probe_private_writable_dir() {
  local state_dir="$1" prefix="$2" failure_code="$3" probe_file="" renamed_file=""
  [ -d "$state_dir" ] || mkdir -p "$state_dir" 2>/dev/null || return "$failure_code"
  probe_file=$(mktemp "$state_dir/${prefix}.XXXXXX" 2>/dev/null) || return "$failure_code"
  chmod 600 "$probe_file" 2>/dev/null || { rm -f "$probe_file" 2>/dev/null || true; return "$failure_code"; }
  if ! printf 'alipay-aipay-local-access\n' >"$probe_file" 2>/dev/null; then
    rm -f "$probe_file" 2>/dev/null || true
    return "$failure_code"
  fi
  renamed_file="${probe_file}.renamed"
  if ! mv "$probe_file" "$renamed_file" 2>/dev/null; then
    rm -f "$probe_file" "$renamed_file" 2>/dev/null || true
    return "$failure_code"
  fi
  rm -f "$renamed_file" 2>/dev/null || { rm -f "$renamed_file" 2>/dev/null || true; return "$failure_code"; }
}

require_alipay_cli_local_state_access() {
  local state_dir
  if [ "$ALIPAY_CLI_LOCAL_STATE_ACCESS_CONFIRMED" = true ]; then
    return 0
  fi

  for state_dir in "$(alipay_cli_credentials_dir)" "$(alipay_cli_logs_dir)"; do
    probe_private_writable_dir "$state_dir" ".alipay-aipay-access" "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE" \
      || return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE"
  done

  ALIPAY_CLI_LOCAL_STATE_ACCESS_CONFIRMED=true
}

require_alipay_cli_local_state_access_or_emit() {
  if require_alipay_cli_local_state_access; then
    return 0
  fi
  emit_control "CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION"
  return "$ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE"
}

alipay_aipay_public_key_export_dir() {
  printf '%s' '/workspace/projects'
}

require_alipay_aipay_public_key_export_access() {
  local export_dir
  if [ "$ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_ACCESS_CONFIRMED" = true ]; then
    return 0
  fi

  export_dir="$(alipay_aipay_public_key_export_dir)"
  probe_private_writable_dir "$export_dir" ".alipay-aipay-public-key-access" "$ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_PERMISSION_EXIT_CODE" \
    || return "$ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_PERMISSION_EXIT_CODE"

  ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_ACCESS_CONFIRMED=true
}

emit_control() {
  printf 'ALIPAY_AIPAY_INTERNAL:%s\n' "$*" >&2
}

validate_control_value() {
  local value="${1:-}"
  [ -n "$value" ] || return 1
  ! printf '%s' "$value" | LC_ALL=C grep -q '[[:cntrl:]]'
}

emit_control_field() {
  local name="${1:-}"
  local value="${2:-}"
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || return 1
  validate_control_value "$value" || return 1
  printf 'ALIPAY_AIPAY_INTERNAL:%s=%s\n' "$name" "$value" >&2
}

init_dev_tool_name() {
  DEV_TOOL_NAME="coze"
  export DEV_TOOL_NAME
}

platform_project_id() {
  local candidate

  candidate="${COZE_PROJECT_ID:-}"
  if valid_platform_id "$candidate"; then
    printf '%s' "$candidate"
    return 0
  fi

  return 1
}

valid_platform_id() {
  local value="${1:-}"
  [ -n "$value" ] || return 1
  printf '%s' "$value" | LC_ALL=C grep -q '[^[:space:]]' || return 1
  ! printf '%s' "$value" | LC_ALL=C grep -q '[[:cntrl:],^=]'
}

init_platform_id() {
  local candidate marker COMMON_DIR TELEMETRY_SCRIPT

  candidate="$(platform_project_id || true)"
  if valid_platform_id "$candidate"; then
    PLATFORM_ID="$candidate"
    export PLATFORM_ID
    return
  fi

  candidate="${ALIPAY_AIPAY_RUN_ID:-${ALIPAY_AIPAY_FLOW_RUN_ID:-}}"
  if valid_platform_id "$candidate"; then
    PLATFORM_ID="$candidate"
    export PLATFORM_ID
    return
  fi

  COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TELEMETRY_SCRIPT="${COMMON_DIR}/telemetry.mjs"
  if [ ! -f "$TELEMETRY_SCRIPT" ] || ! command -v node >/dev/null 2>&1; then
    return
  fi

  marker="$(node "$TELEMETRY_SCRIPT" current-run-id 2>&1 >/dev/null || true)"
  candidate="$(printf '%s\n' "$marker" | sed -n 's/^ALIPAY_AIPAY_INTERNAL:RUN_ID=//p' | head -n 1)"
  if valid_platform_id "$candidate"; then
    PLATFORM_ID="$candidate"
    export PLATFORM_ID
    return
  fi

  if valid_platform_id "${PLATFORM_ID:-}"; then
    export PLATFORM_ID
  fi
}

coze_project_space_id_for_biz_info() {
  local candidate="${COZE_PROJECT_SPACE_ID:-}"

  valid_platform_id "$candidate" || return 1
  printf '%s' "$candidate"
}

init_alipay_cli_biz_info() {
  local skill_user_id

  skill_user_id="$(coze_project_space_id_for_biz_info || true)"
  if valid_platform_id "$skill_user_id"; then
    printf -v ALIPAYCLI_BIZ_INFO '{"skill":"alipay-aipay","skill_version":"coze_v1","skill_user_id":"%s"}' "$skill_user_id"
  else
    printf -v ALIPAYCLI_BIZ_INFO '%s' '{"skill":"alipay-aipay","skill_version":"coze_v1"}'
  fi
  export ALIPAYCLI_BIZ_INFO
}

init_alipay_cli_context() {
  init_dev_tool_name
  init_platform_id
  init_alipay_cli_biz_info || return 1
  export PLATFORM="${DEV_TOOL_NAME:-unknown}"
}

init_alipay_cli_product() {
  local product_type="${1:-${ALIPAY_AIPAY_PRODUCT_TYPE:-}}"
  if [ "$product_type" != "webpay" ]; then
    echo "❌ 缺少或无法识别支付宝产品上下文（Coze 定制版仅支持 webpay）" >&2
    return 1
  fi
  ALIPAY_AIPAY_PRODUCT_TYPE="webpay"
  PRODUCT="WEBPAY"
  export ALIPAY_AIPAY_PRODUCT_TYPE PRODUCT
}

init_alipay_cli_product_from_sales_code() {
  if [ "${1:-}" != "I1080300001000041203" ]; then
    echo "❌ salesCode 非法，Coze 定制版仅支持 AI 网页应用收款" >&2
    return 1
  fi
  init_alipay_cli_product "webpay"
}

emit_stage_metric_async() {
  local stage="${1:-}"
  local product_name="${2:-}"
  local common_dir telemetry_script
  [ -n "$stage" ] || return 0
  common_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  telemetry_script="${common_dir}/telemetry.mjs"
  [ -f "$telemetry_script" ] && command -v node >/dev/null 2>&1 || return 0
  if [ -n "$product_name" ]; then
    node "$telemetry_script" stage-async "$stage" --product-name "$product_name" >/dev/null 2>&1
  else
    node "$telemetry_script" stage-async "$stage" >/dev/null 2>&1
  fi
  return 0
}
