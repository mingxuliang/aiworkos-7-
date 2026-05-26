# -*- coding: utf-8 -*-
"""Docker sandbox integration check for Plan B."""
from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

from qwenpaw.agents.tools.shell import execute_shell_command
from qwenpaw.config.context import set_current_workspace_dir
from qwenpaw.security.sandbox import (
    get_execution_sandbox_status,
    resolve_sandbox_root,
    set_current_sandbox_root,
)
from qwenpaw.security.sandbox.settings import load_sandbox_settings


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
    os.environ["QWENPAW_EXECUTION_SANDBOX_BACKEND"] = "docker"

    settings = load_sandbox_settings()
    if settings.backend != "docker":
        print("FAIL: expected docker backend")
        return 1

    status = await get_execution_sandbox_status(settings)
    print(
        "STATUS:",
        f"docker_available={status.docker_available}",
        f"docker_image_present={status.docker_image_present}",
        f"image={status.docker_image}",
    )

    if not status.docker_available:
        print("SKIP: Docker CLI unavailable; build/start Docker Desktop and retry")
        return 2

    if not status.docker_image_present:
        print(
            "FAIL: sandbox image missing. Build with:\n"
            "  .\\scripts\\build_sandbox_image.ps1",
        )
        return 1

    with tempfile.TemporaryDirectory(prefix="qwenpaw_docker_") as tmp:
        workspace = Path(tmp) / "workspace"
        workspace.mkdir()
        sandbox_root = resolve_sandbox_root(workspace, "default")
        set_current_workspace_dir(workspace)
        set_current_sandbox_root(sandbox_root)

        resp = await execute_shell_command("echo docker-sandbox-ok && pwd")
        text = await _text(resp)
        print("SHELL OUTPUT:\n", text)

        if "docker-sandbox-ok" not in text:
            print("FAIL: expected command output in docker sandbox response")
            return 1
        if "[sandbox:docker" not in text:
            print("FAIL: expected docker sandbox prefix in response")
            return 1
        if "/work" not in text:
            print("FAIL: expected container working directory /work in pwd output")
            return 1

    print("PASS: docker sandbox shell integration check")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
