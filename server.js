require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Map region filter values to NewsAPI search queries
const regionQueries = {
  'Global': '',
  'Middle East': 'Middle East OR Israel OR Iran OR Saudi Arabia OR Syria OR Iraq',
  'South & Southeast Asia': 'India OR Pakistan OR Bangladesh OR Indonesia OR Philippines OR Vietnam OR Thailand',
  'Europe': 'Europe OR EU OR Germany OR France OR UK OR NATO',
  'Africa': 'Africa OR Nigeria OR Kenya OR South Africa OR Ethiopia OR Congo',
  'Latin America': 'Latin America OR Brazil OR Mexico OR Argentina OR Colombia OR Chile',
  'East Asia': 'China OR Japan OR South Korea OR Taiwan OR North Korea',
  'North America': 'United States OR Canada OR US policy'
};

// Map sector filter values to keywords
const sectorKeywords = {
  'Geopolitics': 'geopolitics OR diplomacy OR sanctions OR foreign policy OR conflict',
  'Economy & Trade': 'economy OR trade OR tariffs OR GDP OR markets OR inflation',
  'Technology & AI': 'technology OR artificial intelligence OR AI OR cyber OR tech regulation',
  'Climate & Energy': 'climate OR energy OR renewable OR emissions OR oil OR carbon',
  'Defence & Security': 'defence OR defense OR military OR security OR weapons OR intelligence',
  'Society & Culture': 'society OR culture OR migration OR human rights OR protests OR demographics'
};

// Map source type to NewsAPI domains
const sourceTypeDomains = {
  'Mainstream news': 'reuters.com,bbc.co.uk,nytimes.com,theguardian.com,aljazeera.com,apnews.com,washingtonpost.com',
  'Think tanks & academic': 'foreignaffairs.com,brookings.edu,cfr.org,chathamhouse.org,carnegieendowment.org,rand.org',
  'Independent journalism': 'theintercept.com,propublica.org,bellingcat.com,rest-of-world.org,globalvoices.org'
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

    // Fetch from NewsAPI
    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '10',
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
