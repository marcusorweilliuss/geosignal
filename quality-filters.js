// Centralized quality filters used by both the ingest layer and the
// /api/news output. Avoids circular imports between db.js (storage)
// and ingest.js (fetching).

const BLOCKED_NON_NEWS_HOSTS = new Set([
  'youtube.com', 'youtu.be', 'm.youtube.com',
  'reddit.com', 'old.reddit.com', 'np.reddit.com',
  'twitter.com', 'x.com', 't.co',
  'facebook.com', 'm.facebook.com', 'fb.com',
  'instagram.com', 'tiktok.com',
  'linkedin.com', 'lnkd.in',
  'wikipedia.org', 'wikimedia.org', 'simple.wikipedia.org',
  'medium.com', 'substack.com',
  'pinterest.com', 'tumblr.com',
  'quora.com', 'stackoverflow.com', 'stackexchange.com',
  'github.com', 'gist.github.com',
  'amazon.com', 'amazon.co.uk',
  'imdb.com', 'rotten.com', 'metacritic.com',
  'discord.com', 'telegram.org', 't.me',
  'soundcloud.com', 'spotify.com', 'apple.com'
]);

const PRODUCT_PATH_PATTERNS = [
  /\/product\//i,
  /\/products\//i,
  /\/listing\//i,
  /\/itm\//i,
  /\/dp\/[A-Z0-9]/,
  /\/p\/[A-Z0-9-]/,
  /\/shop\//i,
  /\/buy\//i,
  /\/store\//i,
  /\/cart\//i,
  /pcs-/i,
  /-stickers?-/i,
  /-decals?-/i,
  /-mug(?:s)?-/i
];

const PRODUCT_TITLE_PATTERNS = [
  /\b\d+\s*pcs\b/i,
  /\bdiy\s+\w+\s+(?:pens?|stickers?|decals?|mug|cup|tape)/i,
  /\b(?:vinyl|decorative|personalized|adorable|ceramic)\s+(?:stickers?|decals?|mug|cup|tape|pens?)\b/i,
  /\bpress\s+type\b/i,
  /\bcoffee\s+cup\b.*\b(?:personalized|ceramic)\b/i,
  /\b(?:order|buy)\s+now\b/i,
  /\bfree\s+shipping\b/i,
  /\$\d+(?:\.\d{2})?\b/,
  /\bon\s+sale\b/i,
  /\bbest\s+deals?\s+on\b/i
];

function isNonNewsUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (BLOCKED_NON_NEWS_HOSTS.has(host)) return true;
    for (const blocked of BLOCKED_NON_NEWS_HOSTS) {
      if (host === blocked || host.endsWith('.' + blocked)) return true;
    }
    const path = u.pathname || '';
    for (const re of PRODUCT_PATH_PATTERNS) {
      if (re.test(path)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function looksLikeProductSpam(title) {
  if (!title) return false;
  for (const re of PRODUCT_TITLE_PATTERNS) {
    if (re.test(title)) return true;
  }
  return false;
}

function isJunkArticle(article) {
  if (!article) return true;
  if (!article.title || !article.url) return true;
  if (isNonNewsUrl(article.url)) return true;
  if (looksLikeProductSpam(article.title)) return true;
  return false;
}

module.exports = {
  isNonNewsUrl,
  looksLikeProductSpam,
  isJunkArticle
};
