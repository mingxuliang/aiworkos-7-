import { useMemo, useState } from "react";
import { Form } from "@agentscope-ai/design";
import { useTranslation } from "react-i18next";
import api from "../../../api";
import {
  ChannelCard,
  ChannelDrawer,
  useChannels,
  getChannelLabel,
  type ChannelKey,
} from "./components";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { useAppMessage } from "../../../hooks/useAppMessage";
import styles from "./index.module.less";

type FilterType = "all" | "builtin" | "custom";

function ChannelsPage() {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const { channels, orderedKeys, isBuiltin, loading, updateChannel } =
    useChannels();
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeKey, setActiveKey] = useState<ChannelKey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form] = Form.useForm<any>();

  const cards = useMemo(() => {
    const result: { key: ChannelKey; config: Record<string, unknown> }[] = [];

    orderedKeys.forEach((key) => {
      const config = channels[key] || { enabled: false, bot_prefix: "" };
      const builtin = isBuiltin(key);
      if (filter === "builtin" && !builtin) return;
      if (filter === "custom" && builtin) return;
      result.push({ key, config });
    });

    return result;
  }, [channels, orderedKeys, filter, isBuiltin]);

  const handleCardClick = (key: ChannelKey) => {
    setActiveKey(key);
    setModalOpen(true);
    const channelConfig = channels[key] || { enabled: false };
    form.setFieldsValue({ ...channelConfig });
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setActiveKey(null);
  };

  const handleToggleEnabled = async (key: ChannelKey, enabled: boolean) => {
    const currentConfig = channels[key];
    if (!currentConfig) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      isBuiltin: _isBuiltin,
      filter_tool_messages: _ftm,
      filter_thinking: _ft,
      ...config
    } = currentConfig;
    const updatedConfig = { ...config, enabled };

    // Optimistic update — no flash
    updateChannel(key, { ...currentConfig, enabled });

    try {
      await api.updateChannelConfig(
        key,
        updatedConfig as unknown as Parameters<
          typeof api.updateChannelConfig
        >[1],
      );
    } catch (error) {
      // Rollback on failure
      updateChannel(key, currentConfig);
      console.error("❌ Failed to toggle channel enabled:", error);
      message.error(t("channels.configFailed"));
    }
  };

  const handleRemoveConfig = async (key: ChannelKey) => {
    const currentConfig = channels[key];
    if (!currentConfig) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      isBuiltin: _isBuiltin,
      filter_tool_messages: _ftm,
      filter_thinking: _ft,
      ...savedConfig
    } = currentConfig;

    // Clear all fields
    const emptyConfig: Record<string, unknown> = {};
    for (const k of Object.keys(savedConfig)) {
      const v = savedConfig[k];
      if (typeof v === "boolean") emptyConfig[k] = false;
      else if (typeof v === "number") emptyConfig[k] = 0;
      else emptyConfig[k] = "";
    }
    emptyConfig.enabled = false;

    // Optimistic update — no flash
    const clearedChannel = { ...currentConfig, ...emptyConfig };
    updateChannel(key, clearedChannel);

    try {
      await api.updateChannelConfig(
        key,
        emptyConfig as unknown as Parameters<
          typeof api.updateChannelConfig
        >[1],
      );
      message.success(t("channels.removeConfigSuccess"));
    } catch (error) {
      // Rollback on failure
      updateChannel(key, currentConfig);
      console.error("❌ Failed to remove channel config:", error);
      message.error(t("channels.configFailed"));
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!activeKey) return;

    const currentConfig = channels[activeKey];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      isBuiltin: _isBuiltin,
      filter_tool_messages: _ftm,
      filter_thinking: _ft,
      ...savedConfig
    } = currentConfig || {};
    const updatedChannel: Record<string, unknown> = {
      ...savedConfig,
      ...values,
    };

    // Optimistic update — no flash
    updateChannel(activeKey, { ...currentConfig, ...values });

    try {
      await api.updateChannelConfig(
        activeKey,
        updatedChannel as unknown as Parameters<
          typeof api.updateChannelConfig
        >[1],
      );

      setModalOpen(false);
      message.success(t("channels.configSaved"));
    } catch (error) {
      // Rollback on failure
      if (currentConfig) updateChannel(activeKey, currentConfig);
      console.error("❌ Failed to update channel config:", error);
      message.error(t("channels.configFailed"));
    }
  };

  const activeLabel = activeKey ? getChannelLabel(activeKey, t) : "";

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: "all", label: t("channels.filterAll") },
    { key: "builtin", label: t("channels.builtin") },
    { key: "custom", label: t("channels.custom") },
  ];

  return (
    <CopawWorkbenchShell>
      <div className={styles.channelsPage}>
        <PageHeader
          items={[{ title: t("nav.control") }, { title: t("channels.title") }]}
          center={
            <div className={styles.filterTabs}>
              {FILTER_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`${styles.filterTab} ${
                    filter === key ? styles.filterTabActive : ""
                  }`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <div className={styles.channelsContainer}>
          {loading ? (
            <div className={styles.loading}>
              <span className={styles.loadingText}>{t("channels.loading")}</span>
            </div>
          ) : (
            <div className={styles.channelsGrid}>
              {cards.map(({ key, config }, index) => (
                <ChannelCard
                  key={key}
                  channelKey={key}
                  config={config}
                  visualVariant={index}
                  onClick={() => handleCardClick(key)}
                  onToggle={handleToggleEnabled}
                  onRemove={handleRemoveConfig}
                />
              ))}
            </div>
          )}
        </div>
        <ChannelDrawer
          open={modalOpen}
          activeKey={activeKey}
          activeLabel={activeLabel}
          form={form}
          initialValues={activeKey ? channels[activeKey] : undefined}
          isBuiltin={activeKey ? isBuiltin(activeKey) : true}
          onClose={handleModalClose}
          onSubmit={handleSubmit}
        />
      </div>
    </CopawWorkbenchShell>
  );}

export default ChannelsPage;
