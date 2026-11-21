// Navigate's list of ways (js/nav.js): the order the sort over the list picks, each way's tags
// (Fastest, Least walking, Fewest changes, Your bus), your preferred buses, and what the way
// should cost, roughly. Keep in step with flutter/lib/features/nav/ways.dart and the Telegram bot's
// telegram-bot/src/ways.py (scripts/bot-ways-test.py checks the bot's against this).
//
// Preferred buses come from two lists: one in Settings, for going anywhere, and one on each
// saved place (Places), which counts only when going to within NEAR_PLACE_M of it. Both are
// bus numbers, such as ["228"]. A way that rides one is marked Your bus and comes first in
// Best.
//
// The fare is the distance fare of PTC's table, January 2026 (ptc.gov.sg, fare structure): one
// fare for the whole way by its distance on buses and trains, however many changes, as a card
// pays it. The distance is along the stops and stations ridden, a little more for the roads and
// tracks between them, so it's an estimate. Ways across the Causeway have no fare here.
//
// The command line runs this file too, in its sandbox (cli/sgbus.js, SITE_FILES), for sgbus nav's
// sort, tags and fares (js/sgbus-core.js), as does the web app's sgbus terminal.
//
// Plain script: exports go on window.
(function () {
  const SORT_KEY = 'sgbus_nav_sort';
  const PREF_KEY = 'sgbus_pref_buses';
  const PLACE_BUSES_KEY = 'sgbus_place_buses';
  const FARE_KEY = 'sgbus_fare_type';
  const SORTS = ['best', 'fastest', 'walk', 'changes'];
  const FARE_TYPES = ['adult', 'student', 'senior', 'workfare'];
  // A walking minute counts this much in Best: in the sun, a long walk is worse than its minutes.
  const WALK_WEIGHT = 1.5;
  const NEAR_PLACE_M = 400;
  const MAX_BUSES = 20;
  // Roads wind more than the line between stops; tracks a little.
  const ROAD_FACTOR = 1.15;
  const TRACK_FACTOR = 1.1;
  // Express buses cost a fixed $1 more for adults (PTC).
  const EXPRESS_EXTRA = 100;

  // Cents, by distance: up to 3.2 km, then each kilometre to 40.2 km, then over. Concession
  // tables stop at over 7.2 km. Senior citizens and persons with disabilities pay the same.
  const FARES = {
    adult: [128, 138, 149, 159, 168, 175, 182, 186, 190, 194, 198, 202, 207, 211, 215, 220, 224, 227, 230, 233, 236, 238, 240, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257],
    student: [52, 60, 66, 71, 74, 78],
    senior: [69, 79, 87, 94, 100, 107],
    workfare: [78, 89, 98, 106, 113, 120, 126, 129, 132, 135, 138, 141, 144, 147, 150, 153, 156, 159, 162, 165, 168, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187],
  };

  const read = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* this visit only */ }
  };

  // ---------- the sort ----------

  const getSort = () => {
    const v = read(SORT_KEY, 'best');
    return SORTS.includes(v) ? v : 'best';
  };
  const setSort = (v) => write(SORT_KEY, SORTS.includes(v) && v !== 'best' ? v : null);

  // ---------- preferred buses ----------

  // Bus numbers typed in a box, as a list: "228, 69 225w" is ["228", "69", "225W"].
  function parseBuses(text) {
    const out = [];
    for (const w of String(text || '').toUpperCase().split(/[\s,;/]+/)) {
      if (/^[A-Z0-9]{1,5}$/.test(w) && !out.includes(w)) out.push(w);
    }
    return out.slice(0, MAX_BUSES);
  }
  const clean = (v) => (Array.isArray(v) ? parseBuses(v.join(' ')) : []);

  const preferred = () => clean(read(PREF_KEY, []));
  const setPreferred = (list) => write(PREF_KEY, clean(list).length ? clean(list) : null);

  const pointKey = (p) => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
  const placeMap = () => {
    const v = read(PLACE_BUSES_KEY, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  };
  const placeBuses = (p) => (p?.lat != null ? clean(placeMap()[pointKey(p)]) : []);
  function setPlaceBuses(p, list) {
    if (p?.lat == null) return;
    const all = placeMap();
    const buses = clean(list);
    if (buses.length) all[pointKey(p)] = buses;
    else delete all[pointKey(p)];
    write(PLACE_BUSES_KEY, Object.keys(all).length ? all : null);
  }

  function metres(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // The buses you'd rather take going to `to`: Settings' list and that of every saved place
  // near it (`places`, as Places.all() lists them).
  function preferredFor(to, places = window.Places?.all?.() || []) {
    const out = new Set(preferred());
    if (to?.lat != null) {
      const map = placeMap();
      for (const p of places) {
        if (p?.lat == null || metres(p, to) > NEAR_PLACE_M) continue;
        for (const no of clean(map[pointKey(p)])) out.add(no);
      }
    }
    return out;
  }

  // ---------- facts, order and tags ----------

  const rides = (o) => (o.legs || []).filter((l) => l.mode !== 'walk');
  // A stop on the way (Navigate's Add a stop) isn't a change.
  function facts(o) {
    const walks = (o.legs || []).filter((l) => l.mode === 'walk');
    const halves = o.via ? [o.legs.slice(0, o.via.leg), o.legs.slice(o.via.leg)] : [o.legs || []];
    return {
      minutes: o.minutes,
      walkM: walks.reduce((s, l) => s + (l.metres || 0), 0),
      walkMin: walks.reduce((s, l) => s + (l.minutes || 0), 0),
      changes: halves.reduce((s, legs) => s + Math.max(0, legs.filter((l) => l.mode !== 'walk').length - 1), 0),
    };
  }

  const ridesPreferred = (o, buses) => buses.size > 0 && rides(o).some((l) => l.mode === 'bus' && buses.has(String(l.route).toUpperCase()));

  // The ways in the order of `sort`. Best: your buses first, then by minutes with walking
  // counted at WALK_WEIGHT. Least walking and Fewest changes leave walking all the way last.
  function order(options, sort = getSort(), buses = new Set()) {
    const f = new Map(options.map((o) => [o, facts(o)]));
    const score = (o) => f.get(o).minutes + (WALK_WEIGHT - 1) * f.get(o).walkMin;
    const by = {
      best: (a, b) => (ridesPreferred(b, buses) - ridesPreferred(a, buses)) || score(a) - score(b) || f.get(a).minutes - f.get(b).minutes,
      fastest: (a, b) => f.get(a).minutes - f.get(b).minutes,
      walk: (a, b) => (!!a.walkOnly - !!b.walkOnly) || f.get(a).walkM - f.get(b).walkM || f.get(a).minutes - f.get(b).minutes,
      changes: (a, b) => (!!a.walkOnly - !!b.walkOnly) || f.get(a).changes - f.get(b).changes || f.get(a).minutes - f.get(b).minutes,
    }[SORTS.includes(sort) ? sort : 'best'];
    return [...options].sort(by);
  }

  // Each way's tags, as a Map of way to a list of 'fastest', 'walk', 'changes' and 'mine': the
  // best at each among the ways by bus and train, where that's better than some other way, the
  // first such way in order of minutes; and every way riding one of your buses.
  function tags(options, buses = new Set()) {
    const out = new Map(options.map((o) => [o, []]));
    const ways = options.filter((o) => !o.walkOnly).sort((a, b) => a.minutes - b.minutes);
    if (ways.length > 1) {
      const f = new Map(ways.map((o) => [o, facts(o)]));
      for (const [tag, of] of [['fastest', (o) => f.get(o).minutes], ['walk', (o) => f.get(o).walkM], ['changes', (o) => f.get(o).changes]]) {
        const values = ways.map(of);
        const least = Math.min(...values);
        if (least === Math.max(...values)) continue;
        out.get(ways[values.indexOf(least)]).push(tag);
      }
    }
    for (const o of options) if (ridesPreferred(o, buses)) out.get(o).push('mine');
    return out;
  }

  // ---------- the fare ----------

  const getFareType = () => {
    const v = read(FARE_KEY, 'adult');
    return FARE_TYPES.includes(v) ? v : 'adult';
  };
  const setFareType = (v) => write(FARE_KEY, FARE_TYPES.includes(v) && v !== 'adult' ? v : null);

  // Metres along a ride, by its stops or stations.
  function rideMetres(leg) {
    const path = leg.path || [];
    let m = 0;
    for (let i = 1; i < path.length; i++) m += metres({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] });
    return m * (leg.mode === 'train' ? TRACK_FACTOR : ROAD_FACTOR);
  }

  // The band of a table for a distance in kilometres, counted to the tenth as the fare is.
  function band(km, table) {
    const tenths = Math.round(km * 10) / 10;
    const i = tenths <= 3.2 ? 0 : Math.ceil(Math.round((tenths - 3.2) * 10) / 10);
    return table[Math.min(i, table.length - 1)];
  }

  // What a way should cost by card: { cents, km }, or null with nothing to pay for (walking all
  // the way, or only free shuttles) or no fare known (across the Causeway). Shuttle buses are
  // left out: their fares are their own. `category(no)`, when given, is a bus's LTA category,
  // for the express fare.
  function fare(o, type = getFareType(), category = null) {
    const paid = rides(o).filter((l) => !l.campus);
    if (!paid.length || paid.some((l) => l.customs?.length || !l.path?.length)) return null;
    const km = paid.reduce((s, l) => s + rideMetres(l), 0) / 1000;
    const table = FARES[FARE_TYPES.includes(type) ? type : 'adult'];
    let cents = band(km, table);
    if (type === 'adult' && category && paid.some((l) => l.mode === 'bus' && category(String(l.route)) === 'EXPRESS')) cents += EXPRESS_EXTRA;
    return { cents, km: Math.round(km * 10) / 10 };
  }

  const fareText = (cents) => `S$${(cents / 100).toFixed(2)}`;

  window.Ways = {
    SORTS, FARE_TYPES, FARES, WALK_WEIGHT, NEAR_PLACE_M,
    getSort, setSort, order, tags, facts,
    parseBuses, preferred, setPreferred, placeBuses, setPlaceBuses, preferredFor,
    getFareType, setFareType, fare, fareText, band,
  };
})();
