const feed = document.getElementById('feed');
const regionSelect = document.getElementById('region-select');
const sectorPills = document.getElementById('sector-pills');
const sourcePills = document.getElementById('source-pills');
const articleTypePills = document.getElementById('article-type-pills');
const locationsInput = document.getElementById('locations-input');
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
  'Finance & Banking', 'Oil & Gas / Energy', 'Technology', 'Healthcare & Pharma',
  'Defense & Aerospace', 'Real Estate', 'Agriculture & Food', 'Manufacturing',
  'Logistics & Supply Chain', 'Media & Communications', 'Government & Public Sector',
  'Education', 'Consulting', 'Legal', 'Retail & Consumer', 'General / Multiple'
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
  return !!(p && p.role && p.role.trim());
}

function saveProfile(profile) {
  const normalized = {
    role: (profile.role || '').trim(),
    industries: Array.isArray(profile.industries) ? profile.industries.filter(Boolean) : [],
    company: (profile.company || '').trim(),
    location: (profile.location || '').trim(),
    focus: (profile.focus || '').trim()
  };
  // Keep `industry` as a joined string for backward compatibility with server prompts
  normalized.industry = normalized.industries.join(', ');
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
      <label for="${idPrefix}-focus">Key concerns / topics you track <span class="optional">(optional)</span></label>
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
  return { role, industries, company, location, focus };
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

function openProfilePanel(options = {}) {
  panelSaveCallback = typeof options.onSave === 'function' ? options.onSave : null;
  renderProfileForm(profileFormMount, 'profile');
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
    const region = regionSelect ? regionSelect.value : 'Global';
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
}

// ── Wire up welcome modal ──
if (welcomeSaveBtn) {
  welcomeSaveBtn.addEventListener('click', () => {
    const data = readProfileFromForm(welcomeFormMount, 'welcome');
    if (!data.role.trim()) {
      const roleInput = welcomeFormMount.querySelector('#welcome-role');
      if (roleInput) roleInput.focus();
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (profilePanel.classList.contains('visible')) closeProfilePanel();
  }
});

if (profileSave) {
  profileSave.addEventListener('click', () => {
    const data = readProfileFromForm(profileFormMount, 'profile');
    if (!data.role.trim()) {
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
      region: regionSelect.value,
      sectors: getActivePills(sectorPills),
      sourceTypes: getActivePills(sourcePills),
      articleTypes: articleTypePills ? getActivePills(articleTypePills) : ['News', 'Analysis'],
      locations: locationsInput ? locationsInput.value.trim() : ''
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
    if (state && typeof state.region === 'string') {
      const hasOpt = Array.from(regionSelect.options).some(o => o.value === state.region);
      if (hasOpt) regionSelect.value = state.region;
    }
    if (state && Array.isArray(state.sectors)) applyPillState(sectorPills, state.sectors);
    if (state && Array.isArray(state.sourceTypes)) applyPillState(sourcePills, state.sourceTypes);
    if (state && Array.isArray(state.articleTypes) && articleTypePills) {
      applyPillState(articleTypePills, state.articleTypes);
    }
    if (state && typeof state.locations === 'string' && locationsInput) {
      locationsInput.value = state.locations;
    }
  } catch { /* ignore */ }
}

// Restore before wiring click listeners so the initial fetch uses saved state
restoreFilters();

initPills(sectorPills);
initPills(sourcePills);
if (articleTypePills) initPills(articleTypePills);

function getActivePills(container) {
  return Array.from(container.querySelectorAll('.pill.active'))
    .map(p => p.dataset.value);
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

const activeFiltersBadge = document.getElementById('active-filters-badge');
const activeFiltersBadgeCount = document.getElementById('active-filters-badge-count');
const activeFiltersBadgeText = document.getElementById('active-filters-badge-text');
const refreshBtnLabel = document.getElementById('refresh-btn-label');

function snapshotFilterState() {
  return {
    region: regionSelect.value,
    sectors: getActivePills(sectorPills).slice().sort().join('|'),
    sourceTypes: getActivePills(sourcePills).slice().sort().join('|'),
    articleTypes: (articleTypePills ? getActivePills(articleTypePills) : []).slice().sort().join('|'),
    locations: (locationsInput ? locationsInput.value.trim() : ''),
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
  if (regionSelect.value && regionSelect.value !== 'Global') count += 1;
  count += getActivePills(sectorPills).length;
  count += getActivePills(sourcePills).length;
  if (articleTypePills) count += getActivePills(articleTypePills).length;
  if (locationsInput && locationsInput.value.trim()) count += 1;
  if (searchInput && searchInput.value.trim()) count += 1;
  return count;
}

function updateActiveFiltersBadge() {
  const count = countActiveFilters();
  if (count === 0) {
    activeFiltersBadge.classList.remove('visible');
    return;
  }
  activeFiltersBadge.classList.add('visible');
  activeFiltersBadgeCount.textContent = String(count);
  activeFiltersBadgeText.textContent = count === 1 ? 'filter active' : 'filters active';
}

function updatePendingState() {
  if (!refreshBtn || !refreshBtnLabel) return;
  const applied = lastAppliedFilters;
  const current = snapshotFilterState();
  const isDirty = applied !== null && (
    applied.region !== current.region ||
    applied.sectors !== current.sectors ||
    applied.sourceTypes !== current.sourceTypes ||
    applied.articleTypes !== current.articleTypes ||
    applied.locations !== current.locations ||
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
}

function markFiltersApplied() {
  lastAppliedFilters = snapshotFilterState();
  updatePendingState();
}

function updateFiltersSummary() {
  const region = regionSelect.value;
  const activeSectors = getActivePills(sectorPills);
  const totalSectors = sectorPills.querySelectorAll('.pill').length;

  // Build a compact, plain-English summary. No raw ratios like "2/8" —
  // those mean nothing on their own. Anything narrower than "all
  // sectors" gets spelled out as a sector count, and the filters
  // toggle carries a descriptive tooltip.
  let parts = [region];
  let tooltip = 'Region: ' + region + '. ';

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
  updateActiveFiltersBadge();
  updatePendingState();
}

// Update summary/badge/pending state whenever filters change
regionSelect.addEventListener('change', handleFiltersChanged);
sectorPills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0); });
sourcePills.addEventListener('click', (e) => { if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0); });
if (articleTypePills) {
  articleTypePills.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill')) setTimeout(handleFiltersChanged, 0);
  });
}
if (searchInput) {
  searchInput.addEventListener('input', () => { updateActiveFiltersBadge(); updatePendingState(); });
}
if (locationsInput) {
  locationsInput.addEventListener('input', () => setTimeout(handleFiltersChanged, 0));
}
handleFiltersChanged();

// ── Utilities ───────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return '';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins === 1 ? '1 minute ago' : mins + ' minutes ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : hours + ' hours ago';

  // Calendar-based day comparison so "Yesterday" reflects the actual date,
  // not just a 24-hour window.
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / (24 * 60 * 60 * 1000));

  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return dayDiff + ' days ago';

  // Older than a week: show the actual date
  return then.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    year: now.getFullYear() === then.getFullYear() ? undefined : 'numeric'
  });
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
function formatBullets(text, citationMap) {
  if (!text) return '';
  text = stripMd(text);
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
  }
}

async function fetchStories() {
  const region = regionSelect.value;
  const sectors = getActivePills(sectorPills);
  const sourceTypes = getActivePills(sourcePills);
  const articleTypes = articleTypePills ? getActivePills(articleTypePills) : ['News', 'Analysis'];
  const locations = locationsInput ? locationsInput.value.trim() : '';

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

  if (refreshBtn) refreshBtn.classList.add('is-loading');
  if (refreshConfirmation) refreshConfirmation.classList.remove('visible');

  try {
    const profile = getProfile();
    const searchQuery = searchInput.value.trim();
    const params = new URLSearchParams({
      region,
      sectors: sectors.join(','),
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
            '<div style="margin-top:10px;font-size:12px;color:var(--text-tertiary)">Uses Perplexity to find recent articles across the open web.</div>' +
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
    feedCount.textContent = data.articles.length === 1
      ? '1 article'
      : data.articles.length + ' articles';
    feedTimestamp.textContent = formatTimestamp();

    updateDispatchHeader(currentArticles);
    renderFeed(currentArticles);
    generateTldrs(currentArticles);

    // Filter state is now "applied" — clear the pending indicator and
    // snapshot the state that produced these results.
    markFiltersApplied();

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
        '<span class="cross-sector-title">Related impacts across sectors</span>' +
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

    const count = data.insights.length;
    let html =
      '<div class="cross-sector-bubble collapsed">' +
        '<button class="cross-sector-header" type="button" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
          '<span class="cross-sector-icon">&#9670;</span>' +
          '<span class="cross-sector-title">Related impacts across sectors</span>' +
          '<span class="cross-sector-subtitle">' + count + ' pattern' + (count > 1 ? 's' : '') + ' detected — click to expand</span>' +
          '<svg class="cross-sector-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
        '</button>' +
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

  if (!profile || !profile.role) {
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
          expanded = false;
          return;
        }

        expanded = true;
        const wasUnread = !readCards.has(articleId);
        card.classList.add('card-expanded', 'card-read');
        readCards.add(articleId);
        if (wasUnread) recordBriefingOpened();

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

        // Save button toggles saved state without expanding the card
        const saveClick = e.target.closest('.card-save-btn');
        if (saveClick) {
          e.stopPropagation();
          const nowSaved = toggleSavedArticle(article);
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

    // Expert source links from think tank cross-referencing — collapsible
    if (data.expertSources && data.expertSources.length > 0) {
      const count = data.expertSources.length;
      html += '<details class="expert-sources-details">';
      html += '<summary class="expert-sources-summary">' +
        '<span class="expert-sources-label">Sources Referenced</span>' +
        '<span class="expert-sources-count">' + count + '</span>' +
        '<svg class="expert-sources-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>' +
        '</summary>';
      html += '<div class="expert-sources-list">';
      data.expertSources.forEach(es => {
        html += '<a class="expert-source-link" href="' + escapeHtml(es.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
          escapeHtml(es.source) + ': ' + escapeHtml(es.title) + ' &rarr;</a>';
      });
      html += '</div></details>';
    }

    if (article.url) {
      html += '<a class="card-link" href="' + escapeHtml(article.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Read original source &rarr;</a>';
    }

    html += '</div>';
    container.innerHTML = html;

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
