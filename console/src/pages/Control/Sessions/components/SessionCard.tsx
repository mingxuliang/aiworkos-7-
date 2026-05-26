import type { SyntheticEvent } from "react";
import { Button, Checkbox, Tooltip, Tag } from "@agentscope-ai/design";
import { MessageOutlined } from "@ant-design/icons";
import type { TFunction } from "i18next";
import { CHANNEL_COLORS } from "../../../../constants/channel";
import { cbcCardStripeClass } from "../../../../utils/cbcCardTheme";
import { formatTime, type Session } from "./constants";

interface SessionCardProps {
  session: Session;
  index: number;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (session: Session) => void;
  onView: (session: Session) => void;
  onDelete: (sessionId: string) => void;
  t: TFunction;
}

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function SessionCard({
  session,
  index,
  selected,
  onSelect,
  onEdit,
  onView,
  onDelete,
  t,
}: SessionCardProps) {
  const themeCls = cbcCardStripeClass(index);
  const channel = session.channel || "";
  const tagColor = CHANNEL_COLORS[channel] || "default";
  const title = (session.name || "").trim() || session.id;

  return (
    <div className={`cbc-card ${themeCls} ${selected ? "cbc-card--selected" : ""}`}>
      <div className="cbc-glow-layer" aria-hidden />
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
            <MessageOutlined style={{ fontSize: 22, color: "#fff" }} />
          </div>
          <Checkbox
            checked={selected}
            onClick={(e) => {
              stop(e);
              onSelect(session.id, !selected);
            }}
            aria-label={t("sessions.selectForBatch")}
          />
        </div>

        <Tooltip title={title}>
          <h3 className="card-title" style={{ margin: "0 0 10px", fontSize: 16 }}>
            {title}
          </h3>
        </Tooltip>

        <div style={{ marginBottom: 10 }}>
          <Tag color={tagColor}>{channel || "—"}</Tag>
        </div>

        <div className="cbc-meta">
          <div>
            <strong>{t("sessions.internalIdLabel")}: </strong>
            <Tooltip title={session.id}>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>{session.id}</code>
            </Tooltip>
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>{t("sessions.channelSessionIdLabel")}: </strong>
            {session.session_id}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>{t("sessions.userIdLabel")}: </strong>
            {session.user_id}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>{t("sessions.createdAtLabel")}: </strong>
            {formatTime(session.created_at)}
          </div>
        </div>

        <div className="cbc-agent-card-actions">
          <Button size="small" type="primary" onClick={(e) => { stop(e); onEdit(session); }}>
            {t("common.edit")}
          </Button>
          <Button size="small" onClick={(e) => { stop(e); onView(session); }}>
            {t("common.view")}
          </Button>
          <Button danger size="small" onClick={(e) => { stop(e); onDelete(session.id); }}>
            {t("common.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
