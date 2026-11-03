#!/usr/bin/env python3
"""
A/B 模式共用的 git 工具函数。

从 preflight.py 和 list_conflicts.py 中抽取的公共代码，避免重复。
只用 stdlib，不依赖外部包。
"""

from __future__ import annotations

import re
import subprocess

from feature_classify import classify_file, is_lockfile


PSEUDO_REFS = {
    "HEAD", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REBASE_HEAD",
    "FETCH_HEAD", "ORIG_HEAD",
}


def git_run(*args: str, check: bool = True) -> str:
    """执行 git 命令并返回 stdout。check=True 时失败抛 RuntimeError。"""
    res = subprocess.run(["git", *args], capture_output=True, check=False)
    if check and res.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed: "
            f"{res.stderr.decode('utf-8', 'replace').strip()}"
        )
    return res.stdout.decode("utf-8", "replace")


def in_repo() -> bool:
    """检查当前目录是否在 git 仓库内。"""
    return subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        capture_output=True, check=False,
    ).returncode == 0


def git_version_tuple() -> tuple[int, int, int]:
    """返回 git 版本号元组，用于版本比较。"""
    out = git_run("--version").strip()
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", out)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (0, 0, 0)


def git_version_str() -> str:
    """返回 git 版本号字符串，用于 JSON 输出。"""
    ver = git_version_tuple()
    return ".".join(str(v) for v in ver)


def ref_exists(ref: str) -> bool:
    """检查 git ref 是否存在。"""
    return subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", ref],
        capture_output=True, check=False,
    ).returncode == 0


def detect_branch_name(ref: str) -> str:
    """将 ref 解析为人类可读的分支名；失败时返回原始 ref 字符串。
    rev-parse --abbrev-ref 对 MERGE_HEAD 这类伪 ref 会原样返回, 失败时退到 name-rev。
    对普通分支名 (master / feat/x) 应直接信任 --abbrev-ref 输出, 不能再走 name-rev,
    否则 name-rev 会取另一个指向同 SHA 的分支名 (踩过的坑)。"""
    res = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", ref],
        capture_output=True, check=False,
    )
    name = res.stdout.decode("utf-8", "replace").strip() if res.returncode == 0 else ""
    if name and name != "HEAD" and name not in PSEUDO_REFS:
        return name
    # 伪 ref / 游离 HEAD: 退到 name-rev
    res = subprocess.run(
        ["git", "name-rev", "--name-only", "--no-undefined", ref],
        capture_output=True, check=False,
    )
    name = res.stdout.decode("utf-8", "replace").strip() if res.returncode == 0 else ""
    if name:
        for prefix in ("tags/", "remotes/", "heads/"):
            if name.startswith(prefix):
                name = name[len(prefix):]
                break
        return name
    return ref


def commits_for_file(rev_range: str, file: str) -> list[dict]:
    """获取 rev_range 内修改了 file 的 commit 列表 [{sha, subject}]。NUL 分隔字段。"""
    res = subprocess.run(
        ["git", "log", "--no-merges", "--format=%H%x00%s%x00", rev_range, "--", file],
        capture_output=True, check=False,
    )
    if res.returncode != 0:
        return []
    parts = res.stdout.split(b"\x00")
    out: list[dict] = []
    i = 0
    while i + 1 < len(parts):
        sha = parts[i].decode("utf-8", "replace").strip()
        subject = parts[i + 1].decode("utf-8", "replace").strip()
        if sha:
            out.append({"sha": sha[:12], "subject": subject})
        i += 2
        if i < len(parts) and parts[i] == b"":
            i += 1
    return out


def merge_base(ours: str, theirs: str) -> str:
    """获取两个 ref 的 merge-base SHA。失败时返回空字符串。"""
    res = subprocess.run(
        ["git", "merge-base", ours, theirs],
        capture_output=True, check=False,
    )
    return res.stdout.decode("utf-8", "replace").strip() if res.returncode == 0 else ""


def build_file_metas(
    conflicts: list[tuple[str, str]],
    merge_base_sha: str,
    ours: str,
    theirs: str,
) -> list[dict]:
    """为冲突文件列表构建 file_metas，包含 commit 信息和 feature 分类。"""
    file_metas = []
    for file, ctype in conflicts:
        if merge_base_sha:
            ours_commits = commits_for_file(f"{merge_base_sha}..{ours}", file)
            theirs_commits = commits_for_file(f"{merge_base_sha}..{theirs}", file)
        else:
            ours_commits = []
            theirs_commits = []
        feat = classify_file(file, ours_commits, theirs_commits)
        file_metas.append({
            "file": file,
            "type": ctype,
            "is_lockfile": is_lockfile(file),
            "primary_feature": feat["primary_feature"],
            "all_features": feat["all_features"],
            "ours_commits": ours_commits,
            "theirs_commits": theirs_commits,
        })
    return file_metas


def bucket_by_feature(file_metas: list[dict]) -> list[dict]:
    """按 primary_feature 分桶，保留首次出现顺序。"""
    buckets: dict[str, list[dict]] = {}
    order: list[str] = []
    for fm in file_metas:
        fid = fm["primary_feature"]
        if fid not in buckets:
            buckets[fid] = []
            order.append(fid)
        buckets[fid].append(fm)

    features = []
    for fid in order:
        files_meta = buckets[fid]
        features.append({
            "feature_id": fid,
            "feature_name": fid,
            "affected_files": [m["file"] for m in files_meta],
            "_files_meta": files_meta,
        })
    return features


OPTIONS = [
    {"value": "keep_source", "label": "保留源分支"},
    {"value": "keep_target", "label": "保留目标分支"},
    {"value": "keep_both",   "label": "智能合并"},
    {"value": "manual",      "label": "手动处理（提供自定义方案）"},
]


def build_output(
    source_branch: str,
    target_branch: str,
    merge_base_sha: str,
    git_ver: str,
    clean: bool,
    ours_ref: str,
    theirs_ref: str,
    features: list[dict],
) -> dict:
    """构建最终 JSON 输出结构。"""
    return {
        "title": "代码合并冲突",
        "source_branch": source_branch,
        "target_branch": target_branch,
        "_meta": {
            "merge_base": merge_base_sha,
            "git_version": git_ver,
            "clean": clean,
            "ours_ref": ours_ref,
            "theirs_ref": theirs_ref,
        },
        "features": features,
        "options": OPTIONS,
    }
