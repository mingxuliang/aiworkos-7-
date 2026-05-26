# -*- coding: utf-8 -*-
"""RSS proxy for console news center (bypass browser CORS)."""

from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(tags=["rss"])

_ALLOWED_HOSTS = frozenset(
    {
        "www.qbitai.com",
        "www.infoq.cn",
        "sspai.com",
        "openai.com",
        "hnrss.org",
        "rss.arxiv.org",
        "api.bilibili.com",
    },
)

_UA = (
    "Mozilla/5.0 (compatible; AIWorkOS-RSS/1.0; +https://github.com/agentscope-ai)"
)


@router.get("/rss-proxy")
async def rss_proxy(url: str = Query(..., description="HTTPS RSS feed URL")) -> Response:
    """Fetch RSS XML server-side and return to the console."""
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid url") from exc

    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="host not allowed")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            upstream = await client.get(
                url,
                headers={
                    "User-Agent": _UA,
                    "Accept": (
                        "application/rss+xml, application/xml, text/xml, "
                        "application/atom+xml, */*"
                    ),
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    media = upstream.headers.get("content-type") or "application/xml; charset=utf-8"
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=media,
        headers={"Cache-Control": "public, max-age=300"},
    )
