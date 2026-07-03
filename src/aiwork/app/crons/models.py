# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Literal, Optional

from agentscope_runtime.engine.schemas.exception import ConfigurationException
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from ..channels.schema import DEFAULT_CHANNEL

# ---------------------------------------------------------------------------
# APScheduler v3 uses ISO 8601 weekday numbering (0=Mon … 6=Sun) for
# CronTrigger(day_of_week=...), while standard crontab uses 0=Sun … 6=Sat.
# from_crontab() does NOT convert either.  Three-letter English abbreviations
# (mon, tue, …, sun) are unambiguous in both systems, so we normalise the
# 5th cron field to abbreviations at validation time.
# ---------------------------------------------------------------------------

_CRONTAB_NUM_TO_NAME: dict[str, str] = {
    "0": "sun",
    "1": "mon",
    "2": "tue",
    "3": "wed",
    "4": "thu",
    "5": "fri",
    "6": "sat",
    "7": "sun",
}


def _crontab_dow_to_name(field: str) -> str:
    """Convert the day-of-week field from crontab numbers to abbreviations.

    Handles: ``*``, single values, comma-separated lists, and ranges.
    Already-named values (``mon``, ``tue``, …) are passed through unchanged.
    """
    if field == "*":
        return field

    def _convert_token(tok: str) -> str:
        if "/" in tok:
            base, step = tok.rsplit("/", 1)
            return f"{_convert_token(base)}/{step}"
        if "-" in tok:
            parts = tok.split("-", 1)
            return "-".join(_CRONTAB_NUM_TO_NAME.get(p, p) for p in parts)
        return _CRONTAB_NUM_TO_NAME.get(tok, tok)

    return ",".join(_convert_token(t) for t in field.split(","))


class ScheduleSpec(BaseModel):
    type: Literal["cron"] = "cron"
    cron: str = Field(...)
    timezone: str = "UTC"

    @field_validator("cron")
    @classmethod
    def normalize_cron_5_fields(cls, v: str) -> str:
        parts = [p for p in v.split() if p]
        if len(parts) == 5:
            parts[4] = _crontab_dow_to_name(parts[4])
            return " ".join(parts)

        if len(parts) == 4:
            # treat as: hour dom month dow
            hour, dom, month, dow = parts
            return f"0 {hour} {dom} {month} {_crontab_dow_to_name(dow)}"

        if len(parts) == 3:
            # treat as: dom month dow
            dom, month, dow = parts
            return f"0 0 {dom} {month} {_crontab_dow_to_name(dow)}"

        # 6 fields (seconds) or too short: reject
        raise ConfigurationException(
            message=(
                "cron must have 5 fields (or 4/3 fields that can be "
                "normalized); seconds not supported"
            ),
        )


class DispatchTarget(BaseModel):
    user_id: str
    session_id: str


class DispatchSpec(BaseModel):
    type: Literal["channel"] = "channel"
    channel: str = Field(default=DEFAULT_CHANNEL)
    target: DispatchTarget
    mode: Literal["stream", "final"] = Field(default="final")
    meta: Dict[str, Any] = Field(default_factory=dict)


class JobRuntimeSpec(BaseModel):
    max_concurrency: int = Field(default=1, ge=1)
    timeout_seconds: int = Field(default=300, ge=1)
    misfire_grace_seconds: int = Field(default=60, ge=0)


class CronJobRequest(BaseModel):
    """Passthrough payload to runner.stream_query(request=...).

    This is aligned with AgentRequest(extra="allow"). We keep it permissive.
    """

    model_config = ConfigDict(extra="allow")

    input: Optional[Any] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    channel: Optional[str] = None


TaskType = Literal["text", "agent"]


class CronJobSpec(BaseModel):
    id: Optional[str] = None
    name: str
    enabled: bool = True

    schedule: ScheduleSpec
    task_type: TaskType = "agent"
    text: Optional[str] = None
    request: Optional[CronJobRequest] = None
    dispatch: DispatchSpec

    runtime: JobRuntimeSpec = Field(default_factory=JobRuntimeSpec)
    meta: Dict[str, Any] = Field(default_factory=dict)
    owner_user_id: Optional[str] = None

    @model_validator(mode="after")
    def _validate_task_type_fields(self) -> "CronJobSpec":
        if self.task_type == "text":
            if not (self.text and self.text.strip()):
                raise ConfigurationException(
                    message="task_type is text but text is empty",
                )
            self.request = None
        elif self.task_type == "agent":
            if self.request is None:
                raise ConfigurationException(
                    message="task_type is agent but request is missing",
                )
            # 把 request.input 统一转为 AgentRequest 所要求的 list 格式。
            # 前端现在传入纯文本字符串，这里负责包装成:
            # [{"role":"user","content":[{"type":"text","text":"<content>"}]}]
            if self.request.input is not None:
                raw = self.request.input
                # 如果已经是 list，说明旧前端直接发过来的，跳过转换
                if not isinstance(raw, list):
                    input_text = str(raw).strip()
                    if not input_text:
                        raise ConfigurationException(
                            message="agent request input can't be empty",
                        )
                    # --- Prompt injection guard (optional, skip if unavailable) ---
                    try:
                        from ...security.prompt_guard import (
                            PromptGuard,
                            PromptInjectionError,
                        )
                        try:
                            PromptGuard.scan_or_raise(input_text)
                        except PromptInjectionError as e:
                            raise ConfigurationException(
                                config_key="request.input",
                                message=(
                                    "Prompt injection detected in cron job "
                                    f"input: {e}"
                                ),
                            ) from e
                    except ImportError:
                        pass
                    # --- End guard ---
                    self.request.input = [
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": input_text}],
                        }
                    ]
            else:
                raise ConfigurationException(
                    message="agent request input can't be empty",
                )
            # Keep request fields in sync with dispatch target and channel            
            target = self.dispatch.target
            self.request = self.request.model_copy(
                update={
                    "user_id": target.user_id,
                    "session_id": target.session_id,
                    "channel": self.dispatch.channel,
                },
            )
        return self


class JobsFile(BaseModel):
    version: int = 1
    jobs: list[CronJobSpec] = Field(default_factory=list)


class CronJobState(BaseModel):
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_status: Optional[
        Literal["success", "error", "running", "skipped", "cancelled"]
    ] = None
    last_error: Optional[str] = None


class CronJobView(BaseModel):
    spec: CronJobSpec
    state: CronJobState = Field(default_factory=CronJobState)


# ---------------------------------------------------------------------------
# Execution record models — persisted execution history for cron jobs
# ---------------------------------------------------------------------------


class ExecutionStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class TriggerType(str, Enum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"


class ExecutionRecord(BaseModel):
    """Execution record metadata.

    Output content is stored in a separate file referenced by *output_file*,
    keeping the registry JSON lightweight.
    """

    id: str  # UUID
    job_id: str  # FK → CronJobSpec.id
    job_name: str  # denormalised — survives job deletion
    executed_at: datetime
    completed_at: datetime
    status: ExecutionStatus
    error_message: Optional[str] = None
    duration_seconds: Optional[float] = None
    trigger_type: TriggerType
    owner_user_id: Optional[str] = None  # denormalised for per-user filtering
    output_file: Optional[str] = (
        None  # relative path e.g. jobs_execution_outputs/{id}.txt
    )


class ExecutionRecordsFile(BaseModel):
    """Registry file — metadata only, no inline output content."""

    version: int = 1
    records: list[ExecutionRecord] = Field(default_factory=list)


class ExecutionRecordFilter(BaseModel):
    """Query filter for listing execution records."""

    job_id: Optional[str] = None
    status: Optional[ExecutionStatus] = None
    trigger_type: Optional[TriggerType] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
