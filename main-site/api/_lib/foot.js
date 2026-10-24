// A route on foot or by bike, from OneMap's router (api/_lib/onemap.js), or, if that's down
// or not set up, the one OpenStreetMap Germany runs on OSRM (routing.openstreetmap.de, free for
// light use with attribution). With neither, a straight line, source "line".
//
// footRoute(from, to, { mode }) with `mode` "walk" or "cycle" answers { distance (metres),
// minutes, path: [[lat, lng], ...], steps: [{ text, at: [lat, lng], distance }], source }.
// For the live map's walks (api/walk.js) and Navigate's walking and cycling (api/nav.js).
//
// A walk isn't kept to the roads: both routers walk the footpath network, so it cuts through
// estates, void decks and covered linkways wherever they're mapped, as people do. Only the
// straight-line fallback allows for none of that, with DETOUR for the corners.
//
// Nor is it kept off them where there's nothing else. The walking routers stop where the
// footpaths do, so a place out on a road with none (an industrial road in Tuas, a lamp post
// along a road) is left short of. More than GAP_M short of it, and the last stretch goes along
// the road, by the car router's roads at walking pace (reachByRoad), with `roadside` its
// metres, for the live map to say so. Only at the end: a start that far from a footpath is
// you indoors, more likely than on a road. With no walking route at all, the car router's
// walked. Never along an expressway, where no one may walk: `expressway` says that's why the
// walk stops short.

import { walkRoute } from "./onemap.js";

// Straight-line pace, metres a minute: walking at 4.8 km/h, cycling at 15, and how much longer
// than the straight line the way is.
const PACE_M_PER_MIN = { walk: 80, cycle: 250 };
const DETOUR = 1.2;
const OSRM = {
  walk: "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
  cycle: "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
  road: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
};
// Short of the place by more than this, and the footpaths don't reach it.
const GAP_M = 40;
// A road stretch counts only if it gets this much nearer than the footpaths did, and isn't much
// longer than the gap it closes (ROAD_FACTOR times it, or ROAD_EXTRA_M more): a long one is the
// car router going round one-way streets, or a start inside a building, not a road to walk.
const NEARER_M = 20;
const ROAD_FACTOR = 3;
const ROAD_EXTRA_M = 300;
const EXPRESSWAY_RE = /expressway|\b(PIE|CTE|AYE|ECP|KJE|KPE|MCE|SLE|TPE|BKE|NSC)\b/i;

export function metres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Google's encoded polyline, precision 5, to [[lat, lng], ...].
function decodePolyline(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
export const round5 = ([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5];

// OneMap's answer: route_geometry, route_instructions as rows of [direction, road, metres,
// "lat,lng", seconds, ..., instruction text last], and route_summary's totals.
function fromOneMap(data, mode) {
  if (typeof data?.route_geometry !== "string" || !data.route_geometry) return null;
  const path = decodePolyline(data.route_geometry);
  if (path.length < 2) return null;
  const steps = (Array.isArray(data.route_instructions) ? data.route_instructions : []).map((r) => {
    if (!Array.isArray(r)) return null;
    const at = typeof r[3] === "string" ? r[3].split(",").map(Number) : null;
    const said = r.slice(5).reverse().find((x) => typeof x === "string" && x.split(" ").length >= 3);
    const text = said ? titleCase(said).replace(/\bOn\b/g, "on").replace(/\bAlong\b/g, "along").replace(/\bInto\b/g, "into")
      : `${titleCase(r[0] || "Continue")}${r[1] ? ` along ${titleCase(r[1])}` : ""}`;
    return { text, at: at && at.every(Number.isFinite) ? at : null, distance: Number(r[2]) || 0 };
  }).filter((s) => s?.at);
  const sum = data.route_summary || {};
  const distance = Number(sum.total_distance) || 0;
  const seconds = Number(sum.total_time) || (distance / PACE_M_PER_MIN[mode]) * 60;
  return { distance, minutes: Math.max(1, Math.round(seconds / 60)), path, steps, source: "onemap" };
}

const TURNS = {
  left: "Turn left", right: "Turn right", "slight left": "Bear left", "slight right": "Bear right",
  "sharp left": "Turn sharp left", "sharp right": "Turn sharp right", straight: "Go straight", uturn: "Turn around",
};

// OSRM's answer, its steps put into words.
function fromOsrm(data, mode) {
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const steps = (route.legs?.[0]?.steps || []).map((s) => {
    const m = s.maneuver || {};
    const road = s.name ? ` onto ${s.name}` : "";
    let text;
    if (m.type === "depart") text = `Head ${s.name ? `along ${s.name}` : "off"}`;
    else if (m.type === "arrive") text = "You've arrived";
    else if (m.type === "roundabout" || m.type === "rotary") text = `At the roundabout, take exit ${m.exit || 1}${road}`;
    else text = `${TURNS[m.modifier] || "Continue"}${road}`;
    return { text, at: [m.location?.[1], m.location?.[0]], distance: Math.round(s.distance || 0) };
  }).filter((s) => s.at.every(Number.isFinite));
  return {
    distance: Math.round(route.distance || 0),
    // At our own pace rather than OSRM's: a little slower on foot allows for crossings, and
    // its bike profile is quicker than a shared bike in town.
    minutes: Math.max(1, Math.round((route.distance || 0) / PACE_M_PER_MIN[mode])),
    path: coords.map(([lng, lat]) => [lat, lng]),
    steps,
    source: "osm",
  };
}

// `mode` "road" is the car router's roads, walked: its steps' road names come too, as `roads`.
async function osrm(from, to, mode) {
  const r = await fetch(`${OSRM[mode]}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`, {
    headers: { "user-agent": "sgbus-timings (https://sgbus.uwuapps.org)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`OSRM responded ${r.status}`);
  const data = await r.json();
  const route = fromOsrm(data, mode === "road" ? "walk" : mode);
  if (route && mode === "road") route.roads = (data.routes[0].legs?.[0]?.steps || []).flatMap((s) => [s.name, s.ref].filter(Boolean));
  return route;
}

const at = ([lat, lng]) => ({ lat, lng });

// The walk on to the place along the road, where the footpaths stop short of it. Changes
// `route` in place.
async function reachByRoad(route, to) {
  const end = route.path[route.path.length - 1];
  const gap = metres(end, [to.lat, to.lng]);
  if (gap <= GAP_M) return;
  let road = null;
  try {
    road = await osrm(at(end), to, "road");
  } catch {}
  if (!road) return;
  if (road.roads.some((n) => EXPRESSWAY_RE.test(n))) {
    route.expressway = true;
    return;
  }
  // How near the road gets to where the footpaths couldn't.
  const left = metres(road.path[road.path.length - 1], [to.lat, to.lng]);
  if (left > gap - NEARER_M || road.distance > Math.max(gap * ROAD_FACTOR, gap + ROAD_EXTRA_M)) return;
  route.path = [...route.path, ...road.path];
  route.steps = [...route.steps.filter((s) => s.text !== "You've arrived"), ...road.steps];
  route.distance += road.distance;
  route.minutes += Math.round(road.distance / PACE_M_PER_MIN.walk);
  route.roadside = road.distance;
}

export function straight(from, to, mode = "walk") {
  const d = metres([from.lat, from.lng], [to.lat, to.lng]) * DETOUR;
  return {
    distance: Math.round(d),
    minutes: Math.max(1, Math.round(d / PACE_M_PER_MIN[mode])),
    path: [[from.lat, from.lng], [to.lat, to.lng]],
    steps: [],
    source: "line",
  };
}

export async function footRoute(from, to, { mode = "walk" } = {}) {
  let route = null;
  try {
    route = fromOneMap(await walkRoute(from, to, mode), mode);
  } catch (err) {
    console.warn(`[${mode}] OneMap: ${err.message}`);
  }
  if (!route) {
    try {
      route = await osrm(from, to, mode);
    } catch (err) {
      console.warn(`[${mode}] OSRM: ${err.message}`);
    }
  }
  if (mode === "walk") {
    if (route) {
      await reachByRoad(route, to);
    } else {
      // No walking route at all: the roads, walked, unless that's along an expressway.
      try {
        const road = await osrm(from, to, "road");
        if (road && !road.roads.some((n) => EXPRESSWAY_RE.test(n))) route = { ...road, roadside: road.distance, source: "road" };
        delete route?.roads;
      } catch (err) {
        console.warn(`[road] OSRM: ${err.message}`);
      }
    }
  }
  const out = route || straight(from, to, mode);
  out.path = out.path.map(round5);
  return out;
}
