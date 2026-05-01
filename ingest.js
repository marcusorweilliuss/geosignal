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

function googleNewsItemToArticle(item, regionSlug, originTag = 'google_news') {
  // Google News wraps the link with their own redirect URL — keep it
  // as-is. The user clicks through and Google handles the redirect.
  // The actual outlet name lives in <source> (sometimes) or as a
  // suffix on the title (" - CNN"). We extract whichever we can.
  let source = '';
  if (item.source && item.source._) source = item.source._;
  else if (item.source && typeof item.source === 'string') source = item.source;
  if (!source && item.title) {
    const m = String(item.title).match(/ - ([^-]+)$/);
    if (m) source = m[1].trim();
  }

  let cleanTitle = item.title || '';
  if (source && cleanTitle.endsWith(` - ${source}`)) {
    cleanTitle = cleanTitle.slice(0, cleanTitle.length - ` - ${source}`.length);
  }

  return {
    title: cleanTitle,
    description: item.contentSnippet || item.content || '',
    content: item.content || item.contentSnippet || '',
    url: item.link || '',
    publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
    source: source || 'Google News',
    sourceTier: 'google_news',
    sourceCountry: [],
    region: regionSlug,
    thumbnail: '',
    ingestOrigin: originTag
  };
}

async function fetchGoogleNewsQuery(query, { regionSlug = '', max = 60 } = {}) {
  const url = `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const feed = await rssParser.parseURL(url);
    return (feed.items || [])
      .slice(0, max)
      .map(it => googleNewsItemToArticle(it, regionSlug));
  } catch (err) {
    console.log(`Google News error on "${query.slice(0, 40)}…": ${err.message}`);
    return [];
  }
}

// Broad ingest: hit a few well-chosen queries per region so we have
// region coverage even when no user has searched yet.
const GOOGLE_NEWS_REGION_QUERIES = {
  'global':                ['world news', 'geopolitics'],
  'middle-east':           ['middle east news', 'iran israel'],
  'south-asia':            ['india news', 'pakistan news'],
  'southeast-asia':        ['southeast asia news', 'asean'],
  'east-asia':             ['china news', 'japan korea news'],
  'europe':                ['europe news', 'eu politics'],
  'africa':                ['africa news', 'african union'],
  'latin-america':         ['latin america news', 'mexico brazil'],
  'north-america':         ['us politics', 'canada news'],
  'central-asia-caucasus': ['central asia', 'caucasus news'],
  'oceania':               ['australia news', 'pacific islands news']
};

async function ingestGoogleNews() {
  let inserted = 0;
  let fetched = 0;

  const tasks = [];
  for (const [regionSlug, queries] of Object.entries(GOOGLE_NEWS_REGION_QUERIES)) {
    for (const q of queries) {
      tasks.push(fetchGoogleNewsQuery(q, { regionSlug }).then(arr => ({ regionSlug, arr })));
    }
  }

  // Google News tolerates parallel requests — keep it modest.
  const concurrency = 4;
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const results = await Promise.all(batch);
    for (const { arr } of results) {
      fetched += arr.length;
      inserted += upsertManyArticles(arr);
    }
  }

  return { queries: tasks.length, fetched, inserted };
}

async function googleNewsLiveSearch(query, { regionSlug = '' } = {}) {
  if (!query || query.length < 2) return [];
  return await fetchGoogleNewsQuery(query, { regionSlug });
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
  googleNewsLiveSearch
};
