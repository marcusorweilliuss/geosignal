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

// Detect publisher landing / section pages disguised as articles.
// Examples Perplexity has returned:
//   - "Ireland | The Times and The Sunday Times"
//   - "Politics — The Guardian"
//   - "Latest News - CNN International"
//
// Signals:
//   - Title is short and ends with " | <publisher>" or " - <publisher>"
//     where the right-hand side reads like an outlet name (3+ words,
//     contains keywords like "Times", "News", "Post", "Journal").
//   - Description is a generic site tagline ("Latest news, world news…").
const LANDING_PAGE_TITLE = /[\s—|\-–]\s*(?:The\s+)?(?:[A-Z][\w'’]*\s*){1,5}(?:Times|News|Post|Journal|Herald|Tribune|Standard|Guardian|Express|Reporter|Telegraph|Observer|Daily|Online|Network|Wire|Digest|Today|Mail|CNN|BBC|NBC|CBS|ABC|FT|WSJ|Bloomberg|Reuters|Politico|Axios|Vox)\b[^A-Za-z]*$/i;
// Titles like "Latest News", "Breaking News", "World News" — generic
// landing-page headlines that aren't actual stories.
const LANDING_PAGE_GENERIC_TITLE = /^(latest|breaking|top|today's?|world|sports?|business|politics|opinion)\s+news\b/i;
const LANDING_PAGE_DESC = /\b(latest\s+news|breaking\s+news|news\s+and\s+(?:analysis|opinion|reviews?))\b.*\b(world|business|sports|politics|opinion|reviews?)/i;

// Topic + section noun pairs. Catches things like:
//   "Lithium Archives", "News & Events", "Tech Stories", "Markets Coverage",
//   "Politics Hub", "Climate Updates", "Sports Live", "Business Latest"
const LANDING_PAGE_SECTION_TITLE = /^[A-Za-z][\w\s&'’\-,.]{0,40}\s+(archives?|index|hub|category|categories|topics?|stories|coverage|live|updates?|tag|tags|section|sections|latest|all\s+news|all\s+stories|news\s+(?:&|and)\s+events?|events?)\s*[:|\-—]?\s*$/i;

// Pure all-caps publisher / brand strings with no narrative content.
// Catches "ASEAN BERNAMA", "TRAVELANDTOURWORLD", "PHILIPPINE DAILY INQUIRER".
const LANDING_PAGE_ALLCAPS_BRAND = /^[A-Z][A-Z0-9 &.\-]{4,}$/;

function looksLikeLandingPage(article) {
  if (!article) return false;
  const title = String(article.title || '').trim();
  const desc = String(article.description || '').trim();
  const source = String(article.source || '').trim();
  if (!title) return false;
  if (title.length < 90 && LANDING_PAGE_TITLE.test(title)) return true;
  if (title.length < 60 && LANDING_PAGE_GENERIC_TITLE.test(title)) return true;
  if (LANDING_PAGE_DESC.test(desc)) return true;
  // Title is a section / archive page
  if (title.length < 60 && LANDING_PAGE_SECTION_TITLE.test(title)) return true;
  // Title is just the publisher name (case-insensitive, ignoring whitespace).
  // RSS feeds sometimes emit the outlet's homepage as an item.
  if (source && title.replace(/\s+/g, ' ').toLowerCase() === source.replace(/\s+/g, ' ').toLowerCase()) return true;
  // Title is an all-caps brand-string with no spaces or sentence structure.
  // Filters TRAVELANDTOURWORLD, ASEAN BERNAMA, etc. — but skip if the title
  // is a real all-caps news headline (≥6 words, contains a verb).
  const wordCount = title.split(/\s+/).length;
  if (wordCount <= 3 && LANDING_PAGE_ALLCAPS_BRAND.test(title)) return true;
  return false;
}

function isJunkArticle(article) {
  if (!article) return true;
  if (!article.title || !article.url) return true;
  if (isNonNewsUrl(article.url)) return true;
  if (looksLikeProductSpam(article.title)) return true;
  if (looksLikeLandingPage(article)) return true;
  return false;
}

module.exports = {
  isNonNewsUrl,
  looksLikeProductSpam,
  looksLikeLandingPage,
  isJunkArticle
};
