# -*- coding: utf-8 -*-
"""Path jail helpers for execution sandbox enforcement."""
from __future__ import annotations

import os
from pathlib import Path

from ...constant import WORKING_DIR, EnvVarLoader
from ...config.context import get_current_workspace_dir

_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})


class SandboxBoundaryError(PermissionError):
    """Raised when a path escapes the configured sandbox root."""


def is_sandbox_enabled() -> bool:
    """Return whether execution sandbox enforcement is active."""
    if (
        "QWENPAW_EXECUTION_SANDBOX_ENABLED" in os.environ
        or "COPAW_EXECUTION_SANDBOX_ENABLED" in os.environ
    ):
        env_val = EnvVarLoader.get_str("QWENPAW_EXECUTION_SANDBOX_ENABLED")
        return env_val.strip().lower() in _TRUE_STRINGS

    try:
        from qwenpaw.config import load_config

        cfg = load_config().security.execution_sandbox
        return bool(cfg.enabled and cfg.backend != "off")
    except Exception:
        return False


def load_use_user_subdir() -> bool:
    """Return whether user-scoped sandbox subdirectories are enabled."""
    try:
        from qwenpaw.config import load_config

        return bool(load_config().security.execution_sandbox.use_user_subdir)
    except Exception:
        return True


def _normalize_compare_path(path: Path) -> str:
    """Normalize a path for stable boundary comparisons."""
    resolved = path.expanduser().resolve(strict=False)
    if os.name == "nt":
        return str(resolved).replace("\\", "/").lower()
    return str(resolved)


def is_path_in_jail(abs_path: str | Path, sandbox_root: str | Path) -> bool:
    """Return True when *abs_path* is inside *sandbox_root*."""
    if not abs_path or not sandbox_root:
        return False
    try:
        target = Path(abs_path).expanduser().resolve(strict=False)
        root = Path(sandbox_root).expanduser().resolve(strict=False)
    except (OSError, ValueError):
        return False

    if os.name == "nt":
        target_cmp = _normalize_compare_path(target)
        root_cmp = _normalize_compare_path(root)
        if target_cmp == root_cmp:
            return True
        prefix = root_cmp.rstrip("/") + "/"
        return target_cmp.startswith(prefix)

    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def resolve_path_in_jail(
    raw_path: str,
    sandbox_root: Path,
    *,
    workspace_dir: Path | None = None,
) -> Path:
    """Resolve *raw_path* relative to workspace, then validate jail boundary."""
    if not raw_path or not str(raw_path).strip():
        raise SandboxBoundaryError("Empty path is not allowed in sandbox mode")

    path = Path(raw_path).expanduser()
    if path.is_absolute():
        resolved = path.resolve(strict=False)
    else:
        base = workspace_dir or get_current_workspace_dir() or WORKING_DIR
        resolved = (Path(base) / path).resolve(strict=False)

    if not is_path_in_jail(resolved, sandbox_root):
        raise SandboxBoundaryError(
            f"Path '{resolved}' is outside sandbox boundary '{sandbox_root}'",
        )
    return resolved


def assert_path_in_jail(
    abs_path: str | Path,
    sandbox_root: str | Path,
) -> None:
    """Raise :class:`SandboxBoundaryError` if *abs_path* escapes the jail."""
    if not is_path_in_jail(abs_path, sandbox_root):
        raise SandboxBoundaryError(
            f"Path '{abs_path}' is outside sandbox boundary '{sandbox_root}'",
        )
