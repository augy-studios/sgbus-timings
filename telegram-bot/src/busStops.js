import { db } from "./db.js";
import { fetchAllBusStops } from "./lta.js";

const upsertStmt = db.prepare(`
  INSERT INTO bus_stops (code, name, road, lat, lng)
  VALUES (@code, @name, @road, @lat, @lng)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    road = excluded.road,
    lat = excluded.lat,
    lng = excluded.lng
`);

const countStmt = db.prepare("SELECT COUNT(*) AS n FROM bus_stops");
const getByCodeStmt = db.prepare("SELECT * FROM bus_stops WHERE code = ?");
const allStopsStmt = db.prepare("SELECT * FROM bus_stops");

/** Downloads the latest bus stop list from LTA DataMall and refreshes the local cache. */
export async function refreshBusStops() {
  const stops = await fetchAllBusStops();
  const insertMany = db.transaction((rows) => {
    for (const row of rows) upsertStmt.run(row);
  });
  insertMany(stops);
  return stops.length;
}

export function busStopsCount() {
  return countStmt.get().n;
}

export function getBusStopByCode(code) {
  return getByCodeStmt.get(code);
}

/**
 * Search cached bus stops by exact code, code prefix, or a substring of the
 * name/road. Numeric queries match on code; everything else matches on text.
 */
export function searchBusStops(query, limit = 10) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (/^\d+$/.test(q)) {
    return db
      .prepare("SELECT * FROM bus_stops WHERE code LIKE ? ORDER BY code LIMIT ?")
      .all(`${q}%`, limit);
  }

  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT * FROM bus_stops
       WHERE LOWER(name) LIKE ? OR LOWER(road) LIKE ?
       ORDER BY
         CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
         name
       LIMIT ?`
    )
    .all(like, like, `${q}%`, limit);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null)) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Returns the closest cached bus stops to a given coordinate, nearest first. */
export function nearestBusStops(lat, lng, limit = 8) {
  const rows = allStopsStmt.all();
  const withDistance = rows
    .map((stop) => ({ ...stop, distance: haversineMeters(lat, lng, stop.lat, stop.lng) }))
    .filter((stop) => stop.distance != null);
  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.slice(0, limit);
}
