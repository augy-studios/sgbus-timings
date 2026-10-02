# Navigate's router

`/api/nav` plans journeys by bus and train between any two points. `/api/places`
finds the points.

| File | What it does |
| --- | --- |
| `network.js` | Builds one graph of bus stops and stations from the site's own `/api/bus-routes` and `/api/bus-stops` and from `rail.json`. Every bus direction and train service is a run, with estimated minutes to each stop. |
| `router.js` | Round-based search, one vehicle per round, keeping the best arrival per mix of buses and trains, then a varied shortlist. |
| `onemap-check.js` | Asks OneMap's timetable-based router the same question, to show its time beside matching options and add any it found that ours didn't. |
| `rail.json` | The MRT and LRT network: stations with their codes, positions and exits, and each line's stations in order. |

## rail.json

A snapshot of [cheeaun/sgraildata](https://github.com/cheeaun/sgraildata) at
commit `d64f9408` (12 July 2026), the same snapshot mrtroute-game vendors, with
the line order mrtroute-game works out from it (its `main-site/data/network.json`).
Never fetched at runtime. Built by `scripts/vendor-rail.mjs`; do not edit by hand.

To refresh, with both repos cloned:

```
git clone --depth 1 https://github.com/cheeaun/sgraildata.git <somewhere>
node scripts/vendor-rail.mjs <mrtroute-game clone> <somewhere>/sgraildata/data/v1/sg-rail.geojson
```

Then check `railSequences` in `network.js` still matches how the trains run
(it fails loudly if a code it names has gone), update the commit and date above,
and bump `VERSION` in `sw.js`.

## Times

No timetables are published for trains, so every time is an estimate:
buses at ~15 km/h along the road, trains from straight-line distance between
stations (calibrated so Jurong East to Tanah Merah is about the 52 minutes it
takes), an average wait to board (5 minutes for a bus, 3 for a train), 3 minutes
to change trains inside an interchange, and 2 minutes between a station's exit
and its platform. OneMap's check shows a timetable-based time where it can.
