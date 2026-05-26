import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button, Form, Modal } from "@agentscope-ai/design";
import { Spin } from "antd";
import dayjs from "dayjs";
import type { CronJobSpecOutput } from "../../../api/types";
import { useTranslation } from "react-i18next";
import api from "../../../api";
import {
  CronJobCard,
  JobDrawer,
  useCronJobs,
  DEFAULT_FORM_VALUES,
} from "./components";
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
  const [form] = Form.useForm<CronJob>();
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

  const handleEdit = (job: CronJob) => {
    setEditingJob(job);

    const cronParts = parseCron(job.schedule?.cron || "0 9 * * *");

    const formValues: Record<string, unknown> = {
      ...job,
      request: {
        ...job.request,
        input: job.request?.input
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

  const handleSubmit = async (
    values: CronJob & Record<string, unknown>,
  ): Promise<void> => {
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
        request?: { input?: unknown; session_id?: string; user_id?: string };
      };
      if (!pv.request) {
        pv.request = { input: "" };
      }
      const req = pv.request;
      if (req.input && typeof req.input === "string") {
        try {
          req.input = JSON.parse(req.input);
        } catch (error) {
          console.error("❌ Failed to parse request.input JSON:", error);
        }
      }
    }

    let success = false;
    setSaving(true);
    try {
      if (editingJob) {
        success = await updateJob(
          editingJob.id,
          processedValues as unknown as CronJob,
        );
      } else {
        success = await createJob(processedValues as unknown as CronJob);
      }
    } finally {
      setSaving(false);
    }
    if (success) {
      setDrawerOpen(false);
    }
  };

  let mainBody: ReactNode;

  if (loading) {
    mainBody = (
      <div className={styles.stateWrap}>
        <Spin tip={t("common.loading")} />
      </div>
    );
  } else if (jobs.length === 0) {
    mainBody = (
      <div className={styles.stateWrapMuted}>{t("cronJobs.cardEmptyHint")}</div>
    );
  } else {
    mainBody = (
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
            t={t}
          />
        ))}
      </div>
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
      </div>
    </CopawWorkbenchShell>
  );
}

export default CronJobsPage;
