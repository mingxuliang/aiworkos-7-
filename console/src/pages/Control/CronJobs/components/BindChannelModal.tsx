import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Spin } from "antd";
import { Select, Button } from "@agentscope-ai/design";
import { CheckCircleFilled, ReloadOutlined, WarningFilled } from "@ant-design/icons";
import { useChannelQrcode } from "../../Channels/components/useChannelQrcode";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import api from "../../../../api";

/* ── 每个频道：扫码成功后需要保存的凭证字段映射 ────────────── */
const QRCODE_CHANNELS: {
  value: string;
  label: string;
  successStatus: string;
  successCredentialKey: string;
  pollInterval?: number;
  /** 从 credentials 中提取需要保存到后端的字段 */
  buildConfig: (credentials: Record<string, string>) => Record<string, unknown>;
}[] = [
  {
    value: "wecom",
    label: "企业微信",
    successStatus: "success",
    successCredentialKey: "bot_id",
    pollInterval: 3000,
    buildConfig: (c) => ({ enabled: true, bot_id: c.bot_id, secret: c.secret }),
  },
  {
    value: "wechat",
    label: "微信",
    successStatus: "confirmed",
    successCredentialKey: "bot_token",
    pollInterval: 2000,
    buildConfig: (c) => ({ enabled: true, bot_token: c.bot_token }),
  },
  {
    value: "feishu",
    label: "飞书",
    successStatus: "success",
    successCredentialKey: "app_id",
    pollInterval: 5000,
    buildConfig: (c) => ({ enabled: true, app_id: c.app_id, app_secret: c.app_secret }),
  },
  {
    value: "dingtalk",
    label: "钉钉",
    successStatus: "success",
    successCredentialKey: "client_id",
    pollInterval: 5000,
    buildConfig: (c) => ({ enabled: true, client_id: c.client_id, client_secret: c.client_secret }),
  },
];

interface BindChannelModalProps {
  open: boolean;
  onClose: () => void;
  /** 绑定并保存成功后回调（用于刷新目标列表） */
  onBound: () => void;
}

/* ── 二维码面板（每个频道独立 hook 实例） ─────────────────── */
function QrcodePanel({
  channelValue,
  onSuccess,
}: {
  channelValue: string;
  onSuccess: () => void;
}) {
  const { message } = useAppMessage();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const cfg = QRCODE_CHANNELS.find((c) => c.value === channelValue)!;

  const handleSuccess = useCallback(
    async (credentials: Record<string, string>) => {
      setSaving(true);
      setSaveError("");
      try {
        const config = cfg.buildConfig(credentials);
        await api.updateChannelConfig(channelValue, config as never);
        message.success(`${cfg.label} 绑定成功！频道配置已保存`);
        onSuccess();
      } catch (err) {
        console.error("保存频道配置失败", err);
        setSaveError("保存配置失败，请重试或前往「频道」模块手动配置");
        message.error("保存频道配置失败");
      } finally {
        setSaving(false);
      }
    },
    [channelValue, cfg, message, onSuccess],
  );

  const qrcode = useChannelQrcode({
    channel: cfg.value,
    successStatus: cfg.successStatus,
    successCredentialKey: cfg.successCredentialKey,
    pollInterval: cfg.pollInterval,
    onSuccess: handleSuccess,
    onError: useCallback(
      (type: "fetch" | "expired") => {
        if (type === "expired") message.warning("二维码已过期，请重新获取");
        else message.error("获取二维码失败，请稍后重试");
      },
      [message],
    ),
  });

  // 挂载时自动获取二维码
  useEffect(() => {
    qrcode.fetchQrcode();
    return () => qrcode.stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelValue]);

  if (saving) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center" }}>
        <Spin tip="正在保存频道配置…" />
      </div>
    );
  }

  if (saveError) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <WarningFilled style={{ fontSize: 32, color: "#f59e0b", marginBottom: 10 }} />
        <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 12 }}>{saveError}</div>
        <Button size="small" onClick={() => { setSaveError(""); qrcode.fetchQrcode(); }}>
          重新扫码
        </Button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      {qrcode.loading && (
        <div style={{ padding: "32px 0" }}>
          <Spin tip="正在获取二维码…" />
        </div>
      )}

      {!qrcode.loading && qrcode.qrcodeImg && (
        <>
          <div style={{
            display: "inline-block",
            padding: 12,
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            marginBottom: 12,
          }}>
            <img
              src={`data:image/png;base64,${qrcode.qrcodeImg}`}
              alt="扫码绑定"
              style={{ width: 180, height: 180, display: "block" }}
            />
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
            请使用 <strong style={{ color: "#1e293b" }}>{cfg.label}</strong> 扫描二维码完成绑定
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
            扫码后请等待自动确认…
          </div>
          <button
            type="button"
            onClick={() => qrcode.fetchQrcode()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 6,
              background: "transparent", color: "#6366f1",
              border: "1px solid #c7d2fe", cursor: "pointer",
              fontSize: 12, outline: "none",
            }}
          >
            <ReloadOutlined style={{ fontSize: 11 }} /> 刷新二维码
          </button>
        </>
      )}

      {!qrcode.loading && !qrcode.qrcodeImg && (
        <div style={{ padding: "24px 0" }}>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
            暂未获取到二维码
          </div>
          <Button size="small" onClick={() => qrcode.fetchQrcode()}>重新获取</Button>
        </div>
      )}
    </div>
  );
}

/* ── 主弹窗 ──────────────────────────────────────────────── */
export function BindChannelModal({ open, onClose, onBound }: BindChannelModalProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [bound, setBound] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedChannel("");
      setBound(false);
    }
  }, [open]);

  const handleSuccess = () => {
    setBound(true);
    onBound();
  };

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* 遮罩 */}
      <div
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />

      {/* 弹窗主体 */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative", zIndex: 1,
          background: "#fff", borderRadius: 16,
          width: 420, maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>绑定频道</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              选择频道后扫描二维码，系统自动保存配置
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "#f1f5f9", border: "none",
              cursor: "pointer", fontSize: 14, color: "#64748b",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px 24px" }}>
          {bound ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircleFilled style={{ fontSize: 52, color: "#22c55e", marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                绑定成功！
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
                频道配置已保存，请回到弹窗进行一次对话后刷新聊天列表
              </div>
              <Button
                type="primary"
                onClick={onClose}
                style={{ background: "#6366f1", borderColor: "#6366f1" }}
              >
                关闭
              </Button>
            </div>
          ) : (
            <>
              {/* 频道选择 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                  选择频道
                </div>
                <Select
                  placeholder="请选择要绑定的频道"
                  value={selectedChannel || undefined}
                  onChange={(v) => setSelectedChannel(v as string)}
                  style={{ width: "100%" }}
                  getPopupContainer={() => document.body}
                  dropdownStyle={{ zIndex: 2100 }}
                >
                  {QRCODE_CHANNELS.map((c) => (
                    <Select.Option key={c.value} value={c.value}>
                      {c.label}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* 二维码区域 */}
              {selectedChannel ? (
                <QrcodePanel
                  key={selectedChannel}
                  channelValue={selectedChannel}
                  onSuccess={handleSuccess}
                />
              ) : (
                <div style={{
                  textAlign: "center", padding: "24px 0",
                  color: "#94a3b8", fontSize: 13,
                }}>
                  请先选择频道，然后扫描二维码完成绑定
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
