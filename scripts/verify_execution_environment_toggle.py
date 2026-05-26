# -*- coding: utf-8 -*-
"""Verify chat execution environment toggle (sandbox vs local)."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agentscope_runtime.engine.schemas.agent_schemas import AgentRequest

from qwenpaw.agents.tools.file_io import read_file
from qwenpaw.app.routers.console import _extract_session_and_payload
from qwenpaw.config.context import set_current_workspace_dir
from qwenpaw.constant import WORKING_DIR
from qwenpaw.security.sandbox.context import (
    set_current_sandbox_root,
    set_sandbox_enabled_override,
)
from qwenpaw.security.sandbox.path_jail import is_sandbox_enabled
from qwenpaw.security.sandbox.resolver import resolve_sandbox_root


def _response_text(response) -> str:
    blocks = response.content if hasattr(response, "content") else []
    parts: list[str] = []
    for block in blocks:
        if isinstance(block, dict):
            parts.append(str(block.get("text", "")))
        else:
            parts.append(str(getattr(block, "text", block)))
    return "\n".join(parts)


async def _try_read_outside() -> str:
    outside = r"C:\Windows\win.ini" if os.name == "nt" else "/etc/passwd"
    response = await read_file(outside)
    return _response_text(response)


def check_console_payload() -> None:
    payload_on = _extract_session_and_payload(
        AgentRequest(
            session_id="verify-session",
            user_id="verify-user",
            input=[],
            execution_sandbox_enabled=True,
        ),
    )
    payload_off = _extract_session_and_payload(
        AgentRequest(
            session_id="verify-session",
            user_id="verify-user",
            input=[],
            execution_sandbox_enabled=False,
        ),
    )
    assert payload_on["meta"]["execution_sandbox_enabled"] is True
    assert payload_off["meta"]["execution_sandbox_enabled"] is False
    print("PASS console payload: AgentRequest sandbox flag preserved")


async def check_toggle_behavior() -> None:
    workspace = Path(WORKING_DIR) / "workspaces" / "default"
    workspace.mkdir(parents=True, exist_ok=True)
    set_current_workspace_dir(str(workspace))
    sandbox_root = resolve_sandbox_root(workspace, "verify-user")
    set_current_sandbox_root(sandbox_root)

    outside = r"C:\Windows\win.ini" if os.name == "nt" else "/etc/passwd"
    if os.name == "nt" and not os.path.exists(outside):
        print(f"SKIP outside read test: {outside} not found")
        return

    set_sandbox_enabled_override(True)
    assert is_sandbox_enabled() is True
    sandbox_result = await _try_read_outside()
    sandbox_blocked = "outside sandbox boundary" in sandbox_result.lower()
    print(
        "sandbox mode read outside:",
        "BLOCKED" if sandbox_blocked else f"UNEXPECTED: {sandbox_result[:120]}",
    )
    if not sandbox_blocked:
        raise SystemExit(1)

    set_sandbox_enabled_override(False)
    assert is_sandbox_enabled() is False
    local_result = await _try_read_outside()
    local_allowed = "outside sandbox boundary" not in local_result.lower()
    print(
        "local mode read outside:",
        "ALLOWED" if local_allowed else f"UNEXPECTED: {local_result[:120]}",
    )
    if not local_allowed:
        raise SystemExit(1)

    set_sandbox_enabled_override(None)
    print("PASS toggle behavior: sandbox blocks, local allows outside read")


def check_health(base_url: str = "http://127.0.0.1:8088") -> None:
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(f"{base_url}/api/health", timeout=10) as resp:
            body = resp.read(200).decode("utf-8", errors="replace")
        print(f"PASS backend health: {body[:120]}")
    except urllib.error.URLError as exc:
        print(f"FAIL backend health: {exc}")
        raise SystemExit(1) from exc


def main() -> int:
    for key in ("QWENPAW_EXECUTION_SANDBOX_ENABLED", "QWENPAW_EXECUTION_SANDBOX_BACKEND"):
        os.environ.pop(key, None)

    check_console_payload()
    asyncio.run(check_toggle_behavior())
    check_health()
    print("\nAll execution environment toggle checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
