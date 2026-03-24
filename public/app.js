const feed = document.getElementById('feed');
const regionSelect = document.getElementById('region-select');
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const refreshBtn = document.getElementById('refresh-btn');

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
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

// Fetch stories from backend
async function fetchStories() {
  const region = regionSelect.value;
  const sectors = getActivePills(sectorPills);
  const sourceTypes = getActivePills(sourcePills);

  if (sectors.length === 0 || sourceTypes.length === 0) {
    feed.innerHTML = '<div class="empty-feed">Select at least one sector and source type.</div>';
    return;
  }

  feed.innerHTML = '<div class="loading-feed">Loading stories&hellip;</div>';

  try {
    const params = new URLSearchParams({
      region,
      sectors: sectors.join(','),
      sourceTypes: sourceTypes.join(',')
    });

    const res = await fetch('/api/news?' + params);
    const data = await res.json();

    if (!res.ok) {
      feed.innerHTML = '<div class="empty-feed">Failed to load stories. Check your API key.</div>';
      return;
    }

    if (!data.articles || data.articles.length === 0) {
      feed.innerHTML = '<div class="empty-feed">No stories found for the current filters.</div>';
      return;
    }

    renderFeed(data.articles);
  } catch (err) {
    console.error('Fetch error:', err);
    feed.innerHTML = '<div class="empty-feed">Something went wrong. Try again.</div>';
  }
}

// Render story cards
function renderFeed(articles) {
  feed.innerHTML = '';

  articles.forEach(article => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML =
      '<div class="card-header">' +
        '<div class="card-title">' + escapeHtml(article.title) + '</div>' +
        '<span class="card-region">' + escapeHtml(article.region) + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span class="card-source">' + escapeHtml(article.source) + '</span>' +
        '<span>' + timeAgo(article.publishedAt) + '</span>' +
      '</div>';

    let expanded = false;
    let briefingEl = null;

    card.addEventListener('click', async () => {
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
          '<span>Generating briefing&hellip;</span>' +
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
          html += '<a class="card-link" href="' + escapeHtml(article.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Read original article &rarr;</a>';
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

  // Split by known section headers
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

  // Fallback: if parsing failed, show the raw text
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

// Load stories on page load
fetchStories();
