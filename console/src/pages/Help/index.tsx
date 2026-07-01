import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Spin, Tag } from "antd";
import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import {
  BookOpen,
  ChevronRight,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import type { ManualDocument, ManualSection } from "./types";
import styles from "./index.module.less";

const MANUAL_URL = `${import.meta.env.BASE_URL}manual/manual.json`;

function flattenToc(sections: ManualSection[]): ManualSection[] {
  return sections.filter((s) => s.level <= 2);
}

export default function HelpPage() {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [manual, setManual] = useState<ManualDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(MANUAL_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ManualDocument;
        if (!cancelled) {
          setManual(data);
          setActiveId(data.sections[0]?.id ?? "");
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!manual) return [];
    const q = query.trim().toLowerCase();
    if (!q) return manual.sections;
    return manual.sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q),
    );
  }, [manual, query]);

  const toc = useMemo(
    () => (manual ? flattenToc(manual.sections) : []),
    [manual],
  );

  const scrollToSection = useCallback((id: string) => {
    setActiveId(id);
    const el = document.getElementById(`manual-section-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (!manual || !contentRef.current) return;
    const root = contentRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target.getAttribute("data-section-id");
        if (id) setActiveId(id);
      },
      { root, rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    manual.sections.forEach((s) => {
      const node = document.getElementById(`manual-section-${s.id}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [manual, filtered]);

  if (loading) {
    return (
      <div className={`${styles.page} ${isDark ? styles.dark : ""}`}>
        <div className={styles.centerState}>
          <Spin size="large" />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (error || !manual) {
    return (
      <div className={`${styles.page} ${isDark ? styles.dark : ""}`}>
        <div className={styles.centerState}>
          <FileText size={40} strokeWidth={1.5} />
          <p>{t("help.loadError", "无法加载操作手册")}</p>
          <span className={styles.muted}>{error}</span>
        </div>
      </div>
    );
  }

  const updatedLabel = manual.updatedAt
    ? new Date(manual.updatedAt).toLocaleString()
    : "";

  return (
    <div className={`${styles.page} ${isDark ? styles.dark : ""}`}>
      <span className={styles.orbA} aria-hidden />
      <span className={styles.orbB} aria-hidden />

      <motion.header
        className={styles.hero}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={styles.heroIcon}>
          <BookOpen size={22} strokeWidth={2} />
          <Sparkles size={14} className={styles.heroSpark} />
        </div>
        <div className={styles.heroText}>
          <h1>{manual.title || t("nav.userManual", "用户手册")}</h1>
          <p>{t("help.subtitle", "系统功能说明与操作指引")}</p>
        </div>
        <div className={styles.heroMeta}>
          {manual.sourceFile ? (
            <Tag bordered={false} className={styles.metaTag}>
              {manual.sourceFile}
            </Tag>
          ) : null}
          {updatedLabel ? (
            <span className={styles.muted}>
              {t("help.updatedAt", "更新")}: {updatedLabel}
            </span>
          ) : null}
        </div>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <Input
            allowClear
            placeholder={t("help.searchPlaceholder", "搜索章节或关键词…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </motion.header>

      <div className={styles.layout}>
        <aside className={styles.tocPanel}>
          <div className={styles.tocTitle}>{t("help.toc", "目录")}</div>
          <nav className={styles.tocList}>
            {toc.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.tocItem} ${styles[`level${item.level}`]} ${
                  activeId === item.id ? styles.tocActive : ""
                }`}
                onClick={() => scrollToSection(item.id)}
              >
                <ChevronRight size={14} />
                <span>{item.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div ref={contentRef} className={styles.contentPanel}>
          {filtered.length === 0 ? (
            <div className={styles.emptySearch}>
              {t("help.noResults", "未找到匹配内容")}
            </div>
          ) : (
            filtered.map((section, idx) => (
              <motion.article
                key={section.id}
                id={`manual-section-${section.id}`}
                data-section-id={section.id}
                className={`${styles.sectionCard} ${styles[`heading${section.level}`]}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: Math.min(idx * 0.04, 0.4),
                }}
              >
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                <div className={styles.markdown}>
                  <ReactMarkdown>{section.content || ""}</ReactMarkdown>
                </div>
              </motion.article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
