# -*- coding: utf-8 -*-
"""Load execution sandbox settings from config and environment."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from ...constant import EnvVarLoader
from ...config.config import ExecutionSandboxConfig
from .context import get_sandbox_enabled_override

SandboxBackend = Literal["off", "local", "docker"]


@dataclass(frozen=True)
class ResolvedSandboxSettings:
    """Effective sandbox settings after env overrides."""

    enabled: bool
    backend: SandboxBackend
    use_user_subdir: bool
    fail_closed: bool
    fallback_backend: Literal["off", "local"]
    docker_image: str
    docker_network: Literal["none", "bridge"]
    docker_memory: str
    docker_cpus: str
    docker_pids_limit: int
    docker_timeout_seconds: int


_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})


def _env_enabled() -> bool | None:
    if (
        "QWENPAW_EXECUTION_SANDBOX_ENABLED" not in os.environ
        and "COPAW_EXECUTION_SANDBOX_ENABLED" not in os.environ
    ):
        return None
    raw = EnvVarLoader.get_str("QWENPAW_EXECUTION_SANDBOX_ENABLED")
    return raw.strip().lower() in _TRUE_STRINGS


def _env_backend() -> SandboxBackend | None:
    if (
        "QWENPAW_EXECUTION_SANDBOX_BACKEND" not in os.environ
        and "COPAW_EXECUTION_SANDBOX_BACKEND" not in os.environ
    ):
        return None
    raw = EnvVarLoader.get_str("QWENPAW_EXECUTION_SANDBOX_BACKEND")
    value = raw.strip().lower()
    if value in {"off", "local", "docker"}:
        return value  # type: ignore[return-value]
    return None


def _load_config() -> ExecutionSandboxConfig:
    from qwenpaw.config import load_config

    return load_config().security.execution_sandbox


def load_sandbox_settings() -> ResolvedSandboxSettings:
    """Resolve sandbox settings with env var overrides."""
    cfg = _load_config()
    override = get_sandbox_enabled_override()
    if override is not None:
        enabled = override
    else:
        enabled = _env_enabled() if _env_enabled() is not None else cfg.enabled
    backend: SandboxBackend = (
        _env_backend() if _env_backend() is not None else cfg.backend
    )
    if not enabled:
        backend = "off"
    elif enabled and backend == "off":
        backend = "local"
    return ResolvedSandboxSettings(
        enabled=enabled,
        backend=backend,
        use_user_subdir=cfg.use_user_subdir,
        fail_closed=cfg.fail_closed,
        fallback_backend=cfg.fallback_backend,
        docker_image=cfg.docker_image,
        docker_network=cfg.docker_network,
        docker_memory=cfg.docker_memory,
        docker_cpus=cfg.docker_cpus,
        docker_pids_limit=cfg.docker_pids_limit,
        docker_timeout_seconds=cfg.docker_timeout_seconds,
    )


def use_docker_shell_backend() -> bool:
    """Return True when shell commands should run in docker per-call."""
    settings = load_sandbox_settings()
    return settings.enabled and settings.backend == "docker"
