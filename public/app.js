// ── Behavioural pattern tracker ─────────────────────────────────
// Silently logs user interaction events to localStorage so patterns
// can be analysed for feed re-ranking and the "Your reading patterns"
// summary card. All data stays local until auth is implemented.
const GS_TRACKER_KEY = 'geosignal-tracker';
const GS_TRACKER_MAX_EVENTS = 500;

const gsTracker = (() => {
  function getEvents() {
    try { return JSON.parse(localStorage.getItem(GS_TRACKER_KEY) || '[]'); }
    catch { return []; }
  }
  function save(events) {
    // Trim oldest events if the log gets too large
    const trimmed = events.length > GS_TRACKER_MAX_EVENTS
      ? events.slice(events.length - GS_TRACKER_MAX_EVENTS)
      : events;
    try { localStorage.setItem(GS_TRACKER_KEY, JSON.stringify(trimmed)); } catch {}
  }
  function log(type, data) {
    const events = getEvents();
    events.push({ type, ts: Date.now(), ...data });
    save(events);
  }

  // ── Tracking methods ──
  function articleOpened(article) {
    if (!article) return;
    log('article_opened', {
      id: article.url || article.title,
      source: article.source || '',
      region: article.region || '',
      articleType: article.articleType || '',
      country: article.country || ''
    });
  }
  function articleTimeSpent(articleId, seconds) {
    if (seconds < 2) return;
    log('article_time_spent', { id: articleId, seconds: Math.round(seconds) });
  }
  function articleSaved(article) {
    if (!article) return;
    log('article_saved', {
      id: article.url || article.title,
      source: article.source || '',
      region: article.region || ''
    });
  }
  function briefingSectionRead(articleId, section, seconds) {
    log('briefing_section_read', { id: articleId, section, seconds: Math.round(seconds) });
  }
  function conciseVsDetailed(mode) {
    log('concise_vs_detailed', { mode });
  }
  function searchQuery(query) {
    if (!query) return;
    log('search_query', { query });
  }
  function filtersApplied(snapshot) {
    log('filters_applied', { filters: snapshot });
  }
  function termAnnotated(term, articleId, region) {
    log('term_annotated', { term, id: articleId || '', region: region || '' });
  }

  // ── Pattern extraction ──
  // Returns a summary of the user's behavioural patterns.
  function getPatternSummary() {
    const events = getEvents();
    if (events.length < 10) return null;

    const regionCounts = {};
    const sectorCounts = {};
    const sourceCounts = {};
    const keywordCounts = {};
    const annotatedTerms = {};
    let conciseCount = 0;
    let detailedCount = 0;
    const hourCounts = new Array(24).fill(0);

    events.forEach(e => {
      // Time-of-day patterns
      hourCounts[new Date(e.ts).getHours()]++;

      if (e.type === 'article_opened' || e.type === 'article_saved') {
        if (e.region) regionCounts[e.region] = (regionCounts[e.region] || 0) + 1;
        if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
      }
      if (e.type === 'search_query' && e.query) {
        e.query.toLowerCase().split(/\s+/).filter(w => w.length > 2).forEach(w => {
          keywordCounts[w] = (keywordCounts[w] || 0) + 1;
        });
      }
      if (e.type === 'filters_applied' && e.filters) {
        // Count which sectors appear in filter snapshots
        (e.filters.sectors || '').split('|').filter(Boolean).forEach(s => {
          sectorCounts[s] = (sectorCounts[s] || 0) + 1;
        });
      }
      if (e.type === 'concise_vs_detailed') {
        if (e.mode === 'concise') conciseCount++;
        else detailedCount++;
      }
      if (e.type === 'term_annotated' && e.term) {
        annotatedTerms[e.term] = (annotatedTerms[e.term] || 0) + 1;
      }
    });

    const top = (obj, n) => Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([k]) => k);

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    return {
      totalInteractions: events.length,
      topRegions: top(regionCounts, 3),
      topSectors: top(sectorCounts, 3),
      topSources: top(sourceCounts, 5),
      topKeywords: top(keywordCounts, 5),
      topAnnotatedTerms: top(annotatedTerms, 5),
      preferredFormat: conciseCount > detailedCount ? 'concise' : 'detailed',
      peakHour,
      peakHourLabel: (peakHour < 12 ? peakHour || 12 : peakHour - 12 || 12) +
        (peakHour < 12 ? 'am' : 'pm')
    };
  }

  return {
    articleOpened, articleTimeSpent, articleSaved,
    briefingSectionRead, conciseVsDetailed,
    searchQuery, filtersApplied, termAnnotated,
    getPatternSummary, getEvents
  };
})();

const feed = document.getElementById('feed');
const regionPills = document.getElementById('region-pills');

function getActiveRegions() {
  if (!regionPills) return ['Global'];
  const selected = Array.from(regionPills.querySelectorAll('.pill.active'))
    .map(p => p.dataset.value);
  return selected.length ? selected : ['Global'];
}
function getRegionsLabel() {
  const r = getActiveRegions();
  if (r.length === 1) return r[0];
  return r.length + ' regions';
}
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const articleTypePills = document.getElementById('article-type-pills');
const locationsInput = document.getElementById('locations-input');
const dateRangePills = document.getElementById('date-range-pills');
const manageSourcesBtn = document.getElementById('manage-sources-btn');
const sourceBrowser = document.getElementById('source-browser');
const sourceBrowserOverlay = document.getElementById('source-browser-overlay');
const sourceBrowserClose = document.getElementById('source-browser-close');
const sourceBrowserSearch = document.getElementById('source-browser-search');
const sourceBrowserBody = document.getElementById('source-browser-body');
const sourceBrowserSave = document.getElementById('source-browser-save');
const sourceBrowserReset = document.getElementById('source-browser-reset');
const sourceBrowserAddCustom = document.getElementById('source-browser-add-custom');
const sourceBrowserLegend = document.getElementById('source-browser-legend');
const customSourceOverlay = document.getElementById('custom-source-overlay');
const customSourceInput = document.getElementById('custom-source-url');
const customSourceStatus = document.getElementById('custom-source-status');
const customSourceSubmit = document.getElementById('custom-source-submit');
const customSourceCancel = document.getElementById('custom-source-cancel');
const customSourceClose = document.getElementById('custom-source-close');
const sectorOtherInput = document.getElementById('sector-other-input');
const sectorOtherChips = document.getElementById('sector-other-chips');
const keywordsInput = document.getElementById('keywords-input');
const keywordChips = document.getElementById('keyword-chips');
const keywordClearAll = document.getElementById('keyword-clear-all');

// Live arrays — persisted as part of geosignal-filters on change.
let customFilterSectors = [];
let filterKeywords = [];
const refreshBtn = document.getElementById('refresh-btn');
const refreshConfirmation = document.getElementById('refresh-confirmation');
let refreshConfirmationTimer = null;

function showRefreshConfirmation() {
  if (!refreshConfirmation) return;
  if (refreshConfirmationTimer) {
    clearTimeout(refreshConfirmationTimer);
    refreshConfirmationTimer = null;
  }
  refreshConfirmation.classList.add('visible');
  refreshConfirmationTimer = setTimeout(() => {
    refreshConfirmation.classList.remove('visible');
    refreshConfirmationTimer = null;
  }, 2000);
}
const feedCount = document.getElementById('feed-count');
const feedTimestamp = document.getElementById('feed-timestamp');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const filtersContainer = document.getElementById('filters-container');
const filtersToggle = document.getElementById('filters-toggle');
const filtersSummary = document.getElementById('filters-summary');

const savedBtn = document.getElementById('saved-btn');
const savedBtnCount = document.getElementById('saved-btn-count');
const profileBtn = document.getElementById('profile-btn');
const textSizeBtn = document.getElementById('text-size-btn');

// ── Text Size Control ───────────────────────────────────────────

const TEXT_SIZES = ['small', 'medium', 'large', 'xlarge'];
const TEXT_SIZE_LABELS = { small: 'Smaller text', medium: 'Default text size', large: 'Larger text', xlarge: 'Largest text' };

function applyTextSize(size) {
  TEXT_SIZES.forEach(s => document.body.classList.remove('size-' + s));
  if (size !== 'medium') document.body.classList.add('size-' + size);
  if (textSizeBtn) textSizeBtn.title = TEXT_SIZE_LABELS[size] + ' (click to cycle)';
}

function getTextSize() {
  return localStorage.getItem('geosignal-text-size') || 'medium';
}

function cycleTextSize() {
  const current = getTextSize();
  const next = TEXT_SIZES[(TEXT_SIZES.indexOf(current) + 1) % TEXT_SIZES.length];
  localStorage.setItem('geosignal-text-size', next);
  applyTextSize(next);
}

applyTextSize(getTextSize());
if (textSizeBtn) textSizeBtn.addEventListener('click', cycleTextSize);
const profileBtnText = document.getElementById('profile-btn-text');

// ── Briefing length toggle (concise vs detailed) ──────────────
const BRIEF_LENGTH_KEY = 'geosignal_brief_length';

function getBriefLength() {
  return localStorage.getItem(BRIEF_LENGTH_KEY) || 'concise';
}

function applyBriefLength(mode) {
  document.body.classList.toggle('briefing-concise', mode === 'concise');
  document.querySelectorAll('.brief-len-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.len === mode);
  });
}

function setBriefLength(mode) {
  if (mode !== 'concise' && mode !== 'detailed') return;
  localStorage.setItem(BRIEF_LENGTH_KEY, mode);
  gsTracker.conciseVsDetailed(mode);
  applyBriefLength(mode);
}

// Apply on load so concise-mode kicks in before the first briefing renders
applyBriefLength(getBriefLength());

document.querySelectorAll('.brief-len-btn').forEach(btn => {
  btn.addEventListener('click', () => setBriefLength(btn.dataset.len));
});

// ── Smart rank toggle (LLM-based feed re-ranking) ───────────────
const SMART_RANK_KEY = 'geosignal_smart_rank';
function isSmartRankOn() { return localStorage.getItem(SMART_RANK_KEY) === 'true'; }
(function initSmartRankToggle() {
  const el = document.getElementById('smart-rank-toggle');
  if (!el) return;
  el.checked = isSmartRankOn();
  el.addEventListener('change', () => {
    localStorage.setItem(SMART_RANK_KEY, el.checked ? 'true' : 'false');
  });
})();

// Profile UI elements (welcome modal, slide-in panel, banner, toast)
const welcomeOverlay = document.getElementById('welcome-overlay');
const welcomeFormMount = document.getElementById('welcome-form-mount');
const welcomeSaveBtn = document.getElementById('welcome-save');
const welcomeSkipBtn = document.getElementById('welcome-skip');

const profilePanel = document.getElementById('profile-panel');
const profilePanelOverlay = document.getElementById('profile-panel-overlay');
const profilePanelClose = document.getElementById('profile-panel-close');
const profileFormMount = document.getElementById('profile-form-mount');
const profilePanelSuccess = document.getElementById('profile-panel-success');
const profileSave = document.getElementById('profile-save');
const profileClear = document.getElementById('profile-clear');

const profileBanner = document.getElementById('profile-banner');
const profileBannerCta = document.getElementById('profile-banner-cta');
const profileBannerDismiss = document.getElementById('profile-banner-dismiss');

const toastContainer = document.getElementById('toast-container');

// ── Profile Management ──────────────────────────────────────────

const SECTOR_OPTIONS = [
  'Geopolitics & International Relations',
  'Economics & Trade',
  'Technology & AI',
  'Climate & Environment',
  'Energy & Resources',
  'Defence & Security',
  'Finance & Markets',
  'Public Policy & Governance',
  'Society & Culture',
  'Health & Pandemic',
  'Space & Frontier Tech',
  'Media & Disinformation',
  'Human Rights & Migration',
  'Legal & Regulatory',
  'Food & Agriculture'
];

function getProfile() {
  try {
    const saved = localStorage.getItem('geosignal-profile');
    const p = saved ? JSON.parse(saved) : null;
    if (p && !Array.isArray(p.industries)) {
      // Back-compat: old single-industry profiles
      p.industries = p.industry ? [p.industry] : [];
    }
    return p;
  } catch { return null; }
}

function isProfileSet() {
  const p = getProfile();
  if (!p) return false;
  // Any filled field counts as "profile set" — role is no longer required.
  return !!(
    (p.role && String(p.role).trim()) ||
    (p.location && String(p.location).trim()) ||
    (p.focus && String(p.focus).trim()) ||
    (p.company && String(p.company).trim()) ||
    (Array.isArray(p.industries) && p.industries.length > 0) ||
    (Array.isArray(p.customSectors) && p.customSectors.length > 0) ||
    (Array.isArray(p.keywords) && p.keywords.length > 0)
  );
}

function saveProfile(profile) {
  const normalized = {
    role: (profile.role || '').trim(),
    industries: Array.isArray(profile.industries) ? profile.industries.filter(Boolean) : [],
    customSectors: Array.isArray(profile.customSectors) ? profile.customSectors.filter(Boolean) : [],
    keywords: Array.isArray(profile.keywords) ? profile.keywords.filter(Boolean) : [],
    company: (profile.company || '').trim(),
    location: (profile.location || '').trim(),
    focus: (profile.focus || '').trim()
  };
  // Keep `industry` as a joined string (including custom sectors) for
  // backward compatibility with server prompts that expect a scalar.
  normalized.industry = [...normalized.industries, ...normalized.customSectors].join(', ');
  localStorage.setItem('geosignal-profile', JSON.stringify(normalized));
  localStorage.setItem('geosignal_profile_complete', 'true');
  localStorage.removeItem('geosignal_profile_skipped');
  localStorage.removeItem('geosignal_banner_dismissed');
  updateProfileButton();
  hideBanner();
}

function clearProfile() {
  localStorage.removeItem('geosignal-profile');
  localStorage.removeItem('geosignal_profile_complete');
  updateProfileButton();
}

// ── Profile form rendering (shared between welcome modal & side panel) ──
function renderProfileForm(mountEl, idPrefix) {
  const profile = getProfile() || {};
  const industries = Array.isArray(profile.industries) ? profile.industries : [];

  mountEl.innerHTML = `
    <div class="form-group">
      <label for="${idPrefix}-role">Your role</label>
      <input type="text" id="${idPrefix}-role" data-field="role"
             placeholder="e.g., Analyst, Founder, Consultant, Investor..." autocomplete="off" />
    </div>

    <div class="form-group">
      <label>Sectors of interest <span class="sector-checkbox-count" id="${idPrefix}-sector-count"></span></label>
      <div class="sector-checkbox-group" id="${idPrefix}-sectors">
        ${SECTOR_OPTIONS.map(s => `
          <label class="sector-checkbox">
            <input type="checkbox" value="${s}" data-sector />
            <span>${s}</span>
          </label>`).join('')}
      </div>
      <div class="sector-other-row">
        <input type="text" id="${idPrefix}-sector-other" class="sector-other-input"
               placeholder="Other (type a custom sector and press Enter)..."
               autocomplete="off" />
        <div class="sector-other-chips" id="${idPrefix}-sector-other-chips"></div>
      </div>
    </div>

    <div class="form-group">
      <label for="${idPrefix}-company">Company you work for <span class="optional">(optional)</span></label>
      <input type="text" id="${idPrefix}-company" data-field="company"
             placeholder="e.g., Goldman Sachs, Maersk, Shell, your startup..." autocomplete="organization" />
    </div>

    <div class="form-group">
      <label for="${idPrefix}-location">Country you're based in</label>
      <input type="text" id="${idPrefix}-location" data-field="location"
             placeholder="e.g., Singapore, United States, UK..." autocomplete="off" />
    </div>

    <div class="form-group">
      <label>Keywords &amp; topics you track <span class="optional">(optional)</span></label>
      <div class="keyword-input-row">
        <input type="text" id="${idPrefix}-keywords-input" class="keyword-input"
               placeholder="Type a keyword and press Enter or comma..." autocomplete="off" />
      </div>
      <div class="keyword-chips" id="${idPrefix}-keyword-chips"></div>
    </div>

    <div class="form-group">
      <label for="${idPrefix}-focus">Key concerns / focus areas <span class="optional">(optional)</span></label>
      <input type="text" id="${idPrefix}-focus" data-field="focus"
             placeholder="e.g., supply chain risk, ESG, emerging markets..." autocomplete="off" />
    </div>
  `;

  // Populate from existing profile
  mountEl.querySelector(`#${idPrefix}-role`).value = profile.role || '';
  mountEl.querySelector(`#${idPrefix}-company`).value = profile.company || '';
  mountEl.querySelector(`#${idPrefix}-location`).value = profile.location || '';
  mountEl.querySelector(`#${idPrefix}-focus`).value = profile.focus || '';
  mountEl.querySelectorAll(`#${idPrefix}-sectors input[data-sector]`).forEach(cb => {
    cb.checked = industries.includes(cb.value);
  });

  // Wire the "Other" sector free-text — each term the user types
  // becomes a chip and gets treated as a custom sector.
  const customSectors = Array.isArray(profile.customSectors)
    ? profile.customSectors.slice()
    : [];
  const chipsEl = mountEl.querySelector(`#${idPrefix}-sector-other-chips`);
  const otherInput = mountEl.querySelector(`#${idPrefix}-sector-other`);
  const renderCustomSectorChips = () => {
    chipsEl.innerHTML = customSectors
      .map((s, i) => `<span class="sector-other-chip" data-idx="${i}">${escapeHtml(s)}<button type="button" aria-label="Remove ${escapeHtml(s)}">&times;</button></span>`)
      .join('');
  };
  renderCustomSectorChips();
  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const chip = btn.closest('.sector-other-chip');
    if (!chip) return;
    const idx = parseInt(chip.dataset.idx, 10);
    if (!isNaN(idx)) {
      customSectors.splice(idx, 1);
      renderCustomSectorChips();
    }
  });
  const commitOther = () => {
    const raw = otherInput.value.trim().replace(/,+$/, '').trim();
    if (!raw) return;
    raw.split(',').map(s => s.trim()).filter(Boolean).forEach(term => {
      if (!customSectors.includes(term)) customSectors.push(term);
    });
    otherInput.value = '';
    renderCustomSectorChips();
  };
  otherInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitOther();
    }
  });
  otherInput.addEventListener('blur', commitOther);

  // Wire keywords & topics — same chip pattern as Other sectors
  const keywords = Array.isArray(profile.keywords) ? profile.keywords.slice() : [];
  const keywordChipsEl = mountEl.querySelector(`#${idPrefix}-keyword-chips`);
  const keywordInput = mountEl.querySelector(`#${idPrefix}-keywords-input`);
  const renderKeywordChips = () => {
    keywordChipsEl.innerHTML = keywords
      .map((k, i) => `<span class="keyword-chip" data-idx="${i}">${escapeHtml(k)}<button type="button" aria-label="Remove ${escapeHtml(k)}">&times;</button></span>`)
      .join('');
  };
  renderKeywordChips();
  keywordChipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const chip = btn.closest('.keyword-chip');
    if (!chip) return;
    const idx = parseInt(chip.dataset.idx, 10);
    if (!isNaN(idx)) {
      keywords.splice(idx, 1);
      renderKeywordChips();
    }
  });
  const commitKeyword = () => {
    const raw = keywordInput.value.trim().replace(/,+$/, '').trim();
    if (!raw) return;
    raw.split(',').map(s => s.trim()).filter(Boolean).forEach(term => {
      if (!keywords.includes(term)) keywords.push(term);
    });
    keywordInput.value = '';
    renderKeywordChips();
  };
  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitKeyword();
    }
  });
  keywordInput.addEventListener('blur', commitKeyword);

  // Stash the live arrays on the mount so readProfileFromForm can pick them up
  mountEl._customSectors = customSectors;
  mountEl._keywords = keywords;

  const countEl = mountEl.querySelector(`#${idPrefix}-sector-count`);
  const updateCount = () => {
    const n = mountEl.querySelectorAll(`#${idPrefix}-sectors input:checked`).length;
    countEl.textContent = n > 0 ? `· ${n} selected` : '· select any that apply';
  };
  updateCount();
  mountEl.querySelectorAll(`#${idPrefix}-sectors input[data-sector]`).forEach(cb => {
    cb.addEventListener('change', updateCount);
  });
}

function readProfileFromForm(mountEl, idPrefix) {
  const role = mountEl.querySelector(`#${idPrefix}-role`).value;
  const company = mountEl.querySelector(`#${idPrefix}-company`).value;
  const location = mountEl.querySelector(`#${idPrefix}-location`).value;
  const focus = mountEl.querySelector(`#${idPrefix}-focus`).value;
  const industries = Array.from(mountEl.querySelectorAll(`#${idPrefix}-sectors input:checked`))
    .map(cb => cb.value);

  // Flush any unfinished text in the chip inputs so a user who typed
  // a term but never pressed Enter doesn't lose it on save.
  const otherInput = mountEl.querySelector(`#${idPrefix}-sector-other`);
  if (otherInput && otherInput.value.trim()) {
    otherInput.dispatchEvent(new Event('blur'));
  }
  const kwInput = mountEl.querySelector(`#${idPrefix}-keywords-input`);
  if (kwInput && kwInput.value.trim()) {
    kwInput.dispatchEvent(new Event('blur'));
  }

  const customSectors = Array.isArray(mountEl._customSectors) ? mountEl._customSectors.slice() : [];
  const keywords = Array.isArray(mountEl._keywords) ? mountEl._keywords.slice() : [];
  return { role, industries, company, location, focus, customSectors, keywords };
}

// ── Welcome onboarding modal ──
function showWelcomeModal() {
  renderProfileForm(welcomeFormMount, 'welcome');
  welcomeOverlay.classList.add('visible');
  setTimeout(() => {
    const first = welcomeFormMount.querySelector('#welcome-role');
    if (first) first.focus();
  }, 100);
}

function hideWelcomeModal() {
  welcomeOverlay.classList.remove('visible');
}

// ── Slide-in profile panel ──
let panelSaveCallback = null;

function renderReadingPatterns() {
  const body = document.getElementById('reading-patterns-body');
  if (!body) return;
  const summary = gsTracker.getPatternSummary();
  if (!summary) {
    body.innerHTML = '<div class="reading-patterns-hint">After 10 interactions we\u2019ll show you what we\u2019ve learned about your interests.</div>';
    return;
  }
  const line = (label, items) => items.length
    ? '<li><span class="reading-patterns-label">' + escapeHtml(label) + ':</span> ' + items.map(escapeHtml).join(', ') + '</li>'
    : '';
  body.innerHTML = '<ul>' +
    line('You most frequently read about', summary.topSectors) +
    line('Top regions', summary.topRegions) +
    line('Recurring keywords', summary.topKeywords) +
    line('Go-to sources', summary.topSources) +
    line('You annotate most', summary.topAnnotatedTerms) +
    '<li><span class="reading-patterns-label">Preferred format:</span> ' + escapeHtml(summary.preferredFormat) + '</li>' +
    '<li><span class="reading-patterns-label">Peak reading time:</span> around ' + escapeHtml(summary.peakHourLabel) + '</li>' +
    '<li><span class="reading-patterns-label">Total interactions:</span> ' + summary.totalInteractions + '</li>' +
  '</ul>';
}

function openProfilePanel(options = {}) {
  panelSaveCallback = typeof options.onSave === 'function' ? options.onSave : null;
  renderProfileForm(profileFormMount, 'profile');
  renderReadingPatterns();
  profilePanelSuccess.classList.remove('visible');
  profilePanelSuccess.textContent = '';
  profilePanel.classList.add('visible');
  profilePanel.setAttribute('aria-hidden', 'false');
  profilePanelOverlay.classList.add('visible');
  profilePanelOverlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    const first = profileFormMount.querySelector('#profile-role');
    if (first) first.focus();
  }, 300);
}

function closeProfilePanel() {
  profilePanel.classList.remove('visible');
  profilePanel.setAttribute('aria-hidden', 'true');
  profilePanelOverlay.classList.remove('visible');
  profilePanelOverlay.setAttribute('aria-hidden', 'true');
  panelSaveCallback = null;
}

// ── Banner ──
function showBanner() {
  if (isProfileSet()) return;
  if (localStorage.getItem('geosignal_banner_dismissed') === 'true') return;
  profileBanner.classList.add('visible');
}

function hideBanner() {
  profileBanner.classList.remove('visible');
}

// ── Toast stack ──
function showToast(message, options = {}) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (options.success ? ' toast-success' : '');

  const text = document.createElement('span');
  text.style.flex = '1';
  text.textContent = message;
  toast.appendChild(text);

  if (options.actionLabel && typeof options.onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', () => {
      options.onAction();
      dismiss();
    });
    toast.appendChild(btn);
  }

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  toast.appendChild(close);

  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  };
  close.addEventListener('click', dismiss);

  const duration = options.duration || 3500;
  timer = setTimeout(dismiss, duration);
}

// ── Saved Articles ──────────────────────────────────────────────

const SAVED_KEY = 'geosignal-saved';
const SAVED_MAX = 100;
let savedViewActive = false;

function getSavedArticles() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
  } catch { return []; }
}

function isArticleSaved(article) {
  const id = article.url || article.title;
  return getSavedArticles().some(a => (a.url || a.title) === id);
}

function toggleSavedArticle(article) {
  const saved = getSavedArticles();
  const id = article.url || article.title;
  const existingIdx = saved.findIndex(a => (a.url || a.title) === id);

  if (existingIdx >= 0) {
    saved.splice(existingIdx, 1);
  } else {
    // Store only the fields needed to render a card later
    saved.unshift({
      title: article.title,
      source: article.source,
      sourceTier: article.sourceTier,
      publishedAt: article.publishedAt,
      description: article.description,
      url: article.url,
      region: article.region,
      isOfficial: article.isOfficial,
      thumbnail: article.thumbnail,
      savedAt: Date.now()
    });
    if (saved.length > SAVED_MAX) saved.length = SAVED_MAX;
  }

  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  return existingIdx < 0; // returns true if newly saved
}

function updateSavedButton() {
  if (!savedBtn) return;
  const count = getSavedArticles().length;
  savedBtn.classList.toggle('has-saved', count > 0);
  savedBtn.classList.toggle('saved-view-active', savedViewActive);
  if (savedBtnCount) {
    savedBtnCount.textContent = count > 0 ? String(count) : '';
    savedBtnCount.style.display = count > 0 ? 'inline' : 'none';
  }
  savedBtn.title = savedViewActive
    ? 'Showing saved (click to return to feed)'
    : (count > 0 ? count + ' saved articles' : 'No saved articles yet');
}

function renderSavedFeed() {
  const saved = getSavedArticles();
  // Hide the dispatch/stats chrome when viewing saved
  const dispatchEl = document.getElementById('dispatch-header');
  const statsEl = document.getElementById('stats-strip');
  if (dispatchEl) dispatchEl.style.display = savedViewActive ? 'none' : '';
  if (statsEl) statsEl.style.display = savedViewActive ? 'none' : '';

  if (saved.length === 0) {
    feed.innerHTML = '<div class="empty-feed">You haven\u2019t saved any articles yet. Tap the bookmark icon on a card to save it for later.</div>';
    return;
  }

  // Attach a score so they sort cleanly, then render through the normal path
  const articlesForRender = saved.map(a => ({ ...a, score: 0 }));
  renderFeed(articlesForRender);
}

savedBtn.addEventListener('click', () => {
  savedViewActive = !savedViewActive;
  updateSavedButton();
  if (savedViewActive) {
    renderSavedFeed();
  } else {
    // Return to the live feed
    if (currentArticles.length > 0) {
      updateDispatchHeader(currentArticles);
      renderFeed(currentArticles);
      generateTldrs(currentArticles);
    } else {
      fetchStories();
    }
  }
});

updateSavedButton();

function updateProfileButton() {
  const profile = getProfile();
  const set = isProfileSet();
  if (set) {
    profileBtnText.textContent = profile.role;
    profileBtn.classList.add('has-profile');
    profileBtn.classList.remove('profile-not-set');
    const sectorLabel = (profile.industries && profile.industries.length)
      ? profile.industries.slice(0, 2).join(', ') + (profile.industries.length > 2 ? '…' : '')
      : 'General';
    profileBtn.title = `${profile.role} · ${sectorLabel} · ${profile.location || 'Global'} — click to edit`;
  } else {
    profileBtnText.textContent = 'My profile';
    profileBtn.classList.remove('has-profile');
    profileBtn.classList.add('profile-not-set');
    profileBtn.title = 'Set up your profile for personalised impact analysis';
  }
}

// Handler used across welcome modal, side panel, and inline CTAs
function handleProfileSaved(source) {
  // source: 'welcome' | 'panel' | 'banner' | 'impact'
  updateProfileButton();
  hideBanner();

  // Auto-apply to current view without a manual refresh
  if (currentArticles && currentArticles.length > 0) {
    // Reset any previously-loaded impact sections so they re-render with profile next open.
    // Also re-run cross-sector analysis since it depends on profile.
    const region = getRegionsLabel();
    if (currentArticles.length >= 3) {
      fetchCrossSectorInsights(currentArticles, getProfile(), region);
    }
  }

  // Invoke any impact-section callback waiting to re-render
  if (source === 'panel' && typeof panelSaveCallback === 'function') {
    try { panelSaveCallback(); } catch (e) { console.error(e); }
  }

  // Success toast (skip if panel already shows inline success)
  if (source !== 'panel') {
    showToast('Profile saved — your feed will now show what each story means for you', { success: true, duration: 3500 });
  }

  // First-time only: slide open the filter panel with a muted nudge
  // so setup flows continuously from profile → filters.
  const firstTime = localStorage.getItem('geosignal_profile_saved') !== 'true';
  if (firstTime) {
    try { localStorage.setItem('geosignal_profile_saved', 'true'); } catch {}
    const nudge = document.getElementById('filters-nudge');
    const container = document.getElementById('filters-container');
    if (container) container.classList.add('expanded');
    if (nudge) {
      nudge.classList.add('visible');
      // Scroll it into view after the panel's expansion paints
      setTimeout(() => nudge.scrollIntoView({ behavior: 'smooth', block: 'center' }), 220);
    }
  }
}

// ── Wire up welcome modal ──
if (welcomeSaveBtn) {
  welcomeSaveBtn.addEventListener('click', () => {
    const data = readProfileFromForm(welcomeFormMount, 'welcome');
    // All fields are optional — at least one field filled is enough.
    const anyFilled = data.role.trim() || data.location.trim() ||
      data.focus.trim() || data.company.trim() ||
      (Array.isArray(data.industries) && data.industries.length > 0) ||
      (Array.isArray(data.customSectors) && data.customSectors.length > 0) ||
      (Array.isArray(data.keywords) && data.keywords.length > 0);
    if (!anyFilled) {
      // Nothing at all was entered; treat as Skip.
      localStorage.setItem('geosignal_profile_skipped', 'true');
      hideWelcomeModal();
      showBanner();
      return;
    }
    saveProfile(data);
    hideWelcomeModal();
    handleProfileSaved('welcome');
  });
}

if (welcomeSkipBtn) {
  welcomeSkipBtn.addEventListener('click', () => {
    localStorage.setItem('geosignal_profile_skipped', 'true');
    hideWelcomeModal();
    showBanner();
  });
}

// ── Wire up side panel ──
profileBtn.addEventListener('click', () => openProfilePanel());
if (profilePanelClose) profilePanelClose.addEventListener('click', closeProfilePanel);
if (profilePanelOverlay) profilePanelOverlay.addEventListener('click', closeProfilePanel);

const profilePanelSkipBtn = document.getElementById('profile-panel-skip');
if (profilePanelSkipBtn) {
  profilePanelSkipBtn.addEventListener('click', () => {
    // Skip: close the panel without saving. If the user has never
    // saved a profile before, also set the skipped flag so the
    // banner appears — same behaviour as the welcome modal's skip.
    if (!isProfileSet()) {
      localStorage.setItem('geosignal_profile_skipped', 'true');
      showBanner();
    }
    closeProfilePanel();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (profilePanel.classList.contains('visible')) closeProfilePanel();
  }
});

if (profileSave) {
  profileSave.addEventListener('click', () => {
    const data = readProfileFromForm(profileFormMount, 'profile');
    // Every field is optional — allow saving as long as SOMETHING is set.
    const anyFilled = data.role.trim() || data.location.trim() ||
      data.focus.trim() || data.company.trim() ||
      (Array.isArray(data.industries) && data.industries.length > 0) ||
      (Array.isArray(data.customSectors) && data.customSectors.length > 0) ||
      (Array.isArray(data.keywords) && data.keywords.length > 0);
    if (!anyFilled) {
      const roleInput = profileFormMount.querySelector('#profile-role');
      if (roleInput) roleInput.focus();
      return;
    }
    saveProfile(data);

    // Show inline success in the panel
    profilePanelSuccess.textContent = 'Profile saved — your feed will now show what each story means for you.';
    profilePanelSuccess.classList.add('visible');

    handleProfileSaved('panel');

    // Auto-close after a moment so user sees confirmation then sees the updated view
    setTimeout(() => {
      closeProfilePanel();
    }, 1400);
  });
}

if (profileClear) {
  profileClear.addEventListener('click', () => {
    clearProfile();
    renderProfileForm(profileFormMount, 'profile');
    profilePanelSuccess.classList.remove('visible');
  });
}

// ── Wire up banner ──
if (profileBannerCta) {
  profileBannerCta.addEventListener('click', () => openProfilePanel());
}
if (profileBannerDismiss) {
  profileBannerDismiss.addEventListener('click', () => {
    localStorage.setItem('geosignal_banner_dismissed', 'true');
    hideBanner();
  });
}

// ── First-visit logic ──
(function firstVisitCheck() {
  const complete = localStorage.getItem('geosignal_profile_complete') === 'true' || isProfileSet();
  const skipped = localStorage.getItem('geosignal_profile_skipped') === 'true';
  if (!complete && !skipped) {
    // Slight delay so the rest of the UI paints first
    setTimeout(showWelcomeModal, 400);
  } else if (!complete && skipped) {
    showBanner();
  }
})();

updateProfileButton();

// ── Smart nudge after 3 briefings per session ──
const SESSION_BRIEFING_KEY = 'geosignal_session_briefings';
const SESSION_NUDGE_SHOWN = 'geosignal_nudge_shown';

function recordBriefingOpened() {
  if (isProfileSet()) return;
  let count = parseInt(sessionStorage.getItem(SESSION_BRIEFING_KEY) || '0', 10);
  count += 1;
  sessionStorage.setItem(SESSION_BRIEFING_KEY, String(count));

  if (count >= 3 && sessionStorage.getItem(SESSION_NUDGE_SHOWN) !== 'true') {
    sessionStorage.setItem(SESSION_NUDGE_SHOWN, 'true');
    showToast(
      "You've read 3 stories — set up your profile to see what they mean for your role specifically.",
      {
        actionLabel: 'Set up',
        onAction: () => openProfilePanel(),
        duration: 8000
      }
    );
  }
}

// ── Pills & Filters ─────────────────────────────────────────────

function initPills(container) {
  container.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
    });
  });
}

// ── Filter persistence ────────────────────────────────────────
// Remember region + sector pills + source pills so a browser refresh
// doesn't wipe the user's selections. Fetching new results still
// requires the Apply button — this only restores the *selection*.
const FILTERS_KEY = 'geosignal-filters';

function saveFilters() {
  try {
    const state = {
      regions: getActiveRegions(),
      sectors: getActivePills(sectorPills),
      sourceTypes: getActivePills(sourcePills),
      articleTypes: articleTypePills ? getActivePills(articleTypePills) : ['News', 'Analysis'],
      locations: locationsInput ? locationsInput.value.trim() : '',
      dateRange: getActiveDateRange(),
      customSectors: customFilterSectors.slice(),
      keywords: filterKeywords.slice()
    };
    localStorage.setItem(FILTERS_KEY, JSON.stringify(state));
  } catch { /* storage unavailable — nothing we can do */ }
}

function applyPillState(container, activeValues) {
  const set = new Set(activeValues || []);
  container.querySelectorAll('.pill').forEach(pill => {
    pill.classList.toggle('active', set.has(pill.dataset.value));
  });
}

function restoreFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state && Array.isArray(state.regions) && regionPills) {
      const want = new Set(state.regions);
      regionPills.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', want.has(p.dataset.value));
      });
    } else if (state && typeof state.region === 'string' && regionPills) {
      // Back-compat: old single-region saved state
      regionPills.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.dataset.value === state.region);
      });
    }
    if (state && Array.isArray(state.sectors)) applyPillState(sectorPills, state.sectors);
    if (state && Array.isArray(state.sourceTypes)) applyPillState(sourcePills, state.sourceTypes);
    if (state && Array.isArray(state.articleTypes) && articleTypePills) {
      applyPillState(articleTypePills, state.articleTypes);
    }
    if (state && typeof state.locations === 'string' && locationsInput) {
      locationsInput.value = state.locations;
    }
    if (state && state.dateRange && dateRangePills) {
      dateRangePills.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.dataset.value === state.dateRange);
      });
    }
    if (state && Array.isArray(state.customSectors)) {
      customFilterSectors = state.customSectors.slice();
    }
    if (state && Array.isArray(state.keywords)) {
      filterKeywords = state.keywords.slice();
    }
  } catch { /* ignore */ }
}

// Restore before wiring click listeners so the initial fetch uses saved state
restoreFilters();

initPills(sectorPills);
initPills(sourcePills);
if (articleTypePills) initPills(articleTypePills);

// Date-range pills are single-select (radio-like) — clicking one
// deactivates the others.
if (dateRangePills) {
  dateRangePills.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      dateRangePills.querySelectorAll('.pill.active').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      handleFiltersChanged();
    });
  });
}

function getActiveDateRange() {
  if (!dateRangePills) return '24';
  const active = dateRangePills.querySelector('.pill.active');
  return active ? active.dataset.value : '24';
}

function getActivePills(container) {
  return Array.from(container.querySelectorAll('.pill.active'))
    .map(p => p.dataset.value);
}

// ── Filter-panel chip inputs (Other sectors + keywords) ───────
function renderSectorOtherChips() {
  if (!sectorOtherChips) return;
  sectorOtherChips.innerHTML = customFilterSectors
    .map((s, i) => '<span class="sector-other-chip" data-idx="' + i + '">' +
      escapeHtml(s) +
      '<button type="button" aria-label="Remove ' + escapeHtml(s) + '">&times;</button></span>')
    .join('');
}

function renderKeywordChips() {
  if (!keywordChips) return;
  keywordChips.innerHTML = filterKeywords
    .map((k, i) => '<span class="keyword-chip" data-idx="' + i + '">' +
      escapeHtml(k) +
      '<button type="button" aria-label="Remove ' + escapeHtml(k) + '">&times;</button></span>')
    .join('');
  if (keywordClearAll) {
    keywordClearAll.classList.toggle('visible', filterKeywords.length > 0);
  }
}

function commitChipInput(inputEl, arr, renderFn) {
  if (!inputEl) return;
  const raw = inputEl.value.trim().replace(/,+$/, '').trim();
  if (!raw) return;
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(term => {
    if (!arr.includes(term)) arr.push(term);
  });
  inputEl.value = '';
  renderFn();
  handleFiltersChanged();
}

if (sectorOtherInput && sectorOtherChips) {
  renderSectorOtherChips();
  sectorOtherInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitChipInput(sectorOtherInput, customFilterSectors, renderSectorOtherChips);
    }
  });
  sectorOtherInput.addEventListener('blur', () => {
    if (sectorOtherInput.value.trim()) {
      commitChipInput(sectorOtherInput, customFilterSectors, renderSectorOtherChips);
    }
  });
  sectorOtherChips.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const chip = btn.closest('.sector-other-chip');
    if (!chip) return;
    const idx = parseInt(chip.dataset.idx, 10);
    if (!isNaN(idx)) {
      customFilterSectors.splice(idx, 1);
      renderSectorOtherChips();
      handleFiltersChanged();
    }
  });
}

if (keywordsInput && keywordChips) {
  renderKeywordChips();
  keywordsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitChipInput(keywordsInput, filterKeywords, renderKeywordChips);
    }
  });
  keywordsInput.addEventListener('blur', () => {
    if (keywordsInput.value.trim()) {
      commitChipInput(keywordsInput, filterKeywords, renderKeywordChips);
    }
  });
  keywordChips.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const chip = btn.closest('.keyword-chip');
    if (!chip) return;
    const idx = parseInt(chip.dataset.idx, 10);
    if (!isNaN(idx)) {
      filterKeywords.splice(idx, 1);
      renderKeywordChips();
      handleFiltersChanged();
    }
  });
}

if (keywordClearAll) {
  keywordClearAll.addEventListener('click', () => {
    if (filterKeywords.length === 0) return;
    filterKeywords = [];
    renderKeywordChips();
    handleFiltersChanged();
  });
}

// ── Source browser + custom sources ───────────────────────────
const SOURCE_SELECTION_KEY = 'geosignal-source-selection';
const CUSTOM_SOURCES_KEY = 'geosignal-custom-sources';

// { include: Set<string>, exclude: Set<string> } — session copy that
// the browser modal mutates before committing on Save.
let registrySources = null;
const sourceSelection = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(SOURCE_SELECTION_KEY) || '{}');
    return {
      include: new Set(Array.isArray(raw.include) ? raw.include : []),
      exclude: new Set(Array.isArray(raw.exclude) ? raw.exclude : [])
    };
  } catch {
    return { include: new Set(), exclude: new Set() };
  }
})();

function getCustomSources() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_SOURCES_KEY) || '[]'); }
  catch { return []; }
}
function saveCustomSources(arr) {
  try { localStorage.setItem(CUSTOM_SOURCES_KEY, JSON.stringify(arr)); } catch {}
}

function slugifyBias(bias) {
  return 'bias-' + String(bias || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
}

async function loadRegistrySources() {
  if (registrySources) return registrySources;
  try {
    const res = await fetch('/api/sources/list');
    const data = await res.json();
    registrySources = Array.isArray(data.sources) ? data.sources : [];
  } catch (err) {
    console.error('Source list fetch failed:', err);
    registrySources = [];
  }
  return registrySources;
}

function updateSourceBrowserLegend() {
  if (!sourceBrowserLegend) return;
  const inc = sourceSelection.include.size;
  const exc = sourceSelection.exclude.size;
  sourceBrowserLegend.innerHTML =
    '<span class="source-include-count">' + inc + ' included</span>' +
    '<span class="source-exclude-count">' + exc + ' excluded</span>';
}

function renderSourceBrowserList(searchTerm) {
  if (!sourceBrowserBody) return;
  const all = (registrySources || []).concat(
    getCustomSources().map(cs => ({
      name: cs.name,
      region: 'Custom',
      regionKey: 'custom',
      tier: (cs.sourceType || 'Independent').toLowerCase(),
      category: cs.sourceType || 'Independent',
      country: cs.country || '',
      bias: cs.bias || 'Centre',
      description: cs.description || '',
      isCustom: true,
      url: cs.url || ''
    }))
  );

  const q = (searchTerm || '').trim().toLowerCase();
  const filtered = q
    ? all.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.country || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.region || '').toLowerCase().includes(q) ||
        (s.bias || '').toLowerCase().includes(q))
    : all;

  if (filtered.length === 0) {
    sourceBrowserBody.innerHTML = '<div class="source-browser-empty">No sources match your search.</div>';
    return;
  }

  // Group by region
  const byRegion = {};
  filtered.forEach(s => {
    const key = s.region || 'Other';
    if (!byRegion[key]) byRegion[key] = [];
    byRegion[key].push(s);
  });
  const regionOrder = ['Custom', 'Global', 'North America', 'Europe', 'Middle East',
                       'South Asia', 'East Asia', 'Southeast Asia', 'Africa',
                       'Latin America', 'Central Asia & Caucasus', 'Oceania', 'Other'];
  const orderedRegions = Object.keys(byRegion).sort((a, b) => {
    const ia = regionOrder.indexOf(a), ib = regionOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const buildRow = (s) => {
    const included = sourceSelection.include.has(s.name);
    const excluded = sourceSelection.exclude.has(s.name);
    const biasClass = slugifyBias(s.bias);
    const customBadge = s.isCustom ? '<span class="source-custom-badge">Custom</span>' : '';
    const meta = [
      s.bias ? `<span class="source-meta-chip bias-chip ${biasClass}">${escapeHtml(s.bias)}</span>` : '',
      s.category ? `<span class="source-meta-chip meta-tier">${escapeHtml(s.category)}</span>` : '',
      s.country ? `<span class="source-meta-chip meta-country">${escapeHtml(s.country)}</span>` : ''
    ].filter(Boolean).join('');
    return `<div class="source-row" data-source="${escapeHtml(s.name)}">
      <div class="source-row-main">
        <div class="source-row-title">${escapeHtml(s.name)}${customBadge}</div>
        <div class="source-row-meta">${meta}</div>
        ${s.description ? `<div class="source-row-desc">${escapeHtml(s.description)}</div>` : ''}
      </div>
      <div class="source-row-actions">
        <button class="source-action-btn ${included ? 'active-include' : ''}" data-act="include" type="button">${included ? '\u2713 Included' : 'Include'}</button>
        <button class="source-action-btn ${excluded ? 'active-exclude' : ''}" data-act="exclude" type="button">${excluded ? '\u2717 Excluded' : 'Exclude'}</button>
      </div>
    </div>`;
  };

  const html = orderedRegions.map(region => {
    const items = byRegion[region];
    const expanded = q || region === 'Custom'; // open automatically on search / custom section
    return `<div class="source-region-group ${expanded ? 'open' : ''}">
      <div class="source-region-header" data-region-toggle>
        <span>${escapeHtml(region)}</span>
        <span class="source-region-count">${items.length}</span>
      </div>
      <div class="source-region-list">
        ${items.map(buildRow).join('')}
      </div>
    </div>`;
  }).join('');

  sourceBrowserBody.innerHTML = html;

  // Region toggles (re-bound on each render — the elements are fresh)
  sourceBrowserBody.querySelectorAll('[data-region-toggle]').forEach(h => {
    h.addEventListener('click', () => h.closest('.source-region-group').classList.toggle('open'));
  });
}

// Include / exclude click delegation — bound ONCE to the persistent
// container so re-renders don't accumulate listeners.
if (sourceBrowserBody) {
  sourceBrowserBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.source-row');
    if (!row) return;
    const name = row.dataset.source;
    const act = btn.dataset.act;
    if (act === 'include') {
      if (sourceSelection.include.has(name)) sourceSelection.include.delete(name);
      else { sourceSelection.include.add(name); sourceSelection.exclude.delete(name); }
    } else if (act === 'exclude') {
      if (sourceSelection.exclude.has(name)) sourceSelection.exclude.delete(name);
      else { sourceSelection.exclude.add(name); sourceSelection.include.delete(name); }
    }
    renderSourceBrowserList(sourceBrowserSearch ? sourceBrowserSearch.value : '');
    updateSourceBrowserLegend();
  });
}

function openSourceBrowser() {
  if (!sourceBrowser) return;
  sourceBrowser.classList.add('visible');
  sourceBrowser.setAttribute('aria-hidden', 'false');
  sourceBrowserOverlay.classList.add('visible');
  sourceBrowserOverlay.setAttribute('aria-hidden', 'false');
  if (sourceBrowserSearch) sourceBrowserSearch.value = '';
  updateSourceBrowserLegend();
  loadRegistrySources().then(() => renderSourceBrowserList(''));
}
function closeSourceBrowser() {
  if (!sourceBrowser) return;
  sourceBrowser.classList.remove('visible');
  sourceBrowser.setAttribute('aria-hidden', 'true');
  sourceBrowserOverlay.classList.remove('visible');
  sourceBrowserOverlay.setAttribute('aria-hidden', 'true');
}

if (manageSourcesBtn) manageSourcesBtn.addEventListener('click', openSourceBrowser);
if (sourceBrowserClose) sourceBrowserClose.addEventListener('click', closeSourceBrowser);
if (sourceBrowserOverlay) sourceBrowserOverlay.addEventListener('click', closeSourceBrowser);

if (sourceBrowserSearch) {
  let t = null;
  sourceBrowserSearch.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => renderSourceBrowserList(sourceBrowserSearch.value), 120);
  });
}

if (sourceBrowserSave) {
  sourceBrowserSave.addEventListener('click', () => {
    try {
      localStorage.setItem(SOURCE_SELECTION_KEY, JSON.stringify({
        include: Array.from(sourceSelection.include),
        exclude: Array.from(sourceSelection.exclude)
      }));
    } catch {}
    closeSourceBrowser();
    handleFiltersChanged();
    showToast('Source preferences saved — press Apply to reload the feed.', { success: true, duration: 3000 });
  });
}

if (sourceBrowserReset) {
  sourceBrowserReset.addEventListener('click', () => {
    sourceSelection.include.clear();
    sourceSelection.exclude.clear();
    try { localStorage.removeItem(SOURCE_SELECTION_KEY); } catch {}
    updateSourceBrowserLegend();
    renderSourceBrowserList(sourceBrowserSearch ? sourceBrowserSearch.value : '');
  });
}

// ── Custom source add flow ──
function openCustomSource() {
  if (!customSourceOverlay) return;
  customSourceOverlay.classList.add('visible');
  customSourceOverlay.setAttribute('aria-hidden', 'false');
  if (customSourceInput) customSourceInput.value = '';
  if (customSourceStatus) { customSourceStatus.textContent = ''; customSourceStatus.className = 'custom-source-status'; }
  setTimeout(() => customSourceInput && customSourceInput.focus(), 80);
}
function closeCustomSource() {
  if (!customSourceOverlay) return;
  customSourceOverlay.classList.remove('visible');
  customSourceOverlay.setAttribute('aria-hidden', 'true');
}
if (sourceBrowserAddCustom) sourceBrowserAddCustom.addEventListener('click', openCustomSource);
if (customSourceCancel) customSourceCancel.addEventListener('click', closeCustomSource);
if (customSourceClose) customSourceClose.addEventListener('click', closeCustomSource);

if (customSourceSubmit) {
  customSourceSubmit.addEventListener('click', async () => {
    const val = (customSourceInput && customSourceInput.value || '').trim();
    if (!val) {
      customSourceStatus.textContent = 'Paste a URL or type a publication name first.';
      customSourceStatus.className = 'custom-source-status error';
      return;
    }
    const isUrl = /^https?:\/\//i.test(val);
    customSourceStatus.textContent = 'Fetching and classifying source\u2026';
    customSourceStatus.className = 'custom-source-status';
    customSourceSubmit.disabled = true;
    try {
      const res = await fetch('/api/enrich-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isUrl ? { url: val } : { name: val })
      });
      const data = await res.json();
      if (!res.ok) {
        customSourceStatus.textContent = data.error || 'Could not fetch details.';
        customSourceStatus.className = 'custom-source-status error';
        return;
      }
      const src = data.source;
      const existing = getCustomSources();
      // Dedup by name + url
      const dedupKey = (s) => (s.name + '|' + (s.url || '')).toLowerCase();
      if (!existing.some(s => dedupKey(s) === dedupKey(src))) {
        existing.push(src);
        saveCustomSources(existing);
      }
      if (src.enrichmentFailed) {
        customSourceStatus.textContent = 'Could not fetch details — added with limited info.';
        customSourceStatus.className = 'custom-source-status error';
      } else {
        customSourceStatus.textContent = 'Added. You can now include or exclude it.';
        customSourceStatus.className = 'custom-source-status success';
      }
      // Refresh the browser list so the new custom source shows up
      renderSourceBrowserList(sourceBrowserSearch ? sourceBrowserSearch.value : '');
      setTimeout(closeCustomSource, 900);
    } catch (err) {
      customSourceStatus.textContent = 'Network error. Try again.';
      customSourceStatus.className = 'custom-source-status error';
    } finally {
      customSourceSubmit.disabled = false;
    }
  });
}

// Collapsible filters
filtersToggle.addEventListener('click', () => {
  filtersContainer.classList.toggle('expanded');
});

// ── Filter state: applied vs pending ──────────────────────────
// Snapshot the filter state every time fetchStories() successfully
// applies. Comparing current form state against this lets us
// highlight the Apply button whenever filters are dirty.
let lastAppliedFilters = null;

const refreshBtnLabel = document.getElementById('refresh-btn-label');
const clearAllFiltersBtn = document.getElementById('clear-all-filters');
const stickyApplyBar = document.getElementById('sticky-apply-bar');
const stickyApplyBtn = document.getElementById('sticky-apply-btn');
const stickyApplyClear = document.getElementById('sticky-apply-clear');

function snapshotFilterState() {
  return {
    regions: getActiveRegions().slice().sort().join('|'),
    sectors: getActivePills(sectorPills).slice().sort().join('|'),
    sourceTypes: getActivePills(sourcePills).slice().sort().join('|'),
    articleTypes: (articleTypePills ? getActivePills(articleTypePills) : []).slice().sort().join('|'),
    locations: (locationsInput ? locationsInput.value.trim() : ''),
    dateRange: getActiveDateRange(),
    customSectors: customFilterSectors.slice().sort().join('|'),
    keywords: filterKeywords.slice().sort().join('|'),
    includeSources: Array.from(sourceSelection.include).sort().join('|'),
    excludeSources: Array.from(sourceSelection.exclude).sort().join('|'),
    search: (searchInput ? searchInput.value.trim() : '')
  };
}

function countActiveFilters() {
  // "Active" here means filters that actually narrow the feed from the default.
  // - Region: anything other than "Global" counts as 1
  // - Sectors: count how many are OFF (each deselected sector is a narrower filter) — but
  //   a more intuitive UX is to show how many sectors are ON.
  // - Source types: same — show how many are selected
  // - Search: 1 if non-empty
  // We'll report: region (if not Global) + sectors selected + source types selected + search
  let count = 0;
  const activeRegions = getActiveRegions();
  if (!(activeRegions.length === 1 && activeRegions[0] === 'Global')) count += activeRegions.length;
  count += getActivePills(sectorPills).length;
  count += getActivePills(sourcePills).length;
  if (articleTypePills) count += getActivePills(articleTypePills).length;
  if (locationsInput && locationsInput.value.trim()) count += 1;
  count += customFilterSectors.length;
  count += filterKeywords.length;
  count += sourceSelection.include.size;
  count += sourceSelection.exclude.size;
  if (searchInput && searchInput.value.trim()) count += 1;
  return count;
}

function updateClearAllVisibility() {
  if (!clearAllFiltersBtn) return;
  const anyActive = countActiveFilters() > 0;
  clearAllFiltersBtn.classList.toggle('visible', anyActive);
}

function clearAllFilters() {
  // Reset region to default
  if (regionPills) {
    regionPills.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('active', p.dataset.value === 'Global');
    });
  }
  // Deselect every pill in every group
  [sectorPills, sourcePills, articleTypePills].forEach(group => {
    if (!group) return;
    group.querySelectorAll('.pill.active').forEach(p => p.classList.remove('active'));
  });
  // Clear text-based filters
  if (locationsInput) locationsInput.value = '';
  if (sectorOtherInput) sectorOtherInput.value = '';
  if (keywordsInput) keywordsInput.value = '';
  if (searchInput) {
    searchInput.value = '';
    if (searchClear) searchClear.style.display = 'none';
  }
  // Wipe chip arrays and re-render
  customFilterSectors = [];
  filterKeywords = [];
  renderSectorOtherChips();
  renderKeywordChips();
  // Clear source include/exclude selections as well
  sourceSelection.include.clear();
  sourceSelection.exclude.clear();
  // Wipe persisted filters so the next page load starts fresh too
  try {
    localStorage.removeItem(FILTERS_KEY);
    localStorage.removeItem(SOURCE_SELECTION_KEY);
  } catch {}
  // Update UI state without fetching — user still has to press Apply
  handleFiltersChanged();
}

function updatePendingState() {
  if (!refreshBtn || !refreshBtnLabel) return;
  const applied = lastAppliedFilters;
  const current = snapshotFilterState();
  const isDirty = applied !== null && (
    applied.regions !== current.regions ||
    applied.sectors !== current.sectors ||
    applied.sourceTypes !== current.sourceTypes ||
    applied.articleTypes !== current.articleTypes ||
    applied.locations !== current.locations ||
    applied.dateRange !== current.dateRange ||
    applied.customSectors !== current.customSectors ||
    applied.keywords !== current.keywords ||
    applied.includeSources !== current.includeSources ||
    applied.excludeSources !== current.excludeSources ||
    applied.search !== current.search
  );

  if (isDirty) {
    refreshBtn.classList.add('has-pending');
    refreshBtnLabel.textContent = 'Apply changes';
    refreshBtn.setAttribute('title',
      'You have unapplied filter changes. Click to load articles with your current selections.');
  } else {
    refreshBtn.classList.remove('has-pending');
    refreshBtnLabel.textContent = 'Refresh results';
    refreshBtn.setAttribute('title',
      "Click to load articles based on your current filter selections. Do not use your browser's refresh button — that will reset your filters.");
  }

  // Mirror the dirty state into the sticky bottom bar so users don't
  // have to scroll up to hit Apply.
  if (stickyApplyBar) {
    stickyApplyBar.classList.toggle('visible', !!isDirty);
  }
}

function markFiltersApplied() {
  lastAppliedFilters = snapshotFilterState();
  updatePendingState();
}

function updateFiltersSummary() {
  const regionsLabel = getRegionsLabel();
  const activeRegions = getActiveRegions();
  const activeSectors = getActivePills(sectorPills);
  const totalSectors = sectorPills.querySelectorAll('.pill').length;

  // Build a compact, plain-English summary. No raw ratios like "2/8" —
  // those mean nothing on their own. Anything narrower than "all
  // sectors" gets spelled out as a sector count, and the filters
  // toggle carries a descriptive tooltip.
  let parts = [regionsLabel];
  let tooltip = 'Regions: ' + activeRegions.join(', ') + '. ';

  if (activeSectors.length === 0) {
    parts.push('no sectors selected');
    tooltip += 'No sectors selected — the feed is empty until you pick one.';
  } else if (activeSectors.length === totalSectors) {
    tooltip += 'All ' + totalSectors + ' sectors included.';
  } else {
    const label = activeSectors.length === 1 ? 'sector' : 'sectors';
    parts.push(activeSectors.length + ' ' + label);
    tooltip += 'Showing ' + activeSectors.length + ' of ' + totalSectors + ' sectors: ' +
      activeSectors.join(', ') + '.';
  }

  filtersSummary.textContent = parts.join(' · ');
  const toggleBtn = document.getElementById('filters-toggle');
  if (toggleBtn) toggleBtn.setAttribute('title', tooltip);
}

function handleFiltersChanged() {
  saveFilters();
  updateFiltersSummary();
  updateClearAllVisibility();
  updatePendingState();
}

// Update summary / clear-all visibility / pending state whenever filters change
if (regionPills) {
  initPills(regionPills);
  regionPills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0); });
}
sectorPills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0); });
sourcePills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0); });
if (articleTypePills) {
  articleTypePills.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0);
  });
}
if (searchInput) {
  searchInput.addEventListener('input', () => { updateClearAllVisibility(); updatePendingState(); });
}
if (locationsInput) {
  locationsInput.addEventListener('input', () => setTimeout(handleFiltersChanged, 0));
}
if (clearAllFiltersBtn) {
  clearAllFiltersBtn.addEventListener('click', clearAllFilters);
}
if (stickyApplyBtn) {
  stickyApplyBtn.addEventListener('click', fetchStories);
}
if (stickyApplyClear) {
  stickyApplyClear.addEventListener('click', clearAllFilters);
}
handleFiltersChanged();

// ── Utilities ───────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Date unavailable';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return 'Date unavailable';
  const diffMs = now - then;

  // Negative diff = future date or bogus timestamp
  if (diffMs < 0) return 'Date unavailable';

  const mins = Math.floor(diffMs / 60000);
  // Only show "Just now" if genuinely under 5 minutes
  if (mins < 5) return 'Just now';
  if (mins < 60) return mins + ' minutes ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : hours + ' hours ago';

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / (24 * 60 * 60 * 1000));
  const actualDate = then.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
    year: now.getFullYear() === then.getFullYear() ? undefined : 'numeric'
  });

  if (dayDiff === 1) return 'Yesterday — ' + actualDate;
  if (dayDiff <= 6) return dayDiff + ' days ago — ' + actualDate;

  // Older than 6 days: just the date
  return actualDate;
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

// Strip markdown emphasis marks (**bold**, __bold__, *italic*) that the AI
// sometimes emits despite being told to use plain text
function stripMd(str) {
  if (!str) return '';
  return str
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '');
}

// Clean a raw RSS description into a short fallback TL;DR shown until
// the AI summary arrives. Prefers cutting at a sentence end; falls back
// to a word boundary with ellipsis if no sentence end is nearby.
function cleanFallback(str) {
  if (!str) return '';
  const text = stripMd(str).replace(/\s+/g, ' ').trim();
  if (text.length <= 200) return text;

  // Prefer the first sentence end within the first 220 chars
  const window = text.slice(0, 220);
  const sentenceEnd = window.search(/[.!?](?:\s|$)/);
  if (sentenceEnd >= 40) {
    return text.slice(0, sentenceEnd + 1);
  }

  // Otherwise cut at a word boundary around 180 chars
  return text.slice(0, 180).replace(/\s\S*$/, '') + '\u2026';
}

// Parse citation tags [Source] in a line and convert to clickable chips
// Slug helper for bias → CSS class
function biasToSlug(bias) {
  return 'bias-' + String(bias || 'unknown').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
}

// Returns the HTML for a small info indicator that sits next to a
// source name. The indicator carries data-source-name so the
// wireSourceInfoPopovers handler can build a popover on demand.
function sourceInfoIndicator(sourceName, meta) {
  const hasMeta = !!(meta && (meta.description || meta.bias || meta.country));
  return '<button class="source-info-btn" type="button" ' +
    'data-source-name="' + escapeHtml(sourceName) + '" ' +
    'aria-label="About ' + escapeHtml(sourceName) + '" ' +
    'title="' + (hasMeta ? 'About ' + escapeHtml(sourceName) : 'Bias information not available') + '">' +
    '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="6" cy="6" r="5"/>' +
      '<path d="M6 5.5v3"/>' +
      '<circle cx="6" cy="3.6" r="0.1" fill="currentColor" stroke="currentColor"/>' +
    '</svg>' +
  '</button>';
}

// Binds click handlers to every .source-info-btn inside the given
// container. Clicking shows a floating popover with metadata.
function wireSourceInfoPopovers(container, sourceMeta) {
  if (!container) return;
  container.querySelectorAll('.source-info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const name = btn.dataset.sourceName || '';
      const meta = (sourceMeta && sourceMeta[name]) || null;
      showSourceInfoPopover(btn, name, meta);
    });
  });
}

let activeSourcePopover = null;
function hideSourceInfoPopover() {
  if (activeSourcePopover) {
    activeSourcePopover.remove();
    activeSourcePopover = null;
  }
  document.removeEventListener('click', onDocClickForPopover, true);
}
function onDocClickForPopover(e) {
  if (activeSourcePopover && !activeSourcePopover.contains(e.target) &&
      !e.target.closest('.source-info-btn')) {
    hideSourceInfoPopover();
  }
}

function showSourceInfoPopover(anchorEl, name, meta) {
  hideSourceInfoPopover();
  const popover = document.createElement('div');
  popover.className = 'source-info-popover';
  if (meta) {
    const bias = meta.bias || 'Centre';
    const country = meta.country || 'Unknown';
    const type = meta.sourceType || meta.type || '';
    const desc = meta.description || '';
    popover.innerHTML =
      '<div class="spi-name">' + escapeHtml(name) + '</div>' +
      (desc ? '<div class="spi-desc">' + escapeHtml(desc) + '</div>' : '') +
      '<div class="spi-meta">' +
        '<span class="source-meta-chip bias-chip ' + biasToSlug(bias) + '">' + escapeHtml(bias) + '</span>' +
        (country ? '<span class="source-meta-chip meta-country">' + escapeHtml(country) + '</span>' : '') +
        (type ? '<span class="source-meta-chip meta-tier">' + escapeHtml(type) + '</span>' : '') +
      '</div>';
  } else {
    popover.innerHTML =
      '<div class="spi-name">' + escapeHtml(name) + '</div>' +
      '<div class="spi-desc">Bias information not available.</div>';
  }
  document.body.appendChild(popover);
  const rect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  let left = rect.left + window.scrollX - 10;
  let top = rect.bottom + window.scrollY + 6;
  if (left + popRect.width > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - popRect.width - 12);
  }
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  activeSourcePopover = popover;
  setTimeout(() => document.addEventListener('click', onDocClickForPopover, true), 10);
}

function renderCitations(line, citationMap) {
  line = stripMd(line);
  if (!citationMap) return escapeHtml(line);

  // Repair unclosed trailing citation tags like "...[Foreign Affairs"
  // that the AI sometimes emits. If the last "[" has no matching "]"
  // after it, append one so the regex below can capture it.
  const lastOpen = line.lastIndexOf('[');
  const lastClose = line.lastIndexOf(']');
  if (lastOpen > lastClose) {
    line = line + ']';
  }

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
// Splits a block of prose into individual sentences so that concise
// briefing mode can hide everything but the first one. Uses a
// lookbehind for [.!?] followed by whitespace and a capital letter —
// imperfect but handles ~95% of English prose without fragmenting
// common abbreviations.
function splitIntoSentences(text) {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'\u201C\u2018])/);
  return parts.map(p => p.trim()).filter(Boolean);
}

function formatBullets(text, citationMap) {
  if (!text) return '';
  text = stripMd(text);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hasBullets = lines.some(l => l.startsWith('- ') || l.startsWith('* '));
  if (!hasBullets) {
    // Prose: wrap each sentence in a span so concise mode can hide the rest
    const sentences = splitIntoSentences(text);
    if (sentences.length <= 1) return renderCitations(text, citationMap);
    return sentences
      .map(s => '<span class="briefing-sentence">' + renderCitations(s, citationMap) + '</span>')
      .join(' ');
  }

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
// Map article ID → TL;DR element. Position-based arrays broke when the
// render order (time groups) diverged from the request order.
let tldrElementsById = new Map();
let governmentCaveat = '';

// Convert numeric score to relevance label
function scoreToRelevance(score) {
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

// Dispatch header — today's date and a stats strip above the feed
function updateDispatchHeader(articles) {
  const dateEl = document.getElementById('dispatch-date');
  const stripEl = document.getElementById('stats-strip');
  if (!dateEl || !stripEl) return;

  const now = new Date();
  dateEl.textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const sourceSet = new Set();
  let highCount = 0;
  articles.forEach(a => {
    if (a.source) sourceSet.add(a.source);
    if (a.score !== undefined && scoreToRelevance(a.score) === 'HIGH') highCount++;
  });

  const stats = [
    {
      value: articles.length, label: 'Articles', clickable: false,
      tip: 'Total articles matching your current filters.'
    },
    {
      value: sourceSet.size, label: 'Sources', clickable: false,
      tip: 'Number of distinct publications represented in the feed right now.'
    },
    {
      value: highCount, label: 'Must read', clickable: highCount > 0, action: 'must-read',
      tip: 'Articles scored as High relevance based on your filters and profile. Click to jump to the first one.'
    }
  ];

  stripEl.innerHTML = stats.map((s, i) => {
    const divider = i < stats.length - 1 ? '<div class="stat-divider"></div>' : '';
    const tag = s.clickable ? 'button' : 'div';
    const cls = 'stat-item' + (s.clickable ? ' stat-item-clickable' : '');
    const dataAttr = s.clickable ? ' data-action="' + s.action + '"' : '';
    const titleAttr = s.tip ? ' title="' + escapeHtml(s.tip) + '"' : '';
    return '<' + tag + ' class="' + cls + '"' + dataAttr + titleAttr + '>' +
      '<div class="stat-value">' + s.value + '</div>' +
      '<div class="stat-label">' + s.label + '</div>' +
    '</' + tag + '>' + divider;
  }).join('');

  // Wire up the Must Read click — scroll to the first HIGH relevance card
  const mustReadBtn = stripEl.querySelector('[data-action="must-read"]');
  if (mustReadBtn) {
    mustReadBtn.addEventListener('click', () => {
      const firstHigh = document.querySelector('.card.relevance-high');
      if (firstHigh) {
        firstHigh.scrollIntoView({ behavior: 'smooth', block: 'start' });
        firstHigh.focus({ preventScroll: true });
        firstHigh.classList.add('card-flash');
        setTimeout(() => firstHigh.classList.remove('card-flash'), 1200);
      }
    });
  }
}

// ── Fetch Stories (RSS-powered) ─────────────────────────────────

// Fallback: when an RSS search returns 0 results, use Perplexity to find
// recent articles from the open web and render them into the feed.
async function runWebSearch(query) {
  feed.innerHTML =
    '<div class="loading-feed">' +
      '<div class="loading-pulse"></div>' +
      '<span>Searching the web for &ldquo;' + escapeHtml(query) + '&rdquo;&hellip;</span>' +
    '</div>';
  feedCount.textContent = '';
  feedTimestamp.textContent = '';

  try {
    const res = await fetch('/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();

    if (!res.ok) {
      feed.innerHTML = '<div class="empty-feed">Web search failed: ' + escapeHtml(data.error || 'Unknown error') + '</div>';
      return;
    }

    if (!data.articles || data.articles.length === 0) {
      feed.innerHTML = '<div class="empty-feed">Web search found no credible matches for &ldquo;' + escapeHtml(query) + '&rdquo;.</div>';
      return;
    }

    currentArticles = data.articles;
    governmentCaveat = data.governmentCaveat || '';
    feedCount.textContent = (data.articles.length === 1 ? '1 article' : data.articles.length + ' articles') + ' · web search';
    feedTimestamp.textContent = formatTimestamp();
    updateDispatchHeader(currentArticles);
    renderFeed(currentArticles);
    generateTldrs(currentArticles);
    markFiltersApplied();
    showRefreshConfirmation();
  } catch (err) {
    console.error('Web search error:', err);
    feed.innerHTML = '<div class="empty-feed">Couldn\u2019t reach the web-search service. Try again in a moment.</div>';
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('is-loading');
    if (stickyApplyBtn) stickyApplyBtn.classList.remove('is-loading');
  }
}

async function fetchStories() {
  const activeRegions = getActiveRegions();
  const region = getRegionsLabel(); // display label only
  const sectors = getActivePills(sectorPills);
  const sourceTypes = getActivePills(sourcePills);
  const articleTypes = articleTypePills ? getActivePills(articleTypePills) : ['News', 'Analysis'];
  const locations = locationsInput ? locationsInput.value.trim() : '';
  // Custom sectors typed in the "Other" input add to the sector list
  const allSectors = [...sectors, ...customFilterSectors];
  const keywordsStr = filterKeywords.join(',');

  if (allSectors.length === 0 || sourceTypes.length === 0) {
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

  if (refreshBtn) refreshBtn.classList.add('is-loading');
  if (stickyApplyBtn) stickyApplyBtn.classList.add('is-loading');
  if (refreshConfirmation) refreshConfirmation.classList.remove('visible');

  try {
    const profile = getProfile();
    const searchQuery = searchInput.value.trim();
    const params = new URLSearchParams({
      region, // display label kept for legacy log lines
      regions: activeRegions.join(','),
      sectors: allSectors.join(','),
      sourceTypes: sourceTypes.join(','),
      articleTypes: articleTypes.join(',')
    });
    if (profile) {
      params.set('profile', JSON.stringify(profile));
    }
    if (searchQuery) {
      params.set('search', searchQuery);
    }
    if (locations) {
      params.set('locations', locations);
    }
    if (keywordsStr) {
      params.set('keywords', keywordsStr);
    }
    params.set('dateRange', getActiveDateRange());
    if (sourceSelection.include.size > 0) {
      params.set('includeSources', Array.from(sourceSelection.include).join(','));
    }
    if (sourceSelection.exclude.size > 0) {
      params.set('excludeSources', Array.from(sourceSelection.exclude).join(','));
    }

    const res = await fetch('/api/news?' + params);
    const data = await res.json();

    if (!res.ok) {
      feed.innerHTML = '<div class="empty-feed">Something went wrong while fetching the feed. Give it another moment and try again.</div>';
      return;
    }

    if (!data.articles || data.articles.length === 0) {
      const q = searchInput.value.trim();
      if (q) {
        // Search query returned nothing from the RSS cache — offer a web search fallback.
        feed.innerHTML =
          '<div class="empty-feed">' +
            'No articles in GeoSignal\u2019s sources match &ldquo;' + escapeHtml(q) + '&rdquo; right now.<br><br>' +
            '<button id="web-search-fallback-btn" class="btn-primary" type="button">Search the web for &ldquo;' + escapeHtml(q) + '&rdquo;</button>' +
          '</div>';
        const btn = document.getElementById('web-search-fallback-btn');
        if (btn) btn.addEventListener('click', () => runWebSearch(q));
      } else {
        feed.innerHTML = '<div class="empty-feed">Nothing matches this combination just yet. Try a wider region, turn on more sectors, or clear your search to see what\u2019s moving.</div>';
      }
      return;
    }

    currentArticles = data.articles;
    governmentCaveat = data.governmentCaveat || '';

    // Smart rank: pipe the deterministic top-60 through the LLM
    // reranker before rendering. If the call fails or times out, we
    // keep the original order silently.
    let smartRankApplied = false;
    if (isSmartRankOn() && currentArticles.length > 1) {
      // Show a subtle hint in the feed count area so the extra latency
      // isn't a mystery to the user.
      feedCount.textContent = 'Smart-ranking\u2026';
      try {
        const rankController = new AbortController();
        const rankTimer = setTimeout(() => rankController.abort(), 14000);
        const rankRes = await fetch('/api/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articles: currentArticles.slice(0, 60),
            profile: getProfile(),
            activeFilters: {
              regions: getActiveRegions(),
              sectors: getActivePills(sectorPills),
              customSectors: customFilterSectors.slice(),
              keywords: filterKeywords.slice(),
              includeSources: (sourceSelection && sourceSelection.include) ? Array.from(sourceSelection.include) : [],
              excludeSources: (sourceSelection && sourceSelection.exclude) ? Array.from(sourceSelection.exclude) : []
            }
          }),
          signal: rankController.signal
        });
        clearTimeout(rankTimer);
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          if (Array.isArray(rankData.ranked) && rankData.ranked.length > 0 && !rankData.fallback) {
            // Merge the reranked prefix with the untouched tail (articles
            // beyond the 60 we sent).
            const tail = currentArticles.slice(60);
            currentArticles = rankData.ranked.concat(tail);
            smartRankApplied = true;
          }
        }
      } catch (err) {
        console.log('Smart-rank failed, keeping deterministic order:', err.message);
      }
    }

    feedCount.textContent = (currentArticles.length === 1
      ? '1 article'
      : currentArticles.length + ' articles') +
      (smartRankApplied ? ' \u00b7 smart-ranked' : '');
    feedTimestamp.textContent = formatTimestamp();

    updateDispatchHeader(currentArticles);
    renderFeed(currentArticles);
    // If the server had to broaden the filters to find enough results,
    // surface a one-line notice above the first card.
    if (data.broadenedNotice) {
      const notice = document.createElement('div');
      notice.className = 'broadened-notice';
      notice.textContent = data.broadenedNotice;
      feed.insertBefore(notice, feed.firstChild);
    }
    generateTldrs(currentArticles);

    // Filter state is now "applied" — clear the pending indicator and
    // snapshot the state that produced these results.
    markFiltersApplied();
    gsTracker.filtersApplied(snapshotFilterState());

    showRefreshConfirmation();

    // Generate cross-sector analysis if profile exists
    const crossProfile = getProfile();
    if (crossProfile && crossProfile.role && currentArticles.length >= 3) {
      fetchCrossSectorInsights(currentArticles, crossProfile, region);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    feed.innerHTML = '<div class="empty-feed">Couldn\u2019t reach the feed. Check your connection and try again.</div>';
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('is-loading');
    if (stickyApplyBtn) stickyApplyBtn.classList.remove('is-loading');
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
        '<span class="cross-sector-title">Cross-sector signals</span>' +
      '</div>' +
      '<div class="cross-sector-description">How this story connects to other sectors and areas beyond its primary topic.</div>' +
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

    // Map insight types to colors, plain-English labels, and tooltips
    const typeStyles = {
      'CAUSAL CHAIN': {
        cls: 'type-causal', label: 'Causal Chain',
        tip: 'A chain of cause and effect linking events across different sectors or actors.'
      },
      'SHARED ENTITY': {
        cls: 'type-entity', label: 'Common connection',
        tip: 'An actor, country, or organisation that links this article to another sector.'
      },
      'SECOND-ORDER EFFECT': {
        cls: 'type-second-order', label: 'Downstream impact',
        tip: 'How this event could indirectly affect other sectors or actors.'
      },
      'CONTRADICTION': {
        cls: 'type-contradiction', label: 'Contradiction',
        tip: 'Two stories that point in opposite directions or undermine each other.'
      }
    };

    let html =
      '<div class="cross-sector-bubble collapsed">' +
        '<button class="cross-sector-header" type="button" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
          '<span class="cross-sector-icon">&#9670;</span>' +
          '<span class="cross-sector-title">Cross-sector signals</span>' +
          '<svg class="cross-sector-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
        '</button>' +
        '<div class="cross-sector-description">How this story connects to other sectors and areas beyond its primary topic.</div>' +
        '<div class="cross-sector-body">';

    data.insights.forEach(insight => {
      const style = typeStyles[insight.type] || { cls: 'type-default', label: insight.type, tip: '' };
      const badgeTip = style.tip ? ' title="' + escapeHtml(style.tip) + '"' : '';
      html +=
        '<div class="cross-sector-pattern">' +
          '<div class="cross-sector-pattern-header">' +
            '<span class="cross-sector-type-badge ' + style.cls + '"' + badgeTip + '>' + escapeHtml(style.label) + '</span>' +
            '<span class="cross-sector-pattern-title">' + escapeHtml(stripMd(insight.topic)) + '</span>' +
          '</div>';

      if (insight.stories) {
        html += '<div class="cross-sector-stories">Connecting: ' + escapeHtml(stripMd(insight.stories)) + '</div>';
      }

      // Arrow-chain synopsis — shown for every insight type. The chain
      // node format is: "Actor/event → next node → final effect". We
      // emphasise the arrows by wrapping each node in a chip-like pill.
      if (insight.chain && insight.chain.trim()) {
        const nodes = insight.chain.split(/\s*→\s*|\s*->\s*/).map(s => s.trim()).filter(Boolean);
        if (nodes.length >= 2) {
          const nodesHtml = nodes
            .map(n => '<span class="cs-chain-node">' + escapeHtml(stripMd(n)) + '</span>')
            .join('<span class="cs-chain-arrow" aria-hidden="true">&rarr;</span>');
          html += '<div class="cross-sector-chain cs-chain-flow">' + nodesHtml + '</div>';
        } else {
          // Single node or unparsed — fall back to plain text
          html += '<div class="cross-sector-chain">' + escapeHtml(stripMd(insight.chain)) + '</div>';
        }
      }

      // Mechanism and takeaway as separate labeled bullets with citation chips
      html += '<ul class="cross-sector-bullets">';
      if (insight.mechanism) {
        html += '<li><span class="cs-bullet-label" title="How this story connects to the other sector or actor — the underlying mechanism.">How it connects:</span> ' + renderCitations(insight.mechanism, data.citationMap) + '</li>';
      }
      if (insight.takeaway) {
        html += '<li><span class="cs-bullet-label" title="What to keep an eye on as this plays out.">Watch:</span> ' + renderCitations(insight.takeaway, data.citationMap) + '</li>';
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
        if (!summary) return;
        const article = articles[i];
        const id = article.url || article.title;
        const el = tldrElementsById.get(id);
        if (!el) return;
        let cleaned = stripMd(summary).trim();
        if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';
        el.classList.remove('loading');
        el.textContent = cleaned;
      });
    }
  } catch (err) {
    console.error('TL;DR generation error:', err);
  }
}

// ── Impact Analysis ─────────────────────────────────────────────

async function fetchImpact(article, container) {
  const profile = getProfile();

  // Show the empty state only when NO profile fields are set. If the
  // user has filled any field (role, sectors, company, location, or
  // focus), the server can still produce a useful impact analysis.
  if (!isProfileSet()) {
    container.innerHTML =
      '<div class="impact-section impact-empty">' +
        '<div class="impact-header"><span class="impact-title">How This Impacts You</span></div>' +
        '<div class="impact-empty-body">' +
          '<p>This analysis is tailored to your role and sector. Set up your profile to see what this story means for you specifically.</p>' +
          '<button class="impact-empty-cta" type="button">Set up your profile</button>' +
        '</div>' +
      '</div>';
    const cta = container.querySelector('.impact-empty-cta');
    if (cta) {
      cta.addEventListener('click', (e) => {
        e.stopPropagation();
        openProfilePanel({
          onSave: () => {
            // Re-render this specific impact section with the fresh profile
            fetchImpact(article, container);
          }
        });
      });
    }
    return;
  }

  container.innerHTML =
    '<div class="impact-section">' +
      '<div class="impact-header"><span class="impact-title">Personalized Impact</span></div>' +
      '<div class="impact-loading"><div class="spinner"></div><span>Thinking about how this lands for you&hellip;</span></div>' +
    '</div>';

  try {
    // Bundle the user's active filter state so the server can check
    // ALL dimensions (role, company, country, regions, sectors,
    // keywords, included/excluded sources) for genuine relevance.
    const activeFilters = {
      regions: (typeof getActiveRegions === 'function') ? getActiveRegions() : [],
      sectors: (typeof getActivePills === 'function' && sectorPills) ? getActivePills(sectorPills) : [],
      customSectors: Array.isArray(customFilterSectors) ? customFilterSectors.slice() : [],
      keywords: Array.isArray(filterKeywords) ? filterKeywords.slice() : [],
      includeSources: (sourceSelection && sourceSelection.include) ? Array.from(sourceSelection.include) : [],
      excludeSources: (sourceSelection && sourceSelection.exclude) ? Array.from(sourceSelection.exclude) : []
    };

    const res = await fetch('/api/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: article.title, source: article.source,
        description: article.description, content: article.content,
        profile, activeFilters, url: article.url, region: article.region
      })
    });

    const data = await res.json();

    if (!res.ok || !data.impact) {
      container.innerHTML = '<div class="impact-section"><div class="briefing-error">Could not generate impact analysis. Try again in a moment.</div></div>';
      return;
    }

    const rawRelevance = String(data.relevance || 'MEDIUM').toUpperCase();
    const relevance = rawRelevance.toLowerCase();

    // NONE = model explicitly said "no genuine connection" — render a
    // clean "no forced analysis" state rather than fabricated bullets.
    if (rawRelevance === 'NONE') {
      container.innerHTML =
        '<div class="impact-section impact-none">' +
          '<div class="impact-header">' +
            '<span class="impact-title">How This Impacts You</span>' +
            '<span class="impact-badge none">No direct impact</span>' +
          '</div>' +
          '<div class="impact-body">' +
            '<p class="impact-none-body">' +
              (data.noImpactReason
                ? escapeHtml(data.noImpactReason)
                : 'This story does not appear to have a direct impact on your current focus areas. No forced analysis — check back if the situation develops.') +
            '</p>' +
          '</div>' +
        '</div>';
      return;
    }

    const sections = parseImpact(data.impact);

    let html =
      '<div class="impact-section">' +
        '<div class="impact-header">' +
          '<span class="impact-title">How This Impacts You</span>' +
          '<span class="impact-badge ' + relevance + '">' + rawRelevance + ' Relevance</span>' +
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
  text = stripMd(text || '');
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


// ── Render Feed ─────────────────────────────────────────────────

// Track which cards the user has expanded (for "read" state)
const readCards = new Set();

// Group articles by recency for visual hierarchy
function groupArticlesByTime(articles) {
  const now = Date.now();
  const groups = { breaking: [], today: [], week: [] };

  // "Breaking" must actually be breaking: published within the last 3
  // hours AND scoring at or above the 60th percentile of the feed.
  // Low-score articles — even if very recent — go into Today so they
  // don't pollute the Breaking header.
  const scores = articles.map(a => a.score || 0).sort((x, y) => x - y);
  const breakingThreshold = scores.length
    ? scores[Math.floor(scores.length * 0.6)]
    : 0;

  articles.forEach(a => {
    const pub = new Date(a.publishedAt).getTime();
    const hoursAgo = (now - pub) / (1000 * 60 * 60);
    const scoreOk = (a.score || 0) >= breakingThreshold;
    if (hoursAgo <= 3 && scoreOk) groups.breaking.push(a);
    else if (hoursAgo <= 24) groups.today.push(a);
    else groups.week.push(a);
  });
  return groups;
}

function renderFeed(articles) {
  feed.innerHTML = '';
  tldrElementsById = new Map();

  const groups = groupArticlesByTime(articles);
  let globalIndex = 0;

  // Featured story: the highest-scoring article in the first non-empty group
  let featuredArticle = null;
  for (const key of ['breaking', 'today', 'week']) {
    if (groups[key].length > 0) {
      featuredArticle = groups[key].reduce((best, a) =>
        (a.score || 0) > (best.score || 0) ? a : best, groups[key][0]);
      break;
    }
  }

  const groupLabels = [
    { key: 'breaking', label: 'Breaking', hint: 'Last 3 hours' },
    { key: 'today', label: 'Today', hint: 'Last 24 hours' },
    { key: 'week', label: 'Earlier', hint: 'Past week' }
  ];

  groupLabels.forEach(({ key, label, hint }) => {
    const groupArticles = groups[key];
    if (groupArticles.length === 0) return;

    // Section header with editorial ornament
    const section = document.createElement('div');
    section.className = 'feed-section';
    const countTip = groupArticles.length === 1
      ? '1 article in this time window (' + hint.toLowerCase() + ')'
      : groupArticles.length + ' articles in this time window (' + hint.toLowerCase() + ')';
    section.innerHTML =
      '<div class="feed-section-header" title="' + escapeHtml(countTip) + '">' +
        '<span class="feed-section-label">' + label + '</span>' +
        '<span class="feed-section-count">' + groupArticles.length + '</span>' +
        '<span class="section-rule"></span>' +
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
      const isFeatured = article === featuredArticle;
      card.className = 'card' + relevanceClass +
        (article.isOfficial ? ' card-is-official' : '') +
        (isFeatured ? ' card-featured' : '');
      card.setAttribute('tabindex', '0');
      card.dataset.cardIndex = index;

      const tldrFallback = article.description ? escapeHtml(cleanFallback(article.description)) : '';
      const officialBadge = article.isOfficial ? '<span class="card-official-badge">Official</span>' : '';
      const regionPill = article.region ? '<span class="card-region">' + escapeHtml(article.region) + '</span>' : '';
      const countryPill = (article.country && article.country !== article.region)
        ? '<span class="card-country" title="Primary country covered in this story">' + escapeHtml(article.country) + '</span>'
        : '';
      const tierLabel = article.sourceTier
        ? article.sourceTier.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : '';

      // Build the hover tooltip text shown when the user hovers the source
      // name or tier label. Includes: source name, one-line description
      // (if known), and the tier badge in plain English. Missing description
      // falls back gracefully to source + tier only.
      const sourceTierFriendly = ({
        'mainstream': 'Mainstream news',
        'business': 'Mainstream news (business)',
        'independent-left': 'Independent journalism (centre-left)',
        'independent-right': 'Independent journalism (centre-right)',
        'independent-critical': 'Independent journalism',
        'think-tank-academic': 'Think tank / academic',
        'government-official': 'Official government source',
        'regional': 'Regional mainstream news'
      })[article.sourceTier] || tierLabel || '';
      const sourceTooltipParts = [article.source];
      if (article.sourceDescription) sourceTooltipParts.push(article.sourceDescription);
      if (sourceTierFriendly) sourceTooltipParts.push('Type: ' + sourceTierFriendly);
      const sourceTooltip = sourceTooltipParts.filter(Boolean).join('\n\n');
      const sourceAttr = sourceTooltip
        ? ' title="' + escapeHtml(sourceTooltip) + '"'
        : '';

      // Article type label (News / Analysis / Opinion)
      const typeLabel = article.articleType || 'News';
      const typeClass = 'card-type-' + (typeLabel.toLowerCase().replace(/[^a-z]+/g, '-'));
      const typeTitle = ({
        'News': 'News — straight reporting from a newswire or mainstream desk',
        'Analysis': 'Analysis — explainer, feature, or research that interprets events',
        'Opinion': 'Opinion / op-ed — argument or personal viewpoint, not reporting'
      })[typeLabel] || typeLabel;
      const typeBadge = '<span class="card-type-label ' + typeClass + '" title="' + escapeHtml(typeTitle) + '">' + escapeHtml(typeLabel) + '</span>';

      const saved = isArticleSaved(article);
      const saveBtn =
        '<button class="card-save-btn' + (saved ? ' saved' : '') + '" ' +
        'aria-label="' + (saved ? 'Remove from saved' : 'Save for later') + '" ' +
        'title="' + (saved ? 'Saved' : 'Save for later') + '">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="' + (saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">' +
            '<path d="M3.5 2.5h9v11l-4.5-3-4.5 3v-11z"/>' +
          '</svg>' +
        '</button>';

      const badges = (officialBadge || regionPill || countryPill || saveBtn)
        ? '<div class="card-badges">' + officialBadge + regionPill + countryPill + saveBtn + '</div>'
        : '';

      const eyebrow = isFeatured ? '<div class="card-eyebrow">Lead Story</div>' : '';

      const thumbnailHtml = article.thumbnail
        ? '<div class="card-thumb"><img src="' + escapeHtml(article.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.card\').classList.add(\'no-thumb\');this.parentElement.remove()" /></div>'
        : '';

      if (article.thumbnail) card.classList.add('has-thumb');

      if (isFeatured) {
        // Featured: thumbnail on top, full width
        card.innerHTML =
          thumbnailHtml +
          eyebrow +
          '<div class="card-header">' +
            '<div class="card-title">' + escapeHtml(article.title) + '</div>' +
            badges +
          '</div>' +
          '<div class="card-meta">' +
            typeBadge +
            '<span class="card-source"' + sourceAttr + '>' + escapeHtml(article.source) + '</span>' +
            '<span class="card-dot"></span>' +
            '<span class="card-time">' + escapeHtml(timeAgo(article.publishedAt)) + '</span>' +
            (tierLabel ? '<span class="card-dot card-tier-meta"></span><span class="card-tier-meta"' + sourceAttr + '>' + escapeHtml(tierLabel) + '</span>' : '') +
          '</div>' +
          '<div class="card-tldr loading" data-index="' + index + '">' + tldrFallback + '</div>';
      } else {
        // Regular: thumbnail on the right as a square, body on the left
        card.innerHTML =
          '<div class="card-body">' +
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
            '<div class="card-tldr loading" data-index="' + index + '">' + tldrFallback + '</div>' +
          '</div>' +
          thumbnailHtml;
      }

      const tldrEl = card.querySelector('.card-tldr');
      const articleId = article.url || article.title;
      tldrElementsById.set(articleId, tldrEl);

      if (readCards.has(articleId)) {
        card.classList.add('card-read');
      }

      let expanded = false;
      let briefingEl = null;

      const toggleExpand = async () => {
        if (expanded) {
          if (briefingEl) { briefingEl.remove(); briefingEl = null; }
          if (typeof expandedAt === 'number') {
            gsTracker.articleTimeSpent(articleId, (Date.now() - expandedAt) / 1000);
          }
          expanded = false;
          return;
        }

        expanded = true;
        const wasUnread = !readCards.has(articleId);
        card.classList.add('card-expanded', 'card-read');
        readCards.add(articleId);
        if (wasUnread) recordBriefingOpened();
        gsTracker.articleOpened(article);
        const expandedAt = Date.now();

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

        // Progressive disclosure: Impact is collapsed by default
        const moreSections = document.createElement('div');
        moreSections.className = 'more-sections';
        moreSections.innerHTML =
          '<button class="more-section-toggle" data-section="impact" type="button">' +
            '<span class="more-section-icon">&#9670;</span>' +
            '<span class="more-section-label">How This Impacts You</span>' +
            '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
          '</button>' +
          '<div class="more-section-body" data-section-body="impact"></div>';

        briefingEl.appendChild(briefingContent);
        briefingEl.appendChild(moreSections);
        card.appendChild(briefingEl);

        // Track which sections have been loaded so we don't refetch
        const loaded = { impact: false };

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
        if (e.target.closest('.briefing') || e.target.closest('.impact-section')) return;

        // Save button toggles saved state without expanding the card
        const saveClick = e.target.closest('.card-save-btn');
        if (saveClick) {
          e.stopPropagation();
          const nowSaved = toggleSavedArticle(article);
          if (nowSaved) gsTracker.articleSaved(article);
          saveClick.classList.toggle('saved', nowSaved);
          saveClick.title = nowSaved ? 'Saved' : 'Save for later';
          saveClick.setAttribute('aria-label', nowSaved ? 'Remove from saved' : 'Save for later');
          const svg = saveClick.querySelector('svg');
          if (svg) svg.setAttribute('fill', nowSaved ? 'currentColor' : 'none');
          updateSavedButton();
          return;
        }

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

    // Prominent "Read original article on X →" link — first thing the
    // user sees inside the briefing panel, before any generated content.
    if (article.url) {
      const sourceLabel = article.source ? ' on ' + escapeHtml(article.source) : '';
      html += '<a class="briefing-original-link" href="' + escapeHtml(article.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M6 3H3v10h10v-3"/>' +
          '<path d="M10 2h4v4"/>' +
          '<path d="M7 9l7-7"/>' +
        '</svg>' +
        '<span>Read original article' + sourceLabel + ' &rarr;</span>' +
      '</a>';
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

    // Expert source links (collapsible) — each name carries an info
    // indicator that opens a bias/country/type popover on hover.
    if (data.expertSources && data.expertSources.length > 0) {
      const count = data.expertSources.length;
      const sourceMeta = data.sourceMeta || {};
      html += '<details class="expert-sources-details">';
      html += '<summary class="expert-sources-summary">' +
        '<span class="expert-sources-label">Sources Referenced</span>' +
        '<span class="expert-sources-count">' + count + '</span>' +
        '<svg class="expert-sources-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
        '</summary>';
      html += '<div class="expert-sources-list">';
      data.expertSources.forEach(es => {
        html += '<div class="expert-source-row">' +
          '<a class="expert-source-link" href="' + escapeHtml(es.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
            escapeHtml(es.source) + ': ' + escapeHtml(es.title) + ' &rarr;' +
          '</a>' +
          sourceInfoIndicator(es.source, sourceMeta[es.source]) +
        '</div>';
      });
      html += '</div></details>';
    }

    html += '</div>';
    container.innerHTML = html;
    wireSourceInfoPopovers(container, data.sourceMeta || {});

    // Show the one-time annotate onboarding hint on the first briefing
    // the user sees (dismissable; never shown again after dismissed).
    maybeShowAnnotateHint(container);

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
  text = stripMd(text || '');
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

// ── Annotate onboarding (first-use hint + NEW badge) ──────────
const ANNOTATE_HINT_DISMISSED_KEY = 'geosignal_annotate_hint_dismissed';
const ANNOTATE_USED_KEY = 'geosignal_annotate_used';

function isAnnotateHintDismissed() {
  return localStorage.getItem(ANNOTATE_HINT_DISMISSED_KEY) === 'true';
}

function markAnnotateHintDismissed() {
  localStorage.setItem(ANNOTATE_HINT_DISMISSED_KEY, 'true');
}

function hasUsedAnnotate() {
  return localStorage.getItem(ANNOTATE_USED_KEY) === 'true';
}

function markAnnotateUsed() {
  if (hasUsedAnnotate()) return;
  localStorage.setItem(ANNOTATE_USED_KEY, 'true');
  const toggleEl = document.querySelector('.annotate-toggle');
  if (toggleEl) toggleEl.classList.remove('has-new-indicator');
}

// Show the "NEW" indicator on the annotate toggle for users who
// haven't used it yet.
(function initAnnotateIndicator() {
  if (hasUsedAnnotate()) return;
  const toggleEl = document.querySelector('.annotate-toggle');
  if (toggleEl) toggleEl.classList.add('has-new-indicator');
})();

// Inject a one-time in-briefing hint pointing out the annotate feature
function maybeShowAnnotateHint(container) {
  if (!container) return;
  if (isAnnotateHintDismissed()) return;
  if (container.querySelector('.annotate-hint')) return; // already shown in this briefing

  const hint = document.createElement('div');
  hint.className = 'annotate-hint';
  hint.innerHTML =
    '<span class="annotate-hint-icon" aria-hidden="true">i</span>' +
    '<div class="annotate-hint-body">' +
      '<strong>Tip:</strong> highlight any word or phrase for an instant plain-English explanation.' +
    '</div>' +
    '<button class="annotate-hint-dismiss" type="button" aria-label="Dismiss tip">&times;</button>';

  // Insert as the very first child of the briefing content block
  const content = container.querySelector('.briefing-content') || container;
  content.insertBefore(hint, content.firstChild);

  hint.querySelector('.annotate-hint-dismiss').addEventListener('click', (e) => {
    e.stopPropagation();
    markAnnotateHintDismissed();
    hint.remove();
  });
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
      const cleanedExplanation = stripMd(data.explanation);
      annotateCache[cacheKey] = cleanedExplanation;
      annotatePopupBody.innerHTML =
        '<div class="annotate-popup-term">' + escapeHtml(term) + '</div>' +
        '<div class="annotate-popup-text">' + escapeHtml(cleanedExplanation) + '</div>';
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
  // Any interaction with the toggle counts as "used" for onboarding purposes
  markAnnotateUsed();
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
  markAnnotateUsed();
  const term = keyword.dataset.term || keyword.textContent;
  gsTracker.termAnnotated(term, '', '');
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
  if (!parentEl.closest('.briefing') && !parentEl.closest('.impact-section') && !parentEl.closest('.cross-sector-bubble')) return;

  markAnnotateUsed();
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
// Region changes no longer auto-fetch — they queue up as pending
// changes that the user commits by pressing "Apply changes".

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
    gsTracker.searchQuery(searchInput.value.trim());
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
