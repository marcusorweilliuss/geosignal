// Fetch og:image (or first big <img>) from an article URL.
// Timeouts aggressively — we'd rather render a placeholder than
// stall the response. Caches in-memory by URL.

const fetch = require('node-fetch');

const ogCache = new Map();
const NEGATIVE_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day — don't retry failed URLs for a day
const POSITIVE_CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

// Realistic browser UA — some publishers serve different markup to
// scrapers vs browsers.
const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractOgImage(html) {
  if (!html) return null;
  // og:image (most reliable)
  const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
  if (og && og[1]) return og[1];
  // twitter:image as fallback
  const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (tw && tw[1]) return tw[1];
  // First big <img> in body
  const imgs = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
  for (const tag of imgs) {
    const m = tag.match(/src=["']([^"']+)["']/i);
    if (!m) continue;
    const src = m[1];
    if (/\.(png|jpe?g|webp)(\?|$)/i.test(src) && !src.includes('1x1') && !src.includes('pixel')) {
      return src;
    }
  }
  return null;
}

function absoluteUrl(maybeRelative, base) {
  if (!maybeRelative) return null;
  try { return new URL(maybeRelative, base).toString(); }
  catch { return null; }
}

async function fetchOgImage(articleUrl) {
  if (!articleUrl) return null;
  const cached = ogCache.get(articleUrl);
  if (cached) {
    const ttl = cached.value ? POSITIVE_CACHE_TTL : NEGATIVE_CACHE_TTL;
    if (Date.now() - cached.t < ttl) return cached.value;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': REAL_UA,
        'Accept': 'text/html,application/xhtml+xml,*/*'
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timer);
    if (!res.ok) {
      ogCache.set(articleUrl, { value: null, t: Date.now() });
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) {
      ogCache.set(articleUrl, { value: null, t: Date.now() });
      return null;
    }
    // node-fetch's .text() reads the whole body. og:image is in <head>
    // so most pages give us what we need within the first ~100KB. We
    // cap by Content-Length if the response is huge, otherwise read
    // full text — robust to whatever encoding/transport quirks.
    let html = '';
    try {
      html = await res.text();
      if (html.length > 200000) html = html.slice(0, 200000);
    } catch {
      ogCache.set(articleUrl, { value: null, t: Date.now() });
      return null;
    }
    const raw = extractOgImage(html);
    const abs = raw ? absoluteUrl(raw, articleUrl) : null;
    ogCache.set(articleUrl, { value: abs, t: Date.now() });
    return abs;
  } catch {
    ogCache.set(articleUrl, { value: null, t: Date.now() });
    return null;
  }
}

// Fetch og:images for a batch of URLs in parallel with a global
// time budget. Updates each article object in place with .thumbnail.
async function enrichWithOgImages(articles, { totalBudgetMs = 3500, concurrency = 10 } = {}) {
  const needing = articles.filter(a => a && !a.thumbnail && a.url);
  if (!needing.length) return;

  const start = Date.now();
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, needing.length) }, async () => {
    while (i < needing.length) {
      const myIdx = i++;
      const a = needing[myIdx];
      if (Date.now() - start > totalBudgetMs) return;
      const img = await fetchOgImage(a.url);
      if (img) a.thumbnail = img;
    }
  });
  await Promise.race([
    Promise.all(workers),
    new Promise(r => setTimeout(r, totalBudgetMs + 100))
  ]);
}

module.exports = { fetchOgImage, enrichWithOgImages };
