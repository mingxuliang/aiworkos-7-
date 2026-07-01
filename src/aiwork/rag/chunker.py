# -*- coding: utf-8 -*-
r"""Markdown chunker: title-based splitting with parent-child overflow.

Strategy (in priority order):

1. Analyze heading levels: detect H1-H4 usage patterns.
   - If MinerU flattens all headings to the same level (e.g. all H2)
     → merge consecutive same-level headings to avoid empty chunks.

2. Intelligent discard rules:
   - Sections with only a title and no body → discard.
   - Sections with very short body (< 20 tokens) → merge into next section.

3. Split by headings → each section becomes chunks.

4. Section fits (token_count ≤ chunk_size):
   → 1 Child chunk (with embedding, parent_chunk_idx=None).
   Child IS the full content — no parent needed.

5. Section overflows (token_count > chunk_size):
   → 1 Parent chunk (full content, no embedding) + N Child chunks
   (split by paragraph, with embeddings, linked to parent).

6. No-heading fallback: if the document has no detectable headings,
   fall back to fixed-length splitting. Since each window ≤ chunk_size,
   only child chunks are created (no parents).

Retrieval rule:
  - If a matched child's parent_chunk_id is NULL → return the child itself.
  - If parent_chunk_id is set → return the parent (full section context).

Each Chunk has:
  - section_title: the nearest heading (e.g. "3.1 架构概述")
  - heading_path: full breadcrumb (e.g. "第三章 > 3.1 > 3.1.1")
  - chunk_type: "parent" | "child"
  - chunk_index: ordinal within the document
  - parent_chunk_idx: for child chunks, the index of their parent (None if child IS the full content)
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field

from .embedder import estimate_tokens

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_CHUNK_SIZE = 512   # tokens
DEFAULT_CHUNK_OVERLAP = 50  # tokens
MIN_SECTION_TOKENS = 200     # below this, merge into next section

# Heading pattern: match Markdown ATX headings (H1-H4)
_HEADING_RE = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class Chunk:
    """A single document chunk (parent or child)."""

    section_title: str | None
    heading_path: str | None
    content: str
    chunk_type: str  # "parent" | "child"
    chunk_index: int
    parent_chunk_idx: int | None  # child → parent index (0-based)
    token_count: int
    content_hash: str | None = None

    def __post_init__(self):
        if self.content_hash is None:
            self.content_hash = hashlib.sha256(
                self.content.encode("utf-8")
            ).hexdigest()


@dataclass
class _Section:
    """Internal: a heading-delimited section before chunking."""

    title: str | None
    heading_path: str | None
    body: str
    heading_level: int = 2


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def chunk_markdown(
    markdown: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[Chunk]:
    """Split markdown text into parent/child chunks.

    Args:
        markdown: The full markdown text.
        chunk_size: Maximum tokens per chunk (default 512).
        chunk_overlap: Overlap tokens between consecutive child chunks.

    Returns:
        List of Chunk objects with chunk_type="parent" or "child".
    """
    if not markdown.strip():
        return []

    sections = _split_by_headings(markdown)

    if not sections:
        # No headings found → fall back to fixed-length splitting
        return _fixed_length_chunks(markdown, chunk_size, chunk_overlap)

    # Merge short / empty sections
    sections = _merge_short_sections(sections)

    # Generate parent + child chunks
    chunks = _generate_chunks(sections, chunk_size, chunk_overlap)

    return chunks


# ---------------------------------------------------------------------------
# Step 1: Heading analysis and splitting
# ---------------------------------------------------------------------------


def _analyze_heading_levels(markdown: str) -> dict[str, int]:
    """Count how many times each heading level (H1-H4) appears.

    Returns: ``{"H1": 3, "H2": 15, ...}``
    """
    counts: dict[str, int] = {"H1": 0, "H2": 0, "H3": 0, "H4": 0}
    for match in _HEADING_RE.finditer(markdown):
        level = len(match.group(1))
        if 1 <= level <= 4:
            counts[f"H{level}"] += 1
    return counts


def _build_heading_path(
    stack: list[tuple[int, str]], level: int, title: str,
) -> str:
    """Build breadcrumb heading path from a stack of (level, title).

    Clears deeper levels from the stack when moving to a shallower level.
    """
    # Pop headings deeper than or equal to current level
    while stack and stack[-1][0] >= level:
        stack.pop()
    stack.append((level, title))
    return " > ".join(t for _, t in stack)


def _split_by_headings(markdown: str) -> list[_Section]:
    """Split markdown into sections by heading boundaries.

    If MinerU flattens all headings to the same level (e.g. all H2),
    consecutive same-level headings will produce sections — the merge
    logic in ``_merge_short_sections`` handles discarding empty ones.

    Returns an empty list if no headings are found.
    """
    heading_counts = _analyze_heading_levels(markdown)
    total_headings = sum(heading_counts.values())

    if total_headings == 0:
        return []

    # Find the highest heading level actually used
    min_level = 4
    for i in range(1, 5):
        if heading_counts[f"H{i}"] > 0:
            min_level = i
            break

    # Check if all headings are at the same level (MinerU flattening)
    active_levels = [i for i in range(1, 5) if heading_counts[f"H{i}"] > 0]
    all_same_level = len(active_levels) == 1

    sections: list[_Section] = []
    heading_stack: list[tuple[int, str]] = []

    # Find all heading positions
    heading_matches = list(_HEADING_RE.finditer(markdown))

    if not heading_matches:
        return []

    # Text before the first heading
    if heading_matches[0].start() > 0:
        pre_text = markdown[: heading_matches[0].start()].strip()
        if pre_text:
            sections.append(_Section(
                title=None,
                heading_path=None,
                body=pre_text,
                heading_level=min_level,
            ))

    for i, match in enumerate(heading_matches):
        level = len(match.group(1))
        title = match.group(2).strip()

        # Determine effective level
        if all_same_level:
            # All headings are the same level → treat as flat
            # Use the previous heading's level to build an implicit path
            effective_level = min_level
        else:
            effective_level = level

        # Build heading path
        heading_path = _build_heading_path(heading_stack, effective_level, title)

        # Extract section body (text until next heading)
        body_start = match.end()
        if i + 1 < len(heading_matches):
            body_end = heading_matches[i + 1].start()
        else:
            body_end = len(markdown)

        body = markdown[body_start:body_end].strip()

        sections.append(_Section(
            title=title,
            heading_path=heading_path,
            body=body,
            heading_level=effective_level,
        ))

    return sections


# ---------------------------------------------------------------------------
# Step 2: Merge short / empty sections
# ---------------------------------------------------------------------------


def _merge_short_sections(sections: list[_Section]) -> list[_Section]:
    """Merge sections that are too short or have empty bodies.

    Rules:
    - Section with no body (only title) → discard (merge heading into next)
    - Section with body < MIN_SECTION_TOKENS → merge into next section
    """
    if not sections:
        return sections

    merged: list[_Section] = []
    pending: _Section | None = None

    for section in sections:
        body_tokens = estimate_tokens(section.body)

        if body_tokens == 0:
            # Empty body — discard this section, keep its title for context
            # (heading_path already captured; merge into next)
            if pending is not None:
                # Prepend this title info to the next body
                pass  # heading path is already set per-section
            continue

        if body_tokens < MIN_SECTION_TOKENS:
            # Very short section — merge into next
            if pending is None:
                pending = section
            else:
                # Merge pending's body into this one (under this section's heading)
                pending.body = pending.body + "\n\n" + section.body
                pending = pending  # keep pending for next iteration
            continue

        if pending is not None:
            # Merge pending into current
            merged_body = pending.body + "\n\n" + section.body
            merged.append(_Section(
                title=section.title,
                heading_path=section.heading_path,
                body=merged_body,
                heading_level=section.heading_level,
            ))
            pending = None
        else:
            merged.append(section)

    # Handle trailing pending
    if pending is not None:
        if merged:
            # Merge trailing pending into the last section
            last = merged[-1]
            merged[-1] = _Section(
                title=last.title,
                heading_path=last.heading_path,
                body=last.body + "\n\n" + pending.body,
                heading_level=last.heading_level,
            )
        else:
            merged.append(pending)

    return merged


# ---------------------------------------------------------------------------
# Step 3/5/6: Generate parent + child chunks
# ---------------------------------------------------------------------------


def _generate_chunks(
    sections: list[_Section],
    chunk_size: int,
    chunk_overlap: int,
) -> list[Chunk]:
    """Generate parent and child chunks from sections.

    Parent chunks are ONLY created when a section exceeds chunk_size.

    - If body_tokens ≤ chunk_size → 1 child chunk (with embedding, no parent).
      Child IS the full content.
    - If body_tokens > chunk_size → 1 parent (full content, no embedding)
      + N child chunks (split, with embeddings, linked to parent).

    Retrieval rule:
      - child.parent_chunk_idx is None → return child itself.
      - child.parent_chunk_idx is set → return parent (full context).
    """
    chunks: list[Chunk] = []
    chunk_index = 0

    for section in sections:
        body_tokens = estimate_tokens(section.body)

        if body_tokens == 0:
            continue

        if body_tokens <= chunk_size:
            # Section fits → only a child chunk (no parent needed)
            child = Chunk(
                section_title=section.title,
                heading_path=section.heading_path,
                content=section.body,
                chunk_type="child",
                chunk_index=chunk_index,
                parent_chunk_idx=None,  # No parent — child IS the full content
                token_count=body_tokens,
            )
            chunks.append(child)
            chunk_index += 1
        else:
            # Section too large → create parent (full, no embedding) + child chunks
            parent_idx = len(chunks)
            parent = Chunk(
                section_title=section.title,
                heading_path=section.heading_path,
                content=section.body,
                chunk_type="parent",
                chunk_index=chunk_index,
                parent_chunk_idx=None,
                token_count=body_tokens,
            )
            chunks.append(parent)
            chunk_index += 1

            child_chunks = _split_by_paragraphs(
                section.body, section.title, section.heading_path,
                chunk_size, chunk_overlap,
                start_index=chunk_index,
                parent_idx=parent_idx,
            )
            chunks.extend(child_chunks)
            chunk_index += len(child_chunks)

    return chunks


# ---------------------------------------------------------------------------
# Paragraph-based splitting with sliding window
# ---------------------------------------------------------------------------


def _split_by_paragraphs(
    text: str,
    section_title: str | None,
    heading_path: str | None,
    chunk_size: int,
    chunk_overlap: int,
    start_index: int,
    parent_idx: int,
) -> list[Chunk]:
    """Split a long section body into child chunks by paragraph boundaries.

    Uses a sliding window approach:
    1. Split text by ``\\n\\n`` (paragraph boundaries).
    2. Accumulate paragraphs until token_count > chunk_size.
    3. Flush the accumulated window as a chunk.
    4. Slide the window back by ``chunk_overlap`` tokens.
    """
    paragraphs = re.split(r"\n\n+", text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    if not paragraphs:
        return []

    chunks: list[Chunk] = []
    chunk_idx = start_index
    window: list[str] = []
    window_tokens = 0

    for para in paragraphs:
        para_tokens = estimate_tokens(para)

        if window_tokens + para_tokens > chunk_size and window:
            # Flush current window
            chunk_text = "\n\n".join(window)
            chunks.append(Chunk(
                section_title=section_title,
                heading_path=heading_path,
                content=chunk_text,
                chunk_type="child",
                chunk_index=chunk_idx,
                parent_chunk_idx=parent_idx,
                token_count=estimate_tokens(chunk_text),
            ))
            chunk_idx += 1

            # Slide window: keep last ~overlap tokens
            overlap_text = _extract_overlap(chunk_text, chunk_overlap)
            window = [overlap_text] if overlap_text else []
            window_tokens = estimate_tokens(overlap_text) if overlap_text else 0

        window.append(para)
        window_tokens += para_tokens

    # Flush remaining
    if window:
        chunk_text = "\n\n".join(window)
        chunks.append(Chunk(
            section_title=section_title,
            heading_path=heading_path,
            content=chunk_text,
            chunk_type="child",
            chunk_index=chunk_idx,
            parent_chunk_idx=parent_idx,
            token_count=estimate_tokens(chunk_text),
        ))

    return chunks


def _extract_overlap(text: str, overlap_tokens: int) -> str:
    """Extract the last ~overlap_tokens from text for sliding window overlap.

    Uses the heuristic that ~4 chars ≈ 1 token for mixed Chinese/English text.
    """
    if not text or overlap_tokens <= 0:
        return ""

    # Rough: ~3 chars per token (conservative for Chinese-heavy text)
    char_count = overlap_tokens * 3
    if char_count >= len(text):
        return text

    overlap_text = text[-char_count:]

    # Try to start at a paragraph boundary within the overlap region
    para_boundary = overlap_text.find("\n\n")
    if para_boundary > 0:
        overlap_text = overlap_text[para_boundary + 2:]

    return overlap_text


# ---------------------------------------------------------------------------
# Fallback: Fixed-length chunking (no headings)
# ---------------------------------------------------------------------------


def _fixed_length_chunks(
    markdown: str,
    chunk_size: int,
    chunk_overlap: int,
) -> list[Chunk]:
    """Fallback: split by fixed token length when no headings are detected.

    Each window is ≤ chunk_size by construction, so we only create child
    chunks (with embeddings, no parents). No parent duplication needed.
    """
    paragraphs = re.split(r"\n\n+", markdown)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    if not paragraphs:
        return []

    chunks: list[Chunk] = []
    chunk_idx = 0
    window: list[str] = []
    window_tokens = 0

    for para in paragraphs:
        para_tokens = estimate_tokens(para)

        if window_tokens + para_tokens > chunk_size and window:
            chunk_text = "\n\n".join(window)
            toks = estimate_tokens(chunk_text)

            chunks.append(Chunk(
                section_title=None,
                heading_path=None,
                content=chunk_text,
                chunk_type="child",
                chunk_index=chunk_idx,
                parent_chunk_idx=None,
                token_count=toks,
            ))
            chunk_idx += 1

            # Slide window
            overlap_text = _extract_overlap(chunk_text, chunk_overlap)
            window = [overlap_text] if overlap_text else []
            window_tokens = estimate_tokens(overlap_text) if overlap_text else 0

        window.append(para)
        window_tokens += para_tokens

    # Flush remaining
    if window:
        chunk_text = "\n\n".join(window)
        toks = estimate_tokens(chunk_text)
        chunks.append(Chunk(
            section_title=None,
            heading_path=None,
            content=chunk_text,
            chunk_type="child",
            chunk_index=chunk_idx,
            parent_chunk_idx=None,
            token_count=toks,
        ))

    return chunks
