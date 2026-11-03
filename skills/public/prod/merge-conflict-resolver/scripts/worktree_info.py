#!/usr/bin/env python3
"""
列出当前仓库的所有 git worktree，并按需定位「某个分支所在 worktree」或「带 in-progress 合并的 worktree」。

用法:
  worktree_info.py                       # 列出所有 worktree
  worktree_info.py --branch <name>       # 找 <name> 所在的 worktree
  worktree_info.py --in-progress         # 找含 MERGE_HEAD/CHERRY_PICK_HEAD/REBASE_HEAD 的 worktree

输出 JSON 到 stdout:
  {
    "current_path": "<当前 cwd 所在 worktree 的绝对路径，找不到为空>",
    "worktrees": [
      {
        "path": "<绝对路径>",
        "branch": "<分支名，detached / bare 时为空>",
        "head": "<HEAD sha>",
        "bare": false,
        "detached": false,
        "locked": false,
        "in_progress": "merge"|"cherry-pick"|"rebase"|""
      },
      ...
    ],
    "match": {<命中的 worktree 对象>} | null   # 仅 --branch / --in-progress 时
  }

返回码:
  0 = 成功（含 match 为 null 的"找不到"情况）
  2 = 用法错误 / 无法列出 worktree（不在仓库等）

设计说明:
  - in_progress 通过读 worktree 自己的 git dir（rev-parse --git-dir）判定，跟当前 cwd 无关。
  - branch 字段优先用 `git worktree list --porcelain` 给出的 refs/heads/X，会 strip 前缀。
  - 不调用 git_utils.py，避免循环依赖；本脚本只用 stdlib 和 git CLI。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys


def parse_worktree_list() -> list[dict]:
    """解析 `git worktree list --porcelain` 输出，每条记录用空行分隔。"""
    res = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        capture_output=True, check=False,
    )
    if res.returncode != 0:
        return []
    text = res.stdout.decode("utf-8", "replace")
    worktrees: list[dict] = []
    for grp in text.split("\n\n"):
        if not grp.strip():
            continue
        wt = {
            "path": "", "branch": "", "head": "",
            "bare": False, "detached": False, "locked": False,
        }
        for line in grp.splitlines():
            if line.startswith("worktree "):
                wt["path"] = line[len("worktree "):]
            elif line.startswith("HEAD "):
                wt["head"] = line[len("HEAD "):]
            elif line.startswith("branch "):
                ref = line[len("branch "):]
                if ref.startswith("refs/heads/"):
                    ref = ref[len("refs/heads/"):]
                wt["branch"] = ref
            elif line == "bare":
                wt["bare"] = True
            elif line == "detached":
                wt["detached"] = True
            elif line.startswith("locked"):
                wt["locked"] = True
        if wt["path"]:
            worktrees.append(wt)
    return worktrees


def detect_in_progress(worktree_path: str) -> str:
    """检查指定 worktree 自己的 git dir 中是否存在 in-progress 标记。"""
    res = subprocess.run(
        ["git", "-C", worktree_path, "rev-parse", "--git-dir"],
        capture_output=True, check=False,
    )
    if res.returncode != 0:
        return ""
    git_dir = res.stdout.decode("utf-8", "replace").strip()
    if not git_dir:
        return ""
    if not os.path.isabs(git_dir):
        git_dir = os.path.join(worktree_path, git_dir)

    if os.path.exists(os.path.join(git_dir, "MERGE_HEAD")):
        return "merge"
    if os.path.exists(os.path.join(git_dir, "CHERRY_PICK_HEAD")):
        return "cherry-pick"
    if os.path.exists(os.path.join(git_dir, "REBASE_HEAD")):
        return "rebase"
    if os.path.isdir(os.path.join(git_dir, "rebase-merge")):
        return "rebase"
    if os.path.isdir(os.path.join(git_dir, "rebase-apply")):
        return "rebase"
    return ""


def find_current(worktrees: list[dict]) -> str:
    """返回 cwd 所属的 worktree 路径；不在任何 worktree 里返回空字符串。"""
    cwd = os.path.realpath(os.getcwd())
    best = ""
    best_len = -1
    for wt in worktrees:
        if not wt["path"]:
            continue
        wt_real = os.path.realpath(wt["path"])
        if cwd == wt_real or cwd.startswith(wt_real + os.sep):
            if len(wt_real) > best_len:
                best = wt["path"]
                best_len = len(wt_real)
    return best


def main() -> int:
    args = sys.argv[1:]

    branch = None
    want_in_progress = False
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--branch":
            if i + 1 >= len(args):
                print("--branch requires a value", file=sys.stderr)
                return 2
            branch = args[i + 1]
            if branch.startswith("refs/heads/"):
                branch = branch[len("refs/heads/"):]
            i += 2
        elif a == "--in-progress":
            want_in_progress = True
            i += 1
        else:
            print(f"unknown arg: {a}", file=sys.stderr)
            return 2

    worktrees = parse_worktree_list()
    if not worktrees:
        print(
            "ERROR: failed to list worktrees (not in a git repo?)",
            file=sys.stderr,
        )
        return 2

    for wt in worktrees:
        if wt["bare"]:
            wt["in_progress"] = ""
        else:
            wt["in_progress"] = detect_in_progress(wt["path"])

    out: dict = {
        "current_path": find_current(worktrees),
        "worktrees": worktrees,
    }

    if branch is not None:
        match = None
        for wt in worktrees:
            if wt["branch"] == branch:
                match = wt
                break
        out["match"] = match
    elif want_in_progress:
        match = None
        for wt in worktrees:
            if wt.get("in_progress"):
                match = wt
                break
        out["match"] = match

    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
