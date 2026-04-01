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
    const { region, sectors, sourceTypes, profile: profileStr, search } = req.query;
    const regionSlug = regionSlugMap[region] || 'global';
    const typeList = sourceTypes ? sourceTypes.split(',') : ['Mainstream news', 'Independent journalism', 'Think tanks & academic'];
    const activeSectors = sectors ? sectors.split(',') : [];
    const searchTerms = search ? search.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1) : [];

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

    let allArticles = [...cachedArticles, ...freshArticles];

    // If searching, also pull from ALL cached feeds across every region
    if (searchTerms.length > 0) {
      Object.values(feedCache).forEach(cached => {
        if (cached.articles) allArticles.push(...cached.articles);
      });
    }

    // Parse user profile for scoring
    let userProfile = null;
    if (profileStr) {
      try { userProfile = JSON.parse(profileStr); } catch {}
    }

    // Deduplicate by title
    const seen = new Set();
    let unique = allArticles.filter(a => {
      const key = a.title?.toLowerCase().trim();
      if (!key || key.length < 10 || key === '[removed]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply search filter if present
    if (searchTerms.length > 0) {
      unique = unique.filter(a => {
        const text = ((a.title || '') + ' ' + (a.description || '') + ' ' + (a.source || '')).toLowerCase();
        return searchTerms.every(term => text.includes(term));
      });
    }

    // Apply sector filter — article must match at least one active sector's keywords
    if (activeSectors.length > 0 && activeSectors.length < 8) {
      // Build keyword list from only the active sectors
      const { SECTOR_KEYWORDS: sectorKw } = require('./sources');
      const activeSectorKeywords = activeSectors
        .map(s => sectorKw[s])
        .filter(Boolean)
        .flat()
        .map(k => k.toLowerCase());

      if (activeSectorKeywords.length > 0) {
        unique = unique.filter(a => {
          const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
          return activeSectorKeywords.some(kw => text.includes(kw));
        });
      }
    }

    // Score and sort — pass active sectors so scoring weights them
    unique.forEach(a => {
      a.score = scoreArticle(a, regionSlug, userProfile, activeSectors);
      // Boost score for search matches in title
      if (searchTerms.length > 0) {
        const titleLower = (a.title || '').toLowerCase();
        const titleMatches = searchTerms.filter(t => titleLower.includes(t)).length;
        a.score += titleMatches * 10;
      }
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

    const prompt = `You are a senior geopolitical intelligence analyst writing single-line briefing summaries for decision-makers.

RULES:
- ONE sentence per article. No exceptions. Never two sentences.
- Maximum 30 words. Cut ruthlessly.
- Lead with the most important fact or consequence, not background.
- Be specific: use country names, actor names, numbers, concrete outcomes.
- Do NOT say "amid tensions" or "raises concerns" — say what actually happened or will happen.
- For articles marked [OFFICIAL GOVERNMENT SOURCE], prepend "OFFICIAL:" and frame as a government claim.
- If the headline is vague, still extract the core signal and state it clearly.

Articles:
${articleList}

Respond with ONLY a JSON array of strings, one summary per article, in the same order. Example: ["Summary 1", "OFFICIAL: Summary 2"]
No other text, no markdown, no formatting. Just the JSON array.`;

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
    const hasExperts = expertArticles.length > 0;

    if (hasExperts && !isOfficial) {
      expertContext = '\n\nRELATED ANALYSIS FROM REGIONAL THINK TANKS AND RESEARCH INSTITUTIONS:\n';
      expertArticles.forEach((ea, i) => {
        expertContext += `\n[Expert Source ${i + 1}]\nOrganisation: ${ea.source}\nTitle: "${ea.title}"\nSummary: ${ea.description}\n`;
      });
      expertContext += '\nYou MUST reference these expert sources by name in your "WHAT REGIONAL EXPERTS ARE SAYING" section. Cite the organisation name (e.g. "According to Brookings..." or "Carnegie India notes that..."). Do not invent quotes but you may paraphrase their position based on the title and summary.\n';
    }

    let expertSection, officialNote;

    if (isOfficial) {
      officialNote = '\nThis is an official government source. Distinguish claims from verified facts.';
      expertSection = `GOVERNMENT CLAIM & STRATEGIC INTENT:
- [What the government is asserting and why now.]
- [Target audience and likely strategic objective.]
- [Any tension with independent reporting.]`;
    } else if (hasExperts) {
      officialNote = '';
      expertSection = `WHAT REGIONAL EXPERTS ARE SAYING:
- [Cite expert source by name: "According to [Organisation]..." Key argument.]
- [Second expert view or where experts diverge. Cite by name.]`;
    } else {
      officialNote = '';
      expertSection = `WHAT REGIONAL EXPERTS ARE SAYING:
- [How regional analysts and think tanks would likely view this.]
- [Any notable dissenting or contrarian view.]`;
    }

    const prompt = `You are a senior geopolitical intelligence analyst. Produce a tight, scannable briefing using bullet points. Every bullet must deliver a concrete insight — no filler, no vague language.${officialNote}

ARTICLE: ${title}
SOURCE: ${source}
TEXT: ${articleContent}${expertContext}

Use EXACTLY this format. Each section: 2-3 bullet points, each bullet ONE line max. Use a dash (-) for bullets:

WHAT HAPPENED:
- [Key fact: who, what, when, where. Use specific names and figures.]
- [Second key fact or consequence.]

WHAT LED TO THIS:
- [Most important preceding event or structural cause.]
- [Second factor, if relevant.]

${expertSection}

WHY THIS MATTERS:
- [Biggest implication or second-order effect.]
- [Who else is affected and what to watch next.]`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, max_tokens: 600 }
    );

    const briefing = chatCompletion.choices[0]?.message?.content || 'Unable to generate briefing.';
    res.json({
      briefing,
      isOfficial: !!isOfficial,
      expertSources: expertArticles.map(ea => ({ title: ea.title, source: ea.source, url: ea.url })),
      fullTextAvailable: !!fullText
    });
  } catch (err) {
    console.error('Briefing generation error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// ── Personalized Impact Analysis ────────────────────────────────

app.post('/api/impact', async (req, res) => {
  try {
    const { title, source, description, content, profile, url, region } = req.body;

    if (!profile || !profile.role) {
      return res.status(400).json({ error: 'Profile required' });
    }

    // Fetch full article text for richer analysis
    const fullText = url ? await fetchFullArticleText(url) : '';
    const articleContent = fullText || content || description || '';

    // Find related think tank analysis for this region
    const regionSlug = regionSlugMap[region] || 'global';
    const expertArticles = findRelatedThinkTankArticles(title, regionSlug);

    let expertContext = '';
    if (expertArticles.length > 0) {
      expertContext = '\n\nRELATED EXPERT ANALYSIS (use these to inform your impact assessment):\n';
      expertArticles.forEach((ea, i) => {
        expertContext += `${i + 1}. "${ea.title}" — ${ea.source}: ${ea.description}\n`;
      });
    }

    const profileDesc = [
      profile.role && `Role: ${profile.role}`,
      profile.industry && `Industry: ${profile.industry}`,
      profile.location && `Based in: ${profile.location}`,
      profile.focus && `Focus areas: ${profile.focus}`
    ].filter(Boolean).join(' | ');

    const prompt = `You are an analyst providing a personalized impact assessment. Be specific to this person's role, industry, and location. Use bullet points — no filler.

PROFILE: ${profileDesc}
ARTICLE: ${title} (${source})
TEXT: ${articleContent}${expertContext}

Use EXACTLY this format. Bullets with dashes (-), each ONE line max:

RELEVANCE:
[One word: HIGH, MEDIUM, or LOW]

IMPACT SUMMARY:
- [How this specifically affects their role/industry. Name the mechanism.]
- [Financial, regulatory, or operational consequence for their sector.]

WHAT TO WATCH:
- [Specific trigger, date, policy decision, or data release to monitor.]
- [Second actionable item relevant to their profile.]`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, max_tokens: 300 }
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

// ── Reddit Sentiment Search ─────────────────────────────────────
// Searches Reddit for recent discussions related to a topic

const redditCache = {};
const REDDIT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

app.get('/api/sentiment/reddit', async (req, res) => {
  try {
    const { topic } = req.query;
    if (!topic) return res.status(400).json({ error: 'topic parameter required' });

    // Check cache
    const cacheKey = topic.toLowerCase().trim();
    const cached = redditCache[cacheKey];
    if (cached && (Date.now() - cached.fetchedAt) < REDDIT_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Extract 3-5 key terms from the headline for better Reddit search
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','has','have','had','not','as','its','says','said','new','over','after','will','could','may','been','into','about','more','than']);
    const keywords = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
    const query = encodeURIComponent(keywords.join(' '));

    // Search across geopolitics-relevant subreddits
    const subreddits = [
      'worldnews', 'geopolitics', 'internationalpolitics',
      'economics', 'energy', 'technology', 'news'
    ];

    const allPosts = [];

    // Search Reddit using old.reddit.com (more reliable for JSON API)
    for (const sub of subreddits) {
      try {
        const url = `https://old.reddit.com/r/${sub}/search.json?q=${query}&sort=relevance&t=month&limit=5&restrict_sr=on`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html, application/json'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(`Reddit r/${sub}: HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();
        const posts = (data?.data?.children || []).map(child => {
          const post = child.data;
          return {
            title: post.title || '',
            subreddit: post.subreddit_name_prefixed || `r/${sub}`,
            score: post.score || 0,
            numComments: post.num_comments || 0,
            url: `https://reddit.com${post.permalink}`,
            created: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : '',
            selftext: (post.selftext || '').substring(0, 200)
          };
        });

        allPosts.push(...posts);
      } catch {
        // Skip failed subreddit, continue with others
        continue;
      }

      // Brief pause to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    // Deduplicate by title
    const seen = new Set();
    const unique = allPosts.filter(p => {
      const key = p.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by engagement (score + comments) and take top 5
    unique.sort((a, b) => (b.score + b.numComments * 2) - (a.score + a.numComments * 2));
    const topPosts = unique.slice(0, 5);

    const result = {
      platform: 'reddit',
      query: topic,
      posts: topPosts,
      note: 'Reddit skews younger, male, and left-of-centre in English-speaking subreddits. Weigh accordingly.'
    };

    // Cache the result
    redditCache[cacheKey] = { data: result, fetchedAt: Date.now() };

    res.json(result);
  } catch (err) {
    console.error('Reddit sentiment error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Reddit discussions', posts: [] });
  }
});

// ── Bluesky Sentiment Search ────────────────────────────────────
// Searches Bluesky's public API for posts related to a topic

const blueskyCache = {};
const BLUESKY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

app.get('/api/sentiment/bluesky', async (req, res) => {
  try {
    const { topic } = req.query;
    if (!topic) return res.status(400).json({ error: 'topic parameter required' });

    // Check cache
    const cacheKey = topic.toLowerCase().trim();
    const cached = blueskyCache[cacheKey];
    if (cached && (Date.now() - cached.fetchedAt) < BLUESKY_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Extract key terms for better search results
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','has','have','had','not','as','its','says','said','new','over','after','will','could','may','been','into','about','more','than']);
    const keywords = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
    const query = encodeURIComponent(keywords.join(' '));

    // Bluesky public search API — no auth needed
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${query}&sort=top&limit=25`;

    const bskyController = new AbortController();
    const bskyTimeout = setTimeout(() => bskyController.abort(), 10000);
    const response = await fetch(url, {
      signal: bskyController.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GeoSignal/1.0)',
        'Accept': 'application/json'
      }
    });

    clearTimeout(bskyTimeout);
    if (!response.ok) {
      console.error('Bluesky API error:', response.status);
      return res.json({ platform: 'bluesky', query: topic, posts: [], note: 'Bluesky API unavailable.' });
    }

    const data = await response.json();
    const posts = (data.posts || []).map(post => {
      const record = post.record || {};
      const author = post.author || {};
      return {
        text: (record.text || '').substring(0, 300),
        username: author.handle || 'unknown',
        displayName: author.displayName || author.handle || 'Unknown',
        likes: post.likeCount || 0,
        reposts: post.repostCount || 0,
        replies: post.replyCount || 0,
        url: author.handle && post.uri
          ? `https://bsky.app/profile/${author.handle}/post/${post.uri.split('/').pop()}`
          : '',
        created: record.createdAt || ''
      };
    });

    // Filter out very short posts and sort by engagement
    const meaningful = posts.filter(p => p.text.length > 30);
    meaningful.sort((a, b) => (b.likes + b.reposts * 2 + b.replies) - (a.likes + a.reposts * 2 + a.replies));
    const topPosts = meaningful.slice(0, 5);

    const result = {
      platform: 'bluesky',
      query: topic,
      posts: topPosts,
      note: 'Bluesky skews toward journalists, academics, and tech-adjacent users. Growing but not yet representative of general public opinion.'
    };

    // Cache the result
    blueskyCache[cacheKey] = { data: result, fetchedAt: Date.now() };

    res.json(result);
  } catch (err) {
    console.error('Bluesky sentiment error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Bluesky posts', posts: [] });
  }
});

// ── Annotate Mode — Term Explainer ──────────────────────────────

app.post('/api/annotate', async (req, res) => {
  try {
    const { term, headline, briefingText } = req.body;
    if (!term || term.length < 2) {
      return res.status(400).json({ error: 'Term too short' });
    }

    const prompt = `You are a plain-English explainer for a smart general audience. The user has highlighted a term while reading a news briefing. Explain that term in 1-2 sentences maximum, in the specific context of this article. Do not give a generic definition. Make it feel like a knowledgeable friend is explaining it. Never use jargon in your explanation. If the term is straightforward, keep it to one sentence.

Article headline: ${headline}
Briefing context: ${(briefingText || '').substring(0, 800)}

Term to explain: "${term}"`;

    const chatCompletion = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 100 }
    );

    const explanation = chatCompletion.choices[0]?.message?.content || 'Could not explain this term.';
    res.json({ term, explanation: explanation.trim() });
  } catch (err) {
    console.error('Annotate error:', err.message);
    res.status(500).json({ error: 'Failed to generate explanation' });
  }
});

app.listen(PORT, () => {
  const totalSources = Object.values(SOURCES).reduce((a, b) => a + b.length, 0);
  console.log(`GeoSignal running at http://localhost:${PORT}`);
  console.log(`Source registry: ${totalSources} sources across ${Object.keys(SOURCES).length} regions`);
  console.log(`Groq keys loaded: ${groqClients.length} (models: ${GROQ_MODEL}, ${GROQ_FALLBACK_MODEL})`);
});
