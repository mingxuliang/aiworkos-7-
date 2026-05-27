# -*- coding: utf-8 -*-
"""Unit tests for execution sandbox path jail."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from qwenpaw.security.sandbox.context import (
    set_current_readonly_roots,
    set_current_sandbox_root,
)
from qwenpaw.security.sandbox.path_jail import (
    SandboxBoundaryError,
    assert_path_in_jail,
    assert_path_readable,
    assert_path_writable,
    is_path_in_jail,
    is_path_readable,
    is_path_writable,
    is_sandbox_enabled,
    resolve_path_in_jail,
    resolve_tool_path_string,
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


def test_per_user_sandbox_roots_are_isolated(workspace: Path) -> None:
    root_a = resolve_sandbox_root(workspace, "117")
    root_b = resolve_sandbox_root(workspace, "118")
    assert root_a != root_b
    assert root_a == (workspace / "users" / "117").resolve()
    assert root_b == (workspace / "users" / "118").resolve()

    secret = root_a / "private.txt"
    secret.write_text("user-a-secret", encoding="utf-8")

    assert is_path_in_jail(secret, root_a)
    assert not is_path_in_jail(secret, root_b)
    with pytest.raises(SandboxBoundaryError):
        assert_path_in_jail(secret, root_b)


@pytest.mark.asyncio
async def test_user_b_cannot_read_user_a_file_via_file_io(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.agents.tools.file_io import read_file
    from qwenpaw.config.context import set_current_workspace_dir

    root_a = resolve_sandbox_root(workspace, "117")
    root_b = resolve_sandbox_root(workspace, "118")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(root_b)

    target = root_a / "private.txt"
    target.write_text("user-a-secret", encoding="utf-8")

    response = await read_file(str(target))
    text = ""
    for block in response.content or []:
        if isinstance(block, dict):
            text += str(block.get("text", ""))
        else:
            text += str(getattr(block, "text", block))

    assert "outside sandbox" in text.lower()
    assert "user-a-secret" not in text


def test_skills_dir_readable_from_user_sandbox(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.config.context import set_current_workspace_dir

    skills_dir = workspace / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)
    skill_file = skills_dir / "SKILL.md"
    skill_file.write_text("# Demo skill", encoding="utf-8")

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)

    assert is_path_readable(skill_file)
    resolved = resolve_tool_path_string(
        "skills/demo-skill/SKILL.md",
        mode="read",
        workspace_dir=workspace,
    )
    assert Path(resolved) == skill_file.resolve()


def test_skills_dir_not_writable_from_user_sandbox(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.config.context import set_current_workspace_dir

    skills_dir = workspace / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)
    skill_file = skills_dir / "SKILL.md"
    skill_file.write_text("# Demo skill", encoding="utf-8")

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)

    assert not is_path_writable(skill_file)
    with pytest.raises(SandboxBoundaryError):
        resolve_tool_path_string(
            "skills/demo-skill/SKILL.md",
            mode="write",
            workspace_dir=workspace,
        )


def test_enabled_skill_dirs_extend_readonly_roots(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.config.context import set_current_workspace_dir

    custom_skill_dir = workspace / "skills" / "custom-skill"
    custom_skill_dir.mkdir(parents=True)
    custom_file = custom_skill_dir / "script.py"
    custom_file.write_text("print('ok')", encoding="utf-8")

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)
    set_current_readonly_roots([str(custom_skill_dir.resolve())])

    assert is_path_readable(custom_file)
    assert_path_readable(custom_file)


@pytest.mark.asyncio
async def test_user_can_read_skill_via_file_io(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.agents.tools.file_io import read_file
    from qwenpaw.config.context import set_current_workspace_dir

    skills_dir = workspace / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)
    skill_file = skills_dir / "SKILL.md"
    skill_file.write_text("# Demo skill content", encoding="utf-8")

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)

    response = await read_file("skills/demo-skill/SKILL.md")
    text = ""
    for block in response.content or []:
        if isinstance(block, dict):
            text += str(block.get("text", ""))
        else:
            text += str(getattr(block, "text", block))

    assert "Demo skill content" in text
    assert "outside sandbox" not in text.lower()


@pytest.mark.asyncio
async def test_write_to_skills_blocked_via_file_io(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.agents.tools.file_io import write_file
    from qwenpaw.config.context import set_current_workspace_dir

    skills_dir = workspace / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)

    response = await write_file(
        "skills/demo-skill/evil.txt",
        "should not land here",
    )
    text = ""
    for block in response.content or []:
        if isinstance(block, dict):
            text += str(block.get("text", ""))
        else:
            text += str(getattr(block, "text", block))

    assert "outside" in text.lower()
    assert not (skills_dir / "evil.txt").exists()


def test_path_jail_guardian_allows_skill_read(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.config.context import set_current_workspace_dir

    skills_dir = workspace / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)
    (skills_dir / "SKILL.md").write_text("# Demo", encoding="utf-8")

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)

    guardian = PathJailGuardian()
    findings = guardian.guard(
        "read_file",
        {"file_path": "skills/demo-skill/SKILL.md"},
    )
    assert findings == []


def test_path_jail_guardian_blocks_skill_write(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("QWENPAW_EXECUTION_SANDBOX_ENABLED", "true")

    from qwenpaw.config.context import set_current_workspace_dir

    skills_dir = workspace / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)

    user_root = resolve_sandbox_root(workspace, "81")
    set_current_workspace_dir(workspace)
    set_current_sandbox_root(user_root)

    guardian = PathJailGuardian()
    findings = guardian.guard(
        "write_file",
        {
            "file_path": "skills/demo-skill/evil.txt",
            "content": "x",
        },
    )
    assert findings
    assert findings[0].metadata.get("access_mode") == "write"
