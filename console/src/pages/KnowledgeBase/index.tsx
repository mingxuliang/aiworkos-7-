import { useState, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import KnowledgeBaseSidebar from "./components/KnowledgeBaseSidebar";
import ChatArea from "./components/ChatArea";
import ChatInput from "./components/ChatInput";
import type { ChatMessage } from "@/mocks/knowledgeBase";
import { initialMessages, knowledgeBases } from "@/mocks/knowledgeBase";
import "@/styles/migrated-pages.css";

const SYS = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgPage: "#f0f4fa",
  bgCard: "#ffffff",
  bgChat: "#f6f8fc",
  borderBase: "#e2e8f0",
  primary: "#3b82f6",
  primaryBg: "#eff6ff",
  textMain: "#0f172a",
  textSub: "#64748b",
  textMuted: "#94a3b8",
  radius: 10,
  radiusSM: 8,
};

const pageShellStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  fontFamily: SYS.fontFamily,
  background: SYS.bgPage,
};

const mockReplies: Record<
  string,
  { content: string; sources: { title: string; page: string; kbName: string }[] }
> = {
  default: {
    content:
      "根据知识库中的相关文档，我为你整理了以下内容：\n\n该主题涉及多个核心知识点，知识库中收录了权威资料和实践案例。建议你结合实际场景灵活运用，如需深入了解某一方面，可以继续追问。",
    sources: [
      { title: "企业培训最佳实践指南", page: "P.24", kbName: "企业培训知识库" },
      { title: "绩效管理操作手册", page: "P.8", kbName: "企业培训知识库" },
    ],
  },
  绩效: {
    content:
      "**有效的员工绩效考核方案**需要包含以下关键要素：\n\n1. **明确的 KPI 指标**：结合岗位职责制定可量化目标，确保指标 SMART 化\n2. **360° 多维评估**：上级、同事、下级及自评相结合，全面客观\n3. **季度复盘机制**：避免年末一次性评估，定期跟进偏差\n4. **结果应用闭环**：绩效结果与薪酬、晋升、培训挂钩",
    sources: [
      { title: "绩效考核体系设计指南", page: "P.12-18", kbName: "企业培训知识库" },
      { title: "员工激励与绩效管理", page: "P.35", kbName: "企业培训知识库" },
    ],
  },
  内训师: {
    content:
      "**内训师课程开发的关键步骤**（基于 ISD 模型）：\n\n**第一阶段：需求分析**\n- 与业务部门访谈，明确绩效差距\n\n**第二阶段：设计与开发**\n- 制定课程框架，开发教学材料\n\n**第三阶段：实施与评估**\n- 试讲并按柯克帕特里克四级模型评估效果",
    sources: [
      { title: "内训师培养手册 v2.3", page: "P.5-22", kbName: "企业培训知识库" },
    ],
  },
  销售: {
    content:
      "**提升销售团队转化率**的核心策略：\n\n- **精准客户画像**：基于 CRM 数据建立 ICP\n- **SPIN 销售法**：引导客户决策\n- **标准化销售剧本**：缩短成交周期\n- **数据驱动复盘**：每周分析漏斗转化数据",
    sources: [
      { title: "销售流程优化白皮书", page: "P.10-15", kbName: "销售技能知识库" },
    ],
  },
  新员工: {
    content:
      "**新员工入职培训的核心要素**：\n\n1. **企业文化融入**\n2. **规章制度学习**\n3. **业务知识入门**\n4. **岗位技能培训**\n5. **团队关系建立**\n\n建议采用 **30-60-90 天入职计划**，分阶段设置里程碑。",
    sources: [
      { title: "新员工入职手册 2025版", page: "P.全文", kbName: "新员工入职手册" },
    ],
  },
};

const getReply = (q: string) => {
  if (q.includes("绩效") || q.includes("考核")) return mockReplies["绩效"];
  if (q.includes("内训师") || q.includes("课程开发")) return mockReplies["内训师"];
  if (q.includes("销售") || q.includes("转化")) return mockReplies["销售"];
  if (q.includes("新员工") || q.includes("入职")) return mockReplies["新员工"];
  return mockReplies["default"];
};

const getNow = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export default function KnowledgeBasePage() {
  const { t } = useTranslation();
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>(knowledgeBases.map((k) => k.id));
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);

  const handleToggleKb = useCallback((id: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!selectedKbIds.length) return;
      const userMsg: ChatMessage = { id: `msg-${Date.now()}-u`, role: "user", content: text, timestamp: getNow() };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setTimeout(() => {
        const reply = getReply(text);
        setMessages((prev) => [...prev, { id: `msg-${Date.now()}-a`, role: "assistant", content: reply.content, sources: reply.sources, timestamp: getNow() }]);
        setLoading(false);
      }, 1400 + Math.random() * 800);
    },
    [selectedKbIds],
  );

  const handleNewChat = () => setMessages(initialMessages);

  const headerBtnBase: CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px", borderRadius: SYS.radiusSM,
    fontSize: 12, fontWeight: 500, cursor: "pointer",
    fontFamily: SYS.fontFamily, transition: "all 0.15s",
    whiteSpace: "nowrap",
  };

  return (
    <div className="migrated-page" style={pageShellStyle}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ── Page Header ── */}
        <div
          style={{
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 24px", background: SYS.bgCard, borderBottom: `1px solid ${SYS.borderBase}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: SYS.textMuted }}>{t("nav.knowledgeBase", "知识库")}</span>
            <i className="ri-arrow-right-s-line" style={{ fontSize: 12, color: SYS.textMuted }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: SYS.textMain }}>{t("knowledgeBase.qa", "知识问答")}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleNewChat}
              style={{ ...headerBtnBase, background: SYS.primaryBg, border: `1px solid #bfdbfe`, color: SYS.primary }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#dbeafe"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = SYS.primaryBg; }}
            >
              <i className="ri-add-line" style={{ fontSize: 13 }} />
              {t("knowledgeBase.newChat", "新对话")}
            </button>
            {[
              { icon: "ri-history-line", label: t("knowledgeBase.history", "历史记录") },
              { icon: "ri-upload-cloud-2-line", label: t("knowledgeBase.uploadDoc", "上传文档") },
            ].map(({ icon, label }) => (
              <button
                key={icon}
                type="button"
                style={{ ...headerBtnBase, background: SYS.bgCard, border: `1px solid ${SYS.borderBase}`, color: SYS.textSub }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = SYS.bgCard; }}
              >
                <i className={icon} style={{ fontSize: 13 }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <KnowledgeBaseSidebar selectedKbIds={selectedKbIds} onToggle={handleToggleKb} />

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: SYS.bgChat }}>
            {/* Chat header */}
            <div
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 20px", background: SYS.bgCard, borderBottom: `1px solid ${SYS.borderBase}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: SYS.radiusSM, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", flexShrink: 0,
                  }}
                >
                  <i className="ri-robot-2-line" style={{ fontSize: 14, color: "#fff" }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: SYS.textMain, margin: 0 }}>
                    {t("knowledgeBase.assistant", "知识库助手")}
                  </p>
                  <p style={{ fontSize: 10, color: SYS.textMuted, margin: 0 }}>
                    {t("knowledgeBase.connected", "已接入 {{count}} 个知识库", { count: selectedKbIds.length })}
                    {" · "}
                    {knowledgeBases.filter((k) => selectedKbIds.includes(k.id)).reduce((a, b) => a + b.docCount, 0)}
                    {" "}{t("knowledgeBase.documents", "份文档")}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, background: "#4ade80", borderRadius: "50%", display: "inline-block" }} />
                <span style={{ fontSize: 11, color: SYS.textMuted }}>{t("knowledgeBase.online", "在线")}</span>
              </div>
            </div>

            {/* Warning */}
            {selectedKbIds.length === 0 && (
              <div
                style={{
                  margin: "12px 20px 0", padding: "10px 14px",
                  background: "#fffbeb", border: "1px solid #fcd34d",
                  borderRadius: SYS.radiusSM, display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, color: "#92400e",
                }}
              >
                <i className="ri-alert-line" style={{ color: "#f59e0b", flexShrink: 0 }} />
                {t("knowledgeBase.selectWarning", "请在左侧至少选择一个知识库后开始提问")}
              </div>
            )}

            <ChatArea messages={messages} loading={loading} onSuggest={handleSend} />
            <ChatInput onSend={handleSend} loading={loading} disabled={selectedKbIds.length === 0} />
          </div>
        </div>
      </div>
    </div>
  );
}
