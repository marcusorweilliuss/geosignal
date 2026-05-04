// Article ingestion. Three sources:
//
//   1. RSS — the existing curated source list in sources.js
//   2. GDELT Doc 2.0 — free, queryable news index, ~100k articles/day
//   3. Google News RSS-by-query — free firehose, anything Google News indexes
//
// All three write into the SQLite article store (db.js). The /api/news
// handler reads from SQLite instead of an in-memory feed cache.
//
// Failures are logged but never thrown — if GDELT is rate-limited or
// Google News changes its format, RSS keeps working.

const fetch = require('node-fetch');
const Parser = require('rss-parser');

const { SOURCES, getSourcesForRegion } = require('./sources');
const { upsertManyArticles, pruneOlderThan, stats } = require('./db');
const { isNonNewsUrl, looksLikeProductSpam, isJunkArticle } = require('./quality-filters');

// ── Perplexity Sonar — primary topical news source ──────────────
// Google News blocks Render's IP pool, so Perplexity is now our
// primary source for both bulk ingest of topical news and per-request
// live search. Perplexity returns up to ~10-20 search_results per
// query with title, url, date, and a snippet. Great quality but
// each call costs money — heavy caching elsewhere keeps the bill low.
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';

function prettySourceFromUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./, '');
    // Trim a trailing TLD pair like ".com" / ".co.uk" — keep the brand.
    host = host.replace(/\.(com|org|net|gov|co|news|io|info)(\.[a-z]{2})?$/i, '');
    return host
      .split(/[.\-]/)
      .filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  } catch {
    return '';
  }
}

// Quality filters (isNonNewsUrl, looksLikeProductSpam, isJunkArticle)
// are imported from quality-filters.js so the storage layer (db.js)
// applies the same rules and we never persist junk.

async function perplexityNewsSearch(query, { regionSlug = '', max = 20, recency = 'week' } = {}) {
  if (!PERPLEXITY_API_KEY) return [];
  if (!query || String(query).trim().length < 2) return [];

  const messages = [
    { role: 'system', content: 'You are a news search engine. Return only the most recent news articles about the user\'s topic. Do not summarize or analyze. Just acknowledge with one short sentence — the citations are what matter.' },
    { role: 'user', content: `List the most recent news articles about: ${String(query).trim()}` }
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages,
        temperature: 0,
        max_tokens: 80,
        search_recency_filter: recency
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`Perplexity HTTP ${res.status} on "${String(query).slice(0, 40)}…": ${body.slice(0, 150)}`);
      return [];
    }
    const data = await res.json();
    const results = Array.isArray(data.search_results) ? data.search_results : [];
    return results
      .filter(r => r && r.url && !isNonNewsUrl(r.url) && !looksLikeProductSpam(r.title))
      .slice(0, max)
      .map(r => ({
        title: r.title || '',
        description: r.snippet || r.title || '',
        content: r.snippet || '',
        url: r.url || '',
        publishedAt: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
        source: prettySourceFromUrl(r.url) || 'Perplexity',
        sourceTier: 'perplexity',
        sourceCountry: [],
        region: regionSlug,
        thumbnail: '',
        ingestOrigin: 'perplexity'
      }))
      .filter(a => a.title && a.url);
  } catch (err) {
    console.log(`Perplexity error on "${String(query).slice(0, 40)}…": ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const rssParser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; GeoSignal/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  }
});

// Helper: extract a thumbnail URL from an RSS item (mirrors the old
// extractThumbnail in server.js so the migrated path renders the
// same images).
function extractThumbnail(item) {
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
    return item['media:content'].$.url;
  }
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
    return item['media:thumbnail'].$.url;
  }
  const html = item.content || item['content:encoded'] || item.summary || '';
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function rssItemToArticle(item, source, originTag = 'rss') {
  return {
    title: item.title || '',
    description: item.contentSnippet || item.content || item.summary || '',
    content: item.content || item['content:encoded'] || item.contentSnippet || item.summary || '',
    url: item.link || '',
    publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
    source: source.name,
    sourceTier: source.tier,
    sourceCountry: source.country,
    region: source.region,
    thumbnail: extractThumbnail(item),
    ingestOrigin: originTag
  };
}

// ── RSS ingest ──────────────────────────────────────────────────

async function fetchOneFeed(source) {
  if (!source || !source.rssUrl) return [];
  try {
    const feed = await rssParser.parseURL(source.rssUrl);
    return (feed.items || [])
      .slice(0, 12)
      .map(item => rssItemToArticle(item, source, 'rss'));
  } catch (err) {
    return [];
  }
}

async function ingestRss({ concurrency = 10 } = {}) {
  const allSources = Object.values(SOURCES).flat();
  let inserted = 0;
  let processed = 0;

  for (let i = 0; i < allSources.length; i += concurrency) {
    const batch = allSources.slice(i, i + concurrency);
    const lists = await Promise.all(batch.map(fetchOneFeed));
    const flat = lists.flat();
    inserted += upsertManyArticles(flat);
    processed += batch.length;
  }

  return { processed, inserted };
}

// ── GDELT Doc 2.0 ingest ────────────────────────────────────────
// API: https://api.gdeltproject.org/api/v2/doc/doc
// Free. Rate-limited to ~1 request per 5 seconds. We respect that.
//
// We fire one query per region (sourcecountry filter) plus a small
// set of broad topical queries. Each request returns up to 250
// articles. We cap at 75 to keep payloads small.

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_PAUSE_MS = 5500; // sit comfortably above their 5s rule

// GDELT sourcecountry uses 2-letter ISO codes. For each region we
// pick the dominant country codes. Queries against these return
// articles published BY local outlets (not just about them).
const GDELT_REGION_QUERIES = {
  'global':                'sourcecountry:US OR sourcecountry:UK',
  'middle-east':           'sourcecountry:IS OR sourcecountry:IR OR sourcecountry:SA OR sourcecountry:AE OR sourcecountry:TU OR sourcecountry:LE',
  'south-asia':            'sourcecountry:IN OR sourcecountry:PK OR sourcecountry:BG OR sourcecountry:CE',
  'southeast-asia':        'sourcecountry:RP OR sourcecountry:ID OR sourcecountry:VM OR sourcecountry:SN OR sourcecountry:TH OR sourcecountry:MY',
  'east-asia':             'sourcecountry:CH OR sourcecountry:JA OR sourcecountry:KS OR sourcecountry:TW',
  'europe':                'sourcecountry:UK OR sourcecountry:GM OR sourcecountry:FR OR sourcecountry:IT OR sourcecountry:SP',
  'africa':                'sourcecountry:NI OR sourcecountry:SF OR sourcecountry:KE OR sourcecountry:EG OR sourcecountry:GH',
  'latin-america':         'sourcecountry:BR OR sourcecountry:MX OR sourcecountry:AR OR sourcecountry:CO OR sourcecountry:CI',
  'north-america':         'sourcecountry:US OR sourcecountry:CA',
  'central-asia-caucasus': 'sourcecountry:KZ OR sourcecountry:UZ OR sourcecountry:GG OR sourcecountry:AM OR sourcecountry:AJ',
  'oceania':               'sourcecountry:AS OR sourcecountry:NZ'
};

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

function gdeltDomainToSourceName(domain) {
  if (!domain) return '';
  return String(domain).replace(/^www\./, '').replace(/\.(com|org|net|gov|co|news)(\.[a-z]{2})?$/i, '').replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchGdeltQuery(query, opts = {}) {
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(opts.max || 75),
    sort: 'DateDesc',
    timespan: opts.timespan || '1d'
  });

  const url = `${GDELT_BASE}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GeoSignal/1.0 (news aggregation)' },
      timeout: 15000
    });
    if (!res.ok) {
      console.log(`GDELT ${res.status}: ${query.slice(0, 40)}…`);
      return [];
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      // GDELT returns plain text for rate-limit / error cases.
      const txt = await res.text();
      console.log(`GDELT non-JSON: ${txt.slice(0, 80)}`);
      return [];
    }
    const data = await res.json();
    return (data.articles || []).map(a => ({
      url: a.url,
      title: a.title || '',
      description: a.title || '', // GDELT doesn't return body text in artlist mode
      content: '',
      source: gdeltDomainToSourceName(a.domain) || a.domain || '',
      sourceTier: 'gdelt',
      sourceCountry: a.sourcecountry ? [a.sourcecountry] : [],
      region: opts.regionSlug || '',
      publishedAt: a.seendate ? gdeltDateToIso(a.seendate) : new Date().toISOString(),
      thumbnail: a.socialimage || '',
      ingestOrigin: 'gdelt'
    })).filter(x => x.url && x.title);
  } catch (err) {
    console.log(`GDELT error on "${query.slice(0, 40)}…": ${err.message}`);
    return [];
  }
}

// GDELT seendate format: "20260501T094300Z" → ISO
function gdeltDateToIso(s) {
  if (!s || s.length < 13) return new Date().toISOString();
  const yyyy = s.slice(0, 4);
  const mm = s.slice(4, 6);
  const dd = s.slice(6, 8);
  const hh = s.slice(9, 11);
  const min = s.slice(11, 13);
  const ss = s.slice(13, 15) || '00';
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`;
}

async function ingestGdelt({ timespan = '1d' } = {}) {
  let totalInserted = 0;
  let totalFetched = 0;
  const regions = Object.entries(GDELT_REGION_QUERIES);

  for (const [regionSlug, query] of regions) {
    const articles = await fetchGdeltQuery(query, { regionSlug, timespan });
    totalFetched += articles.length;
    if (articles.length) {
      totalInserted += upsertManyArticles(articles);
    }
    await pause(GDELT_PAUSE_MS);
  }

  return { regions: regions.length, fetched: totalFetched, inserted: totalInserted };
}

// One-off live GDELT call for user search queries. Used during
// /api/news handling when the user types a search term, so they
// get fresh matches that aren't in the corpus yet.
async function gdeltLiveSearch(query, { regionSlug = '', timespan = '7d', max = 60 } = {}) {
  if (!query || query.length < 2) return [];
  return await fetchGdeltQuery(query, { regionSlug, timespan, max });
}

// ── Google News RSS-by-query ingest ─────────────────────────────
// Free, no key, no rate limit (within reason). Each query returns a
// proper RSS feed with up to ~100 results. We use it both for
// region-wide ingest (broad queries) and for per-search live calls.

const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search';

// Direct XML parse for Google News RSS. We don't go through rss-parser
// here because on some hosts (notably Render) it intermittently hangs
// or returns empty feeds with no error — likely a TLS / fetch wrapper
// issue. node-fetch + regex is uglier but bulletproof, and Google
// News' RSS is structurally simple so the regex is reliable.
function parseGoogleNewsXml(xml, regionSlug) {
  if (!xml || xml.length < 100) return [];
  const items = [];
  // Walk every <item>...</item> block.
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = unescapeXml(matchTag(block, 'title'));
    const link = matchTag(block, 'link');
    const pubDate = matchTag(block, 'pubDate');
    const description = unescapeXml(matchTag(block, 'description'));
    // Google News puts the outlet in <source url="...">Outlet</source>
    let source = '';
    const srcMatch = block.match(/<source[^>]*>([^<]+)<\/source>/);
    if (srcMatch) source = srcMatch[1].trim();
    if (!source && title) {
      const m2 = title.match(/ - ([^-]+)$/);
      if (m2) source = m2[1].trim();
    }
    let cleanTitle = title;
    if (source && cleanTitle.endsWith(` - ${source}`)) {
      cleanTitle = cleanTitle.slice(0, cleanTitle.length - ` - ${source}`.length);
    }
    if (!cleanTitle || !link) continue;
    items.push({
      title: cleanTitle,
      description: description || '',
      content: description || '',
      url: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source: source || 'Google News',
      sourceTier: 'google_news',
      sourceCountry: [],
      region: regionSlug,
      thumbnail: '',
      ingestOrigin: 'google_news'
    });
  }
  return items;
}

function matchTag(block, tag) {
  // Handles <tag>value</tag> AND <tag><![CDATA[value]]></tag>.
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function unescapeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Google News blocks shared cloud IPs (Render etc.) when it sees
// burst traffic. We work around it by:
//   - sending a real-browser User-Agent
//   - keeping a cooldown after any 503 (gives Google time to forget us)
//   - serializing all fetches through a single in-flight slot with
//     a 1.2s gap between calls — well under Google's quota for a
//     single client.

let gnewsCooldownUntil = 0;
let gnewsLastCall = 0;
let gnewsQueue = Promise.resolve();
const GNEWS_MIN_GAP_MS = 1200;

const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function paceGoogleNews() {
  const wait = gnewsLastCall + GNEWS_MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  gnewsLastCall = Date.now();
}

async function fetchGoogleNewsQuery(query, { regionSlug = '', max = 60 } = {}) {
  if (Date.now() < gnewsCooldownUntil) return [];

  // Serialize. Each call waits its turn behind the queue head.
  const myTurn = gnewsQueue.then(async () => {
    if (Date.now() < gnewsCooldownUntil) return [];
    await paceGoogleNews();

    const url = `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': REAL_UA,
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 15000
      });
      if (res.status === 503 || res.status === 429) {
        gnewsCooldownUntil = Date.now() + 5 * 60 * 1000;
        console.log(`Google News ${res.status} — entering 5min cooldown.`);
        return [];
      }
      if (!res.ok) {
        console.log(`Google News HTTP ${res.status} on "${query.slice(0, 40)}…"`);
        return [];
      }
      const xml = await res.text();
      const items = parseGoogleNewsXml(xml, regionSlug);
      if (!items.length) {
        console.log(`Google News parsed 0 items for "${query.slice(0, 40)}…" (xml ${xml.length} chars)`);
      }
      return items.slice(0, max);
    } catch (err) {
      console.log(`Google News fetch error on "${query.slice(0, 40)}…": ${err.message}`);
      return [];
    }
  });

  // Update the queue tail so subsequent callers wait for this one's
  // network call (not just its turn-grab).
  gnewsQueue = myTurn.catch(() => {});
  return myTurn;
}

// Broad ingest: hit a wide spread of queries so the corpus has both
// regional AND topical coverage. Without topical queries, the corpus
// is biased toward whatever's geopolitically dominant on a given day
// (Iran-Israel, US politics, etc.) and a user searching "bitcoin"
// or "AI regulation" finds nothing because the firehose never went
// looking for those topics.

// Region-themed queries — broad regional headlines. Trimmed to one
// per region to keep bulk-ingest costs bounded when going through
// Perplexity (each call costs money).
const GOOGLE_NEWS_REGION_QUERIES = {
  'global':                ['world news geopolitics'],
  'middle-east':           ['middle east news'],
  'south-asia':            ['india pakistan news'],
  'southeast-asia':        ['southeast asia news'],
  'east-asia':             ['china japan korea news'],
  'europe':                ['europe news eu politics'],
  'africa':                ['africa news'],
  'latin-america':         ['latin america news'],
  'north-america':         ['us politics canada news'],
  'central-asia-caucasus': ['central asia caucasus news'],
  'oceania':               ['australia oceania news']
};

// Topic-themed queries — populate the corpus with story types
// people actually search for. Pruned to a focused set; per-user
// requests fan out to Perplexity for anything else (Tamil news,
// portfolio management, K-pop, etc.) so we don't need to predict.
const GOOGLE_NEWS_TOPIC_QUERIES = [
  'artificial intelligence',
  'bitcoin cryptocurrency',
  'stock market',
  'climate change energy',
  'trade war tariffs',
  'ukraine russia',
  'elections democracy'
];

async function ingestGoogleNews() {
  // Routes through Perplexity Sonar when configured (the bulk path
  // can't rely on Google News from a cloud host — it gets 503'd).
  // Falls through to a sequential Google News pass if Perplexity is
  // not configured (e.g. local dev without an API key).
  let inserted = 0;
  let fetched = 0;
  let queryCount = 0;

  const useFn = PERPLEXITY_API_KEY ? perplexityNewsSearch : fetchGoogleNewsQuery;

  // Region-themed queries — articles tagged with the region.
  for (const [regionSlug, queries] of Object.entries(GOOGLE_NEWS_REGION_QUERIES)) {
    for (const q of queries) {
      const arr = await useFn(q, { regionSlug });
      queryCount++;
      fetched += arr.length;
      inserted += upsertManyArticles(arr);
    }
  }
  // Topic-themed queries — tagged 'global' so they appear regardless
  // of the region the user picks.
  for (const q of GOOGLE_NEWS_TOPIC_QUERIES) {
    const arr = await useFn(q, { regionSlug: 'global' });
    queryCount++;
    fetched += arr.length;
    inserted += upsertManyArticles(arr);
  }

  return { queries: queryCount, fetched, inserted };
}

// In-memory cache of recent live searches. Key by lowercased query.
// 10-minute TTL — long enough to amortize the Google News round trip
// across the dozens of concurrent users hitting /api/news; short enough
// that fresh news still surfaces.
const liveSearchCache = new Map();
// Cache live-search results for an hour. Google News blocks
// shared-cloud IPs aggressively; aggressive caching means a single
// lookup of "bitcoin" populates the corpus for everyone for an hour.
const LIVE_SEARCH_TTL_MS = 60 * 60 * 1000;

// Track every distinct query a real user has searched for. The next
// bulk ingest cycle picks these up so they're already in the corpus
// next time anyone with a similar interest hits /api/news.
const seenQueries = new Set();

function recentUserQueries() {
  return Array.from(seenQueries);
}

async function googleNewsLiveSearch(query, { regionSlug = '' } = {}) {
  if (!query || query.length < 2) return [];
  const key = query.toLowerCase().trim();
  seenQueries.add(key);

  const cached = liveSearchCache.get(key);
  if (cached && (Date.now() - cached.t) < LIVE_SEARCH_TTL_MS) {
    return cached.articles;
  }

  // Primary: Perplexity Sonar. Returns ~10-20 high-quality citations
  // per query, doesn't get IP-blocked like Google News from Render.
  let articles = [];
  if (PERPLEXITY_API_KEY) {
    articles = await perplexityNewsSearch(query, { regionSlug });
  }

  // Fallback: Google News (only useful when running locally — gets
  // 503'd on shared cloud IPs).
  if (!articles.length) {
    articles = await fetchGoogleNewsQuery(query, { regionSlug });
  }

  liveSearchCache.set(key, { t: Date.now(), articles });

  // Keep cache bounded — drop the oldest entries if we get past 500.
  if (liveSearchCache.size > 500) {
    const oldestKey = liveSearchCache.keys().next().value;
    liveSearchCache.delete(oldestKey);
  }

  return articles;
}

// Fan-out helper: takes a list of queries, fires them in parallel
// (with the cache absorbing repeats), returns a deduplicated flat
// list of articles. Failures on individual queries don't poison the
// whole batch.
async function liveFetchManyQueries(queries, { regionSlug = '', perQueryLimit = 8, totalLimit = 5 } = {}) {
  const cleaned = [...new Set(queries.map(q => String(q || '').trim()).filter(q => q.length > 1))]
    .slice(0, totalLimit);
  if (!cleaned.length) return { queries: [], articles: [] };

  const results = await Promise.allSettled(
    cleaned.map(q => googleNewsLiveSearch(q, { regionSlug }))
  );
  const flat = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      // Apply the same junk filter we use at storage time so callers
      // who concat these results into their candidate pool (rather
      // than going through upsertArticle) don't surface spam either.
      const clean = r.value.filter(a => !isJunkArticle(a));
      flat.push(...clean.slice(0, perQueryLimit));
    }
  }
  return { queries: cleaned, articles: flat };
}

// ── Orchestration ───────────────────────────────────────────────

let ingestRunning = false;

async function runFullIngest() {
  if (ingestRunning) {
    console.log('Ingest already running, skipping');
    return null;
  }
  ingestRunning = true;
  const start = Date.now();
  try {
    console.log('Ingest: starting full cycle');

    const rss = await ingestRss().catch(e => {
      console.error('RSS ingest failed:', e.message);
      return { processed: 0, inserted: 0 };
    });
    console.log(`Ingest RSS:    processed=${rss.processed} inserted=${rss.inserted}`);

    const gnews = await ingestGoogleNews().catch(e => {
      console.error('Google News ingest failed:', e.message);
      return { queries: 0, fetched: 0, inserted: 0 };
    });
    console.log(`Ingest GNews:  queries=${gnews.queries} fetched=${gnews.fetched} inserted=${gnews.inserted}`);

    // Pick up any queries real users have searched for since the last
    // ingest cycle and run them as ingest queries too. This way the
    // corpus naturally grows toward what your beta testers actually
    // care about — Tamil news, IR nuclear, portfolio management, etc.
    const userQueries = recentUserQueries().slice(0, 40);
    if (userQueries.length) {
      const useFn = PERPLEXITY_API_KEY ? perplexityNewsSearch : fetchGoogleNewsQuery;
      let userFetched = 0;
      let userInserted = 0;
      for (const q of userQueries) {
        const arr = await useFn(q, { regionSlug: 'global' });
        userFetched += arr.length;
        userInserted += upsertManyArticles(arr);
      }
      console.log(`Ingest user-queries: ${userQueries.length} queries fetched=${userFetched} inserted=${userInserted}`);
    }

    const gdelt = await ingestGdelt().catch(e => {
      console.error('GDELT ingest failed:', e.message);
      return { regions: 0, fetched: 0, inserted: 0 };
    });
    console.log(`Ingest GDELT:  regions=${gdelt.regions} fetched=${gdelt.fetched} inserted=${gdelt.inserted}`);

    // Prune anything older than 30 days.
    const pruned = pruneOlderThan(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (pruned) console.log(`Ingest prune:  removed ${pruned} stale articles`);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Ingest done in ${elapsed}s. Corpus stats:`, stats());
  } catch (err) {
    console.error('Ingest error:', err);
  } finally {
    ingestRunning = false;
  }
}

module.exports = {
  runFullIngest,
  ingestRss,
  ingestGdelt,
  ingestGoogleNews,
  gdeltLiveSearch,
  googleNewsLiveSearch,
  perplexityNewsSearch,
  liveFetchManyQueries,
  recentUserQueries,
  isJunkArticle
};
