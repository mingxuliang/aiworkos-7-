# -*- coding: utf-8 -*-
"""Runtime status probes for execution sandbox backends."""
from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass

from ...constant import EnvVarLoader
from .docker_runner import DockerSandboxRunner
from .settings import ResolvedSandboxSettings, load_sandbox_settings


@dataclass(frozen=True)
class ExecutionSandboxStatus:
    """Effective sandbox settings plus backend health probes."""

    effective_enabled: bool
    effective_backend: str
    docker_available: bool
    docker_image_present: bool
    docker_image: str
    env_enabled: str | None
    env_backend: str | None

    def to_dict(self) -> dict:
        return asdict(self)


async def probe_docker_image_present(image: str) -> bool:
    """Return True when ``docker image inspect`` succeeds for *image*."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "image",
            "inspect",
            image,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        return proc.returncode == 0
    except (FileNotFoundError, OSError):
        return False


async def get_execution_sandbox_status(
    settings: ResolvedSandboxSettings | None = None,
) -> ExecutionSandboxStatus:
    """Collect resolved settings and docker backend health."""
    resolved = settings or load_sandbox_settings()
    runner = DockerSandboxRunner(resolved)
    docker_available = await runner.is_available()
    docker_image_present = False
    if docker_available:
        docker_image_present = await probe_docker_image_present(
            resolved.docker_image,
        )

    return ExecutionSandboxStatus(
        effective_enabled=resolved.enabled and resolved.backend != "off",
        effective_backend=resolved.backend,
        docker_available=docker_available,
        docker_image_present=docker_image_present,
        docker_image=resolved.docker_image,
        env_enabled=EnvVarLoader.get_str("QWENPAW_EXECUTION_SANDBOX_ENABLED"),
        env_backend=EnvVarLoader.get_str("QWENPAW_EXECUTION_SANDBOX_BACKEND"),
    )
