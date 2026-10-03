// The buses that run from one stop to another, and journeys for route ends that no single
// bus links: up to three changes of bus, with a short walk allowed at either end and between
// buses, since the two sides of a road are two different stops and a change often means
// crossing over. Ported from the Telegram bot's journeys.py, so both find the same journeys.
//
// Every bus here has to travel forwards, boarding before alighting on one run of the route,
// or a bus could ride out to a terminus and back.
//
// LTA gives no journey times, so every time here is an estimate from straight-line distance
// between consecutive stops: good for ranking journeys and a rough "you'd get there around",
// nothing tighter.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const WALK_LIMIT_M = 200;
  // Straight-line metres covered per minute. A bus's ~15 km/h takes in its stops and the
  // road's bends; on foot, 80 m/min slowed down for crossings and the long way round.
  const BUS_M_PER_MIN = 250;
  const WALK_M_PER_MIN = 60;
  // What a change costs over the time spent moving, the wait for the next bus mostly, so a
  // journey with fewer changes wins unless it's clearly slower.
  const CHANGE_PENALTY_MIN = 6;
  // A change on foot, to another stop, over one at the same stop: finding the stop and
  // crossing to it. So when the first bus goes on into the interchange the next one leaves
  // from, riding in wins unless getting off early and walking is clearly quicker. The same
  // as CHANGE_WALK_MIN in the bot's journeys.py and api/_nav/network.js.
  const CHANGE_WALK_MIN = 1;
  // Changes of bus in one journey, at most: some trips across the island take four buses.
  const MAX_CHANGES = 3;
  const MAX_JOURNEYS = 5;
  // The stop across the road: the other side's stop on the same road, this close. Two stops
  // on one road within 100 m are nearly always the pair facing each other; stops one after
  // the other on a route are rarely that close.
  const ACROSS_ROAD_M = 100;
  // How much quicker the stop across the road has to be before the one given is called the
  // wrong side, rather than a stop with slower buses.
  const WRONG_SIDE_MIN = 5;
  // Grid cells of about 220 m, so every stop within the walk limit is in the 3x3 block of
  // cells around a stop.
  const CELL_DEG = 0.002;

  const ESTIMATE_NOTE = "Times are rough estimates for riding and walking, not counting the wait for a bus.";

  let gridFor = null;
  let grid = null;
  let nearCache = null;

  const cell = (lat, lng) => `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;

  function ensureGrid(g) {
    if (gridFor === g) return;
    gridFor = g;
    grid = new Map();
    nearCache = new Map();
    for (const [code, [lat, lng]] of Object.entries(g.coords)) {
      const key = cell(lat, lng);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(code);
    }
  }

  // [stop, metres] for every other stop within walking distance of this one.
  function near(g, code) {
    if (nearCache.has(code)) return nearCache.get(code);
    const found = [];
    const here = g.coords[code];
    if (here) {
      const cx = Math.floor(here[0] / CELL_DEG);
      const cy = Math.floor(here[1] / CELL_DEG);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const other of grid.get(`${cx + dx},${cy + dy}`) || []) {
            if (other === code) continue;
            const metres = BusNet.haversine(here, g.coords[other]);
            if (metres <= WALK_LIMIT_M) found.push([other, metres]);
          }
        }
      }
    }
    nearCache.set(code, found);
    return found;
  }

  // The stop itself at no distance, then the stops within walking distance of it.
  const withNear = (g, code) => [[code, 0], ...near(g, code)];

  // Where a change of bus off at this stop can board the next: withNear, plus the rest of its
  // hub, an interchange's stops and its station's (HUB_WALK_M in js/network.js). Only for
  // changes; a journey's two ends keep to the ordinary walk.
  const changeNear = (g, code) => {
    const mates = g.hubMates.get(code);
    return mates ? [...withNear(g, code), ...mates] : withNear(g, code);
  };

  const rideMin = (run, i, j) => (run.cum[j] - run.cum[i]) / BUS_M_PER_MIN;
  const walkMin = (metres) => metres / WALK_M_PER_MIN;
  // A change's walk: none at the same stop, or the walk and CHANGE_WALK_MIN to another.
  const changeWalk = (metres) => (metres > 0 ? walkMin(metres) + CHANGE_WALK_MIN : 0);
  const toLeg = ([run, i, j]) => ({ bus: run.bus, dir: run.dir, from: run.stops[i], to: run.stops[j] });

  function groupByStop(entries) {
    const out = new Map();
    for (const e of entries) {
      if (!out.has(e.stop)) out.set(e.stop, []);
      out.get(e.stop).push(e);
    }
    return out;
  }

  const cheapest = (entries) => entries.reduce((a, b) => (b.cost < a.cost ? b : a));

  // Bus by bus in bus-number order, a shorter journey first where one is the start of the
  // other: how the bot orders journeys that take exactly as long.
  function compareBuses(x, y) {
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const c = BusNet.byNumber(x[i], y[i]);
      if (c) return c;
    }
    return x.length - y.length;
  }

  // Every bus that runs from one stop to the other without a change, heading the right way:
  // calling at the end after the start on one run of its route. A loop service counts round
  // to its interchange, not past it. In bus-number order.
  //
  // A bus that calls at both stops only the wrong way round isn't one: it would ride out to
  // its terminus and back. Picking the stop on the wrong side of the road is how that usually
  // comes about, and it's the journeys, which walk across, that find the bus for it.
  function directServices(startCode, endCode) {
    const g = BusNet.graph();
    const found = new Set();
    for (const [r, i] of g.at[startCode] || []) {
      if (g.runs[r].stops.indexOf(endCode, i + 1) !== -1) found.add(g.runs[r].bus);
    }
    return [...found].sort(BusNet.byNumber);
  }

  // The quickest few ways from one stop to another with a walk or up to three changes, best
  // first, one per sequence of buses. Each is a list of legs, { bus, dir, from, to }, the
  // walks implied by the gaps between one leg's `to` and the next's `from`.
  function findJourneys(startCode, endCode, limit = MAX_JOURNEYS) {
    return rankedJourneys(startCode, endCode)
      .slice(0, limit)
      .map((item) => item.legs);
  }

  // The last few searches, since the planner asks findJourneys and then wrongSideEnds the
  // same question, and each walks the whole network. Cleared when the network changes.
  const RANKED_KEEP = 6;
  let rankedFor = null;
  const rankedCache = new Map();

  // Every journey findJourneys weighs up, best first, as { cost, legs }. With `walkStart` or
  // `walkEnd` off, that end is used as it is, with no walk to or from it.
  function rankedJourneys(startCode, endCode, { walkStart = true, walkEnd = true } = {}) {
    const g = BusNet.graph();
    if (rankedFor !== g) {
      rankedFor = g;
      rankedCache.clear();
    }
    const key = `${startCode}|${endCode}|${walkStart}|${walkEnd}`;
    if (!rankedCache.has(key)) {
      if (rankedCache.size >= RANKED_KEEP) rankedCache.delete(rankedCache.keys().next().value);
      rankedCache.set(key, searchJourneys(g, startCode, endCode, walkStart, walkEnd));
    }
    return rankedCache.get(key);
  }

  function searchJourneys(g, startCode, endCode, walkStart, walkEnd) {
    ensureGrid(g);
    const starts = walkStart ? withNear(g, startCode) : [[startCode, 0]];
    const ends = walkEnd ? withNear(g, endCode) : [[endCode, 0]];

    // Onward: every stop reachable on one bus from the start, best way per (stop, run).
    const onward = new Map();
    for (const [board, walkM] of starts) {
      for (const [r, i] of g.at[board] || []) {
        const run = g.runs[r];
        for (let j = i + 1; j < run.stops.length; j++) {
          const cost = walkMin(walkM) + rideMin(run, i, j);
          const key = `${run.stops[j]}|${r}`;
          const prev = onward.get(key);
          if (!prev || cost < prev.cost) onward.set(key, { stop: run.stops[j], r, cost, i, j });
        }
      }
    }

    // Inward: every stop one bus away from the end, best way per (stop, run).
    const inward = new Map();
    for (const [alight, walkM] of ends) {
      for (const [r, j] of g.at[alight] || []) {
        const run = g.runs[r];
        for (let i = 0; i < j; i++) {
          const cost = rideMin(run, i, j) + walkMin(walkM);
          const key = `${run.stops[i]}|${r}`;
          const prev = inward.get(key);
          if (!prev || cost < prev.cost) inward.set(key, { stop: run.stops[i], r, cost, i, j });
        }
      }
    }
    const inwardAt = groupByStop(inward.values());

    const best = new Map();
    // `parts` is [run, i, j] per leg; the legs themselves are only built for a journey that
    // beats the best one found so far on the same buses.
    function offer(cost, parts) {
      const buses = parts.map(([run]) => run.bus);
      if (new Set(buses).size < buses.length) return;
      const key = buses.join(">");
      const prev = best.get(key);
      if (!prev || cost < prev.cost) best.set(key, { cost, buses, parts });
    }

    // No change: one bus, with a walk at one end or both.
    const endWalk = new Map(ends);
    for (const e of onward.values()) {
      if (endWalk.has(e.stop)) offer(e.cost + walkMin(endWalk.get(e.stop)), [[g.runs[e.r], e.i, e.j]]);
    }

    // One change: off the first bus, a short walk at most, onto a bus to the end.
    for (const e1 of onward.values()) {
      const run1 = g.runs[e1.r];
      for (const [board, walkM] of changeNear(g, e1.stop)) {
        for (const e2 of inwardAt.get(board) || []) {
          const run2 = g.runs[e2.r];
          if (run2.bus === run1.bus) continue;
          offer(e1.cost + changeWalk(walkM) + CHANGE_PENALTY_MIN + e2.cost, [
            [run1, e1.i, e1.j],
            [run2, e2.i, e2.j],
          ]);
        }
      }
    }

    // Two changes or more: the best way onto each stop after the first few buses, and the
    // best way to the end from each stop before the last few, joined up by a middle bus.
    // reach[k] and finish[k] map a stop to { cost, parts } with k buses ridden, the walk and
    // the change onto or off the middle bus counted in.
    const oneBus = (entriesAt) =>
      new Map([...entriesAt].map(([stop, entries]) => {
        const e = cheapest(entries);
        return [stop, { cost: e.cost, parts: [[g.runs[e.r], e.i, e.j]] }];
      }));
    const reach = [null, changeAt(g, oneBus(groupByStop(onward.values())))];
    const finish = [null, changeAt(g, oneBus(inwardAt))];
    for (let k = 2; k < MAX_CHANGES; k++) {
      reach.push(changeAt(g, rideOn(g, reach[k - 1])));
      finish.push(changeAt(g, rideBack(g, finish[k - 1])));
    }

    for (const run of g.runs) {
      for (let before = 1; before < MAX_CHANGES; before++) {
        scanOn(reach[before], run, (index, cost, board, parts) => {
          for (let after = 1; after <= MAX_CHANGES - before; after++) {
            const tail = finish[after].get(run.stops[index]);
            if (tail) offer(cost + tail.cost, [...parts, [run, board, index], ...tail.parts]);
          }
        });
      }
    }

    return [...best.values()]
      .sort((a, b) => a.cost - b.cost || compareBuses(a.buses, b.buses))
      .map((item) => ({ cost: item.cost, legs: item.parts.map(toLeg) }));
  }

  // Calls visit(index, minutes so far, board index, parts before this bus) for every stop
  // along one run that a journey in `reach` could ride this bus to, boarding wherever is
  // cheapest before it. A journey that has already ridden this bus doesn't board it again.
  function scanOn(reach, run, visit) {
    // The cheapest way to be on this bus so far, as minutes before its own ride is counted,
    // so the ride on to any later stop is just a subtraction away.
    let bestOn = null;
    run.stops.forEach((stop, index) => {
      if (bestOn) visit(index, bestOn.cost + run.cum[index] / BUS_M_PER_MIN, bestOn.board, bestOn.parts);
      const label = reach.get(stop);
      if (label && label.parts.every(([r]) => r.bus !== run.bus)) {
        const onCost = label.cost - run.cum[index] / BUS_M_PER_MIN;
        if (!bestOn || onCost < bestOn.cost) bestOn = { cost: onCost, board: index, parts: label.parts };
      }
    });
  }

  // The cheapest way off one more bus at every stop, from the journeys in `reach`.
  function rideOn(g, reach) {
    const off = new Map();
    for (const run of g.runs) {
      scanOn(reach, run, (index, cost, board, parts) => {
        const stop = run.stops[index];
        if (!off.has(stop) || cost < off.get(stop).cost) off.set(stop, { cost, parts: [...parts, [run, board, index]] });
      });
    }
    return off;
  }

  // rideOn backwards: the cheapest way to the end from every stop, one more bus before the
  // journeys in `finish`.
  function rideBack(g, finish) {
    const on = new Map();
    for (const run of g.runs) {
      // The cheapest way on from getting off this bus, as minutes plus its own ride so far.
      let bestOff = null;
      for (let index = run.stops.length - 1; index >= 0; index--) {
        const stop = run.stops[index];
        if (bestOff) {
          const cost = bestOff.cost - run.cum[index] / BUS_M_PER_MIN;
          if (!on.has(stop) || cost < on.get(stop).cost) on.set(stop, { cost, parts: [[run, index, bestOff.alight], ...bestOff.parts] });
        }
        const label = finish.get(stop);
        if (label && label.parts.every(([r]) => r.bus !== run.bus)) {
          const offCost = label.cost + run.cum[index] / BUS_M_PER_MIN;
          if (!bestOff || offCost < bestOff.cost) bestOff = { cost: offCost, alight: index, parts: label.parts };
        }
      }
    }
    return on;
  }

  // A change of bus at every stop in `at`: the short walk to each stop near it, or across its
  // hub, and the wait there, cheapest per stop, keyed the same way.
  function changeAt(g, at) {
    const out = new Map();
    for (const [stop, { cost, parts }] of at) {
      for (const [other, walkM] of changeNear(g, stop)) {
        const total = cost + changeWalk(walkM) + CHANGE_PENALTY_MIN;
        if (!out.has(other) || total < out.get(other).cost) out.set(other, { cost: total, parts });
      }
    }
    return out;
  }

  // [stop, metres] for the stops across the road from this one, nearest first.
  function acrossTheRoad(code) {
    const g = BusNet.graph();
    ensureGrid(g);
    const road = g.roads[code];
    if (!road) return [];
    return near(g, code)
      .filter(([other, metres]) => metres <= ACROSS_ROAD_M && g.roads[other] === road)
      .sort((a, b) => a[1] - b[1]);
  }

  // The stop across the road that each end of a route was most likely meant to be, as
  // { start: { code, metres }, end: { code, metres } }, leaving out an end that looks right.
  //
  // An end looks wrong when the quickest journey boards or gets off across the road from it,
  // and staying put at the end as given is at least WRONG_SIDE_MIN slower, or can't be done
  // at all: the stop on the side of the road the buses don't go your way from. A minute or
  // two either way is just a choice of buses, not the wrong stop.
  function wrongSideEnds(startCode, endCode) {
    const ranked = rankedJourneys(startCode, endCode);
    if (!ranked.length) return {};
    const { cost: bestCost, legs: best } = ranked[0];
    const fixes = {};
    for (const [field, code, used, stayPut] of [
      ['start', startCode, best[0].from, { walkStart: false }],
      ['end', endCode, best[best.length - 1].to, { walkEnd: false }],
    ]) {
      const across = acrossTheRoad(code).find(([other]) => other === used);
      if (!across) continue;
      const own = rankedJourneys(startCode, endCode, stayPut);
      if (own.length && own[0].cost - bestCost < WRONG_SIDE_MIN) continue;
      fixes[field] = { code: used, metres: across[1] };
    }
    return fixes;
  }

  // How long a leg is: the stops it rides and roughly how many minutes that takes. Null
  // when the bus no longer runs that way, for a journey kept from before a route change.
  function legDetails(leg) {
    const run = (BusNet.graph().byBus.get(leg.bus) || []).find((r) => r.dir === leg.dir);
    if (!run) return null;
    const i = run.stops.indexOf(leg.from);
    const j = i === -1 ? -1 : run.stops.indexOf(leg.to, i + 1);
    if (j === -1) return null;
    return { stops: j - i, minutes: rideMin(run, i, j) };
  }

  // The walk between two stops, or null when they're the same stop.
  function walkDetails(fromCode, toCode) {
    if (fromCode === toCode) return null;
    const { coords } = BusNet.graph();
    const metres = coords[fromCode] && coords[toCode] ? BusNet.haversine(coords[fromCode], coords[toCode]) : 0;
    return { metres, minutes: walkMin(metres) };
  }

  // Time on the move, riding and walking but not waiting, for the whole journey.
  function journeyMinutes(legs, startCode, endCode) {
    let total = 0;
    let here = startCode;
    for (const leg of legs) {
      const details = legDetails(leg);
      if (!details) return null;
      total += details.minutes + (walkDetails(here, leg.from)?.minutes || 0);
      here = leg.to;
    }
    return total + (walkDetails(here, endCode)?.minutes || 0);
  }

  window.Journeys = { directServices, findJourneys, wrongSideEnds, legDetails, walkDetails, journeyMinutes, ESTIMATE_NOTE };
})();
