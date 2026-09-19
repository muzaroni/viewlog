const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp('  (?:async )?function ' + name + '\\('));
  const end = source.indexOf('\n  ', start + 3);
  // Top-level functions end on an unindented-by-body closing brace.
  return source.slice(start, source.indexOf('\n  }', end) + 4);
}
const elements = () => ({
  showSearchInput: { value: '' }, showSearchBtn: {}, searchMessage: {},
  searchResults: { innerHTML: '', querySelectorAll: () => [] },
});
const ctx = vm.createContext({
  URLSearchParams, AbortSignal, console,
  TVMAZE_BASE: 'https://api.tvmaze.com', MDBLIST_KEY_STORAGE: 'test', TMDB_KEY_STORAGE: 'tmdb-test',
  localStorage: { getItem: () => 'test-key' }, state: { searchToken: 0, searchMediaType: 'tv' },
  el: elements(), showMessage: (el, text) => { el.textContent = text; }, hideMessage: () => {},
  escapeHTML: String, escapeAttr: String, getNetwork: () => '',
});
for (const name of ['parseTitleSearch', 'movieResultValue', 'movieSearchResults', 'movieGenres', 'movieReleaseDate', 'moviePeople', 'movieIds', 'fetchMovieCredits', 'movieSearchContent', 'searchShows', 'searchMovies']) vm.runInContext(extract(name), ctx);
for (const [input, title, year] of [
  ['Animals 2026', 'Animals', '2026'], [' Animals (2026) ', 'Animals', '2026'],
  ['1917', '1917', ''], ['2001: A Space Odyssey', '2001: A Space Odyssey', ''],
  ['Blade Runner 2049 2017', 'Blade Runner 2049', '2017'], ['Animals', 'Animals', ''],
]) {
  const parsed = ctx.parseTitleSearch(input);
  assert.equal(parsed.query, title); assert.equal(parsed.year, year);
}
(async () => {
  let requested;
  const movies = [...Array.from({ length: 9 }, (_, i) => ({ title: 'Animals ' + i, year: 2014 })), { title: 'Animals', year: 2026 }, { title: 'Adjacent', year: 2025 }];
  ctx.fetch = async url => { requested = new URL(url); return { ok: true, json: async () => ({ search: movies }) }; };
  ctx.el.showSearchInput.value = 'Animals (2026)';
  await ctx.searchMovies();
  assert.equal(requested.searchParams.get('query'), 'Animals');
  assert.equal(requested.searchParams.get('year'), '2026');
  assert.equal(requested.searchParams.get('limit'), '50');
  assert.match(ctx.el.searchResults.innerHTML, /2026/);
  assert.doesNotMatch(ctx.el.searchResults.innerHTML, /2014|Adjacent/);
  ctx.el.showSearchInput.value = 'Animals';
  await ctx.searchMovies();
  assert.equal(requested.searchParams.has('year'), false);
  assert.equal((ctx.el.searchResults.innerHTML.match(/data-index=/g) || []).length, 11);
  ctx.fetch = async url => { requested = new URL(url); return { ok: true, json: async () => movies.map(movie => ({ show: { name: movie.title, premiered: movie.year + '-01-01' } })) }; };
  ctx.el.showSearchInput.value = 'Animals 2026';
  await ctx.searchShows();
  assert.equal(requested.searchParams.get('q'), 'Animals');
  assert.match(ctx.el.searchResults.innerHTML, /2026/);
  assert.doesNotMatch(ctx.el.searchResults.innerHTML, /2014|Adjacent/);
  ctx.el.showSearchInput.value = 'Animals 2024';
  await ctx.searchShows();
  assert.equal(ctx.el.searchResults.innerHTML, '');
  assert.match(ctx.el.searchMessage.textContent, /No matches/);
  assert.equal(ctx.el.showSearchBtn.disabled, false);
  const credits = ctx.movieSearchContent({ title: 'Animals', year: 2026, poster: 'https://example.com/poster.jpg', extra: { director: [{ name: 'Director Name' }], cast: [{ name: 'Actor One' }, { name: 'Actor Two' }] } });
  assert.match(credits, /Directed by Director Name/);
  assert.match(credits, /Starring Actor One, Actor Two/);
  assert.match(credits, /src="https:\/\/example.com\/poster.jpg"/);
  assert.match(ctx.movieSearchContent({ title: 'Unknown' }), /Directed by Unavailable from MDBList/);
  // Shape verified against the live MDBList response: extra has no credits.
  const apiMovie = { title: 'Animals', year: 2026, ids: { imdb: 'tt31049299', mdblist: '3b0fx' }, poster: 'https://image.tmdb.org/t/p/original/pzGIIFt33PHYHb2HJwof0WHrJKR.jpg', extra: { trivia: null, expectations: null } };
  const apiContent = ctx.movieSearchContent(apiMovie);
  assert.match(apiContent, /Directed by Unavailable from MDBList/);
  assert.match(apiContent, /Starring Unavailable from MDBList/);
  assert.match(apiContent, /pzGIIFt33PHYHb2HJwof0WHrJKR.jpg/);
  ctx.fetch = async url => {
    const request = new URL(url);
    assert.equal(request.hostname, 'api.themoviedb.org');
    assert.equal(request.pathname, '/3/movie/1236045/credits');
    return { ok: true, json: async () => ({ id: 1236045, crew: [{ job: 'Director', name: 'Ben Affleck' }, { job: 'Writer', name: 'Other Person' }], cast: [{ name: 'Ben Affleck' }, { name: 'Kerry Washington' }, { name: 'Steven Yeun' }] }) };
  };
  const tmdbCredits = await ctx.fetchMovieCredits({ ids: { tmdb: 1236045 } });
  const enriched = ctx.movieSearchContent({ ...apiMovie, ...tmdbCredits });
  assert.match(enriched, /Directed by Ben Affleck/);
  assert.match(enriched, /Starring Ben Affleck, Kerry Washington, Steven Yeun/);
  assert.doesNotMatch(enriched, /Other Person/);
  ctx.fetch = async () => ({ ok: false, status: 401 });
  assert.match((await ctx.fetchMovieCredits({ ids: { tmdb: 1236045 } })).creditsStatus, /Check TMDb key/);
  ctx.fetch = async () => { throw new Error('Network failed'); };
  assert.equal((await ctx.fetchMovieCredits({ ids: { tmdb: 1236045 } })).creditsStatus, 'Credits unavailable');
  ctx.localStorage.getItem = () => '';
  assert.match((await ctx.fetchMovieCredits({ ids: { tmdb: 1236045 } })).creditsStatus, /Add TMDb key/);
  ctx.localStorage.getItem = () => 'test-key';
  const buttons = Array.from({ length: 3 }, () => ({ innerHTML: '', addEventListener() {}, querySelector: () => null }));
  ctx.el.searchResults.querySelectorAll = () => buttons;
  const pending = [];
  ctx.fetchMovieDetails = () => new Promise(resolve => pending.push(resolve));
  ctx.fetch = async () => ({ ok: true, json: async () => ({ search: movies.slice(0, 3) }) });
  ctx.el.showSearchInput.value = 'Animals';
  await ctx.searchMovies();
  assert.equal(pending.length, 3);
  pending[0]({ title: 'Animals', director: 'Director Name', cast: ['Actor One'], poster: 'https://example.com/poster.jpg' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(buttons[0].innerHTML, /Directed by Director Name/);
  ctx.state.searchToken++;
  pending[1]({ title: 'Stale result' }); pending[2]({ title: 'Stale result' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(buttons[1].innerHTML, '');
  console.log('Title/year parsing and movie/TV search regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
