// SQLite-backed article corpus.
//
// One file at ./data/articles.db. On Render free tier the disk is
// ephemeral so the file is rebuilt on each cold start by the ingest
// loop in ingest.js. That's fine — articles are short-lived (≤30
// days) and the ingest is fast.
//
// The shape of articles returned by queryArticles() matches the
// existing in-memory article shape from fetchFeed() so the rest of
// /api/news can keep working unchanged.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { isJunkArticle } = require('./quality-filters');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'articles.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    url               TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    description       TEXT,
    content           TEXT,
    source            TEXT,
    source_tier       TEXT,
    source_country    TEXT,
    region_slug       TEXT,
    published_at      INTEGER,
    fetched_at        INTEGER NOT NULL,
    ingest_origin     TEXT,
    thumbnail         TEXT,
    title_hash        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_region    ON articles(region_slug);
  CREATE INDEX IF NOT EXISTS idx_articles_source    ON articles(source);
  CREATE INDEX IF NOT EXISTS idx_articles_titlehash ON articles(title_hash);

  CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
    title, description,
    content='articles', content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
  END;

  CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, description)
    VALUES('delete', old.rowid, old.title, old.description);
  END;

  CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, description)
    VALUES('delete', old.rowid, old.title, old.description);
    INSERT INTO articles_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
  END;
`);

// Cheap title hash for near-dupe detection. Strips punctuation,
// collapses whitespace, lowercases — so "Iran's economy slumps."
// and "Iran's Economy Slumps" produce the same hash.
function makeTitleHash(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

const upsertStmt = db.prepare(`
  INSERT INTO articles (
    url, title, description, content, source, source_tier,
    source_country, region_slug, published_at, fetched_at,
    ingest_origin, thumbnail, title_hash
  ) VALUES (
    @url, @title, @description, @content, @source, @source_tier,
    @source_country, @region_slug, @published_at, @fetched_at,
    @ingest_origin, @thumbnail, @title_hash
  )
  ON CONFLICT(url) DO UPDATE SET
    title          = excluded.title,
    description    = excluded.description,
    content        = excluded.content,
    source         = excluded.source,
    source_tier    = excluded.source_tier,
    source_country = excluded.source_country,
    region_slug    = excluded.region_slug,
    published_at   = excluded.published_at,
    fetched_at     = excluded.fetched_at,
    ingest_origin  = excluded.ingest_origin,
    thumbnail      = excluded.thumbnail,
    title_hash     = excluded.title_hash
`);

// Returns the rowid of the existing near-duplicate, or null.
const dupCheckStmt = db.prepare(`
  SELECT url FROM articles WHERE title_hash = ? LIMIT 1
`);

function upsertArticle(article) {
  if (!article || !article.url || !article.title) return false;

  // Quality gate — drops social-media URLs, product/affiliate pages,
  // shopping listings. Centralised in quality-filters.js so both the
  // ingest layer and the response layer use the same rules.
  if (isJunkArticle(article)) return false;

  const titleHash = makeTitleHash(article.title);
  if (!titleHash) return false;

  // Skip if we already have an article with this title from a different URL
  // (cross-publisher dupe — same wire story syndicated). Keep first seen.
  const existing = dupCheckStmt.get(titleHash);
  if (existing && existing.url !== article.url) return false;

  let publishedMs = null;
  if (article.publishedAt) {
    const t = new Date(article.publishedAt).getTime();
    if (!isNaN(t)) publishedMs = t;
  }

  upsertStmt.run({
    url: article.url,
    title: String(article.title).slice(0, 600),
    description: String(article.description || '').slice(0, 4000),
    content: String(article.content || '').slice(0, 8000),
    source: article.source || '',
    source_tier: article.sourceTier || '',
    source_country: Array.isArray(article.sourceCountry)
      ? article.sourceCountry.join(',')
      : (article.sourceCountry || ''),
    region_slug: article.region || '',
    published_at: publishedMs,
    fetched_at: Date.now(),
    ingest_origin: article.ingestOrigin || 'rss',
    thumbnail: article.thumbnail || '',
    title_hash: titleHash
  });
  return true;
}

function upsertManyArticles(articles) {
  const tx = db.transaction((items) => {
    let inserted = 0;
    for (const a of items) {
      if (upsertArticle(a)) inserted++;
    }
    return inserted;
  });
  return tx(articles || []);
}

// FTS5 needs special escaping. Quote tokens, drop punctuation that
// confuses the parser (parentheses, asterisks, colons).
function buildFtsQuery(raw) {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9 \-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
    .slice(0, 8);
  if (!cleaned.length) return null;
  return cleaned.map(t => `"${t}"`).join(' OR ');
}

// Main query function. Returns rows shaped like fetchFeed() output,
// so the rest of /api/news can consume them without changes.
//
// opts:
//   regionSlugs:   array of region slugs to include (use ['__all__'] for everything)
//   sinceMs:       only articles published after this timestamp
//   q:             FTS5 search string (optional)
//   includeSources / excludeSources: source-name allowlist / blocklist
//   limit:         hard cap (default 1500 — large enough to feed scoring)
function queryArticles(opts = {}) {
  const {
    regionSlugs = [],
    sinceMs = null,
    q = null,
    includeSources = null,
    excludeSources = null,
    limit = 1500
  } = opts;

  const where = [];
  const params = [];

  if (regionSlugs.length && !regionSlugs.includes('__all__')) {
    where.push(`region_slug IN (${regionSlugs.map(() => '?').join(',')})`);
    params.push(...regionSlugs);
  }
  if (sinceMs) {
    where.push(`(published_at IS NULL OR published_at >= ?)`);
    params.push(sinceMs);
  }
  if (includeSources && includeSources.length) {
    where.push(`source IN (${includeSources.map(() => '?').join(',')})`);
    params.push(...includeSources);
  }
  if (excludeSources && excludeSources.length) {
    where.push(`source NOT IN (${excludeSources.map(() => '?').join(',')})`);
    params.push(...excludeSources);
  }

  let sql;
  const ftsQuery = q ? buildFtsQuery(q) : null;
  if (ftsQuery) {
    where.push(`articles.rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)`);
    params.push(ftsQuery);
  }

  sql = `
    SELECT url, title, description, content, source, source_tier,
           source_country, region_slug, published_at, fetched_at,
           ingest_origin, thumbnail
    FROM articles
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY COALESCE(published_at, fetched_at) DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  return rows.map(r => ({
    url: r.url,
    title: r.title,
    description: r.description || '',
    content: r.content || '',
    source: r.source || '',
    sourceTier: r.source_tier || '',
    sourceCountry: r.source_country
      ? r.source_country.split(',').filter(Boolean)
      : [],
    region: r.region_slug || '',
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    thumbnail: r.thumbnail || '',
    ingestOrigin: r.ingest_origin || ''
  }));
}

function pruneOlderThan(cutoffMs) {
  const info = db.prepare(`
    DELETE FROM articles
    WHERE COALESCE(published_at, fetched_at) < ?
  `).run(cutoffMs);
  return info.changes;
}

function stats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN ingest_origin = 'rss' THEN 1 ELSE 0 END)         AS rss,
      SUM(CASE WHEN ingest_origin = 'gdelt' THEN 1 ELSE 0 END)       AS gdelt,
      SUM(CASE WHEN ingest_origin = 'google_news' THEN 1 ELSE 0 END) AS google_news,
      MIN(published_at) AS oldest,
      MAX(published_at) AS newest
    FROM articles
  `).get();
  return row;
}

module.exports = {
  db,
  upsertArticle,
  upsertManyArticles,
  queryArticles,
  pruneOlderThan,
  stats
};
