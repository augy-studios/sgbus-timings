// The next bus at a glance, Glance's page (help desk #2, a page of its own since): one big answer
// at the top, the next bus from a few stops, and under it those stops as short cards, each bus on
// one line with where it's going and its next three times: only your favourite buses, once you
// have any, so a busy interchange isn't a dozen lines. A chip over it picks the stops:
// your saved stops, the ones nearby, or the ones near Home, Work or another place. Tapping a
// bus or a stop opens its full timings, as a search does. On unless Settings turns it off.
//
// Nearby only looks for where you are once you've asked, or the browser already allows it.
// With the phone's Location off, only a tap (picking Nearby, Use my location) offers the app's
// "Turn on location" dialog (js/geo-retry.js); a refresh on its own just says it's off.
// The walk is Will I make it?'s guess (js/make-it.js): the straight line with a quarter more
// for corners, at 80 m a minute. Times count down between fetches, every REFRESH_MS while the
// page is on show, or at once with the refresh button beside the chip.
// Loaded before script.js and uses its helpers (LS, nameOf, stopsNear, fetchArrivals, loadStop)
// only once the page is running. Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const KEY = 'sgbus_glance';
  const OFF_KEY = 'sgbus_glance_off';
  const ASKED_KEY = 'sgbus_glance_near';
  const STOPS = 4;
  const ROWS = 6;
  const PLACE_M = 500;
  const M_PER_MIN = 80;
  const DETOUR = 1.25;
  const REFRESH_MS = 30 * 1000;
  const TICK_MS = 10 * 1000;
  const FRESH_MS = 60 * 1000;

  // What's on show: the source, its stops ({ code, metres? }), each stop's services as fetched,
  // and when. `here` is where you were, at most FRESH_MS old.
  let source = null;
  let stops = [];
  const arrivals = new Map();
  let fetchedAt = 0;
  let here = null;
  let token = 0;
  let needsLocation = false;
  let failed = false;
  let timer = null;
  let since = 0;

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } },
  };

  const enabled = () => store.get(OFF_KEY) !== '1';
  const showing = () => enabled() && (window.MainScreen?.active() || 'glance') === 'glance' && document.visibilityState === 'visible';

  // The stops a chip can show: saved stops while there are any, nearby, and each place.
  function sources() {
    const out = [];
    if (LS.getFavs().length) out.push({ key: 'saved', name: 'Saved stops', icon: 'star' });
    if (navigator.geolocation) out.push({ key: 'near', name: 'Nearby', icon: 'locate' });
    for (const p of window.Places?.all() || []) out.push({ key: `place:${p.key}`, name: p.name, icon: p.icon, place: p });
    return out;
  }

  function chosen() {
    const all = sources();
    return all.find((s) => s.key === source) || all.find((s) => s.key === store.get(KEY)) || all[0] || null;
  }

  const walkMins = (m) => Math.max(1, Math.round((m * DETOUR) / M_PER_MIN));

  // Where you are, if it's allowed: asked here before, or already granted to the site.
  async function locationAllowed() {
    if (store.get(ASKED_KEY) === '1') return true;
    try {
      const p = await navigator.permissions?.query({ name: 'geolocation' });
      return p?.state === 'granted';
    } catch { return false; }
  }

  function locate(turnOn) {
    if (here && Date.now() - here.at < FRESH_MS) return Promise.resolve(here);
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      (pos) => { here = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }; resolve(here); },
      (err) => reject(new Error(locationMessage(err, 'to find stops near you'))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, noTurnOn: !turnOn },
    ));
  }

  // The source's stops, or null for Nearby until you've said it may look. `turnOn` is a tap's:
  // with Location off, it may offer to turn it on.
  async function stopsOf(src, { ask = false, turnOn = false } = {}) {
    if (!src) return [];
    if (src.key === 'saved') return LS.getFavs().slice(0, STOPS).map((f) => ({ code: f.code }));
    await ensureStopsIndex();
    if (src.key === 'near') {
      if (!ask && !(await locationAllowed())) return null;
      const at = await locate(turnOn);
      store.set(ASKED_KEY, '1');
      return stopsNear(at.lat, at.lng, STOPS).map((s) => ({ code: s.code, metres: s.distance }));
    }
    const p = src.place;
    const near = stopsNear(p.lat, p.lng, STOPS + 1).filter((s) => s.distance <= PLACE_M && s.code !== p.stop);
    return [...(p.stop ? [{ code: p.stop }] : []), ...near.map((s) => ({ code: s.code }))].slice(0, STOPS);
  }

  async function refresh({ ask = false, turnOn = ask } = {}) {
    if (!enabled()) return render();
    const src = chosen();
    source = src?.key || null;
    const mine = ++token;
    try {
      const got = await stopsOf(src, { ask, turnOn });
      if (mine !== token) return;
      needsLocation = got === null;
      stops = got || [];
      failed = false;
    } catch (e) {
      if (mine !== token) return;
      stops = [];
      failed = e.message;
    }
    render();
    const results = await Promise.allSettled(stops.map((s) => fetchArrivals(s.code)));
    if (mine !== token) return;
    arrivals.clear();
    results.forEach((r, i) => { if (r.status === 'fulfilled') arrivals.set(stops[i].code, r.value.services || []); });
    fetchedAt = Date.now();
    render();
  }

  // Each bus at a stop that's still to come, minutes from now, soonest first.
  function rowsOf(code) {
    const left = Date.now() - fetchedAt;
    return (arrivals.get(code) || [])
      .map((s) => {
        const times = [s.next, s.next2, s.next3].filter((b) => b?.eta_ms != null).map((b) => Math.max(0, b.eta_ms - left));
        const dest = [s.next, s.next2, s.next3].find((b) => b?.dest)?.dest;
        return { no: s.serviceNo, to: dest ? nameOf(dest) || '' : '', times };
      })
      .filter((r) => r.times.length)
      .sort((a, b) => a.times[0] - b.times[0]);
  }

  const mins = (ms) => Math.floor(ms / 60000);
  const timeText = (ms) => (ms < 60000 ? 'Arr' : String(mins(ms)));

  // The one big answer: the next bus you'd make from these stops, a favourite bus first if any
  // are coming. Nearby, a bus that'd go before you could walk there is left out.
  function nextBus() {
    const favs = new Set(LS.getFavBuses());
    const all = [];
    for (const s of stops) {
      const walk = s.metres != null ? walkMins(s.metres) * 60000 : 0;
      for (const r of rowsOf(s.code)) {
        const t = r.times.find((ms) => ms >= walk);
        if (t != null) all.push({ ...r, code: s.code, ms: t, walk, fav: favs.has(r.no) });
      }
    }
    const pool = all.some((b) => b.fav) ? all.filter((b) => b.fav) : all;
    return pool.sort((a, b) => a.ms - b.ms)[0] || null;
  }

  function renderHero(src) {
    const hero = $('#glanceHero');
    if (failed) {
      const retry = src?.key === 'near' ? `<button id="glanceLocate" class="btn glanceBtn" type="button">${ico('locate')} Use my location</button>` : '';
      hero.innerHTML = `<p class="glanceKicker">Next bus</p><p class="glanceSay">${esc(failed)}</p>` + retry;
      return;
    }
    if (needsLocation) {
      hero.innerHTML = `<p class="glanceKicker">Next bus</p><p class="glanceSay">See the buses at the stops around you.</p>` +
        `<button id="glanceLocate" class="btn glanceBtn" type="button">${ico('locate')} Use my location</button>`;
      return;
    }
    if (!src || !stops.length) {
      hero.innerHTML = `<p class="glanceKicker">Next bus</p><p class="glanceSay">${src?.place ? `No bus stops within ${PLACE_M} m of ${esc(src.name)}.` : 'Save a stop with its star, and its next bus shows here.'}</p>`;
      return;
    }
    if (!fetchedAt) {
      hero.innerHTML = '<p class="glanceKicker">Next bus</p><p class="glanceSay">Getting the times&hellip;</p>';
      return;
    }
    const bus = nextBus();
    if (!bus) {
      hero.innerHTML = '<p class="glanceKicker">Next bus</p><p class="glanceSay">No buses due at these stops right now.</p>';
      return;
    }
    const m = mins(bus.ms);
    const when = bus.ms < 60000 ? 'Arriving' : `in ${m} min`;
    const leave = bus.walk ? Math.max(0, mins(bus.ms - bus.walk)) : null;
    const walk = bus.walk ? `${bus.walk / 60000} min walk` : '';
    hero.innerHTML =
      `<button class="glanceHeroBtn" type="button" data-stop="${esc(bus.code)}" data-svc="${esc(bus.no)}" aria-label="Bus ${esc(bus.no)} ${esc(when)} at ${esc(nameOf(bus.code))}">` +
      `<span class="glanceKicker">${leave != null ? (leave < 1 ? 'Leave now for' : `Leave in ${leave} min for`) : 'Next bus'}</span>` +
      `<span class="glanceSvc">${esc(bus.no)}</span>` +
      `<span class="glanceWhen${bus.ms < 60000 ? ' now' : ''}">${esc(when)}</span>` +
      `<span class="glanceWhere">${bus.to ? `to ${esc(bus.to)}, ` : ''}at ${esc(nameOf(bus.code))}${walk ? ` &middot; ${esc(walk)}` : ''}</span>` +
      '</button>';
  }

  // With favourite buses, each card has only those, and a stop none of them is due at is left
  // out: the few buses you take rather than every one at the stop. Without any, every bus.
  function renderStops() {
    const wrap = $('#glanceStops');
    if (!fetchedAt || !stops.length) { wrap.innerHTML = ''; return; }
    const favs = new Set(LS.getFavBuses());
    const only = favs.size > 0;
    const cards = stops.map((s) => {
      const all = rowsOf(s.code);
      const rows = only ? all.filter((r) => favs.has(r.no)) : all;
      if (only && !rows.length) return '';
      const walk = s.metres != null ? `<span class="glanceWalk">${walkMins(s.metres)} min walk</span>` : '';
      const lines = rows.slice(0, ROWS).map((r) =>
        `<button class="glanceRow" type="button" data-stop="${esc(s.code)}" data-svc="${esc(r.no)}">` +
        `<span class="glanceNo">${esc(r.no)}</span>` +
        `<span class="glanceTo">${r.to ? `to ${esc(r.to)}` : ''}</span>` +
        `<span class="glanceTimes">${[0, 1, 2].map((i) => { const ms = r.times[i]; return ms == null ? '<span></span>' : `<span class="${i === 0 ? 'first' : ''}${ms < 60000 ? ' now' : ''}">${timeText(ms)}</span>`; }).join('')}</span>` +
        '</button>').join('');
      const more = rows.length > ROWS ? `<button class="glanceMore" type="button" data-stop="${esc(s.code)}">+${rows.length - ROWS} more</button>` : '';
      return `<div class="glanceStop card glass">` +
        `<button class="glanceStopHead" type="button" data-stop="${esc(s.code)}"><span class="glanceStopName">${esc(nameOf(s.code) || s.code)}</span>${walk}</button>` +
        (lines || '<p class="glanceNone">No buses due right now.</p>') + more + '</div>';
    }).join('');
    wrap.innerHTML = cards || (only ? '<p class="glanceNone glanceOnly">None of your favourite buses are due at these stops right now.</p>' : '');
  }

  function renderBar(src) {
    $('#glanceSourceLabel').textContent = src?.name || 'Nearby';
    $('#glanceSourceIcon').dataset.icon = src?.icon || 'locate';
    hydrateIcons($('#glanceSource'));
    $('#glanceUpdated').textContent = fetchedAt ? 'Times in minutes' : '';
  }

  function render() {
    const on = enabled();
    $('#glance').hidden = !on;
    $('#glanceStops').hidden = !on;
    if (!on) return;
    const src = chosen();
    renderBar(src);
    renderHero(src);
    renderStops();
  }

  function openMenu(open) {
    const menu = $('#glanceMenu');
    menu.hidden = !open;
    $('#glanceSource').setAttribute('aria-expanded', String(open));
    if (!open) return;
    const now = chosen()?.key;
    menu.innerHTML = sources().map((s) =>
      `<button class="glanceMenuItem${s.key === now ? ' active' : ''}" type="button" role="menuitemradio" aria-checked="${s.key === now}" data-source="${esc(s.key)}">${ico(s.icon)} ${esc(s.name)}</button>`).join('');
  }

  function pick(key) {
    source = key;
    store.set(KEY, key);
    openMenu(false);
    fetchedAt = 0;
    stops = [];
    refresh({ ask: key === 'near' });
  }

  function open(code, svc) {
    loadStop(code, { service: svc || null, scroll: true });
  }

  function setEnabled(on) {
    store.set(OFF_KEY, on ? null : '1');
    window.dispatchEvent(new Event('glancechange'));
    if (on) refresh();
    else render();
  }

  function loop() {
    clearInterval(timer);
    since = 0;
    timer = setInterval(() => {
      if (!showing()) return;
      since += TICK_MS;
      if (since >= REFRESH_MS || !fetchedAt) { since = 0; refresh(); } else render();
    }, TICK_MS);
  }

  function init() {
    $('#glanceSource').addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu($('#glanceMenu').hidden);
    });
    // The refresh button: the times now, its arrows turning till they're in, and the next
    // fetch on its own a full REFRESH_MS after.
    $('#glanceRefresh').addEventListener('click', async () => {
      const btn = $('#glanceRefresh');
      if (btn.classList.contains('busy')) return;
      btn.classList.add('busy');
      since = 0;
      try { await refresh(); } finally { btn.classList.remove('busy'); }
    });
    $('#glanceMenu').addEventListener('click', (e) => {
      const item = e.target.closest('[data-source]');
      if (item) pick(item.dataset.source);
    });
    document.addEventListener('click', (e) => {
      if (!$('#glanceMenu').hidden && !e.target.closest('#glanceMenu')) openMenu(false);
    });
    for (const id of ['#glanceHero', '#glanceStops']) {
      $(id).addEventListener('click', (e) => {
        if (e.target.closest('#glanceLocate')) return refresh({ ask: true });
        const t = e.target.closest('[data-stop]');
        if (t) open(t.dataset.stop, t.dataset.svc);
      });
    }
    document.addEventListener('visibilitychange', () => { if (showing()) refresh(); });
    window.addEventListener('viewchange', () => { if (showing()) refresh(); });
    started = true;
    loop();
    refresh();
  }

  // A stop saved or removed: the saved stops' glance follows. A bus starred or not: the cards.
  // Off Glance's page (Favourites calls this each time it opens), only saved stops refresh, as
  // they need no location; Nearby or a place waits till Glance is shown again (viewchange).
  let started = false;
  function favsChanged() {
    if (!started) return;
    if (chosen()?.key === 'saved' || (!stops.length && showing())) refresh();
    else render();
  }

  window.Glance = { init, refresh, enabled, setEnabled, favsChanged };
})();
