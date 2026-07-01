import { useEffect, useState, useCallback } from "react";
import { Drawer, Button } from "@agentscope-ai/design";
import {
  Spin,
  Empty,
  Tag,
  Tooltip,
  Modal,
  message as antMessage,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ExecutionRecord, CronJobSpecOutput } from "../../../../api/types";
import api from "../../../../api";
import styles from "../index.module.less";

type CronJob = CronJobSpecOutput;

interface ExecutionRecordsDrawerProps {
  open: boolean;
  job: CronJob | null;
  onClose: () => void;
}

const STATUS_CONFIG = {
  success: { color: "success", icon: <CheckCircleOutlined />, label: "成功" },
  error: { color: "error", icon: <CloseCircleOutlined />, label: "失败" },
  cancelled: { color: "warning", icon: <MinusCircleOutlined />, label: "取消" },
  skipped: { color: "default", icon: <ClockCircleOutlined />, label: "跳过" },
} as const;

const TRIGGER_CONFIG = {
  scheduled: { color: "blue", label: "定时" },
  manual: { color: "purple", label: "手动" },
} as const;

function formatDuration(seconds?: number | null) {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
}

function formatTime(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ExecutionRecordsDrawer({
  open,
  job,
  onClose,
}: ExecutionRecordsDrawerProps) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [outputVisible, setOutputVisible] = useState(false);
  const [outputContent, setOutputContent] = useState("");
  const [outputLoading, setOutputLoading] = useState(false);
  const [outputTitle, setOutputTitle] = useState("");

  const fetchRecords = useCallback(async () => {
    if (!job?.id) return;
    setLoading(true);
    try {
      const data = await api.listJobRecords(job.id, { limit: 50 });
      setRecords(data ?? []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [job?.id]);

  useEffect(() => {
    if (open && job?.id) fetchRecords();
    else setRecords([]);
  }, [open, job?.id, fetchRecords]);

  const handleViewOutput = async (record: ExecutionRecord) => {
    setOutputTitle(`${record.job_name} · ${formatTime(record.executed_at)}`);
    setOutputContent("");
    setOutputVisible(true);
    setOutputLoading(true);
    try {
      const text = await api.getRecordOutput(record.id);
      setOutputContent(text || "（无输出内容）");
    } catch (e) {
      setOutputContent(`获取输出失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOutputLoading(false);
    }
  };

  const handleDeleteRecord = (record: ExecutionRecord) => {
    Modal.confirm({
      title: "删除执行记录",
      content: `确认删除 "${formatTime(record.executed_at)}" 的执行记录？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        await api.deleteRecord(record.id);
        setRecords((prev) => prev.filter((r) => r.id !== record.id));
        antMessage.success("已删除");
      },
    });
  };

  const handleClearAll = () => {
    if (!job?.id) return;
    Modal.confirm({
      title: "清空所有执行记录",
      content: `确认清空任务 "${job.name}" 的所有执行记录？`,
      okText: "清空",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        await api.deleteJobRecords(job.id!);
        setRecords([]);
        antMessage.success("已清空");
      },
    });
  };

  return (
    <>
      <Drawer
        rootClassName="copaw-ported-drawer"
        width={640}
        placement="right"
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>
              {t("cronJobs.executionRecords", "执行记录")}
              {job ? ` · ${job.name}` : ""}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={fetchRecords}
                loading={loading}
              >
                刷新
              </Button>
              {records.length > 0 && (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleClearAll}
                >
                  清空
                </Button>
              )}
            </div>
          </div>
        }
        open={open}
        onClose={onClose}
        destroyOnHidden
        footer={null}
      >
        {loading ? (
          <div className={styles.stateWrap}>
            <Spin tip="加载中..." />
          </div>
        ) : records.length === 0 ? (
          <Empty description="暂无执行记录" style={{ marginTop: 60 }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {records.map((record) => {
              const statusCfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.error;
              const triggerCfg = TRIGGER_CONFIG[record.trigger_type] ?? TRIGGER_CONFIG.scheduled;
              return (
                <div
                  key={record.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: "12px 16px",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Tag
                        color={statusCfg.color}
                        icon={statusCfg.icon}
                        style={{ margin: 0 }}
                      >
                        {statusCfg.label}
                      </Tag>
                      <Tag color={triggerCfg.color} style={{ margin: 0 }}>
                        {triggerCfg.label}
                      </Tag>
                      <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                        {formatTime(record.executed_at)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {record.output_file && (
                        <Tooltip title="查看输出">
                          <Button
                            type="text"
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={() => handleViewOutput(record)}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="删除记录">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteRecord(record)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b" }}>
                    <span>耗时：{formatDuration(record.duration_seconds)}</span>
                    <span>完成：{formatTime(record.completed_at)}</span>
                  </div>
                  {record.error_message && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#ef4444",
                        background: "#fef2f2",
                        borderRadius: 6,
                        padding: "4px 8px",
                        marginTop: 2,
                      }}
                    >
                      {record.error_message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Drawer>

      {/* 输出内容查看 Modal */}
      <Modal
        title={outputTitle}
        open={outputVisible}
        onCancel={() => setOutputVisible(false)}
        footer={
          <Button onClick={() => setOutputVisible(false)}>关闭</Button>
        }
        width={720}
        styles={{ body: { maxHeight: "60vh", overflowY: "auto" } }}
      >
        {outputLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin tip="加载输出..." />
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: "monospace",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: "#1e293b",
              lineHeight: 1.6,
            }}
          >
            {outputContent}
          </pre>
        )}
      </Modal>
    </>
  );
}
