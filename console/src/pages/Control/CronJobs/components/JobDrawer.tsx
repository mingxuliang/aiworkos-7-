import {
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Checkbox,
} from "@agentscope-ai/design";
import { TimePicker, Spin, Collapse } from "antd";
import {
  MessageOutlined,
  CheckOutlined,
  RightOutlined,
  InfoCircleOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useMemo } from "react";
import type { FormInstance } from "antd";
import { useAgentStore } from "../../../../stores/agentStore";
import { BindChannelModal } from "./BindChannelModal";
import type { CronJobSpecOutput, CronTarget, CronFormValues } from "../../../../api/types";
import { DEFAULT_FORM_VALUES } from "./constants";
import { useTimezoneOptions } from "../../../../hooks/useTimezoneOptions";
import api from "../../../../api";

type CronJob = CronJobSpecOutput;

interface JobDrawerProps {
  open: boolean;
  editingJob: CronJob | null;
  form: FormInstance<CronFormValues>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: CronJob & Record<string, unknown>) => void | Promise<void>;
  onAgentChange?: (agentId: string) => void;
}

const STEPS = ["stepBasic", "stepSchedule", "stepTarget"] as const;

/* ── Small SVG icons for select options (steps 1 & 2) ─────────────────── */
function OptionIcon({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <rect width="18" height="18" rx="5" fill={bg} />
      {children}
    </svg>
  );
}

function SelectOption({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

const TaskTypeIcons = {
  text: (
    <OptionIcon bg="#10b981">
      <path d="M5 5.5h8a1 1 0 011 1v4.5a1 1 0 01-1 1H7.5L4.5 13V6.5a1 1 0 011-1z" fill="white" />
      <circle cx="7" cy="8.5" r="0.7" fill="#10b981" />
      <circle cx="9.5" cy="8.5" r="0.7" fill="#10b981" />
      <circle cx="12" cy="8.5" r="0.7" fill="#10b981" />
    </OptionIcon>
  ),
  agent: (
    <OptionIcon bg="#6366f1">
      <rect x="5.5" y="6" width="7" height="6.5" rx="2" fill="white" />
      <circle cx="7.5" cy="9" r="0.9" fill="#6366f1" />
      <circle cx="10.5" cy="9" r="0.9" fill="#6366f1" />
      <path d="M7 5.5V6M11 5.5V6" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.5 4.5h5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </OptionIcon>
  ),
};

const ScheduleIcons = {
  hourly: (
    <OptionIcon bg="#3b82f6">
      <circle cx="9" cy="9" r="4.5" stroke="white" strokeWidth="1.4" />
      <path d="M9 6.5V9l2 1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </OptionIcon>
  ),
  daily: (
    <OptionIcon bg="#f97316">
      <rect x="4.5" y="5" width="9" height="8.5" rx="1.5" fill="white" />
      <path d="M4.5 7.5h9" stroke="#f97316" strokeWidth="1" />
      <rect x="6.5" y="4" width="1.2" height="2.5" rx="0.6" fill="white" />
      <rect x="10.3" y="4" width="1.2" height="2.5" rx="0.6" fill="white" />
      <rect x="6.5" y="9.5" width="2" height="1.8" rx="0.4" fill="#f97316" opacity="0.7" />
    </OptionIcon>
  ),
  weekly: (
    <OptionIcon bg="#8b5cf6">
      <rect x="4.5" y="5" width="9" height="8.5" rx="1.5" fill="white" />
      <path d="M4.5 7.5h9" stroke="#8b5cf6" strokeWidth="1" />
      <rect x="6.5" y="4" width="1.2" height="2.5" rx="0.6" fill="white" />
      <rect x="10.3" y="4" width="1.2" height="2.5" rx="0.6" fill="white" />
      <circle cx="6.8" cy="9.8" r="0.7" fill="#8b5cf6" />
      <circle cx="9" cy="9.8" r="0.7" fill="#8b5cf6" />
      <circle cx="11.2" cy="9.8" r="0.7" fill="#8b5cf6" />
      <circle cx="6.8" cy="11.8" r="0.7" fill="#8b5cf6" opacity="0.5" />
      <circle cx="9" cy="11.8" r="0.7" fill="#8b5cf6" opacity="0.5" />
    </OptionIcon>
  ),
  custom: (
    <OptionIcon bg="#64748b">
      <circle cx="9" cy="9" r="2.2" stroke="white" strokeWidth="1.3" />
      <path d="M9 4.5V5.8M9 12.2V13.5M4.5 9H5.8M12.2 9H13.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.2 6.2l0.9 0.9M10.9 10.9l0.9 0.9M10.9 6.2l-0.9 0.9M6.2 10.9l0.9-0.9" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
    </OptionIcon>
  ),
  timezone: (
    <OptionIcon bg="#14b8a6">
      <circle cx="9" cy="9" r="4.5" stroke="white" strokeWidth="1.3" />
      <ellipse cx="9" cy="9" rx="2" ry="4.5" stroke="white" strokeWidth="1" />
      <path d="M4.5 9h9M5.5 6.5h7M5.5 11.5h7" stroke="white" strokeWidth="0.9" strokeLinecap="round" />
    </OptionIcon>
  ),
};

const ChannelIcons: Record<string, React.ReactNode> = {
  console: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1e293b"/>
      <path d="M8 11.5l6 4.5-6 4.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 20h8" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  ),
  wecom: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1677ff"/>
      <rect x="5" y="8" width="9" height="11" rx="2" fill="white" opacity="0.85"/>
      <rect x="7.5" y="10.5" width="2.5" height="2.5" fill="#1677ff"/>
      <rect x="7.5" y="14.5" width="2.5" height="2.5" fill="#1677ff"/>
      <rect x="12" y="12" width="7" height="9" rx="2" fill="white"/>
      <circle cx="25" cy="10" r="4" fill="#52c41a"/>
      <path d="M23.2 10l1.3 1.3 2.3-2.3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  wechat: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#07c160"/>
      <ellipse cx="12.5" cy="13" rx="5.5" ry="4.5" fill="white"/>
      <circle cx="10.8" cy="13" r="1.1" fill="#07c160"/>
      <circle cx="14.2" cy="13" r="1.1" fill="#07c160"/>
      <ellipse cx="20.5" cy="17" rx="4.5" ry="3.5" fill="white" opacity="0.92"/>
      <circle cx="19" cy="17" r="0.9" fill="#07c160"/>
      <circle cx="22" cy="17" r="0.9" fill="#07c160"/>
    </svg>
  ),
  weixin: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#07c160"/>
      <ellipse cx="12.5" cy="13" rx="5.5" ry="4.5" fill="white"/>
      <circle cx="10.8" cy="13" r="1.1" fill="#07c160"/>
      <circle cx="14.2" cy="13" r="1.1" fill="#07c160"/>
      <ellipse cx="20.5" cy="17" rx="4.5" ry="3.5" fill="white" opacity="0.92"/>
      <circle cx="19" cy="17" r="0.9" fill="#07c160"/>
      <circle cx="22" cy="17" r="0.9" fill="#07c160"/>
    </svg>
  ),
  feishu: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#00b6ff"/>
      <path d="M16 6l4 7h-4v13l-4-7H16V6z" fill="white"/>
      <path d="M20 13l4 2.5-4 2.5v-5z" fill="white" opacity="0.65"/>
    </svg>
  ),
  dingtalk: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1677ff"/>
      <path d="M16 7c-4.4 0-8 3-8 7 0 2.2.9 4.2 2.3 5.6H9l-1.5 2.5h17L23 19.6C24.4 18.2 25.3 16.2 25.3 14c0-4-3.6-7-8-7H16z" fill="white"/>
      <circle cx="13" cy="14.5" r="1.2" fill="#1677ff"/>
      <circle cx="16" cy="14.5" r="1.2" fill="#1677ff"/>
      <circle cx="19" cy="14.5" r="1.2" fill="#1677ff"/>
    </svg>
  ),
  telegram: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#2AABEE"/>
      <path d="M7 15.5l18-7-5.5 16-4-5 5-5.5-7 4.5-1 4-5.5-7z" fill="white"/>
    </svg>
  ),
  discord: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#5865F2"/>
      <path d="M11 11c-1.8.8-3.3 2.3-4 4.2 0 0 1.8 3.5 9 3.5s9-3.5 9-3.5c-.7-1.9-2.2-3.4-4-4.2L20 13H12l-1-2z" fill="white"/>
      <circle cx="13.5" cy="16" r="1.4" fill="#5865F2"/>
      <circle cx="18.5" cy="16" r="1.4" fill="#5865F2"/>
    </svg>
  ),
  imessage: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#34c759"/>
      <path d="M8 10h16a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0124 21H10.5L7 24V11.5A1.5 1.5 0 018 10z" fill="white"/>
    </svg>
  ),
  qq: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1296db"/>
      <path d="M16 7c-3.9 0-7 3.4-7 8 0 2.3.8 4.3 2.1 5.7H9.5l-1.5 2.3h16L22.5 20.7C23.8 19.3 24.5 17.3 24.5 15c0-4.4-3.1-8-7-8h-.5z" fill="white"/>
    </svg>
  ),
  mqtt: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#6366f1"/>
      <path d="M8 16h4M20 16h4M16 8v4M16 20v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="3" fill="white"/>
      <path d="M10.9 10.9l2.8 2.8M18.3 18.3l2.8 2.8M18.3 10.9l-2.8 2.8M10.9 18.3l2.8-2.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="8" fill="#64748b"/>
    <path d="M10 13h12M10 16h9M10 19h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const CHANNEL_LABELS: Record<string, string> = {
  console: "控制台", wecom: "企业微信", wechat: "微信", weixin: "微信",
  feishu: "飞书", dingtalk: "钉钉", telegram: "Telegram", discord: "Discord",
  imessage: "iMessage", mqtt: "MQTT", qq: "QQ",
};

function channelDisplay(ch: string) {
  const key = ch.toLowerCase();
  return { label: CHANNEL_LABELS[key] ?? ch, icon: ChannelIcons[key] ?? DEFAULT_ICON };
}

/* ── Step indicator (custom) ──────────────────────────────────────────── */
function StepBar({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
      {steps.map((label, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: done ? "#6366f1" : active ? "#6366f1" : "#f1f5f9",
                border: active ? "none" : done ? "none" : "2px solid #e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}>
                {done
                  ? <CheckOutlined style={{ color: "white", fontSize: 12 }} />
                  : <span style={{ fontSize: 12, fontWeight: 700, color: active ? "white" : "#94a3b8" }}>{idx + 1}</span>
                }
              </div>
              <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "#1e293b" : done ? "#6366f1" : "#94a3b8", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? "#6366f1" : "#e2e8f0", margin: "0 8px", marginBottom: 22, transition: "background 0.3s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Section card wrapper ─────────────────────────────────────────────── */
function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #f1f5f9",
      borderRadius: 12,
      padding: "20px 20px 4px",
      marginBottom: 16,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export function JobDrawer({
  open, editingJob, form, saving, onClose, onSubmit, onAgentChange,
}: JobDrawerProps) {
  const { t } = useTranslation();
  const { selectedAgent, agents } = useAgentStore();
  const [jobAgentId, setJobAgentId] = useState<string>(selectedAgent);
  const jobAgentName = agents.find((a) => a.id === jobAgentId)?.name ?? jobAgentId;
  const timezoneOptions = useTimezoneOptions();
  const [targets, setTargets] = useState<CronTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const isEdit = !!editingJob;

  const targetKey = (tgt: CronTarget) =>
    `${tgt.channel}::${tgt.session_id}::${tgt.out_sender_id || tgt.user_id}`;

  const channelGroups = useMemo(() => {
    const map: Record<string, CronTarget[]> = {};
    for (const tgt of targets) {
      const ch = tgt.channel || "console";
      if (!map[ch]) map[ch] = [];
      map[ch].push(tgt);
    }
    return map;
  }, [targets]);

  const availableChannels = Object.keys(channelGroups);

  /** 重新拉取指定 agent 的 targets，并清空已选频道/目标 */
  const fetchTargets = (agentId: string, restoreJob?: typeof editingJob) => {
    setTargetsLoading(true);
    setSelectedTargetKey(null);
    setSelectedChannel(null);
    api.listCronTargets(agentId)
      .then((data) => {
        const list = data ?? [];
        setTargets(list);
        if (restoreJob?.dispatch) {
          const { channel, target } = restoreJob.dispatch as { channel: string; target: { user_id: string; session_id: string } };
          setSelectedChannel(channel);
          const matched = list.find(tgt =>
            tgt.channel === channel &&
            tgt.session_id === target?.session_id &&
            (tgt.out_sender_id === target?.user_id || tgt.user_id === target?.user_id),
          );
          if (matched) setSelectedTargetKey(targetKey(matched));
        }
      })
      .catch(() => setTargets([]))
      .finally(() => setTargetsLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    const initAgent = selectedAgent;
    setJobAgentId(initAgent);
    setCurrentStep(0);
    fetchTargets(initAgent, editingJob ?? undefined);
  }, [open, editingJob]);

  /** 切换执行 agent */
  const handleJobAgentChange = (agentId: string) => {
    setJobAgentId(agentId);
    onAgentChange?.(agentId);
    fetchTargets(agentId);
  };

  const handleTargetSelect = (tgt: CronTarget) => {
    setSelectedTargetKey(targetKey(tgt));
    form.setFieldsValue({ dispatch: { channel: tgt.channel, target: { user_id: tgt.out_sender_id || tgt.user_id, session_id: tgt.session_id } } });
  };

  const handleChannelSelect = (ch: string) => {
    setSelectedChannel(ch);
    setSelectedTargetKey(null);
    form.setFieldsValue({ dispatch: { channel: ch, target: { user_id: "", session_id: "" } } });
    const chTargets = channelGroups[ch] ?? [];
    if (chTargets.length === 1) handleTargetSelect(chTargets[0]);
  };

  const goNext = async () => {
    try {
      const fieldsPerStep: (string | string[])[][] = [
        ["name", "task_type", ["request", "input"], "text"],
        ["cronType", "cronTime", "cronDaysOfWeek", "cronCustom"],
        [["dispatch", "target", "user_id"]],
      ];
      await form.validateFields(fieldsPerStep[currentStep] as never);
      setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
    } catch { /* stay */ }
  };

  const goPrev = () => setCurrentStep(s => Math.max(s - 1, 0));

  const selectedTgt = useMemo(() => targets.find(t => targetKey(t) === selectedTargetKey), [targets, selectedTargetKey]);
  const channelTargets = selectedChannel ? (channelGroups[selectedChannel] ?? []) : [];

  const stepLabels = STEPS.map(k => t(`cronJobs.${k}`));

  return (
    <>
    <Drawer
      rootClassName="copaw-ported-drawer"
      width={580}
      placement="right"
      title={
        <span style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
          {isEdit ? t("cronJobs.editJob") : t("cronJobs.createJob")}
        </span>
      }
      open={open}
      onClose={onClose}
      destroyOnClose
      bodyStyle={{ background: "#f8fafc", padding: "24px 24px 0" }}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {currentStep > 0 && (
              <Button onClick={goPrev} icon={<span style={{ fontSize: 11 }}>←</span>}>
                上一步
              </Button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            {currentStep < STEPS.length - 1 ? (
              <Button type="primary" onClick={goNext}
                style={{ background: "#6366f1", borderColor: "#6366f1" }}>
                下一步 <RightOutlined style={{ fontSize: 11 }} />
              </Button>
            ) : (
              <Button
                type="primary"
                loading={saving}
                disabled={availableChannels.length === 0 || !selectedTargetKey}
                title={
                  availableChannels.length === 0
                    ? "请先绑定频道并进行一次对话"
                    : !selectedTargetKey
                    ? "请选择发送目标"
                    : undefined
                }
                onClick={() => form.submit()}
                style={{
                  background: (availableChannels.length === 0 || !selectedTargetKey) ? undefined : "#6366f1",
                  borderColor: (availableChannels.length === 0 || !selectedTargetKey) ? undefined : "#6366f1",
                }}
              >
                {t("common.save")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <StepBar current={currentStep} steps={stepLabels} />

      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => onSubmit({ ...values, _jobAgentId: jobAgentId } as unknown as CronJob & Record<string, unknown>)}
        initialValues={DEFAULT_FORM_VALUES}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
      >
        {/* Hidden fields */}
        <Form.Item name={["schedule", "type"]} hidden initialValue="cron"><Input /></Form.Item>
        <Form.Item name={["schedule", "cron"]} hidden><Input /></Form.Item>
        <Form.Item name={["dispatch", "type"]} hidden initialValue="channel"><Input /></Form.Item>
        <Form.Item name={["dispatch", "channel"]} hidden><Input /></Form.Item>
        <Form.Item name={["dispatch", "target", "session_id"]} hidden><Input /></Form.Item>

        {/* ── Step 1: Basic ─────────────────────────────── */}
        <div style={{ display: currentStep === 0 ? "block" : "none" }}>
          {/* Agent 选择器 */}
          <SectionCard>
            <Form.Item label={<Label required>{t("cronJobs.executedByAgent")}</Label>} required rules={[{ required: true, message: "请选择执行 Agent" }]}>
              <Select
                value={jobAgentId}
                onChange={handleJobAgentChange}
                style={inputStyle}
                disabled={isEdit}
                options={agents.length > 0 ? agents.map(a => ({
                  value: a.id,
                  label: a.name,
                })) : [{ value: jobAgentId, label: jobAgentName }]}
              />
            </Form.Item>
          </SectionCard>
          <SectionCard>
            {isEdit && (
              <Form.Item name="id" label={<Label>任务 ID</Label>} tooltip={t("cronJobs.idTooltip")}>
                <Input disabled placeholder={t("cronJobs.jobIdPlaceholder")} style={inputStyle} />
              </Form.Item>
            )}
            <Form.Item name="name" label={<Label required>任务名称</Label>}
              rules={[{ required: true, message: t("cronJobs.pleaseInputName") }]}>
              <Input placeholder={t("cronJobs.jobNamePlaceholder")} style={inputStyle} />
            </Form.Item>
            <Form.Item name="enabled" label={<Label>立即启用</Label>} valuePropName="checked">
              <Switch />
            </Form.Item>
          </SectionCard>

          <SectionCard>
            <Form.Item name="task_type" label={<Label required>任务类型</Label>}
              rules={[{ required: true, message: t("cronJobs.pleaseSelectTaskType") }]}
              tooltip={t("cronJobs.taskTypeTooltip")}>
              <Select style={inputStyle}>
                <Select.Option value="text">
                  <SelectOption icon={TaskTypeIcons.text} label={t("cronJobs.taskTypeOptionText")} />
                </Select.Option>
                <Select.Option value="agent">
                  <SelectOption icon={TaskTypeIcons.agent} label={t("cronJobs.taskTypeOptionAgent")} />
                </Select.Option>
              </Select>
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(p, c) => p.task_type !== c.task_type}>
              {({ getFieldValue }) => {
                const type = getFieldValue("task_type");
                return (
                  <>
                    {type === "text" && (
                      <Form.Item name="text" label={<Label required>发送内容</Label>}
                        rules={[{ required: true, message: t("cronJobs.pleaseInputMessageContent") }]}
                        extra={<Hint>{t("cronJobs.textTooltip")}</Hint>}>
                        <Input.TextArea rows={4} placeholder={t("cronJobs.taskDescriptionPlaceholder")} style={{ ...inputStyle, resize: "none" }} />
                      </Form.Item>
                    )}
                    {type === "agent" && (
                      <Form.Item name={["request", "input"]} label={<Label required>问 AI 什么</Label>}
                        rules={[{ required: true, message: t("cronJobs.pleaseInputRequest") }]}
                        extra={<Hint>{t("cronJobs.requestInputHint")}</Hint>}>
                        <Input.TextArea rows={5} placeholder={t("cronJobs.requestInputPlaceholder")} style={{ ...inputStyle, resize: "none" }} />
                      </Form.Item>
                    )}
                  </>
                );
              }}
            </Form.Item>
          </SectionCard>
        </div>

        {/* ── Step 2: Schedule ──────────────────────────── */}
        <div style={{ display: currentStep === 1 ? "block" : "none" }}>
          <SectionCard>
            <Form.Item label={<Label required>执行频率</Label>} required tooltip={t("cronJobs.cronTooltip")}>
              <Form.Item name="cronType" noStyle>
                <Select style={inputStyle}>
                  <Select.Option value="hourly">
                    <SelectOption icon={ScheduleIcons.hourly} label={t("cronJobs.cronTypeHourly")} />
                  </Select.Option>
                  <Select.Option value="daily">
                    <SelectOption icon={ScheduleIcons.daily} label={t("cronJobs.cronTypeDaily")} />
                  </Select.Option>
                  <Select.Option value="weekly">
                    <SelectOption icon={ScheduleIcons.weekly} label={t("cronJobs.cronTypeWeekly")} />
                  </Select.Option>
                  <Select.Option value="custom">
                    <SelectOption icon={ScheduleIcons.custom} label={t("cronJobs.cronTypeCustom")} />
                  </Select.Option>
                </Select>
              </Form.Item>
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(p, c) => p.cronType !== c.cronType}>
              {({ getFieldValue }) => {
                const ct = getFieldValue("cronType");
                return (
                  <>
                    {(ct === "daily" || ct === "weekly") && (
                      <Form.Item name="cronTime" label={<Label required>几点执行</Label>} rules={[{ required: true }]}>
                        <TimePicker format="HH:mm" minuteStep={15} needConfirm={false} style={{ ...inputStyle, width: "100%" }} />
                      </Form.Item>
                    )}
                    {ct === "weekly" && (
                      <Form.Item name="cronDaysOfWeek" label={<Label required>哪几天</Label>}
                        rules={[{ required: true, message: t("cronJobs.selectWeekdayRequired") }]}>
                        <Checkbox.Group options={[
                          { label: "周一", value: "mon" }, { label: "周二", value: "tue" },
                          { label: "周三", value: "wed" }, { label: "周四", value: "thu" },
                          { label: "周五", value: "fri" }, { label: "周六", value: "sat" },
                          { label: "周日", value: "sun" },
                        ]} />
                      </Form.Item>
                    )}
                    {ct === "custom" && (
                      <Form.Item name="cronCustom" label={<Label required>Cron 表达式</Label>}
                        rules={[{ required: true, message: t("cronJobs.pleaseInputCron") }]}
                        extra={
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                            示例：<code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>0 9 * * *</code> = 每天9点 ·{" "}
                            <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1" }}>在线生成 →</a>
                          </div>
                        }>
                        <Input placeholder="0 9 * * *" style={inputStyle} />
                      </Form.Item>
                    )}
                  </>
                );
              }}
            </Form.Item>
          </SectionCard>

          <Collapse ghost size="small" style={{ marginTop: 4 }} items={[{
            key: "tz",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                {ScheduleIcons.timezone}
                时区设置
              </span>
            ),
            children: (
              <SectionCard style={{ marginBottom: 8 }}>
                <Form.Item name={["schedule", "timezone"]} label={<Label>时区</Label>} tooltip={t("cronJobs.timezoneTooltip")}>
                  <Select showSearch placeholder="选择时区（默认上海）"
                    filterOption={(input, option) => (option?.label?.toString() || "").toLowerCase().includes(input.toLowerCase())}
                    options={timezoneOptions} style={inputStyle} />
                </Form.Item>
              </SectionCard>
            ),
          }]} />
        </div>

        {/* ── Step 3: Target ────────────────────────────── */}
        <div style={{ display: currentStep === 2 ? "block" : "none" }}>
          {targetsLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <Spin size="large" tip="加载频道..." />
            </div>
          ) : (
            <>
              {/* Channel cards */}
              {availableChannels.length === 0 ? (
                <div style={{
                  background: "#fff", borderRadius: 14,
                  border: "1.5px solid #f1f5f9",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  overflow: "hidden",
                }}>
                  {/* 顶部状态图标区 */}
                  <div style={{
                    background: "linear-gradient(135deg, #fef9f0 0%, #fff7ed 100%)",
                    borderBottom: "1px solid #fed7aa",
                    padding: "24px 24px 20px",
                    textAlign: "center",
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%",
                      background: "#fff", border: "2px solid #fed7aa",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 12,
                    }}>
                      <ApiOutlined style={{ fontSize: 24, color: "#f97316" }} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                      当前 Agent 暂无聊天记录
                    </div>
                    <div style={{ fontSize: 12, color: "#f97316", fontWeight: 500 }}>
                      未绑定任何频道，或尚未进行过对话
                    </div>
                  </div>

                  {/* 步骤指引 */}
                  <div style={{ padding: "20px 24px" }}>
                    {[
                      {
                        step: "1",
                        title: "前往「频道」模块绑定接收方式",
                        desc: "在企业微信、微信、飞书等频道完成配置，绑定消息接收账号",
                        action: (
                          <button
                            type="button"
                            onClick={() => setBindModalOpen(true)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "4px 12px", borderRadius: 6,
                              background: "#6366f1", color: "#fff",
                              fontSize: 12, fontWeight: 500,
                              border: "none", cursor: "pointer",
                              flexShrink: 0, outline: "none",
                            }}
                          >
                            去绑定 →
                          </button>
                        ),
                      },
                      {
                        step: "2",
                        title: "与 AI 进行一次对话",
                        desc: "在已绑定的频道中发送任意一条消息，系统会记录该聊天",
                        action: null,
                      },
                      {
                        step: "3",
                        title: "重新打开此弹窗",
                        desc: "系统将自动显示您已创建的频道和聊天记录，选择后即可完成配置",
                        action: (
                          <button
                            type="button"
                            onClick={() => fetchTargets(jobAgentId)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "4px 12px", borderRadius: 6,
                              background: "#f1f5f9", color: "#475569",
                              fontSize: 12, fontWeight: 500,
                              border: "1px solid #e2e8f0", cursor: "pointer",
                              flexShrink: 0, outline: "none",
                            }}
                          >
                            刷新
                          </button>
                        ),
                      },
                    ].map(({ step, title, desc, action }) => (
                      <div key={step} style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        marginBottom: 16,
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                          background: "#6366f1", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, marginTop: 1,
                        }}>{step}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 2 }}>{title}</div>
                          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{desc}</div>
                        </div>
                        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <SectionCard>
                  <div style={{ marginBottom: 16 }}>
                    <Label>推送到哪个平台</Label>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    {availableChannels.map(ch => {
                      const { label, icon } = channelDisplay(ch);
                      const count = (channelGroups[ch] ?? []).length;
                      const isSelected = selectedChannel === ch;
                      return (
                        <div key={ch} onClick={() => handleChannelSelect(ch)} style={{
                          cursor: "pointer",
                          border: isSelected ? "2px solid #6366f1" : "1.5px solid #e8ecf0",
                          borderRadius: 14,
                          padding: "14px 18px",
                          minWidth: 100,
                          background: isSelected ? "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)" : "#fafafa",
                          position: "relative",
                          transition: "all 0.2s",
                          boxShadow: isSelected ? "0 2px 12px rgba(99,102,241,0.18)" : "0 1px 3px rgba(0,0,0,0.04)",
                          userSelect: "none",
                        }}>
                          {isSelected && (
                            <div style={{
                              position: "absolute", top: 7, right: 7,
                              width: 18, height: 18, borderRadius: "50%",
                              background: "#6366f1",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <CheckOutlined style={{ color: "white", fontSize: 10 }} />
                            </div>
                          )}
                          <div style={{ marginBottom: 10 }}>{icon}</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? "#4f46e5" : "#1e293b" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{count} 条记录</div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Chat list (multiple chats in same channel) */}
              {selectedChannel && channelTargets.length > 1 && (
                <SectionCard>
                  <div style={{ marginBottom: 12 }}>
                    <Label>选择聊天</Label>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {channelTargets.map(tgt => {
                      const key = targetKey(tgt);
                      const isSelected = selectedTargetKey === key;
                      return (
                        <div key={key} onClick={() => handleTargetSelect(tgt)} style={{
                          cursor: "pointer",
                          border: isSelected ? "2px solid #6366f1" : "1.5px solid #e8ecf0",
                          borderRadius: 10,
                          padding: "10px 14px",
                          display: "flex", alignItems: "center", gap: 10,
                          background: isSelected ? "#f5f3ff" : "#fff",
                          transition: "all 0.15s",
                        }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: isSelected ? "#6366f1" : "#e2e8f0",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <MessageOutlined style={{ color: isSelected ? "white" : "#94a3b8", fontSize: 15 }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {tgt.name || tgt.session_id}
                            </div>
                            {tgt.chat_type === "gm" && <div style={{ fontSize: 11, color: "#94a3b8" }}>群聊</div>}
                          </div>
                          {isSelected && <CheckOutlined style={{ color: "#6366f1", fontSize: 13, flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Success confirmation */}
              {selectedTgt && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                  border: "1.5px solid #86efac",
                  borderRadius: 12, padding: "12px 16px", marginBottom: 16,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "#22c55e",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <CheckOutlined style={{ color: "white", fontSize: 14 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>已选择发送目标</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                      {selectedTgt.name || selectedTgt.session_id}
                      <span style={{ fontWeight: 400, color: "#16a34a", marginLeft: 6 }}>
                        ({channelDisplay(selectedTgt.channel).label})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 无频道时不提供手动输入，引导用户先绑定频道 */}

              {/* Hidden validation field */}
              {availableChannels.length > 0 && (
                <Form.Item name={["dispatch", "target", "user_id"]} hidden
                  rules={[{ required: true, message: t("cronJobs.pleaseInputUserId") }]}>
                  <Input />
                </Form.Item>
              )}

              {/* Advanced options */}
              <Collapse ghost size="small" style={{ marginTop: 4 }} items={[{
                key: "adv",
                label: (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                    {ScheduleIcons.custom}
                    高级选项
                  </span>
                ),
                children: (
                  <SectionCard style={{ marginBottom: 8 }}>
                    <Form.Item name={["dispatch", "mode"]} label={<Label>发送方式</Label>} tooltip={t("cronJobs.dispatchModeTooltip")}>
                      <Select style={inputStyle}>
                        <Select.Option value="stream">⚡ 边生成边发（实时）</Select.Option>
                        <Select.Option value="final">✅ 生成完再发（推荐）</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name={["runtime", "max_concurrency"]} label={<Label>最大并发数</Label>} tooltip={t("cronJobs.maxConcurrencyTooltip")}>
                      <InputNumber min={1} style={{ ...inputStyle, width: "100%" }} placeholder="1" />
                    </Form.Item>
                    <Form.Item name={["runtime", "timeout_seconds"]} label={<Label>最长等待时间（秒）</Label>} tooltip={t("cronJobs.timeoutSecondsTooltip")}>
                      <InputNumber min={1} style={{ ...inputStyle, width: "100%" }} placeholder="300" />
                    </Form.Item>
                    <Form.Item name={["runtime", "misfire_grace_seconds"]} label={<Label>错过后补执行宽限（秒）</Label>} tooltip={t("cronJobs.misfireGraceSecondsTooltip")}>
                      <InputNumber min={0} style={{ ...inputStyle, width: "100%" }} placeholder="60" />
                    </Form.Item>
                  </SectionCard>
                ),
              }]} />
            </>
          )}
        </div>
      </Form>
    </Drawer>

    {/* 绑定频道弹窗 */}
    <BindChannelModal
      open={bindModalOpen}
      onClose={() => setBindModalOpen(false)}
      onBound={() => {
        setBindModalOpen(false);
        fetchTargets(jobAgentId);
      }}
    />
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
      {required && <span style={{ color: "#ef4444", marginRight: 3 }}>*</span>}
      {children}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
      <InfoCircleOutlined style={{ fontSize: 11 }} />
      {children}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 8,
  fontSize: 13,
};
