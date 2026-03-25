require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── API Key Rotation ────────────────────────────────────────────
// NewsAPI keys rotate automatically; when one hits rate limit, we switch
const newsApiKeys = [
  process.env.NEWSAPI_KEY_1,
  process.env.NEWSAPI_KEY_2
].filter(Boolean);

let currentNewsApiIndex = 0;

function getNewsApiKey() {
  return newsApiKeys[currentNewsApiIndex % newsApiKeys.length];
}

function rotateNewsApiKey() {
  currentNewsApiIndex = (currentNewsApiIndex + 1) % newsApiKeys.length;
  console.log(`Rotated to NewsAPI key #${currentNewsApiIndex + 1}`);
}

const gnewsApiKey = process.env.GNEWS_API_KEY;

// ── Region & Sector Config ──────────────────────────────────────

const regionQueries = {
  'Global': 'world OR global OR international',
  'Middle East': 'Middle East OR Israel OR Iran OR Saudi Arabia OR Syria OR Iraq OR Lebanon OR Yemen',
  'South Asia': 'India OR Pakistan OR Bangladesh OR Sri Lanka OR Nepal OR Afghanistan',
  'Southeast Asia': 'Indonesia OR Philippines OR Vietnam OR Thailand OR Myanmar OR Malaysia OR Singapore OR Cambodia',
  'Europe': 'Europe OR EU OR Germany OR France OR UK OR Ukraine OR NATO OR Poland OR Italy OR Spain',
  'Africa': 'Africa OR Nigeria OR Kenya OR South Africa OR Ethiopia OR Egypt OR Congo OR Morocco',
  'Latin America': 'Brazil OR Mexico OR Argentina OR Colombia OR Chile OR Venezuela OR Peru',
  'East Asia': 'China OR Japan OR South Korea OR Taiwan OR North Korea OR Hong Kong',
  'North America': 'United States OR Canada OR Congress OR White House',
  'Central Asia & Caucasus': 'Kazakhstan OR Uzbekistan OR Georgia OR Armenia OR Azerbaijan OR Kyrgyzstan',
  'Oceania': 'Australia OR New Zealand OR Pacific Islands OR Fiji'
};

// GNews uses simpler queries (max 200 chars for free tier)
const regionQueriesGNews = {
  'Global': 'world international',
  'Middle East': 'Middle East Israel Iran Saudi Arabia',
  'South Asia': 'India Pakistan Bangladesh Sri Lanka',
  'Southeast Asia': 'Indonesia Philippines Vietnam Thailand Myanmar Malaysia Singapore',
  'Europe': 'Europe EU Germany France UK Ukraine NATO',
  'Africa': 'Africa Nigeria Kenya South Africa Ethiopia Egypt',
  'Latin America': 'Brazil Mexico Argentina Colombia Venezuela',
  'East Asia': 'China Japan South Korea Taiwan North Korea',
  'North America': 'United States Canada',
  'Central Asia & Caucasus': 'Kazakhstan Uzbekistan Georgia Armenia Azerbaijan',
  'Oceania': 'Australia New Zealand Pacific'
};

const sectorKeywords = {
  'Geopolitics': 'geopolitics OR diplomacy OR sanctions OR foreign policy OR conflict OR treaty',
  'Economy & Trade': 'economy OR trade OR tariffs OR GDP OR markets OR inflation OR recession',
  'Technology & AI': 'technology OR AI OR cyber OR semiconductor OR quantum',
  'Climate & Energy': 'climate OR energy OR renewable OR emissions OR oil OR carbon',
  'Defence & Security': 'defense OR military OR security OR weapons OR intelligence OR terrorism',
  'Society & Culture': 'migration OR human rights OR protests OR election OR democracy OR refugees',
  'Space & Frontier': 'space OR satellite OR rocket OR NASA OR launch OR orbital',
  'Health & Biotech': 'health OR pandemic OR biotech OR pharmaceutical OR vaccine OR disease'
};

const sectorKeywordsGNews = {
  'Geopolitics': 'geopolitics diplomacy sanctions',
  'Economy & Trade': 'economy trade tariffs markets',
  'Technology & AI': 'technology AI cyber semiconductor',
  'Climate & Energy': 'climate energy renewable oil',
  'Defence & Security': 'defense military security weapons',
  'Society & Culture': 'migration human rights election',
  'Space & Frontier': 'space satellite rocket NASA',
  'Health & Biotech': 'health pandemic biotech vaccine'
};

const regionalSources = {
  'Middle East': 'aljazeera.com,timesofisrael.com,arabnews.com,middleeasteye.net,dailysabah.com',
  'South Asia': 'hindustantimes.com,ndtv.com,dawn.com,thehindu.com,bdnews24.com,economictimes.indiatimes.com',
  'Southeast Asia': 'straitstimes.com,bangkokpost.com,rappler.com,channelnewsasia.com,thejakartapost.com,vnexpress.net',
  'Europe': 'bbc.co.uk,theguardian.com,dw.com,france24.com,politico.eu,reuters.com',
  'Africa': 'allafrica.com,nation.africa,mg.co.za,premiumtimesng.com,dailymaverick.co.za,theafricareport.com',
  'Latin America': 'reuters.com,bbc.co.uk,batimes.com.ar,braziljournal.com,mexiconewsdaily.com',
  'East Asia': 'scmp.com,japantimes.co.jp,koreaherald.com,nikkei.com,globaltimes.cn,taipeitimes.com',
  'North America': 'nytimes.com,washingtonpost.com,cnn.com,politico.com,thehill.com,axios.com,cbc.ca',
  'Central Asia & Caucasus': 'eurasianet.org,thediplomat.com,reuters.com,rferl.org',
  'Oceania': 'abc.net.au,rnz.co.nz,theguardian.com,smh.com.au,stuff.co.nz',
  'Global': 'reuters.com,bbc.co.uk,aljazeera.com,apnews.com,bloomberg.com,ft.com,nytimes.com'
};

const sourceTypeDomains = {
  'Mainstream news': [
    'reuters.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com', 'aljazeera.com',
    'apnews.com', 'washingtonpost.com', 'cnn.com', 'bloomberg.com', 'ft.com',
    'economist.com', 'politico.com', 'france24.com', 'dw.com', 'scmp.com',
    'abc.net.au', 'nbcnews.com', 'axios.com', 'thehill.com', 'japantimes.co.jp',
    'hindustantimes.com', 'straitstimes.com', 'timesofisrael.com', 'ndtv.com',
    'channelnewsasia.com', 'koreaherald.com', 'dawn.com', 'bangkokpost.com',
    'arabnews.com', 'rappler.com', 'dailysabah.com', 'thejakartapost.com',
    'taipeitimes.com', 'nikkei.com', 'cbc.ca', 'smh.com.au'
  ].join(','),
  'Think tanks & academic': [
    'foreignaffairs.com', 'brookings.edu', 'cfr.org', 'chathamhouse.org',
    'carnegieendowment.org', 'rand.org', 'csis.org', 'iiss.org',
    'stimson.org', 'crisisgroup.org', 'lowyinstitute.org', 'eurasianet.org'
  ].join(','),
  'Independent journalism': [
    'theintercept.com', 'propublica.org', 'bellingcat.com', 'rest-of-world.org',
    'globalvoices.org', 'thediplomat.com', 'mondediplo.com', 'newlinesmag.com',
    'warontherocks.com', 'devex.com', 'middleeasteye.net', 'dailymaverick.co.za',
    'theafricareport.com', 'rferl.org'
  ].join(',')
};

// ── NewsAPI Fetch (with key rotation) ───────────────────────────

async function fetchFromNewsAPI(query, domains, fromStr) {
  // Try each key until one works
  for (let attempt = 0; attempt < newsApiKeys.length; attempt++) {
    const apiKey = getNewsApiKey();
    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '30',
      from: fromStr,
      apiKey
    });
    if (domains) {
      params.set('domains', domains);
    }

    const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
    const data = await response.json();

    if (data.status === 'ok') {
      return data.articles || [];
    }

    // Rate limited — rotate to next key and retry
    if (data.code === 'rateLimited') {
      console.log(`NewsAPI key #${currentNewsApiIndex + 1} rate limited, rotating...`);
      rotateNewsApiKey();
      continue;
    }

    // Other error — log and return empty
    console.error('NewsAPI error:', data);
    return [];
  }

  // All NewsAPI keys exhausted
  console.log('All NewsAPI keys rate limited');
  return null; // Signal to fall back to GNews
}

// ── GNews Fetch (fallback) ──────────────────────────────────────

async function fetchFromGNews(region, sectorList) {
  if (!gnewsApiKey) return [];

  const regionQ = regionQueriesGNews[region] || regionQueriesGNews['Global'];

  // GNews has a 200-char query limit, so keep it short
  // Pick top 2 sectors only
  const topSectors = sectorList.slice(0, 2);
  const sectorQ = topSectors
    .map(s => sectorKeywordsGNews[s])
    .filter(Boolean)
    .join(' ');

  let query = `${regionQ} ${sectorQ}`.trim();
  if (query.length > 200) {
    query = query.substring(0, 200).trim();
  }

  const params = new URLSearchParams({
    q: query,
    lang: 'en',
    max: '10',
    apikey: gnewsApiKey
  });

  try {
    const response = await fetch(`https://gnews.io/api/v4/search?${params}`);
    const data = await response.json();

    if (data.articles && data.articles.length > 0) {
      console.log(`GNews returned ${data.articles.length} articles`);
      // Map GNews format to match NewsAPI format
      return data.articles.map(a => ({
        title: a.title,
        source: { name: a.source?.name || 'Unknown' },
        publishedAt: a.publishedAt,
        description: a.description || '',
        content: a.content || a.description || '',
        url: a.url
      }));
    }

    if (data.errors) {
      console.error('GNews error:', data.errors);
    }
    return [];
  } catch (err) {
    console.error('GNews fetch error:', err.message);
    return [];
  }
}

// ── Main News Endpoint ──────────────────────────────────────────

app.get('/api/news', async (req, res) => {
  try {
    const { region, sectors, sourceTypes } = req.query;

    const regionQ = regionQueries[region] || regionQueries['Global'];
    const sectorList = sectors ? sectors.split(',') : Object.keys(sectorKeywords);

    // Build domains from source types
    const typeList = sourceTypes ? sourceTypes.split(',') : Object.keys(sourceTypeDomains);
    const sourceTypeDomainStr = typeList
      .map(t => sourceTypeDomains[t])
      .filter(Boolean)
      .join(',');

    const regSources = regionalSources[region] || regionalSources['Global'];
    const allDomains = new Set([
      ...sourceTypeDomainStr.split(',').filter(Boolean),
      ...regSources.split(',').filter(Boolean)
    ]);
    const domainStr = Array.from(allDomains).join(',');

    // Date range — last 7 days
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const fromStr = fromDate.toISOString().split('T')[0];

    // Build queries for 2 batches
    const midpoint = Math.ceil(sectorList.length / 2);
    const batch1 = sectorList.slice(0, midpoint);
    const batch2 = sectorList.slice(midpoint);

    const buildQuery = (rq, sectorBatch) => {
      const sq = sectorBatch
        .map(s => sectorKeywords[s])
        .filter(Boolean)
        .join(' OR ');
      let q = sq ? `(${rq}) AND (${sq})` : rq;
      if (q.length > 490) {
        q = q.substring(0, 490);
        const lastOR = q.lastIndexOf(' OR ');
        if (lastOR > 0) q = q.substring(0, lastOR);
      }
      return q;
    };

    const query1 = buildQuery(regionQ, batch1);
    const query2 = batch2.length > 0 ? buildQuery(regionQ, batch2) : null;

    // Try NewsAPI first (with key rotation)
    const newsApiResults1 = await fetchFromNewsAPI(query1, domainStr, fromStr);
    const newsApiResults2 = query2 ? await fetchFromNewsAPI(query2, null, fromStr) : [];

    let allArticles = [];

    if (newsApiResults1 === null && newsApiResults2 === null) {
      // All NewsAPI keys exhausted — fall back entirely to GNews
      console.log('Falling back to GNews...');
      allArticles = await fetchFromGNews(region, sectorList);
    } else {
      // Combine NewsAPI results
      if (newsApiResults1) allArticles.push(...newsApiResults1);
      if (newsApiResults2) allArticles.push(...newsApiResults2);

      // Also fetch from GNews for supplementary coverage
      const gnewsArticles = await fetchFromGNews(region, sectorList);
      allArticles.push(...gnewsArticles);
    }

    // Deduplicate by title (case-insensitive)
    const seen = new Set();
    const unique = allArticles.filter(a => {
      const key = a.title?.toLowerCase().trim();
      if (!key || key === '[removed]' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by publish date (newest first)
    unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Map to card format
    const articles = unique.slice(0, 30).map(article => ({
      title: article.title,
      source: article.source?.name || 'Unknown',
      publishedAt: article.publishedAt,
      description: article.description || '',
      content: article.content || article.description || '',
      url: article.url,
      region: region || 'Global'
    }));

    res.json({ articles });
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

    const articleList = articles.map((a, i) =>
      `[${i}] "${a.title}" — ${a.description || 'No description'}`
    ).join('\n');

    const prompt = `You are a geopolitical intelligence analyst. For each article below, write a single-sentence TL;DR summary (max 25 words). Be direct, factual, and analytical. Focus on the geopolitical significance.

Articles:
${articleList}

Respond with ONLY a JSON array of strings, one summary per article, in the same order. Example: ["Summary 1", "Summary 2"]
Do not include any other text, markdown, or formatting. Just the JSON array.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 2000
    });

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
    const { title, source, description, content } = req.body;

    const prompt = `You are a geopolitical analyst. Based on the following news article, produce a structured intelligence briefing. Be concise, factual, and analytical.

Article headline: ${title}
Source: ${source}
Description: ${description}
Content: ${content}

Respond in EXACTLY this format with these four sections. Use plain text, no markdown formatting:

WHAT HAPPENED:
[2-3 sentences summarising the key development]

WHAT LED TO THIS:
[Brief background context explaining the conditions or events that preceded this]

WHAT EXPERTS ARE SAYING:
[Summarise likely expert perspectives and analysis based on the coverage]

WHY THIS MATTERS:
[1-2 sentences on the broader significance and potential implications]`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 600
    });

    const briefing = chatCompletion.choices[0]?.message?.content || 'Unable to generate briefing.';
    res.json({ briefing });
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

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 400
    });

    const impact = chatCompletion.choices[0]?.message?.content || 'Unable to generate impact analysis.';
    const relevanceMatch = impact.match(/RELEVANCE:\s*(HIGH|MEDIUM|LOW)/i);
    const relevance = relevanceMatch ? relevanceMatch[1].toUpperCase() : 'MEDIUM';

    res.json({ impact, relevance });
  } catch (err) {
    console.error('Impact analysis error:', err);
    res.status(500).json({ error: 'Failed to generate impact analysis' });
  }
});

app.listen(PORT, () => {
  console.log(`GeoSignal running at http://localhost:${PORT}`);
  console.log(`NewsAPI keys loaded: ${newsApiKeys.length}`);
  console.log(`GNews fallback: ${gnewsApiKey ? 'enabled' : 'disabled'}`);
});
