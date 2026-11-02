// The route planner: pick a start and an end stop and see every bus that links them without
// a change, or, when none does, the quickest journeys with a short walk or a change of bus,
// each openable leg by leg with live timings. Ported from the Telegram bot's /route
// (route_view.py and journey_view.py).
// Loaded before script.js and uses its helpers ($, LS, loadStop, ...), so nothing here runs
// until script.js calls initPlanner().

// `sideFix` is the route with the stops across the road swapped in, while the planner is
// suggesting one. `when` is the time picked (js/when.js), null for Leave now.
const planner = { start: null, end: null, journey: null, journeys: [], sideFix: null, when: null, whenPicker: null, token: 0 };

// The time to plan for, as Journeys takes it: Leave now is leaving at this moment.
const plannerTiming = () => ({ mode: planner.when?.mode || 'leave', ms: planner.when ? When.atToMs(planner.when.at) : Date.now() });

// Minutes to clear immigration across the Causeway, each way (BusNet.customs): Settings' own
// Immigration time, or by when you'd cross (When.customsMin), taken as about 45 minutes after
// setting off, or before arriving by. Rough, as the rush hours it reads are an hour wide.
const CROSS_AFTER_MIN = 45;
function customsFor(timing) {
  const own = LS.getCustoms();
  const crossMs = timing.ms + (timing.mode === 'arrive' ? -1 : 1) * CROSS_AFTER_MIN * 60000;
  const pick = (way) => (own === 'auto' ? When.customsMin(way, crossMs) : Number(own));
  return { out: pick('out'), in: pick('in') };
}

// Under a journey that crosses the Causeway: get off, through both checkpoints, on again.
function crossingSteps(leg) {
  return Journeys.legCrossings(leg).map((c) => {
    const v = { from: stopText(c.from), to: stopText(c.to), m: c.minutes, byTime: LS.getCustoms() === 'auto' ? I18n.t('planner.byTimeOfDay', ', by the time of day') : '' };
    return `<li class="step stepWalk">${ico('flag')}<span>${escapeHtml(c.way === 'out'
      ? I18n.t("planner.crossOut", "Get off at {from} and clear Singapore's immigration, ride any bus across to {to} and clear Malaysia's, then get on again: ~{m} min for both{byTime}.", { ...v })
      : I18n.t("planner.crossIn", "Get off at {from} and clear Malaysia's immigration, ride any bus across to {to} and clear Singapore's, then get on again: ~{m} min for both{byTime}.", { ...v }))}</span></li>`;
  });
}

function initPlanner() {
  // A new time keeps an open journey open, timed again for it.
  planner.whenPicker = When.picker($('#routeWhen'), (when) => {
    planner.when = when;
    renderPlanner();
  });

  for (const [field, input, box] of [['start', '#routeStart', '#routeStartAc'], ['end', '#routeEnd', '#routeEndAc']]) {
    // Each pick is kept as a past search (js/recents.js), shown when the box is tapped into.
    const onStop = (code) => {
      Recents.add(Recents.stopItem(code));
      setPlannerEnd(field, code);
    };
    const onPostal = (code) => {
      Recents.add(Recents.postalItem(code));
      postalStops(code)
        .then(({ title, stops }) => offerNearbyEnd(field, title, stops))
        .catch((e) => alert(e.message));
    };
    attachAutocomplete($(input), $(box), {
      onStop,
      directFor: (code) => directBuses(field, code),
      directNote: (count) =>
        (count === 1 ? I18n.t('planner.directOne', 'One has a bus {way}, listed first.', { way: directWay(field) }) : I18n.t('planner.directMany', '{n} have a bus {way}, listed first.', { n: count, way: directWay(field) })),
      onPostal,
    });
    Recents.attach($(input), $(box), {
      accepts: (r) => r.kind === 'postal' || (r.kind === 'stop' && !!r.code),
      saved: 'places',
      onPick: (r) => (r.kind === 'saved' ? planFromSaved(field, r.place) : r.kind === 'postal' ? onPostal(r.code) : onStop(r.code)),
    });
  }
  // A set end reads "Name (code)"; selecting it on focus means typing replaces it outright.
  for (const input of [$('#routeStart'), $('#routeEnd')]) input.addEventListener('focus', () => input.select());

  $('#routeSwap').addEventListener('click', () => {
    [planner.start, planner.end] = [planner.end, planner.start];
    planner.journey = null;
    renderPlanner();
  });
  $('#plannerClose').addEventListener('click', closePlanner);
  wirePanel('plannerSection', closePlanner);
  $('#routeFavBtn').addEventListener('click', () => {
    toggleFavRoute(planner.start, planner.end);
    renderPlanner();
  });
  // The route as a link, with either end left "-" while it isn't set, as the URL comment in
  // script.js reads them.
  $('#routeShare').addEventListener('click', (e) => {
    const { start, end, when } = planner;
    const hash = start || end || when ? `#route/${start || '-'}/${end || '-'}${When.hashPart(when)}` : '#route';
    const title = start && end ? I18n.t('planner.fromTo', '{from} to {to}', { from: nameOf(start) || start, to: nameOf(end) || end })
      : end ? I18n.t('trip.to', 'To {to}', { to: nameOf(end) || end })
      : start ? I18n.t('route.from', 'From {stop}', { stop: nameOf(start) || start })
      : I18n.t('planner.shareTitle', 'Navigate by bus only');
    shareLink(e.currentTarget, `${location.origin}/${hash}`, title);
  });

  // Scoped to the planner: Navigate's fields share the class, and come first on the page.
  $('#plannerSection .plannerFields').addEventListener('click', (e) => {
    const saved = e.target.closest('[data-saved-place]');
    if (saved) {
      useSavedPlace(saved.dataset.savedPlace, (place) => planFromSaved(saved.dataset.savedFor, place, saved));
      return;
    }
    const btn = e.target.closest('[data-near-for]');
    if (!btn) return;
    const field = btn.dataset.nearFor;
    withLocating(btn, () =>
      findNearbyStops().then((stops) => offerNearbyEnd(field, field === 'start' ? I18n.t('planner.nearYouStart', 'Stops near you: pick the start') : I18n.t('planner.nearYouEnd', 'Stops near you: pick the end'), stops))
    );
  });

  // A stop's timings and the trip bar are on the page, so the planner gets out of their way;
  // the stop's Back reopens it where it was.
  $('#plannerBody').addEventListener('click', (e) => {
    const bus = e.target.closest('[data-route-bus]');
    if (bus) {
      closePlanner();
      loadStop(planner.start, {
        service: bus.dataset.routeBus,
        ctx: { kind: 'route', start: planner.start, end: planner.end, when: planner.when },
        scroll: true,
      });
      return;
    }
    const journey = e.target.closest('[data-journey]');
    if (journey) {
      planner.journey = planner.journeys[Number(journey.dataset.journey)] || null;
      renderPlanner();
      return;
    }
    const leg = e.target.closest('[data-leg]');
    if (leg) {
      const legs = planner.journey;
      const picked = legs[Number(leg.dataset.leg)];
      closePlanner();
      loadStop(picked.from, {
        service: picked.bus,
        ctx: { kind: 'journey', start: planner.start, end: planner.end, legs, when: planner.when },
        scroll: true,
      });
      return;
    }
    const action = e.target.closest('[data-planner]')?.dataset.planner;
    if (action === 'back') {
      planner.journey = null;
      renderPlanner();
    } else if (action === 'side-fix' && planner.sideFix) {
      ({ start: planner.start, end: planner.end } = planner.sideFix);
      planner.journey = null;
      renderPlanner();
    } else if (action === 'refresh') {
      renderPlanner();
    } else if (action === 'trip' && planner.journey) {
      // The Get Off Alert (js/trip.js), two stops before each change and the end.
      Trip.start({
        title: I18n.t('trip.to', 'To {to}', { to: nameOf(planner.end) || planner.end }),
        legs: planner.journey.map((leg) => {
          const stops = BusNet.runStops(leg.bus, leg.dir);
          const i = stops.indexOf(leg.from);
          const j = stops.indexOf(leg.to, i + 1);
          return tripLegForBus(leg.bus, stops.slice(i, j + 1), leg.to);
        }),
        // This journey, for the timeline's Back to Navigate (openTripOrigin, js/nav.js).
        origin: { kind: 'route', start: planner.start, end: planner.end, journey: planner.journey, when: planner.when },
      });
      closePlanner();
    }
  });
}

// Journeys with a change, and the wrong-side-of-the-road fixes for them, found in
// js/planner-worker.js so the page keeps scrolling while it searches. Where a worker can't
// start, or fails, the same search runs here instead, after the status has painted.
let plannerWorker = null;
let workerFailed = false;
let workerSeq = 0;
const workerWaiting = new Map();

function searchHere(start, end, timing) {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
    const journeys = Journeys.findJourneys(start, end, undefined, timing);
    return { journeys, fixes: journeys.length ? Journeys.wrongSideEnds(start, end) : {} };
  });
}

function searchJourneys(start, end, timing) {
  if (workerFailed || typeof Worker === 'undefined') return searchHere(start, end, timing);
  let first = false;
  if (!plannerWorker) {
    try {
      plannerWorker = new Worker('/js/planner-worker.js');
    } catch {
      workerFailed = true;
      return searchHere(start, end, timing);
    }
    first = true;
    plannerWorker.onmessage = ({ data }) => {
      const waiting = workerWaiting.get(data.id);
      workerWaiting.delete(data.id);
      if (!waiting) return;
      if (data.error) waiting.fallback();
      else waiting.resolve({ journeys: data.journeys, fixes: data.fixes });
    };
    plannerWorker.onerror = () => {
      workerFailed = true;
      for (const waiting of workerWaiting.values()) waiting.fallback();
      workerWaiting.clear();
    };
  }
  const id = ++workerSeq;
  return new Promise((resolve) => {
    workerWaiting.set(id, { resolve, fallback: () => searchHere(start, end, timing).then(resolve) });
    const open = BusNet.openAccess();
    const customs = { ...BusNet.customs };
    plannerWorker.postMessage(first ? { id, start, end, timing, open, customs, stops: stopsIndex } : { id, start, end, timing, open, customs });
  });
}

// Opens over the page (a .panelModal, js/ui.js), at Leave now unless it's given a time: one
// picked before isn't kept.
function openPlanner(start = null, end = null, { journey = null, when = null } = {}) {
  planner.start = start;
  planner.end = end;
  planner.journey = journey;
  planner.when = when;
  planner.whenPicker.set(when);
  showPanel('plannerSection', true);
  renderPlanner();
  if (!start) Recents.quietFocus($('#routeStart'));
}

function closePlanner() {
  showPanel('plannerSection', false);
  planner.token++;
  if (location.hash.startsWith('#route/')) history.replaceState(null, '', stopHash() || location.pathname);
}

// The stops near a place, to fill one end of the route in: nearest first rather than pinned,
// the whole point of answering with a place. With the other end already set, the stops a bus
// runs straight to it from (or from it to, when picking the end) go first, each naming those
// buses. Ported from _offer_nearby in the bot's handlers/newroute.py.
// The end of the route that's already set, opposite the one being filled in.
const otherEnd = (field) => (field === 'start' ? planner.end : planner.start);

// The buses that run straight between a stop and the other end, heading the right way: from
// the stop to the end when picking the start, from the start to the stop when picking the
// end. Null when there are none, the other end isn't set, or the routes aren't in yet.
function directBuses(field, code) {
  const other = otherEnd(field);
  if (!other || code === other || !BusNet.isReady()) return null;
  const buses = field === 'start' ? Journeys.directServices(code, other) : Journeys.directServices(other, code);
  return buses.length ? buses : null;
}

const directWay = (field) => (field === 'start' ? I18n.t('planner.straightTo', 'straight to {stop}', { stop: nameOf(otherEnd(field)) || otherEnd(field) }) : I18n.t('planner.straightFrom', 'straight from {stop}', { stop: nameOf(otherEnd(field)) || otherEnd(field) }));

async function offerNearbyEnd(field, title, stops) {
  const other = otherEnd(field);
  let direct = null;
  let note = '';
  if (other) {
    try {
      await BusNet.load(stopsIndex);
      direct = new Map();
      for (const s of stops) {
        const buses = directBuses(field, s.code);
        if (buses) direct.set(s.code, buses);
      }
      note = direct.size
        ? (direct.size === 1 ? I18n.t('planner.theseOne', 'One of these has a bus {way}, listed first.', { way: directWay(field) }) : I18n.t('planner.theseMany', '{n} of these have a bus {way}, listed first.', { n: direct.size, way: directWay(field) }))
        : I18n.t('planner.theseNone', 'None of these has a bus {way}, so the planner will look for journeys with a change.', { way: directWay(field) });
    } catch (e) {
      // Without the routes the list still works, just unmarked.
      console.warn('Bus routes failed:', e);
      direct = null;
    }
  }
  openStopList(title, stops, { pin: false, onPick: (code) => setPlannerEnd(field, code), direct, note });
}

// A saved place (js/places.js) as one end: the stop itself when it's a bus stop, otherwise the
// stops near it to pick from, as for the pin. `btn`, if it came from one, shows it's working.
function planFromSaved(field, place, btn = null) {
  if (place.stop) return setPlannerEnd(field, place.stop);
  const offer = () =>
    ensureStopsIndex().then(() => offerNearbyEnd(field, field === 'start' ? I18n.t('planner.nearPlaceStart', 'Stops near {place}: pick the start', { place: place.name }) : I18n.t('planner.nearPlaceEnd', 'Stops near {place}: pick the end', { place: place.name }), stopsNear(place.lat, place.lng)));
  return btn ? withLocating(btn, offer) : offer().catch((e) => alert(e.message));
}

function setPlannerEnd(field, code) {
  planner[field] = code;
  planner.journey = null;
  renderPlanner();
  // Two answers and done: the end is asked for next while it's still empty.
  if (field === 'start' && !planner.end) $('#routeEnd').focus({ preventScroll: true });
}

// ---- Favourite routes ----

function isFavRoute(start, end) {
  return LS.getFavRoutes().some((r) => r.start === start && r.end === end);
}

// A route and its reverse are two separate favourites: the start decides which stop a bus
// opens at. Each end's name is kept as it reads now, for a stop that later leaves the cache.
function toggleFavRoute(start, end) {
  const routes = LS.getFavRoutes();
  if (routes.some((r) => r.start === start && r.end === end)) {
    LS.setFavRoutes(routes.filter((r) => !(r.start === start && r.end === end)));
  } else {
    routes.push({ start, startName: nameOf(start) || start, end, endName: nameOf(end) || end });
    LS.setFavRoutes(routes);
  }
  renderFavs();
}

// ---- Rendering ----

function stopText(code) {
  const name = nameOf(code);
  return name ? `${name} (${code})` : code;
}

const changesText = (n) => (n === 1 ? I18n.t('planner.oneChange', '1 change') : I18n.t('planner.changes', '{n} changes', { n }));
const stopsText = (n) => (n === 1 ? I18n.t('planner.oneStop', '1 stop') : I18n.t('planner.stops', '{n} stops', { n }));
const minutesText = (min) => (min != null ? I18n.t('planner.aboutMin', '~{m} min', { m: Math.round(min) }) : I18n.t('planner.timeUnknown', 'time unknown'));
const plannerStatus = (text) => `<p class="plannerStatus">${escapeHtml(text)}</p>`;
const busChip = (no) => `<span class="busChip">${escapeHtml(no)}</span>`;
const legArrow = '<span class="legArrow" aria-hidden="true">&rarr;</span>';

function sgClock(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60000).toLocaleTimeString(I18n.lang() === 'en' ? 'en-GB' : I18n.lang(), {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "21", "21 and 25", "21, 25 and 960".
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')}${I18n.t('trip.and', ' and ')}${items[items.length - 1]}` : items[0] || '');

// "a to b", or just "a" when the two read the same.
const clockRange = (a, b) => (When.clock(a) === When.clock(b) ? When.clock(a) : I18n.t('planner.clockRange', '{a} to {b}', { a: When.clock(a), b: When.clock(b) }));

// When to set off or get in on the buses straight between the stops, for a picked time.
function directClockText(running, when) {
  const ms = When.atToMs(when.at);
  const totals = running.map((r) => (r.minutes + When.BUS_WAIT_MIN) * 60000);
  const quickest = Math.min(...totals);
  const slowest = Math.max(...totals);
  if (when.mode === 'leave') return I18n.t("planner.leaveAt", "Leave at {time} and you'd get in around {range}, counting an average wait for the bus.", { time: When.clockDay(ms), range: clockRange(ms + quickest, ms + slowest) });
  if (ms - quickest < Date.now()) return I18n.t("planner.tooLate", "To arrive by {time} you'd have had to leave by about {leave}.", { time: When.clock(ms), leave: When.clock(ms - quickest) });
  return I18n.t('planner.arriveBy', 'To arrive by {time}, leave around {range}, counting an average wait for the bus.', { time: When.clockDay(ms), range: clockRange(ms - slowest, ms - quickest) });
}

// A line per end of the route picked on the wrong side of the road, naming the stop across
// the road that the buses really use, and a button to swap it in.
function sideFixHtml(fixes) {
  const lines = ['start', 'end']
    .filter((field) => fixes[field])
    .map((field) => {
      const { code, metres } = fixes[field];
      const v = { stop: stopText(code), m: Math.round(metres) };
      return `<p><strong>${escapeHtml(I18n.t('planner.wrongSide', 'Wrong side of the road?'))}</strong> ${escapeHtml(field === 'start'
        ? I18n.t('planner.wrongSideStart', 'The quickest buses for this trip leave from {stop}, across the road from your start, ~{m} m away.', { ...v })
        : I18n.t('planner.wrongSideEnd', 'The quickest buses for this trip stop at {stop}, across the road from your end, ~{m} m away.', { ...v }))}</p>`;
    });
  const only = fixes.start || fixes.end;
  const label = fixes.start && fixes.end ? I18n.t('planner.useAcross', 'Use the stops across the road') : I18n.t('planner.useInstead', 'Use {stop} instead', { stop: nameOf(only.code) || only.code });
  return (
    `<div class="sideHint">${lines.join('')}` +
    `<button type="button" class="iconBtn" data-planner="side-fix">${ico('swap')} ${escapeHtml(label)}</button></div>`
  );
}

async function renderPlanner() {
  const { start, end } = planner;
  const token = ++planner.token;
  const body = $('#plannerBody');
  planner.sideFix = null;

  $('#routeStart').value = start ? stopText(start) : '';
  $('#routeEnd').value = end ? stopText(end) : '';

  const complete = !!(start && end && start !== end);
  $('#routeFavBtn').hidden = !complete;
  if (complete) {
    setFavButton($('#routeFavBtn'), isFavRoute(start, end), I18n.t('planner.saveRoute', 'Save route'), I18n.t('stop.saved', 'Saved'));
    history.replaceState(null, '', `#route/${start}/${end}${When.hashPart(planner.when)}`);
  }

  if (!start || !end) {
    body.innerHTML = plannerStatus(I18n.t('planner.setBoth', 'Set both ends to see the buses that run between them. You can type a stop, or use the pin to pick one near you.'));
    return;
  }
  if (start === end) {
    body.innerHTML = plannerStatus(I18n.t('planner.sameStop', 'A route needs two different bus stops.'));
    return;
  }
  const late = When.problem(planner.when);
  if (late) {
    body.innerHTML = plannerStatus(late);
    return;
  }

  if (!BusNet.isReady()) {
    body.innerHTML = plannerStatus(I18n.t('planner.loadingRoutes', 'Loading bus routes…'));
    try {
      await BusNet.load(stopsIndex);
    } catch (e) {
      console.error(e);
      if (token === planner.token) body.innerHTML = plannerStatus(I18n.t('planner.routesFailed', 'Could not load bus routes. Please try again.'));
      return;
    }
    if (token !== planner.token) return;
  }
  // Immigration across the Causeway, for the time planned for, before anything is timed.
  BusNet.setCustoms(customsFor(plannerTiming()));
  const abroad = (code) => !!BusNet.crossBorder(code)?.abroad;
  const customsLine = abroad(start) === abroad(end) ? ''
    : `<p class="estimateNote">${escapeHtml(I18n.t('planner.customsLine', 'Times count ~{m} min to clear immigration at both checkpoints{byTime}. Your own time can be set in Settings.', { m: BusNet.customs[abroad(end) ? 'out' : 'in'], byTime: LS.getCustoms() === 'auto' ? I18n.t('planner.byTimeOfDay', ', by the time of day') : '' }))}</p>`;

  if (planner.journey) {
    await renderJourney(token);
    return;
  }

  // Every bus straight between the two, but only those running at the time are offered; the
  // rest are named, so a bus you know of isn't just missing.
  const timing = plannerTiming();
  const when = planner.when;
  const then = when ? I18n.t('planner.atThatTime', 'at that time') : I18n.t('planner.rightNow', 'right now');
  const rides = Journeys.directRides(start, end, timing);
  const running = rides.filter((r) => r.running);
  const idle = rides.filter((r) => !r.running).map((r) => r.bus);
  const idleNote = idle.length
    ? `<p class="estimateNote">${escapeHtml(I18n.t('planner.notRunning', 'Not running {then}: {list}.', { then, list: listText(idle) }))}</p>`
    : '';
  if (running.length) {
    const services = running.map((r) => r.bus);
    const favs = new Set(LS.getFavBuses());
    const list = pinFavourites(services, favs, LS.getPin('bus'));
    const count = services.length;
    body.innerHTML =
      plannerStatus(count === 1
        ? (when ? I18n.t('planner.runsOneThen', '1 bus runs between these stops at that time. Pick one to see its timings at the start.') : I18n.t('planner.runsOne', '1 bus runs between these stops. Pick one to see its timings at the start.'))
        : (when ? I18n.t('planner.runsManyThen', '{n} buses run between these stops at that time. Pick one to see its timings at the start.', { n: count }) : I18n.t('planner.runsMany', '{n} buses run between these stops. Pick one to see its timings at the start.', { n: count }))) +
      (when ? plannerStatus(directClockText(running, when)) : '') +
      `<div class="busGrid">${list.map((no) => busButton(no, favs.has(no), `data-route-bus="${escapeHtml(no)}"`)).join('')}</div>` +
      idleNote + customsLine;
    return;
  }

  const none = idle.length ? I18n.t('planner.noneThen', 'No bus runs straight between these stops {then}.', { then }) : I18n.t('planner.noneAtAll', 'No single bus links these two stops.');
  body.innerHTML = plannerStatus(`${none} ${I18n.t('planner.looking', 'Looking for journeys with a change…')}`);
  const { journeys, fixes } = await searchJourneys(start, end, timing);
  if (token !== planner.token) return;

  planner.journeys = journeys;
  if (!journeys.length) {
    body.innerHTML = plannerStatus(`${none} ${I18n.t('planner.noJourney', 'No journey with up to three changes runs {then} either. Try another time, or other stops.', { then })}`) + idleNote;
    return;
  }

  const fixed = { start: fixes.start?.code || start, end: fixes.end?.code || end };
  const hasFix = (fixes.start || fixes.end) && fixed.start !== fixed.end;
  if (hasFix) planner.sideFix = fixed;

  body.innerHTML =
    (hasFix ? sideFixHtml(fixes) : '') +
    plannerStatus(`${none} ${I18n.t('planner.butThese', 'These journeys get there with a short walk or a change:')}`) +
    `<div class="journeyList">${journeys
      .map((legs, i) => {
        const changes = legs.length - 1;
        return (
          `<button type="button" class="journeyItem" data-journey="${i}">` +
          `<span class="journeyBuses">${legs.map((l) => busChip(l.bus)).join(legArrow)}</span>` +
          `<span class="journeyMeta">${escapeHtml(journeyTimeText(legs, start, end, when))} &middot; ${escapeHtml(changesText(changes))}</span>` +
          `<span class="journeyDetail">${escapeHtml(journeyDetail(legs, start, end))}</span>` +
          (when?.mode === 'arrive' && journeyLeave(legs, start, end, when) < Date.now()
            ? `<span class="journeyWarn">${ico('alert')} ${escapeHtml(I18n.t("planner.tooLateBy", "Too late: you'd have had to leave by {time}", { time: When.clock(journeyLeave(legs, start, end, when)) }))}</span>`
            : '') +
          `</button>`
        );
      })
      .join('')}</div>` +
    idleNote + customsLine +
    `<p class="estimateNote">${escapeHtml(when ? CLOCK_NOTE : Journeys.ESTIMATE_NOTE)}</p>`;
}

const CLOCK_NOTE = I18n.t('planner.clockNote', 'Times are rough estimates from distance. Clock times count an average wait for each bus.');

// When a journey sets off for a picked time: then, or in time to arrive by it.
function journeyLeave(legs, start, end, when) {
  const clock = Journeys.journeyClock(legs, start, end);
  return clock ? When.span(when, clock.total).leave : null;
}

// "~25 min" on the move for Leave now, or "08:12 → 08:50" for a picked time.
function journeyTimeText(legs, start, end, when) {
  if (!when) return minutesText(Journeys.journeyMinutes(legs, start, end));
  const clock = Journeys.journeyClock(legs, start, end);
  if (!clock) return I18n.t('planner.timeUnknown', 'time unknown');
  const { leave, arrive } = When.span(when, clock.total);
  return `${When.clock(leave)} → ${When.clock(arrive)}`;
}

// Where a journey's buses are boarded and left, when that isn't the route's own ends, and
// where the changes are.
function journeyDetail(legs, start, end) {
  const parts = [];
  if (legs[0].from !== start) parts.push(I18n.t('route.from', 'From {stop}', { stop: nameOf(legs[0].from) || legs[0].from }));
  const changes = legs.slice(0, -1).map((l) => nameOf(l.to) || l.to);
  if (changes.length) parts.push(I18n.t('planner.changeAt', 'Change at {places}', { places: listText(changes) }));
  const last = legs[legs.length - 1];
  if (last.to !== end) parts.push(I18n.t('planner.offAt', 'Off at {stop}', { stop: nameOf(last.to) || last.to }));
  return parts.join(' · ') || I18n.t('planner.walkToStop', 'Walk to a stop nearby');
}

// Minutes until each of a service's next buses, soonest first. Empty when LTA had nothing
// for it or the request failed.
function etasMin(result, serviceNo) {
  if (result.status !== 'fulfilled') return [];
  const svc = (result.value?.services || []).find((s) => s.serviceNo === serviceNo);
  if (!svc) return [];
  return [svc.next, svc.next2, svc.next3].filter((n) => n && n.eta_ms != null).map((n) => n.eta_ms / 60000);
}

// One journey, leg by leg, with the live timings of each bus at the stop it's boarded at.
// Past the first bus, each leg says roughly when you'd reach its stop, and the buses due
// before then are struck through: they'll have gone.
async function renderJourney(token) {
  const { start, end, journey: legs } = planner;
  const body = $('#plannerBody');
  const nav =
    `<div class="plannerNav">` +
    `<button type="button" class="iconBtn" data-planner="back">${ico('back')} ${escapeHtml(I18n.t('planner.backToRoute', 'Back to route'))}</button>` +
    `<button type="button" class="iconBtn" data-planner="refresh">${escapeHtml(I18n.t('nav.refresh', 'Refresh'))}</button>` +
    `<button type="button" class="btn" data-planner="trip">${ico('bell')} ${escapeHtml(I18n.t('planner.startTrip', 'Start trip'))}</button>` +
    `</div>`;

  const details = legs.map(Journeys.legDetails);
  if (!details.every(Boolean)) {
    body.innerHTML = nav + plannerStatus(I18n.t("planner.journeyGone", "This journey no longer runs the way it did. Go back to the route for today's options."));
    return;
  }

  // For a picked time: when you'd set off, and whether that's soon enough for live timings
  // to say which bus you'd catch. Past that, each bus is timed by the clock, with an average
  // wait, rather than by the buses due now.
  const when = planner.when;
  const clock = Journeys.journeyClock(legs, start, end);
  const leaveMs = when ? When.span(when, clock.total).leave : Date.now();
  const lead = when ? When.liveLead(leaveMs) : 0;
  const live = lead != null;

  let results = [];
  if (live) {
    body.innerHTML = nav + plannerStatus(I18n.t('planner.loadingLive', 'Loading live timings…'));
    results = await Promise.allSettled(legs.map((l) => fetchArrivals(l.from, l.bus)));
    if (token !== planner.token) return;
  }

  const totalStops = details.reduce((sum, d) => sum + d.stops, 0);
  const steps = [];
  const setOff = !when ? ''
    : leaveMs < Date.now() - 60000
      ? `<p class="journeyWarn">${ico('alert')} ${escapeHtml(I18n.t("planner.tooLateLeave", "To arrive by {time} you'd have had to leave by {leave}.", { time: When.clock(When.atToMs(when.at)), leave: When.clock(leaveMs) }))}</p>`
      : plannerStatus(when.mode === 'arrive' ? I18n.t('planner.setOffArrive', 'Set off around {time} to arrive by {by}.', { time: When.clockDay(leaveMs), by: When.clock(When.atToMs(when.at)) }) : I18n.t('planner.setOff', 'Set off around {time}.', { time: When.clockDay(leaveMs) }));
  // Minutes from now, walked forward leg by leg: when you'd reach each stop, and when the bus
  // you'd catch there leaves. Null once a leg has no live timing left to go on.
  let t = live ? lead : null;
  let here = start;

  legs.forEach((leg, k) => {
    const walk = Journeys.walkDetails(here, leg.from);
    if (walk) {
      steps.push(
        `<li class="step stepWalk">${ico('walk')}<span>${escapeHtml(I18n.t('planner.walkTo', 'Walk ~{metres} m to {stop}, ~{m} min', { metres: Math.round(walk.metres), stop: stopText(leg.from), m: Math.round(walk.minutes) }))}</span></li>`
      );
      if (t != null) t += walk.minutes;
    }

    const detail = details[k];
    if (!live) {
      steps.push(
        `<li class="step stepLeg">` +
        `<div class="legHead">${busChip(leg.bus)}<span>${escapeHtml(stopsText(detail.stops))} &middot; ${escapeHtml(minutesText(detail.minutes))}</span></div>` +
        `<div class="legRide">${escapeHtml(I18n.t('planner.legRide', 'From {from} to {to}', { from: stopText(leg.from), to: stopText(leg.to) }))}</div>` +
        `<div class="legNote">${escapeHtml(I18n.t('planner.boardAround', 'Board around {time}, after an average wait.', { time: When.clock(leaveMs + clock.boards[k] * 60000) }))}</div>` +
        `<button type="button" class="iconBtn" data-leg="${k}">${ico('bus')} ${escapeHtml(I18n.t('planner.timingsAt', '{bus} timings at {stop}', { bus: leg.bus, stop: nameOf(leg.from) || leg.from }))}</button>` +
        `</li>`
      );
      steps.push(...crossingSteps(leg));
      here = leg.to;
      return;
    }
    const etas = etasMin(results[k], leg.bus);
    // The bus you'd catch: the first one due once you're at the stop. Unknown when an earlier
    // leg couldn't be timed, so nothing is struck through or picked out then.
    const catchAt = t != null ? etas.find((eta) => eta >= t) ?? null : null;

    let etaHtml;
    if (etas.length) {
      const cells = etas.map((eta) => {
        const shown = escapeHtml(etaText(eta * 60000));
        if (t != null && eta < t) return `<s title="${escapeHtml(I18n.t('planner.gone', 'Gone by the time you get there'))}">${shown}</s>`;
        if (eta === catchAt) return `<strong title="${escapeHtml(I18n.t("planner.yours", "The one you'd catch"))}">${shown}</strong>`;
        return `<span>${shown}</span>`;
      });
      etaHtml = `<div class="legEtas">${escapeHtml(I18n.t('planner.nextBus', 'Next {bus}:', { bus: leg.bus }))} ${cells.join(' &middot; ')}</div>`;
      if (t != null && catchAt == null) {
        etaHtml += `<div class="legNote">${escapeHtml(I18n.t("planner.allEarlier", "Every bus listed comes before you'd get here; yours is a later one."))}</div>`;
      }
    } else {
      etaHtml = `<div class="legNote">${escapeHtml(I18n.t('planner.noLive', 'No live timings for this bus right now.'))}</div>`;
    }

    const reach =
      t != null && t >= 1
        ? `<div class="legNote">${escapeHtml(I18n.t("planner.reach", "You'd get to this stop in ~{m} min, around {time}.", { m: Math.round(t), time: sgClock(t) }))}</div>`
        : '';

    steps.push(
      `<li class="step stepLeg">` +
      `<div class="legHead">${busChip(leg.bus)}<span>${escapeHtml(stopsText(detail.stops))} &middot; ${escapeHtml(minutesText(detail.minutes))}</span></div>` +
      `<div class="legRide">${escapeHtml(I18n.t('planner.legRide', 'From {from} to {to}', { from: stopText(leg.from), to: stopText(leg.to) }))}</div>` +
      reach +
      etaHtml +
      `<button type="button" class="iconBtn" data-leg="${k}">${ico('bus')} ${escapeHtml(I18n.t('planner.timingsAt', '{bus} timings at {stop}', { bus: leg.bus, stop: nameOf(leg.from) || leg.from }))}</button>` +
      `</li>`
    );
    steps.push(...crossingSteps(leg));

    // With no bus to go on, the rest of the journey can't be timed from here.
    t = catchAt != null ? catchAt + detail.minutes : null;
    here = leg.to;
  });

  const lastWalk = Journeys.walkDetails(here, end);
  if (lastWalk) {
    steps.push(
      `<li class="step stepWalk">${ico('walk')}<span>${escapeHtml(I18n.t('planner.walkTo', 'Walk ~{metres} m to {stop}, ~{m} min', { metres: Math.round(lastWalk.metres), stop: stopText(end), m: Math.round(lastWalk.minutes) }))}</span></li>`
    );
    if (t != null) t += lastWalk.minutes;
  }
  if (t != null) {
    steps.push(
      `<li class="step stepArrive">${ico('flag')}<span>${escapeHtml(I18n.t('planner.arriveLive', 'Arrive around {time}, in ~{m} min, catching the first bus you can.', { time: sgClock(t), m: Math.round(t) }))}</span></li>`
    );
  } else if (!live) {
    steps.push(
      `<li class="step stepArrive">${ico('flag')}<span>${escapeHtml(I18n.t('planner.arriveClock', 'Arrive around {time}, counting an average wait for each bus.', { time: When.clockDay(leaveMs + clock.total * 60000) }))}</span></li>`
    );
  }

  const changes = legs.length - 1;
  body.innerHTML =
    nav +
    `<p class="journeyHead">${escapeHtml(I18n.t('planner.onTheMove', '{m} on the move', { m: minutesText(Journeys.journeyMinutes(legs, start, end)) }))} &middot; ${escapeHtml(changesText(changes))} &middot; ${escapeHtml(stopsText(totalStops))}</p>` +
    setOff +
    `<ol class="journeySteps">${steps.join('')}</ol>` +
    `<p class="estimateNote">${escapeHtml(live ? Journeys.ESTIMATE_NOTE : `${CLOCK_NOTE} ${I18n.t('planner.liveFrom', 'Live timings show here from half an hour before you set off.')}`)}</p>` +
    `<p class="estimateNote">${escapeHtml(I18n.t('planner.updated', 'Updated {time}', { time: new Date().toLocaleTimeString(I18n.lang() === 'en' ? 'en-GB' : I18n.lang(), { timeZone: 'Asia/Singapore' }) }))}</p>`;
}

// How far a bus opened off a route or a journey still has to go: the stops to where you get
// off, and for a journey, what comes after that. Null for any other stop view, or when the
// route list no longer has that bus going there.
function stopsLeftNote(ctx, code, bus) {
  if (!ctx || !bus || !BusNet.isReady()) return null;

  if (ctx.kind === 'journey') {
    const legs = ctx.legs;
    const index = legs.findIndex((l) => l.from === code && l.bus === bus);
    if (index === -1) return null;
    const details = legs.slice(index).map(Journeys.legDetails);
    if (!details.every(Boolean)) return null;
    const leg = legs[index];
    const first = I18n.t('planner.busStopsTo', 'Bus {no}: {stops} to {stop}', { no: bus, stops: stopsText(details[0].stops), stop: stopText(leg.to) });
    if (index + 1 < legs.length) {
      const left = details.reduce((sum, d) => sum + d.stops, 0);
      return I18n.t('planner.thenChange', '{first}, then change to {bus} · {stops} left in the journey', { first, bus: legs[index + 1].bus, stops: stopsText(left) });
    }
    if (ctx.end && leg.to !== ctx.end) return I18n.t('planner.thenWalk', '{first}, then a short walk to {stop}', { first, stop: stopText(ctx.end) });
    return I18n.t('planner.theEnd', '{first}, the end of your journey', { first });
  }

  if (ctx.kind === 'route') {
    if (code !== ctx.start || !ctx.end) return null;
    const count = BusNet.stopsTo(bus, ctx.start, ctx.end);
    if (!count) return null;
    let text = I18n.t('planner.busStopsTo', 'Bus {no}: {stops} to {stop}', { no: bus, stops: stopsText(count.stops), stop: stopText(ctx.end) });
    if (count.via) text = I18n.t('planner.viaTerminus', '{text}, going round via its terminus at {stop}', { text, stop: nameOf(count.via) || count.via });
    return text;
  }

  return null;
}
