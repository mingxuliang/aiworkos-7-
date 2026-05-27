import { useEffect, useState } from "react";
import {
  getArticleProxyUrl,
  hasReadableHtmlContent,
  isPlaceholderSummary,
  timeAgo,
  type NewsArticle,
} from "@/api/modules/newsRss";
import { buildAuthHeaders } from "@/api/authHeaders";
import NewsCoverImage from "@/components/news/NewsCoverImage";

const SOURCE_BG: Record<string, string> = {
  量子位: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  雷锋网: "linear-gradient(135deg,#ea580c,#c2410c)",
  钛媒体: "linear-gradient(135deg,#2563eb,#1d4ed8)",
  爱范儿: "linear-gradient(135deg,#059669,#047857)",
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
  const [originalHtml, setOriginalHtml] = useState<string | null>(null);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [originalError, setOriginalError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const showHtml = article ? hasReadableHtmlContent(article.content) : false;
  const embedOriginal = article ? !showHtml && !!article.link : false;

  useEffect(() => {
    if (!embedOriginal || !article?.link) {
      setOriginalHtml(null);
      setOriginalError(null);
      setOriginalLoading(false);
      return;
    }

    let cancelled = false;
    setOriginalLoading(true);
    setOriginalError(null);
    setOriginalHtml(null);

    fetch(getArticleProxyUrl(article.link), {
      headers: buildAuthHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((html) => {
        if (!cancelled) setOriginalHtml(html);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOriginalError(
            err instanceof Error ? err.message : "原文加载失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setOriginalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [article?.link, embedOriginal]);

  if (!article) return null;

  const showSummary =
    !!article.summary && !isPlaceholderSummary(article.summary) && !embedOriginal;

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
          width: embedOriginal ? 640 : 480,
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

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: embedOriginal ? "hidden" : "auto",
            padding: embedOriginal ? 0 : "20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {!embedOriginal && <CoverArea article={article} />}

          {!embedOriginal && (
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
          )}

          {!embedOriginal && article.author && article.author !== article.source && (
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

          {showSummary && (
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

          {showHtml && (
            <div
              style={{ fontSize: 13, color: "#334155", lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
          )}

          {embedOriginal && (
            <>
              {originalLoading && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  <i
                    className="ri-loader-4-line animate-spin"
                    style={{ marginRight: 8 }}
                  />
                  正在加载原文…
                </div>
              )}
              {!originalLoading && originalError && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    padding: 24,
                    color: "#64748b",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  <p style={{ margin: 0 }}>原文加载失败，请点击下方按钮在新窗口打开。</p>
                </div>
              )}
              {!originalLoading && originalHtml && (
                <iframe
                  title={article.title}
                  srcDoc={originalHtml}
                  style={{
                    flex: 1,
                    width: "100%",
                    border: "none",
                    minHeight: 0,
                    background: "#fff",
                  }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              )}
            </>
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
              <i className="ri-external-link-line" />
              {embedOriginal ? "新窗口打开" : "阅读原文"}
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
