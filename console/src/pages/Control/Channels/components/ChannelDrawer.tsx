import {
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Select,
} from "@agentscope-ai/design";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import { Alert, ConfigProvider, Spin } from "antd";
import { useTranslation } from "react-i18next";
import type { FormInstance } from "antd";
import { useCallback, useEffect, useRef } from "react";
import { getChannelLabel, type ChannelKey } from "./constants";
import { useChannelQrcode } from "./useChannelQrcode";
import styles from "../index.module.less";
import { useTheme } from "../../../../contexts/ThemeContext";

const CHANNELS_WITH_ACCESS_CONTROL: ChannelKey[] = [
  "telegram",
  "dingtalk",
  "discord",
  "feishu",
  "wecom",
  "mattermost",
  "matrix",
  "wechat",
  "imessage",
  "onebot",
];

const BASE_FIELDS = [
  "enabled",
  "bot_prefix",
  "filter_tool_messages",
  "filter_thinking",
  "isBuiltin",
];

interface ChannelDrawerProps {
  open: boolean;
  activeKey: ChannelKey | null;
  activeLabel: string;
  form: FormInstance<Record<string, unknown>>;
  initialValues: Record<string, unknown> | undefined;
  isBuiltin: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}

export function ChannelDrawer({
  open,
  activeKey,
  activeLabel,
  form,
  initialValues,
  isBuiltin,
  onClose,
  onSubmit,
}: ChannelDrawerProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const label = activeKey ? getChannelLabel(activeKey, t) : activeLabel;
  const { message } = useAppMessage();

  // Keep a stable ref to onSubmit for use inside QR onSuccess callbacks
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // WeChat QR code hook
  const wechatQrcode = useChannelQrcode({
    channel: "wechat",
    successStatus: "confirmed",
    successCredentialKey: "bot_token",
    pollInterval: 2000,
    onSuccess: useCallback(
      (credentials: Record<string, string>) => {
        const currentValues = form.getFieldsValue();
        form.setFieldsValue({
          enabled: true,
          bot_token: credentials.bot_token,
        });
        onSubmitRef.current?.({
          ...currentValues,
          enabled: true,
          bot_token: credentials.bot_token,
        });
      },
      [form, message, t],
    ),
    onError: useCallback(
      (type: "fetch" | "expired") => {
        if (type === "expired") {
          message.warning(t("channels.wechatQrcodeExpired"));
        } else {
          message.error(t("channels.wechatQrcodeFailed"));
        }
      },
      [message, t],
    ),
  });

  // DingTalk QR code hook
  const dingtalkQrcode = useChannelQrcode({
    channel: "dingtalk",
    successStatus: "success",
    successCredentialKey: "client_id",
    pollInterval: 5000,
    onSuccess: useCallback(
      (credentials: Record<string, string>) => {
        const currentValues = form.getFieldsValue();
        form.setFieldsValue({
          enabled: true,
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
        });
        onSubmitRef.current?.({
          ...currentValues,
          enabled: true,
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
        });
      },
      [form, message, t],
    ),
    onExpired: useCallback(() => {
      message.warning(t("channels.dingtalkQrcodeExpired"));
    }, [message, t]),
    onError: useCallback(
      (type: "fetch" | "expired") => {
        if (type === "expired") {
          message.warning(t("channels.dingtalkQrcodeExpired"));
        } else {
          message.error(t("channels.dingtalkQrcodeFailed"));
        }
      },
      [message, t],
    ),
  });

  // WeCom QR code hook
  const wecomQrcode = useChannelQrcode({
    channel: "wecom",
    successStatus: "success",
    successCredentialKey: "bot_id",
    pollInterval: 3000,
    onSuccess: useCallback(
      (credentials: Record<string, string>) => {
        const currentValues = form.getFieldsValue();
        form.setFieldsValue({
          enabled: true,
          bot_id: credentials.bot_id,
          secret: credentials.secret,
        });
        onSubmitRef.current?.({
          ...currentValues,
          enabled: true,
          bot_id: credentials.bot_id,
          secret: credentials.secret,
        });
      },
      [form, message, t],
    ),
    onError: useCallback(
      (_type: "fetch" | "expired") => {
        message.error(t("channels.wecomQrcodeFailed"));
      },
      [message, t],
    ),
  });

  // Feishu QR code hook
  const feishuQrcode = useChannelQrcode({
    channel: "feishu",
    successStatus: "success",
    successCredentialKey: "app_id",
    pollInterval: 5000,
    onSuccess: useCallback(
      (credentials: Record<string, string>) => {
        const currentValues = form.getFieldsValue();
        form.setFieldsValue({
          enabled: true,
          app_id: credentials.app_id,
          app_secret: credentials.app_secret,
        });
        onSubmitRef.current?.({
          ...currentValues,
          enabled: true,
          app_id: credentials.app_id,
          app_secret: credentials.app_secret,
        });
      },
      [form, message, t],
    ),
    onExpired: useCallback(() => {
      message.warning(t("channels.feishuQrcodeExpired"));
    }, [message, t]),
    onError: useCallback(
      (type: "fetch" | "expired") => {
        if (type === "expired") {
          message.warning(t("channels.feishuQrcodeExpired"));
        } else {
          message.error(t("channels.feishuQrcodeFailed"));
        }
      },
      [message, t],
    ),
  });

  // QQ QR code hook
  const qqQrcode = useChannelQrcode({
    channel: "qq",
    successStatus: "success",
    successCredentialKey: "app_id",
    pollInterval: 5000,
    onSuccess: useCallback(
      (credentials: Record<string, string>) => {
        const currentValues = form.getFieldsValue();
        form.setFieldsValue({
          enabled: true,
          app_id: credentials.app_id,
          client_secret: credentials.client_secret,
        });
        onSubmitRef.current?.({
          ...currentValues,
          enabled: true,
          app_id: credentials.app_id,
          client_secret: credentials.client_secret,
        });
      },
      [form, message, t],
    ),
    onExpired: useCallback(() => {
      message.warning(t("channels.qqQrcodeExpired"));
    }, [message, t]),
    onError: useCallback(
      (type: "fetch" | "expired") => {
        if (type === "expired") {
          message.warning(t("channels.qqQrcodeExpired"));
        } else {
          message.error(t("channels.qqQrcodeFailed"));
        }
      },
      [message, t],
    ),
  });

  // Stop all QR code polling when drawer closes
  useEffect(() => {
    if (!open) {
      wechatQrcode.reset();
      dingtalkQrcode.reset();
      wecomQrcode.reset();
      feishuQrcode.reset();
      qqQrcode.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Access control fields (shared across multiple channels) ──────────────

  // Non-required access control fields are hidden — backend fills defaults
  const renderAccessControlFields = () => null;

  // ── Builtin channel-specific fields ─────────────────────────────────────

  const renderBuiltinExtraFields = (key: ChannelKey) => {
    switch (key) {
      case "matrix":
        return (
          <>
            <Form.Item
              name="homeserver"
              label="Homeserver URL"
              rules={[{ required: true }]}
            >
              <Input placeholder="https://matrix.org" />
            </Form.Item>
            <Form.Item
              name="user_id"
              label="User ID"
              rules={[{ required: true }]}
            >
              <Input placeholder="@bot:matrix.org" />
            </Form.Item>
            <Form.Item
              name="access_token"
              label="Access Token"
              rules={[{ required: true }]}
            >
              <Input.Password placeholder="syt_..." />
            </Form.Item>
          </>
        );

      case "imessage":
        return (
          <>
            <Form.Item
              name="db_path"
              label="DB Path"
              rules={[{ required: true, message: "Please input DB path" }]}
            >
              <Input placeholder="~/Library/Messages/chat.db" />
            </Form.Item>
            <Form.Item
              name="poll_sec"
              label="Poll Interval (sec)"
              rules={[
                { required: true, message: "Please input poll interval" },
              ]}
            >
              <InputNumber min={0.1} step={0.1} style={{ width: "100%" }} />
            </Form.Item>
          </>
        );

      case "discord":
        return (
          <>
            <Form.Item
              name="bot_token"
              label="Bot Token"
              rules={[{ required: true }]}
            >
              <Input.Password placeholder="Discord bot token" />
            </Form.Item>
          </>
        );

      case "dingtalk":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.dingtalkSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item label={t("channels.dingtalkScanAuth")}>
              <Button
                type="primary"
                block
                loading={dingtalkQrcode.loading}
                onClick={dingtalkQrcode.fetchQrcode}
              >
                {t("channels.dingtalkGetQrcode")}
              </Button>
              {dingtalkQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <Spin />
                </div>
              )}
              {dingtalkQrcode.qrcodeImg && !dingtalkQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <img
                    src={`data:image/png;base64,${dingtalkQrcode.qrcodeImg}`}
                    alt="DingTalk QR Code"
                    style={{ width: 200, height: 200 }}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: isDark
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(0,0,0,0.45)",
                    }}
                  >
                    {t("channels.dingtalkScanHint")}
                  </div>
                </div>
              )}
            </Form.Item>
          </>
        );

      case "feishu":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.feishuSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item label={t("channels.feishuScanAuth")}>
              <Button
                type="primary"
                block
                loading={feishuQrcode.loading}
                onClick={feishuQrcode.fetchQrcode}
              >
                {t("channels.feishuGetQrcode")}
              </Button>
              {feishuQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <Spin />
                </div>
              )}
              {feishuQrcode.qrcodeImg && !feishuQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <img
                    src={`data:image/png;base64,${feishuQrcode.qrcodeImg}`}
                    alt="Feishu QR Code"
                    style={{ width: 200, height: 200 }}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: isDark
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(0,0,0,0.45)",
                    }}
                  >
                    {t("channels.feishuScanHint")}
                  </div>
                </div>
              )}
            </Form.Item>
          </>
        );

      case "qq":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.qqSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item label={t("channels.qqScanAuth")}>
              <Button
                type="primary"
                block
                loading={qqQrcode.loading}
                onClick={qqQrcode.fetchQrcode}
              >
                {t("channels.qqGetQrcode")}
              </Button>
              {qqQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <Spin />
                </div>
              )}
              {qqQrcode.qrcodeImg && !qqQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <img
                    src={`data:image/png;base64,${qqQrcode.qrcodeImg}`}
                    alt="QQ QR Code"
                    style={{ width: 200, height: 200 }}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: isDark
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(0,0,0,0.45)",
                    }}
                  >
                    {t("channels.qqScanHint")}
                  </div>
                </div>
              )}
            </Form.Item>
          </>
        );

      case "telegram":
        return (
          <>
            <Form.Item
              name="bot_token"
              label="Bot Token"
              rules={[{ required: true }]}
            >
              <Input.Password placeholder="Telegram bot token from BotFather" />
            </Form.Item>
          </>
        );

      case "mqtt":
        return (
          <>
            <Form.Item
              name="host"
              label="MQTT Host"
              rules={[{ required: true }]}
            >
              <Input placeholder="127.0.0.1" />
            </Form.Item>
            <Form.Item
              name="port"
              label="MQTT Port"
              rules={[
                { required: true },
                {
                  type: "number",
                  min: 1,
                  max: 65535,
                  message: "Port must be between 1 and 65535",
                },
              ]}
            >
              <InputNumber
                min={1}
                max={65535}
                style={{ width: "100%" }}
                placeholder="1883"
              />
            </Form.Item>
            <Form.Item
              name="transport"
              label="Transport"
              initialValue="tcp"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="tcp">MQTT (tcp)</Select.Option>
                <Select.Option value="websockets">
                  WS (websockets)
                </Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="qos"
              label="QoS"
              initialValue="2"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="0">At Most Once (0)</Select.Option>
                <Select.Option value="1">At Least Once (1)</Select.Option>
                <Select.Option value="2">Exactly Once (2)</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="subscribe_topic"
              label="Subscribe Topic"
              rules={[{ required: true }]}
            >
              <Input placeholder="server/+/up" />
            </Form.Item>
            <Form.Item
              name="publish_topic"
              label="Publish Topic"
              rules={[{ required: true }]}
            >
              <Input placeholder="client/{client_id}/down" />
            </Form.Item>
          </>
        );

      case "mattermost":
        return (
          <>
            <Form.Item
              name="url"
              label="Mattermost URL"
              rules={[{ required: true }]}
            >
              <Input placeholder="https://mattermost.example.com" />
            </Form.Item>
            <Form.Item
              name="bot_token"
              label="Bot Token"
              rules={[{ required: true }]}
            >
              <Input.Password placeholder="Mattermost bot token" />
            </Form.Item>
          </>
        );

      case "voice":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.voiceSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item
              name="twilio_account_sid"
              label={t("channels.twilioAccountSid")}
              rules={[{ required: true }]}
            >
              <Input placeholder="ACxxxxxxxx" />
            </Form.Item>
            <Form.Item
              name="twilio_auth_token"
              label={t("channels.twilioAuthToken")}
              rules={[{ required: true }]}
            >
              <Input.Password />
            </Form.Item>
          </>
        );

      case "sip":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.sipSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.sip_mode !== cur.sip_mode}
            >
              {({ getFieldValue }) => {
                if (getFieldValue("sip_mode") !== "livekit") return null;
                return (
                  <>
                    <Form.Item
                      name="livekit_url"
                      label={t("channels.livekitUrl")}
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="ws://localhost:7880" />
                    </Form.Item>
                    <Form.Item
                      name="livekit_api_key"
                      label={t("channels.livekitApiKey")}
                      rules={[{ required: true }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="livekit_api_secret"
                      label={t("channels.livekitApiSecret")}
                      rules={[{ required: true }]}
                    >
                      <Input.Password />
                    </Form.Item>
                  </>
                );
              }}
            </Form.Item>
          </>
        );

      case "wecom":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.wecomSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item label={t("channels.wecomScanAuth")}>
              <Button
                type="primary"
                block
                loading={wecomQrcode.loading}
                onClick={wecomQrcode.fetchQrcode}
              >
                {t("channels.loginWeCom")}
              </Button>
              {wecomQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <Spin />
                </div>
              )}
              {wecomQrcode.qrcodeImg && !wecomQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <img
                    src={`data:image/png;base64,${wecomQrcode.qrcodeImg}`}
                    alt="WeCom QR Code"
                    style={{ width: 200, height: 200 }}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: isDark
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(0,0,0,0.45)",
                    }}
                  >
                    {t("channels.wecomAuthHint")}
                  </div>
                </div>
              )}
            </Form.Item>
          </>
        );

      case "xiaoyi":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.xiaoyiSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item
              name="ak"
              label="Access Key (AK)"
              rules={[{ required: true, message: "Please input Access Key" }]}
            >
              <Input placeholder="Access Key from Huawei Developer Platform" />
            </Form.Item>
            <Form.Item
              name="sk"
              label="Secret Key (SK)"
              rules={[{ required: true, message: "Please input Secret Key" }]}
            >
              <Input.Password placeholder="Secret Key from Huawei Developer Platform" />
            </Form.Item>
            <Form.Item
              name="agent_id"
              label="Agent ID"
              rules={[{ required: true, message: "Please input Agent ID" }]}
            >
              <Input placeholder="Agent ID from XiaoYi platform" />
            </Form.Item>
          </>
        );

      case "wechat":
        return (
          <>
            <ConfigProvider prefixCls="ant">
              <Alert
                type="info"
                showIcon
                message={t("channels.wechatSetupGuide")}
                style={{ marginBottom: 16 }}
              />
            </ConfigProvider>
            <Form.Item label={t("channels.wechatScanLogin")}>
              <Button
                type="primary"
                block
                loading={wechatQrcode.loading}
                onClick={wechatQrcode.fetchQrcode}
              >
                {t("channels.wechatGetQrcode")}
              </Button>
              {wechatQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <Spin />
                </div>
              )}
              {wechatQrcode.qrcodeImg && !wechatQrcode.loading && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <img
                    src={`data:image/png;base64,${wechatQrcode.qrcodeImg}`}
                    alt="WeChat QR Code"
                    style={{ width: 200, height: 200 }}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: isDark
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(0,0,0,0.45)",
                    }}
                  >
                    {t("channels.wechatScanHint")}
                  </div>
                </div>
              )}
            </Form.Item>
          </>
        );

      case "onebot":
        return (
          <>
            <Form.Item
              name="ws_host"
              label="WebSocket Host"
              rules={[{ required: true }]}
            >
              <Input placeholder="0.0.0.0" />
            </Form.Item>
            <Form.Item
              name="ws_port"
              label="WebSocket Port"
              rules={[
                { required: true },
                {
                  type: "number",
                  min: 1,
                  max: 65535,
                  message: "Port must be between 1 and 65535",
                },
              ]}
            >
              <InputNumber
                min={1}
                max={65535}
                style={{ width: "100%" }}
                placeholder="6199"
              />
            </Form.Item>
          </>
        );

      default:
        return null;
    }
  };

  // ── Custom channel fields (key-value editor) ─────────────────────────────

  const renderCustomExtraFields = (
    values: Record<string, unknown> | undefined,
  ) => {
    if (!values) return null;
    const extraKeys = Object.keys(values).filter(
      (k) => !BASE_FIELDS.includes(k),
    );
    if (extraKeys.length === 0) return null;

    return (
      <>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>Custom Fields</div>
        {extraKeys.map((fieldKey) => {
          const value = values[fieldKey];
          return (
            <Form.Item key={fieldKey} name={fieldKey} label={fieldKey}>
              {typeof value === "boolean" ? (
                <Switch />
              ) : typeof value === "number" ? (
                <InputNumber style={{ width: "100%" }} />
              ) : (
                <Input />
              )}
            </Form.Item>
          );
        })}
      </>
    );
  };

  // ── Drawer title ─────────────────────────────────────────────────────────

  const drawerTitle = (
    <div className={styles.drawerTitle}>
      <span>
        {label
          ? `${label} ${t("channels.settings")}`
          : t("channels.channelSettings")}
      </span>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      width={420}
      title={drawerTitle}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={null}
    >
      {activeKey && (
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={onSubmit}
        >
          {isBuiltin
            ? renderBuiltinExtraFields(activeKey)
            : renderCustomExtraFields(initialValues)}

          {CHANNELS_WITH_ACCESS_CONTROL.includes(activeKey) &&
            renderAccessControlFields()}
        </Form>
      )}
    </Modal>
  );
}
