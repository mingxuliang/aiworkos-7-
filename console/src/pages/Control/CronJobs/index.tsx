import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button, Form, Modal } from "@agentscope-ai/design";
import { Spin, Card, message } from "antd";
import {
  ThunderboltOutlined,
  BellOutlined,
  BarChartOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { CronJobSpecOutput, CronFormValues } from "../../../api/types";
import { useTranslation } from "react-i18next";
import api from "../../../api";
import {
  CronJobCard,
  JobDrawer,
  useCronJobs,
  DEFAULT_FORM_VALUES,
} from "./components";
import { ExecutionRecordsDrawer } from "./components/ExecutionRecordsDrawer";
import {
  parseCron,
  serializeCron,
  type CronParts,
} from "./components/parseCron";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import styles from "./index.module.less";

type CronJob = CronJobSpecOutput;

function CronJobsPage() {
  const { t } = useTranslation();
  const {
    jobs,
    loading,
    createJob,
    updateJob,
    deleteJob,
    toggleEnabled,
    executeNow,
  } = useCronJobs();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordsDrawerOpen, setRecordsDrawerOpen] = useState(false);
  const [recordsJob, setRecordsJob] = useState<CronJob | null>(null);
  const [form] = Form.useForm<CronFormValues>();
  const userTimezoneRef = useRef("UTC");

  useEffect(() => {
    api
      .getUserTimezone()
      .then((res) => {
        if (res.timezone) userTimezoneRef.current = res.timezone;
      })
      .catch((err) => console.error("Failed to fetch user timezone:", err));
  }, []);

  const handleCreate = () => {
    setEditingJob(null);
    form.resetFields();
    form.setFieldsValue({
      ...DEFAULT_FORM_VALUES,
      schedule: {
        ...DEFAULT_FORM_VALUES.schedule,
        timezone: userTimezoneRef.current,
      },
    });
    setDrawerOpen(true);
  };

  const handleCreateFromTemplate = (tpl: "daily_brief" | "reminder" | "weekly_report") => {
    setEditingJob(null);
    form.resetFields();
    const base = {
      ...DEFAULT_FORM_VALUES,
      schedule: { ...DEFAULT_FORM_VALUES.schedule, timezone: userTimezoneRef.current },
    };
    if (tpl === "daily_brief") {
      form.setFieldsValue({
        ...base,
        name: t("cronJobs.templateDailyBrief"),
        enabled: true,
        task_type: "agent",
        cronType: "daily",
        cronTime: dayjs().hour(9).minute(0),
        request: { input: "帮我总结今日重要信息，整理成简报发给我", session_id: "", user_id: "" },
      });
    } else if (tpl === "reminder") {
      form.setFieldsValue({
        ...base,
        name: t("cronJobs.templateReminder"),
        enabled: true,
        task_type: "text",
        cronType: "daily",
        cronTime: dayjs().hour(9).minute(0),
        text: "提醒：请查看今日待办事项",
      });
    } else if (tpl === "weekly_report") {
      form.setFieldsValue({
        ...base,
        name: t("cronJobs.templateWeeklyReport"),
        enabled: true,
        task_type: "agent",
        cronType: "weekly",
        cronTime: dayjs().hour(9).minute(0),
        cronDaysOfWeek: ["mon"],
        request: { input: "帮我生成本周工作总结报告，包含主要进展和下周计划", session_id: "", user_id: "" },
      });
    }
    setDrawerOpen(true);
  };

  const handleEdit = (job: CronJob) => {
    setEditingJob(job);

    const cronParts = parseCron(job.schedule?.cron || "0 9 * * *");

    const formValues: Record<string, unknown> = {
      ...job,
      request: {
        ...job.request,
        // 后端现在返回纯文本字符串，不再是 JSON 数组
        input: typeof job.request?.input === "string"
          ? job.request.input
          : job.request?.input
            ? JSON.stringify(job.request.input, null, 2)
            : "",
      },
      cronType: cronParts.type,
    };

    if (cronParts.type === "daily" || cronParts.type === "weekly") {
      const h = cronParts.hour ?? 9;
      const m = cronParts.minute ?? 0;
      formValues.cronTime = dayjs().hour(h).minute(m);
    }

    if (cronParts.type === "weekly" && cronParts.daysOfWeek) {
      formValues.cronDaysOfWeek = cronParts.daysOfWeek;
    }

    if (cronParts.type === "custom" && cronParts.rawCron) {
      formValues.cronCustom = cronParts.rawCron;
    }

    form.setFieldsValue(formValues);
    setDrawerOpen(true);
  };

  const handleDelete = (jobId: string) => {
    Modal.confirm({
      title: t("cronJobs.confirmDelete"),
      content: t("cronJobs.deleteConfirm"),
      okText: t("cronJobs.deleteText"),
      okType: "primary",
      cancelText: t("cronJobs.cancelText"),
      onOk: async () => {
        await deleteJob(jobId);
      },
    });
  };

  const handleToggleEnabled = async (job: CronJob) => {
    await toggleEnabled(job);
  };

  const handleExecuteNow = async (job: CronJob) => {
    Modal.confirm({
      title: t("cronJobs.executeNowTitle"),
      content: t("cronJobs.executeNowContent", { name: job.name }),
      okText: t("cronJobs.executeNowConfirm"),
      okType: "primary",
      cancelText: t("cronJobs.cancelText"),
      onOk: async () => {
        await executeNow(job.id);
      },
    });
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setEditingJob(null);
  };

  const handleViewRecords = (job: CronJob) => {
    setRecordsJob(job);
    setRecordsDrawerOpen(true);
  };

  const handleSubmit = async (
    values: CronJob & Record<string, unknown>,
  ): Promise<void> => {
    // 提取 drawer 传回的执行 agent，不发给后端
    const jobAgentId = typeof values._jobAgentId === "string" ? values._jobAgentId : undefined;
    delete values._jobAgentId;

    // 前置校验：必须选择发送目标，否则后端会拒绝
    const dispatchTarget = (values as Record<string, unknown>).dispatch as Record<string, unknown> | undefined;
    const hasTarget = dispatchTarget?.session_id || dispatchTarget?.target;
    if (!hasTarget) {
      message.error("请先配置发送目标（第三步）后再保存");
      return;
    }

    const cronParts: CronParts = {
      type:
        typeof values.cronType === "string"
          ? (values.cronType as CronParts["type"]) || "daily"
          : ("daily" as CronParts["type"]),
    };

    if (
      values.cronType === "daily" ||
      values.cronType === "weekly"
    ) {
      const ct = values.cronTime;
      if (dayjs.isDayjs(ct)) {
        cronParts.hour = ct.hour();
        cronParts.minute = ct.minute();
      }
    }

    if (values.cronType === "weekly" && values.cronDaysOfWeek) {
      cronParts.daysOfWeek = values.cronDaysOfWeek as string[];
    }

    if (values.cronType === "custom" && values.cronCustom) {
      cronParts.rawCron = String(values.cronCustom);
    }

    const cronExpression = serializeCron(cronParts);

    const processedValues = {
      ...values,
      schedule: {
        ...values.schedule,
        cron: cronExpression,
      },
    } as CronJob;

    if (processedValues.task_type === "text") {
      delete (processedValues as unknown as Record<string, unknown>).request;
    } else if (processedValues.task_type === "agent") {
      const pv = processedValues as CronJob & {
        request?: { input?: unknown };
      };
      if (!pv.request) pv.request = { input: "" };
      // 后端现在直接接受纯文本字符串，不再需要 JSON 数组包装
    }

    let success = false;
    setSaving(true);
    try {
      if (editingJob) {
        success = await updateJob(
          editingJob.id,
          processedValues as unknown as CronJob,
          jobAgentId,
        );
      } else {
        success = await createJob(processedValues as unknown as CronJob, jobAgentId);
      }
    } finally {
      setSaving(false);
    }
    if (success) {
      setDrawerOpen(false);
    }
  };

  const TEMPLATES = [
    {
      key: "daily_brief" as const,
      icon: <ThunderboltOutlined style={{ fontSize: 22, color: "#6366f1" }} />,
      title: t("cronJobs.templateDailyBrief"),
      desc: t("cronJobs.templateDailyBriefDesc"),
    },
    {
      key: "reminder" as const,
      icon: <BellOutlined style={{ fontSize: 22, color: "#f59e0b" }} />,
      title: t("cronJobs.templateReminder"),
      desc: t("cronJobs.templateReminderDesc"),
    },
    {
      key: "weekly_report" as const,
      icon: <BarChartOutlined style={{ fontSize: 22, color: "#10b981" }} />,
      title: t("cronJobs.templateWeeklyReport"),
      desc: t("cronJobs.templateWeeklyReportDesc"),
    },
  ];

  const templateSection = (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#64748b",
          marginBottom: 10,
          letterSpacing: 0.3,
        }}
      >
        {t("cronJobs.templateTitle")}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        {TEMPLATES.map((tpl) => (
          <Card
            key={tpl.key}
            hoverable
            size="small"
            style={{
              width: 200,
              borderRadius: 10,
              border: "1.5px solid #e2e8f0",
              cursor: "pointer",
              transition: "box-shadow 0.2s",
              display: "flex",
              flexDirection: "column",
            }}
            styles={{
              body: {
                padding: "12px 14px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
              },
            }}
            onClick={() => handleCreateFromTemplate(tpl.key)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {tpl.icon}
              <span style={{ fontWeight: 600, fontSize: 13 }}>{tpl.title}</span>
            </div>
            <div style={{ flex: 1, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{tpl.desc}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#6366f1" }}>
              <PlusCircleOutlined /> 使用模板
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const jobListSectionTitle = (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#64748b",
        marginBottom: 10,
        letterSpacing: 0.3,
      }}
    >
      {t("cronJobs.jobListTitle")}
    </div>
  );

  let mainBody: ReactNode;

  if (loading) {
    mainBody = (
      <div className={styles.stateWrap}>
        <Spin tip={t("common.loading")} />
      </div>
    );
  } else if (jobs.length === 0) {
    mainBody = (
      <>
        {templateSection}
        {jobListSectionTitle}
        <div className={styles.stateWrapMuted}>{t("cronJobs.cardEmptyHint")}</div>
      </>
    );
  } else {
    mainBody = (
      <>
        {templateSection}
        {jobListSectionTitle}
        <div className="cbc-agent-grid">
          {jobs.map((job, index) => (
            <CronJobCard
              key={job.id}
              job={job}
              index={index}
              onEdit={handleEdit}
              onToggleEnabled={handleToggleEnabled}
              onExecuteNow={handleExecuteNow}
              onDelete={handleDelete}
              onViewRecords={handleViewRecords}
              t={t}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <CopawWorkbenchShell>
      <div className={styles.cronJobsPage}>
        <PageHeader
          parent={t("nav.control")}
          current={t("cronJobs.title")}
          subRow={
            <p className="copaw-bench-page-desc">{t("cronJobs.description")}</p>
          }
          extra={
            <Button type="primary" onClick={handleCreate}>
              + {t("cronJobs.createJob")}
            </Button>
          }
        />

        <div className="copaw-bench-main-section copaw-bench-main-section--scroll">
          {mainBody}
        </div>

        <JobDrawer
          open={drawerOpen}
          editingJob={editingJob}
          form={form}
          saving={saving}
          onClose={handleDrawerClose}
          onSubmit={handleSubmit}
        />

        <ExecutionRecordsDrawer
          open={recordsDrawerOpen}
          job={recordsJob}
          onClose={() => setRecordsDrawerOpen(false)}
        />
      </div>
    </CopawWorkbenchShell>
  );
}

export default CronJobsPage;
