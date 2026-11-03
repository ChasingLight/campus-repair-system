#!/bin/bash
# Application actions: stdout is customer text; control facts use internal stderr.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENDERER="${SCRIPT_DIR}/../../../normal/scripts/render_customer_message.mjs"
CANDIDATE_RUNNER="${SCRIPT_DIR}/../../../normal/scripts/onboarding_message_runner.mjs"

if [ -f "${SCRIPT_DIR}/error_handler.sh" ]; then
  source "${SCRIPT_DIR}/error_handler.sh"
else
  echo "❌ 缺少错误处理脚本: ${SCRIPT_DIR}/error_handler.sh"
  exit 1
fi
source "${SCRIPT_DIR}/network_retry.sh"

require_command jq || exit 1
require_command node || exit 1

parse_app_context_args() {
  local SEEN_ARGS=""
  PRODUCT_TYPE="${ALIPAY_AIPAY_PRODUCT_TYPE:-}"
  SALES_CODE=""
  APPLICATION_TYPE=""
  while [[ $# -gt 0 ]]; do
    case "${SEEN_ARGS}|" in
      *"|${1}|"*) echo "❌ 参数重复: $1"; return 1 ;;
    esac
    case $1 in
      --product-type)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; return 1; }
        SEEN_ARGS="${SEEN_ARGS}|$1"; PRODUCT_TYPE="$2"; shift 2 ;;
      --sales-code)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; return 1; }
        SEEN_ARGS="${SEEN_ARGS}|$1"; SALES_CODE="$2"; shift 2 ;;
      --application-type)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; return 1; }
        SEEN_ARGS="${SEEN_ARGS}|$1"; APPLICATION_TYPE="$2"; shift 2 ;;
      *)
        echo "❌ 未知参数: $1"
        return 1 ;;
    esac
  done
}

build_create_application_request() {
  jq -n '{request:{applicationType:"WEBAPP",createScene:"cli"}}'
}

validate_app_context() {
  local EXPECTED_PRODUCT_TYPE=""
  local EXPECTED_APPLICATION_TYPE=""

  if [ -n "${PRODUCT_TYPE:-}" ] && [ "$PRODUCT_TYPE" != "webpay" ]; then
    echo "❌ --product-type 参数值无效: ${PRODUCT_TYPE}（仅支持 webpay）" >&2
    return 1
  fi

  case "${SALES_CODE:-}" in
    "") ;;
    "I1080300001000041203") EXPECTED_PRODUCT_TYPE="webpay" ;;
    *) echo "❌ 未知 salesCode: ${SALES_CODE}" >&2; return 1 ;;
  esac

  if [ -n "$EXPECTED_PRODUCT_TYPE" ] && [ -n "${PRODUCT_TYPE:-}" ] && [ "$PRODUCT_TYPE" != "$EXPECTED_PRODUCT_TYPE" ]; then
    echo "❌ --product-type 与 --sales-code 不匹配：--product-type=${PRODUCT_TYPE}, --sales-code=${SALES_CODE}" >&2
    echo "📋 期望 --product-type=${EXPECTED_PRODUCT_TYPE}" >&2
    return 1
  fi

  [ -z "${PRODUCT_TYPE:-$EXPECTED_PRODUCT_TYPE}" ] || EXPECTED_APPLICATION_TYPE="WEBAPP"

  if [ -n "$EXPECTED_APPLICATION_TYPE" ] && [ -n "${APPLICATION_TYPE:-}" ] && [ "$APPLICATION_TYPE" != "$EXPECTED_APPLICATION_TYPE" ]; then
    echo "❌ --application-type 与产品上下文不匹配：--application-type=${APPLICATION_TYPE}" >&2
    echo "📋 期望 --application-type=${EXPECTED_APPLICATION_TYPE}" >&2
    return 1
  fi
}

init_app_cli_product() {
  local resolved_product_type="${PRODUCT_TYPE:-}"

  if [ -z "$resolved_product_type" ] && [ -n "${SALES_CODE:-}" ]; then
    if [ "$SALES_CODE" != "I1080300001000041203" ]; then
      echo "❌ 未知 salesCode: ${SALES_CODE}" >&2
      return 1
    fi
    resolved_product_type="webpay"
  fi
  if [ -z "$resolved_product_type" ]; then
    resolved_product_type="${ALIPAY_AIPAY_PRODUCT_TYPE:-}"
  fi
  PRODUCT_TYPE="$resolved_product_type"
  validate_app_context || return 1
  init_alipay_cli_product "$PRODUCT_TYPE"
}

prepare_positional_app_cli_context() {
  PRODUCT_TYPE="${ALIPAY_AIPAY_PRODUCT_TYPE:-}"
  if [ "${1:-}" = "--product-type" ]; then
    [ "$#" -ge 2 ] || { echo "❌ 缺少参数值: $1"; return 1; }
    PRODUCT_TYPE="$2"
    shift 2
  fi
  init_app_cli_product || return 1
  APP_POSITIONAL_ARGS=("$@")
}

resolve_application_type() {
  validate_app_context || return 1

  if [ -n "${APPLICATION_TYPE:-}" ]; then
    case "$APPLICATION_TYPE" in
      WEBAPP) echo "$APPLICATION_TYPE" ;;
      *) echo "❌ APPLICATION_TYPE 参数值无效: ${APPLICATION_TYPE}（仅支持 WEBAPP）" >&2; return 1 ;;
    esac
    return 0
  fi

  echo "WEBAPP"
}

query_security_key() {
  local APP_ID="$1"
  local PUBLIC_KEY="${2:-}"

  if [ -n "$PUBLIC_KEY" ]; then
    REQUEST_JSON=$(jq -n \
      --arg appId "$APP_ID" \
      --arg publicKey "$PUBLIC_KEY" \
      '{request:{appId:$appId,publicKey:$publicKey}}')
  else
    REQUEST_JSON=$(jq -n --arg appId "$APP_ID" '{request:{appId:$appId}}')
  fi

  require_alipay_cli_local_state_access_or_emit || return "$?"
  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry RESULT read application_security_key -- alipay-cli mcp call apprelease.queryApplicationSecurityKey \
    -d "$REQUEST_JSON" \
    --json
  RETRY_RC=$?
  if [ "$RETRY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    return "$RETRY_RC"
  fi
  if [ "$RETRY_RC" -ne 0 ]; then
    echo "❌ 应用安全密钥查询因网络或服务异常在自动重试两次后仍未恢复"
    return 1
  fi

  if ! handle_error "$RESULT" "MCP_AUTHENTICATED_CALL"; then
    return 1
  fi

  SECURITY_BUSINESS=$(unwrap_mcp "$RESULT")
  SUCCESS=$(echo "$SECURITY_BUSINESS" | jq -r '.success // false')

  if [ "$SUCCESS" != "true" ]; then
    ERROR_MSG=$(echo "$SECURITY_BUSINESS" | jq -r '.error.message // .errorMessage // "未知错误"')
    ERROR_MSG=$(sanitize_customer_error_text "$ERROR_MSG")
    echo "❌ 查询安全密钥失败: $ERROR_MSG"
    return 1
  fi
}

query_application_info() {
  local APP_ID="$1"

  REQUEST_JSON=$(jq -n --arg appId "$APP_ID" '{request:{appId:$appId}}')
  require_alipay_cli_local_state_access_or_emit || return "$?"
  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry RESULT read application_info -- alipay-cli mcp call apprelease.queryApplicationInfo \
    -d "$REQUEST_JSON" \
    --json
  RETRY_RC=$?
  if [ "$RETRY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    return "$RETRY_RC"
  fi
  if [ "$RETRY_RC" -ne 0 ]; then
    echo "❌ 应用信息查询因网络或服务异常在自动重试两次后仍未恢复"
    return 1
  fi

  if ! handle_error "$RESULT" "MCP_AUTHENTICATED_CALL"; then
    return 1
  fi

  APPLICATION_INFO_BUSINESS=$(unwrap_mcp "$RESULT")
  SUCCESS=$(echo "$APPLICATION_INFO_BUSINESS" | jq -r '.success // false')

  if [ "$SUCCESS" != "true" ]; then
    ERROR_MSG=$(echo "$APPLICATION_INFO_BUSINESS" | jq -r '.error.message // .errorMessage // "未知错误"')
    ERROR_MSG=$(sanitize_customer_error_text "$ERROR_MSG")
    echo "❌ 查询应用信息失败: $ERROR_MSG"
    return 1
  fi
}

extract_application_status() {
  echo "$APPLICATION_INFO_BUSINESS" | jq -r '
    .resultObj.status //
    empty
  '
}

extract_rsa2_application_key_info() {
  echo "$SECURITY_BUSINESS" | jq -c '
    (
      (.resultObj.securityConfigList // []) +
      (.resultObj.securityKeys // []) +
      (.data.securityConfigList // []) +
      (.data.securityKeys // []) +
      (.resultObj.alipayKeyList // []) +
      (.data.alipayKeyList // [])
    ) |
    map(select(
      .signType == "RSA2" and
      (
        ((.partnerPublicKey // "") != "") or
        ((.certInfoDTO | type) == "object" and ((.certInfoDTO.publicKey // "") != ""))
      )
    )) |
    .[0] // {}
  '
}

extract_rsa2_alipay_key_info() {
  echo "$SECURITY_BUSINESS" | jq -c '
    (
      (.resultObj.alipayKeyList // []) +
      (.data.alipayKeyList // []) +
      (.resultObj.securityKeys // []) +
      (.data.securityKeys // [])
    ) |
    map(select(.signType == "RSA2" and ((.alipayPublicKey // "") != ""))) |
    .[0] // {}
  '
}

extract_alipay_public_key() {
  local RSA2_KEY_INFO="$1"
  echo "$RSA2_KEY_INFO" | jq -r '.alipayPublicKey // empty'
}

is_rsa2_application_key_ready() {
  local RSA2_KEY_INFO="$1"

  echo "$RSA2_KEY_INFO" | jq -e '
    ((.partnerPublicKey // "") != "") or
    (
      (.certInfoDTO | type) == "object" and
      ((.certInfoDTO.publicKey // "") != "")
    )
  ' >/dev/null 2>&1
}

write_alipay_public_key() {
  local APP_ID="$1"
  local ALIPAY_PUBLIC_KEY="$2"

  local EXPORT_DIR KEY_FILE TEMP_FILE="" PUBLIC_KEY_IGNORE_PRESENT=false IGNORE_LINE=""
  local ATTEMPT=1
  local MAX_ATTEMPTS="${ALIPAY_PUBLIC_KEY_WRITE_RETRIES:-3}"
  local EXPORT_PERMISSION_EXIT_CODE="${ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_PERMISSION_EXIT_CODE:-77}"

  if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
    MAX_ATTEMPTS=3
  fi
  case "$APP_ID" in
    ""|*[!A-Za-z0-9_-]*) return 1 ;;
  esac

  EXPORT_DIR="$(alipay_aipay_public_key_export_dir)"
  require_alipay_aipay_public_key_export_access || return "$EXPORT_PERMISSION_EXIT_CODE"
  KEY_FILE="${EXPORT_DIR}/${APP_ID}-alipayPublicKey.keytext"
  ALIPAY_PUBLIC_KEY_FILE_DISPLAY="$KEY_FILE"

  if [ -L "${EXPORT_DIR}/.gitignore" ] || { [ -e "${EXPORT_DIR}/.gitignore" ] && [ ! -f "${EXPORT_DIR}/.gitignore" ]; }; then
    return "$EXPORT_PERMISSION_EXIT_CODE"
  fi
  if [ -f "${EXPORT_DIR}/.gitignore" ]; then
    while IFS= read -r IGNORE_LINE || [ -n "$IGNORE_LINE" ]; do
      if [ "$IGNORE_LINE" = '*.keytext' ]; then
        PUBLIC_KEY_IGNORE_PRESENT=true
        break
      fi
    done < "${EXPORT_DIR}/.gitignore"
  fi
  if [ "$PUBLIC_KEY_IGNORE_PRESENT" != true ]; then
    if [ -s "${EXPORT_DIR}/.gitignore" ]; then
      printf '\n*.keytext\n' >> "${EXPORT_DIR}/.gitignore" 2>/dev/null || return "$EXPORT_PERMISSION_EXIT_CODE"
    else
      (umask 022; printf '*.keytext\n' >> "${EXPORT_DIR}/.gitignore") 2>/dev/null || return "$EXPORT_PERMISSION_EXIT_CODE"
    fi
  fi

  while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    TEMP_FILE=$(mktemp "${EXPORT_DIR}/.${APP_ID}-alipayPublicKey.keytext.XXXXXX" 2>/dev/null) || TEMP_FILE=""
    if [ -n "$TEMP_FILE" ] \
        && chmod 600 "$TEMP_FILE" 2>/dev/null \
        && printf '%s\n' "$ALIPAY_PUBLIC_KEY" > "$TEMP_FILE" 2>/dev/null \
        && mv -f "$TEMP_FILE" "$KEY_FILE" 2>/dev/null \
        && chmod 600 "$KEY_FILE" 2>/dev/null \
        && [ -f "$KEY_FILE" ] \
        && [ ! -L "$KEY_FILE" ] \
        && [ -s "$KEY_FILE" ]; then
      TEMP_FILE=""
      return 0
    fi
    [ -z "$TEMP_FILE" ] || rm -f -- "$TEMP_FILE" 2>/dev/null || true

    if [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
      emit_control "⚠️ 支付宝公钥文件写入失败，正在重试（${ATTEMPT}/${MAX_ATTEMPTS}）..."
      sleep 1
    fi
    ATTEMPT=$((ATTEMPT + 1))
  done

  return 1
}

emit_alipay_public_key_export_retry() {
  emit_control "ALIPAY_PUBLIC_KEY_EXPORT_STATUS=RETRY_WITH_WORKSPACE_PERMISSION"
  emit_control "APP_FLOW:RETRY_WITH_WORKSPACE_PERMISSION"
}

write_and_emit_alipay_public_key_export() {
  local APP_ID="$1"
  local ALIPAY_PUBLIC_KEY="$2"
  local WRITE_RC DISPLAY_PATH
  local EXPORT_PERMISSION_EXIT_CODE="${ALIPAY_AIPAY_PUBLIC_KEY_EXPORT_PERMISSION_EXIT_CODE:-77}"

  write_alipay_public_key "$APP_ID" "$ALIPAY_PUBLIC_KEY"
  WRITE_RC=$?
  if [ "$WRITE_RC" -eq 0 ]; then
    DISPLAY_PATH="${ALIPAY_PUBLIC_KEY_FILE_DISPLAY:-/workspace/projects/${APP_ID}-alipayPublicKey.keytext}"
    emit_control "ALIPAY_PUBLIC_KEY_EXPORT_STATUS=EXPORTED"
    emit_control_field "ALIPAY_PUBLIC_KEY_FILE" "$DISPLAY_PATH" || return 1
    return 0
  fi

  if [ "$WRITE_RC" -eq "$EXPORT_PERMISSION_EXIT_CODE" ]; then
    emit_alipay_public_key_export_retry
    return "$EXPORT_PERMISSION_EXIT_CODE"
  fi

  emit_control "ALIPAY_PUBLIC_KEY_EXPORT_STATUS=MANUAL_CONFIGURATION_REQUIRED"
  return 0
}

ensure_rsa2_application_key_ready() {
  local APP_ID="$1"
  local PUBLIC_KEY="${2:-}"
  local QUERY_RC
  KEY_VERIFY_RESULT=""

  query_security_key "$APP_ID" "$PUBLIC_KEY"
  QUERY_RC=$?
  if [ "$QUERY_RC" -ne 0 ]; then
    if [ "$QUERY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
      KEY_VERIFY_RESULT="LOCAL_FS_PERMISSION"
      return "$QUERY_RC"
    fi
    KEY_VERIFY_RESULT="QUERY_FAILED"
    return 1
  fi

  RSA2_KEY_INFO=$(extract_rsa2_application_key_info)

  if is_rsa2_application_key_ready "$RSA2_KEY_INFO"; then
    KEY_VERIFY_RESULT="CONFIRMED"
    return 0
  fi

  KEY_VERIFY_RESULT="PENDING"
  return 1
}

render_key_pending() {
  printf '%s' '{}' \
    | ALIPAY_AIPAY_RENDERER_MANAGED_CALLER=app.sh node "$RENDERER" application.key.pending --variant DEFAULT
}

export_alipay_public_key_from_security_business() {
  local APP_ID="$1"

  RSA2_KEY_INFO=$(extract_rsa2_application_key_info)
  RSA2_ALIPAY_KEY_INFO=$(extract_rsa2_alipay_key_info)
  ALIPAY_PUBLIC_KEY=$(extract_alipay_public_key "$RSA2_ALIPAY_KEY_INFO")

  if ! is_rsa2_application_key_ready "$RSA2_KEY_INFO"; then
    echo "❌ 应用公钥尚未确认，禁止提交应用审核"
    return 1
  fi

  if [ -z "$ALIPAY_PUBLIC_KEY" ]; then
    echo "❌ 已确认应用公钥生效，但未获取到 RSA2 支付宝公钥，禁止提交应用审核"
    return 1
  fi

  write_and_emit_alipay_public_key_export "$APP_ID" "$ALIPAY_PUBLIC_KEY"
}

verify_key_and_export_alipay_public_key() {
  local APP_ID="$1"
  local QUERY_RC

  query_security_key "$APP_ID"
  QUERY_RC=$?
  [ "$QUERY_RC" -eq 0 ] || return "$QUERY_RC"
  export_alipay_public_key_from_security_business "$APP_ID"
}

query_application_list() {
  local application_type="$1"
  local retry_rc business success error_msg
  REQUEST_JSON=$(jq -n --arg applicationType "$application_type" '{request:{appTypes:[$applicationType]}}') || return 1

  require_alipay_cli_local_state_access_or_emit || return "$?"
  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry RESULT read application_list -- alipay-cli mcp call apprelease.queryApplicationList \
    -d "$REQUEST_JSON" \
    --json
  retry_rc=$?
  if [ "$retry_rc" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    return "$retry_rc"
  fi
  if [ "$retry_rc" -ne 0 ]; then
    echo "❌ 应用列表查询因网络或服务异常在自动重试两次后仍未恢复"
    return 1
  fi

  if ! handle_error "$RESULT" "MCP_AUTHENTICATED_CALL"; then
    return 1
  fi

  business=$(unwrap_mcp "$RESULT")
  success=$(echo "$business" | jq -r '.success // false')

  if [ "$success" != "true" ]; then
    error_msg=$(echo "$business" | jq -r '.error.message // .errorMessage // "未知错误"')
    error_msg=$(sanitize_customer_error_text "$error_msg")
    echo "❌ 查询应用列表失败: $error_msg"
    return 1
  fi

  APPLICATION_LIST=$(echo "$business" | jq -c '
    if (.resultObj | type) == "object" and (.resultObj.applicationList | type) == "array" then
      .resultObj.applicationList
    elif (.resultObj | type) == "array" then
      .resultObj
    else
      null
    end
  ' 2>/dev/null)
  if [ -z "$APPLICATION_LIST" ] || ! echo "$APPLICATION_LIST" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "❌ 应用列表返回结构异常，无法解析应用列表"
    return 1
  fi
}

app_list() {
  parse_app_context_args "$@" || {
    echo "用法: bash app.sh list [--product-type webpay] [--sales-code I1080300001000041203] [--application-type WEBAPP]"
    exit 1
  }
  APP_APPLICATION_TYPE=$(resolve_application_type) || exit 1
  init_app_cli_product || exit 1
  query_application_list "$APP_APPLICATION_TYPE"
  QUERY_RC=$?
  if [ "$QUERY_RC" -ne 0 ]; then
    if [ "$QUERY_RC" -ne "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
      emit_control "FLOW:ERROR"
    fi
    exit "$QUERY_RC"
  fi
  APP_LIST="$APPLICATION_LIST"
  APP_COUNT=$(echo "$APP_LIST" | jq 'length')
  APP_CANDIDATES=$(echo "$APP_LIST" | jq -c '[.[] | {
    appId: ((.appId // "未知") | tostring),
    appName: ((.appName // "未知") | tostring),
    status: ((.status // "未知") | tostring)
  }]')
  ONLINE_APPS=$(echo "$APP_LIST" | jq -r '[.[] | select(.status == "ON_LINE")]')
  ONLINE_COUNT=$(echo "$ONLINE_APPS" | jq 'length')
  ONLINE_COUNT=${ONLINE_COUNT:-0}

  if [ "$ONLINE_COUNT" -gt 0 ] && ! echo "$ONLINE_APPS" | jq -e '
    all(.[];
      ((.appId | type) == "string") and
      (.appId | length > 0) and
      ((.appId | test("[\u0000-\u001f\u007f]") | not))
    )
  ' >/dev/null 2>&1; then
    echo "❌ 应用列表返回结构异常：可复用候选 appId 缺失或包含控制字符"
    emit_control "FLOW:ERROR"
    exit 1
  fi

  if ! printf '%s' "$APP_CANDIDATES" \
    | node "$CANDIDATE_RUNNER" application-candidates --application-type "$APP_APPLICATION_TYPE" >/dev/null 2>&1; then
    echo "❌ 应用候选事实安全校验失败"
    emit_control "FLOW:ERROR"
    exit 1
  fi
  emit_control_field "APP_CANDIDATES_JSON" "$APP_CANDIDATES" || {
    echo "❌ 应用候选事实包含非法控制字符"
    emit_control "FLOW:ERROR"
    exit 1
  }
  emit_control_field "APPLICATION_TYPE" "$APP_APPLICATION_TYPE" || exit 1

  if [ "$APP_COUNT" -eq 0 ]; then
    emit_control "FLOW:CREATE_NEW"
  else
    if [ "$ONLINE_COUNT" -eq 0 ]; then
      emit_control "FLOW:PENDING_APPLICATIONS"
    else
      echo "$ONLINE_APPS" | jq -r '.[] | select((.appId // "") != "") | "APP_CANDIDATE_ID=" + .appId' \
        | while IFS= read -r marker; do emit_control "$marker"; done
      emit_control "FLOW:SELECT"
    fi
  fi
}

app_create() {
  parse_app_context_args "$@" || {
    echo "用法: bash app.sh create [--product-type webpay] [--sales-code I1080300001000041203] [--application-type WEBAPP]"
    exit 1
  }
  APP_APPLICATION_TYPE=$(resolve_application_type) || exit 1
  init_app_cli_product || exit 1
  REQUEST_JSON=$(build_create_application_request) || {
    echo "❌ 创建应用请求参数组装失败"
    exit 1
  }

  require_alipay_cli_local_state_access_or_emit || exit "$?"
  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry RESULT write application_create -- alipay-cli mcp call apprelease.createApplication \
    -d "$REQUEST_JSON" \
    --json
  RETRY_RC=$?
  if [ "$RETRY_RC" -eq 75 ]; then
    echo "❌ 应用创建响应不明；现有应用列表无法把同类型新应用唯一归属于本次创建，结果标记为 UNKNOWN，禁止自动重复创建"
    emit_control "APPLICATION_CREATE_RESULT=UNKNOWN"
    exit 1
  elif [ "$RETRY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    exit "$RETRY_RC"
  elif [ "$RETRY_RC" -ne 0 ]; then
    echo "❌ 应用创建因明确未发送的网络异常在自动重试两次后仍未恢复"
    emit_control "APPLICATION_CREATE_RESULT=FAILED"
    exit 1
  fi

  if ! handle_error "$RESULT" "MCP_AUTHENTICATED_CALL"; then
    emit_control "APPLICATION_CREATE_RESULT=FAILED"
    exit 1
  fi

  BUSINESS=$(unwrap_mcp "$RESULT")
  SUCCESS=$(echo "$BUSINESS" | jq -r '.success // false')

  if [ "$SUCCESS" = "true" ]; then
    APP_ID=$(echo "$BUSINESS" | jq -r '.resultObj.appId // .data.appId // empty')
    if ! validate_control_value "$APP_ID"; then
      echo "❌ 应用创建返回成功，但未解析到 appId，禁止进入公钥设置流程"
      emit_control "APPLICATION_CREATE_RESULT=UNKNOWN"
      exit 1
    fi
    emit_control_field "APPLICATION_TYPE" "$APP_APPLICATION_TYPE" || exit 1
    emit_control_field "APP_ID" "$APP_ID" || exit 1
    emit_control "APPLICATION_CREATE_RESULT=SUCCESS"
  else
    ERROR_MSG=$(echo "$BUSINESS" | jq -r '.error.message // .errorMessage // "未知错误"')
    ERROR_MSG=$(sanitize_customer_error_text "$ERROR_MSG")
    echo "❌ 应用创建失败: $ERROR_MSG"
    emit_control "APPLICATION_CREATE_RESULT=FAILED"
    exit 1
  fi
}

copy_captured_output() {
  local FILE="$1" LINE
  [ -f "$FILE" ] || return 0
  while IFS= read -r LINE || [ -n "$LINE" ]; do
    printf '%s\n' "$LINE"
  done < "$FILE"
}

extract_unique_control_field() {
  local FILE="$1" NAME="$2" PREFIX="ALIPAY_AIPAY_INTERNAL:${2}=" LINE VALUE="" COUNT=0
  while IFS= read -r LINE || [ -n "$LINE" ]; do
    case "$LINE" in
      "$PREFIX"*)
        COUNT=$((COUNT + 1))
        VALUE="${LINE#"$PREFIX"}"
        ;;
    esac
  done < "$FILE"
  [ "$COUNT" -eq 1 ] && validate_control_value "$VALUE" || return 1
  printf '%s' "$VALUE"
}

load_child_recovery_marker() {
  local FILE="$1" LINE MARKER="" RECOVERY_COUNT=0 PREFIX_COUNT=0
  CHILD_RECOVERY_MARKER=""
  while IFS= read -r LINE || [ -n "$LINE" ]; do
    case "$LINE" in
      "ALIPAY_AIPAY_INTERNAL:CLI_FLOW:"*|"ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:"*)
        PREFIX_COUNT=$((PREFIX_COUNT + 1))
        ;;
    esac
    case "$LINE" in
      "ALIPAY_AIPAY_INTERNAL:CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:AUTH_REQUIRED"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:SCOPE_MISMATCH"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:MCC_MISMATCH"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:RETRY_WITH_NETWORK"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:LOGOUT_STILL_LOGGED_IN"|\
      "ALIPAY_AIPAY_INTERNAL:AUTH_FLOW:FAILED")
        RECOVERY_COUNT=$((RECOVERY_COUNT + 1))
        MARKER="${LINE#ALIPAY_AIPAY_INTERNAL:}"
        ;;
    esac
  done < "$FILE"
  [ "$PREFIX_COUNT" -eq "$RECOVERY_COUNT" ] && [ "$RECOVERY_COUNT" -le 1 ] || return 1
  CHILD_RECOVERY_MARKER="$MARKER"
}

emit_unique_child_recovery_marker() {
  load_child_recovery_marker "$1" || return 1
  [ -n "$CHILD_RECOVERY_MARKER" ] || return 1
  emit_control "$CHILD_RECOVERY_MARKER"
}

captured_line_count() {
  local FILE="$1" EXPECTED="$2" LINE COUNT=0
  while IFS= read -r LINE || [ -n "$LINE" ]; do
    [ "$LINE" = "$EXPECTED" ] && COUNT=$((COUNT + 1))
  done < "$FILE"
  printf '%s' "$COUNT"
}

forward_write_child_outcome() {
  local KIND="$1" STDOUT_FILE="$2" STDERR_FILE="$3" CHILD_RC="$4" EXPECTED_TYPE="${5:-}" ALLOW_SIGNAL="${6:-false}"
  local FIELD SUCCESS RESULT CHILD_APPLICATION_TYPE READY_COUNT MESSAGE_COUNT
  case "$KIND" in
    create) FIELD=APPLICATION_CREATE_RESULT; SUCCESS=SUCCESS; FORWARDED_APP_ID="" ;;
    key) FIELD=KEY_PAGE_RESULT; SUCCESS=READY_TO_OPEN ;;
    *) return 1 ;;
  esac
  if ! load_child_recovery_marker "$STDERR_FILE"; then
    emit_control "$FIELD=UNKNOWN"
    return 1
  fi
  RESULT=$(extract_unique_control_field "$STDERR_FILE" "$FIELD" 2>/dev/null || true)
  if [ -n "$CHILD_RECOVERY_MARKER" ]; then
    if [ "$CHILD_RC" -eq 0 ]; then
      emit_control "$FIELD=UNKNOWN"
    else
      case "$CHILD_RECOVERY_MARKER:$RESULT" in
        CLI_FLOW:RETRY_WITH_LOCAL_FS_PERMISSION:) emit_control "$CHILD_RECOVERY_MARKER" ;;
        AUTH_FLOW:*:FAILED) emit_control "$FIELD=FAILED"; emit_control "$CHILD_RECOVERY_MARKER" ;;
        AUTH_FLOW:*:UNKNOWN|AUTH_FLOW:*:) emit_control "$FIELD=UNKNOWN"; emit_control "$CHILD_RECOVERY_MARKER" ;;
        *) emit_control "$FIELD=UNKNOWN" ;;
      esac
    fi
    return 1
  fi
  if [ "$RESULT" = FAILED ]; then
    if [ "$CHILD_RC" -eq 0 ]; then
      emit_control "$FIELD=UNKNOWN"
    else
      MESSAGE_COUNT=$(captured_line_count "$STDERR_FILE" "ALIPAY_AIPAY_INTERNAL:CHILD_CUSTOMER_MESSAGE_RENDERED")
      [ "$MESSAGE_COUNT" -ne 1 ] || copy_captured_output "$STDOUT_FILE"
      emit_control "$FIELD=FAILED"
    fi
    return 1
  fi
  if [ "$RESULT" != "$SUCCESS" ] || { [ "$CHILD_RC" -ne 0 ] && [ "$ALLOW_SIGNAL" != true ]; }; then
    emit_control "$FIELD=UNKNOWN"
    return 1
  fi
  if [ "$KIND" = create ]; then
    FORWARDED_APP_ID=$(extract_unique_control_field "$STDERR_FILE" APP_ID 2>/dev/null || true)
    CHILD_APPLICATION_TYPE=$(extract_unique_control_field "$STDERR_FILE" APPLICATION_TYPE 2>/dev/null || true)
    if [ -s "$STDOUT_FILE" ] || ! validate_control_value "$FORWARDED_APP_ID" || [ "$CHILD_APPLICATION_TYPE" != "$EXPECTED_TYPE" ]; then
      emit_control "$FIELD=UNKNOWN"
      return 1
    fi
    emit_control_field APPLICATION_TYPE "$CHILD_APPLICATION_TYPE" || return 1
    emit_control_field APP_ID "$FORWARDED_APP_ID" || return 1
    emit_control "$FIELD=SUCCESS"
    return 0
  fi
  READY_COUNT=$(captured_line_count "$STDERR_FILE" "ALIPAY_AIPAY_INTERNAL:KEY_PAGE:READY_TO_OPEN")
  MESSAGE_COUNT=$(captured_line_count "$STDERR_FILE" "ALIPAY_AIPAY_INTERNAL:CHILD_CUSTOMER_MESSAGE_RENDERED")
  if [ ! -s "$STDOUT_FILE" ] || [ "$READY_COUNT" -ne 1 ] || [ "$MESSAGE_COUNT" -ne 1 ]; then
    emit_control "$FIELD=UNKNOWN"
    return 1
  fi
  copy_captured_output "$STDOUT_FILE"
  emit_control "$FIELD=READY_TO_OPEN"
  emit_control "KEY_PAGE:READY_TO_OPEN"
}

fail_application_combination() {
  emit_control "APPLICATION_COMBINATION_RESULT=$1"
  exit 1
}

handle_create_from_snapshot_signal() {
  local EXIT_CODE="$1"
  trap - INT TERM
  case "${COMBINATION_PHASE:-}" in
    PRE_WRITE|LIST|RECHECK) emit_control "APPLICATION_COMBINATION_RESULT=PREWRITE_FAILED" ;;
    CREATE) forward_write_child_outcome create "$CHILD_STDOUT" "$CHILD_STDERR" "$EXIT_CODE" "$APP_APPLICATION_TYPE" true || true ;;
    KEY_NOT_STARTED) emit_control "APPLICATION_COMBINATION_RESULT=KEY_NOT_STARTED" ;;
    KEY) forward_write_child_outcome key "$CHILD_STDOUT" "$CHILD_STDERR" "$EXIT_CODE" "" true || true ;;
  esac
  exit "$EXIT_CODE"
}

# Guarded list -> compare -> create -> key orchestration.
app_create_from_snapshot() {
  local PREVIOUS_CANDIDATES_JSON="" PREVIOUS_CANDIDATES_SET=false PUBLIC_KEY="" PUBLIC_KEY_SET=false
  local PRODUCT_TYPE_SET=false SALES_CODE_SET=false
  local ARG VALUE APP_APPLICATION_TYPE CHILD_RC RECHECK_RESULT RECHECK_MESSAGE APP_ID
  local TMP_ROOT CHILD_STDOUT CHILD_STDERR
  local COMBINATION_PHASE="PRE_WRITE"
  local -a CONTEXT_ARGS=()

  while [ "$#" -gt 0 ]; do
    ARG="$1"
    case "$ARG" in
      --previous-candidates-json)
        [ "$#" -ge 2 ] || fail_application_combination CONTRACT_ERROR
        [ "$PREVIOUS_CANDIDATES_SET" = false ] || fail_application_combination CONTRACT_ERROR
        PREVIOUS_CANDIDATES_SET=true
        PREVIOUS_CANDIDATES_JSON="$2"
        shift 2
        ;;
      --public-key)
        [ "$#" -ge 2 ] || fail_application_combination CONTRACT_ERROR
        [ "$PUBLIC_KEY_SET" = false ] || fail_application_combination CONTRACT_ERROR
        PUBLIC_KEY_SET=true
        PUBLIC_KEY="$2"
        shift 2
        ;;
      --product-type|--sales-code|--application-type)
        [ "$#" -ge 2 ] || fail_application_combination CONTRACT_ERROR
        [ "$ARG" = "--product-type" ] && PRODUCT_TYPE_SET=true
        [ "$ARG" = "--sales-code" ] && SALES_CODE_SET=true
        VALUE="$2"
        CONTEXT_ARGS+=("$ARG" "$VALUE")
        shift 2
        ;;
      *)
        fail_application_combination CONTRACT_ERROR
        ;;
    esac
  done

  [ -n "$PREVIOUS_CANDIDATES_JSON" ] \
    && printf '%s' "$PREVIOUS_CANDIDATES_JSON" | jq -e 'type == "array"' >/dev/null 2>&1 \
    || fail_application_combination SNAPSHOT_REFRESH_REQUIRED
  [ "$PUBLIC_KEY_SET" = true ] && [ -n "$PUBLIC_KEY" ] || fail_application_combination CONTRACT_ERROR

  parse_app_context_args "${CONTEXT_ARGS[@]}" >/dev/null 2>&1 \
    || fail_application_combination CONTRACT_ERROR
  [ "$PRODUCT_TYPE_SET" = true ] && [ "$SALES_CODE_SET" = true ] \
    || fail_application_combination CONTRACT_ERROR
  APP_APPLICATION_TYPE=$(resolve_application_type 2>/dev/null) \
    || fail_application_combination CONTRACT_ERROR
  node "$CANDIDATE_RUNNER" application-candidates \
    --application-type "$APP_APPLICATION_TYPE" \
    --candidates-json "$PREVIOUS_CANDIDATES_JSON" >/dev/null 2>&1 \
    || fail_application_combination SNAPSHOT_REFRESH_REQUIRED

  command -v mktemp >/dev/null 2>&1 || fail_application_combination PREWRITE_FAILED
  TMP_ROOT=$(umask 077; mktemp -d "${TMPDIR:-/tmp}/alipay-aipay-app-create.XXXXXX") \
    || fail_application_combination PREWRITE_FAILED
  CHILD_STDOUT="$TMP_ROOT/child.stdout"
  CHILD_STDERR="$TMP_ROOT/child.stderr"
  (umask 077; : > "$CHILD_STDOUT"; : > "$CHILD_STDERR") \
    || { rm -rf "$TMP_ROOT"; fail_application_combination PREWRITE_FAILED; }
  trap 'handle_create_from_snapshot_signal 130' INT
  trap 'handle_create_from_snapshot_signal 143' TERM
  trap 'rm -rf "$TMP_ROOT"' EXIT

  COMBINATION_PHASE="LIST"
  ALIPAY_AIPAY_SUPPRESS_AUTH_LOGOUT=1 bash "${SCRIPT_DIR}/app.sh" list \
    --product-type "$PRODUCT_TYPE" \
    --sales-code "$SALES_CODE" \
    --application-type "$APP_APPLICATION_TYPE" \
    >"$CHILD_STDOUT" 2>"$CHILD_STDERR"
  CHILD_RC=$?
  load_child_recovery_marker "$CHILD_STDERR" || fail_application_combination PREWRITE_FAILED
  if [ -n "$CHILD_RECOVERY_MARKER" ]; then
    [ "$CHILD_RC" -eq 0 ] || { emit_control "$CHILD_RECOVERY_MARKER"; exit "$CHILD_RC"; }
    fail_application_combination PREWRITE_FAILED
  fi
  [ "$CHILD_RC" -eq 0 ] && [ ! -s "$CHILD_STDOUT" ] || fail_application_combination PREWRITE_FAILED
  APP_CANDIDATES=$(extract_unique_control_field "$CHILD_STDERR" APP_CANDIDATES_JSON) \
    || fail_application_combination PREWRITE_FAILED
  CURRENT_APPLICATION_TYPE=$(extract_unique_control_field "$CHILD_STDERR" APPLICATION_TYPE) \
    || fail_application_combination PREWRITE_FAILED
  [ "$CURRENT_APPLICATION_TYPE" = "$APP_APPLICATION_TYPE" ] || fail_application_combination PREWRITE_FAILED

  COMBINATION_PHASE="RECHECK"
  : > "$CHILD_STDOUT"; : > "$CHILD_STDERR"
  node "$CANDIDATE_RUNNER" application-recheck \
    --application-type "$APP_APPLICATION_TYPE" \
    --previous-candidates-json "$PREVIOUS_CANDIDATES_JSON" \
    --current-candidates-json "$APP_CANDIDATES" \
    >"$CHILD_STDOUT" 2>"$CHILD_STDERR"
  CHILD_RC=$?
  [ "$CHILD_RC" -eq 0 ] || fail_application_combination PREWRITE_FAILED
  RECHECK_RESULT=$(extract_unique_control_field "$CHILD_STDERR" APPLICATION_RECHECK_RESULT) \
    || fail_application_combination PREWRITE_FAILED
  case "$RECHECK_RESULT" in
    CHANGED_EMPTY|CHANGED_NONEMPTY)
      RECHECK_MESSAGE=$(extract_unique_control_field "$CHILD_STDERR" APPLICATION_RECHECK_MESSAGE) \
        || fail_application_combination PREWRITE_FAILED
      [ "$RECHECK_MESSAGE" = READY ] || fail_application_combination PREWRITE_FAILED
      emit_control_field "APP_CANDIDATES_JSON" "$APP_CANDIDATES" || exit 1
      emit_control_field "APPLICATION_TYPE" "$APP_APPLICATION_TYPE" || exit 1
      [ -s "$CHILD_STDOUT" ] || fail_application_combination PREWRITE_FAILED
      copy_captured_output "$CHILD_STDOUT"
      [ "$RECHECK_RESULT" != CHANGED_NONEMPTY ] || emit_control "CUSTOMER_MESSAGE_DELIVERY_REQUIRED=application.candidate.select"
      emit_control "APPLICATION_RECHECK_RESULT=$RECHECK_RESULT"
      exit 0
      ;;
    UNCHANGED) [ ! -s "$CHILD_STDOUT" ] || fail_application_combination PREWRITE_FAILED
      emit_control "APPLICATION_RECHECK_RESULT=UNCHANGED" ;;
    *) fail_application_combination PREWRITE_FAILED ;;
  esac

  COMBINATION_PHASE="CREATE"
  : > "$CHILD_STDOUT"; : > "$CHILD_STDERR"
  ALIPAY_AIPAY_SUPPRESS_AUTH_LOGOUT=1 ALIPAY_AIPAY_CAPTURE_CHILD_OUTPUT=1 bash "${SCRIPT_DIR}/app.sh" create "${CONTEXT_ARGS[@]}" \
    >"$CHILD_STDOUT" 2>"$CHILD_STDERR"
  CHILD_RC=$?
  forward_write_child_outcome create "$CHILD_STDOUT" "$CHILD_STDERR" "$CHILD_RC" "$APP_APPLICATION_TYPE"
  if [ "$?" -ne 0 ]; then
    [ "$CHILD_RC" -ne 0 ] && exit "$CHILD_RC"
    exit 1
  fi
  APP_ID="$FORWARDED_APP_ID"
  COMBINATION_PHASE="KEY_NOT_STARTED"
  : > "$CHILD_STDOUT"; : > "$CHILD_STDERR"
  COMBINATION_PHASE="KEY"
  ALIPAY_AIPAY_SUPPRESS_AUTH_LOGOUT=1 ALIPAY_AIPAY_CAPTURE_CHILD_OUTPUT=1 bash "${SCRIPT_DIR}/app.sh" key \
    --product-type "$PRODUCT_TYPE" "$APP_ID" "$PUBLIC_KEY" >"$CHILD_STDOUT" 2>"$CHILD_STDERR"
  CHILD_RC=$?
  forward_write_child_outcome key "$CHILD_STDOUT" "$CHILD_STDERR" "$CHILD_RC"
  if [ "$?" -ne 0 ]; then
    [ "$CHILD_RC" -ne 0 ] && exit "$CHILD_RC"
    exit 1
  fi
  COMBINATION_PHASE="COMPLETE"
  exit 0
}

app_key() {
  prepare_positional_app_cli_context "$@" || exit 1
  set -- "${APP_POSITIONAL_ARGS[@]}"
  if [ "$#" -ne 2 ] || [[ "${1:-}" == --* ]]; then
    echo "❌ 参数格式错误：key 使用位置参数 <appId> <publicKey>"
    echo "用法: bash app.sh key --product-type webpay <appId> <publicKey>"
    exit 1
  fi

  APP_ID="$1"
  PUBLIC_KEY="$2"

  if [ -z "$APP_ID" ] || [ -z "$PUBLIC_KEY" ]; then
    echo "❌ 请提供 appId 和 publicKey"
    echo "用法: bash app.sh key --product-type webpay <appId> <publicKey>"
    exit 1
  fi
  if ! validate_control_value "$APP_ID"; then
    echo "❌ appId 包含非法控制字符"
    exit 1
  fi

  REQUEST_JSON=$(jq -n \
    --arg appId "$APP_ID" \
    --arg publicKey "$PUBLIC_KEY" \
    '{request:{appId:$appId,signType:"RSA2",publicKey:$publicKey}}')

  require_alipay_cli_local_state_access_or_emit || exit "$?"
  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry RESULT write application_key_confirm_page -- alipay-cli mcp call apprelease.createKeyConfirmPage \
    -d "$REQUEST_JSON" \
    --json
  RETRY_RC=$?
  if [ "$RETRY_RC" -eq 75 ]; then
    echo "❌ 公钥确认页生成响应不明，结果标记为 UNKNOWN；不得自动生成第二个页面"
    emit_control "KEY_PAGE_RESULT=UNKNOWN"
    exit 1
  elif [ "$RETRY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    exit "$RETRY_RC"
  elif [ "$RETRY_RC" -ne 0 ]; then
    echo "❌ 公钥确认页因明确未发送的网络异常在自动重试两次后仍未恢复"
    emit_control "KEY_PAGE_RESULT=FAILED"
    exit 1
  fi

  if ! handle_error "$RESULT" "MCP_AUTHENTICATED_CALL"; then
    emit_control "KEY_PAGE_RESULT=FAILED"
    exit 1
  fi

  BUSINESS=$(unwrap_mcp "$RESULT")
  SUCCESS=$(echo "$BUSINESS" | jq -r '.success // false')

  if [ "$SUCCESS" = "true" ]; then
    CONFIRM_PAGE_URL=$(echo "$BUSINESS" | jq -r '.resultObj.confirmPageUrl // empty')

    if [ -n "$CONFIRM_PAGE_URL" ]; then
      RENDERER="${SCRIPT_DIR}/../../../normal/scripts/render_customer_message.mjs"
      MESSAGE_INPUT=$(printf '%s\n' "$APP_ID" "$CONFIRM_PAGE_URL" | jq -Rs '
        split("\n") as $v | {appId:$v[0],officialUrl:$v[1]}
      ')
      if ! printf '%s' "$MESSAGE_INPUT" | ALIPAY_AIPAY_RENDERER_MANAGED_CALLER=app.sh node "$RENDERER" application.key.page --variant READY; then
        echo "❌ 公钥确认页已生成，但标准消息无法安全输出；结果保持待核验，禁止自动生成第二个页面"
        emit_control "KEY_PAGE_RESULT=UNKNOWN"
        exit 1
      fi
      [ "${ALIPAY_AIPAY_CAPTURE_CHILD_OUTPUT:-0}" != "1" ] || emit_control "CHILD_CUSTOMER_MESSAGE_RENDERED"
      emit_control "KEY_PAGE_RESULT=READY_TO_OPEN"
      emit_control "KEY_PAGE:READY_TO_OPEN"
    else
      echo "❌ 公钥确认页响应缺少 confirmPageUrl，结果标记为 UNKNOWN；不得自动生成第二个页面"
      emit_control "KEY_PAGE_RESULT=UNKNOWN"
      exit 1
    fi
  else
    ERROR_MSG=$(echo "$BUSINESS" | jq -r '.error.message // .errorMessage // "未知错误"')
    ERROR_MSG=$(sanitize_customer_error_text "$ERROR_MSG")
    echo "❌ 公钥设置失败: $ERROR_MSG"
    emit_control "KEY_PAGE_RESULT=FAILED"
    exit 1
  fi
}

app_reconcile_key() {
  local RECONCILE_STDERR QUERY_RC
  prepare_positional_app_cli_context "$@" >/dev/null 2>&1 || {
    emit_control "KEY_PAGE_RECONCILIATION=CONTRACT_ERROR"
    exit 1
  }
  set -- "${APP_POSITIONAL_ARGS[@]}"
  if [ "$#" -ne 2 ] || [[ "${1:-}" == --* ]] || ! validate_control_value "${1:-}" || [ -z "${2:-}" ]; then
    emit_control "KEY_PAGE_RECONCILIATION=CONTRACT_ERROR"
    exit 1
  fi

  APP_ID="$1"
  PUBLIC_KEY="$2"
  RECONCILE_STDERR=$(mktemp "${TMPDIR:-/tmp}/alipay-aipay-key-reconcile.XXXXXX") || {
    emit_control "KEY_PAGE_RECONCILIATION=QUERY_FAILED"
    exit 1
  }
  chmod 600 "$RECONCILE_STDERR" 2>/dev/null || {
    rm -f "$RECONCILE_STDERR"
    emit_control "KEY_PAGE_RECONCILIATION=QUERY_FAILED"
    exit 1
  }
  ALIPAY_AIPAY_SUPPRESS_AUTH_LOGOUT=1 query_security_key "$APP_ID" "$PUBLIC_KEY" \
    >/dev/null 2>"$RECONCILE_STDERR"
  QUERY_RC=$?
  if [ "$QUERY_RC" -ne 0 ]; then
    if emit_unique_child_recovery_marker "$RECONCILE_STDERR"; then
      rm -f "$RECONCILE_STDERR"
      exit "$QUERY_RC"
    fi
    rm -f "$RECONCILE_STDERR"
    emit_control "KEY_PAGE_RECONCILIATION=QUERY_FAILED"
    exit 1
  fi
  rm -f "$RECONCILE_STDERR"
  RSA2_KEY_INFO=$(extract_rsa2_application_key_info)
  if is_rsa2_application_key_ready "$RSA2_KEY_INFO"; then
    emit_control_field "APP_ID" "$APP_ID" || exit 1
    emit_control "KEY_PAGE_RECONCILIATION=CONFIRMED"
  else
    emit_control "KEY_PAGE_RECONCILIATION=NOT_CONFIRMED"
  fi
}

submit_application_audit() {
  local APP_ID="$1"
  REQUEST_JSON=$(jq -n --arg appId "$APP_ID" '{request:{appId:$appId}}')

  require_alipay_cli_local_state_access_or_emit || exit "$?"
  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry RESULT write application_audit -- alipay-cli mcp call apprelease.submitApplicationAudit \
    -d "$REQUEST_JSON" \
    --json
  RETRY_RC=$?
  if [ "$RETRY_RC" -eq 75 ]; then
    if ALIPAY_AIPAY_SUPPRESS_LOCAL_FS_RETRY_MARKER=1 query_application_info "$APP_ID"; then
      ACTUAL_STATUS=$(extract_application_status)
      case "$ACTUAL_STATUS" in
        AUDITING|ON_LINE)
          emit_control "✅ 应用审核提交已由应用信息查询核验成功"
          emit_control_field "APP_ID" "$APP_ID" || return 1
          emit_control "APPLICATION_AUDIT_RESULT=SUBMITTED"
          emit_control "FLOW:AUDIT_SUBMITTED"
          return 0
          ;;
      esac
    fi
    echo "❌ 应用提审响应不明且现有状态无法排除传播延迟，结果标记为 UNKNOWN，禁止自动重复提审"
    emit_control "APPLICATION_AUDIT_RESULT=UNKNOWN"
    exit 1
  elif [ "$RETRY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    exit "$RETRY_RC"
  elif [ "$RETRY_RC" -ne 0 ]; then
    echo "❌ 应用提审因明确未发送的网络异常在自动重试两次后仍未恢复"
    emit_control "APPLICATION_AUDIT_RESULT=FAILED"
    exit 1
  fi

  if ! handle_error "$RESULT" "MCP_AUTHENTICATED_CALL"; then
    emit_control "APPLICATION_AUDIT_RESULT=FAILED"
    exit 1
  fi

  BUSINESS=$(unwrap_mcp "$RESULT")
  SUCCESS=$(echo "$BUSINESS" | jq -r '.success // false')

  if [ "$SUCCESS" = "true" ]; then
    emit_control "✅ 应用审核提交成功"
    emit_control_field "APP_ID" "$APP_ID" || return 1
    emit_control "APPLICATION_AUDIT_RESULT=SUBMITTED"
    emit_control "FLOW:AUDIT_SUBMITTED"
  else
    ERROR_MSG=$(echo "$BUSINESS" | jq -r '.error.message // .errorMessage // "未知错误"')
    ERROR_MSG=$(sanitize_customer_error_text "$ERROR_MSG")
    echo "❌ 提交审核失败: $ERROR_MSG"
    emit_control "APPLICATION_AUDIT_RESULT=FAILED"
    exit 1
  fi
}

app_audit() {
  prepare_positional_app_cli_context "$@" || exit 1
  set -- "${APP_POSITIONAL_ARGS[@]}"
  if [ "$#" -ne 1 ] || [[ "${1:-}" == --* ]]; then
    echo "❌ 参数格式错误：audit 使用位置参数 <appId>，不支持 --app-id 等未定义选项"
    echo "用法: bash app.sh audit --product-type webpay <appId>"
    exit 1
  fi

  APP_ID="$1"
  [ -n "$APP_ID" ] || { echo "❌ 请提供 appId"; echo "用法: bash app.sh audit --product-type webpay <appId>"; exit 1; }
  validate_control_value "$APP_ID" || { echo "❌ appId 包含非法控制字符"; exit 1; }
  verify_key_and_export_alipay_public_key "$APP_ID"
  EXPORT_RC=$?
  [ "$EXPORT_RC" -eq 0 ] || exit "$EXPORT_RC"
  submit_application_audit "$APP_ID"
}

app_verify_key() {
  prepare_positional_app_cli_context "$@" || exit 1
  set -- "${APP_POSITIONAL_ARGS[@]}"
  if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || [[ "${1:-}" == --* ]]; then
    echo "❌ 参数格式错误：verify-key 使用位置参数 <appId> [publicKey]，不支持 --app-id 等未定义选项"
    echo "用法: bash app.sh verify-key --product-type webpay <appId> [publicKey]"
    exit 1
  fi

  APP_ID="$1"
  PUBLIC_KEY="${2:-}"

  if [ -z "$APP_ID" ]; then
    echo "❌ 请提供 appId"
    echo "用法: bash app.sh verify-key --product-type webpay <appId> [publicKey]"
    exit 1
  fi
  validate_control_value "$APP_ID" || { echo "❌ appId 包含非法控制字符"; exit 1; }

  ensure_rsa2_application_key_ready "$APP_ID" "$PUBLIC_KEY"
  VERIFY_RC=$?
  if [ "$VERIFY_RC" -eq 0 ]; then
    export_alipay_public_key_from_security_business "$APP_ID"
    EXPORT_RC=$?
    [ "$EXPORT_RC" -eq 0 ] || exit "$EXPORT_RC"
    emit_control "✅ 应用公钥已确认"
    emit_control_field "APP_ID" "$APP_ID" || exit 1
    emit_control "FLOW:KEY_CONFIRMED"
  else
    if [ "$KEY_VERIFY_RESULT" = "LOCAL_FS_PERMISSION" ]; then
      exit "$VERIFY_RC"
    elif [ "$KEY_VERIFY_RESULT" = "PENDING" ]; then
      if ! render_key_pending; then
        emit_control "FLOW:ERROR"
        exit 1
      fi
      emit_control "FLOW:KEY_NOT_CONFIRMED"
    else
      emit_control "FLOW:ERROR"
    fi
    exit 1
  fi
}

app_verify_key_and_audit() {
  prepare_positional_app_cli_context "$@" || exit 1
  set -- "${APP_POSITIONAL_ARGS[@]}"
  if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || [[ "${1:-}" == --* ]]; then
    echo "❌ 参数格式错误：verify-key-and-audit 使用位置参数 <appId> [publicKey]，不支持 --app-id 等未定义选项"
    echo "用法: bash app.sh verify-key-and-audit --product-type webpay <appId> [publicKey]"
    exit 1
  fi

  APP_ID="$1"
  PUBLIC_KEY="${2:-}"
  [ -n "$APP_ID" ] || { echo "❌ 请提供 appId"; exit 1; }
  validate_control_value "$APP_ID" || { echo "❌ appId 包含非法控制字符"; exit 1; }

  ensure_rsa2_application_key_ready "$APP_ID" "$PUBLIC_KEY"
  VERIFY_RC=$?
  if [ "$VERIFY_RC" -ne 0 ]; then
    if [ "$KEY_VERIFY_RESULT" = "LOCAL_FS_PERMISSION" ]; then
      exit "$VERIFY_RC"
    elif [ "$KEY_VERIFY_RESULT" = "PENDING" ]; then
      if ! render_key_pending; then
        emit_control "FLOW:ERROR"
        exit 1
      fi
      emit_control "FLOW:KEY_NOT_CONFIRMED"
    else
      emit_control "FLOW:ERROR"
    fi
    exit 1
  fi
  export_alipay_public_key_from_security_business "$APP_ID"
  EXPORT_RC=$?
  [ "$EXPORT_RC" -eq 0 ] || exit "$EXPORT_RC"
  submit_application_audit "$APP_ID"
}

app_reuse() {
  prepare_positional_app_cli_context "$@" || exit 1
  set -- "${APP_POSITIONAL_ARGS[@]}"
  if [ "$#" -ne 1 ] || [[ "${1:-}" == --* ]]; then
    echo "❌ 参数格式错误：reuse 使用位置参数 <appId>，不支持 --app-id 等未定义选项"
    echo "用法: bash app.sh reuse --product-type webpay <appId>"
    exit 1
  fi

  APP_ID="$1"

  if [ -z "$APP_ID" ]; then
    echo "❌ 请提供 appId"
    echo "用法: bash app.sh reuse --product-type webpay <appId>"
    exit 1
  fi
  validate_control_value "$APP_ID" || { echo "❌ appId 包含非法控制字符"; exit 1; }

  query_application_list "WEBAPP"
  QUERY_RC=$?
  if [ "$QUERY_RC" -ne 0 ]; then
    if [ "$QUERY_RC" -ne "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
      emit_control "FLOW:ERROR"
    fi
    exit "$QUERY_RC"
  fi
  if ! printf '%s' "$APPLICATION_LIST" | jq -e --arg appId "$APP_ID" '
    [.[] | select(.appId == $appId and .status == "ON_LINE")] | length == 1
  ' >/dev/null 2>&1; then
    echo "❌ 当前 appId 不属于最新 WEBAPP 已上线候选，请重新查询并从当前候选中选择"
    emit_control "FLOW:ERROR"
    exit 1
  fi

  query_application_info "$APP_ID"
  QUERY_RC=$?
  if [ "$QUERY_RC" -eq 0 ]; then
    APP_STATUS=$(extract_application_status)
    if [ "$APP_STATUS" != "ON_LINE" ]; then
      echo "❌ 仅允许复用 ON_LINE（已上线）应用，当前应用状态: ${APP_STATUS:-未知}"
      emit_control "FLOW:ERROR"
      exit 1
    fi
  else
    if [ "$QUERY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
      exit "$QUERY_RC"
    fi
    emit_control "FLOW:ERROR"
    exit 1
  fi

  query_security_key "$APP_ID"
  QUERY_RC=$?
  if [ "$QUERY_RC" -eq 0 ]; then
    RSA2_KEY_INFO=$(extract_rsa2_application_key_info)
    RSA2_ALIPAY_KEY_INFO=$(extract_rsa2_alipay_key_info)
    ALIPAY_PUBLIC_KEY=$(extract_alipay_public_key "$RSA2_ALIPAY_KEY_INFO")

    if ! is_rsa2_application_key_ready "$RSA2_KEY_INFO"; then
      emit_control "⚠️ 未确认到已生效的 RSA2 应用公钥"
      emit_control "FLOW:REUSE_NO_KEY"
      exit 1
    elif [ -n "$ALIPAY_PUBLIC_KEY" ]; then
      write_and_emit_alipay_public_key_export "$APP_ID" "$ALIPAY_PUBLIC_KEY"
      EXPORT_RC=$?
      [ "$EXPORT_RC" -eq 0 ] || exit "$EXPORT_RC"
      emit_control_field "APP_ID" "$APP_ID" || exit 1
      emit_control "FLOW:REUSE_SUCCESS"
    else
      echo "❌ 已确认应用公钥生效，但未获取到 RSA2 支付宝公钥"
      emit_control "FLOW:ERROR"
      exit 1
    fi
  else
    if [ "$QUERY_RC" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
      exit "$QUERY_RC"
    fi
    emit_control "FLOW:ERROR"
    exit 1
  fi
}

APP_COMMAND="${1:-}"
case "$APP_COMMAND" in
  list|create|create-from-snapshot|key|reconcile-key|verify-key|verify-key-and-audit|audit|reuse)
    require_command alipay-cli || exit 1
    ;;
esac

case "$APP_COMMAND" in
  list)
    shift
    app_list "$@"
    ;;
  create)
    shift
    app_create "$@"
    ;;
  create-from-snapshot)
    shift
    app_create_from_snapshot "$@"
    ;;
  key)
    shift
    app_key "$@"
    ;;
  reconcile-key)
    shift
    app_reconcile_key "$@"
    ;;
  verify-key)
    shift
    app_verify_key "$@"
    ;;
  verify-key-and-audit)
    shift
    app_verify_key_and_audit "$@"
    ;;
  audit)
    shift
    app_audit "$@"
    ;;
  reuse)
    shift
    app_reuse "$@"
    ;;
  *)
    echo "用法: bash app.sh <list|create|create-from-snapshot|key|reconcile-key|verify-key|verify-key-and-audit|audit|reuse> [参数...]"
    exit 1
    ;;
esac
