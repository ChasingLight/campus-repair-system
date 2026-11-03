#!/usr/bin/env python3
"""
Fast structural validation for a Coze skill package.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

DEFAULT_ROOT = Path("/workspace/projects")
ALLOWED_FRONTMATTER_KEYS = {"name", "description", "license", "allowed-tools", "metadata"}
OPTIONAL_NOISE_FILES = {
    "README.md",
    "CHANGELOG.md",
    "INSTALLATION_GUIDE.md",
    "QUICK_REFERENCE.md",
}
MAX_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024


def extract_frontmatter(text: str) -> str:
    match = re.match(r"^---\n(.*?)\n---\n?", text, re.DOTALL)
    if not match:
        raise ValueError("SKILL.md 缺少 YAML 前言区")
    return match.group(1)


def parse_frontmatter_block(frontmatter_text: str) -> dict:
    try:
        import yaml  # type: ignore
    except ImportError:
        yaml = None

    if yaml is not None:
        parsed = yaml.safe_load(frontmatter_text)
        if not isinstance(parsed, dict):
            raise ValueError("前言区必须解析为 YAML 映射")
        return parsed

    parsed: dict[str, str] = {}
    for raw_line in frontmatter_text.splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if raw_line.startswith((" ", "\t")):
            continue
        if ":" not in raw_line:
            raise ValueError("前言区存在格式错误的顶层字段")
        key, value = raw_line.split(":", 1)
        parsed[key.strip()] = value.strip().strip('"').strip("'")
    return parsed


def validate_frontmatter(frontmatter: dict, expected_name: str) -> list[str]:
    issues: list[str] = []

    unexpected = sorted(set(frontmatter) - ALLOWED_FRONTMATTER_KEYS)
    if unexpected:
        issues.append(
            "前言区存在未允许字段: "
            + ", ".join(unexpected)
        )

    name = frontmatter.get("name")
    description = frontmatter.get("description")

    if not isinstance(name, str) or not name.strip():
        issues.append("前言区 `name` 必须为非空字符串")
    else:
        clean_name = name.strip()
        if not re.fullmatch(r"[a-z0-9-]+", clean_name):
            issues.append("前言区 `name` 必须使用小写连字符格式")
        if clean_name.endswith("-skill"):
            issues.append("前言区 `name` 不能以 `-skill` 结尾")
        if len(clean_name) > MAX_NAME_LENGTH:
            issues.append(
                f"前言区 `name` 长度超限 ({len(clean_name)} > {MAX_NAME_LENGTH})"
            )
        if clean_name != expected_name:
            issues.append(
                f"前言区 `name` 与目录名不一致: {clean_name} != {expected_name}"
            )

    if not isinstance(description, str) or not description.strip():
        issues.append("前言区 `description` 必须为非空字符串")
    else:
        clean_description = description.strip()
        if "\n" in description or "\r" in description:
            issues.append("前言区 `description` 必须保持单行")
        if len(clean_description) > MAX_DESCRIPTION_LENGTH:
            issues.append(
                "前言区 `description` 长度超限 "
                f"({len(clean_description)} > {MAX_DESCRIPTION_LENGTH})"
            )
        if "<" in clean_description or ">" in clean_description:
            issues.append("前言区 `description` 不能包含尖括号")
        if "TODO" in clean_description.upper():
            issues.append("前言区 `description` 不能包含 TODO 占位内容")

    return issues


def discover_noise_files(skill_dir: Path) -> list[str]:
    warnings: list[str] = []
    for path in skill_dir.rglob("*"):
        if path.is_file() and path.name in OPTIONAL_NOISE_FILES:
            warnings.append(
                f"检测到额外说明文档: {path.relative_to(skill_dir)}"
            )
    return warnings


def maybe_validate_root(skill_dir: Path, explicit_root: str | None) -> list[str]:
    issues: list[str] = []
    root_value = explicit_root or os.environ.get("COZE_WORKSPACE_PATH", "").strip()
    if not root_value:
        return issues

    root = Path(root_value).expanduser().resolve()
    try:
        skill_dir.resolve().relative_to(root)
    except ValueError:
        issues.append(f"Skill 目录不在工作区根目录下: {root}")
    return issues


def validate_skill(skill_dir: Path, explicit_root: str | None) -> tuple[list[str], list[str]]:
    issues: list[str] = []
    warnings: list[str] = []

    if not skill_dir.exists():
        return [f"Skill 目录不存在: {skill_dir}"], warnings
    if not skill_dir.is_dir():
        return [f"目标路径不是目录: {skill_dir}"], warnings

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return ["缺少 `SKILL.md`"], warnings

    content = skill_md.read_text(encoding="utf-8")
    try:
        frontmatter = parse_frontmatter_block(extract_frontmatter(content))
    except ValueError as exc:
        issues.append(str(exc))
        return issues, warnings

    issues.extend(validate_frontmatter(frontmatter, skill_dir.name))
    issues.extend(maybe_validate_root(skill_dir, explicit_root))
    warnings.extend(discover_noise_files(skill_dir))

    return issues, warnings


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验 Coze Skill 包结构。")
    parser.add_argument("skill_dir", help="待校验的 Skill 目录路径")
    parser.add_argument(
        "--root",
        help="预期的工作区根目录，默认取 $COZE_WORKSPACE_PATH",
    )
    parser.add_argument(
        "--show-default-root",
        action="store_true",
        help="输出平台默认工作区目录后退出",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.show_default_root:
        print(DEFAULT_ROOT)
        return 0

    issues, warnings = validate_skill(Path(args.skill_dir), args.root)

    for warning in warnings:
        print(f"[警告] {warning}")

    if issues:
        for issue in issues:
            print(f"[错误] {issue}")
        return 1

    print("Skill 包校验通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
