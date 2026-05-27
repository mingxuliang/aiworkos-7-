# -*- coding: utf-8 -*-
"""Verify per-user sandbox directory isolation."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from qwenpaw.agents.tools.file_io import read_file, write_file
from qwenpaw.config.context import set_current_workspace_dir
from qwenpaw.security.sandbox.context import set_current_sandbox_root
from qwenpaw.security.sandbox.resolver import resolve_sandbox_root


async def _text(response) -> str:
    parts: list[str] = []
    for block in response.content or []:
        if isinstance(block, dict):
            parts.append(str(block.get("text", "")))
        else:
            parts.append(str(getattr(block, "text", block)))
    return "\n".join(parts)


async def main() -> int:
    os.environ["QWENPAW_EXECUTION_SANDBOX_ENABLED"] = "true"

    import tempfile

    with tempfile.TemporaryDirectory(prefix="per_user_sandbox_") as tmp:
        workspace = Path(tmp) / "workspace"
        workspace.mkdir()
        set_current_workspace_dir(workspace)

        root_a = resolve_sandbox_root(workspace, "117")
        root_b = resolve_sandbox_root(workspace, "118")
        if root_a == root_b:
            print("FAIL: sandbox roots should differ for users 117 and 118")
            return 1

        set_current_sandbox_root(root_a)
        write_resp = await write_file("user-a-secret.txt", "top-secret-a")
        write_text = await _text(write_resp)
        if "Error" in write_text and "Successfully" not in write_text:
            print(f"FAIL: user A write failed: {write_text}")
            return 1

        set_current_sandbox_root(root_b)
        cross_read = await read_file(str(root_a / "user-a-secret.txt"))
        cross_text = await _text(cross_read)
        if "outside sandbox boundary" not in cross_text.lower():
            print(f"FAIL: user B should not read user A file: {cross_text[:120]}")
            return 1

        local_read = await read_file("user-a-secret.txt")
        local_text = await _text(local_read)
        if "top-secret-a" in local_text:
            print("FAIL: user B unexpectedly read user A content via relative path")
            return 1

    print("PASS: per-user sandbox isolation verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
