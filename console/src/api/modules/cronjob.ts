import { request } from "../request";
import { getApiUrl, getApiToken } from "../config";
import type {
  CronJobSpecInput,
  CronJobSpecOutput,
  CronJobView,
  CronTarget,
  ExecutionRecord,
} from "../types";

/** 构造 agentId 覆盖 header（buildHeaders 只在 key 不存在时才设置，所以优先级更高） */
function agentHeader(agentId?: string): HeadersInit | undefined {
  return agentId ? { "X-Agent-Id": agentId } : undefined;
}

export const cronJobApi = {
  listCronJobs: () => request<CronJobSpecOutput[]>("/cron/jobs"),

  createCronJob: (spec: CronJobSpecInput, agentId?: string) =>
    request<CronJobSpecOutput>("/cron/jobs", {
      method: "POST",
      body: JSON.stringify(spec),
      headers: agentHeader(agentId),
    }),

  getCronJob: (jobId: string) =>
    request<CronJobView>(`/cron/jobs/${encodeURIComponent(jobId)}`),

  replaceCronJob: (jobId: string, spec: CronJobSpecInput, agentId?: string) =>
    request<CronJobSpecOutput>(`/cron/jobs/${encodeURIComponent(jobId)}`, {
      method: "PUT",
      body: JSON.stringify(spec),
      headers: agentHeader(agentId),
    }),

  deleteCronJob: (jobId: string) =>
    request<void>(`/cron/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),

  pauseCronJob: (jobId: string) =>
    request<void>(`/cron/jobs/${encodeURIComponent(jobId)}/pause`, {
      method: "POST",
    }),

  resumeCronJob: (jobId: string) =>
    request<void>(`/cron/jobs/${encodeURIComponent(jobId)}/resume`, {
      method: "POST",
    }),

  runCronJob: (jobId: string) =>
    request<void>(`/cron/jobs/${encodeURIComponent(jobId)}/run`, {
      method: "POST",
    }),

  triggerCronJob: (jobId: string) =>
    request<void>(`/cron/jobs/${encodeURIComponent(jobId)}/run`, {
      method: "POST",
    }),

  getCronJobState: (jobId: string) =>
    request<unknown>(`/cron/jobs/${encodeURIComponent(jobId)}/state`),

  /** 获取当前用户可用的调度目标（channel/session/user_id 三元组），可指定 agentId 切换 agent */
  listCronTargets: (agentId?: string) =>
    request<CronTarget[]>("/cron/targets", {
      headers: agentHeader(agentId),
    }),

  /** 获取某任务的执行记录列表 */
  listJobRecords: (
    jobId: string,
    params?: { limit?: number; offset?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return request<ExecutionRecord[]>(
      `/cron/jobs/${encodeURIComponent(jobId)}/records${q ? `?${q}` : ""}`,
    );
  },

  /** 获取全部执行记录（可按任务过滤） */
  listAllRecords: (params?: {
    job_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.job_id) qs.set("job_id", params.job_id);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return request<ExecutionRecord[]>(`/cron/records${q ? `?${q}` : ""}`);
  },

  /** 获取单次执行的完整输出文本（纯文本） */
  getRecordOutput: async (recordId: string): Promise<string> => {
    const token = getApiToken();
    const headers: Record<string, string> = { Accept: "text/plain" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(
      getApiUrl(`/cron/records/${encodeURIComponent(recordId)}/output`),
      { headers },
    );
    if (!res.ok) throw new Error(`获取输出失败: ${res.status}`);
    return res.text();
  },

  /** 删除单条执行记录 */
  deleteRecord: (recordId: string) =>
    request<{ deleted: boolean }>(
      `/cron/records/${encodeURIComponent(recordId)}`,
      { method: "DELETE" },
    ),

  /** 清空某任务所有执行记录 */
  deleteJobRecords: (jobId: string) =>
    request<{ deleted: number }>(
      `/cron/jobs/${encodeURIComponent(jobId)}/records`,
      { method: "DELETE" },
    ),
};
