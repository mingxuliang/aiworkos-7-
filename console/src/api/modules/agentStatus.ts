import { request } from "../request";

export interface AgentStatus {
  status: "idle" | "running" | "disabled";
  running_task_count: number;
  last_run_at: string | null;
  last_finish_at: string | null;
}

export const agentStatusApi = {
  getStatus: (agentId: string) =>
    request<AgentStatus>(`/agents/${encodeURIComponent(agentId)}/agent-status`),
};
