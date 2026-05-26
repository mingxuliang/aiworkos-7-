import { useEffect, useRef, useState } from "react";
import { Drawer } from "antd";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, ImageIcon } from "lucide-react";
import type { NewsItem } from "./types";
import RichContent from "./RichContent";
import styles from "./index.module.less";

const TAG_CLASS: Record<string, string> = {
  important: styles.tagImportant,
  tech: styles.tagTech,
  announce: styles.tagAnnounce,
  data: styles.tagData,
};

interface NewsDetailDrawerProps {
  news: NewsItem | null;
  onClose: () => void;
}

export default function NewsDetailDrawer({ news, onClose }: NewsDetailDrawerProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProgress(0);
  }, [news?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !news) return;
    const onScroll = () => {
      const scrollHeight = el.scrollHeight - el.clientHeight;
      const pct =
        scrollHeight > 0 ? Math.round((el.scrollTop / scrollHeight) * 100) : 0;
      setProgress(pct);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [news]);

  return (
    <Drawer
      open={!!news}
      onClose={onClose}
      width={Math.min(640, window.innerWidth)}
      placement="right"
      closable={false}
      styles={{ body: { padding: 0 } }}
    >
      {news && (
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
          <div className={styles.detailProgress}>
            <div className={styles.detailProgressBar} style={{ width: `${progress}%` }} />
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
            <div className={styles.detailCover}>
              {news.coverImage ? (
                <img src={news.coverImage} alt={news.title} />
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                  <ImageIcon size={40} />
                </div>
              )}
              <div className={styles.detailCoverOverlay} />
              <button
                type="button"
                onClick={onClose}
                style={{
                  position: "absolute",
                  top: 16,
                  left: 16,
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ArrowLeft size={16} />
              </button>
              <div className={styles.detailCoverTitle}>
                <span className={`${styles.tag} ${TAG_CLASS[news.tagVariant]}`}>{news.tag}</span>
                <h1>{news.title}</h1>
              </div>
            </div>
            <div className={styles.detailAuthor}>
              <div className={styles.detailAuthorLeft}>
                <span className={styles.detailAvatar}>
                  {(news.author ?? "A").slice(0, 1)}
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{news.author ?? "QwenPaw"}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>
                    {news.date} · {news.readTime ?? t("workbench.news.readTimeDefault", "3 分钟")}
                  </p>
                </div>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                <Eye size={14} />
                {(news.views ?? 0).toLocaleString()}
              </span>
            </div>
            <div className={styles.detailBody}>
              <p className={styles.detailQuote}>{news.summary}</p>
              <RichContent content={news.content} />
              <div className={styles.detailFooter}>
                <span>QwenPaw · {t("workbench.news.hubTitle", "新闻中心")}</span>
                <span>
                  {t("workbench.news.readProgress", {
                    progress,
                    defaultValue: `已读 ${progress}%`,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
