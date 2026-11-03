#!/usr/bin/env python3
"""
A/B 模式共用的 feature 分类模块。

功能:
  parse_commit_subject(subject) -> dict
      解析 conventional commit subject。返回 {is_conventional, type, scope, desc}。
      只识别预定义 type 列表; 其它（含 "fix"/"feat" 之外的常见 type 也都包含）。

  classify_file(file, ours_commits, theirs_commits) -> dict
      给一个冲突文件归类。返回:
        {
          "all_features": [...],      # 双方所有命中的 scope, source 侧优先
          "primary_feature": "..."    # 主功能, 决策广播到此 scope
        }

      规则 (满足任一即停):
        1. source(theirs) 侧有 scope-bearing commits
           -> primary = source 侧 commit 数最多的 scope (tiebreak: 字母序)
        2. source 侧没有, target(ours) 侧有
           -> primary = target 侧 commit 数最多的 scope (tiebreak: 字母序)
        3. 双方都没有 conventional scope
           -> primary = "dir:<top-2 path segments>"  (e.g. "dir:src/auth")

  is_lockfile(path) -> bool
      basename 在 LOCK_FILE_BASENAMES 集合里即为 lock 文件。

只用 stdlib，不依赖外部包。
"""

from __future__ import annotations

import os
import re
from typing import Optional

CONVENTIONAL_TYPES = {
    "feat", "fix", "refactor", "perf", "chore", "docs",
    "test", "build", "ci", "style", "revert",
}

# 例: "feat(login): xxx" / "fix: yyy" / "refactor(auth)!: zzz"
CC_RE = re.compile(
    r"^(?P<type>[a-z]+)(?:\((?P<scope>[^)]+)\))?!?:\s*(?P<desc>.*)$"
)

LOCK_FILE_BASENAMES = {
    # JavaScript / TypeScript
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "bun.lockb", "bun.lock",
    # Python
    "poetry.lock", "Pipfile.lock", "uv.lock", "pdm.lock",
}


def parse_commit_subject(subject: str) -> dict:
    """
    解析 commit subject。
    返回 {is_conventional: bool, type: str|None, scope: str|None, desc: str|None}
    is_conventional=True 仅当 type 在 CONVENTIONAL_TYPES 白名单内。
    scope 可能为 None (例: "refactor: foo")。
    """
    m = CC_RE.match(subject.strip())
    if not m:
        return {"is_conventional": False, "type": None, "scope": None, "desc": None}
    t = m.group("type")
    if t not in CONVENTIONAL_TYPES:
        return {"is_conventional": False, "type": None, "scope": None, "desc": None}
    return {
        "is_conventional": True,
        "type": t,
        "scope": m.group("scope"),
        "desc": m.group("desc"),
    }


def _collect_scope_counts(commits: list) -> dict:
    """从 commits 列表统计每个 scope 出现的次数。无 scope 的不计入。"""
    counts: dict[str, int] = {}
    for c in commits:
        parsed = parse_commit_subject(c.get("subject", ""))
        if parsed["is_conventional"] and parsed["scope"]:
            scope = parsed["scope"]
            counts[scope] = counts.get(scope, 0) + 1
    return counts


def _scopes_in_order(commits: list) -> list:
    """按出现顺序返回去重后的 scope 列表。"""
    out: list[str] = []
    seen: set[str] = set()
    for c in commits:
        parsed = parse_commit_subject(c.get("subject", ""))
        if parsed["is_conventional"] and parsed["scope"]:
            scope = parsed["scope"]
            if scope not in seen:
                seen.add(scope)
                out.append(scope)
    return out


def fallback_dir_group(file_path: str) -> str:
    parts = file_path.split("/")
    if len(parts) >= 2:
        return f"dir:{parts[0]}/{parts[1]}"
    return f"dir:{parts[0] if parts else 'root'}"


def classify_file(
    file_path: str,
    ours_commits: list,
    theirs_commits: list,
) -> dict:
    """
    给一个冲突文件归类。
    返回 {"all_features": [...], "primary_feature": "..."}
    """
    theirs_scopes = _scopes_in_order(theirs_commits)
    ours_scopes = _scopes_in_order(ours_commits)

    # all_features: source 侧优先, target 侧补差
    all_features: list[str] = list(theirs_scopes)
    for s in ours_scopes:
        if s not in all_features:
            all_features.append(s)

    if not all_features:
        primary = fallback_dir_group(file_path)
        return {"all_features": [primary], "primary_feature": primary}

    # primary 选择
    if theirs_scopes:
        counts = _collect_scope_counts(theirs_commits)
    else:
        counts = _collect_scope_counts(ours_commits)

    # 按 (count desc, scope asc) 排序, 取首
    primary = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    return {"all_features": all_features, "primary_feature": primary}


def is_lockfile(file_path: str) -> bool:
    return os.path.basename(file_path) in LOCK_FILE_BASENAMES
