#!/usr/bin/env python3
"""
合并前预检（Mode A 入口）：在不开启 merge 的前提下检测冲突，按 feature 分桶。

依赖: git 2.38+ (用 git merge-tree --write-tree --name-only --messages)

用法:
  preflight.py <theirs> [--ours <ref>]

输出: JSON 到 stdout, 与 resolve_conflict 工具入参对齐：
  {
    "title": "代码合并冲突",
    "source_branch": "...",
    "target_branch": "...",
    "_meta": { "merge_base": "...", "git_version": "...", "clean": false,
               "ours_ref": "HEAD", "theirs_ref": "..." },
    "features": [
      { "feature_id": "login",
        "feature_name": "login",
        "affected_files": ["src/auth.ts", ...],
        "_files_meta": [
          { "file": "...", "type": "both-modified",
            "is_lockfile": false,
            "primary_feature": "login",
            "all_features": ["login", "auth"],
            "ours_commits":  [{"sha": "...", "subject": "..."}],
            "theirs_commits": [...] },
          ...
        ] },
      ...
    ],
    "options": [
      {"value": "keep_source", "label": "保留源分支"},
      {"value": "keep_target", "label": "保留目标分支"},
      {"value": "keep_both",   "label": "智能合并"},
      {"value": "manual",      "label": "手动处理"}
    ]
  }

返回码:
  0 = clean, 无冲突 (调用方可直接 git merge)
  1 = 有冲突 (输出已写好, 调用方按 SKILL.md 流程走)
  2 = 用法错误 / 不在仓库 / ref 不存在
  3 = git 版本太旧

下划线开头字段 (_meta / _files_meta) 仅 SKILL.md 内部消费, 不传给 resolve_conflict。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from git_utils import (
    in_repo,
    git_version_tuple,
    git_version_str,
    ref_exists,
    detect_branch_name,
    merge_base,
    build_file_metas,
    bucket_by_feature,
    build_output,
)


def merge_tree_preflight(
    ours: str, theirs: str
) -> tuple[bool, list[tuple[str, str]]]:
    """
    Run `git merge-tree --write-tree --name-only --messages ours theirs`.
    Returns (clean, conflicts) where conflicts is a list of (file, conflict_type).

    强制 LANG=C 让 git 输出英文 message, 否则 macOS / 中文环境下输出本地化字符串
    (例如 "冲突（内容）：..."), 正则会全部失配。
    """
    env = os.environ.copy()
    env["LANG"] = "C"
    env["LC_ALL"] = "C"
    res = subprocess.run(
        ["git", "merge-tree", "--write-tree", "--name-only", "--messages", ours, theirs],
        capture_output=True, check=False, env=env,
    )
    out = res.stdout.decode("utf-8", "replace").splitlines()
    if not out:
        return True, []

    try:
        sep = out.index("")
    except ValueError:
        sep = len(out)

    files = out[1:sep]
    msgs = out[sep + 1:]

    type_map: dict[str, str] = {}
    for line in msgs:
        if "CONFLICT (content)" in line:
            m = re.search(r"in (.+)$", line)
            if m:
                type_map[m.group(1).strip()] = "both-modified"
        elif "CONFLICT (modify/delete)" in line:
            # 格式: "CONFLICT (modify/delete): X deleted in REF1, modified in REF2."
            m = re.match(
                r"CONFLICT \(modify/delete\):\s+(.+?)\s+deleted in (\S+?)(?:,|\.|\s)",
                line,
            )
            if m:
                fname = m.group(1).strip()
                deleter_ref = m.group(2).strip().rstrip(",.")
                if deleter_ref == ours or deleter_ref == "HEAD":
                    type_map[fname] = "deleted-by-us"
                elif deleter_ref == theirs:
                    type_map[fname] = "deleted-by-them"
                else:
                    type_map[fname] = "modify-delete"
        elif "CONFLICT (add/add)" in line:
            m = re.search(r"in (.+)$", line)
            if m:
                type_map[m.group(1).strip()] = "both-added"
        elif "CONFLICT (rename" in line or "CONFLICT (file location)" in line:
            m = re.search(r"in (.+)$", line)
            if m:
                type_map[m.group(1).strip()] = "rename-conflict"

    conflicts = [(f, type_map.get(f, "unknown")) for f in files]
    clean = res.returncode == 0
    return clean, conflicts


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print("Usage: preflight.py <theirs> [--ours <ref>]", file=sys.stderr)
        return 2

    theirs = args[0]
    ours = "HEAD"
    if "--ours" in args:
        idx = args.index("--ours")
        if idx + 1 >= len(args):
            print("--ours requires a value", file=sys.stderr)
            return 2
        ours = args[idx + 1]

    if not in_repo():
        print("ERROR: not inside a git repository", file=sys.stderr)
        return 2

    ver = git_version_tuple()
    if ver < (2, 38, 0):
        print(
            f"ERROR: git {'.'.join(str(v) for v in ver)} too old; need 2.38+ "
            "for merge-tree --write-tree",
            file=sys.stderr,
        )
        return 3

    if not ref_exists(theirs):
        print(f"ERROR: ref not found: {theirs}", file=sys.stderr)
        return 2
    if not ref_exists(ours):
        print(f"ERROR: ref not found: {ours}", file=sys.stderr)
        return 2

    target_branch = detect_branch_name(ours)
    source_branch = detect_branch_name(theirs)

    merge_base_sha = merge_base(ours, theirs)

    clean, conflicts = merge_tree_preflight(ours, theirs)

    file_metas = build_file_metas(conflicts, merge_base_sha, ours, theirs)
    features = bucket_by_feature(file_metas)

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
