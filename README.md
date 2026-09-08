# Viewlog — GitHub Pages Edition

This is a static, year-by-year TV and movie tracker designed for a **public GitHub Pages site**.

The important behavior is simple:

- **Everyone who visits your normal GitHub Pages URL sees the catalog in `shows.json`.**
- The public page is read-only.
- Your normal/public URL does not show editing controls.
- Only someone with write access to your GitHub repository can actually replace the published `shows.json` file.

## Public site vs. your editor

### Public URL

Open the site normally:

`https://YOUR-USERNAME.github.io/YOUR-REPO/`

That always loads the current `shows.json` stored in the GitHub repository. This is what you give to friends or other visitors.

### Your local editor

Add `?edit=1` to the end of the same address:

`https://YOUR-USERNAME.github.io/YOUR-REPO/?edit=1`

That opens the local editor. The editor creates/uses a private working copy in **your browser's localStorage**.

There is no password or GitHub token hidden in the webpage. That means even if somebody discovers `?edit=1`, their changes stay only in their own browser and **cannot change your GitHub repository or your public catalog**.

## Publishing changes

Your normal workflow is:

1. Open your site with `?edit=1`.
2. Add or edit TV seasons and movies.
3. Click **Export shows.json**.
4. A new `shows.json` downloads to your computer.
5. In GitHub, replace the existing `shows.json` in your repository with the new one.
6. Commit the change.
7. GitHub Pages redeploys and visitors now see your updated list.

The `shows.json` file is therefore the **single published source of truth**.

## Year tabs

The site automatically creates a tab for:

- the current year, even if it is still empty;
- every previous/future year present in `shows.json`;
- an **All** tab for the full archive.

When adding an older title, simply choose the correct **Archive year** in the form. For example, an entry with `year: 2023` automatically causes a **2023** tab to appear.

## TV seasons and movies

### TV seasons

Choose **TV season** when adding a title. TVmaze search can automatically fill available information such as:

- show title;
- network or streaming service;
- genres;
- season number;
- episode count;
- average episode runtime;
- season premiere date;
- IMDb ID;
- TVDB ID.

### Movies

Choose **Movie** to search MDBList and pre-fill the movie metadata. This uses the same MDBList key saved in editor mode. Manual entry remains available if a result is missing or you do not want to use the lookup.

For movies you can enter:

- title;
- archive year;
- rating;
- status;
- network/service/studio;
- genres;
- runtime;
- release date;
- watched date;
- IMDb ID;
- comments.

## Status colors

The requested status colors are built in:

- **Upcoming** — orange; assigned automatically when the premiere date is after today
- **Airing** — teal; assigned to a newly matched title when its premiere date is today or earlier and you have not marked it as Watching
- **Completed** — green
- **Watching** — blue
- **Recommended** — purple
- **On Hold** — yellow
- **Dropped** — red
- **Trash** — grey

The premiere-date rule only transitions Upcoming and Airing entries. Watching is a deliberate personal status and is never replaced by the date check. Completed, Recommended, On Hold, Dropped and Trash are also retained.

## Year analytics

Every individual year tab includes a dashboard generated automatically from the entries in that year.

It currently shows:

- total titles;
- TV-season vs movie count;
- estimated/known hours watched;
- average rating;
- number of unique genres;
- most-watched network/service;
- top genres;
- network/service distribution;
- status distribution;
- monthly rating trend;
- a combined genre chart with frequency bars and an average-rating line.

Genre and network rows on the dashboard are interactive. Select one to return to the library with that genre or network applied as the active filter; the selected year is preserved.
Related charts are grouped into dedicated Genre analytics and Network analytics sections.

### How hours watched are calculated

For a TV season:

`episodes watched × average runtime`

If a TV season is marked **Completed** or **Recommended** and you leave *Episodes watched* blank, the tracker assumes you watched the full episode count.

For a movie, its runtime counts as watched time (except entries marked Trash).

### Rating trend

The monthly rating trend uses **Watched / finished date** when available. If that field is empty, the release/season-start date is used as a fallback.

## First GitHub Pages setup

1. Create a public GitHub repository, for example `watch-archive`.
2. Upload these files to the root of the repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `shows.json`
   - `README.md`
   - `assets/` (contains the Viewlog logo)
3. Commit them to `main`.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select `main` and `/(root)`.
7. Save.

GitHub will provide a URL similar to:

`https://YOUR-USERNAME.github.io/watch-archive/`

## Moving your unpublished edits to another computer

Your local editing copy is browser-specific. You have two easy options:

- If the latest version is already published, open `?edit=1` on the new computer and choose **Reset from published**.
- If you have unpublished work, export `shows.json`, move that file to the other computer, and use **Import JSON** in editor mode.

## Bulk CSV import

In editor mode, choose **Import CSV / JSON** to append a CSV watch history. Supported columns are `Title`, `Season`, `Rating`, `Status`, and `Start` (premiere date). `Type`, `Archive Year`, `Watched Date`, and `Comments` are optional. A numbered season is treated as TV; a blank season is treated as a movie unless `Type` is supplied. If `Archive Year` is missing, Viewlog uses a four-digit year in the filename (for example, `2026.csv`), then falls back to the premiere year.

TV rows are enriched from TVmaze and movie rows from MDBList. When an IMDb ID and MDBList key are available, external ratings are fetched during import. Existing occurrences are skipped by title, season, type, and archive year; additional repeated rows in the CSV are preserved. Rows that cannot be matched are still imported using the supplied fields and counted as needing review.

## Data source

TV-show metadata is provided by [TVmaze](https://www.tvmaze.com/) through its public API.

## External ratings (MDBList)
In editor mode, use **MDBList key** to save your activated key in this browser.
When you add a title with an IMDb ID, its ratings are fetched automatically.
Use **Fetch ratings** for an existing title that has not been fetched, or **Refresh
ratings** to update saved scores. Opening the page does not request scores.
IMDb (yellow) is out of 10, RT (red) is a percentage, and MC (green) is out of 100.
Unavailable scores display a dash. Hover the scores for the last fetch date.
TV scores represent the overall series, not an individual season. A fetch updates
working entries with the same IMDb ID using one request.
Export and publish shows.json to share saved scores. The API key is stored
separately and is never exported. Save an empty key to remove it from this browser.

Movie search also uses this key to retrieve titles and pre-fill available metadata, including the IMDb ID, release date, genres, runtime and synopsis.

In editor mode, use the **Fix metadata match** action on an existing row to search again and choose the correct TVmaze show or MDBList movie. You can switch between TV and Movie during this search, which also corrects an entry's media type. Fixing a match replaces source metadata and refreshes external ratings while retaining your archive year, personal rating, status, watched date and comments.

Ratings badges link to their source pages. MDBList source URLs are saved in shows.json; if no URL is available, the badge opens a search. Existing scores remain until you manually refresh. Enter a MDBList key using the editor key settings; old OMDb keys are not reused.

Titles with an Anime genre (case-insensitive) display IMDb and MyAnimeList scores instead of RT and MC. MAL scores are out of 10 and link to MyAnimeList. Manually refresh previously fetched titles to retrieve MAL scores; unavailable scores show a dash.
