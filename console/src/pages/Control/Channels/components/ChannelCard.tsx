import { useTranslation } from "react-i18next";
import React, { useMemo } from "react";
import { Switch, Button, Dropdown } from "@agentscope-ai/design";
import type { MenuProps } from "antd";
import { cbcCardStripeClass } from "@/utils/cbcCardTheme";
import { ChannelIcon } from "./ChannelIcon";
import { getChannelLabel, type ChannelKey } from "./constants";
import styles from "../index.module.less";

/**
 * Per-channel credential keys — only these fields indicate a channel has been
 * configured. Fields with default values (domain, dm_policy, etc.) are excluded
 * so they don't falsely make an unconfigured channel appear as configured.
 */
const CHANNEL_CREDENTIAL_KEYS: Record<string, readonly string[]> = {
  dingtalk: ["client_id", "client_secret"],
  feishu: ["app_id", "app_secret"],
  qq: ["app_id", "client_secret"],
  wecom: ["bot_id", "secret"],
  wechat: ["bot_token"],
  telegram: ["bot_token"],
  discord: ["bot_token"],
  matrix: ["homeserver", "user_id", "access_token"],
  imessage: ["db_path"],
  mqtt: ["host", "port"],
  mattermost: ["url", "bot_token"],
  voice: ["twilio_account_sid", "twilio_auth_token"],
  sip: ["livekit_url", "livekit_api_key", "livekit_api_secret"],
  xiaoyi: ["ak", "sk", "agent_id"],
  onebot: ["ws_host", "ws_port"],
};

/** Generic base keys to exclude for custom / unknown channel types. */
const BASE_KEYS = new Set([
  "enabled",
  "bot_prefix",
  "filter_tool_messages",
  "filter_thinking",
  "isBuiltin",
]);

function hasChannelConfig(
  channelKey: string,
  config: Record<string, unknown>,
): boolean {
  const credKeys = CHANNEL_CREDENTIAL_KEYS[channelKey];
  if (credKeys) {
    return credKeys.some((k) => Boolean(config[k]));
  }
  // Fallback for custom / unknown channels: any non-base field is truthy
  return Object.entries(config).some(
    ([key, value]) => !BASE_KEYS.has(key) && Boolean(value),
  );
}

interface ChannelCardProps {
  channelKey: ChannelKey;
  config: Record<string, unknown>;
  onClick: () => void;
  onToggle: (key: ChannelKey, enabled: boolean) => void;
  onRemove: (key: ChannelKey) => void;
  /** Rotates accent：蓝 / 绿交替 */
  visualVariant?: number;
}

export const ChannelCard = React.memo(function ChannelCard({
  channelKey,
  config,
  onClick,
  onToggle,
  onRemove,
  visualVariant = 0,
}: ChannelCardProps) {
  const { t } = useTranslation();
  const enabled = Boolean(config.enabled);
  const isBuiltin = Boolean(config.isBuiltin);
  const label = getChannelLabel(channelKey, t);
  const hasConfig = useMemo(
    () => hasChannelConfig(channelKey, config),
    [channelKey, config],
  );

  const handleToggle = (checked: boolean, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onToggle(channelKey, checked);
  };

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: t("channels.editConfig"),
      onClick: (e) => {
        e.domEvent.stopPropagation();
        onClick();
      },
    },
    {
      key: "remove",
      label: t("channels.removeConfig"),
      danger: true,
      onClick: (e) => {
        e.domEvent.stopPropagation();
        onRemove(channelKey);
      },
    },
  ];

  return (
    <div
      className={`cbc-card ${cbcCardStripeClass(visualVariant)}`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
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
          {enabled || hasConfig ? (
            <div className={styles.cardTopRight}>
              <Dropdown menu={{ items: menuItems }} placement="bottomRight">
                <Button type="text" size="small">
                  ...
                </Button>
              </Dropdown>
              <span
                className={`${styles.switchWrapper} ${enabled ? styles.switchWrapperOn : ""}`}
              >
                <Switch
                  checked={enabled}
                  onChange={handleToggle}
                  size="small"
                />
              </span>
            </div>
          ) : (
            <Button
              type="primary"
              size="small"
              onClick={handleConfigure}
            >
              {t("common.configure")}
            </Button>
          )}
        </div>

        <div className={styles.cardMiddleSection}>
          <h3 className={`card-title ${styles.cardTitle}`}>{label}</h3>
          <span className="cbc-tag">
            {isBuiltin ? t("channels.builtin") : t("channels.custom")}
          </span>
        </div>

        <div className={styles.cardBottomSection}>
          <div className={`cbc-meta ${styles.cardDescription}`}>
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
      </div>
    </div>
  );
});
