require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Region queries — kept short to stay under NewsAPI 500-char limit
const regionQueries = {
  'Global': '',
  'Middle East': 'Middle East OR Israel OR Iran OR Saudi Arabia OR Syria OR Iraq',
  'South Asia': 'India OR Pakistan OR Bangladesh OR Sri Lanka OR Nepal',
  'Southeast Asia': 'Indonesia OR Philippines OR Vietnam OR Thailand OR Myanmar OR Malaysia',
  'Europe': 'Europe OR EU OR Germany OR France OR UK OR NATO OR Ukraine',
  'Africa': 'Africa OR Nigeria OR Kenya OR South Africa OR Ethiopia OR Egypt',
  'Latin America': 'Brazil OR Mexico OR Argentina OR Colombia OR Chile OR Venezuela',
  'East Asia': 'China OR Japan OR South Korea OR Taiwan OR North Korea',
  'North America': 'United States OR Canada',
  'Central Asia & Caucasus': 'Kazakhstan OR Uzbekistan OR Georgia OR Armenia OR Azerbaijan',
  'Oceania': 'Australia OR New Zealand OR Pacific Islands'
};

// Sector keywords — kept concise for query limits
const sectorKeywords = {
  'Geopolitics': 'geopolitics OR diplomacy OR sanctions OR foreign policy OR conflict',
  'Economy & Trade': 'economy OR trade OR tariffs OR GDP OR markets OR inflation',
  'Technology & AI': 'technology OR AI OR cyber OR semiconductor',
  'Climate & Energy': 'climate OR energy OR renewable OR emissions OR oil',
  'Defence & Security': 'defense OR military OR security OR weapons OR intelligence',
  'Society & Culture': 'migration OR human rights OR protests OR election OR democracy',
  'Space & Frontier': 'space OR satellite OR rocket OR NASA OR launch',
  'Health & Biotech': 'health OR pandemic OR biotech OR pharmaceutical OR vaccine'
};

// Source types — mainstream expanded to 20+ outlets
const sourceTypeDomains = {
  'Mainstream news': [
    'reuters.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com', 'aljazeera.com',
    'apnews.com', 'washingtonpost.com', 'cnn.com', 'bloomberg.com', 'ft.com',
    'economist.com', 'politico.com', 'france24.com', 'dw.com', 'scmp.com',
    'abc.net.au', 'nbcnews.com', 'axios.com', 'thehill.com', 'japantimes.co.jp',
    'hindustantimes.com', 'straitstimes.com', 'timesofisrael.com'
  ].join(','),
  'Think tanks & academic': [
    'foreignaffairs.com', 'brookings.edu', 'cfr.org', 'chathamhouse.org',
    'carnegieendowment.org', 'rand.org', 'csis.org', 'iiss.org',
    'stimson.org', 'crisisgroup.org', 'lowyinstitute.org'
  ].join(','),
  'Independent journalism': [
    'theintercept.com', 'propublica.org', 'bellingcat.com', 'rest-of-world.org',
    'globalvoices.org', 'thediplomatcom', 'mondediplo.com', 'newlinesmag.com',
    'warontherocks.com', 'devex.com'
  ].join(',')
};

app.get('/api/news', async (req, res) => {
  try {
    const { region, sectors, sourceTypes } = req.query;

    // Build query from region and sectors — stay under 500 chars
    const regionQ = regionQueries[region] || '';
    const sectorList = sectors ? sectors.split(',') : Object.keys(sectorKeywords);

    // Pick top 3 sector keyword groups max to keep query short
    const activeSectors = sectorList.slice(0, 3);
    const sectorQ = activeSectors
      .map(s => sectorKeywords[s])
      .filter(Boolean)
      .join(' OR ');

    let query = [regionQ, sectorQ].filter(Boolean).join(' AND ');

    // Hard cap at 490 chars to stay under NewsAPI limit
    if (query.length > 490) {
      query = query.substring(0, 490);
      // Trim to last complete OR term
      const lastOR = query.lastIndexOf(' OR ');
      if (lastOR > 0) query = query.substring(0, lastOR);
    }

    if (!query) query = 'world news geopolitics';

    // Build domains from source types
    const typeList = sourceTypes ? sourceTypes.split(',') : Object.keys(sourceTypeDomains);
    const domains = typeList
      .map(t => sourceTypeDomains[t])
      .filter(Boolean)
      .join(',');

    // Calculate date range — last 7 days for freshness
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const fromStr = fromDate.toISOString().split('T')[0];

    // Fetch from NewsAPI — request more articles for richer feed
    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '30',
      from: fromStr,
      apiKey: process.env.NEWSAPI_KEY
    });

    if (domains) {
      params.set('domains', domains);
    }

    const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
    const data = await response.json();

    if (data.status !== 'ok') {
      console.error('NewsAPI error:', data);
      return res.status(502).json({ error: 'Failed to fetch news', detail: data.message });
    }

    // Map articles to our card format
    const articles = (data.articles || []).map(article => ({
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

// Generate TL;DR summaries for a batch of articles
app.post('/api/tldr', async (req, res) => {
  try {
    const { articles } = req.body;
    if (!articles || !articles.length) {
      return res.json({ summaries: [] });
    }

    // Build a single prompt for batch TL;DR generation
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
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 2000
    });

    const raw = chatCompletion.choices[0]?.message?.content || '[]';

    // Extract JSON array from the response
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
      model: 'llama-3.3-70b-versatile',
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

app.listen(PORT, () => {
  console.log(`GeoSignal running at http://localhost:${PORT}`);
});
