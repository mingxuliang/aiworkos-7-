# -*- coding: utf-8 -*-
"""Execution sandbox helpers for tool path isolation."""
from .context import get_current_sandbox_root, set_current_sandbox_root
from .docker_runner import DockerSandboxRunner
from .models import SandboxRunResult
from .path_jail import (
    SandboxBoundaryError,
    assert_path_in_jail,
    is_path_in_jail,
    is_sandbox_enabled,
    load_use_user_subdir,
    resolve_path_in_jail,
)
from .resolver import resolve_sandbox_root, sanitize_user_id
from .settings import load_sandbox_settings, use_docker_shell_backend
from .status import ExecutionSandboxStatus, get_execution_sandbox_status

__all__ = [
    "DockerSandboxRunner",
    "ExecutionSandboxStatus",
    "SandboxBoundaryError",
    "SandboxRunResult",
    "assert_path_in_jail",
    "get_current_sandbox_root",
    "get_execution_sandbox_status",
    "is_path_in_jail",
    "is_sandbox_enabled",
    "load_sandbox_settings",
    "load_use_user_subdir",
    "resolve_path_in_jail",
    "resolve_sandbox_root",
    "sanitize_user_id",
    "set_current_sandbox_root",
    "use_docker_shell_backend",
]
