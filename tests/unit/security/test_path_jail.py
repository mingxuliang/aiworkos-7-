# -*- coding: utf-8 -*-
"""Unit tests for execution sandbox path jail."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from qwenpaw.security.sandbox.context import set_current_sandbox_root
from qwenpaw.security.sandbox.path_jail import (
    SandboxBoundaryError,
    assert_path_in_jail,
    is_path_in_jail,
    is_sandbox_enabled,
    resolve_path_in_jail,
)
from qwenpaw.security.sandbox.resolver import resolve_sandbox_root
from qwenpaw.security.tool_guard.guardians.path_jail_guardian import (
    PathJailGuardian,
)


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    ws = tmp_path / "workspace"
    ws.mkdir()
    return ws


def test_resolve_sandbox_root_default_user(workspace: Path) -> None:
    root = resolve_sandbox_root(workspace, "default")
    assert root == workspace.resolve()


def test_resolve_sandbox_root_user_subdir(workspace: Path) -> None:
    root = resolve_sandbox_root(workspace, "alice")
    assert root == (workspace / "users" / "alice").resolve()
    assert root.is_dir()


def test_is_path_in_jail_blocks_outside(workspace: Path) -> None:
    inside = workspace / "ok.txt"
    inside.write_text("x", encoding="utf-8")
    outside = workspace.parent / "outside.txt"
    outside.write_text("y", encoding="utf-8")

    assert is_path_in_jail(inside, workspace)
    assert not is_path_in_jail(outside, workspace)


def test_resolve_path_in_jail_blocks_traversal(workspace: Path) -> None:
    set_current_sandbox_root(workspace)
    with pytest.raises(SandboxBoundaryError):
        resolve_path_in_jail("../escape.txt", workspace, workspace_dir=workspace)


def test_assert_path_in_jail_absolute_outside(workspace: Path) -> None:
    if os.name == "nt":
        outside = "C:/Windows/win.ini"
    else:
        outside = "/etc/passwd"
    with pytest.raises(SandboxBoundaryError):
        assert_path_in_jail(outside, workspace)


def test_path_jail_guardian_blocks_outside_file(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")
    set_current_sandbox_root(workspace.resolve())

    assert is_sandbox_enabled()

    guardian = PathJailGuardian()
    if os.name == "nt":
        target = "C:/Windows/win.ini"
    else:
        target = "/etc/passwd"

    findings = guardian.guard("read_file", {"file_path": target})
    assert findings
    assert findings[0].guardian == "path_jail_guardian"
    assert findings[0].severity.value == "HIGH"


def test_is_sandbox_enabled_reads_config_without_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", raising=False)
    monkeypatch.delenv("COPAW_EXECUTION_SANDBOX_ENABLED", raising=False)

    from qwenpaw.config import load_config, save_config

    config = load_config()
    config.security.execution_sandbox.enabled = True
    config.security.execution_sandbox.backend = "local"
    save_config(config)

    assert is_sandbox_enabled() is True


def test_is_sandbox_enabled_respects_request_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", raising=False)
    monkeypatch.delenv("COPAW_EXECUTION_SANDBOX_ENABLED", raising=False)

    from qwenpaw.config import load_config, save_config
    from qwenpaw.security.sandbox.context import set_sandbox_enabled_override

    config = load_config()
    config.security.execution_sandbox.enabled = False
    config.security.execution_sandbox.backend = "off"
    save_config(config)

    set_sandbox_enabled_override(True)
    assert is_sandbox_enabled() is True

    set_sandbox_enabled_override(False)
    assert is_sandbox_enabled() is False

    set_sandbox_enabled_override(None)
    assert is_sandbox_enabled() is False


def test_load_sandbox_settings_honors_request_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", raising=False)
    monkeypatch.delenv("QWENPAW_EXECUTION_SANDBOX_BACKEND", raising=False)

    from qwenpaw.config import load_config, save_config
    from qwenpaw.security.sandbox.context import set_sandbox_enabled_override
    from qwenpaw.security.sandbox.settings import load_sandbox_settings

    config = load_config()
    config.security.execution_sandbox.enabled = False
    config.security.execution_sandbox.backend = "off"
    save_config(config)

    set_sandbox_enabled_override(True)
    settings = load_sandbox_settings()
    assert settings.enabled is True
    assert settings.backend == "local"

    set_sandbox_enabled_override(None)


def test_path_jail_guardian_allows_inside_file(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")
    set_current_sandbox_root(workspace.resolve())

    inside = workspace / "allowed.txt"
    inside.write_text("ok", encoding="utf-8")

    guardian = PathJailGuardian()
    findings = guardian.guard("read_file", {"file_path": "allowed.txt"})
    assert findings == []
