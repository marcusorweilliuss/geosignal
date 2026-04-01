const feed = document.getElementById('feed');
const regionSelect = document.getElementById('region-select');
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const refreshBtn = document.getElementById('refresh-btn');
const feedCount = document.getElementById('feed-count');
const feedTimestamp = document.getElementById('feed-timestamp');

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

// ── Store ───────────────────────────────────────────────────────

let currentArticles = [];
let tldrElements = [];
let governmentCaveat = '';

// Convert numeric score to relevance label
function scoreToRelevance(score) {
  if (score >= 40) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
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

  feed.innerHTML =
    '<div class="loading-feed">' +
      '<div class="loading-pulse"></div>' +
      '<span>Scanning RSS feeds&hellip;</span>' +
    '</div>';
  feedCount.textContent = '';
  feedTimestamp.textContent = '';

  try {
    const profile = getProfile();
    const params = new URLSearchParams({
      region,
      sectors: sectors.join(','),
      sourceTypes: sourceTypes.join(',')
    });
    if (profile) {
      params.set('profile', JSON.stringify(profile));
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
  } catch (err) {
    console.error('Fetch error:', err);
    feed.innerHTML = '<div class="empty-feed">Connection failed. Try again.</div>';
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
        profile, url: article.url
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
      html += '<div class="briefing-section"><div class="briefing-label">' + escapeHtml(s.label) + '</div><div class="briefing-text">' + escapeHtml(s.text) + '</div></div>';
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

      briefingEl.appendChild(briefingContent);
      briefingEl.appendChild(impactContent);
      card.appendChild(briefingEl);

      await Promise.all([
        fetchBriefing(article, briefingContent),
        fetchImpact(article, impactContent)
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
        isOfficial: article.isOfficial, url: article.url
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

    const sections = parseBriefing(data.briefing, article.isOfficial);
    html += '<div class="briefing-content">';

    sections.forEach(section => {
      html += '<div class="briefing-section"><div class="briefing-label">' + escapeHtml(section.label) + '</div><div class="briefing-text">' + escapeHtml(section.text) + '</div></div>';
    });

    if (article.url) {
      html += '<a class="card-link" href="' + escapeHtml(article.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Read original source &rarr;</a>';
    }

    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Briefing error:', err);
    container.innerHTML = '<div class="briefing-error">Failed to generate briefing.</div>';
  }
}

function parseBriefing(text, isOfficial) {
  const standardLabels = ['WHAT HAPPENED', 'WHAT LED TO THIS', 'WHAT EXPERTS ARE SAYING', 'WHY THIS MATTERS'];
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

// ── Event Listeners ─────────────────────────────────────────────

refreshBtn.addEventListener('click', fetchStories);
regionSelect.addEventListener('change', fetchStories);

fetchStories();
