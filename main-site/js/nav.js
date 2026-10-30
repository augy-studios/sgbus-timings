// Navigate: from any place to any other by bus and train, the site's version of the bot's /nav.
// The journeys come from /api/nav (api/_nav/), which keeps the best for every mix of buses and
// trains; the ends come from /api/places. Bus legs get live timings here, from
// /api/bus-arrivals, and any journey can be started as a trip for the Get Off Alert
// (js/trip.js). Offline, the same router plans on the phone (planOnPhone), and the ends come
// from the stations and stops it keeps (placesOnPhone).
// Loaded before script.js and uses its helpers ($, LS, loadStop, ...), so nothing here runs
// until script.js calls initNav().

// walksOpen: the walks of the open way whose Directions have been opened into map apps.
// when: the time picked (js/when.js), null for Leave now.
// pickWay: a shared way to open once the ways are in (openNavAt).
// via: one stop on the way, a place like either end, or null; viaOpen: its box shown, not yet
// set (Add a stop).
const nav = { from: null, to: null, via: null, viaOpen: false, options: [], option: null, onemap: false, when: null, whenPicker: null, token: 0, walksOpen: new Set(), walksFor: null, pickWay: null };

const NAV_PLACES_DELAY_MS = 300;
// A Google Maps link, which /api/places reads for the one place it points at (api/_lib/gmaps.js).
const MAPS_LINK_RE = /maps\.app\.goo\.gl\/|goo\.gl\/maps\/|google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps|maps\.google\./i;

function initNav() {
  for (const field of ['from', 'to']) {
    const id = field === 'from' ? 'navFrom' : 'navTo';
    attachPlaceSearch($(`#${id}`), $(`#${id}Ac`), (place) => setNavEnd(field, place), {
      recents: true,
      calendar: true,
      onSaved: (item) => (item.kind === 'event' ? navToEvent(field, item) : setNavEnd(field, { label: item.place.name, lat: item.place.lat, lng: item.place.lng })),
    });
  }
  // A stop on the way (Add a stop): searched as the ends are, without the calendar.
  attachPlaceSearch($('#navVia'), $('#navViaAc'), (place) => setNavEnd('via', place), {
    recents: true,
    onSaved: (item) => setNavEnd('via', { label: item.place.name, lat: item.place.lat, lng: item.place.lng }),
  });
  $('#navAddStop').addEventListener('click', () => {
    nav.viaOpen = true;
    showEnds();
    $('#navVia').focus({ preventScroll: true });
  });
  $('#navViaRemove').addEventListener('click', () => {
    const had = !!nav.via;
    nav.via = null;
    nav.viaOpen = false;
    nav.option = null;
    showEnds();
    if (had) runNav();
  });
  initSavedPlaces();
  nav.whenPicker = When.picker($('#navWhen'), (when) => {
    nav.when = when;
    nav.option = null;
    runNav();
  });

  // The Edge Tray's Navigate opens it on the tab last picked, Bus and train or Bus only (the
  // route planner, js/planner.js), and closes whichever is open.
  $('#navBtn').addEventListener('click', () => {
    if (!$('#navSection').hidden) closeNav();
    else if (!$('#plannerSection').hidden) closePlanner();
    else if (lastNavMode() === 'bus') openPlanner();
    else openNav();
  });
  for (const id of ['#navSection', '#plannerSection']) {
    $(id).querySelector('.navModes').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-nav-mode]');
      if (tab) switchNavMode(tab.dataset.navMode);
    });
  }
  $('#navClose').addEventListener('click', closeNav);
  wirePanel('navSection', closeNav);
  // The stop stays where it is, between the two.
  $('#navSwap').addEventListener('click', () => {
    [nav.from, nav.to] = [nav.to, nav.from];
    showEnds();
    runNav();
  });
  $('#navRefresh').addEventListener('click', refreshNav);
  // Back online (js/offline.js): Bus and train on show, with both ends, plans again (or its way
  // open fetches its live timings again), as Refresh would; ways planned offline are planned
  // again by /api/nav. Gone offline with it on show: the phone's planner gets ready.
  window.Offline?.onChange((off) => {
    if ($('#navSection').hidden) return;
    if (off) return warmPhonePlanner();
    if (!nav.from || !nav.to) return;
    // A way open from an offline plan opens again from the new plan, if it's still one of them.
    if (nav.offline && nav.option) {
      nav.pickWay = wayKey(nav.option);
      nav.option = null;
    }
    refreshNav();
  });
  $('#navFavBtn').addEventListener('click', () => {
    toggleFavNav(nav.from, nav.to);
    renderNavFav();
  });
  // Share: these directions, the start or the end, or your ETA on a trip, as short links
  // (js/share.js). With nothing set yet, the link to Navigate itself.
  $('#navShare').addEventListener('click', (e) => {
    if (!nav.from && !nav.to && !Trip.active()) {
      shareLink(e.currentTarget, `${location.origin}/${navHash()}`, 'Navigate by bus and train');
      return;
    }
    Share.openMenu();
  });

  $('.navFields').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-here]');
    if (btn) locateNavEnd(btn.dataset.navHere);
    const saved = e.target.closest('[data-saved-place]');
    if (saved) useSavedPlace(saved.dataset.savedPlace, (place) => setNavEnd(saved.dataset.savedFor, place));
  });

  $('#navBody').addEventListener('click', (e) => {
    const option = e.target.closest('[data-nav-option]');
    if (option) {
      nav.option = nav.options[Number(option.dataset.navOption)] || null;
      renderNav();
      $('#navSection').scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const live = e.target.closest('[data-live-map]');
    if (live) {
      try {
        LiveMap.walkTo(JSON.parse(live.dataset.liveMap));
      } catch { /* a button of this page's own making: always JSON */ }
      return;
    }
    // Walk it and Cycle it: the way on the live map, from the start.
    const other = e.target.closest('[data-nav-other]');
    if (other && nav.to) {
      LiveMap.walkTo(nav.to, { from: nav.from, cycle: other.dataset.navOther === 'cycle' });
      return;
    }
    // A bus leg's traffic: its road on the live map, coloured by how jammed it is.
    const jam = e.target.closest('[data-nav-traffic]');
    if (jam && nav.option) {
      const leg = nav.option.legs[Number(jam.dataset.navTraffic)];
      if (leg?.path) LiveMap.traffic({ points: leg.path, names: leg.names, title: `Bus ${leg.route} to ${leg.to?.name || 'its stop'}` });
      return;
    }
    const walk = e.target.closest('[data-nav-walk]');
    if (walk && nav.option) {
      // Swapped in place, so the live timings already shown aren't fetched again.
      nav.walksOpen.add(Number(walk.dataset.navWalk));
      walk.outerHTML = walkDirections(nav.option, Number(walk.dataset.navWalk));
      return;
    }
    const stop = e.target.closest('[data-nav-stop]');
    // The stop's timings and the trip bar are on the page, so Navigate gets out of their way,
    // with Back to Navigate on the timings to come back to this way (backToNav).
    if (stop) {
      closeNav();
      loadStop(stop.dataset.navStop, { service: stop.dataset.navBus, scroll: true, ctx: { kind: 'nav' } });
      return;
    }
    const action = e.target.closest('[data-nav-action]')?.dataset.navAction;
    if (action === 'back') {
      nav.option = null;
      renderNav();
    } else if (action === 'refresh') {
      refreshNav();
    } else if (action === 'trip' && nav.option) {
      const trip = tripFromNav(nav.option, nav.to);
      // A way with no ride it can follow stop by stop, such as walking all the way, says so
      // rather than closing as if the trip had started.
      if (!trip.legs.length) {
        alert("This way can't be followed as a trip. Try another way.");
        return;
      }
      // This screen, for the timeline's Back to Navigate (openTripOrigin).
      Trip.start({ ...trip, origin: { kind: 'nav', from: nav.from, to: nav.to, via: nav.via, when: nav.when, way: wayKey(nav.option) } });
      closeNav();
    } else if (action === 'retry') {
      runNav();
    }
  });
}

// ---- Choosing the ends ----

// Place suggestions from /api/places under an input, for Navigate's ends and Places' search.
// `onPick` gets the place picked. With `recents`, the box also drops down past searches until
// something's typed (js/recents.js), and keeps what's picked from the suggestions as one; a
// recent picked there comes back as a place, and a saved place or calendar event (with
// `calendar`) goes to `onSaved` if given, otherwise to `onPick` as a place.
function attachPlaceSearch(input, box, pick, { recents = false, calendar = false, onSaved = null } = {}) {
  window.wireCombobox?.(input, box);
  const onPick = (place) => {
    if (recents) Recents.add(Recents.placeItem(place));
    pick(place);
  };
  let timer = null;
  let token = 0;
  let found = [];

  const render = (places) => {
    found = places;
    // Not reopened by an answer that comes in after the field has been left.
    if (!places.length || document.activeElement !== input) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = places.map((p, i) =>
      `<div class="acItem" data-place="${i}">` +
      `<span class="code">${ico(p.kind === 'station' ? 'train' : p.kind === 'stop' ? 'bus' : 'pin')}</span>` +
      `<span class="name">${escapeHtml(p.label)}${p.sub ? `<span class="road"> · ${escapeHtml(p.sub)}</span>` : ''}</span>` +
      `</div>`
    ).join('');
    box.hidden = false;
  };

  const note = (text) => {
    found = [];
    box.innerHTML = `<div class="acNote">${escapeHtml(text)}</div>`;
    box.hidden = false;
  };

  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return render([]);
    // A Google Maps link is pasted whole, so it's read at once and, once placed, set as the end.
    const link = MAPS_LINK_RE.test(q);
    // Offline (js/offline.js), only what the phone has: stations and bus stops (placesOnPhone).
    if (window.Offline?.on()) {
      ++token;
      if (link) return note('Reading a Google Maps link needs a connection. Pick a stop, a station or one of your places.');
      return render(placesOnPhone(q));
    }
    if (link) note('Reading the Google Maps link…');
    timer = setTimeout(async () => {
      const mine = ++token;
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        const data = await r.json().catch(() => null);
        if (mine !== token) return;
        if (link && !r.ok) return note(data?.error || "Couldn't read that Google Maps link. Please try again.");
        // Coordinates or a plus code outside Singapore: say so rather than show an empty list.
        if (r.status === 422 && data?.error) return note(data.error);
        const places = r.ok && Array.isArray(data) ? data : [];
        if (link && places.length === 1) {
          box.hidden = true;
          onPick(places[0]);
          return;
        }
        render(places);
      } catch {
        if (mine !== token) return;
        if (link) note("Couldn't read that Google Maps link. Check your connection and try again.");
        // Not reached: what the phone has, as offline.
        else render(placesOnPhone(q));
      }
    }, link ? 0 : NAV_PLACES_DELAY_MS);
  });
  // Not if the box has been tapped back into meanwhile, which would close what that opened.
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) box.hidden = true; }, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && found[0]) {
      box.hidden = true;
      onPick(found[0]);
    }
  });
  box.addEventListener('click', (e) => {
    const item = e.target.closest('[data-place]');
    if (!item) return;
    box.hidden = true;
    onPick(found[Number(item.dataset.place)]);
  });
  if (!recents) return;
  Recents.attach(input, box, {
    accepts: Recents.hasPoint,
    saved: 'places',
    calendar,
    onPick: (item) => {
      if (item.kind === 'saved' || item.kind === 'event') return onSaved ? onSaved(item) : pick(item.kind === 'saved' ? item.place : item.place || item);
      pick(Recents.asPlace(item));
    },
  });
}

// Places offline, with no /api/places to ask: MRT and LRT stations (js/station-search.js) and
// bus stops (matchStops, script.js), as /api/places lists them, an exact stop code first. No
// addresses or buildings, which are OneMap's.
const PHONE_STATIONS = 4;
const PHONE_STOPS = 6;
function placesOnPhone(q) {
  const lower = q.trim().toLowerCase();
  const stations = (StationSearch.all() || [])
    .filter((s) => s.name.toLowerCase().includes(lower) || s.codes.some((c) => c.toLowerCase() === lower))
    .slice(0, PHONE_STATIONS)
    .map((s) => ({ kind: 'station', label: `${s.name} station`, sub: s.codes.join(' / '), code: s.codes.join('/'), lat: s.lat, lng: s.lng }));
  const stops = matchStops(q, PHONE_STOPS).stops.flatMap((s) => {
    const at = stopsIndex?.[s.code];
    if (at?.lat == null || at?.lng == null) return [];
    return [{ kind: 'stop', label: s.name || s.code, sub: `Bus stop ${s.code}${s.road ? ` · ${s.road}` : ''}`, code: s.code, lat: at.lat, lng: at.lng }];
  });
  const exact = stops.filter((s) => s.code === lower);
  return [...exact, ...stations, ...stops.filter((s) => s.code !== lower)];
}

// ---- Home, Work and your places ----

// Set in Places (js/places.js) and offered as buttons under each end of Navigate and the route
// planner: Home and Work always, dashed while unset, then every other place saved. The row
// wraps onto more lines once there are more than fit.
function initSavedPlaces() {
  showSavedPlaces();
}

function showSavedPlaces() {
  const places = Places.all({ unset: true });
  for (const row of $$('.savedPlaceBtns[data-saved-for]')) {
    const field = row.dataset.savedFor;
    row.innerHTML = places.map((p) =>
      `<button class="iconBtn${p.unset ? ' unset' : ''}" type="button" data-saved-place="${escapeHtml(p.key)}" data-saved-for="${field}"` +
      ` title="${escapeHtml(p.unset ? `Set your ${p.name.toLowerCase()} in Places` : `${p.name}: ${p.label}`)}">` +
      `${ico(p.icon)} ${escapeHtml(p.name)}</button>`
    ).join('');
  }
}

// A saved place handed to `use`, or, while Home or Work isn't set, Places opened to set it.
function useSavedPlace(key, use) {
  const place = Places.get(key);
  if (place) return use(place);
  Places.edit(key);
}

const HERE_LABEL = 'Your location';

// An end set to where you are, by its pin button, which shows it's working meanwhile.
function locateNavEnd(field) {
  return withLocating($(`[data-nav-here="${field}"]`), () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("This browser can't share its location."));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(setNavEnd(field, { label: HERE_LABEL, lat: pos.coords.latitude, lng: pos.coords.longitude })),
        (err) => reject(new Error(locationMessage(err, 'to start from where you are'))),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    })
  );
}

function setNavEnd(field, place) {
  nav[field] = { label: place.label, lat: place.lat, lng: place.lng };
  nav.option = null;
  showEnds();
  if (field === 'from' && !nav.to) $('#navTo').focus({ preventScroll: true });
  runNav();
}

// A calendar event (js/calendar.js) picked in From or To. In To, it's the way there from
// wherever From is, or from where you are, set to Arrive by the event's start when that's a
// time Navigate can plan for. An event whose location matched no place puts that location in
// the box, to pick the right place from the suggestions.
function navToEvent(field, ev) {
  if (!ev.place) {
    const input = $(field === 'from' ? '#navFrom' : '#navTo');
    input.value = ev.location;
    input.focus({ preventScroll: true });
    input.dispatchEvent(new Event('input'));
    return;
  }
  const end = { label: ev.place.label, lat: ev.place.lat, lng: ev.place.lng };
  if (field === 'from') return setNavEnd('from', end);
  const when = !ev.allDay && ev.start > Date.now() ? { mode: 'arrive', at: When.msToAt(ev.start) } : null;
  openNavAt(nav.from || 'here', end, when && When.problem(when) == null ? when : null);
}

function showEnds() {
  $('#navFrom').value = nav.from?.label || '';
  $('#navTo').value = nav.to?.label || '';
  $('#navVia').value = nav.via?.label || '';
  const stop = !!(nav.via || nav.viaOpen);
  $('#navViaField').hidden = !stop;
  $('#navAddStop').hidden = stop;
}

// ---- Opening and closing ----

// Navigate's two tabs: Bus and train (this file) and Bus only, the route planner
// (js/planner.js), each its own panel. Switching carries the ends across where it can: a place
// to the bus stop at it, or the nearest within NEAR_STOP_M, and a stop to its place; and the
// time picked. The tab picked is the one the Edge Tray's Navigate opens next time.
const NAV_MODE_KEY = 'sgbus_nav_mode';
const NEAR_STOP_M = 150;

function lastNavMode() {
  try {
    return localStorage.getItem(NAV_MODE_KEY) === 'bus' ? 'bus' : 'all';
  } catch {
    return 'all';
  }
}

function stopNear(place) {
  if (!place || !stopsIndex) return null;
  let best = null;
  let bestM = NEAR_STOP_M;
  for (const [code, s] of Object.entries(stopsIndex)) {
    const m = haversine(place.lat, place.lng, s.lat, s.lng);
    if (m != null && m < bestM) [best, bestM] = [code, m];
  }
  return best;
}

function placeOfStop(code) {
  const s = code && stopsIndex?.[code];
  return s ? { label: nameOf(code) || code, lat: s.lat, lng: s.lng } : null;
}

function switchNavMode(mode) {
  try {
    localStorage.setItem(NAV_MODE_KEY, mode);
  } catch { /* opens on Bus and train next time */ }
  if (mode === 'bus' && $('#plannerSection').hidden) {
    const { from, to, when } = nav;
    closeNav();
    openPlanner(stopNear(from), stopNear(to), { when });
  } else if (mode === 'all' && $('#navSection').hidden) {
    const { start, end, when } = planner;
    closePlanner();
    nav.from = placeOfStop(start);
    nav.to = placeOfStop(end);
    openNav(nav.from, nav.to, { when });
  }
}

// Opens over the page (a .panelModal, js/ui.js), at Leave now unless it's given a time: one
// picked before isn't kept. Given an end, it starts without a stop on the way unless it's
// given one too (`via`, a link's: openNavAt).
function openNav(from = null, to = null, { when = null, focus = true, via } = {}) {
  if (from) nav.from = from;
  if (to) nav.to = to;
  if (via !== undefined || from || to) {
    nav.via = via || null;
    nav.viaOpen = false;
  }
  nav.option = null;
  nav.when = when;
  nav.whenPicker.set(when);
  showPanel('navSection', true);
  showEnds();
  if (nav.from && nav.to) runNav();
  else renderNav();
  // Offline, the phone's planner gets ready while the ends are picked.
  if (window.Offline?.on() && !(nav.from && nav.to)) warmPhonePlanner();
  if (!nav.from && focus) Recents.quietFocus($('#navFrom'));
}

// Bus and train, from where you are to `to`: the live map's Directions on a stop or station
// (js/map-card.js). The tab it opens on is Bus and train whichever was last.
function openNavFromHere(to) {
  if (!$('#plannerSection').hidden) closePlanner();
  try {
    localStorage.setItem(NAV_MODE_KEY, 'all');
  } catch { /* opens on Bus and train this time anyway */ }
  nav.from = null;
  openNav(null, to, { focus: false });
  locateNavEnd('from').catch(() => {});
}

// Something shared into the installed app (manifest.json's share_target): a Google Maps place,
// or text naming one, goes in To as if pasted there. A link is set as the end once it's read;
// anything else leaves its suggestions open to pick from.
function openNavShared(text) {
  openNav();
  const input = $('#navTo');
  input.value = text;
  if (!MAPS_LINK_RE.test(text)) input.focus({ preventScroll: true });
  input.dispatchEvent(new Event('input'));
}

function closeNav() {
  showPanel('navSection', false);
  nav.token++;
  if (location.hash.startsWith('#nav/')) history.replaceState(null, '', stopHash() || location.pathname);
}

// Back from a stop's timings opened off a way (Back to Navigate, script.js goBack): Navigate as
// it was left, the same ends and the same way open, not planned afresh as openNav would.
function backToNav() {
  showPanel('navSection', true);
  if (nav.from && nav.to) history.replaceState(null, '', navHash());
  renderNav();
}

// Back to Navigate, from a trip's timeline (js/trip.js): the screen the trip was started from,
// its `origin`, on the tab it was on. A way in Bus and train shows as it was left if Navigate
// still has it (the same ends, stop, time and way open), as backToNav does; otherwise it's
// planned again with that way open, if it's still one of them. A journey in Bus only opens as
// it was. A time picked that has passed since is left out, so it plans for now rather than
// only saying the time has gone.
function openTripOrigin(o) {
  const when = o.when && When.problem(o.when) == null ? o.when : null;
  try {
    localStorage.setItem(NAV_MODE_KEY, o.kind === 'route' ? 'bus' : 'all');
  } catch { /* the tab opened this time all the same */ }
  if (o.kind === 'route') {
    if (!$('#navSection').hidden) closeNav();
    openPlanner(o.start, o.end, { journey: o.journey, when });
    return;
  }
  if (!$('#plannerSection').hidden) closePlanner();
  const same = (a, b) => (!a && !b) || (!!a && !!b && a.label === b.label && coord(a) === coord(b));
  const kept = nav.option && wayKey(nav.option) === o.way && same(nav.from, o.from) && same(nav.to, o.to) &&
    same(nav.via, o.via) && JSON.stringify(nav.when) === JSON.stringify(o.when);
  if (kept) return backToNav();
  openNavAt(o.from, o.to, when, o.way, o.via);
}

const coord = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

// The nav as a link, for the address bar and Share: "#nav/1.30050,103.85580~Bedok%20Mall/here",
// with "/via/1.35330,103.94520~Tampines" after the ends for a stop on the way, and
// "/arrive/2026-10-09T08:30" on the end for a picked time. Each end is its point and name;
// "here" for Your location, so whoever opens the link starts or ends where they are; or "-"
// while it isn't set. Just "#nav" with nothing set at all.
function navHash() {
  return navHashFor(nav.from, nav.to, nav.when, nav.via);
}

// The same for any two ends, each a place, null, or "here" (as Share has them), and a stop, a
// place or null: Offline Sharing's link (js/offline-share.js), which opens with no server to
// look it up.
function navHashFor(from, to, when = null, via = null) {
  const end = (p) => {
    if (!p) return '-';
    if (p === 'here' || p.label === HERE_LABEL) return 'here';
    // The name escaped further than encodeURIComponent goes, so "~" only ever starts it and a
    // closing bracket doesn't end the link where it's pasted.
    return `${coord(p)}~${encodeURIComponent(p.label).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
  };
  // A stop is always a point: Your location as one is where you were.
  const stop = via && via !== 'here' ? `/via/${end({ ...via, label: via.label === HERE_LABEL ? 'My location' : via.label })}` : '';
  return from || to || when ? `#nav/${end(from)}/${end(to)}${stop}${When.hashPart(when)}` : '#nav';
}

// Opens a nav link (navHash). A link from before ends carried names takes a saved nav's
// names for its points, or Start and End.
function openNavHash(fromText, toText, when = null, viaText = null) {
  const point = (t, fallback) => {
    if (t === '-' || t === 'here') return null;
    const [pos, ...rest] = t.split('~');
    const [lat, lng] = pos.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let label = rest.join('~');
    try { label = decodeURIComponent(label); } catch { /* left as it came */ }
    if (!label.trim()) {
      const fav = LS.getFavNavs().find((n) => coord(n.from) === pos || coord(n.to) === pos);
      label = fav ? (coord(fav.from) === pos ? fav.from.label : fav.to.label) : fallback;
    }
    return { label: label.trim(), lat, lng };
  };
  openNavAt(fromText === 'here' ? 'here' : point(fromText, 'Start'), toText === 'here' ? 'here' : point(toText, 'End'), when, null, viaText ? point(viaText, 'Stop') : null);
}

// Opens Navigate at two ends, from a link: each a place, null for not set, or "here" for
// wherever the person opening it is, and `via`, a stop on the way or null. `way` (wayKey) is
// the way to open once they're planned, if it's still among them.
function openNavAt(from, to, when = null, way = null, via = null) {
  nav.from = from === 'here' ? null : from;
  nav.to = to === 'here' ? null : to;
  nav.pickWay = way;
  // Not the keyboard up over From while it's finding where you are.
  openNav(nav.from, nav.to, { when, focus: from !== 'here', via });
  if (from === 'here') locateNavEnd('from');
  if (to === 'here') locateNavEnd('to');
}

// A way, as it's told apart from the others: its rides and where each is boarded.
const wayKey = (o) => (o.walkOnly ? 'walk' : o.legs.filter((l) => l.mode !== 'walk').map((l) => `${l.mode}:${l.route}@${l.from?.code || l.from?.name || ''}`).join('>'));

// ---- Planning ----

// The ways by bus and train from one place to another, now or at `when`, and by `via` if
// it's given, a stop on the way: /api/nav's answer. Also the trip's Find another way, when a
// last bus is lost (js/trip.js). Offline (js/offline.js), or when /api/nav can't be reached,
// planned on the phone instead (planOnPhone), in the same shape with `offline` set.
async function fetchWays(from, to, when = null, via = null) {
  const data = window.Offline?.on() ? await planOnPhone(from, to, when, via) : await askNav(from, to, when, via);
  // Each way's stop (`via`, api/_nav/via.js) by its name, for the way and its trip to show.
  if (via) for (const o of data.options || []) if (o.via) o.via.label = via.label;
  return data;
}

async function askNav(from, to, when, via) {
  const at = when ? `&when=${when.mode}&at=${encodeURIComponent(when.at)}` : '';
  // Settings' Restricted areas (BusNet.setOpenAccess), and Immigration time when it's your own.
  const open = BusNet.openAccess() ? '&restricted=1' : '';
  const customs = LS.getCustoms() === 'auto' ? '' : `&customs=${LS.getCustoms()}`;
  // Settings' Cycling: ways by bike weighed too (`others.cycle`).
  const bike = LS.getBike() ? '&bike=1' : '';
  const stop = via ? `&via=${coord(via)}` : '';
  let r;
  try {
    r = await fetch(`/api/nav?from=${coord(from)}&to=${coord(to)}${stop}${at}${open}${customs}${bike}`, { cache: 'no-store' });
  } catch (e) {
    // Not reached at all (a network error is a TypeError): planned on the phone.
    if (e instanceof TypeError) return planOnPhone(from, to, when, via);
    throw e;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Couldn't plan that right now.");
  return data;
}

// ---- Planning on the phone, offline ----

// Bus and train with no connection (js/nav-core/offline.js): the same router as /api/nav, on
// the bus routes and stops the phone keeps and the rail network precached with the app, in
// js/nav-worker.js so building its graph doesn't hold the page still. Where a module worker
// can't start, the same module runs in the page. No OneMap, live traffic, last bus warnings,
// walking or cycling the whole way, or train disruptions: times are the router's estimates.
const navWorker = { worker: null, failed: false, seq: 0, waiting: new Map(), stopsSent: null };

async function planOnPhone(from, to, when = null, via = null) {
  const point = (p) => ({ lat: p.lat, lng: p.lng });
  const customs = LS.getCustoms() === 'auto' ? null : Number(LS.getCustoms());
  const ask = { from: point(from), to: point(to), via: via ? point(via) : null, when: when ? { mode: when.mode, at: when.at } : null, open: BusNet.openAccess(), customs, now: Date.now() };
  return phoneCall({ ask });
}

// Builds the graph ahead of the first plan, once offline with Navigate open, so the first plan
// doesn't wait for it. Nothing happens if it can't.
function warmPhonePlanner() {
  phoneCall({ warm: { open: BusNet.openAccess() } }).catch(() => {});
}

async function phoneCall(message) {
  const stops = await ensureStopsIndex();
  if (!navWorker.failed && typeof Worker !== 'undefined' && !navWorker.worker) {
    try {
      navWorker.worker = new Worker('/js/nav-worker.js', { type: 'module' });
      navWorker.worker.onmessage = ({ data }) => {
        const waiting = navWorker.waiting.get(data.id);
        navWorker.waiting.delete(data.id);
        if (waiting) waiting.done(data);
      };
      // A worker that didn't start (no module workers here) hands what it was asked to the page.
      navWorker.worker.onerror = (e) => {
        e.preventDefault?.();
        navWorker.failed = true;
        navWorker.worker = null;
        for (const waiting of navWorker.waiting.values()) waiting.fallback();
        navWorker.waiting.clear();
      };
    } catch {
      navWorker.failed = true;
      navWorker.worker = null;
    }
  }
  if (!navWorker.worker) return phoneHere(message, stops);
  const id = ++navWorker.seq;
  const sendStops = navWorker.stopsSent !== stops;
  navWorker.stopsSent = stops;
  return new Promise((resolve, reject) => {
    navWorker.waiting.set(id, {
      done: (data) => (data.error ? reject(new Error(data.error)) : resolve(data.data)),
      fallback: () => phoneHere(message, stops).then(resolve, reject),
    });
    navWorker.worker.postMessage(sendStops ? { id, ...message, stops } : { id, ...message });
  });
}

// The same, on the page's own thread.
let phoneModule = null;
let phoneStops = null;
async function phoneHere({ ask, warm }, stops) {
  if (!phoneModule) {
    phoneModule = import('/js/nav-core/offline.js').catch((e) => {
      phoneModule = null;
      throw e;
    });
  }
  let mod;
  try {
    mod = await phoneModule;
  } catch {
    throw new Error("Bus and train can't plan offline in this browser. Plan by Bus only, or try again when you reconnect.");
  }
  if (phoneStops !== stops) {
    mod.setStops(stops);
    phoneStops = stops;
  }
  return warm ? mod.warm(warm) : mod.planOffline(ask);
}

async function runNav() {
  renderNavFav();
  if (!nav.from || !nav.to) {
    renderNav();
    return;
  }
  const token = ++nav.token;
  history.replaceState(null, '', navHash());
  const late = When.problem(nav.when);
  if (late) {
    $('#navBody').innerHTML = plannerStatus(late);
    return;
  }
  const when = nav.when;
  $('#navBody').innerHTML = plannerStatus(window.Offline?.on() ? I18n.t('nav.planningOffline', 'Planning by bus and train on your phone…') : I18n.t('nav.finding', 'Finding journeys by bus and train…'));
  try {
    const data = await fetchWays(nav.from, nav.to, when, nav.via);
    if (token !== nav.token) return;
    nav.options = data.options || [];
    nav.onemap = !!data.onemap;
    // Planned on the phone (planOnPhone): estimates, with nothing live.
    nav.offline = !!data.offline;
    // Bus times by the traffic right now, and walking or cycling the whole way (api/_nav/live.js).
    nav.traffic = data.traffic || null;
    nav.others = data.others || {};
    // A shared way (openNavAt) opens once, if it's still one of the ways.
    nav.option = nav.pickWay ? nav.options.find((o) => wayKey(o) === nav.pickWay) || null : null;
    nav.pickWay = null;
    renderNav();
  } catch (e) {
    if (token !== nav.token) return;
    // Offline, planning on the phone says why it couldn't (planOnPhone).
    $('#navBody').innerHTML = plannerStatus(e.message || I18n.t('nav.couldnt', 'Couldn’t plan that right now.')) +
      `<button type="button" class="iconBtn" data-nav-action="retry">${escapeHtml(I18n.t('common.tryAgain', 'Try again'))}</button>`;
  }
}

function renderNav() {
  const body = $('#navBody');
  renderNavFav();
  if (!nav.from || !nav.to) {
    body.innerHTML = plannerStatus(I18n.t('nav.setEnds', 'Set where you’re starting and where you’re going: an address, a building, a postal code, a station, a bus stop, a Google Maps link, or your location.'));
    return;
  }
  if (nav.option) {
    renderNavOption(nav.option);
    return;
  }
  if (!nav.options.length) {
    body.innerHTML = plannerStatus(nav.when ? I18n.t('nav.noneAtTime', 'No way by bus or train running at that time was found between these two places. Try another time, or somewhere nearby.') : I18n.t('nav.noneNow', 'No way by bus or train running right now was found between these two places. Try another time, or somewhere nearby.'));
    return;
  }
  body.innerHTML =
    (nav.offline ? `<p class="navOffline">${ico('alert')} ${escapeHtml(I18n.t('nav.plannedOffline', 'Planned offline: times are estimates.'))}</p>` : '') +
    plannerStatus((nav.options.length === 1 ? I18n.t('nav.waysOne', '1 way to get there') : I18n.t('nav.waysMany', '{n} ways to get there', { n: nav.options.length })) + (nav.when ? `, ${When.describe(nav.when).replace(/^\w/, (c) => c.toLowerCase())}` : '') + I18n.t('nav.waysTail', ', quickest first. Every mix of bus and train is listed, not just the fastest.')) +
    `<div class="journeyList">${nav.options.map((o, i) => navOptionItem(o, i)).join('')}</div>` +
    navOthers() +
    `<p class="estimateNote">Times include walking and an average wait to board, estimated from distance${nav.traffic ? ', with buses slowed by the traffic on their way right now, from LTA' : ''}. Only buses and trains running at the time are used, going by first and last bus times and train hours.${nav.onemap ? ' OneMap’s timetable-based estimate is shown where it rides the same way.' : ''}${nav.via ? ' No time is counted at your stop: add what you’ll spend there.' : ''}${nav.offline ? ' Planned on your phone with no connection: walks are straight lines, and there’s no live traffic, last bus warning or train disruption. It plans again when you reconnect.' : ''}</p>` +
    customsNote(nav.options);
}

// Walking or cycling the whole way (/api/nav's `others`), under the ways, each with a button to
// follow it on the live map. Said to be quicker when it beats every way by bus and train.
function navOthers() {
  const best = nav.options.find((o) => !o.walkOnly)?.minutes ?? Infinity;
  const row = (kind, o) => {
    const quicker = o.minutes < best ? ', quicker than any bus or train' : '';
    const what = kind === 'cycle' ? 'Cycle there' : 'Walk there';
    return `<div class="navOther">${ico(kind === 'cycle' ? 'route' : 'walk')}<span><b>${what}</b>: ~${o.minutes} min, ${escapeHtml(formatDistance(o.distance))}${quicker}</span>` +
      `<button type="button" class="iconBtn" data-nav-other="${kind}">${kind === 'cycle' ? 'Cycle it' : 'Walk it'}</button></div>`;
  };
  const rows = ['walk', 'cycle'].filter((k) => nav.others?.[k]).map((k) => row(k, nav.others[k]));
  return rows.length ? `<div class="navOthers">${rows.join('')}</div>` : '';
}

// What a bus leg's traffic is (/api/nav's `traffic`), and why, in words: "~6 min slower than
// usual: heavy traffic on Bedok North Road. Accident on PIE (towards Tuas)."
function trafficText(t) {
  const parts = [];
  if (t.extra >= 1) parts.push(`~${t.extra} min slower than usual${t.roads?.length ? `: heavy traffic on ${t.roads.join(' and ')}` : ''}.`);
  for (const i of t.incidents || []) parts.push(incidentText(i));
  return parts.join(' ');
}

// An incident in words: LTA's message without when it was reported ("(25/10)00:41"), led by
// its type unless the message already is ("Accident on PIE ...").
function incidentText({ type, message }) {
  const m = String(message || '').replace(/^\(\d+\/\d+\)\d+:\d+\s*/, '');
  return m.toLowerCase().startsWith(String(type).toLowerCase()) ? m : `${type}: ${m}`;
}

// Under ways across the Causeway: the time counted for immigration, the longest of them.
function customsNote(options) {
  const minutes = options.flatMap((o) => o.legs.flatMap((l) => (l.customs || []).map((c) => c.minutes)));
  if (!minutes.length) return '';
  const most = Math.max(...minutes);
  const least = Math.min(...minutes);
  return `<p class="estimateNote">Ways across the Causeway count ~${least === most ? most : `${least} to ${most}`} min to clear immigration at both checkpoints` +
    `${LS.getCustoms() === 'auto' ? ', by the time of day you’d get there' : ''}. Your own time can be set in Settings.</p>`;
}

// "08:12 → 08:50" for a way, by the time picked.
const navClocks = (o) => {
  const { leave, arrive } = When.span(nav.when, o.minutes);
  return `${When.clock(leave)} → ${When.clock(arrive)}`;
};

// For Arrive by: a way you'd have had to set off on already.
const navTooLate = (o) => nav.when?.mode === 'arrive' && When.span(nav.when, o.minutes).leave < Date.now() - 60000;

// Where to stand on a train (js/mrt-doors.js), at a glance: the station, then a row for each
// way off the platform with its icon and its doors, each drawn as a little platform door in
// the line's colour with its number, as the number is shown on the real one. `text` says it all
// in words for a screen reader.
const DOOR_TYPE = { escalator: 'Escalator', lift: 'Lift', stairs: 'Stairs' };
// Where to look for the door's number on the platform (js/mrt-doors.js, numberAt): a little
// drawing of that kind of platform door, the spot ringed, and the words. Full-height doors have
// a panel over them, in the line's colour; half-height ones stand between posts.
function doorNumberAt(at) {
  const full = '<rect x="3" y="2" width="34" height="27" rx="1.5" class="dnFrame"/>' +
    '<rect x="3" y="2" width="34" height="6" class="dnBand"/>' +
    '<rect x="7" y="10" width="12.5" height="19" class="dnGlass"/><rect x="20.5" y="10" width="12.5" height="19" class="dnGlass"/>';
  const half = '<rect x="2" y="5" width="6" height="24" rx="1" class="dnFrame"/><rect x="32" y="5" width="6" height="24" rx="1" class="dnFrame"/>' +
    '<rect x="2" y="5" width="6" height="3" class="dnBand"/><rect x="32" y="5" width="6" height="3" class="dnBand"/>' +
    '<rect x="9" y="14" width="10.5" height="15" class="dnGlass"/><rect x="20.5" y="14" width="10.5" height="15" class="dnGlass"/>';
  const spot = { above: [20, 5], corner: [31, 11.5], post: [35, 11] }[at];
  return `<svg class="dnSvg" viewBox="0 0 40 32" aria-hidden="true">${at === 'post' ? half : full}` +
    `<circle cx="${spot[0]}" cy="${spot[1]}" r="4.2" class="dnRing"/><circle cx="${spot[0]}" cy="${spot[1]}" r="1.6" class="dnDot"/></svg>`;
}
function doorsPanel(p, text, color) {
  if (!p) return '';
  const head = p.cross ? `At ${p.station}` : p.change != null ? `Changing at ${p.station}` : `Getting off at ${p.station}`;
  const rows = p.cross
    ? `<li class="doorRow">${ico('swap')}<span class="doorWhere">Change across the platform to the <b>${escapeHtml(p.cross)}</b></span></li>`
    : p.rows.map((r) => `<li class="doorRow">${ico(DOOR_TYPE[r.t] ? r.t : 'train')}` +
        `<span class="doorChips">${r.doors.map((n) => `<span class="doorChip"><span class="doorTop">Door</span><b>${n}</b></span>`).join('')}</span>` +
        `<span class="doorWhere">${escapeHtml(DOOR_TYPE[r.t] || r.t)}${r.places.length ? ` to ${escapeHtml(r.places.join(', '))}` : ''}</span></li>`).join('');
  const line = color ? ` style="--line:${escapeHtml(color)}"` : '';
  return `<div class="legDoors" role="note" aria-label="${escapeHtml(text || '')}"${line}>` +
    `<div class="doorHead" aria-hidden="true">${ico('train')}<span>${escapeHtml(head)}${p.change ? ` <span class="doorFor">for the ${escapeHtml(p.change)}</span>` : ''}</span></div>` +
    `<ul class="doorRows" aria-hidden="true">${rows}</ul>` +
    (p.cross ? '' : `<div class="doorFoot" aria-hidden="true">${p.numberAt
      ? `${doorNumberAt(p.numberAt)}<span><b>Door number:</b> ${MrtDoors.NUMBER_AT[p.numberAt]}</span>`
      : '<span>Look for the number on each platform door</span>'}</div>`) +
    `</div>`;
}

function legChip(leg) {
  if (leg.mode === 'bus') return `<span class="busChip">${ico('bus')} ${escapeHtml(leg.route)}</span>`;
  const dot = leg.color ? `<span class="lineDot" style="--line:${escapeHtml(leg.color)}"></span>` : '';
  return `<span class="busChip lineChip">${dot}${escapeHtml(leg.route)}</span>`;
}

function walkMetres(o) {
  return o.legs.filter((l) => l.mode === 'walk').reduce((sum, l) => sum + (l.metres || 0), 0);
}

// A way's legs before its stop on the way and after it (/api/nav's `via`), or all in one.
const wayHalves = (o) => (o.via ? [o.legs.slice(0, o.via.leg), o.legs.slice(o.via.leg)] : [o.legs]);

function navMixText(o) {
  if (o.walkOnly) return I18n.t('nav.walkAll', 'Walk all the way');
  // Getting off at the stop on the way isn't a change.
  const changes = wayHalves(o).reduce((sum, legs) => sum + Math.max(0, legs.filter((l) => l.mode !== 'walk').length - 1), 0);
  return `${changes === 0 ? I18n.t('nav.noChange', 'No change') : changes === 1 ? I18n.t('nav.oneChange', '1 change') : I18n.t('nav.changes', '{n} changes', { n: changes })} · ${I18n.t('nav.walkDist', '{d} walk', { d: formatDistance(walkMetres(o)) })}`;
}

// A start or end with no stop or station within a walk (js/nav-core/router.js, `far`, help desk
// #11): how far it is to the nearest, so the long walk in the way isn't a surprise.
function farNotes(o) {
  const out = [];
  if (o.far?.from != null) out.push(I18n.t('nav.farFrom', 'The nearest stop is {d} from where you’re starting', { d: formatDistance(o.far.from) }));
  if (o.far?.to != null) out.push(I18n.t('nav.farTo', 'The nearest stop is {d} from where you’re going', { d: formatDistance(o.far.to) }));
  return out;
}

function navOptionItem(o, i) {
  // The rides in order, with a pin where the stop on the way comes.
  const chips = o.walkOnly ? `<span class="busChip">${ico('walk')} Walk</span>`
    : wayHalves(o).map((legs) => legs.filter((l) => l.mode !== 'walk').map(legChip)).reduce((all, half) => [...all, `<span class="busChip viaChip">${ico('pin')} Stop</span>`, ...half]).join(legArrow);
  const notes = o.via ? [`Stop at ${viaName(o)}`] : [];
  if (o.onemapMinutes != null) notes.push(`OneMap ~${o.onemapMinutes} min`);
  if (o.source === 'onemap') notes.push('Found by OneMap');
  // With a time picked, the clock times lead and the minutes go with the rest.
  const lead = nav.when ? navClocks(o) : `~${o.minutes} min`;
  const detail = [...(nav.when ? [`~${o.minutes} min`] : []), navMixText(o), ...notes].join(' · ');
  return `<button type="button" class="journeyItem${o.disrupted ? ' disrupted' : ''}" data-nav-option="${i}">` +
    `<span class="journeyBuses">${chips}</span>` +
    `<span class="journeyMeta">${escapeHtml(lead)}</span>` +
    `<span class="journeyDetail">${escapeHtml(detail)}</span>` +
    (o.disrupted ? `<span class="journeyWarn">${ico('alert')} A line on this journey has a disruption</span>` : '') +
    farNotes(o).map((t) => `<span class="journeyWarn">${ico('walk')} ${escapeHtml(t)}</span>`).join('') +
    (navTooLate(o) ? `<span class="journeyWarn">${ico('alert')} Too late: you'd have had to leave by ${escapeHtml(When.clock(When.span(nav.when, o.minutes).leave))}</span>` : '') +
    o.legs.filter((l) => l.lastBus).map((l) => `<span class="journeyWarn">${ico('alert')} Last ${escapeHtml(l.route)} from ${escapeHtml(l.from?.name || 'its stop')} at ${escapeHtml(l.lastBus)}</span>`).join('') +
    // Why it's slower, in a line; tapped, the way's own page has it on the map.
    o.legs.filter((l) => l.traffic).map((l) => `<span class="journeyTraffic">${ico('alert')} Bus ${escapeHtml(l.route)}: ${escapeHtml(trafficText(l.traffic))}</span>`).join('') +
    `</button>`;
}

// A station by its own name: OneMap's ways, and navs saved before api/_nav/onemap-check.js
// named them as the router does, say "PASIR RIS MRT STATION" (help desk #6).
const STATION_SUFFIX = /\s+(?:MRT|LRT)(?:\s+STATION)?(?:\s*\/\s*(?:MRT|LRT)(?:\s+STATION)?)?\s*$/i;
function stationName(name) {
  const s = String(name || '').replace(STATION_SUFFIX, '').trim();
  return /[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s(/-])\S/g, (c) => c.toUpperCase());
}
const placeName = (p) => (p?.kind === 'station' ? `${stationName(p.name)} station`
  : STATION_SUFFIX.test(p?.name || '') ? `${stationName(p.name)} station`
  : p?.name ? `${p.name}${p.code && p.kind === 'stop' ? ` (${p.code})` : ''}` : '');
// A way's stop on the way by name (fetchWays), and any place on a way, that stop included:
// the walks to and from it end and start at it (api/_nav/via.js), marked `via`.
const viaName = (o) => o?.via?.label || nav.via?.label || 'your stop';
const wayPlaceName = (o, p) => (p?.via ? viaName(o) : placeName(p));

async function renderNavOption(o) {
  const body = $('#navBody');
  const token = nav.token;
  if (nav.walksFor !== o) {
    nav.walksFor = o;
    nav.walksOpen = new Set();
  }
  const head =
    `<div class="plannerNav">` +
    `<button type="button" class="iconBtn" data-nav-action="back">${ico('back')} ${escapeHtml(I18n.t('nav.allWays', 'All ways'))}</button>` +
    // Here as well as in the card's header, which has scrolled away by the time you're
    // reading a way on a phone; the route planner has its Refresh in the same place.
    `<button type="button" class="iconBtn" data-nav-action="refresh">${escapeHtml(I18n.t('nav.refresh', 'Refresh'))}</button>` +
    `<button type="button" class="btn" data-nav-action="trip">${ico('bell')} ${escapeHtml(I18n.t('nav.startTrip', 'Start trip'))}</button>` +
    `</div>` +
    (o.offline ? `<p class="navOffline">${ico('alert')} ${escapeHtml(I18n.t('nav.plannedOffline', 'Planned offline: times are estimates.'))}</p>` : '') +
    `<p class="journeyHead">~${o.minutes} min · ${escapeHtml(navMixText(o))}${o.onemapMinutes != null ? ` · OneMap ~${o.onemapMinutes} min` : ''}</p>` +
    farNotes(o).map((t) => `<p class="journeyWarn">${ico('walk')} ${escapeHtml(t)}.</p>`).join('') +
    (nav.when
      ? navTooLate(o)
        ? `<p class="journeyWarn">${ico('alert')} To arrive by ${escapeHtml(When.clock(When.atToMs(nav.when.at)))} you'd have had to leave by ${escapeHtml(When.clock(When.span(nav.when, o.minutes).leave))}.</p>`
        : plannerStatus(`Set off around ${When.clockDay(When.span(nav.when, o.minutes).leave)}, arrive around ${When.clock(When.span(nav.when, o.minutes).arrive)}.`)
      : '');

  // Live timings only when setting off soon enough for them to be the buses you'd catch;
  // otherwise each bus is timed by the clock, from when the router has it boarded.
  const leaveMs = When.span(nav.when, o.minutes).leave;
  // Planned offline (planOnPhone), there are none to fetch.
  const live = !o.offline && (!nav.when || When.liveLead(leaveMs) != null);

  // The stop on the way, between the walk or ride that reaches it and the one that leaves it.
  const viaStep = o.via
    ? `<li class="step stepArrive">${ico('pin')}<span>Stop at <strong>${escapeHtml(viaName(o))}</strong>, around ${escapeHtml(When.clock(leaveMs + o.via.minutes * 60000))}</span></li>`
    : '';
  const legStep = (leg, k, timings) => {
    if (leg.mode === 'walk') {
      const where = k === o.legs.length - 1 ? escapeHtml(nav.to?.label || 'the end') : escapeHtml(wayPlaceName(o, leg.to));
      return `<li class="step stepWalk">${ico('walk')}<div class="walkBody">` +
        `<span>${escapeHtml(I18n.t('nav.walkStep', 'Walk ~{m} m to {to}, ~{min} min', { m: leg.metres, to: '\u0000', min: Math.max(1, Math.round(leg.minutes)) })).replace('\u0000', where)}</span>` +
        walkDirections(o, k) +
        `</div></li>`;
    }
    if (leg.mode === 'train') {
      // Where to stand for the way off the platform, or the change across it (js/mrt-doors.js):
      // no change when it's to the stop on the way.
      const next = o.legs.slice(k + 1, k < o.via?.leg ? o.via.leg : undefined).find((l) => l.mode !== 'walk') || null;
      const doors = doorsPanel(window.MrtDoors?.plan(leg, next), window.MrtDoors?.tip(leg, next), leg.color);
      return `<li class="step stepLeg">` +
        `<div class="legHead">${legChip(leg)}<span>${escapeHtml(leg.name || leg.route)}</span></div>` +
        `<div class="legRide">${escapeHtml(leg.towards
          ? I18n.t('nav.trainRideTowards', 'From {from}, towards {towards}: {n} stops to {to}, ~{min} min', { from: placeName(leg.from), towards: leg.towards, n: leg.stops, to: placeName(leg.to), min: Math.round(leg.minutes) })
          : I18n.t('nav.trainRide', 'From {from}: {n} stops to {to}, ~{min} min', { from: placeName(leg.from), n: leg.stops, to: placeName(leg.to), min: Math.round(leg.minutes) }))}</div>` +
        ((nav.when || o.offline) && leg.board != null ? `<div class="legNote">${escapeHtml(I18n.t('nav.boardAround', 'Board around {time}.', { time: When.clock(leaveMs + leg.board * 60000) }))}</div>` : '') +
        doors +
        (leg.disrupted ? `<div class="legNote legWarn">${ico('alert')} ${escapeHtml(I18n.t('nav.disrupted', 'LTA reports a disruption on this line. Check Service alerts.'))}</div>` : '') +
        `</li>`;
    }
    const t = timings[k];
    const board = (nav.when || o.offline) && leg.board != null
      ? `<div class="legNote">${escapeHtml(I18n.t('nav.boardAroundWait', 'Board around {time}, after an average wait.', { time: When.clock(leaveMs + leg.board * 60000) }))}</div>`
      : '';
    const etas = !live ? board
      : t === undefined ? `${board}<div class="legNote">${escapeHtml(I18n.t('nav.loadingLive', 'Loading live timings…'))}</div>`
      : t && t.length ? `${board}<div class="legEtas">${escapeHtml(I18n.t('nav.nextBus', 'Next {no}:', { no: leg.route }))} ${t.map((ms) => escapeHtml(etaText(ms))).join(' &middot; ')}</div>`
      : `${board}<div class="legNote">${escapeHtml(I18n.t('nav.noLive', 'No live timings for this bus right now.'))}</div>`;
    return `<li class="step stepLeg">` +
      `<div class="legHead">${legChip(leg)}<span>${escapeHtml(leg.stops === 1 ? I18n.t('nav.oneStopMin', '1 stop · ~{min} min', { min: Math.round(leg.minutes) }) : I18n.t('nav.stopsMin', '{n} stops · ~{min} min', { n: leg.stops, min: Math.round(leg.minutes) }))}</span></div>` +
      `<div class="legRide">${escapeHtml(leg.towards
        ? I18n.t('nav.busRideTowards', 'From {from} to {to}, towards {towards}', { from: placeName(leg.from), to: placeName(leg.to), towards: leg.towards })
        : I18n.t('nav.busRide', 'From {from} to {to}', { from: placeName(leg.from), to: placeName(leg.to) }))}</div>` +
      etas +
      (leg.lastBus ? `<div class="legNote legWarn">${ico('alert')} ${escapeHtml(I18n.t('nav.lastBus', 'Last {no} from here today is at {time}. Don’t miss it.', { no: leg.route, time: leg.lastBus }))}</div>` : '') +
      (leg.traffic ? `<button type="button" class="legTraffic" data-nav-traffic="${k}">${ico('alert')}<span>${escapeHtml(trafficText(leg.traffic))} <u>See it on the map</u></span></button>` : '') +
      (leg.from?.code ? `<button type="button" class="iconBtn" data-nav-stop="${escapeHtml(leg.from.code)}" data-nav-bus="${escapeHtml(leg.route)}">${ico('bus')} ${escapeHtml(leg.route)} timings at ${escapeHtml(leg.from.name)}</button>` : '') +
      `</li>` +
      navCrossingSteps(leg);
  };
  const steps = (timings = {}) => o.legs.map((leg, k) => (k === o.via?.leg ? viaStep : '') + legStep(leg, k, timings)).join('');

  let shown = undefined;
  const draw = (timings) => {
    shown = timings;
    body.innerHTML = head + `<ol class="journeySteps">${steps(timings)}</ol>` +
      `<p class="estimateNote">${live
        ? 'Train times are estimates from distance. Bus timings are live from LTA.'
        : o.offline
          ? 'Times are estimates from distance, with an average wait to board. Live bus timings show here when you reconnect.'
          : 'Times are estimates from distance, with an average wait to board. Live bus timings show here from half an hour before you set off.'}</p>`;
  };
  draw();
  // The doors for its train rides, drawn in once they're in, if it's still this way on show.
  if (window.MrtDoors && !MrtDoors.ready() && o.legs.some((l) => l.mode === 'train')) {
    MrtDoors.load().then(() => { if (token === nav.token && nav.option === o && MrtDoors.ready()) draw(shown); });
  }
  if (!live) return;

  const busLegs = o.legs.map((l, k) => [l, k]).filter(([l]) => l.mode === 'bus' && l.from?.code);
  const results = await Promise.allSettled(busLegs.map(([l]) => fetchArrivals(l.from.code, l.route)));
  if (token !== nav.token || nav.option !== o) return;
  const timings = {};
  busLegs.forEach(([l, k], j) => {
    const r = results[j];
    const svc = r.status === 'fulfilled' ? (r.value?.services || []).find((s) => s.serviceNo === l.route) : null;
    timings[k] = svc ? [svc.next, svc.next2, svc.next3].filter((n) => n && n.eta_ms != null).map((n) => n.eta_ms) : null;
  });
  draw(timings);
}

// A bus leg's crossings of the Causeway (/api/nav's `customs`): get off, through both
// checkpoints, on again, with the minutes the way counts for it.
function navCrossingSteps(leg) {
  return (leg.customs || []).map((c) => {
    const [first, second] = c.way === 'out' ? ["Singapore's", "Malaysia's"] : ["Malaysia's", "Singapore's"];
    return `<li class="step stepWalk">${ico('flag')}<span>Get off at ${escapeHtml(stopText(c.from))} and clear ${first} immigration, ` +
      `ride any bus across to ${escapeHtml(stopText(c.to))} and clear ${second}, then get on again: ` +
      `~${c.minutes} min for both${LS.getCustoms() === 'auto' ? ', by the time of day' : ''}.</span></li>`;
  }).join('');
}

// Directions for a walk, from where it starts to where it ends: the start of the nav or the stop
// or station the last ride got off at, to the next one or the end. Like a stop's Directions
// (renderStopTools in script.js), the button opens into the live map (js/map.js) and a link to
// Citymapper.
function walkDirections(o, k) {
  const leg = o.legs[k];
  const from = leg.from || o.legs[k - 1]?.to || nav.from;
  const to = k === o.legs.length - 1 ? nav.to : leg.to;
  if (to?.lat == null || to?.lng == null) return '';
  const dest = { lat: to.lat, lng: to.lng, n: to.label || wayPlaceName(o, to) };
  const opts = { from: from?.lat != null && from?.lng != null ? from : null, walk: true };
  if (!nav.walksOpen.has(k)) {
    return `<button type="button" class="iconBtn" data-nav-walk="${k}">${ico('navigate')} Directions</button>`;
  }
  return `<div class="walkApps">` +
    `<button type="button" class="iconBtn" data-live-map="${escapeHtml(JSON.stringify(dest))}">${ico('map')} Live map</button>` +
    MAP_APPS.map((app) =>
      `<a class="iconBtn" href="${escapeHtml(directionsUrl(dest, app.id, opts))}" target="_blank" rel="noopener noreferrer">${ico('navigate')} ${escapeHtml(app.label)}</a>`
    ).join('') + `</div>`;
}

// ---- Favourite navs ----

const sameNav = (n, from, to) => from && to && coord(n.from) === coord(from) && coord(n.to) === coord(to);

function isFavNav(from, to) {
  return LS.getFavNavs().some((n) => sameNav(n, from, to));
}

// Like a route, a nav and its reverse are two separate favourites. A stop on the way isn't kept
// with one: a saved nav is its two ends, as synced (js/sync.js) and in the bot.
function toggleFavNav(from, to) {
  if (!from || !to) return;
  const navs = LS.getFavNavs();
  if (navs.some((n) => sameNav(n, from, to))) {
    LS.setFavNavs(navs.filter((n) => !sameNav(n, from, to)));
  } else {
    navs.push({ from: { label: from.label, lat: from.lat, lng: from.lng }, to: { label: to.label, lat: to.lat, lng: to.lng } });
    LS.setFavNavs(navs);
  }
  renderFavs();
}

// Save nav and Refresh, in the card's header, once both ends are set.
function renderNavFav() {
  const btn = $('#navFavBtn');
  btn.hidden = !(nav.from && nav.to);
  $('#navRefresh').hidden = btn.hidden;
  if (!btn.hidden) setFavButton(btn, isFavNav(nav.from, nav.to), 'Save nav', 'Saved');
  btn.title = nav.via ? 'Save to favourites: the start and end, not the stop' : 'Save to favourites';
}

// Refresh: the ways planned again, for new disruptions and the time of day, or, with one
// open, its buses' live timings. Shown busy until the answer is in.
async function refreshNav() {
  const btn = $('#navRefresh');
  if (btn.classList.contains('busy')) return;
  btn.classList.add('busy');
  try {
    await (nav.option ? renderNavOption(nav.option) : runNav());
  } finally {
    btn.classList.remove('busy');
  }
}

// ---- Trips, for the Get Off Alert ----

// The trip, from where you set off to where you're going: the walks as legs of their own
// (js/trip.js follows them as it does the rides), from the start to the first stop, between
// rides, and from the last stop to the end. A walk too short to follow (a change within a
// station), or with an end that isn't known, counts towards the ride before it, for a live ETA
// link (js/share.js), or before the first ride, towards the trip, for Your trips (js/history.js).
const WALK_LEG_MIN_M = 60;

// A bus leg's stop codes, one per point: from /api/nav, or for a nav saved before it sent them,
// from the bus's route once it's loaded (js/network.js). Null if neither fits.
function busCodes(l) {
  if (l.codes?.length === l.path.length) return l.codes;
  if (!window.BusNet?.isReady() || l.dir == null || !l.from?.code || !l.to?.code) return null;
  const stops = BusNet.runStops(l.route, l.dir);
  const i = stops.indexOf(l.from.code);
  const j = stops.indexOf(l.to.code, i + 1);
  const codes = i !== -1 && j !== -1 ? stops.slice(i, j + 1) : null;
  return codes?.length === l.path.length ? codes : null;
}

// A way with a stop on the way (`via`) is one trip, its two halves' legs in turn: the walk to
// the stop is named for it, and no time is counted there.
function tripFromNav(o, to, from = nav.from) {
  const legs = [];
  let walkBefore = 0;
  const at = (p) => (p?.lat != null && p?.lng != null ? [Number(p.lat), Number(p.lng)] : null);
  o.legs.forEach((l, k) => {
    if (l.mode === 'walk') {
      const start = at(k === 0 ? from : l.from || o.legs[k - 1]?.to);
      const endPlace = k === o.legs.length - 1 ? to : l.to;
      const end = at(endPlace);
      if (start && end && (l.metres ?? WALK_LEG_MIN_M) >= WALK_LEG_MIN_M) {
        const startName = k === 0 ? from?.label || 'Where you set off' : wayPlaceName(o, l.from || o.legs[k - 1]?.to);
        legs.push({
          kind: 'walk',
          label: I18n.t('trip.walk', 'Walk'),
          to: k === o.legs.length - 1 ? to?.label || placeName(endPlace) : wayPlaceName(o, endPlace),
          points: [start, end],
          names: [startName, k === o.legs.length - 1 ? to?.label || placeName(endPlace) : wayPlaceName(o, endPlace)],
          minutes: Math.max(1, Math.round(l.minutes || 1)),
          wait: 0,
          walkAfter: 0,
        });
      } else if (legs.length) {
        legs[legs.length - 1].walkAfter += l.minutes || 0;
      } else {
        walkBefore += l.minutes || 0;
      }
      return;
    }
    if (!(l.path?.length >= 2)) return;
    legs.push({
      kind: l.mode,
      label: l.mode === 'bus' ? I18n.t('trip.bus', 'Bus {no}', { no: l.route }) : l.lrt ? I18n.t('trip.lrt', '{line} LRT', { line: l.route }) : I18n.t('trip.line', '{line} Line', { line: l.route }),
      to: placeName(l.to),
      points: l.path,
      names: l.mode === 'train' ? (l.names || []).map(stationName) : l.names,
      minutes: l.minutes,
      wait: l.wait,
      walkAfter: 0,
      // For the server to find the bus while the app is in the background.
      // `codes`, each stop's, so the timeline's stops open their timings.
      // `usual`, its minutes without traffic (api/_nav/live.js), for timing it by the traffic.
      ...(l.mode === 'bus' && { service: l.route, board: l.from?.code, alight: l.to?.code, codes: busCodes(l), usual: l.usual }),
      // The line, for Your trips' chips and Trip Modes.
      ...(l.mode === 'train' && { route: l.route, color: l.color, lrt: !!l.lrt }),
    });
  });
  return {
    title: to?.label ? I18n.t('trip.to', 'To {to}', { to: to.label }) : I18n.t('trip.toYourStop', 'To your stop'),
    legs,
    to: to ? { label: to.label, lat: to.lat, lng: to.lng } : null,
    from: from ? { label: from.label, lat: from.lat, lng: from.lng } : null,
    walkBefore,
  };
}
