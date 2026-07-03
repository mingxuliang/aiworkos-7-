import type { SyntheticEvent } from "react";
import { Button, Dropdown, Tooltip } from "@agentscope-ai/design";
import { MoreOutlined, CalendarOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import type { TFunction } from "i18next";
import type { CronJobSpecOutput } from "../../../../api/types";
import { cbcCardStripeClass } from "../../../../utils/cbcCardTheme";
import { formatCronHumanSummary } from "./parseCron";

type CronJob = CronJobSpecOutput;

interface CronJobCardProps {
  job: CronJob;
  index: number;
  onEdit: (job: CronJob) => void;
  onToggleEnabled: (job: CronJob) => void;
  onExecuteNow: (job: CronJob) => void;
  onDelete: (jobId: string) => void;
  t: TFunction;
}

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function CronJobCard({
  job,
  index,
  onEdit,
  onToggleEnabled,
  onExecuteNow,
  onDelete,
  t,
}: CronJobCardProps) {
  const themeCls = cbcCardStripeClass(index);
  const cronLine = formatCronHumanSummary(job.schedule?.cron, t);
  const taskLabel =
    job.task_type === "text"
      ? t("cronJobs.taskTypeOptionText")
      : t("cronJobs.taskTypeOptionAgent");
  const textPreview = (job.text || "").trim();
  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: t("cronJobs.edit"),
      disabled: job.enabled,
      onClick: () => onEdit(job),
    },
    {
      key: "delete",
      label: t("cronJobs.delete"),
      disabled: job.enabled,
      danger: true,
      onClick: () => onDelete(job.id),
    },
  ];

  return (
    <div className={`cbc-card ${themeCls}`}>
      <div className="cbc-glow-layer" aria-hidden />
      {job.enabled ? (
        <>
          <div className="cbc-enabled-ring" aria-hidden />
          <div className="cbc-spectrum" aria-hidden>
            <span />
          </div>
        </>
      ) : null}
      <div className="cbc-card-inner">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div
            className="cbc-icon3d"
            style={{ width: 52, height: 52, flexShrink: 0 }}
          >
            <CalendarOutlined style={{ fontSize: 22, color: "#fff" }} />
          </div>
          <div className="cbc-status-pill">
            <span
              className={`cbc-status-dot${job.enabled ? "" : " cbc-status-dot--off"}`}
            />
            <span
              className={
                job.enabled ? "cbc-status-text-on" : "cbc-status-text-off"
              }
            >
              {job.enabled ? t("common.enabled") : t("common.disabled")}
            </span>
          </div>
        </div>

        <Tooltip title={job.name}>
          <h3 className="card-title" style={{ margin: "0 0 10px", fontSize: 16 }}>
            {job.name}
          </h3>
        </Tooltip>

        <div style={{ marginBottom: 10 }} className="cbc-meta">
          <div>
            <span className="cbc-tag">{taskLabel}</span>
          </div>
          <Tooltip title={`${cronLine} · ${job.schedule?.cron || ""}`}>
            <div style={{ marginTop: 8 }}>
              <strong>{t("cronJobs.scheduleCronLabel")}: </strong>
              {cronLine}
            </div>
          </Tooltip>
          <div style={{ marginTop: 6 }}>
            <strong>{t("cronJobs.scheduleTimezone")}: </strong>
            {job.schedule?.timezone || "UTC"}
          </div>
          {job.id ? (
            <div style={{ marginTop: 6, wordBreak: "break-all" }}>
              ID: <code style={{ fontSize: 11 }}>{job.id}</code>
            </div>
          ) : null}
        </div>

        {(textPreview || job.request?.input) ? (
          <div className="cbc-meta">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {job.task_type === "text"
                ? t("cronJobs.text")
                : t("cronJobs.requestInput")}
            </div>
            <div
              style={{
                maxHeight: 72,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {textPreview ||
                (typeof job.request?.input === "object"
                  ? JSON.stringify(job.request.input)
                  : String(job.request?.input ?? ""))}
            </div>
          </div>
        ) : null}

        <div className="cbc-agent-card-actions">
          <Button size="small" onClick={(e) => { stop(e); onToggleEnabled(job); }}>
            {job.enabled ? t("cronJobs.disable") : t("common.enable")}
          </Button>
          <Button size="small" type="primary" onClick={(e) => { stop(e); onExecuteNow(job); }}>
            {t("cronJobs.executeNow")}
          </Button>
          <Dropdown menu={{ items: menuItems }} placement="bottomRight">
            <Button type="text" size="small" icon={<MoreOutlined />} onClick={stop} />
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
