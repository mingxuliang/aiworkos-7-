# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from .models import CronJobSpec

logger = logging.getLogger(__name__)


class CronExecutor:
    def __init__(self, *, runner: Any, channel_manager: Any):
        self._runner = runner
        self._channel_manager = channel_manager

    async def _resolve_channel_manager(
        self,
        owner_user_id: str | None,
        channel: str,
    ) -> Any:
        """Resolve a ChannelManager that owns *channel*.

        1. If *owner_user_id* is set, try the per-user CM for that user.
        2. Scan all cached per-user CMs for one containing *channel*.
        3. Fall back to the workspace-level CM (``console`` only).

        Workspace-level CM only manages the ``console`` channel.
        Third-party IM channels (WeCom, DingTalk, etc.) live in per-user
        CMs.
        """
        workspace = getattr(self._runner, "_workspace", None)
        if workspace is None:
            return self._channel_manager

        # 1. owner_user_id-based lookup
        if owner_user_id:
            user_cm = await workspace.get_channel_manager(owner_user_id)
            if user_cm is not None:
                ch = await user_cm.get_channel(channel.lower())
                if ch is not None:
                    logger.debug(
                        "cron resolve_cm: using per-user CM for "
                        "owner_user_id=%s channel=%s",
                        owner_user_id,
                        channel,
                    )
                    return user_cm
                logger.debug(
                    "cron resolve_cm: per-user CM for owner_user_id=%s "
                    "does not have channel=%s, scanning others",
                    owner_user_id,
                    channel,
                )

        # 2. Scan all cached per-user CMs
        user_cms = getattr(workspace, "_user_channel_managers", {})
        for uid, cm in user_cms.items():
            if cm is None:
                continue
            ch = await cm.get_channel(channel.lower())
            if ch is not None:
                logger.debug(
                    "cron resolve_cm: found channel=%s in per-user CM "
                    "for user_id=%s",
                    channel,
                    uid,
                )
                return cm

        # 3. Fall back to workspace-level CM
        logger.debug(
            "cron resolve_cm: channel=%s not found in any per-user CM, "
            "falling back to workspace CM",
            channel,
        )
        return self._channel_manager

    async def execute(self, job: CronJobSpec) -> Optional[str]:
        """Execute one job once.

        - task_type text: send fixed text to channel
        - task_type agent: ask agent with prompt, send reply to channel
          (stream_query + send_event)

        Returns the output text content, or None if there was no output.
        """
        target_user_id = job.dispatch.target.user_id
        target_session_id = job.dispatch.target.session_id
        dispatch_meta: Dict[str, Any] = dict(job.dispatch.meta or {})
        logger.info(
            "cron execute: job_id=%s channel=%s task_type=%s "
            "target_user_id=%s target_session_id=%s",
            job.id,
            job.dispatch.channel,
            job.task_type,
            target_user_id[:40] if target_user_id else "",
            target_session_id[:40] if target_session_id else "",
        )

        # Resolve the correct ChannelManager for this job's channel.
        # Per-user CMs hold third-party IM channels (WeCom, DingTalk, etc.).
        cm = await self._resolve_channel_manager(
            job.owner_user_id, job.dispatch.channel,
        )

        if job.task_type == "text" and job.text:
            text = job.text.strip()
            logger.info(
                "cron send_text: job_id=%s channel=%s len=%s",
                job.id,
                job.dispatch.channel,
                len(text),
            )
            await cm.send_text(
                channel=job.dispatch.channel,
                user_id=target_user_id,
                session_id=target_session_id,
                text=text,
                meta=dispatch_meta,
            )
            return text

        # agent: run request as the dispatch target user so context matches
        logger.info(
            "cron agent: job_id=%s channel=%s stream_query then send_event",
            job.id,
            job.dispatch.channel,
        )
        assert job.request is not None
        req: Dict[str, Any] = job.request.model_dump(mode="json")
        # req["user_id"] already holds the correct platform sender_id
        # (dispatch.target.user_id).  Do NOT overwrite it with
        # job.owner_user_id — they differ for third-party IM channels
        # (WeCom, DingTalk, …) where the platform user id is not the JWT
        # user id.
        req["owner_user_id"] = job.owner_user_id or ""
        req["session_id"] = target_session_id or f"cron:{job.id}"
        req["channel"] = job.dispatch.channel

        output_parts: list[str] = []

        async def _run() -> None:
            async for event in self._runner.stream_query(req):
                await cm.send_event(
                    channel=job.dispatch.channel,
                    user_id=target_user_id,
                    session_id=target_session_id,
                    event=event,
                    meta=dispatch_meta,
                )
                # Extract text from the stream event for output recording.
                # event may be a Msg object, a (Msg, bool) tuple, or a dict.
                msg = event
                if isinstance(event, tuple):
                    msg = event[0]
                if hasattr(msg, "get_text_content"):
                    text = msg.get_text_content()
                elif isinstance(msg, dict):
                    text = msg.get("content") or msg.get("text") or ""
                else:
                    text = ""
                if text:
                    output_parts.append(str(text))

        try:
            await asyncio.wait_for(
                _run(),
                timeout=job.runtime.timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "cron execute: job_id=%s timed out after %ss",
                job.id,
                job.runtime.timeout_seconds,
            )
            raise
        except asyncio.CancelledError:
            logger.info("cron execute: job_id=%s cancelled", job.id)
            raise

        return "\n".join(output_parts) if output_parts else None
