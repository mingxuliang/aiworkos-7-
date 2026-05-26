# -*- coding: utf-8 -*-
"""Context variable for the current tool execution sandbox root."""
from __future__ import annotations

from contextvars import ContextVar
from pathlib import Path

current_sandbox_root: ContextVar[Path | None] = ContextVar(
    "current_sandbox_root",
    default=None,
)


def get_current_sandbox_root() -> Path | None:
    """Return the active sandbox root for the current tool execution."""
    return current_sandbox_root.get()


def set_current_sandbox_root(root: Path | None) -> None:
    """Set the sandbox root for the current async context."""
    current_sandbox_root.set(root)
