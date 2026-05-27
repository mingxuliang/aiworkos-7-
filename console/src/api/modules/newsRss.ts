/**
 * 新闻中心 - 中文 AI / 科技 RSS 聚合
 * 抓取：本地 /api/rss-proxy 或开发 /rss-proxy（主）→ allorigins（备）
 * 封面：优先 RSS 内嵌图片（雷锋网 / 钛媒体 / 爱范儿等）→ 文章页补图
 */

import { buildAuthHeaders } from '@/api/authHeaders';

const ALLORIGINS = 'https://api.allorigins.win/get?url=';
const RSS2JSON = 'https://api.rss2json.com/v1/api.json';
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_PREFIX = 'news_v6_';
const COVER_ENRICH_LIMIT = 18;
const COVER_CONCURRENCY = 4;

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  pubDate: string;
  link: string;
  thumbnail: string;
  author: string;
  source: string;
  sourceColor: string;
  category: string;
}

interface FeedSource {
  url: string;
  name: string;
  category: string;
  color: string;
  /** 混合类源：标题/摘要须含 AI 或研发信号 */
  strictAi?: boolean;
}

// ─── 中文 AI / 科技源（RSS 内嵌封面图）────────────────────────────────────────

const FEEDS: FeedSource[] = [
  { url: 'https://www.leiphone.com/feed', name: '雷锋网', category: 'AI', color: '#ea580c' },
  { url: 'https://www.tmtpost.com/rss.xml', name: '钛媒体', category: 'AI', color: '#2563eb', strictAi: true },
  { url: 'https://www.ifanr.com/feed', name: '爱范儿', category: '开发', color: '#059669', strictAi: true },
  { url: 'https://www.qbitai.com/feed', name: '量子位', category: 'AI', color: '#7c3aed' },
];

/** 商品 / 数码促销向标题，命中则丢弃 */
const PRODUCT_NOISE =
  /手机|旗舰|开箱|售价|优惠价|促销|降价|预售|上市|新品发布|首发|测评|体验评测|显卡|显示器|机械键盘|耳机|手表|平板|笔记本|车型|交付|充电|电池|相机|镜头|像素|元起|包邮|双十一|618|带货|直播卖|销量|出货量/i;

/** AI / 研发向信号（strictAi 源须命中其一） */
const AI_SIGNAL =
  /AI|人工智能|大模型|LLM|GPT|Claude|Gemini|Agent|智能体|机器学习|深度学习|神经网络|算法|开源|框架|Transformer|ChatGPT|OpenAI|Anthropic|Copilot|自动驾驶|NLP|计算机视觉|生成式|推理|训练|微调|RAG|embedding|论文|research|model|LLM|API|SDK|cloud|chip|semiconductor|robot|automation|data\s+science/i;

export const NEWS_CATEGORIES = ['全部', 'AI', '开发'];

/** 新闻全页刷新后通知岗位工作台同步 */
export const NEWS_REFRESH_EVENT = 'news-rss-refresh';
const NEWS_REFRESH_TS_KEY = 'news_refresh_ts';
const WORKBENCH_SNAPSHOT_KEY = 'news_workbench_snapshot';

export function notifyNewsRefresh(workbenchArticles?: NewsArticle[]) {
  const ts = Date.now();
  try {
    localStorage.setItem(NEWS_REFRESH_TS_KEY, String(ts));
    if (workbenchArticles?.length) {
      sessionStorage.setItem(
        WORKBENCH_SNAPSHOT_KEY,
        JSON.stringify({ ts, articles: workbenchArticles }),
      );
    }
  } catch {
    /**/
  }
  window.dispatchEvent(new CustomEvent(NEWS_REFRESH_EVENT, { detail: { ts } }));
}

export function readWorkbenchNewsSnapshot(): NewsArticle[] | null {
  try {
    const raw = sessionStorage.getItem(WORKBENCH_SNAPSHOT_KEY);
    if (!raw) return null;
    const { ts, articles } = JSON.parse(raw) as { ts?: number; articles?: NewsArticle[] };
    const refreshTs = Number(localStorage.getItem(NEWS_REFRESH_TS_KEY) || 0);
    if (!ts || ts !== refreshTs || !Array.isArray(articles) || !articles.length) return null;
    return articles;
  } catch {
    return null;
  }
}

export function subscribeNewsRefresh(callback: () => void): () => void {
  const onEvent = () => callback();
  const onStorage = (e: StorageEvent) => {
    if (e.key === NEWS_REFRESH_TS_KEY) callback();
  };
  window.addEventListener(NEWS_REFRESH_EVENT, onEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(NEWS_REFRESH_EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
  };
}

// ─── 缓存 ─────────────────────────────────────────────────────────────────────

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { ts, d } = JSON.parse(raw);
    return Date.now() - ts < CACHE_TTL ? (d as T) : null;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, d: T) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), d }));
  } catch {
    /**/
  }
}

export function clearNewsCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('news_'))
    .forEach((k) => localStorage.removeItem(k));
}

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) =>
      ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[
        m
      ] || m))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeImageUrl(url: string): string {
  if (!url) return '';
  let u = url.trim().replace(/&amp;/g, '&');
  if (u.startsWith('//')) u = `https:${u}`;
  return /^https?:\/\//i.test(u) ? u : '';
}

export function getNewsCoverCandidates(url: string): string[] {
  const direct = normalizeImageUrl(url);
  if (!direct) return [];
  const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(direct)}&w=800&h=450&fit=cover&output=jpg`;
  return direct === proxied ? [direct] : [direct, proxied];
}

function firstImg(html: string): string {
  if (!html) return '';
  const patterns = [
    /<img[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/i,
    /<img[^>]+srcset=["']([^"'\s,]+)/i,
    /src=["'](https?:\/\/[^"']+)["']/i,
    /src=["'](\/\/[^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const n = normalizeImageUrl(m[1]);
      if (n && !/logo|avatar|icon|favicon|placeholder/i.test(n)) return n;
    }
  }
  const bare = html.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/i);
  if (bare?.[0]) {
    const n = normalizeImageUrl(bare[0]);
    if (n && !/logo|avatar|icon|favicon|placeholder/i.test(n)) return n;
  }
  return '';
}

function extractCoverFromHtml(...parts: string[]): string {
  for (const part of parts) {
    const url = firstImg(part);
    if (url) return url;
  }
  return '';
}

function thumbFromElement(el: Element): string {
  const enc = el.querySelector('enclosure');
  if (enc) {
    const u = enc.getAttribute('url') || '';
    const type = enc.getAttribute('type') || '';
    if (u && (!type || type.startsWith('image'))) {
      const n = normalizeImageUrl(u);
      if (n) return n;
    }
  }
  for (const node of el.getElementsByTagName('*')) {
    const ln = node.localName?.toLowerCase();
    if (ln === 'thumbnail' || (ln === 'content' && node.getAttribute('medium') === 'image')) {
      const u = node.getAttribute('url') || node.getAttribute('href') || '';
      const n = normalizeImageUrl(u);
      if (n) return n;
    }
  }
  return '';
}

function isRelevantArticle(article: NewsArticle, src: FeedSource): boolean {
  const text = `${article.title} ${article.summary}`;
  if (PRODUCT_NOISE.test(text)) return false;
  if (src.strictAi && !AI_SIGNAL.test(text)) return false;
  return true;
}

function filterArticles(articles: NewsArticle[], src: FeedSource): NewsArticle[] {
  return articles.filter((a) => isRelevantArticle(a, src));
}

export function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day}天前`;
  return new Date(d).toLocaleDateString('zh-CN');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

function dedupeArticles(list: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = a.link || a.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 详情区是否展示 HTML 正文 */
export function hasReadableHtmlContent(content: string): boolean {
  if (!content?.trim()) return false;
  return /<(?:p|div|img|h[1-6]|ul|ol|blockquote)\b/i.test(content);
}

/** RSS 摘要仅为「跳转原文」占位文案 */
export function isPlaceholderSummary(summary: string): boolean {
  const text = stripHtml(summary).trim();
  if (!text) return true;
  return (
    /点击查看原文|点击阅读全文|阅读全文|Read more|Continue reading|View original/i.test(
      text,
    ) || text.length < 24
  );
}

/** 同源文章代理 URL，供详情 iframe 内嵌原文 */
export function getArticleProxyUrl(link: string): string {
  const q = encodeURIComponent(link);
  return `/api/article-proxy?url=${q}`;
}

async function fetchArticleCover(link: string): Promise<string> {
  try {
    const res = await withTimeout(
      fetch(`/api/article-cover?url=${encodeURIComponent(link)}`, {
        headers: buildAuthHeaders(),
      }),
      12_000,
    );
    if (!res.ok) return '';
    const data = (await res.json()) as { url?: string };
    return normalizeImageUrl(data.url || '');
  } catch {
    return '';
  }
}

async function enrichMissingCovers(articles: NewsArticle[]): Promise<NewsArticle[]> {
  const targets = articles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => !article.thumbnail && article.link)
    .slice(0, COVER_ENRICH_LIMIT);

  if (!targets.length) return articles;

  const enriched = [...articles];
  const queue = [...targets];

  async function worker() {
    while (queue.length) {
      const target = queue.shift();
      if (!target) break;
      const cover = await fetchArticleCover(target.article.link);
      if (cover) {
        enriched[target.index] = { ...enriched[target.index], thumbnail: cover };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(COVER_CONCURRENCY, targets.length) }, () => worker()),
  );
  return enriched;
}

// ─── XML 解析 ─────────────────────────────────────────────────────────────────

function parseRssXml(xml: string, src: FeedSource): NewsArticle[] {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = Array.from(doc.querySelectorAll('item, entry'));
    const mapped = nodes.slice(0, 15).map((el) => {
      const get = (sel: string) => el.querySelector(sel)?.textContent?.trim() || '';
      const getAttr = (sel: string, attr: string) =>
        el.querySelector(sel)?.getAttribute(attr) || '';

      const title = stripHtml(get('title'));
      const link = get('link') || getAttr('link', 'href') || get('guid') || '';
      const desc = get('description') || get('summary') || get('content') || '';
      const encoded =
        el.querySelector('content\\:encoded')?.textContent ||
        el.querySelector('encoded')?.textContent ||
        '';
      const raw = encoded || el.querySelector('content')?.innerHTML || desc;
      const date = get('pubDate') || get('published') || get('updated') || '';
      const guid = get('guid') || get('id') || link;

      let thumb =
        thumbFromElement(el) ||
        getAttr('enclosure', 'url') ||
        getAttr('media\\:content', 'url') ||
        getAttr('media\\:thumbnail', 'url') ||
        '';
      if (!thumb) thumb = extractCoverFromHtml(raw, desc, encoded);
      thumb = normalizeImageUrl(thumb);

      return {
        id: guid || title,
        title: title || '无标题',
        summary: stripHtml(desc).slice(0, 200),
        content: raw || desc,
        pubDate: date ? new Date(date).toISOString() : new Date().toISOString(),
        link,
        thumbnail: thumb,
        author: get('author name') || get('author') || get('dc\\:creator') || src.name,
        source: src.name,
        sourceColor: src.color,
        category: src.category,
      } satisfies NewsArticle;
    });
    return filterArticles(mapped, src);
  } catch {
    return [];
  }
}

// ─── 抓取（本地代理优先）──────────────────────────────────────────────────────

async function fetchFeedProxy(src: FeedSource): Promise<NewsArticle[]> {
  const paths = [
    `/rss-proxy?url=${encodeURIComponent(src.url)}`,
    `/api/rss-proxy?url=${encodeURIComponent(src.url)}`,
  ];
  let lastErr: Error | null = null;
  for (const path of paths) {
    try {
      const res = await fetch(path, {
        headers: path.startsWith('/api/') ? buildAuthHeaders() : undefined,
      });
      if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
      const xml = await res.text();
      if (!/<rss|<feed/i.test(xml)) throw new Error('not rss');
      const items = parseRssXml(xml, src);
      if (items.length) return items;
      throw new Error('empty after filter');
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('proxy failed');
}

async function fetchFeedAllorigins(src: FeedSource): Promise<NewsArticle[]> {
  const res = await fetch(ALLORIGINS + encodeURIComponent(src.url));
  if (!res.ok) throw new Error(`allorigins HTTP ${res.status}`);
  const { contents, status } = await res.json();
  if (status?.http_code && status.http_code >= 400) throw new Error(`upstream ${status.http_code}`);
  if (!contents) throw new Error('empty contents');
  return parseRssXml(contents, src);
}

async function fetchFeedRss2json(src: FeedSource): Promise<NewsArticle[]> {
  const url = `${RSS2JSON}?rss_url=${encodeURIComponent(src.url)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rss2json HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 'ok') throw new Error('rss2json: ' + json.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (json.items as any[]).slice(0, 15).map((item) => {
    let thumb = normalizeImageUrl(item.thumbnail || '');
    if (!thumb) thumb = extractCoverFromHtml(item.content, item.description);
    return {
      id: item.guid || item.link,
      title: stripHtml(item.title),
      summary: stripHtml(item.description).slice(0, 200),
      content: item.content || item.description,
      pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      link: item.link,
      thumbnail: thumb,
      author: item.author || src.name,
      source: src.name,
      sourceColor: src.color,
      category: src.category,
    } satisfies NewsArticle;
  });
  return filterArticles(mapped, src);
}

async function fetchFeed(src: FeedSource): Promise<NewsArticle[]> {
  const ck = btoa(src.url).replace(/=/g, '').slice(0, 16);
  const cached = cacheGet<NewsArticle[]>(ck);
  if (cached?.length) return cached;

  let articles: NewsArticle[] = [];
  const attempts: Array<() => Promise<NewsArticle[]>> = [
    () => withTimeout(fetchFeedProxy(src), 18_000),
    () => withTimeout(fetchFeedAllorigins(src), 12_000),
    () => withTimeout(fetchFeedRss2json(src), 12_000),
  ];

  for (const run of attempts) {
    if (articles.length) break;
    try {
      articles = await run();
    } catch (e) {
      console.warn(`[news] ${src.name} fetch attempt failed:`, e);
    }
  }

  if (articles.length) {
    articles = await enrichMissingCovers(articles);
    cacheSet(ck, articles);
  }
  return articles;
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

export async function fetchAllNews(): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const all: NewsArticle[] = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') all.push(...r.value);
  });
  return dedupeArticles(all).sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
}

function sortNewsCoverFirst(list: NewsArticle[]): NewsArticle[] {
  return [...list].sort((a, b) => {
    const coverDiff = Number(!!b.thumbnail) - Number(!!a.thumbnail);
    if (coverDiff !== 0) return coverDiff;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
}

async function pickWorkbenchNewsFromAll(all: NewsArticle[], limit = 5): Promise<NewsArticle[]> {
  let sorted = sortNewsCoverFirst(all);
  let covered = sorted.filter((a) => a.thumbnail);

  if (covered.length < limit) {
    const candidates = sorted.filter((a) => !a.thumbnail && a.link).slice(0, Math.max(limit * 3, 12));
    if (candidates.length) {
      const enriched = await enrichMissingCovers(candidates);
      const enrichedMap = new Map(enriched.map((a) => [a.id, a]));
      sorted = sortNewsCoverFirst(sorted.map((a) => enrichedMap.get(a.id) || a));
      covered = sorted.filter((a) => a.thumbnail);
    }
  }

  if (covered.length >= limit) return covered.slice(0, limit);
  if (covered.length >= 3) return covered.slice(0, limit);
  const rest = sorted.filter((a) => !a.thumbnail);
  return [...covered, ...rest].slice(0, limit);
}

/** 岗位工作台：优先展示带封面的最新资讯 */
export async function fetchWorkbenchNews(limit = 5): Promise<NewsArticle[]> {
  return pickWorkbenchNewsFromAll(await fetchAllNews(), limit);
}

/** 强制刷新 RSS，并同步岗位工作台轮播数据 */
export async function refreshNewsWithWorkbenchSync(
  category = '全部',
): Promise<NewsArticle[]> {
  clearNewsCache();
  if (category === '全部') {
    const articles = await fetchAllNews();
    notifyNewsRefresh(await pickWorkbenchNewsFromAll(articles, 5));
    return articles;
  }
  const [articles, all] = await Promise.all([
    fetchNewsByCategory(category),
    fetchAllNews(),
  ]);
  notifyNewsRefresh(await pickWorkbenchNewsFromAll(all, 5));
  return articles;
}

export async function fetchNewsByCategory(cat: string): Promise<NewsArticle[]> {
  if (cat === '全部') return fetchAllNews();
  const sources = FEEDS.filter((f) => f.category === cat);
  if (!sources.length) return [];
  const results = await Promise.allSettled(sources.map(fetchFeed));
  const all: NewsArticle[] = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') all.push(...r.value);
  });
  return dedupeArticles(all).sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
}
