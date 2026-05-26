# -*- coding: utf-8 -*-
"""Context variables for execution sandbox runtime overrides."""
from __future__ import annotations

from contextvars import ContextVar
from pathlib import Path

current_sandbox_root: ContextVar[Path | None] = ContextVar(
    "current_sandbox_root",
    default=None,
)
current_sandbox_enabled_override: ContextVar[bool | None] = ContextVar(
    "current_sandbox_enabled_override",
    default=None,
)

_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})
_FALSE_STRINGS = frozenset({"false", "0", "no", "off"})


def get_current_sandbox_root() -> Path | None:
    """Return the active sandbox root for the current tool execution."""
    return current_sandbox_root.get()


def set_current_sandbox_root(root: Path | None) -> None:
    """Set the sandbox root for the current async context."""
    current_sandbox_root.set(root)


def get_sandbox_enabled_override() -> bool | None:
    """Return per-request sandbox override, if any."""
    return current_sandbox_enabled_override.get()


def set_sandbox_enabled_override(enabled: bool | None) -> None:
    """Set per-request sandbox override for the current async context."""
    current_sandbox_enabled_override.set(enabled)


def parse_sandbox_enabled_value(value: object) -> bool | None:
    """Parse a request payload value into a sandbox enabled flag."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in _TRUE_STRINGS:
            return True
        if normalized in _FALSE_STRINGS:
            return False
    return None
