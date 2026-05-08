# -*- coding: utf-8 -*-
"""Chat management API."""
from __future__ import annotations
from typing import Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from agentscope.memory import InMemoryMemory

from .session import SafeJSONSession
from .manager import ChatManager
from .models import (
    ChatSpec,
    ChatUpdate,
    ChatHistory,
)
from .utils import agentscope_msg_to_message


router = APIRouter(prefix="/chats", tags=["chats"])


async def _get_jwt_user(request: Request) -> str | None:
    """Return the authenticated username from JWT, with fallback decoding.

    Tries ``request.state.user_id`` first (set by middleware).  Falls back to
    decoding the ``Authorization`` header directly when the middleware's
    ``request.state`` did not propagate (known Starlette BaseHTTPMiddleware
    issue with ``call_next`` and ``_CachedRequest``).

    Reads ``username`` and ``roles`` from the Redis session cache
    (source of truth), falling back to the JWT payload when Redis
    is unavailable.
    """
    jwt_user = getattr(request.state, "user_id", None)
    if jwt_user:
        return jwt_user
    # Fallback: decode JWT directly from the Authorization header
    from ..auth_jwt.jwt_utils import decode_token as jwt_decode_token
    from ..auth_jwt.middleware import JWTAuthMiddleware
    from ..auth_jwt.redis_client import get_session_user_info

    token = JWTAuthMiddleware._extract_token(request)
    if not token:
        return None
    try:
        payload = await jwt_decode_token(token)
    except Exception:
        return None
    if not payload:
        return None

    # Try Redis session cache first (source of truth)
    jti = payload.get("jti", "")
    if jti:
        user_info = await get_session_user_info(jti)
        if user_info:
            return str(user_info.get("user_id", "")) or user_info.get("username", "")

    # Fallback to JWT payload
    return payload.get("sub") or payload.get("username")


async def get_workspace(request: Request):
    """Get the workspace for the active agent."""
    from ..agent_context import get_agent_for_request

    return await get_agent_for_request(request)


async def get_chat_manager(
    request: Request,
) -> ChatManager:
    """Get the chat manager for the active agent.

    Args:
        request: FastAPI request object

    Returns:
        ChatManager instance for the specified agent

    Raises:
        HTTPException: If manager is not initialized
    """
    workspace = await get_workspace(request)
    return workspace.chat_manager


async def get_session(
    request: Request,
) -> SafeJSONSession:
    """Get the session for the active agent.

    Args:
        request: FastAPI request object

    Returns:
        SafeJSONSession instance for the specified agent

    Raises:
        HTTPException: If session is not initialized
    """
    workspace = await get_workspace(request)
    return workspace.runner.session


@router.get("", response_model=list[ChatSpec])
async def list_chats(
    request: Request,
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    channel: Optional[str] = Query(None, description="Filter by channel"),
    mgr: ChatManager = Depends(get_chat_manager),
    workspace=Depends(get_workspace),
):
    """List all chats with optional filters.

    When JWT authentication is active, the list is automatically filtered
    by the authenticated user so that each user only sees their own chats.

    Args:
        request: FastAPI request object (used to read JWT user identity)
        user_id: Optional user ID to filter chats
        channel: Optional channel name to filter chats
        mgr: Chat manager dependency
    """
    # Auto-filter by JWT user when authenticated
    jwt_user = await _get_jwt_user(request)
    if jwt_user:
        user_id = jwt_user

    chats = await mgr.list_chats(user_id=user_id, channel=channel)
    tracker = workspace.task_tracker
    result = []

    for spec in chats:
        status = await tracker.get_status(spec.id)
        result.append(spec.model_copy(update={"status": status}))
    return result


@router.post("", response_model=ChatSpec)
async def create_chat(
    request: ChatSpec,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Create a new chat.

    Server generates chat_id (UUID) automatically.

    Args:
        request: Chat creation request
        mgr: Chat manager dependency

    Returns:
        Created chat spec with UUID
    """
    chat_id = str(uuid4())
    spec = ChatSpec(
        id=chat_id,
        name=request.name,
        session_id=request.session_id,
        user_id=request.user_id,
        channel=request.channel,
        meta=request.meta,
    )
    return await mgr.create_chat(spec)


@router.post("/batch-delete", response_model=dict)
async def batch_delete_chats(
    chat_ids: list[str],
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Delete chats by chat IDs.

    Args:
        chat_ids: List of chat IDs
        mgr: Chat manager dependency
    Returns:
        True if deleted, False if failed

    """
    deleted = await mgr.delete_chats(chat_ids=chat_ids)
    return {"deleted": deleted}


async def _check_chat_ownership(chat_spec: ChatSpec, request: Request) -> None:
    """Raise 403 if JWT user does not own the chat.

    No-op when JWT authentication is not active (no user in request.state).
    Uses fallback JWT decoding when middleware's request.state did not
    propagate.
    """
    jwt_user = await _get_jwt_user(request)
    if jwt_user and chat_spec.user_id != jwt_user:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this chat",
        )


@router.get("/{chat_id}", response_model=ChatHistory)
async def get_chat(
    chat_id: str,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
    session: SafeJSONSession = Depends(get_session),
    workspace=Depends(get_workspace),
):
    """Get detailed information about a specific chat by UUID.

    Args:
        chat_id: Chat UUID
        request: FastAPI request (for agent context & JWT identity)
        mgr: Chat manager dependency
        session: SafeJSONSession dependency

    Returns:
        ChatHistory with messages and status (idle/running)

    Raises:
        HTTPException: If chat not found (404) or not authorized (403)
    """
    chat_spec = await mgr.get_chat(chat_id)
    if not chat_spec:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )

    await _check_chat_ownership(chat_spec, request)

    state = await session.get_session_state_dict(
        chat_spec.session_id,
        chat_spec.user_id,
    )
    status = await workspace.task_tracker.get_status(chat_id)
    if not state:
        return ChatHistory(messages=[], status=status)
    memory_state = state.get("agent", {}).get("memory", {})
    memory = InMemoryMemory()
    memory.load_state_dict(memory_state, strict=False)

    memories = await memory.get_memory(prepend_summary=False)
    messages = agentscope_msg_to_message(memories)
    return ChatHistory(messages=messages, status=status)


@router.put("/{chat_id}", response_model=ChatSpec)
async def update_chat(
    chat_id: str,
    spec: ChatUpdate,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Update an existing chat.

    Args:
        chat_id: Chat UUID
        spec: Partial chat update payload
        request: FastAPI request (for JWT identity)
        mgr: Chat manager dependency

    Returns:
        Updated chat spec

    Raises:
        HTTPException: If chat not found (404) or not authorized (403)
    """
    # Verify ownership before patching
    existing = await mgr.get_chat(chat_id)
    if existing is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    await _check_chat_ownership(existing, request)

    updated = await mgr.patch_chat(chat_id, spec)
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return updated


@router.delete("/{chat_id}", response_model=dict)
async def delete_chat(
    chat_id: str,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Delete a chat by UUID.

    Note: This only deletes the chat spec (UUID mapping).
    JSONSession state is NOT deleted.

    Args:
        chat_id: Chat UUID
        request: FastAPI request (for JWT identity)
        mgr: Chat manager dependency

    Returns:
        True if deleted, False if failed

    Raises:
        HTTPException: If chat not found (404) or not authorized (403)
    """
    # Verify ownership before deleting
    existing = await mgr.get_chat(chat_id)
    if existing is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    await _check_chat_ownership(existing, request)

    deleted = await mgr.delete_chats(chat_ids=[chat_id])
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return {"deleted": True}
