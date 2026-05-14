require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');
const Parser = require('rss-parser');

const { SOURCES, getSourcesForRegion, scoreArticle, GOVERNMENT_CAVEAT, classifyArticleType, extractPrimaryCountry, getSourceDescription, SECTOR_KEYWORDS, getAllSourcesForBrowser, getSourceBias, getTierCategory } = require('./sources');

const { queryArticles, upsertManyArticles, updateThumbnail, getUserProfile, saveUserProfile } = require('./db');
const { runFullIngest, googleNewsLiveSearch, liveFetchManyQueries } = require('./ingest');
const { enrichWithOgImages } = require('./og-fetcher');
const { isJunkArticle } = require('./quality-filters');
const { attachUserId, isClerkEnabled, getPublishableKey } = require('./auth');

// Glue words that aren't useful as keyword tokens. Used by both the
// user-intent boost (so "the" doesn't match every article) and the
// story-clustering heuristic below.
const COMMON_GLUE = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'about', 'after',
  'before', 'this', 'that', 'they', 'their', 'them', 'these', 'those',
  'what', 'when', 'where', 'who', 'why', 'how', 'has', 'have', 'had',
  'are', 'was', 'were', 'will', 'would', 'should', 'could', 'can', 'may',
  'might', 'just', 'also', 'than', 'then', 'into', 'amid', 'per', 'via',
  'one', 'two', 'three', 'first', 'last', 'new', 'news', 'says', 'said',
  'gets', 'get', 'goes', 'goes', 'live', 'update', 'updates', 'latest',
  'top', 'all', 'any', 'every', 'some', 'most', 'many', 'much', 'few',
  'how', 'why', 'still', 'now', 'here', 'there', 'good', 'bad', 'big',
  'best', 'worst', 'hello', 'happy'
]);

// Cluster articles by significant title tokens. If two titles share
// 2 or more distinctive words, they're the same story — keep the
// highest-scoring one and drop the rest. Stops a single big topic
// (Iran/Pakistan/Singapore coverage of the day) from flooding the
// feed with near-duplicate-but-different-angle headlines.
//
// Tokens are post-stopword content words. Bigrams were too strict —
// "Iran war" and "Iran peace plan" share no bigram even though they're
// clearly the same story cluster.
function significantTokens(title) {
  return new Set(String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !COMMON_GLUE.has(t)));
}

function clusterArticlesByTitle(articles, maxPerCluster = 1) {
  if (!articles || !articles.length) return articles || [];
  const clusters = []; // [{ signature: Set<token>, items: [] }]
  // Process in score-descending order so each cluster's rep is the
  // highest-scoring article.
  const sorted = [...articles].sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const a of sorted) {
    const tokens = significantTokens(a.title);
    if (tokens.size === 0) {
      clusters.push({ signature: new Set(['__' + (a.url || Math.random())]), items: [a] });
      continue;
    }
    let placed = false;
    for (const c of clusters) {
      let hits = 0;
      for (const t of tokens) {
        if (c.signature.has(t)) {
          hits++;
          if (hits >= 2) break;
        }
      }
      // 2+ shared significant tokens → same cluster.
      // "Iran war" + "Iran peace plan" share { iran } — only 1, no cluster.
      // But also "Iran nuclear talks" + "Iran nuclear deal" share
      // { iran, nuclear } → cluster.
      // "Singapore travellers flight prices" + "Singapore safe-haven Chinese capital" share
      // only { singapore } → no cluster (different stories).
      if (hits >= 2) {
        c.items.push(a);
        for (const t of tokens) c.signature.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ signature: new Set(tokens), items: [a] });
    }
  }
  const out = [];
  for (const c of clusters) {
    out.push(...c.items.slice(0, maxPerCluster));
  }
  return out.sort((a, b) => (b.score || 0) - (a.score || 0));
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
// Attach Clerk user_id to req when a valid session token is present.
// No-op when CLERK_SECRET_KEY is unset — the app stays anonymous.
app.use(attachUserId);

// Expose Clerk frontend config to the page bootstrap script. Returns
// just the publishable key + an enabled flag; nothing sensitive.
app.get('/api/auth/config', (_req, res) => {
  res.json({
    enabled: isClerkEnabled(),
    publishableKey: getPublishableKey()
  });
});

// User profile API — backs cross-device profile sync when the user
// is signed in. Anonymous requests return 401 and the client falls
// back to localStorage.
app.get('/api/profile', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not signed in' });
  const profile = getUserProfile(req.userId);
  res.json({ profile: profile || null });
});

app.put('/api/profile', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not signed in' });
  const profile = (req.body && req.body.profile) || null;
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid profile body' });
  }
  saveUserProfile(req.userId, profile);
  res.json({ ok: true });
});

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
      timeout: 15000, // VPN-friendly
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

  // Get all think-tank-academic source NAMES for this region + global,
  // then pull matching articles from the corpus (db.js).
  const thinkTankSources = [
    ...(SOURCES[regionSlug] || []),
    ...(SOURCES['global'] || [])
  ].filter(s => s.tier === 'think-tank-academic');
  const thinkTankNames = thinkTankSources.map(s => s.name);
  if (!thinkTankNames.length) return [];

  const corpusArticles = queryArticles({
    regionSlugs: ['__all__'],
    sinceMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
    includeSources: thinkTankNames,
    limit: 500
  });

  const candidates = [];
  for (const article of corpusArticles) {
    if (article.title?.toLowerCase().trim() === articleTitle.toLowerCase().trim()) continue;
    const articleWords = extractKeywords(article.title + ' ' + (article.description || ''));
    let matches = 0;
    for (const kw of keywords) {
      if (articleWords.includes(kw)) matches++;
    }
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
  timeout: 15000, // 15s — VPN-friendly (was 5s, too tight behind slow tunnels)
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
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
const TLDR_CACHE_VERSION = 'v3-3bullets';
const BRIEFING_CACHE_VERSION = 'v7-bullets-cited-no-escape';

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
async function fetchFeeds(sources, maxConcurrent = 10) { // 10 concurrent — VPN-safe (was 25)
  const results = [];
  for (let i = 0; i < sources.length; i += maxConcurrent) {
    const batch = sources.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map(s => fetchFeed(s)));
    results.push(...batchResults.flat());
  }
  return results;
}

// ── Background ingest ───────────────────────────────────────────
// Replaces the in-memory feedCache with a SQLite-backed corpus
// fed by RSS + Perplexity (Google News fallback) + GDELT. See
// ingest.js. Runs once on startup, then every 4 hours. We don't
// run more often because Perplexity calls cost money — per-request
// live fetching handles topics the bulk pass missed.

const INGEST_INTERVAL_MS = 4 * 60 * 60 * 1000;
setTimeout(() => runFullIngest(), 2000);
setInterval(() => runFullIngest(), INGEST_INTERVAL_MS);

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

// Reverse lookup: corpus stores articles with slugs like 'middle-east'.
// When we surface them to the client we want the display label.
const regionDisplayBySlug = Object.fromEntries(
  Object.entries(regionSlugMap).map(([disp, slug]) => [slug, disp])
);
function regionSlugToDisplay(slug) {
  return regionDisplayBySlug[String(slug || '').toLowerCase()] || '';
}

// ── LLM-first article selection + ranking (Test mode) ──────────
// Takes a full candidate pool plus user context, asks Groq to pick
// and rank the top N by genuine relevance. Returns a subset of the
// original articles in LLM-ranked order, or null on any failure so
// the caller can fall back to deterministic scoring silently.
// ── Semantic search-term expansion ──────────────────────────────
// Expands a user search query like "Palestine" into related terms
// (gaza, hamas, israel, ceasefire, etc.) so articles using any of
// those terms match. Cached in-memory for 1 hour per query.
const searchExpansionCache = {};
const SEARCH_EXP_TTL_MS = 60 * 60 * 1000;

async function expandSearchTerms(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query || query.length < 2) return [];

  const cached = searchExpansionCache[query.toLowerCase()];
  if (cached && (Date.now() - cached.ts) < SEARCH_EXP_TTL_MS) {
    return cached.terms;
  }

  // Fast fallback: split the query into word-boundary terms
  const literalTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

  try {
    const prompt = `Given the news search query "${query}", return a JSON array of 8-12 lowercase keywords or short phrases that a news article about this topic would likely contain in its headline or description. Include the original words. No prose — ONLY the JSON array.

Example: "Palestine" → ["palestine", "gaza", "hamas", "israel", "idf", "west bank", "ceasefire", "rafah", "netanyahu", "hostages", "palestinian authority"]

Now do "${query}":`;

    const completion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 180 }
    );
    const raw = completion?.choices?.[0]?.message?.content || '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) {
        const terms = parsed
          .map(t => String(t).toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 12);
        literalTerms.forEach(lt => { if (!terms.includes(lt)) terms.unshift(lt); });
        searchExpansionCache[query.toLowerCase()] = { terms, ts: Date.now() };
        return terms;
      }
    }
  } catch (err) {
    console.log('Search expansion failed for "' + query + '":', err.message);
  }
  searchExpansionCache[query.toLowerCase()] = { terms: literalTerms, ts: Date.now() };
  return literalTerms;
}

// ── Generic single-field semantic expansion ─────────────────────
// Same pattern as expandSearchTerms but pluggable: caller passes a
// hint about what the field is so the prompt is tuned. Cached for
// 24 hours per (kind, value) pair.
const fieldExpansionCache = {};
const FIELD_EXP_TTL_MS = 24 * 60 * 60 * 1000;

async function expandFieldTerms(kind, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value || value.length < 2) return [];
  const cacheKey = kind + '::' + value.toLowerCase();
  const cached = fieldExpansionCache[cacheKey];
  if (cached && (Date.now() - cached.ts) < FIELD_EXP_TTL_MS) return cached.terms;

  const literalTerms = value.toLowerCase().split(/[\s,&\/]+/).filter(w => w.length > 2);

  // Tune the prompt to the kind of field
  const hints = {
    role: `the user's professional role`,
    company: `a specific company or organisation the user works for`,
    industry: `industries or sectors the user follows`,
    focus: `topics, themes, or concerns the user tracks`,
    sector: `a news sector or topic the user is interested in`,
    location: `a city or country the user is based in`
  };
  const hint = hints[kind] || `a topic the user cares about`;

  try {
    const prompt = `Given that "${value}" describes ${hint}, return a JSON array of 8-12 lowercase keywords or short phrases that a news article about something relevant to this would likely contain in its headline or description. Include the original words. No prose — ONLY the JSON array.

Example for company "Morgan Stanley": ["morgan stanley", "wall street", "investment bank", "wealth management", "ms", "james gorman", "ted pick", "equities", "ipo"]
Example for role "Founder, Investor": ["founder", "investor", "vc", "venture capital", "startup", "seed round", "series a", "fund", "private equity", "ipo", "entrepreneur"]

Now do "${value}":`;

    const completion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 200 }
    );
    const raw = completion?.choices?.[0]?.message?.content || '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) {
        const terms = parsed.map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 12);
        literalTerms.forEach(lt => { if (!terms.includes(lt)) terms.unshift(lt); });
        fieldExpansionCache[cacheKey] = { terms, ts: Date.now() };
        return terms;
      }
    }
  } catch (err) {
    console.log('Field expansion failed for', kind, '"' + value + '":', err.message);
  }
  fieldExpansionCache[cacheKey] = { terms: literalTerms, ts: Date.now() };
  return literalTerms;
}

// Expands every field on a user profile in parallel. Returns a map
// the scorer can use as additional match terms per field.
async function expandProfileTerms(profile) {
  if (!profile) return {};
  const tasks = [];
  const fields = ['role', 'company', 'industry', 'focus', 'location'];
  fields.forEach(f => {
    const v = profile[f];
    if (v && String(v).trim()) {
      tasks.push(expandFieldTerms(f, v).then(terms => [f, terms]));
    }
  });
  const results = await Promise.all(tasks);
  const out = {};
  results.forEach(([f, terms]) => { if (terms && terms.length) out[f] = terms; });
  return out;
}

// Expands an array of sector labels. Returns a flattened, deduped
// array of related terms across all of them.
async function expandSectorList(sectors) {
  if (!Array.isArray(sectors) || sectors.length === 0) return [];
  const tasks = sectors.map(s => expandFieldTerms('sector', s));
  const lists = await Promise.all(tasks);
  const seen = new Set();
  const out = [];
  lists.forEach(list => list.forEach(t => {
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }));
  return out;
}

async function llmSelectAndRank({ articles, profile, activeFilters, searchQuery, expandedSearchTerms, behavioralPatterns, topN = 30 }) {
  if (!Array.isArray(articles) || articles.length === 0) return null;

  // Cap the pool size we send to the LLM. Each article line costs
  // ~45-55 tokens; 800 keeps the prompt well under Groq's context window.
  const pool = articles.slice(0, 800);

  const contextBlock = (profile || activeFilters)
    ? buildFullContextBlock(profile || {}, activeFilters || {})
    : '- No profile set; rank by broad editorial relevance (recency, specificity, named actors).';

  // Compact per-article line: id + title + minimal metadata. Titles
  // capped at 180 chars so one bad outlier doesn't blow the budget.
  const lines = pool.map((a, i) => {
    const parts = ['[' + i + ']', (a.title || '').slice(0, 180)];
    const meta = [];
    if (a.source) meta.push(a.source);
    if (a.country) meta.push(a.country);
    else if (a.region) meta.push(a.region);
    if (a.publishedAt) {
      const hoursAgo = Math.round((Date.now() - new Date(a.publishedAt).getTime()) / (1000 * 60 * 60));
      if (!isNaN(hoursAgo) && hoursAgo >= 0) meta.push(hoursAgo + 'h ago');
    }
    if (meta.length) parts.push('(' + meta.join(' | ') + ')');
    return parts.join(' ');
  }).join('\n');

  const prompt = `You are a senior news editor curating a personalised briefing. Below is a pool of ${pool.length} recent news articles and a profile of the reader. Pick the articles that are GENUINELY RELEVANT to this specific reader — not popular, not recent — relevant.

READER PROFILE + ACTIVE FILTERS:
${contextBlock}
${searchQuery ? '\nSEARCH QUERY: "' + searchQuery + '"' +
  (Array.isArray(expandedSearchTerms) && expandedSearchTerms.length ? '\nRelated terms (any of these counts as a hit on the search topic): ' + expandedSearchTerms.join(', ') : '') +
  '\nArticles directly about this topic rank highest. Tangentially related articles should be excluded entirely.\n' : ''}
${behavioralPatterns ? `BEHAVIORAL PATTERNS (from this user's reading history):
- Topics they engage with most: ${(behavioralPatterns.topSectors || []).join(', ') || 'not enough data yet'}
- Regions they read about: ${(behavioralPatterns.topRegions || []).join(', ') || 'not enough data yet'}
- Go-to sources: ${(behavioralPatterns.topSources || []).join(', ') || 'not enough data yet'}
- Recurring keywords: ${(behavioralPatterns.topKeywords || []).join(', ') || 'not enough data yet'}
- Terms they look up (annotate): ${(behavioralPatterns.topAnnotatedTerms || []).join(', ') || 'none yet'}
${(behavioralPatterns.likedTitles || []).length ? '- Articles they LIKED (show more like these): ' + behavioralPatterns.likedTitles.slice(-5).join(' | ') : ''}
${(behavioralPatterns.dislikedTitles || []).length ? '- Articles they DISLIKED (show fewer like these): ' + behavioralPatterns.dislikedTitles.slice(-5).join(' | ') : ''}
Liked article patterns boost similar content. Disliked patterns deprioritize similar content. Explicit filters always take priority.
` : ''}RANKING RULES:
- Be GENEROUS by default. Return AS MANY articles as legitimately match the reader's interests, up to the target count. The user has typed explicit keywords/topics — articles relevant to ANY of those keywords belong in the feed.
- A relevance hit is ANY of: title or body mentions a user keyword, the article topic clearly relates to a stated sector, the country/region matches a user-selected region. Don't be hyper-strict — "Singapore economy" matches "Singapore"; "Bitcoin ETF" matches "crypto".
- Only EXCLUDE articles that have NOTHING to do with any of the reader's stated interests — not articles that are loosely connected.
- Do NOT invent ties to the reader's employer / university unless the article specifically references them.
- Recency is a tiebreaker — newer wins when two articles have similar relevance — but never elevates a recent-but-irrelevant article above a relevant older one.
- Avoid near-duplicates on the same story from different outlets — pick the strongest single version.
- Source diversity: try to cap any single outlet at ~3 articles in the response, but don't drop relevant articles just to hit this.
- Topic diversity: avoid 5 articles back-to-back on the same sub-topic. Interleave when possible.

CANDIDATE ARTICLES (each line starts with [id]):
${lines}

Return ONLY this JSON (no prose, no code fences):
{"top": [id, id, id, ...]}

OUTPUT:
- Return ALL genuinely relevant IDs, up to ${Math.min(topN, pool.length)}. Don't stop at 8 or 10 if 30+ articles legitimately match the reader's interests — the user wants a real feed, not a curated handful.
- Reject articles that don't match the reader's interests, but include everything that does.
- Order by relevance (most relevant first).
- Each ID is between 0 and ${pool.length - 1}, and each appears at most once.
- No prose, no code fences — only the JSON object.`;

  // Attempt 1: Groq (fast, free, but rate-limited).
  // Attempt 2: Perplexity (paid, slower, no rate limits we hit).
  // If both fail, return null so the caller falls back to deterministic
  // scoring.
  let rankedIds = null;
  let provider = '';
  const t0 = Date.now();

  try {
    const completion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 900 }
    );
    const raw = completion?.choices?.[0]?.message?.content || '';
    rankedIds = parseRankedIds(raw, pool.length);
    if (rankedIds && rankedIds.length > 0) provider = 'groq';
  } catch (err) {
    console.log('LLM rerank: Groq failed (' + err.message + '), trying Perplexity');
  }

  if ((!rankedIds || rankedIds.length === 0) && PERPLEXITY_API_KEY) {
    try {
      const completion = await perplexityChat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.1, max_tokens: 900 }
      );
      const raw = completion?.choices?.[0]?.message?.content || '';
      rankedIds = parseRankedIds(raw, pool.length);
      if (rankedIds && rankedIds.length > 0) provider = 'perplexity';
    } catch (err) {
      console.log('LLM rerank: Perplexity also failed (' + err.message + ')');
    }
  }

  if (!rankedIds || rankedIds.length === 0) {
    console.log(`LLM rerank: returned 0 articles in ${Date.now() - t0}ms — falling back to deterministic scoring`);
    return null;
  }
  console.log(`LLM rerank: ${provider} picked ${rankedIds.length}/${pool.length} articles in ${Date.now() - t0}ms`);
  return rankedIds.map(i => pool[i]);
}

function parseRankedIds(raw, poolLength) {
  const cleaned = stripCodeFences(raw || '');
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch {}
    }
  }
  if (!parsed || !Array.isArray(parsed.top)) return null;
  const seen = new Set();
  const ids = parsed.top
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n) && n >= 0 && n < poolLength && !seen.has(n) && seen.add(n));
  return ids;
}

// Build a concise, human-readable reason why this article matched.
// Surfaced as "Why this is here" under each card for trust.
function buildMatchReason(article, profile, expandedSearch, expandedProfileKw, sectors, regions) {
  const reasons = [];
  const titleLower = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();

  // Region match
  if (regions && regions.length > 0 && article.country) {
    for (const r of regions) {
      const slug = regionSlugMap[r];
      if (slug && REGION_COUNTRIES[slug]) {
        for (const c of REGION_COUNTRIES[slug]) {
          if (titleLower.includes(c.toLowerCase())) {
            reasons.push(article.country);
            break;
          }
        }
        if (reasons.length) break;
      }
    }
  }

  // Sector match
  if (sectors && sectors.length > 0) {
    for (const s of sectors) {
      const kws = SECTOR_KEYWORDS[s];
      if (Array.isArray(kws) && kws.some(k => titleLower.includes(k.toLowerCase()))) {
        reasons.push(s.replace(/ & .*/, '')); // shortened label
        break;
      }
    }
  }

  // Search match
  if (Array.isArray(expandedSearch) && expandedSearch.length > 0) {
    for (const t of expandedSearch.slice(0, 5)) {
      if (titleLower.includes(t)) {
        reasons.push('search: ' + t);
        break;
      }
    }
  }

  // Profile keyword match
  if (Array.isArray(expandedProfileKw) && expandedProfileKw.length > 0) {
    for (const t of expandedProfileKw.slice(0, 8)) {
      if (titleLower.includes(t)) {
        reasons.push('keyword: ' + t);
        break;
      }
    }
  }

  // Profile location match
  if (profile && profile.location) {
    const loc = String(profile.location).toLowerCase();
    if (loc && titleLower.includes(loc)) reasons.push(profile.location);
  }

  // Profile company match
  if (profile && profile.company) {
    const comp = String(profile.company).toLowerCase();
    if (comp && titleLower.includes(comp)) reasons.push(profile.company);
  }

  if (reasons.length === 0) return '';
  return 'Matched: ' + reasons.slice(0, 3).join(' · ');
}

// ── Main News Endpoint (RSS-powered) ────────────────────────────

app.get('/api/news', async (req, res) => {
  try {
    const { region, regions, sectors, sourceTypes, profile: profileStr, search, articleTypes, locations, keywords, includeSources, excludeSources, readArticles } = req.query;

    // Pagination — true endless scroll. Client passes ?offset=N to
    // fetch the next page. We hold the ranked pool in the LLM-rank
    // cache (10 min TTL) so subsequent pages just slice it.
    const offsetRaw = parseInt(req.query.offset, 10);
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;
    const pageSizeRaw = parseInt(req.query.pageSize, 10);
    const pageSize = !isNaN(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(pageSizeRaw, 100)
      : 50;

    // Multi-region support. Accepts ?regions=A,B,C (preferred) or
    // ?region=A (single, back-compat). If Global is among the choices,
    // behaves the same as Global-only.
    const regionList = regions
      ? regions.split(',').map(s => s.trim()).filter(Boolean)
      : (region ? [region] : ['Global']);
    // Multi-region: keep ALL selected regions. If Global is among them,
    // it adds global sources to the union — but other specific regions
    // keep their country-match scoring bonus intact. No collapsing.
    const regionSlug = regionSlugMap[regionList[0]] || 'global';
    const regionSlugs = regionList.map(r => regionSlugMap[r] || 'global');
    // For SCORING, prefer specific regions so their country-match
    // bonuses fire. Global's role is just to expand the source pool.
    // Only fall back to 'global' for scoring if it's the only region
    // the user picked.
    const scoringSlugs = regionSlugs.filter(s => s !== 'global').length > 0
      ? regionSlugs.filter(s => s !== 'global')
      : ['global'];
    const typeList = sourceTypes ? sourceTypes.split(',') : ['Mainstream news', 'Independent journalism', 'Think tanks & academic'];
    const activeSectors = sectors ? sectors.split(',') : [];
    const searchTerms = search ? search.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1) : [];
    // Semantic expansion — wrapped in try/catch because these hit Groq
    // and can fail under rate limits. Falls back gracefully to literal
    // terms. The expansion cache means only the very first request pays.
    let expandedSearchTerms = [];
    try { expandedSearchTerms = search ? await expandSearchTerms(search) : []; }
    catch (e) { console.log('Search expansion failed:', e.message); }
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

    // ── Hard 30-day cap ── never return anything older regardless of
    // other filter settings. Also accept an optional dateRange param
    // (in hours) for tighter ranges from the client-side date filter.
    const dateRangeHours = parseInt(req.query.dateRange, 10);
    const maxAgeMs = (dateRangeHours > 0 ? Math.min(dateRangeHours, 720) : 720) * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;

    // Parse profile early so we can use its keywords for the SQL pull.
    let parsedProfile = null;
    if (profileStr) { try { parsedProfile = JSON.parse(profileStr); } catch {} }
    const profileKeywords = (parsedProfile && Array.isArray(parsedProfile.keywords))
      ? parsedProfile.keywords.filter(Boolean).map(s => String(s).toLowerCase().trim())
      : [];

    // Strict-keyword mode: when the user has typed ANY explicit
    // interest (search bar, sidebar keywords, or profile keywords),
    // we pull only articles whose title/description matches at least
    // one of those terms via FTS5. This stops the pool from being
    // dominated by hot-but-irrelevant regional news (Iran/Pakistan
    // when the user only cares about crypto, etc.).
    const allUserTerms = Array.from(new Set([
      ...searchTerms,
      ...keywordTerms,
      ...profileKeywords
    ])).filter(Boolean);
    const strictKeywordMode = allUserTerms.length > 0;

    // Pull articles from the SQLite corpus (RSS + GDELT + Google News
    // all live in the same store, written by ingest.js).
    //
    // Region is a *soft* signal. We pull from every region in the
    // user's selection plus 'global'. When strict-keyword mode is
    // active, we also broaden to ALL regions so a crypto match in a
    // Latin America–tagged article still surfaces.
    const includeArr = includeSet ? [...includeSet] : null;
    const excludeArr = excludeSet ? [...excludeSet] : null;
    const queryRegionSlugs = strictKeywordMode
      ? ['__all__']
      : Array.from(new Set([...regionSlugs, 'global']));
    let allArticles = queryArticles({
      regionSlugs: queryRegionSlugs,
      sinceMs: cutoff,
      q: strictKeywordMode ? allUserTerms.join(' ') : null,
      includeSources: includeArr,
      excludeSources: excludeArr,
      limit: 2500
    });
    // Read-time junk filter — drops articles that pre-dated the
    // quality-filter additions and are still sitting in the corpus
    // (landing pages, product spam, social URLs). The write-time
    // filter only blocks NEW ingests; existing rows need this.
    const beforeFilter = allArticles.length;
    allArticles = allArticles.filter(a => !isJunkArticle(a));
    if (beforeFilter - allArticles.length > 0) {
      console.log(`Read-time junk filter dropped ${beforeFilter - allArticles.length} articles`);
    }
    if (strictKeywordMode) {
      console.log(`Strict-keyword mode active for [${allUserTerms.slice(0,8).join(', ')}…]: ${allArticles.length} articles match in corpus`);
    }

    // Live fetch — fire off Google News queries for everything the
    // user actually cares about right now, in parallel.
    //
    // Profile keywords + sidebar keywords + search box are all treated
    // as PRIMARY INTENT. Each becomes a live query, and each is also
    // boosted heavily during scoring so matching articles dominate
    // the top of the feed. Locations and narrowed sectors are
    // included too but lower priority.
    const profileKeywordsList = (parsedProfile && Array.isArray(parsedProfile.keywords))
      ? parsedProfile.keywords.filter(Boolean)
      : [];
    const totalSectorCount0 = Object.keys(SECTOR_KEYWORDS || {}).length;
    const totalRegionCount = Object.keys(regionSlugMap).length;
    const narrowedSectors = (activeSectors.length > 0 && activeSectors.length < totalSectorCount0)
      ? activeSectors.slice(0, 2)
      : [];
    const narrowedRegions = (regionList.length > 0 && regionList.length < totalRegionCount)
      ? regionList
      : [];

    // Region-specific keyword + source primers. When the user narrows
    // to a particular region, we fire live queries built from these
    // primers so the corpus pulls in coverage from that region's
    // dominant outlets even if our standing ingest hasn't refreshed.
    const REGION_QUERY_PRIMERS = {
      'Southeast Asia':           ['Singapore Malaysia Indonesia news', 'ASEAN Vietnam Thailand Philippines', 'Straits Times CNA Bangkok Post Nikkei Asia'],
      'South Asia':               ['India Pakistan Bangladesh news', 'Delhi Mumbai Karachi Dhaka', 'Times of India Dawn The Hindu'],
      'East Asia':                ['China Japan Korea news', 'Beijing Tokyo Seoul Taipei', 'South China Morning Post Nikkei Korea Herald'],
      'Middle East':              ['Iran Israel Saudi Arabia UAE news', 'Tehran Riyadh Dubai Jerusalem', 'Al Jazeera Al Arabiya Haaretz'],
      'Europe':                   ['EU politics Brussels news', 'Germany France UK Italy Spain', 'Politico Europe FT Le Monde Der Spiegel'],
      'Africa':                   ['Nigeria South Africa Kenya Egypt news', 'Lagos Nairobi Johannesburg Cairo', 'Africa News Mail Guardian Daily Maverick'],
      'Latin America':            ['Mexico Brazil Argentina Colombia news', 'Sao Paulo Mexico City Buenos Aires', 'Folha Reforma Clarin'],
      'North America':            ['US Canada politics economy', 'Washington New York Toronto', 'NYT WSJ Washington Post Globe and Mail'],
      'Central Asia & Caucasus':  ['Kazakhstan Uzbekistan Georgia Azerbaijan news', 'Almaty Tashkent Tbilisi Baku', 'Eurasianet Caspian RFE/RL Caucasus'],
      'Oceania':                  ['Australia New Zealand Pacific news', 'Sydney Melbourne Auckland Wellington', 'Sydney Morning Herald ABC RNZ'],
      'Global':                   []
    };
    const regionPrimerQueries = [];
    for (const r of narrowedRegions) {
      const primers = REGION_QUERY_PRIMERS[r];
      if (Array.isArray(primers)) regionPrimerQueries.push(...primers);
    }

    // Build the live-query list in priority order: search bar (highest
    // intent) → profile keywords → sidebar keywords → location terms →
    // narrowed sectors → narrowed-region primers. Dedup happens inside
    // liveFetchManyQueries.
    const liveQueries = [];
    if (search && search.trim().length > 1) liveQueries.push(search.trim());
    liveQueries.push(...profileKeywordsList);
    liveQueries.push(...keywordTerms);
    if (locationTerms.length) liveQueries.push(locationTerms.slice(0, 2).join(' '));
    liveQueries.push(...narrowedSectors);
    liveQueries.push(...regionPrimerQueries);

    if (liveQueries.length) {
      try {
        const t0 = Date.now();
        const { queries: ranQueries, articles: liveArticles } = await liveFetchManyQueries(
          liveQueries,
          { regionSlug: regionSlugs[0] || 'global', perQueryLimit: 10, totalLimit: 12 }
        );
        const took = Date.now() - t0;
        console.log(`Live Google News [${ranQueries.join(' | ')}]: ${liveArticles.length} articles in ${took}ms`);
        if (liveArticles.length) {
          try { upsertManyArticles(liveArticles); } catch {}
          allArticles = allArticles.concat(liveArticles);
        }
      } catch (e) {
        console.log('Live fetch failed (continuing with corpus only):', e.message);
      }
    }

    console.log(`Serving ${allArticles.length} candidate articles from corpus for [${regionSlugs.join(',')}]${searchTerms.length ? ` search="${searchTerms.join(' ')}"` : ''}`);

    // Reuse the early-parsed profile so we don't double-parse.
    const userProfile = parsedProfile;

    // Semantically expand every profile field once per request. The
    // helper caches by (kind,value) for 24h so repeated requests for
    // the same profile are free. Attach the expanded terms to the
    // userProfile so scoreArticle can use them as match boosts.
    if (userProfile) {
      try {
        userProfile._expandedTerms = await expandProfileTerms(userProfile);
      } catch {}
    }
    // Also expand active sector labels (standard + custom) into related
    // terms once per request. Custom sectors already get expanded
    // client-side and arrive in `sectors`; this layer adds semantic
    // expansion to the standard sector labels too.
    let expandedSectorTerms = [];
    if (activeSectors && activeSectors.length > 0 && activeSectors.length < 15) {
      try { expandedSectorTerms = await expandSectorList(activeSectors); } catch {}
    }

    // Expand profile-level keywords (the user's durable interests set in
    // their profile form, e.g. "Donald Trump", "Singapore Local News").
    // Each keyword gets semantically expanded so phrase-style interests
    // that don't literally appear in headlines still produce matches.
    let expandedProfileKeywords = [];
    if (userProfile && Array.isArray(userProfile.keywords) && userProfile.keywords.length > 0) {
      try {
        const kws = userProfile.keywords.filter(Boolean).slice(0, 10);
        const tasks = kws.map(kw => expandFieldTerms('focus', kw));
        const results = await Promise.all(tasks);
        const seen = new Set();
        results.forEach(list => list.forEach(t => {
          if (!seen.has(t)) { seen.add(t); expandedProfileKeywords.push(t); }
        }));
      } catch {}
    }

    // Deduplicate by title
    const seen = new Set();
    let unique = allArticles.filter(a => {
      const key = a.title?.toLowerCase().trim();
      if (!key || key.length < 10 || key === '[removed]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Filtering policy ────────────────────────────────────────
    // Almost everything the user types is a *ranking signal*, not a
    // hard filter. Hard filters (drop-on-no-match) are limited to
    // explicit "no" choices: date range, source include/exclude.
    // Sectors, search-bar terms, location terms, keywords, and
    // profile interests all influence score below — they never
    // delete articles.

    const testMode = req.query.testMode === '1' || req.query.testMode === 'true';

    // Source include/exclude — these ARE hard filters because the
    // user explicitly picked outlets in the Manage Sources panel.
    if (includeSet && includeSet.size > 0) {
      unique = unique.filter(a => includeSet.has(a.source));
    }
    if (excludeSet && excludeSet.size > 0) {
      unique = unique.filter(a => !excludeSet.has(a.source));
    }

    // Sector keywords are always treated as a boost. We build the
    // term list here so the scoring loop below can use it.
    const buildSectorKeywords = (sectors) => sectors
      .flatMap(s => {
        const list = SECTOR_KEYWORDS[s];
        if (Array.isArray(list) && list.length) return list;
        return [s]; // custom sector: literal match
      })
      .map(k => String(k || '').toLowerCase())
      .filter(Boolean);

    const totalSectorCount = Object.keys(SECTOR_KEYWORDS || {}).length;
    let sectorKeywordsForBoost = [];
    // Only boost when a meaningful subset of sectors is selected.
    // If everything is on (the new default) or nothing is on, the
    // boost is a no-op so we skip the work.
    if (activeSectors.length > 0 && activeSectors.length < totalSectorCount) {
      sectorKeywordsForBoost = buildSectorKeywords(activeSectors);
    }

    // Score, filter junk, and sort
    unique.forEach(a => {
      // For multi-region, score against every selected region and keep the best.
      a.score = scoringSlugs.reduce((best, slug) => {
        const s = scoreArticle(a, slug, userProfile, activeSectors);
        return s > best ? s : best;
      }, -Infinity);
      if (!isFinite(a.score)) a.score = scoreArticle(a, regionSlug, userProfile, activeSectors);

      // Sector boost — articles matching any selected sector's keywords
      // float up. Sectors are never a hard filter; people have varied
      // interests and a great article often spans sectors.
      if (sectorKeywordsForBoost.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let secBoost = 0;
        for (const kw of sectorKeywordsForBoost) {
          if (titleLower.includes(kw)) secBoost += 25;
          else if (descLower.includes(kw)) secBoost += 10;
        }
        a.score += Math.min(secBoost, 50);
      }

      // Semantic-expanded sector boost (active whenever standard sectors
      // were expanded). Lower weight than the hardcoded keyword boost
      // because expanded terms are softer matches.
      if (expandedSectorTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let expBoost = 0;
        for (const t of expandedSectorTerms) {
          if (titleLower.includes(t)) expBoost += 8;
          else if (descLower.includes(t)) expBoost += 3;
        }
        a.score += Math.min(expBoost, 30);
      }

      // Semantic-expanded profile boost (role, company, industry, focus, location)
      if (userProfile && userProfile._expandedTerms) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let pBoost = 0;
        Object.values(userProfile._expandedTerms).forEach(termList => {
          if (!Array.isArray(termList)) return;
          for (const t of termList) {
            if (titleLower.includes(t)) pBoost += 10;
            else if (descLower.includes(t)) pBoost += 4;
          }
        });
        a.score += Math.min(pBoost, 40);
      }

      // Profile-level keywords (expanded) — strongest profile signal
      // because these are durable interests the user explicitly listed.
      if (expandedProfileKeywords.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let kwBoost = 0;
        for (const t of expandedProfileKeywords) {
          if (titleLower.includes(t)) kwBoost += 15;
          else if (descLower.includes(t)) kwBoost += 5;
        }
        a.score += Math.min(kwBoost, 50);
      }

      // Unified user-intent boost. Search bar + profile keywords +
      // sidebar keywords are ALL primary intent — they're things the
      // user explicitly told us they care about. Any article matching
      // any of them gets a dominant boost so it outranks region- or
      // recency-favored articles that match nothing the user typed.
      //
      // Multi-term matches stack so an article hitting 3 keywords
      // beats one hitting 1.
      const userIntentTerms = new Set();
      for (const t of expandedSearchTerms) userIntentTerms.add(t.toLowerCase());
      for (const t of searchTerms) userIntentTerms.add(t.toLowerCase());
      // Sidebar + profile keywords often come as multi-word phrases
      // ("Stock Market Prices", "Donald Trump"). Add the whole phrase
      // AND each significant token, so an article titled "stock futures
      // rally" hits "stock" while "Donald Trump speech" hits "donald"
      // AND "trump". Tokens shorter than 3 chars are dropped to avoid
      // matching English glue words.
      const expandKeyword = (kw) => {
        const lower = String(kw).toLowerCase().trim();
        if (lower.length > 1) userIntentTerms.add(lower);
        for (const tok of lower.split(/[\s\-,]+/)) {
          if (tok.length > 2 && !COMMON_GLUE.has(tok)) userIntentTerms.add(tok);
        }
      };
      for (const t of keywordTerms) expandKeyword(t);
      for (const kw of profileKeywordsList) expandKeyword(kw);
      // Count how many distinct user-explicit signals exist. When the
      // user has put real effort in (3+ keywords/profile/search terms),
      // we treat keyword matching as a near-hard filter — articles
      // matching nothing the user typed get a heavy penalty so they
      // can't dominate just because they have high base scores from
      // sector / recency stacking.
      const explicitSignalCount =
        searchTerms.length +
        keywordTerms.length +
        profileKeywordsList.length;
      const explicitMode = explicitSignalCount >= 3;

      if (userIntentTerms.size > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let intentBoost = 0;
        let titleHits = 0;
        let descHits = 0;
        for (const term of userIntentTerms) {
          if (titleLower.includes(term)) { intentBoost += 200; titleHits++; }
          else if (descLower.includes(term)) { intentBoost += 60; descHits++; }
        }
        if (intentBoost > 0) {
          // Floor: any matching article clears typical base scores for
          // non-matching articles by a wide margin.
          a.score += Math.max(intentBoost, 200);
        } else if (explicitMode) {
          // User has 3+ explicit keywords AND this article matches none
          // of them. Penalize heavily so it falls below every matching
          // article. Still in the pool (for serendipity) but won't
          // dominate the feed.
          a.score -= 300;
        }
      }
      // Location boost — typed cities/countries float up but never
      // delete other articles. Title matches count more than body.
      if (locationTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const descLower = (a.description || '').toLowerCase();
        let locBoost = 0;
        for (const term of locationTerms) {
          if (titleLower.includes(term)) locBoost += 25;
          else if (descLower.includes(term)) locBoost += 8;
        }
        a.score += Math.min(locBoost, 60);
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

    // Article-type as a soft preference. Articles outside the user's
    // selected types get down-ranked but never deleted — otherwise a
    // crypto headline that happens to read like opinion gets dropped
    // even when it's exactly what the user searched for. Only kicks
    // in when the user has narrowed below the full set.
    if (activeArticleTypes.length > 0 && activeArticleTypes.length < 3) {
      const allowed = new Set(activeArticleTypes);
      unique.forEach(a => {
        if (!allowed.has(a.articleType)) a.score -= 30;
      });
    }

    // (Story clustering removed — was promoting weak sources like
    // YouTube to cluster reps when their score happened to edge out
    // mainstream coverage. Keep articles individually for now; we
    // can revisit clustering once we have a source-quality signal.)

    // ── Test mode: LLM-first selection + ranking ──
    // When the client sends testMode=1, skip the deterministic sort
    // entirely and let Groq pick + rank the top 30 from the full pool.
    // Falls back silently to deterministic scoring on any failure.
    let llmRankedUsed = false;
    let llmRankedAt = 0;
    // Skip the LLM rerank when the user has provided no explicit
    // interest signal (no search, no sidebar keywords, no profile
    // keywords). Without a target to filter against the rerank
    // tends to be over-conservative and trims a healthy 60-article
    // pool down to 5-8 cards. Deterministic scoring already factors
    // in region match + recency + source tier, which is what the
    // user wants in that "broad feed" mode.
    const hasExplicitInterest = (searchTerms && searchTerms.length > 0)
      || (keywordTerms && keywordTerms.length > 0)
      || (profileKeywordsList && profileKeywordsList.length > 0);

    if (testMode && hasExplicitInterest) {
      // Check for a cached LLM ranking that's still fresh (10 min TTL).
      // Key: hash of user filters + profile + search query. Means
      // repeated Apply/Refresh within 10 min is instant.
      const llmCacheKey = 'llmrank::' + hashString(JSON.stringify({
        regions: regionList, sectors: activeSectors,
        keywords: keywordTerms, locations: locationTerms,
        search: req.query.search || '', profile: userProfile || {}
      }));
      const llmCached = cacheGet('crossSector', llmCacheKey);
      if (llmCached && llmCached.rankedAt && (Date.now() - llmCached.rankedAt) < 10 * 60 * 1000) {
        unique = llmCached.articles;
        llmRankedUsed = true;
        llmRankedAt = llmCached.rankedAt;
        console.log('Test mode: serving cached LLM ranking (' + Math.round((Date.now() - llmCached.rankedAt) / 60000) + 'min old)');
      } else {
        // Retrieve-then-rerank: first sort by deterministic score, then
        // send the top 300 candidates to the LLM for semantic reranking.
        const candidatePool = unique.slice().sort((a, b) => b.score - a.score).slice(0, 300);
        console.log('Test mode: reranking top ' + candidatePool.length + ' of ' + unique.length + ' articles with LLM');
        // Parse behavioral patterns from the client (if available)
        let behavioralPatterns = null;
        try {
          if (req.query.patterns) behavioralPatterns = JSON.parse(req.query.patterns);
        } catch {}

        const llmRanked = await llmSelectAndRank({
          articles: candidatePool,
          searchQuery: searchTerms.length > 0 ? req.query.search : null,
          expandedSearchTerms,
          profile: userProfile,
          behavioralPatterns,
          activeFilters: {
            regions: regionList,
            sectors: activeSectors,
            keywords: keywordTerms,
            locations: locationTerms,
            includeSources: includeSources ? includeSources.split(',') : [],
            excludeSources: excludeSources ? excludeSources.split(',') : []
          },
          topN: 80
        });
        if (Array.isArray(llmRanked) && llmRanked.length > 0) {
          // Backfill: if the LLM returned thin (<30 articles) but the
          // candidate pool had way more, top up with the next-best
          // deterministic-scored articles so the feed has substance
          // even when the LLM is conservative.
          const TARGET_MIN = 30;
          let merged = llmRanked;
          if (llmRanked.length < TARGET_MIN && candidatePool.length > llmRanked.length) {
            const includedUrls = new Set(llmRanked.map(a => a.url));
            const extras = candidatePool.filter(a => !includedUrls.has(a.url));
            merged = llmRanked.concat(extras.slice(0, TARGET_MIN - llmRanked.length));
            console.log(`LLM rerank returned ${llmRanked.length}, backfilled to ${merged.length} from candidate pool`);
          }
          unique = merged;
          llmRankedUsed = true;
          llmRankedAt = Date.now();
          cacheSet('crossSector', llmCacheKey, { articles: merged, rankedAt: llmRankedAt });
        }
      } // end else (not cached)
    }

    if (!llmRankedUsed) {
      unique.sort((a, b) => b.score - a.score);
    }

    // ── Already-read demotion ── If the client passes a comma-separated
    // list of article IDs (URLs) the user already opened in this session,
    // push them to the bottom so fresh content surfaces on refresh.
    if (readArticles) {
      const readSet = new Set(readArticles.split(',').map(s => s.trim()).filter(Boolean));
      if (readSet.size > 0) {
        const unread = [];
        const read = [];
        for (const a of unique) {
          if (readSet.has(a.url || a.title)) read.push(a);
          else unread.push(a);
        }
        unique = [...unread, ...read];
      }
    }

    // ── Source diversity ── Cap any single outlet at 3 articles in the
    // top 40 so the feed doesn't feel like a single-source RSS reader.
    // Extras get pushed to the tail (still available if the user scrolls).
    {
      const sourceCounts = {};
      const top = [];
      const overflow = [];
      for (const a of unique) {
        const s = a.source || '';
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
        if (sourceCounts[s] <= 3) top.push(a);
        else overflow.push(a);
      }
      unique = [...top, ...overflow];
    }

    // ── Headline dedup across outlets ── If multiple outlets cover the
    // same story with near-identical headlines, keep the highest-scored
    // version and drop the rest. Two headlines are "same story" if they
    // share >60% of their significant words (length >= 4).
    {
      const significantWords = (title) => {
        const stop = new Set(['that','this','with','from','have','will','been','they','their','after','about','more','than','also','into','over','when','what','some','could']);
        return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
          .filter(w => w.length >= 4 && !stop.has(w));
      };
      const overlap = (a, b) => {
        if (a.length === 0 || b.length === 0) return 0;
        const setB = new Set(b);
        const shared = a.filter(w => setB.has(w)).length;
        return shared / Math.min(a.length, b.length);
      };
      const deduped = [];
      const usedWords = [];
      for (const a of unique) {
        const words = significantWords(a.title);
        const isDupe = usedWords.some(uw => overlap(words, uw) > 0.6);
        if (!isDupe) {
          deduped.push(a);
          usedWords.push(words);
        }
      }
      unique = deduped;
    }

    // Map to card format. Strip HTML server-side so descriptions arrive
    // as clean text — prevents truncation from cutting mid-entity on
    // the client and keeps the payload lean.
    // ── Endless-scroll tail ─────────────────────────────────────
    // Always append a fat broadened tail so the feed never feels
    // like it ends. We pull the recent corpus (across all regions,
    // no FTS filter) up to a generous cap, dedupe against the strict
    // pool, and tag each tail article broadened=true. Pagination
    // walks through the strict pool first, then the broadened tail.
    try {
      let broader = queryArticles({
        regionSlugs: ['__all__'],
        // Use a wider lookback for the tail — recent + older content
        // alike. The strict pool already enforces the user's date
        // filter; the tail is "anything else interesting recently".
        sinceMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
        q: null,
        includeSources: includeArr,
        excludeSources: excludeArr,
        limit: 3000
      });
      // Apply read-time junk filter to the broadened tail too.
      broader = broader.filter(a => !isJunkArticle(a));
      const seenUrls = new Set(unique.map(a => a.url));
      const seenTitleHashes = new Set(unique.map(a => (a.title || '').toLowerCase().trim()));
      const tail = [];
      for (const a of broader) {
        if (seenUrls.has(a.url)) continue;
        const titleKey = (a.title || '').toLowerCase().trim();
        if (!titleKey || seenTitleHashes.has(titleKey)) continue;
        seenUrls.add(a.url);
        seenTitleHashes.add(titleKey);
        a.score = scoringSlugs.reduce((best, slug) => {
          const s = scoreArticle(a, slug, userProfile, activeSectors);
          return s > best ? s : best;
        }, -Infinity);
        if (!isFinite(a.score)) a.score = 0;
        a.broadened = true;
        tail.push(a);
      }
      tail.sort((x, y) => (y.score || 0) - (x.score || 0));
      // Append a much bigger tail (was 200; now 1500). This gives
      // 30+ pages of scroll per filter combo, which feels endless.
      unique = unique.concat(tail.slice(0, 1500));
    } catch (e) {
      console.log('Endless-tail broaden failed:', e.message);
    }

    // ── Round-robin region balancer ─────────────────────────────
    // When the user has a BROAD feed (no keywords, no search, no
    // narrowed regions/sectors), the corpus is over-weighted toward
    // regions that happen to have more RSS sources — historically
    // India and Singapore. Interleave the top of the pool across
    // regions so the first page is genuinely diverse instead of
    // dominated by whichever region has the most articles.
    //
    // Triggers when no user intent is detected. The strict-keyword
    // mode and narrowed filters bypass this — those reflect explicit
    // user intent and shouldn't be balanced away.
    const isBroadFeed = !hasExplicitInterest && narrowedRegions.length === 0
      && narrowedSectors.length === 0 && locationTerms.length === 0;
    if (isBroadFeed && unique.length > 30) {
      const byRegion = new Map();
      for (const a of unique) {
        const r = a.region || 'global';
        if (!byRegion.has(r)) byRegion.set(r, []);
        byRegion.get(r).push(a);
      }
      // Sort each bucket by score, descending — best article from
      // each region rotates to the top.
      for (const arr of byRegion.values()) {
        arr.sort((x, y) => (y.score || 0) - (x.score || 0));
      }
      const interleaved = [];
      const buckets = [...byRegion.values()];
      let i = 0;
      // Keep round-robin until every bucket is drained. Most buckets
      // run out long before others; the longer ones fill the tail.
      while (interleaved.length < unique.length) {
        let drewAny = false;
        for (const bucket of buckets) {
          if (i < bucket.length) {
            interleaved.push(bucket[i]);
            drewAny = true;
          }
        }
        if (!drewAny) break;
        i++;
      }
      console.log(`Broad-feed balancer: interleaved ${buckets.length} regions, ${interleaved.length} articles`);
      unique = interleaved;
    }

    const totalRanked = unique.length;
    const pagedSlice = unique.slice(offset, offset + pageSize);
    const articles = pagedSlice.map(article => {
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
        // Use the article's own region, NOT the display label the
        // client sent (which can be e.g. "11 regions" when the user
        // has all regions on). Fall back to the user's first picked
        // region, then 'Global'.
        region: (article.region && typeof article.region === 'string'
                 ? regionSlugToDisplay(article.region) || article.region
                 : null)
                || (regionList[0] && regionList[0] !== 'Global' ? regionList[0] : '')
                || 'Global',
        isOfficial: article.sourceTier === 'government-official',
        score: article.score,
        thumbnail: article.thumbnail || '',
        articleType: article.articleType || 'News',
        country: article.country || '',
        sourceDescription: getSourceDescription(article.source),
        matchReason: (() => { try { return buildMatchReason(article, userProfile, expandedSearchTerms, expandedProfileKeywords, activeSectors, regionList); } catch { return ''; } })(),
        broadened: !!article.broadened
      };
    });

    // Auto-broaden: when the user has narrowed regions / sectors AND
    // the final feed is thin (< 5 articles), drop those narrow filters
    // for a follow-up pull and label the response so the client can
    // surface "Showing broader results — limited coverage for your
    // exact filters."
    let coverageNote = null;
    if (offset === 0 && totalRanked < 5 && (narrowedRegions.length || narrowedSectors.length || locationTerms.length)) {
      try {
        const broader = queryArticles({
          regionSlugs: ['__all__'],
          sinceMs: cutoff,
          q: strictKeywordMode ? allUserTerms.join(' ') : null,
          includeSources: includeArr,
          excludeSources: excludeArr,
          limit: 1500
        });
        // Score, dedupe-by-title, sort, take top 40.
        const seenTitles = new Set(articles.map(a => (a.title || '').toLowerCase().trim()));
        const extras = [];
        for (const a of broader) {
          const key = (a.title || '').toLowerCase().trim();
          if (!key || seenTitles.has(key)) continue;
          seenTitles.add(key);
          a.score = scoringSlugs.reduce((best, slug) => {
            const s = scoreArticle(a, slug, userProfile, activeSectors);
            return s > best ? s : best;
          }, -Infinity);
          if (!isFinite(a.score)) a.score = 0;
          extras.push(a);
        }
        extras.sort((x, y) => (y.score || 0) - (x.score || 0));
        const broadenedCards = extras.slice(0, 40 - articles.length).map(article => {
          let desc = stripHtml(article.description || '');
          if (desc.length > 180) {
            const end = desc.slice(0, 220).search(/[.!?](?:\s|$)/);
            desc = end >= 40 ? desc.slice(0, end + 1) : desc.slice(0, 180).replace(/\s\S*$/, '') + '…';
          }
          return {
            title: article.title, source: article.source, sourceTier: article.sourceTier,
            publishedAt: article.publishedAt, description: desc,
            content: stripHtml(article.content || article.description || '').slice(0, 600),
            url: article.url, region: article.region || 'Global',
            isOfficial: article.sourceTier === 'government-official',
            score: article.score, thumbnail: article.thumbnail || '',
            articleType: article.articleType || 'News', country: article.country || '',
            sourceDescription: getSourceDescription(article.source),
            matchReason: '', broadened: true
          };
        });
        articles.push(...broadenedCards);
        if (broadenedCards.length > 0) {
          const labelBits = [];
          if (narrowedRegions.length) labelBits.push('regions');
          if (narrowedSectors.length) labelBits.push('sectors');
          if (locationTerms.length) labelBits.push('locations');
          coverageNote = `Showing broader results — limited coverage for your exact ${labelBits.join(' / ')}.`;
          console.log(`Auto-broaden: added ${broadenedCards.length} broader articles. ${coverageNote}`);
        }
      } catch (e) {
        console.log('Auto-broaden failed:', e.message);
      }
    }

    // Best-effort og:image enrichment, two phases:
    //  Phase 1 (inline, 1.5s budget): fetch for the first 8 visible
    //    cards so this request shows real thumbnails when possible.
    //  Phase 2 (fire-and-forget, background): fetch for the rest and
    //    persist to the corpus so subsequent requests have them
    //    instantly. Doesn't block the response.
    const cardsNeedingThumb = articles.filter(a => !a.thumbnail);
    try {
      await enrichWithOgImages(cardsNeedingThumb.slice(0, 8), { totalBudgetMs: 1500, concurrency: 8 });
      for (const a of articles) {
        if (a.thumbnail && a.url) {
          try { updateThumbnail(a.url, a.thumbnail); } catch {}
        }
      }
    } catch (e) {
      console.log('og:image inline enrichment failed:', e.message);
    }
    // Background pass for the rest — no await so we don't block.
    const restNeedingThumb = articles.filter(a => !a.thumbnail);
    if (restNeedingThumb.length) {
      Promise.resolve().then(async () => {
        try {
          await enrichWithOgImages(restNeedingThumb, { totalBudgetMs: 8000, concurrency: 8 });
          for (const a of restNeedingThumb) {
            if (a.thumbnail && a.url) {
              try { updateThumbnail(a.url, a.thumbnail); } catch {}
            }
          }
        } catch {}
      });
    }

    const nextOffset = (offset + articles.length) < totalRanked
      ? offset + articles.length
      : null;
    res.json({
      articles,
      governmentCaveat: GOVERNMENT_CAVEAT,
      coverageNote,
      total: totalRanked,
      nextOffset,
      hasMore: nextOffset !== null
    });
  } catch (err) {
    console.error('News fetch error:', err.stack || err.message || err);
    // Last-resort fallback: return whatever we can from the corpus
    // without any LLM/expansion calls.
    try {
      const fallbackArticles = queryArticles({
        regionSlugs: ['__all__'],
        sinceMs: Date.now() - 7 * 24 * 60 * 60 * 1000,
        limit: 100
      });
      const seen = new Set();
      const deduped = fallbackArticles.filter(a => {
        const key = (a.title || '').toLowerCase().trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 30).map(a => ({
        title: a.title, source: a.source, sourceTier: a.sourceTier,
        publishedAt: a.publishedAt, description: (a.description || '').slice(0, 200),
        content: '', url: a.url, region: 'Global', isOfficial: false,
        score: 0, thumbnail: a.thumbnail || '', articleType: 'News',
        country: '', sourceDescription: '', matchReason: ''
      }));
      if (deduped.length > 0) {
        return res.json({ articles: deduped, governmentCaveat: GOVERNMENT_CAVEAT });
      }
    } catch {}
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Expand custom sector term into related keywords ─────────────
// Called client-side when the user types a custom sector like
// "Animals". Returns 10-15 related terms the sector filter can
// match against, so the user doesn't have to guess exact words.
app.post('/api/expand-sector', async (req, res) => {
  try {
    const { term } = req.body || {};
    if (!term || !String(term).trim()) {
      return res.status(400).json({ error: 'Missing term' });
    }
    const cleaned = String(term).trim();

    const prompt = `Given the topic or interest "${cleaned}", return a JSON array of 12-15 single keywords or short 2-word phrases that a news article about this topic would likely contain in its headline or description. Include the original term. Only lowercase. No prose — ONLY the JSON array.

Example: "Animals" → ["animals", "wildlife", "conservation", "endangered", "species", "zoo", "marine", "coral", "poaching", "habitat", "veterinary", "biodiversity", "fauna", "pet"]

Now do "${cleaned}":`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 200 }
    );

    const raw = chatCompletion?.choices?.[0]?.message?.content || '';
    const match = raw.match(/\[[\s\S]*\]/);
    let keywords = [];
    if (match) {
      try {
        keywords = JSON.parse(match[0]);
        if (!Array.isArray(keywords)) keywords = [];
        keywords = keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 15);
      } catch {}
    }

    // Always include the original term
    if (!keywords.includes(cleaned.toLowerCase())) {
      keywords.unshift(cleaned.toLowerCase());
    }

    res.json({ term: cleaned, keywords });
  } catch (err) {
    console.error('Expand sector error:', err.message);
    // Fallback: just use the original term
    res.json({ term: req.body?.term || '', keywords: [String(req.body?.term || '').toLowerCase().trim()] });
  }
});

// ── TL;DR Summaries ─────────────────────────────────────────────

// ── Follow-up chat about an article ─────────────────────────────
// Lets the user ask questions about a specific article and get a
// web-grounded answer from Perplexity. Conversation history is
// kept client-side and replayed on each call.
app.post('/api/chat', async (req, res) => {
  try {
    const { article, question, history } = req.body || {};
    const q = String(question || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing question' });
    if (!article || !article.title) {
      return res.status(400).json({ error: 'Missing article context' });
    }
    if (!PERPLEXITY_API_KEY) {
      return res.status(503).json({ error: 'Chat is unavailable (Perplexity not configured)' });
    }

    const baseSystem = "You are a research assistant helping the reader understand a news story. The reader has already read the article and is asking a follow-up question. Use real-time web search to answer. Be specific and factual: named actors, dates, numbers, places. Never hedge with 'some say' or 'it could be argued'. Cite sources with [n] markers inline. If the answer isn't knowable, say so plainly instead of making it up.";

    // Put the article context in the system message — that way the
    // user/assistant turns can alternate strictly, which Perplexity's
    // chat completions API requires.
    const articleContext =
      `THE ARTICLE THE READER IS ASKING ABOUT:\n` +
      `Title: ${article.title}\n` +
      `Source: ${article.source || ''}\n` +
      (article.region ? `Region: ${article.region}\n` : '') +
      (article.publishedAt ? `Published: ${article.publishedAt}\n` : '') +
      `URL: ${article.url || ''}\n\n` +
      (article.content
        ? `Article excerpt:\n${String(article.content).slice(0, 1500)}\n`
        : article.description
          ? `Article summary: ${String(article.description).slice(0, 800)}\n`
          : '');

    const systemPrompt = baseSystem + '\n\n' + articleContext;

    // Build the conversation. Perplexity requires strict alternation
    // after the system message: user → assistant → user → assistant…
    // Take the last ~6 history entries, enforce alternation by
    // dropping anything that breaks it, and drop the trailing user
    // turn if it duplicates the current question (the client pushes
    // the question to history before sending — to avoid double-asks).
    const rawHistory = Array.isArray(history)
      ? history.slice(-6).filter(m => m && m.role && m.content)
      : [];
    const cleanHistory = [];
    let expectRole = 'user';
    for (const m of rawHistory) {
      if (m.role !== expectRole) continue; // skip out-of-order turns
      cleanHistory.push(m);
      expectRole = expectRole === 'user' ? 'assistant' : 'user';
    }
    // Drop trailing user that matches the current question.
    while (cleanHistory.length
        && cleanHistory[cleanHistory.length - 1].role === 'user'
        && String(cleanHistory[cleanHistory.length - 1].content).trim() === q) {
      cleanHistory.pop();
    }
    // Drop any leftover trailing user with no following assistant —
    // we'll re-add the current question ourselves below.
    if (cleanHistory.length && cleanHistory[cleanHistory.length - 1].role === 'user') {
      cleanHistory.pop();
    }

    const messages = [{ role: 'system', content: systemPrompt }];
    for (const m of cleanHistory) {
      messages.push({ role: m.role, content: String(m.content).slice(0, 2000) });
    }
    messages.push({ role: 'user', content: q });

    const completion = await perplexityChat(messages, { temperature: 0.2, max_tokens: 700 });
    const answer = completion?.choices?.[0]?.message?.content || '';

    const searchResults = Array.isArray(completion.search_results)
      ? completion.search_results : [];
    const citations = Array.isArray(completion.citations)
      ? completion.citations
      : searchResults.map(r => r && r.url).filter(Boolean);

    // Build a [n] → url map so the client can render numeric chips.
    const citationMap = {};
    citations.forEach((url, i) => {
      if (url && typeof url === 'string') citationMap[String(i + 1)] = url;
    });
    const sourcesList = citations.map((url, i) => {
      const match = searchResults.find(r => r && r.url === url) || searchResults[i] || null;
      const title = (match && match.title) ? String(match.title) : '';
      const publication = prettyPublicationName(url) || title || ('Source ' + (i + 1));
      return { publication, title: title || 'Source', url };
    });

    res.json({ answer, citationMap, sources: sourcesList });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

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

    const prompt = `You are a senior geopolitical intelligence analyst writing 3-bullet card previews for decision-makers.

For each article, summarise in EXACTLY 3 bullet points. Each bullet is ONE sentence maximum. Cover:
  1) What happened (the core event),
  2) Why it happened or what led to it,
  3) Why it matters or what happens next.
Be specific — name actors, countries, and dates. No vague language. No filler. No "amid tensions" or "raises concerns".
For articles marked [OFFICIAL GOVERNMENT SOURCE], the first bullet must start with "OFFICIAL:" and frame as a government claim.

Articles:
${articleList}

Respond with ONLY a JSON OBJECT where each key is the article index and each value is an ARRAY of exactly 3 strings — the three bullets in order. Example for two articles:
{"0": ["What happened sentence.", "Why it happened sentence.", "Why it matters sentence."], "1": ["OFFICIAL: ...", "...", "..."]}

You MUST include every index from 0 to ${uncachedArticles.length - 1}. Each value MUST be an array of exactly 3 short sentences. Do not skip indices. Do not reorder. No prose, no markdown, no code fences — only the JSON object.`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 4000 }
    );

    const raw = chatCompletion.choices[0]?.message?.content || '{}';
    let freshMap = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) freshMap = JSON.parse(jsonMatch[0]);
    } catch {
      freshMap = {};
    }

    // Map fresh results back by index. The new format is an array of 3
    // bullets per article; we keep tolerant fallback for legacy string
    // values so cached entries from the old single-sentence format
    // still render.
    Object.keys(freshMap).forEach(key => {
      const localIdx = parseInt(key, 10);
      const value = freshMap[key];
      if (isNaN(localIdx) || !value) return;
      const originalIndex = uncachedIndices[localIdx];
      const article = uncachedArticles[localIdx];
      if (originalIndex === undefined || !article) return;
      const bullets = Array.isArray(value)
        ? value.map(b => String(b || '').trim()).filter(Boolean).slice(0, 3)
        : (typeof value === 'string' ? [value] : []);
      if (!bullets.length) return;
      summaries[originalIndex] = bullets;
      const cacheKey = TLDR_CACHE_VERSION + '::' + (article.url || article.title);
      cacheSet('tldr', cacheKey, bullets);
    });

    res.json({ summaries });
  } catch (err) {
    console.error('TL;DR generation error:', err);
    res.status(500).json({ error: 'Failed to generate summaries', summaries: [] });
  }
});

// ── Session-aware article recommendations ───────────────────────
// Takes a snapshot of the user's last few opened articles plus the
// current pool of articles visible in their feed, asks the LLM to
// pick 3 articles from the pool that connect most to what the user
// has been reading. Excludes anything they've already seen.
app.post('/api/recommendations', async (req, res) => {
  try {
    const recent = Array.isArray(req.body?.recentArticles) ? req.body.recentArticles : [];
    const pool = Array.isArray(req.body?.currentPool) ? req.body.currentPool : [];
    const seenSet = new Set((Array.isArray(req.body?.alreadySeen) ? req.body.alreadySeen : []).map(s => String(s)));

    const candidates = pool.filter(a => a && a.url && !seenSet.has(a.url));
    if (candidates.length === 0) return res.json({ recommendations: [] });

    // No reading history yet → fall back to top-of-feed snippet so
    // the panel still has something to show on a fresh session.
    if (recent.length === 0) {
      return res.json({ recommendations: candidates.slice(0, 3) });
    }

    const recentLines = recent.slice(-5).map((a, i) =>
      `[R${i}] "${(a.title || '').slice(0, 140)}" — ${a.region || ''} ${a.source || ''}`
    ).join('\n');

    const poolLines = candidates.slice(0, 80).map((a, i) =>
      `[${i}] "${(a.title || '').slice(0, 140)}" — ${a.region || ''} ${a.source || ''}`
    ).join('\n');

    const prompt = `You are a news curator. The user just opened an article. Pick 3 articles from the pool below that BEST connect to what they have been reading this session — same sector, region, keyword theme, or story thread.

ARTICLES THE USER HAS OPENED THIS SESSION (most recent last):
${recentLines}

CANDIDATE POOL (each line starts with [id]):
${poolLines}

Return ONLY this JSON (no prose, no code fences):
{"ids": [id, id, id]}

- Return EXACTLY 3 ids, ordered by relevance (best first).
- Each id is a number between 0 and ${candidates.length - 1}.
- Each id appears at most once.
- Prefer articles that share a specific actor, country, sector, or theme with the recent reading — not generic adjacency.`;

    let recIds = null;
    const t0 = Date.now();
    try {
      const completion = await groqChat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.2, max_tokens: 200 }
      );
      const raw = completion?.choices?.[0]?.message?.content || '';
      const cleaned = stripCodeFences(raw);
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.ids)) {
          const seen = new Set();
          recIds = parsed.ids
            .map(n => parseInt(n, 10))
            .filter(n => !isNaN(n) && n >= 0 && n < candidates.length && !seen.has(n) && seen.add(n))
            .slice(0, 3);
        }
      }
    } catch (err) {
      console.log('Recommendations: Groq failed (' + err.message + ')');
    }

    if ((!recIds || recIds.length < 3) && PERPLEXITY_API_KEY) {
      try {
        const completion = await perplexityChat(
          [{ role: 'user', content: prompt }],
          { temperature: 0.2, max_tokens: 200 }
        );
        const raw = completion?.choices?.[0]?.message?.content || '';
        const cleaned = stripCodeFences(raw);
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          if (Array.isArray(parsed.ids)) {
            const seen = new Set();
            recIds = parsed.ids
              .map(n => parseInt(n, 10))
              .filter(n => !isNaN(n) && n >= 0 && n < candidates.length && !seen.has(n) && seen.add(n))
              .slice(0, 3);
          }
        }
      } catch {}
    }

    // Final fallback — just give 3 candidates so the panel always
    // shows something.
    if (!recIds || recIds.length === 0) recIds = [0, 1, 2].filter(i => i < candidates.length);

    console.log(`Recommendations: picked ${recIds.length}/${candidates.length} in ${Date.now() - t0}ms`);
    res.json({ recommendations: recIds.map(i => candidates[i]) });
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.status(500).json({ recommendations: [] });
  }
});

// ── Intelligence Briefing ───────────────────────────────────────

// ── Perplexity briefing generator ───────────────────────────────
// Returns { briefing, citationMap } in the same shape as Groq so the
// /api/briefing handler can use either source transparently.
async function generateBriefingWithPerplexity({ title, articleContent, isOfficial, articleUrl }) {
  const systemPrompt = "You are a geopolitical intelligence analyst writing structured, factual briefings for professional audiences — consultants, investors, and policy professionals. You have access to real-time web search and use it AGGRESSIVELY: when the source article is thin, you fill in the missing context using your search results. You never refuse to write a briefing because the article is short — you research the topic and write a full briefing. Your output is specific, named, and concrete. Every bullet ends with a citation marker (e.g. [1], [2]) pointing at the source you drew the claim from.";

  const userPrompt = `Produce a structured intelligence briefing on the following news article. Use your real-time search aggressively to enrich every section — even if the article body is short, you should research the topic and produce a full briefing.

Article title: ${title}
Article text: ${articleContent}

Return ONLY this JSON (no prose outside, no markdown fences):
{
  "what_happened": [
    "4-6 bullets. Each bullet is one declarative sentence ending with a citation marker like [1], [2]. Cover WHO (named actors, organisations, countries — never 'officials'/'the government'), WHAT specifically happened with substantive detail, WHEN with dates, and the core factual claim with figures, titles, or terms."
  ],
  "what_led_to_this": [
    "3-5 bullets. Each bullet names a specific prior event with a date or period. Each ends with [n] citation. No vague backgrounders."
  ],
  "what_experts_say": [
    "3-5 bullets. Each bullet paraphrases a named analyst, think tank, official, or publication with a concrete position. Each ends with [n] citation."
  ],
  "why_it_matters": [
    "3-4 bullets. Each bullet is a concrete strategic consequence — a specific sector, region, price level, deadline, counterparty, or actor affected. Each ends with [n] citation."
  ]
}

HARD RULES:
- ALWAYS produce a full briefing. If the source article is thin, expand from your real-time search; never write 'Limited detail available' or any escape sentence — research and write the briefing.
- Bullets are declarative complete sentences, 15-35 words each. Multi-sentence bullets are allowed when needed.
- Every bullet ENDS with a citation marker: [1], [2], etc. — the index points to the n-th search result. No unsourced bullets.
- Every bullet has at least one concrete noun (actor, place, date, number, title).
- No bullet starts with "This", "It", "The situation", or any vague pronoun.
- Do not repeat the same fact across sections.
- Output only the JSON object. No preamble, no code fences.`;

  const completion = await perplexityChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.2, max_tokens: 1400 }
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
  // renders a proper <ul>.
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
The WHAT HAPPENED bullets must collectively answer all of: WHO (named actors, organisations, countries — never generic like "the government" or "officials"), WHAT specifically happened (concrete event/decision with substantive content — never vague phrasing like "a trade deal was reached" without specifying what it covers), WHEN (specific date or timeframe), and the core factual claim (what was actually said, signed, announced, or changed, with figures and terms where available). Every bullet must be specific — no filler. If the article body is short, expand using your training/context to research the topic — but ALWAYS produce a full briefing. Never write "Limited detail available" or any escape sentence.
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

const IMPACT_CACHE_VERSION = 'v4-pplx-chat-bullets';

function buildImpactProfileDesc(profile) {
  return [
    profile.role && `Role: ${profile.role}`,
    profile.industry && `Industry: ${profile.industry}`,
    profile.company && `Company: ${profile.company}`,
    profile.location && `Based in: ${profile.location}`,
    profile.focus && `Focus areas: ${profile.focus}`
  ].filter(Boolean).join(' | ');
}

// Renders the full profile + active-filter context the impact prompt
// needs to check every dimension before deciding on relevance.
function buildFullContextBlock(profile, activeFilters) {
  profile = profile || {};
  const af = activeFilters || {};
  const lines = [];
  lines.push('- Role / occupation: ' + (String(profile.role || '').trim() || 'Not specified'));
  lines.push('- Company or organisation: ' + (String(profile.company || '').trim() || 'Not specified'));
  lines.push('- Country they are based in: ' + (String(profile.location || '').trim() || 'Not specified'));
  const regions = Array.isArray(af.regions) && af.regions.length ? af.regions.join(', ') : 'Global / not narrowed';
  lines.push('- Regions they follow: ' + regions);
  const profileIndustries = Array.isArray(profile.industries) ? profile.industries : [];
  const profileCustomSectors = Array.isArray(profile.customSectors) ? profile.customSectors : [];
  const filterSectors = Array.isArray(af.sectors) ? af.sectors : [];
  const filterCustomSectors = Array.isArray(af.customSectors) ? af.customSectors : [];
  const allSectors = Array.from(new Set([
    ...profileIndustries, ...profileCustomSectors, ...filterSectors, ...filterCustomSectors
  ])).filter(Boolean);
  lines.push('- Sectors of interest: ' + (allSectors.length ? allSectors.join(', ') : 'Not specified'));
  const profileKeywords = Array.isArray(profile.keywords) ? profile.keywords : [];
  const filterKeywords = Array.isArray(af.keywords) ? af.keywords : [];
  const allKeywords = Array.from(new Set([...profileKeywords, ...filterKeywords])).filter(Boolean);
  lines.push('- Keywords they track: ' + (allKeywords.length ? allKeywords.join(', ') : 'None'));
  const includeSources = Array.isArray(af.includeSources) && af.includeSources.length ? af.includeSources.join(', ') : '(none explicitly whitelisted)';
  const excludeSources = Array.isArray(af.excludeSources) && af.excludeSources.length ? af.excludeSources.join(', ') : '(none blocked)';
  lines.push('- Sources they chose to follow (whitelist): ' + includeSources);
  lines.push('- Sources they chose to exclude (blocklist): ' + excludeSources);
  const focus = String(profile.focus || '').trim();
  if (focus) lines.push('- Other focus areas / concerns: ' + focus);
  return lines.join('\n');
}

async function generateImpactWithPerplexity({ title, source, articleContent, profile, activeFilters, expertArticles, url }) {
  const fullContext = buildFullContextBlock(profile, activeFilters);

  const systemPrompt = "You are Perplexity answering a personal-impact question. Imagine the user has just opened Perplexity and asked, with their full context attached, 'Given my profile, regions, sectors, keywords, and source preferences below, does THIS news story actually affect me, and how?' You answer with the same intellectual honesty Perplexity does: if there's a genuine, specific connection, you spell out the concrete mechanism with cited sources. If the story has no real relevance to the user's stated interests, you say so plainly — you do not stretch, hedge, or manufacture an angle. Your credibility depends on never forcing a connection that isn't there. You never invent or imply connections to a user's company, employer, or identifying details unless the article specifically references or implicates them.";

  const userPrompt = `Treat this exactly like a Perplexity chat where the user has attached their full context profile and asked: "Does this story affect me?"

THE STORY:
Title: ${title}
Source: ${source}
Briefing content:
${articleContent}

THE USER'S CONTEXT (what they've told us they care about):
${fullContext}

Imagine the user pasted all of the above into a Perplexity chat. Now answer their question: "Given my profile, regions, sectors, keywords, and source preferences, does this story affect me, and how?"

Check each dimension before answering:
1. Does the user's role or occupation get directly affected by what the article describes?
2. Is the user's company or organisation specifically named, referenced, or implicated?
3. Is the user's country of residence directly affected (policy, economy, security, society)?
4. Does the article concern any of the user's selected regions in a substantive way (not just casual mention)?
5. Does the article fall squarely within any of the user's selected sectors?
6. Does the article directly mention or closely relate to any of the user's tracked keywords?
7. Is the article from (or directly about) a source the user chose to follow?

Honesty rule: ANY dimension passing this bar yields analysis. If ALL of them are tangential or unrelated, you say so and stop — no forced impact. The user values your honesty more than your eagerness to find a connection.

Return ONLY this JSON (no prose outside, no markdown fences):
{
  "relevance": "HIGH | MEDIUM | LOW | NONE",
  "matched_dimensions": ["List ONLY the dimensions that genuinely match, e.g. 'Sector: Climate & Environment', 'Region: Southeast Asia', 'Keyword: IRA'. Empty array if relevance = NONE."],
  "impact_summary": [
    "2-4 bullets. Each bullet is one declarative sentence (15-30 words) that ties a SPECIFIC matched dimension to a concrete mechanism. Example: 'Because you follow Southeast Asia and the article describes a 30% tariff on Vietnamese exports, [1].' Every bullet ends with a [n] citation marker. Only present if relevance != NONE."
  ],
  "what_to_watch": [
    "2-3 bullets. Each bullet is a concrete upcoming trigger, date, data release, regulatory deadline, or counterparty move. Each ends with [n] citation. Only present if relevance != NONE."
  ],
  "no_impact_reason": "Required ONLY if relevance = NONE. One short sentence explaining why this story has no direct relevance to the user's stated interests. Plain English, honest tone — e.g. 'This story is about UK rail strikes and doesn't intersect with your tracked sectors (crypto, climate), regions (Singapore, Southeast Asia), or keywords.'"
}

HARD RULES:
- Do NOT manufacture connections. Tangential associations like "this could affect the broader industry" are NOT genuine.
- Do NOT mention the user's company, employer, or any identifying detail unless the article specifically references or implicates them.
- Each bullet in impact_summary and what_to_watch ends with a [n] citation marker.
- Bullets are declarative and concrete — every bullet has a named noun (actor, place, date, number).
- No bullet starts with "This", "It", "The situation", or any vague pronoun.
- If every dimension comes up tangential or unrelated, set relevance to NONE and write the no_impact_reason explaining specifically what's missing.
- Output ONLY the JSON object. No preamble, no code fences.`;

  const completion = await perplexityChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.15, max_tokens: 800 }
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

  const relevanceRaw = String(parsed.relevance || 'MEDIUM').toUpperCase().trim();
  const relevance = /^(HIGH|MEDIUM|LOW|NONE)$/.test(relevanceRaw) ? relevanceRaw : 'MEDIUM';

  const citations = Array.isArray(completion.citations)
    ? completion.citations
    : (Array.isArray(completion.search_results) ? completion.search_results.map(r => r.url).filter(Boolean) : []);
  const citationMap = { 'Article': url || '', 'Profile': '' };
  citations.forEach((u, i) => {
    if (u && typeof u === 'string') citationMap[String(i + 1)] = u;
  });

  if (relevance === 'NONE') {
    const noImpactReason = (parsed.no_impact_reason && String(parsed.no_impact_reason).trim()) ||
      'This story does not appear to have a direct impact on your current focus areas. No forced analysis — check back if the situation develops.';
    return {
      impact: 'RELEVANCE:\nNONE\n\n',
      relevance,
      citationMap,
      noImpactReason
    };
  }

  // impact_summary and what_to_watch are bullet arrays. Tolerantly
  // accept a string (split on newlines) so a model that returns prose
  // still works.
  const asBulletsImpact = (val) => {
    const lines = Array.isArray(val) ? val : String(val || '').split(/\n+/);
    return lines
      .map(s => String(s || '')
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .trim())
      .filter(Boolean);
  };
  const summary = asBulletsImpact(parsed.impact_summary);
  const watch = asBulletsImpact(parsed.what_to_watch);
  if (!summary.length || !watch.length) throw new Error('Perplexity impact is missing bullets');

  const bulletify = (arr) => arr.map(s => '- ' + s).join('\n');
  const impact =
    `RELEVANCE:\n${relevance}\n\n` +
    `IMPACT SUMMARY:\n${bulletify(summary)}\n\n` +
    `WHAT TO WATCH:\n${bulletify(watch)}`;

  return { impact, relevance, citationMap };
}

async function generateImpactWithGroq({ title, source, articleContent, profile, activeFilters, expertArticles, url }) {
  const fullContext = buildFullContextBlock(profile, activeFilters);

  const citationTags = ['[Article]', '[Profile]'];
  expertArticles.forEach(ea => citationTags.push(`[${ea.source}]`));
  const citationList = citationTags.join(', ');

  const prompt = `You are a rigorous analyst in the user's position. You only draw connections that genuinely exist. You never force relevance. Never manufacture a connection to the user's company, employer, or university unless the article genuinely references or implicates them.

ARTICLE: ${title} (${source})
ARTICLE TEXT: ${articleContent}

USER PROFILE AND INTERESTS:
${fullContext}

Check these dimensions in order before deciding:
1. User's role / occupation
2. User's company or organisation (only count if specifically referenced or implicated)
3. User's country of residence
4. Any of the user's selected regions
5. Any of the user's selected sectors
6. Any of the user's tracked keywords
7. Any followed or excluded sources

If ANY dimension produces a GENUINE, specific hit, produce the analysis. Otherwise output the no-impact response.

Use this EXACT format. Citations in brackets (${citationList}). Bullets max 25 words each.

RELEVANCE:
[HIGH | MEDIUM | LOW | NONE]

If RELEVANCE is NONE, write ONLY:
NO_IMPACT_REASON:
This story does not appear to have a direct impact on your current focus areas. No forced analysis — check back if the situation develops.

Otherwise (HIGH / MEDIUM / LOW):

MATCHED DIMENSIONS:
- Specific matched dimensions, e.g. "Sector: Climate & Environment", "Region: Southeast Asia".

IMPACT SUMMARY:
- Concrete mechanism tied to a named matched dimension. [Article or Profile]
- Second mechanism tied to a matched dimension. [Article or Profile]
- Third, if genuinely distinct. [Article or Profile]

WHAT TO WATCH:
- Specific trigger, date, or counterparty to track. [Article or Profile]
- Second actionable item. [Article or Profile]

HARD RULES:
- Do not manufacture connections. Tangential associations are NOT genuine — reject them.
- Do not name the user's company / university / employer unless the article specifically implicates them.
- No bullet begins with "This", "It", "The situation", or a vague pronoun.`;

  const chatCompletion = await groqChat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.2, max_tokens: 450 }
  );

  const impact = chatCompletion.choices[0]?.message?.content || 'Unable to generate impact analysis.';
  const relevanceMatch = impact.match(/RELEVANCE:\s*(HIGH|MEDIUM|LOW|NONE)/i);
  const relevance = relevanceMatch ? relevanceMatch[1].toUpperCase() : 'MEDIUM';

  const citationMap = { 'Article': url || '', 'Profile': '' };
  expertArticles.forEach(ea => {
    if (ea.source && ea.url) citationMap[ea.source] = ea.url;
  });

  if (relevance === 'NONE') {
    const reasonMatch = impact.match(/NO_IMPACT_REASON:\s*([\s\S]+?)$/i);
    const noImpactReason = (reasonMatch && reasonMatch[1].trim()) ||
      'This story does not appear to have a direct impact on your current focus areas. No forced analysis — check back if the situation develops.';
    return { impact: 'RELEVANCE:\nNONE\n\n', relevance, citationMap, noImpactReason };
  }

  return { impact, relevance, citationMap };
}

app.post('/api/impact', async (req, res) => {
  try {
    const { title, source, description, content, profile, activeFilters, url, region } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Profile required' });
    }
    const hasAnyField = profile.role || profile.industry ||
      profile.company || profile.location || profile.focus ||
      (Array.isArray(profile.industries) && profile.industries.length > 0);
    if (!hasAnyField) {
      return res.status(400).json({ error: 'Profile has no usable fields' });
    }
    if (!profile.role || !String(profile.role).trim()) {
      profile = { ...profile, role: 'Professional' };
    }

    // Cache key now folds in activeFilters so different filter contexts
    // produce different impact analyses for the same article.
    const profileHash = hashString(JSON.stringify({
      role: profile.role, industry: profile.industry,
      company: profile.company,
      location: profile.location, focus: profile.focus,
      filters: activeFilters || null
    }));
    const impactCacheKey = IMPACT_CACHE_VERSION + '::v3::' + (url || title) + '::' + profileHash;
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
          title, source, articleContent, profile, activeFilters, expertArticles, url
        });
        provider = 'perplexity';
      } catch (err) {
        console.error('Perplexity impact failed, falling back to Groq:', err.message);
        result = null;
      }
    }

    if (!result) {
      result = await generateImpactWithGroq({
        title, source, articleContent, profile, activeFilters, expertArticles, url
      });
      provider = 'groq';
    }

    const impactResponse = {
      impact: result.impact,
      relevance: result.relevance,
      citationMap: result.citationMap,
      noImpactReason: result.noImpactReason || null,
      provider
    };
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
  const corpus = require('./db').stats();
  res.json({ regions: stats, total, corpus });
});

// Debug endpoint: fire one Perplexity news search and return the
// articles. Lets us verify the live-search path on the deploy host.
app.get('/api/debug/news-search', async (req, res) => {
  const q = String(req.query.q || 'bitcoin').slice(0, 100);
  try {
    const { perplexityNewsSearch } = require('./ingest');
    const t0 = Date.now();
    const articles = await perplexityNewsSearch(q, { regionSlug: 'global' });
    const took = Date.now() - t0;
    res.json({
      query: q,
      took_ms: took,
      count: articles.length,
      sample: articles.slice(0, 8).map(a => ({
        title: a.title,
        source: a.source,
        url: a.url,
        publishedAt: a.publishedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack?.slice(0, 500) });
  }
});

// Debug endpoint: trigger a one-off bulk ingest synchronously and
// return what each phase produced. Use this to verify that ingest
// works at all on the deploy host.
app.get('/api/debug/ingest', async (req, res) => {
  try {
    const ingest = require('./ingest');
    const out = {};
    out.gnews = await ingest.ingestGoogleNews().catch(e => ({ error: e.message }));
    out.gdelt_skipped = 'GDELT skipped to keep this endpoint snappy';
    out.corpus = require('./db').stats();
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
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
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html' }
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
    const ttNames = thinkTankSources.map(s => s.name);
    if (ttNames.length) {
      const ttArticles = queryArticles({
        regionSlugs: ['__all__'],
        sinceMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
        includeSources: ttNames,
        limit: 60
      });
      for (const a of ttArticles) {
        if (a.title && a.url) {
          expertPool.push({
            source: a.source,
            title: a.title,
            description: (a.description || '').substring(0, 150),
            url: a.url
          });
        }
        if (expertPool.length >= 20) break;
      }
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
