// The route planner: pick a start and an end stop and see every bus that links them without
// a change, or, when none does, the quickest journeys with a short walk or a change of bus,
// each openable leg by leg with live timings. Ported from the Telegram bot's /route
// (route_view.py and journey_view.py).
// Loaded before script.js and uses its helpers ($, LS, loadStop, ...), so nothing here runs
// until script.js calls initPlanner().

// `sideFix` is the route with the stops across the road swapped in, while the planner is
// suggesting one.
const planner = { start: null, end: null, journey: null, journeys: [], sideFix: null, token: 0 };

function initPlanner() {
  for (const [field, input, box] of [['start', '#routeStart', '#routeStartAc'], ['end', '#routeEnd', '#routeEndAc']]) {
    attachAutocomplete($(input), $(box), {
      onStop: (code) => setPlannerEnd(field, code),
      directFor: (code) => directBuses(field, code),
      directNote: (count) =>
        `${count === 1 ? 'One has' : `${count} have`} a bus ${directWay(field)}, listed first.`,
      onPostal: (code) =>
        postalStops(code)
          .then(({ title, stops }) => offerNearbyEnd(field, title, stops))
          .catch((e) => alert(e.message)),
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
  $('#routeFavBtn').addEventListener('click', () => {
    toggleFavRoute(planner.start, planner.end);
    renderPlanner();
  });

  $('.plannerFields').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-near-for]');
    if (!btn) return;
    const field = btn.dataset.nearFor;
    withLocating(btn, () =>
      findNearbyStops().then((stops) => offerNearbyEnd(field, `Stops near you: pick the ${field}`, stops))
    );
  });

  $('#plannerBody').addEventListener('click', (e) => {
    const bus = e.target.closest('[data-route-bus]');
    if (bus) {
      loadStop(planner.start, {
        service: bus.dataset.routeBus,
        ctx: { kind: 'route', start: planner.start, end: planner.end },
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
      loadStop(picked.from, {
        service: picked.bus,
        ctx: { kind: 'journey', start: planner.start, end: planner.end, legs },
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
      });
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

function searchHere(start, end) {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
    const journeys = Journeys.findJourneys(start, end);
    return { journeys, fixes: journeys.length ? Journeys.wrongSideEnds(start, end) : {} };
  });
}

function searchJourneys(start, end) {
  if (workerFailed || typeof Worker === 'undefined') return searchHere(start, end);
  let first = false;
  if (!plannerWorker) {
    try {
      plannerWorker = new Worker('/js/planner-worker.js');
    } catch {
      workerFailed = true;
      return searchHere(start, end);
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
    workerWaiting.set(id, { resolve, fallback: () => searchHere(start, end).then(resolve) });
    plannerWorker.postMessage(first ? { id, start, end, stops: stopsIndex } : { id, start, end });
  });
}

function openPlanner(start = null, end = null, { journey = null, scroll = true } = {}) {
  planner.start = start;
  planner.end = end;
  planner.journey = journey;
  $('#plannerSection').hidden = false;
  renderPlanner();
  if (scroll) $('#plannerSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!start) $('#routeStart').focus({ preventScroll: true });
}

function closePlanner() {
  $('#plannerSection').hidden = true;
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
    history.replaceState(null, '', `#route/${start}/${end}`);
  }

  if (!start || !end) {
    body.innerHTML = plannerStatus('Set both ends to see the buses that run between them. You can type a stop, or use the pin to pick one near you.');
    return;
  }
  if (start === end) {
    body.innerHTML = plannerStatus('A route needs two different bus stops.');
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

  if (planner.journey) {
    await renderJourney(token);
    return;
  }

  const services = Journeys.directServices(start, end);
  if (services.length) {
    const favs = new Set(LS.getFavBuses());
    const list = pinFavourites(services, favs, LS.getPin('bus'));
    const count = services.length;
    body.innerHTML =
      plannerStatus(`${count} bus${count === 1 ? '' : 'es'} run${count === 1 ? 's' : ''} between these stops. Pick one to see its timings at the start.`) +
      `<div class="busGrid">${list.map((no) => busButton(no, favs.has(no), `data-route-bus="${escapeHtml(no)}"`)).join('')}</div>`;
    return;
  }

  body.innerHTML = plannerStatus('No single bus links these two stops. Looking for journeys with a change…');
  const { journeys, fixes } = await searchJourneys(start, end);
  if (token !== planner.token) return;

  planner.journeys = journeys;
  if (!journeys.length) {
    body.innerHTML = plannerStatus('No single bus links these two stops, even with three changes. Try picking other stops.');
    return;
  }

  const fixed = { start: fixes.start?.code || start, end: fixes.end?.code || end };
  const hasFix = (fixes.start || fixes.end) && fixed.start !== fixed.end;
  if (hasFix) planner.sideFix = fixed;

  body.innerHTML =
    (hasFix ? sideFixHtml(fixes) : '') +
    plannerStatus('No single bus links these two stops, but these journeys get there with a short walk or a change:') +
    `<div class="journeyList">${journeys
      .map((legs, i) => {
        const changes = legs.length - 1;
        return (
          `<button type="button" class="journeyItem" data-journey="${i}">` +
          `<span class="journeyBuses">${legs.map((l) => busChip(l.bus)).join(legArrow)}</span>` +
          `<span class="journeyMeta">${escapeHtml(minutesText(Journeys.journeyMinutes(legs, start, end)))} &middot; ${escapeHtml(plural(changes, 'change'))}</span>` +
          `<span class="journeyDetail">${escapeHtml(journeyDetail(legs, start, end))}</span>` +
          `</button>`
        );
      })
      .join('')}</div>` +
    `<p class="estimateNote">${escapeHtml(Journeys.ESTIMATE_NOTE)}</p>`;
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

  body.innerHTML = nav + plannerStatus('Loading live timings…');
  const results = await Promise.allSettled(legs.map((l) => fetchArrivals(l.from, l.bus)));
  if (token !== planner.token) return;

  const totalStops = details.reduce((sum, d) => sum + d.stops, 0);
  const steps = [];
  // Minutes from now, walked forward leg by leg: when you'd reach each stop, and when the bus
  // you'd catch there leaves. Null once a leg has no live timing left to go on.
  let t = 0;
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
    const etas = etasMin(results[k], leg.bus);
    // The bus you'd catch: the first one due once you're at the stop. Unknown when an earlier
    // leg couldn't be timed, so nothing is struck through or picked out then.
    const catchAt = t != null ? etas.find((eta) => eta >= t) ?? null : null;

    let etaHtml;
    if (etas.length) {
      const cells = etas.map((eta) => {
        const shown = escapeHtml(msToMins(eta * 60000));
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
  }

  const changes = legs.length - 1;
  body.innerHTML =
    nav +
    `<p class="journeyHead">${escapeHtml(minutesText(Journeys.journeyMinutes(legs, start, end)))} on the move &middot; ${escapeHtml(plural(changes, 'change'))} &middot; ${escapeHtml(plural(totalStops, 'stop'))}</p>` +
    `<ol class="journeySteps">${steps.join('')}</ol>` +
    `<p class="estimateNote">${escapeHtml(Journeys.ESTIMATE_NOTE)}</p>` +
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
