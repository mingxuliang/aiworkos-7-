import { useState } from "react";
import { Link } from "react-router-dom";
import { Drawer } from "antd";
import { useTranslation } from "react-i18next";
import { ArrowRight, ImageIcon, Newspaper, X } from "lucide-react";
import { newsData, NEWS_CATEGORIES } from "./newsData";
import type { NewsItem } from "./types";
import NewsDetailDrawer from "./NewsDetailDrawer";
import styles from "./index.module.less";

const TAG_CLASS: Record<string, string> = {
  important: styles.tagImportant,
  tech: styles.tagTech,
  announce: styles.tagAnnounce,
  data: styles.tagData,
};

/** Workbench floating news hub */
export default function NewsHub() {
  const { t } = useTranslation();
  const [newsFilter, setNewsFilter] = useState("all");
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const filteredNews =
    newsFilter === "all"
      ? newsData
      : newsData.filter((n) => n.category === newsFilter);

  const openDetail = (item: NewsItem) => {
    setSelectedNews(item);
    setListOpen(false);
  };

  return (
    <>
      <div className={styles.fabWrap}>
        <span className={styles.fabPulse} aria-hidden />
        <button
          type="button"
          className={styles.fabBtn}
          onClick={() => setListOpen(true)}
          aria-label={t("workbench.news.openHub")}
        >
          <Newspaper size={22} />
          <span className={styles.fabBadge}>{newsData.length}</span>
        </button>
        <span className={styles.fabTooltip}>
          {t("workbench.news.hubTitle")}
        </span>
      </div>

      <Drawer
        open={listOpen}
        onClose={() => setListOpen(false)}
        width={Math.min(520, window.innerWidth)}
        placement="right"
        closable={false}
        title={
          <div className={styles.drawerHeader}>
            <div className={styles.drawerHeaderMain}>
              <span className={styles.drawerIcon}>
                <Newspaper size={18} />
              </span>
              <div>
                <h2 className={styles.drawerTitle}>
                  {t("workbench.news.hubTitle")}
                </h2>
                <p className={styles.drawerSub}>
                  {t("workbench.news.hubSub", { count: newsData.length })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setListOpen(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>
        }
      >
        <div className={styles.categoryRow}>
          {NEWS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`${styles.catBtn} ${
                newsFilter === cat ? styles.catBtnActive : styles.catBtnIdle
              }`}
              onClick={() => setNewsFilter(cat)}
            >
              {cat === "all"
                ? t("workbench.news.all")
                : cat}
            </button>
          ))}
        </div>

        <div className={styles.newsList}>
          {filteredNews.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.newsCard}
              onClick={() => openDetail(item)}
            >
              <span className={styles.thumb}>
                {item.coverImage ? (
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    className={styles.thumbImg}
                  />
                ) : (
                  <span
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#e2e8f0",
                      color: "#94a3b8",
                    }}
                  >
                    <ImageIcon size={20} />
                  </span>
                )}
              </span>
              <span className={styles.cardBody}>
                <span className={styles.cardMeta}>
                  <span
                    className={`${styles.tag} ${TAG_CLASS[item.tagVariant]}`}
                  >
                    {item.tag}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.45 }}>{item.date}</span>
                </span>
                <p className={styles.cardTitle}>{item.title}</p>
                <p className={styles.cardSummary}>{item.summary}</p>
              </span>
              <ArrowRight size={18} style={{ opacity: 0.25, flexShrink: 0 }} />
            </button>
          ))}
          {filteredNews.length === 0 && (
            <p style={{ textAlign: "center", padding: 32, opacity: 0.45 }}>
              {t("workbench.news.empty")}
            </p>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <span>QwenPaw</span>
          <Link
            to="/news"
            className={styles.moreLink}
            onClick={() => setListOpen(false)}
          >
            {t("workbench.news.goFullPage")}{" "}
            <ArrowRight size={14} style={{ verticalAlign: "middle" }} />
          </Link>
        </div>
      </Drawer>

      <NewsDetailDrawer
        news={selectedNews}
        onClose={() => setSelectedNews(null)}
      />
    </>
  );
}

