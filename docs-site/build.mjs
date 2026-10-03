// Builds the SG Bus Timings Guide into dist/.
//
// Pages are Markdown in content/, ordered by content/SUMMARY.md the way GitBook
// orders them. Everything in public/ is copied across untouched. Run with
// --serve to build and then serve dist/ on http://localhost:4321 with the same
// clean URLs Vercel gives it.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, "content");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");

const SITE = {
  name: "SG Bus Timings Guide",
  short: "SG Bus Timings",
  origin: "https://guide.sgbus.uwuapps.org",
  app: "https://sgbus.uwuapps.org",
  bot: "https://t.me/UwUsgbus_bot",
  description: "How to use SG Bus Timings' web app and Telegram bot for live bus arrivals, routes and journeys by bus and train.",
};

// Keep in sync with APP_KEY in public/js/theme.js.
const APP_KEY = "sgbusguide";

// The same Analytics property and AdSense publisher as the main site.
const GA_ID = "G-FMCYFTFPEL";
const ADSENSE_CLIENT = "ca-pub-9715826188316382";

// ---------- helpers ----------

const posix = path.posix;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function urlFor(file) {
  if (file === "README.md") return "/";
  return "/" + file.replace(/\.md$/, "");
}

function outPathFor(url) {
  return path.join(DIST, url === "/" ? "index.html" : url.slice(1) + ".html");
}

// Front matter is a few `key: value` lines between --- fences. Nothing nested.
function splitFrontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: src.slice(m[0].length) };
}

function lastUpdated(abs) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", abs], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
    return out ? new Date(out) : null;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore",
});

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else out.push(abs);
  }
  return out;
}

// ---------- SUMMARY.md ----------

// GitBook's table of contents: `## Group` headings, each followed by a list of
// `* [Title](file.md)` links. The order here is the sidebar order and the
// previous/next order.
async function readSummary() {
  const src = await readFile(path.join(CONTENT, "SUMMARY.md"), "utf8");
  const groups = [];
  let group = null;
  for (const line of src.split(/\r?\n/)) {
    const g = line.match(/^##\s+(.+)$/);
    if (g) {
      group = { title: g[1].trim(), pages: [] };
      groups.push(group);
      continue;
    }
    const p = line.match(/^\s*[*-]\s+\[(.+?)\]\((.+?\.md)\)/);
    if (p) {
      if (!group) {
        group = { title: "", pages: [] };
        groups.push(group);
      }
      group.pages.push({ navTitle: p[1], file: posix.normalize(p[2]) });
    }
  }
  return groups;
}

// ---------- Markdown ----------

const HINTS = {
  NOTE: { kind: "info", icon: "info", label: "Note" },
  INFO: { kind: "info", icon: "info", label: "Note" },
  TIP: { kind: "tip", icon: "bulb", label: "Tip" },
  WARNING: { kind: "warning", icon: "alert", label: "Heads up" },
};

// Per-page state the renderer writes into while one page is parsed.
let state = { headings: [], slugs: new Set() };

const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      // The page's own title is the only h1; a stray one in the Markdown drops a level.
      const level = Math.max(2, depth);
      const text = stripTags(inner);
      let id = slugify(text);
      for (let n = 2; state.slugs.has(id); n++) id = `${slugify(text)}-${n}`;
      state.slugs.add(id);
      if (level <= 3) state.headings.push({ level, id, text });
      return `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section"><span data-icon="link"></span></a></h${level}>\n`;
    },

    // Page text is not selectable (uwuapps-theme.md), so anything a reader might
    // want to paste, a command, a stop code, a search, is a button that copies it.
    codespan({ text }) {
      const t = escapeHtml(text);
      return `<button type="button" class="copy-chip" data-copy="${t}" title="Copy" aria-label="Copy ${t}"><code>${t}</code><span class="copy-chip-icon" data-icon="copy"></span></button>`;
    },

    code({ text }) {
      const t = escapeHtml(text.replace(/\n$/, ""));
      return `<div class="code-block"><pre><code>${t}</code></pre><button type="button" class="iconBtn copy-btn" data-copy="${t}" aria-label="Copy this code"><span data-icon="copy"></span>Copy</button></div>\n`;
    },

    // GitHub style alerts become GitBook style hints:
    // > [!TIP]
    // > Text of the tip.
    blockquote({ tokens }) {
      let body = this.parser.parse(tokens);
      const m = body.match(/^<p>\[!(NOTE|INFO|TIP|WARNING)\]\s*/);
      if (!m) return `<blockquote>\n${body}</blockquote>\n`;
      const hint = HINTS[m[1]];
      body = "<p>" + body.slice(m[0].length);
      body = body.replace(/^<p><\/p>\s*/, "");
      return `<div class="hint hint-${hint.kind}" role="note" aria-label="${hint.label}"><span class="hint-icon" data-icon="${hint.icon}"></span><div class="hint-body">${body}</div></div>\n`;
    },
  },
});

// ---------- templates ----------

const PREPAINT = `<script>
    (function () {
      var k = "${APP_KEY}";
      var m = localStorage.getItem(k + ".mode") || "light";

      // Time based mode. Resolved here rather than in theme.js because
      // theme.js runs after first paint, and an evening reader would
      // otherwise watch a white page turn dark. Keep the two hours in step
      // with LIGHT_FROM_HOUR and LIGHT_UNTIL_HOUR in js/theme.js.
      document.documentElement.setAttribute("data-mode-preference", m);
      if (m === "time") {
        var h = new Date().getHours();
        m = h >= 9 && h < 18 ? "light" : "dark";
      }

      var c = localStorage.getItem(k + ".colorTheme") || "classic";
      document.documentElement.setAttribute("data-mode", m);
      document.documentElement.setAttribute("data-color-theme", c);
    })();
  </script>`;

function sidebarHtml(groups, activeFile) {
  return groups.map((g) => {
    const links = g.pages.map((p) => {
      const active = p.file === activeFile;
      return `<li><a class="nav-link${active ? " active" : ""}" href="${urlFor(p.file)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(p.navTitle)}</a></li>`;
    }).join("");
    const title = g.title ? `<p class="nav-group-title">${escapeHtml(g.title)}</p>` : "";
    return `<div class="nav-group">${title}<ul>${links}</ul></div>`;
  }).join("");
}

function tocHtml(headings) {
  if (headings.length < 2) return "";
  const items = headings.map((h) =>
    `<li class="toc-l${h.level}"><a href="#${h.id}" data-toc="${h.id}">${escapeHtml(h.text)}</a></li>`
  ).join("");
  return `<nav class="toc-inner" aria-label="On this page"><p class="toc-title"><span data-icon="list"></span>On this page</p><ul>${items}</ul></nav>`;
}

function pagerHtml(prev, next) {
  if (!prev && !next) return "";
  const link = (p, dir) => p
    ? `<a class="pager-link glass ${dir}" href="${urlFor(p.file)}"><span class="pager-dir">${dir === "prev" ? '<span data-icon="arrow-left"></span>Previous' : 'Next<span data-icon="arrow-right"></span>'}</span><span class="pager-title">${escapeHtml(p.title)}</span></a>`
    : `<span class="pager-spacer"></span>`;
  return `<nav class="pager" aria-label="Previous and next pages">${link(prev, "prev")}${link(next, "next")}</nav>`;
}

function themeModalHtml() {
  return `<div class="modal-backdrop hidden" id="themeModal">
    <div class="modal glass" role="dialog" aria-modal="true" aria-labelledby="themeModalTitle">
      <div class="modal-head">
        <h2 id="themeModalTitle">Theme</h2>
        <button class="icon-btn small" type="button" data-close-modal="themeModal" aria-label="Close">
          <span data-icon="close"></span>
        </button>
      </div>
      <p class="modal-section-label">Mode</p>
      <div class="mode-toggle" id="modeToggle">
        <button class="mode-btn" type="button" data-mode="light" aria-pressed="false"><span data-icon="sun"></span>Light</button>
        <button class="mode-btn" type="button" data-mode="dark" aria-pressed="false"><span data-icon="moon"></span>Dark</button>
        <button class="mode-btn mode-btn-wide" type="button" data-mode="time" aria-pressed="false"><span data-icon="clock"></span>Time-based</button>
      </div>
      <p class="mode-note" id="modeNote" hidden></p>
      <p class="modal-section-label">Brand colour</p>
      <div class="swatch-grid" id="swatchGrid"></div>
    </div>
  </div>`;
}

function searchModalHtml() {
  return `<div class="modal-backdrop search-backdrop hidden" id="searchModal">
    <div class="modal glass search-modal" role="dialog" aria-modal="true" aria-label="Search the guide">
      <div class="search-field">
        <span class="search-field-icon" data-icon="search"></span>
        <input id="searchInput" class="search-input" type="search" placeholder="Search the guide" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Search the guide" aria-controls="searchResults" />
        <button class="icon-btn small" type="button" data-close-modal="searchModal" aria-label="Close search">
          <span data-icon="close"></span>
        </button>
      </div>
      <div id="searchResults" class="search-results" role="listbox" aria-label="Results"></div>
      <p class="search-foot" id="searchFoot">Try <button type="button" class="search-suggest">postal code</button> <button type="button" class="search-suggest">service alerts</button> <button type="button" class="search-suggest">routine</button> <button type="button" class="search-suggest">wrong side</button> <button type="button" class="search-suggest">sync</button></p>
    </div>
  </div>`;
}

function layout({ page, groups, buildId, bodyHtml, toc, noindex = false }) {
  const title = page.url === "/" ? SITE.name : `${page.title} | ${SITE.name}`;
  const description = page.description || SITE.description;
  const canonical = SITE.origin + (page.url === "/" ? "/" : page.url);
  return `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <!-- Land the saved theme before first paint. Keep the key in sync with js/theme.js. -->
  ${PREPAINT}

  <!-- Google tag (gtag.js), same property as sgbus.uwuapps.org -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}"
    crossorigin="anonymous"></script>

  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#ccffcc" />
  <meta name="build" content="${buildId}">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="UwU Apps" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary">
  <meta name="twitter:image:src" content="${SITE.origin}/sgbusicon1.png">
  <meta property="og:image" content="${SITE.origin}/sgbusicon1.png" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=${buildId}">

  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/sgbusicon1.png">
</head>

<body>
  <a class="skip-link" href="#content">Skip to content</a>

  <header class="topbar">
    <div class="topbar-inner">
      <button class="icon-btn small nav-toggle" id="navToggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">
        <span data-icon="menu"></span>
      </button>
      <a class="brand" href="/">
        <img class="logo" src="/sgbusicon1.png" alt="" width="28" height="28">
        <span class="brand-text"><span class="brand-name">${SITE.short}</span><span class="brand-sub">Guide</span></span>
      </a>
      <button class="search-trigger" id="searchBtn" type="button" aria-label="Search the guide" aria-keyshortcuts="Control+K Meta+K /">
        <span data-icon="search"></span>
        <span class="search-trigger-label">Search the guide</span>
        <kbd class="search-kbd" id="searchKbd">Ctrl K</kbd>
      </button>
      <nav class="top-links" aria-label="SG Bus Timings">
        <a class="top-link" href="${SITE.app}" target="_blank" rel="noopener noreferrer" title="Open the web app"><span data-icon="globe"></span><span class="top-link-label">Web app</span></a>
        <a class="top-link" href="${SITE.bot}" target="_blank" rel="noopener noreferrer" title="Open the Telegram bot"><span data-icon="send"></span><span class="top-link-label">Telegram bot</span></a>
      </nav>
      <button class="icon-btn small" id="themeBtn" type="button" aria-label="Theme">
        <span data-icon="sun"></span>
      </button>
    </div>
  </header>

  <div class="shell">
    <aside class="sidebar" id="sidebar" aria-label="Guide contents">
      <nav class="sidebar-inner">
        ${sidebarHtml(groups, page.file)}
        <div class="sidebar-foot">
          <a class="nav-link" href="${SITE.app}" target="_blank" rel="noopener noreferrer"><span data-icon="external"></span>sgbus.uwuapps.org</a>
          <a class="nav-link" href="${SITE.bot}" target="_blank" rel="noopener noreferrer"><span data-icon="external"></span>@UwUsgbus_bot</a>
        </div>
      </nav>
    </aside>
    <div class="sidebar-scrim" id="sidebarScrim" aria-hidden="true"></div>

    <main id="content" class="page" tabindex="-1">
      <article class="doc">
        ${bodyHtml}
      </article>
    </main>

    <aside class="toc" aria-label="On this page">${toc}</aside>
  </div>

  <footer class="site-foot">
    <p>Made with <span class="heart" data-icon="heart" aria-label="love"></span> by Augy. Bus data from <a href="https://datamall.lta.gov.sg/" target="_blank" rel="noopener noreferrer">LTA DataMall</a>.</p>
  </footer>

  ${themeModalHtml()}
  ${searchModalHtml()}
  <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>

  <script src="/js/icons.js?v=${buildId}"></script>
  <script src="/js/ui.js?v=${buildId}"></script>
  <script src="/js/theme.js?v=${buildId}"></script>
  <script src="/js/site.js?v=${buildId}"></script>
</body>

</html>
`;
}

function articleHtml(page, prev, next) {
  const updated = page.updated
    ? `<p class="doc-updated"><span data-icon="clock"></span>Last updated ${dateFormat.format(page.updated)}</p>`
    : "";
  return `<header class="doc-head">
          ${page.group ? `<p class="eyebrow">${escapeHtml(page.group)}</p>` : ""}
          <h1>${escapeHtml(page.title)}</h1>
          ${page.description ? `<p class="lead">${escapeHtml(page.description)}</p>` : ""}
        </header>
        <div class="prose">
${page.html}
        </div>
        <footer class="doc-foot">
          ${updated}
          ${pagerHtml(prev, next)}
        </footer>`;
}

// ---------- build ----------

async function hashInputs() {
  const hash = createHash("sha256");
  const files = [path.join(ROOT, "build.mjs"), ...(await walk(CONTENT)), ...(await walk(PUBLIC))].sort();
  for (const f of files) {
    hash.update(path.relative(ROOT, f));
    hash.update(await readFile(f));
  }
  return hash.digest("hex").slice(0, 12);
}

// Relative .md links become clean URLs, external links open in a new tab, and
// tables get a scroll wrapper so a wide one never scrolls the page sideways.
function finishHtml(html, file, pagesByFile, problems) {
  // `code` inside link text would put a copy button inside a link.
  if (/<a [^>]*>(?:(?!<\/a>)[\s\S])*?copy-chip/.test(html)) {
    problems.push(`${file}: has inline code inside a link; move the code out of the link text`);
  }
  return html
    .replace(/href="([^"]*)"/g, (whole, href) => {
      if (/^([a-z]+:|\/\/|\/|#)/i.test(href)) return whole;
      const [rel, hash] = href.split("#");
      if (!rel.endsWith(".md")) return whole;
      const target = posix.normalize(posix.join(posix.dirname(file), rel));
      const page = pagesByFile.get(target);
      if (!page) {
        problems.push(`${file}: links to ${href}, which is not in SUMMARY.md`);
        return whole;
      }
      if (hash && !page.headings.some((h) => h.id === hash) && !page.ids.has(hash)) {
        problems.push(`${file}: links to ${href}, but ${target} has no #${hash}`);
      }
      return `href="${page.url}${hash ? "#" + hash : ""}"`;
    })
    .replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"')
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

// One search record per section of a page, so a hit can land on its heading.
function searchRecords(page) {
  const records = [];
  for (const chunk of page.html.split(/(?=<h[23] id=")/)) {
    const m = chunk.match(/^<h[23] id="([^"]+)">([\s\S]*?)<a class="anchor"/);
    const text = stripTags(m ? chunk.slice(chunk.indexOf("</h") + 5) : chunk);
    if (!m && !text) continue;
    records.push({ a: m ? m[1] : "", h: m ? stripTags(m[2]) : "", x: text });
  }
  return { u: page.url, t: page.title, g: page.group, d: page.description || "", s: records };
}

async function build() {
  const started = Date.now();
  const buildId = await hashInputs();
  const groups = await readSummary();

  const pages = [];
  for (const g of groups) {
    for (const p of g.pages) {
      const abs = path.join(CONTENT, p.file);
      if (!existsSync(abs)) throw new Error(`SUMMARY.md lists ${p.file}, which does not exist`);
      const { meta, body } = splitFrontMatter(await readFile(abs, "utf8"));
      state = { headings: [], slugs: new Set() };
      const html = await marked.parse(body);
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      Object.assign(p, {
        title: meta.title || p.navTitle,
        description: meta.description || "",
        group: g.title,
        url: urlFor(p.file),
        html,
        ids,
        headings: state.headings,
        updated: lastUpdated(abs),
      });
      pages.push(p);
    }
  }

  // Pages on disk that SUMMARY.md forgot are almost always a mistake.
  const listed = new Set(pages.map((p) => p.file));
  const orphans = (await walk(CONTENT))
    .map((f) => posix.normalize(path.relative(CONTENT, f).split(path.sep).join("/")))
    .filter((f) => f.endsWith(".md") && f !== "SUMMARY.md" && !listed.has(f));

  const pagesByFile = new Map(pages.map((p) => [p.file, p]));
  const problems = orphans.map((f) => `${f} is not listed in SUMMARY.md`);
  for (const p of pages) p.html = finishHtml(p.html, p.file, pagesByFile, problems);
  if (problems.length) throw new Error("Broken guide:\n  " + problems.join("\n  "));

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(PUBLIC, DIST, { recursive: true });

  for (const [i, page] of pages.entries()) {
    const html = layout({
      page,
      groups,
      buildId,
      bodyHtml: articleHtml(page, pages[i - 1], pages[i + 1]),
      toc: tocHtml(page.headings),
    });
    const out = outPathFor(page.url);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html);
  }

  // 404, outside the sidebar order.
  const notFound = { file: "", url: "/404", title: "Page not found", description: "" };
  await writeFile(path.join(DIST, "404.html"), layout({
    page: notFound,
    groups,
    buildId,
    noindex: true,
    toc: "",
    bodyHtml: `<header class="doc-head">
          <p class="eyebrow">404</p>
          <h1>This page is not in the guide</h1>
          <p class="lead">It may have moved. Search for what you were after, or start from the beginning.</p>
        </header>
        <div class="prose">
          <p><a class="btn" href="/">Back to the guide</a> <button type="button" class="iconBtn" data-open-search><span data-icon="search"></span>Search</button></p>
        </div>`,
  }));

  await writeFile(path.join(DIST, "search-index.json"), JSON.stringify(pages.map(searchRecords)));
  await writeFile(path.join(DIST, "version.json"), JSON.stringify({ version: buildId }));

  const today = new Date().toISOString().slice(0, 10);
  const urls = pages.map((p) =>
    `  <url><loc>${SITE.origin}${p.url === "/" ? "/" : p.url}</loc><lastmod>${p.updated ? p.updated.toISOString().slice(0, 10) : today}</lastmod></url>`
  ).join("\n");
  await writeFile(path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  console.log(`Built ${pages.length} pages into dist/ in ${Date.now() - started} ms (build ${buildId})`);
}

// ---------- local server ----------

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/\/+$/, "") || "/";
  const candidates = clean === "/"
    ? ["index.html"]
    : [clean.slice(1), clean.slice(1) + ".html", posix.join(clean.slice(1), "index.html")];
  for (const c of candidates) {
    const abs = path.join(DIST, c);
    if (!abs.startsWith(DIST)) continue;
    try {
      if ((await stat(abs)).isFile()) return abs;
    } catch {}
  }
  return null;
}

function serve(port = 4321) {
  createServer(async (req, res) => {
    const file = await resolveFile(req.url);
    const target = file || path.join(DIST, "404.html");
    res.writeHead(file ? 200 : 404, {
      "Content-Type": TYPES[path.extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(target));
  }).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
}

await build();
if (process.argv.includes("--serve")) serve(Number(process.env.PORT) || 4321);
