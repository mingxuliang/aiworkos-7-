# -*- coding: utf-8 -*-
"""Periodic thread GC task.

ChromaDB (via reme-ai) embeds a Rust Tokio runtime in each workspace.
When a workspace is reloaded the old ChromaDB client is dropped but Python's
cyclic GC may not immediately collect it, leaving Tokio worker threads alive.

This module runs a lightweight background loop that:
  1. Calls ``gc.collect()`` (three generations) every *interval* seconds.
  2. Logs a warning when the process thread count exceeds *warn_threshold*.

The loop is entirely in-process and does **not** restart the service.
"""
from __future__ import annotations

import asyncio
import gc
import logging
import os

logger = logging.getLogger(__name__)

# Default: run GC every 3 hours.
DEFAULT_GC_INTERVAL = 10800

# Log a WARNING when thread count is above this value.
# 11 workspaces × 19 Rust threads + ~50 Python threads ≈ 260 at startup.
# Alert when meaningfully higher than that baseline.
DEFAULT_WARN_THRESHOLD = 400


def _current_thread_count() -> int:
    """Return the number of OS threads in the current process."""
    try:
        return len(os.listdir(f"/proc/{os.getpid()}/task"))
    except OSError:
        return -1


def _force_gc() -> tuple[int, int]:
    """Run full GC and return (before, after) thread counts."""
    before = _current_thread_count()
    gc.collect(0)
    gc.collect(1)
    gc.collect(2)
    after = _current_thread_count()
    return before, after


async def run_thread_gc_loop(
    interval: int = DEFAULT_GC_INTERVAL,
    warn_threshold: int = DEFAULT_WARN_THRESHOLD,
) -> None:
    """Long-running background task that periodically forces Python GC.

    Intended to be launched via ``asyncio.create_task()`` during startup::

        asyncio.create_task(run_thread_gc_loop())

    Args:
        interval: Seconds between each GC cycle. Default 600 (10 minutes).
        warn_threshold: Log WARNING when thread count exceeds this value.
    """
    logger.info(
        "Thread GC loop started (interval=%ds, warn_threshold=%d)",
        interval,
        warn_threshold,
    )
    while True:
        await asyncio.sleep(interval)
        try:
            before, after = await asyncio.to_thread(_force_gc)
            freed = before - after
            msg = (
                "Thread GC: threads %d → %d (%s%d)"
                % (
                    before,
                    after,
                    "-" if freed >= 0 else "+",
                    abs(freed),
                )
            )
            if after > warn_threshold:
                logger.warning(
                    "%s — thread count above threshold (%d). "
                    "Consider setting MEMORY_STORE_BACKEND=local to "
                    "prevent ChromaDB/Tokio thread accumulation.",
                    msg,
                    warn_threshold,
                )
            else:
                logger.info(msg)
        except Exception:
            logger.error("Thread GC tick failed", exc_info=True)
