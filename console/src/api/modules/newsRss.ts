/**
 * 新闻中心 - AI / 科技 RSS 聚合
 * 抓取：本地 /api/rss-proxy 或开发 /rss-proxy（主）→ allorigins（备）
 * 过滤：剔除数码开箱、售价促销等商品向内容
 */

const ALLORIGINS = 'https://api.allorigins.win/get?url=';
const RSS2JSON = 'https://api.rss2json.com/v1/api.json';
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_PREFIX = 'news_v4_';

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
  /** HN 等源的讨论帖链接 */
  discussionLink?: string;
  /** HN 热度（分 / 评论数） */
  hnPoints?: number;
  hnComments?: number;
}

export interface VideoItem {
  bvid: string;
  title: string;
  thumbnail: string;
  author: string;
  pubDate: string;
  link: string;
  embedUrl: string;
  source: string;
}

interface FeedSource {
  url: string;
  name: string;
  category: string;
  color: string;
  /** 混合类源：标题/摘要须含 AI 或研发信号 */
  strictAi?: boolean;
}

// ─── AI / 科技源（无 IT之家、36氪 等数码促销源）──────────────────────────────

const FEEDS: FeedSource[] = [
  { url: 'https://www.qbitai.com/feed', name: '量子位', category: 'AI', color: '#7c3aed' },
  { url: 'https://openai.com/blog/rss.xml', name: 'OpenAI', category: 'AI', color: '#10a37f' },
  { url: 'https://rss.arxiv.org/rss/cs.AI', name: 'arXiv AI', category: '学术', color: '#b31b1b' },
  { url: 'https://www.infoq.cn/feed', name: 'InfoQ', category: '开发', color: '#0ea5e9', strictAi: true },
  { url: 'https://sspai.com/feed', name: '少数派', category: '开发', color: '#6366f1', strictAi: true },
  { url: 'https://hnrss.org/frontpage', name: 'Hacker News', category: '国际', color: '#ff6600', strictAi: true },
];

/** 商品 / 数码促销向标题，命中则丢弃 */
const PRODUCT_NOISE =
  /手机|旗舰|开箱|售价|优惠价|促销|降价|预售|上市|新品发布|首发|测评|体验评测|显卡|显示器|机械键盘|耳机|手表|平板|笔记本|车型|交付|充电|电池|相机|镜头|像素|元起|包邮|双十一|618|带货|直播卖|销量|出货量/i;

/** AI / 研发向信号（strictAi 源须命中其一） */
const AI_SIGNAL =
  /AI|人工智能|大模型|LLM|GPT|Claude|Gemini|Agent|智能体|机器学习|深度学习|神经网络|算法|开源|框架|Transformer|ChatGPT|OpenAI|Anthropic|Copilot|自动驾驶|NLP|计算机视觉|生成式|推理|训练|微调|RAG|embedding|论文|research|model|LLM|API|SDK|cloud|chip|semiconductor|robot|automation|data\s+science/i;

const BILI_CHANNELS = [
  { uid: '1484041659', name: '跟李沐学AI' },
  { uid: '517327666', name: '林粒粒呀' },
  { uid: '591977818', name: '南岭夜雨AI' },
];

export const NEWS_CATEGORIES = ['全部', 'AI', '开发', '学术', '国际', '视频'];

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
    /<img[^>]+src=["']([^"']+)["']/i,
    /<img[^>]+data-src=["']([^"']+)["']/i,
    /src=["'](https?:\/\/[^"']+)["']/i,
    /src=["'](\/\/[^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const n = normalizeImageUrl(m[1]);
      if (n) return n;
    }
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

/** 将 Hacker News RSS 元数据转为可读摘要，避免详情里重复堆 URL */
function normalizeArticle(
  article: NewsArticle,
  descHtml: string,
  commentsTag = '',
): NewsArticle {
  if (!/Article URL:/i.test(descHtml)) return article;

  const points = Number(descHtml.match(/Points:\s*(\d+)/i)?.[1] || 0);
  const commentCount = Number(descHtml.match(/#\s*Comments:\s*(\d+)/i)?.[1] || 0);
  const articleUrl =
    descHtml.match(/Article URL:.*?href="([^"]+)"/is)?.[1]?.trim() || article.link;
  const discussionUrl =
    commentsTag.trim() ||
    descHtml.match(/Comments URL:.*?href="([^"]+)"/is)?.[1]?.trim() ||
    '';

  const summary =
    points > 0 && commentCount > 0
      ? `Hacker News 热榜 · ${points} 分 · ${commentCount} 条讨论`
      : 'Hacker News 社区推荐的 AI / 技术热帖';

  return {
    ...article,
    link: articleUrl || article.link,
    summary,
    content: '',
    discussionLink: discussionUrl || undefined,
    hnPoints: points || undefined,
    hnComments: commentCount || undefined,
  };
}

/** 详情区是否展示 HTML 正文（排除 HN 元数据块） */
export function hasReadableHtmlContent(content: string): boolean {
  if (!content?.trim()) return false;
  if (/Article URL:/i.test(content)) return false;
  return /<(?:p|div|img|h[1-6]|ul|ol|blockquote)\b/i.test(content);
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
      const raw =
        getAttr('content\\:encoded, encoded', 'innerHTML') ||
        el.querySelector('content')?.innerHTML ||
        desc;
      const date = get('pubDate') || get('published') || get('updated') || '';
      const guid = get('guid') || get('id') || link;
      const commentsTag = get('comments');

      let thumb =
        thumbFromElement(el) ||
        getAttr('enclosure', 'url') ||
        getAttr('media\\:content', 'url') ||
        getAttr('media\\:thumbnail', 'url') ||
        '';
      if (!thumb) thumb = firstImg(raw) || firstImg(desc);
      thumb = normalizeImageUrl(thumb);

      const base: NewsArticle = {
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
      };
      return normalizeArticle(base, raw || desc, commentsTag);
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
      const res = await fetch(path);
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
    if (!thumb) thumb = firstImg(item.content) || firstImg(item.description);
    const base: NewsArticle = {
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
    };
    return normalizeArticle(base, item.content || item.description || '');
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

  if (articles.length) cacheSet(ck, articles);
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

function biliTitleOk(title: string): boolean {
  if (PRODUCT_NOISE.test(title)) return false;
  return AI_SIGNAL.test(title);
}

export async function fetchBiliVideos(): Promise<VideoItem[]> {
  const cached = cacheGet<VideoItem[]>('bili');
  if (cached?.length) return cached;

  const results = await Promise.allSettled(
    BILI_CHANNELS.map(async (ch) => {
      const res = await withTimeout(
        fetch(
          `https://api.bilibili.com/x/space/arc/search?mid=${ch.uid}&ps=6&pn=1&order=pubdate`,
        ),
        8_000,
      );
      if (!res.ok) throw new Error('bili HTTP ' + res.status);
      const json = await res.json();
      if (json.code !== 0) throw new Error('bili code ' + json.code);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((json.data?.list?.vlist as any[]) || [])
        .filter((v) => biliTitleOk(String(v.title || '')))
        .slice(0, 4)
        .map((v) => ({
          bvid: v.bvid as string,
          title: v.title as string,
          thumbnail: (v.pic as string)?.replace('http://', 'https://') || '',
          author: v.author as string,
          pubDate: new Date((v.created as number) * 1000).toISOString(),
          link: `https://www.bilibili.com/video/${v.bvid}`,
          embedUrl: `https://player.bilibili.com/player.html?bvid=${v.bvid}&autoplay=0&danmaku=0`,
          source: ch.name,
        })) as VideoItem[];
    }),
  );

  const all: VideoItem[] = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') all.push(...r.value);
  });
  const sorted = all.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
  if (sorted.length) cacheSet('bili', sorted);
  return sorted;
}
