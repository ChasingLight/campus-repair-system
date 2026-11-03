#!/usr/bin/env bash
# 应用"非 LLM"类策略: 保留源分支(theirs) / 保留目标分支(ours)。
# 用法: apply_strategy.sh <file> <ours|theirs>
# 完成后会 git add 该文件; 失败会 exit 非零。

set -euo pipefail

file=${1:-}
strategy=${2:-}
if [[ -z "$file" || -z "$strategy" ]]; then
  echo "Usage: apply_strategy.sh <file> <ours|theirs>" >&2
  exit 2
fi

case "$strategy" in
  ours)
    git checkout --ours -- "$file"
    ;;
  theirs)
    git checkout --theirs -- "$file"
    ;;
  *)
    echo "ERROR: unknown strategy '$strategy' (expected ours or theirs)" >&2
    exit 2
    ;;
esac

git add -- "$file"
echo "applied=$strategy file=$file"
