const feed = document.getElementById('feed');
const regionSelect = document.getElementById('region-select');
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const refreshBtn = document.getElementById('refresh-btn');
const feedCount = document.getElementById('feed-count');
const feedTimestamp = document.getElementById('feed-timestamp');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

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

// Convert lines starting with - into clean bullet list HTML
function formatBullets(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hasBullets = lines.some(l => l.startsWith('- ') || l.startsWith('* '));
  if (!hasBullets) return escapeHtml(text);

  let html = '';
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul class="briefing-bullets">'; inList = true; }
      html += '<li>' + escapeHtml(line.substring(2)) + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p>' + escapeHtml(line) + '</p>';
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
    feed.innerHTML = '<div class="empty-feed">Select at least one sector and source type.</div>';
    feedCount.textContent = '';
    return;
  }

  const searchVal = searchInput.value.trim();
  const loadingMsg = searchVal
    ? 'Searching for &ldquo;' + escapeHtml(searchVal) + '&rdquo;&hellip;'
    : 'Scanning RSS feeds&hellip;';
  feed.innerHTML =
    '<div class="loading-feed">' +
      '<div class="loading-pulse"></div>' +
      '<span>' + loadingMsg + '</span>' +
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
      feed.innerHTML = '<div class="empty-feed">Failed to load signals.</div>';
      return;
    }

    if (!data.articles || data.articles.length === 0) {
      feed.innerHTML = '<div class="empty-feed">No signals found. RSS feeds may be loading — try refreshing in a moment.</div>';
      return;
    }

    currentArticles = data.articles;
    governmentCaveat = data.governmentCaveat || '';
    feedCount.textContent = data.articles.length + ' signals detected';
    feedTimestamp.textContent = 'Updated ' + formatTimestamp();

    renderFeed(currentArticles);
    generateTldrs(currentArticles);

    // Generate cross-sector analysis if profile exists
    const crossProfile = getProfile();
    if (crossProfile && crossProfile.role && currentArticles.length >= 3) {
      fetchCrossSectorInsights(currentArticles, crossProfile, region);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    feed.innerHTML = '<div class="empty-feed">Connection failed. Try again.</div>';
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
      '<div class="cross-sector-loading"><div class="spinner"></div><span>Detecting patterns across sectors&hellip;</span></div>' +
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

    let html =
      '<div class="cross-sector-bubble">' +
        '<div class="cross-sector-header">' +
          '<span class="cross-sector-icon">&#9670;</span>' +
          '<span class="cross-sector-title">Cross-Sector Signals</span>' +
          '<span class="cross-sector-subtitle">Patterns detected across today\'s stories for your profile</span>' +
        '</div>';

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

      // Mechanism and takeaway as separate labeled bullets
      html += '<ul class="cross-sector-bullets">';
      if (insight.mechanism) {
        html += '<li><span class="cs-bullet-label">Why:</span> ' + escapeHtml(insight.mechanism) + '</li>';
      }
      if (insight.takeaway) {
        html += '<li><span class="cs-bullet-label">Watch:</span> ' + escapeHtml(insight.takeaway) + '</li>';
      }
      html += '</ul></div>';
    });

    html += '</div>';
    container.innerHTML = html;
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
          tldrElements[i].classList.remove('loading');
          tldrElements[i].innerHTML =
            '<div class="card-tldr-label">TL;DR</div>' +
            '<div>' + escapeHtml(summary) + '</div>';
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
      '<div class="impact-loading"><div class="spinner"></div><span>Analyzing impact&hellip;</span></div>' +
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
      html += '<div class="briefing-section"><div class="briefing-label">' + escapeHtml(s.label) + '</div><div class="briefing-text">' + formatBullets(s.text) + '</div></div>';
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
      '<div class="sentiment-loading"><div class="spinner"></div><span>Searching public discussions&hellip;</span></div>' +
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

function renderFeed(articles) {
  feed.innerHTML = '';
  tldrElements = [];

  articles.forEach((article, index) => {
    const card = document.createElement('div');
    card.className = 'card' + (article.isOfficial ? ' card-is-official' : '');

    const tldrFallback = article.description
      ? escapeHtml(article.description)
      : 'Generating summary&hellip;';

    // Badges
    let badgesHtml = '';
    if (article.score !== undefined) {
      const rel = scoreToRelevance(article.score);
      const relLower = rel.toLowerCase();
      badgesHtml += '<span class="card-relevance-badge ' + relLower + '">' + rel + '</span>';
    }
    if (article.isOfficial) {
      badgesHtml += '<span class="card-official-badge">OFFICIAL</span>';
    }
    badgesHtml += '<span class="card-region">' + escapeHtml(article.region) + '</span>';

    // Source tier label
    const tierLabel = article.sourceTier ? article.sourceTier.replace(/-/g, ' ') : '';

    card.innerHTML =
      '<div class="card-header">' +
        '<div class="card-title">' + escapeHtml(article.title) + '</div>' +
        '<div class="card-badges">' + badgesHtml + '</div>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span class="card-source">' + escapeHtml(article.source) + '</span>' +
        '<span class="card-dot"></span>' +
        '<span>' + timeAgo(article.publishedAt) + '</span>' +
        (tierLabel ? '<span class="card-dot"></span><span>' + escapeHtml(tierLabel) + '</span>' : '') +
      '</div>' +
      '<div class="card-tldr loading" data-index="' + index + '">' +
        '<div class="card-tldr-label">TL;DR</div>' +
        '<div>' + tldrFallback + '</div>' +
      '</div>';

    const tldrEl = card.querySelector('.card-tldr');
    tldrElements.push(tldrEl);

    let expanded = false;
    let briefingEl = null;

    card.addEventListener('click', async (e) => {
      if (e.target.closest('.card-link')) return;
      if (e.target.closest('.no-profile-hint button')) return;
      if (e.target.closest('.annotate-keyword')) return;

      // If clicking inside the expanded briefing/impact/sentiment area, do nothing
      // Only the card header, meta, and TL;DR should toggle expand/collapse
      if (e.target.closest('.briefing') || e.target.closest('.impact-section') || e.target.closest('.sentiment-section')) {
        return;
      }

      if (expanded) {
        if (briefingEl) { briefingEl.remove(); briefingEl = null; }
        expanded = false;
        return;
      }

      expanded = true;
      briefingEl = document.createElement('div');
      briefingEl.className = 'briefing';

      const briefingContent = document.createElement('div');
      briefingContent.innerHTML =
        '<div class="briefing-loading"><div class="spinner"></div><span>Generating intelligence briefing&hellip;</span></div>';

      const impactContent = document.createElement('div');
      const sentimentContent = document.createElement('div');

      briefingEl.appendChild(briefingContent);
      briefingEl.appendChild(impactContent);
      briefingEl.appendChild(sentimentContent);
      card.appendChild(briefingEl);

      await Promise.all([
        fetchBriefing(article, briefingContent),
        fetchImpact(article, impactContent),
        fetchSentiment(article, sentimentContent)
      ]);
    });

    feed.appendChild(card);
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
      html += '<div class="briefing-section"><div class="briefing-label">' + escapeHtml(section.label) + '</div><div class="briefing-text">' + formatBullets(section.text) + '</div></div>';
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
  const textEls = el.querySelectorAll('.briefing-text, .impact-body .briefing-text');
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

// When annotate toggle changes, highlight/unhighlight all open briefings
annotateToggle.addEventListener('change', () => {
  const briefings = document.querySelectorAll('.briefing');
  if (isAnnotateActive()) {
    briefings.forEach(b => highlightTermsInElement(b));
  } else {
    briefings.forEach(b => removeHighlightsFromElement(b));
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
  if (!parentEl.closest('.briefing') && !parentEl.closest('.impact-section') && !parentEl.closest('.sentiment-section')) return;

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
