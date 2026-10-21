// Past searches, as Citymapper's "Where to?": tap into a search box and, until you type, it
// drops down your recent searches (the last 24 hours, then earlier), with tabs for your saved
// places and, in Navigate, your calendar's events (js/calendar.js).
//
// One list for every box: the main stop search, Navigate's From and To, the planner's Start
// and End, and Places' search. A box records what's picked in it, and shows only what it can
// use: the main search stops, buses and postal codes; Navigate and Places anything with a
// place on the map; the planner stops and postal codes. Picking Your location, a saved place
// or a calendar event isn't a search, so isn't kept.
//
// Each recent's menu saves it as a place (js/places.js), shares it (js/share.js), or removes
// it; Clear all empties the list. Kept in this browser, newest first, up to MAX. Sync
// (js/sync.js) can copy them to another device: Recents.syncList, clean and merge.
//
// Recents.attach(input, box, { accepts, onPick, saved, calendar }) puts the panel in `box`, a
// box's .acList, which the box's own suggestions use once you type. `accepts(item)` says which
// recents it shows, `onPick(item)` takes the one picked: a recent, { kind: 'saved', place } or
// { kind: 'event', ... } (calendar.js). `saved` is 'places' for saved places on the Saved tab,
// 'favs' for favourite stops and buses. Recents.add(item) keeps a search.
// Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_recents';
  const MAX = 50;
  const DAY_MS = 24 * 3600 * 1000;

  // ---------- storage ----------

  // { kind: 'stop' | 'station' | 'place' | 'bus' | 'postal', label, sub, code?, lat?, lng?, at }
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter((r) => r && typeof r.label === 'string' && typeof r.kind === 'string') : [];
    } catch {
      return [];
    }
  }

  function store(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch { /* not kept: the search still works */ }
  }

  const hasPoint = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng);
  const keyOf = (r) =>
    r.kind === 'bus' || r.kind === 'postal' || (r.kind === 'stop' && r.code) ? `${r.kind}:${r.code}`
      : hasPoint(r) ? `${r.kind}:${r.lat.toFixed(5)},${r.lng.toFixed(5)}`
      : `${r.kind}:${r.label}`;

  function add(item) {
    if (!item?.label) return;
    const entry = {
      kind: item.kind,
      label: String(item.label).slice(0, 120),
      sub: String(item.sub || '').slice(0, 160),
      ...(item.code && { code: String(item.code) }),
      ...(hasPoint(item) && { lat: item.lat, lng: item.lng }),
      at: Date.now(),
    };
    const key = keyOf(entry);
    store([entry, ...load().filter((r) => keyOf(r) !== key)]);
  }

  const remove = (key) => store(load().filter((r) => keyOf(r) !== key));

  // ---------- sync (js/sync.js) ----------

  const KINDS = ['stop', 'station', 'place', 'bus', 'postal'];
  const syncList = () => load();
  const syncKey = keyOf;

  // A search from another device, checked field by field, or null.
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind) || typeof raw.label !== 'string' || !raw.label.trim()) return null;
    if (!Number.isFinite(raw.at)) return null;
    const point = Number.isFinite(raw.lat) && Number.isFinite(raw.lng) && raw.lat > 1.15 && raw.lat < 1.5 && raw.lng > 103.55 && raw.lng < 104.1;
    return {
      kind: raw.kind,
      label: raw.label.slice(0, 120),
      sub: typeof raw.sub === 'string' ? raw.sub.slice(0, 160) : '',
      ...(typeof raw.code === 'string' && /^[0-9A-Za-z]{1,6}$/.test(raw.code) && { code: raw.code }),
      ...(point && { lat: raw.lat, lng: raw.lng }),
      at: Math.min(Date.now(), raw.at),
    };
  }

  // Adds the ones this device hasn't searched for, each in its place by when it was searched,
  // keeping the newest MAX. Says how many it took.
  function merge(list) {
    const have = load();
    const keys = new Set(have.map(keyOf));
    const fresh = list.filter((r) => !keys.has(keyOf(r)));
    if (!fresh.length) return 0;
    const all = [...have, ...fresh].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, MAX);
    store(all);
    const kept = new Set(all.map(keyOf));
    return fresh.filter((r) => kept.has(keyOf(r))).length;
  }
  const clear = () => store([]);

  // A stop from the stop list (script.js's stopsIndex) as a recent.
  function stopItem(code) {
    const s = stopsIndex?.[code];
    return { kind: 'stop', label: nameOf(code) || code, sub: `Bus stop ${code}${s?.road ? ` · ${s.road}` : ''}`, code, ...(s?.lat != null && { lat: s.lat, lng: s.lng }) };
  }
  const busItem = (no) => ({ kind: 'bus', label: `Bus ${no}`, sub: serviceEndsText(no), code: no });
  const postalItem = (code) => ({ kind: 'postal', label: code, sub: 'Bus stops near this postal code', code });
  // A place from /api/places (Navigate's suggestions) as a recent.
  const placeItem = (p) => ({ kind: p.kind === 'station' || p.kind === 'stop' ? p.kind : 'place', label: p.label, sub: p.sub || '', code: p.code, lat: p.lat, lng: p.lng });
  // And back, for Navigate.
  const asPlace = (r) => ({ kind: r.kind, label: r.label, sub: r.sub, code: r.code, lat: r.lat, lng: r.lng });

  // ---------- how a recent reads ----------

  // Each line's colour, by the letters a station code starts with. The LRTs share one grey.
  const LINE_COLORS = { EW: '#009645', CG: '#009645', NS: '#d42e12', NE: '#9900aa', CC: '#fa9e0d', CE: '#fa9e0d', DT: '#005ec4', TE: '#9d5b25', BP: '#748477', SE: '#748477', SW: '#748477', PE: '#748477', PW: '#748477' };

  function lineDots(codes) {
    return String(codes || '').split(/\s*\/\s*/).map((c) => {
      const color = LINE_COLORS[c.trim().toUpperCase().match(/^[A-Z]+/)?.[0]];
      return color ? `<span class="lineChip recentLine"><span class="lineDot" style="--line:${color}"></span>${escapeHtml(c)}</span>` : '';
    }).join('');
  }

  function iconOf(r) {
    if (r.kind === 'station') return 'train';
    if (r.kind === 'stop' || r.kind === 'bus') return 'bus';
    return 'history';
  }

  function recentRow(r, i, menuOpen) {
    const key = keyOf(r);
    const sub = r.kind === 'station' ? `<span class="sub">Station ${lineDots(r.code)}</span>` : r.sub ? `<span class="sub">${escapeHtml(r.sub)}</span>` : '';
    // The menu is always there, folded shut until the dots open it (toggleRowMenu in js/ui.js).
    return `<div class="recentRow${menuOpen ? ' open' : ''}" data-menu-row="${escapeHtml(key)}">` +
      `<button type="button" class="recentMain" data-recent-pick="${i}">${ico(iconOf(r))}<span class="recentText"><span class="name">${escapeHtml(r.label)}</span>${sub}</span></button>` +
      `<button type="button" class="recentMore" data-recent-menu="${escapeHtml(key)}" data-menu-toggle aria-expanded="${menuOpen}" aria-label="More for ${escapeHtml(r.label)}">${ico('more')}</button>` +
      `<div class="rowMenu"><div><div class="recentMenu">` +
      (hasPoint(r) ? `<button type="button" class="iconBtn" data-recent-act="save" data-recent="${i}">${ico('pin')} Save as place</button>` : '') +
      (hasPoint(r) ? `<button type="button" class="iconBtn" data-recent-act="share" data-recent="${i}">${ico('share')} Share</button>` : '') +
      `<button type="button" class="iconBtn" data-recent-act="remove" data-recent="${i}">${ico('trash')} Remove</button>` +
      `</div></div></div>` +
      `</div>`;
  }

  function savedRow(p, i) {
    return `<div class="recentRow">` +
      `<button type="button" class="recentMain${p.unset ? ' unset' : ''}" data-saved-pick="${i}">${ico(p.icon)}<span class="recentText"><span class="name">${escapeHtml(p.name)}</span>` +
      `<span class="sub">${escapeHtml(p.unset ? `Not set yet. Tap to set your ${p.name.toLowerCase()}.` : p.sub ?? (p.name !== p.label ? p.label : ''))}</span></span></button>` +
      `</div>`;
  }

  // ---------- the panel ----------

  function attach(input, box, { accepts = () => true, onPick, saved = 'places', calendar = false }) {
    const state = { tab: 'recent', menu: null, rows: [], saved: [], typed: false };

    const showing = () => !box.hidden && box.classList.contains('recents');

    function hide() {
      box.classList.remove('recents');
      box.hidden = true;
    }

    function savedItems() {
      if (saved === 'favs') {
        return [
          ...LS.getFavs().map((f) => ({ kind: 'stop', icon: 'star', name: f.name || nameOf(f.code) || f.code, sub: `Bus stop ${f.code}`, code: f.code })),
          ...LS.getFavBuses().map((no) => ({ kind: 'bus', icon: 'bus', name: `Bus ${no}`, sub: serviceEndsText(no), code: no })),
        ];
      }
      return Places.all({ unset: true });
    }

    function render() {
      const tabs = [['recent', 'clock', 'Recent'], ['saved', 'star', 'Saved'], ...(calendar ? [['calendar', 'calendar', 'Calendar']] : [])];
      let body = '';
      if (state.tab === 'recent') {
        state.rows = load().filter(accepts);
        if (!state.rows.length) {
          body = `<p class="recentEmpty">Your searches show here, so you can find them again with a tap.</p>`;
        } else {
          const cut = Date.now() - DAY_MS;
          const group = (title, rows) => (rows.length
            ? `<p class="recentHead">${title}</p>` + rows.map((r) => recentRow(r, state.rows.indexOf(r), state.menu === keyOf(r))).join('')
            : '');
          body = group('24 hours', state.rows.filter((r) => r.at >= cut)) +
            group('Earlier', state.rows.filter((r) => r.at < cut)) +
            `<button type="button" class="recentClear" data-recent-clear>Clear all</button>`;
        }
      } else if (state.tab === 'saved') {
        state.saved = savedItems();
        body = state.saved.length
          ? state.saved.map(savedRow).join('')
          : `<p class="recentEmpty">${saved === 'favs' ? 'Star a stop or a bus to see it here.' : 'Save places in Places, in the Edge Tray.'}</p>`;
        if (saved === 'places') body += `<button type="button" class="recentClear" data-recent-places>Edit places</button>`;
      } else {
        body = `<div class="recentCalendar"></div>`;
      }
      box.innerHTML =
        `<div class="recentTabs" role="tablist">` +
        tabs.map(([id, icon, label]) =>
          `<button type="button" class="recentTab${state.tab === id ? ' active' : ''}" role="tab" aria-selected="${state.tab === id}" data-recent-tab="${id}" aria-label="${label}" title="${label}">${ico(icon)}</button>`
        ).join('') +
        `</div>` + body;
      box.classList.add('recents');
      box.hidden = false;
      if (state.tab === 'calendar') {
        window.Calendar.render(box.querySelector('.recentCalendar'), (event) => {
          hide();
          input.blur();
          onPick({ kind: 'event', ...event });
        });
      }
    }

    // On focus, and whenever the box is emptied, until something's typed. Not when a panel
    // focuses its first box as it opens (quietFocus), where the list would cover the box below
    // it; a tap on the box opens it then.
    input.addEventListener('focus', () => {
      state.typed = false;
      state.menu = null;
      if (input.dataset.quietFocus) {
        delete input.dataset.quietFocus;
        return;
      }
      render();
    });
    input.addEventListener('click', () => {
      if (!showing() && !state.typed) render();
    });
    input.addEventListener('input', () => {
      state.typed = !!input.value.trim();
      if (!state.typed) render();
      else box.classList.remove('recents');
    });
    input.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement !== input && showing()) hide();
    }, 150));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && showing()) hide();
    });

    // Taps inside the panel keep the box focused, so a menu or tab doesn't close it.
    box.addEventListener('mousedown', (e) => {
      if (showing()) e.preventDefault();
    });
    box.addEventListener('click', (e) => {
      // The Calendar tab's own rows are js/calendar.js's to handle.
      if (!showing() || e.target.closest('.recentCalendar')) return;
      // The box's own suggestions mustn't take this tap as theirs.
      e.stopImmediatePropagation();
      const tab = e.target.closest('[data-recent-tab]');
      if (tab) {
        state.tab = tab.dataset.recentTab;
        state.menu = null;
        return render();
      }
      const menu = e.target.closest('[data-recent-menu]');
      if (menu) {
        state.menu = state.menu === menu.dataset.recentMenu ? null : menu.dataset.recentMenu;
        return toggleRowMenu(box, state.menu);
      }
      if (e.target.closest('[data-recent-clear]')) {
        if (confirm('Clear all your past searches?')) clear();
        return render();
      }
      if (e.target.closest('[data-recent-places]')) {
        hide();
        input.blur();
        return Places.open();
      }
      const act = e.target.closest('[data-recent-act]');
      if (act) {
        const r = state.rows[Number(act.dataset.recent)];
        if (!r) return;
        if (act.dataset.recentAct === 'remove') {
          remove(keyOf(r));
          state.menu = null;
          return render();
        }
        hide();
        input.blur();
        if (act.dataset.recentAct === 'save') Places.edit(null, { label: r.label, lat: r.lat, lng: r.lng, ...(r.kind === 'stop' && r.code && { stop: r.code }) });
        else Share.place({ label: r.label, lat: r.lat, lng: r.lng });
        return;
      }
      const pick = e.target.closest('[data-recent-pick]');
      if (pick) {
        const r = state.rows[Number(pick.dataset.recentPick)];
        if (!r) return;
        hide();
        input.blur();
        add(r);
        onPick(r);
        return;
      }
      const sp = e.target.closest('[data-saved-pick]');
      if (sp) {
        const p = state.saved[Number(sp.dataset.savedPick)];
        if (!p) return;
        hide();
        input.blur();
        if (p.unset) return Places.edit(p.key);
        onPick(saved === 'favs' ? p : { kind: 'saved', place: p });
      }
    }, true);
  }

  // Focuses a box without dropping its past searches down, for a panel opening.
  function quietFocus(input) {
    if (document.activeElement === input) return;
    input.dataset.quietFocus = '1';
    input.focus({ preventScroll: true });
    delete input.dataset.quietFocus;
  }

  window.Recents = { attach, add, clear, quietFocus, stopItem, busItem, postalItem, placeItem, asPlace, hasPoint, syncList, syncKey, clean, merge };
})();
