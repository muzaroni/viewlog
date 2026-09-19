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
  TVMAZE_BASE: 'https://api.tvmaze.com', MDBLIST_KEY_STORAGE: 'test',
  localStorage: { getItem: () => 'test-key' }, state: { searchToken: 0, searchMediaType: 'tv' },
  el: elements(), showMessage: (el, text) => { el.textContent = text; }, hideMessage: () => {},
  escapeHTML: String, escapeAttr: String, getNetwork: () => '',
});
for (const name of ['parseTitleSearch', 'movieResultValue', 'movieSearchResults', 'movieGenres', 'movieReleaseDate', 'searchShows', 'searchMovies']) vm.runInContext(extract(name), ctx);
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
  console.log('Title/year parsing and movie/TV search regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
