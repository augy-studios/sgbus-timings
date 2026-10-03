// Builds main-site/api/_nav/rail.json, the MRT and LRT network the nav router rides on:
// every station with its codes, position and exits, and each line's stations in order with
// the links between neighbours. Vendored, never fetched at runtime, the way mrtroute-game
// does it, and from the same snapshot.
//
// The line order and links come from mrtroute-game's main-site/data/network.json, which
// works them out from the station codes and lists what codes can't show (the Changi
// branch, the Circle Line's closed loop, the LRT loops). Stations and exits come from
// cheeaun/sgraildata's data/v1/sg-rail.geojson.
//
// Run: node scripts/vendor-rail.mjs <mrtroute-game clone> <sg-rail.geojson>

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [mrtroute, sgRailPath] = process.argv.slice(2);
if (!mrtroute || !sgRailPath) {
  console.error("usage: node scripts/vendor-rail.mjs <mrtroute-game clone> <sg-rail.geojson>");
  process.exit(1);
}

const network = JSON.parse(readFileSync(join(mrtroute, "main-site/data/network.json"), "utf8"));
const stationsGeo = JSON.parse(readFileSync(join(mrtroute, "main-site/data/stations.geojson"), "utf8"));
const sgRail = JSON.parse(readFileSync(sgRailPath, "utf8"));

const round = (n) => Math.round(n * 1e6) / 1e6;

// One entry per station; an interchange is one station with several codes.
const stations = stationsGeo.features.map((f) => ({
  name: f.properties.name,
  codes: f.properties.codes,
  lat: round(f.geometry.coordinates[1]),
  lng: round(f.geometry.coordinates[0]),
  exits: [],
}));
const byCode = new Map();
stations.forEach((s, i) => s.codes.forEach((c) => byCode.set(c, i)));

// Exits name their station by its codes joined with dashes, e.g. "EW16-NE3-TE17".
let exits = 0;
for (const f of sgRail.features) {
  if (f.properties.stop_type !== "entrance") continue;
  const code = String(f.properties.station_codes || "").split("-")[0];
  const i = byCode.get(code);
  if (i == null) continue;
  stations[i].exits.push([round(f.geometry.coordinates[1]), round(f.geometry.coordinates[0])]);
  exits++;
}

const lines = network.lines.map((line) => {
  const stops = line.stations.map((s) => {
    const i = byCode.get(s.code);
    if (i == null) throw new Error(`${line.code}: no station has code ${s.code}`);
    return i;
  });
  return { code: line.code, name: line.name, color: line.color, codes: line.stations.map((s) => s.code), stops, links: line.links };
});

const out = { source: `${network.source} (sgraildata, via mrtroute-game)`, stations, lines };
writeFileSync("main-site/api/_nav/rail.json", JSON.stringify(out));

// The Telegram bot's copy: just the stations and their exits, so a search for "Bedok MRT"
// can list the bus stops at the station (telegram-bot/src/stations.py).
const botStations = stations.map(({ name, codes, lat, lng, exits }) => ({ name: name.trim(), codes, lat, lng, exits }));
writeFileSync("telegram-bot/src/rail_stations.json", JSON.stringify({ source: out.source, stations: botStations }));
console.log(`${stations.length} stations, ${exits} exits, ${lines.length} lines, from ${network.source}`);
