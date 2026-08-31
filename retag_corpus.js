// One-off: walk every article in the corpus, re-derive its region
// from URL → registry, and update region_slug for any row where the
// derived region differs from what's stored. Fixes the long-running
// "all Google-News articles tagged with the query region" bug —
// stale entries in the corpus will be re-tagged with their actual
// publisher region.
//
// Usage:  node retag_corpus.js
//         node retag_corpus.js --dry-run

const Database = require('better-sqlite3');
const path = require('path');
const { regionForUrl, getMetaByName } = require('./source_registry');

const DB_PATH = process.env.GEOSIGNAL_DB || path.join(__dirname, 'data', 'articles.db');
const dry = process.argv.includes('--dry-run');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const total = db.prepare(`SELECT COUNT(*) as n FROM articles`).get().n;
console.log(`Scanning ${total} articles in ${DB_PATH}`);

// Pull the columns we need
const rows = db.prepare(`SELECT url, source, region_slug FROM articles`).all();

let derivedFromUrl = 0;
let derivedFromSource = 0;
let unchanged = 0;
const updates = [];
const slugMap = {
  'south asia': 'south-asia', 'southeast asia': 'southeast-asia',
  'east asia': 'east-asia', 'central asia & caucasus': 'central-asia-caucasus',
  'middle east': 'middle-east', 'north america': 'north-america',
  'latin america': 'latin-america', 'europe': 'europe',
  'africa': 'africa', 'oceania': 'oceania', 'global': 'global',
};

for (const row of rows) {
  // Prefer URL-host lookup
  let newRegion = regionForUrl(row.url);
  if (newRegion) {
    derivedFromUrl++;
  } else if (row.source) {
    // Fall back to source-name lookup
    const meta = getMetaByName(row.source);
    if (meta && Array.isArray(meta.regions) && meta.regions[0]) {
      const r = String(meta.regions[0]).toLowerCase();
      newRegion = slugMap[r] || r.replace(/\s+/g, '-').replace(/&/g, 'and');
      if (newRegion) derivedFromSource++;
    }
  }
  if (!newRegion) {
    unchanged++;
    continue;
  }
  if (newRegion === row.region_slug) {
    unchanged++;
    continue;
  }
  updates.push({ url: row.url, oldRegion: row.region_slug, newRegion });
}

// Distribution of changes
const changesBySlug = {};
for (const u of updates) {
  const k = `${u.oldRegion || '(empty)'} -> ${u.newRegion}`;
  changesBySlug[k] = (changesBySlug[k] || 0) + 1;
}
const sortedChanges = Object.entries(changesBySlug).sort((a, b) => b[1] - a[1]);

console.log(`\nWould change region_slug on ${updates.length} articles`);
console.log(`  derived from URL host: ${derivedFromUrl}`);
console.log(`  derived from source name: ${derivedFromSource}`);
console.log(`  unchanged: ${unchanged}`);
console.log(`\nTop 15 transitions:`);
for (const [k, n] of sortedChanges.slice(0, 15)) console.log(`  ${String(n).padStart(5)}  ${k}`);

if (dry) {
  console.log('\nDry run — no updates performed. Re-run without --dry-run to retag.');
  process.exit(0);
}

const upd = db.prepare(`UPDATE articles SET region_slug = ? WHERE url = ?`);
const tx = db.transaction(rows => {
  for (const r of rows) upd.run(r.newRegion, r.url);
});
tx(updates);
console.log(`\nRetagged ${updates.length} articles.`);
db.close();
