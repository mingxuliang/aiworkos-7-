import React, { type KeyboardEvent, type ReactNode } from "react";
import {
  ApiOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ACPAgentConfig } from "../../../../api/types";
import { cbcCardStripeClass } from "../../../../utils/cbcCardTheme";
import styles from "./ACPCard.module.less";

interface ACPCardIconSpec {
  icon?: ReactNode;
  imageUrl?: string;
}

const BUILTIN_ACP_ICON_MAP: Record<string, ACPCardIconSpec> = {
  opencode: {
    icon: <CodeOutlined />,
  },
  qwen_code: {
    icon: <ToolOutlined />,
  },
  claude_code: {
    icon: <ThunderboltOutlined />,
  },
  codex: {
    icon: <ApiOutlined />,
  },
};

const DEFAULT_ACP_ICON: ACPCardIconSpec = {
  icon: <ApiOutlined />,
};

interface ACPCardProps {
  agentKey: string;
  config: ACPAgentConfig;
  isBuiltin: boolean;
  cardIndex: number;
  onClick: () => void;
}

export const ACPCard = React.memo(function ACPCard({
  agentKey,
  config,
  isBuiltin,
  cardIndex,
  onClick,
}: ACPCardProps) {
  const { t } = useTranslation();
  const argsSummary = config.args?.join(" ") || t("acp.notSet");
  const iconSpec = BUILTIN_ACP_ICON_MAP[agentKey] ?? DEFAULT_ACP_ICON;
  const stripe = cbcCardStripeClass(cardIndex);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`cbc-card ${stripe}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={agentKey}
    >
      <div className="cbc-glow-layer" aria-hidden />
      {config.enabled ? (
        <>
          <div className="cbc-enabled-ring" aria-hidden />
          <div className="cbc-spectrum" aria-hidden>
            <span />
          </div>
        </>
      ) : null}
      <div className="cbc-card-inner">
        <div className={styles.topRow}>
          <div className={styles.iconSlot}>
            {iconSpec.imageUrl ? (
              <img
                src={iconSpec.imageUrl}
                alt={agentKey}
                width={40}
                height={40}
              />
            ) : (
              iconSpec.icon
            )}
          </div>
          <div className="cbc-status-pill">
            <span
              className={`cbc-status-dot${config.enabled ? "" : " cbc-status-dot--off"}`}
            />
            <span
              className={
                config.enabled ? "cbc-status-text-on" : "cbc-status-text-off"
              }
            >
              {config.enabled ? t("common.enabled") : t("common.disabled")}
            </span>
          </div>
        </div>

        <div className={styles.middle}>
          <h3 className={`card-title ${styles.cardTitle}`}>{agentKey}</h3>
          <span className="cbc-tag">
            {isBuiltin ? t("acp.builtin") : t("acp.custom")}
          </span>
        </div>

        <div className={`cbc-meta ${styles.bottom}`}>
          <p className={styles.bottomLine}>
            {t("acp.command")}: {config.command || t("acp.notSet")}
          </p>
          <p className={styles.bottomLine}>
            {t("acp.args")}: {argsSummary}
          </p>
        </div>
      </div>
    </div>
  );
});
