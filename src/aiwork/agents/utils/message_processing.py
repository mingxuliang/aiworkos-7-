# -*- coding: utf-8 -*-
"""Message processing utilities for agent communication.

This module handles:
- File and media block processing
- Message content manipulation
- Message validation
"""
import asyncio
import logging
import mimetypes
import os
import re
import time
import urllib.parse
from pathlib import Path
from typing import Optional

from agentscope.message import Msg

from ...config import load_config
from .file_handling import download_file_from_base64, download_file_from_url

logger = logging.getLogger(__name__)


async def _process_single_file_block(
    source: dict,
    filename: Optional[str],
) -> Optional[str]:
    """
    Process a single file block and download the file.

    Args:
        source: The source dict containing file information.
        filename: The filename to save.

    Returns:
        The local file path if successful, None otherwise.
    """
    if isinstance(source, dict) and source.get("type") == "base64":
        if "data" in source:
            base64_data = source.get("data", "")
            local_path = await download_file_from_base64(
                base64_data,
                filename,
            )
            logger.debug(
                "Processed base64 file block: %s -> %s",
                filename or "unnamed",
                local_path,
            )
            return local_path

    elif isinstance(source, dict) and source.get("type") == "url":
        url = source.get("url", "")
        if url:
            local_path = await download_file_from_url(
                url,
                filename,
            )
            logger.debug(
                "Processed URL file block: %s -> %s",
                url,
                local_path,
            )
            return local_path

    return None


def _extract_source_and_filename(block: dict, block_type: str):
    """Extract source and filename from a block."""
    if block_type == "file":
        return block.get("source", {}), block.get("filename")

    source = block.get("source", {})
    if not isinstance(source, dict):
        return None, None

    filename = None
    if source.get("type") == "url":
        url = source.get("url", "")
        if url:
            parsed = urllib.parse.urlparse(url)
            filename = os.path.basename(parsed.path) or None

    return source, filename


def _media_type_from_path(path: str) -> str:
    """Infer audio media_type from file path suffix."""
    ext = (os.path.splitext(path)[1] or "").lower()
    return {
        ".amr": "audio/amr",
        ".wav": "audio/wav",
        ".mp3": "audio/mp3",
        ".opus": "audio/opus",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
    }.get(ext, "audio/octet-stream")


# Extensions accepted by the agentscope OpenAIChatFormatter
_FORMATTER_SUPPORTED_AUDIO_EXTS = {".wav", ".mp3"}
_AMR_EXTENSIONS = (".amr", ".amr-wb")
_AMR_FFMPEG_PROBE_PARAMS = ["-analyzeduration", "200M", "-probesize", "200M"]
_WAV_AUDIO_CODEC = "pcm_s16le"


def _convert_audio_to_wav(src_path: str) -> Optional[str]:
    """Convert an audio file to .wav using ffmpeg if the extension is not
    natively supported by the LLM formatter.

    Uses a unique temporary file name to avoid overwriting existing files.

    Returns the path to the converted .wav file, or None if conversion
    failed or was not needed.
    """
    ext = (os.path.splitext(src_path)[1] or "").lower()
    if ext in _FORMATTER_SUPPORTED_AUDIO_EXTS:
        return None  # already supported, no conversion needed

    import subprocess
    import shutil
    import tempfile

    if not shutil.which("ffmpeg"):
        logger.warning(
            "ffmpeg not found; cannot convert %s audio to wav. "
            "Install ffmpeg to enable audio format conversion.",
            ext,
        )
        return None

    # Use a temp file in the same directory to avoid clobbering.
    src_dir = os.path.dirname(src_path) or "."
    fd, dst_path = tempfile.mkstemp(suffix=".wav", dir=src_dir)
    os.close(fd)

    # AMR (AMR-NB/AMR-WB) used by QQ voice messages has non-standard
    # encapsulation; increase analyzeduration and probesize so ffmpeg
    # can correctly detect the codec before decoding.
    amr_extra: list = (
        _AMR_FFMPEG_PROBE_PARAMS if ext in _AMR_EXTENSIONS else []
    )

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                *amr_extra,
                "-i",
                src_path,
                "-acodec",
                _WAV_AUDIO_CODEC,
                "-ar",
                "16000",
                "-ac",
                "1",
                dst_path,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=30,
            check=True,
        )
        logger.debug("Converted audio %s -> %s", src_path, dst_path)
        return dst_path
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        stderr = getattr(e, "stderr", b"") or b""
        logger.warning(
            "Audio conversion failed for %s: %s\nffmpeg stderr: %s",
            src_path,
            e,
            stderr.decode(errors="replace"),
        )
        # Clean up the temp file on failure.
        try:
            os.unlink(dst_path)
        except OSError:
            pass
        return None


def _update_block_with_local_path(
    block: dict,
    block_type: str,
    local_path: str,
) -> dict:
    """Update block with downloaded local path."""
    if block_type == "file":
        block["source"] = local_path
        if not block.get("filename"):
            block["filename"] = os.path.basename(local_path)
    else:
        if block_type == "audio":
            block["source"] = {
                "type": "url",
                "url": Path(local_path).as_uri(),
                "media_type": _media_type_from_path(local_path),
            }
        else:
            block["source"] = {
                "type": "url",
                "url": Path(local_path).as_uri(),
            }
    return block


def _handle_download_failure(block_type: str) -> Optional[dict]:
    """Handle download failure based on block type."""
    if block_type == "file":
        return {
            "type": "text",
            "text": "[Error: Unknown file source type or empty data]",
        }
    logger.debug("Failed to download %s block, keeping original", block_type)
    return None


async def _process_audio_block(
    message_content: list,
    index: int,
    local_path: str,
    block: dict,
) -> bool:
    """Handle an audio block according to the configured audio_mode.

    Modes:
      - ``"auto"`` (default): try transcription; if it succeeds, replace
        the audio block with the transcribed text and suppress file
        metadata.  If transcription fails (no provider, missing deps,
        API error), show a file-uploaded placeholder instead.  Audio is
        never sent directly to the model in this mode.
      - ``"native"``: send the audio block directly to the model
        (convert via ffmpeg if needed).  No transcription is attempted.
        If the file format is unsupported and conversion fails, a text
        placeholder is shown instead.

    Returns:
        True if the audio was fully handled (transcribed or sent natively)
        — the "file downloaded" notification will be suppressed.
        False if transcription failed — the notification is kept so the
        LLM knows the file path.
    """
    from .audio_transcription import transcribe_audio

    audio_mode = load_config().agents.audio_mode

    if audio_mode == "native":
        converted = await asyncio.to_thread(
            _convert_audio_to_wav,
            local_path,
        )
        ext = (os.path.splitext(local_path)[1] or "").lower()
        if converted:
            audio_path = converted
        elif ext in _FORMATTER_SUPPORTED_AUDIO_EXTS:
            # Already a supported format, no conversion needed.
            audio_path = local_path
        else:
            # Unsupported format and conversion failed — show placeholder
            # instead of sending an unsupported audio block to the model.
            message_content[index] = {
                "type": "text",
                "text": (
                    "[Voice message]: (audio conversion failed, "
                    "install ffmpeg to enable native audio)"
                ),
            }
            return True
        block["source"] = {
            "type": "url",
            "url": Path(audio_path).as_uri(),
            "media_type": _media_type_from_path(audio_path),
        }
        return True

    # "auto": attempt transcription.
    text = await transcribe_audio(local_path)
    if text:
        message_content[index] = {
            "type": "text",
            "text": f"[Voice message]: {text}",
        }
        return True

    # Transcription failed — show file-uploaded placeholder.
    message_content[index] = {
        "type": "text",
        "text": "[Voice message]: (audio file received)",
    }
    return False


async def _process_single_block(
    message_content: list,
    index: int,
    block: dict,
) -> Optional[str]:
    """
    Process a single file or media block.

    Returns:
        Optional[str]: The local path if download was successful,
        None otherwise.
    """
    block_type = block.get("type")
    if not isinstance(block_type, str):
        return None

    source, filename = _extract_source_and_filename(block, block_type)
    if source is None:
        return None

    # Normalize: when source is "base64" but data is a local path (e.g.
    # DingTalk voice returns path), treat as url only if under allowed dir.
    if (
        block_type == "audio"
        and isinstance(source, dict)
        and source.get("type") == "base64"
    ):
        data = source.get("data")
        if isinstance(data, str) and os.path.isfile(data):
            block["source"] = {
                "type": "url",
                "url": Path(data).as_uri(),
                "media_type": _media_type_from_path(data),
            }
            source = block["source"]

    try:
        local_path = await _process_single_file_block(source, filename)

        if local_path:
            if block_type == "audio":
                # Audio blocks need transcription or format conversion
                # depending on the configured audio_mode.
                _update_block_with_local_path(block, block_type, local_path)
                handled = await _process_audio_block(
                    message_content,
                    index,
                    local_path,
                    block,
                )
                if handled:
                    # Audio was transcribed or sent natively; suppress the
                    # "file downloaded" notification that would follow.
                    return None
            else:
                message_content[index] = _update_block_with_local_path(
                    block,
                    block_type,
                    local_path,
                )
            logger.debug(
                "Updated %s block with local path: %s",
                block_type,
                local_path,
            )
            return local_path
        else:
            error_block = _handle_download_failure(block_type)
            if error_block:
                message_content[index] = error_block
            return None

    except Exception as e:
        logger.error("Failed to process %s block: %s", block_type, e)
        if block_type == "file":
            message_content[index] = {
                "type": "text",
                "text": f"[Error: Failed to download file - {e}]",
            }
        return None


async def process_file_and_media_blocks_in_message(msg) -> None:
    """
    Process file and media blocks (file, image, audio, video) in messages.
    Downloads to local and updates paths/URLs.

    Args:
        msg: The message object (Msg or list[Msg]) to process.
    """
    messages = (
        [msg] if isinstance(msg, Msg) else msg if isinstance(msg, list) else []
    )

    for message in messages:
        if not isinstance(message, Msg):
            continue

        if not isinstance(message.content, list):
            continue

        downloaded_files = []

        for i, block in enumerate(message.content):
            if not isinstance(block, dict):
                continue

            block_type = block.get("type")
            if block_type not in ["file", "image", "audio", "video"]:
                continue

            local_path = await _process_single_block(message.content, i, block)
            if local_path:
                downloaded_files.append((i, local_path))

        if downloaded_files:
            lang = load_config().agents.language
            for i, local_path in reversed(downloaded_files):
                text = (
                    f"用户上传文件，已经下载到 {local_path}"
                    if lang == "zh"
                    else f"User uploaded a file, downloaded to {local_path}"
                )
                text_block = {"type": "text", "text": text}
                message.content.insert(i + 1, text_block)


# ---------------------------------------------------------------------------
# LLM output URL resolution
# ---------------------------------------------------------------------------

# Pattern to match llm-output download URLs in chat text.
# Handles:
#   /api/llm-outputs/429/download
#   /api/llm-outputs/429/download?token=eyJ...
#   http://localhost:5173/api/llm-outputs/429/download?token=eyJ...
# The full match (group 0) is replaced so no URL fragments remain.
_LLM_OUTPUT_URL_RE = re.compile(
    r"(?:https?://\S*?)?"                 # optional http(s)://host:port prefix
    r"/api/llm-outputs/(\d+)/download"    # core path + capture output_id
    r"(?:\?\S*)?",                        # optional ?query string
)

CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days
CLEANUP_INTERVAL_SECONDS = 3600    # debounce: 1 hour

_last_cleanup_at: float = 0.0


async def _cleanup_expired_cache(cache_dir: Path, ttl: int) -> None:
    """Async delete files in *cache_dir* whose mtime exceeds *ttl* seconds."""
    try:
        if not cache_dir.is_dir():
            return
        now = time.time()
        for f in cache_dir.iterdir():
            if f.is_file() and now - f.stat().st_mtime > ttl:
                await asyncio.to_thread(f.unlink, missing_ok=True)
    except Exception:
        logger.debug("Cache cleanup failed", exc_info=True)


def _schedule_cache_cleanup(cache_dir: Path) -> None:
    """Fire-and-forget cache cleanup with a 1-hour debounce."""
    global _last_cleanup_at
    now = time.time()
    if now - _last_cleanup_at < CLEANUP_INTERVAL_SECONDS:
        return
    _last_cleanup_at = now
    asyncio.create_task(_cleanup_expired_cache(cache_dir, CACHE_TTL_SECONDS))


def _mime_to_block_type(mime_type: str) -> str:
    """Map a MIME type to a content block type."""
    if not mime_type:
        return "file"
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    return "file"


def _build_local_block(
    block_type: str,
    local_path: str,
    filename: str,
    mime_type: str,
) -> dict:
    """Build a content block for a locally-available file.

    Follows the same format as :func:`_update_block_with_local_path`.
    """
    if block_type == "file":
        return {
            "type": "file",
            "source": local_path,
            "filename": filename or os.path.basename(local_path),
        }
    if block_type == "audio":
        return {
            "type": "audio",
            "source": {
                "type": "url",
                "url": Path(local_path).as_uri(),
                "media_type": mime_type or _media_type_from_path(local_path),
            },
        }
    # image / video
    return {
        "type": block_type,
        "source": {
            "type": "url",
            "url": Path(local_path).as_uri(),
        },
    }


async def process_llm_output_urls_in_message(
    msg,
    cache_dir: str,
) -> None:
    """Scan text blocks for ``/api/llm-outputs/{id}/download`` URLs,
    resolve them to local files (cache or MinIO download), and replace
    each URL with a content block the LLM can consume.

    Args:
        msg: A single ``Msg`` or a list of ``Msg`` objects.
        cache_dir: Local directory for cached downloads.
    """
    from ...llm_output import download_to_local
    from ...app.agent_context import get_current_user_id

    messages = (
        [msg] if isinstance(msg, Msg) else msg if isinstance(msg, list) else []
    )

    cache_path = Path(cache_dir)

    # Schedule a lazy cleanup in the background (debounced)
    _schedule_cache_cleanup(cache_path)

    user_id = get_current_user_id()
    if not user_id:
        logger.warning(
            "Cannot resolve LLM output URLs without a current user_id",
        )
        return

    for message in messages:
        if not isinstance(message, Msg):
            continue
        if not isinstance(message.content, list):
            continue

        # Track which output_ids we've already handled in this message
        seen_ids: set[int] = set()
        # Collected blocks to append at the end of the message content.
        # Each entry is (insert_after_position, block_dict).
        appended_blocks: list[tuple[int, dict]] = []

        for i, block in enumerate(message.content):
            if not isinstance(block, dict):
                continue
            if block.get("type") != "text":
                continue

            text: str = block.get("text", "")
            if not text:
                continue

            matches = list(_LLM_OUTPUT_URL_RE.finditer(text))
            if not matches:
                continue

            for match in matches:
                output_id = int(match.group(1))

                if output_id in seen_ids:
                    continue
                seen_ids.add(output_id)

                # --- Resolve file ---
                local_path: Optional[str] = None
                fallback_presigned_url: Optional[str] = None
                fallback_filename: str = f"file_{output_id}"

                permission_denied = False
                try:
                    local_path = await download_to_local(
                        output_id, user_id, str(cache_path),
                    )
                except PermissionError:
                    permission_denied = True
                    local_path = None
                    logger.debug(
                        "Permission denied for output_id=%d user=%s",
                        output_id, user_id,
                    )
                except Exception:
                    logger.debug(
                        "download_to_local failed for output_id=%d",
                        output_id, exc_info=True,
                    )

                if local_path is None and not permission_denied:
                    # Try to generate a presigned URL fallback.
                    try:
                        from ...llm_output.minio_client import (
                            get_llm_output_minio_client,
                        )
                        from ...app.auth_jwt.database import (
                            get_session_factory,
                        )
                        from ...llm_output.models import LlmOutputRecord
                        from sqlalchemy import select

                        factory = get_session_factory()
                        async with factory() as db:
                            q = select(LlmOutputRecord).where(
                                LlmOutputRecord.id == output_id,
                                LlmOutputRecord.user_id == user_id,
                                LlmOutputRecord.is_deleted == False,  # noqa: E712
                            )
                            record = (await db.execute(q)).scalar_one_or_none()

                        if record is not None:
                            fallback_filename = record.original_filename
                            minio = get_llm_output_minio_client()
                            if minio is not None:
                                fallback_presigned_url = (
                                    await minio.presigned_get_url(
                                        record.object_key,
                                    )
                                )
                    except Exception:
                        logger.debug(
                            "Presigned URL fallback failed for output_id=%d",
                            output_id, exc_info=True,
                        )

                # --- Append notice / content block ---
                # Original text is NEVER modified.  File info is delivered
                # via additional blocks so the user's chat history stays
                # intact.
                if local_path is not None:
                    mime_type, _ = mimetypes.guess_type(local_path)
                    block_type = _mime_to_block_type(mime_type or "")
                    filename = os.path.basename(local_path)

                    if block_type == "file":
                        # Formatters skip "file" blocks — embed path in a
                        # text notice so the LLM can use read_file.
                        appended_blocks.append((i, {
                            "type": "text",
                            "text": (
                                f"[文件引用] {filename}"
                                f" 已下载到 {local_path}"
                            ),
                        }))
                    else:
                        # image / video / audio → formatter handles natively
                        content_block = _build_local_block(
                            block_type, local_path, filename, mime_type or "",
                        )
                        appended_blocks.append((i, content_block))
                elif fallback_presigned_url is not None:
                    appended_blocks.append((i, {
                        "type": "text",
                        "text": (
                            f"[文件引用] {fallback_filename}"
                            f" 可通过以下链接获取: {fallback_presigned_url}"
                        ),
                    }))
                elif permission_denied:
                    appended_blocks.append((i, {
                        "type": "text",
                        "text": "[文件引用] 没有文件加载权限",
                    }))
                else:
                    appended_blocks.append((i, {
                        "type": "text",
                        "text": f"[文件引用] 文件不可用: {fallback_filename}",
                    }))

        # Insert appended blocks after their originating text block.
        # Process in reverse so earlier insertions don't shift later indices.
        for pos, new_block in reversed(appended_blocks):
            message.content.insert(pos + 1, new_block)


