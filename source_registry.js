// Loads the augmented source registry (credibility + topic_strengths
// + weights from the expansion file) and the topic index. Exposes
// name-based lookup, weight lookup, and topic→sources lookup for the
// live ranking pipeline.
//
// Registry file shape (per entry):
//   {
//     name, feed_url, regions[], countries[], category, source_type,
//     ideology, independence, tier,
//     weight: 1..10,         (NEW — drives weight-based ranking)
//     bias: string,          (NEW — human label e.g. "center-left")
//     credibility_score: 0..1,
//     topic_strengths: { politics_domestic: 0..1, ... }
//   }
//
// Topic index shape (topic_index_v2.json):
//   {
//     "GEOPOLITICS": [
//       { name, region, bias, weight, feed_url }, ...   // sorted by weight desc
//     ],
//     ...
//   }
//
// We key everything by a normalized name so look-ups survive
// punctuation / case drift between the RSS feed `<title>` and the
// registry entry.

const fs = require('fs');
const path = require('path');

// Prefer the merged-expansion v2 file. Fall back to the older v1
// (sources_rebalanced_extended.json) if v2 hasn't been generated yet
// — keeps the app running through partial deployments.
const REGISTRY_PATH = fs.existsSync(path.join(__dirname, 'sources_v2.json'))
  ? path.join(__dirname, 'sources_v2.json')
  : path.join(__dirname, 'sources_rebalanced_extended.json');
const TOPIC_INDEX_PATH = path.join(__dirname, 'topic_index_v2.json');

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let META_BY_NAME = new Map();
let TOPIC_INDEX = {};            // topic_name -> [{ name, region, bias, weight, feed_url }, ...]
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
  // Topic index is optional — older deployments don't have it.
  try {
    if (fs.existsSync(TOPIC_INDEX_PATH)) {
      TOPIC_INDEX = JSON.parse(fs.readFileSync(TOPIC_INDEX_PATH, 'utf-8'));
      const n = Object.keys(TOPIC_INDEX).length;
      const total = Object.values(TOPIC_INDEX).reduce((s, v) => s + v.length, 0);
      console.log(`[source_registry] loaded topic index: ${n} topics, ${total} entries`);
    }
  } catch (err) {
    console.warn(`[source_registry] could not load topic index: ${err.message}`);
  }
}

function getMetaByName(name) {
  if (!loaded) load();
  if (!name) return null;
  return META_BY_NAME.get(normalizeName(name)) || null;
}

// 0..10 numeric weight from the expansion file (or backfilled from
// tier on legacy entries). Used to lift trusted outlets in ranking.
function getWeight(name) {
  const m = getMetaByName(name);
  if (!m) return 5; // unknown source — neutral weight
  return typeof m.weight === 'number' ? m.weight : 5;
}

// Topic → ranked list of sources. Used by the keyword search path
// when the user's query maps to a known topic ("AI", "climate", etc.)
function getSourcesForTopic(topic) {
  if (!loaded) load();
  if (!topic) return [];
  const key = String(topic).toUpperCase().trim();
  return TOPIC_INDEX[key] || [];
}

// Map common search terms to canonical topic keys. The topic index
// uses formal labels (GEOPOLITICS, ECONOMICS-AND-TRADE) but users
// type "ai", "climate", "war", etc. This map intercepts the common
// cases so the search-to-topic-index hop is non-empty.
const QUERY_TO_TOPIC = {
  ai: 'TECHNOLOGY-AND-AI', 'artificial intelligence': 'TECHNOLOGY-AND-AI',
  tech: 'TECHNOLOGY-AND-AI', technology: 'TECHNOLOGY-AND-AI',
  geopolitics: 'GEOPOLITICS', diplomacy: 'GEOPOLITICS', 'foreign policy': 'GEOPOLITICS',
  economy: 'ECONOMICS-AND-TRADE', economics: 'ECONOMICS-AND-TRADE', trade: 'ECONOMICS-AND-TRADE',
  climate: 'CLIMATE-AND-ENVIRONMENT', environment: 'CLIMATE-AND-ENVIRONMENT', warming: 'CLIMATE-AND-ENVIRONMENT',
  defence: 'DEFENCE-AND-SECURITY', defense: 'DEFENCE-AND-SECURITY', security: 'DEFENCE-AND-SECURITY',
  military: 'DEFENCE-AND-SECURITY', war: 'DEFENCE-AND-SECURITY',
  finance: 'FINANCE-AND-MARKETS', markets: 'FINANCE-AND-MARKETS', stocks: 'FINANCE-AND-MARKETS',
  'human rights': 'HUMAN-RIGHTS', rights: 'HUMAN-RIGHTS',
  health: 'HEALTH-AND-MEDICINE', medicine: 'HEALTH-AND-MEDICINE', pandemic: 'HEALTH-AND-MEDICINE',
  science: 'SCIENCE-AND-RESEARCH', research: 'SCIENCE-AND-RESEARCH',
  archaeology: 'ARCHAEOLOGY-AND-HISTORY', history: 'ARCHAEOLOGY-AND-HISTORY',
  space: 'SPACE-AND-ASTRONOMY', astronomy: 'SPACE-AND-ASTRONOMY', nasa: 'SPACE-AND-ASTRONOMY',
  energy: 'ENERGY-AND-OIL', oil: 'ENERGY-AND-OIL', gas: 'ENERGY-AND-OIL',
  food: 'FOOD-AND-AGRICULTURE', agriculture: 'FOOD-AND-AGRICULTURE', farming: 'FOOD-AND-AGRICULTURE',
  migration: 'MIGRATION-AND-REFUGEES', refugees: 'MIGRATION-AND-REFUGEES',
  legal: 'LEGAL-AND-JUSTICE', law: 'LEGAL-AND-JUSTICE', justice: 'LEGAL-AND-JUSTICE',
  culture: 'CULTURE-AND-ARTS', art: 'CULTURE-AND-ARTS', arts: 'CULTURE-AND-ARTS',
  cyber: 'CYBER-AND-TECH-POLICY', cybersecurity: 'CYBER-AND-TECH-POLICY',
  gender: 'GENDER-AND-SOCIETY', society: 'GENDER-AND-SOCIETY',
  indigenous: 'INDIGENOUS-AND-MINORITY', minority: 'INDIGENOUS-AND-MINORITY',
  ocean: 'OCEANS-AND-MARINE', oceans: 'OCEANS-AND-MARINE', marine: 'OCEANS-AND-MARINE',
  disaster: 'NATURAL-DISASTERS', disasters: 'NATURAL-DISASTERS', earthquake: 'NATURAL-DISASTERS',
  sport: 'SPORT', sports: 'SPORT',
  religion: 'RELIGION',
};

function topicForQuery(query) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();
  if (QUERY_TO_TOPIC[q]) return QUERY_TO_TOPIC[q];
  // Try each known topic key against the query — tokenize the topic
  // label into meaningful words and check whether any appear in q.
  if (!loaded) load();
  for (const t of Object.keys(TOPIC_INDEX)) {
    const tokens = t.toLowerCase().split(/[-\s]+/).filter(tok => tok.length > 3 && tok !== 'and');
    if (tokens.some(tok => q.includes(tok))) return t;
  }
  // Last attempt: check each token of the user's query against
  // QUERY_TO_TOPIC so multi-word queries like "climate change" match.
  for (const tok of q.split(/\s+/)) {
    if (QUERY_TO_TOPIC[tok]) return QUERY_TO_TOPIC[tok];
  }
  return null;
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

module.exports = {
  getMetaByName, getTopicBoost, SECTOR_TO_TOPICS, normalizeName,
  getWeight, getSourcesForTopic, topicForQuery, QUERY_TO_TOPIC,
};
