# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
from typing import Any, Optional

import click
import httpx


DEFAULT_BASE_URL = "http://127.0.0.1:8088"


def _load_internal_token() -> Optional[str]:
    """Load internal CLI token from env or disk (read-only, no generation)."""
    env_token = os.environ.get("AIWORK_INTERNAL_TOKEN", "")
    if env_token:
        return env_token

    # Import SECRET_DIR lazily to avoid pulling in heavy dependencies
    # at module level when the CLI doesn't need auth at all.
    try:
        from ..constant import SECRET_DIR

        token_file = SECRET_DIR / "internal_token.json"
        if token_file.is_file():
            with open(token_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("token") or None
    except Exception:
        pass
    return None


def client(base_url: str) -> httpx.Client:
    """Create HTTP client with /api prefix added to all requests."""
    base = base_url.rstrip("/")
    if not base.endswith("/api"):
        base = f"{base}/api"
    headers: dict[str, str] = {}
    token = _load_internal_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.Client(base_url=base, timeout=30.0, headers=headers)


def print_json(data: Any) -> None:
    click.echo(json.dumps(data, ensure_ascii=False, indent=2))


def resolve_base_url(ctx: click.Context, base_url: Optional[str]) -> str:
    """Resolve base_url with priority:
    1) command --base-url
    2) global --host/--port (from ctx.obj)

    Args:
        ctx: Click context containing global options
        base_url: Optional base_url override from command option

    Returns:
        Resolved base URL string
    """
    if base_url:
        return base_url.rstrip("/")
    host = (ctx.obj or {}).get("host", "127.0.0.1")
    port = (ctx.obj or {}).get("port", 8088)
    return f"http://{host}:{port}"
