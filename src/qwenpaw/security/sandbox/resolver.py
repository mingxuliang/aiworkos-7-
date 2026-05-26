# -*- coding: utf-8 -*-
"""Resolve per-user sandbox directory roots under an agent workspace."""
from __future__ import annotations

import re
from pathlib import Path

_DEFAULT_USER_IDS = frozenset({"", "default"})

_SAFE_USER_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def sanitize_user_id(user_id: str) -> str:
    """Return a filesystem-safe user id segment."""
    raw = (user_id or "").strip()
    if not raw or raw in _DEFAULT_USER_IDS:
        return ""
    if _SAFE_USER_ID_RE.fullmatch(raw):
        return raw
    # Fallback: replace unsafe chars with underscore.
    return re.sub(r"[^A-Za-z0-9._-]", "_", raw) or "user"


def resolve_sandbox_root(
    workspace_dir: Path,
    user_id: str,
    *,
    use_user_subdir: bool = True,
) -> Path:
    """Resolve the sandbox root directory for tool execution.

    When ``use_user_subdir`` is enabled and *user_id* is a real user,
    returns ``workspace_dir/users/{user_id}/``. Otherwise returns the
    agent workspace root.
    """
    root = Path(workspace_dir).expanduser().resolve()
    safe_uid = sanitize_user_id(user_id)
    if use_user_subdir and safe_uid:
        sandbox = root / "users" / safe_uid
    else:
        sandbox = root
    sandbox.mkdir(parents=True, exist_ok=True)
    return sandbox.resolve()
