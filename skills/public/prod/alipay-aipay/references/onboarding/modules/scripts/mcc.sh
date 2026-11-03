#!/bin/bash
#=============================================================================
# 脚本名称: mcc.sh
# 功能描述: 查询 AI 网页应用收款支持的 MCC 经营类目并托管 MCC 匹配与方案展示
# 调用位置: 步骤 1 方案规划
# 用法:
#   bash mcc.sh resolve-plan --query <经营描述|MCC编码> --product-type webpay [--semantic-terms-json <JSON数组>] [--select <MCC编码> --selection-receipt <receipt>]
#=============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SCRIPT_DIR}/error_handler.sh" ]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/error_handler.sh"
else
  echo "❌ 缺少错误处理脚本: ${SCRIPT_DIR}/error_handler.sh"
  exit 1
fi
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/network_retry.sh"

ONBOARDING_RUNNER="${SCRIPT_DIR}/../../../normal/scripts/onboarding_message_runner.mjs"

require_command jq || exit 1
require_command node || exit 1
require_command alipay-cli || exit 1
require_command mktemp || exit 1

product_sales_code() {
  case "$1" in
    webpay) printf 'I1080300001000041203' ;;
    *) return 1 ;;
  esac
}

extract_business_json() {
  local raw="$1" business
  business=$(unwrap_mcp "$raw")
  printf '%s' "$business" | jq -ce 'select(type == "object")' 2>/dev/null
}

capture_or_exit() {
  local __result_var="$1" output rc
  shift
  output=$("$@")
  rc=$?
  if [ "$rc" -ne 0 ]; then
    [ -z "$output" ] || printf '%s\n' "$output"
    exit "$rc"
  fi
  printf -v "$__result_var" '%s' "$output"
}

network_failure() {
  echo "❌ MCC 经营类目查询因网络或服务异常在自动重试两次后仍未恢复"
  emit_control "MCC_FLOW:RETRY_WITH_NETWORK"
  exit 1
}

mcc_query_failed() {
  local reason="${1:-generic}"
  case "$reason" in
    auth)
      echo "❌ MCC 查询被认证状态阻断：请先完成 alipay-cli 登录后再重试。"
      ;;
    cli_parse)
      echo "❌ MCC 查询返回内容无法唯一解析为 JSON：请检查 alipay-cli 输出是否夹杂日志或返回结构是否变化。"
      ;;
    tree_shape)
      echo "❌ MCC 查询返回结构不完整：缺少 success 或 resultObj.childrenNodes，请检查 ar-support.queryMcc 返回结构是否变化。"
      ;;
    tree_nodes)
      echo "❌ MCC 查询返回的类目树节点字段不符合预期：请检查 code/name/description/needSpecialQual/childrenNodes 是否变更。"
      ;;
    tree_empty)
      echo "❌ MCC 查询返回空类目树：请检查查询条件或上游服务返回。"
      ;;
    detail_shape)
      echo "❌ MCC 详情查询返回结构不完整：缺少 success 或 mccDetails，请检查 mccsearchservice.batchQueryMcc 返回结构是否变化。"
      ;;
    detail_empty)
      echo "❌ MCC 详情查询结果为空：请检查 mccCodes 是否有效。"
      ;;
    query_short)
      echo "❌ 当前经营内容还不够具体，无法完成 MCC 匹配：请补充真实销售的商品或服务细节。不要继续猜测 MCC 编码。"
      ;;
    runner_internal)
      echo "❌ MCC 匹配器内部处理异常：当前查询结果已生成，但无法继续解析。请稍后重试；若持续出现，请反馈平台支持。"
      ;;
    match_runner)
      echo "❌ MCC 匹配处理异常：当前查询结果已生成，但无法继续解析。请稍后重试；若持续出现，请反馈平台支持。"
      ;;
    resolve_runner)
      echo "❌ MCC 解析处理异常：当前查询结果已生成，但无法继续解析。请稍后重试；若持续出现，请反馈平台支持。"
      ;;
    backend)
      echo "❌ MCC 查询返回业务错误：请检查上游返回的 errorCode 或业务状态后再重试。"
      ;;
    *)
      echo "❌ MCC 查询结果不符合预期：请检查返回结构或上游服务后重试。"
      ;;
  esac
  emit_control "MCC_QUERY_RESULT=FAILED"
  exit 1
}

mcc_cache_ttl_seconds() {
  local value="${ALIPAY_AIPAY_MCC_TREE_CACHE_TTL_SECONDS:-1800}"
  case "$value" in
    ''|*[!0-9]*) printf '1800' ;;
    *) printf '%s' "$value" ;;
  esac
}

mcc_cache_scope_id() {
  local candidate="${ALIPAY_AIPAY_RUN_ID:-${ALIPAY_AIPAY_FLOW_RUN_ID:-}}" marker telemetry_script
  if valid_platform_id "$candidate"; then
    printf '%s' "$candidate"
    return 0
  fi
  telemetry_script="${SCRIPT_DIR}/../../../normal/scripts/telemetry.mjs"
  if [ -f "$telemetry_script" ] && command -v node >/dev/null 2>&1; then
    marker="$(node "$telemetry_script" current-run-id 2>&1 >/dev/null || true)"
    candidate="$(printf '%s\n' "$marker" | sed -n 's/^ALIPAY_AIPAY_INTERNAL:RUN_ID=//p' | head -n 1)"
    if valid_platform_id "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  fi
  return 1
}

mcc_cache_root() {
  if [ -n "${ALIPAY_AIPAY_MCC_CACHE_DIR:-}" ]; then
    case "$ALIPAY_AIPAY_MCC_CACHE_DIR" in
      /*) printf '%s' "$ALIPAY_AIPAY_MCC_CACHE_DIR"; return 0 ;;
      *) return 1 ;;
    esac
  fi
  if [ -n "${XDG_CACHE_HOME:-}" ]; then
    case "$XDG_CACHE_HOME" in
      /*) printf '%s/alipay-aipay/mcc-query-tree' "$XDG_CACHE_HOME"; return 0 ;;
      *) return 1 ;;
    esac
  fi
  case "${HOME:-}" in
    /*) [ "$HOME" != "/" ] || return 1; printf '%s/.cache/alipay-aipay/mcc-query-tree' "$HOME" ;;
    *) return 1 ;;
  esac
}

mcc_cache_component() {
  printf '%s' "$1" | LC_ALL=C tr -c 'A-Za-z0-9._-' '_'
}

mcc_cache_file() {
  local product_type="$1" sales_code="$2" root scope
  root="$(mcc_cache_root)" || return 1
  scope="$(mcc_cache_scope_id)" || return 1
  if [ -e "$root" ] && { [ ! -d "$root" ] || [ -L "$root" ]; }; then
    return 1
  fi
  mkdir -p "$root" 2>/dev/null || return 1
  chmod 700 "$root" 2>/dev/null || true
  printf '%s/%s.%s.%s.json' \
    "$root" \
    "$(mcc_cache_component "$scope")" \
    "$(mcc_cache_component "$product_type")" \
    "$(mcc_cache_component "$sales_code")"
}

mcc_selection_cache_file() {
  local product_type="$1" sales_code="$2" receipt="$3" root scope digest
  root="$(mcc_cache_root)" || return 1
  scope="$(mcc_cache_scope_id)" || return 1
  case "$receipt" in
    AIPAY_MCC_SELECTION_V1.*.*) ;;
    *) return 1 ;;
  esac
  digest="${receipt##*.}"
  case "$digest" in
    ''|*[!A-Za-z0-9_-]*) return 1 ;;
  esac
  [ "${#digest}" -ge 32 ] && [ "${#digest}" -le 128 ] || return 1
  if [ -e "$root" ] && { [ ! -d "$root" ] || [ -L "$root" ]; }; then
    return 1
  fi
  mkdir -p "$root" 2>/dev/null || return 1
  chmod 700 "$root" 2>/dev/null || true
  printf '%s/%s.%s.%s.selection.%s.json' \
    "$root" \
    "$(mcc_cache_component "$scope")" \
    "$(mcc_cache_component "$product_type")" \
    "$(mcc_cache_component "$sales_code")" \
    "$digest"
}

read_mcc_tree_cache() {
  local product_type="$1" sales_code="$2" file now ttl
  file="$(mcc_cache_file "$product_type" "$sales_code")" || return 1
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  now="$(date +%s 2>/dev/null)" || return 1
  ttl="$(mcc_cache_ttl_seconds)"
  jq -ce \
    --arg productType "$product_type" \
    --arg salesCode "$sales_code" \
    --argjson now "$now" \
    --argjson ttl "$ttl" '
      if .schemaVersion == 1
        and .productType == $productType
        and .salesCode == $salesCode
        and ((.createdAtEpoch // null) | type == "number")
        and (($now - .createdAtEpoch) >= 0)
        and (($now - .createdAtEpoch) <= $ttl)
        and (.tree.success == true)
        and ((.tree.resultObj.childrenNodes // null) | type == "array")
      then .tree
      else empty
      end
    ' "$file" 2>/dev/null
}

write_mcc_tree_cache() {
  local product_type="$1" sales_code="$2" tree="$3" file dir now tmp
  file="$(mcc_cache_file "$product_type" "$sales_code")" || return 0
  dir="${file%/*}"
  now="$(date +%s 2>/dev/null)" || return 0
  tmp="$(mktemp "$dir/.mcc-tree.XXXXXX" 2>/dev/null)" || return 0
  chmod 600 "$tmp" 2>/dev/null || true
  if ! jq -cn \
    --arg productType "$product_type" \
    --arg salesCode "$sales_code" \
    --argjson createdAtEpoch "$now" \
    --argjson tree "$tree" \
    '{
      schemaVersion: 1,
      productType: $productType,
      salesCode: $salesCode,
      createdAtEpoch: $createdAtEpoch,
      tree: $tree
    }' >"$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 0
  fi
  mv "$tmp" "$file" 2>/dev/null || {
    rm -f "$tmp" 2>/dev/null || true
    return 0
  }
}

read_mcc_selection_cache() {
  local product_type="$1" sales_code="$2" query="$3" receipt="$4" file now ttl
  file="$(mcc_selection_cache_file "$product_type" "$sales_code" "$receipt")" || return 1
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  now="$(date +%s 2>/dev/null)" || return 1
  ttl="$(mcc_cache_ttl_seconds)"
  jq -ce \
    --arg productType "$product_type" \
    --arg salesCode "$sales_code" \
    --arg query "$query" \
    --arg receipt "$receipt" \
    --argjson now "$now" \
    --argjson ttl "$ttl" '
      if .schemaVersion == 3
        and .productType == $productType
        and .salesCode == $salesCode
        and .query == $query
        and .selectionReceipt == $receipt
        and ((.semanticTerms // null) | type == "array")
        and ((.semanticTerms | length) <= 12)
        and all(.semanticTerms[]; type == "string")
        and ((.createdAtEpoch // null) | type == "number")
        and (($now - .createdAtEpoch) >= 0)
        and (($now - .createdAtEpoch) <= $ttl)
        and ((.candidateRows // null) | type == "array")
        and ((.candidateRows | length) >= 1)
        and ((.candidateRows | length) <= 8)
        and all(.candidateRows[];
          (.fullCode | type) == "string"
          and (.fullCode | test("^A[0-9]{4}_B[0-9]{4}$"))
          and (.mccCode | type) == "string"
          and (.mccCode | test("^B[0-9]{4}$"))
          and (.treeName | type) == "string"
          and (.treeName | test("\\S"))
          and (.treeDescription | type) == "string"
          and (.treeNeedSpecialQual | type) == "boolean"
        )
        and (
          (all(.candidateRows[]; .treeNeedSpecialQual == false) and .details == null)
          or
          (any(.candidateRows[]; .treeNeedSpecialQual == true)
            and (.details | type) == "object"
            and .details.success == true
            and ((.details.mccDetails // null) | type == "array")
            and all(.details.mccDetails[]; .success == true))
        )
      then {candidateRows: .candidateRows, details: .details}
      else empty
      end
    ' "$file" 2>/dev/null
}

write_mcc_selection_cache() {
  local product_type="$1" sales_code="$2" query="$3" receipt="$4" semantic_terms="$5" candidate_rows="$6" details="$7"
  local file dir now tmp
  file="$(mcc_selection_cache_file "$product_type" "$sales_code" "$receipt")" || return 0
  dir="${file%/*}"
  now="$(date +%s 2>/dev/null)" || return 0
  tmp="$(mktemp "$dir/.mcc-selection.XXXXXX" 2>/dev/null)" || return 0
  chmod 600 "$tmp" 2>/dev/null || true
  if ! jq -cn \
    --arg productType "$product_type" \
    --arg salesCode "$sales_code" \
    --arg query "$query" \
    --arg selectionReceipt "$receipt" \
    --argjson semanticTerms "$semantic_terms" \
    --argjson createdAtEpoch "$now" \
    --argjson candidateRows "$candidate_rows" \
    --argjson details "$details" \
    '{
      schemaVersion: 3,
      productType: $productType,
      salesCode: $salesCode,
      query: $query,
      selectionReceipt: $selectionReceipt,
      semanticTerms: $semanticTerms,
      createdAtEpoch: $createdAtEpoch,
      candidateRows: $candidateRows,
      details: $details
    }' >"$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 0
  fi
  mv "$tmp" "$file" 2>/dev/null || {
    rm -f "$tmp" 2>/dev/null || true
    return 0
  }
}

get_mcc_tree() {
  local product_type="$1" sales_code="$2" cached tree cached_rows
  cached="$(read_mcc_tree_cache "$product_type" "$sales_code" 2>/dev/null || true)"
  if [ -n "$cached" ]; then
    cached_rows="$(printf '%s' "$cached" | mcc_rows_from_tree 2>/dev/null || true)"
    if printf '%s' "$cached_rows" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
      printf '%s' "$cached"
      return 0
    fi
  fi
  capture_or_exit tree query_mcc_tree "$sales_code"
  write_mcc_tree_cache "$product_type" "$sales_code" "$tree"
  printf '%s' "$tree"
}

extract_runner_error_message() {
  sed -n 's/^ONBOARDING_MESSAGE_ERROR://p' "$1" | head -n 1
}

query_mcc_tree() {
  local sales_code="$1" request_json raw retry_rc business rows
  local query_error_type=""
  request_json=$(jq -n \
    --arg salesCode "$sales_code" \
    '{request:{channelCode:"B_SK_SH_RPC",salesProductCodes:[$salesCode]},ctx:{}}') || return 1

  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry raw read query_mcc -- alipay-cli mcp call ar-support.queryMcc \
    -d "$request_json" --json
  retry_rc=$?
  if [ "$retry_rc" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    exit "$retry_rc"
  fi
  [ "$retry_rc" -eq 0 ] || network_failure
  query_error_type=$(detect_error "$raw" "MCP_AUTHENTICATED_CALL")
  case "$query_error_type" in
    SUCCESS)
      ;;
    MCP_AUTH_ERROR)
      mcc_query_failed auth
      ;;
    MCP_SERVICE_ERROR|SERVICE_UNSTABLE)
      network_failure
      ;;
    CLI_LOCAL_FS_PERMISSION)
      exit "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}"
      ;;
    CLI_ERROR:*)
      mcc_query_failed cli_parse
      ;;
    ERROR:*)
      mcc_query_failed backend
      ;;
    *)
      mcc_query_failed cli_parse
      ;;
  esac
  business=$(extract_business_json "$raw") || mcc_query_failed cli_parse
  if ! printf '%s' "$business" | jq -e '.success == true and (.resultObj.childrenNodes | type == "array")' >/dev/null 2>&1; then
    mcc_query_failed tree_shape
  fi
  rows="$(printf '%s' "$business" | mcc_rows_from_tree 2>/dev/null || true)"
  if ! printf '%s' "$rows" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
    if printf '%s' "$business" | jq -e '.resultObj.childrenNodes | type == "array" and length == 0' >/dev/null 2>&1; then
      mcc_query_failed tree_empty
    fi
    mcc_query_failed tree_nodes
  fi
  printf '%s' "$business"
}

mcc_rows_from_tree() {
  jq -ce '
    def nonblank_string: type == "string" and test("\\S");
    def mcc_row($primary):
      . as $node |
      if (($node.code? | type) != "string" or ($node.code | test("^B[0-9]{4}$") | not)) then
        error("queryMcc returned invalid selectable mcc code")
      elif (($node.name? | nonblank_string) | not) then
        error("queryMcc returned missing mcc name")
      elif (($node.description? | nonblank_string) | not) then
        error("queryMcc returned missing mcc description")
      elif (($node.needSpecialQual? | type) != "boolean") then
        error("queryMcc returned invalid needSpecialQual")
      elif (($node.childrenNodes? // []) | type) != "array"
        or (($node.childrenNodes? // []) | length) > 0 then
        error("queryMcc returned invalid selectable mcc hierarchy")
      else
        {
          fullCode: ($primary + "_" + $node.code),
          mccCode: $node.code,
          treeName: $node.name,
          treeDescription: $node.description,
          treeNeedSpecialQual: $node.needSpecialQual
        }
      end;
    [
      .resultObj.childrenNodes[]? |
      . as $primary |
      if (($primary.code? | type) != "string" or ($primary.code | test("^A[0-9]{4}$") | not)) then
        error("queryMcc returned invalid primary mcc code")
      elif (($primary.childrenNodes? | type) != "array") then
        error("queryMcc returned invalid primary mcc hierarchy")
      else
        $primary.childrenNodes[]? | mcc_row($primary.code)
      end
    ] as $rows |
    if ($rows | length) == 0 then
      error("queryMcc returned no selectable mcc")
    elif (($rows | map(.fullCode) | unique | length) != ($rows | length)) then
      error("queryMcc returned duplicate selectable mcc")
    else
      $rows
    end
  ' 2>/dev/null
}

normalize_mcc_tree_catalog() {
  local rows_json="$1"
  jq -cn --argjson rows "$rows_json" '
    [
      $rows[] |
      {
        mccCode: .fullCode,
        mccName: .treeName,
        mccDescription: .treeDescription,
        needSpecialQual: .treeNeedSpecialQual,
        qualificationGroups: []
      }
    ]
  ' 2>/dev/null
}

rows_for_full_codes() {
  local rows_json="$1" full_codes_json="$2"
  jq -cn --argjson rows "$rows_json" --argjson fullCodes "$full_codes_json" '
    ($fullCodes | unique) as $wanted |
    [
      $rows[] |
      select(.fullCode as $code | $wanted | index($code))
    ]
  ' 2>/dev/null
}

query_mcc_details() {
  local rows_json="$1" mcc_codes_json total details
  mcc_codes_json=$(printf '%s' "$rows_json" | jq -c '[.[].mccCode] | unique' 2>/dev/null) || return 1
  if ! printf '%s' "$mcc_codes_json" | jq -e 'length > 0' >/dev/null 2>&1; then
    mcc_query_failed detail_empty
  fi
  total=$(printf '%s' "$mcc_codes_json" | jq -r 'length' 2>/dev/null) || mcc_query_failed cli_parse
  [ "$total" -le 8 ] || mcc_query_failed detail_shape
  capture_or_exit details query_mcc_detail_chunk "$mcc_codes_json"
  printf '%s' "$details"
}

query_mcc_detail_chunk() {
  local mcc_codes_json="$1" request_json raw retry_rc business
  local query_error_type=""
  request_json=$(jq -n --argjson mccCodes "$mcc_codes_json" '{request:{mccCodes:$mccCodes}}') || return 1

  export PLATFORM="${DEV_TOOL_NAME}" PLATFORM_ID="${PLATFORM_ID:-}"
  run_network_retry raw read batch_query_mcc -- alipay-cli mcp call mccsearchservice.batchQueryMcc \
    -d "$request_json" --json
  retry_rc=$?
  if [ "$retry_rc" -eq "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}" ]; then
    exit "$retry_rc"
  fi
  [ "$retry_rc" -eq 0 ] || network_failure
  query_error_type=$(detect_error "$raw" "MCP_AUTHENTICATED_CALL")
  case "$query_error_type" in
    SUCCESS)
      ;;
    MCP_AUTH_ERROR)
      mcc_query_failed auth
      ;;
    MCP_SERVICE_ERROR|SERVICE_UNSTABLE)
      network_failure
      ;;
    CLI_LOCAL_FS_PERMISSION)
      exit "${ALIPAY_CLI_LOCAL_STATE_PERMISSION_EXIT_CODE:-77}"
      ;;
    CLI_ERROR:*)
      mcc_query_failed cli_parse
      ;;
    ERROR:*)
      mcc_query_failed backend
      ;;
    *)
      mcc_query_failed cli_parse
      ;;
  esac
  business=$(extract_business_json "$raw") || mcc_query_failed cli_parse
  if ! printf '%s' "$business" | jq -e '.success == true and (.mccDetails | type == "array") and (.truncated // false | not)' >/dev/null 2>&1; then
    if printf '%s' "$business" | jq -e '.mccDetails | type == "array" and length == 0' >/dev/null 2>&1; then
      mcc_query_failed detail_empty
    fi
    mcc_query_failed detail_shape
  fi
  printf '%s' "$business"
}

normalize_mcc_catalog() {
  local rows_json="$1" details_json="$2"
  jq -cn --argjson rows "$rows_json" --argjson details "$details_json" '
    ($details.mccDetails // []) as $detailList |
    ($rows | map(select(.treeNeedSpecialQual == true) | .mccCode) | unique) as $requiredCodes |
    ($detailList | map(select(.success != true) | .mccCode) | unique) as $failedCodes |
    if ($failedCodes | length) > 0 then
      error("batchQueryMcc returned failed mcc details")
    else
      ($detailList | map(.mccCode) | unique) as $detailCodes |
      ($requiredCodes - $detailCodes) as $missingCodes |
      ($detailCodes - $requiredCodes) as $unexpectedCodes |
      if (($detailCodes | length) != ($detailList | length)) then
        error("batchQueryMcc returned duplicate mcc details")
      elif ($missingCodes | length) > 0 then
        error("batchQueryMcc missed required qualification details")
      elif ($unexpectedCodes | length) > 0 then
        error("batchQueryMcc returned unrequested mcc details")
      else
        (reduce $detailList[] as $detail ({}; .[$detail.mccCode] = $detail)) as $detailByCode |
        [
          $rows[] |
          . as $row |
          ($detailByCode[$row.mccCode]) as $detail |
          {
            mccCode: $row.fullCode,
            mccName: $row.treeName,
            mccDescription: $row.treeDescription,
            needSpecialQual: $row.treeNeedSpecialQual,
            qualificationGroups: (if $row.treeNeedSpecialQual then
              (($detail.qualificationGroups // []) | map({
                qualifications: ((.qualifications // []) | map({
                  attaType: (if (.attaType == null or .attaType == "") then null else (.attaType | tostring) end),
                  qualId: (if (.qualId == null) then null else (.qualId | tostring) end),
                  qualName: ((.qualName // "") | tostring),
                  qualType: (if (.qualType == null) then null else (.qualType | tostring) end),
                  status: (if (.status == null) then null else (.status | tostring) end)
                }))
              }))
            else
              []
            end)
          }
        ] as $catalog |
        if any($catalog[];
          (.needSpecialQual == true) !=
          (([.qualificationGroups[]? | select((.qualifications | length) > 0)] | length) > 0)
        ) or any($catalog[]; any(.qualificationGroups[]?; (.qualifications | length) == 0)) then
          error("batchQueryMcc returned inconsistent qualification groups")
        else
          $catalog
        end
      end
    end
  ' 2>/dev/null
}

run_mcc_match_codes() {
  local query="$1" product_type="$2" catalog="$3" semantic_terms_json="$4"
  local runner_out runner_err runner_rc runner_error line resolution=""
  runner_out=$(mktemp "${TMPDIR:-/tmp}/mcc_match_out.XXXXXX") || { echo "❌ 创建临时文件失败"; exit 1; }
  runner_err=$(mktemp "${TMPDIR:-/tmp}/mcc_match_err.XXXXXX") || { rm -f "$runner_out"; echo "❌ 创建临时文件失败"; exit 1; }
  "${NODE_BINARY:-node}" "$ONBOARDING_RUNNER" mcc-match-codes \
    --query "$query" \
    --product-type "$product_type" \
    --mcc-catalog-json "$catalog" \
    --semantic-terms-json "$semantic_terms_json" >"$runner_out" 2>"$runner_err"
  runner_rc=$?
  if [ "$runner_rc" -ne 0 ] || [ -s "$runner_out" ]; then
    runner_error=$(extract_runner_error_message "$runner_err")
    rm -f "$runner_out" "$runner_err"
    case "$runner_error" in
      *'query 过短'*|*'query 包含控制字符或过长'*)
        mcc_query_failed query_short
        ;;
      *)
        mcc_query_failed runner_internal
        ;;
    esac
  fi
  while IFS= read -r line; do
    case "$line" in
      ALIPAY_AIPAY_INTERNAL:MCC_RESOLUTION=*)
        resolution="${line#ALIPAY_AIPAY_INTERNAL:MCC_RESOLUTION=}" ;;
    esac
  done <"$runner_err"
  rm -f "$runner_out" "$runner_err"
  [ -n "$resolution" ] || mcc_query_failed match_runner
  printf '%s' "$resolution"
}

validate_mcc_selection_cache() {
  local query="$1" product_type="$2" selection_receipt="$3" catalog="$4" semantic_terms_json="$5"
  "${NODE_BINARY:-node}" "$ONBOARDING_RUNNER" mcc-validate-selection-cache \
    --query "$query" \
    --product-type "$product_type" \
    --selection-receipt "$selection_receipt" \
    --mcc-catalog-json "$catalog" \
    --semantic-terms-json "$semantic_terms_json" >/dev/null 2>&1
}

run_resolve_plan() {
  local query="" product_type="" semantic_terms_json='[]' select_value="" selection_receipt=""
  local sales_code tree rows tree_catalog resolution match_type full_codes candidate_rows qualification_rows details catalog
  local selection_cache="" used_selection_cache=false stale_selection=false resolved_semantic_terms='[]'
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --query)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; exit 1; }
        query="$2"; shift 2 ;;
      --product-type)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; exit 1; }
        product_type="$2"; shift 2 ;;
      --semantic-terms-json)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; exit 1; }
        semantic_terms_json="$2"; shift 2 ;;
      --select)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; exit 1; }
        select_value="$2"; shift 2 ;;
      --selection-receipt)
        [ $# -ge 2 ] || { echo "❌ 缺少参数值: $1"; exit 1; }
        selection_receipt="$2"; shift 2 ;;
      *)
        echo "❌ 未知参数: $1"; exit 1 ;;
    esac
  done
  if [ -z "$query" ] || [ -z "$product_type" ]; then
    echo "❌ 缺少 --query 或 --product-type"
    exit 1
  fi
  semantic_terms_json=$(printf '%s' "$semantic_terms_json" | jq -ce '
    select(type == "array" and length <= 12 and all(.[]; type == "string"))
  ' 2>/dev/null) || {
    echo "❌ --semantic-terms-json 必须是最多 12 项的 JSON 字符串数组"
    exit 1
  }
  sales_code=$(product_sales_code "$product_type") || {
    echo "❌ product-type 非法，Coze 定制版仅支持 webpay"
    exit 1
  }
  init_alipay_cli_product "$product_type" || exit 1

  if [ -n "$selection_receipt" ]; then
    selection_cache="$(read_mcc_selection_cache "$product_type" "$sales_code" "$query" "$selection_receipt" 2>/dev/null || true)"
  if [ -n "$selection_cache" ]; then
      candidate_rows=$(printf '%s' "$selection_cache" | jq -c '.candidateRows' 2>/dev/null) || mcc_query_failed cli_parse
      details=$(printf '%s' "$selection_cache" | jq -c '.details' 2>/dev/null) || mcc_query_failed cli_parse
      catalog=$(normalize_mcc_catalog "$candidate_rows" "$details" 2>/dev/null || true)
      if [ -n "$catalog" ] && validate_mcc_selection_cache "$query" "$product_type" "$selection_receipt" "$catalog" "$semantic_terms_json"; then
        used_selection_cache=true
      else
        catalog=""
        candidate_rows=""
        details=""
      fi
    fi
    [ "$used_selection_cache" = true ] || stale_selection=true
  fi

  if [ "$used_selection_cache" != true ]; then
    require_alipay_cli_local_state_access_or_emit || exit "$?"
    capture_or_exit tree get_mcc_tree "$product_type" "$sales_code"
    rows=$(printf '%s' "$tree" | mcc_rows_from_tree) || {
      mcc_query_failed tree_nodes
    }
    tree_catalog=$(normalize_mcc_tree_catalog "$rows") || {
      mcc_query_failed cli_parse
    }
    capture_or_exit resolution run_mcc_match_codes "$query" "$product_type" "$tree_catalog" "$semantic_terms_json"
    match_type=$(printf '%s' "$resolution" | jq -r '.matchType // ""' 2>/dev/null) || mcc_query_failed cli_parse
    resolved_semantic_terms=$(printf '%s' "$resolution" | jq -c '.semanticTerms // []' 2>/dev/null) || mcc_query_failed cli_parse
    if [ "$match_type" = "NONE" ]; then
      catalog="$tree_catalog"
    else
      full_codes=$(printf '%s' "$resolution" | jq -c '.mergedCandidateCodes // []' 2>/dev/null) || mcc_query_failed cli_parse
    fi
    if [ -z "${catalog:-}" ]; then
      if ! printf '%s' "$full_codes" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
        catalog="$tree_catalog"
      else
        candidate_rows=$(rows_for_full_codes "$rows" "$full_codes") || mcc_query_failed tree_nodes
        if ! printf '%s' "$candidate_rows" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
          mcc_query_failed tree_nodes
        fi
        qualification_rows=$(printf '%s' "$candidate_rows" | jq -c '[.[] | select(.treeNeedSpecialQual == true)]' 2>/dev/null) || mcc_query_failed cli_parse
        if printf '%s' "$qualification_rows" | jq -e 'length > 0' >/dev/null 2>&1; then
          capture_or_exit details query_mcc_details "$qualification_rows"
        else
          details='null'
        fi
        catalog=$(normalize_mcc_catalog "$candidate_rows" "$details") || {
          mcc_query_failed detail_shape
        }
      fi
    fi
  fi

  node_args=(
    "$ONBOARDING_RUNNER" mcc-resolve-plan
    --query "$query"
    --product-type "$product_type"
    --mcc-catalog-json "$catalog"
    --semantic-terms-json "$semantic_terms_json"
  )
  if [ "$stale_selection" = true ]; then
    node_args+=(--selection-state STALE)
  elif [ -n "$select_value" ] || [ -n "$selection_receipt" ]; then
    if [ -z "$select_value" ] || [ -z "$selection_receipt" ]; then
      echo "❌ --select 与 --selection-receipt 必须同时提供"
      exit 1
    fi
    node_args+=(--select "$select_value" --selection-receipt "$selection_receipt")
  fi

  local runner_out runner_err runner_rc runner_error
  runner_out=$(mktemp "${TMPDIR:-/tmp}/mcc_runner_out.XXXXXX") || { echo "❌ 创建临时文件失败"; exit 1; }
  runner_err=$(mktemp "${TMPDIR:-/tmp}/mcc_runner_err.XXXXXX") || { rm -f "$runner_out"; echo "❌ 创建临时文件失败"; exit 1; }
  "${NODE_BINARY:-node}" "${node_args[@]}" >"$runner_out" 2>"$runner_err"
  runner_rc=$?
  if [ "$runner_rc" -ne 0 ]; then
    runner_error=$(extract_runner_error_message "$runner_err")
    rm -f "$runner_out" "$runner_err"
    case "$runner_error" in
      *'query 过短'*|*'query 包含控制字符或过长'*)
        mcc_query_failed query_short
        ;;
      *)
        mcc_query_failed runner_internal
        ;;
    esac
  fi
  if { [ -z "$selection_receipt" ] || [ "$stale_selection" = true ]; } \
    && [ -n "${candidate_rows:-}" ] && [ -n "${details:-}" ]; then
    local generated_selection_receipt
    generated_selection_receipt=$(sed -n 's/^ALIPAY_AIPAY_INTERNAL:MCC_SELECTION_RECEIPT=//p' "$runner_err")
    if [ "$(printf '%s\n' "$generated_selection_receipt" | sed '/^$/d' | wc -l | tr -d ' ')" = "1" ]; then
      write_mcc_selection_cache "$product_type" "$sales_code" "$query" "$generated_selection_receipt" "$resolved_semantic_terms" "$candidate_rows" "$details"
    fi
  fi
  emit_control "MCC_QUERY_RESULT=SUCCESS"
  cat "$runner_out"
  cat "$runner_err" >&2
  rm -f "$runner_out" "$runner_err"
}

case "${1:-}" in
  resolve-plan)
    run_resolve_plan "$@"
    ;;
  *)
    echo "用法: bash mcc.sh resolve-plan --query <经营描述|MCC编码> --product-type webpay [--semantic-terms-json <JSON数组>] [--select <MCC编码> --selection-receipt <receipt>]"
    exit 1
    ;;
esac
