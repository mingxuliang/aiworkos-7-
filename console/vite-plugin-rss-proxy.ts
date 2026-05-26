import type { Connect, Plugin } from "vite";

const UA =
  "Mozilla/5.0 (compatible; AIWorkOS-RSS/1.0; +https://github.com/agentscope-ai)";

/** 允许代理的 RSS 域名（与 newsRss.ts FEEDS 同步） */
export const RSS_ALLOWED_HOSTS = new Set([
  "www.qbitai.com",
  "www.infoq.cn",
  "sspai.com",
  "openai.com",
  "hnrss.org",
  "rss.arxiv.org",
  "api.bilibili.com",
]);

function rssProxyMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== "GET" || !req.url?.startsWith("/rss-proxy")) {
      next();
      return;
    }
    try {
      const q = new URL(req.url, "http://127.0.0.1");
      const target = q.searchParams.get("url");
      if (!target) {
        res.statusCode = 400;
        res.end("missing url");
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        res.statusCode = 400;
        res.end("invalid url");
        return;
      }
      if (parsed.protocol !== "https:" || !RSS_ALLOWED_HOSTS.has(parsed.hostname)) {
        res.statusCode = 403;
        res.end("host not allowed");
        return;
      }

      const upstream = await fetch(target, {
        headers: {
          "User-Agent": UA,
          Accept:
            "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") ||
          "application/xml; charset=utf-8",
      );
      res.setHeader("Cache-Control", "public, max-age=300");
      res.end(body);
    } catch (err) {
      res.statusCode = 502;
      res.end(err instanceof Error ? err.message : "rss proxy error");
    }
  };
}

/** 开发环境同源 RSS 代理，避免依赖 allorigins / rss2json */
export function rssProxyPlugin(): Plugin {
  return {
    name: "rss-proxy",
    configureServer(server) {
      server.middlewares.use(rssProxyMiddleware());
    },
  };
}
