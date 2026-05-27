#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Integration smoke test for session container reuse."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))


async def main() -> int:
    from qwenpaw.security.sandbox.docker_runner import SessionDockerRunner
    from qwenpaw.security.sandbox.session_container_manager import (
        get_session_container_manager,
    )
    from qwenpaw.security.sandbox.settings import ResolvedSandboxSettings

    runner = SessionDockerRunner()
    if not await runner.is_available():
        print("SKIP: Docker unavailable")
        return 0

    sandbox_root = Path(tempfile.mkdtemp(prefix="qwenpaw-session-sbx-"))
    session_key = "verify:user:session"
    settings = ResolvedSandboxSettings(
        enabled=True,
        backend="docker",
        use_user_subdir=False,
        fail_closed=True,
        fallback_backend="local",
        docker_image=os.environ.get(
            "QWENPAW_SANDBOX_IMAGE",
            "qwenpaw-sandbox:latest",
        ),
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

    manager = get_session_container_manager()
    await manager.acquire(session_key, sandbox_root, settings)

    first = await manager.exec_shell(session_key, "pwd", settings=settings)
    second = await manager.exec_shell(session_key, "pwd", settings=settings)

    if first.stdout.strip() != second.stdout.strip():
        print("FAIL: pwd mismatch between session exec calls")
        print("first:", first.stdout)
        print("second:", second.stdout)
        return 1

    if first.stdout.strip() != "/work":
        print("WARN: expected /work, got", first.stdout.strip())

    await manager.destroy(session_key)
    print("OK: session container reuse verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
