# -*- coding: utf-8 -*-
"""Unit tests for SessionContainerManager."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from aiwork.security.sandbox.session_container import SessionContainer
from aiwork.security.sandbox.session_container_manager import (
    SessionContainerManager,
)
from aiwork.security.sandbox.settings import ResolvedSandboxSettings


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
        session_container_enabled=True,
        session_idle_seconds=900,
        session_max_containers=32,
    )
    defaults.update(overrides)
    return ResolvedSandboxSettings(**defaults)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_acquire_reuses_running_container() -> None:
    manager = SessionContainerManager()
    settings = _settings()
    sandbox_root = Path("/tmp/sandbox")
    container = SessionContainer(
        container_id="abc123",
        container_name="aiwork-sbx-test",
        session_key="agent:1:session",
        sandbox_root=sandbox_root,
        last_used=1.0,
        created_at=1.0,
    )

    with patch.object(
        manager,
        "_create_container",
        new=AsyncMock(return_value=container),
    ) as create_mock:
        manager._is_container_running = AsyncMock(return_value=True)  # type: ignore[method-assign]
        first = await manager.acquire("agent:1:session", sandbox_root, settings)
        second = await manager.acquire("agent:1:session", sandbox_root, settings)

    assert first.container_id == second.container_id
    create_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_reap_idle_destroys_stale_container() -> None:
    manager = SessionContainerManager()
    manager._containers["agent:1:session"] = SessionContainer(
        container_id="abc123",
        container_name="aiwork-sbx-test",
        session_key="agent:1:session",
        sandbox_root=Path("/tmp/sandbox"),
        last_used=0.0,
        created_at=0.0,
    )
    manager.destroy = AsyncMock(return_value=True)  # type: ignore[method-assign]

    with patch(
        "aiwork.security.sandbox.session_container_manager.load_sandbox_settings",
        return_value=_settings(session_idle_seconds=1),
    ), patch(
        "aiwork.security.sandbox.session_container_manager.time.time",
        return_value=1000.0,
    ):
        destroyed = await manager.reap_idle()

    assert destroyed == 1
    manager.destroy.assert_awaited_once_with("agent:1:session")
