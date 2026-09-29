// Journeys for route ends that no single bus links: up to two changes of bus, with a short
// walk allowed at either end and between buses, since the two sides of a road are two
// different stops and a change often means crossing over. Ported from the Telegram bot's
// journeys.py, so both find the same journeys.
//
// Unlike BusNet.servicesBetween, every bus leg here has to travel forwards, boarding before
// alighting on one run of the route, or a journey could ride out to a terminus and back.
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
  const MAX_JOURNEYS = 5;
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

  const rideMin = (run, i, j) => (run.cum[j] - run.cum[i]) / BUS_M_PER_MIN;
  const walkMin = (metres) => metres / WALK_M_PER_MIN;
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

  // The quickest few ways from one stop to another with a walk or up to two changes, best
  // first, one per sequence of buses. Each is a list of legs, { bus, dir, from, to }, the
  // walks implied by the gaps between one leg's `to` and the next's `from`.
  function findJourneys(startCode, endCode, limit = MAX_JOURNEYS) {
    const g = BusNet.graph();
    ensureGrid(g);
    const starts = withNear(g, startCode);
    const ends = withNear(g, endCode);

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
      for (const [board, walkM] of withNear(g, e1.stop)) {
        for (const e2 of inwardAt.get(board) || []) {
          const run2 = g.runs[e2.r];
          if (run2.bus === run1.bus) continue;
          offer(e1.cost + walkMin(walkM) + CHANGE_PENALTY_MIN + e2.cost, [
            [run1, e1.i, e1.j],
            [run2, e2.i, e2.j],
          ]);
        }
      }
    }

    // Two changes: the best way onto each stop after the first bus, and the best way to the
    // end from each stop before the last one, joined up by a middle bus between them.
    const reach = new Map();
    for (const [stop, entries] of groupByStop(onward.values())) {
      const e1 = cheapest(entries);
      for (const [board, walkM] of withNear(g, stop)) {
        const cost = e1.cost + walkMin(walkM) + CHANGE_PENALTY_MIN;
        if (!reach.has(board) || cost < reach.get(board).cost) reach.set(board, { cost, e: e1 });
      }
    }
    const finish = new Map();
    for (const [stop, entries] of inwardAt) {
      const e3 = cheapest(entries);
      for (const [alight, walkM] of withNear(g, stop)) {
        const cost = walkMin(walkM) + CHANGE_PENALTY_MIN + e3.cost;
        if (!finish.has(alight) || cost < finish.get(alight).cost) finish.set(alight, { cost, e: e3 });
      }
    }

    for (const run2 of g.runs) {
      // The cheapest way to be on this bus so far, as minutes before its own ride is
      // counted, so the ride on to any later stop is just a subtraction away.
      let bestOn = null;
      run2.stops.forEach((stop, index) => {
        if (bestOn && finish.has(stop)) {
          const f = finish.get(stop);
          offer(bestOn.cost + run2.cum[index] / BUS_M_PER_MIN + f.cost, [
            [g.runs[bestOn.e.r], bestOn.e.i, bestOn.e.j],
            [run2, bestOn.i2, index],
            [g.runs[f.e.r], f.e.i, f.e.j],
          ]);
        }
        if (reach.has(stop)) {
          const rc = reach.get(stop);
          const onCost = rc.cost - run2.cum[index] / BUS_M_PER_MIN;
          if (!bestOn || onCost < bestOn.cost) bestOn = { cost: onCost, i2: index, e: rc.e };
        }
      });
    }

    return [...best.values()]
      .sort((a, b) => a.cost - b.cost || compareBuses(a.buses, b.buses))
      .slice(0, limit)
      .map((item) => item.parts.map(toLeg));
  }

  // How long a leg is: the stops it rides and roughly how many minutes that takes. Null
  // when the bus no longer runs that way, for a journey kept from before a route change.
  function legDetails(leg) {
    const run = BusNet.graph().runs.find((r) => r.bus === leg.bus && r.dir === leg.dir);
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

  window.Journeys = { findJourneys, legDetails, walkDetails, journeyMinutes, ESTIMATE_NOTE };
})();
