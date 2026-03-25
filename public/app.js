const feed = document.getElementById('feed');
const regionSelect = document.getElementById('region-select');
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const refreshBtn = document.getElementById('refresh-btn');
const feedCount = document.getElementById('feed-count');
const feedTimestamp = document.getElementById('feed-timestamp');

// Toggle pill active state
function initPills(container) {
  container.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
    });
  });
}

initPills(sectorPills);
initPills(sourcePills);

// Get active pill values from a container
function getActivePills(container) {
  return Array.from(container.querySelectorAll('.pill.active'))
    .map(p => p.dataset.value);
}

// Format relative time
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

// Format current timestamp
function formatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }) + ' UTC';
}

// Store articles globally for TL;DR updates
let currentArticles = [];
let tldrElements = [];

// Fetch stories from backend
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
      '<span>Scanning global signals&hellip;</span>' +
    '</div>';
  feedCount.textContent = '';
  feedTimestamp.textContent = '';

  try {
    const params = new URLSearchParams({
      region,
      sectors: sectors.join(','),
      sourceTypes: sourceTypes.join(',')
    });

    const res = await fetch('/api/news?' + params);
    const data = await res.json();

    if (!res.ok) {
      feed.innerHTML = '<div class="empty-feed">Failed to load signals. Check your API key.</div>';
      return;
    }

    if (!data.articles || data.articles.length === 0) {
      feed.innerHTML = '<div class="empty-feed">No signals found for the current filters.</div>';
      return;
    }

    currentArticles = data.articles;
    feedCount.textContent = data.articles.length + ' signals detected';
    feedTimestamp.textContent = 'Updated ' + formatTimestamp();

    renderFeed(data.articles);

    // Fire off TL;DR generation in background
    generateTldrs(data.articles);
  } catch (err) {
    console.error('Fetch error:', err);
    feed.innerHTML = '<div class="empty-feed">Connection failed. Try again.</div>';
  }
}

// Generate TL;DR summaries via batch API
async function generateTldrs(articles) {
  try {
    const res = await fetch('/api/tldr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: articles.map(a => ({
          title: a.title,
          description: a.description
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
    // Fail silently — descriptions are already shown as fallback
  }
}

// Render story cards
function renderFeed(articles) {
  feed.innerHTML = '';
  tldrElements = [];

  articles.forEach((article, index) => {
    const card = document.createElement('div');
    card.className = 'card';

    // Build card HTML
    const tldrFallback = article.description
      ? escapeHtml(article.description)
      : 'Generating summary&hellip;';

    card.innerHTML =
      '<div class="card-header">' +
        '<div class="card-title">' + escapeHtml(article.title) + '</div>' +
        '<span class="card-region">' + escapeHtml(article.region) + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span class="card-source">' + escapeHtml(article.source) + '</span>' +
        '<span class="card-dot"></span>' +
        '<span>' + timeAgo(article.publishedAt) + '</span>' +
      '</div>' +
      '<div class="card-tldr loading" data-index="' + index + '">' +
        '<div class="card-tldr-label">TL;DR</div>' +
        '<div>' + tldrFallback + '</div>' +
      '</div>';

    // Store reference to TL;DR element
    const tldrEl = card.querySelector('.card-tldr');
    tldrElements.push(tldrEl);

    let expanded = false;
    let briefingEl = null;

    card.addEventListener('click', async (e) => {
      // Don't trigger on link clicks
      if (e.target.closest('.card-link')) return;

      // Collapse if already expanded
      if (expanded) {
        if (briefingEl) {
          briefingEl.remove();
          briefingEl = null;
        }
        expanded = false;
        return;
      }

      expanded = true;

      // Create briefing container with loading state
      briefingEl = document.createElement('div');
      briefingEl.className = 'briefing';
      briefingEl.innerHTML =
        '<div class="briefing-loading">' +
          '<div class="spinner"></div>' +
          '<span>Generating intelligence briefing&hellip;</span>' +
        '</div>';
      card.appendChild(briefingEl);

      try {
        const res = await fetch('/api/briefing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: article.title,
            source: article.source,
            description: article.description,
            content: article.content
          })
        });

        const data = await res.json();

        if (!res.ok || !data.briefing) {
          briefingEl.innerHTML = '<div class="briefing-error">Could not generate briefing.</div>';
          return;
        }

        // Parse the briefing into sections
        const sections = parseBriefing(data.briefing);
        let html = '<div class="briefing-content">';

        sections.forEach(section => {
          html +=
            '<div class="briefing-section">' +
              '<div class="briefing-label">' + escapeHtml(section.label) + '</div>' +
              '<div class="briefing-text">' + escapeHtml(section.text) + '</div>' +
            '</div>';
        });

        if (article.url) {
          html += '<a class="card-link" href="' + escapeHtml(article.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Read original source &rarr;</a>';
        }

        html += '</div>';
        briefingEl.innerHTML = html;
      } catch (err) {
        console.error('Briefing error:', err);
        if (briefingEl) {
          briefingEl.innerHTML = '<div class="briefing-error">Failed to generate briefing.</div>';
        }
      }
    });

    feed.appendChild(card);
  });
}

// Parse structured briefing text into labelled sections
function parseBriefing(text) {
  const labels = ['WHAT HAPPENED', 'WHAT LED TO THIS', 'WHAT EXPERTS ARE SAYING', 'WHY THIS MATTERS'];
  const sections = [];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const nextLabel = labels[i + 1];

    const pattern = new RegExp(label + '[:\\s]*', 'i');
    const match = text.match(pattern);
    if (!match) continue;

    const startIdx = match.index + match[0].length;
    let endIdx = text.length;

    if (nextLabel) {
      const nextPattern = new RegExp(nextLabel + '[:\\s]*', 'i');
      const nextMatch = text.match(nextPattern);
      if (nextMatch) {
        endIdx = nextMatch.index;
      }
    }

    const sectionText = text.substring(startIdx, endIdx).trim();
    if (sectionText) {
      sections.push({ label: label, text: sectionText });
    }
  }

  if (sections.length === 0) {
    sections.push({ label: 'BRIEFING', text: text.trim() });
  }

  return sections;
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Event listeners
refreshBtn.addEventListener('click', fetchStories);
regionSelect.addEventListener('change', fetchStories);

// Load stories on page load
fetchStories();
