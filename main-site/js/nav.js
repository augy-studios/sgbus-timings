// Navigate: from any place to any other by bus and train, the site's version of the bot's /nav.
// The journeys come from /api/nav (api/_nav/), which keeps the best for every mix of buses and
// trains; the ends come from /api/places. Bus legs get live timings here, from
// /api/bus-arrivals, and any journey can be started as a trip for the Get Off Alert
// (js/trip.js).
// Loaded before script.js and uses its helpers ($, LS, loadStop, ...), so nothing here runs
// until script.js calls initNav().

// walksOpen: the walks of the open way whose Directions have been opened into map apps.
const nav = { from: null, to: null, options: [], option: null, onemap: false, token: 0, walksOpen: new Set(), walksFor: null };

const NAV_PLACES_DELAY_MS = 300;

function initNav() {
  attachPlaceSearch('from');
  attachPlaceSearch('to');

  $('#navBtn').addEventListener('click', () => {
    if ($('#navSection').hidden) openNav();
    else closeNav();
  });
  $('#navClose').addEventListener('click', closeNav);
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

  $('.navFields').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-here]');
    if (!btn) return;
    const field = btn.dataset.navHere;
    withLocating(btn, () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("This browser can't share its location."));
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(setNavEnd(field, { label: 'Your location', lat: pos.coords.latitude, lng: pos.coords.longitude })),
          (err) => reject(new Error(err.code === 1
            ? 'Location access is turned off for this site. Allow it in your browser to start from where you are.'
            : "Couldn't get your location. Please try again.")),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
      })
    );
  });

  $('#navBody').addEventListener('click', (e) => {
    const option = e.target.closest('[data-nav-option]');
    if (option) {
      nav.option = nav.options[Number(option.dataset.navOption)] || null;
      renderNav();
      $('#navSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (stop) {
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
    } else if (action === 'retry') {
      runNav();
    }
  });
}

// ---- Choosing the ends ----

function attachPlaceSearch(field) {
  const input = $(field === 'from' ? '#navFrom' : '#navTo');
  const box = $(field === 'from' ? '#navFromAc' : '#navToAc');
  let timer = null;
  let token = 0;
  let found = [];

  const render = (places) => {
    found = places;
    if (!places.length) {
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

  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return render([]);
    timer = setTimeout(async () => {
      const mine = ++token;
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        const places = r.ok ? await r.json() : [];
        if (mine === token) render(places);
      } catch {
        if (mine === token) render([]);
      }
    }, NAV_PLACES_DELAY_MS);
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && found[0]) {
      box.hidden = true;
      setNavEnd(field, found[0]);
    }
  });
  box.addEventListener('click', (e) => {
    const item = e.target.closest('[data-place]');
    if (!item) return;
    box.hidden = true;
    setNavEnd(field, found[Number(item.dataset.place)]);
  });
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

function openNav(from = null, to = null, { scroll = true } = {}) {
  if (from) nav.from = from;
  if (to) nav.to = to;
  nav.option = null;
  $('#navSection').hidden = false;
  showEnds();
  if (nav.from && nav.to) runNav();
  else renderNav();
  if (scroll) $('#navSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!nav.from) $('#navFrom').focus({ preventScroll: true });
}

function closeNav() {
  $('#navSection').hidden = true;
  nav.token++;
  if (location.hash.startsWith('#nav/')) history.replaceState(null, '', stopHash() || location.pathname);
}

const coord = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

// "#nav/1.30050,103.85580/1.33320,103.92920", so a nav can be bookmarked or shared.
function navHash() {
  return nav.from && nav.to ? `#nav/${coord(nav.from)}/${coord(nav.to)}` : '';
}

function openNavHash(fromText, toText) {
  const point = (t, label) => {
    const [lat, lng] = t.split(',').map(Number);
    const fav = LS.getFavNavs().find((n) => coord(n.from) === t || coord(n.to) === t);
    const named = fav ? (coord(fav.from) === t ? fav.from.label : fav.to.label) : label;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { label: named, lat, lng } : null;
  };
  const from = point(fromText, 'Start');
  const to = point(toText, 'End');
  if (from && to) openNav(from, to, { scroll: false });
}

// ---- Planning ----

async function runNav() {
  renderNavFav();
  if (!nav.from || !nav.to) {
    renderNav();
    return;
  }
  const token = ++nav.token;
  history.replaceState(null, '', navHash());
  $('#navBody').innerHTML = plannerStatus('Finding journeys by bus and train…');
  try {
    const r = await fetch(`/api/nav?from=${coord(nav.from)}&to=${coord(nav.to)}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (token !== nav.token) return;
    if (!r.ok) throw new Error(data.error || "Couldn't plan that right now.");
    nav.options = data.options || [];
    nav.onemap = !!data.onemap;
    nav.option = null;
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
    body.innerHTML = plannerStatus('Set where you\'re starting and where you\'re going: an address, a building, a postal code, a station, a bus stop, or your location.');
    return;
  }
  if (nav.option) {
    renderNavOption(nav.option);
    return;
  }
  if (!nav.options.length) {
    body.innerHTML = plannerStatus('No way by bus or train was found between these two places. Try somewhere nearby.');
    return;
  }
  body.innerHTML =
    plannerStatus(`${nav.options.length} way${nav.options.length === 1 ? '' : 's'} to get there, quickest first. Every mix of bus and train is listed, not just the fastest.`) +
    `<div class="journeyList">${nav.options.map((o, i) => navOptionItem(o, i)).join('')}</div>` +
    `<p class="estimateNote">Times include walking and an average wait to board, estimated from distance.${nav.onemap ? ' OneMap’s timetable-based estimate is shown where it rides the same way.' : ''}</p>`;
}

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
  return `<button type="button" class="journeyItem${o.disrupted ? ' disrupted' : ''}" data-nav-option="${i}">` +
    `<span class="journeyBuses">${chips}</span>` +
    `<span class="journeyMeta">~${o.minutes} min</span>` +
    `<span class="journeyDetail">${escapeHtml(navMixText(o))}${notes.length ? ` · ${escapeHtml(notes.join(' · '))}` : ''}</span>` +
    (o.disrupted ? `<span class="journeyWarn">${ico('alert')} A line on this journey has a disruption</span>` : '') +
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
    `<p class="journeyHead">~${o.minutes} min · ${escapeHtml(navMixText(o))}${o.onemapMinutes != null ? ` · OneMap ~${o.onemapMinutes} min` : ''}</p>`;

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
        (leg.disrupted ? `<div class="legNote legWarn">${ico('alert')} LTA reports a disruption on this line. Check Service alerts.</div>` : '') +
        `</li>`;
    }
    const t = timings[k];
    const etas = t === undefined ? `<div class="legNote">Loading live timings…</div>`
      : t && t.length ? `<div class="legEtas">Next ${escapeHtml(leg.route)}: ${t.map((ms) => escapeHtml(msToMins(ms))).join(' &middot; ')}</div>`
      : `<div class="legNote">No live timings for this bus right now.</div>`;
    return `<li class="step stepLeg">` +
      `<div class="legHead">${legChip(leg)}<span>${leg.stops} stop${leg.stops === 1 ? '' : 's'} · ~${Math.round(leg.minutes)} min</span></div>` +
      `<div class="legRide">From ${escapeHtml(placeName(leg.from))} to ${escapeHtml(placeName(leg.to))}${leg.towards ? `, towards ${escapeHtml(leg.towards)}` : ''}</div>` +
      etas +
      (leg.from?.code ? `<button type="button" class="iconBtn" data-nav-stop="${escapeHtml(leg.from.code)}" data-nav-bus="${escapeHtml(leg.route)}">${ico('bus')} ${escapeHtml(leg.route)} timings at ${escapeHtml(leg.from.name)}</button>` : '') +
      `</li>`;
  }).join('');

  const draw = (timings) => {
    body.innerHTML = head + `<ol class="journeySteps">${steps(timings)}</ol>` +
      `<p class="estimateNote">Train times are estimates from distance. Bus timings are live from LTA.</p>`;
  };
  draw();

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
  return {
    title: `To ${to?.label || 'your stop'}`,
    legs: o.legs
      .filter((l) => l.mode !== 'walk' && l.path?.length >= 2)
      .map((l) => ({
        kind: l.mode,
        label: l.mode === 'bus' ? `Bus ${l.route}` : `${l.route} ${l.lrt ? 'LRT' : 'Line'}`,
        to: placeName(l.to),
        points: l.path,
        names: l.names,
        minutes: l.minutes,
        wait: l.wait,
        // For the server to find the bus while the app is in the background.
        ...(l.mode === 'bus' && { service: l.route, board: l.from?.code, alight: l.to?.code }),
      })),
  };
}
