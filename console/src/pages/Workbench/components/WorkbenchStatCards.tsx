import { useTranslation } from "react-i18next";
import { useTheme } from "../../../contexts/ThemeContext";
import type { AgentWithStatus } from "../useWorkbench";
import type { AgentStatsSummary } from "../../../api/types/agentStats";

interface Props {
  agents: AgentWithStatus[];
  todayStats: AgentStatsSummary | null;
}

export default function WorkbenchStatCards({ agents, todayStats }: Props) {
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const running = agents.filter(
    (a) => a.enabled && a.runtimeStatus?.status === "running",
  ).length;
  const total = agents.length;
  const totalTasksToday = todayStats?.total_active_sessions ?? 0;
  const totalMessages = todayStats?.total_messages ?? 0;
  const avgCompletionRate =
    totalTasksToday > 0
      ? Math.round((todayStats?.total_llm_calls ?? 0) / totalTasksToday)
      : 0;

  const cards = [
    {
      label: t("workbench.stat.agents", "当前 AI 员工"),
      value: total,
      sub:
        running > 0
          ? t("workbench.stat.agentsRunning", { count: running, defaultValue: `${running} 正在运行` })
          : t("workbench.stat.agentsIdle", "全部待机"),
      subColor: running > 0 ? "#4ade80" : "#94a3b8",
      iconClass: "ri-robot-line",
      iconColor: "#22d3ee",
    },
    {
      label: t("workbench.stat.todaySessions", "今日会话"),
      value: totalTasksToday,
      sub: t("workbench.stat.messages", { count: totalMessages, defaultValue: `${totalMessages} 条消息` }),
      subColor: "#4ade80",
      iconClass: "ri-chat-3-line",
      iconColor: "#f59e0b",
    },
    {
      label: t("workbench.stat.llmCalls", "LLM 调用"),
      value: todayStats?.total_llm_calls ?? 0,
      sub: t("workbench.stat.toolCalls", { count: todayStats?.total_tool_calls ?? 0, defaultValue: `${todayStats?.total_tool_calls ?? 0} 工具调用` }),
      subColor: "#94a3b8",
      iconClass: "ri-flashlight-line",
      iconColor: "#f97316",
    },
    {
      label: t("workbench.stat.avgLlmPerSession", "人均 LLM/会话"),
      value: avgCompletionRate,
      sub: t("workbench.stat.today", "今日"),
      subColor: "#4ade80",
      iconClass: "ri-bar-chart-line",
      iconColor: "#4ade80",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        padding: "16px 24px",
        flexShrink: 0,
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`,
            background: isDark ? "#1a2235" : "#ffffff",
            transition: "background 0.3s",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: isDark ? "#94a3b8" : "#64748b" }}>{c.label}</span>
            <i className={`${c.iconClass}`} style={{ fontSize: 16, color: c.iconColor }} />
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1,
              color: isDark ? "#ffffff" : "#0f172a",
            }}
          >
            {c.value}
          </div>
          <div style={{ fontSize: 12, color: c.subColor }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
