# -*- coding: utf-8 -*-
"""RAG search service: vector retrieval + LLM answer generation.

Flow:
1. Embed the query → 1024-dim vector
2. HNSW vector search on rag_chunks (child chunks only)
3. For each matched child:
   - If parent_chunk_id is NULL → child IS the full context (section fits in one chunk)
   - If parent_chunk_id is set → fetch parent for full context (section was too large)
4. Deduplicate children sharing the same parent → keep highest similarity
5. Build prompt → LLM generation
6. Return answer + sources
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..constant import EnvVarLoader

from .embedder import Embedder, estimate_tokens
from .models import RagChunk, RagDocument

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_DEFAULT_LLM_API_URL = "https://api.siliconflow.cn/v1"
_DEFAULT_LLM_MODEL = "deepseek-ai/DeepSeek-V4-Flash"

# System prompt for RAG Q&A
_SYSTEM_PROMPT = """
                ## 角色定位
                你是一位专业的RAG问答助手。请根据提供的上下文信息，详细、准确地回答用户的问题。如果参考文档没有内容，请务必不要胡编乱造，请直接说明"没有找到相关信息"。
                
                ## 任务要求：
                1. 请基于以下提供的参考文档内容，回答用户的问题。
                2. 如果参考文档中没有相关信息，请直接说明"没有找到相关信息"，不要编造内容。
                3. 如果有了参考文档内容，请务必尽量回答问题。有可能用户的输入比较随意，你可以先尝试回答用户的问题，猜测他的实际需求，先给出回复，你需要尽量去贴合用户的问题需求。
                
                ## 格式要求：
                1. 你的所有回答必须使用Markdown格式进行排版。
                2. 上下文信息中包含了图片描述标签，格式为：`<image src="URL" description="多模态描述"></image>`。
                3. 如果图片与用户提问高度相关，请将此标签转换为标准的Markdown图片格式 `![图片](URL)`。
                4. 仅在必要时包含图片，请注意千万不要输出重复的内容和图片，图片确保最终生成的URL不要重复。
                
                ## 参考文档:
                {context}
                
                ## 用户问题:
                {query}
                
                注意：如果参考文档下面的内容为空，请直接回答“没有找到相关信息”。
                
                """


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class RetrievedChunk:
    """A single retrieved chunk with metadata."""
    chunk_id: int
    document_id: int
    document_name: str
    context_content: str  # Full context for LLM: parent content if child has parent, else child content
    child_content: str    # The matched child chunk content (used for preview)
    section_title: str | None
    heading_path: str | None
    similarity: float


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def search_rag(
    db: AsyncSession,
    embedder: Embedder,
    query: str,
    top_k: int = 5,
    metadata_filters: dict[str, str] | None = None,
) -> list[RetrievedChunk]:
    """Vector search with optional metadata filtering.

    Args:
        db: PG async session.
        embedder: Embedder instance for query embedding.
        query: Search query string.
        top_k: Number of chunks to return (after dedup).
        metadata_filters: Optional key:value metadata filters.

    Returns:
        List of RetrievedChunk, sorted by similarity (highest first).
    """
    t_start = time.perf_counter()

    # Step 1: Embed query
    t0 = time.perf_counter()
    query_vec = await embedder.embed_query(query)
    t_embed = time.perf_counter() - t0

    # Step 2: Vector search on child chunks
    # Fetch top_k * 2 to allow for deduplication
    retrieve_n = top_k * 2

    t0 = time.perf_counter()
    child_chunks = await _vector_search(db, query_vec, retrieve_n, metadata_filters)
    t_vector = time.perf_counter() - t0

    if not child_chunks:
        logger.info(
            "RAG search: query=%r, total=%.0fms (embed=%.0fms, vector=%.0fms, results=0)",
            query[:80], (time.perf_counter() - t_start) * 1000,
            t_embed * 1000, t_vector * 1000,
        )
        return []

    # Step 3: Fetch parent chunks for context (only for children that have parents)
    parent_ids = [
        c.parent_chunk_id for c in child_chunks if c.parent_chunk_id is not None
    ]
    t0 = time.perf_counter()
    parent_map = await _fetch_parents(db, parent_ids)
    t_parents = time.perf_counter() - t0

    # Fetch document names
    doc_ids = set(c.document_id for c in child_chunks)
    t0 = time.perf_counter()
    doc_map = await _fetch_document_names(db, doc_ids)
    t_docs = time.perf_counter() - t0

    # Step 4: Build results with deduplication
    # - child has no parent (parent_chunk_id=None) → child IS the full context
    # - child has parent, parent small (≤ max_context_per_chunk) → use full parent
    # - child has parent, parent large (> max_context_per_chunk) → build context window
    #
    # Identify large parents that need context windowing
    max_context_per_chunk = EnvVarLoader.get_int(
        "AIWORK_RAG_MAX_CONTEXT_PER_CHUNK", 2000, min_value=512,
    )
    large_parent_ids = [
        pid
        for pid in parent_ids
        if pid in parent_map
        and (parent_map[pid].token_count or 0) > max_context_per_chunk
    ]

    # Fetch siblings for large parents (one batch query)
    t0 = time.perf_counter()
    siblings_map = await _fetch_siblings(db, large_parent_ids)
    t_siblings = time.perf_counter() - t0

    results: list[RetrievedChunk] = []
    seen_parents: set[int] = set()

    for child in child_chunks:
        parent_id = child.parent_chunk_id

        if parent_id is not None:
            # Child belongs to an overflow parent → dedup by parent
            if parent_id in seen_parents:
                continue
            seen_parents.add(parent_id)

            parent = parent_map.get(parent_id)
            if parent is None:
                context_content = child.content
            elif (parent.token_count or 0) <= max_context_per_chunk:
                # Small parent → use full content (best context quality)
                context_content = parent.content
            else:
                # Large parent → build bounded context window
                siblings = siblings_map.get(parent_id, [])
                context_content = _build_context_window(
                    matched_child=child,
                    siblings=siblings,
                    max_tokens=max_context_per_chunk,
                    heading_path=parent.heading_path,
                    section_title=parent.section_title,
                )
        else:
            # Child has no parent → child IS the full section content
            context_content = child.content

        results.append(RetrievedChunk(
            chunk_id=child.id,
            document_id=child.document_id,
            document_name=doc_map.get(child.document_id, f"Doc#{child.document_id}"),
            context_content=context_content,
            child_content=child.content,
            section_title=child.section_title,
            heading_path=child.heading_path,
            similarity=float(child._similarity) if hasattr(child, '_similarity') else 0.0,
        ))

    # Sort by similarity descending, take top_k
    results.sort(key=lambda x: x.similarity, reverse=True)
    results = results[:top_k]

    t_total = time.perf_counter() - t_start
    logger.info(
        "RAG search: query=%r, total=%.0fms, embed=%.0fms, vector=%.0fms, "
        "parents=%.0fms, siblings=%.0fms, docs=%.0fms, results=%d",
        query[:80], t_total * 1000, t_embed * 1000, t_vector * 1000,
        t_parents * 1000, t_siblings * 1000, t_docs * 1000, len(results),
    )
    return results


async def generate_answer(
    query: str,
    context_chunks: list[RetrievedChunk],
    stream: bool = False,
) -> dict:
    """Generate an answer using the LLM based on retrieved context.

    Args:
        query: The user's question.
        context_chunks: Retrieved chunks to use as context.
        stream: If True, returns a streaming generator marker.

    Returns:
        Dict with 'answer' and 'sources' keys (non-streaming mode).
        For streaming mode, returns {'_stream': True, ...} marker.
    """
    # --- Prompt injection guard ---
    from ..security.prompt_guard import PromptGuard
    PromptGuard.scan_or_raise(query)
    # --- End guard ---

    if not context_chunks:
        logger.info("RAG generate_answer: empty context, returning no-answer response")
        return {
            "answer": "知识库中暂无相关信息。",
            "sources": [],
        }

    # Build context with global token budget
    t0 = time.perf_counter()
    max_total_context = EnvVarLoader.get_int(
        "AIWORK_RAG_MAX_TOTAL_CONTEXT", 8000, min_value=1024,
    )
    context_parts: list[str] = []
    total_context_tokens = 0

    for i, chunk in enumerate(context_chunks, 1):
        heading = chunk.heading_path or chunk.section_title or ""
        heading_info = f" > {heading}" if heading else ""
        entry_prefix = f"[来源{i}: {chunk.document_name}{heading_info}]\n"
        entry_separator = "\n\n---\n\n" if context_parts else ""
        entry_tokens = estimate_tokens(
            entry_separator + entry_prefix + chunk.context_content
        )

        if total_context_tokens + entry_tokens > max_total_context:
            if context_parts:
                context_parts.append(
                    f"\n> ...（剩余 {len(context_chunks) - i + 1} "
                    f"个来源因上下文限制已省略）..."
                )
            break

        context_parts.append(entry_prefix + chunk.context_content)
        total_context_tokens += entry_tokens

    context_text = "\n\n---\n\n".join(context_parts)

    # 用 replace 填充 system prompt（避免 context 中的 {} 被 format 误解析）
    filled_system_prompt = _SYSTEM_PROMPT.replace(
        "{context}", context_text,
    ).replace(
        "{query}", query,
    )

    # Build messages（必须有 user 消息，否则 API 返回 400）
    messages = [
        {"role": "system", "content": filled_system_prompt},
        {"role": "user", "content": query},
    ]
    t_prompt = time.perf_counter() - t0

    if stream:
        return {
            "_stream": True,
            "messages": messages,
            "context_chunks": context_chunks,
        }

    # Non-streaming: call LLM
    t0 = time.perf_counter()
    answer = await _call_llm(messages)
    t_llm = time.perf_counter() - t0

    # Build sources
    sources = [
        {
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "document_name": chunk.document_name,
            "section_title": chunk.section_title,
            "heading_path": chunk.heading_path,
            "content_preview": chunk.child_content,
            "similarity": round(chunk.similarity, 4),
        }
        for chunk in context_chunks
    ]

    logger.info(
        "RAG generate_answer: query=%r, prompt=%.0fms, llm=%.0fms, "
        "answer_len=%d, context_tokens=%d, sources=%d",
        query[:80], t_prompt * 1000, t_llm * 1000,
        len(answer), total_context_tokens, len(sources),
    )

    return {"answer": answer, "sources": sources}


async def generate_answer_stream(
    query: str,
    context_chunks: list[RetrievedChunk],
):
    """Stream the LLM answer as SSE events.

    Yields SSE-formatted strings (one per chunk).
    """
    # --- Prompt injection guard ---
    from ..security.prompt_guard import PromptGuard
    PromptGuard.scan_or_raise(query)
    # --- End guard ---

    if not context_chunks:
        yield f"data: {json.dumps({'answer': '知识库中暂无相关信息。', 'sources': [], 'done': True})}\n\n"
        return

    max_total_context = EnvVarLoader.get_int(
        "AIWORK_RAG_MAX_TOTAL_CONTEXT", 8000, min_value=1024,
    )
    context_parts: list[str] = []
    total_context_tokens = 0

    for i, chunk in enumerate(context_chunks, 1):
        heading = chunk.heading_path or chunk.section_title or ""
        heading_info = f" > {heading}" if heading else ""
        entry_prefix = f"[来源{i}: {chunk.document_name}{heading_info}]\n"
        entry_separator = "\n\n---\n\n" if context_parts else ""
        entry_tokens = estimate_tokens(
            entry_separator + entry_prefix + chunk.context_content
        )

        if total_context_tokens + entry_tokens > max_total_context:
            if context_parts:
                context_parts.append(
                    f"\n> ...（剩余 {len(context_chunks) - i + 1} "
                    f"个来源因上下文限制已省略）..."
                )
            break

        context_parts.append(entry_prefix + chunk.context_content)
        total_context_tokens += entry_tokens

    context_text = "\n\n---\n\n".join(context_parts)

    # 用 replace 填充 system prompt（避免 context 中的 {} 被 format 误解析）
    filled_system_prompt = _SYSTEM_PROMPT.replace(
        "{context}", context_text,
    ).replace(
        "{query}", query,
    )

    # Build messages（必须有 user 消息，否则 API 返回 400）
    messages = [
        {"role": "system", "content": filled_system_prompt},
        {"role": "user", "content": query},
    ]

    answer_text = ""
    async for token in _call_llm_stream(messages):
        answer_text += token
        yield f"data: {json.dumps({'token': token})}\n\n"

    # Send sources at the end
    sources = [
        {
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "document_name": chunk.document_name,
            "section_title": chunk.section_title,
            "heading_path": chunk.heading_path,
            "content_preview": chunk.child_content,
            "similarity": round(chunk.similarity, 4),
        }
        for chunk in context_chunks
    ]
    yield f"data: {json.dumps({'sources': sources, 'done': True})}\n\n"


# ---------------------------------------------------------------------------
# Internal: Vector search
# ---------------------------------------------------------------------------


async def _vector_search(
    db: AsyncSession,
    query_vec: list[float],
    top_k: int,
    metadata_filters: dict[str, str] | None,
) -> list[RagChunk]:
    """Execute HNSW vector search on rag_chunks.

    Uses the cosine distance operator ``<=>`` for similarity.
    The query vector is formatted as a pgvector literal (safe — all floats).
    Metadata filter keys/values are properly parameterized to prevent SQL injection.
    """
    # Format vector as pgvector literal: [0.1,0.2,...]
    # Safe because all elements are float values from the embedding API
    vector_str = f"[{','.join(str(v) for v in query_vec)}]"

    params: dict = {
        "query_vec": vector_str,
        "top_k": top_k,
    }

    # Build metadata filter subquery with proper parameterization
    metadata_join = ""
    if metadata_filters:
        conditions = []
        for i, (key, val) in enumerate(metadata_filters.items()):
            k_param = f"mk_{i}"
            v_param = f"mv_{i}"
            conditions.append(
                f"(m.meta_key = :{k_param} AND m.meta_value = :{v_param})"
            )
            params[k_param] = key
            params[v_param] = val

        filter_sql = " OR ".join(conditions)
        metadata_join = (
            f" AND c.document_id IN ("
            f"  SELECT m.document_id FROM rag_document_metadata m"
            f"  WHERE ({filter_sql})"
            f"  GROUP BY m.document_id"
            f"  HAVING COUNT(DISTINCT m.meta_key) = :filter_count"
            f")"
        )
        params["filter_count"] = len(metadata_filters)

    sql = text(f"""
        SELECT
            c.id, c.document_id, c.parent_chunk_id, c.content,
            c.section_title, c.heading_path,
            c.chunk_index, c.token_count,
            1 - (c.embedding <=> :query_vec) AS similarity
        FROM rag_chunks c
        WHERE c.chunk_type = 'child'
          AND c.is_deleted = false
          {metadata_join}
        ORDER BY c.embedding <=> :query_vec
        LIMIT :top_k
    """)

    result = await db.execute(sql, params)

    rows = result.all()
    if not rows:
        return []

    chunks = []
    for row in rows:
        chunk = RagChunk(
            id=row.id,
            document_id=row.document_id,
            parent_chunk_id=row.parent_chunk_id,
            content=row.content,
            section_title=row.section_title,
            heading_path=row.heading_path,
            chunk_index=row.chunk_index,
            token_count=row.token_count,
        )
        chunk._similarity = row.similarity  # type: ignore[attr-defined]
        chunks.append(chunk)

    return chunks


async def _fetch_parents(
    db: AsyncSession, parent_ids: list[int],
) -> dict[int, RagChunk]:
    """Fetch parent chunks by IDs."""
    if not parent_ids:
        return {}
    stmt = select(RagChunk).where(RagChunk.id.in_(parent_ids))
    result = await db.execute(stmt)
    return {c.id: c for c in result.scalars().all()}


async def _fetch_document_names(
    db: AsyncSession, doc_ids: set[int],
) -> dict[int, str]:
    """Fetch document names by IDs."""
    if not doc_ids:
        return {}
    stmt = select(RagDocument.id, RagDocument.original_name).where(
        RagDocument.id.in_(doc_ids)
    )
    result = await db.execute(stmt)
    return {row[0]: row[1] for row in result.all()}


async def _fetch_siblings(
    db: AsyncSession, parent_ids: list[int],
) -> dict[int, list[RagChunk]]:
    """Fetch all child chunks for given parent IDs, grouped by parent_chunk_id.

    Used by context window building: when a parent is too large, we need all
    sibling children to build a local context window around the matched child.

    Returns:
        dict mapping parent_chunk_id → list of child chunks sorted by chunk_index.
    """
    if not parent_ids:
        return {}

    stmt = (
        select(RagChunk)
        .where(
            RagChunk.parent_chunk_id.in_(parent_ids),
            RagChunk.chunk_type == "child",
            RagChunk.is_deleted == False,
        )
        .order_by(RagChunk.parent_chunk_id, RagChunk.chunk_index)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    siblings_map: dict[int, list[RagChunk]] = {}
    for row in rows:
        pid = row.parent_chunk_id
        if pid not in siblings_map:
            siblings_map[pid] = []
        siblings_map[pid].append(row)

    return siblings_map


def _build_context_window(
    matched_child: RagChunk,
    siblings: list[RagChunk],
    max_tokens: int,
    heading_path: str | None,
    section_title: str | None,
) -> str:
    """Build a local context window centered on the matched child chunk.

    When a parent section is too large, instead of using the full parent
    content, we build a bounded window around the matched child:

    1. Start with the matched child content.
    2. Expand outward by adding adjacent sibling chunks (alternating
       before/after, closest first).
    3. Stop when ``max_tokens`` is reached or no more siblings remain.
    4. Omitted portions are marked with "...（前文/后文省略 N 个段落）...".

    Returns:
        Context string with heading + windowed content.
    """
    # Filter out the matched child from siblings (it will be the window center)
    other_siblings = [c for c in siblings if c.id != matched_child.id]

    # Split into before/after groups relative to the matched child
    child_idx = matched_child.chunk_index
    before = [c for c in other_siblings if c.chunk_index < child_idx]
    before.sort(key=lambda c: c.chunk_index, reverse=True)  # closest first
    after = [c for c in other_siblings if c.chunk_index > child_idx]
    after.sort(key=lambda c: c.chunk_index)  # closest first

    # Start with matched child
    window_parts: list[str] = [matched_child.content]
    window_tokens = matched_child.token_count or estimate_tokens(matched_child.content)

    added_before = 0
    added_after = 0

    # Expand outward, alternating before/after for symmetric context
    while window_tokens < max_tokens:
        added = False

        # Try adding one sibling from before
        if added_before < len(before):
            c = before[added_before]
            c_tokens = c.token_count or estimate_tokens(c.content)
            if window_tokens + c_tokens <= max_tokens:
                window_parts.insert(0, c.content)
                window_tokens += c_tokens
                added_before += 1
                added = True

        # Try adding one sibling from after
        if added_after < len(after):
            c = after[added_after]
            c_tokens = c.token_count or estimate_tokens(c.content)
            if window_tokens + c_tokens <= max_tokens:
                window_parts.append(c.content)
                window_tokens += c_tokens
                added_after += 1
                added = True

        if not added:
            break

    # Assemble final result with omission markers and heading context
    result_parts: list[str] = []

    heading = heading_path or section_title
    if heading:
        result_parts.append(f"## {heading}\n")

    if added_before < len(before):
        result_parts.append(
            f"> ...（前文省略 {len(before) - added_before} 个段落）...\n"
        )

    result_parts.extend(window_parts)

    if added_after < len(after):
        result_parts.append(
            f"\n> ...（后文省略 {len(after) - added_after} 个段落）..."
        )

    return "\n\n".join(result_parts)


# ---------------------------------------------------------------------------
# Shared httpx client (connection pooling)
# ---------------------------------------------------------------------------

_llm_client: httpx.AsyncClient | None = None


def get_llm_client() -> httpx.AsyncClient:
    """Return a module-level httpx.AsyncClient for LLM API calls.

    Uses connection pooling (``max_keepalive_connections=10``,
    ``max_connections=20``) to avoid TCP+TLS handshake on every request.
    """
    global _llm_client
    if _llm_client is None:
        _llm_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _llm_client


async def close_llm_client() -> None:
    """Close the shared LLM httpx client (called on app shutdown)."""
    global _llm_client
    if _llm_client is not None:
        await _llm_client.aclose()
        _llm_client = None


# ---------------------------------------------------------------------------
# Internal: LLM API call
# ---------------------------------------------------------------------------


def _get_llm_config() -> tuple[str, str, str]:
    """Get LLM API URL, key, and model from env."""
    api_url = EnvVarLoader.get_str(
        "AIWORK_RAG_LLM_API_URL", _DEFAULT_LLM_API_URL,
    ).rstrip("/")
    api_key = EnvVarLoader.get_str("AIWORK_RAG_LLM_API_KEY", "")
    model = EnvVarLoader.get_str("AIWORK_RAG_LLM_MODEL", _DEFAULT_LLM_MODEL)
    return api_url, api_key, model


async def _call_llm(messages: list[dict]) -> str:
    """Make a single (non-streaming) LLM chat completion call."""
    api_url, api_key, model = _get_llm_config()
    url = f"{api_url}/chat/completions"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 768,
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(120.0, connect=15.0)

    t0 = time.perf_counter()
    client = get_llm_client()
    try:
        response = await client.post(url, json=payload, headers=headers, timeout=timeout)
        t_api = time.perf_counter() - t0
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        logger.info(
            "RAG _call_llm: model=%s, api_time=%.0fms, prompt_tokens=%s, "
            "completion_tokens=%s, output_len=%d",
            model, t_api * 1000,
            usage.get("prompt_tokens", "?"),
            usage.get("completion_tokens", "?"),
            len(content),
        )
        return content
    except httpx.TimeoutException:
        logger.error("RAG LLM request timed out after %.0fms", (time.perf_counter() - t0) * 1000)
        return "LLM 请求超时，请稍后重试。"
    except httpx.HTTPStatusError as exc:
        resp_body = ""
        try:
            resp_body = exc.response.text[:500]
        except Exception:
            pass
        logger.error(
            "RAG LLM request failed: %s, response body: %s",
            exc, resp_body,
        )
        return f"LLM 请求失败：{exc}"
    except Exception as exc:
        logger.error("RAG LLM request failed: %s", exc)
        return f"LLM 请求失败：{exc}"


async def _call_llm_stream(messages: list[dict]):
    """Stream LLM chat completion tokens via SSE."""
    api_url, api_key, model = _get_llm_config()
    url = f"{api_url}/chat/completions"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 768,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(120.0, connect=15.0)

    client = get_llm_client()
    try:
        async with client.stream("POST", url, json=payload, headers=headers, timeout=timeout) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.TimeoutException:
        yield "LLM 请求超时，请稍后重试。"
    except Exception as exc:
        yield f"LLM 请求失败：{exc}"
