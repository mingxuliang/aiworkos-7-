# -*- coding: utf-8 -*-
"""BGE-M3 Embedding client via 硅基流动 (SiliconFlow) OpenAI-compatible API.

- Model: BAAI/bge-m3
- Dimension: 1024
- Batch size: 16 texts per request (configurable)
- Retry: 3 attempts with exponential backoff (1s / 2s / 4s), only for 5xx / timeout
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Optional

import httpx

from ..constant import EnvVarLoader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------

_DEFAULT_API_URL = "https://api.siliconflow.cn/v1"
_DEFAULT_MODEL = "BAAI/bge-m3"
_DEFAULT_BATCH_SIZE = 16
_DEFAULT_MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class EmbedderError(Exception):
    """Base exception for embedding API errors."""


class EmbedderApiError(EmbedderError):
    """Embedding API returned an error."""

    def __init__(self, status_code: int, detail: str = ""):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Embedding API error {status_code}: {detail}")


class EmbedderTimeoutError(EmbedderError):
    """Embedding API request timed out."""


# ---------------------------------------------------------------------------
# Shared httpx client (connection pooling)
# ---------------------------------------------------------------------------

_embedding_client: httpx.AsyncClient | None = None


def get_embedding_client() -> httpx.AsyncClient:
    """Return a module-level httpx.AsyncClient for embedding API calls.

    Uses connection pooling (``max_keepalive_connections=10``,
    ``max_connections=20``) to avoid TCP+TLS handshake on every request.
    """
    global _embedding_client
    if _embedding_client is None:
        _embedding_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _embedding_client


async def close_embedding_client() -> None:
    """Close the shared embedding httpx client (called on app shutdown)."""
    global _embedding_client
    if _embedding_client is not None:
        await _embedding_client.aclose()
        _embedding_client = None


# ---------------------------------------------------------------------------
# Embedder
# ---------------------------------------------------------------------------


class Embedder:
    """BGE-M3 embedding client backed by 硅基流动 OpenAI-compatible API.

    Usage::

        embedder = Embedder()
        vectors = await embedder.embed_texts(["text1", "text2", ...])
        query_vec = await embedder.embed_query("search query")
    """

    def __init__(
        self,
        api_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        batch_size: int | None = None,
    ) -> None:
        self._api_url = (
            api_url
            or EnvVarLoader.get_str("AIWORK_RAG_EMBEDDING_API_URL", _DEFAULT_API_URL)
        ).rstrip("/")
        self._api_key = api_key or EnvVarLoader.get_str(
            "AIWORK_RAG_EMBEDDING_API_KEY", "",
        )
        self._model = model or EnvVarLoader.get_str(
            "AIWORK_RAG_EMBEDDING_MODEL", _DEFAULT_MODEL,
        )
        self._batch_size = batch_size or EnvVarLoader.get_int(
            "AIWORK_RAG_EMBEDDING_BATCH_SIZE", _DEFAULT_BATCH_SIZE, min_value=1,
        )
        self._max_retries = EnvVarLoader.get_int(
            "AIWORK_LLM_MAX_RETRIES", _DEFAULT_MAX_RETRIES, min_value=0,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts in batches.

        Args:
            texts: List of text strings to embed.

        Returns:
            List of embedding vectors, each 1024-dimensional.

        Raises:
            EmbedderError: If the API call fails after all retries.
        """
        if not texts:
            return []

        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            batch_vecs = await self._embed_batch_with_retry(batch)
            all_embeddings.extend(batch_vecs)

        return all_embeddings

    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query string.

        Args:
            query: The query text.

        Returns:
            1024-dimensional embedding vector.
        """
        results = await self.embed_texts([query])
        return results[0]

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _embed_batch_with_retry(
        self, texts: list[str],
    ) -> list[list[float]]:
        """Send a single batch to the embedding API with retry logic.

        Retries: up to ``_max_retries`` attempts, only on 5xx / timeout.
        Backoff: 1s → 2s → 4s.
        """
        last_exc: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                return await self._call_embed_api(texts)
            except (EmbedderApiError) as exc:
                # 4xx errors are not retryable (bad request, auth, etc.)
                if 400 <= exc.status_code < 500:
                    raise
                last_exc = exc
                if attempt < self._max_retries:
                    delay = 2 ** attempt  # 1s, 2s, 4s
                    logger.warning(
                        "Embedding API 5xx error (attempt %d/%d), "
                        "retrying in %ds...",
                        attempt + 1, self._max_retries + 1, delay,
                    )
                    await asyncio.sleep(delay)
            except (EmbedderTimeoutError, httpx.RequestError) as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    delay = 2 ** attempt
                    logger.warning(
                        "Embedding API timeout/network error (attempt %d/%d), "
                        "retrying in %ds...",
                        attempt + 1, self._max_retries + 1, delay,
                    )
                    await asyncio.sleep(delay)

        raise EmbedderError(
            f"Embedding API failed after {self._max_retries + 1} attempts"
        ) from last_exc

    async def _call_embed_api(
        self, texts: list[str],
    ) -> list[list[float]]:
        """Make a single POST request to the embedding API.

        Returns a list of embedding vectors in the same order as ``texts``.
        """
        url = f"{self._api_url}/embeddings"

        payload = {
            "model": self._model,
            "input": texts,
            "encoding_format": "float",
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        timeout = httpx.Timeout(60.0, connect=15.0)

        t0 = time.perf_counter()
        client = get_embedding_client()
        try:
            response = await client.post(
                url, json=payload, headers=headers, timeout=timeout,
            )
            t_api = time.perf_counter() - t0
            response.raise_for_status()
            data = response.json()

            # OpenAI-compatible response: {"data": [{"embedding": [...], "index": 0}, ...]}
            items = sorted(data["data"], key=lambda x: x["index"])
            embeddings = [item["embedding"] for item in items]

            if len(embeddings) != len(texts):
                raise EmbedderError(
                    f"Expected {len(texts)} embeddings, got {len(embeddings)}"
                )

            usage = data.get("usage", {})
            logger.debug(
                "Embedding API: model=%s, batch=%d, api_time=%.0fms, "
                "prompt_tokens=%s, total_tokens=%s",
                self._model, len(texts), t_api * 1000,
                usage.get("prompt_tokens", "?"),
                usage.get("total_tokens", "?"),
            )
            return embeddings

        except httpx.TimeoutException:
            raise EmbedderTimeoutError("Embedding API request timed out")
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                detail = exc.response.text[:500]
            except Exception:
                pass
            raise EmbedderApiError(exc.response.status_code, detail)
        except httpx.RequestError as exc:
            raise EmbedderError(f"Embedding API request failed: {exc}")


# ---------------------------------------------------------------------------
# Token estimation helper (for chunker)
# ---------------------------------------------------------------------------


def estimate_tokens(text: str) -> int:
    """Estimate token count for a text string.

    Uses a simple heuristic: ~2.5 chars per token for Chinese,
    ~4 chars per token for English.  Conservative estimate for chunk sizing.
    """
    if not text:
        return 0
    # Count Chinese characters (each ~1.5-2 tokens) and ASCII (~0.25 tokens)
    chinese_chars = sum(1 for c in text if '一' <= c <= '鿿')
    other_chars = len(text) - chinese_chars
    # Conservative estimate: Chinese ~2 chars/token, other ~4 chars/token
    return max(1, int(chinese_chars / 1.5 + other_chars / 4))
