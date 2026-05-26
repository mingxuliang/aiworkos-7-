# -*- coding: utf-8 -*-
"""End-to-end sandbox checks through file tools and Tool Guard."""
from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

from qwenpaw.agents.tools.file_io import read_file, write_file
from qwenpaw.config.context import set_current_workspace_dir
from qwenpaw.security.sandbox import (
    is_sandbox_enabled,
    resolve_sandbox_root,
    set_current_sandbox_root,
)
from qwenpaw.security.tool_guard.engine import ToolGuardEngine


async def _text(resp) -> str:
    blocks = resp.content or []
    if not blocks:
        return ""
    block = blocks[0]
    if isinstance(block, dict):
        return str(block.get("text", ""))
    return str(getattr(block, "text", block))


async def main() -> int:
    os.environ["QWENPAW_EXECUTION_SANDBOX_ENABLED"] = "true"
    if not is_sandbox_enabled():
        print("FAIL: sandbox not enabled")
        return 1

    with tempfile.TemporaryDirectory(prefix="qwenpaw_e2e_") as tmp:
        workspace = Path(tmp) / "workspace"
        workspace.mkdir()
        sandbox_root = resolve_sandbox_root(workspace, "default")
        set_current_workspace_dir(workspace)
        set_current_sandbox_root(sandbox_root)

        outside = "C:/Windows/win.ini" if os.name == "nt" else "/etc/passwd"
        engine = ToolGuardEngine()
        blocked = engine.guard("read_file", {"file_path": outside})
        if not blocked.findings:
            print("FAIL: ToolGuard did not block outside read")
            return 1

        outside_resp = await read_file(outside)
        outside_text = await _text(outside_resp)
        if "outside sandbox boundary" not in outside_text.lower():
            print(f"FAIL: read_file outside did not error: {outside_text!r}")
            return 1

        ok_path = "sandbox_ok.txt"
        write_resp = await write_file(ok_path, "hello")
        write_text = await _text(write_resp)
        if "Error" in write_text and "Successfully" not in write_text:
            print(f"FAIL: write inside sandbox failed: {write_text!r}")
            return 1

        target = sandbox_root / ok_path
        if not target.is_file():
            print(f"FAIL: expected file at {target}")
            return 1

        read_ok = await read_file(ok_path)
        read_text = await _text(read_ok)
        if "hello" not in read_text:
            print(f"FAIL: read inside sandbox failed: {read_text!r}")
            return 1

        traversal = await write_file("../escape.txt", "bad")
        trav_text = await _text(traversal)
        if "outside sandbox boundary" not in trav_text.lower():
            print(f"FAIL: traversal write was not blocked: {trav_text!r}")
            return 1

    print("PASS: sandbox end-to-end file tool checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
