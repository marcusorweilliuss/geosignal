// Loads the augmented source registry (credibility + topic_strengths
// produced by score_sources.py / rebalance_sources.py) and exposes
// name-based lookup for the live ranking pipeline.
//
// Registry file shape (per entry):
//   {
//     name, feed_url, regions[], countries[], category, source_type,
//     ideology, independence, tier,
//     credibility_score: 0..1,
//     topic_strengths: { politics_domestic: 0..1, ... }
//   }
//
// We key everything by a normalized name so look-ups survive
// punctuation / case drift between the RSS feed `<title>` and the
// registry entry.

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'sources_rebalanced_extended.json');

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let META_BY_NAME = new Map();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const reg = JSON.parse(raw);
    let n = 0;
    for (const sid of Object.keys(reg)) {
      const meta = reg[sid];
      const key = normalizeName(meta.name);
      if (key && !META_BY_NAME.has(key)) {
        META_BY_NAME.set(key, meta);
        n++;
      }
    }
    console.log(`[source_registry] loaded ${n} sources from ${path.basename(REGISTRY_PATH)}`);
  } catch (err) {
    console.warn(`[source_registry] could not load ${REGISTRY_PATH}: ${err.message}`);
  }
}

function getMetaByName(name) {
  if (!loaded) load();
  if (!name) return null;
  return META_BY_NAME.get(normalizeName(name)) || null;
}

// Map the user-facing sectors (defined in sources.js SECTOR_KEYWORDS)
// to the topic keys produced by score_sources.py. Multiple sectors can
// map to the same topic; some sectors fan out to a few topics.
const SECTOR_TO_TOPICS = {
  'Geopolitics & International Relations': ['politics_foreign', 'politics_domestic'],
  'Economics & Trade':                     ['business_markets', 'politics_foreign'],
  'Technology & AI':                       ['science_tech'],
  'Climate & Environment':                 ['climate_energy'],
  'Energy & Resources':                    ['climate_energy', 'energy_transition', 'lithium', 'critical_minerals'],
  'Defence & Security':                    ['human_rights_conflict', 'politics_foreign'],
  'Finance & Markets':                     ['business_markets'],
  'Public Policy & Governance':            ['politics_domestic'],
  'Society & Culture':                     ['culture_society'],
  'Health & Pandemic':                     ['science_tech'],
  'Space & Frontier Tech':                 ['science_tech'],
  'Media & Disinformation':                ['culture_society', 'politics_domestic'],
  'Human Rights & Migration':              ['human_rights_conflict'],
  'Legal & Regulatory':                    ['politics_domestic'],
  'Food & Agriculture':                    ['climate_energy', 'business_markets'],
};

// Return the max topic-strength the source has across all topics
// implied by the user's active sectors. 0..1.
function getTopicBoost(meta, activeSectors) {
  if (!meta || !meta.topic_strengths || !activeSectors || activeSectors.length === 0) return 0;
  let best = 0;
  for (const sector of activeSectors) {
    const topics = SECTOR_TO_TOPICS[sector];
    if (!topics) continue;
    for (const t of topics) {
      const v = meta.topic_strengths[t];
      if (typeof v === 'number' && v > best) best = v;
    }
  }
  return best;
}

module.exports = { getMetaByName, getTopicBoost, SECTOR_TO_TOPICS, normalizeName };
