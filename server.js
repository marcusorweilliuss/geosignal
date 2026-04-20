require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');
const Parser = require('rss-parser');

const { SOURCES, getSourcesForRegion, scoreArticle, GOVERNMENT_CAVEAT, classifyArticleType, extractPrimaryCountry, getSourceDescription, SECTOR_KEYWORDS, getAllSourcesForBrowser, getSourceBias, getTierCategory } = require('./sources');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant';

// ── Groq with model fallback + key rotation ─────────────────────

const groqApiKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2
].filter(Boolean);

const groqClients = groqApiKeys.map(key => new Groq({ apiKey: key }));
let currentGroqIndex = 0;

async function groqChat(messages, options = {}) {
  const models = [GROQ_MODEL, GROQ_FALLBACK_MODEL];
  const config = {
    messages,
    temperature: options.temperature || 0.3,
    max_tokens: options.max_tokens || 600
  };

  for (let keyAttempt = 0; keyAttempt < groqClients.length; keyAttempt++) {
    const clientIdx = (currentGroqIndex + keyAttempt) % groqClients.length;
    const client = groqClients[clientIdx];

    for (const model of models) {
      try {
        return await client.chat.completions.create({ ...config, model });
      } catch (err) {
        if (err.status === 429) {
          console.log(`Groq key #${clientIdx + 1} rate limited on ${model}, trying next...`);
          continue;
        }
        console.log(`Groq error on ${model}: ${err.message}`);
        continue;
      }
    }
    console.log(`All models exhausted on Groq key #${clientIdx + 1}, rotating...`);
  }

  throw new Error('All Groq API keys and models are rate limited. Try again later.');
}

// ── Perplexity (sonar) for briefing generation ──────────────────
// Higher-quality, web-search-grounded briefings. Falls back to Groq
// in the /api/briefing handler if this call fails or times out.

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const PERPLEXITY_TIMEOUT_MS = 15000;

async function perplexityChat(messages, options = {}) {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || PERPLEXITY_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || PERPLEXITY_MODEL,
        messages,
        temperature: typeof options.temperature === 'number' ? options.temperature : 0.3,
        max_tokens: options.max_tokens || 900
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Perplexity ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Strips ```json ... ``` / ``` ... ``` fences that models sometimes wrap
// JSON output in. Returns the inner content or the original string if
// no fences are present.
function stripCodeFences(s) {
  if (!s) return s;
  let t = s.trim();
  // Opening fence with optional language
  t = t.replace(/^```(?:json|JSON)?\s*\n?/, '');
  // Closing fence
  t = t.replace(/\n?```\s*$/, '');
  return t.trim();
}

// ── Full Article Text Fetching ──────────────────────────────────
// Fetches the full article body from a URL, strips HTML, returns plain text

const articleTextCache = {};
const ARTICLE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function stripHtml(html) {
  // Remove script/style blocks entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  // Replace common block tags with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|blockquote)[^>]*>/gi, '\n');
  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  return text;
}

function extractArticleBody(html) {
  // Try to find <article> tag first (most news sites use this)
  let match = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (match) return stripHtml(match[1]);

  // Try common content div patterns
  const patterns = [
    /<div[^>]*class="[^"]*(?:article-body|story-body|post-content|entry-content|article-content|article__body|story-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i
  ];
  for (const pattern of patterns) {
    match = html.match(pattern);
    if (match) return stripHtml(match[1]);
  }

  // Fallback: find the largest cluster of <p> tags
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (paragraphs && paragraphs.length > 0) {
    return stripHtml(paragraphs.join('\n'));
  }

  // Last resort: strip entire page
  return stripHtml(html);
}

async function fetchFullArticleText(url) {
  if (!url) return '';

  // Check cache
  const cached = articleTextCache[url];
  if (cached && (Date.now() - cached.fetchedAt) < ARTICLE_CACHE_TTL) {
    return cached.text;
  }

  try {
    const response = await fetch(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GeoSignal/1.0)',
        'Accept': 'text/html'
      },
      redirect: 'follow'
    });

    if (!response.ok) return '';

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return '';

    const html = await response.text();
    let text = extractArticleBody(html);

    // Cap at 2000 characters
    if (text.length > 2000) {
      text = text.substring(0, 2000);
      // Cut at last complete sentence
      const lastPeriod = text.lastIndexOf('.');
      if (lastPeriod > 1500) text = text.substring(0, lastPeriod + 1);
    }

    articleTextCache[url] = { text, fetchedAt: Date.now() };
    return text;
  } catch (err) {
    return '';
  }
}

// ── Think Tank Cross-Referencing ────────────────────────────────
// Searches cached think-tank-academic articles for content related to a given article

function extractKeywords(title) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'it', 'its', 'not', 'no', 'as', 'if', 'so', 'up', 'out', 'about',
    'into', 'over', 'after', 'before', 'between', 'under', 'again', 'more',
    'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just', 'new',
    'says', 'said', 'also', 'how', 'why', 'what', 'when', 'where', 'who',
    'which', 'all', 'each', 'every', 'both', 'few', 'many', 'much', 'own',
    'being', 'amid', 'per', 'via', 'news', 'report', 'update', 'latest'
  ]);

  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function findRelatedThinkTankArticles(articleTitle, regionSlug, limit = 5) {
  const keywords = extractKeywords(articleTitle);
  if (keywords.length === 0) return [];

  // Get all think-tank-academic sources for this region + global + neighbors
  const thinkTankSources = [
    ...(SOURCES[regionSlug] || []),
    ...(SOURCES['global'] || [])
  ].filter(s => s.tier === 'think-tank-academic');

  // Collect cached articles from these sources
  const candidates = [];
  for (const source of thinkTankSources) {
    const cached = feedCache[source.rssUrl];
    if (!cached) continue;
    for (const article of cached.articles) {
      if (article.title?.toLowerCase().trim() === articleTitle.toLowerCase().trim()) continue;

      const articleWords = extractKeywords(article.title + ' ' + (article.description || ''));
      let matches = 0;
      for (const kw of keywords) {
        if (articleWords.includes(kw)) matches++;
      }

      // Lower threshold: 1 match qualifies but with scaled score
      if (matches >= 1) {
        candidates.push({
          title: article.title,
          source: article.source,
          description: (article.description || '').substring(0, 200),
          url: article.url,
          matchScore: matches
        });
      }
    }
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);

  // Deduplicate by title
  const seen = new Set();
  const unique = candidates.filter(c => {
    const key = c.title?.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, limit);
}

// ── RSS Feed Fetching with Cache ────────────────────────────────

const rssParser = new Parser({
  timeout: 5000,
  headers: { 'User-Agent': 'GeoSignal/1.0' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

// Extract a thumbnail URL from an RSS item, trying multiple patterns
function extractThumbnail(item) {
  // 1. media:content with image type
  if (item.mediaContent && Array.isArray(item.mediaContent)) {
    for (const mc of item.mediaContent) {
      const url = mc?.$?.url;
      const medium = mc?.$?.medium || '';
      const type = mc?.$?.type || '';
      if (url && (medium === 'image' || type.startsWith('image/') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) {
        return url;
      }
    }
  }

  // 2. media:thumbnail
  if (item.mediaThumbnail && Array.isArray(item.mediaThumbnail)) {
    for (const mt of item.mediaThumbnail) {
      const url = mt?.$?.url;
      if (url) return url;
    }
  }

  // 3. enclosure with image type
  if (item.enclosure) {
    const enc = item.enclosure;
    const type = enc.type || '';
    const url = enc.url;
    if (url && (type.startsWith('image/') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) {
      return url;
    }
  }

  // 4. First <img> in content:encoded, content, or description
  const html = item.contentEncoded || item.content || item.description || item.summary || '';
  const imgMatch = typeof html === 'string' && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) return imgMatch[1];

  return '';
}

// In-memory cache: { url: { articles: [], fetchedAt: timestamp } }
const feedCache = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── Generic Groq Response Cache ─────────────────────────────────
// Persistent cache (until server restart) for AI-generated content
// keyed by stable content hashes. Drastically cuts Groq token usage
// since the same articles are seen repeatedly across page loads.

const GROQ_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const groqCaches = {
  tldr: new Map(),       // key: article URL → { text, fetchedAt }
  briefing: new Map(),   // key: article URL → { data, fetchedAt }
  impact: new Map(),     // key: URL + profile hash → { data, fetchedAt }
  crossSector: new Map() // key: profile + article set hash → { data, fetchedAt }
};

// Bump this whenever TL;DR parsing logic changes to invalidate cached entries
// from previous versions that may have wrong summaries under right keys
const TLDR_CACHE_VERSION = 'v2-indexed';
const BRIEFING_CACHE_VERSION = 'v5-tight-bullets';

function cacheGet(bucket, key) {
  const entry = groqCaches[bucket]?.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > GROQ_CACHE_TTL) {
    groqCaches[bucket].delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(bucket, key, value) {
  const map = groqCaches[bucket];
  if (!map) return;
  map.set(key, { value, fetchedAt: Date.now() });
  // Keep each bucket bounded to prevent memory growth
  if (map.size > 500) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

// Cheap stable hash for profile + article set cache keys
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

async function fetchFeed(source) {
  const cached = feedCache[source.rssUrl];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
    return cached.articles;
  }

  try {
    const feed = await rssParser.parseURL(source.rssUrl);
    const articles = (feed.items || []).slice(0, 8).map(item => ({
      title: item.title || '',
      description: item.contentSnippet || item.content || item.summary || '',
      content: item.content || item.contentSnippet || item.summary || '',
      url: item.link || '',
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      source: source.name,
      sourceTier: source.tier,
      sourceCountry: source.country,
      region: source.region,
      thumbnail: extractThumbnail(item)
    }));

    feedCache[source.rssUrl] = { articles, fetchedAt: Date.now() };
    return articles;
  } catch (err) {
    if (cached) return cached.articles;
    return [];
  }
}

// Fetch multiple feeds with high concurrency
async function fetchFeeds(sources, maxConcurrent = 25) {
  const results = [];
  for (let i = 0; i < sources.length; i += maxConcurrent) {
    const batch = sources.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map(s => fetchFeed(s)));
    results.push(...batchResults.flat());
  }
  return results;
}

// ── Background Pre-fetching ─────────────────────────────────────
// Pre-fetches all feeds on startup and every 15 minutes so user requests are instant

let prefetchRunning = false;

async function prefetchAllFeeds() {
  if (prefetchRunning) return;
  prefetchRunning = true;
  const allSources = Object.values(SOURCES).flat();
  console.log(`Background: pre-fetching ${allSources.length} RSS feeds...`);
  const startTime = Date.now();

  // Fetch in large batches for speed
  for (let i = 0; i < allSources.length; i += 30) {
    const batch = allSources.slice(i, i + 30);
    await Promise.all(batch.map(s => fetchFeed(s)));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const cached = Object.keys(feedCache).length;
  console.log(`Background: pre-fetch complete — ${cached} feeds cached in ${elapsed}s`);
  prefetchRunning = false;
}

// Start pre-fetching after server boots, then every 15 minutes
setTimeout(() => prefetchAllFeeds(), 2000);
setInterval(() => prefetchAllFeeds(), CACHE_TTL);

// ── Region slug mapping ─────────────────────────────────────────

const regionSlugMap = {
  'Global': 'global',
  'Middle East': 'middle-east',
  'South Asia': 'south-asia',
  'Southeast Asia': 'southeast-asia',
  'Europe': 'europe',
  'Africa': 'africa',
  'Latin America': 'latin-america',
  'East Asia': 'east-asia',
  'North America': 'north-america',
  'Central Asia & Caucasus': 'central-asia-caucasus',
  'Oceania': 'oceania'
};

// ── Main News Endpoint (RSS-powered) ────────────────────────────

app.get('/api/news', async (req, res) => {
  try {
    const { region, regions, sectors, sourceTypes, profile: profileStr, search, articleTypes, locations, keywords, includeSources, excludeSources } = req.query;

    // Multi-region support. Accepts ?regions=A,B,C (preferred) or
    // ?region=A (single, back-compat). If Global is among the choices,
    // behaves the same as Global-only.
    const regionList = regions
      ? regions.split(',').map(s => s.trim()).filter(Boolean)
      : (region ? [region] : ['Global']);
    const includesGlobal = regionList.some(r => (r || '').toLowerCase() === 'global');
    const effectiveRegionList = includesGlobal ? ['Global'] : regionList;
    const regionSlug = regionSlugMap[effectiveRegionList[0]] || 'global';
    const regionSlugs = effectiveRegionList.map(r => regionSlugMap[r] || 'global');
    const typeList = sourceTypes ? sourceTypes.split(',') : ['Mainstream news', 'Independent journalism', 'Think tanks & academic'];
    const activeSectors = sectors ? sectors.split(',') : [];
    const searchTerms = search ? search.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1) : [];
    const activeArticleTypes = articleTypes
      ? articleTypes.split(',').map(t => t.trim()).filter(Boolean)
      : ['News', 'Analysis']; // default: News + Analysis, Opinion off
    // Free-text country/city filter — comma-separated terms. Each article
    // must mention at least one (case-insensitive) in title or description.
    const locationTerms = locations
      ? locations.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 1)
      : [];
    // Free-text keyword filter — comma-separated terms. Articles mentioning
    // any term are boosted (heavily in title, softly in description).
    const keywordTerms = keywords
      ? keywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 1)
      : [];
    // Source inclusion / exclusion lists (comma-separated source names).
    // If includeSources has any entries, ONLY those sources are kept.
    // excludeSources always filters out matching sources.
    const includeSet = includeSources
      ? new Set(includeSources.split(',').map(s => s.trim()).filter(Boolean))
      : null;
    const excludeSet = excludeSources
      ? new Set(excludeSources.split(',').map(s => s.trim()).filter(Boolean))
      : null;

    // Get filtered sources from registry
    // Union of sources across every selected region, deduped by RSS URL
    const seenRss = new Set();
    const sources = regionSlugs
      .flatMap(slug => getSourcesForRegion(slug, typeList))
      .filter(s => {
        if (!s || !s.rssUrl) return true;
        if (seenRss.has(s.rssUrl)) return false;
        seenRss.add(s.rssUrl);
        return true;
      });

    // Serve from cache first — only fetch uncached feeds
    const cachedArticles = [];
    const uncachedSources = [];

    sources.forEach(s => {
      const cached = feedCache[s.rssUrl];
      if (cached) {
        cachedArticles.push(...cached.articles);
      } else {
        uncachedSources.push(s);
      }
    });

    // Fetch only uncached feeds (fast since most are pre-cached)
    let freshArticles = [];
    if (uncachedSources.length > 0) {
      console.log(`Fetching ${uncachedSources.length} uncached feeds for ${region} (${cachedArticles.length} from cache)`);
      freshArticles = await fetchFeeds(uncachedSources);
    } else {
      console.log(`Serving ${cachedArticles.length} cached articles for ${region}`);
    }

    let allArticles = [...cachedArticles, ...freshArticles];

    // If searching, also pull from ALL cached feeds across every region
    if (searchTerms.length > 0) {
      Object.values(feedCache).forEach(cached => {
        if (cached.articles) allArticles.push(...cached.articles);
      });
    }

    // Parse user profile for scoring
    let userProfile = null;
    if (profileStr) {
      try { userProfile = JSON.parse(profileStr); } catch {}
    }

    // Deduplicate by title
    const seen = new Set();
    let unique = allArticles.filter(a => {
      const key = a.title?.toLowerCase().trim();
      if (!key || key.length < 10 || key === '[removed]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply search filter if present
    if (searchTerms.length > 0) {
      unique = unique.filter(a => {
        const text = ((a.title || '') + ' ' + (a.description || '') + ' ' + (a.source || '')).toLowerCase();
        return searchTerms.every(term => text.includes(term));
      });
    }

    // Apply source include/exclude filters (by publication name)
    if (includeSet && includeSet.size > 0) {
      unique = unique.filter(a => includeSet.has(a.source));
    }
    if (excludeSet && excludeSet.size > 0) {
      unique = unique.filter(a => !excludeSet.has(a.source));
    }

    // Apply location filter — article must mention at least one typed
    // country or city in title or description (case-insensitive). This is
    // the user's narrow-down-to-specific-places knob.
    if (locationTerms.length > 0) {
      unique = unique.filter(a => {
        const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
        return locationTerms.some(term => text.includes(term));
      });
    }

    // Apply sector filter — article must match at least one active sector's keywords
    // When every sector is selected we skip the filter (nothing to narrow);
    // otherwise require at least one sector-keyword match. Total-sector
    // count is tracked dynamically so adding new sectors doesn't require
    // touching the server.
    const totalSectorCount = Object.keys(SECTOR_KEYWORDS || {}).length;
    if (activeSectors.length > 0 && activeSectors.length < totalSectorCount) {
      // Build keyword list from only the active sectors. Sectors the
      // user typed as free-text ("Other" entries) have no pre-defined
      // keyword list, so we treat the sector label itself as the
      // match term.
      const activeSectorKeywords = activeSectors
        .flatMap(s => {
          const list = SECTOR_KEYWORDS[s];
          if (Array.isArray(list) && list.length) return list;
          return [s]; // custom sector: literal match
        })
        .map(k => String(k || '').toLowerCase())
        .filter(Boolean);

      if (activeSectorKeywords.length > 0) {
        unique = unique.filter(a => {
          const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
          return activeSectorKeywords.some(kw => text.includes(kw));
        });
      }
    }

    // Score, filter junk, and sort
    unique.forEach(a => {
      // For multi-region, score against every selected region and keep the best.
      a.score = regionSlugs.reduce((best, slug) => {
        const s = scoreArticle(a, slug, userProfile, activeSectors);
        return s > best ? s : best;
      }, -Infinity);
      if (!isFinite(a.score)) a.score = scoreArticle(a, regionSlug, userProfile, activeSectors);
      if (searchTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const titleMatches = searchTerms.filter(t => titleLower.includes(t)).length;
        a.score += titleMatches * 10;
      }
      if (locationTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const titleHit = locationTerms.some(term => titleLower.includes(term));
        if (titleHit) a.score += 15;
      }
      if (keywordTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let kwBoost = 0;
        for (const term of keywordTerms) {
          if (titleLower.includes(term)) kwBoost += 20;
          else if (descLower.includes(term)) kwBoost += 8;
        }
        a.score += Math.min(kwBoost, 50);
      }
    });
    // Remove junk articles (score -1)
    unique = unique.filter(a => a.score >= 0);

    // Classify article type + extract a primary country for each article
    unique.forEach(a => {
      a.articleType = classifyArticleType(a);
      a.country = extractPrimaryCountry(a);
    });

    // Apply article-type filter (defaults to News + Analysis)
    if (activeArticleTypes.length > 0 && activeArticleTypes.length < 3) {
      const allowed = new Set(activeArticleTypes);
      unique = unique.filter(a => allowed.has(a.articleType));
    }

    unique.sort((a, b) => b.score - a.score);

    // Map to card format. Strip HTML server-side so descriptions arrive
    // as clean text — prevents truncation from cutting mid-entity on
    // the client and keeps the payload lean.
    const articles = unique.slice(0, 40).map(article => {
      // Truncate description to the first sentence so the fallback TL;DR
      // is always a complete thought, never a mid-sentence cut.
      let desc = stripHtml(article.description || '');
      if (desc.length > 180) {
        const end = desc.slice(0, 220).search(/[.!?](?:\s|$)/);
        desc = end >= 40 ? desc.slice(0, end + 1) : desc.slice(0, 180).replace(/\s\S*$/, '') + '\u2026';
      }
      const body = stripHtml(article.content || article.description || '').slice(0, 600);
      return {
        title: article.title,
        source: article.source,
        sourceTier: article.sourceTier,
        publishedAt: article.publishedAt,
        description: desc,
        content: body,
        url: article.url,
        region: region || 'Global',
        isOfficial: article.sourceTier === 'government-official',
        score: article.score,
        thumbnail: article.thumbnail || '',
        articleType: article.articleType || 'News',
        country: article.country || '',
        sourceDescription: getSourceDescription(article.source)
      };
    });

    res.json({ articles, governmentCaveat: GOVERNMENT_CAVEAT });
  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── TL;DR Summaries ─────────────────────────────────────────────

app.post('/api/tldr', async (req, res) => {
  try {
    const { articles } = req.body;
    if (!articles || !articles.length) {
      return res.json({ summaries: [] });
    }

    // Check cache for each article — only hit Groq for ones we haven't seen
    const summaries = new Array(articles.length);
    const uncachedIndices = [];
    const uncachedArticles = [];

    articles.forEach((a, i) => {
      const key = TLDR_CACHE_VERSION + '::' + (a.url || a.title);
      const cached = cacheGet('tldr', key);
      if (cached) {
        summaries[i] = cached;
      } else {
        uncachedIndices.push(i);
        uncachedArticles.push(a);
      }
    });

    if (uncachedArticles.length === 0) {
      return res.json({ summaries });
    }

    const articleList = uncachedArticles.map((a, i) => {
      const officialNote = a.isOfficial ? ' [OFFICIAL GOVERNMENT SOURCE]' : '';
      return `[${i}] "${a.title}"${officialNote} — ${a.description || 'No description'}`;
    }).join('\n');

    const prompt = `You are a senior geopolitical intelligence analyst writing single-line briefing summaries for decision-makers.

RULES:
- ONE sentence per article. No exceptions. Never two sentences.
- Maximum 30 words. Cut ruthlessly.
- Lead with the most important fact or consequence, not background.
- Be specific: use country names, actor names, numbers, concrete outcomes.
- Do NOT say "amid tensions" or "raises concerns" — say what actually happened or will happen.
- For articles marked [OFFICIAL GOVERNMENT SOURCE], prepend "OFFICIAL:" and frame as a government claim.
- If the headline is vague, still extract the core signal and state it clearly.

Articles:
${articleList}

Respond with ONLY a JSON OBJECT where each key is the article index and each value is that article's one-sentence summary. Example for three articles: {"0": "Summary for article 0.", "1": "OFFICIAL: Summary for article 1.", "2": "Summary for article 2."}
You MUST include every index from 0 to ${uncachedArticles.length - 1}. Do not skip any. Do not reorder.
No other text, no markdown, no prose. Just the JSON object.`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 2500 }
    );

    const raw = chatCompletion.choices[0]?.message?.content || '{}';
    let freshMap = {};
    try {
      // Extract the JSON object from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        freshMap = JSON.parse(jsonMatch[0]);
      }
    } catch {
      freshMap = {};
    }

    // Map fresh results back by key (index) — robust to reordering
    Object.keys(freshMap).forEach(key => {
      const localIdx = parseInt(key, 10);
      const text = freshMap[key];
      if (isNaN(localIdx) || !text) return;
      const originalIndex = uncachedIndices[localIdx];
      const article = uncachedArticles[localIdx];
      if (originalIndex === undefined || !article) return;
      summaries[originalIndex] = text;
      const cacheKey = TLDR_CACHE_VERSION + '::' + (article.url || article.title);
      cacheSet('tldr', cacheKey, text);
    });

    res.json({ summaries });
  } catch (err) {
    console.error('TL;DR generation error:', err);
    res.status(500).json({ error: 'Failed to generate summaries', summaries: [] });
  }
});

// ── Intelligence Briefing ───────────────────────────────────────

// ── Perplexity briefing generator ───────────────────────────────
// Returns { briefing, citationMap } in the same shape as Groq so the
// /api/briefing handler can use either source transparently.
async function generateBriefingWithPerplexity({ title, articleContent, isOfficial, articleUrl }) {
  const systemPrompt = "You are a geopolitical intelligence briefer for busy professionals. Produce SHORT, BULLETED briefings — never essays, never flowing prose. Every bullet must be a concrete fact or insight with specific actors, numbers, dates, or places. No filler, no throat-clearing, no hedges like 'could potentially', 'some observers', 'it is important to note'. If you do not have a specific fact, do not write the bullet.";

  const userPrompt = `Produce a BULLETED intelligence briefing on the following news article. Use real-time information to enrich the analysis beyond the article where helpful.

Article title: ${title}
Article text: ${articleContent}

Return ONLY this JSON (no prose outside, no markdown fences):
{
  "what_happened": [
    "3-5 short bullets. Each bullet is ONE sentence, max 25 words, answering WHO did WHAT, WHEN, and the core factual claim with concrete figures, named actors, titles, or terms where present. Never generic — no 'officials', no 'a trade deal was reached' without saying what it covers. If the article is too thin for specifics, return exactly: ['Limited detail available — see original article for full context.']"
  ],
  "what_led_to_this": [
    "2-4 short bullets. Each bullet names a specific prior event with a specific date or period, explaining why this is happening now. No vague backgrounders."
  ],
  "what_experts_say": [
    "2-4 short bullets. Each bullet paraphrases a named analyst, think tank, official, or publication with a concrete position. Only cite real sources you actually know of — if none, return exactly: ['No substantive expert commentary available for this specific development.']"
  ],
  "why_it_matters": [
    "2-3 short bullets. Each bullet is a concrete strategic consequence — a specific sector, region, price, deadline, or actor that is affected. No abstract 'has significant implications'."
  ]
}

HARD RULES:
- Bullets must be declarative, complete sentences.
- Max 25 words per bullet. Aim for 12-20.
- Every bullet must contain at least one concrete noun (name, place, date, number, title).
- Do not repeat the same fact across sections.
- No bullet may start with "This", "It", "The situation", or any pronoun referring to the whole story — name the subject explicitly.
- Output only the JSON object. No preamble, no code fences.`;

  const completion = await perplexityChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.2, max_tokens: 900 }
  );

  const raw = completion?.choices?.[0]?.message?.content || '';
  const cleaned = stripCodeFences(raw);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Some models wrap the JSON in surrounding prose — try to extract the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Perplexity returned non-JSON output');
    parsed = JSON.parse(match[0]);
  }

  // Normalise each section into a bullet list. Accepts array-of-strings
  // (preferred) or a newline-separated string (tolerant fallback).
  const asBullets = (val) => {
    const lines = Array.isArray(val)
      ? val
      : String(val || '').split(/\n+/);
    return lines
      .map(s => String(s || '')
        .replace(/^\s*[-*\u2022]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .trim())
      .filter(Boolean);
  };

  const whatHappened = asBullets(parsed.what_happened);
  const whatLed = asBullets(parsed.what_led_to_this);
  const whatExperts = asBullets(parsed.what_experts_say);
  const whyMatters = asBullets(parsed.why_it_matters);

  if (!whatHappened.length || !whatLed.length || !whatExperts.length || !whyMatters.length) {
    throw new Error('Perplexity JSON is missing one or more required sections');
  }

  // Convert bullet arrays to "- item" lines so the client's formatBullets()
  // renders a proper <ul>, and the concise-mode CSS naturally hides all
  // but the first <li>.
  const bulletify = (arr) => arr.map(s => '- ' + s).join('\n');

  const expertsLabel = isOfficial
    ? 'WHAT THE GOVERNMENT IS CLAIMING AND ITS LIKELY STRATEGIC INTENT'
    : 'WHAT REGIONAL EXPERTS ARE SAYING';

  const briefingText =
    `WHAT HAPPENED:\n${bulletify(whatHappened)}\n\n` +
    `WHAT LED TO THIS:\n${bulletify(whatLed)}\n\n` +
    `${expertsLabel}:\n${bulletify(whatExperts)}\n\n` +
    `WHY THIS MATTERS:\n${bulletify(whyMatters)}`;

  // Perplexity returns a `search_results` array (objects with title + url +
  // date) and/or a `citations` array of URL strings. Prefer search_results
  // because it gives us titles. Map them to numeric tags [1], [2], ... so
  // inline numeric citations become clickable chips on the frontend.
  const searchResults = Array.isArray(completion.search_results)
    ? completion.search_results
    : [];
  const citationUrls = Array.isArray(completion.citations)
    ? completion.citations
    : searchResults.map(r => r && r.url).filter(Boolean);

  const citationMap = { 'Article': articleUrl || '' };
  citationUrls.forEach((url, i) => {
    if (url && typeof url === 'string') citationMap[String(i + 1)] = url;
  });

  // Build the richer "sources referenced" list the client renders.
  // For each numeric citation, we want a publication name, article
  // title (if known), and the URL.
  const sourcesList = citationUrls.map((url, i) => {
    const match = searchResults.find(r => r && r.url === url) ||
                  searchResults[i] || null;
    const title = (match && match.title) ? String(match.title) : '';
    const publication = prettyPublicationName(url) || title || ('Source ' + (i + 1));
    return {
      publication,
      title: title || 'Article',
      url
    };
  });

  return { briefing: briefingText, citationMap, citations: citationUrls, sourcesList };
}

// Derives a friendly publication name from a URL's hostname.
// "https://www.ft.com/content/abc" → "ft.com"
// "https://www.reuters.com/world/..." → "reuters.com"
// Falls back to empty string for garbage input.
function prettyPublicationName(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    let host = u.hostname || '';
    host = host.replace(/^www\./, '');
    // Strip an obvious "news." / "m." subdomain for cleaner output,
    // but leave brand-like subdomains (e.g. "theguardian.com").
    host = host.replace(/^(m|mobile|news|edition|amp)\./, '');
    return host;
  } catch {
    return '';
  }
}

// ── Groq briefing generator (existing implementation, extracted) ─
async function generateBriefingWithGroq({ title, source, articleContent, isOfficial, url, region, expertArticles }) {
  const hasExperts = expertArticles.length > 0;

  let expertContext = '';
  if (hasExperts && !isOfficial) {
    expertContext = '\n\nAVAILABLE EXPERT SOURCES — YOU MUST CITE AT LEAST 2 OF THESE IN YOUR BRIEFING:\n';
    expertArticles.forEach((ea) => {
      expertContext += `[${ea.source}] "${ea.title}" — ${ea.description}\n`;
    });
    expertContext += '\nMANDATORY: At least 2 bullets in your briefing (especially in "WHAT LED TO THIS" and "WHAT REGIONAL EXPERTS ARE SAYING" sections) MUST cite one of these expert sources by name. Paraphrase their analysis to inform your briefing — do not just cite [Article] for everything. Think tank analysis adds depth the article alone cannot provide.\n';
  }

  const citationTags = ['[Article]'];
  if (hasExperts) expertArticles.forEach(ea => citationTags.push(`[${ea.source}]`));
  const citationList = citationTags.join(', ');

  let expertSection, officialNote;
  if (isOfficial) {
    officialNote = '\nThis is an official government source. Distinguish claims from verified facts.';
    expertSection = `GOVERNMENT CLAIM & STRATEGIC INTENT:
- [What the government is asserting and why now.] [Article]
- [Target audience and likely strategic objective.] [Article]
- [Any tension with independent reporting.] [Article]`;
  } else if (hasExperts) {
    officialNote = '';
    expertSection = `WHAT REGIONAL EXPERTS ARE SAYING:
- [Expert perspective paraphrased from the think tank source.] [ExactSourceName]
- [Second expert view or divergence.] [ExactSourceName]`;
  } else {
    officialNote = '';
    expertSection = `WHAT REGIONAL EXPERTS ARE SAYING:
- [How regional analysts would likely view this.] [Article]
- [Any notable dissenting or contrarian view.] [Article]`;
  }

  const prompt = `You are a senior geopolitical intelligence analyst. Produce a tight, scannable briefing using bullet points. Every bullet must deliver a concrete insight — no filler, no vague language.${officialNote}

ARTICLE: ${title}
SOURCE: ${source}
TEXT: ${articleContent}${expertContext}

CITATION RULES — CRITICAL:
- Every bullet MUST end with a citation tag in square brackets showing where the information comes from
- Allowed citation tags: ${citationList}
- Use [Article] when the information comes from the article text itself
- Use the exact think tank name in brackets (e.g. [Brookings], [Carnegie India], [Chatham House]) when paraphrasing their view
- Each bullet can only have ONE citation at the end
- Never invent a source — only use tags from the allowed list
- Place the tag at the very end of the bullet, after the final period

Use EXACTLY this format. Each section: 2-3 bullet points, each bullet ONE line max. Use a dash (-) for bullets:

WHAT HAPPENED:
The WHAT HAPPENED bullets must collectively answer all of: WHO (named actors, organisations, countries — never generic like "the government" or "officials"), WHAT specifically happened (concrete event/decision with substantive content — never vague phrasing like "a trade deal was reached" without specifying what it covers), WHEN (specific date or timeframe), and the core factual claim (what was actually said, signed, announced, or changed, with figures and terms where available). Every bullet must be specific — no filler. If the article does not contain enough specific information to answer these questions, replace this entire section with a single bullet that reads exactly: "- Limited detail available — see original article for full context. [Article]" and nothing else.
- Key fact: specific named actors + what they did + when, with concrete figures or terms. [Article]
- Second specific fact (scope, conditions, counterparties, or immediate consequence). [Article]

WHAT LED TO THIS:
- Most important preceding event or structural cause. [Article]
- Second factor, if relevant. [Article]

${expertSection}

WHY THIS MATTERS:
- Biggest implication or second-order effect. [Article]
- Who else is affected and what to watch next. [Article]`;

  const chatCompletion = await groqChat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.4, max_tokens: 600 }
  );

  const briefing = chatCompletion.choices[0]?.message?.content || 'Unable to generate briefing.';

  const citationMap = { 'Article': url || '' };
  expertArticles.forEach(ea => {
    if (ea.source && ea.url) citationMap[ea.source] = ea.url;
  });

  return { briefing, citationMap };
}

app.post('/api/briefing', async (req, res) => {
  try {
    const { title, source, description, content, isOfficial, url, region } = req.body;

    // Return cached briefing if we've seen this article before.
    // Cache key is prefixed with the briefing-format version so bumping
    // the version (e.g. when switching providers) invalidates old entries.
    const cacheKey = BRIEFING_CACHE_VERSION + '::' + (url || title);
    const cached = cacheGet('briefing', cacheKey);
    if (cached) return res.json(cached);

    // Fetch full article text for richer analysis
    const fullText = url ? await fetchFullArticleText(url) : '';
    const articleContent = fullText || content || description || '';

    // Find related think tank articles from this region (used by Groq fallback)
    const regionSlug = regionSlugMap[region] || 'global';
    const expertArticles = findRelatedThinkTankArticles(title, regionSlug);

    let briefing, citationMap, source_provider;
    let expertSourcesForResponse = [];

    // Prefer Perplexity (sonar) for richer, web-grounded briefings.
    // Fall back to Groq if Perplexity fails, times out, or returns malformed JSON.
    let usedPerplexity = false;
    if (PERPLEXITY_API_KEY) {
      try {
        const pplx = await generateBriefingWithPerplexity({
          title, articleContent, isOfficial, articleUrl: url
        });
        briefing = pplx.briefing;
        citationMap = pplx.citationMap;
        // Build the "Sources Referenced" list from Perplexity's
        // search_results (title + url) with a friendly publication
        // name derived from the URL hostname. Keeps numeric inline
        // citations working while showing readable source names
        // in the collapsible sources list.
        expertSourcesForResponse = (pplx.sourcesList || []).map(s => ({
          source: s.publication,
          title: s.title || 'Article',
          url: s.url
        }));
        usedPerplexity = true;
        source_provider = 'perplexity';
      } catch (err) {
        console.error('Perplexity briefing failed, falling back to Groq:', err.message);
      }
    } else {
      console.warn('PERPLEXITY_API_KEY not set — using Groq for briefings.');
    }

    if (!usedPerplexity) {
      const groqResult = await generateBriefingWithGroq({
        title, source, articleContent, isOfficial, url, region, expertArticles
      });
      briefing = groqResult.briefing;
      citationMap = groqResult.citationMap;
      expertSourcesForResponse = expertArticles.map(ea => ({
        title: ea.title, source: ea.source, url: ea.url
      }));
      source_provider = 'groq';
    }

    // Build a metadata map for every source appearing in the response
    // (expertSources + citationMap numeric keys). The client uses this
    // to render the info popover next to each source name.
    const sourceMeta = {};
    const attachMeta = (name, url) => {
      if (!name || sourceMeta[name]) return;
      const desc = getSourceDescription(name);
      let country = '';
      let tier = '';
      // Scan SOURCES for a matching entry to pull country + tier
      for (const region of Object.keys(SOURCES)) {
        const hit = (SOURCES[region] || []).find(s => s.name === name);
        if (hit) {
          if (Array.isArray(hit.country) && hit.country.length) country = hit.country.join(', ');
          tier = hit.tier || '';
          break;
        }
      }
      sourceMeta[name] = {
        description: desc || '',
        country,
        bias: getSourceBias(name, tier),
        sourceType: getTierCategory(tier),
        url: url || ''
      };
    };
    (expertSourcesForResponse || []).forEach(es => attachMeta(es.source, es.url));

    const responsePayload = {
      briefing,
      isOfficial: !!isOfficial,
      expertSources: expertSourcesForResponse,
      citationMap,
      sourceMeta,
      fullTextAvailable: !!fullText,
      provider: source_provider
    };
    cacheSet('briefing', cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (err) {
    console.error('Briefing generation error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// ── Personalized Impact Analysis ────────────────────────────────
// Perplexity primary (web-grounded, higher quality), Groq fallback.
// Returns bullet-style IMPACT SUMMARY + WHAT TO WATCH sections.

const IMPACT_CACHE_VERSION = 'v2-perplexity-bullets';

function buildImpactProfileDesc(profile) {
  return [
    profile.role && `Role: ${profile.role}`,
    profile.industry && `Industry: ${profile.industry}`,
    profile.company && `Company: ${profile.company}`,
    profile.location && `Based in: ${profile.location}`,
    profile.focus && `Focus areas: ${profile.focus}`
  ].filter(Boolean).join(' | ');
}

async function generateImpactWithPerplexity({ title, source, articleContent, profile, expertArticles, url }) {
  const profileDesc = buildImpactProfileDesc(profile);

  let expertContext = '';
  if (expertArticles.length > 0) {
    expertContext = '\n\nAvailable expert sources you may cite by name:\n';
    expertArticles.forEach(ea => {
      expertContext += `- ${ea.source}: "${ea.title}" — ${ea.description}\n`;
    });
  }

  const systemPrompt = "You are a senior intelligence analyst writing personalised impact briefings for a specific professional. You produce SHORT, BULLETED output — never prose, never essays. Every bullet must contain a concrete mechanism, named actor, number, or date. No filler, no hedges, no generic 'this could affect your industry' language. If the reader's role is unusual, non-standard, or simply says 'Professional', base the analysis on their industry, company, location, and focus areas instead — never refuse to produce an analysis just because the role is unfamiliar. You have access to real-time information; use it to ground claims in specific recent context.";

  const userPrompt = `Assess how this news story specifically impacts the reader below. Be direct and specific to their role, industry, company (if given), and location. When a Company is listed, reason about that specific company's operations, revenue, regulatory exposure, or competitive position — grounded in the article or well-known public information, never fabricated details.

READER PROFILE: ${profileDesc}

ARTICLE: ${title} (${source})
ARTICLE TEXT: ${articleContent}${expertContext}

Return ONLY this JSON (no prose outside, no markdown fences):
{
  "relevance": "HIGH | MEDIUM | LOW — one word only",
  "impact_summary": [
    "2-4 short bullets. Each bullet names a specific mechanism by which this story affects this reader's role/industry/company/location. Specific actor, number, or policy lever in each bullet. Max 25 words per bullet."
  ],
  "what_to_watch": [
    "2-3 short bullets. Each bullet is a concrete upcoming trigger, date, data release, policy decision, or counterparty move to track. Not abstract — actionable."
  ]
}

HARD RULES:
- Bullets must be declarative, complete sentences.
- Max 25 words per bullet. Aim for 12-20.
- Every bullet must contain at least one concrete noun (named entity, date, number, deadline, figure, sector).
- No bullet may start with "This", "It", "The situation", or any vague pronoun.
- If the story genuinely doesn't affect this reader in a specific way, set relevance to LOW and return impact_summary bullets explaining WHY it's low-relevance for them specifically.
- Output ONLY the JSON object. No preamble, no code fences.`;

  const completion = await perplexityChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.2, max_tokens: 700 }
  );

  const raw = completion?.choices?.[0]?.message?.content || '';
  const cleaned = stripCodeFences(raw);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Perplexity impact returned non-JSON');
    parsed = JSON.parse(match[0]);
  }

  const asBullets = (val) => {
    const lines = Array.isArray(val) ? val : String(val || '').split(/\n+/);
    return lines
      .map(s => String(s || '').replace(/^\s*[-*\u2022]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean);
  };

  const summary = asBullets(parsed.impact_summary);
  const watch = asBullets(parsed.what_to_watch);
  if (!summary.length || !watch.length) throw new Error('Perplexity impact is missing bullets');

  const relevanceRaw = String(parsed.relevance || 'MEDIUM').toUpperCase().trim();
  const relevance = /^(HIGH|MEDIUM|LOW)$/.test(relevanceRaw) ? relevanceRaw : 'MEDIUM';

  const bulletify = (arr) => arr.map(s => '- ' + s).join('\n');
  const impact =
    `RELEVANCE:\n${relevance}\n\n` +
    `IMPACT SUMMARY:\n${bulletify(summary)}\n\n` +
    `WHAT TO WATCH:\n${bulletify(watch)}`;

  const citations = Array.isArray(completion.citations)
    ? completion.citations
    : (Array.isArray(completion.search_results) ? completion.search_results.map(r => r.url).filter(Boolean) : []);

  const citationMap = { 'Article': url || '', 'Profile': '' };
  citations.forEach((u, i) => {
    if (u && typeof u === 'string') citationMap[String(i + 1)] = u;
  });

  return { impact, relevance, citationMap };
}

async function generateImpactWithGroq({ title, source, articleContent, profile, expertArticles, url }) {
  const profileDesc = buildImpactProfileDesc(profile);

  let expertContext = '';
  if (expertArticles.length > 0) {
    expertContext = '\n\nAVAILABLE EXPERT SOURCES (cite these by name using [SourceName] tags):\n';
    expertArticles.forEach(ea => {
      expertContext += `- [${ea.source}]: "${ea.title}" — ${ea.description}\n`;
    });
  }

  const citationTags = ['[Article]', '[Profile]'];
  expertArticles.forEach(ea => citationTags.push(`[${ea.source}]`));
  const citationList = citationTags.join(', ');

  const prompt = `You are an analyst producing a tight, bulleted impact briefing. Every bullet must contain a concrete mechanism, named actor, number, or date. No filler, no hedges. If the reader's role is unusual or just says "Professional", base the analysis on their industry, company, location, and focus areas — never refuse to produce an analysis just because the role is unfamiliar.

PROFILE: ${profileDesc}
ARTICLE: ${title} (${source})
TEXT: ${articleContent}${expertContext}

CITATION RULES:
- Every bullet ends with ONE citation tag in square brackets.
- Allowed tags: ${citationList}
- [Article] = fact from the article. [Profile] = reasoning based on reader's profile. Named source = paraphrasing expert.

Use EXACTLY this format. Bullets with dashes (-), max 25 words each:

RELEVANCE:
[HIGH | MEDIUM | LOW]

IMPACT SUMMARY:
- Concrete mechanism affecting the reader's role/industry/company/location. [Article or Profile]
- Second specific mechanism. [Article or Profile]
- Third, if genuinely distinct. [Article or Profile]

WHAT TO WATCH:
- Specific trigger, date, or counterparty to track. [Article or Profile]
- Second actionable item. [Article or Profile]`;

  const chatCompletion = await groqChat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.3, max_tokens: 400 }
  );

  const impact = chatCompletion.choices[0]?.message?.content || 'Unable to generate impact analysis.';
  const relevanceMatch = impact.match(/RELEVANCE:\s*(HIGH|MEDIUM|LOW)/i);
  const relevance = relevanceMatch ? relevanceMatch[1].toUpperCase() : 'MEDIUM';

  const citationMap = { 'Article': url || '', 'Profile': '' };
  expertArticles.forEach(ea => {
    if (ea.source && ea.url) citationMap[ea.source] = ea.url;
  });

  return { impact, relevance, citationMap };
}

app.post('/api/impact', async (req, res) => {
  try {
    const { title, source, description, content, profile, url, region } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Profile required' });
    }
    // Role is optional. If the user left role blank or typed something
    // nonsensical, we still want to produce a useful impact analysis
    // based on whatever other fields they did fill in. Fall back to a
    // generic "Professional" label so the prompt always has a subject.
    const hasAnyField = profile.role || profile.industry ||
      profile.company || profile.location || profile.focus ||
      (Array.isArray(profile.industries) && profile.industries.length > 0);
    if (!hasAnyField) {
      return res.status(400).json({ error: 'Profile has no usable fields' });
    }
    if (!profile.role || !String(profile.role).trim()) {
      profile = { ...profile, role: 'Professional' };
    }

    const profileHash = hashString(JSON.stringify({
      role: profile.role, industry: profile.industry,
      company: profile.company,
      location: profile.location, focus: profile.focus
    }));
    const impactCacheKey = IMPACT_CACHE_VERSION + '::' + (url || title) + '::' + profileHash;
    const cachedImpact = cacheGet('impact', impactCacheKey);
    if (cachedImpact) return res.json(cachedImpact);

    const fullText = url ? await fetchFullArticleText(url) : '';
    const articleContent = fullText || content || description || '';

    const regionSlug = regionSlugMap[region] || 'global';
    const expertArticles = findRelatedThinkTankArticles(title, regionSlug);

    let result = null;
    let provider = 'groq';

    if (PERPLEXITY_API_KEY) {
      try {
        result = await generateImpactWithPerplexity({
          title, source, articleContent, profile, expertArticles, url
        });
        provider = 'perplexity';
      } catch (err) {
        console.error('Perplexity impact failed, falling back to Groq:', err.message);
        result = null;
      }
    }

    if (!result) {
      result = await generateImpactWithGroq({
        title, source, articleContent, profile, expertArticles, url
      });
      provider = 'groq';
    }

    const impactResponse = { ...result, provider };
    cacheSet('impact', impactCacheKey, impactResponse);
    res.json(impactResponse);
  } catch (err) {
    console.error('Impact analysis error:', err);
    res.status(500).json({ error: 'Failed to generate impact analysis' });
  }
});

// ── Source Stats Endpoint ───────────────────────────────────────

app.get('/api/sources/stats', (req, res) => {
  const stats = {};
  Object.keys(SOURCES).forEach(region => {
    stats[region] = SOURCES[region].length;
  });
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  res.json({ regions: stats, total, cachedFeeds: Object.keys(feedCache).length });
});

// Full list of sources with metadata for the source browser UI
app.get('/api/sources/list', (req, res) => {
  try {
    res.json({ sources: getAllSourcesForBrowser() });
  } catch (err) {
    console.error('Sources list error:', err);
    res.status(500).json({ error: 'Failed to list sources' });
  }
});

// Enrich a custom source from a URL or a publication name. Best-effort:
// tries to fetch the URL's title and meta description, then asks Groq
// to produce structured metadata (description / country / bias / type).
app.post('/api/enrich-source', async (req, res) => {
  try {
    const { url, name } = req.body || {};
    const trimmedUrl = (url || '').trim();
    const trimmedName = (name || '').trim();
    if (!trimmedUrl && !trimmedName) {
      return res.status(400).json({ error: 'Provide a URL or a publication name.' });
    }

    // Attempt a best-effort fetch to extract a title / meta description.
    let fetchedTitle = '';
    let fetchedDesc = '';
    let hostname = '';
    if (trimmedUrl) {
      try {
        const u = new URL(trimmedUrl);
        hostname = u.hostname.replace(/^www\./, '');
      } catch {}
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(trimmedUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (GeoSignal)', 'Accept': 'text/html' }
        });
        clearTimeout(timer);
        if (resp.ok) {
          const html = await resp.text();
          const titleMatch = html.match(/<title[^>]*>([^<]{3,200})<\/title>/i);
          if (titleMatch) fetchedTitle = titleMatch[1].trim();
          const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,400})["']/i) ||
                            html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{10,400})["']/i);
          if (descMatch) fetchedDesc = descMatch[1].trim();
        }
      } catch (e) {
        console.log('Enrich source URL fetch failed:', e.message);
      }
    }

    // Ask Groq for structured metadata. This is strictly JSON-only.
    const subject = trimmedName || fetchedTitle || hostname || trimmedUrl;
    const prompt = `Given this news publication: ${subject}${hostname ? ' (' + hostname + ')' : ''}${fetchedDesc ? '\n\nTheir own description: "' + fetchedDesc + '"' : ''}

Return ONLY a JSON object (no prose, no markdown) with these exact keys:
{
  "description": "One concise sentence describing what this outlet is and what it covers.",
  "country": "Country of origin (short — e.g. 'United States', 'India', 'Qatar'). Use 'Unknown' if genuinely unclear.",
  "bias": "Exactly one of: Far Left | Centre-Left | Centre | Centre-Right | Far Right | State Media | Non-partisan",
  "sourceType": "Exactly one of: Mainstream | Independent | Think Tank | Official"
}

If you genuinely don't know the outlet, return a best-effort description with bias 'Centre' and sourceType 'Independent'.`;

    let enriched = null;
    let parseNote = '';
    try {
      const completion = await groqChat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.1, max_tokens: 250 }
      );
      const raw = completion?.choices?.[0]?.message?.content || '';
      const cleaned = stripCodeFences(raw);
      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      }
      if (parsed) {
        const biasOptions = ['Far Left', 'Centre-Left', 'Centre', 'Centre-Right', 'Far Right', 'State Media', 'Non-partisan'];
        const typeOptions = ['Mainstream', 'Independent', 'Think Tank', 'Official'];
        enriched = {
          description: String(parsed.description || '').trim() || fetchedDesc || 'No description available.',
          country: String(parsed.country || '').trim() || 'Unknown',
          bias: biasOptions.includes(parsed.bias) ? parsed.bias : 'Centre',
          sourceType: typeOptions.includes(parsed.sourceType) ? parsed.sourceType : 'Independent'
        };
      }
    } catch (err) {
      parseNote = 'LLM enrichment failed: ' + err.message;
      console.error(parseNote);
    }

    const derivedName = trimmedName || fetchedTitle || hostname || trimmedUrl;
    const finalMeta = {
      name: derivedName.replace(/\s+\|\s+.*$/, '').trim() || derivedName,
      url: trimmedUrl,
      description: (enriched && enriched.description) || fetchedDesc || 'Could not fetch details — added with limited info.',
      country: (enriched && enriched.country) || 'Unknown',
      bias: (enriched && enriched.bias) || 'Centre',
      sourceType: (enriched && enriched.sourceType) || 'Independent',
      custom: true,
      enrichmentFailed: !enriched,
      addedAt: Date.now()
    };

    res.json({ source: finalMeta });
  } catch (err) {
    console.error('Enrich source error:', err);
    res.status(500).json({ error: 'Could not enrich source.' });
  }
});


// ── Annotate Mode — Term Explainer ──────────────────────────────

app.post('/api/annotate', async (req, res) => {
  try {
    const { term, headline, briefingText } = req.body;
    if (!term || term.length < 2) {
      return res.status(400).json({ error: 'Term too short' });
    }

    const prompt = `You are a plain-English explainer for a smart general audience. The user has highlighted a term while reading a news briefing. Explain that term in 1-2 sentences maximum, in the specific context of this article. Do not give a generic definition. Make it feel like a knowledgeable friend is explaining it. Never use jargon in your explanation. If the term is straightforward, keep it to one sentence.

Article headline: ${headline}
Briefing context: ${(briefingText || '').substring(0, 800)}

Term to explain: "${term}"`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 100 }
    );

    const explanation = chatCompletion.choices[0]?.message?.content || 'Could not explain this term.';
    res.json({ term, explanation: explanation.trim() });
  } catch (err) {
    console.error('Annotate error:', err.message);
    res.status(500).json({ error: 'Failed to generate explanation' });
  }
});

// ── Cross-Sector Analysis ───────────────────────────────────────
// Detects causal chains, shared entities, second-order effects, and
// contradictions across articles — personalized to the user's profile

app.post('/api/cross-sector', async (req, res) => {
  try {
    const { articles, profile, region } = req.body;
    if (!articles || articles.length < 3) {
      return res.json({ insights: [] });
    }

    const topArticles = articles.slice(0, 20);

    // Cache key: profile + region + sorted top article URLs. Same inputs
    // return the same insights without re-hitting Groq.
    const CS_CACHE_VERSION = 'v3-chains-all-types';
    const csKey = hashString(
      CS_CACHE_VERSION + '|' +
      (region || 'global') + '|' +
      JSON.stringify(profile || {}) + '|' +
      topArticles.map(a => a.url || a.title).sort().join('||')
    );
    const cachedCs = cacheGet('crossSector', csKey);
    if (cachedCs) return res.json(cachedCs);

    // Build a pool of think tank articles cached from the region's experts
    const regionSlug = (region || 'global').toLowerCase().replace(/\s+&?\s*/g, '-').replace('central-asia-caucasus', 'central-asia-caucasus');
    const regionKey = regionSlugMap[region] || 'global';
    const thinkTankSources = [
      ...(SOURCES[regionKey] || []),
      ...(SOURCES['global'] || [])
    ].filter(s => s.tier === 'think-tank-academic');

    const expertPool = [];
    for (const src of thinkTankSources) {
      const cached = feedCache[src.rssUrl];
      if (!cached) continue;
      for (const a of cached.articles.slice(0, 3)) {
        if (a.title && a.url) {
          expertPool.push({
            source: src.name,
            title: a.title,
            description: (a.description || '').substring(0, 150),
            url: a.url
          });
        }
      }
      if (expertPool.length >= 20) break;
    }

    // Build the list of allowed citation tags
    const citationTags = ['[Article]', '[Profile]'];
    const uniqueExpertNames = new Set();
    expertPool.forEach(e => uniqueExpertNames.add(e.source));
    uniqueExpertNames.forEach(name => citationTags.push(`[${name}]`));
    const citationList = citationTags.join(', ');

    // Give the AI short topic labels it can reference back by name
    const storyBlock = topArticles.map((a, i) => {
      const shortTitle = (a.title || '').substring(0, 120);
      return `<story id="${i + 1}" source="${a.source}">${shortTitle}</story>`;
    }).join('\n');

    let expertBlock = '';
    if (expertPool.length > 0) {
      expertBlock = '\n\nAVAILABLE THINK TANK / EXPERT SOURCES — CITE AT LEAST ONE IN EVERY INSIGHT:\n';
      expertPool.slice(0, 15).forEach(e => {
        expertBlock += `[${e.source}] "${e.title}" — ${e.description}\n`;
      });
    }

    const profileDesc = profile ? [
      profile.role && `Role: ${profile.role}`,
      profile.industry && `Industry: ${profile.industry}`,
      profile.location && `Based in: ${profile.location}`,
      profile.focus && `Focus areas: ${profile.focus}`
    ].filter(Boolean).join(' | ') : 'General reader';

    const prompt = `You are a senior intelligence analyst doing cross-sector pattern detection. Find NON-OBVIOUS connections between today's stories that a regular reader would miss. Be SPECIFIC and SUBSTANTIVE — name actual mechanisms, actors, numbers, and second-order effects.

READER PROFILE: ${profileDesc}
REGION FOCUS: ${region || 'Global'}

TODAY'S STORIES:
${storyBlock}${expertBlock}

Look for FOUR types of patterns:

1. CAUSAL CHAIN — Event in sector A drives event in sector B. Show the chain with arrows.
2. SHARED ENTITY — Same country/company/person appears across sectors, revealing a coordinated campaign or shifting strategy.
3. SECOND-ORDER EFFECT — Indirect downstream consequence the reader's work will feel.
4. CONTRADICTION — Two or more sources tell conflicting stories about the same thing.

CITATION RULES — CRITICAL:
- Every MECHANISM and TAKEAWAY line MUST end with a citation tag in square brackets
- Allowed citation tags: ${citationList}
- [Article] — when the claim comes directly from today's stories
- [Profile] — when reasoning is inferred from the reader's industry/role
- Think tank name in brackets — when paraphrasing expert analysis from the available sources above
- EACH INSIGHT should cite at least one think tank source when available — do not default to [Article] for everything
- Place the tag at the very end, after the final period

Produce 2-4 insights TOTAL. Use this EXACT format, no markdown, no asterisks, no code fences:

INSIGHT 1
TYPE: [CAUSAL CHAIN | SHARED ENTITY | SECOND-ORDER EFFECT | CONTRADICTION]
TOPIC: [Short topic, max 8 words. Actual subject matter — NEVER "Headline 1" or "Story A"]
STORIES: [Comma-separated actual subjects being connected]
CHAIN: [REQUIRED for every type. Produce a visual 3-5 node flow using "→" arrows. Each node should be 2-6 words max, naming concrete actors, places, or effects — no full sentences. No citation tag inside the chain. Tailor the chain shape to the TYPE:
  - CAUSAL CHAIN: event flow. e.g. "Red Sea attacks → Suez delays → LNG prices +12% → EU fuel costs rise"
  - SHARED ENTITY: the entity + contexts it appears in. e.g. "BlackRock → buys EU grid assets → backs Saudi AI fund → lobbies US Treasury"
  - SECOND-ORDER EFFECT: trigger to downstream impact. e.g. "US export controls → TSMC capex cut → Taiwan GDP dip → Asian chip supply tighter"
  - CONTRADICTION: the tension between claims. e.g. "Beijing says zero stimulus → PBoC cuts rates 25bp → mixed investor signal"
]
MECHANISM: [ONE sentence naming the specific mechanism: actors, numbers, dates, percentages. End with a citation tag. Example: "EU cut Russian oil cap to \$50 while India boosted imports 18%, arbitraging the gap. [Carnegie Endowment]"]
TAKEAWAY: [ONE sentence on what you should track, adjust, or reconsider. End with a citation tag. Example: "Watch Indian refinery throughput reports — arbitrage ends when capacity maxes out in Q2. [Profile]"]

CRITICAL RULES:
- MECHANISM and TAKEAWAY must NEVER repeat each other or the CHAIN
- Every MECHANISM and TAKEAWAY ends with exactly ONE citation tag
- Prefer think tank citations when experts are available — cite them by exact name
- CHAIN is REQUIRED for every insight — 3-5 arrow-separated short nodes, not prose
- Never write phrases like "for the [role] in [location]"
- Use REAL topic names, never "Headline 1"
- If you can't find 2 genuinely substantive patterns, return only 1`;

    // Prefer Perplexity (sonar) for web-grounded cross-sector pattern
    // detection. Fall back to Groq on failure, timeout, or empty parse.
    let raw = '';
    let providerUsed = 'groq';
    let perplexityCitations = [];
    if (PERPLEXITY_API_KEY) {
      try {
        const pplx = await perplexityChat(
          [
            { role: 'system', content: 'You are a senior geopolitical intelligence analyst producing cross-sector pattern detection. Use real-time web search when it helps name specific mechanisms, actors, numbers, and dates. Always be concrete — never vague. Output plain text exactly in the format requested, no markdown, no code fences.' },
            { role: 'user', content: prompt }
          ],
          { temperature: 0.25, max_tokens: 1200 }
        );
        raw = pplx?.choices?.[0]?.message?.content || '';
        // Perplexity returns a `citations` (or `search_results`) array we can
        // map to numeric citation tags so any inline [1], [2] references
        // become clickable chips on the frontend.
        perplexityCitations = Array.isArray(pplx.citations)
          ? pplx.citations
          : (Array.isArray(pplx.search_results) ? pplx.search_results.map(r => r.url).filter(Boolean) : []);
        if (raw && /INSIGHT\s+\d+/i.test(raw)) {
          providerUsed = 'perplexity';
        } else {
          throw new Error('Perplexity returned no parseable INSIGHT blocks');
        }
      } catch (err) {
        console.error('Perplexity cross-sector failed, falling back to Groq:', err.message);
        raw = '';
        perplexityCitations = [];
      }
    }

    if (!raw) {
      const chatCompletion = await groqChat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.35, max_tokens: 1000 }
      );
      raw = chatCompletion.choices[0]?.message?.content || '';
    }

    // Parse INSIGHT blocks
    const insights = [];
    const blocks = raw.split(/INSIGHT\s+\d+/i).slice(1);
    // Clean a parsed field value: trim, collapse newlines, and strip
    // wrapping brackets ONLY if the entire value is bracketed (e.g.
    // "[PATTERN TITLE]" → "PATTERN TITLE"). This must not strip a
    // trailing citation tag like "[Foreign Affairs]".
    const clean = (s) => {
      if (!s) return '';
      let t = String(s).trim().replace(/\n+/g, ' ').trim();
      if (/^\[[^\[\]]+\]$/.test(t)) {
        t = t.slice(1, -1).trim();
      }
      return t;
    };
    const isEmpty = (s) => !s || s.toLowerCase() === 'blank' || s.toLowerCase() === 'n/a' || s === '';

    for (const block of blocks) {
      const typeMatch = block.match(/TYPE:\s*(.+?)(?:\n|$)/i);
      const topicMatch = block.match(/TOPIC:\s*(.+?)(?:\n|$)/i);
      const storiesMatch = block.match(/STORIES:\s*(.+?)(?:\n|$)/i);
      const chainMatch = block.match(/CHAIN:\s*(.+?)(?:\n|$)/i);
      const mechanismMatch = block.match(/MECHANISM:\s*([\s\S]+?)(?:\n\s*(?:TYPE|TOPIC|STORIES|CHAIN|MECHANISM|TAKEAWAY|ANALYSIS|INSIGHT)|$)/i);
      const takeawayMatch = block.match(/TAKEAWAY:\s*([\s\S]+?)(?:\n\s*(?:TYPE|TOPIC|STORIES|CHAIN|MECHANISM|TAKEAWAY|ANALYSIS|INSIGHT)|$)/i);

      if (topicMatch && (mechanismMatch || takeawayMatch)) {
        const type = (typeMatch?.[1] || 'PATTERN').trim().toUpperCase();
        const chain = clean(chainMatch?.[1]);
        insights.push({
          type,
          topic: clean(topicMatch[1]),
          stories: clean(storiesMatch?.[1]),
          chain: isEmpty(chain) ? '' : chain,
          mechanism: clean(mechanismMatch?.[1]),
          takeaway: clean(takeawayMatch?.[1])
        });
      }
    }

    // Build citation map: tag name → URL
    const citationMap = { 'Article': '', 'Profile': '' };
    expertPool.forEach(e => {
      if (!citationMap[e.source]) citationMap[e.source] = e.url;
    });
    // Numeric citations from Perplexity's search results, e.g. [1], [2]
    perplexityCitations.forEach((u, i) => {
      if (u && typeof u === 'string') citationMap[String(i + 1)] = u;
    });

    const csResponse = { insights, citationMap, provider: providerUsed };
    cacheSet('crossSector', csKey, csResponse);
    res.json(csResponse);
  } catch (err) {
    console.error('Cross-sector analysis error:', err.message);
    res.json({ insights: [] });
  }
});

// ── Web-search fallback ─────────────────────────────────────────
// When the user's search matches nothing in the local RSS cache,
// the client can call this endpoint to let Perplexity find recent
// articles from the open web. Returns articles in the same shape
// as /api/news so the existing render pipeline works unchanged.
app.post('/api/web-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Missing query' });
    }
    if (!PERPLEXITY_API_KEY) {
      return res.status(503).json({
        error: 'Web search is not available right now. Please try again later.'
      });
    }

    const cacheKey = 'websearch::' + query.trim().toLowerCase();
    const cached = cacheGet('briefing', cacheKey);
    if (cached) return res.json(cached);

    const systemPrompt = 'You are a research assistant that finds recent, credible news articles on a given topic. You return ONLY valid JSON in the specified schema — no prose, no markdown fences. Only include articles you are confident actually exist and whose URLs you have seen in your search results.';

    const userPrompt = `Find up to 6 recent, credible news articles about: "${query.trim()}"

Prefer reputable outlets (major newswires, mainstream international press, established think tanks, regional specialists). Prefer articles published within the last 14 days when available.

Return ONLY this JSON structure (no markdown, no code fences, no commentary):
{
  "articles": [
    {
      "title": "Exact article headline",
      "source": "Publication name (e.g. Reuters, Financial Times)",
      "url": "https://...",
      "publishedAt": "ISO-8601 date if known, else empty string",
      "description": "2-3 sentence factual summary of what the article says. Specific — names, dates, numbers."
    }
  ]
}

If you cannot find any credible articles, return {"articles": []}.`;

    const completion = await perplexityChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      { temperature: 0.1, max_tokens: 1400 }
    );

    const raw = completion?.choices?.[0]?.message?.content || '';
    const cleaned = stripCodeFences(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Web search returned non-JSON output');
      parsed = JSON.parse(match[0]);
    }

    const found = Array.isArray(parsed.articles) ? parsed.articles : [];
    const articles = found
      .filter(a => a && a.title && a.url)
      .slice(0, 8)
      .map(a => {
        const source = (a.source || '').trim() || 'Web';
        const description = (a.description || '').trim();
        return {
          title: a.title.trim(),
          source,
          sourceTier: 'mainstream',
          publishedAt: a.publishedAt || new Date().toISOString(),
          description,
          content: description,
          url: a.url,
          region: 'Global',
          isOfficial: false,
          score: 10,
          thumbnail: '',
          articleType: classifyArticleType({
            title: a.title, url: a.url, source, sourceTier: 'mainstream'
          }),
          country: extractPrimaryCountry({ title: a.title, description }),
          sourceDescription: getSourceDescription(source),
          fromWebSearch: true
        };
      });

    const response = { articles, governmentCaveat: GOVERNMENT_CAVEAT, fromWebSearch: true };
    cacheSet('briefing', cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('Web-search error:', err.message);
    res.status(500).json({ error: 'Web search failed. ' + err.message });
  }
});

app.listen(PORT, () => {
  const totalSources = Object.values(SOURCES).reduce((a, b) => a + b.length, 0);
  console.log(`GeoSignal running at http://localhost:${PORT}`);
  console.log(`Source registry: ${totalSources} sources across ${Object.keys(SOURCES).length} regions`);
  console.log(`Groq keys loaded: ${groqClients.length} (models: ${GROQ_MODEL}, ${GROQ_FALLBACK_MODEL})`);
});
