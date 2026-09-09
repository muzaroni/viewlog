(() => {
  'use strict';

  const WORKING_STORAGE_KEY = 'watch-archive.working.v3';
  const TVMAZE_BASE = 'https://api.tvmaze.com';
  const CURRENT_YEAR = new Date().getFullYear();
  const STATUS_OPTIONS = ['Upcoming', 'Airing', 'Watching', 'Completed', 'Recommended', 'On Hold', 'Dropped', 'Trash'];
  const DATE_MANAGED_STATUSES = new Set(['Upcoming', 'Airing']);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const state = {
    mode: new URLSearchParams(location.search).get('edit') === '1' ? 'edit' : 'published',
    publishedEntries: [],
    workingEntries: loadWorkingLibrary(),
    activeYear: CURRENT_YEAR,
    activeView: 'library',
    sort: { key: 'rating', direction: 'desc' },
    editingId: null,
    selectedShow: null,
    selectedSeasons: [],
    selectedMovie: null,
    searchMediaType: 'tv',
    fixMatchMode: false,
    statusManuallySet: false,
    commentEntryId: null,
    searchToken: 0,
  };

  const el = Object.fromEntries([
    'mdblistSettingsBtn','mdblistDialog','mdblistForm','mdblistKey','mdblistCancel','mdblistSettingsMessage','yearTabs','yearSubtabs','libraryTab','dashboardTab','librarySection','editActions','publicModeBtn','modeBanner','publishedStatus','analyticsSection','analyticsTitle','analyticsSubtitle',
    'statTitles','statTitlesDetail','statHours','statHoursDetail','statRating','statRatingDetail','statGenres','statGenreDetail','statNetwork','statNetworkDetail',
    'ratingDistribution','networkRatings','genreRatings','genreBars','networkBars','statusBars','ratingTrend','trendLabel','addShowBtn','emptyAddBtn','publishExportBtn','importFile','resetWorkingBtn',
    'searchFilter','typeFilter','statusFilter','networkFilter','genreFilter','visibleCount','showsBody','emptyState','emptyTitle','emptyText',
    'showDialog','showForm','dialogEyebrow','dialogTitle','dialogExternalRatings','searchStep','detailsStep','mediaChoice','chooseTvBtn','chooseMovieBtn','tvSearchArea','searchLabel','searchHelper','showSearchInput',
    'showSearchBtn','searchMessage','searchResults','manualEntryBtn','selectedShowCard','entryMediaType','entryTitle','entrySeason','entryYear','entryRating',
    'entryStatus','entryNetwork','entryGenres','entryEpisodeCount','entryEpisodesWatched','entryRuntime','entryStartDate','entryWatchedDate','entryImdb','entryTvdb',
    'entrySynopsis','entryComments','seasonField','episodeCountField','episodesWatchedField','tvdbField','runtimeLabel','releaseDateLabel','metadataMessage','backToSearchBtn','saveEntryBtn',
    'commentsDialog','commentsTitle','commentsNetwork','commentsBody','commentsPoster','commentsRatings','editFromCommentsBtn','toast'
  ].map(id => [id, document.getElementById(id)]));

  const ratingsPending = new Set();
  const MDBLIST_KEY_STORAGE = 'viewlog.mdblist.key';
  const synopsisCache = new Map();
  let synopsisAnchor = null;
  const synopsisTip = document.createElement('div');
  synopsisTip.id = 'synopsisTip';
  synopsisTip.className = 'synopsis-tooltip';
  synopsisTip.setAttribute('role', 'tooltip');
  synopsisTip.hidden = true;
  document.body.append(synopsisTip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideSynopsis(); });
  window.addEventListener('scroll', hideSynopsis, true);
  window.addEventListener('resize', hideSynopsis);
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
    el.mdblistSettingsBtn.addEventListener('click', () => {
      try { el.mdblistKey.value = localStorage.getItem(MDBLIST_KEY_STORAGE) || ''; } catch { el.mdblistKey.value = ''; }
      el.mdblistSettingsMessage.textContent = '';
      el.mdblistDialog.showModal();
    });
    el.mdblistCancel.addEventListener('click', () => el.mdblistDialog.close());
    el.mdblistDialog.addEventListener('close', () => { el.mdblistKey.value = ''; });
    el.mdblistForm.addEventListener('submit', event => {
      event.preventDefault();
      if (state.mode !== 'edit') return;
      try {
        const key = el.mdblistKey.value.trim();
        if (key) localStorage.setItem(MDBLIST_KEY_STORAGE, key);
        else localStorage.removeItem(MDBLIST_KEY_STORAGE);
        el.mdblistDialog.close();
        showToast(key ? 'MDBList key saved in this browser.' : 'MDBList key removed.');
      } catch { el.mdblistSettingsMessage.textContent = 'Browser storage is unavailable. The key could not be saved.'; }
    });
    el.libraryTab.addEventListener('click', () => setYearView('library'));
    el.dashboardTab.addEventListener('click', () => setYearView('dashboard'));
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
    el.chooseMovieBtn.addEventListener('click', chooseMovieFlow);
    el.showSearchBtn.addEventListener('click', searchShows);
    el.showSearchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); searchShows(); }
    });
    el.manualEntryBtn.addEventListener('click', () => state.searchMediaType === 'movie' ? openManualMovieDetails(el.showSearchInput.value.trim()) : openManualTvDetails(el.showSearchInput.value.trim()));
    el.backToSearchBtn.addEventListener('click', () => state.fixMatchMode ? showFixMatchSearch() : showChoiceView());
    el.entrySeason.addEventListener('change', loadSelectedSeasonMetadata);
    el.entryStartDate.addEventListener('change', () => {
      el.entryStatus.value = statusForPremiereDate(el.entryStartDate.value, el.entryStatus.value, !state.editingId && !state.statusManuallySet);
    });
    el.entryMediaType.addEventListener('change', () => setFormType(el.entryMediaType.value));
    el.entryStatus.addEventListener('change', () => {
      state.statusManuallySet = true;
      autoFillCompletedEpisodes();
      updateEditFieldColors();
    });
    el.entryNetwork.addEventListener('input', updateEditFieldColors);
    el.entryRating.addEventListener('input', updateEditFieldColors);
    el.showForm.addEventListener('submit', saveEntryFromForm);
    document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => el.showDialog.close()));
    document.querySelectorAll('.close-comments').forEach(button => button.addEventListener('click', () => el.commentsDialog.close()));
    el.commentsPoster.addEventListener('error', () => { el.commentsPoster.hidden = true; });
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
    const startDate = String(raw.startDate || '');
    const savedStatus = STATUS_OPTIONS.includes(raw.status) ? raw.status : 'Watching';
    return {
      id: raw.id || makeId(),
      mediaType,
      tvmazeId: nullableNumber(raw.tvmazeId),
      tvmazeSeasonId: nullableNumber(raw.tvmazeSeasonId),
      title: String(raw.title || '').trim(),
      season: mediaType === 'movie' ? null : (nullableNumber(raw.season) ?? 1),
      year: nullableNumber(raw.year) ?? CURRENT_YEAR,
      rating: normalizeRating(raw.rating),
      status: statusForPremiereDate(startDate, savedStatus),
      network: String(raw.network || '').trim(),
      genres: Array.isArray(raw.genres) ? raw.genres.filter(Boolean).map(String) : splitGenres(raw.genres),
      episodeCount: mediaType === 'movie' ? null : nullableNumber(raw.episodeCount),
      episodesWatched: mediaType === 'movie' ? null : nullableNumber(raw.episodesWatched),
      runtime: nullableNumber(raw.runtime),
      startDate,
      watchedDate: String(raw.watchedDate || ''),
      imdb: cleanImdb(raw.imdb),
      tvdb: mediaType === 'movie' ? '' : (raw.tvdb ? String(raw.tvdb).trim() : ''),
      externalRatings: normalizeExternalRatings(raw.externalRatings),
      ratingsUpdatedAt: String(raw.ratingsUpdatedAt || ''),
      ratingsImdbId: cleanImdb(raw.ratingsImdbId),
      ratingsUrls: { rt: safeRatingUrl(raw.ratingsUrls?.rt, 'www.rottentomatoes.com'), mc: safeRatingUrl(raw.ratingsUrls?.mc, 'www.metacritic.com'), mal: safeRatingUrl(raw.ratingsUrls?.mal, 'myanimelist.net') },
      synopsis: String(raw.synopsis || ''),
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
    updateYearView();
  }


  function setYearView(view) {
    state.activeView = state.activeYear === 'all' ? 'library' : view;
    updateYearView();
  }

  function updateYearView() {
    const isAll = state.activeYear === 'all';
    const dashboard = !isAll && state.activeView === 'dashboard';
    el.yearSubtabs.hidden = isAll;
    el.analyticsSection.hidden = !dashboard;
    el.librarySection.hidden = dashboard;
    el.libraryTab.classList.toggle('active', !dashboard);
    el.dashboardTab.classList.toggle('active', dashboard);
    el.libraryTab.setAttribute('aria-pressed', String(!dashboard));
    el.dashboardTab.setAttribute('aria-pressed', String(dashboard));
    el.yearSubtabs.setAttribute('aria-label', state.activeYear + ' views');
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
      state.activeView = 'library';
      refreshEverything();
    }));
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
    el.analyticsSection.hidden = state.activeView !== 'dashboard';
    const entries = getYearEntries();
    const tvCount = entries.filter(entry => entry.mediaType === 'tv').length;
    const movieCount = entries.filter(entry => entry.mediaType === 'movie').length;
    const rated = entries.filter(entry => entry.rating !== null);
    const genres = uniqueSorted(entries.flatMap(entry => entry.genres));
    const totalMinutes = entries.reduce((sum, entry) => sum + watchedMinutes(entry), 0);
    const networkCounts = countBy(entries.map(entry => entry.network || 'Unknown'));
    const topNetwork = sortedCounts(networkCounts)[0];
    const genreCounts = countBy(entries.flatMap(entry => [...new Set(entry.genres)]));
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

    renderBars(el.genreBars, sortedCounts(genreCounts), false, entries.length, 'genre');
    renderBars(el.networkBars, sortedCounts(networkCounts), false, entries.length, 'network');
    renderBars(el.statusBars, STATUS_OPTIONS.map(status => [status, statusCounts[status] || 0]).filter(([, value]) => value > 0), true, entries.length);
    renderRatingTrend(entries);
    renderRatingInsights(entries);
    renderGenreRatingComparison(entries);
  }


  function ratingInsights(entries) {
    const bins = Array(11).fill(0);
    const networks = new Map();
    entries.forEach(entry => {
      if (!Number.isFinite(entry.rating) || entry.rating < 0 || entry.rating > 10) return;
      bins[Math.floor(entry.rating)]++;
      const name = (entry.network || '').trim();
      if (!name) return;
      const group = networks.get(name) || { name, total: 0, count: 0 };
      group.total += entry.rating;
      group.count++;
      networks.set(name, group);
    });
    const ranked = [...networks.values()].filter(group => group.count >= 3)
      .map(group => ({ ...group, average: group.total / group.count }))
      .sort((a, b) => b.average - a.average || b.count - a.count || a.name.localeCompare(b.name));
    return { bins, ranked };
  }

  function renderRatingInsights(entries) {
    const { bins, ranked } = ratingInsights(entries);
    const count = bins.reduce((sum, value) => sum + value, 0);
    const max = Math.max(1, ...bins);
    el.ratingDistribution.innerHTML = count ? bins.map((value, index) => {
      const label = index === 10 ? '10' : index + '–<' + (index + 1);
      return `<div class="histogram-bin" aria-label="${escapeAttr(label)}: ${value} titles"><span class="histogram-count">${value}</span><div class="histogram-track"><div class="histogram-fill" style="height:${value / max * 100}%;background:hsl(${index * 12} 65% 57%)"></div></div><span class="histogram-label">${index}</span></div>`;
    }).join('') : '<div class="empty-chart">Add ratings to see your rating distribution.</div>';
    el.networkRatings.innerHTML = ranked.length ? ranked.map((group, index) =>
      `<button class="bar-row dashboard-filter-row" type="button" data-dashboard-filter="network" data-filter-value="${escapeAttr(group.name)}" aria-label="Show ${escapeAttr(group.name)} titles in the library"><span class="bar-label" title="${escapeAttr(group.name)}">${escapeHTML(group.name)}</span><span class="bar-track"><span class="bar-fill chart-color-${index % 6}" style="width:${group.average * 10}%"></span></span><span class="bar-value"><strong>${group.average.toFixed(2)}<small>/ 10</small></strong><small>${group.count} titles</small></span></button>`
    ).join('') : '<div class="empty-chart">No networks qualify yet. Rate at least 3 titles from the same network.</div>';
    bindDashboardFilters(el.networkRatings);
  }

  function renderGenreRatingComparison(entries) {
    const groups = new Map();
    entries.forEach(entry => {
      [...new Set(entry.genres)].forEach(name => {
        const group = groups.get(name) || { name, count: 0, ratedCount: 0, total: 0 };
        group.count++;
        if (entry.rating !== null) {
          group.ratedCount++;
          group.total += entry.rating;
        }
        groups.set(name, group);
      });
    });
    const ranked = [...groups.values()].map(group => ({
      ...group,
      average: group.ratedCount ? group.total / group.ratedCount : null,
    })).sort((a, b) => b.count - a.count || (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name)).slice(0, 12);
    if (!ranked.length) {
      el.genreRatings.innerHTML = '<div class="empty-chart">Add genres and ratings to compare them.</div>';
      return;
    }
    const maxCount = Math.max(...ranked.map(group => group.count), 1);
    const width = 920, height = 320;
    const margin = { top: 36, right: 54, bottom: 92, left: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const step = plotWidth / ranked.length;
    const barWidth = Math.min(42, step * .58);
    const x = index => margin.left + step * index + step / 2;
    const countY = value => margin.top + plotHeight - (value / maxCount) * plotHeight;
    const ratingY = value => margin.top + plotHeight - (value / 10) * plotHeight;
    const countTicks = [0, Math.ceil(maxCount / 2), maxCount];
    const grid = countTicks.map(value => `<line class="combo-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${countY(value)}" y2="${countY(value)}"></line><text class="combo-axis-label" x="${margin.left - 9}" y="${countY(value) + 4}" text-anchor="end">${value}</text>`).join('');
    const ratingTicks = [0, 5, 10].map(value => `<text class="combo-axis-label combo-rating-label" x="${width - margin.right + 9}" y="${ratingY(value) + 4}">${value}</text>`).join('');
    const bars = ranked.map((group, index) => {
      const barHeight = margin.top + plotHeight - countY(group.count);
      const averageText = group.average === null ? 'not rated' : `${group.average.toFixed(2)} average from ${group.ratedCount} rated title${group.ratedCount === 1 ? '' : 's'}`;
      return `<g class="combo-category" role="button" tabindex="0" data-dashboard-filter="genre" data-filter-value="${escapeAttr(group.name)}" aria-label="Show ${escapeAttr(group.name)} titles in the library: ${group.count} titles, ${escapeAttr(averageText)}"><rect class="combo-bar" x="${x(index) - barWidth / 2}" y="${countY(group.count)}" width="${barWidth}" height="${barHeight}"><title>${escapeHTML(group.name)}: ${group.count} titles</title></rect><text class="combo-count" x="${x(index)}" y="${countY(group.count) - 7}" text-anchor="middle">${group.count}</text><text class="combo-genre-label" transform="translate(${x(index) - 4} ${margin.top + plotHeight + 17}) rotate(38)">${escapeHTML(group.name)}</text></g>`;
    }).join('');
    const ratedPoints = ranked.map((group, index) => group.average === null ? null : ({ ...group, x: x(index), y: ratingY(group.average) })).filter(Boolean);
    const line = ratedPoints.length > 1 ? `<polyline class="combo-rating-line" points="${ratedPoints.map(point => `${point.x},${point.y}`).join(' ')}"></polyline>` : '';
    const dots = ratedPoints.map(point => `<circle class="combo-rating-dot" cx="${point.x}" cy="${point.y}" r="5"><title>${escapeHTML(point.name)}: ${point.average.toFixed(2)} average rating</title></circle>`).join('');
    el.genreRatings.innerHTML = `<div class="combo-legend" aria-hidden="true"><span><i class="legend-bar"></i>Title count</span><span><i class="legend-line"></i>Average rating</span></div><svg class="genre-combo-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="genreComboTitle genreComboDescription"><title id="genreComboTitle">Genre frequency and average rating</title><desc id="genreComboDescription">Bars compare the number of titles in the twelve most frequent genres. A line compares average personal rating on a zero to ten scale.</desc><text class="combo-axis-title" x="${margin.left}" y="17">Titles</text><text class="combo-axis-title combo-rating-title" x="${width - margin.right}" y="17" text-anchor="end">Rating / 10</text>${grid}${ratingTicks}${bars}${line}${dots}</svg>`;
    bindDashboardFilters(el.genreRatings);
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

  function renderBars(container, pairs, useStatusColors = false, total = 0, filterType = '') {
    if (!pairs.length) {
      container.innerHTML = '<div class="empty-chart">Not enough data yet.</div>';
      return;
    }
    const max = total || 1;
    container.innerHTML = pairs.map(([label, value], index) => {
      const cls = useStatusColors ? ` ${statusClassName(label)}` : ` chart-color-${index % 6}`;
      const canFilter = filterType && !(filterType === 'network' && label === 'Unknown');
      const tag = canFilter ? 'button' : 'div';
      const attributes = canFilter ? ` type="button" data-dashboard-filter="${filterType}" data-filter-value="${escapeAttr(label)}" aria-label="Show ${escapeAttr(label)} titles in the library"` : '';
      return `<${tag} class="bar-row${canFilter ? ' dashboard-filter-row' : ''}"${attributes}><span class="bar-label" title="${escapeAttr(label)}">${escapeHTML(label)}</span><span class="bar-track"><span class="bar-fill${cls}" style="width:${Math.min(100, value / max * 100)}%"></span></span><span class="bar-value" title="${value} of ${total} titles"><strong>${(value / max * 100).toFixed(1)}%</strong><small>${value} titles</small></span></${tag}>`;
    }).join('');
    bindDashboardFilters(container);
  }

  function bindDashboardFilters(container) {
    container.querySelectorAll('[data-dashboard-filter]').forEach(control => {
      const apply = () => applyDashboardFilter(control.dataset.dashboardFilter, control.dataset.filterValue);
      control.addEventListener('click', apply);
      if (control.tagName.toLowerCase() !== 'button') control.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); apply(); }
      });
    });
  }

  function applyDashboardFilter(type, value) {
    el.searchFilter.value = '';
    el.typeFilter.value = '';
    el.statusFilter.value = '';
    el.networkFilter.value = type === 'network' ? value : '';
    el.genreFilter.value = type === 'genre' ? value : '';
    state.activeView = 'library';
    renderTable();
    updateYearView();
    showToast(`Showing ${value} titles in ${state.activeYear}.`);
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
    hideSynopsis();
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
    const ratingStyle = entry.rating === null ? 'background:rgba(140,148,155,.10);color:#a3abb2;border-color:rgba(140,148,155,.22);' : ratingStyleText(entry.rating);
    const networkClass = networkClassName(entry.network);
    const genres = entry.genres.join(', ');
    const trailer = trailerUrl(entry);
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
    return `<tr data-id="${escapeAttr(entry.id)}">
      <td class="title-cell"><div class="title-wrap"><span class="media-badge">${titleTag}</span><button class="${titleButtonClass}" type="button">${escapeHTML(entry.title)}</button></div></td>
      <td class="center">${season}</td>
      <td class="rating-cell">${rating}</td>
      <td class="external-ratings-cell">${renderExternalRatings(entry)}</td>
      <td title="${escapeAttr(entry.network)}"><span class="network-text ${networkClass}">${escapeHTML(entry.network || '—')}</span></td>
      <td>${status}</td>
      <td class="genre-cell" title="${escapeAttr(genres)}">${escapeHTML(genres || '—')}</td>
      <td class="center ${entry.episodeCount === null ? 'muted-cell' : ''}">${episodes}</td>
      <td class="center ${entry.runtime === null ? 'muted-cell' : ''}">${runtime}</td>
      <td class="center ${!entry.startDate ? 'muted-cell' : ''}">${escapeHTML(formatDate(entry.startDate) || '—')}</td>
      <td class="center"><a class="icon-link" href="${escapeAttr(trailer)}" target="_blank" rel="noreferrer" title="Search YouTube for official trailer" aria-label="Search YouTube for official trailer"><img class="service-icon youtube-icon" src="assets/youtube.png" alt="" width="24" height="24" /></a></td>
      <td class="center"><button class="table-action comment-entry${noteClass}" type="button" title="${entry.comments.trim() ? 'View comments' : 'No comments'}">✎</button></td>
      <td class="edit-only-column"><div class="action-group"><button class="table-action fix-match" type="button" title="Fix metadata match" aria-label="Fix metadata match for ${escapeAttr(entry.title)}">Fix</button><button class="table-action edit-entry" type="button" title="Edit">⋯</button><button class="table-action delete-action delete-entry" type="button" title="Delete">×</button></div></td>
    </tr>`;
  }

  function bindRowEvents() {
    el.showsBody.querySelectorAll('tr').forEach(row => {
      const id = row.dataset.id;
      const titleButton = row.querySelector('.title-button');
      const entry = activeEntries().find(item => item.id === id);
      titleButton.addEventListener('mouseenter', () => showSynopsis(titleButton, entry));
      titleButton.addEventListener('focus', () => showSynopsis(titleButton, entry));
      titleButton.addEventListener('mouseleave', hideSynopsis);
      titleButton.addEventListener('blur', hideSynopsis);
      titleButton.addEventListener('click', hideSynopsis);
      row.querySelector('.comment-entry')?.addEventListener('click', () => openComments(id));
      if (state.mode !== 'edit') return;
      row.querySelector('.fetch-ratings')?.addEventListener('click', () => fetchExternalRatings(id));
      row.querySelector('.fix-match')?.addEventListener('click', () => openFixMatchDialog(id));
      row.querySelectorAll('.edit-entry').forEach(button => button.addEventListener('click', () => openEditDialog(id)));
      row.querySelector('.delete-entry')?.addEventListener('click', () => deleteEntry(id));
      const ratingInput = row.querySelector('.rating-input');
      ratingInput?.addEventListener('input', () => {
        const value = normalizeRating(ratingInput.value);
        ratingInput.style.cssText = value === null ? 'background:rgba(140,148,155,.10);color:#a3abb2;border-color:rgba(140,148,155,.22);' : ratingStyleText(value);
      });
      ratingInput?.addEventListener('change', () => updateInlineRating(id, ratingInput.value));
      const statusSelect = row.querySelector('.inline-status');
      statusSelect?.addEventListener('change', event => updateInlineStatus(id, event.target.value));
    });
  }


  function plainSynopsis(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function hideSynopsis() {
    synopsisAnchor?.removeAttribute('aria-describedby');
    synopsisAnchor = null;
    synopsisTip.hidden = true;
  }

  async function showSynopsis(anchor, entry) {
    if (!entry) return;
    hideSynopsis();
    synopsisAnchor = anchor;
    anchor.setAttribute('aria-describedby', 'synopsisTip');
    synopsisTip.textContent = entry.synopsis || 'Loading synopsis…';
    synopsisTip.hidden = false;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      synopsisTip.style.left = Math.max(8, Math.min(rect.left, innerWidth - synopsisTip.offsetWidth - 8)) + 'px';
      synopsisTip.style.top = Math.max(8, Math.min(rect.bottom + 8, innerHeight - synopsisTip.offsetHeight - 8)) + 'px';
    };
    position();
    let summary = entry.synopsis;
    if (!summary && entry.mediaType === 'tv' && (entry.tvmazeId || entry.imdb)) {
      const key = entry.tvmazeId ? '/shows/' + encodeURIComponent(entry.tvmazeId) : '/lookup/shows?imdb=' + encodeURIComponent(entry.imdb);
      if (!synopsisCache.has(key)) {
        synopsisCache.set(key, fetch(TVMAZE_BASE + key, { signal: AbortSignal.timeout(8000) })
          .then(response => { if (!response.ok) throw new Error('Synopsis unavailable'); return response.json(); })
          .then(show => plainSynopsis(show.summary)).catch(() => { synopsisCache.delete(key); return ''; }));
      }
      summary = await synopsisCache.get(key);
    }
    if (synopsisAnchor !== anchor) return;
    synopsisTip.textContent = summary || 'No synopsis available yet.';
    position();
  }


  function externalScore(value, max) {
    if (value === null || value === undefined || value === '' || value === 'N/A') return null;
    const score = Number(value);
    return Number.isFinite(score) && score >= 0 && score <= max ? score : null;
  }

  function normalizeExternalRatings(raw = {}) {
    return {
      imdb: externalScore(raw?.imdb, 10),
      rt: externalScore(raw?.rt, 100),
      mc: externalScore(raw?.mc, 100),
      mal: externalScore(raw?.mal, 10)
    };
  }


  function safeRatingUrl(value, host) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function parseMdblistRatings(data) {
    const ratings = Array.isArray(data.ratings) ? data.ratings : [];
    const score = source => ratings.find(item => item.source === source)?.value;
    return normalizeExternalRatings({ imdb: score('imdb'), rt: score('tomatoes'), mc: score('metacritic'), mal: score('myanimelist') });
  }

  function parseMdblistUrls(data, mediaType) {
    const ratings = Array.isArray(data.ratings) ? data.ratings : [];
    const make = (source, host, prefix) => {
      const value = ratings.find(item => item.source === source)?.url;
      if (typeof value !== 'string' || !value) return '';
      if (value.startsWith('https://')) return safeRatingUrl(value, host);
      if (!value.startsWith('/') || value.startsWith('//')) return '';
      const path = prefix && !value.startsWith('/tv/') && !value.startsWith('/movie/') ? prefix + value : value;
      return safeRatingUrl('https://' + host + path, host);
    };
    return {
      rt: make('tomatoes', 'www.rottentomatoes.com', ''),
      mc: make('metacritic', 'www.metacritic.com', mediaType === 'tv' ? '/tv' : '/movie'),
      mal: /^\d+$/.test(String(data.ids?.mal || '')) ? 'https://myanimelist.net/anime/' + data.ids.mal : make('myanimelist', 'myanimelist.net', '')
    };
  }

  function renderExternalRatings(entry) {
    const anime = entry.genres.some(genre => String(genre).trim().toLowerCase() === 'anime');
    const matches = entry.ratingsImdbId === entry.imdb;
    const scores = normalizeExternalRatings(matches ? entry.externalRatings : undefined);
    const date = matches && entry.ratingsUpdatedAt ? new Date(entry.ratingsUpdatedAt) : null;
    const updated = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '';
    const scope = entry.mediaType === 'tv' ? 'Overall series scores' : 'Movie scores';
    const pending = ratingsPending.has(entry.imdb);

    const links = {
      imdb: /^tt\d+$/.test(entry.imdb) ? 'https://www.imdb.com/title/' + encodeURIComponent(entry.imdb) + '/' : 'https://www.imdb.com/find/?q=' + encodeURIComponent(entry.title),
      rt: (matches && entry.ratingsUrls?.rt) || 'https://www.rottentomatoes.com/search?search=' + encodeURIComponent(entry.title),
      mc: (matches && entry.ratingsUrls?.mc) || 'https://www.metacritic.com/search/' + encodeURIComponent(entry.title) + '/',
      mal: (matches && entry.ratingsUrls?.mal) || 'https://myanimelist.net/anime.php?q=' + encodeURIComponent(entry.title)
    };
    const badge = (source, label, value) => `<a class="external-score score-${source}" href="${escapeAttr(links[source])}" target="_blank" rel="noopener noreferrer" aria-label="Open ${label} for ${escapeAttr(entry.title)}"><span>${label}</span><b>${value}</b></a>`;
    return `<div class="external-ratings" title="${escapeAttr(scope + (updated ? ' · Updated ' + updated : ' · Not fetched') + ' · Missing title links open a search')}">
      ${badge('imdb', 'IMDb', scores.imdb === null ? '—' : scores.imdb.toFixed(1))}
      ${anime ? badge('mal', 'MAL', scores.mal === null ? '—' : scores.mal.toFixed(2)) :
        badge('rt', 'RT', scores.rt === null ? '—' : scores.rt + '%') +
        badge('mc', 'MC', scores.mc === null ? '—' : scores.mc)}
    </div>${state.mode === 'edit' ? `<button type="button" class="text-button fetch-ratings" ${pending ? 'disabled' : ''} aria-label="${updated ? 'Refresh' : 'Fetch'} ratings for ${escapeAttr(entry.title)}">${pending ? 'Fetching…' : updated ? 'Refresh ratings' : 'Fetch ratings'}</button>` : ''}`;
  }

  async function fetchExternalRatings(id) {
    if (state.mode !== 'edit') return;
    const entry = findWorkingEntry(id);
    if (!entry || ratingsPending.has(entry.imdb)) return;
    if (!/^tt\d+$/.test(entry.imdb)) return showToast('Add a valid IMDb ID in Edit title first.');
    let key;
    try { key = localStorage.getItem(MDBLIST_KEY_STORAGE); } catch {}
    if (!key) { el.mdblistSettingsBtn.click(); return; }
    const imdb = entry.imdb;
    ratingsPending.add(imdb);
    renderTable();
    try {

      const params = new URLSearchParams({ apikey: key });
      const kind = entry.mediaType === 'movie' ? 'movie' : 'show';
      const response = await fetch('https://api.mdblist.com/imdb/' + kind + '/' + encodeURIComponent(imdb) + '?' + params, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(
        response.status === 429 ? 'MDBList request limit reached. Try again later.' :
        [401, 403].includes(response.status) ? 'MDBList key was rejected. Check MDBList key settings.' :
        'MDBList request failed. Existing ratings were kept.');
      const data = await response.json();
      if (data.error) throw new Error('MDBList could not return ratings for this title.');
      if (data.ids?.imdb !== imdb || data.type !== kind) throw new Error('MDBList returned a different title or type. No ratings were saved.');
      if (state.mode !== 'edit' || findWorkingEntry(id) !== entry || entry.imdb !== imdb) return;
      const scores = parseMdblistRatings(data);
      const ratingsUrls = parseMdblistUrls(data, entry.mediaType);
      const updated = new Date().toISOString();
      const targets = state.workingEntries.filter(item => item.imdb === imdb && item.mediaType === entry.mediaType);
      const originals = targets.map(item => ({ item, externalRatings: item.externalRatings, ratingsUrls: item.ratingsUrls, ratingsImdbId: item.ratingsImdbId, ratingsUpdatedAt: item.ratingsUpdatedAt }));
      targets.forEach(item => Object.assign(item, { externalRatings: scores, ratingsUrls, ratingsImdbId: imdb, ratingsUpdatedAt: updated }));
      try { saveWorkingLibrary(); } catch {
        originals.forEach(({ item, ...old }) => Object.assign(item, old));
        throw new Error('Browser storage is full or unavailable. Ratings could not be saved.');
      }
      showToast('Ratings saved locally. Export shows.json to publish. Unavailable scores show —.');
    } catch (error) {
      showToast(error.name === 'TimeoutError' ? 'MDBList timed out. Existing ratings were kept.' :
        error instanceof TypeError ? 'Could not connect to MDBList. Existing ratings were kept.' : error.message);
    } finally {
      ratingsPending.delete(imdb);
      renderTable();
    }
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
    entry.status = statusForPremiereDate(entry.startDate, status);
    if (entry.mediaType === 'tv' && ['Completed','Recommended'].includes(entry.status) && entry.episodesWatched === null) entry.episodesWatched = entry.episodeCount;
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
    state.searchToken++;
    state.selectedMovie = null;
    el.saveEntryBtn.disabled = false;
    state.editingId = null;
    state.selectedShow = null;
    state.selectedSeasons = [];
    state.searchMediaType = 'tv';
    state.fixMatchMode = false;
    el.mediaChoice.hidden = false;
    el.manualEntryBtn.hidden = false;
    el.searchStep.hidden = false;
    el.detailsStep.hidden = true;
    el.tvSearchArea.hidden = true;
    el.searchResults.innerHTML = '';
    el.showSearchInput.value = '';
    hideMessage(el.searchMessage);
  }

  function chooseTvFlow() {
    state.searchToken++;
    el.searchResults.innerHTML = '';
    el.showSearchBtn.disabled = false;
    el.showSearchBtn.textContent = 'Search';
    state.searchMediaType = 'tv';
    if (state.fixMatchMode) el.dialogTitle.textContent = 'Find the correct TV show';
    el.searchLabel.textContent = 'TV show name';
    el.searchHelper.textContent = state.fixMatchMode ? 'Choose the correct TVmaze show. The entry will be converted to TV when saved.' : 'TV search uses TVmaze. You can still enter a TV season manually if needed.';
    el.manualEntryBtn.textContent = 'Enter this TV season manually';
    el.showSearchInput.placeholder = 'e.g. The Bear';
    el.tvSearchArea.hidden = false;
    setTimeout(() => el.showSearchInput.focus(), 30);
  }

  function chooseMovieFlow() {
    state.searchToken++;
    el.searchResults.innerHTML = '';
    el.showSearchBtn.disabled = false;
    el.showSearchBtn.textContent = 'Search';
    state.searchMediaType = 'movie';
    if (state.fixMatchMode) el.dialogTitle.textContent = 'Find the correct movie';
    el.searchLabel.textContent = 'Movie title';
    el.searchHelper.textContent = state.fixMatchMode ? 'Choose the correct MDBList movie. The entry will be converted to a movie when saved.' : 'Movie search uses MDBList and your saved API key. You can still enter a movie manually.';
    el.manualEntryBtn.textContent = 'Enter this movie manually';
    el.showSearchInput.placeholder = 'e.g. The Matrix';
    el.tvSearchArea.hidden = false;
    setTimeout(() => el.showSearchInput.focus(), 30);
  }

  function showFixMatchSearch() {
    state.searchToken++;
    state.selectedShow = null;
    state.selectedMovie = null;
    state.selectedSeasons = [];
    el.searchStep.hidden = false;
    el.detailsStep.hidden = true;
    el.mediaChoice.hidden = false;
    el.tvSearchArea.hidden = false;
    hideMessage(el.metadataMessage);
    setTimeout(() => el.showSearchInput.focus(), 30);
  }

  function openFixMatchDialog(id) {
    const entry = findWorkingEntry(id);
    if (!entry || state.mode !== 'edit') return;
    resetDialog();
    state.editingId = id;
    state.fixMatchMode = true;
    state.searchMediaType = entry.mediaType;
    el.dialogEyebrow.textContent = 'Fix match';
    el.dialogTitle.textContent = `Find the correct ${entry.mediaType === 'movie' ? 'movie' : 'TV show'}`;
    el.mediaChoice.hidden = false;
    el.manualEntryBtn.hidden = true;
    el.searchStep.hidden = false;
    el.detailsStep.hidden = true;
    el.tvSearchArea.hidden = false;
    el.showSearchInput.value = entry.title;
    if (entry.mediaType === 'movie') {
      el.searchLabel.textContent = 'Movie title';
      el.searchHelper.textContent = 'Choose the correct MDBList movie to replace its source metadata and ratings.';
      el.showSearchInput.placeholder = 'e.g. The Matrix';
    } else {
      el.searchLabel.textContent = 'TV show name';
      el.searchHelper.textContent = `Choose the correct TVmaze show. Season ${entry.season} will be selected when available.`;
      el.showSearchInput.placeholder = 'e.g. The Bear';
    }
    el.showDialog.showModal();
    if (entry.mediaType === 'movie') {
      let key = '';
      try { key = localStorage.getItem(MDBLIST_KEY_STORAGE) || ''; } catch {}
      if (!key) {
        showMessage(el.searchMessage, 'Choose TV season to search TVmaze, or add an MDBList key to search for a movie.');
        return;
      }
    }
    void searchShows();
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

  function openManualMovieDetails(title = '') {
    openMovieDetails();
    el.entryTitle.value = title;
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
    if (state.searchMediaType === 'movie') return searchMovies();
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

  function localDateISO(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function statusForPremiereDate(startDate, currentStatus = 'Watching', initialize = false) {
    const canUpdate = DATE_MANAGED_STATUSES.has(currentStatus) || (initialize && currentStatus === 'Watching');
    if (!canUpdate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')) return currentStatus;
    return startDate > localDateISO() ? 'Upcoming' : 'Airing';
  }

  function movieResultValue(movie, keys) {
    for (const key of keys) {
      const value = movie?.[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
    return '';
  }

  function movieSearchResults(data) {
    const pending = [data];
    const visited = new Set();
    const resultKeys = ['results', 'movies', 'items', 'data', 'search', 'payload'];
    while (pending.length) {
      const value = pending.shift();
      if (!value || typeof value !== 'object' || visited.has(value)) continue;
      visited.add(value);
      if (Array.isArray(value)) return value;
      if (movieResultValue(value, ['title', 'name'])) return [value];
      resultKeys.forEach(key => { if (value[key]) pending.push(value[key]); });
    }
    return [];
  }

  function movieGenres(movie) {
    if (!Array.isArray(movie?.genres)) return [];
    return movie.genres.map(genre => typeof genre === 'string' ? genre : (genre?.title || genre?.name)).filter(Boolean);
  }

  function movieReleaseDate(movie) {
    const value = String(movieResultValue(movie, ['released', 'release_date', 'date', 'premiered']) || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  }

  async function searchMovies() {
    const query = el.showSearchInput.value.trim();
    if (!query) return showMessage(el.searchMessage, 'Type a movie title first.', 'error');
    let key;
    try { key = localStorage.getItem(MDBLIST_KEY_STORAGE); } catch {}
    if (!key) { el.mdblistSettingsBtn.click(); return; }
    const token = ++state.searchToken;
    el.showSearchBtn.disabled = true;
    el.showSearchBtn.textContent = 'Searching…';
    el.searchResults.innerHTML = '';
    showMessage(el.searchMessage, 'Searching MDBList…');
    try {
      const params = new URLSearchParams({ query, apikey: key });
      const response = await fetch('https://api.mdblist.com/search/movie?' + params, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 429 ? 'MDBList request limit reached. Try again later.' : [401, 403].includes(response.status) ? 'MDBList key was rejected. Check MDBList key settings.' : `Search failed (${response.status})`);
      const data = await response.json();
      if (data?.error) throw new Error(typeof data.error === 'string' ? `MDBList: ${data.error}` : 'MDBList could not search for movies.');
      const results = movieSearchResults(data);
      if (token !== state.searchToken) return;
      if (!results.length) return showMessage(el.searchMessage, 'No movies found. Try another spelling or enter it manually.', 'error');
      hideMessage(el.searchMessage);
      const visible = results.slice(0, 8);
      el.searchResults.innerHTML = visible.map((movie, index) => {
        const title = movieResultValue(movie, ['title', 'name']);
        const released = movieReleaseDate(movie).slice(0, 4) || movieResultValue(movie, ['year']);
        const genres = movieGenres(movie).slice(0, 3).join(', ');
        const image = movieResultValue(movie, ['poster', 'poster_url', 'image']);
        const meta = [released, genres].filter(Boolean).join(' · ');
        return `<button class="search-result" type="button" data-index="${index}">${image ? `<img class="search-poster" src="${escapeAttr(image)}" alt="">` : '<span class="search-poster search-poster-placeholder">▦</span>'}<span><span class="search-result-title">${escapeHTML(title)}</span><span class="search-result-meta">${escapeHTML(meta)}</span></span><span class="search-result-arrow">›</span></button>`;
      }).join('');
      el.searchResults.querySelectorAll('.search-result').forEach(button => button.addEventListener('click', () => selectMovieSearchResult(visible[Number(button.dataset.index)])));
    } catch (error) {
      console.error(error);
      showMessage(el.searchMessage, error.name === 'TimeoutError' ? 'MDBList timed out. Enter the movie manually or try again.' : error.message || 'Could not reach MDBList. Enter the movie manually.', 'error');
    } finally {
      if (token === state.searchToken) { el.showSearchBtn.disabled = false; el.showSearchBtn.textContent = 'Search'; }
    }
  }

  function movieIds(movie) {
    const ids = movie?.ids || {};
    return {
      imdb: String(ids.imdb || ids.imdbid || movie?.imdb || movie?.imdb_id || movie?.imdbid || (/^tt\d+$/.test(String(movie?.id)) ? movie.id : '')).trim(),
      tmdb: String(ids.tmdb || ids.tmdbid || movie?.tmdb || movie?.tmdb_id || movie?.tmdbid || '').trim(),
      mdblist: String(ids.mdblist || movie?.mdblist_id || movie?.mdblist || (/^m\d+$/.test(String(movie?.id)) ? movie.id : '')).trim()
    };
  }

  async function fetchMovieDetails(movie, key) {
    const ids = movieIds(movie);
    const provider = /^tt\d+$/.test(ids.imdb) ? 'imdb' : /^\d+$/.test(ids.tmdb) ? 'tmdb' : /^[a-z0-9]+$/i.test(ids.mdblist) ? 'mdblist' : '';
    const path = provider ? `${provider}/movie/${encodeURIComponent(ids[provider])}` : '';
    if (!path) throw new Error('This search result has no IMDb or TMDb ID. Metadata could not be loaded; you can enter it manually.');
    const response = await fetch('https://api.mdblist.com/' + path + '?' + new URLSearchParams({ apikey: key }), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 429 ? 'MDBList request limit reached. The title was added without extra metadata.' : `MDBList metadata lookup failed (${response.status}). The title was added without extra metadata.`);
    const data = await response.json();
    if (data?.error) throw new Error(typeof data.error === 'string' ? `MDBList: ${data.error}` : 'MDBList could not load movie metadata.');
    const detail = data?.data && !movieResultValue(data, ['title', 'name']) ? data.data : data;
    const returned = movieIds(detail);
    if (!detail || (detail.type && detail.type !== 'movie') ||
      (provider === 'imdb' && returned.imdb !== ids.imdb) ||
      (provider === 'tmdb' && returned.tmdb !== ids.tmdb) ||
      (provider === 'mdblist' && returned.mdblist !== ids.mdblist &&
        String(detail.title || '').toLowerCase() !== String(movie.title || '').toLowerCase())) {
      throw new Error('MDBList returned a different movie or an invalid record. Metadata was not applied.');
    }
    return detail;
  }

  async function selectMovieSearchResult(movie) {
    const token = ++state.searchToken;
    state.selectedMovie = null;
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.searchStep.hidden = true;
    el.detailsStep.hidden = false;
    el.selectedShowCard.hidden = true;
    fillForm(blankEntry('movie'), true);
    setFormType('movie');
    el.saveEntryBtn.disabled = true;
    el.dialogTitle.textContent = 'Loading movie details…';
    showMessage(el.metadataMessage, 'Loading metadata from MDBList…');
    let fullMovie = movie;
    let detailError = '';
    try {
      let key;
      try { key = localStorage.getItem(MDBLIST_KEY_STORAGE); } catch {}
      if (!key) throw new Error('Save your MDBList key to load movie metadata.');
      fullMovie = await fetchMovieDetails(movie, key);
    } catch (error) {
      detailError = error.name === 'TimeoutError' ? 'MDBList timed out. You can complete the fields manually.' : error.message;
    }
    if (token !== state.searchToken || state.mode !== 'edit') return;
    el.saveEntryBtn.disabled = false;
    const title = String(movieResultValue(fullMovie, ['title', 'name']) || movieResultValue(movie, ['title', 'name']) || '');
    const ids = movieIds(fullMovie);
    const existing = state.fixMatchMode && state.editingId ? findWorkingEntry(state.editingId) : null;
    const entry = existing ? { ...existing } : blankEntry('movie');
    Object.assign(entry, {
      mediaType: 'movie', season: null, tvmazeId: null, tvmazeSeasonId: null, tvmazeUrl: '', tvdb: '',
      title,
      genres: movieGenres(fullMovie),
      runtime: nullableNumber(movieResultValue(fullMovie, ['runtime'])),
      startDate: movieReleaseDate(fullMovie),
      imdb: ids.imdb,
      synopsis: String(movieResultValue(fullMovie, ['description', 'overview', 'plot', 'summary']) || ''),
      image: String(movieResultValue(fullMovie, ['poster', 'poster_url', 'image']) || '')
    });
    el.dialogTitle.textContent = title || 'Add a movie';
    if (!detailError) {
      Object.assign(entry, {
        externalRatings: parseMdblistRatings(fullMovie),
        ratingsUrls: parseMdblistUrls(fullMovie, 'movie'),
        ratingsImdbId: entry.imdb,
        ratingsUpdatedAt: new Date().toISOString()
      });
      state.selectedMovie = entry;
    }
    fillForm(entry, !existing);
    setFormType('movie');
    if (detailError) showMessage(el.metadataMessage, detailError, 'error');
  }

  async function selectSearchResult(show) {
    state.selectedShow = show;
    state.selectedSeasons = [];
    el.searchStep.hidden = true;
    el.detailsStep.hidden = false;
    el.dialogTitle.textContent = 'Choose a season';
    showSelectedShow(show);
    const existing = state.fixMatchMode && state.editingId ? findWorkingEntry(state.editingId) : null;
    const entry = existing ? { ...existing } : blankEntry('tv');
    Object.assign(entry, {
      mediaType: 'tv', season: existing?.mediaType === 'tv' ? existing.season : 1,
      synopsis: plainSynopsis(show.summary), title: show.name, network: getNetwork(show), genres: show.genres || [], runtime: show.averageRuntime ?? show.runtime ?? null,
      imdb: show.externals?.imdb || '', tvdb: show.externals?.thetvdb || ''
    });
    fillForm(entry, !existing);
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
      const preferred = state.fixMatchMode ? state.selectedSeasons.find(season => Number(season.number) === Number(entry.season)) : choosePreferredSeason(state.selectedSeasons, Number(el.entryYear.value));
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
    el.entryStatus.value = statusForPremiereDate(el.entryStartDate.value, el.entryStatus.value, !state.editingId && !state.statusManuallySet);
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
    state.statusManuallySet = false;
    el.entryMediaType.value = entry.mediaType || 'tv';
    el.entryYear.value = entry.year || CURRENT_YEAR;
    el.entryTitle.value = entry.title || '';
    populateSeasonOptions(entry.season || 1);
    el.entrySeason.value = String(entry.season || 1);
    el.entryRating.value = entry.rating ?? '';
    el.entryStatus.value = statusForPremiereDate(entry.startDate, entry.status || 'Watching', isNew);
    el.entryNetwork.value = entry.network || '';
    el.entryGenres.value = (entry.genres || []).join(', ');
    el.entryEpisodeCount.value = entry.episodeCount ?? '';
    el.entryEpisodesWatched.value = entry.episodesWatched ?? '';
    el.entryRuntime.value = entry.runtime ?? '';
    el.entryStartDate.value = entry.startDate || '';
    el.entryWatchedDate.value = entry.watchedDate || '';
    el.entryImdb.value = entry.imdb || '';
    el.entryTvdb.value = entry.tvdb || '';
    el.entrySynopsis.value = entry.synopsis || '';
    el.entryComments.value = entry.comments || '';
    updateEditFieldColors();
    updateDialogExternalRatings(entry);
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
    el.releaseDateLabel.textContent = isMovie ? 'Premier date' : 'Season premier';
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
      ...(existing || {}),
      ...(mediaType === 'movie' && state.selectedMovie?.imdb === cleanImdb(el.entryImdb.value) ? state.selectedMovie : {}),
      id: existing?.id || makeId(), mediaType,
      tvmazeId: mediaType === 'tv' ? (state.selectedShow?.id ?? existing?.tvmazeId ?? null) : null,
      tvmazeSeasonId: mediaType === 'tv' ? (selectedSeason?.id ?? existing?.tvmazeSeasonId ?? null) : null,
      title, season, year, rating, status: el.entryStatus.value, network: el.entryNetwork.value.trim(), genres: splitGenres(el.entryGenres.value),
      episodeCount, episodesWatched, runtime: nullableNumber(el.entryRuntime.value), startDate: el.entryStartDate.value,
      watchedDate: el.entryWatchedDate.value, imdb: cleanImdb(el.entryImdb.value), tvdb: mediaType === 'tv' ? el.entryTvdb.value.trim() : '',
      synopsis: el.entrySynopsis.value.trim(), comments: el.entryComments.value.trim(), tvmazeUrl: mediaType === 'tv' ? (state.selectedShow?.url ?? existing?.tvmazeUrl ?? '') : '',
      image: mediaType === 'tv' ? (state.selectedShow?.image?.medium ?? existing?.image ?? '') : (state.selectedMovie?.image ?? existing?.image ?? ''),
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
    if (/^tt\d+$/.test(entry.imdb) && entry.ratingsImdbId !== entry.imdb) {
      let mdblistKey;
      try { mdblistKey = localStorage.getItem(MDBLIST_KEY_STORAGE); } catch {}
      if (mdblistKey) void fetchExternalRatings(entry.id);
    }
  }

  function openComments(id) {
    const entry = activeEntries().find(item => item.id === id);
    if (!entry) return;
    state.commentEntryId = id;
    el.commentsTitle.textContent = entry.mediaType === 'movie' ? entry.title : `${entry.title} — Season ${entry.season}`;
    el.commentsNetwork.textContent = entry.network || '';
    el.commentsNetwork.hidden = !entry.network;
    el.commentsNetwork.className = `comments-network ${networkClassName(entry.network)}`;
    const personalRatingStyle = entry.rating === null ? 'background:rgba(140,148,155,.10);color:#a3abb2;border-color:rgba(140,148,155,.22);' : ratingStyleText(entry.rating);
    el.commentsRatings.innerHTML = `<span class="personal-rating-badge" style="${personalRatingStyle}" title="Your rating"><span>You</span><b>${entry.rating ?? '—'}</b></span>${renderExternalRatings(entry)}`;
    el.commentsPoster.src = entry.image || '';
    el.commentsPoster.alt = entry.image ? `${entry.title} poster` : '';
    el.commentsPoster.hidden = !entry.image;
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
    const payload = { app: 'Viewlog', version: 3, publishedAt: new Date().toISOString(), entries: state.workingEntries || [] };
    downloadJson(payload, 'shows.json');
    showToast('shows.json downloaded. Replace the copy in GitHub and commit it to publish your changes.');
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { value += '"'; index++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(value); value = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[index + 1] === '\n') index++;
        row.push(value); value = '';
        if (row.some(cell => cell.trim())) rows.push(row);
        row = [];
      } else value += char;
    }
    row.push(value);
    if (row.some(cell => cell.trim())) rows.push(row);
    if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
    if (rows.length < 2) throw new Error('The CSV has no data rows.');
    const headers = rows.shift().map(header => header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_-]+/g, ''));
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
  }

  function repairImportedTitle(title) {
    return String(title || '').trim()
      .replace(/�(?=\d)/g, "'")
      .replace(/�s\b/g, "'s")
      .replace(/\s�\s/g, ' – ');
  }

  function importValue(row, ...names) {
    for (const name of names) if (row[name] !== undefined && row[name] !== '') return row[name];
    return '';
  }

  function importIdentity(entry) {
    return [entry.mediaType, entry.title.trim().toLowerCase(), entry.mediaType === 'tv' ? entry.season : '', entry.year].join('|');
  }

  async function fetchJson(url, label) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${label} failed (${response.status})`);
    return response.json();
  }

  function bestTvmazeMatch(results, title) {
    const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return results.find(result => String(result.show?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalized)?.show || results[0]?.show || null;
  }

  async function enrichImportedEntry(entry, mdblistKey, cache) {
    let mdblistData = null;
    if (entry.mediaType === 'tv') {
      const showKey = entry.title.toLowerCase();
      let show = cache.shows.get(showKey);
      if (show === undefined) {
        const results = await fetchJson(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(entry.title)}`, 'TVmaze search');
        show = bestTvmazeMatch(Array.isArray(results) ? results : [], entry.title);
        cache.shows.set(showKey, show);
      }
      if (!show) throw new Error('No TVmaze match');
      let seasons = cache.seasons.get(show.id);
      if (!seasons) {
        seasons = await fetchJson(`${TVMAZE_BASE}/shows/${show.id}/seasons`, 'TVmaze season lookup');
        cache.seasons.set(show.id, seasons);
      }
      const season = (Array.isArray(seasons) ? seasons : []).find(item => Number(item.number) === entry.season);
      if (!season) throw new Error(`Season ${entry.season} was not found on TVmaze`);
      let episodes = cache.episodes.get(season.id);
      if (!episodes) {
        episodes = await fetchJson(`${TVMAZE_BASE}/seasons/${season.id}/episodes`, 'TVmaze episode lookup');
        cache.episodes.set(season.id, episodes);
      }
      const regular = (Array.isArray(episodes) ? episodes : []).filter(episode => episode.number !== null);
      const runtimes = regular.map(episode => Number(episode.runtime)).filter(runtime => Number.isFinite(runtime) && runtime > 0);
      Object.assign(entry, {
        tvmazeId: show.id, tvmazeSeasonId: season.id, title: show.name,
        network: getNetwork(show), genres: show.genres || [], episodeCount: regular.length || null,
        episodesWatched: ['Completed', 'Recommended'].includes(entry.status) ? (regular.length || null) : null,
        runtime: runtimes.length ? Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length) : (show.averageRuntime || show.runtime || null),
        startDate: entry.startDate || season.premiereDate || '', imdb: show.externals?.imdb || '', tvdb: String(show.externals?.thetvdb || ''),
        synopsis: plainSynopsis(show.summary), tvmazeUrl: show.url || '', image: show.image?.medium || ''
      });
    } else {
      if (!mdblistKey) throw new Error('MDBList key is required for movie metadata');
      const params = new URLSearchParams({ query: entry.title, apikey: mdblistKey });
      const data = await fetchJson('https://api.mdblist.com/search/movie?' + params, 'MDBList movie search');
      const candidates = movieSearchResults(data);
      const title = entry.title.toLowerCase();
      const releaseYear = Number(entry.startDate.slice(0, 4));
      const movie = candidates.find(item => String(item.title || '').toLowerCase() === title && (!releaseYear || Number(item.year) === releaseYear)) ||
        candidates.find(item => String(item.title || '').toLowerCase() === title) || candidates[0];
      if (!movie) throw new Error('No MDBList movie match');
      mdblistData = await fetchMovieDetails(movie, mdblistKey);
      const ids = movieIds(mdblistData);
      Object.assign(entry, {
        title: movieResultValue(mdblistData, ['title', 'name']) || entry.title,
        genres: movieGenres(mdblistData), runtime: nullableNumber(movieResultValue(mdblistData, ['runtime'])),
        startDate: entry.startDate || movieReleaseDate(mdblistData), imdb: ids.imdb,
        synopsis: movieResultValue(mdblistData, ['description', 'overview', 'plot', 'summary']) || '',
        image: movieResultValue(mdblistData, ['poster', 'poster_url', 'image']) || ''
      });
    }
    if (mdblistKey && /^tt\d+$/.test(entry.imdb)) {
      mdblistData ||= await fetchJson(`https://api.mdblist.com/imdb/${entry.mediaType === 'movie' ? 'movie' : 'show'}/${encodeURIComponent(entry.imdb)}?${new URLSearchParams({ apikey: mdblistKey })}`, 'MDBList ratings lookup');
      Object.assign(entry, {
        externalRatings: parseMdblistRatings(mdblistData), ratingsUrls: parseMdblistUrls(mdblistData, entry.mediaType),
        ratingsImdbId: entry.imdb, ratingsUpdatedAt: new Date().toISOString()
      });
    }
    return normalizeEntry(entry);
  }

  async function importCsvLibrary(file) {
    const rows = parseCsv(await file.text());
    const fileYear = Number(file.name.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/)?.[1]);
    const prepared = rows.map((row, index) => {
      const title = repairImportedTitle(importValue(row, 'title', 'name'));
      const seasonValue = importValue(row, 'season');
      const explicitType = importValue(row, 'type', 'mediatype').toLowerCase();
      const mediaType = explicitType === 'movie' || (!explicitType && !seasonValue) ? 'movie' : 'tv';
      const startDate = importValue(row, 'start', 'premierdate', 'premieredate', 'startdate', 'releasedate');
      const year = Number(importValue(row, 'archiveyear', 'year')) || fileYear || Number(startDate.slice(0, 4));
      const statusInput = importValue(row, 'status');
      const status = STATUS_OPTIONS.find(option => option.toLowerCase() === statusInput.toLowerCase()) || 'Completed';
      const rating = normalizeRating(importValue(row, 'rating'));
      if (!title) throw new Error(`Row ${index + 2} has no title.`);
      if (!Number.isInteger(year)) throw new Error(`Row ${index + 2} needs an archive year or a year in the filename.`);
      if (mediaType === 'tv' && (!Number.isInteger(Number(seasonValue)) || Number(seasonValue) < 1)) throw new Error(`Row ${index + 2} has an invalid season.`);
      return normalizeEntry({ ...blankEntry(mediaType), id: makeId(), mediaType, title, season: mediaType === 'tv' ? Number(seasonValue) : null,
        year, rating, status, startDate, watchedDate: importValue(row, 'watcheddate', 'finisheddate'), comments: importValue(row, 'comments', 'notes'),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    const existingCounts = new Map();
    (state.workingEntries || []).forEach(entry => existingCounts.set(importIdentity(entry), (existingCounts.get(importIdentity(entry)) || 0) + 1));
    const incomingCounts = new Map(), toImport = [];
    prepared.forEach(entry => {
      const identity = importIdentity(entry);
      const occurrence = (incomingCounts.get(identity) || 0) + 1;
      incomingCounts.set(identity, occurrence);
      if (occurrence > (existingCounts.get(identity) || 0)) toImport.push(entry);
    });
    const skipped = prepared.length - toImport.length;
    if (!confirm(`Import ${toImport.length} new row${toImport.length === 1 ? '' : 's'} from ${file.name}? ${skipped} existing occurrence${skipped === 1 ? '' : 's'} will be skipped. Repeated rows beyond the existing count will be kept.`)) return;
    let mdblistKey = '';
    try { mdblistKey = localStorage.getItem(MDBLIST_KEY_STORAGE) || ''; } catch {}
    const cache = { shows: new Map(), seasons: new Map(), episodes: new Map() };
    const imported = [], failures = [];
    for (let index = 0; index < toImport.length; index++) {
      const entry = toImport[index];
      el.publishedStatus.textContent = `Importing ${index + 1} of ${toImport.length}: ${entry.title}`;
      try { imported.push(await enrichImportedEntry(entry, mdblistKey, cache)); }
      catch (error) { console.warn(`CSV import: ${entry.title}`, error); failures.push(`${entry.title}${entry.mediaType === 'tv' ? ` S${entry.season}` : ''}: ${error.message}`); imported.push(normalizeEntry(entry)); }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    state.workingEntries.push(...imported);
    saveWorkingLibrary();
    refreshEverything();
    el.publishedStatus.textContent = failures.length ? `${imported.length} imported · ${failures.length} need review` : `${imported.length} CSV rows imported`;
    if (failures.length) console.warn('CSV rows needing manual review:\n' + failures.join('\n'));
    showToast(`${imported.length} rows imported${failures.length ? `; ${failures.length} need manual review` : ' with metadata and ratings'}.`);
  }

  async function importWorkingLibrary(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') return await importCsvLibrary(file);
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
      alert('That file is not a valid Viewlog JSON file.');
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
    state.selectedMovie = null;
    state.fixMatchMode = false;
    state.statusManuallySet = false;
    el.saveEntryBtn.disabled = false;
    el.mediaChoice.hidden = false;
    el.manualEntryBtn.hidden = false;
    state.searchToken++;
    state.editingId = null;
    state.selectedShow = null;
    state.selectedSeasons = [];
    el.showForm.reset();
    el.dialogExternalRatings.hidden = true;
    el.dialogExternalRatings.innerHTML = '';
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
    return `background:hsl(${hue} 70% 55% / .11);color:hsl(${hue} 75% 70%);border-color:hsl(${hue} 70% 55% / .24);`;
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
  function updateEditFieldColors() {
    const rating = normalizeRating(el.entryRating.value);
    el.entryRating.style.cssText = rating === null ? 'background:rgba(140,148,155,.10);color:#a3abb2;border-color:rgba(140,148,155,.22);' : ratingStyleText(rating);
    const statusClasses = STATUS_OPTIONS.map(statusClassName);
    el.entryStatus.classList.remove(...statusClasses);
    el.entryStatus.classList.add(statusClassName(el.entryStatus.value));
    el.entryNetwork.classList.remove('network-netflix', 'network-disney', 'network-hbo', 'network-apple', 'network-prime', 'network-crunchyroll', 'network-peacock', 'network-paramount', 'network-hulu');
    const networkClass = networkClassName(el.entryNetwork.value);
    if (networkClass) el.entryNetwork.classList.add(networkClass);
  }
  function updateDialogExternalRatings(entry) {
    if (!entry?.imdb) {
      el.dialogExternalRatings.hidden = true;
      el.dialogExternalRatings.innerHTML = '';
      return;
    }
    el.dialogExternalRatings.innerHTML = renderExternalRatings(entry);
    el.dialogExternalRatings.hidden = false;
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
