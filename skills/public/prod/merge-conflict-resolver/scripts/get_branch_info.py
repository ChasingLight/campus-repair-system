#!/usr/bin/env python3
"""
取双方分支名称、merge-base、以及给定文件在双方分支上自 base 之后的 commits。
输出 JSON, 字段:
  file, ours_ref, ours_branch, theirs_ref, theirs_branch, merge_base,
  ours_commits=[{sha, subject, body}], theirs_commits=[...]

用法: get_branch_info.py <file>

设计要点:
- 不再用 awk + 自定义分隔符。直接用 subprocess + git 的 --format='%x00' (NUL) 分隔记录,
  完全规避 commit body 含特殊字符炸掉的风险。
- ours_ref 默认 HEAD; theirs_ref 自动探测 MERGE_HEAD / CHERRY_PICK_HEAD / REBASE_HEAD。
- 找不到 theirs_ref 时, theirs_commits 返回空, 不抛异常 (避免阻塞主流程)。
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def git(*args: str, check: bool = True) -> str:
    res = subprocess.run(
        ["git", *args],
        capture_output=True,
        check=False,
    )
    if check and res.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed: {res.stderr.decode('utf-8', 'replace').strip()}"
        )
    return res.stdout.decode("utf-8", "replace")


def ref_exists(ref: str) -> bool:
    res = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", ref],
        capture_output=True,
        check=False,
    )
    return res.returncode == 0


def detect_theirs_ref() -> str | None:
    for cand in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REBASE_HEAD"):
        if ref_exists(cand):
            return cand
    return None


def commits_for_file(rev_range: str, file: str) -> list[dict]:
    """
    用 NUL 字段分隔(%x00)和 NUL 记录分隔(末尾再加 %x00)，避免任何文本字符冲突。
    每条记录格式: SHA \0 SUBJECT \0 BODY \0
    """
    fmt = "%H%x00%s%x00%b%x00"
    res = subprocess.run(
        ["git", "log", "--no-merges", f"--format={fmt}", rev_range, "--", file],
        capture_output=True,
        check=False,
    )
    if res.returncode != 0:
        # 路径不存在或 rev 范围空: 返回空列表而不是抛异常
        return []

    raw = res.stdout
    fields = raw.split(b"\x00")
    # 每条 commit 有 3 个字段(sha, subject, body) + 末尾 NUL 留空 -> 共 4 段
    out: list[dict] = []
    i = 0
    while i + 2 < len(fields):
        sha = fields[i].decode("utf-8", "replace").strip()
        subject = fields[i + 1].decode("utf-8", "replace")
        body = fields[i + 2].decode("utf-8", "replace").strip()
        if sha:
            out.append({"sha": sha, "subject": subject, "body": body})
        i += 3
        # 跳过末尾每条记录后的空字段 (终止 NUL 之后的 split 残留)
        if i < len(fields) and fields[i] == b"":
            i += 1
    return out


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: get_branch_info.py <file>", file=sys.stderr)
        return 2
    file = sys.argv[1]

    if not subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        capture_output=True,
        check=False,
    ).returncode == 0:
        print("ERROR: not inside a git repository", file=sys.stderr)
        return 2

    ours_ref = "HEAD"
    theirs_ref = detect_theirs_ref()

    ours_branch = git("rev-parse", "--abbrev-ref", ours_ref, check=False).strip() or ours_ref
    theirs_branch = ""
    merge_base = ""
    theirs_commits: list[dict] = []
    if theirs_ref:
        theirs_branch = git("name-rev", "--name-only", theirs_ref, check=False).strip() or theirs_ref
        merge_base_res = subprocess.run(
            ["git", "merge-base", ours_ref, theirs_ref],
            capture_output=True,
            check=False,
        )
        if merge_base_res.returncode == 0:
            merge_base = merge_base_res.stdout.decode("utf-8", "replace").strip()

    ours_commits: list[dict] = []
    if merge_base:
        ours_commits = commits_for_file(f"{merge_base}..{ours_ref}", file)
        if theirs_ref:
            theirs_commits = commits_for_file(f"{merge_base}..{theirs_ref}", file)

    out = {
        "file": file,
        "ours_ref": ours_ref,
        "ours_branch": ours_branch,
        "theirs_ref": theirs_ref or "",
        "theirs_branch": theirs_branch,
        "merge_base": merge_base,
        "ours_commits": ours_commits,
        "theirs_commits": theirs_commits,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
