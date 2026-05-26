import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../../../contexts/ThemeContext";
import { fetchAllNews, timeAgo, type NewsArticle } from "@/api/modules/newsRss";
import RssNewsDetailPanel from "@/components/news/RssNewsDetailPanel";
import NewsCoverImage from "@/components/news/NewsCoverImage";
import { newsData } from "./news/newsData";

const SOURCE_BG: Record<string, string> = {
  '量子位': 'linear-gradient(135deg,#7c3aed,#5b21b6)',
  'OpenAI': 'linear-gradient(135deg,#10a37f,#047857)',
  'arXiv AI': 'linear-gradient(135deg,#b31b1b,#7f1d1d)',
  'InfoQ': 'linear-gradient(135deg,#0ea5e9,#0369a1)',
  '少数派': 'linear-gradient(135deg,#6366f1,#4338ca)',
  'Hacker News': 'linear-gradient(135deg,#ff6600,#c2410c)',
};

/** 静态 newsData 降级数据（真实 RSS 加载失败时展示） */
const FALLBACK = newsData.slice(0, 5).map((n) => ({
  id: n.id,
  title: n.title,
  summary: n.summary,
  pubDate: n.date,
  link: '',
  thumbnail: n.coverImage || '',
  source: '内部资讯',
  sourceColor: '#0d9488',
  category: n.category,
  content: n.content,
  author: n.author || '',
} as NewsArticle));

export default function WorkbenchNewsCarousel() {
  const { isDark } = useTheme();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading]   = useState(true);
  const [featIdx, setFeatIdx]   = useState(0);
  const [selected, setSelected] = useState<NewsArticle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 拉取实时 RSS，取前 5 条，失败降级静态数据 ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllNews()
      .then((list) => {
        if (cancelled) return;
        setArticles(list.length ? list.slice(0, 5) : FALLBACK);
      })
      .catch(() => {
        if (!cancelled) setArticles(FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── 自动轮播 ──
  useEffect(() => {
    if (!articles.length) return;
    timerRef.current = setInterval(() => setFeatIdx((p) => (p + 1) % articles.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [articles.length]);

  const cardW = 100 / Math.min(articles.length, 2.8);

  // ── 骨架屏 ──
  if (loading) {
    return (
      <div style={{ margin: "0 24px 16px", borderRadius: 12, border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`, background: isDark ? "#1a2235" : "#fff", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9" }} />
          <div style={{ flex: 1, height: 14, borderRadius: 6, background: isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9", maxWidth: 120 }} />
        </div>
        <div style={{ display: "flex", gap: 12, padding: 12 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ flex: 1, height: 200, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc", animation: "wb-shimmer 1.4s infinite" }} />
          ))}
        </div>
        <style>{`@keyframes wb-shimmer{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    );
  }

  if (!articles.length) return null;

  return (
    <div
      style={{
        margin: "0 24px 16px",
        borderRadius: 12,
        border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`,
        background: isDark ? "#1a2235" : "#ffffff",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* ── 区块标题 ── */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#14b8a6,#34d399)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(20,184,166,0.25)" }}>
            <i className="ri-newspaper-line" style={{ fontSize: 13, color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#f1f5f9" : "#0f172a" }}>
              新闻中心
            </div>
            <div style={{ fontSize: 10, color: isDark ? "#475569" : "#94a3b8", marginTop: 1 }}>
              AI 科技聚合 · 量子位 / OpenAI / InfoQ 等
            </div>
          </div>
        </div>
        <Link
          to="/news"
          style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 500, color: "#0d9488", textDecoration: "none", background: isDark ? "rgba(20,184,166,0.08)" : "#f0fdfa", border: "1px solid rgba(20,184,166,0.2)", display: "flex", alignItems: "center", gap: 3 }}
        >
          查看更多 <i className="ri-arrow-right-s-line" />
        </Link>
      </div>

      {/* ── 轮播区域 ── */}
      <div className="group" style={{ position: "relative", overflow: "hidden" }}>
        <style>{`
          @keyframes wb-ken-burns { 0%{transform:scale(1)} 100%{transform:scale(1.08)} }
        `}</style>

        {/* 滑动轨道 */}
        <div
          style={{
            display: "flex",
            transition: "transform 0.5s ease-out",
            transform: `translateX(-${featIdx * cardW}%)`,
            willChange: "transform",
          }}
        >
          {articles.map((art, idx) => {
            const isActive = idx === featIdx;
            const bg = SOURCE_BG[art.source] || 'linear-gradient(135deg,#334155,#1e293b)';
            return (
              <div
                key={art.id}
                style={{ flexShrink: 0, width: `${cardW}%`, padding: "12px 8px", cursor: "pointer" }}
                onClick={() => {
                  if (!isActive) {
                    setFeatIdx(idx);
                    return;
                  }
                  setSelected(art);
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 220,
                    borderRadius: 12,
                    overflow: "hidden",
                    transition: "all 0.5s",
                    transform: isActive ? "scale(1)" : "scale(0.95)",
                    opacity: isActive ? 1 : 0.65,
                    boxShadow: isActive ? "0 16px 40px rgba(0,0,0,0.18)" : "none",
                  }}
                >
                  {/* 来源色底 + 封面图（加载失败仍保留底色，避免灰块） */}
                  <div style={{ position: "absolute", inset: 0, background: bg }} />
                  {art.thumbnail && (
                    <NewsCoverImage
                      url={art.thumbnail}
                      alt={art.title}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        animation: isActive ? "wb-ken-burns 8s ease-in-out infinite alternate" : "none",
                      }}
                    />
                  )}
                  {/* 渐变遮罩 */}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0.2) 55%,transparent 100%)" }} />
                  {/* 来源标签 */}
                  <div style={{ position: "absolute", top: 12, left: 12 }}>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, fontWeight: 700, backdropFilter: "blur(8px)", background: isActive ? "rgba(20,184,166,0.85)" : "rgba(0,0,0,0.4)", color: "#fff", border: isActive ? "1px solid rgba(20,184,166,0.5)" : "1px solid rgba(255,255,255,0.1)" }}>
                      {art.source}
                    </span>
                  </div>
                  {/* 时间 */}
                  <div style={{ position: "absolute", top: 12, right: 12, fontSize: 10, color: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.2)", padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                    {timeAgo(art.pubDate)}
                  </div>
                  {/* 底部信息 */}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px" }}>
                    <h3 style={{ margin: 0, fontSize: isActive ? 13 : 12, fontWeight: 700, color: "#fff", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: isActive ? 2 : 1, WebkitBoxOrient: "vertical" as const, transition: "all 0.3s" }}>
                      {art.title}
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: isActive ? 2 : 1, WebkitBoxOrient: "vertical" as const, opacity: isActive ? 1 : 0.6, transition: "all 0.3s" }}>
                      {art.summary}
                    </p>
                    {isActive && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 3 }}>
                          <i className="ri-map-pin-line" />{art.category}
                        </span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "#5eead4", fontWeight: 500, display: "flex", alignItems: "center", gap: 2 }}>
                          查看详情 <i className="ri-arrow-right-line" style={{ fontSize: 10 }} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 左箭头 */}
        <button
          className="group-hover:opacity-100"
          onClick={() => setFeatIdx((p) => (p - 1 + articles.length) % articles.length)}
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "1px solid #e2e8f0", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", opacity: 0, transition: "opacity 0.2s" }}
        >
          <i className="ri-arrow-left-s-line" style={{ fontSize: 18 }} />
        </button>
        {/* 右箭头 */}
        <button
          className="group-hover:opacity-100"
          onClick={() => setFeatIdx((p) => (p + 1) % articles.length)}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "1px solid #e2e8f0", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", opacity: 0, transition: "opacity 0.2s" }}
        >
          <i className="ri-arrow-right-s-line" style={{ fontSize: 18 }} />
        </button>

        {/* 指示点 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 12, paddingTop: 4 }}>
          {articles.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setFeatIdx(idx)}
              style={{ height: 6, width: featIdx === idx ? 20 : 6, borderRadius: 999, border: "none", cursor: "pointer", background: featIdx === idx ? "#14b8a6" : "#cbd5e1", transition: "all 0.3s", padding: 0 }}
            />
          ))}
        </div>
      </div>

      <RssNewsDetailPanel article={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
