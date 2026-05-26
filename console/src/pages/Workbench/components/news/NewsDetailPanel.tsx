import { useState, useEffect, useRef, useCallback } from "react";
import type { NewsItem } from "./types";

/** Map tagVariant to Tailwind colour classes */
const TAG_CLASSES: Record<string, { color: string; bg: string }> = {
  important: { color: "text-red-500",   bg: "bg-red-50 border-red-100" },
  tech:      { color: "text-sky-600",   bg: "bg-sky-50 border-sky-100" },
  announce:  { color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
  data:      { color: "text-teal-600",  bg: "bg-teal-50 border-teal-100" },
};

/** Render markdown-lite content with Tailwind */
function RichContentTw({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-4">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Bold heading: **xxx**
        if (/^\*\*(.+?)\*\*$/.test(trimmed)) {
          const title = trimmed.replace(/^\*\*|\*\*$/g, "");
          return (
            <h3 key={idx} className="text-[15px] font-bold text-slate-800 mt-6 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-teal-500 shrink-0" />
              {title}
            </h3>
          );
        }

        // List item: - xxx or 1. xxx
        if (/^[-\d]/.test(trimmed)) {
          const isOrdered = /^\d+\.\s/.test(trimmed);
          const text = trimmed.replace(/^[-\d]+\.\s*/, "");
          const parts = text.split(/(\*\*.+?\*\*)/g);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${isOrdered ? "bg-teal-400" : "bg-slate-300"}`} />
              <p className="text-[14px] text-slate-600 leading-7">
                {parts.map((part, pi) =>
                  /^\*\*(.+?)\*\*$/.test(part)
                    ? <strong key={pi} className="text-slate-800 font-semibold">{part.replace(/^\*\*|\*\*$/g, "")}</strong>
                    : <span key={pi}>{part}</span>
                )}
              </p>
            </div>
          );
        }

        // Regular paragraph with inline bold
        const parts = trimmed.split(/(\*\*.+?\*\*)/g);
        return (
          <p key={idx} className="text-[14px] text-slate-600 leading-7">
            {parts.map((part, pi) =>
              /^\*\*(.+?)\*\*$/.test(part)
                ? <strong key={pi} className="text-slate-800 font-semibold">{part.replace(/^\*\*|\*\*$/g, "")}</strong>
                : <span key={pi}>{part}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}

interface Props {
  news: NewsItem | null;
  onClose: () => void;
}

export default function NewsDetailPanel({ news, onClose }: Props) {
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Entry animation
  useEffect(() => {
    if (news) {
      const t = setTimeout(() => setIsVisible(true), 10);
      setProgress(0);
      return () => clearTimeout(t);
    }
    setIsVisible(false);
  }, [news?.id]);

  // Scroll progress
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !news) return;
    const onScroll = () => {
      const scrollHeight = el.scrollHeight - el.clientHeight;
      setProgress(scrollHeight > 0 ? Math.round((el.scrollTop / scrollHeight) * 100) : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [news]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // Body overflow lock
  useEffect(() => {
    if (!news) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [news]);

  if (!news) return null;

  const tagStyle = TAG_CLASSES[news.tagVariant] ?? { color: "text-slate-500", bg: "bg-slate-50 border-slate-100" };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-500 ${
          isVisible ? "bg-black/40 backdrop-blur-sm" : "bg-black/0 backdrop-blur-none"
        }`}
        onClick={handleClose}
      />

      {/* Sliding panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full max-w-[640px] z-50 bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.12)] flex flex-col transition-transform duration-500 ease-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-100 z-50">
          <div className="h-full bg-teal-500 transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">

          {/* Cover image */}
          <div className="relative h-[280px] overflow-hidden shrink-0">
            {news.coverImage ? (
              <img src={news.coverImage} alt={news.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                <i className="ri-image-line text-4xl text-slate-600" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />

            <button
              onClick={handleClose}
              className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            >
              <i className="ri-arrow-left-line text-sm" />
            </button>

            <button className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
              <i className="ri-share-forward-line text-sm" />
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold backdrop-blur-md bg-white/20 text-white border border-white/30">
                  {news.tag}
                </span>
                <span className="text-[11px] text-white/70 font-medium">{news.category}</span>
              </div>
              <h1 className="text-xl font-bold text-white leading-snug tracking-tight drop-shadow-lg">
                {news.title}
              </h1>
            </div>
          </div>

          {/* Author row */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-emerald-400 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {(news.author ?? "A").slice(0, 1)}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">{news.author ?? "AI 数字全景"}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{news.date} · {news.readTime ?? "3 分钟"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <i className="ri-eye-line" />
              <span>{(news.views ?? 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <div className="relative mb-8 pl-4 border-l-[3px] border-teal-400/60">
              <p className="text-[14px] text-slate-500 italic leading-7">{news.summary}</p>
            </div>

            <RichContentTw content={news.content} />

            {/* Actions */}
            <div className="mt-10 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-500 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50 transition-all">
                    <i className="ri-thumb-up-line" /><span>认同</span>
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-all">
                    <i className="ri-message-3-line" /><span>评论</span>
                  </button>
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-all">
                  <i className="ri-bookmark-line" /><span>收藏</span>
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-[11px] text-slate-400">
              <span>AI 数字全景系统 · 新闻中心</span>
              <span>已读 {progress}%</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-100 bg-white/80 backdrop-blur-md flex items-center justify-between">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors"
          >
            <i className="ri-arrow-go-back-line" />
            返回列表
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{progress}% 已读</span>
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="w-8 h-8 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 hover:bg-teal-100 transition-colors"
            >
              <i className="ri-arrow-up-line text-xs" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
