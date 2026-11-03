#!/usr/bin/env bash
# 取冲突文件的三方内容, 同时把当前(含冲突标记)版本备份到 .git 下,
# 供 smart 失败时通过 restore_conflict.sh 还原。
#
# 用法: dump_three_way.sh <file>
# 输出 JSON:
#   {
#     "file": "...",
#     "base": "...",      # 共同祖先版本
#     "ours": "...",      # HEAD 版本
#     "theirs": "...",    # MERGE_HEAD 版本
#     "current": "...",   # 工作区当前内容(含冲突标记)
#     "backup_path": "/abs/path/to/.git/merge-conflict-resolver/<hash>.conflict"
#   }

set -euo pipefail

file=${1:-}
if [[ -z "$file" ]]; then
  echo "Usage: dump_three_way.sh <file>" >&2
  exit 2
fi

# 备份目录在 .git/ 下，天然不被 git 跟踪。worktree 安全：用 --git-path。
backup_dir=$(git rev-parse --git-path merge-conflict-resolver)
mkdir -p "$backup_dir"

# stable hash key: 相对路径的 sha1 前 16 位
hash=$(printf '%s' "$file" | shasum | head -c 16)
backup_path="$backup_dir/$hash.conflict"

# 备份当前文件 (含冲突标记) — 仅当未备份过时写入, 避免被中间步骤覆盖
if [[ ! -f "$backup_path" ]]; then
  if [[ -f "$file" ]]; then
    cp "$file" "$backup_path"
  else
    : > "$backup_path"
  fi
  # 同步把映射写到 manifest, 方便排查
  printf '%s\t%s\n' "$hash" "$file" >> "$backup_dir/manifest.tsv"
fi

read_stage() {
  local stage=$1
  git show ":${stage}:${file}" 2>/dev/null || true
}

base=$(read_stage 1)
ours=$(read_stage 2)
theirs=$(read_stage 3)
current=""
[[ -f "$file" ]] && current=$(cat "$file")

python3 - "$file" "$base" "$ours" "$theirs" "$current" "$backup_path" <<'PY'
import json, sys
file, base, ours, theirs, current, backup_path = sys.argv[1:7]
print(json.dumps({
    "file": file,
    "base": base,
    "ours": ours,
    "theirs": theirs,
    "current": current,
    "backup_path": backup_path,
}, ensure_ascii=False))
PY
