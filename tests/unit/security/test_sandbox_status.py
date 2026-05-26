# -*- coding: utf-8 -*-
"""Unit tests for execution sandbox status probes."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from qwenpaw.security.sandbox.settings import ResolvedSandboxSettings
from qwenpaw.security.sandbox.status import (
    get_execution_sandbox_status,
    probe_docker_image_present,
)


def _settings(**overrides: object) -> ResolvedSandboxSettings:
    defaults = dict(
        enabled=True,
        backend="docker",
        use_user_subdir=True,
        fail_closed=True,
        fallback_backend="local",
        docker_image="qwenpaw-sandbox:latest",
        docker_network="none",
        docker_memory="512m",
        docker_cpus="1",
        docker_pids_limit=64,
        docker_timeout_seconds=120,
    )
    defaults.update(overrides)
    return ResolvedSandboxSettings(**defaults)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_probe_docker_image_present_true() -> None:
    proc = MagicMock()
    proc.returncode = 0
    proc.wait = AsyncMock()

    with patch(
        "qwenpaw.security.sandbox.status.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        assert await probe_docker_image_present("qwenpaw-sandbox:latest") is True


@pytest.mark.asyncio
async def test_get_execution_sandbox_status_reports_docker_health() -> None:
    settings = _settings()
    runner = MagicMock()
    runner.is_available = AsyncMock(return_value=True)

    with patch(
        "qwenpaw.security.sandbox.status.DockerSandboxRunner",
        return_value=runner,
    ), patch(
        "qwenpaw.security.sandbox.status.probe_docker_image_present",
        new=AsyncMock(return_value=True),
    ), patch(
        "qwenpaw.security.sandbox.status.EnvVarLoader.get_str",
        side_effect=lambda key: {
            "QWENPAW_EXECUTION_SANDBOX_ENABLED": "true",
            "QWENPAW_EXECUTION_SANDBOX_BACKEND": "docker",
        }.get(key),
    ):
        status = await get_execution_sandbox_status(settings)

    assert status.effective_enabled is True
    assert status.effective_backend == "docker"
    assert status.docker_available is True
    assert status.docker_image_present is True
    assert status.env_enabled == "true"
    assert status.env_backend == "docker"
