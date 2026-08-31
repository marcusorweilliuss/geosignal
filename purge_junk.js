// One-off cleanup: walk the corpus and delete every article that
// trips the current junk filter. Safe to re-run any time (idempotent)
// — articles that pass the filter today stay; ones that fail get
// deleted from both `articles` and the FTS shadow table (via the
// AFTER DELETE trigger).
//
// Usage:  node purge_junk.js
//         node purge_junk.js --dry-run    # report counts, don't delete

const Database = require('better-sqlite3');
const path = require('path');
const { isJunkArticle } = require('./quality-filters');

const DB_PATH = process.env.GEOSIGNAL_DB || path.join(__dirname, 'data', 'articles.db');
const dry = process.argv.includes('--dry-run');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const total = db.prepare(`SELECT COUNT(*) as n FROM articles`).get().n;
console.log(`Scanning ${total} articles in ${DB_PATH}`);

const all = db.prepare(`SELECT url, title, description, source FROM articles`).all();
const victims = [];
for (const row of all) {
  if (isJunkArticle({
    title: row.title,
    description: row.description,
    url: row.url,
    source: row.source,
  })) {
    victims.push(row);
  }
}

console.log(`Junk detected: ${victims.length}`);

const byHost = {};
for (const v of victims) {
  let host = '?';
  try { host = new URL(v.url).hostname.replace(/^www\./, ''); } catch {}
  byHost[host] = (byHost[host] || 0) + 1;
}
const sortedHosts = Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('Top hosts in the junk set:');
for (const [host, n] of sortedHosts) console.log(`  ${String(n).padStart(5)}  ${host}`);

if (dry) {
  console.log('\nDry run — no deletions performed. Re-run without --dry-run to purge.');
  process.exit(0);
}

const del = db.prepare(`DELETE FROM articles WHERE url = ?`);
const tx = db.transaction(rows => {
  for (const r of rows) del.run(r.url);
});
tx(victims);
console.log(`\nDeleted ${victims.length} junk articles.`);
console.log(`Corpus now: ${db.prepare(`SELECT COUNT(*) as n FROM articles`).get().n}`);
db.close();
