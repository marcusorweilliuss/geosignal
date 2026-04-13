require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');
const Parser = require('rss-parser');

const { SOURCES, getSourcesForRegion, scoreArticle, GOVERNMENT_CAVEAT, classifyArticleType, extractPrimaryCountry } = require('./sources');

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
const BRIEFING_CACHE_VERSION = 'v4-specific-what-happened';

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
    const { region, sectors, sourceTypes, profile: profileStr, search, articleTypes } = req.query;
    const regionSlug = regionSlugMap[region] || 'global';
    const typeList = sourceTypes ? sourceTypes.split(',') : ['Mainstream news', 'Independent journalism', 'Think tanks & academic'];
    const activeSectors = sectors ? sectors.split(',') : [];
    const searchTerms = search ? search.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1) : [];
    const activeArticleTypes = articleTypes
      ? articleTypes.split(',').map(t => t.trim()).filter(Boolean)
      : ['News', 'Analysis']; // default: News + Analysis, Opinion off

    // Get filtered sources from registry
    const sources = getSourcesForRegion(regionSlug, typeList);

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

    // Apply sector filter — article must match at least one active sector's keywords
    if (activeSectors.length > 0 && activeSectors.length < 8) {
      // Build keyword list from only the active sectors
      const { SECTOR_KEYWORDS: sectorKw } = require('./sources');
      const activeSectorKeywords = activeSectors
        .map(s => sectorKw[s])
        .filter(Boolean)
        .flat()
        .map(k => k.toLowerCase());

      if (activeSectorKeywords.length > 0) {
        unique = unique.filter(a => {
          const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
          return activeSectorKeywords.some(kw => text.includes(kw));
        });
      }
    }

    // Score, filter junk, and sort
    unique.forEach(a => {
      a.score = scoreArticle(a, regionSlug, userProfile, activeSectors);
      if (searchTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const titleMatches = searchTerms.filter(t => titleLower.includes(t)).length;
        a.score += titleMatches * 10;
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
        country: article.country || ''
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
  const systemPrompt = "You are a geopolitical intelligence analyst. You produce structured, factual briefings for professional audiences — consultants, investors, and policy professionals. You have access to real-time information. Your output must be specific, named, and concrete — never vague. Always cite specific actors, dates, and sources where possible.";

  const userPrompt = `Produce a structured intelligence briefing on the following news article. Use your knowledge and any relevant context to enrich the analysis beyond what is stated in the article alone.

Article title: ${title}
Article text: ${articleContent}

Return your response in exactly this JSON structure (and nothing else — no prose before or after, no markdown fences):
{
  "what_happened": "A 3-5 sentence factual summary that MUST answer all of: (1) WHO is involved — specific named actors, organisations, and countries, never generic collective nouns like 'the government' or 'officials'; (2) WHAT specifically happened — the concrete event, decision, signing, announcement, or change, including the substantive content (e.g. not 'a trade deal was reached' but 'X and Y signed a 10-year agreement covering semiconductors and critical minerals, with Z percent tariff reductions'); (3) WHEN it happened — specific date or precise timeframe; (4) the core factual claim — what was actually said, decided, signed, announced, or changed, with concrete figures, titles, or terms where present. Every sentence must be specific. Do NOT use vague filler language. CRITICAL: If the source article does not contain enough specific information to answer these questions, the entire what_happened field must be exactly: 'Limited detail available — see original article for full context' and nothing else.",
  "what_led_to_this": "2-4 sentences of relevant historical and political background explaining why this is happening now. Reference specific prior events with dates.",
  "what_experts_say": "2-4 sentences synthesising perspectives from named analysts, think tanks, or officials who have commented on this development or related issues. Only cite real sources — if you cannot find genuine expert commentary, say so explicitly rather than fabricating citations.",
  "why_it_matters": "2-3 sentences on the strategic significance and broader implications of this development"
}`;

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

  const whatHappened = (parsed.what_happened || '').trim();
  const whatLed = (parsed.what_led_to_this || '').trim();
  const whatExperts = (parsed.what_experts_say || '').trim();
  const whyMatters = (parsed.why_it_matters || '').trim();

  if (!whatHappened || !whatLed || !whatExperts || !whyMatters) {
    throw new Error('Perplexity JSON is missing one or more required sections');
  }

  // Reformat into the text shape the frontend already parses
  // (four labelled sections: WHAT HAPPENED / WHAT LED TO THIS /
  //  WHAT REGIONAL EXPERTS ARE SAYING / WHY THIS MATTERS).
  const expertsLabel = isOfficial
    ? 'WHAT THE GOVERNMENT IS CLAIMING AND ITS LIKELY STRATEGIC INTENT'
    : 'WHAT REGIONAL EXPERTS ARE SAYING';

  const briefingText =
    `WHAT HAPPENED:\n${whatHappened}\n\n` +
    `WHAT LED TO THIS:\n${whatLed}\n\n` +
    `${expertsLabel}:\n${whatExperts}\n\n` +
    `WHY THIS MATTERS:\n${whyMatters}`;

  // Perplexity returns a `citations` array of URLs (and/or a search_results
  // array). Map them to numeric citation tags ([1], [2], ...) so they
  // render as clickable chips on the frontend.
  const citations = Array.isArray(completion.citations)
    ? completion.citations
    : (Array.isArray(completion.search_results) ? completion.search_results.map(r => r.url).filter(Boolean) : []);

  const citationMap = { 'Article': articleUrl || '' };
  citations.forEach((url, i) => {
    if (url && typeof url === 'string') citationMap[String(i + 1)] = url;
  });

  return { briefing: briefingText, citationMap, citations };
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
        // Map numeric Perplexity citations into expertSources for the
        // frontend's "Sources referenced" chip list.
        expertSourcesForResponse = (pplx.citations || []).map((u, i) => ({
          title: `Source ${i + 1}`,
          source: String(i + 1),
          url: u
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

    const responsePayload = {
      briefing,
      isOfficial: !!isOfficial,
      expertSources: expertSourcesForResponse,
      citationMap,
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

app.post('/api/impact', async (req, res) => {
  try {
    const { title, source, description, content, profile, url, region } = req.body;

    if (!profile || !profile.role) {
      return res.status(400).json({ error: 'Profile required' });
    }

    // Cache key combines article URL with profile hash so different
    // profiles get different impact analyses for the same article
    const profileHash = hashString(JSON.stringify({
      role: profile.role, industry: profile.industry,
      company: profile.company,
      location: profile.location, focus: profile.focus
    }));
    const impactCacheKey = (url || title) + '::' + profileHash;
    const cachedImpact = cacheGet('impact', impactCacheKey);
    if (cachedImpact) return res.json(cachedImpact);

    // Fetch full article text for richer analysis
    const fullText = url ? await fetchFullArticleText(url) : '';
    const articleContent = fullText || content || description || '';

    // Find related think tank analysis for this region
    const regionSlug = regionSlugMap[region] || 'global';
    const expertArticles = findRelatedThinkTankArticles(title, regionSlug);

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

    const profileDesc = [
      profile.role && `Role: ${profile.role}`,
      profile.industry && `Industry: ${profile.industry}`,
      profile.company && `Company: ${profile.company}`,
      profile.location && `Based in: ${profile.location}`,
      profile.focus && `Focus areas: ${profile.focus}`
    ].filter(Boolean).join(' | ');

    const prompt = `You are an analyst providing a personalized impact assessment. Be specific to this person's role, industry, company (if given), and location. When a Company is listed in the profile, reason about how this story affects that specific company's operations, revenue streams, regulatory exposure, or competitive position — but only make claims you can ground in the article or well-known public information about that company. Do not fabricate details about the company. Use bullet points — no filler.

PROFILE: ${profileDesc}
ARTICLE: ${title} (${source})
TEXT: ${articleContent}${expertContext}

CITATION RULES — CRITICAL:
- Every bullet MUST end with a citation tag in square brackets
- Allowed tags: ${citationList}
- [Article] — when the fact comes from the article
- [Profile] — when the reasoning is based on the reader's profile/industry knowledge
- Think tank name in brackets (e.g. [Brookings]) — when paraphrasing expert analysis
- Only ONE citation at the end of each bullet
- Never invent a source

Use EXACTLY this format. Bullets with dashes (-), each ONE line max:

RELEVANCE:
[One word: HIGH, MEDIUM, or LOW]

IMPACT SUMMARY:
- How this specifically affects your role/industry. Name the mechanism. [Article or Profile]
- Financial, regulatory, or operational consequence for your sector. [Article or Profile]

WHAT TO WATCH:
- Specific trigger, date, policy decision, or data release to monitor. [Article or Profile]
- Second actionable item. [Article or Profile]`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, max_tokens: 300 }
    );

    const impact = chatCompletion.choices[0]?.message?.content || 'Unable to generate impact analysis.';
    const relevanceMatch = impact.match(/RELEVANCE:\s*(HIGH|MEDIUM|LOW)/i);
    const relevance = relevanceMatch ? relevanceMatch[1].toUpperCase() : 'MEDIUM';

    // Build citation map for clickable chips
    const citationMap = { 'Article': url || '', 'Profile': '' };
    expertArticles.forEach(ea => {
      if (ea.source && ea.url) citationMap[ea.source] = ea.url;
    });

    const impactResponse = { impact, relevance, citationMap };
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

// ── Reddit Sentiment Search ─────────────────────────────────────
// Searches Reddit for recent discussions related to a topic

const redditCache = {};
const REDDIT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

app.get('/api/sentiment/reddit', async (req, res) => {
  try {
    const { topic } = req.query;
    if (!topic) return res.status(400).json({ error: 'topic parameter required' });

    // Check cache
    const cacheKey = topic.toLowerCase().trim();
    const cached = redditCache[cacheKey];
    if (cached && (Date.now() - cached.fetchedAt) < REDDIT_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Extract 3-5 key terms from the headline for better Reddit search
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','has','have','had','not','as','its','says','said','new','over','after','will','could','may','been','into','about','more','than']);
    const keywords = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
    const query = encodeURIComponent(keywords.join(' '));

    // Search across geopolitics-relevant subreddits
    const subreddits = [
      'worldnews', 'geopolitics', 'internationalpolitics',
      'economics', 'energy', 'technology', 'news'
    ];

    const allPosts = [];

    // Search Reddit using old.reddit.com (more reliable for JSON API)
    for (const sub of subreddits) {
      try {
        const url = `https://old.reddit.com/r/${sub}/search.json?q=${query}&sort=relevance&t=month&limit=5&restrict_sr=on`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html, application/json'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(`Reddit r/${sub}: HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();
        const posts = (data?.data?.children || []).map(child => {
          const post = child.data;
          return {
            title: post.title || '',
            subreddit: post.subreddit_name_prefixed || `r/${sub}`,
            score: post.score || 0,
            numComments: post.num_comments || 0,
            url: `https://reddit.com${post.permalink}`,
            created: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : '',
            selftext: (post.selftext || '').substring(0, 200)
          };
        });

        allPosts.push(...posts);
      } catch {
        // Skip failed subreddit, continue with others
        continue;
      }

      // Brief pause to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    // Deduplicate by title
    const seen = new Set();
    const unique = allPosts.filter(p => {
      const key = p.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by engagement (score + comments) and take top 5
    unique.sort((a, b) => (b.score + b.numComments * 2) - (a.score + a.numComments * 2));
    const topPosts = unique.slice(0, 5);

    const result = {
      platform: 'reddit',
      query: topic,
      posts: topPosts,
      note: 'Reddit skews younger, male, and left-of-centre in English-speaking subreddits. Weigh accordingly.'
    };

    // Cache the result
    redditCache[cacheKey] = { data: result, fetchedAt: Date.now() };

    res.json(result);
  } catch (err) {
    console.error('Reddit sentiment error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Reddit discussions', posts: [] });
  }
});

// ── Bluesky Sentiment Search ────────────────────────────────────
// Searches Bluesky's public API for posts related to a topic

const blueskyCache = {};
const BLUESKY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

app.get('/api/sentiment/bluesky', async (req, res) => {
  try {
    const { topic } = req.query;
    if (!topic) return res.status(400).json({ error: 'topic parameter required' });

    // Check cache
    const cacheKey = topic.toLowerCase().trim();
    const cached = blueskyCache[cacheKey];
    if (cached && (Date.now() - cached.fetchedAt) < BLUESKY_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Extract key terms for better search results
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','has','have','had','not','as','its','says','said','new','over','after','will','could','may','been','into','about','more','than']);
    const keywords = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
    const query = encodeURIComponent(keywords.join(' '));

    // Bluesky public search API — no auth needed
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${query}&sort=top&limit=25`;

    const bskyController = new AbortController();
    const bskyTimeout = setTimeout(() => bskyController.abort(), 10000);
    const response = await fetch(url, {
      signal: bskyController.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GeoSignal/1.0)',
        'Accept': 'application/json'
      }
    });

    clearTimeout(bskyTimeout);
    if (!response.ok) {
      console.error('Bluesky API error:', response.status);
      return res.json({ platform: 'bluesky', query: topic, posts: [], note: 'Bluesky API unavailable.' });
    }

    const data = await response.json();
    const posts = (data.posts || []).map(post => {
      const record = post.record || {};
      const author = post.author || {};
      return {
        text: (record.text || '').substring(0, 300),
        username: author.handle || 'unknown',
        displayName: author.displayName || author.handle || 'Unknown',
        likes: post.likeCount || 0,
        reposts: post.repostCount || 0,
        replies: post.replyCount || 0,
        url: author.handle && post.uri
          ? `https://bsky.app/profile/${author.handle}/post/${post.uri.split('/').pop()}`
          : '',
        created: record.createdAt || ''
      };
    });

    // Filter out very short posts and sort by engagement
    const meaningful = posts.filter(p => p.text.length > 30);
    meaningful.sort((a, b) => (b.likes + b.reposts * 2 + b.replies) - (a.likes + a.reposts * 2 + a.replies));
    const topPosts = meaningful.slice(0, 5);

    const result = {
      platform: 'bluesky',
      query: topic,
      posts: topPosts,
      note: 'Bluesky skews toward journalists, academics, and tech-adjacent users. Growing but not yet representative of general public opinion.'
    };

    // Cache the result
    blueskyCache[cacheKey] = { data: result, fetchedAt: Date.now() };

    res.json(result);
  } catch (err) {
    console.error('Bluesky sentiment error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Bluesky posts', posts: [] });
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
    const csKey = hashString(
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

Produce 2-4 insights TOTAL. Use this EXACT format, no markdown, no asterisks:

INSIGHT 1
TYPE: [CAUSAL CHAIN | SHARED ENTITY | SECOND-ORDER EFFECT | CONTRADICTION]
TOPIC: [Short topic, max 8 words. Actual subject matter — NEVER "Headline 1" or "Story A"]
STORIES: [Comma-separated actual subjects being connected]
CHAIN: [ONLY for CAUSAL CHAIN type — the event flow with arrows. e.g. "Red Sea attacks → Suez delays → LNG prices +12% → EU fuel costs rise". Leave empty for other types. Just the chain, no prose, no citation.]
MECHANISM: [ONE sentence naming the specific mechanism: actors, numbers, dates, percentages. End with a citation tag. Example: "EU cut Russian oil cap to \$50 while India boosted imports 18%, arbitraging the gap. [Carnegie Endowment]"]
TAKEAWAY: [ONE sentence on what you should track, adjust, or reconsider. End with a citation tag. Example: "Watch Indian refinery throughput reports — arbitrage ends when capacity maxes out in Q2. [Profile]"]

CRITICAL RULES:
- MECHANISM and TAKEAWAY must NEVER repeat each other or the CHAIN
- Every MECHANISM and TAKEAWAY ends with exactly ONE citation tag
- Prefer think tank citations when experts are available — cite them by exact name
- CHAIN is ONLY for CAUSAL CHAIN type — leave blank for other types
- Never write phrases like "for the [role] in [location]"
- Use REAL topic names, never "Headline 1"
- If you can't find 2 genuinely substantive patterns, return only 1`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.35, max_tokens: 1000 }
    );

    const raw = chatCompletion.choices[0]?.message?.content || '';

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

    const csResponse = { insights, citationMap };
    cacheSet('crossSector', csKey, csResponse);
    res.json(csResponse);
  } catch (err) {
    console.error('Cross-sector analysis error:', err.message);
    res.json({ insights: [] });
  }
});

app.listen(PORT, () => {
  const totalSources = Object.values(SOURCES).reduce((a, b) => a + b.length, 0);
  console.log(`GeoSignal running at http://localhost:${PORT}`);
  console.log(`Source registry: ${totalSources} sources across ${Object.keys(SOURCES).length} regions`);
  console.log(`Groq keys loaded: ${groqClients.length} (models: ${GROQ_MODEL}, ${GROQ_FALLBACK_MODEL})`);
});
