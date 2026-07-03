# -*- coding: utf-8 -*-
"""Unit tests for Docker sandbox runner (Plan B)."""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aiwork.security.sandbox.docker_runner import DockerSandboxRunner
from aiwork.security.sandbox.settings import (
    ResolvedSandboxSettings,
    load_sandbox_settings,
    use_docker_shell_backend,
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
    )
    defaults.update(overrides)
    return ResolvedSandboxSettings(**defaults)  # type: ignore[arg-type]


@pytest.fixture
def sandbox_root(tmp_path: Path) -> Path:
    root = tmp_path / "sandbox"
    root.mkdir()
    return root


@pytest.fixture
def workspace_dir(tmp_path: Path) -> Path:
    ws = tmp_path / "workspace"
    ws.mkdir()
    return ws


def test_build_run_command_basic(sandbox_root: Path) -> None:
    runner = DockerSandboxRunner(_settings())
    argv = runner.build_run_command("echo hi", sandbox_root)

    assert argv[0:2] == ["docker", "run"]
    assert "--rm" in argv
    assert "--network" in argv
    idx = argv.index("--network")
    assert argv[idx + 1] == "none"
    assert "-v" in argv
    vol_idx = argv.index("-v")
    assert argv[vol_idx + 1].endswith(":/work:rw")
    assert argv[-4:] == [
        "aiwork-sandbox:latest",
        "/bin/sh",
        "-c",
        "echo hi",
    ]


def test_build_run_command_mounts_workspace_readonly(
    sandbox_root: Path,
    workspace_dir: Path,
) -> None:
    runner = DockerSandboxRunner(_settings())
    argv = runner.build_run_command(
        "ls /ro",
        sandbox_root,
        workspace_dir=workspace_dir,
    )

    ro_mounts = [
        part
        for i, part in enumerate(argv)
        if part == "-v" and i + 1 < len(argv) and ":/ro:ro" in argv[i + 1]
    ]
    assert ro_mounts, "expected read-only workspace mount at /ro"


@pytest.mark.asyncio
async def test_is_available_true_when_docker_responds() -> None:
    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(b"24.0.0", b""))

    with patch(
        "aiwork.security.sandbox.docker_runner.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        runner = DockerSandboxRunner(_settings())
        assert await runner.is_available() is True


@pytest.mark.asyncio
async def test_is_available_false_when_docker_missing() -> None:
    with patch(
        "aiwork.security.sandbox.docker_runner.asyncio.create_subprocess_exec",
        side_effect=FileNotFoundError,
    ):
        runner = DockerSandboxRunner(_settings())
        assert await runner.is_available() is False


@pytest.mark.asyncio
async def test_run_shell_success(sandbox_root: Path) -> None:
    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(b"hello\n", b""))
    proc.kill = MagicMock()
    proc.wait = AsyncMock()

    with patch(
        "aiwork.security.sandbox.docker_runner.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        runner = DockerSandboxRunner(_settings(docker_timeout_seconds=30))
        result = await runner.run_shell("echo hello", sandbox_root, timeout=5.0)

    assert result.returncode == 0
    assert result.stdout == "hello\n"
    assert result.stderr == ""
    assert result.backend == "docker"
    assert result.duration_seconds >= 0


@pytest.mark.asyncio
async def test_run_shell_timeout(sandbox_root: Path) -> None:
    proc = MagicMock()
    proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError)
    proc.kill = MagicMock()
    proc.wait = AsyncMock()

    with patch(
        "aiwork.security.sandbox.docker_runner.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        runner = DockerSandboxRunner(_settings(docker_timeout_seconds=1))
        result = await runner.run_shell("sleep 999", sandbox_root)

    assert result.returncode == -1
    assert "timeout" in result.stderr.lower()
    proc.kill.assert_called_once()


def test_load_sandbox_settings_env_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("aiwork_EXECUTION_SANDBOX_ENABLED", "true")
    monkeypatch.setenv("aiwork_EXECUTION_SANDBOX_BACKEND", "docker")

    settings = load_sandbox_settings()
    assert settings.enabled is True
    assert settings.backend == "docker"
    assert use_docker_shell_backend() is True


def test_load_sandbox_settings_from_config_when_env_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("aiwork_EXECUTION_SANDBOX_ENABLED", raising=False)
    monkeypatch.delenv("aiwork_EXECUTION_SANDBOX_BACKEND", raising=False)

    settings = load_sandbox_settings()
    assert settings.backend in {"off", "local", "docker"}


def test_load_sandbox_settings_disabled_forces_off_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("aiwork_EXECUTION_SANDBOX_ENABLED", "false")
    monkeypatch.setenv("aiwork_EXECUTION_SANDBOX_BACKEND", "docker")

    settings = load_sandbox_settings()
    assert settings.enabled is False
    assert settings.backend == "off"
    assert use_docker_shell_backend() is False
