require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const Parser = require('rss-parser');

const { SOURCES, getSourcesForRegion, scoreArticle, GOVERNMENT_CAVEAT } = require('./sources');

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

// ── RSS Feed Fetching with Cache ────────────────────────────────

const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'GeoSignal/1.0' }
});

// In-memory cache: { url: { articles: [], fetchedAt: timestamp } }
const feedCache = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchFeed(source) {
  const cached = feedCache[source.rssUrl];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
    return cached.articles;
  }

  try {
    const feed = await rssParser.parseURL(source.rssUrl);
    const articles = (feed.items || []).slice(0, 10).map(item => ({
      title: item.title || '',
      description: item.contentSnippet || item.content || item.summary || '',
      content: item.content || item.contentSnippet || item.summary || '',
      url: item.link || '',
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      source: source.name,
      sourceTier: source.tier,
      sourceCountry: source.country,
      region: source.region
    }));

    feedCache[source.rssUrl] = { articles, fetchedAt: Date.now() };
    return articles;
  } catch (err) {
    // Return cached even if stale, or empty
    if (cached) return cached.articles;
    return [];
  }
}

// Fetch multiple feeds with concurrency limit
async function fetchFeeds(sources, maxConcurrent = 10) {
  const results = [];
  for (let i = 0; i < sources.length; i += maxConcurrent) {
    const batch = sources.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map(s => fetchFeed(s)));
    results.push(...batchResults.flat());
  }
  return results;
}

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
    const { region, sectors, sourceTypes, profile: profileStr } = req.query;
    const regionSlug = regionSlugMap[region] || 'global';
    const typeList = sourceTypes ? sourceTypes.split(',') : ['Mainstream news', 'Independent journalism', 'Think tanks & academic'];

    // Get filtered sources from registry
    const sources = getSourcesForRegion(regionSlug, typeList);
    console.log(`Fetching ${sources.length} RSS feeds for ${region} (${typeList.join(', ')})`);

    // Fetch RSS feeds
    const allArticles = await fetchFeeds(sources);

    // Parse user profile for scoring
    let userProfile = null;
    if (profileStr) {
      try { userProfile = JSON.parse(profileStr); } catch {}
    }

    // Deduplicate by title
    const seen = new Set();
    const unique = allArticles.filter(a => {
      const key = a.title?.toLowerCase().trim();
      if (!key || key.length < 10 || key === '[removed]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Score and sort
    unique.forEach(a => {
      a.score = scoreArticle(a, regionSlug, userProfile);
    });
    unique.sort((a, b) => b.score - a.score);

    // Map to card format
    const articles = unique.slice(0, 40).map(article => ({
      title: article.title,
      source: article.source,
      sourceTier: article.sourceTier,
      publishedAt: article.publishedAt,
      description: (article.description || '').substring(0, 300),
      content: (article.content || article.description || '').substring(0, 500),
      url: article.url,
      region: region || 'Global',
      isOfficial: article.sourceTier === 'government-official',
      score: article.score
    }));

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

    const articleList = articles.map((a, i) => {
      const officialNote = a.isOfficial ? ' [OFFICIAL GOVERNMENT SOURCE]' : '';
      return `[${i}] "${a.title}"${officialNote} — ${a.description || 'No description'}`;
    }).join('\n');

    const prompt = `You are a geopolitical intelligence analyst. For each article below, write a single-sentence TL;DR summary (max 25 words). Be direct, factual, and analytical. Focus on the geopolitical significance.

For articles marked [OFFICIAL GOVERNMENT SOURCE], prepend "OFFICIAL:" to your summary and note that this is a government claim, not independently verified.

Articles:
${articleList}

Respond with ONLY a JSON array of strings, one summary per article, in the same order. Example: ["Summary 1", "OFFICIAL: Summary 2"]
Do not include any other text, markdown, or formatting. Just the JSON array.`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 2000 }
    );

    const raw = chatCompletion.choices[0]?.message?.content || '[]';
    let summaries;
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      summaries = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      summaries = [];
    }

    res.json({ summaries });
  } catch (err) {
    console.error('TL;DR generation error:', err);
    res.status(500).json({ error: 'Failed to generate summaries', summaries: [] });
  }
});

// ── Intelligence Briefing ───────────────────────────────────────

app.post('/api/briefing', async (req, res) => {
  try {
    const { title, source, description, content, isOfficial } = req.body;

    const expertSection = isOfficial
      ? `WHAT THE GOVERNMENT IS CLAIMING AND ITS LIKELY STRATEGIC INTENT:
[Analyse what the government is asserting, why it is making this statement now, and what strategic objective it likely serves. Note any contradictions with independent reporting.]`
      : `WHAT EXPERTS ARE SAYING:
[Summarise likely expert perspectives and analysis based on the coverage]`;

    const officialNote = isOfficial
      ? '\nIMPORTANT: This is an official government source. Frame your analysis accordingly — distinguish between claims and verified facts.'
      : '';

    const prompt = `You are a geopolitical analyst. Based on the following news article, produce a structured intelligence briefing. Be concise, factual, and analytical.${officialNote}

Article headline: ${title}
Source: ${source}
Description: ${description}
Content: ${content}

Respond in EXACTLY this format with these four sections. Use plain text, no markdown formatting:

WHAT HAPPENED:
[2-3 sentences summarising the key development]

WHAT LED TO THIS:
[Brief background context explaining the conditions or events that preceded this]

${expertSection}

WHY THIS MATTERS:
[1-2 sentences on the broader significance and potential implications]`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, max_tokens: 600 }
    );

    const briefing = chatCompletion.choices[0]?.message?.content || 'Unable to generate briefing.';
    res.json({ briefing, isOfficial: !!isOfficial });
  } catch (err) {
    console.error('Briefing generation error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// ── Personalized Impact Analysis ────────────────────────────────

app.post('/api/impact', async (req, res) => {
  try {
    const { title, source, description, content, profile } = req.body;

    if (!profile || !profile.role) {
      return res.status(400).json({ error: 'Profile required' });
    }

    const profileDesc = [
      profile.role && `Role: ${profile.role}`,
      profile.industry && `Industry: ${profile.industry}`,
      profile.location && `Based in: ${profile.location}`,
      profile.focus && `Focus areas: ${profile.focus}`
    ].filter(Boolean).join(' | ');

    const prompt = `You are an expert analyst providing personalized intelligence briefings. A professional is reading a news article. Based on their profile, explain how this news could impact them specifically.

READER PROFILE:
${profileDesc}

ARTICLE:
Headline: ${title}
Source: ${source}
Description: ${description}
Content: ${content}

Provide a concise, personalized impact analysis in EXACTLY this format. Use plain text, no markdown:

RELEVANCE:
[One word: HIGH, MEDIUM, or LOW]

IMPACT SUMMARY:
[2-3 sentences explaining specifically how this development could affect someone in their role, industry, and location. Be concrete and actionable, not generic.]

WHAT TO WATCH:
[1-2 specific things they should monitor or actions they might consider based on their profile]`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, max_tokens: 400 }
    );

    const impact = chatCompletion.choices[0]?.message?.content || 'Unable to generate impact analysis.';
    const relevanceMatch = impact.match(/RELEVANCE:\s*(HIGH|MEDIUM|LOW)/i);
    const relevance = relevanceMatch ? relevanceMatch[1].toUpperCase() : 'MEDIUM';

    res.json({ impact, relevance });
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

app.listen(PORT, () => {
  const totalSources = Object.values(SOURCES).reduce((a, b) => a + b.length, 0);
  console.log(`GeoSignal running at http://localhost:${PORT}`);
  console.log(`Source registry: ${totalSources} sources across ${Object.keys(SOURCES).length} regions`);
  console.log(`Groq keys loaded: ${groqClients.length} (models: ${GROQ_MODEL}, ${GROQ_FALLBACK_MODEL})`);
});
