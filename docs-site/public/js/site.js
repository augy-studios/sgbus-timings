// The guide's page behaviour: the sidebar drawer, "On this page" tracking,
// search, and the new version bar. Runs after icons.js, ui.js and theme.js.
// Plain script: this project does not use ES modules.
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const BUILD = $('meta[name="build"]')?.content || "";

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // ---------- sidebar drawer (narrow screens) ----------

  const navToggle = $("#navToggle");
  const sidebar = $("#sidebar");

  function setNav(open) {
    document.body.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    if (open) $(".nav-link.active", sidebar)?.focus({ preventScroll: true });
  }

  navToggle.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  $("#sidebarScrim").addEventListener("click", () => setNav(false));
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest("a")) setNav(false);
  });

  // Start the sidebar scrolled to the page being read, as GitBook does.
  const activeLink = $(".nav-link.active", sidebar);
  if (activeLink) {
    const inner = $(".sidebar-inner", sidebar);
    const top = activeLink.offsetTop - inner.clientHeight / 3;
    if (top > 0) inner.scrollTop = top;
  }

  // ---------- "On this page" ----------

  const tocLinks = $$(".toc [data-toc]");
  const headings = tocLinks.map((a) => document.getElementById(a.dataset.toc)).filter(Boolean);

  function markToc() {
    // The last heading scrolled past the sticky top bar is the section being read.
    const line = 96;
    let current = headings[0];
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= line) current = h;
      else break;
    }
    // At the very bottom a short last section can never reach the line.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = headings[headings.length - 1];
    }
    tocLinks.forEach((a) => {
      const on = current && a.dataset.toc === current.id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }

  if (headings.length) {
    let queued = false;
    window.addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        markToc();
      });
    }, { passive: true });
    markToc();
  }

  // ---------- search ----------

  const searchInput = $("#searchInput");
  const results = $("#searchResults");
  const foot = $("#searchFoot");
  let index = null;
  let indexLoading = null;
  let active = -1;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $("#searchKbd").textContent = isMac ? "⌘ K" : "Ctrl K";

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexLoading) {
      indexLoading = fetch(`/search-index.json?v=${BUILD}`)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((data) => (index = data))
        .catch((err) => {
          indexLoading = null;
          throw err;
        });
    }
    return indexLoading;
  }

  function terms(q) {
    return q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  function snippet(text, words) {
    const lower = text.toLowerCase();
    let at = -1;
    for (const w of words) {
      const i = lower.indexOf(w);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    const from = Math.max(0, at - 50);
    let s = text.slice(from, from + 160);
    if (from > 0) s = "..." + s.replace(/^\S*\s/, "");
    if (from + 160 < text.length) s = s.replace(/\s\S*$/, "") + "...";
    let html = escapeHtml(s);
    for (const w of words) {
      // Word starts only, which also keeps it out of entities like &amp; and &#39;.
      html = html.replace(new RegExp(`(?<![&#\\w</])(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
    }
    return html;
  }

  function search(q) {
    const words = terms(q);
    if (!words.length) return [];
    const hits = [];
    for (const page of index) {
      const title = page.t.toLowerCase();
      for (const s of page.s) {
        const head = s.h.toLowerCase();
        const text = s.x.toLowerCase();
        let score = 0;
        let all = true;
        for (const w of words) {
          let got = 0;
          if (title.includes(w)) got += 8;
          if (head.includes(w)) got += 6;
          if (text.includes(w)) got += 1 + Math.min(4, text.split(w).length - 2);
          if (!got) {
            all = false;
            break;
          }
          score += got;
        }
        if (!all) continue;
        // A whole phrase match beats the same words scattered about.
        if (words.length > 1 && (head + " " + text).includes(words.join(" "))) score += 6;
        // The page's opening section stands for the page as a whole.
        if (!s.a) score += 1;
        hits.push({ page, section: s, score, words });
      }
    }
    hits.sort((a, b) => b.score - a.score);

    // At most two hits from one page, so one long page cannot fill the list.
    const perPage = new Map();
    return hits.filter((h) => {
      const n = perPage.get(h.page.u) || 0;
      perPage.set(h.page.u, n + 1);
      return n < 2;
    }).slice(0, 10);
  }

  function setActive(i) {
    const items = $$(".search-hit", results);
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, n) => el.setAttribute("aria-selected", String(n === active)));
    items[active].scrollIntoView({ block: "nearest" });
  }

  function render() {
    const q = searchInput.value.trim();
    foot.hidden = Boolean(q);
    active = -1;
    if (!q) {
      results.innerHTML = "";
      return;
    }
    if (!index) {
      results.innerHTML = `<p class="search-empty">Loading the guide...</p>`;
      loadIndex().then(render, () => {
        results.innerHTML = `<p class="search-empty">Search could not load. Check your connection and try again.</p>`;
      });
      return;
    }
    const hits = search(q);
    if (!hits.length) {
      results.innerHTML = `<p class="search-empty">Nothing in the guide matches &ldquo;${escapeHtml(q)}&rdquo;. Try fewer words, or a bus stop word like &ldquo;favourite&rdquo; or &ldquo;route&rdquo;.</p>`;
      return;
    }
    results.innerHTML = hits.map((h) => {
      const href = h.page.u + (h.section.a ? "#" + h.section.a : "");
      const crumb = h.section.h ? `${escapeHtml(h.page.t)} <span class="search-sep">/</span> ${escapeHtml(h.section.h)}` : escapeHtml(h.page.t);
      return `<a class="search-hit" role="option" aria-selected="false" href="${href}">
          <span class="search-hit-group">${escapeHtml(h.page.g)}</span>
          <span class="search-hit-title">${crumb}</span>
          <span class="search-hit-text">${snippet(h.section.x || h.page.d, h.words)}</span>
        </a>`;
    }).join("");
    setActive(0);
  }

  function openSearch() {
    setNav(false);
    window.openModal("searchModal");
    loadIndex().catch(() => {});
    // After the modal's own transition starts, so mobile keyboards open.
    setTimeout(() => {
      searchInput.focus();
      searchInput.select();
    }, 30);
  }

  $("#searchBtn").addEventListener("click", openSearch);
  $$("[data-open-search]").forEach((b) => b.addEventListener("click", openSearch));
  searchInput.addEventListener("input", render);
  $$(".search-suggest").forEach((b) => b.addEventListener("click", () => {
    searchInput.value = b.textContent;
    render();
    searchInput.focus();
  }));

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === "Enter") {
      const hit = $$(".search-hit", results)[active];
      if (hit) {
        e.preventDefault();
        hit.click();
      }
    }
  });

  // A hit on the page already open only moves the hash, so close the modal by hand.
  results.addEventListener("click", (e) => {
    if (e.target.closest(".search-hit")) window.closeModal("searchModal");
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openSearch();
    } else if (e.key === "/" && !typing && !document.body.classList.contains("modal-open")) {
      e.preventDefault();
      openSearch();
    } else if (e.key === "Escape") {
      const open = $$(".modal-backdrop:not(.hidden)").pop();
      if (open) window.closeModal(open.id);
      else if (document.body.classList.contains("nav-open")) {
        setNav(false);
        navToggle.focus();
      }
    }
  });

  // ---------- copy buttons ----------
  // Page text is not selectable, so commands, codes and code blocks carry a
  // data-copy button (see codespan and code in build.mjs).

  const toast = $("#toast");
  let toastTimer = null;

  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Older browsers, and pages not served over https.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {}
      area.remove();
      return ok;
    }
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const text = btn.dataset.copy;
    const ok = await copyText(text);
    if (!ok) {
      showToast("Could not copy. Your browser blocked it.");
      return;
    }
    showToast(text.includes("\n") || text.length > 40 ? "Copied" : `Copied ${text}`);
    const icon = $("[data-icon]", btn);
    if (icon) {
      btn.classList.add("copied");
      icon.dataset.icon = "check";
      window.hydrateIcons(btn);
      setTimeout(() => {
        btn.classList.remove("copied");
        icon.dataset.icon = "copy";
        window.hydrateIcons(btn);
      }, 1500);
    }
  });

  // ---------- screenshots open full size ----------
  // A tap on a screenshot opens it in a new tab as a blob, at its full resolution. The
  // tab is opened in the click itself, before the fetch, so popup blockers let it
  // through; it's pointed at the blob once that's ready, or at the image if it fails.

  document.addEventListener("click", async (e) => {
    const img = e.target.closest(".prose figure img");
    if (!img || e.button !== 0) return;
    e.preventDefault();
    const src = img.currentSrc || img.src;
    const tab = window.open("", "_blank");
    if (!tab) return;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab.location.href = src;
    }
  });

  // ---------- new version bar ----------
  // No service worker here, so this is the "site has no service worker"
  // variant of update-bar-spec.md: compare the build this page booted with
  // against /version.json, on visibility and on a slow timer.

  const COPY = {
    label: "Update",
    ready: "A new version of the SG Bus Timings Guide is ready.",
    reload: "Reload",
    later: "Not now",
  };
  let newer = false;
  let dismissed = false;

  function renderBar() {
    const existing = $(".update-notice");
    if (!newer || dismissed) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const bar = document.createElement("div");
    bar.className = "update-notice";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-label", COPY.label);
    bar.innerHTML = `
      <div class="update-notice-inner">
        <p>${COPY.ready}</p>
        <button type="button" class="btn" data-update-reload>${COPY.reload}</button>
        <button type="button" class="iconBtn" data-update-later>${COPY.later}</button>
      </div>`;
    $("[data-update-reload]", bar).addEventListener("click", () => window.location.reload());
    $("[data-update-later]", bar).addEventListener("click", () => {
      // This page view only, never stored.
      dismissed = true;
      renderBar();
    });
    document.body.prepend(bar);
  }

  function checkVersion() {
    if (!BUILD || newer) return;
    fetch("/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v && v.version && v.version !== BUILD) {
          newer = true;
          renderBar();
        }
      })
      .catch(() => {});
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkVersion();
  });
  setInterval(checkVersion, 30 * 60 * 1000);
})();
