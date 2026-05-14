// ── Authentication (Clerk) ──────────────────────────────────────
// Optional sign-in via Clerk. When CLERK keys are configured server-
// side, /api/auth/config returns the publishable key and we lazy-
// load Clerk JS, mount the sign-in UI, and start syncing profile to
// the server. When disabled, the Sign In button stays hidden and the
// app behaves exactly as before (localStorage profile only).
window.__gsAuth = (() => {
  let clerk = null;
  let isSignedIn = false;
  let pendingProfile = null;

  async function getToken() {
    try {
      if (!clerk || !clerk.session) return null;
      return await clerk.session.getToken();
    } catch { return null; }
  }

  async function pushProfileToServer(profile) {
    const token = await getToken();
    if (!token) return false;
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ profile })
      });
      return res.ok;
    } catch { return false; }
  }

  async function pullProfileFromServer() {
    const token = await getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/profile', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.profile || null;
    } catch { return null; }
  }

  async function onSignInChange() {
    isSignedIn = !!(clerk && clerk.user);
    window.__gsAuth.isSignedIn = isSignedIn;
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) authBtn.style.display = isSignedIn ? 'none' : '';
    if (isSignedIn) {
      // First sign-in: pull server profile if present, otherwise
      // push the user's local profile up so it lives on the server.
      const serverProfile = await pullProfileFromServer();
      if (serverProfile) {
        localStorage.setItem('geosignal-profile', JSON.stringify(serverProfile));
        if (typeof location !== 'undefined') location.reload();
      } else {
        const local = localStorage.getItem('geosignal-profile');
        if (local) {
          try { await pushProfileToServer(JSON.parse(local)); } catch {}
        }
      }
    }
  }

  async function init() {
    let config;
    try {
      const r = await fetch('/api/auth/config');
      config = await r.json();
    } catch { return; }
    if (!config.enabled || !config.publishableKey) return;

    // Lazy-load Clerk JS from a public CDN. Simpler than the
    // account-specific subdomain pattern; works for any Clerk app.
    await new Promise((resolve, reject) => {
      if (window.Clerk) return resolve();
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    // Initialise Clerk with the publishable key. The browser bundle
    // exposes a Clerk constructor on window.
    if (!window.Clerk) {
      console.warn('Clerk JS failed to load');
      return;
    }
    try {
      clerk = (typeof window.Clerk === 'function')
        ? new window.Clerk(config.publishableKey)
        : window.Clerk;
      if (!clerk.publishableKey) clerk.publishableKey = config.publishableKey;
      await clerk.load();
    } catch (err) {
      console.warn('Clerk load failed:', err.message);
      return;
    }

    // Wire the Sign In button: open the Clerk hosted sign-in modal.
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
      authBtn.style.display = '';
      authBtn.addEventListener('click', () => {
        if (clerk.user) {
          clerk.openUserProfile();
        } else {
          clerk.openSignIn({ redirectUrl: window.location.href });
        }
      });
    }

    // Mount Clerk's UserButton (avatar + sign-out menu) when signed in.
    const userBtnMount = document.getElementById('user-button-mount');
    if (userBtnMount) {
      clerk.mountUserButton(userBtnMount, { afterSignOutUrl: '/' });
    }

    // Listen for auth state changes.
    clerk.addListener(onSignInChange);
    await onSignInChange();
  }

  return { init, isSignedIn, pushProfileToServer, pullProfileFromServer };
})();

// Kick off auth init in the background — non-blocking.
window.__gsAuth.init().catch(err => console.warn('Auth init failed:', err.message));

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
  function articleLiked(article) {
    if (!article) return;
    log('article_liked', {
      id: article.url || article.title,
      source: article.source || '',
      region: article.region || '',
      country: article.country || '',
      articleType: article.articleType || '',
      title: (article.title || '').slice(0, 120)
    });
  }
  function articleDisliked(article) {
    if (!article) return;
    log('article_disliked', {
      id: article.url || article.title,
      source: article.source || '',
      region: article.region || '',
      country: article.country || '',
      articleType: article.articleType || '',
      title: (article.title || '').slice(0, 120)
    });
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
      if (e.type === 'article_liked') {
        if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 2;
        if (e.region) regionCounts[e.region] = (regionCounts[e.region] || 0) + 2;
      }
      if (e.type === 'article_disliked') {
        if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) - 1;
        if (e.region) regionCounts[e.region] = (regionCounts[e.region] || 0) - 1;
      }
    });

    // Extract liked/disliked titles for LLM context
    const likedTitles = events.filter(e => e.type === 'article_liked' && e.title)
      .map(e => e.title).slice(-10);
    const dislikedTitles = events.filter(e => e.type === 'article_disliked' && e.title)
      .map(e => e.title).slice(-10);

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
      likedTitles,
      dislikedTitles,
      preferredFormat: conciseCount > detailedCount ? 'concise' : 'detailed',
      peakHour,
      peakHourLabel: (peakHour < 12 ? peakHour || 12 : peakHour - 12 || 12) +
        (peakHour < 12 ? 'am' : 'pm')
    };
  }

  return {
    articleOpened, articleTimeSpent, articleSaved,
    articleLiked, articleDisliked,
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

// Briefings are always shown in full (detailed). The concise/detailed
// toggle was removed — every briefing renders the entire prose block
// with inline citations.

// LLM-first ranking is always active — testMode=1 sent on every request.


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
  // If the user is signed in via Clerk, also persist to the server
  // so the profile syncs across devices. Anonymous users stay in
  // localStorage only.
  if (window.__gsAuth && window.__gsAuth.isSignedIn) {
    window.__gsAuth.pushProfileToServer(normalized).catch(() => {});
  }
}

function clearProfile() {
  localStorage.removeItem('geosignal-profile');
  localStorage.removeItem('geosignal_profile_complete');
  updateProfileButton();
}

// ── Profile form rendering (shared between welcome modal & side panel) ──
function renderProfileForm(mountEl, idPrefix) {
  const profile = getProfile() || {};

  mountEl.innerHTML = `
    <p class="profile-form-hint">
      Profile = who you are. <em>Regions, sectors, sources and keywords live in the sidebar</em> — your day-to-day filter view.
    </p>

    <div class="form-group">
      <label for="${idPrefix}-role">Your role</label>
      <input type="text" id="${idPrefix}-role" data-field="role"
             placeholder="e.g., Analyst, Founder, Consultant, Investor..." autocomplete="off" />
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

}

function readProfileFromForm(mountEl, idPrefix) {
  // The slide-in profile panel only edits identity fields now —
  // role / company / location / focus. Sector + keyword editing
  // happens in the sidebar (the day-to-day filter view), so we
  // preserve whatever the user previously set there.
  const existing = (typeof getProfile === 'function' ? getProfile() : null) || {};
  const role = mountEl.querySelector(`#${idPrefix}-role`).value;
  const company = mountEl.querySelector(`#${idPrefix}-company`).value;
  const location = mountEl.querySelector(`#${idPrefix}-location`).value;
  const focus = mountEl.querySelector(`#${idPrefix}-focus`).value;
  return {
    role,
    industries: Array.isArray(existing.industries) ? existing.industries : [],
    company,
    location,
    focus,
    customSectors: Array.isArray(existing.customSectors) ? existing.customSectors : [],
    keywords: Array.isArray(existing.keywords) ? existing.keywords : []
  };
}

// ── Welcome wizard (multi-step onboarding) ──
const WIZARD_REGIONS = ['Global','North America','Latin America','Europe',
  'Middle East','Africa','South Asia','East Asia','Southeast Asia',
  'Central Asia & Caucasus','Oceania'];

function initWizard() {
  // Populate sector cards
  const sectorsEl = document.getElementById('wiz-sectors');
  if (sectorsEl) {
    sectorsEl.innerHTML = SECTOR_OPTIONS.map(s =>
      '<div class="wizard-card" data-value="' + escapeHtml(s) + '">' +
        '<span class="wizard-card-check"></span>' +
        '<span>' + escapeHtml(s) + '</span>' +
      '</div>'
    ).join('');
    sectorsEl.addEventListener('click', (e) => {
      const card = e.target.closest('.wizard-card');
      if (card) card.classList.toggle('selected');
    });
  }

  // Populate region cards
  const regionsEl = document.getElementById('wiz-regions');
  if (regionsEl) {
    regionsEl.innerHTML = WIZARD_REGIONS.map(r =>
      '<div class="wizard-card' + (r === 'Global' ? ' selected' : '') + '" data-value="' + escapeHtml(r) + '">' +
        '<span class="wizard-card-check"></span>' +
        '<span>' + escapeHtml(r) + '</span>' +
      '</div>'
    ).join('');
    regionsEl.addEventListener('click', (e) => {
      const card = e.target.closest('.wizard-card');
      if (!card) return;
      const isGlobal = card.dataset.value === 'Global';
      card.classList.toggle('selected');
      // "Global" is mutually exclusive with specific regions.
      // Picking Global deselects everything else; picking anything
      // else deselects Global. Avoids the contradictory "Global +
      // Europe + Middle East" state.
      if (card.classList.contains('selected')) {
        if (isGlobal) {
          regionsEl.querySelectorAll('.wizard-card.selected').forEach(c => {
            if (c !== card) c.classList.remove('selected');
          });
        } else {
          const globalCard = regionsEl.querySelector('.wizard-card[data-value="Global"]');
          if (globalCard) globalCard.classList.remove('selected');
        }
      }
    });
  }

  // Keywords chip input
  const kwInput = document.getElementById('wiz-keywords');
  const kwChips = document.getElementById('wiz-keyword-chips');
  const wizKeywords = [];
  if (kwInput && kwChips) {
    kwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const raw = kwInput.value.trim().replace(/,+$/, '').trim();
        if (!raw) return;
        raw.split(',').map(s => s.trim()).filter(Boolean).forEach(term => {
          if (!wizKeywords.includes(term)) wizKeywords.push(term);
        });
        kwInput.value = '';
        kwChips.innerHTML = wizKeywords.map((k, i) =>
          '<span class="keyword-chip" data-idx="' + i + '">' + escapeHtml(k) +
          '<button type="button">&times;</button></span>'
        ).join('');
      }
    });
    kwChips.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const chip = btn.closest('.keyword-chip');
      if (!chip) return;
      const idx = parseInt(chip.dataset.idx, 10);
      if (!isNaN(idx)) { wizKeywords.splice(idx, 1); kwInput.dispatchEvent(new KeyboardEvent('keydown', {key: ','})); }
    });
  }

  // Source pill toggles
  document.querySelectorAll('.wizard-source-pill').forEach(pill => {
    pill.addEventListener('click', () => pill.classList.toggle('active'));
  });

  // Step management
  let currentStep = 1;
  const totalSteps = 4;
  const steps = document.querySelectorAll('.wizard-step');
  const dots = document.querySelectorAll('.wizard-dot');
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  const finishBtn = document.getElementById('wizard-finish');

  function goToStep(n) {
    currentStep = n;
    steps.forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === n));
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === n - 1);
      d.classList.toggle('done', i < n - 1);
    });
    backBtn.disabled = n === 1;
    if (n === totalSteps) {
      nextBtn.style.display = 'none';
      finishBtn.style.display = '';
    } else {
      nextBtn.style.display = '';
      finishBtn.style.display = 'none';
    }
  }

  if (backBtn) backBtn.addEventListener('click', () => { if (currentStep > 1) goToStep(currentStep - 1); });
  if (nextBtn) nextBtn.addEventListener('click', () => { if (currentStep < totalSteps) goToStep(currentStep + 1); });

  // Finish: collect all data, save profile, pre-fill filters
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      const role = (document.getElementById('wiz-role') || {}).value || '';
      const company = (document.getElementById('wiz-company') || {}).value || '';
      const location = (document.getElementById('wiz-location') || {}).value || '';

      const selectedSectors = Array.from(document.querySelectorAll('#wiz-sectors .wizard-card.selected'))
        .map(c => c.dataset.value);
      const selectedRegions = Array.from(document.querySelectorAll('#wiz-regions .wizard-card.selected'))
        .map(c => c.dataset.value);
      const selectedSources = Array.from(document.querySelectorAll('.wizard-source-pill.active'))
        .map(p => p.dataset.value);

      // Save profile
      saveProfile({
        role, company, location,
        industries: selectedSectors,
        keywords: wizKeywords.slice(),
        focus: '',
        customSectors: []
      });

      // Pre-fill filter panel from wizard selections
      if (regionPills) {
        regionPills.querySelectorAll('.pill').forEach(p => {
          if (selectedRegions.length === 0 || selectedRegions.includes('Global')) {
            p.classList.toggle('active', p.dataset.value === 'Global');
          } else {
            p.classList.toggle('active', selectedRegions.includes(p.dataset.value));
          }
        });
      }
      if (sectorPills) {
        sectorPills.querySelectorAll('.pill').forEach(p => {
          if (selectedSectors.length === 0) {
            p.classList.add('active'); // default: all sectors
          } else {
            p.classList.toggle('active', selectedSectors.includes(p.dataset.value));
          }
        });
      }
      if (sourcePills) {
        sourcePills.querySelectorAll('.pill').forEach(p => {
          p.classList.toggle('active', selectedSources.includes(p.dataset.value));
        });
      }

      // Set filter keywords from wizard
      filterKeywords = wizKeywords.slice();
      renderKeywordChips();

      saveFilters();
      // Push everything we just set onto the main filter pills back
      // into the sidebar so the two views start in sync. Otherwise
      // the sidebar looks empty even though the user just selected
      // 8 sectors / 3 regions / 5 keywords in the wizard.
      if (typeof window.__syncSidebarFromMain === 'function') {
        window.__syncSidebarFromMain();
      }
      hideWelcomeModal();
      handleProfileSaved('welcome');
      // Onboarding's whole point is to apply the user's selections.
      // Snapshot the filter state now so the pending-changes sticky
      // bar doesn't fire while the first fetch is in flight.
      if (typeof markFiltersApplied === 'function') markFiltersApplied();
      fetchStories();
    });
  }
}

function showWelcomeModal() {
  initWizard();
  welcomeOverlay.classList.add('visible');
  setTimeout(() => {
    const first = document.getElementById('wiz-role');
    if (first) first.focus();
  }, 200);
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
      // generateTldrs() removed — card preview now uses the article's
      // own description (collapsible), not an LLM-generated bullet list.
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

  // ── Profile → filter sync ──
  // When the user saves their profile, automatically update the
  // filter controls to reflect their profile choices so there's no
  // gap between "what I told GeoSignal about myself" and "what the
  // feed is actually filtering on".
  const p = getProfile();
  if (p) {
    // Sync sectors: activate pills that match profile.industries
    if (sectorPills && Array.isArray(p.industries) && p.industries.length > 0) {
      sectorPills.querySelectorAll('.pill').forEach(pill => {
        pill.classList.toggle('active', p.industries.includes(pill.dataset.value));
      });
    }

    // Sync regions: if profile.location matches a known region name,
    // activate that region pill. Common mappings:
    if (regionPills && p.location) {
      const loc = String(p.location).trim().toLowerCase();
      const regionMap = {
        'singapore': 'Southeast Asia', 'malaysia': 'Southeast Asia',
        'indonesia': 'Southeast Asia', 'thailand': 'Southeast Asia',
        'vietnam': 'Southeast Asia', 'philippines': 'Southeast Asia',
        'india': 'South Asia', 'pakistan': 'South Asia',
        'bangladesh': 'South Asia', 'sri lanka': 'South Asia',
        'china': 'East Asia', 'japan': 'East Asia',
        'south korea': 'East Asia', 'taiwan': 'East Asia',
        'united states': 'North America', 'usa': 'North America',
        'canada': 'North America', 'mexico': 'North America',
        'united kingdom': 'Europe', 'uk': 'Europe',
        'germany': 'Europe', 'france': 'Europe',
        'australia': 'Oceania', 'new zealand': 'Oceania',
        'brazil': 'Latin America', 'argentina': 'Latin America',
        'nigeria': 'Africa', 'kenya': 'Africa',
        'south africa': 'Africa', 'egypt': 'Middle East',
        'saudi arabia': 'Middle East', 'uae': 'Middle East',
        'israel': 'Middle East', 'turkey': 'Middle East'
      };
      const matchedRegion = regionMap[loc];
      if (matchedRegion) {
        regionPills.querySelectorAll('.pill').forEach(pill => {
          if (pill.dataset.value === matchedRegion) pill.classList.add('active');
        });
      }
    }

    // Sync keywords: merge profile keywords into filter keywords
    if (Array.isArray(p.keywords) && p.keywords.length > 0) {
      p.keywords.forEach(kw => {
        if (kw && !filterKeywords.includes(kw)) filterKeywords.push(kw);
      });
      renderKeywordChips();
    }

    saveFilters();
    handleFiltersChanged();
    // Push everything we just synced onto the main pills into the
    // sidebar too. Without this, the sidebar stays stale and the
    // user sees "I just told the wizard I care about X but the
    // sidebar still shows the defaults."
    if (typeof window.__syncSidebarFromMain === 'function') {
      window.__syncSidebarFromMain();
    }
  }

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
  // Mirror keyword chips into the top search bar so the user can see
  // what's filtering the feed at a glance — and so adding a country
  // in the sidebar visibly drives the search. Sidebar chips are
  // canonical; the search input reflects them.
  syncKeywordChipsToSearch();
}

function syncKeywordChipsToSearch() {
  if (!searchInput) return;
  // Only overwrite the search box when the current text either
  // matches what we last wrote OR is empty. If the user has typed an
  // ad-hoc query, don't clobber it.
  const lastSynced = searchInput.dataset.kwSynced || '';
  const current = searchInput.value;
  if (current && current !== lastSynced) return;
  const joined = filterKeywords.join(', ');
  searchInput.value = joined;
  searchInput.dataset.kwSynced = joined;
  if (typeof searchClear !== 'undefined' && searchClear) {
    searchClear.style.display = joined.length > 0 ? 'block' : 'none';
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

// Expanded keywords cache — maps custom sector terms to their
// LLM-expanded keyword lists so the server can match more broadly.
const expandedSectorKeywords = {};

async function expandAndCommitSector(inputEl, arr, renderFn) {
  if (!inputEl) return;
  const raw = inputEl.value.trim().replace(/,+$/, '').trim();
  if (!raw) return;
  const terms = raw.split(',').map(s => s.trim()).filter(Boolean);
  inputEl.value = '';

  for (const term of terms) {
    if (arr.includes(term)) continue;
    arr.push(term);
    renderFn();
    // Ask the server to expand the term into related keywords
    try {
      const res = await fetch('/api/expand-sector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.keywords) && data.keywords.length > 0) {
          expandedSectorKeywords[term] = data.keywords;
        }
      }
    } catch (err) {
      console.log('Sector expansion failed for', term, err.message);
    }
  }
  handleFiltersChanged();
}

if (sectorOtherInput && sectorOtherChips) {
  renderSectorOtherChips();
  sectorOtherInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      expandAndCommitSector(sectorOtherInput, customFilterSectors, renderSectorOtherChips);
    }
  });
  sectorOtherInput.addEventListener('blur', () => {
    if (sectorOtherInput.value.trim()) {
      expandAndCommitSector(sectorOtherInput, customFilterSectors, renderSectorOtherChips);
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

  // Capture which region groups are currently expanded BEFORE we
  // blow away the DOM — otherwise re-rendering on every include/
  // exclude click would collapse every section the user just opened,
  // forcing them to re-expand to keep picking sources from the same
  // region.
  const previouslyOpen = new Set(
    Array.from(sourceBrowserBody.querySelectorAll('.source-region-group.open'))
      .map(el => el.dataset.region)
      .filter(Boolean)
  );

  const html = orderedRegions.map(region => {
    const items = byRegion[region];
    // Open if: search active, custom section, or user had it open
    // before this re-render.
    const expanded = q || region === 'Custom' || previouslyOpen.has(region);
    return `<div class="source-region-group ${expanded ? 'open' : ''}" data-region="${escapeHtml(region)}">
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
  const customCount = Array.isArray(customFilterSectors) ? customFilterSectors.length : 0;
  const keywordCount = Array.isArray(filterKeywords) ? filterKeywords.length : 0;

  let parts = [regionsLabel];
  let tooltip = 'Regions: ' + activeRegions.join(', ') + '. ';

  if (activeSectors.length === 0 && customCount === 0 && keywordCount === 0) {
    parts.push('no sectors or keywords');
    tooltip += 'No sectors, custom topics, or keywords selected. The feed will use all 15 sectors by default.';
  } else if (activeSectors.length === 0 && (customCount > 0 || keywordCount > 0)) {
    const bits = [];
    if (customCount) bits.push(customCount + ' custom ' + (customCount === 1 ? 'topic' : 'topics'));
    if (keywordCount) bits.push(keywordCount + ' ' + (keywordCount === 1 ? 'keyword' : 'keywords'));
    parts.push(bits.join(' + '));
    tooltip += 'Using ' + bits.join(' and ') + ' only.';
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

// ── Sidebar navigation ──────────────────────────────────────────
// Clicking a sector in the left sidebar single-selects it (quick
// drill-down). Clicking "Popular" restores all sectors.
(function wireSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const overlay = document.getElementById('sidebar-overlay');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  const sidebarRegionPills = document.getElementById('sidebar-region-pills');
  const sidebarSectorPills = document.getElementById('sidebar-sector-pills');
  const sidebarSearchInput = document.getElementById('sidebar-search-input');
  const sidebarKeywordsInput = document.getElementById('sidebar-keywords-input');
  const sidebarKeywordChips = document.getElementById('sidebar-keyword-chips');
  const sidebarApplyBtn = document.getElementById('sidebar-apply-btn');
  const sidebarClearBtn = document.getElementById('sidebar-clear-btn');

  // Restore collapsed state from localStorage
  const SIDEBAR_COLLAPSED_KEY = 'geosignal_sidebar_collapsed';
  if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' && sidebar) {
    sidebar.classList.add('collapsed');
    if (expandBtn) expandBtn.classList.add('visible');
  }

  // Collapse / expand handlers
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener('click', () => {
      sidebar.classList.add('collapsed');
      if (expandBtn) expandBtn.classList.add('visible');
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
    });
  }
  if (expandBtn && sidebar) {
    expandBtn.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      expandBtn.classList.remove('visible');
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
    });
  }

  const closeSidebar = () => {
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  };
  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
    });
  }
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // ── Sidebar pills → sync with main filter pills ──
  // Clicking a sidebar pill toggles its active state AND mirrors
  // the change to the main filter pills (so the server gets the
  // right state). Two-way sync: sidebar ↔ main filter panel.
  function syncSidebarToMain() {
    // Sync sidebar region pills → main region pills
    if (sidebarRegionPills && regionPills) {
      const sidebarActive = new Set(
        Array.from(sidebarRegionPills.querySelectorAll('.sidebar-pill.active'))
          .map(p => p.dataset.value)
      );
      regionPills.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', sidebarActive.has(p.dataset.value));
      });
    }
    // Sync sidebar sector pills → main sector pills
    if (sidebarSectorPills && sectorPills) {
      const sidebarActive = new Set(
        Array.from(sidebarSectorPills.querySelectorAll('.sidebar-pill.active'))
          .map(p => p.dataset.value)
      );
      sectorPills.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', sidebarActive.has(p.dataset.value));
      });
    }
    handleFiltersChanged();
  }

  // Expose syncMainToSidebar via module scope so the welcome wizard,
  // profile save, and any other place that mutates the main filter
  // state can push it back into the sidebar.
  window.__syncSidebarFromMain = function syncMainToSidebar() {
    if (sidebarRegionPills && regionPills) {
      const mainActive = new Set(getActiveRegions());
      sidebarRegionPills.querySelectorAll('.sidebar-pill').forEach(p => {
        p.classList.toggle('active', mainActive.has(p.dataset.value));
      });
    }
    if (sidebarSectorPills && sectorPills) {
      const mainActive = new Set(getActivePills(sectorPills));
      sidebarSectorPills.querySelectorAll('.sidebar-pill').forEach(p => {
        p.classList.toggle('active', mainActive.has(p.dataset.value));
      });
    }
    if (sidebarKeywordChips) {
      sidebarKeywordChips.innerHTML = filterKeywords.map((k, i) =>
        '<span class="keyword-chip" data-idx="' + i + '">' + escapeHtml(k) +
        '<button type="button">&times;</button></span>'
      ).join('');
    }
    // Push profile values into the sidebar inputs so the sidebar
    // is the single editable surface — role / company / focus /
    // country auto-fill after wizard or profile save.
    const prof = (typeof getProfile === 'function' ? getProfile() : null) || {};
    const sidebarLoc = document.getElementById('sidebar-locations-input');
    if (sidebarLoc && prof.location && !sidebarLoc.value) sidebarLoc.value = prof.location;
    const sidebarRole = document.getElementById('sidebar-role-input');
    if (sidebarRole && prof.role && !sidebarRole.value) sidebarRole.value = prof.role;
    const sidebarCompany = document.getElementById('sidebar-company-input');
    if (sidebarCompany && prof.company && !sidebarCompany.value) sidebarCompany.value = prof.company;
    const sidebarFocus = document.getElementById('sidebar-focus-input');
    if (sidebarFocus && prof.focus && !sidebarFocus.value) sidebarFocus.value = prof.focus;
  };

  // Initial sync from main → sidebar
  window.__syncSidebarFromMain();

  // Wire sidebar pill toggles
  [sidebarRegionPills, sidebarSectorPills].forEach(container => {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const pill = e.target.closest('.sidebar-pill');
      if (pill) {
        pill.classList.toggle('active');
        syncSidebarToMain();
      }
    });
  });

  // Wire sidebar search → main search
  if (sidebarSearchInput) {
    sidebarSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchInput) searchInput.value = sidebarSearchInput.value;
        fetchStories();
        closeSidebar();
      }
    });
  }

  // Wire sidebar keywords
  if (sidebarKeywordsInput) {
    sidebarKeywordsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const raw = sidebarKeywordsInput.value.trim().replace(/,+$/, '');
        if (raw) {
          raw.split(',').map(s => s.trim()).filter(Boolean).forEach(term => {
            if (!filterKeywords.includes(term)) filterKeywords.push(term);
          });
          sidebarKeywordsInput.value = '';
          renderKeywordChips();
          window.__syncSidebarFromMain();
          handleFiltersChanged();
        }
      }
    });
  }
  if (sidebarKeywordChips) {
    sidebarKeywordChips.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const chip = btn.closest('.keyword-chip');
      if (!chip) return;
      const idx = parseInt(chip.dataset.idx, 10);
      if (!isNaN(idx)) {
        filterKeywords.splice(idx, 1);
        renderKeywordChips();
        window.__syncSidebarFromMain();
        handleFiltersChanged();
      }
    });
  }

  // Wire Apply and Clear
  if (sidebarApplyBtn) {
    sidebarApplyBtn.addEventListener('click', () => {
      syncSidebarToMain();
      fetchStories();
      closeSidebar();
    });
  }
  if (sidebarClearBtn) {
    sidebarClearBtn.addEventListener('click', () => {
      if (sidebarRegionPills) {
        sidebarRegionPills.querySelectorAll('.sidebar-pill').forEach(p => {
          p.classList.toggle('active', p.dataset.value === 'Global');
        });
      }
      if (sidebarSectorPills) {
        sidebarSectorPills.querySelectorAll('.sidebar-pill.active').forEach(p => p.classList.remove('active'));
      }
      filterKeywords = [];
      if (sidebarKeywordsInput) sidebarKeywordsInput.value = '';
      syncSidebarToMain();
      window.__syncSidebarFromMain();
    });
  }

  // ── Wire sidebar source-type pills ──
  const sidebarSourcePills = sidebar ? sidebar.querySelectorAll('[data-source-type]') : [];
  sidebarSourcePills.forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      // Sync to main source pills
      if (sourcePills) {
        sourcePills.querySelectorAll('.pill').forEach(p => {
          const match = Array.from(sidebarSourcePills).find(sp => sp.dataset.sourceType === p.dataset.value);
          if (match) p.classList.toggle('active', match.classList.contains('active'));
        });
      }
      handleFiltersChanged();
    });
  });

  // ── Wire sidebar date-range pills (single-select) ──
  const sidebarDateRange = document.getElementById('sidebar-date-range');
  if (sidebarDateRange) {
    sidebarDateRange.addEventListener('click', (e) => {
      const pill = e.target.closest('.sidebar-pill');
      if (!pill) return;
      sidebarDateRange.querySelectorAll('.sidebar-pill.active').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      // Sync to main date-range pills
      if (dateRangePills) {
        dateRangePills.querySelectorAll('.pill').forEach(p => {
          p.classList.toggle('active', p.dataset.value === pill.dataset.value);
        });
      }
      handleFiltersChanged();
    });
  }

  // ── Wire sidebar locations input → main locations + profile ──
  const sidebarLocations = document.getElementById('sidebar-locations-input');
  if (sidebarLocations) {
    // Prefill from profile so the sidebar shows what was previously
    // saved (e.g. by the wizard) instead of always starting empty.
    const p0 = (typeof getProfile === 'function' ? getProfile() : null) || {};
    if (p0.location && !sidebarLocations.value) sidebarLocations.value = p0.location;
    if (locationsInput && sidebarLocations.value && !locationsInput.value) {
      locationsInput.value = sidebarLocations.value;
    }
    sidebarLocations.addEventListener('input', () => {
      if (locationsInput) locationsInput.value = sidebarLocations.value;
      handleFiltersChanged();
    });
    // Persist to profile on blur so ranking + recall across sessions
    // know where the user is based — previously the value lived only
    // in the input element and was lost on refresh.
    sidebarLocations.addEventListener('blur', () => {
      const existing = (typeof getProfile === 'function' ? getProfile() : null) || {};
      const next = Object.assign({}, existing, { location: sidebarLocations.value.trim() });
      if (typeof saveProfile === 'function') saveProfile(next);
    });
  }

  // ── Inline profile fields (role, company, focus) ──
  // The slide-in profile panel is gone. Profile edits happen
  // directly in the sidebar so there's one editable surface.
  const sidebarRoleEl    = document.getElementById('sidebar-role-input');
  const sidebarCompanyEl = document.getElementById('sidebar-company-input');
  const sidebarFocusEl   = document.getElementById('sidebar-focus-input');
  // Prefill from existing profile.
  (function prefillSidebarProfile() {
    const p = (typeof getProfile === 'function' ? getProfile() : null) || {};
    if (sidebarRoleEl)    sidebarRoleEl.value = p.role || '';
    if (sidebarCompanyEl) sidebarCompanyEl.value = p.company || '';
    if (sidebarFocusEl)   sidebarFocusEl.value = p.focus || '';
  })();
  // Save on blur so we don't fire on every keystroke.
  let _profileSaveDeferred;
  const persistInlineProfile = () => {
    clearTimeout(_profileSaveDeferred);
    _profileSaveDeferred = setTimeout(() => {
      const existing = (typeof getProfile === 'function' ? getProfile() : null) || {};
      const sidebarLocEl = document.getElementById('sidebar-locations-input');
      const next = Object.assign({}, existing, {
        role: sidebarRoleEl ? sidebarRoleEl.value.trim() : (existing.role || ''),
        company: sidebarCompanyEl ? sidebarCompanyEl.value.trim() : (existing.company || ''),
        focus: sidebarFocusEl ? sidebarFocusEl.value.trim() : (existing.focus || ''),
        industries: Array.isArray(existing.industries) ? existing.industries : [],
        customSectors: Array.isArray(existing.customSectors) ? existing.customSectors : [],
        keywords: Array.isArray(existing.keywords) ? existing.keywords : [],
        // Sidebar location is the canonical source — use its current
        // value, not the stale snapshot from existing profile.
        location: sidebarLocEl ? sidebarLocEl.value.trim() : (existing.location || '')
      });
      if (typeof saveProfile === 'function') saveProfile(next);
    }, 400);
  };
  [sidebarRoleEl, sidebarCompanyEl, sidebarFocusEl].forEach(el => {
    if (!el) return;
    el.addEventListener('blur', persistInlineProfile);
    el.addEventListener('change', persistInlineProfile);
  });

  // ── Wire sidebar "Other" sector input ──
  const sidebarSectorOther = document.getElementById('sidebar-sector-other');
  const sidebarSectorOtherChips = document.getElementById('sidebar-sector-other-chips');
  if (sidebarSectorOther) {
    sidebarSectorOther.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        expandAndCommitSector(sidebarSectorOther, customFilterSectors, () => {
          if (sidebarSectorOtherChips) {
            sidebarSectorOtherChips.innerHTML = customFilterSectors.map((s, i) =>
              '<span class="keyword-chip" data-idx="' + i + '">' + escapeHtml(s) +
              '<button type="button">&times;</button></span>').join('');
          }
          renderSectorOtherChips();
        });
      }
    });
  }

  // ── Wire sidebar Manage Sources button ──
  const sidebarManageSources = document.getElementById('sidebar-manage-sources-btn');
  if (sidebarManageSources) {
    sidebarManageSources.addEventListener('click', () => {
      if (typeof openSourceBrowser === 'function') openSourceBrowser();
      closeSidebar();
    });
  }
})();

// ── Annotate first-briefing nudge ───────────────────────────────
// Replaces the old persistent orange banner above the feed. Now we
// render a one-time tooltip inside the FIRST briefing the user opens,
// pointing at the briefing body with a friendly "highlight any text"
// hint. Dismissed forever once the user clicks anywhere or × it.
const ANNOTATE_NUDGE_KEY = 'geosignal_annotate_nudge_seen';

function shouldShowAnnotateNudge() {
  try { return localStorage.getItem(ANNOTATE_NUDGE_KEY) !== 'true'; }
  catch { return false; }
}

function markAnnotateNudgeSeen() {
  try { localStorage.setItem(ANNOTATE_NUDGE_KEY, 'true'); } catch {}
}

// Inject the nudge into a freshly-rendered briefing container.
// Caller passes the .briefing-main element so the tooltip can anchor
// to the briefing body and auto-dismiss after engagement.
function injectAnnotateNudge(briefingMain) {
  if (!briefingMain || !shouldShowAnnotateNudge()) return;
  const nudge = document.createElement('div');
  nudge.className = 'annotate-nudge';
  nudge.innerHTML =
    '<div class="annotate-nudge-bubble">' +
      '<div class="annotate-nudge-icon">' +
        '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M2 14l4-1 7-7a1.4 1.4 0 0 0-2-2L4 11z"/>' +
          '<path d="M9 5l2 2"/>' +
        '</svg>' +
      '</div>' +
      '<div class="annotate-nudge-body">' +
        '<strong>Try this →</strong> Highlight any word or phrase below for a plain-English explanation.' +
      '</div>' +
      '<button class="annotate-nudge-close" type="button" aria-label="Dismiss tip">&times;</button>' +
    '</div>';
  briefingMain.prepend(nudge);
  const dismiss = () => {
    if (!nudge.isConnected) return;
    markAnnotateNudgeSeen();
    nudge.classList.add('annotate-nudge-leaving');
    setTimeout(() => nudge.remove(), 250);
  };
  nudge.querySelector('.annotate-nudge-close').addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });
  // Dismiss on first text selection (the moment the user engages with annotate)
  const onSelect = () => {
    const sel = window.getSelection();
    if (sel && String(sel).trim().length > 0) {
      dismiss();
      document.removeEventListener('mouseup', onSelect);
    }
  };
  document.addEventListener('mouseup', onSelect);
}

// ── Utilities ───────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Recent';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return 'Recent';
  const diffMs = now - then;

  // Negative diff = future date or bogus timestamp
  if (diffMs < 0) return 'Recent';

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

// Quick deterministic 32-bit string hash. Used to pick a consistent
// placeholder thumbnail color per topic/region.
function hashStringCheap(s) {
  let h = 0;
  if (!s) return 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

// Trim a string to at most N sentences AND M characters, keeping
// whole-sentence boundaries when possible. Used for the card
// preview text — short enough to scan, never cut mid-word.
function truncateToSentences(s, maxSentences, maxChars) {
  if (!s) return '';
  s = String(s).trim();
  if (s.length <= maxChars && (s.match(/[.!?](?:\s|$)/g) || []).length <= maxSentences) {
    return s;
  }
  const sentRe = /[^.!?]+(?:[.!?]+|$)/g;
  const sentences = (s.match(sentRe) || []).map(x => x.trim()).filter(Boolean);
  const kept = sentences.slice(0, maxSentences).join(' ').trim();
  if (kept.length <= maxChars) return kept;
  // Hard cap on char length, cut at last word boundary.
  const sliced = kept.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).replace(/[,;:\-]\s*$/, '') + '…';
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
  articles.forEach(a => { if (a.source) sourceSet.add(a.source); });

  // "Must read" = the top quartile of articles by score in this batch.
  // Using a relative threshold (not score >= 50) keeps the count
  // meaningful — otherwise registry-driven credibility lifts almost
  // every article over the old absolute cutoff, and the stat reads
  // "must-read: 50 of 50" which differentiates nothing.
  const scoredArticles = articles.filter(a => typeof a.score === 'number');
  let highCount = 0;
  if (scoredArticles.length >= 4) {
    const sorted = scoredArticles.map(a => a.score).sort((x, y) => y - x);
    const cutoff = sorted[Math.floor(sorted.length * 0.25)];
    highCount = scoredArticles.filter(a => a.score >= cutoff && a.score > 0).length;
    // Mark the corresponding cards so the click-to-jump still works.
    articles.forEach(a => {
      a._mustRead = (typeof a.score === 'number' && a.score >= cutoff && a.score > 0);
    });
  } else {
    articles.forEach(a => { a._mustRead = false; });
  }

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
      const firstHigh = document.querySelector('.card.card-must-read') || document.querySelector('.card.relevance-high');
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
    renderFeed(currentArticles, { coverageNote: data.coverageNote });
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
  // Build sector list. For custom sectors that have been expanded by the
  // LLM into keyword lists, include those expanded keywords in the query
  // so the server can match more broadly than just the literal term.
  const expandedTerms = customFilterSectors.flatMap(term => {
    const expanded = expandedSectorKeywords[term];
    return Array.isArray(expanded) ? expanded : [term];
  });
  let allSectors = [...sectors, ...expandedTerms];
  const keywordsStr = filterKeywords.join(',');

  // Fail-open: if the user has zero source types selected, auto-activate
  // the three non-Official defaults instead of showing an empty feed.
  let effectiveSourceTypes = sourceTypes;
  if (effectiveSourceTypes.length === 0 && sourcePills) {
    const defaults = ['Mainstream news', 'Think tanks & academic', 'Independent journalism'];
    sourcePills.querySelectorAll('.pill').forEach(p => {
      if (defaults.includes(p.dataset.value)) p.classList.add('active');
    });
    effectiveSourceTypes = defaults;
    saveFilters();
  }

  // Same fail-open for sectors: if ALL sector knobs are empty (no standard
  // pills, no custom sectors, no keywords), default to all 15 sectors.
  if (allSectors.length === 0 && filterKeywords.length === 0 && sectorPills) {
    sectorPills.querySelectorAll('.pill').forEach(p => p.classList.add('active'));
    allSectors = Array.from(sectorPills.querySelectorAll('.pill.active')).map(p => p.dataset.value);
    saveFilters();
  }

  const searchVal = searchInput.value.trim();
  const loadingMsg = searchVal
    ? 'Searching for &ldquo;' + escapeHtml(searchVal) + '&rdquo;'
    : 'Curating your feed\u2026';
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
      sourceTypes: effectiveSourceTypes.join(','),
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
    // Tell the server which articles the user already opened so they
    // get pushed to the bottom on refresh, surfacing fresh content.
    if (readCards && readCards.size > 0) {
      params.set('readArticles', Array.from(readCards).slice(0, 50).join(','));
    }
    params.set('testMode', '1'); // LLM-first ranking always active
    // Send behavioral patterns so the LLM can use engagement history
    const patterns = gsTracker.getPatternSummary();
    if (patterns) {
      params.set('patterns', JSON.stringify(patterns));
    }
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


    feedCount.textContent = currentArticles.length === 1
      ? '1 article'
      : currentArticles.length + ' articles';
    feedTimestamp.textContent = formatTimestamp();

    updateDispatchHeader(currentArticles);
    renderFeed(currentArticles, {
      coverageNote: data.coverageNote || data.broadenedNotice,
      pagination: {
        params: params.toString(),
        nextOffset: data.nextOffset,
        hasMore: !!data.hasMore
      }
    });

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
        el.classList.remove('loading');
        const bullets = Array.isArray(summary)
          ? summary.map(s => stripMd(String(s || '')).trim()).filter(Boolean).slice(0, 3)
          : (typeof summary === 'string' ? [stripMd(summary).trim()] : []);
        if (bullets.length === 0) return;
        el.innerHTML = '<ul class="card-tldr-bullets">' +
          bullets.map(b => '<li>' + escapeHtml(b) + '</li>').join('') +
          '</ul>';
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

// Ordered list of articles the user has opened this session — most
// recent last. Used to ask the LLM for "Recommended for you" picks
// related to whatever the user has been reading. Capped at 10 so
// the list doesn't grow forever.
const sessionReadingOrder = [];
function recordSessionRead(article) {
  if (!article || !article.url) return;
  const last = sessionReadingOrder[sessionReadingOrder.length - 1];
  if (last && last.url === article.url) return;
  sessionReadingOrder.push({
    title: article.title, source: article.source, region: article.region,
    url: article.url
  });
  if (sessionReadingOrder.length > 10) sessionReadingOrder.shift();
}

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

// Stash these on the module so the lazy-load sentinel can ask for
// more pages without round-tripping every variable.
let _feedPagination = null; // { nextOffset, hasMore, params, fetching, exhausted }

function renderFeed(articles, options) {
  feed.innerHTML = '';
  tldrElementsById = new Map();

  const coverageNote = (options && options.coverageNote) || '';
  if (coverageNote) {
    const noteEl = document.createElement('div');
    noteEl.className = 'feed-coverage-note';
    noteEl.textContent = coverageNote;
    feed.appendChild(noteEl);
  }
  // Reset pagination state on a fresh render. The caller updates this
  // via _feedPagination after fetching page 1 so the sentinel knows
  // how to ask for page 2.
  if (options && options.pagination) {
    _feedPagination = Object.assign(
      { fetching: false, exhausted: false },
      options.pagination
    );
  } else {
    _feedPagination = { fetching: false, exhausted: true };
  }

  // No featured article — every card identical.
  const featuredArticle = null;

  // Partition articles into category groups using the user's active
  // filters. Each article goes under the FIRST matching category in
  // priority order: keyword → narrow sector → narrow region.
  // Broadened (endless-scroll tail) articles always land in a final
  // "More you might like" group regardless of match.
  const userKeywords = Array.isArray(filterKeywords) ? filterKeywords.slice() : [];
  const userRegions = (typeof getActiveRegions === 'function' ? getActiveRegions() : []) || [];
  const userSectors = (typeof getActivePills === 'function' && sectorPills)
    ? getActivePills(sectorPills) : [];
  const totalRegions = 11;
  const totalSectors = SECTOR_OPTIONS.length;
  const narrowedRegions = (userRegions.length > 0 && userRegions.length < totalRegions)
    ? userRegions : [];
  const narrowedSectors = (userSectors.length > 0 && userSectors.length < totalSectors)
    ? userSectors : [];

  const groupBuckets = new Map();
  const broadenedBucket = [];
  const orderedLabels = [];
  const ensureBucket = (label) => {
    if (!groupBuckets.has(label)) {
      groupBuckets.set(label, []);
      orderedLabels.push(label);
    }
    return groupBuckets.get(label);
  };

  // Sort articles by score so each group's first card is its strongest.
  const sortedArticles = [...articles].sort((a, b) => (b.score || 0) - (a.score || 0));

  for (const a of sortedArticles) {
    if (a.broadened) { broadenedBucket.push(a); continue; }
    const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
    // 1) Keyword match — strongest user intent
    let placed = false;
    for (const kw of userKeywords) {
      const lcKw = String(kw).toLowerCase().trim();
      if (lcKw && text.includes(lcKw)) {
        ensureBucket(kw).push(a);
        placed = true;
        break;
      }
    }
    if (placed) continue;
    // 2) Narrow region — only when user picked specific regions (not all)
    if (narrowedRegions.length > 0 && a.region && narrowedRegions.includes(a.region)) {
      ensureBucket(a.region).push(a);
      continue;
    }
    // 3) Fallback — group by the article's own region for a clean
    //    Google-News-style visual structure.
    const fallbackLabel = a.region || 'Other';
    ensureBucket(fallbackLabel).push(a);
  }

  // Within each bucket, interleave so no single publisher dominates.
  // Bucket comes in score-sorted; if the top 5 are all "Philippine
  // Daily Inquirer", we round-robin them with other publishers so the
  // first card from each source surfaces before we start showing
  // seconds. Falls back to the original score order once every source
  // has had one slot.
  function diversifyBySource(articles) {
    if (!Array.isArray(articles) || articles.length < 3) return articles;
    const queues = new Map(); // source -> [articles]
    const sourceOrder = [];   // insertion order, preserves score priority
    for (const a of articles) {
      const src = (a.source || 'Unknown').toLowerCase();
      if (!queues.has(src)) {
        queues.set(src, []);
        sourceOrder.push(src);
      }
      queues.get(src).push(a);
    }
    if (queues.size === 1) return articles; // nothing to diversify
    const out = [];
    while (out.length < articles.length) {
      let drewSomething = false;
      for (const src of sourceOrder) {
        const q = queues.get(src);
        if (q && q.length > 0) {
          out.push(q.shift());
          drewSomething = true;
        }
      }
      if (!drewSomething) break;
    }
    return out;
  }

  // Build the final ordered list of groups. Pre-existing buckets
  // are already in insertion order; broadened group always last.
  const renderGroups = orderedLabels
    .map(label => ({ label, articles: diversifyBySource(groupBuckets.get(label)) }))
    .filter(g => g.articles.length > 0);
  if (broadenedBucket.length > 0) {
    renderGroups.push({ label: 'More you might like', articles: diversifyBySource(broadenedBucket), broadened: true });
  }
  // If we somehow ended up with one giant group, drop the header
  // (avoid showing a single "Other" header above the entire feed).
  const showHeaders = renderGroups.length > 1;

  let globalIndex = 0;

  renderGroups.forEach((group, groupIdx) => {
    const groupArticles = group.articles;
    const isLastGroup = groupIdx === renderGroups.length - 1;
    if (groupArticles.length === 0) return;

    const section = document.createElement('div');
    section.className = 'feed-section feed-section-unified'
      + (group.broadened ? ' feed-section-broadened' : '');
    if (showHeaders) {
      const headerHtml =
        '<div class="feed-category-header">' +
          '<span class="feed-category-label">' + escapeHtml(group.label) + '</span>' +
          '<span class="feed-category-count">' + groupArticles.length + '</span>' +
          '<span class="feed-category-rule"></span>' +
        '</div>';
      section.innerHTML = headerHtml + '<div class="feed-section-cards"></div>';
    } else {
      section.innerHTML = '<div class="feed-section-cards"></div>';
    }
    feed.appendChild(section);
    const cardsGrid = section.querySelector('.feed-section-cards');

    // Lazy render: paint the first 24 cards immediately, then paint
    // additional batches of 24 as the user scrolls near the bottom.
    // Avoids one giant DOM commit when the API returns 80+ articles.
    const BATCH = 24;
    let rendered = 0;
    const renderNextBatch = () => {
      const end = Math.min(rendered + BATCH, groupArticles.length);
      for (let i = rendered; i < end; i++) {
        renderOneCard(groupArticles[i]);
      }
      rendered = end;
      // Only disconnect the sentinel when we've drawn everything AND
      // this group can't fetch more from the server. For the last
      // group, we keep the observer alive so endless-scroll keeps
      // firing remote fetches as the user reaches the bottom.
      if (rendered >= groupArticles.length && sentinelObserver) {
        const canFetchMore = isLastGroup && _feedPagination && _feedPagination.hasMore;
        if (!canFetchMore) sentinelObserver.disconnect();
      }
    };

    let sentinelObserver = null;
    const renderOneCard = (article) => {
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
        (article._mustRead ? ' card-must-read' : '') +
        (isFeatured ? ' card-featured' : '');
      card.setAttribute('tabindex', '0');
      card.dataset.cardIndex = index;

      // Card preview = a single short sentence from the article's own
      // description. Shown inline (no disclosure click) so the card is
      // useful at a glance. Clicking anywhere on the card opens the
      // full briefing — no separate "Show summary" link needed.
      const summaryRaw = article.description ? cleanFallback(article.description) : '';
      const summaryShort = truncateToSentences(summaryRaw, 1, 160);
      const summaryHtml = summaryShort
        ? '<p class="card-summary-inline">' + escapeHtml(summaryShort) + '</p>'
        : '';
      const officialBadge = article.isOfficial ? '<span class="card-official-badge">Official</span>' : '';
      // The region tag should describe what the story is ABOUT, not
      // where the publisher is based. Prefer the extracted subject
      // country; fall back to source region only when we couldn't
      // identify a subject. This stops "Boeing 737 MAX" being tagged
      // SOUTHEAST ASIA just because Straits Times published it.
      const subjectCountry = article.country && article.country.trim();
      const subjectRegion = article.subjectRegion && article.subjectRegion.trim();
      const subjectLabel = subjectCountry || subjectRegion;
      const subjectPill = subjectLabel
        ? '<span class="card-region" title="Primary subject of this story">' + escapeHtml(subjectLabel) + '</span>'
        : (article.region ? '<span class="card-region card-region-source" title="Publisher region (no subject extracted)">' + escapeHtml(article.region) + '</span>' : '');
      // Keep the second pill (separate region/country) only when both
      // exist AND they differ from each other AND from what we already
      // showed — avoids two identical pills.
      const countryPill = (subjectRegion && subjectCountry && subjectCountry !== subjectRegion)
        ? '<span class="card-country" title="Region">' + escapeHtml(subjectRegion) + '</span>'
        : '';
      const regionPill = subjectPill;
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

      const feedbackBtns =
        '<div class="card-feedback">' +
          '<button class="card-feedback-btn card-like-btn" data-action="like" title="Interested — show more like this" aria-label="Interested">' +
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l1.5-1.5a2.12 2.12 0 0 1 3 3L8 9 3.5 4.5a2.12 2.12 0 0 1 3-3z"/></svg>' +
          '</button>' +
          '<button class="card-feedback-btn card-dislike-btn" data-action="dislike" title="Not interested — show less like this" aria-label="Not interested">' +
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>' +
          '</button>' +
        '</div>';

      const badges = (officialBadge || regionPill || countryPill || saveBtn || feedbackBtns)
        ? '<div class="card-badges">' + officialBadge + regionPill + countryPill + feedbackBtns + saveBtn + '</div>'
        : '';

      const eyebrow = isFeatured ? '<div class="card-eyebrow">Lead Story</div>' : '';

      // Thumbnails are now strictly optional. If the article has one
      // that survives the trust check below, we render it. If not, the
      // card shows no image at all (the title carries the card).
      // Trust check: drop thumbnails whose host doesn't match the
      // article URL's host — that's how we caught the soccer image
      // attached to a Vietnam IP story (wrong og:image at the source).
      let trustedThumb = '';
      if (article.thumbnail && typeof article.thumbnail === 'string') {
        try {
          const imgHost = new URL(article.thumbnail).hostname.replace(/^www\./, '');
          const artHost = article.url ? new URL(article.url).hostname.replace(/^www\./, '') : '';
          // Allow if hosts share a top-level domain (covers CDN subdomains
          // like img.publisher.com vs publisher.com).
          const sameRoot = artHost && (
            imgHost === artHost ||
            imgHost.endsWith('.' + artHost) ||
            artHost.endsWith('.' + imgHost) ||
            // Common shared registrable domain (foo.com vs cdn.foo.com)
            imgHost.split('.').slice(-2).join('.') === artHost.split('.').slice(-2).join('.')
          );
          if (sameRoot) trustedThumb = article.thumbnail;
        } catch {}
      }
      const thumbnailHtml = trustedThumb
        ? '<div class="card-thumb"><img src="' + escapeHtml(trustedThumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" /></div>'
        : '';

      if (trustedThumb) card.classList.add('has-thumb');
      else card.classList.add('no-thumb');


      const matchReasonHtml = article.matchReason
        ? '<div class="card-match-reason">' + escapeHtml(article.matchReason) + '</div>'
        : '';

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
          matchReasonHtml +
          summaryHtml;
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
            summaryHtml +
          '</div>' +
          thumbnailHtml;
      }

      const articleId = article.url || article.title;

      if (readCards.has(articleId)) {
        card.classList.add('card-read');
      }

      let expanded = false;
      let briefingEl = null;
      let overlayEl = null;
      let expandedAtTs = null;

      const closeOverlay = () => {
        if (!overlayEl) return;
        overlayEl.classList.remove('visible');
        const toRemove = overlayEl;
        setTimeout(() => { if (toRemove.parentNode) toRemove.parentNode.removeChild(toRemove); }, 200);
        overlayEl = null;
        briefingEl = null;
        document.body.classList.remove('briefing-overlay-open');
        card.classList.remove('card-expanded');
        if (typeof expandedAtTs === 'number') {
          gsTracker.articleTimeSpent(articleId, (Date.now() - expandedAtTs) / 1000);
        }
        expanded = false;
        document.removeEventListener('keydown', onOverlayKey);
      };

      const onOverlayKey = (e) => { if (e.key === 'Escape') closeOverlay(); };

      const toggleExpand = async () => {
        if (expanded) { closeOverlay(); return; }

        expanded = true;
        const wasUnread = !readCards.has(articleId);
        card.classList.add('card-expanded', 'card-read');
        readCards.add(articleId);
        recordSessionRead(article);
        if (wasUnread) recordBriefingOpened();
        gsTracker.articleOpened(article);
        expandedAtTs = Date.now();

        // Build the focused overlay: backdrop + centered panel that
        // holds the briefing. This replaces the old inline-expand
        // inside the grid card (which broke the 3-col layout and made
        // multiple briefings simultaneously visible).
        overlayEl = document.createElement('div');
        overlayEl.className = 'briefing-overlay';
        overlayEl.addEventListener('click', (e) => {
          if (e.target === overlayEl) closeOverlay();
        });

        const panel = document.createElement('div');
        panel.className = 'briefing-overlay-panel';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'briefing-overlay-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close briefing');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', closeOverlay);
        panel.appendChild(closeBtn);

        // Title strip at the top of the overlay — gives the user the
        // story title without forcing them to scroll back through
        // the dim feed underneath.
        const titleStrip = document.createElement('div');
        titleStrip.className = 'briefing-overlay-titlebar';
        titleStrip.innerHTML =
          '<div class="briefing-overlay-source">' + escapeHtml(article.source || '') + '</div>' +
          '<div class="briefing-overlay-title">' + escapeHtml(article.title || '') + '</div>';
        panel.appendChild(titleStrip);

        briefingEl = document.createElement('div');
        briefingEl.className = 'briefing briefing-with-recs';

        // Left rail: "Recommended for you" panel. Filled async from
        // /api/recommendations once we have a session reading history.
        const recsRail = document.createElement('aside');
        recsRail.className = 'briefing-recs-rail';
        recsRail.innerHTML =
          '<div class="briefing-recs-label">Recommended for you</div>' +
          '<div class="briefing-recs-list">' +
            '<div class="briefing-recs-loading">' +
              '<div class="skeleton-shimmer skeleton-line medium"></div>' +
              '<div class="skeleton-shimmer skeleton-line short"></div>' +
              '<div class="skeleton-shimmer skeleton-line medium"></div>' +
            '</div>' +
          '</div>';

        const briefingMain = document.createElement('div');
        briefingMain.className = 'briefing-main';

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

        // Follow-up chat box — lets the user ask questions about the
        // article and get a web-grounded answer.
        const chatBox = buildChatBox(article);

        briefingMain.appendChild(briefingContent);
        briefingMain.appendChild(moreSections);
        briefingMain.appendChild(chatBox);
        briefingEl.appendChild(recsRail);
        briefingEl.appendChild(briefingMain);
        panel.appendChild(briefingEl);
        overlayEl.appendChild(panel);
        document.body.appendChild(overlayEl);
        document.body.classList.add('briefing-overlay-open');
        // Trigger CSS transition
        requestAnimationFrame(() => overlayEl.classList.add('visible'));
        document.addEventListener('keydown', onOverlayKey);

        // First-time annotate nudge — only fires inside the user's
        // very first briefing, then never again.
        injectAnnotateNudge(briefingMain);

        // Fire recommendation fetch in parallel with the briefing.
        fetchRecommendationsFor(article, recsRail).catch(() => {});

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

        // The overlay manages its own scroll — no need to scroll the
        // grid card into view.
        // Only fetch the briefing immediately — Impact lazy-loads on click
        await fetchBriefing(article, briefingContent);
      };

      card.addEventListener('click', async (e) => {
        if (e.target.closest('.card-link')) return;
        if (e.target.closest('.no-profile-hint button')) return;
        if (e.target.closest('.annotate-keyword')) return;
        if (e.target.closest('.more-section-toggle')) return;
        if (e.target.closest('.briefing') || e.target.closest('.impact-section')) return;

        // Feedback buttons (like / dislike)
        const feedbackBtn = e.target.closest('.card-feedback-btn');
        if (feedbackBtn) {
          e.stopPropagation();
          const action = feedbackBtn.dataset.action;
          if (action === 'like') {
            gsTracker.articleLiked(article);
            feedbackBtn.classList.add('liked');
            feedbackBtn.title = 'Thanks — we\'ll show more like this';
            // Remove dislike state if present
            const disBtn = feedbackBtn.parentElement.querySelector('.card-dislike-btn');
            if (disBtn) disBtn.classList.remove('disliked');
          } else if (action === 'dislike') {
            gsTracker.articleDisliked(article);
            feedbackBtn.classList.add('disliked');
            feedbackBtn.title = 'Got it — less of this';
            const likeBtn = feedbackBtn.parentElement.querySelector('.card-like-btn');
            if (likeBtn) likeBtn.classList.remove('liked');
          }
          return;
        }

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

      cardsGrid.appendChild(card);
    };
    // end renderOneCard

    // Initial paint.
    renderNextBatch();

    // Sentinel + observer for lazy-loading more cards as the user
    // scrolls. Two modes:
    //   - Local: there are still articles in the array we haven't
    //     rendered yet. Just paint the next batch.
    //   - Remote: we've drawn everything we have locally AND the
    //     server told us there's a next page. Fetch it, append, keep
    //     watching.
    const sentinel = document.createElement('div');
    sentinel.className = 'feed-scroll-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    section.appendChild(sentinel);

    const maybeFetchMore = async () => {
      // Only the LAST group fetches more from the server. Earlier
      // groups stop rendering once they've drawn all their assigned
      // articles — the user keeps scrolling and hits the next group.
      if (!isLastGroup) {
        console.log('[paginate] sentinel hit on non-last group; skipping fetch');
        return;
      }
      if (!_feedPagination) { console.log('[paginate] no pagination state'); return; }
      if (_feedPagination.fetching) { console.log('[paginate] already fetching'); return; }
      if (_feedPagination.exhausted) { console.log('[paginate] exhausted'); return; }
      if (!_feedPagination.hasMore) { console.log('[paginate] hasMore=false'); return; }
      _feedPagination.fetching = true;
      console.log('[paginate] fetching offset=' + _feedPagination.nextOffset);
      try {
        const params = new URLSearchParams(_feedPagination.params);
        params.set('offset', String(_feedPagination.nextOffset));
        const res = await fetch('/api/news?' + params.toString());
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        const more = Array.isArray(data.articles) ? data.articles : [];
        console.log('[paginate] got ' + more.length + ' more articles, hasMore=' + data.hasMore);
        if (more.length === 0) {
          _feedPagination.exhausted = true;
          return;
        }
        currentArticles = currentArticles.concat(more);
        groupArticles.push(...more);
        renderNextBatch();
        // Live-update the feed-count label so the user sees the
        // total grow as they scroll.
        if (feedCount) {
          feedCount.textContent = currentArticles.length === 1
            ? '1 article'
            : currentArticles.length + ' articles';
        }
        _feedPagination.nextOffset = data.nextOffset;
        _feedPagination.hasMore = !!data.hasMore;
        if (!data.hasMore) _feedPagination.exhausted = true;
      } catch (err) {
        console.warn('Pagination fetch failed:', err.message);
        _feedPagination.exhausted = true;
      } finally {
        _feedPagination.fetching = false;
      }
    };

    sentinelObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        if (rendered < groupArticles.length) {
          renderNextBatch();
        } else {
          maybeFetchMore();
        }
      }
    }, { rootMargin: '800px 0px' });
    sentinelObserver.observe(sentinel);
  });
}

// ── Briefing Fetch ──────────────────────────────────────────────

// Fills the left-rail "Recommended for you" panel inside an expanded
// briefing. Sends the user's session reading history + the current
// pool to the server; renders 3 small cards on return. Failures
// hide the panel silently rather than showing an error.
async function fetchRecommendationsFor(currentArticle, railEl) {
  if (!railEl) return;
  const listEl = railEl.querySelector('.briefing-recs-list');
  if (!listEl) return;

  // Don't include the article being read in the pool.
  const seen = Array.from(readCards);
  const currentUrl = currentArticle && currentArticle.url;
  if (currentUrl && !seen.includes(currentUrl)) seen.push(currentUrl);

  // Slim down the pool we send — title + url + region + source is all
  // the LLM needs.
  const slimPool = (currentArticles || []).map(a => ({
    title: a.title, source: a.source, region: a.region, url: a.url
  }));

  try {
    const res = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recentArticles: sessionReadingOrder,
        currentPool: slimPool,
        alreadySeen: seen
      })
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
    if (recs.length === 0) {
      railEl.style.display = 'none';
      return;
    }
    listEl.innerHTML = recs.map(r => {
      const title = escapeHtml((r.title || '').slice(0, 110));
      const source = escapeHtml(r.source || '');
      const region = escapeHtml(r.region || '');
      const url = escapeHtml(r.url || '');
      const tone = Math.abs(hashStringCheap(r.region || r.source || r.title || '')) % 8;
      const label = escapeHtml((r.region && r.region !== 'Global' && r.region) || r.source || 'News');
      const thumb = r.thumbnail
        ? `<div class="briefing-rec-thumb"><img src="${escapeHtml(r.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.outerHTML='<div class=\\'briefing-rec-thumb thumb-placeholder thumb-tone-${tone}\\'><span>${label}</span></div>'"></div>`
        : `<div class="briefing-rec-thumb thumb-placeholder thumb-tone-${tone}"><span>${label}</span></div>`;
      return `<a class="briefing-rec-card" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
        ${thumb}
        <div class="briefing-rec-body">
          <div class="briefing-rec-title">${title}</div>
          <div class="briefing-rec-meta">${source}${region ? ' · ' + region : ''}</div>
        </div>
      </a>`;
    }).join('');
  } catch (err) {
    railEl.style.display = 'none';
  }
}

// Build the follow-up chat box that lives at the bottom of every
// expanded briefing. Lets the user ask questions about the article
// and get a Perplexity-grounded answer with citations.
function buildChatBox(article) {
  const container = document.createElement('div');
  container.className = 'briefing-chat';
  container.innerHTML =
    '<div class="briefing-chat-header">' +
      '<span class="briefing-chat-title">Ask a follow-up</span>' +
      '<span class="briefing-chat-hint">Get a web-grounded answer about this story</span>' +
    '</div>' +
    '<div class="briefing-chat-messages" aria-live="polite"></div>' +
    '<form class="briefing-chat-form">' +
      '<input type="text" class="briefing-chat-input" placeholder="What happened next? Who is X? Why does this matter for…" autocomplete="off" />' +
      '<button type="submit" class="briefing-chat-send">Ask</button>' +
    '</form>';

  const history = [];
  const messagesEl = container.querySelector('.briefing-chat-messages');
  const form = container.querySelector('.briefing-chat-form');
  const input = container.querySelector('.briefing-chat-input');
  const sendBtn = container.querySelector('.briefing-chat-send');

  const appendMessage = (role, contentHtml) => {
    const m = document.createElement('div');
    m.className = 'briefing-chat-msg briefing-chat-msg-' + role;
    m.innerHTML = contentHtml;
    messagesEl.appendChild(m);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return m;
  };

  form.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => e.stopPropagation());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const question = input.value.trim();
    if (!question) return;

    appendMessage('user', escapeHtml(question));
    history.push({ role: 'user', content: question });
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;
    const loading = appendMessage('assistant',
      '<span class="briefing-chat-loading"><span class="spinner"></span>Thinking…</span>');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: {
            title: article.title,
            source: article.source,
            region: article.region,
            url: article.url,
            publishedAt: article.publishedAt,
            description: article.description,
            content: article.content
          },
          question,
          history
        })
      });
      const data = await res.json();
      if (!res.ok || !data.answer) {
        loading.innerHTML = '<em>' + escapeHtml(data.error || 'Couldn’t get an answer. Try again.') + '</em>';
        return;
      }
      const rendered = renderCitations(data.answer, data.citationMap || {});
      let html = '<div class="briefing-chat-answer">' + rendered + '</div>';
      if (Array.isArray(data.sources) && data.sources.length > 0) {
        html += '<details class="briefing-chat-sources"><summary>Sources</summary><ul>';
        data.sources.forEach(s => {
          html += '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">'
                + escapeHtml(s.publication) + ' — ' + escapeHtml(s.title) + '</a></li>';
        });
        html += '</ul></details>';
      }
      loading.innerHTML = html;
      history.push({ role: 'assistant', content: data.answer });
    } catch (err) {
      loading.innerHTML = '<em>Network error. Try again.</em>';
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });

  return container;
}

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

    // Always highlight terms — annotation is a core feature, not opt-in.
    highlightTermsInElement(container);
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
  if (container.querySelector('.annotate-hint')) return;

  // Always show the annotate banner (not dismissable) — this is
  // a core feature that users love but consistently miss.
  const hint = document.createElement('div');
  hint.className = 'annotate-hint annotate-hint-permanent';
  hint.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="flex-shrink:0;color:var(--accent)">' +
      '<path d="M2 14l4-1 7-7a1.4 1.4 0 0 0-2-2L4 11z"/><path d="M9 5l2 2"/>' +
    '</svg>' +
    '<div class="annotate-hint-body">' +
      '<strong>Tap any highlighted term</strong> for an instant plain-English explanation. Or select any text to look it up.' +
    '</div>';

  // Insert as the very first child of the briefing content block
  const content = container.querySelector('.briefing-content') || container;
  content.insertBefore(hint, content.firstChild);
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

// Clear search — also clears synced keyword chips so the user
// doesn't have to clear them in two places.
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.dataset.kwSynced = '';
  searchClear.style.display = 'none';
  if (Array.isArray(filterKeywords) && filterKeywords.length > 0) {
    filterKeywords = [];
    if (typeof renderKeywordChips === 'function') renderKeywordChips();
    if (typeof handleFiltersChanged === 'function') handleFiltersChanged();
  }
  fetchStories();
});

fetchStories();
