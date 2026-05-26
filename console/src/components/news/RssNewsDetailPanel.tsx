import { useEffect } from "react";
import {
  hasReadableHtmlContent,
  timeAgo,
  type NewsArticle,
} from "@/api/modules/newsRss";
import NewsCoverImage from "@/components/news/NewsCoverImage";

const SOURCE_BG: Record<string, string> = {
  量子位: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  OpenAI: "linear-gradient(135deg,#10a37f,#047857)",
  "arXiv AI": "linear-gradient(135deg,#b31b1b,#7f1d1d)",
  InfoQ: "linear-gradient(135deg,#0ea5e9,#0369a1)",
  少数派: "linear-gradient(135deg,#6366f1,#4338ca)",
  "Hacker News": "linear-gradient(135deg,#ff6600,#c2410c)",
};

function CoverArea({ article }: { article: NewsArticle }) {
  const bg = SOURCE_BG[article.source] || "linear-gradient(135deg,#475569,#1e293b)";
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 20,
        height: 180,
        background: bg,
        position: "relative",
      }}
    >
      {article.thumbnail ? (
        <NewsCoverImage
          url={article.thumbnail}
          alt={article.title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "#fff",
            padding: 16,
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 800, opacity: 0.9 }}>
            {article.source.slice(0, 2)}
          </span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>{article.source}</span>
        </div>
      )}
    </div>
  );
}

interface RssNewsDetailPanelProps {
  article: NewsArticle | null;
  onClose: () => void;
}

/** RSS 新闻右侧详情面板（与新闻中心页一致） */
export default function RssNewsDetailPanel({
  article,
  onClose,
}: RssNewsDetailPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!article) return null;

  const showHtml = hasReadableHtmlContent(article.content);
  const isHn = article.source === "Hacker News" || !!article.discussionLink;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          backdropFilter: "blur(2px)",
          zIndex: 1000,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: "95vw",
          background: "#fff",
          zIndex: 1001,
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              background: SOURCE_BG[article.source] || "#475569",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 6,
            }}
          >
            {article.source}
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {article.category} · {timeAgo(article.pubDate)}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <i className="ri-close-line" style={{ fontSize: 14, color: "#64748b" }} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
          <CoverArea article={article} />

          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 18,
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.45,
            }}
          >
            {article.title}
          </h2>

          {article.author && article.author !== article.source && (
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 12,
                color: "#94a3b8",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <i className="ri-user-line" />
              {article.author}
            </p>
          )}

          {(article.hnPoints != null || article.hnComments != null) && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              {article.hnPoints != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "#fff7ed",
                    color: "#c2410c",
                    border: "1px solid #fed7aa",
                  }}
                >
                  <i className="ri-fire-line" style={{ marginRight: 4 }} />
                  {article.hnPoints} 分
                </span>
              )}
              {article.hnComments != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "#f0f9ff",
                    color: "#0369a1",
                    border: "1px solid #bae6fd",
                  }}
                >
                  <i className="ri-chat-3-line" style={{ marginRight: 4 }} />
                  {article.hnComments} 条讨论
                </span>
              )}
            </div>
          )}

          {article.summary && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #f1f5f9",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 16,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
                {article.summary}
              </p>
            </div>
          )}

          {isHn && !showHtml && (
            <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
              本文为外链报道，点击下方按钮阅读全文或参与 Hacker News 讨论。
            </p>
          )}

          {showHtml && (
            <div
              style={{ fontSize: 13, color: "#334155", lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{
                __html:
                  article.content.slice(0, 2000) +
                  (article.content.length > 2000 ? "…" : ""),
              }}
            />
          )}
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            gap: 10,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {article.link ? (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                minWidth: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 2px 8px rgba(14,165,233,0.35)",
              }}
            >
              <i className="ri-article-line" />
              阅读原文
            </a>
          ) : null}
          {article.discussionLink ? (
            <a
              href={article.discussionLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                minWidth: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 38,
                borderRadius: 10,
                background: "#fff7ed",
                color: "#c2410c",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                border: "1px solid #fed7aa",
              }}
            >
              <i className="ri-discuss-line" />
              HN 讨论
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <i className="ri-close-line" style={{ fontSize: 16, color: "#64748b" }} />
          </button>
        </div>
      </div>
    </>
  );
}
