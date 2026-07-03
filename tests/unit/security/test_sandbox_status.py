# -*- coding: utf-8 -*-
"""Unit tests for execution sandbox status probes."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aiwork.security.sandbox.settings import ResolvedSandboxSettings
from aiwork.security.sandbox.status import (
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
        docker_image="aiwork-sandbox:latest",
        docker_network="none",
        docker_memory="512m",
        docker_cpus="1",
        docker_pids_limit=64,
        docker_timeout_seconds=120,
        skill_sandbox_enforcement="warn",
        auto_tag_risky_skills=True,
        session_container_enabled=False,
        session_idle_seconds=900,
        session_max_containers=32,
    )
    defaults.update(overrides)
    return ResolvedSandboxSettings(**defaults)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_probe_docker_image_present_true() -> None:
    proc = MagicMock()
    proc.returncode = 0
    proc.wait = AsyncMock()

    with patch(
        "aiwork.security.sandbox.status.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        assert await probe_docker_image_present("aiwork-sandbox:latest") is True


@pytest.mark.asyncio
async def test_get_execution_sandbox_status_reports_docker_health() -> None:
    settings = _settings()
    runner = MagicMock()
    runner.is_available = AsyncMock(return_value=True)

    with patch(
        "aiwork.security.sandbox.status.DockerSandboxRunner",
        return_value=runner,
    ), patch(
        "aiwork.security.sandbox.status.probe_docker_image_present",
        new=AsyncMock(return_value=True),
    ), patch(
        "aiwork.security.sandbox.status.EnvVarLoader.get_str",
        side_effect=lambda key: {
            "aiwork_EXECUTION_SANDBOX_ENABLED": "true",
            "aiwork_EXECUTION_SANDBOX_BACKEND": "docker",
        }.get(key),
    ):
        status = await get_execution_sandbox_status(settings)

    assert status.effective_enabled is True
    assert status.effective_backend == "docker"
    assert status.docker_available is True
    assert status.docker_image_present is True
    assert status.env_enabled == "true"
    assert status.env_backend == "docker"
    assert status.session_containers.active_count == 0
