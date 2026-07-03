# -*- coding: utf-8 -*-
# pylint: disable=redefined-outer-name,unused-argument
import inspect
import asyncio
import mimetypes
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from agentscope_runtime.engine.app import AgentApp
from agentscope_runtime.engine.schemas.exception import (
    AppBaseException,
)

from ..config import load_config  # pylint: disable=no-name-in-module
from ..config.utils import get_config_path
from ..constant import (
    DOCS_ENABLED,
    LOG_LEVEL_ENV,
    CORS_ORIGINS,
    WORKING_DIR,
    PROJECT_NAME,
    EnvVarLoader,
)
from ..__version__ import __version__
from ..utils.logging import (
    setup_logger,
    add_project_file_handler,
    LOG_FILE_PATH,
)
from ..utils.system_info import summarize_python_environment
from .auth_jwt.middleware import JWTAuthMiddleware
from .routers import router as api_router, create_agent_scoped_router
from .routers.agent_scoped import AgentContextMiddleware
from .routers.approval import router as approval_router
from .routers.voice import voice_router
from ..envs import load_envs_into_environ
from ..providers.provider_manager import ProviderManager
from ..local_models.manager import LocalModelManager
from .multi_agent_manager import MultiAgentManager
from .migration import (
    migrate_legacy_workspace_to_default_agent,
    migrate_legacy_skills_to_skill_pool,
    ensure_default_agent_exists,
    ensure_qa_agent_exists,
)
from .channels.registry import register_custom_channel_routes

# Apply log level on load so reload child process gets same level as CLI.
logger = setup_logger(os.environ.get(LOG_LEVEL_ENV, "info"))

# Ensure static assets are served with browser-compatible MIME types across
# platforms (notably Windows may miss .js/.mjs mappings).
mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/wasm", ".wasm")

# Load persisted env vars into os.environ at module import time
# so they are available before the lifespan starts.
load_envs_into_environ()


def _patch_prometheus_routing() -> None:
    """Monkey-patch prometheus_fastapi_instrumentator routing to tolerate
    FastAPI >=0.137.0 ``_IncludedRouter`` objects that have no ``.path``.

    FastAPI 0.137.0+ wraps sub-routers in ``_IncludedRouter`` nodes inside
    ``app.routes`` instead of flattening them.  The prometheus instrumentation
    traverses ``app.routes`` and blindly reads ``.path`` on every entry, which
    crashes on ``_IncludedRouter``.  This patch recurses into
    ``_IncludedRouter.original_router.routes`` instead so routing resolution
    still works for deeply-nested route trees.
    """
    from starlette.routing import Match, Mount  # noqa: F811

    from prometheus_fastapi_instrumentator import routing as _routing_mod

    try:
        from fastapi.routing import _IncludedRouter  # type: ignore[attr-defined]
    except ImportError:
        # FastAPI < 0.137 — nothing to patch.
        return

    def _patched_get_route_name(scope, routes, route_name=None):
        """Same as the original, but descends into _IncludedRouter nodes."""
        for route in routes:
            match, child_scope = route.matches(scope)
            if match == Match.FULL:
                # Recurse into _IncludedRouter instead of reading .path
                if isinstance(route, _IncludedRouter):
                    resolved = _patched_get_route_name(
                        {**scope, **child_scope},
                        route.original_router.routes,
                        route_name,
                    )
                    if resolved is not None:
                        return resolved
                    # Fall through so other routes are still tried
                    continue

                route_name = route.path
                child_scope = {**scope, **child_scope}
                if isinstance(route, Mount) and route.routes:
                    child_route_name = _patched_get_route_name(
                        child_scope, route.routes, route_name
                    )
                    if child_route_name is None:
                        route_name = None
                    else:
                        route_name += child_route_name
                return route_name
            elif match == Match.PARTIAL and route_name is None:
                # _IncludedRouter has no .path; skip it for PARTIAL matches too
                if not isinstance(route, _IncludedRouter):
                    route_name = route.path
        return None

    _routing_mod._get_route_name = _patched_get_route_name


# Dynamic runner that selects the correct workspace runner based on request
class DynamicMultiAgentRunner:
    """Runner wrapper that dynamically routes to the correct workspace runner.

    This allows AgentApp to work with multiple agents by inspecting
    the X-Agent-Id header on each request.
    """

    def __init__(self):
        self.framework_type = "agentscope"
        self._multi_agent_manager = None

    def set_multi_agent_manager(self, manager):
        """Set the MultiAgentManager instance after initialization."""
        self._multi_agent_manager = manager

    async def _get_workspace(self, request):
        """Get the correct workspace based on request.

        Returns:
            Workspace: The workspace instance for the current agent.
        """
        from .agent_context import get_current_agent_id

        # Get agent_id from context (set by middleware or header)
        agent_id = get_current_agent_id()

        logger.debug(f"_get_workspace: agent_id={agent_id}")

        # Get the correct workspace
        if not self._multi_agent_manager:
            raise RuntimeError("MultiAgentManager not initialized")

        try:
            workspace = await self._multi_agent_manager.get_agent(agent_id)
            logger.debug(
                "Got workspace: %s, runner: %s",
                workspace.agent_id,
                workspace.runner,
            )
            return workspace
        except (ValueError, AppBaseException) as e:
            logger.error(f"Agent not found: {e}")
            raise
        except Exception as e:
            logger.error(
                f"Error getting workspace: {e}",
                exc_info=True,
            )
            raise

    async def _get_workspace_runner(self, request):
        """Get the correct workspace runner based on request."""
        workspace = await self._get_workspace(request)
        return workspace.runner

    async def stream_query(self, request, *args, **kwargs):
        """Dynamically route to the correct workspace runner.

        Registers the task with the workspace's TaskTracker so that
        graceful shutdown during agent reload can detect in-flight
        background tasks (fixes #3275).
        """
        logger.debug("DynamicMultiAgentRunner.stream_query called")
        workspace = None
        run_key = None
        try:
            workspace = await self._get_workspace(request)
            runner = workspace.runner
            logger.debug(f"Got runner: {runner}, type: {type(runner)}")

            # Register this task with the workspace's TaskTracker so
            # _graceful_stop_old_instance() can see it during reload.
            run_key = f"ext-{uuid.uuid4().hex}"
            await workspace.task_tracker.register_external_task(run_key)

            # Delegate to the actual runner's stream_query generator
            count = 0
            async for item in runner.stream_query(request, *args, **kwargs):
                count += 1
                logger.debug(f"Yielding item #{count}: {type(item)}")
                yield item
            logger.debug(f"stream_query completed, yielded {count} items")
        except Exception as e:
            logger.error(
                f"Error in stream_query: {e}",
                exc_info=True,
            )
            # Yield error message to client
            yield {
                "error": str(e),
                "type": "error",
            }
        finally:
            # Always unregister the task when done (success, error,
            # or cancellation).
            if workspace is not None and run_key is not None:
                await workspace.task_tracker.unregister_external_task(run_key)

    async def query_handler(self, request, *args, **kwargs):
        """Dynamically route to the correct workspace runner.

        Registers the task with the workspace's TaskTracker so that
        graceful shutdown during agent reload can detect in-flight
        requests (fixes #3275).
        """
        workspace = None
        run_key = None
        try:
            workspace = await self._get_workspace(request)
            runner = workspace.runner

            run_key = f"ext-{uuid.uuid4().hex}"
            await workspace.task_tracker.register_external_task(run_key)

            async for item in runner.query_handler(request, *args, **kwargs):
                yield item
        finally:
            # Always unregister the task when done (success, error,
            # or cancellation).
            if workspace is not None and run_key is not None:
                await workspace.task_tracker.unregister_external_task(run_key)

    # Async context manager support for AgentApp lifecycle
    async def __aenter__(self):
        """
        No-op context manager entry (workspaces manage their own runners).
        """
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """No-op context manager exit (workspaces manage their own runners)."""
        return None


# Use dynamic runner for AgentApp
runner = DynamicMultiAgentRunner()

agent_app = AgentApp(
    app_name="Friday",
    app_description="A helpful assistant with background task support",
    runner=runner,
    enable_stream_task=True,
    stream_task_queue="stream_query",
    stream_task_timeout=300,
)


@asynccontextmanager
async def lifespan(  # pylint: disable=too-many-statements,too-many-branches
    app: FastAPI,
):
    startup_start_time = time.time()
    add_project_file_handler(LOG_FILE_PATH)

    # ================================================================
    # Phase 1: Fast synchronous setup (target < 100ms)
    # Everything here must be lightweight so the server starts quickly.
    # ================================================================

    # Ensure internal CLI token exists
    from .auth_jwt.internal_token import get_internal_token

    get_internal_token()

    try:
        from ..utils.telemetry import (
            collect_and_upload_telemetry,
            has_telemetry_been_collected,
            is_telemetry_opted_out,
        )

        if not is_telemetry_opted_out(
            WORKING_DIR,
        ) and not has_telemetry_been_collected(WORKING_DIR):
            collect_and_upload_telemetry(WORKING_DIR)
    except Exception:
        logger.debug(
            "Telemetry collection skipped due to error",
            exc_info=True,
        )

    logger.debug("Checking for legacy config migration...")
    migrate_legacy_workspace_to_default_agent()
    ensure_default_agent_exists()
    migrate_legacy_skills_to_skill_pool()
    # ensure_qa_agent_exists()

    # Create core managers (instant — no I/O)
    logger.debug("Initializing MultiAgentManager...")
    multi_agent_manager = MultiAgentManager()
    provider_manager = ProviderManager.get_instance()
    local_model_manager = LocalModelManager.get_instance()

    # Start token usage manager background tasks
    logger.debug("Starting TokenUsageManager background tasks...")
    from ..token_usage import get_token_usage_manager

    token_usage_manager = get_token_usage_manager()
    token_usage_manager.start(flush_interval=10)

    # Expose to endpoints (must be set before first request arrives)
    app.state.multi_agent_manager = multi_agent_manager
    app.state.provider_manager = provider_manager
    app.state.local_model_manager = local_model_manager
    app.state.plugin_loader = None
    app.state.plugin_registry = None

    if isinstance(runner, DynamicMultiAgentRunner):
        runner.set_multi_agent_manager(multi_agent_manager)

    async def _get_agent_by_id(agent_id: str = None):
        """Get agent instance by ID, or active agent if not specified."""
        if agent_id is None:
            config = load_config(get_config_path())
            agent_id = config.agents.active_agent or "default"
        return await multi_agent_manager.get_agent(agent_id)

    app.state.get_agent_by_id = _get_agent_by_id

    # ================================================================
    # Phase 1.5: Service initialization (must complete before yield)
    # JWT auth (DB + Redis) and MinIO file library are initialized
    # here so they are ready before the first API request arrives.
    # ================================================================

    # -- JWT Auth (MySQL + Redis) --
    try:
        from .auth_jwt.database import init_db
        from .auth_jwt.redis_client import init_redis

        await init_db()
        await init_redis()
        logger.info("JWT auth initialized (MySQL + Redis)")
    except Exception as exc:
        logger.error(
            "JWT auth initialization failed: %s",
            exc,
            exc_info=True,
        )

    # -- MinIO File Library --
    minio_endpoint = EnvVarLoader.get_str(
        "AIWORK_MINIO_ENDPOINT", "",
    ).strip()
    if minio_endpoint:
        try:
            from ..file_library.minio_client import init_minio_client
            from ..file_library.cleanup import run_cleanup_loop
            from ..file_library import is_minio_available

            if is_minio_available():
                client = await init_minio_client()
                if client is not None:
                    from .auth_jwt.database import get_session_factory

                    _cleanup_task = asyncio.create_task(
                        run_cleanup_loop(get_session_factory()),
                    )
                    app.state._minio_cleanup_task = _cleanup_task

                    # Presale template cleanup (separate task)
                    from ..presale_template.cleanup import (
                        run_presale_cleanup_loop,
                    )
                    _presale_cleanup_task = asyncio.create_task(
                        run_presale_cleanup_loop(get_session_factory()),
                    )
                    app.state._presale_cleanup_task = _presale_cleanup_task

                    logger.info(
                        "MinIO file library initialized (bucket=%s)",
                        client.bucket,
                    )
                else:
                    logger.info(
                        "MinIO endpoint configured but connection failed "
                        "— file library disabled",
                    )
            else:
                logger.warning(
                    "MinIO endpoint configured but minio SDK not "
                    "installed — file library disabled. "
                    "Run: pip install minio",
                )
        except Exception as exc:
            logger.error(
                "MinIO file library initialization failed: %s",
                exc,
                exc_info=True,
            )

    # -- pgvector RAG Knowledge Base --
    pgvector_url = EnvVarLoader.get_str("AIWORK_PGVECTOR_DB_URL", "").strip()
    if pgvector_url:
        try:
            from ..rag import is_rag_available
            if is_rag_available():
                from ..rag.database import init_pg_db
                await init_pg_db()
                logger.info("RAG knowledge base initialized (pgvector)")

                # Initialize RAG MinIO client (separate buckets)
                from ..rag.rag_minio import init_rag_minio
                rag_minio = await init_rag_minio()

                # Initialize LLM output MinIO client (separate bucket)
                from ..llm_output.minio_client import init_llm_output_minio
                llm_output_client = await init_llm_output_minio()
                if llm_output_client:
                    logger.info(
                        "LLM output MinIO initialized (bucket=%s)",
                        llm_output_client.bucket,
                    )
                else:
                    logger.info("LLM output MinIO skipped (endpoint not configured)")

                # Recover stale documents stuck in processing/pending
                if rag_minio is not None:
                    from ..rag.database import get_pg_session_factory
                    from ..rag.indexer import recover_stale_documents

                    _rag_factory = get_pg_session_factory()
                    async with _rag_factory() as _rag_db:
                        recovered = await recover_stale_documents(_rag_db)
                        if recovered:
                            logger.info(
                                "Recovered %d stale RAG document(s)",
                                recovered,
                            )

                    # Launch RAG cleanup loop
                    from ..rag.cleanup import run_rag_cleanup_loop
                    _rag_cleanup_task = asyncio.create_task(
                        run_rag_cleanup_loop(get_pg_session_factory()),
                    )
                    app.state._rag_cleanup_task = _rag_cleanup_task
        except Exception as exc:
            logger.error(
                "RAG initialization failed: %s", exc, exc_info=True,
            )

    # -- Periodic thread GC --
    # Forces Python GC every 10 minutes so that dropped ChromaDB/reme clients
    # (whose Rust Tokio runtimes hold OS threads) are collected promptly,
    # preventing thread accumulation across workspace hot-reloads.
    from .thread_gc import run_thread_gc_loop
    _thread_gc_task = asyncio.create_task(run_thread_gc_loop())
    app.state._thread_gc_task = _thread_gc_task
    logger.info("Thread GC loop started (interval=10800s / 3h)")

    fast_elapsed = time.time() - startup_start_time
    logger.info(
        f"Server ready in {fast_elapsed:.3f}s "
        f"(agents loading in background)",
    )

    # ================================================================
    # Phase 2: Background heavy initialization
    # Agents, plugins, and services start in a background task so the
    # server can begin accepting HTTP requests immediately.
    # First API requests that need an agent will await its readiness
    # via MultiAgentManager.get_agent() lazy-loading / event wait.
    # ================================================================

    async def _background_startup():  # pylint: disable=too-many-statements
        try:
            # Start all configured agents (truly parallel now)
            await multi_agent_manager.start_all_configured_agents()

            provider_manager.start_local_model_resume(local_model_manager)

            # ---- Plugin System ----
            logger.debug("Initializing plugin system...")

            from ..plugins.loader import PluginLoader
            from ..plugins.runtime import RuntimeHelpers
            from ..config.utils import get_plugins_dir

            plugin_dirs = [
                get_plugins_dir(),
            ]

            plugin_loader = PluginLoader(plugin_dirs)

            config = load_config(get_config_path())
            plugin_configs = (
                config.plugins if hasattr(config, "plugins") else {}
            )
            logger.debug(
                f"Loading plugins with {len(plugin_configs)} config(s)",
            )

            loaded_plugins = await plugin_loader.load_all_plugins(
                configs=plugin_configs,
            )
            logger.debug(f"Loaded {len(loaded_plugins)} plugin(s)")

            runtime_helpers = RuntimeHelpers(
                provider_manager=provider_manager,
            )
            plugin_loader.registry.set_runtime_helpers(runtime_helpers)

            for (
                provider_id,
                provider_reg,
            ) in plugin_loader.registry.get_all_providers().items():
                provider_manager.register_plugin_provider(
                    provider_id=provider_id,
                    provider_class=provider_reg.provider_class,
                    label=provider_reg.label,
                    base_url=provider_reg.base_url,
                    metadata=provider_reg.metadata,
                )
                logger.debug(
                    f"Registered plugin provider: {provider_id}",
                )

            app.state.plugin_loader = plugin_loader
            app.state.plugin_registry = plugin_loader.registry

            # ---- Plugin Control Commands ----
            logger.debug("Registering plugin control commands...")
            from ..app.runner.control_commands import register_command
            from ..app.channels.command_registry import CommandRegistry

            command_registry = CommandRegistry()

            control_commands = plugin_loader.registry.get_control_commands()
            for cmd_reg in control_commands:
                try:
                    register_command(cmd_reg.handler)

                    command_registry.register_command(
                        f"/{cmd_reg.handler.command_name}",
                        priority_level=cmd_reg.priority_level,
                    )

                    logger.debug(
                        f"Registered plugin control command: "
                        f"/{cmd_reg.handler.command_name} "
                        f"from plugin '{cmd_reg.plugin_id}' (priority"
                        f"={cmd_reg.priority_level})",
                    )
                except Exception as e:
                    logger.error(
                        f"✗ Failed to register control command "
                        f"'{cmd_reg.handler.command_name}' "
                        f"from plugin '{cmd_reg.plugin_id}': {e}",
                        exc_info=True,
                    )

            # ---- Startup Hooks ----
            logger.debug("Executing plugin startup hooks...")
            startup_hooks = plugin_loader.registry.get_startup_hooks()
            for hook in startup_hooks:
                try:
                    logger.debug(
                        f"Executing startup hook '{hook.hook_name}' "
                        f"from plugin '{hook.plugin_id}' "
                        f"(priority={hook.priority})",
                    )

                    result = hook.callback()
                    if inspect.iscoroutine(
                        result,
                    ) or inspect.isawaitable(result):
                        await result

                    logger.debug(
                        f"Completed startup hook '{hook.hook_name}' "
                        f"from plugin '{hook.plugin_id}'",
                    )
                except Exception as e:
                    logger.error(
                        f"✗ Failed to execute startup hook "
                        f"'{hook.hook_name}' "
                        f"from plugin '{hook.plugin_id}': {e}",
                        exc_info=True,
                    )

            # ---- Approval Service ----
            try:
                default_agent = await multi_agent_manager.get_agent(
                    "default",
                )
                if default_agent.channel_manager:
                    from .approvals import get_approval_service

                    get_approval_service().set_channel_manager(
                        default_agent.channel_manager,
                    )
            except Exception as e:
                logger.warning(f"Approval service setup skipped: {e}")

            startup_elapsed = time.time() - startup_start_time
            logger.info(
                "Background startup completed in "
                f"{startup_elapsed:.3f} seconds",
            )

            # Print server URL again so it's visible after background logs
            from ..config.utils import read_last_api
            from ..utils.startup_display import print_ready_banner

            api_info = read_last_api()
            print_ready_banner(api_info, startup_elapsed)
        except Exception:
            logger.error(
                "Background startup encountered an error",
                exc_info=True,
            )

    _bg_task = asyncio.create_task(_background_startup())

    async def _session_container_reaper() -> None:
        while True:
            await asyncio.sleep(60)
            try:
                from ..security.sandbox.session_container_manager import (
                    get_session_container_manager,
                )

                count = await get_session_container_manager().reap_idle()
                if count:
                    logger.info(
                        "Reaped %d idle session container(s)",
                        count,
                    )
            except Exception:
                logger.debug(
                    "Session container reaper tick failed",
                    exc_info=True,
                )

    _session_reaper_task = asyncio.create_task(_session_container_reaper())

    try:
        yield
    finally:
        _session_reaper_task.cancel()
        with suppress(asyncio.CancelledError):
            await _session_reaper_task

        try:
            from ..security.sandbox.session_container_manager import (
                get_session_container_manager,
            )

            destroyed = await get_session_container_manager().destroy_all()
            if destroyed:
                logger.info(
                    "Destroyed %d session container(s) on shutdown",
                    destroyed,
                )
        except Exception:
            logger.debug(
                "Session container shutdown cleanup failed",
                exc_info=True,
            )

        # Cancel background startup if still in progress
        if not _bg_task.done():
            _bg_task.cancel()
            with suppress(asyncio.CancelledError):
                await _bg_task

        # ==================== Execute Shutdown Hooks ====================
        plugin_registry = getattr(app.state, "plugin_registry", None)
        if plugin_registry is not None:
            logger.info("Executing plugin shutdown hooks...")
            shutdown_hooks = plugin_registry.get_shutdown_hooks()
            for hook in shutdown_hooks:
                try:
                    logger.info(
                        f"Executing shutdown hook '{hook.hook_name}' "
                        f"from plugin '{hook.plugin_id}' (priority"
                        f"={hook.priority})",
                    )

                    result = hook.callback()
                    if inspect.iscoroutine(result) or inspect.isawaitable(
                        result,
                    ):
                        await result

                    logger.info(
                        f"✓ Completed shutdown hook '{hook.hook_name}' "
                        f"from plugin '{hook.plugin_id}'",
                    )
                except Exception as e:
                    logger.error(
                        f"✗ Failed to execute shutdown hook "
                        f"'{hook.hook_name}' "
                        f"from plugin '{hook.plugin_id}': {e}",
                        exc_info=True,
                    )

        local_model_mgr = getattr(app.state, "local_model_manager", None)
        if local_model_mgr is not None:
            logger.info("Stopping local model server...")
            try:
                await local_model_mgr.shutdown_server()
            except Exception as exc:
                logger.error(
                    "Error shutting down local model server gracefully: %s",
                    exc,
                )
                with suppress(OSError, RuntimeError, ValueError):
                    local_model_mgr.shutdown_server_sync()

        # Stop multi-agent manager (stops all agents and their components)
        multi_agent_mgr = getattr(app.state, "multi_agent_manager", None)
        if multi_agent_mgr is not None:
            logger.info("Stopping MultiAgentManager...")
            try:
                await multi_agent_mgr.stop_all()
            except Exception as e:
                logger.error(f"Error stopping MultiAgentManager: {e}")

        # Stop token usage manager (drain queue and final flush)
        logger.info("Stopping TokenUsageManager...")
        try:
            await token_usage_manager.stop()
        except Exception as e:
            logger.error(f"Error stopping TokenUsageManager: {e}")

        # ---- MinIO File Library cleanup ----
        cleanup_task = getattr(app.state, "_minio_cleanup_task", None)
        if cleanup_task is not None:
            cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup_task
        presale_cleanup_task = getattr(app.state, "_presale_cleanup_task", None)
        if presale_cleanup_task is not None:
            presale_cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await presale_cleanup_task
        try:
            from ..file_library.minio_client import shutdown_minio_client
            await shutdown_minio_client()
        except Exception as e:
            logger.error(f"Error shutting down MinIO client: {e}")

        # ---- RAG Knowledge Base cleanup ----
        rag_cleanup_task = getattr(app.state, "_rag_cleanup_task", None)
        if rag_cleanup_task is not None:
            rag_cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await rag_cleanup_task
        try:
            from ..rag.rag_minio import shutdown_rag_minio
            await shutdown_rag_minio()
        except Exception as e:
            logger.error(f"Error shutting down RAG MinIO client: {e}")

        # ---- LLM Output MinIO cleanup ----
        try:
            from ..llm_output.minio_client import shutdown_llm_output_minio
            await shutdown_llm_output_minio()
        except Exception as e:
            logger.error(f"Error shutting down LLM output MinIO client: {e}")
        try:
            from ..rag.database import close_pg_db
            await close_pg_db()
        except Exception as e:
            logger.error(f"Error closing RAG pgvector database: {e}")
        # Close RAG httpx clients (connection pooling cleanup)
        try:
            from ..rag.search_service import close_llm_client
            await close_llm_client()
        except Exception as e:
            logger.error(f"Error closing RAG LLM client: {e}")
        try:
            from ..rag.embedder import close_embedding_client
            await close_embedding_client()
        except Exception as e:
            logger.error(f"Error closing RAG embedding client: {e}")
        try:
            from ..rag.mineru_client import close_mineru_client
            await close_mineru_client()
        except Exception as e:
            logger.error(f"Error closing RAG MinerU client: {e}")

        # ---- JWT Auth cleanup ----
        try:
            from .auth_jwt.database import close_db
            from .auth_jwt.redis_client import close_redis

            await close_db()
            await close_redis()
        except Exception as e:
            logger.error(f"Error closing JWT auth resources: {e}")

        logger.info("Application shutdown complete")


app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if DOCS_ENABLED else None,
    redoc_url="/redoc" if DOCS_ENABLED else None,
    openapi_url="/openapi.json" if DOCS_ENABLED else None,
)

# 当 OpenAPI 文档关闭时，显式注册 /docs、/redoc、/openapi.json 路由，
# 返回 403 直接拒绝访问，而不是返回模糊的 404 Not Found。
if not DOCS_ENABLED:

    @app.get("/docs", include_in_schema=False)
    async def docs_disabled():
        raise HTTPException(status_code=403, detail="OpenAPI documentation is disabled")

    @app.get("/redoc", include_in_schema=False)
    async def redoc_disabled():
        raise HTTPException(status_code=403, detail="OpenAPI documentation is disabled")

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_disabled():
        raise HTTPException(status_code=403, detail="OpenAPI documentation is disabled")

# 在 app = FastAPI(...) 之后
# Prometheus 指标为可选能力（pyproject 中 [metrics] extras）。
# 未安装时不应阻止应用启动，打印 warning 后跳过挂载 /metrics。
try:
    from prometheus_fastapi_instrumentator import Instrumentator  # type: ignore
except ImportError:  # noqa: F401
    logger.warning(
        "prometheus_fastapi_instrumentator 未安装，/metrics 端点不会暴露。"
        " 如需启用请安装可选依赖：pip install 'aiwork[metrics]'。"
    )
else:
    # Monkey-patch prometheus_fastapi_instrumentator routing to handle
    # FastAPI >=0.137.0 _IncludedRouter objects (which have no .path attr).
    # TODO: remove this patch once prometheus-fastapi-instrumentator
    # releases a version compatible with FastAPI 0.137+.
    _patch_prometheus_routing()

    Instrumentator(
        should_group_status_codes=True,
        should_group_untemplated=True,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(app, endpoint="/metrics")

# Add agent context middleware for agent-scoped routes
app.add_middleware(AgentContextMiddleware)

app.add_middleware(JWTAuthMiddleware)

# Apply CORS middleware if CORS_ORIGINS is set
if CORS_ORIGINS:
    origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
    is_wildcard = "*" in origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=not is_wildcard,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )


_CONSOLE_STATIC_ENV = "AIWORK_CONSOLE_STATIC_DIR"


def _resolve_console_static_dir() -> str:
    from ..constant import EnvVarLoader

    static_dir = EnvVarLoader.get_str(_CONSOLE_STATIC_ENV)
    if static_dir:
        return static_dir
    # Shipped dist lives in the package as static data
    pkg_dir = Path(__file__).resolve().parent.parent
    candidate = pkg_dir / "console"
    if candidate.is_dir() and (candidate / "index.html").exists():
        return str(candidate)

    # Fallback to repo data
    repo_dir = pkg_dir.parent.parent
    candidate = repo_dir / "console" / "dist"
    if candidate.is_dir() and (candidate / "index.html").exists():
        return str(candidate)

    # Fallback to cwd data
    cwd = Path(os.getcwd())
    for subdir in ("console/dist", "console_dist"):
        candidate = cwd / subdir
        if candidate.is_dir() and (candidate / "index.html").exists():
            return str(candidate)

    fallback = cwd / "console" / "dist"
    logger.warning(
        f"Console static directory not found. Falling back to '{fallback}'.",
    )
    return str(fallback)


_CONSOLE_STATIC_DIR = _resolve_console_static_dir()
_CONSOLE_INDEX = (
    Path(_CONSOLE_STATIC_DIR) / "index.html" if _CONSOLE_STATIC_DIR else None
)
logger.info(f"STATIC_DIR: {_CONSOLE_STATIC_DIR}")


@app.get("/")
def read_root():
    if _CONSOLE_INDEX and _CONSOLE_INDEX.exists():
        return FileResponse(
            _CONSOLE_INDEX,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return {
        "message": (
            f"{PROJECT_NAME} web console is not available. "
            "If you installed the project from source code, please run "
            "`npm ci && npm run build` in the `console/` "
            f"directory, and restart {PROJECT_NAME} to enable the "
            "web console."
        ),
    }


@app.get("/api/version")
def get_version():
    """Return the current application version (public-safe payload)."""
    return {
        "version": __version__,
    }


@app.get("/api/doctor/runtime")
def get_doctor_runtime():
    """Return server runtime diagnostics for authenticated troubleshooting."""
    return {
        "python_executable": sys.executable,
        "python_environment": summarize_python_environment(),
    }


app.include_router(api_router, prefix="/api")

# Approval router: /api/approval/approve, /api/approval/deny, etc.
app.include_router(approval_router, prefix="/api")

# Agent-scoped router: /api/agents/{agentId}/chats, etc.
agent_scoped_router = create_agent_scoped_router()
app.include_router(agent_scoped_router, prefix="/api")


app.include_router(
    agent_app.router,
    prefix="/api/agent",
    tags=["agent"],
)

# Voice channel: Twilio-facing endpoints at root level (not under /api/).
# POST /voice/incoming, WS /voice/ws, POST /voice/status-callback
app.include_router(voice_router, tags=["voice"])

# Custom channel routes (before SPA catch-all to ensure route priority)
register_custom_channel_routes(app)

# Console static files and SPA fallback
# Register these AFTER API routes to ensure proper routing priority
if os.path.isdir(_CONSOLE_STATIC_DIR):
    _console_path = Path(_CONSOLE_STATIC_DIR)

    def _serve_console_index():
        if _CONSOLE_INDEX and _CONSOLE_INDEX.exists():
            return FileResponse(
                _CONSOLE_INDEX,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

        raise HTTPException(status_code=404, detail="Not Found")

    _assets_dir = _console_path / "assets"
    if _assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(_assets_dir)),
            name="assets",
        )

    @app.get("/console")
    @app.get("/console/")
    @app.get("/console/{full_path:path}")
    def _console_spa_alias(full_path: str = ""):
        _ = full_path
        return _serve_console_index()

    # SPA fallback: catch-all route for frontend routing
    # Must be registered AFTER all API routes to avoid conflicts
    @app.get("/{full_path:path}")
    def _console_spa(full_path: str):
        # Prevent catching common system/special paths
        if full_path in ("docs", "redoc", "openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        # Skip API routes (should already be matched due to registration order)
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not Found")

        # Serve static files from the console build directory (e.g. logo SVGs,
        # favicons, images placed in public/).  Only serve regular files whose
        # path does not escape the console directory.
        if full_path and ".." not in full_path:
            # Security: Reject absolute paths to prevent path traversal bypass
            if not Path(full_path).is_absolute():
                static_file = _console_path / full_path
                if static_file.is_file():
                    return FileResponse(static_file)

        return _serve_console_index()
