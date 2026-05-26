import { SparkComputerLine, SparkLocalFileLine } from "@agentscope-ai/icons";
import { IconButton } from "@agentscope-ai/design";
import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { ExecutionEnvironmentMode } from "../../../../hooks/useExecutionEnvironment";
import styles from "./index.module.less";

interface ExecutionEnvironmentSelectorProps {
  mode: ExecutionEnvironmentMode;
  onChange: (mode: ExecutionEnvironmentMode) => void;
  disabled?: boolean;
}

export default function ExecutionEnvironmentSelector({
  mode,
  onChange,
  disabled = false,
}: ExecutionEnvironmentSelectorProps) {
  const { t } = useTranslation();
  const isSandbox = mode === "sandbox";

  const items: MenuProps["items"] = [
    {
      key: "sandbox",
      label: t("chat.executionEnvironment.sandbox"),
    },
    {
      key: "local",
      label: t("chat.executionEnvironment.local"),
    },
  ];

  const tooltipTitle = isSandbox
    ? t("chat.executionEnvironment.tooltipSandbox")
    : t("chat.executionEnvironment.tooltipLocal");

  return (
    <Dropdown
      trigger={["click"]}
      disabled={disabled}
      menu={{
        items,
        selectedKeys: [mode],
        onClick: ({ key }) => onChange(key as ExecutionEnvironmentMode),
      }}
    >
      <span className={styles.triggerWrap}>
        <Tooltip title={tooltipTitle} mouseEnterDelay={0.5}>
          <IconButton
            bordered={false}
            disabled={disabled}
            aria-label={t("chat.executionEnvironment.selectLabel")}
            icon={
              isSandbox ? (
                <SparkComputerLine />
              ) : (
                <SparkLocalFileLine />
              )
            }
          />
        </Tooltip>
      </span>
    </Dropdown>
  );
}
