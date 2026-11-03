#!/usr/bin/env bash
# 解决 lock 文件冲突: 取一侧 + 重新生成 lock。
#
# 用法: resolve_lockfile.sh <file> <ours|theirs>
#
# 支持的 lock 文件 (按 basename 识别):
#   TS:
#     package-lock.json   -> npm install --package-lock-only --ignore-scripts
#     yarn.lock           -> yarn install --ignore-scripts
#     pnpm-lock.yaml      -> pnpm install --no-frozen-lockfile --ignore-scripts
#     bun.lockb / bun.lock-> bun install
#   Python:
#     poetry.lock         -> poetry lock --no-update
#     Pipfile.lock        -> pipenv lock
#     uv.lock             -> uv lock
#     pdm.lock            -> pdm lock
#
# 行为:
#   1) git checkout --ours/--theirs -- <file>
#   2) 在 <file> 所在目录执行重新生成命令
#   3) git add 该 lock 文件 (以及 install 顺带改的 manifest, 如 package.json 不会动, 但 pnpm 偶发会动)
#
# 失败处理:
#   - 重新生成命令所需的 CLI 不存在 -> exit 3, 提示用户手动跑
#   - 重新生成失败 -> exit 1, 不 add, 用户可手动调试
#
# 注意: 这个脚本假设 manifest 文件 (package.json / pyproject.toml / Pipfile) 自身没有冲突。
# 如果 manifest 也冲突, 应先解决 manifest 再调本脚本。

set -uo pipefail

file=${1:-}
strategy=${2:-}
if [[ -z "$file" || -z "$strategy" ]]; then
  echo "Usage: resolve_lockfile.sh <file> <ours|theirs>" >&2
  exit 2
fi
if [[ "$strategy" != "ours" && "$strategy" != "theirs" ]]; then
  echo "ERROR: strategy must be 'ours' or 'theirs', got '$strategy'" >&2
  exit 2
fi

basename=$(basename "$file")
dir=$(dirname "$file")

# 1) 先取一侧的版本
git checkout --"$strategy" -- "$file"

# 2) 进入文件所在目录跑重新生成 (monorepo 下 lock 文件可能不在仓库根)
pushd "$dir" >/dev/null

run_regen() {
  local title=$1; shift
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' not installed; please regenerate $basename manually" >&2
    popd >/dev/null
    exit 3
  fi
  echo "=== $title ==="
  echo "$ $*"
  "$@"
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "ERROR: regeneration failed ($title exit=$rc)" >&2
    popd >/dev/null
    exit 1
  fi
}

case "$basename" in
  package-lock.json)
    run_regen "npm install --package-lock-only" npm install --package-lock-only --ignore-scripts
    ;;
  yarn.lock)
    run_regen "yarn install" yarn install --ignore-scripts
    ;;
  pnpm-lock.yaml)
    run_regen "pnpm install" pnpm install --no-frozen-lockfile --ignore-scripts
    ;;
  bun.lockb|bun.lock)
    run_regen "bun install" bun install
    ;;
  poetry.lock)
    run_regen "poetry lock" poetry lock --no-update
    ;;
  Pipfile.lock)
    run_regen "pipenv lock" pipenv lock
    ;;
  uv.lock)
    run_regen "uv lock" uv lock
    ;;
  pdm.lock)
    run_regen "pdm lock" pdm lock
    ;;
  *)
    echo "ERROR: '$basename' is not a recognized lock file" >&2
    popd >/dev/null
    exit 2
    ;;
esac

popd >/dev/null

# 3) git add (重新生成可能动了 lock 文件本身, 一律 add)
git add -- "$file"

echo "applied=lockfile-regen file=$file picked=$strategy"
