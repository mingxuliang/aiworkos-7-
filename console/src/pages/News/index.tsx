import { useState, useEffect, useCallback, useRef } from 'react';
import { CopawWorkbenchShell } from '@/components/CopawWorkbenchShell';
import {
  fetchNewsByCategory,
  fetchBiliVideos,
  clearNewsCache,
  timeAgo,
  NEWS_CATEGORIES,
  type NewsArticle,
  type VideoItem,
} from '@/api/modules/newsRss';
import RssNewsDetailPanel from '@/components/news/RssNewsDetailPanel';
import NewsCoverImage from '@/components/news/NewsCoverImage';

// ─── 色彩 / 工具 ──────────────────────────────────────────────────────────────

const SOURCE_BG: Record<string, string> = {
  '量子位': 'linear-gradient(135deg,#7c3aed,#5b21b6)',
  'OpenAI': 'linear-gradient(135deg,#10a37f,#047857)',
  'arXiv AI': 'linear-gradient(135deg,#b31b1b,#7f1d1d)',
  'InfoQ': 'linear-gradient(135deg,#0ea5e9,#0369a1)',
  '少数派': 'linear-gradient(135deg,#6366f1,#4338ca)',
  'Hacker News': 'linear-gradient(135deg,#ff6600,#c2410c)',
};

function PlaceholderCover({ source, title }: { source: string; title: string }) {
  const bg = SOURCE_BG[source] || 'linear-gradient(135deg,#475569,#1e293b)';
  const initials = source.slice(0, 2);
  return (
    <div style={{ width: '100%', height: '100%', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff' }}>{initials}</div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', margin: 0, lineHeight: 1.4, WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, display: '-webkit-box', overflow: 'hidden' }}>{title}</p>
    </div>
  );
}

// ─── Skeleton 占位 ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#fff' }}>
      <div style={{ height: 160, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 14, borderRadius: 6, background: '#f1f5f9', width: '90%' }} />
        <div style={{ height: 14, borderRadius: 6, background: '#f1f5f9', width: '70%' }} />
        <div style={{ height: 11, borderRadius: 4, background: '#f8fafc', width: '50%', marginTop: 4 }} />
      </div>
    </div>
  );
}

// ─── Hero 封面 ────────────────────────────────────────────────────────────────

function HeroCard({ article, onClick }: { article: NewsArticle; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', height: 340, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.14)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.08)')}
    >
      {article.thumbnail ? (
        <NewsCoverImage
          url={article.thumbnail}
          alt={article.title}
          fallback={<PlaceholderCover source={article.source} title={article.title} />}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s' }}
        />
      ) : (
        <PlaceholderCover source={article.source} title={article.title} />
      )}
      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)' }} />
      {/* Top badges */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6 }}>
        <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>封面</span>
        <span style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 10, padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.3)' }}>{article.source}</span>
      </div>
      {/* Bottom content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 20px 20px' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 6, display: 'block' }}>{article.category} · {timeAgo(article.pubDate)}</span>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{article.title}</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{article.summary}</p>
      </div>
    </div>
  );
}

// ─── 新闻卡片 ─────────────────────────────────────────────────────────────────

function NewsCard({ article, featured = false, onClick }: { article: NewsArticle; featured?: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const coverH = featured ? 200 : 160;

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        border: `1px solid ${hovered ? '#cbd5e1' : '#e2e8f0'}`,
        background: '#fff',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {/* Cover */}
      <div style={{ position: 'relative', height: coverH, overflow: 'hidden', background: '#f1f5f9' }}>
        {article.thumbnail ? (
          <NewsCoverImage
            url={article.thumbnail}
            alt={article.title}
            fallback={<PlaceholderCover source={article.source} title={article.title} />}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s', transform: hovered ? 'scale(1.05)' : 'scale(1)' }}
          />
        ) : (
          <PlaceholderCover source={article.source} title={article.title} />
        )}
        <span
          style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)', color: article.sourceColor, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: `1px solid ${article.sourceColor}30` }}
        >{article.source}</span>
        <span
          style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 6 }}
        >{article.category}</span>
      </div>
      {/* Body */}
      <div style={{ padding: '12px 14px 14px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: featured ? 15 : 14, fontWeight: 600, lineHeight: 1.45, color: hovered ? '#0ea5e9' : '#1e293b', transition: 'color 0.2s', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
          {article.title}
        </h3>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
          {article.summary}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
          <span>{timeAgo(article.pubDate)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#0ea5e9' }}>
            <i className="ri-external-link-line" style={{ fontSize: 11 }} />阅读原文
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── 视频卡片 ─────────────────────────────────────────────────────────────────

function VideoCard({ video }: { video: VideoItem }) {
  const [playing, setPlaying] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  return (
    <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#fff', flexShrink: 0, width: 260 }}>
      {/* Thumbnail / Player */}
      <div style={{ position: 'relative', height: 150, background: '#0f172a', cursor: 'pointer' }} onClick={() => setPlaying(true)}>
        {playing ? (
          <iframe
            src={video.embedUrl}
            title={video.title}
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : (
          <>
            {video.thumbnail && !imgErr ? (
              <img src={video.thumbnail} alt={video.title} onError={() => setImgErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1e3a5f,#0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ri-video-line" style={{ fontSize: 32, color: 'rgba(255,255,255,0.3)' }} />
              </div>
            )}
            {/* Play overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', transition: 'transform 0.2s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.transform = 'scale(1.12)')}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.transform = 'scale(1)')}
              >
                <i className="ri-play-fill" style={{ fontSize: 20, color: '#ef4444', marginLeft: 2 }} />
              </div>
            </div>
            {/* B站 badge */}
            <span style={{ position: 'absolute', top: 8, left: 8, background: '#00aeec', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>B站</span>
          </>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '10px 12px 12px' }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{video.title}</h4>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <i className="ri-user-line" style={{ fontSize: 11 }} />{video.source}
          </span>
          <a href={video.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#00aeec', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
            <i className="ri-external-link-line" style={{ fontSize: 11 }} />去B站
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [category, setCategory] = useState('全部');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [selected, setSelected] = useState<NewsArticle | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const loadNews = useCallback(async (cat: string, force = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    if (force) clearNewsCache();
    try {
      if (cat === '视频') {
        setVideoLoading(true);
        const vids = await fetchBiliVideos();
        setVideos(vids);
        setVideoLoading(false);
        if (!vids.length) setError('Bilibili 视频加载失败（API 受限），请稍后重试');
      } else {
        const news = await fetchNewsByCategory(cat);
        setArticles(news);
        if (!news.length) setError('AI 资讯加载失败。请确认开发服务已启动（npm run dev），或后端已部署 /api/rss-proxy 后点击「刷新」');
      }
      setLastUpdated(new Date());
    } catch (e) {
      setError('数据加载失败，请检查网络后重试');
      console.error(e);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // 初次加载同时预取视频
  useEffect(() => {
    loadNews('全部');
    fetchBiliVideos().then(setVideos).catch(() => {});
  }, [loadNews]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    loadNews(cat);
  };

  const hero = articles[0] ?? null;
  const rest = articles.slice(1);

  return (
    <CopawWorkbenchShell>
      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>

      <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>

        {/* ── 页面标题 ── */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(14,165,233,0.3)', flexShrink: 0 }}>
            <i className="ri-newspaper-line" style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>新闻中心</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
              AI · 研发 · 学术 · 国际  ·  量子位 / OpenAI / InfoQ / arXiv 等（已过滤数码促销）
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                <i className="ri-time-line" style={{ marginRight: 3 }} />
                {lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新
              </span>
            )}
            <button
              onClick={() => loadNews(category, true)}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, color: '#64748b', transition: 'all 0.2s' }}
              onMouseEnter={e => !loading && ((e.currentTarget as HTMLButtonElement).style.background = '#f8fafc')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}
            >
              <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 13 }} />刷新
            </button>
          </div>
        </header>

        {/* ── 分类 Tab ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {NEWS_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              style={{
                padding: '6px 16px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s',
                background: category === cat ? '#0f172a' : '#f1f5f9',
                color: category === cat ? '#fff' : '#64748b',
                boxShadow: category === cat ? '0 2px 8px rgba(15,23,42,0.2)' : 'none',
              }}
            >
              {cat === '视频' && <i className="ri-bilibili-line" style={{ marginRight: 4 }} />}
              {cat}
            </button>
          ))}
        </div>

        {/* ── 错误提示 ── */}
        {error && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#c2410c' }}>
            <i className="ri-error-warning-line" />
            {error}
            <button onClick={() => loadNews(category, true)} style={{ marginLeft: 'auto', color: '#ea580c', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>重试</button>
          </div>
        )}

        {/* ══════════════════════ 视频分类 ══════════════════════ */}
        {category === '视频' && (
          videoLoading || loading ? (
            <div style={{ display: 'flex', gap: 16, overflow: 'hidden' }}>
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : videos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#94a3b8' }}>
              <i className="ri-video-off-line" style={{ fontSize: 36, display: 'block', marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>视频加载失败（B站 API 受限），请稍后重试</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#00aeec', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ri-bilibili-line" style={{ color: '#fff', fontSize: 14 }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Bilibili 科技视频</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>极客湾 · 差评 · 数字力场 · 科技美学 · 何同学</span>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {videos.map(v => <VideoCard key={v.bvid} video={v} />)}
              </div>
            </>
          )
        )}

        {/* ══════════════════════ 新闻列表 ══════════════════════ */}
        {category !== '视频' && (
          loading ? (
            <>
              {/* Hero skeleton */}
              <div style={{ borderRadius: 16, height: 340, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 24 }} />
              {/* Video strip skeleton */}
              <div style={{ height: 40, borderRadius: 8, background: '#f1f5f9', marginBottom: 12, width: 200 }} />
              <div style={{ display: 'flex', gap: 16, marginBottom: 28, overflow: 'hidden' }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ width: 260, height: 220, borderRadius: 12, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', flexShrink: 0 }} />)}
              </div>
              {/* Grid skeleton */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            </>
          ) : (
            <>
              {/* ── Hero ── */}
              {hero && (
                <div style={{ marginBottom: 28 }}>
                  <HeroCard article={hero} onClick={() => setSelected(hero)} />
                </div>
              )}

              {/* ── Bilibili 视频横条 ── */}
              {category === '全部' && videos.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: '#00aeec', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ri-bilibili-line" style={{ color: '#fff', fontSize: 13 }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Bilibili 科技视频</span>
                    <button onClick={() => { setCategory('视频'); loadNews('视频'); }} style={{ marginLeft: 'auto', fontSize: 12, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      查看全部 <i className="ri-arrow-right-line" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
                    {videos.slice(0, 6).map(v => <VideoCard key={v.bvid} video={v} />)}
                  </div>
                </div>
              )}

              {/* ── 新闻网格 ── */}
              {rest.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <i className="ri-newspaper-line" style={{ color: '#0ea5e9', fontSize: 14 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {category === '全部' ? '最新资讯' : `${category}资讯`}
                    </span>
                    <span style={{ fontSize: 11, color: '#cbd5e1', marginLeft: 4 }}>{rest.length} 篇</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
                    {rest.map((a, idx) => (
                      <NewsCard key={a.id} article={a} featured={idx === 0} onClick={() => setSelected(a)} />
                    ))}
                  </div>
                </>
              )}

              {/* ── 空状态 ── */}
              {!loading && articles.length === 0 && (
                <div style={{ textAlign: 'center', padding: '64px 0' }}>
                  <i className="ri-wifi-off-line" style={{ fontSize: 40, color: '#e2e8f0', display: 'block', marginBottom: 12 }} />
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#64748b', fontWeight: 600 }}>新闻加载失败</p>
                  <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8' }}>可能原因：代理服务繁忙 / 网络限制，请稍等片刻后刷新</p>
                  <button onClick={() => loadNews(category, true)}
                    style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#0ea5e9', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <i className="ri-refresh-line" />立即刷新
                  </button>
                </div>
              )}
            </>
          )
        )}

      </div>

      {/* ── 详情侧滑 ── */}
      <RssNewsDetailPanel article={selected} onClose={() => setSelected(null)} />
    </CopawWorkbenchShell>
  );
}
