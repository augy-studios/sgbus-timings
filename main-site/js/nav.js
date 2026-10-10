// Navigate: from any place to any other by bus and train, the site's version of the bot's /nav.
// The journeys come from /api/nav (api/_nav/), which keeps the best for every mix of buses and
// trains; the ends come from /api/places. Bus legs get live timings here, from
// /api/bus-arrivals, and any journey can be started as a trip for the Get Off Alert
// (js/trip.js).
// Loaded before script.js and uses its helpers ($, LS, loadStop, ...), so nothing here runs
// until script.js calls initNav().

// walksOpen: the walks of the open way whose Directions have been opened into map apps.
// when: the time picked (js/when.js), null for Leave now.
// pickWay: a shared way to open once the ways are in (openNavAt).
const nav = { from: null, to: null, options: [], option: null, onemap: false, when: null, whenPicker: null, token: 0, walksOpen: new Set(), walksFor: null, pickWay: null };

const NAV_PLACES_DELAY_MS = 300;
// A Google Maps link, which /api/places reads for the one place it points at (api/_lib/gmaps.js).
const MAPS_LINK_RE = /maps\.app\.goo\.gl\/|goo\.gl\/maps\/|google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps|maps\.google\./i;

function initNav() {
  attachPlaceSearch($('#navFrom'), $('#navFromAc'), (place) => setNavEnd('from', place));
  attachPlaceSearch($('#navTo'), $('#navToAc'), (place) => setNavEnd('to', place));
  initSavedPlaces();
  nav.whenPicker = When.picker($('#navWhen'), (when) => {
    nav.when = when;
    nav.option = null;
    runNav();
  });

  $('#navBtn').addEventListener('click', () => {
    if ($('#navSection').hidden) openNav();
    else closeNav();
  });
  $('#navClose').addEventListener('click', closeNav);
  wirePanel('navSection', closeNav);
  $('#navSwap').addEventListener('click', () => {
    [nav.from, nav.to] = [nav.to, nav.from];
    showEnds();
    runNav();
  });
  $('#navRefresh').addEventListener('click', refreshNav);
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
    const walk = e.target.closest('[data-nav-walk]');
    if (walk && nav.option) {
      // Swapped in place, so the live timings already shown aren't fetched again.
      nav.walksOpen.add(Number(walk.dataset.navWalk));
      walk.outerHTML = walkDirections(nav.option, Number(walk.dataset.navWalk));
      return;
    }
    const stop = e.target.closest('[data-nav-stop]');
    // The stop's timings and the trip bar are on the page, so Navigate gets out of their way.
    if (stop) {
      closeNav();
      loadStop(stop.dataset.navStop, { service: stop.dataset.navBus, scroll: true });
      return;
    }
    const action = e.target.closest('[data-nav-action]')?.dataset.navAction;
    if (action === 'back') {
      nav.option = null;
      renderNav();
    } else if (action === 'refresh') {
      refreshNav();
    } else if (action === 'trip' && nav.option) {
      Trip.start(tripFromNav(nav.option, nav.to));
      closeNav();
    } else if (action === 'retry') {
      runNav();
    }
  });
}

// ---- Choosing the ends ----

// Place suggestions from /api/places under an input, for Navigate's ends and for Home and Work
// in Settings. `onPick` gets the place picked.
function attachPlaceSearch(input, box, onPick) {
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
    if (link) note('Reading the Google Maps link…');
    timer = setTimeout(async () => {
      const mine = ++token;
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        const data = await r.json().catch(() => null);
        if (mine !== token) return;
        if (link && !r.ok) return note(data?.error || "Couldn't read that Google Maps link. Please try again.");
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
        else render([]);
      }
    }, link ? 0 : NAV_PLACES_DELAY_MS);
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
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
}

// ---- Home and Work ----

const SAVED_PLACES = { home: 'Home', work: 'Work' };

// Set in Settings with the same search as Navigate's ends, and offered by the Home and Work
// buttons under each end of Navigate and the route planner.
function initSavedPlaces() {
  for (const [kind, name] of Object.entries(SAVED_PLACES)) {
    const input = $(`#set${name}`);
    attachPlaceSearch(input, $(`#set${name}Ac`), (place) => {
      LS.setPlace(kind, { label: place.label, lat: place.lat, lng: place.lng, ...(place.kind === 'stop' && place.code && { stop: place.code }) });
      input.blur();
      showSavedPlaces();
    });
    // Typing without picking anything leaves the place as it was.
    input.addEventListener('blur', () => setTimeout(showSavedPlaces, 200));
    $(`#clear${name}`).addEventListener('click', () => {
      LS.setPlace(kind, null);
      showSavedPlaces();
    });
  }
  showSavedPlaces();
}

// Settings' fields and the buttons' tooltips, as Home and Work are now.
function showSavedPlaces() {
  for (const [kind, name] of Object.entries(SAVED_PLACES)) {
    const place = LS.getPlace(kind);
    const input = $(`#set${name}`);
    if (document.activeElement !== input) input.value = place?.label || '';
    $(`#clear${name}`).hidden = !place;
    for (const btn of $$(`[data-saved-place="${kind}"]`)) {
      btn.title = place ? `${name}: ${place.label}` : `Set your ${name.toLowerCase()} in Settings`;
      btn.classList.toggle('unset', !place);
    }
  }
}

// Home or Work handed to `use`, or, while it isn't set, Settings opened at its field.
function useSavedPlace(kind, use) {
  const place = LS.getPlace(kind);
  if (place) return use(place);
  openSettings();
  const input = $(`#set${SAVED_PLACES[kind]}`);
  input.scrollIntoView({ block: 'center' });
  input.focus({ preventScroll: true });
}

const HERE_LABEL = 'Your location';

// An end set to where you are, by its pin button, which shows it's working meanwhile.
function locateNavEnd(field) {
  return withLocating($(`[data-nav-here="${field}"]`), () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("This browser can't share its location."));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(setNavEnd(field, { label: HERE_LABEL, lat: pos.coords.latitude, lng: pos.coords.longitude })),
        (err) => reject(new Error(err.code === 1
          ? 'Location access is turned off for this site. Allow it in your browser to start from where you are.'
          : "Couldn't get your location. Please try again.")),
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

function showEnds() {
  $('#navFrom').value = nav.from?.label || '';
  $('#navTo').value = nav.to?.label || '';
}

// ---- Opening and closing ----

// Opens over the page (a .panelModal, js/ui.js), at Leave now unless it's given a time: one
// picked before isn't kept.
function openNav(from = null, to = null, { when = null, focus = true } = {}) {
  if (from) nav.from = from;
  if (to) nav.to = to;
  nav.option = null;
  nav.when = when;
  nav.whenPicker.set(when);
  showPanel('navSection', true);
  showEnds();
  if (nav.from && nav.to) runNav();
  else renderNav();
  if (!nav.from && focus) $('#navFrom').focus({ preventScroll: true });
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

const coord = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

// The nav as a link, for the address bar and Share: "#nav/1.30050,103.85580~Bedok%20Mall/here",
// with "/arrive/2026-10-09T08:30" on the end for a picked time. Each end is its point and name;
// "here" for Your location, so whoever opens the link starts or ends where they are; or "-"
// while it isn't set. Just "#nav" with nothing set at all.
function navHash() {
  const end = (p) => {
    if (!p) return '-';
    if (p.label === HERE_LABEL) return 'here';
    // The name escaped further than encodeURIComponent goes, so "~" only ever starts it and a
    // closing bracket doesn't end the link where it's pasted.
    return `${coord(p)}~${encodeURIComponent(p.label).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
  };
  return nav.from || nav.to || nav.when ? `#nav/${end(nav.from)}/${end(nav.to)}${When.hashPart(nav.when)}` : '#nav';
}

// Opens a nav link (navHash). A link from before ends carried names takes a saved nav's
// names for its points, or Start and End.
function openNavHash(fromText, toText, when = null) {
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
  openNavAt(fromText === 'here' ? 'here' : point(fromText, 'Start'), toText === 'here' ? 'here' : point(toText, 'End'), when);
}

// Opens Navigate at two ends, from a link: each a place, null for not set, or "here" for
// wherever the person opening it is. `way` (wayKey) is the way to open once they're planned,
// if it's still among them.
function openNavAt(from, to, when = null, way = null) {
  nav.from = from === 'here' ? null : from;
  nav.to = to === 'here' ? null : to;
  nav.pickWay = way;
  // Not the keyboard up over From while it's finding where you are.
  openNav(nav.from, nav.to, { when, focus: from !== 'here' });
  if (from === 'here') locateNavEnd('from');
  if (to === 'here') locateNavEnd('to');
}

// A way, as it's told apart from the others: its rides and where each is boarded.
const wayKey = (o) => (o.walkOnly ? 'walk' : o.legs.filter((l) => l.mode !== 'walk').map((l) => `${l.mode}:${l.route}@${l.from?.code || l.from?.name || ''}`).join('>'));

// ---- Planning ----

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
  $('#navBody').innerHTML = plannerStatus('Finding journeys by bus and train…');
  try {
    const at = when ? `&when=${when.mode}&at=${encodeURIComponent(when.at)}` : '';
    const r = await fetch(`/api/nav?from=${coord(nav.from)}&to=${coord(nav.to)}${at}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (token !== nav.token) return;
    if (!r.ok) throw new Error(data.error || "Couldn't plan that right now.");
    nav.options = data.options || [];
    nav.onemap = !!data.onemap;
    // A shared way (openNavAt) opens once, if it's still one of the ways.
    nav.option = nav.pickWay ? nav.options.find((o) => wayKey(o) === nav.pickWay) || null : null;
    nav.pickWay = null;
    renderNav();
  } catch (e) {
    if (token !== nav.token) return;
    $('#navBody').innerHTML = plannerStatus(e.message || "Couldn't plan that right now.") +
      `<button type="button" class="iconBtn" data-nav-action="retry">Try again</button>`;
  }
}

function renderNav() {
  const body = $('#navBody');
  renderNavFav();
  if (!nav.from || !nav.to) {
    body.innerHTML = plannerStatus('Set where you\'re starting and where you\'re going: an address, a building, a postal code, a station, a bus stop, a Google Maps link, or your location.');
    return;
  }
  if (nav.option) {
    renderNavOption(nav.option);
    return;
  }
  if (!nav.options.length) {
    body.innerHTML = plannerStatus(`No way by bus or train running ${nav.when ? 'at that time' : 'right now'} was found between these two places. Try another time, or somewhere nearby.`);
    return;
  }
  body.innerHTML =
    plannerStatus(`${nav.options.length} way${nav.options.length === 1 ? '' : 's'} to get there${nav.when ? `, ${When.describe(nav.when).replace(/^\w/, (c) => c.toLowerCase())}` : ''}, quickest first. Every mix of bus and train is listed, not just the fastest.`) +
    `<div class="journeyList">${nav.options.map((o, i) => navOptionItem(o, i)).join('')}</div>` +
    `<p class="estimateNote">Times include walking and an average wait to board, estimated from distance. Only buses and trains running at the time are used, going by first and last bus times and train hours.${nav.onemap ? ' OneMap’s timetable-based estimate is shown where it rides the same way.' : ''}</p>`;
}

// "08:12 → 08:50" for a way, by the time picked.
const navClocks = (o) => {
  const { leave, arrive } = When.span(nav.when, o.minutes);
  return `${When.clock(leave)} → ${When.clock(arrive)}`;
};

// For Arrive by: a way you'd have had to set off on already.
const navTooLate = (o) => nav.when?.mode === 'arrive' && When.span(nav.when, o.minutes).leave < Date.now() - 60000;

function legChip(leg) {
  if (leg.mode === 'bus') return `<span class="busChip">${ico('bus')} ${escapeHtml(leg.route)}</span>`;
  const dot = leg.color ? `<span class="lineDot" style="--line:${escapeHtml(leg.color)}"></span>` : '';
  return `<span class="busChip lineChip">${dot}${escapeHtml(leg.route)}</span>`;
}

function walkMetres(o) {
  return o.legs.filter((l) => l.mode === 'walk').reduce((sum, l) => sum + (l.metres || 0), 0);
}

function navMixText(o) {
  if (o.walkOnly) return 'Walk all the way';
  const rides = o.legs.filter((l) => l.mode !== 'walk');
  const changes = rides.length - 1;
  return `${changes === 0 ? 'No change' : `${changes} change${changes === 1 ? '' : 's'}`} · ${formatDistance(walkMetres(o))} walk`;
}

function navOptionItem(o, i) {
  const rides = o.legs.filter((l) => l.mode !== 'walk');
  const chips = o.walkOnly ? `<span class="busChip">${ico('walk')} Walk</span>` : rides.map(legChip).join(legArrow);
  const notes = [];
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
    (navTooLate(o) ? `<span class="journeyWarn">${ico('alert')} Too late: you'd have had to leave by ${escapeHtml(When.clock(When.span(nav.when, o.minutes).leave))}</span>` : '') +
    `</button>`;
}

const placeName = (p) => (p?.kind === 'station' ? `${p.name} station` : p?.name ? `${p.name}${p.code && p.kind === 'stop' ? ` (${p.code})` : ''}` : '');

async function renderNavOption(o) {
  const body = $('#navBody');
  const token = nav.token;
  if (nav.walksFor !== o) {
    nav.walksFor = o;
    nav.walksOpen = new Set();
  }
  const head =
    `<div class="plannerNav">` +
    `<button type="button" class="iconBtn" data-nav-action="back">${ico('back')} All ways</button>` +
    // Here as well as in the card's header, which has scrolled away by the time you're
    // reading a way on a phone; the route planner has its Refresh in the same place.
    `<button type="button" class="iconBtn" data-nav-action="refresh">Refresh</button>` +
    `<button type="button" class="btn" data-nav-action="trip">${ico('bell')} Start trip</button>` +
    `</div>` +
    `<p class="journeyHead">~${o.minutes} min · ${escapeHtml(navMixText(o))}${o.onemapMinutes != null ? ` · OneMap ~${o.onemapMinutes} min` : ''}</p>` +
    (nav.when
      ? navTooLate(o)
        ? `<p class="journeyWarn">${ico('alert')} To arrive by ${escapeHtml(When.clock(When.atToMs(nav.when.at)))} you'd have had to leave by ${escapeHtml(When.clock(When.span(nav.when, o.minutes).leave))}.</p>`
        : plannerStatus(`Set off around ${When.clockDay(When.span(nav.when, o.minutes).leave)}, arrive around ${When.clock(When.span(nav.when, o.minutes).arrive)}.`)
      : '');

  // Live timings only when setting off soon enough for them to be the buses you'd catch;
  // otherwise each bus is timed by the clock, from when the router has it boarded.
  const leaveMs = When.span(nav.when, o.minutes).leave;
  const live = !nav.when || When.liveLead(leaveMs) != null;

  const steps = (timings = {}) => o.legs.map((leg, k) => {
    if (leg.mode === 'walk') {
      const where = k === o.legs.length - 1 ? escapeHtml(nav.to?.label || 'the end') : escapeHtml(placeName(leg.to));
      return `<li class="step stepWalk">${ico('walk')}<div class="walkBody">` +
        `<span>Walk ~${leg.metres} m to ${where}, ~${Math.max(1, Math.round(leg.minutes))} min</span>` +
        walkDirections(o, k) +
        `</div></li>`;
    }
    if (leg.mode === 'train') {
      return `<li class="step stepLeg">` +
        `<div class="legHead">${legChip(leg)}<span>${escapeHtml(leg.name || leg.route)}</span></div>` +
        `<div class="legRide">From ${escapeHtml(placeName(leg.from))}${leg.towards ? `, towards ${escapeHtml(leg.towards)}` : ''}: ${leg.stops} stop${leg.stops === 1 ? '' : 's'} to ${escapeHtml(placeName(leg.to))}, ~${Math.round(leg.minutes)} min</div>` +
        (nav.when && leg.board != null ? `<div class="legNote">Board around ${escapeHtml(When.clock(leaveMs + leg.board * 60000))}.</div>` : '') +
        (leg.disrupted ? `<div class="legNote legWarn">${ico('alert')} LTA reports a disruption on this line. Check Service alerts.</div>` : '') +
        `</li>`;
    }
    const t = timings[k];
    const board = nav.when && leg.board != null
      ? `<div class="legNote">Board around ${escapeHtml(When.clock(leaveMs + leg.board * 60000))}, after an average wait.</div>`
      : '';
    const etas = !live ? board
      : t === undefined ? `${board}<div class="legNote">Loading live timings…</div>`
      : t && t.length ? `${board}<div class="legEtas">Next ${escapeHtml(leg.route)}: ${t.map((ms) => escapeHtml(msToMins(ms))).join(' &middot; ')}</div>`
      : `${board}<div class="legNote">No live timings for this bus right now.</div>`;
    return `<li class="step stepLeg">` +
      `<div class="legHead">${legChip(leg)}<span>${leg.stops} stop${leg.stops === 1 ? '' : 's'} · ~${Math.round(leg.minutes)} min</span></div>` +
      `<div class="legRide">From ${escapeHtml(placeName(leg.from))} to ${escapeHtml(placeName(leg.to))}${leg.towards ? `, towards ${escapeHtml(leg.towards)}` : ''}</div>` +
      etas +
      (leg.from?.code ? `<button type="button" class="iconBtn" data-nav-stop="${escapeHtml(leg.from.code)}" data-nav-bus="${escapeHtml(leg.route)}">${ico('bus')} ${escapeHtml(leg.route)} timings at ${escapeHtml(leg.from.name)}</button>` : '') +
      `</li>`;
  }).join('');

  const draw = (timings) => {
    body.innerHTML = head + `<ol class="journeySteps">${steps(timings)}</ol>` +
      `<p class="estimateNote">${live
        ? 'Train times are estimates from distance. Bus timings are live from LTA.'
        : 'Times are estimates from distance, with an average wait to board. Live bus timings show here from half an hour before you set off.'}</p>`;
  };
  draw();
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

// Directions for a walk in a map app, from where it starts to where it ends: the start of the
// nav or the stop or station the last ride got off at, to the next one or the end. Like a
// stop's Directions (renderStopTools in script.js), the button opens into a link per app.
function walkDirections(o, k) {
  const leg = o.legs[k];
  const from = leg.from || o.legs[k - 1]?.to || nav.from;
  const to = k === o.legs.length - 1 ? nav.to : leg.to;
  if (to?.lat == null || to?.lng == null) return '';
  const dest = { lat: to.lat, lng: to.lng, n: to.label || placeName(to) };
  const opts = { from: from?.lat != null && from?.lng != null ? from : null, walk: true };
  if (!nav.walksOpen.has(k)) {
    return `<button type="button" class="iconBtn" data-nav-walk="${k}">${ico('navigate')} Directions</button>`;
  }
  return `<div class="walkApps">` + MAP_APPS.map((app) =>
    `<a class="iconBtn" href="${escapeHtml(directionsUrl(dest, app.id, opts))}" target="_blank" rel="noopener noreferrer">${ico('navigate')} ${escapeHtml(app.label)}</a>`
  ).join('') + `</div>`;
}

// ---- Favourite navs ----

const sameNav = (n, from, to) => from && to && coord(n.from) === coord(from) && coord(n.to) === coord(to);

function isFavNav(from, to) {
  return LS.getFavNavs().some((n) => sameNav(n, from, to));
}

// Like a route, a nav and its reverse are two separate favourites.
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

function tripFromNav(o, to) {
  const legs = [];
  for (const l of o.legs) {
    // A walk counts towards the ride before it, for a live ETA link (js/share.js).
    if (l.mode === 'walk') {
      if (legs.length) legs[legs.length - 1].walkAfter += l.minutes || 0;
      continue;
    }
    if (!(l.path?.length >= 2)) continue;
    legs.push({
      kind: l.mode,
      label: l.mode === 'bus' ? `Bus ${l.route}` : `${l.route} ${l.lrt ? 'LRT' : 'Line'}`,
      to: placeName(l.to),
      points: l.path,
      names: l.names,
      minutes: l.minutes,
      wait: l.wait,
      walkAfter: 0,
      // For the server to find the bus while the app is in the background.
      ...(l.mode === 'bus' && { service: l.route, board: l.from?.code, alight: l.to?.code }),
    });
  }
  return {
    title: `To ${to?.label || 'your stop'}`,
    legs,
    to: to ? { label: to.label, lat: to.lat, lng: to.lng } : null,
  };
}
