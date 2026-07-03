# -*- coding: utf-8 -*-
"""Workspace: Encapsulates a complete independent agent runtime.

Each Workspace represents a standalone agent workspace with its own:
- Runner (request processing)
- ChannelManager (communication channels)
- BaseMemoryManager (conversation memory)
- MCPClientManager (MCP tool clients)
- CronManager (scheduled tasks)

All existing single-agent components are reused without modification.
"""
import asyncio
import logging
import time
from pathlib import Path
from typing import Optional

# Idle TTL for per-user memory managers: close after 1 hour without access.
# Prevents notify-rs file-watcher tasks from accumulating and blocking the
# asyncio event loop when many users interact with the same shared workspace.
_MM_IDLE_TTL_S: float = 3600.0
# How often to scan for idle managers (seconds).
_MM_EVICTION_INTERVAL_S: float = 600.0

from aiwork.config.timezone import normalize_tz, get_user_timezone_name

from .service_manager import ServiceDescriptor, ServiceManager
from .service_factories import (
    create_mcp_service,
    create_chat_service,
    create_channel_service,
    create_agent_config_watcher,
    create_mcp_config_watcher,
)
from ..runner import AgentRunner
from ..runner.task_tracker import TaskTracker
from ..mcp import MCPClientManager
from ..crons.manager import CronManager
from ..crons.repo.execution_record_repo import ExecutionRecordRepository
from ..crons.repo.multi_user_repo import MultiUserJobRepository
from ...config.config import load_agent_config

logger = logging.getLogger(__name__)


class Workspace:
    """Single agent workspace with complete runtime components.

    Each Workspace is an independent agent instance with its own:
    - Runner: Processes agent requests
    - ChannelManager: Manages communication channels
    - BaseMemoryManager: Manages conversation memory
    - MCPClientManager: Manages MCP tool clients
    - CronManager: Manages scheduled tasks

    All components use existing single-agent code without modification.
    """

    def __init__(self, agent_id: str, workspace_dir: str):
        """Initialize agent instance.

        Args:
            agent_id: Unique agent identifier
            workspace_dir: Path to agent's workspace directory
        """
        self.agent_id = agent_id
        self.workspace_dir = Path(workspace_dir).expanduser()
        self.workspace_dir.mkdir(parents=True, exist_ok=True)

        # Service manager (unified component management)
        self._service_manager = ServiceManager(self)

        # Non-service state
        self._config = None  # Loaded before start()
        self._started = False
        self._manager = None  # Reference to MultiAgentManager
        self._task_tracker = TaskTracker()

        # Per-user memory managers for shared agent isolation.
        # Values are (manager, last_access_monotonic) to support TTL eviction.
        self._user_memory_managers: dict[str, tuple] = {}
        self._user_memory_manager_lock = asyncio.Lock()
        self._mm_eviction_task: asyncio.Task | None = None

        # Per-user sessions for shared agent isolation
        self._user_sessions: dict = {}

        # Per-user channel managers for shared agent isolation
        self._user_channel_managers: dict = {}
        self._user_channel_manager_lock = asyncio.Lock()

        # Register all services
        self._register_services()

        logger.debug(
            f"Created Workspace: {agent_id} at {self.workspace_dir}",
        )

    # Service access via properties (delegates to ServiceManager)
    @property
    def runner(self) -> Optional[AgentRunner]:
        """Get runner instance from ServiceManager."""
        return self._service_manager.services.get("runner")

    @property
    def memory_manager(self):
        """Get memory manager instance from ServiceManager."""
        return self._service_manager.services.get("memory_manager")

    @property
    def memory_manager_backend(self) -> str:
        """Get memory manager backend name from env var.

        Reads ``MEMORY_MANAGER_BACKEND`` from .env, defaults to ``"remelight"``.
        """
        from ...constant import EnvVarLoader

        return EnvVarLoader.get_str("MEMORY_MANAGER_BACKEND") or "mem0"

    @property
    def context_manager(self):
        """Get context manager instance from ServiceManager."""
        return self._service_manager.services.get("context_manager")

    @property
    def mcp_manager(self):
        """Get MCP manager instance from ServiceManager."""
        return self._service_manager.services.get("mcp_manager")

    @property
    def chat_manager(self):
        """Get chat manager instance from ServiceManager."""
        return self._service_manager.services.get("chat_manager")

    @property
    def channel_manager(self):
        """Get channel manager instance from ServiceManager."""
        return self._service_manager.services.get("channel_manager")

    @property
    def cron_manager(self):
        """Get cron manager instance from ServiceManager."""
        return self._service_manager.services.get("cron_manager")

    # Non-service state
    @property
    def task_tracker(self) -> TaskTracker:
        """Get task tracker for background chat and reconnect."""
        return self._task_tracker

    @property
    def config(self):
        """Get agent configuration."""
        self._config = load_agent_config(self.agent_id)
        return self._config

    def get_user_working_dir(self, user_id: Optional[str] = None) -> Path:
        """Get the working directory for a specific user.

        For shared agents (user_id not None), returns workspace_dir/users/{user_id}/.
        For non-shared or when user_id is None, returns workspace_dir.

        Args:
            user_id: User ID to resolve directory for

        Returns:
            Path to user-specific or shared workspace directory
        """
        if not user_id:
            return self.workspace_dir
        user_dir = self.workspace_dir / "users" / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        self._init_user_isolated_files(user_dir)
        return user_dir

    def _init_user_isolated_files(self, user_dir: Path) -> None:
        """Copy MEMORY.md and PROFILE.md templates into a new user subspace.

        Only copies files that don't already exist (skip_existing behaviour).
        Templates are sourced from ``agents/md_files/<lang>/`` with the
        agent's configured language, falling back to ``en``.

        Args:
            user_dir: The user's subspace directory.
        """
        from ...agents.utils.setup_utils import (
            _USER_ISOLATED_FILENAMES,
            _resolve_md_lang_dir,
            normalize_agent_language,
        )
        import shutil

        try:
            language = normalize_agent_language(
                self._config.language
                if self._config and getattr(self._config, "language", None)
                else "zh",
            )
        except Exception:
            language = "zh"

        agents_root = Path(__file__).resolve().parent.parent.parent / "agents"
        md_lang_dir = _resolve_md_lang_dir(agents_root, language)

        for filename in _USER_ISOLATED_FILENAMES:
            target = user_dir / filename
            if target.exists():
                continue
            source = md_lang_dir / filename
            if not source.exists():
                logger.debug(
                    "User-isolated template not found: %s (lang=%s)",
                    filename,
                    language,
                )
                continue
            try:
                shutil.copy2(source, target)
                logger.info(
                    "Initialised user-isolated file: %s → %s",
                    filename,
                    target,
                )
            except OSError as e:
                logger.warning(
                    "Failed to copy user-isolated file %s: %s",
                    filename,
                    e,
                )

    async def get_memory_manager(self, user_id: Optional[str] = None):
        """Get memory manager for a specific user.

        For shared agents with user_id, returns a per-user memory manager
        that stores data in users/{user_id}/. Lazily created on first access.

        For non-shared agents or when user_id is None, returns the shared
        workspace-level memory manager.

        Args:
            user_id: User ID to get memory manager for

        Returns:
            BaseMemoryManager instance for the user or shared
        """
        if not user_id:
            return self.memory_manager

        # Fast path: already cached — refresh last-access timestamp
        if user_id in self._user_memory_managers:
            mm, _ = self._user_memory_managers[user_id]
            self._user_memory_managers[user_id] = (mm, time.monotonic())
            return mm

        # Slow path: create under lock
        async with self._user_memory_manager_lock:
            # Double-check after acquiring lock
            if user_id in self._user_memory_managers:
                mm, _ = self._user_memory_managers[user_id]
                self._user_memory_managers[user_id] = (mm, time.monotonic())
                return mm

            from ...agents.memory.base_memory_manager import (
                get_memory_manager_backend,
            )

            user_dir = self.get_user_working_dir(user_id)
            backend_class = get_memory_manager_backend(
                self.memory_manager_backend,
            )
            extra_args = {}
            if self.memory_manager_backend == "mem0":
                extra_args["config"] = (
                    self._config.running.mem0_memory_config
                )
                extra_args["user_id"] = user_id
            mm = backend_class(
                working_dir=str(user_dir),
                agent_id=self.agent_id,
                **extra_args,
            )
            await mm.start()
            self._user_memory_managers[user_id] = (mm, time.monotonic())
            logger.info(
                f"Created per-user memory manager for "
                f"agent={self.agent_id}, user={user_id}",
            )
            return mm

    def get_user_session(self, user_id: str):
        """Get a per-user SafeJSONSession for isolated session storage.

        Creates a SafeJSONSession with save_dir set to the user's
        working directory (workspace_dir/users/{user_id}/), so session
        files land at workspace_dir/users/{user_id}/sessions/.

        Args:
            user_id: User ID

        Returns:
            SafeJSONSession scoped to the user's working directory
        """
        if user_id in self._user_sessions:
            return self._user_sessions[user_id]

        from ..runner.session import SafeJSONSession

        user_dir = self.get_user_working_dir(user_id)
        session = SafeJSONSession(save_dir=str(user_dir))
        self._user_sessions[user_id] = session
        return session

    async def get_channel_manager(self, user_id: str):
        """Get a per-user ChannelManager for isolated channel config.

        Lazily creates and caches per-user ChannelManager instances
        following the same double-checked locking pattern as
        get_memory_manager().

        Each user's ChannelManager loads channel config from
        users/{user_id}/channels.json, falling back to the agent-level
        channels config from agent.json.

        Args:
            user_id: User ID

        Returns:
            ChannelManager scoped to the user's channel config
        """
        # Fast path: already cached
        if user_id in self._user_channel_managers:
            return self._user_channel_managers[user_id]

        # Slow path: create under lock
        async with self._user_channel_manager_lock:
            # Double-check after acquiring lock
            if user_id in self._user_channel_managers:
                return self._user_channel_managers[user_id]

            from ...config.config import (
                load_user_channels,
                save_user_channels,
                Config,
            )
            from ...config import update_last_dispatch
            from ..channels.manager import ChannelManager
            from ..channels.utils import make_process_from_runner

            # Load per-user channels, auto-create from agent config
            # on first access so every user starts with their own copy
            user_channels = load_user_channels(
                self.workspace_dir, user_id,
            )
            if user_channels is None and self._config.channels is not None:
                user_channels = self._config.channels.model_copy(deep=True)
                save_user_channels(
                    self.workspace_dir, user_id, user_channels,
                )
            elif user_channels is None:
                user_channels = self._config.channels

            if user_channels is None:
                self._user_channel_managers[user_id] = None
                return None

            temp_config = Config(channels=user_channels)
            runner = self._service_manager.services["runner"]

            def on_last_dispatch(channel, uid, session_id):
                update_last_dispatch(
                    channel=channel,
                    user_id=uid,
                    session_id=session_id,
                    agent_id=self.agent_id,
                )

            cm = ChannelManager.from_config(
                process=make_process_from_runner(runner),
                config=temp_config,
                on_last_dispatch=on_last_dispatch,
                workspace_dir=self.workspace_dir,
            )
            cm.set_user_id(user_id)
            cm.set_workspace(self)
            self._user_channel_managers[user_id] = cm
            logger.info(
                f"Created per-user ChannelManager for "
                f"agent={self.agent_id}, user={user_id}",
            )

            # Start the CM so that enabled channels begin listening
            # immediately (e.g. DingTalk Stream connections).
            try:
                await cm.start_all()
                logger.info(
                    f"Started per-user ChannelManager for "
                    f"agent={self.agent_id}, user={user_id}",
                )
            except Exception:
                logger.exception(
                    f"Failed to start per-user ChannelManager for "
                    f"agent={self.agent_id}, user={user_id}",
                )

            return cm

    async def discover_per_user_channel_managers(self) -> None:
        """Scan users/*/channels.json and start per-user CMs at boot.

        Called after the workspace-level CM has been created so that
        per-user bot connections (DingTalk, Feishu, etc.) are restored
        automatically on server restart without requiring each user to
        hit the config API.
        """
        users_root = self.workspace_dir / "users"
        if not users_root.is_dir():
            return

        started = 0
        for user_dir in sorted(users_root.iterdir()):
            if not user_dir.is_dir():
                continue
            user_id = user_dir.name
            channels_file = user_dir / "channels.json"
            if not channels_file.is_file():
                continue

            # Skip if already cached (shouldn't happen at boot, but safe)
            if user_id in self._user_channel_managers:
                continue

            try:
                cm = await self.get_channel_manager(user_id)
                if cm is not None:
                    started += 1
            except Exception:
                logger.exception(
                    "Failed to discover per-user CM for "
                    "agent=%s user=%s",
                    self.agent_id,
                    user_id,
                )

        if started:
            logger.info(
                "Discovered %d per-user ChannelManager(s) for agent=%s",
                started,
                self.agent_id,
            )

    def set_manager(self, manager) -> None:
        """Set reference to MultiAgentManager for /daemon restart.

        Args:
            manager: MultiAgentManager instance
        """
        self._manager = manager
        # Pass to runner for /daemon restart command
        if self.runner is not None:
            self.runner._manager = manager  # pylint: disable=protected-access

    def _register_services(  # pylint: disable=too-many-statements
        self,
    ) -> None:
        """Register all workspace services with ServiceManager.

        Uses declarative ServiceDescriptor configuration to replace
        hardcoded initialization logic.
        """
        # pylint: disable=protected-access
        from ...agents.memory.base_memory_manager import (
            get_memory_manager_backend,
        )
        from ...agents.context.base_context_manager import (
            get_context_manager_backend,
        )

        sm = self._service_manager

        # Priority 10: Runner (reusable — avoids tokio thread leak on reload)
        sm.register(
            ServiceDescriptor(
                name="runner",
                service_class=AgentRunner,
                init_args=lambda ws: {
                    "agent_id": ws.agent_id,
                    "workspace_dir": ws.workspace_dir,
                    "task_tracker": ws._task_tracker,
                },
                post_init=lambda ws, runner: runner.set_workspace(ws),
                stop_method="stop",
                reusable=True,
                reload_func=lambda ws, runner: runner.refresh_state(
                    ws._task_tracker,
                ),
                priority=10,
                concurrent_init=False,
            ),
        )

        # Priority 20: Core services (concurrent)
        sm.register(
            ServiceDescriptor(
                name="memory_manager",
                service_class=lambda ws: get_memory_manager_backend(
                    ws.memory_manager_backend,
                ),
                init_args=lambda ws: {
                    "working_dir": str(ws.workspace_dir),
                    "agent_id": ws.agent_id,
                    **(
                        {
                            "config": ws._config.running.mem0_memory_config,
                        }
                        if ws.memory_manager_backend == "mem0"
                        else {}
                    ),
                },
                post_init=lambda ws, mm: setattr(
                    ws._service_manager.services["runner"],
                    "memory_manager",
                    mm,
                ),
                start_method="start",
                stop_method="close",
                reusable=True,
                priority=20,
                concurrent_init=True,
            ),
        )

        sm.register(
            ServiceDescriptor(
                name="context_manager",
                service_class=lambda ws: get_context_manager_backend(
                    ws._config.running.context_manager_backend,
                ),
                init_args=lambda ws: {
                    "working_dir": str(ws.workspace_dir),
                    "agent_id": ws.agent_id,
                },
                post_init=lambda ws, cm: setattr(
                    ws._service_manager.services["runner"],
                    "context_manager",
                    cm,
                ),
                start_method="start",
                stop_method="close",
                reusable=True,
                priority=20,
                concurrent_init=True,
            ),
        )

        sm.register(
            ServiceDescriptor(
                name="mcp_manager",
                service_class=MCPClientManager,
                post_init=create_mcp_service,
                stop_method="close_all",
                priority=20,
                concurrent_init=True,
            ),
        )

        sm.register(
            ServiceDescriptor(
                name="chat_manager",
                service_class=None,
                post_init=create_chat_service,
                reusable=True,
                priority=20,
                concurrent_init=True,
            ),
        )

        # Priority 25: Runner start
        sm.register(
            ServiceDescriptor(
                name="runner_start",
                service_class=None,
                post_init=lambda ws, _: ws._service_manager.services[
                    "runner"
                ].start(),
                priority=25,
                concurrent_init=False,
            ),
        )

        # Priority 30: Channel manager
        sm.register(
            ServiceDescriptor(
                name="channel_manager",
                service_class=None,
                post_init=create_channel_service,
                start_method="start_all",
                stop_method="stop_all",
                priority=30,
                concurrent_init=False,
            ),
        )

        # Priority 40: Cron manager
        sm.register(
            ServiceDescriptor(
                name="cron_manager",
                service_class=CronManager,
                init_args=lambda ws: {  # pylint: disable=protected-access
                    "repo": MultiUserJobRepository(ws.workspace_dir),
                    "runner": ws._service_manager.services["runner"],
                    "channel_manager": ws._service_manager.services.get(
                        "channel_manager",
                    ),
                    "timezone": normalize_tz(get_user_timezone_name()) or "Asia/Shanghai",
                    "agent_id": ws.agent_id,
                    "record_repo": ExecutionRecordRepository(ws.workspace_dir),
                },
                start_method="start",
                stop_method="stop",
                priority=40,
                concurrent_init=False,
            ),
        )

        # Priority 50: Agent Config Watcher (conditional)
        sm.register(
            ServiceDescriptor(
                name="agent_config_watcher",
                service_class=None,
                post_init=create_agent_config_watcher,
                start_method="start",
                stop_method="stop",
                priority=50,
                concurrent_init=False,
            ),
        )

        # Priority 51: MCP Config Watcher (conditional)
        sm.register(
            ServiceDescriptor(
                name="mcp_config_watcher",
                service_class=None,
                post_init=create_mcp_config_watcher,
                start_method="start",
                stop_method="stop",
                priority=51,
                concurrent_init=False,
            ),
        )

    async def set_reusable_components(self, components: dict) -> None:
        """Set components to reuse from previous instance.

        Must be called BEFORE start(). Allows reusing components that support
        hot-reload without recreating them. If a service has a reload_func,
        it will be called during this process.

        Args:
            components: Dict mapping component name to instance.
                Supported keys:
                - 'memory_manager': BaseMemoryManager instance
                - 'context_manager': BaseContextManager instance
                - 'chat_manager': ChatManager instance

        Example:
            new_ws = Workspace("default", workspace_dir)
            await new_ws.set_reusable_components({
                'memory_manager': old_ws.memory_manager,
                'chat_manager': old_ws.chat_manager,
            })
            await new_ws.start()
        """
        if self._started:
            logger.warning(
                f"Cannot set reusable components for already started "
                f"workspace: {self.agent_id}",
            )
            return

        # Delegate to ServiceManager
        for name, component in components.items():
            await self._service_manager.set_reusable(name, component)

    async def _evict_idle_memory_managers(self) -> None:
        """Close per-user memory managers that have been idle longer than TTL.

        Each ReMeLightMemoryManager spawns a notify-rs file-watcher asyncio
        task.  If managers accumulate without eviction, those tasks pile up and
        saturate the event loop (5-7 s per request).  This method is called
        periodically by the eviction loop started in start().
        """
        now = time.monotonic()
        # Identify candidates outside the lock to minimise lock hold time.
        candidates = [
            uid
            for uid, (_, last) in self._user_memory_managers.items()
            if now - last > _MM_IDLE_TTL_S
        ]
        if not candidates:
            return

        async with self._user_memory_manager_lock:
            for uid in candidates:
                entry = self._user_memory_managers.pop(uid, None)
                if entry is None:
                    continue
                mm, _ = entry
                try:
                    await mm.close()
                    logger.info(
                        f"Evicted idle per-user memory manager "
                        f"(idle>{_MM_IDLE_TTL_S:.0f}s): "
                        f"agent={self.agent_id}, user={uid}",
                    )
                except Exception as exc:
                    logger.warning(
                        f"Error closing evicted memory manager "
                        f"agent={self.agent_id}, user={uid}: {exc}",
                    )

    def _start_mm_eviction_loop(self) -> None:
        """Start a background task that periodically evicts idle managers."""
        async def _loop():
            while self._started:
                await asyncio.sleep(_MM_EVICTION_INTERVAL_S)
                try:
                    await self._evict_idle_memory_managers()
                except Exception as exc:
                    logger.warning(f"MM eviction loop error: {exc}")

        self._mm_eviction_task = asyncio.create_task(_loop())
        logger.info(
            f"Memory-manager eviction loop started "
            f"(interval={_MM_EVICTION_INTERVAL_S:.0f}s, "
            f"ttl={_MM_IDLE_TTL_S:.0f}s): agent={self.agent_id}",
        )

    async def start(self):
        """Start workspace and initialize all components."""
        if self._started:
            logger.debug(f"Workspace already started: {self.agent_id}")
            return

        logger.info(f"Starting workspace: {self.agent_id}")

        from ...agents.skills_manager import (
            ensure_skill_pool_initialized,
        )

        try:
            ensure_skill_pool_initialized()
        except Exception as e:
            logger.warning(
                f"Skill pool initialization failed (non-fatal): {e}",
            )

        try:
            # 1. Load agent configuration
            self._config = load_agent_config(self.agent_id)
            logger.debug(f"Loaded config for agent: {self.agent_id}")

            # 2. Start all services via ServiceManager
            await self._service_manager.start_all()

            self._started = True
            # Start idle-eviction loop AFTER _started=True so the loop exits
            # cleanly when stop() is called.
            self._start_mm_eviction_loop()
            logger.info(f"Workspace started successfully: {self.agent_id}")

        except Exception as e:
            logger.error(
                f"Failed to start agent instance {self.agent_id}: {e}",
            )
            # Clean up partially started components
            await self.stop()
            raise

    async def stop(self, final: bool = True):
        """Stop agent instance and clean up all resources.

        Args:
            final: If True (default), stop ALL services including reusable.
                   If False, skip reusable services (for reload scenario).
        """
        if not self._started:
            logger.debug(f"Workspace not started: {self.agent_id}")
            return

        logger.info(
            f"Stopping agent instance: {self.agent_id} (final={final})",
        )

        # Stop idle-eviction loop first
        if self._mm_eviction_task and not self._mm_eviction_task.done():
            self._mm_eviction_task.cancel()
            try:
                await self._mm_eviction_task
            except asyncio.CancelledError:
                pass
        self._mm_eviction_task = None

        # Close all per-user memory managers
        for uid, (mm, _) in self._user_memory_managers.items():
            try:
                await mm.close()
                logger.debug(
                    f"Closed per-user memory manager for "
                    f"agent={self.agent_id}, user={uid}",
                )
            except Exception as e:
                logger.warning(
                    f"Error closing per-user memory manager "
                    f"for user={uid}: {e}",
                )
        self._user_memory_managers.clear()

        # Clear per-user sessions cache
        self._user_sessions.clear()

        # Close all per-user channel managers
        for uid, cm in self._user_channel_managers.items():
            if cm is not None:
                try:
                    await cm.stop_all()
                    logger.debug(
                        f"Stopped per-user ChannelManager for "
                        f"agent={self.agent_id}, user={uid}",
                    )
                except Exception as e:
                    logger.warning(
                        f"Error stopping per-user ChannelManager "
                        f"for user={uid}: {e}",
                    )
        self._user_channel_managers.clear()

        # Stop all services via ServiceManager (handles reuse automatically)
        await self._service_manager.stop_all(final=final)

        self._started = False
        logger.info(f"Workspace stopped: {self.agent_id}")

    def __repr__(self) -> str:
        """String representation of workspace."""
        status = "started" if self._started else "stopped"
        return (
            f"Workspace(id={self.agent_id}, "
            f"workspace={self.workspace_dir}, "
            f"status={status})"
        )
