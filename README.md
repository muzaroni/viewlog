# Watch Archive — GitHub Pages Edition

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

Choose **Movie** to add a film. Movie entries currently use manual metadata entry so the site can remain static and require no private movie-database API key.

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

- **Completed** — green
- **Watching** — blue
- **Recommended** — purple
- **On Hold** — yellow
- **Dropped** — red
- **Trash** — grey

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
- monthly rating trend.

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

## Data source

TV-show metadata is provided by [TVmaze](https://www.tvmaze.com/) through its public API.
