# SG Bus Timings Guide

How to use the [web app](../main-site/) and the [Telegram bot](../telegram-bot/),
at [guide.sgbus.uwuapps.org](https://guide.sgbus.uwuapps.org).

Laid out like GitBook (sidebar, page, "On this page", previous and next, search
on Ctrl K or `/`) and themed per `uwuapps-theme.md`: seven brand colours, light,
dark and time-based modes, Jua, glass surfaces, no emoji, no em dashes.

## Writing pages

- Pages are Markdown in `content/`, each starting with front matter:

  ```markdown
  ---
  title: Plan a route
  description: One sentence, shown under the title and in search results.
  ---
  ```

- `content/SUMMARY.md` sets the sidebar groups and page order, the GitBook way.
  A page missing from it fails the build.
- Link between pages with relative `.md` paths, anchors included:
  `[sync](../web/sync.md#if-it-will-not-connect)`. The build turns them into
  clean URLs, and fails on a link to a missing page or heading.
- Hints use GitHub's alert syntax: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`.
- A top level numbered list is drawn as steps.
- Images go in `public/images/` and are linked as `/images/name.png`.

## Building

```bash
npm install
npm run dev     # builds, then serves dist/ at http://localhost:4321
npm run build   # builds dist/ only
```

The build writes every page, `search-index.json`, `sitemap.xml`, a 404 page,
and `version.json`. The version is a hash of the sources: when it changes, open
pages show the "new version is ready" bar from `update-bar-spec.md`.

## Deploying

A Vercel project with **Root Directory** set to `docs-site`. `vercel.json`
holds the build command, output directory and clean URLs. Add the domain
`guide.sgbus.uwuapps.org` to the project, and a `CNAME` record for `guide.sgbus`
pointing at `cname.vercel-dns.com` with the DNS provider.
