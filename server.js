require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
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

function findRelatedThinkTankArticles(articleTitle, regionSlug, limit = 3) {
  const keywords = extractKeywords(articleTitle);
  if (keywords.length === 0) return [];

  // Get all think-tank-academic sources for this region (and global)
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
      // Don't match against the same article
      if (article.title?.toLowerCase().trim() === articleTitle.toLowerCase().trim()) continue;

      const articleWords = extractKeywords(article.title + ' ' + (article.description || ''));
      // Count keyword overlap
      let matches = 0;
      for (const kw of keywords) {
        if (articleWords.includes(kw)) matches++;
      }

      if (matches >= 2) {
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

  // Sort by match score descending, return top N
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
    const articles = (feed.items || []).slice(0, 8).map(item => ({
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
    const { region, sectors, sourceTypes, profile: profileStr } = req.query;
    const regionSlug = regionSlugMap[region] || 'global';
    const typeList = sourceTypes ? sourceTypes.split(',') : ['Mainstream news', 'Independent journalism', 'Think tanks & academic'];

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

    const allArticles = [...cachedArticles, ...freshArticles];

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
    const { title, source, description, content, isOfficial, url, region } = req.body;

    // Fetch full article text for richer analysis
    const fullText = url ? await fetchFullArticleText(url) : '';
    const articleContent = fullText || content || description || '';

    // Find related think tank articles from this region
    const regionSlug = regionSlugMap[region] || 'global';
    const expertArticles = findRelatedThinkTankArticles(title, regionSlug);

    // Build expert context from real think tank articles
    let expertContext = '';
    if (expertArticles.length > 0 && !isOfficial) {
      expertContext = '\n\nRELATED EXPERT ANALYSIS (from regional think tanks — reference these in your expert section):\n';
      expertArticles.forEach((ea, i) => {
        expertContext += `${i + 1}. "${ea.title}" — ${ea.source}\n   ${ea.description}\n`;
      });
    }

    const expertSection = isOfficial
      ? `WHAT THE GOVERNMENT IS CLAIMING AND ITS LIKELY STRATEGIC INTENT:
[Analyse what the government is asserting, why it is making this statement now, and what strategic objective it likely serves. Note any contradictions with independent reporting.]`
      : `WHAT REGIONAL EXPERTS ARE SAYING:
[Summarise expert perspectives on this topic. ${expertArticles.length > 0 ? 'Use the related expert analysis provided above — cite the think tank or source name when referencing their views.' : 'Based on your knowledge of how regional analysts and think tanks would view this development.'}]`;

    const officialNote = isOfficial
      ? '\nIMPORTANT: This is an official government source. Frame your analysis accordingly — distinguish between claims and verified facts.'
      : '';

    const prompt = `You are a geopolitical analyst. Based on the following news article, produce a structured intelligence briefing. Be concise, factual, and analytical.${officialNote}

Article headline: ${title}
Source: ${source}
Full article text:
${articleContent}${expertContext}

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
      { temperature: 0.4, max_tokens: 800 }
    );

    const briefing = chatCompletion.choices[0]?.message?.content || 'Unable to generate briefing.';
    res.json({
      briefing,
      isOfficial: !!isOfficial,
      expertSources: expertArticles.map(ea => ({ title: ea.title, source: ea.source, url: ea.url }))
    });
  } catch (err) {
    console.error('Briefing generation error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// ── Personalized Impact Analysis ────────────────────────────────

app.post('/api/impact', async (req, res) => {
  try {
    const { title, source, description, content, profile, url } = req.body;

    if (!profile || !profile.role) {
      return res.status(400).json({ error: 'Profile required' });
    }

    // Fetch full article text for richer analysis
    const fullText = url ? await fetchFullArticleText(url) : '';
    const articleContent = fullText || content || description || '';

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
Full article text:
${articleContent}

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
