// Centralized quality filters used by both the ingest layer and the
// /api/news output. Avoids circular imports between db.js (storage)
// and ingest.js (fetching).

const BLOCKED_NON_NEWS_HOSTS = new Set([
  'youtube.com', 'youtu.be', 'm.youtube.com',
  'reddit.com', 'old.reddit.com', 'np.reddit.com',
  'twitter.com', 'x.com', 't.co',
  'facebook.com', 'm.facebook.com', 'fb.com',
  'instagram.com', 'tiktok.com',
  'linkedin.com', 'lnkd.in',
  'wikipedia.org', 'wikimedia.org', 'simple.wikipedia.org',
  'medium.com', 'substack.com',
  'pinterest.com', 'tumblr.com',
  'quora.com', 'stackoverflow.com', 'stackexchange.com',
  'github.com', 'gist.github.com',
  'amazon.com', 'amazon.co.uk',
  'imdb.com', 'rotten.com', 'metacritic.com',
  'discord.com', 'telegram.org', 't.me',
  'soundcloud.com', 'spotify.com', 'apple.com',
  // Non-news SaaS / tooling / directories that Perplexity's web
  // search has been surfacing as if they were articles:
  'apify.com',          // Web-scraping tool listings
  'feedspot.com',       // RSS directory ("Top N AI RSS Feeds")
  'omny.fm',            // Podcast hosting (radio show indexes)
  'rss-database.com',   // RSS aggregator/directory
  'rssatom.com',        // RSS aggregator/directory
  'libsyn.com',         // Podcast hosting
  'buzzsprout.com',     // Podcast hosting
  'anchor.fm',          // Podcast hosting
  'spreaker.com',       // Podcast hosting
  'mixcloud.com',       // Audio hosting
  'castbox.fm',         // Podcast aggregator
  'patreon.com',        // Subscription tool, not news
  'kickstarter.com',
  'indiegogo.com',
  'gofundme.com',
  'fiverr.com',
  'upwork.com',
  'researchgate.net',   // Academic preprint platform — not news
  'academia.edu',
  'ssrn.com',
  'scribd.com',
  'slideshare.net',
  'glassdoor.com',
  'indeed.com',
  'goodreads.com',
]);

// Substring blocklist for hostname components. Catches subdomains and
// SaaS-on-customer-domain patterns where the exact host varies.
const BLOCKED_HOST_SUBSTRINGS = [
  'libguides',          // Springshare LibGuides (mskcc.org/libguides, columbia.edu/libguides, *.libguides.com)
  '.feedspot.',
  '.omny.fm',
  '.libsyn.',
  // Corporate engineering / product blogs — self-promotional, not news
  'github.blog',
  'engineering.fb.com',
  'engineering.meta.com',
  'aws.amazon.com/blogs',
  'blogs.aws.amazon.com',
  'devblogs.microsoft.com',
  'techcommunity.microsoft.com',
  'cloud.google.com/blog',
  'blog.google',
  'openai.com/blog',
  'anthropic.com/news',
  'engineering.linkedin.com',
  'medium.engineering',
  'netflixtechblog.com',
  'blog.cloudflare.com',
  'developer.nvidia.com/blog',
  'engineering.atspotify.com',
  'spotify.engineering',
  'eng.uber.com',
];

// Path patterns that betray a non-article page even on legitimate
// news / think-tank domains (e.g. nytimes.com/section/world,
// theguardian.com/world/all, stimson.org/program/southeast-asia).
const NON_ARTICLE_PATH_PATTERNS = [
  /\/libguides?\//i,
  /\/library-?guides?\//i,
  /\/topic\/[^\/]+\/?$/i,     // bare topic landing page
  /\/section\/[^\/]+\/?$/i,
  /\/category\/[^\/]+\/?$/i,
  /\/tag\/[^\/]+\/?$/i,
  /\/archives?\/?$/i,
  /\/program\/[^\/]+\/?$/i,   // think-tank program landing pages
  /\/programs?\/[^\/]+\/?$/i,
  /\/research\/[^\/]+\/?$/i,
  /\/initiatives?\/[^\/]+\/?$/i,
  /\/issues?\/[^\/]+\/?$/i,
  /\/regions?\/[^\/]+\/?$/i,
  // Corporate engineering / product blog path shapes (subset that's
  // safe — generic /blog/ catches too many legit newspaper columnists).
  /\/(?:engineering|tech)-?blog\//i,
  /\/whats-?new\//i,
  /\/changelog\//i,
  /\/press-releases?\//i,      // Corporate press release sections
  /\/newsroom\/[A-Z]/,         // "/newsroom/foo" announcement pages
];

const PRODUCT_PATH_PATTERNS = [
  /\/product\//i,
  /\/products\//i,
  /\/listing\//i,
  /\/itm\//i,
  /\/dp\/[A-Z0-9]/,
  /\/p\/[A-Z0-9-]/,
  /\/shop\//i,
  /\/buy\//i,
  /\/store\//i,
  /\/cart\//i,
  /pcs-/i,
  /-stickers?-/i,
  /-decals?-/i,
  /-mug(?:s)?-/i
];

const PRODUCT_TITLE_PATTERNS = [
  /\b\d+\s*pcs\b/i,
  /\bdiy\s+\w+\s+(?:pens?|stickers?|decals?|mug|cup|tape)/i,
  /\b(?:vinyl|decorative|personalized|adorable|ceramic)\s+(?:stickers?|decals?|mug|cup|tape|pens?)\b/i,
  /\bpress\s+type\b/i,
  /\bcoffee\s+cup\b.*\b(?:personalized|ceramic)\b/i,
  /\b(?:order|buy)\s+now\b/i,
  /\bfree\s+shipping\b/i,
  /\$\d+(?:\.\d{2})?\b/,
  /\bon\s+sale\b/i,
  /\bbest\s+deals?\s+on\b/i
];

function isNonNewsUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (BLOCKED_NON_NEWS_HOSTS.has(host)) return true;
    for (const blocked of BLOCKED_NON_NEWS_HOSTS) {
      if (host === blocked || host.endsWith('.' + blocked)) return true;
    }
    for (const sub of BLOCKED_HOST_SUBSTRINGS) {
      if (host.includes(sub)) return true;
    }
    const path = u.pathname || '';
    for (const re of PRODUCT_PATH_PATTERNS) {
      if (re.test(path)) return true;
    }
    for (const re of NON_ARTICLE_PATH_PATTERNS) {
      if (re.test(path)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function looksLikeProductSpam(title) {
  if (!title) return false;
  for (const re of PRODUCT_TITLE_PATTERNS) {
    if (re.test(title)) return true;
  }
  return false;
}

// Detect publisher landing / section pages disguised as articles.
// Examples Perplexity has returned:
//   - "Ireland | The Times and The Sunday Times"
//   - "Politics — The Guardian"
//   - "Latest News - CNN International"
//
// Signals:
//   - Title is short and ends with " | <publisher>" or " - <publisher>"
//     where the right-hand side reads like an outlet name (3+ words,
//     contains keywords like "Times", "News", "Post", "Journal").
//   - Description is a generic site tagline ("Latest news, world news…").
const LANDING_PAGE_TITLE = /[\s—|\-–]\s*(?:The\s+)?(?:[A-Z][\w'’]*\s*){1,5}(?:Times|News|Post|Journal|Herald|Tribune|Standard|Guardian|Express|Reporter|Telegraph|Observer|Daily|Online|Network|Wire|Digest|Today|Mail|CNN|BBC|NBC|CBS|ABC|FT|WSJ|Bloomberg|Reuters|Politico|Axios|Vox)\b[^A-Za-z]*$/i;
// Titles like "Latest News", "Breaking News", "World News" — generic
// landing-page headlines that aren't actual stories.
const LANDING_PAGE_GENERIC_TITLE = /^(latest|breaking|top|today's?|world|sports?|business|politics|opinion)\s+news\b/i;
const LANDING_PAGE_DESC = /\b(latest\s+news|breaking\s+news|news\s+and\s+(?:analysis|opinion|reviews?))\b.*\b(world|business|sports|politics|opinion|reviews?)/i;

// Topic + section noun pairs. Catches things like:
//   "Lithium Archives", "News & Events", "Tech Stories", "Markets Coverage",
//   "Politics Hub", "Climate Updates", "Sports Live", "Business Latest"
const LANDING_PAGE_SECTION_TITLE = /^[A-Za-z][\w\s&'’\-,.]{0,40}\s+(archives?|index|hub|category|categories|topics?|stories|coverage|live|updates?|tag|tags|section|sections|latest|all\s+news|all\s+stories|news\s+(?:&|and)\s+events?|events?)\s*[:|\-—]?\s*$/i;

// Pure all-caps publisher / brand strings with no narrative content.
// Catches "ASEAN BERNAMA", "TRAVELANDTOURWORLD", "PHILIPPINE DAILY INQUIRER".
const LANDING_PAGE_ALLCAPS_BRAND = /^[A-Z][A-Z0-9 &.\-]{4,}$/;

// Aggregator / tooling / non-article title shapes that keep slipping
// through Perplexity's web search. Each pattern is anchored or scoped
// so it doesn't accidentally drop real news.
const AGGREGATOR_TITLE_PATTERNS = [
  /\btop\s+\d+\s+.+\s+rss\s+feeds?\b/i,            // "Top 100 Artificial Intelligence RSS Feeds"
  /\brss\s+(?:feed|database|directory|list)\b/i,    // "RSS Database", "RSS Directory"
  /\blibrary\s+guides?\b/i,                         // "MSK Library Guides"
  /\blibguides?\b/i,                                // hostname variant in title
  /\b(?:research|publications?)\s+and\s+data\s+from\b/i, // "Research and data from Pew Research Center"
  /\b(?:news\s+headlines?|headlines?)\s+from\s+.+\s+presented\s+by\b/i, // "News Headlines from X presented by MONEY FM"
  /\b(?:article|content|web)\s+scrapers?\b/i,       // "Article Scraper - Apify"
  /\bnews\s+updates?\s*:\s*latest\s+news\s+about\b/i, // "AI News Updates: Latest News About..."
  /\binput\s*[·•:]\s*/i,                            // "Input · The Straits Times Article Scraper"
  /\bbackground\s*[-—–]\s*.+\s+library\s+guides?\b/i, // "Artificial Intelligence: Background - MSK Library Guides"
  /\b(?:overview|background)\s*[-—–:|]\s*.+\s+(?:wiki|guide|resource)s?\b/i,
  /^.+\s+\|\s+(?:by|hosted on|powered by)\b/i,      // Tool/podcast title format
  // Think-tank / NGO program landing pages — title shape:
  // "<topic> Research - <Org>" or "<region> Program - <Org>".
  /\b(?:research|programs?|initiatives?|publications?)\s*[-—–|]\s*(?:[A-Z][\w'’]+\s*){1,5}(?:Center|Institute|Foundation|Council|University|Programme?|Project|Initiative|Lab)\b/i,
  /\brecent\s+publications?\b/i,                    // common landing-page heading
  // Daily-briefing / newsletter-roundup landing pages from major
  // outlets. Catches "Morning Briefing: Top stories from The Straits
  // Times on May 14", "Evening Update: Today's headlines from ...".
  /^\s*(?:morning|evening|daily|weekly|saturday|sunday|weekend|midweek)\s+(?:briefing|update|recap|roundup|wrap|brief|digest|edition|read|news)\s*[:\-–—]/i,
  /\btoday'?s\s+(?:headlines?|stories|news|briefing|top\s+stories?|dispatch|edition)\b/i,
  /^(?:this\s+week|this\s+morning|this\s+evening)\s+in\s+[A-Z]/i,  // "This Week in Tech"
  /^\s*(?:top|latest|breaking)\s+(?:news|stories|headlines?)(?:\s+(?:news|stories|headlines?))?\s+(?:from|in|across)\s+[A-Z]/i, // "Top News Headlines from..." / "Top News Headlines In Cambodia..."
  /^\s*(?:headlines?|top\s+stories?|in\s+brief)\s+(?:from|in|across)\s+[A-Z]/i,
  // Plain "News - <Org>" / "News and Events - <Org>" landing pages.
  // Anchored to start, capped on length so real headlines aren't hit.
  // Allow trailing parens like "(WHO)" / "(NGO)".
  /^\s*news\s*[-—–]\s*(?:[A-Z][\w&'’\.]+\s*){1,8}(?:\([A-Z]+\))?\s*$/i,
  /^\s*news\s+and\s+events\s*[-—–]\s*[A-Z]/i,
  /^\s*homepage\s*[-—–]\s*[A-Z]/i,
  /^\s*video\.?\s+[A-Z]/i,           // "Video. Elon Musk brings son..." — video posts, not articles
  /^\s*podcast\.?\s+[A-Z]/i,
  /^\s*[A-Z][\w\s'’]+\s+\|\s+Shaping\s+/i,  // "AI Act | Shaping Europe's digital future"
  /^\s*[A-Z][\w\s'’]+\s+(?:News|Today)\s*:\s*(?:Breaking|Latest|Live)\s+(?:Stories|News|Updates)\b/i, // "Singapore News Today: Breaking Stories & Live Updates"
  /^\s*U\.?S\.?\s+Government\s+(?:&|and)\s+Politics\s*[-—–]\s*[A-Z]/i,
  /^\s*news\s+in\s+a\s+minute\b/i,  // "News In A Minute: Tuesday, May 17"
  /^\s*frontiers\s+in\s+[A-Z]/i,     // "Frontiers in Artificial Intelligence" — academic journal landing
  // Encyclopedia / reference site landing pages.
  /\|\s*Britannica\s*$/i,            // "Tijuana | Mexico, Map, History, & Facts | Britannica"
  /^\s*[A-Z][\w\s'’]+\s*-\s*[A-Z][\w\s'’]+\s*-\s*EL\s+PAÍS\s*$/i, // "Tijuana - El Pais in English - EL PAÍS"
  // Aggregator portal "X | Breaking News & Top Stories - <Aggregator>"
  /\|\s*Breaking\s+News\s+(?:&|and)\s+Top\s+Stories\s*-\s*[A-Z]/i,
  /^[\w\s\/]+news\s+\|\s+Breaking\s+News\s+(?:&|and)\s+Top\s+Stories/i,
  // GovInfo style: "GovInfo | U.S. Government Publishing Office"
  /^\s*GovInfo\s*\|/i,
  // Daily news roundup with date: "Daily News on Southeast Asia – 20 Apr 2026"
  /^\s*daily\s+news\s+(?:on|from|in|across)\s+[A-Z]/i,
  // Index pages: "X.com news" landing
  /\b(?:news|stories|updates?)\s+\|\s+latest\b/i,
  // Academic / university press releases + event announcements.
  // Match "X University|College|School|Institute <event-verb>" anywhere
  // in the title, not just at the start — lots of intermediate words.
  /\b(?:university|college|school|institute)\s+of\s+\w+\s+(?:showcases?|hosts?|holds?|presents?|launches?|announces?|introduces?)\b/i,
  /\b(?:university|college|school|institute)\s+(?:showcases?|hosts?|holds?|presents?|launches?|announces?|introduces?)\b/i,
  /\b(?:annual|inaugural|biennial|quadrennial)\s+(?:conference|symposium|colloquium|forum|workshop|summit|gathering)\b/i,
  /\b(?:public\s+policy|administration|governance|government|policy)\s+(?:&|and)\s+\w+\s+conference\b/i,
  /\b(?:master['’]?s|bachelor['’]?s|mba|phd|doctoral|undergraduate)\s+(?:degree|programmes?|programs?)\b/i,
  /\bonline\s+(?:public\s+policy|business|law|engineering|mba|master)/i,
  /\bpublic\s+policy\s+(?:analysis\s+)?(?:challenge|competition|case\s+study)\b/i,
  /\bstudents?\s+(?:address|tackle|present|win|launch)\b/i,
  /\bcapstone\s+project\b/i,
  /\b(?:local\s+government|public\s+policy)\s+(?:policy\s+and\s+practice|practice\s+and\s+policy|theory\s+and\s+practice|capacity\s+challenges)\b/i, // academic course titles
  // Corporate product / feature launches when the title leads with
  // "Introducing X" / "Announcing X" — these are self-promo posts,
  // not journalism.
  /^(?:introducing|announcing|launching|unveiling|releasing)\s+[A-Z]/i,
  /\b(?:announces?|introduces?|launches?|unveils?|releases?|debuts?)\s+(?:new|next-?gen|advanced|comprehensive|integrated|legal\s+practice|plug-?ins?|tool|tools|feature|features|integration|integrations|api|sdk|platform)\b/i,
];

// Title is JUST a publisher / product/section name with no actual
// news content. Catches "Deloitte Insights", "Stimson Center",
// "Reuters Wire", "Politico Pro", etc. Title length capped so real
// "Stimson: <foo>" headlines aren't dropped.
const TITLE_IS_BRAND_ONLY = /^([A-Z][\w&'’]+(?:\s+[A-Z][\w&'’]+){0,4})\s+(?:Insights|Newsroom|Wire|Pro|Hub|Today|Daily|Brief|Network|Live|Watch|Magazine|Report|Online|Now|Digest)\s*$/;

// Source-name strings that, if used as the article's `source` field,
// indicate the URL slipped past the host blocklist (Perplexity often
// labels a real URL with a junk source string).
const BLOCKED_SOURCE_STRINGS = new Set([
  'facebook.com', 'facebook', 'fb.com',
  'twitter.com', 'twitter', 'x.com',
  'instagram.com', 'instagram',
  'tiktok.com', 'tiktok',
  'reddit.com', 'reddit',
  'youtube.com', 'youtube',
  'linkedin.com', 'linkedin',
  'wikipedia.org', 'wikipedia',
  'apify', 'feedspot', 'rss feedspot', 'omny fm', 'libguides mskcc',
  'pinterest.com', 'pinterest',
  'tumblr.com', 'tumblr',
]);

function looksLikeLandingPage(article) {
  if (!article) return false;
  const title = String(article.title || '').trim();
  const desc = String(article.description || '').trim();
  const source = String(article.source || '').trim();
  if (!title) return false;
  if (title.length < 90 && LANDING_PAGE_TITLE.test(title)) return true;
  if (title.length < 60 && LANDING_PAGE_GENERIC_TITLE.test(title)) return true;
  if (LANDING_PAGE_DESC.test(desc)) return true;
  // Title is a section / archive page
  if (title.length < 60 && LANDING_PAGE_SECTION_TITLE.test(title)) return true;
  // Title is just the publisher name (case-insensitive, ignoring whitespace).
  // RSS feeds sometimes emit the outlet's homepage as an item.
  if (source && title.replace(/\s+/g, ' ').toLowerCase() === source.replace(/\s+/g, ' ').toLowerCase()) return true;
  // Title is an all-caps brand-string with no spaces or sentence structure.
  // Filters TRAVELANDTOURWORLD, ASEAN BERNAMA, etc. — but skip if the title
  // is a real all-caps news headline (≥6 words, contains a verb).
  const wordCount = title.split(/\s+/).length;
  if (wordCount <= 3 && LANDING_PAGE_ALLCAPS_BRAND.test(title)) return true;
  // Aggregator / tooling / library-guide titles surfaced by Perplexity.
  for (const re of AGGREGATOR_TITLE_PATTERNS) {
    if (re.test(title)) return true;
  }
  // Title is JUST a brand + product suffix (no actual headline content).
  if (title.length < 50 && TITLE_IS_BRAND_ONLY.test(title.trim())) return true;
  // Source name itself is junk (Perplexity often labels a real URL
  // with a placeholder source like "facebook.com" / "twitter.com").
  if (source && BLOCKED_SOURCE_STRINGS.has(source.trim().toLowerCase())) return true;
  return false;
}

function isJunkArticle(article) {
  if (!article) return true;
  if (!article.title || !article.url) return true;
  if (isNonNewsUrl(article.url)) return true;
  if (looksLikeProductSpam(article.title)) return true;
  if (looksLikeLandingPage(article)) return true;
  return false;
}

module.exports = {
  isNonNewsUrl,
  looksLikeProductSpam,
  looksLikeLandingPage,
  isJunkArticle
};
