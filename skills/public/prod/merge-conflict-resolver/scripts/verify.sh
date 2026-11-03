#!/usr/bin/env bash
# 冲突解决后跑 lint/typecheck → build → test 校验。
# 仅支持 Python 与 TypeScript 项目。
#
# 用法:
#   verify.sh
#
# 环境变量:
#   MCR_VERIFY_TIMEOUT  单步超时秒数, 默认 600 (10 min)。设为 0 表示不限时。
#   MCR_VERIFY_SKIP     跳过特定 step, 逗号分隔, 例如 "lint" / "build,test" / "lint,build"。
#                       支持的 step 名: lint / build / test
#
# 行为:
#   1) Step 0  lint/typecheck (best-effort, 工具不存在自动跳过):
#      - TS: tsconfig.json 存在 -> tsc --noEmit (优先 ./node_modules/.bin/tsc, 否则 npx)
#      - Python: ruff check . (有 ruff 时); mypy . (有 mypy 且配置存在时)
#   2) Step 1  build:
#      - Makefile 有 build 目标 -> make build
#      - TS: package.json 有 scripts.build -> <pm> run build (pm 按 lockfile 自动选)
#      - Python: 无 build 步骤, 跳过
#   3) Step 2  test:
#      - Makefile 有 test 目标 -> make test
#      - TS: package.json 有 scripts.test -> <pm> test
#      - Python: pytest (优先) -> python -m unittest discover
#   4) 任一 step 失败立即返回非零, 末行: VERIFY: FAIL: <step> [exit=N|timeout=Ns]
#   5) 全通过 -> VERIFY: OK
#
# 设计说明:
#   - lint/typecheck 排在 build/test 之前, 因为通常秒级返回, 能挡掉 80% 合并失误。
#   - 包管理器按 lockfile 自动识别 (pnpm-lock.yaml > yarn.lock > package-lock.json > npm),
#     避免硬写 npm 在 pnpm/yarn 项目里走错命令。

set -uo pipefail

TIMEOUT=${MCR_VERIFY_TIMEOUT:-600}
SKIP=${MCR_VERIFY_SKIP:-}

# ---- timeout 命令探测 ----
if [[ "$TIMEOUT" -gt 0 ]] 2>/dev/null; then
  if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_BIN=timeout
  elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_BIN=gtimeout
  else
    echo "WARN: 'timeout' / 'gtimeout' not found; running without per-step timeout" >&2
    TIMEOUT_BIN=""
  fi
else
  TIMEOUT_BIN=""
fi

is_skipped() {
  local step=$1
  [[ ",${SKIP}," == *",${step},"* ]]
}

run() {
  local title=$1; shift
  echo "=== $title ==="
  echo "$ $*"
  local rc=0
  if [[ -n "$TIMEOUT_BIN" ]]; then
    "$TIMEOUT_BIN" --foreground "${TIMEOUT}s" "$@"
    rc=$?
  else
    "$@"
    rc=$?
  fi
  if [[ $rc -ne 0 ]]; then
    if [[ $rc -eq 124 || $rc -eq 137 ]] && [[ -n "$TIMEOUT_BIN" ]]; then
      echo "VERIFY: FAIL: $title (timeout=${TIMEOUT}s)"
    else
      echo "VERIFY: FAIL: $title (exit=$rc)"
    fi
    exit $rc
  fi
}

run_optional() {
  # 工具不存在时跳过, 不当失败
  local title=$1; shift
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "(skip $title: '$1' not installed)"
    return 0
  fi
  run "$title" "$@"
}

detect_ts_pm() {
  if [[ -f pnpm-lock.yaml ]]; then echo "pnpm"
  elif [[ -f yarn.lock ]]; then echo "yarn"
  elif [[ -f package-lock.json ]]; then echo "npm"
  elif [[ -f bun.lockb || -f bun.lock ]]; then echo "bun"
  else echo "npm"
  fi
}

# package.json 里有指定 script 才返回 0
ts_has_script() {
  local script=$1
  [[ -f package.json ]] || return 1
  if command -v jq >/dev/null 2>&1; then
    jq -e ".scripts.${script}" package.json >/dev/null 2>&1
  else
    grep -qE "\"${script}\"[[:space:]]*:" package.json
  fi
}

# Python mypy 配置探测
python_has_mypy_config() {
  [[ -f mypy.ini ]] && return 0
  [[ -f .mypy.ini ]] && return 0
  [[ -f pyproject.toml ]] && grep -q '^\[tool\.mypy\]' pyproject.toml && return 0
  return 1
}

# ============================================================
# Step 0: lint / typecheck  (best-effort)
# ============================================================
if ! is_skipped lint; then
  # TypeScript: tsc --noEmit
  if [[ -f tsconfig.json ]]; then
    if [[ -x ./node_modules/.bin/tsc ]]; then
      run "tsc --noEmit" ./node_modules/.bin/tsc --noEmit
    elif command -v tsc >/dev/null 2>&1; then
      run "tsc --noEmit" tsc --noEmit
    elif command -v npx >/dev/null 2>&1 && [[ -f package.json ]]; then
      run "npx tsc --noEmit" npx --no-install tsc --noEmit
    else
      echo "(skip tsc: not installed locally)"
    fi
  fi

  # Python ruff (秒级 lint)
  if [[ -f pyproject.toml || -f setup.py || -f setup.cfg || -f requirements.txt ]]; then
    run_optional "ruff check" ruff check .
    if python_has_mypy_config; then
      run_optional "mypy" mypy .
    fi
  fi
fi

# ============================================================
# Step 1: build
# ============================================================
if ! is_skipped build; then
  if [[ -f Makefile ]] && grep -qE '^build[: ]' Makefile; then
    run "make build" make build
  elif [[ -f package.json ]] && ts_has_script build; then
    PM=$(detect_ts_pm)
    case "$PM" in
      pnpm) run "pnpm run build" pnpm run build ;;
      yarn) run "yarn build" yarn build ;;
      bun)  run "bun run build" bun run build ;;
      *)    run "npm run build" npm run build ;;
    esac
  elif [[ -f pyproject.toml || -f setup.py ]]; then
    echo "(skip build: python project has no separate build step)"
  fi
fi

# ============================================================
# Step 2: test
# ============================================================
if ! is_skipped test; then
  if [[ -f Makefile ]] && grep -qE '^test[: ]' Makefile; then
    run "make test" make test
  elif [[ -f package.json ]] && ts_has_script test; then
    PM=$(detect_ts_pm)
    case "$PM" in
      pnpm) run "pnpm test" pnpm test ;;
      yarn) run "yarn test" yarn test ;;
      bun)  run "bun test" bun test ;;
      *)    run "npm test" npm test --silent ;;
    esac
  elif [[ -f pyproject.toml || -f setup.py || -f setup.cfg || -f requirements.txt ]]; then
    if command -v pytest >/dev/null 2>&1; then
      run "pytest" pytest -q
    else
      run "python -m unittest" python -m unittest discover -v
    fi
  fi
fi

echo "VERIFY: OK"
