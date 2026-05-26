import {
  Button,
  Modal,
  Tooltip,
  Input,
  Empty,
  Tag,
} from "@agentscope-ai/design";
import { Spin } from "antd";
import type { MCPClientInfo, MCPToolInfo } from "../../../../api/types";
import { useTranslation } from "react-i18next";
import React, { useState, useCallback, type KeyboardEvent } from "react";
import { useTheme } from "../../../../contexts/ThemeContext";
import { cbcCardStripeClass } from "../../../../utils/cbcCardTheme";
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import api from "../../../../api";
import styles from "../index.module.less";

interface MCPClientUpdate {
  name?: string;
  description?: string;
  command?: string;
  enabled?: boolean;
  transport?: "stdio" | "streamable_http" | "sse";
  url?: string;
  headers?: Record<string, string>;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface MCPClientCardProps {
  client: MCPClientInfo;
  cardIndex: number;
  onToggle: (client: MCPClientInfo, e: React.MouseEvent) => void;
  onDelete: (client: MCPClientInfo, e: React.MouseEvent) => void;
  onUpdate: (key: string, updates: MCPClientUpdate) => Promise<boolean>;
}

export const MCPClientCard = React.memo(function MCPClientCard({
  client,
  cardIndex,
  onToggle,
  onDelete,
  onUpdate,
}: MCPClientCardProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [tools, setTools] = useState<MCPToolInfo[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [editedJson, setEditedJson] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Determine if MCP client is remote or local based on command
  const isRemote =
    client.transport === "streamable_http" || client.transport === "sse";
  const clientType = isRemote ? "Remote" : "Local";

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(client, e);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    setDeleteModalOpen(false);
    onDelete(client, null as unknown as React.MouseEvent);
  };

  const handleCardClick = () => {
    const jsonStr = JSON.stringify(client, null, 2);
    setEditedJson(jsonStr);
    setIsEditing(false);
    setJsonModalOpen(true);
  };

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick();
    }
  };

  const handleSaveJson = async () => {
    try {
      const parsed = JSON.parse(editedJson);
      const { key: _key, ...updates } = parsed;

      // Send all updates directly to backend, let backend handle env masking check
      const success = await onUpdate(client.key, updates);
      if (success) {
        setJsonModalOpen(false);
        setIsEditing(false);
      }
    } catch {
      alert("Invalid JSON format");
    }
  };

  const handleShowTools = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setToolsModalOpen(true);
      setToolsLoading(true);
      setToolsError(null);
      setTools([]);
      try {
        const data = await api.listMCPTools(client.key);
        setTools(data);
      } catch (err: any) {
        const msg = err?.message || "";
        if (msg.includes("connecting") || msg.includes("not ready")) {
          setToolsError(t("mcp.toolsConnecting"));
        } else {
          setToolsError(msg || t("mcp.toolsLoadError"));
        }
      } finally {
        setToolsLoading(false);
      }
    },
    [client.key, t],
  );

  const clientJson = JSON.stringify(client, null, 2);

  const stripe = cbcCardStripeClass(cardIndex);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={`cbc-card ${stripe}`}
        onClick={handleCardClick}
        onKeyDown={onCardKeyDown}
        aria-label={client.name}
      >
        <div className="cbc-glow-layer" aria-hidden />
        {client.enabled ? (
          <>
            <div className="cbc-enabled-ring" aria-hidden />
            <div className="cbc-spectrum" aria-hidden>
              <span />
            </div>
          </>
        ) : null}
        <div className="cbc-card-inner">
          <div className={styles.mcpTopRow}>
            <div className={styles.mcpTitleBlock}>
              <Tooltip title={client.name}>
                <h3
                  className={`card-title ${styles.mcpTitle}`}
                  style={{ margin: 0, fontSize: 16 }}
                >
                  <span className={styles.mcpName}>{client.name}</span>
                  <span
                    className={`${styles.typeBadge} ${
                      isRemote ? styles.remote : styles.local
                    }`}
                  >
                    {clientType}
                  </span>
                </h3>
              </Tooltip>
            </div>
            <div className="cbc-status-pill">
              <span
                className={`cbc-status-dot${client.enabled ? "" : " cbc-status-dot--off"}`}
              />
              <span
                className={
                  client.enabled
                    ? "cbc-status-text-on"
                    : "cbc-status-text-off"
                }
              >
                {client.enabled ? t("common.enabled") : t("common.disabled")}
              </span>
            </div>
          </div>

          <div className="cbc-meta">
            <p className={styles.mcpDescription}>
              {client.description || "-"}
            </p>
          </div>

          <div className="cbc-agent-card-actions">
            <Button
              size="small"
              onClick={handleShowTools}
              icon={<ToolOutlined />}
              disabled={!client.enabled || toolsLoading}
              loading={toolsLoading}
            >
              {t("mcp.tools")}
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleClick(e);
              }}
              icon={
                client.enabled ? <EyeInvisibleOutlined /> : <EyeOutlined />
              }
            >
              {client.enabled ? t("common.disable") : t("common.enable")}
            </Button>
            <Button
              danger
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(e);
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        title={t("common.confirm")}
        open={deleteModalOpen}
        onOk={confirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
        okButtonProps={{ danger: true }}
      >
        <p>{t("mcp.deleteConfirm")}</p>
      </Modal>

      <Modal
        title={`${client.name} - ${t("mcp.tools")}`}
        open={toolsModalOpen}
        onCancel={() => setToolsModalOpen(false)}
        footer={
          <div style={{ textAlign: "right" }}>
            <Button onClick={() => setToolsModalOpen(false)}>
              {t("common.close")}
            </Button>
          </div>
        }
        width={700}
      >
        {toolsLoading ? (
          <div className={styles.toolsLoading}>
            <Spin />
          </div>
        ) : toolsError ? (
          <div className={styles.toolsError}>{toolsError}</div>
        ) : tools.length === 0 ? (
          <Empty description={t("mcp.noTools")} />
        ) : (
          <div className={styles.toolsList}>
            {tools.map((tool) => (
              <div key={tool.name} className={styles.toolItem}>
                <div className={styles.toolHeader}>
                  <Tag color="blue">{tool.name}</Tag>
                </div>
                {tool.description && (
                  <p className={styles.toolDescription}>{tool.description}</p>
                )}
                {tool.input_schema &&
                  Object.keys(tool.input_schema).length > 0 && (
                    <details className={styles.toolSchema}>
                      <summary>{t("mcp.toolSchema")}</summary>
                      <pre className={styles.toolSchemaContent}>
                        {JSON.stringify(tool.input_schema, null, 2)}
                      </pre>
                    </details>
                  )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        title={`${client.name} - Configuration`}
        open={jsonModalOpen}
        onCancel={() => setJsonModalOpen(false)}
        footer={
          <div style={{ textAlign: "right" }}>
            <Button
              onClick={() => setJsonModalOpen(false)}
              style={{ marginRight: 8 }}
            >
              {t("common.cancel")}
            </Button>
            {isEditing ? (
              <Button type="primary" onClick={handleSaveJson}>
                {t("common.save")}
              </Button>
            ) : (
              <Button type="primary" onClick={() => setIsEditing(true)}>
                {t("common.edit")}
              </Button>
            )}
          </div>
        }
        width={700}
      >
        <div className={styles.maskedFieldHint}>{t("mcp.maskedFieldHint")}</div>
        {isEditing ? (
          <Input.TextArea
            value={editedJson}
            onChange={(e) => setEditedJson(e.target.value)}
            autoSize={{ minRows: 15, maxRows: 25 }}
            style={{
              fontFamily: "Monaco, Courier New, monospace",
              fontSize: 13,
            }}
          />
        ) : (
          <pre
            style={{
              backgroundColor: isDark ? "#1f1f1f" : "#f5f5f5",
              color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.88)",
              padding: 16,
              borderRadius: 8,
              maxHeight: 500,
              overflow: "auto",
            }}
          >
            {clientJson}
          </pre>
        )}
      </Modal>
    </>
  );
});
