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
    if (LS.getFavs().length || LS.getFavStopBuses().length) out.push({ key: 'saved', name: I18n.t('glance.source.saved', 'Saved stops'), icon: 'star' });
    // Each list in Favourites with a stop in it (help desk #6, script.js), as a choice of its own.
    for (const l of LS.getFavLists()) {
      if (l.items.some((k) => /^stop(bus)?:/.test(k))) out.push({ key: `list:${l.id}`, name: l.name, icon: 'bookmark', list: l });
    }
    if (navigator.geolocation) out.push({ key: 'near', name: I18n.t('glance.source.near', 'Nearby'), icon: 'locate' });
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
    // The saved stops, then the stops with a bus starred there (help desk #6).
    // A list's stops, and the stops it has a bus at, in the order put in it.
    if (src.list) {
      const codes = [...new Set(src.list.items.map((k) => k.match(/^stop(?:bus)?:(\d{5})/)?.[1]).filter(Boolean))];
      return codes.slice(0, STOPS).map((code) => ({ code }));
    }
    if (src.key === 'saved') {
      const codes = [...new Set([...LS.getFavs().map((f) => f.code), ...LS.getFavStopBuses().map((b) => b.code)])];
      return codes.slice(0, STOPS).map((code) => ({ code }));
    }
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
  // Settings' Bus times (script.js): whole minutes, or the time each bus comes, "14:32".
  const clockTimes = () => LS.getClockTimes();
  const timeCell = (ms) => (clockTimes() ? esc(busClock(ms))
    : ms < 60000 ? `<span aria-hidden="true">${esc(I18n.t('glance.arr', 'Arr'))}</span><span class="sr">${esc(I18n.t('glance.arriving', 'Arriving'))}</span>`
      : `${mins(ms)}<span class="sr"> ${esc(I18n.t('glance.min', 'min'))}</span>`);
  const KICKER = () => esc(I18n.t('glance.nextBus', 'Next bus'));

  // The one big answer: the next bus you'd make from these stops, a favourite bus first if any
  // are coming. Nearby, a bus that'd go before you could walk there is left out.
  function nextBus() {
    const src = chosen();
    const all = [];
    for (const s of stops) {
      const walk = s.metres != null ? walkMins(s.metres) * 60000 : 0;
      const keep = keepTo(src, s.code);
      for (const r of rowsOf(s.code)) {
        const t = r.times.find((ms) => ms >= walk);
        if (t != null) all.push({ ...r, code: s.code, ms: t, walk, fav: !!keep?.has(r.no) });
      }
    }
    const pool = all.some((b) => b.fav) ? all.filter((b) => b.fav) : all;
    return pool.sort((a, b) => a.ms - b.ms)[0] || null;
  }

  function renderHero(src) {
    const hero = $('#glanceHero');
    if (failed) {
      const retry = src?.key === 'near' ? `<button id="glanceLocate" class="btn glanceBtn" type="button">${ico('locate')} ${esc(I18n.t('glance.useLocation', 'Use my location'))}</button>` : '';
      hero.innerHTML = `<p class="glanceKicker">${KICKER()}</p><p class="glanceSay">${esc(failed)}</p>` + retry;
      return;
    }
    if (needsLocation) {
      hero.innerHTML = `<p class="glanceKicker">${KICKER()}</p><p class="glanceSay">${esc(I18n.t('glance.seeAround', 'See the buses at the stops around you.'))}</p>` +
        `<button id="glanceLocate" class="btn glanceBtn" type="button">${ico('locate')} ${esc(I18n.t('glance.useLocation', 'Use my location'))}</button>`;
      return;
    }
    if (!src || !stops.length) {
      hero.innerHTML = `<p class="glanceKicker">${KICKER()}</p><p class="glanceSay">${esc(src?.place ? I18n.t('glance.noStopsNear', 'No bus stops within {m} m of {place}.', { m: PLACE_M, place: src.name }) : I18n.t('glance.saveAStop', 'Save a stop with its star, and its next bus shows here.'))}</p>`;
      return;
    }
    if (!fetchedAt) {
      hero.innerHTML = `<p class="glanceKicker">${KICKER()}</p><p class="glanceSay">${esc(I18n.t('glance.getting', 'Getting the times…'))}</p>`;
      return;
    }
    const bus = nextBus();
    if (!bus) {
      hero.innerHTML = `<p class="glanceKicker">${KICKER()}</p><p class="glanceSay">${esc(I18n.t('glance.noneDue', 'No buses due at these stops right now.'))}</p>`;
      return;
    }
    const m = mins(bus.ms);
    const when = clockTimes() ? I18n.t('glance.atClock', 'at {time}', { time: busClock(bus.ms) })
      : bus.ms < 60000 ? I18n.t('glance.arriving', 'Arriving') : I18n.t('glance.inMin', 'in {m} min', { m });
    const leave = bus.walk ? Math.max(0, mins(bus.ms - bus.walk)) : null;
    const walk = bus.walk ? I18n.t('glance.minWalk', '{m} min walk', { m: bus.walk / 60000 }) : '';
    hero.innerHTML =
      // Read as shown, every line of it (help desk #6), rather than a shorter label.
      `<button class="glanceHeroBtn" type="button" data-stop="${esc(bus.code)}" data-svc="${esc(bus.no)}">` +
      `<span class="glanceKicker">${esc(leave != null ? (leave < 1 ? I18n.t('glance.leaveNow', 'Leave now for') : I18n.t('glance.leaveIn', 'Leave in {m} min for', { m: leave })) : I18n.t('glance.nextBus', 'Next bus'))}</span>` +
      `<span class="glanceSvc">${esc(bus.no)}</span>` +
      `<span class="glanceWhen${bus.ms < 60000 ? ' now' : ''}">${esc(when)}</span>` +
      `<span class="glanceWhere">${esc(bus.to ? I18n.t('glance.toAt', 'to {to}, at {stop}', { to: bus.to, stop: nameOf(bus.code) }) : I18n.t('glance.at', 'at {stop}', { stop: nameOf(bus.code) }))}${walk ? ` &middot; ${esc(walk)}` : ''}</span>` +
      '</button>';
  }

  // The buses starred at a stop (script.js, favBusesAt).
  const starredAt = (code) => window.favBusesAt?.(code) || new Set();

  // The buses a stop's card keeps to, or null for every bus. From a list: its buses at that stop
  // and its buses anywhere; a stop in it without any has every bus. Otherwise: the buses starred
  // at the stop, or the favourite buses, or every bus.
  function keepTo(src, code) {
    if (src?.list) {
      const set = new Set();
      for (const k of src.list.items) {
        const at = k.match(/^stopbus:(\d{5})\/(.+)$/);
        if (at && at[1] === code) set.add(at[2]);
        const bus = k.match(/^bus:(.+)$/);
        if (bus) set.add(bus[1]);
      }
      return set.size ? set : null;
    }
    const own = starredAt(code);
    if (own.size) return own;
    const favs = new Set(LS.getFavBuses());
    return favs.size ? favs : null;
  }

  // With favourite buses, each card has only those, and a stop none of them is due at is left
  // out: the few buses you take rather than every one at the stop. Without any, every bus. A
  // stop with buses starred there has just those, whatever the favourite buses are.
  function renderStops() {
    const wrap = $('#glanceStops');
    if (!fetchedAt || !stops.length) { wrap.innerHTML = ''; return; }
    const src = chosen();
    let only = false;
    const cards = stops.map((s) => {
      const all = rowsOf(s.code);
      const keep = keepTo(src, s.code);
      if (keep) only = true;
      const rows = keep ? all.filter((r) => keep.has(r.no)) : all;
      if (keep && !rows.length) return '';
      const walk = s.metres != null ? `<span class="glanceWalk">${esc(I18n.t('glance.minWalk', '{m} min walk', { m: walkMins(s.metres) }))}</span>` : '';
      const lines = rows.slice(0, ROWS).map((r) =>
        `<button class="glanceRow" type="button" data-stop="${esc(s.code)}" data-svc="${esc(r.no)}">` +
        `<span class="glanceNo">${esc(r.no)}</span>` +
        `<span class="glanceTo">${r.to ? esc(I18n.t('glance.to', 'to {to}', { to: r.to })) : ''}</span>` +
        `<span class="glanceTimes">${[0, 1, 2].map((i) => { const ms = r.times[i]; return ms == null ? '<span></span>' : `<span class="${i === 0 ? 'first' : ''}${ms < 60000 ? ' now' : ''}">${timeCell(ms)}</span>`; }).join('')}</span>` +
        '</button>').join('');
      const more = rows.length > ROWS ? `<button class="glanceMore" type="button" data-stop="${esc(s.code)}">${esc(I18n.t('glance.more', '+{n} more', { n: rows.length - ROWS }))}</button>` : '';
      return `<div class="glanceStop card glass">` +
        `<button class="glanceStopHead" type="button" data-stop="${esc(s.code)}"><span class="glanceStopName">${esc(nameOf(s.code) || s.code)}</span>${walk}</button>` +
        (lines || `<p class="glanceNone">${esc(I18n.t('glance.noneDueHere', 'No buses due right now.'))}</p>`) + more + '</div>';
    }).join('');
    wrap.innerHTML = cards || (only ? `<p class="glanceNone glanceOnly">${esc(I18n.t('glance.noneOfYours', 'None of your favourite buses are due at these stops right now.'))}</p>` : '');
  }

  function renderBar(src) {
    $('#glanceSourceLabel').textContent = src?.name || I18n.t('glance.source.near', 'Nearby');
    $('#glanceSourceIcon').dataset.icon = src?.icon || 'locate';
    hydrateIcons($('#glanceSource'));
    $('#glanceUpdated').textContent = !fetchedAt ? ''
      : clockTimes() ? I18n.t('glance.byClock', 'Clock times') : I18n.t('glance.inMinutes', 'Times in minutes');
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
    // Settings' Bus times changed: the times already in, shown the other way.
    window.addEventListener('timeschange', render);
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
    const key = chosen()?.key || '';
    if (key === 'saved' || key.startsWith('list:') || (!stops.length && showing())) refresh();
    else render();
  }

  window.Glance = { init, refresh, enabled, setEnabled, favsChanged };
})();
