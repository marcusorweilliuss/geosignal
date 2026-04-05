const feed = document.getElementById('feed');
const regionSelect = document.getElementById('region-select');
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const refreshBtn = document.getElementById('refresh-btn');
const feedCount = document.getElementById('feed-count');
const feedTimestamp = document.getElementById('feed-timestamp');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const filtersContainer = document.getElementById('filters-container');
const filtersToggle = document.getElementById('filters-toggle');
const filtersSummary = document.getElementById('filters-summary');

const profileBtn = document.getElementById('profile-btn');
const profileBtnText = document.getElementById('profile-btn-text');
const profileModal = document.getElementById('profile-modal');
const modalClose = document.getElementById('modal-close');
const profileSave = document.getElementById('profile-save');
const profileClear = document.getElementById('profile-clear');

// ── Profile Management ──────────────────────────────────────────

function getProfile() {
  try {
    const saved = localStorage.getItem('geosignal-profile');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

function saveProfile(profile) {
  localStorage.setItem('geosignal-profile', JSON.stringify(profile));
  updateProfileButton();
}

function clearProfile() {
  localStorage.removeItem('geosignal-profile');
  updateProfileButton();
}

function updateProfileButton() {
  const profile = getProfile();
  if (profile && profile.role) {
    profileBtnText.textContent = profile.role;
    profileBtn.classList.add('has-profile');
    profileBtn.title = `${profile.role} · ${profile.industry || 'General'} · ${profile.location || 'Global'}`;
  } else {
    profileBtnText.textContent = 'Set Profile';
    profileBtn.classList.remove('has-profile');
    profileBtn.title = 'Set up your profile for personalized impact analysis';
  }
}

function openModal() {
  const profile = getProfile();
  document.getElementById('profile-role').value = profile?.role || '';
  document.getElementById('profile-industry').value = profile?.industry || '';
  document.getElementById('profile-location').value = profile?.location || '';
  document.getElementById('profile-focus').value = profile?.focus || '';
  profileModal.classList.add('visible');
}

function closeModal() {
  profileModal.classList.remove('visible');
}

profileBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
profileModal.addEventListener('click', (e) => {
  if (e.target === profileModal) closeModal();
});

profileSave.addEventListener('click', () => {
  const role = document.getElementById('profile-role').value;
  const industry = document.getElementById('profile-industry').value;
  const location = document.getElementById('profile-location').value;
  const focus = document.getElementById('profile-focus').value;
  if (!role) { document.getElementById('profile-role').focus(); return; }
  saveProfile({ role, industry, location, focus });
  closeModal();
});

profileClear.addEventListener('click', () => {
  clearProfile();
  document.getElementById('profile-role').value = '';
  document.getElementById('profile-industry').value = '';
  document.getElementById('profile-location').value = '';
  document.getElementById('profile-focus').value = '';
  closeModal();
});

updateProfileButton();

// ── Pills & Filters ─────────────────────────────────────────────

function initPills(container) {
  container.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
    });
  });
}

initPills(sectorPills);
initPills(sourcePills);

function getActivePills(container) {
  return Array.from(container.querySelectorAll('.pill.active'))
    .map(p => p.dataset.value);
}

// Collapsible filters
filtersToggle.addEventListener('click', () => {
  filtersContainer.classList.toggle('expanded');
});

function updateFiltersSummary() {
  const region = regionSelect.value;
  const activeSectors = getActivePills(sectorPills);
  const totalSectors = sectorPills.querySelectorAll('.pill').length;

  // Build a compact summary: region + any non-default sector info
  let parts = [region];
  if (activeSectors.length === 0) {
    parts.push('no sectors');
  } else if (activeSectors.length < totalSectors) {
    parts.push(activeSectors.length + '/' + totalSectors);
  }

  filtersSummary.textContent = parts.join(' · ');
}

// Update summary when filters change
regionSelect.addEventListener('change', updateFiltersSummary);
sectorPills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(updateFiltersSummary, 0); });
sourcePills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(updateFiltersSummary, 0); });
updateFiltersSummary();

// ── Utilities ───────────────────────────────────────────────────

function timeAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function formatTimestamp() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }) + ' UTC';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Parse citation tags [Source] in a line and convert to clickable chips
function renderCitations(line, citationMap) {
  if (!citationMap) return escapeHtml(line);

  // Match [...tag...] at end of line or anywhere inline
  // Process from end so we can find the final citation
  const citationRegex = /\[([^\[\]]+)\]/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(line)) !== null) {
    const tagName = match[1].trim();
    // Only render as chip if it's in the citation map (an allowed tag)
    if (citationMap.hasOwnProperty(tagName)) {
      result += escapeHtml(line.substring(lastIndex, match.index));
      const url = citationMap[tagName];
      const chipClass = getChipClass(tagName);
      if (url) {
        result += '<a class="citation-chip ' + chipClass + '" href="' + escapeHtml(url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + escapeHtml(tagName) + '</a>';
      } else {
        result += '<span class="citation-chip ' + chipClass + '">' + escapeHtml(tagName) + '</span>';
      }
      lastIndex = match.index + match[0].length;
    }
  }
  result += escapeHtml(line.substring(lastIndex));
  return result;
}

// Determine chip color class based on tag name
function getChipClass(tagName) {
  const lower = tagName.toLowerCase();
  if (lower === 'article') return 'chip-article';
  if (lower === 'profile') return 'chip-profile';
  return 'chip-expert';
}

// Convert lines starting with - into clean bullet list HTML
function formatBullets(text, citationMap) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hasBullets = lines.some(l => l.startsWith('- ') || l.startsWith('* '));
  if (!hasBullets) return renderCitations(text, citationMap);

  let html = '';
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul class="briefing-bullets">'; inList = true; }
      html += '<li>' + renderCitations(line.substring(2), citationMap) + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + renderCitations(line, citationMap) + '</p>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

// ── Store ───────────────────────────────────────────────────────

let currentArticles = [];
let tldrElements = [];
let governmentCaveat = '';

// Convert numeric score to relevance label
function scoreToRelevance(score) {
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

// ── Fetch Stories (RSS-powered) ─────────────────────────────────

async function fetchStories() {
  const region = regionSelect.value;
  const sectors = getActivePills(sectorPills);
  const sourceTypes = getActivePills(sourcePills);

  if (sectors.length === 0 || sourceTypes.length === 0) {
    feed.innerHTML = '<div class="empty-feed">You haven\u2019t selected anything to read. Pick a sector or a source type to get started.</div>';
    feedCount.textContent = '';
    return;
  }

  const searchVal = searchInput.value.trim();
  const loadingMsg = searchVal
    ? 'Searching for &ldquo;' + escapeHtml(searchVal) + '&rdquo;'
    : 'Gathering today\u2019s stories';
  feed.innerHTML =
    '<div class="loading-feed">' +
      '<div class="loading-pulse"></div>' +
      '<span>' + loadingMsg + '&hellip;</span>' +
    '</div>';
  feedCount.textContent = '';
  feedTimestamp.textContent = '';

  try {
    const profile = getProfile();
    const searchQuery = searchInput.value.trim();
    const params = new URLSearchParams({
      region,
      sectors: sectors.join(','),
      sourceTypes: sourceTypes.join(',')
    });
    if (profile) {
      params.set('profile', JSON.stringify(profile));
    }
    if (searchQuery) {
      params.set('search', searchQuery);
    }

    const res = await fetch('/api/news?' + params);
    const data = await res.json();

    if (!res.ok) {
      feed.innerHTML = '<div class="empty-feed">Something went wrong while fetching the feed. Give it another moment and try again.</div>';
      return;
    }

    if (!data.articles || data.articles.length === 0) {
      feed.innerHTML = '<div class="empty-feed">Nothing matches this combination just yet. Try a wider region, turn on more sectors, or clear your search to see what\u2019s moving.</div>';
      return;
    }

    currentArticles = data.articles;
    governmentCaveat = data.governmentCaveat || '';
    feedCount.textContent = data.articles.length + ' signals';
    feedTimestamp.textContent = formatTimestamp();

    renderFeed(currentArticles);
    generateTldrs(currentArticles);

    // Generate cross-sector analysis if profile exists
    const crossProfile = getProfile();
    if (crossProfile && crossProfile.role && currentArticles.length >= 3) {
      fetchCrossSectorInsights(currentArticles, crossProfile, region);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    feed.innerHTML = '<div class="empty-feed">Couldn\u2019t reach the feed. Check your connection and try again.</div>';
  }
}

// ── Cross-Sector Analysis ───────────────────────────────────────

async function fetchCrossSectorInsights(articles, profile, region) {
  // Insert container at top of feed
  let container = document.getElementById('cross-sector-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cross-sector-container';
    feed.insertBefore(container, feed.firstChild);
  }

  container.innerHTML =
    '<div class="cross-sector-bubble loading">' +
      '<div class="cross-sector-header">' +
        '<span class="cross-sector-icon">&#9670;</span>' +
        '<span class="cross-sector-title">Cross-Sector Signals</span>' +
      '</div>' +
      '<div class="cross-sector-loading"><div class="spinner"></div><span>Reading across the day\u2019s stories&hellip;</span></div>' +
    '</div>';

  try {
    const res = await fetch('/api/cross-sector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: articles.slice(0, 15).map(a => ({ title: a.title, source: a.source })),
        profile,
        region
      })
    });

    const data = await res.json();

    if (!data.insights || data.insights.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Map insight types to colors and short labels
    const typeStyles = {
      'CAUSAL CHAIN': { cls: 'type-causal', label: 'Causal Chain' },
      'SHARED ENTITY': { cls: 'type-entity', label: 'Shared Entity' },
      'SECOND-ORDER EFFECT': { cls: 'type-second-order', label: 'Second-Order Effect' },
      'CONTRADICTION': { cls: 'type-contradiction', label: 'Contradiction' }
    };

    const count = data.insights.length;
    let html =
      '<div class="cross-sector-bubble collapsed">' +
        '<button class="cross-sector-header" type="button" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
          '<span class="cross-sector-icon">&#9670;</span>' +
          '<span class="cross-sector-title">Cross-Sector Signals</span>' +
          '<span class="cross-sector-subtitle">' + count + ' pattern' + (count > 1 ? 's' : '') + ' detected — click to expand</span>' +
          '<svg class="cross-sector-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
        '</button>' +
        '<div class="cross-sector-body">';

    data.insights.forEach(insight => {
      const style = typeStyles[insight.type] || { cls: 'type-default', label: insight.type };
      html +=
        '<div class="cross-sector-pattern">' +
          '<div class="cross-sector-pattern-header">' +
            '<span class="cross-sector-type-badge ' + style.cls + '">' + escapeHtml(style.label) + '</span>' +
            '<span class="cross-sector-pattern-title">' + escapeHtml(insight.topic) + '</span>' +
          '</div>';

      if (insight.stories) {
        html += '<div class="cross-sector-stories">Connecting: ' + escapeHtml(insight.stories) + '</div>';
      }

      // Show the arrow chain only for causal type
      if (insight.chain) {
        html += '<div class="cross-sector-chain">' + escapeHtml(insight.chain) + '</div>';
      }

      // Mechanism and takeaway as separate labeled bullets with citation chips
      html += '<ul class="cross-sector-bullets">';
      if (insight.mechanism) {
        html += '<li><span class="cs-bullet-label">Why:</span> ' + renderCitations(insight.mechanism, data.citationMap) + '</li>';
      }
      if (insight.takeaway) {
        html += '<li><span class="cs-bullet-label">Watch:</span> ' + renderCitations(insight.takeaway, data.citationMap) + '</li>';
      }
      html += '</ul></div>';
    });

    html += '</div></div>'; // close cross-sector-body and cross-sector-bubble
    container.innerHTML = html;

    // Auto-highlight annotate terms if mode is on
    if (isAnnotateActive && isAnnotateActive()) {
      highlightTermsInElement(container);
    }
  } catch (err) {
    console.error('Cross-sector error:', err);
    container.innerHTML = '';
  }
}

// ── TL;DR Generation ────────────────────────────────────────────

async function generateTldrs(articles) {
  try {
    const res = await fetch('/api/tldr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: articles.map(a => ({
          title: a.title,
          description: a.description,
          isOfficial: a.isOfficial
        }))
      })
    });

    const data = await res.json();

    if (data.summaries && data.summaries.length > 0) {
      data.summaries.forEach((summary, i) => {
        if (tldrElements[i] && summary) {
          let cleaned = summary.trim();
          if (cleaned && !/[.!?]$/.test(cleaned)) {
            cleaned += '.';
          }
          tldrElements[i].classList.remove('loading');
          tldrElements[i].textContent = cleaned;
        }
      });
    }
  } catch (err) {
    console.error('TL;DR generation error:', err);
  }
}

// ── Impact Analysis ─────────────────────────────────────────────

async function fetchImpact(article, container) {
  const profile = getProfile();

  if (!profile || !profile.role) {
    container.innerHTML =
      '<div class="no-profile-hint">' +
        '<span>Set up your profile to see how this story impacts you personally.</span>' +
        '<button onclick="document.getElementById(\'profile-btn\').click()">Set Profile</button>' +
      '</div>';
    return;
  }

  container.innerHTML =
    '<div class="impact-section">' +
      '<div class="impact-header"><span class="impact-title">Personalized Impact</span></div>' +
      '<div class="impact-loading"><div class="spinner"></div><span>Thinking about how this lands for you&hellip;</span></div>' +
    '</div>';

  try {
    const res = await fetch('/api/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: article.title, source: article.source,
        description: article.description, content: article.content,
        profile, url: article.url, region: article.region
      })
    });

    const data = await res.json();

    if (!res.ok || !data.impact) {
      container.innerHTML = '<div class="impact-section"><div class="briefing-error">Could not generate impact analysis. Try again in a moment.</div></div>';
      return;
    }

    const relevance = (data.relevance || 'MEDIUM').toLowerCase();
    const sections = parseImpact(data.impact);

    let html =
      '<div class="impact-section">' +
        '<div class="impact-header">' +
          '<span class="impact-title">How This Impacts You</span>' +
          '<span class="impact-badge ' + relevance + '">' + data.relevance + ' Relevance</span>' +
        '</div><div class="impact-body">';

    sections.forEach(s => {
      html += '<div class="briefing-section"><div class="briefing-label">' + escapeHtml(s.label) + '</div><div class="briefing-text">' + formatBullets(s.text, data.citationMap) + '</div></div>';
    });

    html += '</div></div>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Impact analysis error:', err);
    container.innerHTML = '<div class="impact-section"><div class="briefing-error">Failed to generate impact analysis.</div></div>';
  }
}

function parseImpact(text) {
  const labels = ['RELEVANCE', 'IMPACT SUMMARY', 'WHAT TO WATCH'];
  const sections = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 'RELEVANCE') continue;
    const label = labels[i];
    const nextLabel = labels[i + 1];
    const match = text.match(new RegExp(label + '[:\\s]*', 'i'));
    if (!match) continue;
    const startIdx = match.index + match[0].length;
    let endIdx = text.length;
    if (nextLabel) {
      const nextMatch = text.match(new RegExp(nextLabel + '[:\\s]*', 'i'));
      if (nextMatch) endIdx = nextMatch.index;
    }
    const sectionText = text.substring(startIdx, endIdx).trim();
    if (sectionText) sections.push({ label, text: sectionText });
  }
  if (sections.length === 0) {
    const cleaned = text.replace(/RELEVANCE:\s*(HIGH|MEDIUM|LOW)\s*/i, '').trim();
    if (cleaned) sections.push({ label: 'IMPACT SUMMARY', text: cleaned });
  }
  return sections;
}

// ── Public Discourse (Reddit + Bluesky) ─────────────────────────

async function fetchSentiment(article, container) {
  container.innerHTML =
    '<div class="sentiment-section">' +
      '<div class="sentiment-header">' +
        '<span class="sentiment-title">Public Discourse</span>' +
      '</div>' +
      '<div class="sentiment-loading"><div class="spinner"></div><span>Listening to what people are saying&hellip;</span></div>' +
    '</div>';

  // Extract key terms from headline for better search
  const stopWords = ['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','has','have','had','not','as','its','says','said','new','over','after','will','could','may','been','into','about','more','than'];
  const keywords = article.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w))
    .slice(0, 4);
  const topic = keywords.join(' ');

  try {
    // Fetch Reddit and Bluesky in parallel
    const [redditRes, blueskyRes] = await Promise.all([
      fetch('/api/sentiment/reddit?topic=' + encodeURIComponent(topic)).then(r => r.json()).catch(e => { console.log('Reddit failed:', e); return { posts: [], error: true }; }),
      fetch('/api/sentiment/bluesky?topic=' + encodeURIComponent(topic)).then(r => r.json()).catch(e => { console.log('Bluesky failed:', e); return { posts: [], error: true }; })
    ]);

    const redditPosts = redditRes.posts || [];
    const blueskyPosts = blueskyRes.posts || [];

    if (redditPosts.length === 0 && blueskyPosts.length === 0) {
      const hasError = redditRes.error || blueskyRes.error;
      container.innerHTML =
        '<div class="sentiment-section">' +
          '<div class="sentiment-header"><span class="sentiment-title">Public Discourse</span></div>' +
          '<div class="sentiment-empty">' +
            (hasError ? 'Could not reach Reddit/Bluesky. Check your internet connection or try again.' : 'No public discussions found for "' + escapeHtml(topic) + '".') +
          '</div>' +
        '</div>';
      return;
    }

    let html =
      '<div class="sentiment-section">' +
        '<div class="sentiment-header"><span class="sentiment-title">Public Discourse</span></div>';

    // Reddit results
    if (redditPosts.length > 0) {
      html += '<div class="sentiment-platform">' +
        '<div class="sentiment-platform-label">Reddit</div>' +
        '<div class="sentiment-platform-note">' + escapeHtml(redditRes.note || '') + '</div>';

      redditPosts.forEach(post => {
        html +=
          '<a class="sentiment-post" href="' + escapeHtml(post.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            '<div class="sentiment-post-title">' + escapeHtml(post.title) + '</div>' +
            '<div class="sentiment-post-meta">' +
              '<span class="sentiment-subreddit">' + escapeHtml(post.subreddit) + '</span>' +
              '<span class="sentiment-dot"></span>' +
              '<span>' + post.score + ' pts</span>' +
              '<span class="sentiment-dot"></span>' +
              '<span>' + post.numComments + ' comments</span>' +
            '</div>' +
          '</a>';
      });

      html += '</div>';
    }

    // Bluesky results
    if (blueskyPosts.length > 0) {
      html += '<div class="sentiment-platform">' +
        '<div class="sentiment-platform-label">Bluesky</div>' +
        '<div class="sentiment-platform-note">' + escapeHtml(blueskyRes.note || '') + '</div>';

      blueskyPosts.forEach(post => {
        html +=
          '<a class="sentiment-post" href="' + escapeHtml(post.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            '<div class="sentiment-post-text">' + escapeHtml(post.text) + '</div>' +
            '<div class="sentiment-post-meta">' +
              '<span class="sentiment-username">@' + escapeHtml(post.username) + '</span>' +
              '<span class="sentiment-dot"></span>' +
              '<span>' + post.likes + ' likes</span>' +
              '<span class="sentiment-dot"></span>' +
              '<span>' + post.reposts + ' reposts</span>' +
            '</div>' +
          '</a>';
      });

      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Sentiment fetch error:', err);
    container.innerHTML =
      '<div class="sentiment-section">' +
        '<div class="sentiment-header"><span class="sentiment-title">Public Discourse</span></div>' +
        '<div class="sentiment-empty">Could not load public discussions.</div>' +
      '</div>';
  }
}

// ── Render Feed ─────────────────────────────────────────────────

// Track which cards the user has expanded (for "read" state)
const readCards = new Set();

// Group articles by recency for visual hierarchy
function groupArticlesByTime(articles) {
  const now = Date.now();
  const groups = { breaking: [], today: [], week: [] };
  articles.forEach(a => {
    const pub = new Date(a.publishedAt).getTime();
    const hoursAgo = (now - pub) / (1000 * 60 * 60);
    if (hoursAgo <= 3) groups.breaking.push(a);
    else if (hoursAgo <= 24) groups.today.push(a);
    else groups.week.push(a);
  });
  return groups;
}

function renderFeed(articles) {
  feed.innerHTML = '';
  tldrElements = [];

  const groups = groupArticlesByTime(articles);
  let globalIndex = 0;

  const groupLabels = [
    { key: 'breaking', label: 'Breaking', hint: 'Last 3 hours' },
    { key: 'today', label: 'Today', hint: 'Last 24 hours' },
    { key: 'week', label: 'Earlier', hint: 'Past week' }
  ];

  groupLabels.forEach(({ key, label, hint }) => {
    const groupArticles = groups[key];
    if (groupArticles.length === 0) return;

    // Section header
    const section = document.createElement('div');
    section.className = 'feed-section';
    section.innerHTML =
      '<div class="feed-section-header">' +
        '<span class="feed-section-label">' + label + '</span>' +
        '<span class="feed-section-count">' + groupArticles.length + '</span>' +
      '</div>';
    feed.appendChild(section);

    groupArticles.forEach(article => {
      const index = globalIndex++;
      const card = document.createElement('article');

      let relevanceClass = '';
      if (article.score !== undefined) {
        const rel = scoreToRelevance(article.score).toLowerCase();
        relevanceClass = ' relevance-' + rel;
      }
      card.className = 'card' + relevanceClass + (article.isOfficial ? ' card-is-official' : '');
      card.setAttribute('tabindex', '0');
      card.dataset.cardIndex = index;

      const tldrFallback = article.description ? escapeHtml(article.description) : '';
      const officialBadge = article.isOfficial ? '<span class="card-official-badge">Official</span>' : '';
      const regionPill = article.region ? '<span class="card-region">' + escapeHtml(article.region) + '</span>' : '';
      const tierLabel = article.sourceTier
        ? article.sourceTier.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : '';

      const badges = (officialBadge || regionPill)
        ? '<div class="card-badges">' + officialBadge + regionPill + '</div>'
        : '';

      card.innerHTML =
        '<div class="card-header">' +
          '<div class="card-title">' + escapeHtml(article.title) + '</div>' +
          badges +
        '</div>' +
        '<div class="card-meta">' +
          '<span class="card-source">' + escapeHtml(article.source) + '</span>' +
          '<span class="card-dot"></span>' +
          '<span>' + timeAgo(article.publishedAt) + '</span>' +
          (tierLabel ? '<span class="card-dot card-tier-meta"></span><span class="card-tier-meta">' + escapeHtml(tierLabel) + '</span>' : '') +
        '</div>' +
        '<div class="card-tldr loading" data-index="' + index + '">' + tldrFallback + '</div>';

      const tldrEl = card.querySelector('.card-tldr');
      tldrElements.push(tldrEl);

      const articleId = article.url || article.title;
      if (readCards.has(articleId)) {
        card.classList.add('card-read');
      }

      let expanded = false;
      let briefingEl = null;

      const toggleExpand = async () => {
        if (expanded) {
          if (briefingEl) { briefingEl.remove(); briefingEl = null; }
          expanded = false;
          return;
        }

        expanded = true;
        card.classList.add('card-expanded', 'card-read');
        readCards.add(articleId);

        briefingEl = document.createElement('div');
        briefingEl.className = 'briefing';

        const briefingContent = document.createElement('div');
        briefingContent.innerHTML =
          '<div class="briefing-loading"><div class="spinner"></div><span>Composing the briefing&hellip;</span></div>' +
          '<div class="skeleton-block">' +
            '<div class="skeleton-shimmer skeleton-line long"></div>' +
            '<div class="skeleton-shimmer skeleton-line medium"></div>' +
            '<div class="skeleton-shimmer skeleton-line short"></div>' +
          '</div>';

        // Progressive disclosure: Impact and Discourse are collapsed by default
        const moreSections = document.createElement('div');
        moreSections.className = 'more-sections';
        moreSections.innerHTML =
          '<button class="more-section-toggle" data-section="impact" type="button">' +
            '<span class="more-section-icon">&#9670;</span>' +
            '<span class="more-section-label">How This Impacts You</span>' +
            '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
          '</button>' +
          '<div class="more-section-body" data-section-body="impact"></div>' +
          '<button class="more-section-toggle" data-section="sentiment" type="button">' +
            '<span class="more-section-icon">&#9671;</span>' +
            '<span class="more-section-label">Public Discourse</span>' +
            '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
          '</button>' +
          '<div class="more-section-body" data-section-body="sentiment"></div>';

        briefingEl.appendChild(briefingContent);
        briefingEl.appendChild(moreSections);
        card.appendChild(briefingEl);

        // Track which sections have been loaded so we don't refetch
        const loaded = { impact: false, sentiment: false };

        // Wire up the toggles
        moreSections.querySelectorAll('.more-section-toggle').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const section = btn.dataset.section;
            const bodyEl = moreSections.querySelector('[data-section-body="' + section + '"]');
            const isOpen = btn.classList.contains('open');

            if (isOpen) {
              btn.classList.remove('open');
              bodyEl.classList.remove('open');
              return;
            }

            btn.classList.add('open');
            bodyEl.classList.add('open');

            // Lazy load on first expand
            if (!loaded[section]) {
              loaded[section] = true;
              if (section === 'impact') {
                await fetchImpact(article, bodyEl);
              } else if (section === 'sentiment') {
                await fetchSentiment(article, bodyEl);
              }
            }
          });
        });

        // Smooth scroll the card into view
        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        // Only fetch the briefing immediately — Impact and Discourse lazy-load on click
        await fetchBriefing(article, briefingContent);
      };

      card.addEventListener('click', async (e) => {
        if (e.target.closest('.card-link')) return;
        if (e.target.closest('.no-profile-hint button')) return;
        if (e.target.closest('.annotate-keyword')) return;
        if (e.target.closest('.more-section-toggle')) return;
        if (e.target.closest('.briefing') || e.target.closest('.impact-section') || e.target.closest('.sentiment-section')) return;
        toggleExpand();
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleExpand();
        }
      });

      feed.appendChild(card);
    });
  });
}

// ── Briefing Fetch ──────────────────────────────────────────────

async function fetchBriefing(article, container) {
  try {
    const res = await fetch('/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: article.title, source: article.source,
        description: article.description, content: article.content,
        isOfficial: article.isOfficial, url: article.url,
        region: article.region
      })
    });

    const data = await res.json();

    if (!res.ok || !data.briefing) {
      container.innerHTML = '<div class="briefing-error">Could not generate briefing. Try again in a moment.</div>';
      return;
    }

    let html = '';

    // Government caveat banner
    if (article.isOfficial && governmentCaveat) {
      html += '<div class="government-caveat">' + escapeHtml(governmentCaveat) + '</div>';
    }

    // Source quality indicator
    const indicators = [];
    if (data.fullTextAvailable) indicators.push('Full article analysed');
    if (data.expertSources && data.expertSources.length > 0) indicators.push(data.expertSources.length + ' think tank source' + (data.expertSources.length > 1 ? 's' : '') + ' referenced');
    if (indicators.length > 0) {
      html += '<div class="briefing-quality-note">' + indicators.join(' · ') + '</div>';
    }

    const sections = parseBriefing(data.briefing, article.isOfficial);
    html += '<div class="briefing-content">';

    sections.forEach(section => {
      html += '<div class="briefing-section"><div class="briefing-label">' + escapeHtml(section.label) + '</div><div class="briefing-text">' + formatBullets(section.text, data.citationMap) + '</div></div>';
    });

    // Expert source links from think tank cross-referencing
    if (data.expertSources && data.expertSources.length > 0) {
      html += '<div class="expert-sources">';
      html += '<div class="briefing-label">Sources Referenced</div>';
      data.expertSources.forEach(es => {
        html += '<a class="expert-source-link" href="' + escapeHtml(es.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
          escapeHtml(es.source) + ': ' + escapeHtml(es.title) + ' &rarr;</a>';
      });
      html += '</div>';
    }

    if (article.url) {
      html += '<a class="card-link" href="' + escapeHtml(article.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Read original source &rarr;</a>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Auto-highlight terms when annotate mode is on
    if (isAnnotateActive()) {
      highlightTermsInElement(container);
    }
  } catch (err) {
    console.error('Briefing error:', err);
    container.innerHTML = '<div class="briefing-error">Failed to generate briefing.</div>';
  }
}

function parseBriefing(text, isOfficial) {
  const standardLabels = ['WHAT HAPPENED', 'WHAT LED TO THIS', 'WHAT REGIONAL EXPERTS ARE SAYING', 'WHY THIS MATTERS'];
  const officialLabels = ['WHAT HAPPENED', 'WHAT LED TO THIS', 'WHAT THE GOVERNMENT IS CLAIMING AND ITS LIKELY STRATEGIC INTENT', 'WHY THIS MATTERS'];
  const labels = isOfficial ? officialLabels : standardLabels;
  const sections = [];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const nextLabel = labels[i + 1];
    const match = text.match(new RegExp(label + '[:\\s]*', 'i'));
    if (!match) continue;
    const startIdx = match.index + match[0].length;
    let endIdx = text.length;
    if (nextLabel) {
      const nextMatch = text.match(new RegExp(nextLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:\\s]*', 'i'));
      if (nextMatch) endIdx = nextMatch.index;
    }
    const sectionText = text.substring(startIdx, endIdx).trim();
    if (sectionText) sections.push({ label, text: sectionText });
  }

  if (sections.length === 0) {
    sections.push({ label: 'BRIEFING', text: text.trim() });
  }

  return sections;
}

// ── Annotate Mode ───────────────────────────────────────────────

const annotateToggle = document.getElementById('annotate-toggle');
const annotatePopup = document.getElementById('annotate-popup');
const annotatePopupBody = document.getElementById('annotate-popup-body');
const annotatePopupClose = document.getElementById('annotate-popup-close');

const annotateCache = {};

// Terms that non-experts might need explained — auto-highlighted when annotate is on
const ANNOTATE_TERMS = [
  // Geopolitics & IR
  'sanctions', 'bilateral', 'multilateral', 'sovereignty', 'annexation', 'territorial integrity',
  'non-aligned', 'deterrence', 'escalation', 'de-escalation', 'proxy war', 'frozen conflict',
  'diplomatic immunity', 'ceasefire', 'armistice', 'détente', 'rapprochement', 'realpolitik',
  'soft power', 'hard power', 'balance of power', 'hegemon', 'hegemony', 'sphere of influence',
  'containment', 'appeasement', 'brinkmanship', 'geopolitical', 'non-proliferation', 'NATO',
  'ASEAN', 'BRICS', 'G7', 'G20', 'UN Security Council', 'veto power', 'peacekeeping',
  'humanitarian corridor', 'no-fly zone', 'freedom of navigation', 'exclusive economic zone',
  'maritime dispute', 'belt and road', 'quad', 'AUKUS', 'five eyes', 'two-state solution',
  'right of return', 'occupied territories', 'settler colonialism', 'regime change',
  'failed state', 'rogue state', 'axis of resistance', 'abraham accords',
  // Economics & Finance
  'GDP', 'quantitative easing', 'fiscal policy', 'monetary policy', 'inflation', 'deflation',
  'stagflation', 'recession', 'austerity', 'stimulus', 'bond yields', 'sovereign debt',
  'default', 'IMF', 'World Bank', 'trade deficit', 'trade surplus', 'current account',
  'tariff', 'subsidy', 'embargo', 'capital flight', 'foreign direct investment', 'FDI',
  'reserve currency', 'petrodollar', 'de-dollarisation', 'central bank', 'interest rate',
  'basis points', 'yield curve', 'credit rating', 'forex', 'devaluation', 'supply chain',
  'decoupling', 'reshoring', 'nearshoring', 'PPP', 'per capita', 'gini coefficient',
  // Defence & Security
  'ICBM', 'hypersonic', 'nuclear triad', 'first strike', 'second strike', 'MAD',
  'mutual assured destruction', 'arms race', 'defence spending', 'military-industrial complex',
  'counterinsurgency', 'COIN', 'asymmetric warfare', 'hybrid warfare', 'cyber warfare',
  'intelligence community', 'SIGINT', 'HUMINT', 'covert operations', 'drone strike',
  'rules of engagement', 'force projection', 'aircraft carrier', 'theatre', 'sortie',
  // Climate & Energy
  'COP', 'paris agreement', 'net zero', 'carbon neutral', 'carbon credit', 'carbon tax',
  'emissions trading', 'renewable energy', 'fossil fuels', 'energy transition', 'energy security',
  'LNG', 'OPEC', 'peak oil', 'stranded assets', 'green bond', 'ESG', 'just transition',
  // Tech
  'semiconductor', 'chip fab', 'AI regulation', 'artificial general intelligence', 'AGI',
  'surveillance state', 'data sovereignty', 'cyber espionage', 'zero-day', 'deepfake',
  'disinformation', 'information warfare', 'tech decoupling', 'rare earth minerals',
  // Society
  'diaspora', 'refugee', 'internally displaced', 'asylum', 'extradition', 'rule of law',
  'authoritarian', 'autocracy', 'democracy index', 'press freedom', 'civil society',
  'ethnic cleansing', 'genocide', 'crimes against humanity', 'ICC', 'ICJ',
  'universal jurisdiction', 'state of emergency', 'martial law', 'coup', 'junta'
];

function isAnnotateActive() {
  return annotateToggle && annotateToggle.checked;
}

function hideAnnotatePopup() {
  annotatePopup.classList.remove('visible');
}

function showAnnotatePopup(x, y) {
  annotatePopup.classList.add('visible');
  const popupWidth = 340;
  const popupHeight = 120;
  let left = x + 10;
  let top = y + 10;
  if (left + popupWidth > window.innerWidth - 20) left = window.innerWidth - popupWidth - 20;
  if (top + popupHeight > window.innerHeight - 20) top = y - popupHeight - 10;
  if (left < 10) left = 10;
  if (top < 10) top = 10;
  annotatePopup.style.left = left + 'px';
  annotatePopup.style.top = top + 'px';
}

function getBriefingContext(el) {
  let card = el;
  while (card && !card.classList?.contains('card')) card = card.parentElement;
  if (!card) return { headline: '', briefingText: '' };
  const titleEl = card.querySelector('.card-title');
  const briefingEl = card.querySelector('.briefing-content');
  return {
    headline: titleEl ? titleEl.textContent : '',
    briefingText: briefingEl ? briefingEl.textContent : ''
  };
}

async function explainTerm(term, headline, briefingText, x, y) {
  const cacheKey = (term + '||' + headline).toLowerCase();
  if (annotateCache[cacheKey]) {
    annotatePopupBody.innerHTML =
      '<div class="annotate-popup-term">' + escapeHtml(term) + '</div>' +
      '<div class="annotate-popup-text">' + escapeHtml(annotateCache[cacheKey]) + '</div>';
    showAnnotatePopup(x, y);
    return;
  }

  annotatePopupBody.innerHTML =
    '<div class="annotate-popup-term">' + escapeHtml(term) + '</div>' +
    '<div class="annotate-popup-loading"><div class="spinner"></div><span>Explaining&hellip;</span></div>';
  showAnnotatePopup(x, y);

  try {
    const res = await fetch('/api/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, headline, briefingText })
    });
    const data = await res.json();
    if (data.explanation) {
      annotateCache[cacheKey] = data.explanation;
      annotatePopupBody.innerHTML =
        '<div class="annotate-popup-term">' + escapeHtml(term) + '</div>' +
        '<div class="annotate-popup-text">' + escapeHtml(data.explanation) + '</div>';
    } else {
      annotatePopupBody.innerHTML =
        '<div class="annotate-popup-term">' + escapeHtml(term) + '</div>' +
        '<div class="annotate-popup-text" style="color:#999;">Could not explain this term.</div>';
    }
  } catch {
    annotatePopupBody.innerHTML =
      '<div class="annotate-popup-term">' + escapeHtml(term) + '</div>' +
      '<div class="annotate-popup-text" style="color:#999;">Failed to load explanation.</div>';
  }
}

// Auto-highlight known terms in briefing text elements
function highlightTermsInElement(el) {
  if (!el) return;
  const textEls = el.querySelectorAll('.briefing-text, .impact-body .briefing-text, .cross-sector-pattern-title, .cross-sector-chain, .cross-sector-bullets li, .cross-sector-stories');
  textEls.forEach(textEl => {
    let html = textEl.innerHTML;
    // Only process if no highlights yet
    if (html.includes('annotate-keyword')) return;

    // Sort terms by length (longest first) to avoid partial matches
    const sorted = [...ANNOTATE_TERMS].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      const regex = new RegExp('\\b(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi');
      html = html.replace(regex, '<span class="annotate-keyword" data-term="$1">$1</span>');
    }
    textEl.innerHTML = html;
  });
}

// Remove highlights from an element
function removeHighlightsFromElement(el) {
  if (!el) return;
  const keywords = el.querySelectorAll('.annotate-keyword');
  keywords.forEach(kw => {
    const text = document.createTextNode(kw.textContent);
    kw.parentNode.replaceChild(text, kw);
  });
}

// When annotate toggle changes, highlight/unhighlight all open briefings + cross-sector
annotateToggle.addEventListener('change', () => {
  const targets = [
    ...document.querySelectorAll('.briefing'),
    ...document.querySelectorAll('.cross-sector-bubble')
  ];
  if (isAnnotateActive()) {
    targets.forEach(t => highlightTermsInElement(t));
  } else {
    targets.forEach(t => removeHighlightsFromElement(t));
    hideAnnotatePopup();
  }
});

// Click handler for highlighted keywords
document.addEventListener('click', (e) => {
  const keyword = e.target.closest('.annotate-keyword');
  if (!keyword || !isAnnotateActive()) return;

  e.stopPropagation();
  const term = keyword.dataset.term || keyword.textContent;
  const { headline, briefingText } = getBriefingContext(keyword);
  const rect = keyword.getBoundingClientRect();
  explainTerm(term, headline, briefingText, rect.left, rect.bottom + window.scrollY);
});

// Also support text selection for terms not in the dictionary
document.addEventListener('mouseup', (e) => {
  if (!isAnnotateActive()) return;
  if (e.target.closest('.annotate-popup')) return;
  if (e.target.closest('.annotate-toggle')) return;
  if (e.target.closest('.annotate-keyword')) return; // handled by click

  const selection = window.getSelection();
  const term = selection.toString().trim();
  if (term.length < 2 || term.length > 80) return;

  const anchorNode = selection.anchorNode;
  if (!anchorNode) return;
  const parentEl = anchorNode.parentElement || anchorNode;
  if (!parentEl.closest('.briefing') && !parentEl.closest('.impact-section') && !parentEl.closest('.sentiment-section') && !parentEl.closest('.cross-sector-bubble')) return;

  const { headline, briefingText } = getBriefingContext(anchorNode);
  explainTerm(term, headline, briefingText, e.clientX, e.clientY);
});

annotatePopupClose.addEventListener('click', (e) => {
  e.stopPropagation();
  hideAnnotatePopup();
});

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.annotate-popup') && !e.target.closest('.annotate-keyword')) {
    hideAnnotatePopup();
  }
});

// ── Event Listeners ─────────────────────────────────────────────

refreshBtn.addEventListener('click', fetchStories);
regionSelect.addEventListener('change', fetchStories);

// Keyboard navigation: j/k to move, Enter to expand, / to search, Esc to collapse
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';

  // Slash opens search from anywhere
  if (e.key === '/' && !isTyping) {
    e.preventDefault();
    searchInput.focus();
    return;
  }

  if (isTyping) return;

  // j/k to navigate cards
  if (e.key === 'j' || e.key === 'k') {
    e.preventDefault();
    const cards = Array.from(document.querySelectorAll('.card'));
    if (cards.length === 0) return;
    const current = document.activeElement?.classList?.contains('card') ? document.activeElement : null;
    let idx = current ? cards.indexOf(current) : -1;
    if (e.key === 'j') idx = Math.min(cards.length - 1, idx + 1);
    else idx = Math.max(0, idx - 1);
    cards[idx].focus();
    cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Esc collapses any expanded card
  if (e.key === 'Escape') {
    const expanded = document.querySelector('.card.card-expanded');
    if (expanded) expanded.click();
    hideAnnotatePopup();
  }
});

// Search: trigger on Enter key
let searchDebounce = null;
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    fetchStories();
  }
});

// Show/hide clear button
searchInput.addEventListener('input', () => {
  searchClear.style.display = searchInput.value.length > 0 ? 'block' : 'none';
});

// Clear search
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  fetchStories();
});

fetchStories();
