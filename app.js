(() => {
  'use strict';

  const WORKING_STORAGE_KEY = 'watch-archive.working.v3';
  const TVMAZE_BASE = 'https://api.tvmaze.com';
  const CURRENT_YEAR = new Date().getFullYear();
  const STATUS_OPTIONS = ['Watching', 'Completed', 'Recommended', 'On Hold', 'Dropped', 'Trash'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const state = {
    mode: new URLSearchParams(location.search).get('edit') === '1' ? 'edit' : 'published',
    publishedEntries: [],
    workingEntries: loadWorkingLibrary(),
    activeYear: CURRENT_YEAR,
    sort: { key: 'rating', direction: 'desc' },
    editingId: null,
    selectedShow: null,
    selectedSeasons: [],
    commentEntryId: null,
    searchToken: 0,
  };

  const el = Object.fromEntries([
    'yearHeading','yearTabs','editActions','publicModeBtn','modeBanner','publishedStatus','analyticsSection','analyticsTitle','analyticsSubtitle',
    'statTitles','statTitlesDetail','statHours','statHoursDetail','statRating','statRatingDetail','statGenres','statGenreDetail','statNetwork','statNetworkDetail',
    'genreBars','networkBars','statusBars','ratingTrend','trendLabel','addShowBtn','emptyAddBtn','publishExportBtn','importFile','resetWorkingBtn',
    'searchFilter','typeFilter','statusFilter','networkFilter','genreFilter','visibleCount','showsBody','emptyState','emptyTitle','emptyText',
    'showDialog','showForm','dialogEyebrow','dialogTitle','searchStep','detailsStep','chooseTvBtn','chooseMovieBtn','tvSearchArea','showSearchInput',
    'showSearchBtn','searchMessage','searchResults','manualEntryBtn','selectedShowCard','entryMediaType','entryTitle','entrySeason','entryYear','entryRating',
    'entryStatus','entryNetwork','entryGenres','entryEpisodeCount','entryEpisodesWatched','entryRuntime','entryStartDate','entryWatchedDate','entryImdb','entryTvdb',
    'entryComments','seasonField','episodeCountField','episodesWatchedField','tvdbField','runtimeLabel','releaseDateLabel','metadataMessage','backToSearchBtn','saveEntryBtn',
    'commentsDialog','commentsTitle','commentsBody','editFromCommentsBtn','toast'
  ].map(id => [id, document.getElementById(id)]));

  init();

  async function init() {
    fillStatusSelects();
    bindEvents();
    applyMode(false);
    await loadPublishedLibrary();
    if (state.mode === 'edit' && !state.workingEntries) {
      state.workingEntries = cloneEntries(state.publishedEntries);
      saveWorkingLibrary();
    }
    refreshEverything();
  }

  function bindEvents() {
    el.publicModeBtn.addEventListener('click', exitEditor);
    el.addShowBtn.addEventListener('click', openAddDialog);
    el.emptyAddBtn.addEventListener('click', openAddDialog);
    el.publishExportBtn.addEventListener('click', exportPublishedJson);
    el.importFile.addEventListener('change', importWorkingLibrary);
    el.resetWorkingBtn.addEventListener('click', resetWorkingFromPublished);

    [el.searchFilter, el.typeFilter, el.statusFilter, el.networkFilter, el.genreFilter].forEach(control => {
      control.addEventListener('input', renderTable);
      control.addEventListener('change', renderTable);
    });

    document.querySelectorAll('.sort-button').forEach(button => button.addEventListener('click', () => setSort(button.dataset.sort)));
    el.chooseTvBtn.addEventListener('click', chooseTvFlow);
    el.chooseMovieBtn.addEventListener('click', openMovieDetails);
    el.showSearchBtn.addEventListener('click', searchShows);
    el.showSearchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); searchShows(); }
    });
    el.manualEntryBtn.addEventListener('click', () => openManualTvDetails(el.showSearchInput.value.trim()));
    el.backToSearchBtn.addEventListener('click', showChoiceView);
    el.entrySeason.addEventListener('change', loadSelectedSeasonMetadata);
    el.entryMediaType.addEventListener('change', () => setFormType(el.entryMediaType.value));
    el.entryStatus.addEventListener('change', autoFillCompletedEpisodes);
    el.showForm.addEventListener('submit', saveEntryFromForm);
    document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => el.showDialog.close()));
    document.querySelectorAll('.close-comments').forEach(button => button.addEventListener('click', () => el.commentsDialog.close()));
    el.editFromCommentsBtn.addEventListener('click', () => {
      const id = state.commentEntryId;
      el.commentsDialog.close();
      if (id && state.mode === 'edit') openEditDialog(id);
    });
    el.showDialog.addEventListener('close', resetDialog);
  }

  async function loadPublishedLibrary() {
    if (state.mode === 'edit') el.publishedStatus.textContent = 'Loading published catalog…';
    try {
      const response = await fetch(`shows.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`shows.json returned ${response.status}`);
      const data = await response.json();
      const rawEntries = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(rawEntries)) throw new Error('shows.json does not contain an entries array');
      state.publishedEntries = rawEntries.map(normalizeEntry).filter(entry => entry.title);
      if (state.mode === 'edit') el.publishedStatus.textContent = `${state.publishedEntries.length} published entr${state.publishedEntries.length === 1 ? 'y' : 'ies'}`;
    } catch (error) {
      console.error(error);
      state.publishedEntries = [];
      if (state.mode === 'edit') {
        el.publishedStatus.textContent = 'Could not load shows.json';
        el.publishedStatus.title = 'GitHub Pages will serve shows.json normally. Opening index.html directly from disk can block local JSON requests.';
      }
    }
  }

  function loadWorkingLibrary() {
    try {
      const saved = JSON.parse(localStorage.getItem(WORKING_STORAGE_KEY));
      const entries = Array.isArray(saved) ? saved : saved?.entries;
      return Array.isArray(entries) ? entries.map(normalizeEntry) : null;
    } catch (error) {
      console.warn('Could not read local working copy.', error);
      return null;
    }
  }

  function saveWorkingLibrary() {
    localStorage.setItem(WORKING_STORAGE_KEY, JSON.stringify({ version: 3, entries: state.workingEntries || [] }));
  }

  function activeEntries() {
    return state.mode === 'edit' ? (state.workingEntries || []) : state.publishedEntries;
  }

  function applyMode(shouldRender = true) {
    const isEdit = state.mode === 'edit';
    document.body.classList.toggle('public-view', !isEdit);
    el.editActions.hidden = !isEdit;
    el.modeBanner.hidden = !isEdit;
    el.editFromCommentsBtn.hidden = !isEdit;
    el.emptyAddBtn.hidden = !isEdit;
    if (shouldRender) refreshEverything();
  }

  function exitEditor() {
    state.mode = 'published';
    const url = new URL(location.href);
    url.searchParams.delete('edit');
    history.replaceState({}, '', url);
    applyMode();
  }

  function normalizeEntry(raw) {
    const mediaType = raw.mediaType === 'movie' ? 'movie' : 'tv';
    return {
      id: raw.id || makeId(),
      mediaType,
      tvmazeId: nullableNumber(raw.tvmazeId),
      tvmazeSeasonId: nullableNumber(raw.tvmazeSeasonId),
      title: String(raw.title || '').trim(),
      season: mediaType === 'movie' ? null : (nullableNumber(raw.season) ?? 1),
      year: nullableNumber(raw.year) ?? CURRENT_YEAR,
      rating: normalizeRating(raw.rating),
      status: STATUS_OPTIONS.includes(raw.status) ? raw.status : 'Watching',
      network: String(raw.network || '').trim(),
      genres: Array.isArray(raw.genres) ? raw.genres.filter(Boolean).map(String) : splitGenres(raw.genres),
      episodeCount: mediaType === 'movie' ? null : nullableNumber(raw.episodeCount),
      episodesWatched: mediaType === 'movie' ? null : nullableNumber(raw.episodesWatched),
      runtime: nullableNumber(raw.runtime),
      startDate: String(raw.startDate || ''),
      watchedDate: String(raw.watchedDate || ''),
      imdb: cleanImdb(raw.imdb),
      tvdb: mediaType === 'movie' ? '' : (raw.tvdb ? String(raw.tvdb).trim() : ''),
      comments: String(raw.comments || ''),
      tvmazeUrl: String(raw.tvmazeUrl || ''),
      image: String(raw.image || ''),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  function refreshEverything() {
    refreshYearTabs();
    refreshFilters();
    renderAnalytics();
    renderTable();
  }

  function refreshYearTabs() {
    const years = new Set(activeEntries().map(entry => entry.year).filter(Number.isFinite));
    years.add(CURRENT_YEAR);
    const sorted = [...years].sort((a, b) => b - a);
    if (state.activeYear !== 'all' && !years.has(Number(state.activeYear))) state.activeYear = CURRENT_YEAR;
    el.yearTabs.innerHTML = sorted.map(year => `<button class="year-tab${Number(state.activeYear) === year ? ' active' : ''}" type="button" data-year="${year}">${year}</button>`).join('') +
      `<button class="year-tab all-years${state.activeYear === 'all' ? ' active' : ''}" type="button" data-year="all">All</button>`;
    el.yearTabs.querySelectorAll('.year-tab').forEach(button => button.addEventListener('click', () => {
      state.activeYear = button.dataset.year === 'all' ? 'all' : Number(button.dataset.year);
      refreshEverything();
    }));
    el.yearHeading.textContent = state.activeYear === 'all' ? 'All' : String(state.activeYear);
  }

  function fillStatusSelects() {
    el.statusFilter.innerHTML = '<option value="">All statuses</option>' + STATUS_OPTIONS.map(status => optionHTML(status, status)).join('');
    el.entryStatus.innerHTML = STATUS_OPTIONS.map(status => optionHTML(status, status)).join('');
  }

  function refreshFilters() {
    const yearEntries = getYearEntries();
    const selectedNetwork = el.networkFilter.value;
    const selectedGenre = el.genreFilter.value;
    const networks = uniqueSorted(yearEntries.map(entry => entry.network).filter(Boolean));
    const genres = uniqueSorted(yearEntries.flatMap(entry => entry.genres));
    el.networkFilter.innerHTML = '<option value="">All networks</option>' + networks.map(value => optionHTML(value, value)).join('');
    el.genreFilter.innerHTML = '<option value="">All genres</option>' + genres.map(value => optionHTML(value, value)).join('');
    if (networks.includes(selectedNetwork)) el.networkFilter.value = selectedNetwork;
    if (genres.includes(selectedGenre)) el.genreFilter.value = selectedGenre;
  }

  function getYearEntries() {
    const entries = activeEntries();
    return state.activeYear === 'all' ? entries.slice() : entries.filter(entry => Number(entry.year) === Number(state.activeYear));
  }

  function renderAnalytics() {
    if (state.activeYear === 'all') {
      el.analyticsSection.hidden = true;
      return;
    }
    el.analyticsSection.hidden = false;
    const entries = getYearEntries();
    const tvCount = entries.filter(entry => entry.mediaType === 'tv').length;
    const movieCount = entries.filter(entry => entry.mediaType === 'movie').length;
    const rated = entries.filter(entry => entry.rating !== null);
    const genres = uniqueSorted(entries.flatMap(entry => entry.genres));
    const totalMinutes = entries.reduce((sum, entry) => sum + watchedMinutes(entry), 0);
    const networkCounts = countBy(entries.map(entry => entry.network).filter(Boolean));
    const topNetwork = sortedCounts(networkCounts)[0];
    const genreCounts = countBy(entries.flatMap(entry => entry.genres));
    const statusCounts = countBy(entries.map(entry => entry.status));

    el.analyticsTitle.textContent = `${state.activeYear} statistics`;
    el.analyticsSubtitle.textContent = entries.length ? `A quick snapshot of what you watched in ${state.activeYear}.` : `Add titles to ${state.activeYear} and the dashboard will build itself.`;
    el.statTitles.textContent = String(entries.length);
    el.statTitlesDetail.textContent = `${tvCount} TV · ${movieCount} movie${movieCount === 1 ? '' : 's'}`;
    el.statHours.textContent = totalMinutes ? formatHours(totalMinutes) : '0';
    el.statHoursDetail.textContent = totalMinutes ? `${Math.round(totalMinutes).toLocaleString()} known minutes` : 'Add runtimes to calculate';
    el.statRating.textContent = rated.length ? (rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length).toFixed(1) : '—';
    el.statRatingDetail.textContent = rated.length ? `${rated.length} rated title${rated.length === 1 ? '' : 's'}` : 'No rated titles';
    el.statGenres.textContent = String(genres.length);
    el.statGenreDetail.textContent = genres.length ? `${genres.slice(0, 3).join(', ')}${genres.length > 3 ? '…' : ''}` : 'No genre data';
    el.statNetwork.textContent = topNetwork?.[0] || '—';
    el.statNetworkDetail.textContent = topNetwork ? `${topNetwork[1]} title${topNetwork[1] === 1 ? '' : 's'}` : 'No network data';

    renderBars(el.genreBars, sortedCounts(genreCounts).slice(0, 6));
    renderBars(el.networkBars, sortedCounts(networkCounts).slice(0, 6));
    renderBars(el.statusBars, STATUS_OPTIONS.map(status => [status, statusCounts[status] || 0]).filter(([, value]) => value > 0), true);
    renderRatingTrend(entries);
  }

  function watchedMinutes(entry) {
    if (!entry.runtime) return 0;
    if (entry.mediaType === 'movie') {
      if (entry.status === 'Trash') return 0;
      return entry.runtime;
    }
    let episodes = entry.episodesWatched;
    if (episodes === null && ['Completed', 'Recommended'].includes(entry.status)) episodes = entry.episodeCount;
    return Math.max(0, Number(episodes) || 0) * entry.runtime;
  }

  function renderBars(container, pairs, useStatusColors = false) {
    if (!pairs.length) {
      container.innerHTML = '<div class="empty-chart">Not enough data yet.</div>';
      return;
    }
    const max = Math.max(...pairs.map(([, value]) => value), 1);
    container.innerHTML = pairs.map(([label, value]) => {
      const cls = useStatusColors ? ` ${statusClassName(label)}` : '';
      return `<div class="bar-row"><span class="bar-label" title="${escapeAttr(label)}">${escapeHTML(label)}</span><span class="bar-track"><span class="bar-fill${cls}" style="width:${Math.max(4, value / max * 100)}%"></span></span><span class="bar-value">${value}</span></div>`;
    }).join('');
  }

  function renderRatingTrend(entries) {
    const buckets = Array.from({ length: 12 }, () => []);
    entries.forEach(entry => {
      if (entry.rating === null) return;
      const date = entry.watchedDate || entry.startDate;
      const month = date ? Number(date.slice(5, 7)) - 1 : -1;
      if (month >= 0 && month < 12) buckets[month].push(entry.rating);
    });
    const points = buckets.map((values, month) => ({ month, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null })).filter(point => point.value !== null);
    el.trendLabel.textContent = 'watch date · release fallback';
    if (!points.length) {
      el.ratingTrend.innerHTML = '<div class="empty-chart">Add ratings and watch/release dates to see a trend.</div>';
      return;
    }
    const width = 320, height = 115, left = 15, right = 8, top = 10, bottom = 20;
    const x = month => left + (month / 11) * (width - left - right);
    const y = value => top + ((10 - value) / 10) * (height - top - bottom);
    const linePoints = points.map(point => `${x(point.month).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    const monthLabels = [0, 2, 4, 6, 8, 10].map(month => `<text class="trend-label" x="${x(month)}" y="${height - 3}" text-anchor="middle">${MONTHS[month]}</text>`).join('');
    const grid = [0, 5, 10].map(value => `<line class="trend-grid" x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"></line><text class="trend-score" x="${left + 1}" y="${Math.max(8, y(value)-2)}">${value}</text>`).join('');
    const dots = points.map(point => `<circle class="trend-dot" cx="${x(point.month)}" cy="${y(point.value)}" r="3"><title>${MONTHS[point.month]}: ${point.value.toFixed(1)}</title></circle>`).join('');
    el.ratingTrend.innerHTML = `<svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Average rating trend by month">${grid}<polyline class="trend-line" points="${linePoints}"></polyline>${dots}${monthLabels}</svg>`;
  }

  function getFilteredEntries() {
    const query = el.searchFilter.value.trim().toLowerCase();
    const type = el.typeFilter.value;
    const status = el.statusFilter.value;
    const network = el.networkFilter.value;
    const genre = el.genreFilter.value;
    return getYearEntries().filter(entry => {
      if (type && entry.mediaType !== type) return false;
      if (status && entry.status !== status) return false;
      if (network && entry.network !== network) return false;
      if (genre && !entry.genres.includes(genre)) return false;
      if (query) {
        const haystack = [entry.title, entry.network, entry.status, entry.mediaType, entry.genres.join(' '), entry.comments].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const sorted = getFilteredEntries().sort(compareEntries);
    el.showsBody.innerHTML = sorted.map(renderRow).join('');
    el.visibleCount.textContent = String(sorted.length);
    el.emptyState.hidden = sorted.length !== 0;
    document.querySelector('.table-wrap').hidden = sorted.length === 0;
    if (sorted.length === 0) {
      const yearText = state.activeYear === 'all' ? 'your archive' : String(state.activeYear);
      el.emptyTitle.textContent = `Nothing in ${yearText} yet`;
      el.emptyText.textContent = state.mode === 'edit' ? 'Add a TV season or movie to your local working copy.' : 'Published titles for this year will appear here.';
    }
    updateSortIndicators();
    bindRowEvents();
  }

  function renderRow(entry) {
    const isEdit = state.mode === 'edit';
    const ratingStyle = entry.rating === null ? 'background:#34383b;color:#a3abb2;' : ratingStyleText(entry.rating);
    const networkClass = networkClassName(entry.network);
    const genres = entry.genres.join(', ');
    const trailer = trailerUrl(entry);
    const imdb = entry.imdb ? `https://www.imdb.com/title/${encodeURIComponent(entry.imdb)}/` : '';
    const tvdb = entry.tvdb ? `https://thetvdb.com/search?query=${encodeURIComponent(entry.title)}` : '';
    const titleButtonClass = isEdit ? 'title-button editable edit-entry' : 'title-button';
    const titleTag = entry.mediaType === 'movie' ? 'MOV' : 'TV';
    const season = entry.mediaType === 'movie' ? '—' : entry.season;
    const episodes = entry.mediaType === 'movie' ? '—' : (entry.episodeCount ?? '—');
    const runtime = entry.runtime ? `${entry.runtime}` : '—';
    const statusClass = statusClassName(entry.status);
    const rating = isEdit
      ? `<input class="rating-input" type="number" min="0" max="10" step="0.1" value="${entry.rating ?? ''}" placeholder="—" style="${ratingStyle}" aria-label="Rating for ${escapeAttr(entry.title)}">`
      : `<span class="rating-display" style="${ratingStyle}">${entry.rating ?? '—'}</span>`;
    const status = isEdit
      ? `<select class="inline-status ${statusClass}" aria-label="Status for ${escapeAttr(entry.title)}">${STATUS_OPTIONS.map(value => `<option value="${escapeAttr(value)}"${value === entry.status ? ' selected' : ''}>${escapeHTML(value)}</option>`).join('')}</select>`
      : `<span class="status-display ${statusClass}">${escapeHTML(entry.status)}</span>`;
    const noteClass = entry.comments.trim() ? ' note-active' : '';
    const links = [
      imdb ? `<a class="text-link" href="${escapeAttr(imdb)}" target="_blank" rel="noreferrer">IMDb</a>` : '',
      tvdb ? `<a class="text-link" href="${escapeAttr(tvdb)}" target="_blank" rel="noreferrer">TVDB</a>` : '',
      !imdb && !tvdb && entry.tvmazeUrl ? `<a class="text-link" href="${escapeAttr(entry.tvmazeUrl)}" target="_blank" rel="noreferrer">Maze</a>` : ''
    ].filter(Boolean).join('');

    return `<tr data-id="${escapeAttr(entry.id)}">
      <td class="title-cell" title="${escapeAttr(entry.title)}"><div class="title-wrap"><span class="media-badge">${titleTag}</span><button class="${titleButtonClass}" type="button">${escapeHTML(entry.title)}</button></div></td>
      <td class="center">${season}</td>
      <td class="rating-cell">${rating}</td>
      <td title="${escapeAttr(entry.network)}"><span class="network-text ${networkClass}">${escapeHTML(entry.network || '—')}</span></td>
      <td>${status}</td>
      <td class="genre-cell" title="${escapeAttr(genres)}">${escapeHTML(genres || '—')}</td>
      <td class="number ${entry.episodeCount === null ? 'muted-cell' : ''}">${episodes}</td>
      <td class="number ${entry.runtime === null ? 'muted-cell' : ''}">${runtime}</td>
      <td class="number ${!entry.startDate ? 'muted-cell' : ''}">${escapeHTML(formatDate(entry.startDate) || '—')}</td>
      <td class="center"><a class="icon-link" href="${escapeAttr(trailer)}" target="_blank" rel="noreferrer" title="Search YouTube for official trailer">YT</a></td>
      <td><div class="link-group">${links || '<span class="muted-cell">—</span>'}</div></td>
      <td class="center"><button class="table-action comment-entry${noteClass}" type="button" title="${entry.comments.trim() ? 'View comments' : 'No comments'}">✎</button></td>
      <td class="edit-only-column"><div class="action-group"><button class="table-action edit-entry" type="button" title="Edit">⋯</button><button class="table-action delete-action delete-entry" type="button" title="Delete">×</button></div></td>
    </tr>`;
  }

  function bindRowEvents() {
    el.showsBody.querySelectorAll('tr').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.comment-entry')?.addEventListener('click', () => openComments(id));
      if (state.mode !== 'edit') return;
      row.querySelectorAll('.edit-entry').forEach(button => button.addEventListener('click', () => openEditDialog(id)));
      row.querySelector('.delete-entry')?.addEventListener('click', () => deleteEntry(id));
      const ratingInput = row.querySelector('.rating-input');
      ratingInput?.addEventListener('input', () => {
        const value = normalizeRating(ratingInput.value);
        ratingInput.style.cssText = value === null ? 'background:#34383b;color:#a3abb2;' : ratingStyleText(value);
      });
      ratingInput?.addEventListener('change', () => updateInlineRating(id, ratingInput.value));
      const statusSelect = row.querySelector('.inline-status');
      statusSelect?.addEventListener('change', event => updateInlineStatus(id, event.target.value));
    });
  }

  function compareEntries(a, b) {
    const factor = state.sort.direction === 'asc' ? 1 : -1;
    let av = sortableValue(a, state.sort.key), bv = sortableValue(b, state.sort.key);
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av === bv) return a.title.localeCompare(b.title);
    if (av === null || av === '') return 1;
    if (bv === null || bv === '') return -1;
    return av > bv ? factor : -factor;
  }

  function sortableValue(entry, key) {
    if (key === 'genre') return entry.genres.join(', ');
    if (key === 'season') return entry.mediaType === 'movie' ? -1 : entry.season;
    return entry[key] ?? null;
  }

  function setSort(key) {
    if (state.sort.key === key) state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    else state.sort = { key, direction: ['rating','season','episodeCount','runtime'].includes(key) ? 'desc' : 'asc' };
    renderTable();
  }

  function updateSortIndicators() {
    document.querySelectorAll('.sort-button').forEach(button => {
      button.querySelector('span').textContent = button.dataset.sort === state.sort.key ? (state.sort.direction === 'asc' ? '▲' : '▼') : '';
    });
  }

  function updateInlineRating(id, value) {
    const entry = findWorkingEntry(id);
    if (!entry) return;
    entry.rating = normalizeRating(value);
    entry.updatedAt = new Date().toISOString();
    saveWorkingLibrary();
    renderAnalytics();
    if (state.sort.key === 'rating') renderTable();
  }

  function updateInlineStatus(id, status) {
    const entry = findWorkingEntry(id);
    if (!entry || !STATUS_OPTIONS.includes(status)) return;
    entry.status = status;
    if (entry.mediaType === 'tv' && ['Completed','Recommended'].includes(status) && entry.episodesWatched === null) entry.episodesWatched = entry.episodeCount;
    entry.updatedAt = new Date().toISOString();
    saveWorkingLibrary();
    refreshEverything();
  }

  function openAddDialog() {
    if (state.mode !== 'edit') return;
    resetDialog();
    el.dialogEyebrow.textContent = 'Add title';
    el.dialogTitle.textContent = 'What did you watch?';
    showChoiceView();
    el.showDialog.showModal();
  }

  function showChoiceView() {
    state.editingId = null;
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.searchStep.hidden = false;
    el.detailsStep.hidden = true;
    el.tvSearchArea.hidden = true;
    el.searchResults.innerHTML = '';
    el.showSearchInput.value = '';
    hideMessage(el.searchMessage);
  }

  function chooseTvFlow() {
    el.tvSearchArea.hidden = false;
    setTimeout(() => el.showSearchInput.focus(), 30);
  }

  function openMovieDetails() {
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.searchStep.hidden = true;
    el.detailsStep.hidden = false;
    el.selectedShowCard.hidden = true;
    el.dialogTitle.textContent = 'Add a movie';
    fillForm(blankEntry('movie'), true);
    setFormType('movie');
  }

  function openManualTvDetails(title = '') {
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.searchStep.hidden = true;
    el.detailsStep.hidden = false;
    el.selectedShowCard.hidden = true;
    el.dialogTitle.textContent = 'Add a TV season manually';
    const entry = blankEntry('tv');
    entry.title = title;
    fillForm(entry, true);
    setFormType('tv');
  }

  function blankEntry(mediaType) {
    return {
      mediaType, title: '', season: mediaType === 'tv' ? 1 : null,
      year: state.activeYear === 'all' ? CURRENT_YEAR : Number(state.activeYear),
      rating: null, status: 'Watching', network: '', genres: [], episodeCount: null, episodesWatched: null,
      runtime: null, startDate: '', watchedDate: '', imdb: '', tvdb: '', comments: ''
    };
  }

  async function searchShows() {
    const query = el.showSearchInput.value.trim();
    if (!query) return showMessage(el.searchMessage, 'Type a show name first.', 'error');
    const token = ++state.searchToken;
    el.showSearchBtn.disabled = true;
    el.showSearchBtn.textContent = 'Searching…';
    el.searchResults.innerHTML = '';
    showMessage(el.searchMessage, 'Searching TVmaze…');
    try {
      const response = await fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Search failed (${response.status})`);
      const results = await response.json();
      if (token !== state.searchToken) return;
      if (!Array.isArray(results) || !results.length) return showMessage(el.searchMessage, 'No matches found. Try another spelling or enter it manually.', 'error');
      hideMessage(el.searchMessage);
      const visible = results.slice(0, 8);
      el.searchResults.innerHTML = visible.map(({ show }, index) => {
        const meta = [show.premiered?.slice(0,4), getNetwork(show), (show.genres || []).slice(0,3).join(', ')].filter(Boolean).join(' · ');
        const image = show.image?.medium;
        return `<button class="search-result" type="button" data-index="${index}">${image ? `<img class="search-poster" src="${escapeAttr(image)}" alt="">` : '<span class="search-poster search-poster-placeholder">▦</span>'}<span><span class="search-result-title">${escapeHTML(show.name)}</span><span class="search-result-meta">${escapeHTML(meta)}</span></span><span class="search-result-arrow">›</span></button>`;
      }).join('');
      el.searchResults.querySelectorAll('.search-result').forEach(button => button.addEventListener('click', () => selectSearchResult(visible[Number(button.dataset.index)].show)));
    } catch (error) {
      console.error(error);
      showMessage(el.searchMessage, 'Could not reach TVmaze. Check your internet connection or enter the season manually.', 'error');
    } finally {
      if (token === state.searchToken) { el.showSearchBtn.disabled = false; el.showSearchBtn.textContent = 'Search'; }
    }
  }

  async function selectSearchResult(show) {
    state.selectedShow = show;
    state.selectedSeasons = [];
    el.searchStep.hidden = true;
    el.detailsStep.hidden = false;
    el.dialogTitle.textContent = 'Choose a season';
    showSelectedShow(show);
    const entry = blankEntry('tv');
    Object.assign(entry, {
      title: show.name, network: getNetwork(show), genres: show.genres || [], runtime: show.averageRuntime ?? show.runtime ?? null,
      imdb: show.externals?.imdb || '', tvdb: show.externals?.thetvdb || ''
    });
    fillForm(entry, true);
    setFormType('tv');
    showMessage(el.metadataMessage, 'Loading seasons from TVmaze…');
    try {
      const response = await fetch(`${TVMAZE_BASE}/shows/${show.id}/seasons`);
      if (!response.ok) throw new Error(`Season lookup failed (${response.status})`);
      state.selectedSeasons = await response.json();
      if (!state.selectedSeasons.length) {
        el.entrySeason.innerHTML = '<option value="1">Season 1</option>';
        hideMessage(el.metadataMessage);
        return;
      }
      el.entrySeason.innerHTML = state.selectedSeasons.map(season => `<option value="${escapeAttr(season.number)}">Season ${escapeHTML(season.number)}${season.premiereDate ? ` — ${escapeHTML(season.premiereDate.slice(0,4))}` : ''}</option>`).join('');
      const preferred = choosePreferredSeason(state.selectedSeasons, Number(el.entryYear.value));
      if (preferred) el.entrySeason.value = String(preferred.number);
      await loadSelectedSeasonMetadata();
    } catch (error) {
      console.error(error);
      showMessage(el.metadataMessage, 'Season details could not be loaded. You can fill the fields manually.', 'error');
    }
  }

  function choosePreferredSeason(seasons, catalogYear) {
    const sameYear = seasons.filter(season => season.premiereDate?.startsWith(String(catalogYear)));
    return sameYear[sameYear.length - 1] || seasons[seasons.length - 1] || null;
  }

  async function loadSelectedSeasonMetadata() {
    if (!state.selectedShow || !state.selectedSeasons.length) return;
    const number = Number(el.entrySeason.value);
    const season = state.selectedSeasons.find(item => Number(item.number) === number);
    if (!season) return;
    el.entryStartDate.value = season.premiereDate || '';
    showMessage(el.metadataMessage, `Loading Season ${number} episodes…`);
    try {
      const response = await fetch(`${TVMAZE_BASE}/seasons/${season.id}/episodes`);
      if (!response.ok) throw new Error(`Episode lookup failed (${response.status})`);
      const episodes = await response.json();
      const regular = Array.isArray(episodes) ? episodes.filter(ep => ep.number !== null) : [];
      el.entryEpisodeCount.value = regular.length || (Array.isArray(episodes) ? episodes.length : '');
      const runtimes = regular.map(ep => Number(ep.runtime)).filter(value => Number.isFinite(value) && value > 0);
      if (runtimes.length) el.entryRuntime.value = Math.round(runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length);
      else if (state.selectedShow.averageRuntime || state.selectedShow.runtime) el.entryRuntime.value = state.selectedShow.averageRuntime || state.selectedShow.runtime;
      hideMessage(el.metadataMessage);
    } catch (error) {
      console.error(error);
      showMessage(el.metadataMessage, 'Episode count/runtime could not be loaded. You can enter them manually.', 'error');
    }
  }

  function openEditDialog(id) {
    const entry = findWorkingEntry(id);
    if (!entry) return;
    state.editingId = id;
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.dialogEyebrow.textContent = 'Edit title';
    el.dialogTitle.textContent = entry.mediaType === 'movie' ? entry.title : `${entry.title} — Season ${entry.season}`;
    fillForm(entry, false);
    setFormType(entry.mediaType);
    el.selectedShowCard.hidden = true;
    el.searchStep.hidden = true;
    el.detailsStep.hidden = false;
    el.showDialog.showModal();
  }

  function fillForm(entry, isNew) {
    el.entryMediaType.value = entry.mediaType || 'tv';
    el.entryYear.value = entry.year || CURRENT_YEAR;
    el.entryTitle.value = entry.title || '';
    populateSeasonOptions(entry.season || 1);
    el.entrySeason.value = String(entry.season || 1);
    el.entryRating.value = entry.rating ?? '';
    el.entryStatus.value = entry.status || 'Watching';
    el.entryNetwork.value = entry.network || '';
    el.entryGenres.value = (entry.genres || []).join(', ');
    el.entryEpisodeCount.value = entry.episodeCount ?? '';
    el.entryEpisodesWatched.value = entry.episodesWatched ?? '';
    el.entryRuntime.value = entry.runtime ?? '';
    el.entryStartDate.value = entry.startDate || '';
    el.entryWatchedDate.value = entry.watchedDate || '';
    el.entryImdb.value = entry.imdb || '';
    el.entryTvdb.value = entry.tvdb || '';
    el.entryComments.value = entry.comments || '';
    el.saveEntryBtn.textContent = isNew ? 'Add title' : 'Save changes';
    hideMessage(el.metadataMessage);
  }

  function populateSeasonOptions(selected = 1) {
    if (state.selectedSeasons.length) return;
    el.entrySeason.innerHTML = Array.from({ length: 40 }, (_, i) => `<option value="${i+1}">Season ${i+1}</option>`).join('');
    el.entrySeason.value = String(selected);
  }

  function setFormType(mediaType) {
    const isMovie = mediaType === 'movie';
    el.entryMediaType.value = mediaType;
    el.seasonField.hidden = isMovie;
    el.episodeCountField.hidden = isMovie;
    el.episodesWatchedField.hidden = isMovie;
    el.tvdbField.hidden = isMovie;
    el.runtimeLabel.textContent = isMovie ? 'Runtime (min)' : 'Avg. runtime (min)';
    el.releaseDateLabel.textContent = isMovie ? 'Release date' : 'Season start';
    if (isMovie) {
      el.entrySeason.value = '1';
      el.entryEpisodeCount.value = '';
      el.entryEpisodesWatched.value = '';
      el.entryTvdb.value = '';
    }
  }

  function autoFillCompletedEpisodes() {
    if (el.entryMediaType.value === 'tv' && ['Completed','Recommended'].includes(el.entryStatus.value) && !el.entryEpisodesWatched.value && el.entryEpisodeCount.value) {
      el.entryEpisodesWatched.value = el.entryEpisodeCount.value;
    }
  }

  function showSelectedShow(show) {
    const image = show.image?.medium;
    const meta = [show.premiered?.slice(0,4), getNetwork(show), (show.genres || []).join(', ')].filter(Boolean).join(' · ');
    el.selectedShowCard.innerHTML = `${image ? `<img src="${escapeAttr(image)}" alt="">` : ''}<div><strong>${escapeHTML(show.name)}</strong><span>${escapeHTML(meta)}</span></div>`;
    el.selectedShowCard.hidden = false;
  }

  function saveEntryFromForm(event) {
    event.preventDefault();
    if (state.mode !== 'edit') return;
    const mediaType = el.entryMediaType.value === 'movie' ? 'movie' : 'tv';
    const title = el.entryTitle.value.trim();
    const year = Number(el.entryYear.value);
    const season = mediaType === 'movie' ? null : Number(el.entrySeason.value);
    const rating = normalizeRating(el.entryRating.value);
    if (!title) return showMessage(el.metadataMessage, 'A title is required.', 'error');
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return showMessage(el.metadataMessage, 'Enter a valid archive year.', 'error');
    if (mediaType === 'tv' && (!Number.isFinite(season) || season < 1)) return showMessage(el.metadataMessage, 'Enter a valid season number.', 'error');
    if (el.entryRating.value !== '' && rating === null) return showMessage(el.metadataMessage, 'Rating must be between 0 and 10.', 'error');

    const selectedSeason = mediaType === 'tv' ? state.selectedSeasons.find(item => Number(item.number) === season) : null;
    const existing = state.editingId ? findWorkingEntry(state.editingId) : null;
    const now = new Date().toISOString();
    let episodesWatched = mediaType === 'tv' ? nullableNumber(el.entryEpisodesWatched.value) : null;
    const episodeCount = mediaType === 'tv' ? nullableNumber(el.entryEpisodeCount.value) : null;
    if (episodesWatched === null && ['Completed','Recommended'].includes(el.entryStatus.value)) episodesWatched = episodeCount;
    const entry = normalizeEntry({
      ...(existing || {}), id: existing?.id || makeId(), mediaType,
      tvmazeId: mediaType === 'tv' ? (state.selectedShow?.id ?? existing?.tvmazeId ?? null) : null,
      tvmazeSeasonId: mediaType === 'tv' ? (selectedSeason?.id ?? existing?.tvmazeSeasonId ?? null) : null,
      title, season, year, rating, status: el.entryStatus.value, network: el.entryNetwork.value.trim(), genres: splitGenres(el.entryGenres.value),
      episodeCount, episodesWatched, runtime: nullableNumber(el.entryRuntime.value), startDate: el.entryStartDate.value,
      watchedDate: el.entryWatchedDate.value, imdb: cleanImdb(el.entryImdb.value), tvdb: mediaType === 'tv' ? el.entryTvdb.value.trim() : '',
      comments: el.entryComments.value.trim(), tvmazeUrl: mediaType === 'tv' ? (state.selectedShow?.url ?? existing?.tvmazeUrl ?? '') : '',
      image: mediaType === 'tv' ? (state.selectedShow?.image?.medium ?? existing?.image ?? '') : (existing?.image ?? ''),
      createdAt: existing?.createdAt || now, updatedAt: now,
    });

    if (existing) {
      state.workingEntries[state.workingEntries.findIndex(item => item.id === existing.id)] = entry;
    } else {
      const duplicate = state.workingEntries.find(item => item.mediaType === mediaType && item.title.toLowerCase() === title.toLowerCase() && Number(item.season || 0) === Number(season || 0) && Number(item.year) === year);
      if (duplicate && !confirm(`${title}${mediaType === 'tv' ? ` Season ${season}` : ''} is already in ${year}. Add another copy anyway?`)) return;
      state.workingEntries.push(entry);
    }

    saveWorkingLibrary();
    state.activeYear = year;
    el.showDialog.close();
    refreshEverything();
    showToast(existing ? 'Local entry updated.' : 'Title added to your local working copy.');
  }

  function openComments(id) {
    const entry = activeEntries().find(item => item.id === id);
    if (!entry) return;
    state.commentEntryId = id;
    el.commentsTitle.textContent = entry.mediaType === 'movie' ? entry.title : `${entry.title} — Season ${entry.season}`;
    el.commentsBody.textContent = entry.comments.trim() || 'No comments yet.';
    el.commentsDialog.showModal();
  }

  function deleteEntry(id) {
    const entry = findWorkingEntry(id);
    if (!entry) return;
    if (!confirm(`Delete ${entry.title}${entry.mediaType === 'tv' ? ` — Season ${entry.season}` : ''} from your local working copy?`)) return;
    state.workingEntries = state.workingEntries.filter(item => item.id !== id);
    saveWorkingLibrary();
    refreshEverything();
    showToast('Title deleted locally.');
  }

  function exportPublishedJson() {
    if (state.mode !== 'edit') return;
    const payload = { app: 'Watch Archive', version: 3, publishedAt: new Date().toISOString(), entries: state.workingEntries || [] };
    downloadJson(payload, 'shows.json');
    showToast('shows.json downloaded. Replace the copy in GitHub and commit it to publish your changes.');
  }

  async function importWorkingLibrary(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const rawEntries = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(rawEntries)) throw new Error('No entries array found');
      const imported = rawEntries.map(normalizeEntry).filter(entry => entry.title);
      if (!confirm(`Import ${imported.length} entries and replace your local working copy? This will not change the public site until you export and commit shows.json.`)) return;
      state.workingEntries = imported;
      saveWorkingLibrary();
      refreshEverything();
      showToast(`Imported ${imported.length} entries into your local working copy.`);
    } catch (error) {
      console.error(error);
      alert('That file is not a valid Watch Archive JSON file.');
    }
  }

  function resetWorkingFromPublished() {
    if (!confirm('Replace your local working copy with the catalog currently published on GitHub? Any unpublished local edits will be lost.')) return;
    state.workingEntries = cloneEntries(state.publishedEntries);
    saveWorkingLibrary();
    refreshEverything();
    showToast('Local working copy reset from the published catalog.');
  }

  function resetDialog() {
    state.searchToken++;
    state.editingId = null;
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.showForm.reset();
    el.searchResults.innerHTML = '';
    el.tvSearchArea.hidden = true;
    hideMessage(el.searchMessage);
    hideMessage(el.metadataMessage);
  }

  function getNetwork(show) { return show.webChannel?.name || show.network?.name || ''; }
  function trailerUrl(entry) {
    const query = entry.mediaType === 'movie' ? `${entry.title} official trailer` : `${entry.title} season ${entry.season} official trailer`;
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
  function ratingStyleText(rating) {
    const value = Math.max(0, Math.min(10, Number(rating)));
    const hue = value * 12;
    const lightness = 43 + Math.abs(5 - value) * .3;
    return `background:hsl(${hue} 63% ${lightness}%);color:#071008;`;
  }
  function statusClassName(status) {
    return `status-${String(status || '').toLowerCase().replace(/\s+/g, '-')}`;
  }
  function networkClassName(network) {
    const value = String(network || '').toLowerCase();
    if (value.includes('netflix')) return 'network-netflix';
    if (value.includes('disney')) return 'network-disney';
    if (value.includes('hbo') || value.includes('max')) return 'network-hbo';
    if (value.includes('apple')) return 'network-apple';
    if (value.includes('prime') || value.includes('amazon')) return 'network-prime';
    if (value.includes('crunchyroll')) return 'network-crunchyroll';
    if (value.includes('peacock') || value.includes('nbc')) return 'network-peacock';
    if (value.includes('paramount')) return 'network-paramount';
    if (value.includes('hulu') || value.includes('fx')) return 'network-hulu';
    return '';
  }
  function formatDate(value) {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: '2-digit' }).format(new Date(Date.UTC(year, month - 1, day))).replace(',', '');
  }
  function formatHours(minutes) {
    const hours = minutes / 60;
    return hours >= 100 ? Math.round(hours).toLocaleString() : hours.toFixed(hours >= 10 ? 1 : 1);
  }
  function normalizeRating(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 10) return null;
    return Math.round(number * 10) / 10;
  }
  function nullableNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function cleanImdb(value) {
    const text = String(value || '').trim();
    const match = text.match(/tt\d+/i);
    return match ? match[0].toLowerCase() : text;
  }
  function splitGenres(value) {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  }
  function countBy(values) { return values.reduce((acc, value) => { acc[value] = (acc[value] || 0) + 1; return acc; }, {}); }
  function sortedCounts(object) { return Object.entries(object).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }
  function uniqueSorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
  function findWorkingEntry(id) { return (state.workingEntries || []).find(entry => entry.id === id); }
  function cloneEntries(entries) { return entries.map(entry => normalizeEntry(JSON.parse(JSON.stringify(entry)))); }
  function makeId() { return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function optionHTML(value, label) { return `<option value="${escapeAttr(value)}">${escapeHTML(label)}</option>`; }
  function showMessage(node, text, type = '') { node.textContent = text; node.className = `message${type ? ` ${type}` : ''}`; node.hidden = false; }
  function hideMessage(node) { node.hidden = true; node.textContent = ''; node.className = 'message'; }
  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }
  let toastTimer;
  function showToast(text) { clearTimeout(toastTimer); el.toast.textContent = text; el.toast.classList.add('show'); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3400); }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function escapeAttr(value) { return escapeHTML(value); }
})();
