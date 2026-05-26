import { useMemo, useState } from "react";
import {
  Switch,
  Empty,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
} from "@agentscope-ai/design";
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useTools } from "./useTools";
import { useTranslation } from "react-i18next";
import type { ToolInfo } from "../../../api/modules/tools";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { cbcCardStripeClass } from "@/utils/cbcCardTheme";
import styles from "./index.module.less";

/** Stable background colours for the initial-letter fallback icon. */
const ICON_PALETTE = [
  "#f56a00",
  "#7265e6",
  "#ffbf00",
  "#00a2ae",
  "#87d068",
  "#1890ff",
  "#eb2f96",
  "#722ed1",
];

function hashStringToIndex(value: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

/** Renders the emoji icon or a coloured initial-letter badge as fallback. */
function ToolIcon({ icon, name }: { icon: string; name: string }) {
  if (icon) {
    return <span>{icon}</span>;
  }
  const letter = name.charAt(0).toUpperCase();
  const backgroundColor =
    ICON_PALETTE[hashStringToIndex(name, ICON_PALETTE.length)];
  return (
    <span className={styles.toolIconFallback} style={{ backgroundColor }}>
      {letter}
    </span>
  );
}

/** Configuration modal for tools that require configuration */
function ToolConfigModal({
  tool,
  visible,
  onClose,
  onSave,
}: {
  tool: ToolInfo;
  visible: boolean;
  onClose: () => void;
  onSave: (values: Record<string, any>) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await onSave(values);
      onClose();
    } catch (error) {
      console.error("Failed to save config:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${t("tools.configure")} - ${tool.name}`}
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText={t("common.save")}
      cancelText={t("common.cancel")}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={tool.config_values || {}}
      >
        {tool.config_fields?.map((field) => {
          const renderInput = () => {
            switch (field.type) {
              case "password":
                return (
                  <Input.Password
                    placeholder={field.placeholder}
                    autoComplete="off"
                  />
                );

              case "number":
                return (
                  <InputNumber
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    style={{ width: "100%" }}
                  />
                );

              case "boolean":
                return <Switch />;

              case "select":
                return (
                  <Select placeholder={field.placeholder}>
                    {field.options?.map((option) => (
                      <Select.Option key={option} value={option}>
                        {option}
                      </Select.Option>
                    ))}
                  </Select>
                );

              case "textarea":
                return (
                  <Input.TextArea
                    placeholder={field.placeholder}
                    rows={4}
                    autoSize={{ minRows: 2, maxRows: 8 }}
                  />
                );

              case "text":
              default:
                return <Input placeholder={field.placeholder} />;
            }
          };

          return (
            <Form.Item
              key={field.name}
              name={field.name}
              label={field.label}
              rules={[
                {
                  required: field.required,
                  message: `${field.label} is required`,
                },
              ]}
              help={field.help}
              valuePropName={field.type === "boolean" ? "checked" : "value"}
            >
              {renderInput()}
            </Form.Item>
          );
        })}
      </Form>
    </Modal>
  );
}

export default function ToolsPage() {
  const { t } = useTranslation();
  const {
    tools,
    loading,
    batchLoading,
    toggleEnabled,
    toggleAsyncExecution,
    enableAll,
    disableAll,
    loadTools,
    saveToolConfig,
  } = useTools();
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [currentTool, setCurrentTool] = useState<ToolInfo | null>(null);

  const handleToggle = (tool: ToolInfo) => {
    toggleEnabled(tool);
  };

  const handleConfigure = (tool: ToolInfo) => {
    setCurrentTool(tool);
    setConfigModalVisible(true);
  };

  const handleSaveConfig = async (values: Record<string, any>) => {
    if (!currentTool) return;
    await saveToolConfig(currentTool.name, values);
    await loadTools();
  };

  const hasDisabledTools = useMemo(
    () => tools.some((tool) => !tool.enabled),
    [tools],
  );
  const hasEnabledTools = useMemo(
    () => tools.some((tool) => tool.enabled),
    [tools],
  );

  return (
    <CopawWorkbenchShell>
      <div className={styles.toolsPage}>
        <PageHeader
          items={[{ title: t("nav.agent") }, { title: t("tools.title") }]}
          subRow={
            <p className="copaw-bench-page-desc">{t("tools.description")}</p>
          }
          extra={
            <div className={styles.headerAction}>
              <Switch
                checked={hasEnabledTools && !hasDisabledTools}
                onChange={() => (hasDisabledTools ? enableAll() : disableAll())}
                disabled={batchLoading || loading}
                checkedChildren={t("tools.enableAll")}
                unCheckedChildren={t("tools.disableAll")}
              />
            </div>
          }
        />
        <div
          className={`${styles.toolsContainer} copaw-bench-main-section copaw-bench-main-section--scroll`}
        >
          {loading ? (
            <div className={styles.loading}>
              <p>{t("common.loading")}</p>
            </div>
          ) : tools.length === 0 ? (
            <Empty description={t("tools.emptyState")} />
          ) : (
            <div className="cbc-agent-grid">
              {tools.map((tool, index) => (
                <div
                  key={tool.name}
                  className={`cbc-card ${cbcCardStripeClass(index)}`}
                >
                  <div className="cbc-glow-layer" aria-hidden />
                  {tool.enabled ? (
                    <>
                      <div className="cbc-enabled-ring" aria-hidden />
                      <div className="cbc-spectrum" aria-hidden>
                        <span />
                      </div>
                    </>
                  ) : null}
                  <div className="cbc-card-inner">
                    <div className={styles.cardTopRow}>
                      <div className={styles.toolIconSlot}>
                        <ToolIcon icon={tool.icon} name={tool.name} />
                      </div>
                      <div className="cbc-status-pill">
                        <span
                          className={`cbc-status-dot${tool.enabled ? "" : " cbc-status-dot--off"}`}
                        />
                        <span
                          className={
                            tool.enabled
                              ? "cbc-status-text-on"
                              : "cbc-status-text-off"
                          }
                        >
                          {tool.enabled
                            ? t("common.enabled")
                            : t("common.disabled")}
                        </span>
                      </div>
                    </div>

                    <h3
                      className="card-title"
                      style={{ margin: "0 0 10px", fontSize: 16 }}
                    >
                      {tool.name}
                    </h3>

                    <div className="cbc-meta">
                      <p className={styles.toolDescription}>
                        {tool.description}
                      </p>
                      {tool.requires_config ? (
                        <div className={styles.configStatus}>
                          {tool.config_values &&
                          Object.keys(tool.config_values).length > 0 ? (
                            <span className={styles.configured}>
                              ✓ {t("tools.configured")}
                            </span>
                          ) : (
                            <span className={styles.notConfigured}>
                              ⚠ {t("tools.requiresConfig")}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="cbc-agent-card-actions">
                      {tool.name === "execute_shell_command" ? (
                        <Button
                          size="small"
                          onClick={() => toggleAsyncExecution(tool)}
                          disabled={!tool.enabled}
                          icon={
                            tool.async_execution ? (
                              <ThunderboltOutlined />
                            ) : (
                              <ClockCircleOutlined />
                            )
                          }
                        >
                          {tool.async_execution
                            ? t("tools.asyncExecutionEnabled")
                            : t("tools.asyncExecutionDisabled")}
                        </Button>
                      ) : null}
                      {tool.requires_config ? (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => handleConfigure(tool)}
                          icon={<SettingOutlined />}
                        >
                          {t("tools.configure")}
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => handleToggle(tool)}
                        icon={
                          tool.enabled ? (
                            <EyeInvisibleOutlined />
                          ) : (
                            <EyeOutlined />
                          )
                        }
                      >
                        {tool.enabled
                          ? t("common.disable")
                          : t("common.enable")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {currentTool ? (
          <ToolConfigModal
            tool={currentTool}
            visible={configModalVisible}
            onClose={() => setConfigModalVisible(false)}
            onSave={handleSaveConfig}
          />
        ) : null}
      </div>
    </CopawWorkbenchShell>
  );
}
