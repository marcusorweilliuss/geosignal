require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Region queries — South Asia and Southeast Asia are now separate
const regionQueries = {
  'Global': '',
  'Middle East': 'Middle East OR Israel OR Iran OR Saudi Arabia OR Syria OR Iraq OR Lebanon OR Yemen OR UAE OR Qatar OR Jordan OR Kuwait OR Bahrain OR Oman',
  'South Asia': 'India OR Pakistan OR Bangladesh OR Sri Lanka OR Nepal OR Afghanistan OR Maldives OR Bhutan',
  'Southeast Asia': 'Indonesia OR Philippines OR Vietnam OR Thailand OR Myanmar OR Malaysia OR Singapore OR Cambodia OR Laos',
  'Europe': 'Europe OR EU OR Germany OR France OR UK OR NATO OR Poland OR Ukraine OR Italy OR Spain OR Netherlands OR Sweden OR Norway',
  'Africa': 'Africa OR Nigeria OR Kenya OR South Africa OR Ethiopia OR Congo OR Egypt OR Morocco OR Ghana OR Tanzania OR Sudan OR Somalia OR Mozambique',
  'Latin America': 'Latin America OR Brazil OR Mexico OR Argentina OR Colombia OR Chile OR Peru OR Venezuela OR Ecuador OR Cuba',
  'East Asia': 'China OR Japan OR South Korea OR Taiwan OR North Korea OR Mongolia OR Hong Kong',
  'North America': 'United States OR Canada OR US policy OR Congress OR White House',
  'Central Asia & Caucasus': 'Kazakhstan OR Uzbekistan OR Georgia OR Armenia OR Azerbaijan OR Turkmenistan OR Kyrgyzstan OR Tajikistan',
  'Oceania': 'Australia OR New Zealand OR Pacific Islands OR Fiji OR Papua New Guinea'
};

// Sector keywords — expanded for better coverage
const sectorKeywords = {
  'Geopolitics': 'geopolitics OR diplomacy OR sanctions OR foreign policy OR conflict OR treaty OR alliance OR territorial OR sovereignty',
  'Economy & Trade': 'economy OR trade OR tariffs OR GDP OR markets OR inflation OR recession OR supply chain OR central bank OR currency',
  'Technology & AI': 'technology OR artificial intelligence OR AI OR cyber OR semiconductor OR quantum computing OR tech regulation OR surveillance OR data privacy',
  'Climate & Energy': 'climate OR energy OR renewable OR emissions OR oil OR carbon OR solar OR wind power OR nuclear energy OR sustainability OR drought OR flooding',
  'Defence & Security': 'defence OR defense OR military OR security OR weapons OR intelligence OR NATO OR missile OR nuclear OR terrorism OR arms deal',
  'Society & Culture': 'society OR culture OR migration OR human rights OR protests OR demographics OR election OR democracy OR refugees OR public health',
  'Space & Frontier': 'space OR satellite OR rocket OR NASA OR ESA OR orbital OR Mars OR Moon OR asteroid OR launch',
  'Health & Biotech': 'health OR pandemic OR biotech OR pharmaceutical OR WHO OR vaccine OR disease OR medical OR genomics'
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

    // Build query from region and sectors
    const regionQ = regionQueries[region] || '';
    const sectorList = sectors ? sectors.split(',') : Object.keys(sectorKeywords);
    const sectorQ = sectorList
      .map(s => sectorKeywords[s])
      .filter(Boolean)
      .join(' OR ');

    let query = [regionQ, sectorQ].filter(Boolean).join(' AND ');
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
      model: 'llama3-8b-8192',
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
      model: 'llama3-8b-8192',
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
