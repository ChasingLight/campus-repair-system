#!/usr/bin/env bash
# 把冲突文件还原回带冲突标记的状态。
# 用法: restore_conflict.sh <file>
#
# 行为:
#   1) 从 .git/merge-conflict-resolver/<hash>.conflict 读取备份, 写回 <file>。
#   2) 用 git checkout -m -- <file> 恢复 index 中的 unmerged stages
#      (smart 在写回前没 git add 过, index 应该还保留 1/2/3, 这里是双保险)。
#   3) 备份不存在 -> 退化为 git checkout -m -- <file>; 仍失败则 exit 非零。
#
# 这是 smart 策略失败 / 用户改主意时的安全回退。

set -euo pipefail

file=${1:-}
if [[ -z "$file" ]]; then
  echo "Usage: restore_conflict.sh <file>" >&2
  exit 2
fi

backup_dir=$(git rev-parse --git-path merge-conflict-resolver)
hash=$(printf '%s' "$file" | shasum | head -c 16)
backup_path="$backup_dir/$hash.conflict"

restored=0
if [[ -f "$backup_path" ]]; then
  cp "$backup_path" "$file"
  restored=1
  echo "restored from backup: $backup_path"
fi

# 把 index 里这个文件还原成 unmerged 状态。即便 backup 已经把工作区写回, 这步保证 index 一致。
if git checkout -m -- "$file" 2>/dev/null; then
  echo "index reverted to unmerged: $file"
elif [[ $restored -eq 0 ]]; then
  echo "ERROR: no backup found and 'git checkout -m' failed" >&2
  exit 1
fi

# 如果之前因 smart 写过 git add (按 SKILL.md 规范不应该, 但兜底)
git reset -q HEAD -- "$file" 2>/dev/null || true
