#!/usr/bin/env python3
"""
Scaffold a Coze skill inside the fixed workspace root.

Usage:
    init_skill.py <skill-name>
    init_skill.py <skill-name> --resources scripts,references
    init_skill.py <skill-name> --root /tmp/coze-workspace
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

DEFAULT_ROOT = Path("/workspace/projects")
VALID_RESOURCE_DIRS = ("scripts", "references", "assets")
MAX_NAME_LENGTH = 64

SKILL_TEMPLATE = """---
name: {skill_name}
description: 说明这个 Skill 的能力价值；当用户需要某几类具体任务时使用，保持单行描述。
---

# {title}

## 概述

- 说明这个 Skill 能解决什么问题。
- 用一两句话写清它的核心价值。

## 何时使用

- 写哪些用户请求、文件类型或上下文会触发这个 Skill。
- 避免写得过于宽泛。

## 工作方式

1. 写智能体应当如何开始这个任务。
2. 写核心流程或关键判断。
3. 写何时读取参考文件或调用脚本。

## 资源索引

- 如果存在脚本，在这里列出 `scripts/...` 的用途。
- 如果存在参考文档，在这里列出 `references/...` 的触发条件。
- 重要参考文件尽量都在这里直接索引，避免多层嵌套路由。
- 写索引时顺手说明“什么场景下读取这个文件”。

## 注意事项

- 写清楚不能违反的规则。
- 删除所有占位内容后再交付。
"""


def normalize_name(raw_name: str) -> str:
    lowered = raw_name.strip().lower()
    collapsed = re.sub(r"[^a-z0-9]+", "-", lowered)
    normalized = re.sub(r"-{2,}", "-", collapsed).strip("-")
    return normalized


def title_from_name(skill_name: str) -> str:
    return " ".join(part.capitalize() for part in skill_name.split("-"))


def resolve_root(root_arg: str | None) -> Path:
    if root_arg:
        return Path(root_arg).expanduser().resolve()
    env_root = os.environ.get("COZE_WORKSPACE_PATH", "").strip()
    if env_root:
        return Path(env_root).expanduser().resolve()
    return DEFAULT_ROOT


def parse_resources(raw_value: str) -> list[str]:
    if not raw_value:
        return []

    seen: set[str] = set()
    ordered: list[str] = []

    for entry in raw_value.split(","):
        item = entry.strip()
        if not item:
            continue
        if item not in VALID_RESOURCE_DIRS:
            allowed = ", ".join(VALID_RESOURCE_DIRS)
            raise ValueError(f"未知资源目录 '{item}'，允许值为: {allowed}")
        if item not in seen:
            seen.add(item)
            ordered.append(item)

    return ordered


def ensure_name_is_valid(skill_name: str) -> None:
    if not skill_name:
        raise ValueError("Skill 名称在规范化后为空")
    if skill_name.endswith("-skill"):
        raise ValueError("Skill 名称不能以 '-skill' 结尾")
    if len(skill_name) > MAX_NAME_LENGTH:
        raise ValueError(
            f"Skill 名称长度为 {len(skill_name)}，超过上限 {MAX_NAME_LENGTH}"
        )
    if not re.fullmatch(r"[a-z0-9-]+", skill_name):
        raise ValueError("Skill 名称只能包含小写字母、数字和连字符")


def target_path(root: Path, skill_name: str) -> Path:
    destination = (root / skill_name).resolve()
    try:
        destination.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError("Skill 路径越出了工作区根目录") from exc
    return destination


def write_file(path: Path, content: str, executable: bool = False) -> None:
    path.write_text(content, encoding="utf-8")
    if executable:
        path.chmod(0o755)


def create_optional_resources(
    skill_dir: Path,
    resources: list[str],
) -> None:
    for resource in resources:
        resource_dir = skill_dir / resource
        resource_dir.mkdir(exist_ok=True)


def scaffold_skill(
    raw_name: str,
    root: Path,
    resources: list[str],
    allow_existing: bool,
) -> Path:
    skill_name = normalize_name(raw_name)
    ensure_name_is_valid(skill_name)

    root.mkdir(parents=True, exist_ok=True)
    skill_dir = target_path(root, skill_name)

    if skill_dir.exists():
        existing_entries = list(skill_dir.iterdir())
        if existing_entries and not allow_existing:
            raise FileExistsError(
                f"目标目录已存在且非空: {skill_dir}"
            )
    else:
        skill_dir.mkdir(parents=True)

    write_file(
        skill_dir / "SKILL.md",
        SKILL_TEMPLATE.format(skill_name=skill_name, title=title_from_name(skill_name)),
    )
    create_optional_resources(
        skill_dir,
        resources,
    )
    return skill_dir


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="在 Coze 工作区下初始化 Skill 目录。"
    )
    parser.add_argument("skill_name", help="Skill 名称，会被规范化为小写连字符格式")
    parser.add_argument(
        "--root",
        help="工作区根目录，默认取 $COZE_WORKSPACE_PATH 或 /workspace/projects",
    )
    parser.add_argument(
        "--resources",
        default="",
        help="按逗号分隔的可选目录: scripts,references,assets",
    )
    parser.add_argument(
        "--allow-existing",
        action="store_true",
        help="允许写入已存在的目录，而不是直接报错",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        root = resolve_root(args.root)
        resources = parse_resources(args.resources)
        skill_dir = scaffold_skill(
            raw_name=args.skill_name,
            root=root,
            resources=resources,
            allow_existing=args.allow_existing,
        )
    except (ValueError, FileExistsError) as exc:
        print(f"[错误] {exc}", file=sys.stderr)
        return 1

    print(f"[完成] 已创建 Skill 骨架: {skill_dir}")
    print(f"[完成] 必需文件: {skill_dir / 'SKILL.md'}")
    if resources:
        print(f"[完成] 已创建可选目录: {', '.join(resources)}")
    else:
        print("[完成] 未创建额外资源目录")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
