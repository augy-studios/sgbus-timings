// Every bus route in Singapore, held in memory once /api/bus-routes has loaded: which
// stops each service calls at, in order, per direction, with first/last bus times. The
// route view, the bus picker, the route planner and the first/last bus lines all read
// from here. Ported from the Telegram bot's bus_routes.py and bus_route_view.py.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const ENDPOINT = "/api/bus-routes";

  let services = {}; // "22" -> { op, cat, loop, dirs: { 1: [originCode, destCode] } }
  let runs = {}; // "22" -> { 1: { stops: [codes], times: [24-char strings] } }
  let atStop = {}; // stop code -> Set of service numbers
  let stops = {}; // the stops index from script.js: code -> { n, road, lat, lng }
  let loading = null;
  let ready = false;
  let graph = null;

  const byNumber = (a, b) => a.localeCompare(b, undefined, { numeric: true });

  function index(payload) {
    services = payload.services || {};
    runs = payload.runs || {};
    atStop = {};
    for (const [serviceNo, dirs] of Object.entries(runs)) {
      for (const run of Object.values(dirs)) {
        for (const code of run.stops) (atStop[code] ??= new Set()).add(serviceNo);
      }
    }
    graph = null;
    ready = true;
  }

  // Safe to call repeatedly; every caller shares the one request. The stops index may come
  // in on a later call than the one that started the request.
  function load(stopsIndex) {
    if (stopsIndex && stopsIndex !== stops) {
      stops = stopsIndex;
      graph = null;
    }
    if (!loading) {
      loading = fetch(ENDPOINT)
        .then((r) => {
          if (!r.ok) throw new Error(`bus routes failed: ${r.status}`);
          return r.json();
        })
        .then(index)
        .catch((err) => {
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  function stopName(code) {
    return stops[code]?.n || code;
  }

  function stopLabel(code) {
    return stops[code] ? `${stops[code].n} (${code})` : code;
  }

  function hasService(serviceNo) {
    return !!runs[serviceNo];
  }

  // Services whose number starts with what's been typed, in bus-number order.
  function matchServices(query, limit = 6) {
    const q = query.trim().toUpperCase();
    if (!q || !/^[0-9A-Z]{1,4}$/.test(q)) return [];
    return Object.keys(runs)
      .filter((no) => no.startsWith(q))
      .sort(byNumber)
      .slice(0, limit);
  }

  function serviceInfo(serviceNo) {
    return services[serviceNo] || null;
  }

  function directions(serviceNo) {
    return Object.keys(runs[serviceNo] || {})
      .map(Number)
      .sort((a, b) => a - b);
  }

  function runStops(serviceNo, dir) {
    return runs[serviceNo]?.[dir]?.stops || [];
  }

  // Every service that calls at a stop, from the route list rather than live arrivals, so
  // a service that isn't running right now is still there to pick.
  function servicesAtStop(code) {
    return [...(atStop[code] || [])].sort(byNumber);
  }

  // The stops a service still calls at from a given stop, that stop first, following one
  // direction; the other direction if the stop isn't on the first one tried.
  function onwardFrom(serviceNo, code, preferDir) {
    const dirs = directions(serviceNo);
    const order = preferDir != null ? [preferDir, ...dirs.filter((d) => d !== preferDir)] : dirs;
    for (const dir of order) {
      const list = runStops(serviceNo, dir);
      const i = list.indexOf(code);
      if (i !== -1) return { stops: list.slice(i), dir };
    }
    return { stops: [], dir: preferDir ?? dirs[0] };
  }

  // The direction a stop sits on, preferring the first: the one to show a service's route
  // in when it's opened from that stop.
  function directionAt(serviceNo, code) {
    return directions(serviceNo).find((dir) => runStops(serviceNo, dir).includes(code)) ?? directions(serviceNo)[0];
  }

  // A service's start and end terminals, from LTA's service list where it has them and the
  // ends of the route otherwise, in the order the given direction runs.
  function terminals(serviceNo, dir) {
    const dirs = directions(serviceNo);
    const info = services[serviceNo];
    const first = dirs[0];
    const fromInfo = info?.dirs?.[first] || [];
    const run = runStops(serviceNo, first);
    let origin = fromInfo[0] || run[0] || null;
    let dest = fromInfo[1] || run[run.length - 1] || null;
    if (dir != null && dir !== first) [origin, dest] = [dest, origin];
    return { origin, dest, directions: dirs.length, loop: info?.loop || "" };
  }

  // ---- Landmarks ----

  // Interchanges, bus terminals, MRT/LRT stations and hospitals, as LTA abbreviates them in
  // stop names ("Pasir Ris Int", "Opp Tampines Stn/Int", "Tan Tock Seng Hosp"). "Ter" is
  // safe to read as a bus terminal: road names spell Terrace as "Terr".
  const LANDMARK_RE = /\b(?:Int|Ter|Stn|Hosp)\b/i;
  // "Stn" is also how LTA abbreviates stations that aren't rail stations at all, and petrol
  // kiosks named by their brand ("Caltex Stn"); those never make the list.
  const NOT_A_STATION_RE =
    /\b(?:police|fire|pumping|power|petrol|radio|coast\s*guard|civil\s*defence|bus|caltex|shell|esso|spc|sinopec|mobil)\s+stn\b/gi;
  // "Aft Hosp Dr" is Hospital Drive, not a hospital.
  const ROAD_NAME_RE = /\bhosp\s+(?:dr|rd|ave|st|cres|blvd|ln|way|link|walk|cl|pl)\b/gi;
  // Which side of the road a stop is on doesn't change which landmark it is.
  const SIDE_PREFIX_RE = /^(?:opp|aft|bef|bet|opposite)\s+/i;
  const MAX_LANDMARKS = 10;

  const withoutFalseLandmarks = (name) => name.replace(NOT_A_STATION_RE, "").replace(ROAD_NAME_RE, "");

  // "Opp Tampines Stn/Int" and "Tampines Stn Exit B" both name "Tampines Stn".
  function landmarkName(name) {
    const stripped = withoutFalseLandmarks(name.replace(SIDE_PREFIX_RE, "")).trim();
    const m = stripped.match(LANDMARK_RE);
    return m ? stripped.slice(0, m.index + m[0].length) : stripped;
  }

  function thin(items, limit) {
    if (items.length <= limit) return items;
    const step = (items.length - 1) / (limit - 1);
    return Array.from({ length: limit }, (_, i) => items[Math.round(i * step)]);
  }

  // The landmarks a run of stops passes, in travel order, consecutive stops for the same
  // one collapsed and thinned to at most ten, keeping both ends. Empty when there aren't
  // two to trace between.
  function landmarks(codes) {
    const found = [];
    for (const code of codes) {
      const name = stops[code]?.n;
      if (!name || !LANDMARK_RE.test(withoutFalseLandmarks(name))) continue;
      const landmark = landmarkName(name);
      if (found.length && found[found.length - 1].toLowerCase() === landmark.toLowerCase()) continue;
      found.push(landmark);
    }
    const thinned = thin(found, MAX_LANDMARKS);
    return thinned.length >= 2 ? thinned : [];
  }

  // ---- First and last bus ----

  const DAY_TYPES = [
    { label: "Weekday", offset: 0 },
    { label: "Sat", offset: 8 },
    { label: "Sun", offset: 16 },
  ];

  // Made once: a stop's timings ask for every bus there, and building a formatter is slow.
  const WEEKDAY = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "short" });

  function singaporeWeekday(now = new Date()) {
    return WEEKDAY.format(now);
  }

  // Today's first and last bus for a service at a stop, by Singapore's day of the week.
  // Uses the lowest direction on the rare stop served by more than one.
  function firstLast(serviceNo, code) {
    for (const dir of directions(serviceNo)) {
      const run = runs[serviceNo][dir];
      const i = run.stops.indexOf(code);
      if (i === -1) continue;
      const day = singaporeWeekday();
      const type = day === "Sat" ? DAY_TYPES[1] : day === "Sun" ? DAY_TYPES[2] : DAY_TYPES[0];
      const t = run.times[i] || "";
      const fmt = (s) => (/^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : "-");
      return {
        label: type.label,
        first: fmt(t.slice(type.offset, type.offset + 4)),
        last: fmt(t.slice(type.offset + 4, type.offset + 8)),
      };
    }
    return null;
  }

  // ---- Hubs ----

  // The hub a stop belongs to, from its name: what comes before "Int", "Ter" or "Stn", with
  // which side of the road it's on dropped, so "Tampines Int", "Opp Tampines Stn/Int" and
  // "Tampines Stn Exit D" are all "tampines". Stations that aren't rail stations ("Police
  // Stn", "Caltex Stn") belong to none. Keep in step with hub_of in the Telegram bot's
  // journeys.py and api/_nav/network.js.
  const HUB_RE = /^(.*?)\s*\b(?:bus\s+)?(?:int|ter|stn)\b/i;

  function hubOf(name) {
    if (!name) return null;
    const m = name.replace(NOT_A_STATION_RE, "").replace(SIDE_PREFIX_RE, "").trim().match(HUB_RE);
    return (m && m[1].trim().toLowerCase()) || null;
  }

  // A change of bus at a hub can be between any two of its stops this far apart, beyond the
  // usual walk: Tampines Int is 300 m from Tampines Stn/Int, and HarbourFront Int nearly 400 m
  // from HarbourFront Stn. The walk is timed like any other, so a long one only wins when it's
  // worth it. The same as HUB_WALK_M in the bot's journeys.py.
  const HUB_WALK_M = 400;
  const WALK_LIMIT_M = 200;

  // ---- Graph, for the journey planner and stop counts ----

  // Every run of every service held as a list, with the distance ridden to each stop and
  // where each stop sits on each run, plus each stop's road for telling which is across the
  // road from which. Built on first use, since only the planner needs it.
  function getGraph() {
    if (graph) return graph;
    const coords = {};
    const roads = {};
    const hubs = new Map();
    for (const [code, s] of Object.entries(stops)) {
      if (s.lat == null || s.lng == null) continue;
      coords[code] = [s.lat, s.lng];
      if (s.road) roads[code] = s.road.trim().toLowerCase();
      const hub = hubOf(s.n);
      if (hub) (hubs.get(hub) || hubs.set(hub, []).get(hub)).push(code);
    }
    // [stop, metres] for the stops of the same hub too far apart for an ordinary walk but
    // close enough to change between (HUB_WALK_M).
    const hubMates = new Map();
    for (const codes of hubs.values()) {
      for (const a of codes) {
        for (const b of codes) {
          if (a === b) continue;
          const metres = haversine(coords[a], coords[b]);
          if (metres > WALK_LIMIT_M && metres <= HUB_WALK_M) (hubMates.get(a) || hubMates.set(a, []).get(a)).push([b, metres]);
        }
      }
    }
    const list = [];
    // In the Telegram bot's order (its SQL sorts service numbers as text, then direction),
    // so two journeys that tie mostly resolve the way the bot's do. Only mostly: Python's and
    // the browser's trig differ in the last digit, which can tip a near-tie either way.
    // Object key order alone would put "2" before "10".
    for (const serviceNo of Object.keys(runs).sort()) {
      const dirs = runs[serviceNo];
      const info = services[serviceNo];
      const firstDir = info ? Object.keys(info.dirs).sort()[0] : null;
      const [origin, dest] = (firstDir && info.dirs[firstDir]) || [];
      const loopOrigin = origin && (info.loop || origin === dest) ? origin : null;
      for (const dir of Object.keys(dirs).sort((a, b) => a - b)) {
        const seq = [...dirs[dir].stops];
        // A loop ends where it started, but the route list keeps one row per stop, so the
        // terminus is only there as the first stop. Put it back on the end, or no journey
        // could ever ride a loop service home to its interchange.
        if (loopOrigin && seq[0] === loopOrigin && seq[seq.length - 1] !== loopOrigin) seq.push(loopOrigin);
        const cum = [0];
        let total = 0;
        for (let i = 1; i < seq.length; i++) {
          const a = coords[seq[i - 1]];
          const b = coords[seq[i]];
          if (a && b) total += haversine(a, b);
          cum.push(total);
        }
        list.push({ bus: serviceNo, dir: Number(dir), stops: seq, cum });
      }
    }
    const at = {};
    list.forEach((run, r) => run.stops.forEach((code, i) => (at[code] ??= []).push([r, i])));
    // Each service's runs, so looking one up doesn't scan them all.
    const byBus = new Map();
    for (const run of list) (byBus.get(run.bus) || byBus.set(run.bus, []).get(run.bus)).push(run);
    graph = { coords, roads, runs: list, at, byBus, hubMates };
    return graph;
  }

  function haversine([lat1, lng1], [lat2, lng2]) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // How many stops a bus rides from one stop to another: forwards on one run if it can,
  // failing that out to the terminus and back along the other direction, which is how a
  // bus serving the two stops on opposite runs gets there. { stops, via } where `via` is
  // that terminus's code, or null when there's no turn.
  function stopsTo(serviceNo, fromCode, toCode) {
    const own = getGraph().byBus.get(serviceNo) || [];
    for (const { stops: seq } of own) {
      const i = seq.indexOf(fromCode);
      if (i !== -1 && seq.indexOf(toCode, i + 1) !== -1) return { stops: seq.indexOf(toCode, i + 1) - i, via: null };
    }
    for (const out of own) {
      for (const back of own) {
        if (out !== back && out.stops.includes(fromCode) && back.stops.includes(toCode)) {
          const i = out.stops.indexOf(fromCode);
          return { stops: out.stops.length - 1 - i + back.stops.indexOf(toCode), via: out.stops[out.stops.length - 1] };
        }
      }
    }
    return null;
  }

  window.BusNet = {
    load,
    isReady: () => ready,
    stopName,
    stopLabel,
    hasService,
    matchServices,
    serviceInfo,
    directions,
    runStops,
    servicesAtStop,
    onwardFrom,
    directionAt,
    terminals,
    landmarks,
    firstLast,
    stopsTo,
    graph: getGraph,
    haversine,
    byNumber,
  };
})();
