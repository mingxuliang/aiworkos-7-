# -*- coding: utf-8 -*-
"""Docker per-call sandbox runner for shell execution."""
from __future__ import annotations

import asyncio
import logging
import shlex
import time
from pathlib import Path

from ...config.context import get_current_workspace_dir
from ...constant import WORKING_DIR
from .models import SandboxRunResult
from .settings import ResolvedSandboxSettings, load_sandbox_settings

logger = logging.getLogger(__name__)


def _smart_decode(data: bytes | None) -> str:
    if not data:
        return ""
    for encoding in ("utf-8", "gbk", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _docker_volume_path(path: Path) -> str:
    """Return a host path suitable for ``docker run -v``."""
    return str(path.expanduser().resolve())


class DockerSandboxRunner:
    """Execute shell commands inside ephemeral Docker containers."""

    def __init__(self, settings: ResolvedSandboxSettings | None = None) -> None:
        self._settings = settings or load_sandbox_settings()

    async def is_available(self) -> bool:
        """Return True when the Docker CLI responds successfully."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker",
                "version",
                "--format",
                "{{.Server.Version}}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=10,
            )
            return proc.returncode == 0 and bool(stdout)
        except (FileNotFoundError, asyncio.TimeoutError, OSError):
            return False

    def build_run_command(
        self,
        command: str,
        sandbox_root: Path,
        *,
        workspace_dir: Path | None = None,
    ) -> list[str]:
        """Build the ``docker run`` argv for a single shell invocation."""
        settings = self._settings
        sandbox_host = _docker_volume_path(sandbox_root)
        cmd = [
            "docker",
            "run",
            "--rm",
            "--network",
            settings.docker_network,
            "--memory",
            settings.docker_memory,
            "--cpus",
            settings.docker_cpus,
            "--pids-limit",
            str(settings.docker_pids_limit),
            "-v",
            f"{sandbox_host}:/work:rw",
            "-w",
            "/work",
        ]

        workspace = workspace_dir or get_current_workspace_dir() or WORKING_DIR
        workspace_path = Path(workspace).resolve()
        sandbox_resolved = sandbox_root.resolve()
        if workspace_path != sandbox_resolved and workspace_path.is_dir():
            cmd.extend(
                [
                    "-v",
                    f"{_docker_volume_path(workspace_path)}:/ro:ro",
                ],
            )

        cmd.extend(
            [
                settings.docker_image,
                "/bin/sh",
                "-c",
                command,
            ],
        )
        return cmd

    async def run_shell(
        self,
        command: str,
        sandbox_root: Path,
        *,
        timeout: float | None = None,
        workspace_dir: Path | None = None,
    ) -> SandboxRunResult:
        """Run *command* inside a one-shot Docker container."""
        settings = self._settings
        effective_timeout = float(
            timeout if timeout is not None else settings.docker_timeout_seconds,
        )
        argv = self.build_run_command(
            command,
            sandbox_root,
            workspace_dir=workspace_dir,
        )
        started = time.perf_counter()
        logger.info(
            "[SANDBOX] docker shell start image=%s cwd=%s cmd=%s",
            settings.docker_image,
            sandbox_root,
            command[:200],
        )

        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=effective_timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            duration = time.perf_counter() - started
            logger.warning(
                "[SANDBOX] docker shell timeout after %.2fs cmd=%s",
                duration,
                command[:200],
            )
            return SandboxRunResult(
                returncode=-1,
                stdout="",
                stderr=(
                    f"Docker sandbox execution exceeded timeout of "
                    f"{effective_timeout} seconds."
                ),
                backend="docker",
                duration_seconds=duration,
            )

        duration = time.perf_counter() - started
        result = SandboxRunResult(
            returncode=proc.returncode if proc.returncode is not None else -1,
            stdout=_smart_decode(stdout),
            stderr=_smart_decode(stderr),
            backend="docker",
            duration_seconds=duration,
        )
        logger.info(
            "[SANDBOX] docker shell done rc=%s duration=%.2fs",
            result.returncode,
            duration,
        )
        return result

    def format_audit_command(self, argv: list[str]) -> str:
        """Return a log-safe representation of the docker argv."""
        return " ".join(shlex.quote(part) for part in argv)
