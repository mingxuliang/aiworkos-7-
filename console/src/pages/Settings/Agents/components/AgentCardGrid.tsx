import type { CSSProperties, SyntheticEvent } from "react";
import { Button, Popconfirm, Space, Spin, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { EyeOff, Eye, GripVertical } from "lucide-react";
import type { AgentSummary } from "@/api/types/agents";
import { getAgentDisplayName } from "@/utils/agentDisplayName";
import { loadAgentPresentation } from "@/utils/agentPresentationStorage";
import { resolveTeamIcon } from "./agentTeamIcons";
import { cbcCardStripeClass } from "@/utils/cbcCardTheme";
import styles from "../index.module.less";

type SortableHandle = Pick<
  ReturnType<typeof useSortable>,
  "listeners" | "attributes"
>;

interface AgentCardGridProps {
  agents: AgentSummary[];
  loading: boolean;
  reordering: boolean;
  onEdit: (agent: AgentSummary) => void;
  onDelete: (agentId: string) => void;
  onToggle: (agentId: string, currentEnabled: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
}

interface SortableAgentCardProps {
  agent: AgentSummary;
  index: number;
  reordering: boolean;
  loading: boolean;
  onEdit: (agent: AgentSummary) => void;
  onDelete: (agentId: string) => void;
  onToggle: (agentId: string, currentEnabled: boolean) => void;
}

function CardDragGrip({
  disabled,
  listeners,
  attributes,
  title,
}: { disabled: boolean; title: string } & SortableHandle) {
  return (
    <button
      type="button"
      className={styles.cardDragGrip}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={title}
      onClick={(e: SyntheticEvent) => e.stopPropagation()}
      {...(disabled ? {} : { ...listeners, ...attributes })}
    >
      <GripVertical size={18} strokeWidth={2} />
    </button>
  );
}

function SortableAgentCard({
  agent,
  index,
  reordering,
  loading,
  onEdit,
  onDelete,
  onToggle,
}: SortableAgentCardProps) {
  const { t } = useTranslation();
  const dragDisabled = reordering || loading;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.82 : undefined,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };

  const themeCls = cbcCardStripeClass(index);
  const name = getAgentDisplayName(agent, t);
  const defaultAgent = agent.id === "default";
  const presentation = loadAgentPresentation(agent.id);
  const teamIconPresentation = resolveTeamIcon(presentation.iconKey);
  const TeamHeroIcon = teamIconPresentation.Icon;

  return (
    <div ref={setNodeRef} style={sortableStyle} className={`cbc-card ${themeCls}`}>
      <div className="cbc-glow-layer" aria-hidden />
      {agent.enabled ? (
        <>
          <div className="cbc-enabled-ring" aria-hidden />
          <div className="cbc-spectrum" aria-hidden>
            <span />
          </div>
        </>
      ) : null}
      <div className="cbc-card-inner">
        <div className={styles.agentCardGripRow}>
          <CardDragGrip
            disabled={dragDisabled}
            listeners={listeners}
            attributes={attributes}
            title={t("agent.dragHandleTooltip")}
          />
        </div>

        <div className={styles.agentCardHero}>
          <div className={`cbc-icon3d ${styles.agentCardIconCube}`}>
            <TeamHeroIcon size={26} strokeWidth={2} color="#fff" />
          </div>
          <div className={styles.agentCardTitles}>
            <div className={`card-title ${styles.agentCardName}`}>{name}</div>
            <span className="cbc-meta" style={{ fontSize: 12 }}>
              ID: <code>{agent.id}</code>
            </span>
          </div>
        </div>

        {presentation.tags.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <Space size={[4, 4]} wrap>
              {presentation.tags.map((tg) => (
                <Tag key={tg}>{tg}</Tag>
              ))}
            </Space>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }} className="cbc-meta">
          {!agent.enabled ? (
            <Tag color="error" style={{ margin: 0 }}>
              {t("agent.disabled")}
            </Tag>
          ) : (
            <span className="cbc-tag">{t("common.enabled")}</span>
          )}
          {defaultAgent ? (
            <span className={`cbc-tag ${styles.agentCardTagSpacer}`}>
              {t("agent.defaultDisplayName")}
            </span>
          ) : null}
        </div>

        <div className={`cbc-meta ${styles.agentCardLines}`}>
          <div
            className={styles.agentCardLine}
            style={{ minHeight: "2.8em" }}
            title={agent.description || undefined}
          >
            {agent.description || "—"}
          </div>
          <div className={styles.agentCardLine}>
            {t("agent.modelColumn")}:{" "}
            {agent.active_model ? (
              <Tooltip title={agent.active_model.model}>
                <span>{agent.active_model.model}</span>
              </Tooltip>
            ) : (
              <span style={{ opacity: 0.5 }}>{t("agent.modelPlaceholder")}</span>
            )}
          </div>
        </div>

        <div className="cbc-agent-card-actions">
          <Space wrap size={[6, 6]}>
            <Button
              type="primary"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(agent)}
              disabled={defaultAgent}
              title={
                defaultAgent ? t("agent.defaultNotEditable") : undefined
              }
            >
              {t("agent.edit")}
            </Button>
            <Popconfirm
              title={
                agent.enabled
                  ? t("agent.disableConfirm")
                  : t("agent.enableConfirm")
              }
              description={
                agent.enabled
                  ? t("agent.disableConfirmDesc")
                  : t("agent.enableConfirmDesc")
              }
              onConfirm={() => onToggle(agent.id, agent.enabled)}
              disabled={defaultAgent}
              okText={t("common.confirm")}
              cancelText={t("common.cancel")}
            >
              <Button
                type="primary"
                size="small"
                icon={agent.enabled ? <EyeOff size={14} /> : <Eye size={14} />}
                disabled={defaultAgent}
                title={
                  defaultAgent ? t("agent.defaultNotDisablable") : undefined
                }
              >
                {agent.enabled ? t("common.disable") : t("common.enable")}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t("agent.deleteConfirm")}
              description={t("agent.deleteConfirmDesc")}
              onConfirm={() => onDelete(agent.id)}
              disabled={defaultAgent}
              okText={t("common.confirm")}
              cancelText={t("common.cancel")}
            >
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={defaultAgent}
                title={defaultAgent ? t("agent.defaultNotDeletable") : undefined}
              >
                {t("common.delete")}
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </div>
    </div>
  );
}

export function AgentCardGrid({
  agents,
  loading,
  reordering,
  onEdit,
  onDelete,
  onToggle,
  onReorder,
}: AgentCardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={agents.map((a) => a.id)}
        strategy={rectSortingStrategy}
      >
        <Spin spinning={loading || reordering}>
          <div className="cbc-agent-grid">
            {agents.map((agent, idx) => (
              <SortableAgentCard
                key={agent.id}
                agent={agent}
                index={idx}
                reordering={reordering}
                loading={loading}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggle={onToggle}
              />
            ))}
          </div>
        </Spin>
      </SortableContext>
    </DndContext>
  );
}
