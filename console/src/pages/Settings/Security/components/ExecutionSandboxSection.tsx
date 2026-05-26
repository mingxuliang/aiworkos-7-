import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Switch,
  Select,
  Input,
  InputNumber,
  Tag,
  Alert,
  Button,
} from "@agentscope-ai/design";
import { Space } from "antd";
import { ReloadOutlined, ContainerOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import api from "../../../../api";
import type {
  ExecutionSandboxConfig,
  ExecutionSandboxStatus,
} from "../../../../api/modules/security";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import styles from "../index.module.less";

type SandboxBackend = ExecutionSandboxConfig["backend"];
type FallbackBackend = ExecutionSandboxConfig["fallback_backend"];
type DockerNetwork = ExecutionSandboxConfig["docker_network"];

interface ExecutionSandboxSectionProps {
  onSave?: (handlers: {
    save: () => Promise<void>;
    reset: () => void;
    saving: boolean;
  }) => void;
}

const DEFAULT_CONFIG: ExecutionSandboxConfig = {
  enabled: false,
  backend: "local",
  use_user_subdir: true,
  fail_closed: true,
  fallback_backend: "local",
  docker_image: "qwenpaw-sandbox:latest",
  docker_network: "none",
  docker_memory: "512m",
  docker_cpus: "1",
  docker_pids_limit: 64,
  docker_timeout_seconds: 120,
};

export function ExecutionSandboxSection({
  onSave,
}: ExecutionSandboxSectionProps = {}) {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const [config, setConfig] = useState<ExecutionSandboxConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ExecutionSandboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const data = await api.getExecutionSandboxStatus();
      setStatus(data);
    } catch {
      message.error(t("security.executionSandbox.statusLoadFailed"));
    } finally {
      setStatusLoading(false);
    }
  }, [message, t]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getExecutionSandbox();
      setConfig({ ...DEFAULT_CONFIG, ...data });
      await fetchStatus();
    } catch {
      message.error(t("security.executionSandbox.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, message, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateField = <K extends keyof ExecutionSandboxConfig>(
    key: K,
    value: ExecutionSandboxConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleEnabledChange = (checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      enabled: checked,
      backend: checked && prev.backend === "off" ? "local" : prev.backend,
    }));
  };

  const handleSave = useCallback(async () => {
    if (config.enabled && config.backend === "off") {
      message.error(t("security.executionSandbox.invalidBackend"));
      return;
    }
    try {
      setSaving(true);
      const saved = await api.updateExecutionSandbox(config);
      setConfig({ ...DEFAULT_CONFIG, ...saved });
      message.success(t("security.executionSandbox.saveSuccess"));
      await fetchStatus();
    } catch {
      message.error(t("security.executionSandbox.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [config, fetchStatus, message, t]);

  const handleReset = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    onSave?.({ save: handleSave, reset: handleReset, saving });
  }, [handleSave, handleReset, onSave, saving]);

  const envOverrideActive =
    status?.env_enabled != null || status?.env_backend != null;

  const statusTags = (
    <Space wrap>
      <Tag color={status?.effective_enabled ? "green" : "default"}>
        {status?.effective_enabled
          ? t("security.executionSandbox.statusActive")
          : t("security.executionSandbox.statusInactive")}
      </Tag>
      <Tag>
        {t("security.executionSandbox.effectiveBackend")}:{" "}
        {status?.effective_backend ?? "-"}
      </Tag>
      <Tag color={status?.docker_available ? "green" : "red"}>
        Docker:{" "}
        {status?.docker_available
          ? t("security.executionSandbox.dockerAvailable")
          : t("security.executionSandbox.dockerUnavailable")}
      </Tag>
      {config.backend === "docker" && (
        <Tag color={status?.docker_image_present ? "green" : "orange"}>
          {status?.docker_image_present
            ? t("security.executionSandbox.imageReady")
            : t("security.executionSandbox.imageMissing")}
        </Tag>
      )}
    </Space>
  );

  return (
    <div className={styles.sectionExecutionSandboxContainer}>
      <Card loading={loading} className={styles.executionSandboxCard}>
        <div className={styles.executionSandboxHeader}>
          <Space>
            <ContainerOutlined />
            <span className={styles.sectionTitle}>
              {t("security.executionSandbox.title")}
            </span>
          </Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={statusLoading}
            onClick={fetchStatus}
          >
            {t("security.executionSandbox.refreshStatus")}
          </Button>
        </div>

        <p className={styles.tabDescription}>
          {t("security.executionSandbox.description")}
        </p>

        {envOverrideActive && (
          <Alert
            type="warning"
            showIcon
            className={styles.executionSandboxAlert}
            message={t("security.executionSandbox.envOverrideTitle")}
            description={t("security.executionSandbox.envOverrideDescription", {
              enabled: status?.env_enabled ?? "-",
              backend: status?.env_backend ?? "-",
            })}
          />
        )}

        <div className={styles.executionSandboxStatus}>{statusTags}</div>

        <div className={styles.executionSandboxForm}>
          <div className={styles.formRow}>
            <span>{t("security.executionSandbox.enabled")}</span>
            <Switch checked={config.enabled} onChange={handleEnabledChange} />
          </div>

          <div className={styles.formRow}>
            <span>{t("security.executionSandbox.backend")}</span>
            <Select
              style={{ minWidth: 180 }}
              value={config.backend}
              disabled={!config.enabled}
              onChange={(value: SandboxBackend) =>
                updateField("backend", value)
              }
              options={[
                { value: "local", label: t("security.executionSandbox.backendLocal") },
                { value: "docker", label: t("security.executionSandbox.backendDocker") },
              ]}
            />
          </div>

          <div className={styles.formRow}>
            <span>{t("security.executionSandbox.useUserSubdir")}</span>
            <Switch
              checked={config.use_user_subdir}
              onChange={(checked) => updateField("use_user_subdir", checked)}
            />
          </div>

          <div className={styles.formRow}>
            <span>{t("security.executionSandbox.failClosed")}</span>
            <Switch
              checked={config.fail_closed}
              onChange={(checked) => updateField("fail_closed", checked)}
            />
          </div>

          <div className={styles.formRow}>
            <span>{t("security.executionSandbox.fallbackBackend")}</span>
            <Select
              style={{ minWidth: 180 }}
              value={config.fallback_backend}
              onChange={(value: FallbackBackend) =>
                updateField("fallback_backend", value)
              }
              options={[
                { value: "local", label: t("security.executionSandbox.backendLocal") },
                { value: "off", label: t("security.executionSandbox.fallbackOff") },
              ]}
            />
          </div>

          {config.backend === "docker" && (
            <>
              <div className={styles.formRow}>
                <span>{t("security.executionSandbox.dockerImage")}</span>
                <Input
                  style={{ minWidth: 260 }}
                  value={config.docker_image}
                  onChange={(e) => updateField("docker_image", e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <span>{t("security.executionSandbox.dockerNetwork")}</span>
                <Select
                  style={{ minWidth: 180 }}
                  value={config.docker_network}
                  onChange={(value: DockerNetwork) =>
                    updateField("docker_network", value)
                  }
                  options={[
                    { value: "none", label: "none" },
                    { value: "bridge", label: "bridge" },
                  ]}
                />
              </div>

              <div className={styles.formRow}>
                <span>{t("security.executionSandbox.dockerMemory")}</span>
                <Input
                  style={{ width: 120 }}
                  value={config.docker_memory}
                  onChange={(e) => updateField("docker_memory", e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <span>{t("security.executionSandbox.dockerCpus")}</span>
                <Input
                  style={{ width: 120 }}
                  value={config.docker_cpus}
                  onChange={(e) => updateField("docker_cpus", e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <span>{t("security.executionSandbox.dockerPidsLimit")}</span>
                <InputNumber
                  min={1}
                  value={config.docker_pids_limit}
                  onChange={(value) =>
                    updateField("docker_pids_limit", value ?? 64)
                  }
                />
              </div>

              <div className={styles.formRow}>
                <span>{t("security.executionSandbox.dockerTimeout")}</span>
                <InputNumber
                  min={1}
                  value={config.docker_timeout_seconds}
                  onChange={(value) =>
                    updateField("docker_timeout_seconds", value ?? 120)
                  }
                />
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
