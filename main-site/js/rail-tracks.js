// The MRT and LRT tracks, so the live map (js/map.js) draws a train ride along the rails, the
// way sgraildata maps them, rather than straight from one station to the next.
//
// RailTracks.path(route, points) resolves to the track from a train leg's first station to
// its last, through each one between: `route` is the leg's line code (EW, CG, NS, ... SK, PG)
// and `points` its stations' [lat, lng], in the order ridden. It comes as { path, stops }:
// the [lat, lng] to draw, and the index in `path` where each station is. Null when the tracks
// can't be had (offline before they were ever fetched) or the line has none.
//
// The tracks are /data/rail-tracks.json (scripts/vendor-rail-tracks.mjs), fetched the first
// time a train leg's drawn. Each stretch between two stations is cut from the part of the line
// that passes both; the LRT loops and the Circle Line's are rings, cut the short way round. A
// stretch the track can't be matched to stays a straight line, so a ride is always drawn.
// Plain script: this project does not use ES modules, so it goes on window.
(function () {
  // A station further than this from its line's track isn't on it. An interchange is one
  // spot for all its lines, so it can be well off one of them: Tampines is 300 m from the
  // Downtown Line's track.
  const NEAR_M = 400;
  // A part whose ends are this close is a ring.
  const RING_M = 30;
  // A stretch cut from the track this much longer than the straight line is the wrong one.
  const DETOUR = 3;
  const DETOUR_M = 1000;

  let loading = null;
  const made = new Map(); // route and points, to the path worked out for them

  function load() {
    loading ??= fetch('/data/rail-tracks.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`rail tracks: ${r.status}`))))
      .then((data) => {
        const lines = {};
        for (const [code, parts] of Object.entries(data.lines || {})) lines[code] = parts.map(prepare);
        return lines;
      })
      .catch((err) => {
        loading = null; // asked again next time
        throw err;
      });
    return loading;
  }

  function metres(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // A part with the metres along it to each of its points.
  function prepare(pts) {
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + metres(pts[k - 1], pts[k]));
    const ring = pts.length > 2 && metres(pts[0], pts[pts.length - 1]) <= RING_M;
    return { pts, cum, total: cum[cum.length - 1], ring };
  }

  // Where a station is on a part: each pass of the track within NEAR_M, at the point nearest
  // the station, as { along, m, at }. A track that goes out and comes back the same way (the
  // Bukit Panjang LRT) passes some stations twice.
  function passes(part, p) {
    const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);
    const ky = 110540;
    const { pts, cum } = part;
    const found = [];
    let best = null;
    for (let k = 0; k < pts.length - 1; k++) {
      const ax = pts[k][1] * kx, ay = pts[k][0] * ky;
      const dx = pts[k + 1][1] * kx - ax, dy = pts[k + 1][0] * ky - ay;
      const px = p[1] * kx - ax, py = p[0] * ky - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const m = Math.hypot(px - t * dx, py - t * dy);
      if (m <= NEAR_M) {
        if (!best || m < best.m) {
          best = {
            along: cum[k] + t * (cum[k + 1] - cum[k]), m,
            at: [pts[k][0] + t * (pts[k + 1][0] - pts[k][0]), pts[k][1] + t * (pts[k + 1][1] - pts[k][1])],
          };
        }
      } else if (best) {
        found.push(best);
        best = null;
      }
    }
    if (best) found.push(best);
    return found;
  }

  // The track from `a` to `b` along a part, both { along, at }: forwards or backwards, and on a
  // ring the short way round, past its join.
  function cut(part, a, b) {
    const { pts, cum, total, ring } = part;
    const inner = (from, to) => {
      // The part's points strictly between two places along it.
      const out = [];
      if (from <= to) {
        for (let k = 0; k < pts.length; k++) if (cum[k] > from && cum[k] < to) out.push(pts[k]);
      } else {
        for (let k = pts.length - 1; k >= 0; k--) if (cum[k] < from && cum[k] > to) out.push(pts[k]);
      }
      return out;
    };
    const straight = Math.abs(b.along - a.along);
    if (!ring || straight <= total / 2) return { path: [a.at, ...inner(a.along, b.along), b.at], length: straight };
    // Round past the join, where the ring's last point is its first.
    const path = b.along > a.along
      ? [a.at, ...inner(a.along, -1), ...inner(total + 1, b.along), b.at]
      : [a.at, ...inner(a.along, total + 1), ...inner(-1, b.along), b.at];
    return { path, length: total - straight };
  }

  // One stretch, from station `a` to the next, `b`: from the part of the line that passes
  // both nearest, by the shortest way between them. Null if no part passes both, or the way
  // round is much longer than the straight line.
  function stretch(parts, a, b) {
    let best = null;
    for (const part of parts) {
      const as = passes(part, a);
      if (!as.length) continue;
      const bs = passes(part, b);
      for (const pa of as) {
        for (const pb of bs) {
          const c = cut(part, pa, pb);
          const score = c.length + pa.m + pb.m;
          if (!best || score < best.score) best = { ...c, score };
        }
      }
    }
    if (!best || best.length > metres(a, b) * DETOUR + DETOUR_M) return null;
    return best.path;
  }

  // The Changi Airport branch is drawn with the East West Line's track.
  const lineOf = (route) => {
    const code = String(route || '').toUpperCase();
    return code === 'CG' ? 'EW' : code;
  };

  async function path(route, points) {
    if (!(points?.length >= 2)) return null;
    const key = `${lineOf(route)}|${points.map((p) => p.join(',')).join(';')}`;
    if (made.has(key)) return made.get(key);
    let lines;
    try {
      lines = await load();
    } catch {
      return null;
    }
    const parts = lines[lineOf(route)];
    if (!parts) return null;
    const ways = points.slice(1).map((p, i) => stretch(parts, points[i], p));
    // A station's own spot sits a little off the track, so the line would duck out to it and
    // back. Kept at the ends, where the ride starts and stops, and beside a stretch that's a
    // straight line.
    const track = { path: [points[0]], stops: [0] };
    ways.forEach((way, i) => {
      if (way) track.path.push(...way);
      if (!way || !ways[i + 1]) track.path.push(points[i + 1]);
      track.stops.push(track.path.length - 1);
    });
    made.set(key, track);
    return track;
  }

  window.RailTracks = { path };
})();
