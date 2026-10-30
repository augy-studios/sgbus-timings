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
    const [first, second] = c.way === 'out' ? ["Singapore's", "Malaysia's"] : ["Malaysia's", "Singapore's"];
    return `<li class="step stepWalk">${ico('flag')}<span>Get off at ${escapeHtml(stopText(c.from))} and clear ${first} immigration, ` +
      `ride any bus across to ${escapeHtml(stopText(c.to))} and clear ${second}, then get on again: ` +
      `~${c.minutes} min for both${LS.getCustoms() === 'auto' ? ', by the time of day' : ''}.</span></li>`;
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
        `${count === 1 ? 'One has' : `${count} have`} a bus ${directWay(field)}, listed first.`,
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
    const title = start && end ? `${nameOf(start) || start} to ${nameOf(end) || end}`
      : end ? `To ${nameOf(end) || end}`
      : start ? `From ${nameOf(start) || start}`
      : 'Navigate by bus only';
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
      findNearbyStops().then((stops) => offerNearbyEnd(field, `Stops near you: pick the ${field}`, stops))
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
        title: `To ${nameOf(planner.end) || planner.end}`,
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

const directWay = (field) => `straight ${field === 'start' ? 'to' : 'from'} ${nameOf(otherEnd(field)) || otherEnd(field)}`;

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
        ? `${direct.size === 1 ? 'One of these has' : `${direct.size} of these have`} a bus ${directWay(field)}, listed first.`
        : `None of these has a bus ${directWay(field)}, so the planner will look for journeys with a change.`;
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
    ensureStopsIndex().then(() => offerNearbyEnd(field, `Stops near ${place.name}: pick the ${field}`, stopsNear(place.lat, place.lng)));
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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const minutesText = (min) => (min != null ? `~${Math.round(min)} min` : 'time unknown');
const plannerStatus = (text) => `<p class="plannerStatus">${escapeHtml(text)}</p>`;
const busChip = (no) => `<span class="busChip">${escapeHtml(no)}</span>`;
const legArrow = '<span class="legArrow" aria-hidden="true">&rarr;</span>';

function sgClock(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60000).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "21", "21 and 25", "21, 25 and 960".
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || '');

// "a to b", or just "a" when the two read the same.
const clockRange = (a, b) => (When.clock(a) === When.clock(b) ? When.clock(a) : `${When.clock(a)} to ${When.clock(b)}`);

// When to set off or get in on the buses straight between the stops, for a picked time.
function directClockText(running, when) {
  const ms = When.atToMs(when.at);
  const totals = running.map((r) => (r.minutes + When.BUS_WAIT_MIN) * 60000);
  const quickest = Math.min(...totals);
  const slowest = Math.max(...totals);
  const wait = 'counting an average wait for the bus';
  if (when.mode === 'leave') return `Leave at ${When.clockDay(ms)} and you'd get in around ${clockRange(ms + quickest, ms + slowest)}, ${wait}.`;
  if (ms - quickest < Date.now()) return `To arrive by ${When.clock(ms)} you'd have had to leave by about ${When.clock(ms - quickest)}.`;
  return `To arrive by ${When.clockDay(ms)}, leave around ${clockRange(ms - slowest, ms - quickest)}, ${wait}.`;
}

// A line per end of the route picked on the wrong side of the road, naming the stop across
// the road that the buses really use, and a button to swap it in.
function sideFixHtml(fixes) {
  const lines = [
    ['start', 'leave from'],
    ['end', 'stop at'],
  ]
    .filter(([field]) => fixes[field])
    .map(([field, verb]) => {
      const { code, metres } = fixes[field];
      return `<p><strong>Wrong side of the road?</strong> The quickest buses for this trip ${verb} ${escapeHtml(stopText(code))}, across the road from your ${field}, ~${Math.round(metres)} m away.</p>`;
    });
  const only = fixes.start || fixes.end;
  const label = fixes.start && fixes.end ? 'Use the stops across the road' : `Use ${nameOf(only.code) || only.code} instead`;
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
    setFavButton($('#routeFavBtn'), isFavRoute(start, end), 'Save route', 'Saved');
    history.replaceState(null, '', `#route/${start}/${end}${When.hashPart(planner.when)}`);
  }

  if (!start || !end) {
    body.innerHTML = plannerStatus('Set both ends to see the buses that run between them. You can type a stop, or use the pin to pick one near you.');
    return;
  }
  if (start === end) {
    body.innerHTML = plannerStatus('A route needs two different bus stops.');
    return;
  }
  const late = When.problem(planner.when);
  if (late) {
    body.innerHTML = plannerStatus(late);
    return;
  }

  if (!BusNet.isReady()) {
    body.innerHTML = plannerStatus('Loading bus routes…');
    try {
      await BusNet.load(stopsIndex);
    } catch (e) {
      console.error(e);
      if (token === planner.token) body.innerHTML = plannerStatus('Could not load bus routes. Please try again.');
      return;
    }
    if (token !== planner.token) return;
  }
  // Immigration across the Causeway, for the time planned for, before anything is timed.
  BusNet.setCustoms(customsFor(plannerTiming()));
  const abroad = (code) => !!BusNet.crossBorder(code)?.abroad;
  const customsLine = abroad(start) === abroad(end) ? ''
    : `<p class="estimateNote">Times count ~${BusNet.customs[abroad(end) ? 'out' : 'in']} min to clear immigration at both checkpoints` +
      `${LS.getCustoms() === 'auto' ? ', by the time of day' : ''}. Your own time can be set in Settings.</p>`;

  if (planner.journey) {
    await renderJourney(token);
    return;
  }

  // Every bus straight between the two, but only those running at the time are offered; the
  // rest are named, so a bus you know of isn't just missing.
  const timing = plannerTiming();
  const when = planner.when;
  const then = when ? 'at that time' : 'right now';
  const rides = Journeys.directRides(start, end, timing);
  const running = rides.filter((r) => r.running);
  const idle = rides.filter((r) => !r.running).map((r) => r.bus);
  const idleNote = idle.length
    ? `<p class="estimateNote">Not running ${then}: ${escapeHtml(listText(idle))}.</p>`
    : '';
  if (running.length) {
    const services = running.map((r) => r.bus);
    const favs = new Set(LS.getFavBuses());
    const list = pinFavourites(services, favs, LS.getPin('bus'));
    const count = services.length;
    body.innerHTML =
      plannerStatus(`${count} bus${count === 1 ? '' : 'es'} run${count === 1 ? 's' : ''} between these stops${when ? ' at that time' : ''}. Pick one to see its timings at the start.`) +
      (when ? plannerStatus(directClockText(running, when)) : '') +
      `<div class="busGrid">${list.map((no) => busButton(no, favs.has(no), `data-route-bus="${escapeHtml(no)}"`)).join('')}</div>` +
      idleNote + customsLine;
    return;
  }

  const none = idle.length ? `No bus runs straight between these stops ${then}.` : 'No single bus links these two stops.';
  body.innerHTML = plannerStatus(`${none} Looking for journeys with a change…`);
  const { journeys, fixes } = await searchJourneys(start, end, timing);
  if (token !== planner.token) return;

  planner.journeys = journeys;
  if (!journeys.length) {
    body.innerHTML = plannerStatus(`${none} No journey with up to three changes runs ${then} either. Try another time, or other stops.`) + idleNote;
    return;
  }

  const fixed = { start: fixes.start?.code || start, end: fixes.end?.code || end };
  const hasFix = (fixes.start || fixes.end) && fixed.start !== fixed.end;
  if (hasFix) planner.sideFix = fixed;

  body.innerHTML =
    (hasFix ? sideFixHtml(fixes) : '') +
    plannerStatus(`${none.replace(/\.$/, '')}, but these journeys get there with a short walk or a change:`) +
    `<div class="journeyList">${journeys
      .map((legs, i) => {
        const changes = legs.length - 1;
        return (
          `<button type="button" class="journeyItem" data-journey="${i}">` +
          `<span class="journeyBuses">${legs.map((l) => busChip(l.bus)).join(legArrow)}</span>` +
          `<span class="journeyMeta">${escapeHtml(journeyTimeText(legs, start, end, when))} &middot; ${escapeHtml(plural(changes, 'change'))}</span>` +
          `<span class="journeyDetail">${escapeHtml(journeyDetail(legs, start, end))}</span>` +
          (when?.mode === 'arrive' && journeyLeave(legs, start, end, when) < Date.now()
            ? `<span class="journeyWarn">${ico('alert')} Too late: you'd have had to leave by ${escapeHtml(When.clock(journeyLeave(legs, start, end, when)))}</span>`
            : '') +
          `</button>`
        );
      })
      .join('')}</div>` +
    idleNote + customsLine +
    `<p class="estimateNote">${escapeHtml(when ? CLOCK_NOTE : Journeys.ESTIMATE_NOTE)}</p>`;
}

const CLOCK_NOTE = 'Times are rough estimates from distance. Clock times count an average wait for each bus.';

// When a journey sets off for a picked time: then, or in time to arrive by it.
function journeyLeave(legs, start, end, when) {
  const clock = Journeys.journeyClock(legs, start, end);
  return clock ? When.span(when, clock.total).leave : null;
}

// "~25 min" on the move for Leave now, or "08:12 → 08:50" for a picked time.
function journeyTimeText(legs, start, end, when) {
  if (!when) return minutesText(Journeys.journeyMinutes(legs, start, end));
  const clock = Journeys.journeyClock(legs, start, end);
  if (!clock) return 'time unknown';
  const { leave, arrive } = When.span(when, clock.total);
  return `${When.clock(leave)} → ${When.clock(arrive)}`;
}

// Where a journey's buses are boarded and left, when that isn't the route's own ends, and
// where the changes are.
function journeyDetail(legs, start, end) {
  const parts = [];
  if (legs[0].from !== start) parts.push(`From ${nameOf(legs[0].from) || legs[0].from}`);
  const changes = legs.slice(0, -1).map((l) => nameOf(l.to) || l.to);
  if (changes.length) {
    const places = changes.length > 1 ? `${changes.slice(0, -1).join(', ')} and ${changes[changes.length - 1]}` : changes[0];
    parts.push(`change${changes.length > 1 ? 's' : ''} at ${places}`);
  }
  const last = legs[legs.length - 1];
  if (last.to !== end) parts.push(`off at ${nameOf(last.to) || last.to}`);
  const text = parts.join(', ');
  return text ? text[0].toUpperCase() + text.slice(1) : 'Walk to a stop nearby';
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
    `<button type="button" class="iconBtn" data-planner="back">${ico('back')} Back to route</button>` +
    `<button type="button" class="iconBtn" data-planner="refresh">Refresh</button>` +
    `<button type="button" class="btn" data-planner="trip">${ico('bell')} Start trip</button>` +
    `</div>`;

  const details = legs.map(Journeys.legDetails);
  if (!details.every(Boolean)) {
    body.innerHTML = nav + plannerStatus("This journey no longer runs the way it did. Go back to the route for today's options.");
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
    body.innerHTML = nav + plannerStatus('Loading live timings…');
    results = await Promise.allSettled(legs.map((l) => fetchArrivals(l.from, l.bus)));
    if (token !== planner.token) return;
  }

  const totalStops = details.reduce((sum, d) => sum + d.stops, 0);
  const steps = [];
  const setOff = !when ? ''
    : leaveMs < Date.now() - 60000
      ? `<p class="journeyWarn">${ico('alert')} To arrive by ${escapeHtml(When.clock(When.atToMs(when.at)))} you'd have had to leave by ${escapeHtml(When.clock(leaveMs))}.</p>`
      : plannerStatus(`Set off around ${When.clockDay(leaveMs)}${when.mode === 'arrive' ? ` to arrive by ${When.clock(When.atToMs(when.at))}` : ''}.`);
  // Minutes from now, walked forward leg by leg: when you'd reach each stop, and when the bus
  // you'd catch there leaves. Null once a leg has no live timing left to go on.
  let t = live ? lead : null;
  let here = start;

  legs.forEach((leg, k) => {
    const walk = Journeys.walkDetails(here, leg.from);
    if (walk) {
      steps.push(
        `<li class="step stepWalk">${ico('walk')}<span>Walk ~${Math.round(walk.metres)} m to ${escapeHtml(stopText(leg.from))}, ~${Math.round(walk.minutes)} min</span></li>`
      );
      if (t != null) t += walk.minutes;
    }

    const detail = details[k];
    if (!live) {
      steps.push(
        `<li class="step stepLeg">` +
        `<div class="legHead">${busChip(leg.bus)}<span>${escapeHtml(plural(detail.stops, 'stop'))} &middot; ~${Math.round(detail.minutes)} min</span></div>` +
        `<div class="legRide">From ${escapeHtml(stopText(leg.from))} to ${escapeHtml(stopText(leg.to))}</div>` +
        `<div class="legNote">Board around ${escapeHtml(When.clock(leaveMs + clock.boards[k] * 60000))}, after an average wait.</div>` +
        `<button type="button" class="iconBtn" data-leg="${k}">${ico('bus')} ${escapeHtml(leg.bus)} timings at ${escapeHtml(nameOf(leg.from) || leg.from)}</button>` +
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
        if (t != null && eta < t) return `<s title="Gone by the time you get there">${shown}</s>`;
        if (eta === catchAt) return `<strong title="The one you'd catch">${shown}</strong>`;
        return `<span>${shown}</span>`;
      });
      etaHtml = `<div class="legEtas">Next ${escapeHtml(leg.bus)}: ${cells.join(' &middot; ')}</div>`;
      if (t != null && catchAt == null) {
        etaHtml += `<div class="legNote">Every bus listed comes before you'd get here; yours is a later one.</div>`;
      }
    } else {
      etaHtml = `<div class="legNote">No live timings for this bus right now.</div>`;
    }

    const reach =
      t != null && t >= 1
        ? `<div class="legNote">You'd get to this stop in ~${Math.round(t)} min, around ${sgClock(t)}.</div>`
        : '';

    steps.push(
      `<li class="step stepLeg">` +
      `<div class="legHead">${busChip(leg.bus)}<span>${escapeHtml(plural(detail.stops, 'stop'))} &middot; ~${Math.round(detail.minutes)} min</span></div>` +
      `<div class="legRide">From ${escapeHtml(stopText(leg.from))} to ${escapeHtml(stopText(leg.to))}</div>` +
      reach +
      etaHtml +
      `<button type="button" class="iconBtn" data-leg="${k}">${ico('bus')} ${escapeHtml(leg.bus)} timings at ${escapeHtml(nameOf(leg.from) || leg.from)}</button>` +
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
      `<li class="step stepWalk">${ico('walk')}<span>Walk ~${Math.round(lastWalk.metres)} m to ${escapeHtml(stopText(end))}, ~${Math.round(lastWalk.minutes)} min</span></li>`
    );
    if (t != null) t += lastWalk.minutes;
  }
  if (t != null) {
    steps.push(
      `<li class="step stepArrive">${ico('flag')}<span>Arrive around <strong>${sgClock(t)}</strong>, in ~${Math.round(t)} min, catching the first bus you can.</span></li>`
    );
  } else if (!live) {
    steps.push(
      `<li class="step stepArrive">${ico('flag')}<span>Arrive around <strong>${escapeHtml(When.clockDay(leaveMs + clock.total * 60000))}</strong>, counting an average wait for each bus.</span></li>`
    );
  }

  const changes = legs.length - 1;
  body.innerHTML =
    nav +
    `<p class="journeyHead">${escapeHtml(minutesText(Journeys.journeyMinutes(legs, start, end)))} on the move &middot; ${escapeHtml(plural(changes, 'change'))} &middot; ${escapeHtml(plural(totalStops, 'stop'))}</p>` +
    setOff +
    `<ol class="journeySteps">${steps.join('')}</ol>` +
    `<p class="estimateNote">${escapeHtml(live ? Journeys.ESTIMATE_NOTE : `${CLOCK_NOTE} Live timings show here from half an hour before you set off.`)}</p>` +
    `<p class="estimateNote">Updated ${escapeHtml(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore' }))}</p>`;
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
    const first = `Bus ${bus}: ${plural(details[0].stops, 'stop')} to ${stopText(leg.to)}`;
    if (index + 1 < legs.length) {
      const left = details.reduce((sum, d) => sum + d.stops, 0);
      return `${first}, then change to ${legs[index + 1].bus} · ${plural(left, 'stop')} left in the journey`;
    }
    if (ctx.end && leg.to !== ctx.end) return `${first}, then a short walk to ${stopText(ctx.end)}`;
    return `${first}, the end of your journey`;
  }

  if (ctx.kind === 'route') {
    if (code !== ctx.start || !ctx.end) return null;
    const count = BusNet.stopsTo(bus, ctx.start, ctx.end);
    if (!count) return null;
    let text = `Bus ${bus}: ${plural(count.stops, 'stop')} to ${stopText(ctx.end)}`;
    if (count.via) text += `, going round via its terminus at ${nameOf(count.via) || count.via}`;
    return text;
  }

  return null;
}
