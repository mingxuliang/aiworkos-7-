import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import styles from "./index.module.less";

export type RunMode = "ask" | "plan";

interface RunModeSelectorProps {
  mode: RunMode;
  onChange: (mode: RunMode) => void;
  disabled?: boolean;
}

export default function RunModeSelector({
  mode,
  onChange,
  disabled = false,
}: RunModeSelectorProps) {
  const { t } = useTranslation();

  const items: MenuProps["items"] = [
    {
      key: "ask",
      label: (
        <div className={styles.menuItem}>
          <span className={styles.menuIcon}>
            <i className="ri-chat-1-line" />
          </span>
          <div className={styles.menuText}>
            <span className={styles.menuLabel}>
              {t("chat.runMode.ask", "Ask 模式")}
            </span>
            <span className={styles.menuDesc}>
              {t("chat.runMode.askDesc", "直接对话，获取回答")}
            </span>
          </div>
          {mode === "ask" && (
            <i className={`ri-check-line ${styles.checkIcon}`} />
          )}
        </div>
      ),
    },
    {
      key: "plan",
      label: (
        <div className={styles.menuItem}>
          <span className={styles.menuIcon}>
            <i className="ri-mind-map" />
          </span>
          <div className={styles.menuText}>
            <span className={styles.menuLabel}>
              {t("chat.runMode.plan", "Plan 模式")}
            </span>
            <span className={styles.menuDesc}>
              {t("chat.runMode.planDesc", "智能规划，拆解任务步骤")}
            </span>
          </div>
          {mode === "plan" && (
            <i className={`ri-check-line ${styles.checkIcon}`} />
          )}
        </div>
      ),
    },
  ];

  const isPlan = mode === "plan";

  return (
    <Dropdown
      trigger={["click"]}
      disabled={disabled}
      menu={{
        items,
        onClick: ({ key }) => onChange(key as RunMode),
      }}
      placement="topLeft"
    >
      <button
        type="button"
        className={`${styles.trigger} ${isPlan ? styles.planActive : ""}`}
        disabled={disabled}
        aria-label={t("chat.runMode.selectLabel", "选择运行模式")}
      >
        <span className={styles.modeIcon}>
          <i className={isPlan ? "ri-mind-map" : "ri-chat-1-line"} />
        </span>
        <span className={styles.label}>
          {isPlan
            ? t("chat.runMode.plan", "Plan 模式")
            : t("chat.runMode.ask", "Ask 模式")}
        </span>
        <span className={styles.arrow}>
          <i className="ri-arrow-down-s-line" />
        </span>
      </button>
    </Dropdown>
  );
}
