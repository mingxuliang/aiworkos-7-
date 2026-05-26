import { useTranslation } from "react-i18next";
import React, { type KeyboardEvent } from "react";
import { cbcCardStripeClass } from "@/utils/cbcCardTheme";
import { ChannelIcon } from "./ChannelIcon";
import { getChannelLabel, type ChannelKey } from "./constants";
import styles from "../index.module.less";

interface ChannelCardProps {
  channelKey: ChannelKey;
  config: Record<string, unknown>;
  onClick: () => void;
  /** Rotates accent：蓝 / 绿交替 */
  visualVariant?: number;
}

export const ChannelCard = React.memo(function ChannelCard({
  channelKey,
  config,
  onClick,
  visualVariant = 0,
}: ChannelCardProps) {
  const { t } = useTranslation();
  const enabled = Boolean(config.enabled);
  const isBuiltin = Boolean(config.isBuiltin);
  const label = getChannelLabel(channelKey, t);
  const getConfigString = (key: string) =>
    typeof config[key] === "string" ? config[key] : "";
  const botPrefix = getConfigString("bot_prefix");

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
      className={`cbc-card ${cbcCardStripeClass(visualVariant)}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={label}
    >
      <div className="cbc-glow-layer" aria-hidden />
      {enabled ? (
        <>
          <div className="cbc-enabled-ring" aria-hidden />
          <div className="cbc-spectrum" aria-hidden>
            <span />
          </div>
        </>
      ) : null}
      <div className="cbc-card-inner">
        <div className={styles.cardTopSection}>
          <div
            className={`cbc-icon3d cbc-icon3d--plain ${styles.channelCube}`}
          >
            <ChannelIcon channelKey={channelKey} size={26} />
          </div>
          <div className="cbc-status-pill">
            <span
              className={`cbc-status-dot${enabled ? "" : " cbc-status-dot--off"}`}
            />
            <span
              className={
                enabled
                  ? "cbc-status-text-on"
                  : "cbc-status-text-off"
              }
            >
              {enabled ? t("common.enabled") : t("common.disabled")}
            </span>
          </div>
        </div>

        <div className={styles.cardMiddleSection}>
          <h3 className={`card-title ${styles.cardTitle}`}>{label}</h3>
          <span className="cbc-tag">
            {isBuiltin ? t("channels.builtin") : t("channels.custom")}
          </span>
        </div>

        <div className={styles.cardBottomSection}>
          <div className={`cbc-meta ${styles.cardDescription}`}>
            {t("channels.botPrefix")}: {botPrefix || t("channels.notSet")}
          </div>
        </div>
      </div>
    </div>
  );
});
