# -*- coding: utf-8 -*-
"""mem0-backed memory manager for agents.

Uses mem0 + Redis Stack for vector-based memory storage and retrieval.
Replaces file-based ReMe memory with an API-driven approach: agents use
``memory_search`` / ``memory_add`` / ``memory_list`` / ``memory_update`` /
``memory_delete`` tools instead of reading/writing Markdown files.
"""
import asyncio
import inspect
import json
import logging
import re as _re
import time as _time_mod
import uuid
from datetime import datetime, timezone as _dt_timezone
from typing import Optional

from agentscope.message import Msg, TextBlock, ToolResultBlock, ToolUseBlock
from agentscope.tool import ToolResponse

from ..base_memory_manager import BaseMemoryManager, memory_registry
from .mem0_prompts import (
    MEM0_MEMORY_GUIDANCE_EN,
    MEM0_MEMORY_GUIDANCE_ZH,
)
from ....config.config import load_agent_config
from ....config.context import (
    set_current_recent_max_bytes,
    set_current_workspace_dir,
)
from ....config.timezone import get_user_timezone
from ....constant import EnvVarLoader

logger = logging.getLogger(__name__)

# Minimum interval (seconds) between write operations to prevent abuse.
_WRITE_COOLDOWN_S = 2.0

# Dream batch processing: max memories to include in a single LLM call.
# When total memories exceed this, they are split into multiple batches.
_DREAM_BATCH_SIZE = 50

# Safety cap on total memories loaded by dream().  Protects against
# unbounded LLM token consumption in extreme cases.
_DREAM_MAX_MEMORIES = 2000
def _is_prefix_stream(parts: list[str]) -> bool:
    """Return True if *parts* is a prefix stream rather than a delta stream.

    In prefix mode each chunk contains the full accumulated output so far
    (e.g. ``['{', '{"', '{"up', ...]``).  In delta mode each chunk is an
    incremental addition (e.g. ``['{"updates"', ':[]', '}']``).
    """
    if len(parts) < 2:
        return False
    for i in range(len(parts) - 1):
        if not parts[i + 1].startswith(parts[i]):
            return False
    return True


@memory_registry.register("mem0")
class Mem0MemoryManager(BaseMemoryManager):
    """Memory manager backed by mem0 + Redis Stack.

    Delegates storage, search, and fact extraction to a ``mem0.Memory``
    instance. All mem0 calls run via ``asyncio.to_thread()`` to avoid
    blocking the async event loop.

    Attributes:
        working_dir: Root directory (unused by mem0, kept for interface).
        agent_id: Unique identifier of the owning agent.
        config: ``Mem0MemoryConfig`` from the agent running config.
        user_id: Per-user identifier for multi-user workspaces.
    """

    def __init__(
        self,
        working_dir: str,
        agent_id: str,
        config=None,
        user_id: Optional[str] = None,
    ):
        super().__init__(working_dir=working_dir, agent_id=agent_id)
        self._config = config
        self._user_id = user_id
        self._memory = None
        self._last_add_time: float = 0.0
        self._last_update_time: float = 0.0
        self._last_delete_time: float = 0.0

        logger.info(
            "Mem0MemoryManager init: agent_id=%s, working_dir=%s, user_id=%s",
            agent_id,
            working_dir,
            user_id,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _verify_memory_ownership(
        self, memory_id: str
    ) -> ToolResponse | None:
        """Check that ``memory_id`` belongs to ``_effective_user_id``.

        mem0's ``update()`` and ``delete()`` do not accept a ``user_id``
        filter, so we must validate ownership *before* calling them.
        Returns ``None`` when the memory exists and is owned by the
        current user; otherwise returns a ``ToolResponse`` error that the
        caller should return immediately.
        """
        try:
            existing = await self._run_in_thread(
                self._memory.get, memory_id,
            )
        except Exception as e:
            logger.exception(
                "_verify_memory_ownership get failed [%s]: %s — memory_id=%s",
                type(e).__name__, e, memory_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Failed to verify memory ownership. Please try again.",
                    ),
                ],
            )

        if existing is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text=f"Memory [{memory_id}] not found.",
                    ),
                ],
            )

        owner = existing.get("user_id", "")
        if owner != self._effective_user_id:
            logger.warning(
                "IDOR attempt blocked: memory_id=%s owner=%s caller=%s",
                memory_id, owner, self._effective_user_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text=f"Memory [{memory_id}] not found.",
                    ),
                ],
            )

        return None

    @property
    def _effective_user_id(self) -> str:
        """Return the user_id for mem0 API calls.

        Uses ``self._user_id`` when set (multi-user workspace), otherwise
        falls back to ``self.agent_id``.
        """
        return self._user_id or self.agent_id

    @property
    def _effective_agent_id(self) -> str:
        """Return the agent_id for mem0 API calls."""
        return self.agent_id

    @property
    def _fact_extraction_prompt(self) -> str | None:
        """Build a Chinese fact-extraction prompt for mem0 add().

        Passed as the ``prompt`` parameter to ``memory.add()`` — this
        overrides ``custom_instructions`` in the config and ensures the
        LLM outputs Chinese facts even when the input is in English.
        Returns None when the agent language is not zh-* or when the
        agent config cannot be loaded.
        """
        try:
            agent_config = load_agent_config(self.agent_id)
        except Exception:
            logger.warning(
                "Failed to load agent config for %s, defaulting to zh",
                self.agent_id,
            )
            return (
                "你是一个个人记忆助手。请从对话中用中文提取事实。\n"
                "严格用中文记录所有记忆内容，包括记忆的 text 字段必须用中文输出。\n"
                "只提取有价值的信息：个人信息、偏好、决策、经验教训。\n"
                "如果没有值得记住的内容，返回空 facts 数组。\n"
                '返回 JSON：{"memory": [{"text": "中文事实1"}, {"text": "中文事实2"}]}'
            )
        language = (
            getattr(agent_config, "language", "zh") if agent_config else "zh"
        )
        if isinstance(language, str) and language.startswith("zh"):
            return (
                "你是一个个人记忆助手。请从对话中用中文提取事实。\n"
                "严格用中文记录所有记忆内容，包括记忆的 text 字段必须用中文输出。\n"
                "只提取有价值的信息：个人信息、偏好、决策、经验教训。\n"
                "如果没有值得记住的内容，返回空 facts 数组。\n"
                '返回 JSON：{"memory": [{"text": "中文事实1"}, {"text": "中文事实2"}]}'
            )
        return None

    @staticmethod
    def _to_local_time(ts: str | None) -> str:
        """Convert a UTC ISO timestamp to system timezone for display.

        mem0 hardcodes ``datetime.now(timezone.utc)`` internally, so
        ``created_at`` / ``updated_at`` are always UTC.  This helper
        converts them to the user's configured timezone.
        """
        if not ts:
            return ""
        try:
            # Normalise: replace Z suffix and handle offset variants
            normalised = ts.replace("Z", "+00:00")
            dt = datetime.fromisoformat(normalised)
            if dt.tzinfo is None:
                # Naive timestamp — assume UTC
                dt = dt.replace(tzinfo=_dt_timezone.utc)
            local_tz = get_user_timezone()
            return dt.astimezone(local_tz).strftime("%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            return ts

    @staticmethod
    def _build_pgvector_config(
        vs_config: dict,
        _env,
        config,
    ) -> None:
        """Fill pgvector-specific fields into ``vs_config`` (mutates)."""
        # connection_string 优先
        db_url = (
            _env("MEM0_PGVECTOR_DB_URL")
            or _env("AIWORK_MEM0_DB_URL")
            or (config.mem0_db_url if config else None)
            or ""
        )
        if db_url:
            # Normalize: mem0 uses psycopg2, strip +asyncpg / +psycopg
            db_url = _re.sub(
                r"^postgresql(\+[a-z]+)?://",
                "postgresql://",
                db_url,
            )
            vs_config["connection_string"] = db_url
            return

        # 单独参数
        host = (
            _env("MEM0_PGVECTOR_HOST")
            or (config.mem0_pgvector_host if config else None)
            or ""
        )
        port_str = (
            _env("MEM0_PGVECTOR_PORT")
            or ""
        )
        port = (
            int(port_str) if port_str else 0
        ) or (
            config.mem0_pgvector_port if config else 0
        ) or 5432
        dbname = (
            _env("MEM0_PGVECTOR_DB")
            or (config.mem0_pgvector_db if config else None)
            or ""
        )
        user = (
            _env("MEM0_PGVECTOR_USER")
            or (config.mem0_pgvector_user if config else None)
            or ""
        )
        password = (
            _env("MEM0_PGVECTOR_PASSWORD")
            or (config.mem0_pgvector_password if config else None)
            or ""
        )

        if host:
            vs_config["host"] = host
        vs_config["port"] = port
        if dbname:
            vs_config["dbname"] = dbname
        if user:
            vs_config["user"] = user
        if password:
            vs_config["password"] = password

    @staticmethod
    def _build_redis_config(
        vs_config: dict,
        _env,
        config,
    ) -> None:
        """Fill redis-specific fields into ``vs_config`` (mutates)."""
        redis_url = (
            _env("AIWORK_MEM0_REDIS_URL")
            or _env("AIWORK_REDIS_URL")
            or _env("AIWORK_MEM0_DB_URL")
            or (config.mem0_db_url if config else None)
            or (config.redis_url if config else None)
            or ""
        )
        if redis_url:
            vs_config["redis_url"] = redis_url

    @staticmethod
    def _build_mem0_config(config, agent_config) -> dict:
        """Build mem0 configuration dictionary.

        Priority for every parameter: .env > agent.json config > fallback.

        Args:
            config: ``Mem0MemoryConfig`` instance (may be None).
            agent_config: Full agent profile config.

        Returns:
            dict suitable for ``Memory.from_config()``.
        """
        _env = EnvVarLoader.get_str

        # ================================================================
        # Embedding config
        # ================================================================
        emb = config.embedding_model_config if config is not None else None

        embedder_provider = (
            _env("EMBEDDING_PROVIDER")
            or (emb.backend if emb else None)
            or "openai"
        )
        embedder_model = (
            _env("EMBEDDING_MODEL_NAME")
            or (emb.model_name if emb else None)
            or ""
        )
        embedder_api_key = (
            _env("EMBEDDING_API_KEY")
            or (emb.api_key if emb else None)
            or ""
        )
        embedder_base_url = (
            _env("EMBEDDING_BASE_URL")
            or (emb.base_url if emb else None)
            or ""
        )
        embedding_dims = (
            int(d) if (d := _env("EMBEDDING_DIMENSIONS")) else 0
        ) or (
            emb.dimensions if emb else 0
        ) or 1536

        # ================================================================
        # LLM config (for mem0 internal fact extraction)
        # ================================================================
        llm_api_key = (
            _env("MEM0_LLM_API_KEY")
            or _env("OPENAI_API_KEY")
            or (config.mem0_llm_api_key if config else None)
            or ""
        )
        llm_base_url = (
            _env("MEM0_LLM_BASE_URL")
            or _env("OPENAI_BASE_URL")
            or (config.mem0_llm_base_url if config else None)
            or ""
        )
        llm_model = (
            _env("MEM0_LLM_MODEL")
            or (config.mem0_llm_model if config else None)
            or ""
        )

        # ================================================================
        # Vector store config
        # ================================================================
        vs_provider = (
            _env("MEM0_VECTOR_STORE_PROVIDER")
            or (config.mem0_vector_store_provider if config else None)
            or "pgvector"
        )

        collection_name = (
            _env("MEM0_COLLECTION_NAME")
            or (config.mem0_collection_name if config else None)
            or "aiwork_memory"
        )

        # --- Build provider-specific vector store config ---
        vs_config: dict = {
            "collection_name": collection_name,
            "embedding_model_dims": embedding_dims,
        }

        if vs_provider == "pgvector":
            Mem0MemoryManager._build_pgvector_config(
                vs_config, _env, config,
            )
        elif vs_provider in ("redis", "valkey"):
            Mem0MemoryManager._build_redis_config(vs_config, _env, config)
        else:
            # qdrant, chroma, etc. — pass through a generic db_url
            db_url = (
                _env("AIWORK_MEM0_DB_URL")
                or (config.mem0_db_url if config else None)
                or ""
            )
            if db_url:
                vs_config["url"] = db_url

        # ================================================================
        # Build mem0 config dict
        # ================================================================
        mem0_config = {
            "vector_store": {
                "provider": vs_provider,
                "config": vs_config,
            },
            "version": "v1.1",
        }

        if llm_api_key:
            mem0_config["llm"] = {
                "provider": "openai",
                "config": {
                    "api_key": llm_api_key,
                },
            }
            if llm_model:
                mem0_config["llm"]["config"]["model"] = llm_model
            if llm_base_url:
                mem0_config["llm"]["config"]["openai_base_url"] = llm_base_url

        if embedder_api_key or embedder_base_url:
            embedder_cfg: dict = {}
            if embedder_model:
                embedder_cfg["model"] = embedder_model
            if embedder_api_key:
                embedder_cfg["api_key"] = embedder_api_key
            if embedder_base_url:
                embedder_cfg["openai_base_url"] = embedder_base_url
            # Only pass embedding_dims to non-openai providers.  The
            # openai embedder forwards it as the ``dimensions`` API
            # parameter, which is only supported by OpenAI's own
            # text-embedding-3 models — third-party APIs (SiliconFlow,
            # etc.) reject it with a 400.  Ollama / huggingface / etc.
            # use embedding_dims for local validation and need it.
            if embedder_provider != "openai":
                embedder_cfg["embedding_dims"] = embedding_dims
            mem0_config["embedder"] = {
                "provider": embedder_provider,
                "config": embedder_cfg,
            }

        # --- Custom instructions for fact extraction language ---
        language = getattr(agent_config, "language", "zh") if agent_config else "zh"
        logger.info(
            "Mem0MemoryManager _build_mem0_config: agent_language=%s, "
            "will_set_custom_instructions=%s",
            language,
            language == "zh" or (isinstance(language, str) and language.startswith("zh")),
        )
        if isinstance(language, str) and language.startswith("zh"):
            mem0_config["custom_instructions"] = (
                "你是一个个人记忆助手。请从对话中用中文提取事实。\n"
                "严格用中文记录所有记忆内容，包括记忆的 text 字段必须用中文输出。\n"
                "只提取有价值的信息：个人信息、偏好、决策、经验教训。\n"
                "如果没有值得记住的内容，返回空 facts 数组。\n"
                '返回 JSON：{"memory": [{"text": "中文事实1"}, {"text": "中文事实2"}]}'
            )

        return mem0_config

    def _check_cooldown(self, last_time: float) -> bool:
        """Return True if the cooldown period has not elapsed."""
        elapsed = _time_mod.monotonic() - last_time
        return elapsed < _WRITE_COOLDOWN_S

    def _cooldown_response(self, tool_name: str) -> ToolResponse:
        """Return a rate-limit ToolResponse for write operations."""
        return ToolResponse(
            content=[
                TextBlock(
                    type="text",
                    text=(
                        f"⚠️ `{tool_name}` 请求过于频繁，"
                        f"请等待 {_WRITE_COOLDOWN_S:.0f} 秒后再试。"
                        f"\n\n⚠️ `{tool_name}` rate limited. "
                        f"Please wait {_WRITE_COOLDOWN_S:.0f}s between calls."
                    ),
                ),
            ],
        )

    async def _ensure_performance_indexes(self) -> None:
        """Create B-tree indexes on user_id and category for efficient filtering.

        mem0's built-in ``create_col()`` only creates vector indexes
        (HNSW + GIN full-text).  Business queries always filter by
        ``user_id`` (and optionally ``category``), which live inside
        the JSONB ``payload`` column.  Without these indexes every
        ``search()`` / ``get_all()`` degenerates into a full table scan.

        This method is idempotent (``CREATE INDEX IF NOT EXISTS``) and
        only applies to the pgvector backend.  Other backends (Redis,
        Qdrant) manage filtering differently.
        """
        vs = getattr(self._memory, "vector_store", None)
        if vs is None:
            return

        # Only pgvector uses a PostgreSQL cursor-based interface
        if not hasattr(vs, "_get_cursor"):
            logger.debug(
                "_ensure_performance_indexes skipped: "
                "vector_store type=%s does not use PostgreSQL cursors",
                type(vs).__name__,
            )
            return

        collection = vs.collection_name

        def _create():
            from psycopg2.errors import UniqueViolation

            with vs._get_cursor(commit=True) as cur:
                for col, label in [("user_id", "user_id"), ("category", "category")]:
                    idx_name = f"{collection}_{label}_idx"
                    try:
                        cur.execute(
                            f"CREATE INDEX IF NOT EXISTS {idx_name} "
                            f"ON {collection} ((payload->>'{col}'))"
                        )
                    except UniqueViolation:
                        # A non-index relation (table, sequence, etc.) with
                        # the same name already exists — skip this index.
                        logger.warning(
                            "Skipping index %s: a relation with that name "
                            "already exists (not an index)",
                            idx_name,
                        )

        try:
            await self._run_in_thread(_create)
            logger.info(
                "mem0 performance indexes ensured: "
                "%s_user_id_idx, %s_category_idx",
                collection, collection,
            )
        except Exception:
            logger.exception(
                "Failed to create mem0 performance indexes for %s",
                collection,
            )

    async def _run_in_thread(self, func, *args, **kwargs):
        """Run a synchronous callable in a thread pool executor.

        All mem0 ``Memory`` methods are synchronous (they make HTTP calls
        to LLM APIs and Redis commands under the hood). This helper
        prevents them from blocking the async event loop.
        """
        return await asyncio.to_thread(func, *args, **kwargs)

    def _patch_embedding_encoding_format(self) -> None:
        """Strip ``encoding_format`` from embedding API requests.

        mem0 v2.0.10 ``OpenAIEmbedding`` hard-codes ``encoding_format="float"``
        in every embeddings API call.  Third-party OpenAI-compatible providers
        (SiliconFlow, etc.) reject this parameter for certain models (e.g.
        ``BAAI/bge-large-zh-v1.5``).

        Even when mem0 does NOT pass it, the OpenAI SDK (≥1.0) defaults
        ``encoding_format`` to ``"base64"``, which causes the same rejection.

        We intercept at the ``_post`` level — the final gateway before the HTTP
        request — and remove the key from the request body.  This is the only
        point where the parameter can be stripped *after* the SDK default logic
        but *before* it reaches the wire.
        """
        _emb = getattr(self._memory, "embedding_model", None)
        if _emb is None:
            return

        _client = getattr(_emb, "client", None)
        if _client is None:
            return

        _embeddings = getattr(_client, "embeddings", None)
        if _embeddings is None or not hasattr(_embeddings, "_post"):
            return

        _orig_post = _embeddings._post

        def _patched_post(path, **kwargs):
            body = kwargs.get("body")
            if isinstance(body, dict):
                body.pop("encoding_format", None)
            return _orig_post(path, **kwargs)

        _embeddings._post = _patched_post
        logger.debug(
            "Patched embedding _post to strip encoding_format "
            "(embedder=%s, model=%s)",
            type(_emb).__name__,
            getattr(_emb.config, "model", "?"),
        )

    # ------------------------------------------------------------------
    # BaseMemoryManager interface
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Initialize the mem0 Memory client."""
        if self._memory is not None:
            return

        agent_config = load_agent_config(self.agent_id)
        mem0_config = self._build_mem0_config(self._config, agent_config)

        logger.info(
            "Mem0MemoryManager starting: agent_id=%s, "
            "vector_store=%s, collection=%s",
            self.agent_id,
            mem0_config.get("vector_store", {}).get("provider", "unknown"),
            mem0_config.get("vector_store", {})
            .get("config", {})
            .get("collection_name", "unknown"),
        )

        try:
            from mem0 import Memory  # noqa: PLC0415

            self._memory = await self._run_in_thread(
                Memory.from_config,
                mem0_config,
            )
            self._patch_embedding_encoding_format()
            logger.info(
                "Mem0MemoryManager started: agent_id=%s", self.agent_id,
            )
            # Ensure performance indexes exist (idempotent).
            # Runs AFTER Memory.from_config so create_col() has already
            # run and the table + vector indexes exist.
            await self._ensure_performance_indexes()
        except Exception as e:
            logger.exception(
                "Failed to initialize mem0 Memory: agent_id=%s, error=%s",
                self.agent_id,
                e,
            )
            raise

    async def close(self) -> bool:
        """Close the mem0 Memory client."""
        logger.info(
            "Mem0MemoryManager closing: agent_id=%s", self.agent_id,
        )
        self._memory = None
        return True

    def get_memory_prompt(self, language: str = "zh") -> str:
        """Return the mem0 memory guidance prompt."""
        prompts = {
            "zh": MEM0_MEMORY_GUIDANCE_ZH,
            "en": MEM0_MEMORY_GUIDANCE_EN,
        }
        return prompts.get(language, MEM0_MEMORY_GUIDANCE_EN)

    def list_memory_tools(self):
        """Return memory tool functions for the agent toolkit."""
        return [
            self.memory_search,
            self.memory_add,
            self.memory_list,
            self.memory_overview,
            self.memory_update,
            self.memory_delete,
        ]

    # ------------------------------------------------------------------
    # Memory tools (exposed to the agent)
    # ------------------------------------------------------------------

    async def memory_search(
        self,
        query: str,
        max_results: int = 10,
        min_score: float = 0.1,
    ) -> ToolResponse:
        """Search stored memories semantically.

        Use this tool before answering questions about prior work,
        decisions, user preferences, or any topic that may have been
        discussed before.

        Args:
            query: The search query string.
            max_results: Maximum number of results (default 10).
            min_score: Minimum relevance score 0.0-1.0 (default 0.1).

        Returns:
            ToolResponse with search results including id, memory text,
            score, and metadata.
        """
        if self._memory is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Memory system is not initialized. "
                        "Please try again later.",
                    ),
                ],
            )

        try:
            result = await self._run_in_thread(
                self._memory.search,
                query,
                filters={"user_id": self._effective_user_id},
                top_k=max_results,
            )

            results_list = result.get("results", []) if isinstance(result, dict) else []

            # Filter by min_score
            filtered = [
                r for r in results_list
                if r.get("score", 0) >= min_score
            ]

            if not filtered:
                return ToolResponse(
                    content=[
                        TextBlock(
                            type="text",
                            text=(
                                f"No relevant memories found for query: "
                                f"'{query[:200]}'"
                            ),
                        ),
                    ],
                )

            # Format results
            lines = [f"Search results for: '{query[:200]}'\n"]
            for i, item in enumerate(filtered, 1):
                mem_id = item.get("id", "unknown")
                memory_text = item.get("memory", "")
                score = item.get("score", 0)
                created_at = self._to_local_time(item.get("created_at", ""))
                updated_at = self._to_local_time(item.get("updated_at", ""))
                metadata = item.get("metadata", {}) or {}
                category = metadata.get("category", "")
                importance = metadata.get("importance", "")

                meta_parts = []
                if category:
                    meta_parts.append(f"category={category}")
                if importance:
                    meta_parts.append(f"importance={importance}")
                if created_at:
                    meta_parts.append(f"created={created_at}")
                if updated_at and updated_at != created_at:
                    meta_parts.append(f"updated={updated_at}")
                meta_str = f" ({', '.join(meta_parts)})" if meta_parts else ""

                lines.append(
                    f"**{i}.** [{mem_id}] (score: {score:.3f}){meta_str}\n"
                    f"  {memory_text}\n"
                )

            return ToolResponse(
                content=[TextBlock(type="text", text="\n".join(lines))],
            )

        except Exception as e:
            _err_type = type(e).__name__
            _err_msg = str(e)
            logger.exception(
                "memory_search failed [%s]: %s — "
                "query=%s user_id=%s top_k=%s",
                _err_type, _err_msg,
                query[:100], self._effective_user_id, max_results,
            )

            # Classify the error for a more helpful user-facing message
            _err_lower = _err_msg.lower()
            if any(kw in _err_lower for kw in ("connect", "refused", "timeout", "unreachable")):
                hint = (
                    "Unable to connect to the memory database. "
                    "Please check the pgvector/Redis connection."
                )
            elif any(kw in _err_lower for kw in ("auth", "401", "403", "unauthorized", "key")):
                hint = (
                    "Embedding API authentication failed. "
                    "Please check EMBEDDING_API_KEY."
                )
            elif any(kw in _err_lower for kw in ("relation", "table", "does not exist", "undefined")):
                hint = (
                    "Memory table not found in the database. "
                    "The mem0 collection may need to be initialized."
                )
            elif any(kw in _err_lower for kw in ("dimension", "embedding", "vector size")):
                hint = (
                    "Embedding dimension mismatch. "
                    "Please check EMBEDDING_DIMENSIONS (current: "
                    f"{getattr(self._config, 'embedding_model_config', None) and self._config.embedding_model_config.dimensions or 'unknown'})."
                )
            else:
                hint = (
                    f"Internal error ({_err_type}). "
                    "Check server logs for details."
                )

            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text=f"Memory search failed: {hint}",
                    ),
                ],
            )

    async def memory_add(
        self,
        content: str,
        category: str | None = None,
        importance: str = "medium",
    ) -> ToolResponse:
        """Add a new fact or insight to memory.

        The memory system automatically extracts key facts, merges
        duplicates, and updates conflicting information. Use this
        proactively when you learn something worth remembering.

        Args:
            content: The fact, insight, or information to remember.
            category: Optional category for organization
                (user_profile, project_context, decision, preference,
                 lesson, tool_setup).
            importance: Importance level: high, medium, or low
                (default medium).

        Returns:
            ToolResponse confirming what was added or updated.
        """
        if self._memory is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Memory system is not initialized.",
                    ),
                ],
            )

        # Rate limiting
        if self._check_cooldown(self._last_add_time):
            return self._cooldown_response("memory_add")
        self._last_add_time = _time_mod.monotonic()

        now_ts = datetime.now(tz=get_user_timezone()).isoformat()
        metadata = {
            "timestamp": now_ts,
            "importance": importance or "medium",
        }
        if category:
            metadata["category"] = category

        # When the agent language is Chinese, inject the instruction
        # directly into the content so the LLM sees it as part of the
        # "New Messages" it is extracting from.  Relying solely on the
        # ``prompt`` parameter (which becomes ``custom_instructions`` at
        # the tail of the user prompt) is not enough — mem0's ~450-line
        # English system prompt dominates smaller models like Qwen3-8B.
        chinese_instruction = self._fact_extraction_prompt
        effective_content = (
            f"请用中文记录以下信息：\n{content}"
            if chinese_instruction
            else content
        )

        try:
            result = await self._run_in_thread(
                self._memory.add,
                effective_content,
                user_id=self._effective_user_id,
                agent_id=self._effective_agent_id,
                metadata=metadata,
                infer=True,
                prompt=chinese_instruction,
            )

            # Format response
            if isinstance(result, dict) and result:
                added = result.get("results", [])
                if added:
                    summary = "\n".join(
                        f"- {item.get('memory', str(item))}"
                        for item in added[:5]
                    )
                    return ToolResponse(
                        content=[
                            TextBlock(
                                type="text",
                                text=(
                                    f"✅ Memory recorded:\n{summary}"
                                ),
                            ),
                        ],
                    )

            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="✅ Memory recorded successfully.",
                    ),
                ],
            )

        except Exception as e:
            logger.exception(
                "memory_add failed [%s]: %s — user_id=%s",
                type(e).__name__, e, self._effective_user_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Failed to add memory due to an internal error. "
                        "Please try again.",
                    ),
                ],
            )

    async def memory_list(
        self,
        category: str | None = None,
        limit: int = 50,
    ) -> ToolResponse:
        """List stored memories, optionally filtered by category.

        Use this to browse what the system remembers about a topic.

        Args:
            category: Optional category filter
                (user_profile, project_context, decision, etc.).
            limit: Maximum number of results (default 50).

        Returns:
            ToolResponse with formatted memory list.
        """
        if self._memory is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Memory system is not initialized.",
                    ),
                ],
            )

        filters: dict = {"user_id": self._effective_user_id}
        if category:
            filters["category"] = category

        try:
            result = await self._run_in_thread(
                self._memory.get_all,
                filters=filters,
            )

            results_list = (
                result.get("results", [])
                if isinstance(result, dict)
                else []
            )
            results_list = results_list[:limit]

            if not results_list:
                filter_msg = (
                    f" (category: {category})" if category else ""
                )
                return ToolResponse(
                    content=[
                        TextBlock(
                            type="text",
                            text=f"No memories found{filter_msg}.",
                        ),
                    ],
                )

            lines = [f"**Memories** ({len(results_list)} total):\n"]
            for i, item in enumerate(results_list, 1):
                mem_id = item.get("id", "unknown")
                memory_text = item.get("memory", "")
                created_at = self._to_local_time(item.get("created_at", ""))
                updated_at = self._to_local_time(item.get("updated_at", ""))
                metadata = item.get("metadata", {}) or {}
                item_category = metadata.get("category", "")
                item_importance = metadata.get("importance", "")

                meta_parts = []
                if item_category:
                    meta_parts.append(f"category={item_category}")
                if item_importance:
                    meta_parts.append(f"importance={item_importance}")
                if created_at:
                    meta_parts.append(f"created={created_at}")
                if updated_at and updated_at != created_at:
                    meta_parts.append(f"updated={updated_at}")
                meta_str = (
                    f" ({', '.join(meta_parts)})" if meta_parts else ""
                )

                text_preview = (
                    memory_text[:200] + "..."
                    if len(memory_text) > 200
                    else memory_text
                )
                lines.append(
                    f"**{i}.** [{mem_id}]{meta_str}\n"
                    f"  {text_preview}\n"
                )

            return ToolResponse(
                content=[TextBlock(type="text", text="\n".join(lines))],
            )

        except Exception as e:
            logger.exception(
                "memory_list failed [%s]: %s — user_id=%s",
                type(e).__name__, e, self._effective_user_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Failed to list memories due to an internal error. "
                        "Please try again.",
                    ),
                ],
            )

    async def memory_overview(self) -> ToolResponse:
        """Return a structured overview of all memories grouped by category.

        Use this to get a "table of contents" view before diving into
        detailed search.  Helps avoid blind fragment hunting — see what
        categories exist and how many memories are in each.

        Returns:
            ToolResponse with category-level summary.
        """
        if self._memory is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Memory system is not initialized.",
                    ),
                ],
            )

        try:
            result = await self._run_in_thread(
                self._memory.get_all,
                filters={"user_id": self._effective_user_id},
                top_k=2000,
            )

            all_memories = (
                result.get("results", [])
                if isinstance(result, dict)
                else []
            )

            if not all_memories:
                return ToolResponse(
                    content=[
                        TextBlock(
                            type="text",
                            text="No memories stored yet. Start by using "
                            "`memory_add` to record important facts.",
                        ),
                    ],
                )

            # Group by category
            by_category: dict[str, list[dict]] = {}
            for item in all_memories:
                metadata = item.get("metadata", {}) or {}
                cat = metadata.get("category", "") or "uncategorized"
                by_category.setdefault(cat, []).append(item)

            # Sort categories by count (descending)
            sorted_cats = sorted(
                by_category.items(), key=lambda x: len(x[1]), reverse=True,
            )

            lines = [
                f"**Memory Overview** "
                f"({len(all_memories)} total in {len(sorted_cats)} categories):\n"
            ]
            for cat, memories in sorted_cats:
                # Show up to 3 sample memories per category
                samples = memories[:3]
                sample_lines = []
                for m in samples:
                    text = (m.get("memory", "") or "")[:80]
                    if len(m.get("memory", "") or "") > 80:
                        text += "..."
                    sample_lines.append(f"    · {text}")

                lines.append(
                    f"**{cat}** ({len(memories)} memories):"
                )
                lines.extend(sample_lines)
                if len(memories) > 3:
                    lines.append(f"    ... and {len(memories) - 3} more")
                lines.append("")

            return ToolResponse(
                content=[TextBlock(type="text", text="\n".join(lines))],
            )

        except Exception as e:
            logger.exception(
                "memory_overview failed [%s]: %s — user_id=%s",
                type(e).__name__, e, self._effective_user_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Failed to get memory overview due to an "
                        "internal error. Please try again.",
                    ),
                ],
            )

    async def memory_update(
        self,
        memory_id: str,
        content: str,
    ) -> ToolResponse:
        """Update an existing memory by its ID.

        Use this when information has changed or a memory contains
        incorrect information.

        Args:
            memory_id: The ID of the memory to update
                (from memory_search or memory_list).
            content: The new content for the memory.

        Returns:
            ToolResponse confirming the update.
        """
        if self._memory is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Memory system is not initialized.",
                    ),
                ],
            )

        # Rate limiting
        if self._check_cooldown(self._last_update_time):
            return self._cooldown_response("memory_update")
        self._last_update_time = _time_mod.monotonic()

        # IDOR protection: verify ownership before update
        ownership_error = await self._verify_memory_ownership(memory_id)
        if ownership_error is not None:
            return ownership_error

        try:
            await self._run_in_thread(
                self._memory.update,
                memory_id=memory_id,
                data=content,
            )

            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text=(
                            f"✅ Memory [{memory_id}] updated "
                            f"successfully."
                        ),
                    ),
                ],
            )

        except Exception as e:
            logger.exception(
                "memory_update failed [%s]: %s — memory_id=%s",
                type(e).__name__, e, memory_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Failed to update memory due to an internal error. "
                        "Please try again.",
                    ),
                ],
            )

    async def memory_delete(
        self,
        memory_id: str,
    ) -> ToolResponse:
        """Delete a memory by its ID.

        Use this when a memory is obsolete, incorrect beyond repair,
        or no longer needed.

        Args:
            memory_id: The ID of the memory to delete
                (from memory_search or memory_list).

        Returns:
            ToolResponse confirming the deletion.
        """
        if self._memory is None:
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Memory system is not initialized.",
                    ),
                ],
            )

        # Rate limiting
        if self._check_cooldown(self._last_delete_time):
            return self._cooldown_response("memory_delete")
        self._last_delete_time = _time_mod.monotonic()

        # IDOR protection: verify ownership before delete
        ownership_error = await self._verify_memory_ownership(memory_id)
        if ownership_error is not None:
            return ownership_error

        try:
            await self._run_in_thread(
                self._memory.delete,
                memory_id=memory_id,
            )

            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text=(
                            f"✅ Memory [{memory_id}] deleted "
                            f"successfully."
                        ),
                    ),
                ],
            )

        except Exception as e:
            logger.exception(
                "memory_delete failed [%s]: %s — memory_id=%s",
                type(e).__name__, e, memory_id,
            )
            return ToolResponse(
                content=[
                    TextBlock(
                        type="text",
                        text="Failed to delete memory due to an internal error. "
                        "Please try again.",
                    ),
                ],
            )

    # ------------------------------------------------------------------
    # Optional BaseMemoryManager methods
    # ------------------------------------------------------------------

    async def summarize(self, messages: list[Msg], **kwargs) -> str:
        """Summarize conversation messages using mem0 fact extraction.

        Calls ``mem0.add()`` with ``infer=True`` to let mem0's built-in
        LLM extract facts and merge them with existing memories.

        Args:
            messages: Conversation messages to summarize.
            **kwargs: Additional options (ignored).

        Returns:
            Summary confirmation string.
        """
        if self._memory is None:
            logger.warning("summarize skipped: memory not initialized")
            return ""

        # Build text from messages
        text_parts = []
        for msg in messages:
            content = (msg.get_text_content() or "").strip()
            if content:
                text_parts.append(content)

        combined_text = "\n".join(text_parts)
        if not combined_text.strip():
            return ""

        # Same content-injection strategy as memory_add (see comment there).
        chinese_instruction = self._fact_extraction_prompt
        effective_text = (
            f"请用中文记录以下信息：\n{combined_text}"
            if chinese_instruction
            else combined_text
        )

        try:
            now_ts = datetime.now(tz=get_user_timezone()).isoformat()
            await self._run_in_thread(
                self._memory.add,
                effective_text,
                user_id=self._effective_user_id,
                agent_id=self._effective_agent_id,
                metadata={
                    "timestamp": now_ts,
                    "created_at": now_ts,
                    "source": "auto_summarize",
                },
                infer=True,
                prompt=chinese_instruction,
            )
            logger.info(
                "summarize completed: agent_id=%s, chars=%d",
                self.agent_id,
                len(combined_text),
            )
            return f"Summarized {len(text_parts)} messages into memory."

        except Exception as e:
            logger.exception("summarize failed: %s", e)
            return ""

    async def retrieve(
        self,
        messages: list[Msg] | Msg,
        agent_name: str = "",
        **_kwargs,
    ) -> dict | None:
        """Retrieve relevant memory and return updated kwargs dict.

        Args:
            messages: One or more conversation messages as the query.
            agent_name: Agent name for constructing Msg.
            **_kwargs: Additional options.

        Returns:
            None if no relevant memory found, or
            dict: {"msg": msgs + [assistant_msg, tool_result_msg]}.
        """
        if self._memory is None:
            return None

        msgs: list[Msg] = (
            [messages] if isinstance(messages, Msg) else list(messages)
        )

        # Build query from the newest messages, preserving tail
        query_parts: list[str] = []
        total = 0
        for msg in reversed(msgs):
            remaining = 100 - total
            if remaining <= 0:
                break
            text = (msg.get_text_content() or "").strip()
            if not text:
                continue
            chunk = text[:remaining]
            query_parts.insert(0, chunk)
            total += len(chunk)

        query = " ".join(query_parts).strip()
        if not query:
            return None

        # Get search config
        if self._config is not None:
            ms = self._config.auto_memory_search_config
            max_results = ms.max_results
            min_score = ms.min_score
        else:
            max_results = 2
            min_score = 0.3

        try:
            result = await self._run_in_thread(
                self._memory.search,
                query,
                filters={"user_id": self._effective_user_id},
                top_k=max_results,
            )

            results_list = (
                result.get("results", [])
                if isinstance(result, dict)
                else []
            )

            # Filter by min_score
            filtered = [
                r for r in results_list
                if r.get("score", 0) >= min_score
            ]

            if not filtered:
                return None

            # Format text content
            lines = []
            for item in filtered:
                mem_id = item.get("id", "")
                memory_text = item.get("memory", "")
                score = item.get("score", 0)
                created_at = self._to_local_time(item.get("created_at", ""))
                updated_at = self._to_local_time(item.get("updated_at", ""))
                time_str = f" @{created_at}" if created_at else ""
                if updated_at and updated_at != created_at:
                    time_str += f"~{updated_at}"
                lines.append(f"[{mem_id}] (score: {score:.3f}{time_str}) {memory_text}")

            text_content = "\n".join(lines)
            if not text_content:
                return None

            # Construct synthetic assistant_msg + tool_result_msg
            _id = uuid.uuid4().hex
            tool_use_input = {
                "query": query,
                "max_results": max_results,
                "min_score": min_score,
            }

            assistant_msg = Msg(
                name=agent_name,
                role="assistant",
                content=[
                    TextBlock(
                        type="text",
                        text="Searching memory for relevant context...",
                    ),
                    ToolUseBlock(
                        type="tool_use",
                        id=_id,
                        name="memory_search",
                        input=tool_use_input,
                        raw_input=json.dumps(
                            tool_use_input,
                            ensure_ascii=False,
                        ),
                    ),
                ],
            )

            tool_result_msg = Msg(
                name=agent_name,
                role="system",
                content=[
                    ToolResultBlock(
                        type="tool_result",
                        id=_id,
                        name="memory_search",
                        output=[TextBlock(type="text", text=text_content)],
                    ),
                ],
            )

            return {"msg": msgs + [assistant_msg, tool_result_msg]}

        except Exception as e:
            logger.exception("retrieve failed: %s", e)
            return None

    @staticmethod
    def _create_dream_model():
        """Create a standalone chat model for dream optimization.

        Uses the ``MEM0_LLM_*`` environment variables so dream can run
        on an independent model (e.g. SiliconFlow) without affecting
        the agent's main conversation model.

        Returns ``None`` when the env vars are not configured — the
        caller should fall back to the agent's default model.
        """
        from ....providers.openai_chat_model_compat import (
            OpenAIChatModelCompat,
        )

        api_key = EnvVarLoader.get_str("MEM0_LLM_API_KEY") or ""
        base_url = EnvVarLoader.get_str("MEM0_LLM_BASE_URL") or ""
        model = EnvVarLoader.get_str("MEM0_LLM_MODEL") or ""

        if not api_key or not base_url or not model:
            logger.debug(
                "dream: MEM0_LLM_* not fully configured, "
                "will fall back to agent default model",
            )
            return None

        logger.info(
            "dream: using standalone model base_url=%s model=%s",
            base_url,
            model,
        )
        return OpenAIChatModelCompat(
            model_name=model,
            stream=True,
            api_key=api_key,
            stream_tool_parsing=False,
            client_kwargs={"base_url": base_url},
        )

    async def dream(self, **kwargs) -> None:
        """Run one dream-based memory optimization pass.

        Fetches all memories for the current user, then asks an LLM to
        identify duplicates / obsolete / stale entries.  When the user
        has more than ``_DREAM_BATCH_SIZE`` memories, processing is
        automatically split into multiple batches to keep per-call LLM
        token usage bounded.

        Each batch is processed independently — the LLM receives only
        that batch's memories and returns a JSON plan with ``updates``,
        ``deletes``, and ``summary`` fields.  Results are executed
        immediately after each batch.
        """
        if self._memory is None:
            logger.warning("dream skipped: memory not initialized")
            return

        logger.info("Mem0MemoryManager dream: agent_id=%s", self.agent_id)

        try:
            agent_config = load_agent_config(self.agent_id)
            chat_model = self._create_dream_model()
            if chat_model is None:
                # Fall back to agent's default conversation model
                from ...model_factory import (  # noqa: PLC0415
                    create_model_and_formatter,
                )
                chat_model, _ = create_model_and_formatter(self.agent_id)
                model_slot = agent_config.active_model
                logger.info(
                    "dream: using agent default model "
                    "provider_id=%s model=%s class=%s",
                    model_slot.provider_id if model_slot else "N/A",
                    model_slot.model if model_slot else "N/A",
                    type(chat_model).__name__,
                )
        except Exception as e:
            logger.exception("Failed to create LLM for dream: %s", e)
            return

        # Step 1: Get all memories (with safety cap)
        try:
            result = await self._run_in_thread(
                self._memory.get_all,
                filters={"user_id": self._effective_user_id},
                top_k=_DREAM_MAX_MEMORIES,
            )
            all_memories = (
                result.get("results", [])
                if isinstance(result, dict)
                else []
            )
        except Exception as e:
            logger.exception("dream get_all failed: %s", e)
            return

        if not all_memories:
            logger.info("dream: no memories to optimize")
            return

        total = len(all_memories)
        logger.info(
            "dream: loaded %d memories for agent_id=%s",
            total, self.agent_id,
        )

        # Step 2: Single pass when below batch threshold
        if total <= _DREAM_BATCH_SIZE:
            await self._dream_process_batch(
                all_memories, chat_model, agent_config,
            )
            return

        # Step 3: Batch processing for larger memory sets
        batches = [
            all_memories[i:i + _DREAM_BATCH_SIZE]
            for i in range(0, total, _DREAM_BATCH_SIZE)
        ]
        total_updates = 0
        total_deletes = 0

        for batch_idx, batch in enumerate(batches, 1):
            logger.info(
                "dream batch %d/%d: %d memories",
                batch_idx, len(batches), len(batch),
            )
            try:
                updates, deletes = await self._dream_process_batch(
                    batch, chat_model, agent_config,
                    batch_idx=batch_idx, total_batches=len(batches),
                )
                total_updates += updates
                total_deletes += deletes
            except Exception:
                logger.exception(
                    "dream batch %d/%d failed, continuing",
                    batch_idx, len(batches),
                )

        logger.info(
            "dream completed: agent_id=%s, batches=%d, "
            "updated=%d, deleted=%d",
            self.agent_id, len(batches), total_updates, total_deletes,
        )

    # ------------------------------------------------------------------
    # Dream helpers
    # ------------------------------------------------------------------

    def _format_memory_for_dream(self, item: dict) -> str:
        """Format a single memory dict into a compact text block."""
        mem_id = item.get("id", "unknown")
        memory_text = item.get("memory", "")
        metadata = item.get("metadata", {}) or {}
        category = metadata.get("category", "")
        importance = metadata.get("importance", "")
        created = self._to_local_time(item.get("created_at", ""))
        updated = self._to_local_time(item.get("updated_at", ""))

        parts = [
            f"  id: {mem_id}",
            f"  memory: {memory_text}",
            f"  category: {category}",
            f"  importance: {importance}",
            f"  created_at: {created}",
        ]
        if updated and updated != created:
            parts.append(f"  updated_at: {updated}")
        return "\n".join(parts)

    def _build_dream_prompt(
        self,
        batch: list[dict],
        agent_config,
        batch_idx: int | None = None,
        total_batches: int | None = None,
    ) -> str:
        """Build the LLM prompt for one dream batch.

        Uses a compact instruction (not the ReAct-agent-oriented
        MEM0_DREAM_OPTIMIZATION_*) because we call the raw model
        directly here — the LLM cannot invoke tools.
        """
        language = getattr(agent_config, "language", "zh")
        if isinstance(language, str) and language.startswith("zh"):
            instruction = (
                "分析以下记忆，找出需要去重合并、更新或删除的记忆。\n"
                "规则：重复/相似→合并，过时→更新，无价值→删除。\n"
                "\n"
                "【输出格式】只输出一行 JSON，不要任何多余文字：\n"
                '{"updates":[],"deletes":[],"summary":"无需优化"}\n'
                "\n"
                "示例 1（需更新）：\n"
                '{"updates":[{"memory_id":"abc123","content":"新内容"}],'
                '"deletes":[],"summary":"更新了 1 条记忆"}\n'
                "\n"
                "示例 2（无需修改）：\n"
                '{"updates":[],"deletes":[],"summary":"无需优化"}'
            )
        else:
            instruction = (
                "Analyze the memories below. Identify any that need "
                "deduplication, merging, updating, or deletion.\n"
                "Rules: duplicate/similar→merge, outdated→update, "
                "no value→delete.\n"
                "\n"
                "[Output format] One line of JSON only, nothing else:\n"
                '{"updates":[],"deletes":[],"summary":"no changes"}\n'
                "\n"
                "Example 1 (update needed):\n"
                '{"updates":[{"memory_id":"abc123","content":"new"}],'
                '"deletes":[],"summary":"updated 1 memory"}\n'
                "\n"
                "Example 2 (no changes):\n"
                '{"updates":[],"deletes":[],"summary":"no changes"}'
            )

        memories_text = "\n".join(
            f"- Memory {i+1}:\n{self._format_memory_for_dream(item)}"
            for i, item in enumerate(batch)
        )

        batch_hint = ""
        if batch_idx is not None and total_batches is not None:
            batch_hint = (
                f"\nNote: This is batch {batch_idx}/{total_batches}. "
                f"Only analyze these {len(batch)} memories. "
                f"Memories from other batches will be analyzed separately.\n"
            )

        return (
            f"{instruction}\n\n"
            f"Memories ({len(batch)} in this batch):\n\n"
            f"{memories_text}\n\n"
            f"{batch_hint}"
        )

    @staticmethod
    def _extract_json_object(text: str) -> str | None:
        """Extract the outermost JSON object from *text* by tracking brace
        depth (handles nested objects / arrays correctly)."""
        start = text.find("{")
        if start == -1:
            return None
        depth = 0
        for i in range(start, len(text)):
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        return None

    def _parse_dream_response(self, response_text: str) -> dict | None:
        """Parse the LLM's JSON response into an optimization plan dict.

        Returns None when the response cannot be parsed.
        """
        # Strip markdown code fences if present
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = _re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = _re.sub(r"\s*```$", "", cleaned)

        # Try to find the JSON object that contains the "updates" key
        json_str = self._extract_json_object(cleaned)
        if json_str is None:
            logger.warning(
                "dream: no JSON object found in LLM response (length=%d)",
                len(response_text),
            )
            return None

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            logger.warning(
                "dream: could not parse JSON from LLM response (length=%d)",
                len(response_text),
            )
            return None

    async def _dream_execute_plan(self, plan: dict) -> tuple[int, int]:
        """Execute the optimization plan (updates + deletes).

        Returns:
            (update_count, delete_count) tuple.
        """
        updates = plan.get("updates", [])
        deletes = plan.get("deletes", [])
        summary = plan.get("summary", "")

        update_count = 0
        delete_count = 0

        for update_item in updates:
            try:
                mem_id = update_item.get("memory_id", "")
                content = update_item.get("content", "")
                if not mem_id or not content:
                    continue
                # Verify ownership before mutating (defense-in-depth:
                # the batch was fetched by user_id, but the LLM could
                # hallucinate a memory_id belonging to another user).
                if await self._verify_memory_ownership(mem_id) is not None:
                    logger.warning(
                        "dream update skipped (ownership): %s", mem_id,
                    )
                    continue
                await self._run_in_thread(
                    self._memory.update,
                    memory_id=mem_id,
                    data=content,
                )
                update_count += 1
                logger.info("dream updated: %s", mem_id)
            except Exception as e:
                logger.warning("dream update failed for %s: %s", mem_id, e)

        for mem_id in deletes:
            try:
                if not mem_id:
                    continue
                if await self._verify_memory_ownership(mem_id) is not None:
                    logger.warning(
                        "dream delete skipped (ownership): %s", mem_id,
                    )
                    continue
                await self._run_in_thread(
                    self._memory.delete,
                    memory_id=mem_id,
                )
                delete_count += 1
                logger.info("dream deleted: %s", mem_id)
            except Exception as e:
                logger.warning("dream delete failed for %s: %s", e)

        if summary:
            logger.info("dream batch summary: %s", summary)

        return update_count, delete_count

    @staticmethod
    async def _consume_stream(
        stream,
    ) -> str:
        """Consume an async generator of ChatResponse chunks into a single
        text string.

        Each chunk is a ``ChatResponse`` dataclass whose ``content`` is a
        sequence of blocks.  TextBlock is a TypedDict so isinstance() is
        not supported — we check ``block.get("type") == "text"`` instead.
        The DictMixin base overrides ``__getattr__`` with
        ``dict.__getitem__``, so ``hasattr()`` is also unsafe.
        """
        parts: list[str] = []
        async for chunk in stream:
            for block in chunk.content:
                if block.get("type") == "text":
                    text = block.get("text", "")
                    if text:
                        parts.append(text)
        if not parts:
            return ""
        # Detect streaming mode: some providers (e.g. DeepSeek) emit the
        # full accumulated prefix in each chunk when response_format=
        # {"type": "json_object"} is used.  Others emit standard deltas.
        #
        # Prefix mode:  ['{', '{"', '{"up', ...] → take parts[-1]
        # Delta  mode:  ['{"updates"', ':[]', '}']   → "".join(parts)
        if _is_prefix_stream(parts):
            return parts[-1]
        return "".join(parts)

    async def _dream_process_batch(
        self,
        batch: list[dict],
        chat_model,
        agent_config,
        batch_idx: int | None = None,
        total_batches: int | None = None,
    ) -> tuple[int, int]:
        """Run the full dream optimization loop for one batch of memories.

        Format → LLM analyze → parse JSON → execute plan.

        Returns:
            (update_count, delete_count) tuple.
        """
        # Build prompt
        optimization_prompt = self._build_dream_prompt(
            batch, agent_config, batch_idx, total_batches,
        )

        # Call LLM — pass a plain dict because the raw model wrapper
        # expects dict-like messages ("role" in msg), not Msg objects.
        # The formatter always injects stream_options, so we must use
        # stream=True and consume the async generator ourselves.
        #
        response = await chat_model(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a JSON generator. "
                        "Always respond with a valid JSON object using "
                        'the schema: {"updates":[],"deletes":[],"summary":""}. '
                        "Never output anything besides the JSON object."
                    ),
                },
                {"role": "user", "content": optimization_prompt},
            ],
            temperature=0.3,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
        if inspect.isasyncgen(response):
            response_text = await self._consume_stream(response)
        else:
            response_text = response.get_text_content() or ""

        # Parse response
        plan = self._parse_dream_response(response_text)
        if plan is None:
            return 0, 0

        # Execute
        return await self._dream_execute_plan(plan)
