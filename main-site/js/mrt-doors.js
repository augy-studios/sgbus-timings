// Where to stand on a train, for Navigate's train rides (js/nav.js): the doors that stop
// nearest the escalators, lift and stairs where you get off, or that it's a change across the
// platform to your next train. From /api/mrt-doors (the mrtinfo tables on Supabase), which
// has some stations and not yet others: a ride ending at one it hasn't says nothing.
//
// - The way a train's going is found from the platforms' `order`, how many stops into its
//   direction each is: the direction in which where you get off comes after where you board.
// - Doors are counted from the front of the train, and said as a car and a door in it, as
//   they're marked on the platform: door 8 of a 4-door car is car 2, door 4.
// - A facility's `towards` is where it leads, split by "/": "exit", the directions of the
//   lines it's the way to ("DT-11"), and places ("Jewel", "T2").
// Plain script: exports go on window.
(function () {
  // Doors along each side of a car: 4 on all but the Thomson-East Coast Line's.
  const DOORS_PER_CAR = { TE: 5 };
  // Cars in a train: 6 on all but the Circle, Downtown and Thomson-East Coast lines'.
  const CARS = { CC: 3, DT: 3, TE: 4 };
  // The Changi Airport branch's rides come as "CG", its platforms are the East-West Line's.
  const LINE_OF = { CG: 'EW' };
  const ORDER = ['escalator', 'lift', 'stairs'];
  const PLURAL = { escalator: 'escalators' };

  let platforms = null; // [{ c, l, d, o, x, n, f }] once in
  let dirs = new Set(); // every direction, to tell them from places in `towards`
  let loading = null;

  function load() {
    loading ??= fetch('/api/mrt-doors')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        platforms = d?.platforms || [];
        dirs = new Set(platforms.map((p) => p.d));
      })
      .catch(() => { loading = null; });
    return loading;
  }

  const ways = (f) => String(f.to || '').split('/').map((s) => s.trim()).filter(Boolean);
  const places = (f) => ways(f).filter((w) => w.toLowerCase() !== 'exit' && !dirs.has(w));
  // Out of the station: "exit", a place, or nothing said.
  const leadsOut = (f) => !ways(f).length || ways(f).some((w) => !dirs.has(w));
  const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  // "Jurong East", "JURONG EAST MRT STATION" and "Jurong East Station" all as one.
  const norm = (s) => String(s || '').toLowerCase().replace(/\b(mrt|lrt)\b/g, '').replace(/\bstation\b/g, '').replace(/\s+/g, ' ').trim();

  // A station's platforms on a line: by its code (Navigate's "NS1/EW24/JE5", or OneMap's), or
  // failing that its name.
  function at(place, line) {
    if (!platforms || !place) return [];
    const codes = String(place.code || '').toUpperCase().split('/').filter(Boolean);
    const onLine = (p) => p.l === line || p.l === LINE_OF[line] || p.c.startsWith(line);
    const byCode = platforms.filter((p) => onLine(p) && codes.includes(p.c.toUpperCase()));
    if (byCode.length) return byCode;
    const name = norm(place.name);
    return name ? platforms.filter((p) => onLine(p) && norm(p.n) === name) : [];
  }

  // The platform a ride gets off at, the way it's going: where it ends comes after where it
  // starts in that direction. Null where either end or the order isn't known.
  function arrival(leg) {
    const line = String(leg.route || '').toUpperCase();
    const from = at(leg.from, line);
    for (const a of at(leg.to, line)) {
      const b = from.find((p) => p.d === a.d);
      if (b && a.o > b.o) return a;
    }
    return null;
  }

  // Door 8 of a 4-door car: { car: 2, door: 4 }.
  function carDoor(n, line) {
    const per = DOORS_PER_CAR[line] || 4;
    return { car: Math.ceil(n / per), door: ((n - 1) % per) + 1 };
  }

  // The facilities as rows to show, by type, escalators first: those of a type at the same
  // doors as one, with the places they lead to. Stairs only where they're at other doors
  // from the escalators. [{ t, places, doors: [{ car, door }] }]
  function rowsOf(fs, line) {
    const max = (CARS[line] || 6) * (DOORS_PER_CAR[line] || 4);
    const groups = new Map();
    for (const f of fs) {
      const doors = [...new Set(f.doors)].filter((n) => Number.isInteger(n) && n >= 1 && n <= max).sort((a, b) => a - b);
      if (!doors.length) continue;
      const key = `${f.t}|${doors}`;
      const g = groups.get(key) || { t: f.t, doors, places: [] };
      for (const p of places(f)) if (!g.places.includes(p)) g.places.push(p);
      groups.set(key, g);
    }
    const rank = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
    const all = [...groups.values()].sort((a, b) => rank(a.t) - rank(b.t));
    const esc = new Set(all.filter((g) => g.t === 'escalator').flatMap((g) => g.doors));
    // A door already said for one of a type to a place isn't said again for one to nowhere
    // in particular.
    const named = (t) => new Set(all.filter((g) => g.t === t && g.places.length).flatMap((g) => g.doors));
    return all
      .map((g) => (g.places.length ? g : { ...g, doors: g.doors.filter((n) => !named(g.t).has(n)) }))
      .map((g) => (g.t === 'stairs' ? { ...g, doors: g.doors.filter((n) => !esc.has(n)) } : g))
      .filter((g) => g.doors.length)
      .map((g) => ({ t: g.t, places: g.places, doors: g.doors.map((n) => carDoor(n, line)) }));
  }

  // Where to stand for a train ride, or null: { station, cross } where `next` (the ride
  // after, if a train) is across the platform; otherwise { station, change, rows }, the doors
  // for the way to `next` if it's from the same station (`change` its line's name), or for
  // each way out.
  function plan(leg, next = null) {
    if (!platforms || leg?.mode !== 'train') return null;
    const a = arrival(leg);
    if (!a) return null;
    let change = null;
    if (next?.mode === 'train') {
      const nextLine = String(next.route || '').toUpperCase();
      const onward = arrival(next);
      if (onward && a.x.includes(onward.d)) return { station: a.n, cross: next.name || next.route };
      const here = at(next.from, nextLine).some((p) => p.n === a.n) || norm(next.from?.name) === norm(a.n);
      if (here) {
        // The way to the platform it leaves from, or failing that to its line.
        const lineOf = new Map(platforms.map((p) => [p.d, p.l]));
        const exact = onward ? a.f.filter((f) => ways(f).includes(onward.d)) : [];
        change = {
          name: next.name || next.route,
          fs: exact.length ? exact : a.f.filter((f) => ways(f).some((w) => lineOf.get(w) === (LINE_OF[nextLine] || nextLine))),
        };
      }
    }
    const rows = change?.fs.length ? rowsOf(change.fs, a.l) : rowsOf(a.f.filter(leadsOut), a.l);
    if (!rows.length) return null;
    return { station: a.n, change: change && (change.fs.length ? change.name : ''), rows };
  }

  // The same in words: "Getting off at Changi Airport: car 5, door 4 for the escalators to
  // Jewel; car 2, door 1 for the lift, counting from the front of the train."
  function tip(leg, next = null) {
    const p = plan(leg, next);
    if (!p) return null;
    if (p.cross) return `At ${p.station}, change across the platform to the ${p.cross}.`;
    const parts = p.rows.map((r) => `${r.doors.map((d) => `car ${d.car}, door ${d.door}`).join(' or ')} for the ${PLURAL[r.t] || r.t}${r.places.length ? ` to ${andList(r.places)}` : ''}`);
    const head = p.change != null ? `Changing at ${p.station}${p.change ? ` for the ${p.change}` : ''}` : `Getting off at ${p.station}`;
    return `${head}: ${parts.join('; ')}, counting from the front of the train.`;
  }

  window.MrtDoors = { load, plan, tip, ready: () => platforms != null };
})();
