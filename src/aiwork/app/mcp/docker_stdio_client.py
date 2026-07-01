# -*- coding: utf-8 -*-
"""MCP stdio client that runs the server inside a session Docker container."""
from __future__ import annotations

import asyncio
import logging
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any, Literal

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters

from agentscope.mcp import StatefulClientBase

from ...security.sandbox import get_current_sandbox_root
from ...security.sandbox.session_container import build_session_key_from_context
from ...security.sandbox.session_container_manager import (
    get_session_container_manager,
)
from ...security.sandbox.settings import load_sandbox_settings

logger = logging.getLogger(__name__)


class DockerStdIOStatefulClient(StatefulClientBase):
    """StdIO MCP client backed by ``docker exec -i`` in a session container."""

    def __init__(
        self,
        name: Any,
        command: Any,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        cwd: str | None = None,
        encoding: str = "utf-8",
        encoding_error_handler: Literal[
            "strict",
            "ignore",
            "replace",
        ] = "strict",
        read_timeout_seconds: float = 60 * 5,
    ) -> None:
        if not isinstance(name, str):
            raise TypeError(f"name must be str, got {type(name).__name__}")
        if not isinstance(command, str):
            raise TypeError(
                f"command must be str, got {type(command).__name__}",
            )

        self.name = name
        self._inner_command = command
        self._inner_args = list(args or [])
        self._inner_env = dict(env or {})
        self._inner_cwd = cwd or "/work"
        self.encoding = encoding
        self.encoding_error_handler = encoding_error_handler
        self.read_timeout_seconds = read_timeout_seconds

        self._lifecycle_task: asyncio.Task | None = None
        self._reload_event = asyncio.Event()
        self._ready_event = asyncio.Event()
        self._stop_event = asyncio.Event()

        self.session: ClientSession | None = None
        self.is_connected = False
        self._cached_tools = None

    async def _build_server_params(self) -> StdioServerParameters:
        session_key = build_session_key_from_context()
        sandbox_root = get_current_sandbox_root()
        if not session_key or sandbox_root is None:
            raise RuntimeError(
                "Docker MCP sandbox requires an active session container "
                "context and sandbox root",
            )

        settings = load_sandbox_settings()
        manager = get_session_container_manager()
        container = await manager.acquire(session_key, sandbox_root, settings)
        exec_args = [
            "docker",
            "exec",
            "-i",
            "-w",
            self._inner_cwd,
            container.container_id,
            self._inner_command,
            *self._inner_args,
        ]
        return StdioServerParameters(
            command=exec_args[0],
            args=exec_args[1:],
            env=self._inner_env or None,
            cwd=None,
            encoding=self.encoding,
            encoding_error_handler=self.encoding_error_handler,
        )

    async def _run_lifecycle(self) -> None:
        from mcp.client.stdio import stdio_client

        while not self._stop_event.is_set():
            try:
                server_params = await self._build_server_params()
                logger.debug(
                    "Connecting Docker MCP client: %s via %s",
                    self.name,
                    server_params.command,
                )

                async with AsyncExitStack() as stack:
                    context = await stack.enter_async_context(
                        stdio_client(server_params),
                    )
                    read_stream, write_stream = context[0], context[1]

                    self.session = ClientSession(read_stream, write_stream)
                    await stack.enter_async_context(self.session)
                    await self.session.initialize()

                    self.is_connected = True
                    self._ready_event.set()
                    logger.info(
                        "Docker MCP client connected in session container: %s",
                        self.name,
                    )

                    while (
                        not self._reload_event.is_set()
                        and not self._stop_event.is_set()
                    ):
                        await asyncio.sleep(0.1)

                    self.session = None
                    self.is_connected = False
                    self._cached_tools = None

                    if self._reload_event.is_set():
                        logger.info("Reloading Docker MCP client: %s", self.name)
                        self._reload_event.clear()
                        self._ready_event.clear()
                    else:
                        logger.info("Stopping Docker MCP client: %s", self.name)

            except Exception as exc:
                logger.error(
                    "Error in Docker MCP client lifecycle for %s: %s",
                    self.name,
                    exc,
                    exc_info=True,
                )
                self.session = None
                self.is_connected = False
                self._cached_tools = None
                self._ready_event.clear()
                await asyncio.sleep(1)

        logger.info("Docker MCP client lifecycle task exited: %s", self.name)

    async def connect(self, timeout: float = 30.0) -> None:
        if self.is_connected:
            raise RuntimeError(
                f"MCP client '{self.name}' is already connected. "
                f"Call close() before connecting again.",
            )

        self._stop_event.clear()
        self._lifecycle_task = asyncio.create_task(self._run_lifecycle())

        try:
            await asyncio.wait_for(self._ready_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.error(
                "Timeout waiting for Docker MCP client '%s' to connect",
                self.name,
            )
            self._stop_event.set()
            if self._lifecycle_task:
                await self._lifecycle_task
            raise

    async def close(self, ignore_errors: bool = True) -> None:
        if not self.is_connected:
            if not ignore_errors:
                raise RuntimeError(
                    f"MCP client '{self.name}' is not connected. "
                    f"Call connect() before closing.",
                )
            return

        self._stop_event.set()
        if self._lifecycle_task:
            try:
                await asyncio.wait_for(self._lifecycle_task, timeout=30)
            except asyncio.TimeoutError:
                logger.warning(
                    "Timeout waiting for Docker MCP client '%s' to close",
                    self.name,
                )
                self._lifecycle_task.cancel()
            finally:
                self._lifecycle_task = None

        self.session = None
        self.is_connected = False
        self._cached_tools = None
        self._ready_event.clear()

    async def reload(self, timeout: float = 60.0) -> None:
        if not self.is_connected:
            await self.connect(timeout=timeout)
            return
        self._reload_event.set()
        self._ready_event.clear()
        await asyncio.wait_for(self._ready_event.wait(), timeout=timeout)

    async def list_tools(self) -> list:
        if self._cached_tools is not None:
            return self._cached_tools
        if self.session is None:
            raise RuntimeError("MCP session is not connected")
        result = await self.session.list_tools()
        self._cached_tools = result.tools
        return self._cached_tools

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        *,
        timeout: timedelta | None = None,
    ) -> Any:
        if self.session is None:
            raise RuntimeError("MCP session is not connected")
        return await self.session.call_tool(
            name,
            arguments or {},
            read_timeout_seconds=timeout,
        )
