import { useState, useEffect } from "react";
import { useAppMessage } from "../../../hooks/useAppMessage";
import api from "../../../api";
import type { CronJobSpecOutput } from "../../../api/types";
import { useAgentStore } from "../../../stores/agentStore";

type CronJob = CronJobSpecOutput;

// Extend job type with the agent ID it was loaded from, so all operations
// (run, pause, delete) use the correct agent endpoint regardless of UI state.
export type CronJobWithAgent = CronJob & { _agentId: string };

export function useCronJobs() {
  const { selectedAgent } = useAgentStore();
  const [jobs, setJobs] = useState<CronJobWithAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = useAppMessage();

  const fetchJobs = async () => {
    setLoading(true);
    // Clear stale jobs from previous agent immediately to prevent
    // cross-agent operations if user switches agent before fetch completes.
    setJobs([]);
    try {
      const data = await api.listCronJobs(selectedAgent);
      if (data) {
        // Tag each job with the agent it was loaded from.
        setJobs((data as CronJob[]).map((j) => ({ ...j, _agentId: selectedAgent ?? "" })));
      }
    } catch (error) {
      console.error("Failed to load cron jobs", error);
      message.error("Failed to load Cron Jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadJobs = async () => {
      await fetchJobs();
    };

    if (mounted) {
      loadJobs();
    }

    return () => {
      mounted = false;
    };
  }, [selectedAgent]);

  const createJob = async (values: CronJob, agentId = selectedAgent) => {
    try {
      const created = await api.createCronJob(values, agentId);
      setJobs((prev) => [{ ...(created as CronJob), _agentId: agentId ?? "" }, ...prev]);
      message.success("Created successfully");
      return true;
    } catch (error) {
      console.error("Failed to create cron job", error);
      message.error("Failed to save");
      return false;
    }
  };

  const updateJob = async (jobId: string, values: CronJob, agentId?: string) => {
    const original = jobs.find((j) => j.id === jobId);
    // Use the agent the job was loaded from; fall back to selectedAgent.
    const effectiveAgent = agentId ?? original?._agentId ?? selectedAgent;
    const optimisticUpdate: CronJobWithAgent = { ...original, ...values, _agentId: effectiveAgent ?? "" };
    setJobs((prev) => prev.map((j) => (j.id === jobId ? optimisticUpdate : j)));

    try {
      const updated = await api.replaceCronJob(jobId, values, effectiveAgent);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...(updated as CronJob), _agentId: effectiveAgent ?? "" } : j)),
      );
      message.success("Updated successfully");
      return true;
    } catch (error) {
      console.error("Failed to update cron job", error);
      if (original) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? original : j)));
      }
      message.error("Failed to save");
      return false;
    }
  };

  const deleteJob = async (jobId: string) => {
    const original = jobs.find((j) => j.id === jobId);
    const effectiveAgent = original?._agentId ?? selectedAgent;
    setJobs((prev) => prev.filter((j) => j.id !== jobId));

    try {
      await api.deleteCronJob(jobId, effectiveAgent);
      message.success("Deleted successfully");
      return true;
    } catch (error) {
      console.error("Failed to delete cron job", error);
      if (original) {
        setJobs((prev) => [...prev, original]);
      }
      message.error("Failed to delete");
      return false;
    }
  };

  const toggleEnabled = async (job: CronJobWithAgent) => {
    const updated = { ...job, enabled: !job.enabled };
    const effectiveAgent = job._agentId || selectedAgent;
    setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));

    try {
      const returned = await api.replaceCronJob(job.id, updated, effectiveAgent);
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...(returned as CronJob), _agentId: effectiveAgent ?? "" } : j)),
      );
      message.success(`${updated.enabled ? "Enabled" : "Disabled"}`);
      return true;
    } catch (error) {
      console.error("Failed to toggle cron job", error);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
      message.error("Operation failed");
      return false;
    }
  };

  const executeNow = async (jobId: string, agentId?: string) => {
    const effectiveAgent = agentId ?? jobs.find((j) => j.id === jobId)?._agentId ?? selectedAgent;
    try {
      await api.triggerCronJob(jobId, effectiveAgent);
      message.success("Task triggered successfully");
      return true;
    } catch (error) {
      console.error("Failed to execute cron job", error);
      message.error("Failed to execute");
      return false;
    }
  };

  return {
    jobs,
    loading,
    createJob,
    updateJob,
    deleteJob,
    toggleEnabled,
    executeNow,
    fetchJobs,
  };
}
