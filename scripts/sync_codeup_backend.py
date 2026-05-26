#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync Codeup AIWork-OS backend (src/aiwork) into local src/qwenpaw."""

from __future__ import annotations

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CODEUP_ROOT = PROJECT_ROOT / "AIWork-OS-main-651e58390334b7e54f5b72bf1914315f62850e76"
SRC_CODEUP = CODEUP_ROOT / "src" / "aiwork"
DST_LOCAL = PROJECT_ROOT / "src" / "qwenpaw"

TEXT_SUFFIXES = {
    ".py",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".txt",
    ".html",
    ".css",
    ".less",
    ".js",
    ".ts",
    ".tsx",
    ".sh",
    ".bat",
    ".ps1",
    ".template",
    ".toml",
    ".ini",
    ".cfg",
    ".xml",
    ".svg",
    ".xsd",
    ".skill",
}


def transform_text(content: str) -> str:
    """Map Codeup aiwork branding to local qwenpaw conventions."""
    replacements = [
        ("AIWORK_", "QWENPAW_"),
        ("~/.aiwork", "~/.qwenpaw"),
        ("/.aiwork", "/.qwenpaw"),
        (".aiwork.", ".qwenpaw."),
        ("~mod:`~aiwork.", "~mod:`~qwenpaw."),
        (":mod:`~aiwork.", ":mod:`~qwenpaw."),
        ("from aiwork", "from qwenpaw"),
        ("import aiwork", "import qwenpaw"),
        ("python -m aiwork", "python -m qwenpaw"),
        ("run_aiwork_", "run_qwenpaw_"),
        ("``aiwork ", "``qwenpaw "),
        ("`aiwork ", "`qwenpaw "),
        ('"aiwork:', '"qwenpaw:'),
        ("'aiwork:", "'qwenpaw:"),
        ('"aiwork.', '"qwenpaw.'),
        ("'aiwork.", "'qwenpaw."),
        ('"aiwork-', '"qwenpaw-'),
        ("'aiwork-", "'qwenpaw-"),
        (" aiwork.", " qwenpaw."),
        (" aiwork ", " qwenpaw "),
        ("name=\"aiwork\"", "name=\"qwenpaw\""),
        ("aiwork.agentscope.io", "qwenpaw.agentscope.io"),
        ("/aiwork-symbol.svg", "/qwenpaw-symbol.svg"),
        ("AiWork", "QwenPaw"),
        # Keep MySQL schema name ``/aiwork`` in default JDBC URLs unchanged.
    ]
    for old, new in replacements:
        content = content.replace(old, new)
    return content


def sync_tree() -> tuple[int, int]:
    if not SRC_CODEUP.is_dir():
        raise SystemExit(f"Codeup source not found: {SRC_CODEUP}")

    copied = 0
    transformed = 0
    for src_path in SRC_CODEUP.rglob("*"):
        if src_path.is_dir():
            continue
        if "__pycache__" in src_path.parts:
            continue

        rel = src_path.relative_to(SRC_CODEUP)
        dst_path = DST_LOCAL / rel
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.suffix.lower() in TEXT_SUFFIXES or src_path.name in {
            "Dockerfile",
            "Makefile",
            "LICENSE",
        }:
            raw = src_path.read_text(encoding="utf-8")
            dst_path.write_text(transform_text(raw), encoding="utf-8")
            transformed += 1
        else:
            shutil.copy2(src_path, dst_path)
            copied += 1

    return copied, transformed


def restore_local_patches() -> None:
    """Re-apply local-only integrations after bulk sync."""
    init_path = DST_LOCAL / "app" / "routers" / "__init__.py"
    text = init_path.read_text(encoding="utf-8")
    if "rss_proxy" not in text:
        text = text.replace(
            "from .plan import router as plan_router\n",
            "from .plan import router as plan_router\n"
            "from .rss_proxy import router as rss_proxy_router\n",
        )
        text = text.replace(
            "router.include_router(plan_router)\n",
            "router.include_router(plan_router)\n"
            "router.include_router(rss_proxy_router)\n",
        )
        init_path.write_text(text, encoding="utf-8")

    constant_path = DST_LOCAL / "constant.py"
    constant = constant_path.read_text(encoding="utf-8")
    legacy_get_env = '''def _get_env(key: str, default: str = "") -> str:
    """Look up an env var with automatic COPAW_ legacy fallback.

    Primary key is always used as-is.  When the primary key starts with
    ``QWENPAW_``, the corresponding ``COPAW_`` variant is transparently
    checked as a fallback so that existing deployments keep working.
    """
    if key in os.environ:
        return os.environ[key]
    if key.startswith("QWENPAW_"):
        legacy_key = "COPAW_" + key[len("QWENPAW_") :]
        if legacy_key in os.environ:
            return os.environ[legacy_key]
    return default'''
    if "COPAW_ legacy fallback" not in constant:
        constant = constant.replace(
            '''def _get_env(key: str, default: str = "") -> str:
    """Look up an env var.
    """
    return os.environ.get(key, default)''',
            legacy_get_env,
        )
        constant = constant.replace(
            "and defaults. Pass QWENPAW_* keys.",
            "and defaults.  Pass QWENPAW_* keys; COPAW_* legacy variants are\n"
            "    checked automatically as a fallback inside _get_env.",
        )
        constant_path.write_text(constant, encoding="utf-8")

    # db migrate helper script
    src_migrate = CODEUP_ROOT / "scripts" / "db_migrate.py"
    dst_migrate = PROJECT_ROOT / "scripts" / "db_migrate.py"
    if src_migrate.is_file():
        dst_migrate.write_text(
            transform_text(src_migrate.read_text(encoding="utf-8")),
            encoding="utf-8",
        )


def main() -> None:
    copied, transformed = sync_tree()
    restore_local_patches()
    print(f"Synced {transformed} text files and {copied} binary files")
    print(f"Source: {SRC_CODEUP}")
    print(f"Target: {DST_LOCAL}")


if __name__ == "__main__":
    main()
