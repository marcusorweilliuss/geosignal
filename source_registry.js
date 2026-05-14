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

// Registry resolution order: v3 (post-Perplexity discovery) -> v2
// (post-expansion-file merge) -> v1 (sources_rebalanced_extended).
// Each layer is a strict superset of the previous, so falling through
// just means an older snapshot — the app keeps running.
const REGISTRY_PATH = (() => {
  for (const f of ['sources_v3.json', 'sources_v2.json', 'sources_rebalanced_extended.json']) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'sources_rebalanced_extended.json');
})();
const TOPIC_INDEX_PATH = path.join(__dirname, 'topic_index_v2.json');

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let META_BY_NAME = new Map();
let META_BY_HOST = new Map();    // registrable-domain string -> meta (for URL-based lookups)
let TOPIC_INDEX = {};            // topic_name -> [{ name, region, bias, weight, feed_url }, ...]
let loaded = false;

function registrableDomain(hostname) {
  if (!hostname) return '';
  const h = hostname.replace(/^www\./, '').toLowerCase();
  // For most domains, take the last two segments. For known multi-part
  // TLDs (.co.uk, .com.au, .co.jp etc.), take the last three.
  const parts = h.split('.');
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');
  const multiPartTlds = new Set([
    'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.za', 'co.nz', 'co.id', 'co.il',
    'com.au', 'com.br', 'com.cn', 'com.hk', 'com.mx', 'com.my', 'com.ph', 'com.sg', 'com.tr', 'com.tw',
    'com.ar', 'com.co', 'com.eg', 'com.pk', 'com.pe', 'com.ng', 'com.kw', 'com.lb', 'com.vn',
    'org.uk', 'org.au', 'gov.uk', 'gov.au', 'gov.in', 'gov.za', 'gov.sg',
    'net.au', 'net.uk',
  ]);
  if (parts.length >= 3 && multiPartTlds.has(lastTwo)) return lastThree;
  return lastTwo;
}

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
      // Also index by registrable domain so the ingest layer can map
      // a Perplexity-returned URL back to the outlet's official
      // display name instead of slugifying the hostname.
      try {
        if (meta.feed_url) {
          const host = new URL(meta.feed_url).hostname;
          const dom = registrableDomain(host);
          if (dom && !META_BY_HOST.has(dom)) META_BY_HOST.set(dom, meta);
        }
      } catch {}
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

// Pretty-name resolver: given a URL, return the human-friendly display
// name for that outlet. Used by the Perplexity-fed ingest path so we
// don't end up with "Straitstimes" / "Insideclimatenews" / "Nytimes"
// in the feed.
//
// Resolution order:
//   1. Registry lookup by registrable domain — if the outlet is in
//      sources_v3.json, return its meta.name (correctly formatted).
//   2. Curated KNOWN_OUTLETS map for top-tier sources NOT in registry.
//   3. Smart compound-word splitter — greedy match against newspaper-
//      suffix tokens ("times", "post", "news", "herald", etc.).
//   4. Plain title-case fallback.

// Top-tier outlets that may not be in the registry yet but need
// correct display names if Perplexity surfaces them.
const KNOWN_OUTLETS = {
  'nytimes.com':         'The New York Times',
  'washingtonpost.com':  'The Washington Post',
  'wsj.com':             'The Wall Street Journal',
  'ft.com':              'Financial Times',
  'economist.com':       'The Economist',
  'bbc.com':             'BBC News',
  'bbc.co.uk':           'BBC News',
  'cnn.com':             'CNN',
  'npr.org':             'NPR',
  'pbs.org':             'PBS',
  'reuters.com':         'Reuters',
  'apnews.com':          'Associated Press',
  'bloomberg.com':       'Bloomberg',
  'aljazeera.com':       'Al Jazeera',
  'aljazeera.net':       'Al Jazeera',
  'theguardian.com':     'The Guardian',
  'theatlantic.com':     'The Atlantic',
  'newyorker.com':       'The New Yorker',
  'vox.com':             'Vox',
  'axios.com':           'Axios',
  'politico.com':        'Politico',
  'politico.eu':         'Politico Europe',
  'foreignpolicy.com':   'Foreign Policy',
  'foreignaffairs.com':  'Foreign Affairs',
  'spiegel.de':          'Der Spiegel',
  'lemonde.fr':          'Le Monde',
  'liberation.fr':       'Libération',
  'lefigaro.fr':         'Le Figaro',
  'sueddeutsche.de':     'Süddeutsche Zeitung',
  'zeit.de':             'Die Zeit',
  'faz.net':             'Frankfurter Allgemeine Zeitung',
  'elpais.com':          'El País',
  'elmundo.es':          'El Mundo',
  'lanacion.com.ar':     'La Nación',
  'clarin.com':          'Clarín',
  'folha.uol.com.br':    'Folha de S.Paulo',
  'oglobo.globo.com':    'O Globo',
  'globo.com':           'O Globo',
  'eluniversal.com.mx':  'El Universal',
  'reforma.com':         'Reforma',
  'rappler.com':         'Rappler',
  'inquirer.net':        'Philippine Daily Inquirer',
  'straitstimes.com':    'The Straits Times',
  'channelnewsasia.com': 'Channel News Asia',
  'thehindu.com':        'The Hindu',
  'hindustantimes.com':  'Hindustan Times',
  'timesofindia.indiatimes.com': 'Times of India',
  'indiatimes.com':      'Times of India',
  'thejakartapost.com':  'The Jakarta Post',
  'bangkokpost.com':     'Bangkok Post',
  'thestar.com.my':      'The Star',
  'mainichi.jp':         'The Mainichi',
  'japantimes.co.jp':    'The Japan Times',
  'asahi.com':           'The Asahi Shimbun',
  'yomiuri.co.jp':       'The Yomiuri Shimbun',
  'koreatimes.co.kr':    'The Korea Times',
  'koreaherald.com':     'The Korea Herald',
  'scmp.com':            'South China Morning Post',
  'taipeitimes.com':     'Taipei Times',
  'abc.net.au':          'ABC News (Australia)',
  'theage.com.au':       'The Age',
  'smh.com.au':          'Sydney Morning Herald',
  'stuff.co.nz':         'Stuff',
  'rnz.co.nz':           'RNZ',
  'dawn.com':            'Dawn',
  'thenews.com.pk':      'The News International',
  'tribune.com.pk':      'The Express Tribune',
  'haaretz.com':         'Haaretz',
  'timesofisrael.com':   'The Times of Israel',
  'jpost.com':           'The Jerusalem Post',
  'mailguardian.co.za':  'Mail & Guardian',
  'mg.co.za':            'Mail & Guardian',
  'news24.com':          'News24',
  'theeastafrican.co.ke': 'The East African',
  'punchng.com':         'The Punch',
  'vanguardngr.com':     'Vanguard',
  'guardian.ng':         'The Guardian Nigeria',
  'thecitizen.co.tz':    'The Citizen',
  'standardmedia.co.ke': 'The Standard',
  'nation.africa':       'Nation',
  'allafrica.com':       'AllAfrica',
  'insideclimatenews.org': 'Inside Climate News',
  'climatechangenews.com': 'Climate Home News',
  'carbonbrief.org':     'Carbon Brief',
  'grist.org':           'Grist',
  'mongabay.com':        'Mongabay',
  'desmog.com':          'DeSmog',
  'wired.com':           'Wired',
  'theverge.com':        'The Verge',
  'arstechnica.com':     'Ars Technica',
  'techcrunch.com':      'TechCrunch',
  'restofworld.org':     'Rest of World',
  'technologyreview.com': 'MIT Technology Review',
  'spectrum.ieee.org':   'IEEE Spectrum',
  'thediplomat.com':     'The Diplomat',
  'breakingdefense.com': 'Breaking Defense',
  'defensenews.com':     'Defense News',
  'defenseone.com':      'Defense One',
  'warontherocks.com':   'War on the Rocks',
  'lawfaremedia.org':    'Lawfare',
  'lawfareblog.com':     'Lawfare',
  'justsecurity.org':    'Just Security',
  'thebulletin.org':     'Bulletin of the Atomic Scientists',
  'project-syndicate.org': 'Project Syndicate',
  'rferl.org':           'Radio Free Europe / Radio Liberty',
  'rfa.org':             'Radio Free Asia',
  'dw.com':              'DW',
  'france24.com':        'France 24',
  'euronews.com':        'Euronews',
  'euobserver.com':      'EUobserver',
  'euractiv.com':        'Euractiv',
  'irishtimes.com':      'The Irish Times',
  'rte.ie':              'RTÉ',
  'swissinfo.ch':        'SwissInfo',
  'nzz.ch':              'Neue Zürcher Zeitung',
  'thelocal.de':         'The Local',
  'sifted.eu':           'Sifted',
  'newscientist.com':    'New Scientist',
  'nature.com':          'Nature',
  'science.org':         'Science',
  'thelancet.com':       'The Lancet',
  'statnews.com':        'STAT News',
  'kff.org':             'KFF',
  'hrw.org':             'Human Rights Watch',
  'amnesty.org':         'Amnesty International',
  'crisisgroup.org':     'International Crisis Group',
  'rand.org':            'RAND Corporation',
  'brookings.edu':       'Brookings Institution',
  'csis.org':            'Center for Strategic and International Studies',
  'cfr.org':             'Council on Foreign Relations',
  'carnegieendowment.org': 'Carnegie Endowment',
  'iiss.org':            'IISS',
  'chathamhouse.org':    'Chatham House',
  'atlanticcouncil.org': 'Atlantic Council',
  'stimson.org':         'Stimson Center',
  'piie.com':            'Peterson Institute',
  'eu-startups.com':     'EU-Startups',
  'caspianpost.com':     'Caspian Post',
  'moneyweb.co.za':      'Moneyweb',
  'african.business':    'African Business Magazine',
};

// Common news-suffix tokens used by the smart fallback splitter.
// The splitter looks for these at the END of an unbroken brand string
// (e.g. "straitstimes" → suffix "times" → split as "straits" + "times").
const SUFFIX_TOKENS = [
  'times', 'post', 'news', 'herald', 'tribune', 'standard', 'guardian',
  'express', 'mail', 'today', 'daily', 'weekly', 'monthly', 'world',
  'international', 'global', 'wire', 'wires', 'press', 'review',
  'magazine', 'journal', 'chronicle', 'observer', 'telegraph',
  'gazette', 'bulletin', 'reporter', 'media', 'digest', 'voice',
  'record', 'inquirer', 'monitor', 'sentinel', 'beacon', 'star',
  'sun', 'globe', 'mirror', 'echo', 'online', 'now', 'morning',
  'evening', 'business', 'finance', 'markets', 'technology', 'tech',
  'climate', 'energy', 'science', 'health', 'defence', 'defense',
];
// Prefix tokens that often start a brand string before another word.
const PREFIX_TOKENS = [
  'the', 'inside', 'foreign', 'national', 'international', 'global',
  'world', 'business', 'financial', 'climate', 'tech', 'science',
  'first', 'new', 'all', 'pan', 'east', 'west', 'north', 'south',
  'middle', 'asia', 'africa', 'europe', 'india', 'china', 'japan',
  'korea', 'arab', 'gulf', 'pacific', 'atlantic', 'caspian',
];

function smartSplit(brand) {
  // Already has separators — done.
  if (/[\s\-]/.test(brand)) return brand;
  const lc = brand.toLowerCase();
  // Try suffix split: find a known suffix at the end.
  for (const suffix of SUFFIX_TOKENS) {
    if (lc.endsWith(suffix) && lc.length > suffix.length + 2) {
      const prefix = lc.slice(0, -suffix.length);
      return smartSplit(prefix) + ' ' + suffix;
    }
  }
  // Try prefix split: find a known prefix at the start.
  for (const prefix of PREFIX_TOKENS) {
    if (lc.startsWith(prefix) && lc.length > prefix.length + 2) {
      const rest = lc.slice(prefix.length);
      return prefix + ' ' + smartSplit(rest);
    }
  }
  return brand;
}

function titleCase(s) {
  // Acronyms (BBC, CNN, NPR, AFP, etc.) stay uppercase — heuristic:
  // 3-4 chars and looks like consonant-heavy. Otherwise title case
  // each token, preserving lowercase connectors (of, the, in, and).
  const connectors = new Set(['of', 'the', 'in', 'and', 'on', 'a', 'an', 'de', 'la', 'le', 'el', 'das', 'der', 'die']);
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && connectors.has(lw)) return lw;
      if (w.length <= 4 && /^[bcdfghjklmnpqrstvwxz]{2,}/i.test(w)) return w.toUpperCase();
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}

function prettyNameForUrl(url) {
  if (!loaded) load();
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    // 1. Exact host match in KNOWN_OUTLETS
    if (KNOWN_OUTLETS[host]) return KNOWN_OUTLETS[host];
    // 2. Registrable-domain match in KNOWN_OUTLETS
    const dom = registrableDomain(host);
    if (KNOWN_OUTLETS[dom]) return KNOWN_OUTLETS[dom];
    // 3. Registry lookup
    if (META_BY_HOST.has(dom)) return META_BY_HOST.get(dom).name;
    if (META_BY_HOST.has(host)) return META_BY_HOST.get(host).name;
    // 4. Smart split + title-case fallback
    let brand = dom;
    // Strip the TLD (last segment).
    brand = brand.replace(/\.[a-z]{2,4}(\.[a-z]{2})?$/i, '');
    // Replace separators with spaces.
    brand = brand.replace(/[._-]/g, ' ').trim();
    // If still one unbroken word, run the smart splitter.
    if (!/\s/.test(brand)) brand = smartSplit(brand);
    return titleCase(brand);
  } catch {
    return '';
  }
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
  prettyNameForUrl,
};
