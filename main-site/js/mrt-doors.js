// Where to stand on a train, for Navigate's train rides (js/nav.js): the doors that stop
// nearest the escalators, lift and stairs where you get off, or that it's a change across the
// platform to your next train. From /api/mrt-doors (the mrtinfo tables on Supabase), which
// has some stations and not yet others: a ride ending at one it hasn't says nothing.
//
// - The way a train's going is found from the platforms' `order`, how many stops into its
//   direction each is: the direction in which where you get off comes after where you board.
// - Doors are counted from the front of the train, and said as a car and a door in it, as
//   they're marked on the platform: door 8 of a 4-door car is car 2, door 4.
// Plain script: exports go on window.
(function () {
  // Doors along each side of a car: 4 on all but the Thomson-East Coast Line's.
  const DOORS_PER_CAR = { TE: 5 };
  const TYPE_NAME = { escalator: 'escalator', lift: 'lift', stairs: 'stairs' };

  let platforms = null; // [{ c, l, d, o, x, n, f }] once in
  let loading = null;

  function load() {
    loading ??= fetch('/api/mrt-doors')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { platforms = d?.platforms || []; })
      .catch(() => { loading = null; });
    return loading;
  }

  // "Jurong East", "JURONG EAST MRT STATION" and "Jurong East Station" all as one.
  const norm = (s) => String(s || '').toLowerCase().replace(/\b(mrt|lrt)\b/g, '').replace(/\bstation\b/g, '').replace(/\s+/g, ' ').trim();

  // A station's platforms on a line: by its code (Navigate's "NS1/EW24/JE5", or OneMap's), or
  // failing that its name.
  function at(place, line) {
    if (!platforms || !place) return [];
    const codes = String(place.code || '').toUpperCase().split('/').filter(Boolean);
    const onLine = (p) => p.l === line || p.c.startsWith(line);
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

  function doorName(n, line) {
    const per = DOORS_PER_CAR[line] || 4;
    return `car ${Math.ceil(n / per)}, door ${((n - 1) % per) + 1}`;
  }

  const doorList = (doors, line) => [...new Set(doors)].sort((a, b) => a - b).map((n) => doorName(n, line)).join(' or ');

  // What to say under a train ride, or null: changing across the platform for `next` (the
  // ride after, if a train), otherwise the doors for each way off the platform.
  function tip(leg, next = null) {
    if (!platforms || leg?.mode !== 'train') return null;
    const a = arrival(leg);
    if (!a) return null;
    const line = String(leg.route || '').toUpperCase();
    if (next?.mode === 'train') {
      const onward = arrival(next);
      if (onward && a.x.includes(onward.d)) return `At ${a.n}, change across the platform to the ${next.name || next.route}.`;
    }
    if (!a.f.length) return null;
    // Escalators first, then the lift; stairs only where they're at other doors.
    const by = (t) => a.f.filter((f) => f.t === t);
    const esc = by('escalator').flatMap((f) => f.doors);
    const toExit = !next && by('escalator').some((f) => f.to === 'exit') ? ' to the exit' : '';
    const parts = [];
    if (esc.length) parts.push(`${doorList(esc, line)} for the escalators${toExit}`);
    const lift = by('lift').flatMap((f) => f.doors);
    if (lift.length) parts.push(`${doorList(lift, line)} for the lift`);
    const stairs = by('stairs').flatMap((f) => f.doors).filter((n) => !esc.includes(n));
    if (stairs.length) parts.push(`${doorList(stairs, line)} for the stairs`);
    for (const f of a.f.filter((x) => !TYPE_NAME[x.t])) parts.push(`${doorList(f.doors, line)} for the ${f.t}`);
    if (!parts.length) return null;
    return `${next ? 'Changing at' : 'Getting off at'} ${a.n}: ${parts.join('; ')}, counting from the front of the train.`;
  }

  window.MrtDoors = { load, tip, ready: () => platforms != null };
})();
