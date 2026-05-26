# -*- coding: utf-8 -*-
"""Console-equivalent sandbox verification via tools + config API."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from qwenpaw.agents.tools.file_io import read_file, write_file
from qwenpaw.agents.tools.shell import execute_shell_command
from qwenpaw.config import load_config, save_config
from qwenpaw.config.config import ExecutionSandboxConfig
from qwenpaw.config.context import set_current_workspace_dir
from qwenpaw.security.sandbox import (
    get_execution_sandbox_status,
    resolve_sandbox_root,
    set_current_sandbox_root,
)


async def _text(resp) -> str:
    blocks = resp.content or []
    if not blocks:
        return ""
    block = blocks[0]
    if isinstance(block, dict):
        return str(block.get("text", ""))
    return str(getattr(block, "text", block))


def _update_config(**kwargs: object) -> ExecutionSandboxConfig:
    config = load_config()
    sandbox = config.security.execution_sandbox
    updated = sandbox.model_copy(update=kwargs)
    config.security.execution_sandbox = updated
    save_config(config)
    return updated


def _fetch_status(base_url: str = "http://127.0.0.1:8088") -> dict | None:
    url = f"{base_url}/api/config/security/execution-sandbox/status"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(f"STATUS API HTTP {exc.code} (auth may be required)")
        return None
    except OSError as exc:
        print(f"STATUS API unavailable: {exc}")
        return None


async def _run_local_cases() -> bool:
    os.environ.pop("QWENPAW_EXECUTION_SANDBOX_ENABLED", None)
    os.environ.pop("QWENPAW_EXECUTION_SANDBOX_BACKEND", None)
    _update_config(enabled=True, backend="local")

    from qwenpaw.security.sandbox.path_jail import is_sandbox_enabled

    if not is_sandbox_enabled():
        print("[FAIL] local::sandbox not enabled after config save")
        return False

    with tempfile.TemporaryDirectory(prefix="console_sandbox_") as tmp:
        ws = Path(tmp) / "workspace"
        ws.mkdir()
        root = resolve_sandbox_root(ws, "default")
        set_current_workspace_dir(ws)
        set_current_sandbox_root(root)

        outside = "C:/Windows/win.ini" if os.name == "nt" else "/etc/passwd"
        outside_text = await _text(await read_file(outside))
        write_text = await _text(await write_file("sandbox-test.txt", "hello"))
        trav_text = await _text(await write_file("../escape.txt", "bad"))
        shell_text = await _text(await execute_shell_command("echo sandbox-local-ok"))

        checks = [
            ("read outside blocked", "outside sandbox boundary" in outside_text.lower()),
            ("write inside ok", "sandbox-test.txt" in write_text),
            ("traversal blocked", "outside sandbox boundary" in trav_text.lower()),
            ("shell echo ok", "sandbox-local-ok" in shell_text),
        ]
        ok = True
        for name, passed in checks:
            status = "PASS" if passed else "FAIL"
            print(f"[{status}] local::{name}")
            ok = ok and passed
        return ok


async def _run_docker_cases() -> bool:
    os.environ.pop("QWENPAW_EXECUTION_SANDBOX_ENABLED", None)
    os.environ.pop("QWENPAW_EXECUTION_SANDBOX_BACKEND", None)
    _update_config(enabled=True, backend="docker")

    status = await get_execution_sandbox_status()
    print(
        "docker status:",
        f"available={status.docker_available}",
        f"image_present={status.docker_image_present}",
    )
    if not status.docker_available or not status.docker_image_present:
        print("[SKIP] docker backend prerequisites not met")
        return False

    with tempfile.TemporaryDirectory(prefix="console_docker_") as tmp:
        ws = Path(tmp) / "workspace"
        ws.mkdir()
        root = resolve_sandbox_root(ws, "default")
        set_current_workspace_dir(ws)
        set_current_sandbox_root(root)

        shell_text = await _text(
            await execute_shell_command("echo docker-sandbox-ok && pwd"),
        )
        outside_text = await _text(await read_file("C:/Windows/win.ini"))

        checks = [
            ("shell docker prefix", "[sandbox:docker" in shell_text),
            ("shell pwd /work", "/work" in shell_text),
            ("shell output ok", "docker-sandbox-ok" in shell_text),
            ("read outside blocked", "outside sandbox boundary" in outside_text.lower()),
        ]
        ok = True
        for name, passed in checks:
            status_label = "PASS" if passed else "FAIL"
            print(f"[{status_label}] docker::{name}")
            ok = ok and passed
        return ok


async def main() -> int:
    print("=== Sandbox Console Test ===")
    cfg = _update_config(enabled=True, backend="local")
    print("config saved:", cfg.model_dump())

    api_status = _fetch_status()
    if api_status:
        print("api status:", json.dumps(api_status, ensure_ascii=False))

    local_ok = await _run_local_cases()
    docker_ok = await _run_docker_cases()

    if local_ok and docker_ok:
        print("PASS: all sandbox console tests")
        return 0
    if local_ok:
        print("PARTIAL: local tests passed; docker tests skipped/failed")
        return 2
    print("FAIL: local sandbox tests failed")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
