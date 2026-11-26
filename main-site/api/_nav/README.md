# Navigate's router

`/api/nav` plans journeys by bus and train between any two points. `/api/places`
finds the points.

| File | What it does |
| --- | --- |
| `network.js` | Builds one graph of bus stops and stations from the site's own `/api/bus-routes` and `/api/bus-stops` and from `rail.json`. Every bus direction and train service is a run, with estimated minutes to each stop. |
| `router.js` | Round-based search, one vehicle per round, keeping the best arrival per mix of buses and trains, then the best way to the end for each mix and each last bus or line (so a bus to the door stays beside a quicker one with a long walk), then a varied shortlist. Shared with the phone's offline planning (`js/nav-core/router.js`) and kept in step with the app's `flutter/lib/data/nav_core.dart`. How the ways are sorted, tagged and priced is the page's (`js/ways.js`), not the API's. |
| `onemap-check.js` | Asks OneMap's timetable-based router the same question, to show its time beside matching options and add any it found that ours didn't. |
| `when.js` | Leave now, Leave at or Arrive by, and whether a bus or train is running at a time: LTA's first and last bus per stop for the kind of day (public holidays count as Sundays), and the hours trains run. The router never boards anything that isn't. Keep in step with `js/when.js` and the bot's `when.py`; add each year's public holidays once MOM publishes them. |
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

And the tracks the live map draws train rides along (`main-site/data/rail-tracks.json`,
read by `js/rail-tracks.js`), from the same snapshot:

```
node scripts/vendor-rail-tracks.mjs <somewhere>/sgraildata/data/v1/sg-rail.geojson
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
A shuttle past its last day (shuttles.json's `ends`) is never boarded, judged by
the date it would be boarded, so the graph kept for hours still follows it.

With a time picked (`&when=leave|arrive&at=2026-10-09T08:30`), and for Leave now too, a bus
is only boarded between its first and last bus at that stop, and a train between about
5:30am (6am on Sundays and public holidays) and midnight. Arrive by plans from the quickest
way's time to set off, then keeps each way only if it runs from its own.
A way OneMap's check adds is dropped if one of its buses won't be running by the time it's
reached (`live.js`, `running`), as OneMap's timetables don't follow LTA's first and last buses.

Each bus leg near its last bus of the day carries `lastBus` (`live.js`, `annotate`). Each train
leg whose train is one of the day's last three to where you get off, by LTA's timetable
(`api/_trains/gtfs.js`), carries `lastTrainRank` (3, 2 or 1) and `lastTrain`, when the last one
leaves (`last-trains.js`). `api/nav.js` waits up to 3 s for that timetable, which a newly started
function fetches while it plans, and goes without the last trains past that.
