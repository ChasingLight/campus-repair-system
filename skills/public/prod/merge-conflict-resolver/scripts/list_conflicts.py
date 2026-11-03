#!/usr/bin/env python3
"""
列出当前仓库处于 in-progress 合并冲突的文件，并按 feature 分桶 (Mode B 入口)。

输出 JSON 结构与 preflight.py 同构, 调用方 (SKILL.md) 可走完全相同的下游流程。
区别只在数据来源:
  - preflight.py:  通过 git merge-tree 在 merge 未发生前预检
  - list_conflicts.py: 通过 git status 读取已发生的 unmerged 状态

输出示例:
  {
    "title": "代码合并冲突",
    "source_branch": "<MERGE_HEAD branch>",
    "target_branch": "<HEAD branch>",
    "_meta": { "merge_base": "...", "git_version": "...",
               "clean": false, "ours_ref": "HEAD", "theirs_ref": "MERGE_HEAD" },
    "features": [...],
    "options": [...]
  }

返回码:
  0 = 没有冲突 (但仍处于 merge 状态? 罕见)
  1 = 有冲突 (主流情况)
  2 = 用法错误 / 不在仓库 / 没有 in-progress 合并

XY 状态码到 conflict type 的映射:
  UU -> both-modified
  AA -> both-added
  DD -> both-deleted
  UD -> deleted-by-them
  DU -> deleted-by-us
  UA -> added-by-them
  AU -> added-by-us
  其它 unmerged 状态 -> "other"
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from git_utils import (
    in_repo,
    git_version_str,
    detect_branch_name,
    merge_base,
    ref_exists,
    build_file_metas,
    bucket_by_feature,
    build_output,
)

TYPE_MAP = {
    "DD": "both-deleted",
    "AU": "added-by-us",
    "UD": "deleted-by-them",
    "UA": "added-by-them",
    "DU": "deleted-by-us",
    "AA": "both-added",
    "UU": "both-modified",
}


def detect_theirs_ref() -> str | None:
    for cand in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REBASE_HEAD"):
        if ref_exists(cand):
            return cand
    return None


def list_conflicts() -> list[tuple[str, str]]:
    """Return [(file, conflict_type)] from git status."""
    res = subprocess.run(
        ["git", "status", "--porcelain=v1", "-z"],
        capture_output=True, check=False,
    )
    if res.returncode != 0:
        sys.stderr.write(res.stderr.decode("utf-8", "replace"))
        return []

    raw = res.stdout
    out: list[tuple[str, str]] = []
    for rec in raw.split(b"\x00"):
        if not rec or len(rec) < 4:
            continue
        xy = rec[:2].decode("ascii", errors="replace")
        path = rec[3:].decode("utf-8", errors="replace")
        kind = TYPE_MAP.get(xy)
        if kind is None:
            if "U" not in xy and xy not in {"AA", "DD"}:
                continue
            kind = "other"
        out.append((path, kind))
    return out


def main() -> int:
    if not in_repo():
        print("ERROR: not inside a git repository", file=sys.stderr)
        return 2

    theirs = detect_theirs_ref()
    if not theirs:
        print(
            "ERROR: no in-progress merge/rebase/cherry-pick "
            "(MERGE_HEAD / CHERRY_PICK_HEAD / REBASE_HEAD all missing). "
            "If you want to *preview* a merge, use preflight.py instead.",
            file=sys.stderr,
        )
        return 2

    ours = "HEAD"
    target_branch = detect_branch_name(ours)
    source_branch = detect_branch_name(theirs)

    merge_base_sha = merge_base(ours, theirs)

    conflicts = list_conflicts()

    file_metas = build_file_metas(conflicts, merge_base_sha, ours, theirs)
    features = bucket_by_feature(file_metas)

    clean = len(conflicts) == 0

    out = build_output(
        source_branch=source_branch,
        target_branch=target_branch,
        merge_base_sha=merge_base_sha,
        git_ver=git_version_str(),
        clean=clean,
        ours_ref=ours,
        theirs_ref=theirs,
        features=features,
    )

    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0 if clean else 1


if __name__ == "__main__":
    sys.exit(main())
