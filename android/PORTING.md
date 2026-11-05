# Porting the site to the native Flutter app (2.4.0)

The Android app is moving from the site in a WebView to its own screens in Dart, with full
parity with the site. The site's JS (`main-site/js/`, `main-site/script.js`) and the guide
(`docs-site/content/web/`) are the spec. Each feature is ported with the site's storage keys,
i18n keys and API calls, so the WebView app's data comes over as it is (`lib/data/migrate.dart`).

Status: ✅ done · 🚧 in progress · ⬜ not started

## Foundations

| Part | Site | Dart | Status |
|---|---|---|---|
| Native plugins over a method channel | `js/app-bridge.js` | `lib/native/native_bridge.dart`, `android/app/.../bridge/` | ✅ |
| Storage (same keys) and migration | `localStorage` | `lib/data/store.dart`, `lib/data/migrate.dart` | ✅ |
| Words in four languages | `js/i18n.js`, `i18n/*.json` | `lib/i18n/i18n.dart`, `assets/i18n/` | ✅ |
| API client | `fetch('/api/...')` | `lib/api/api.dart` | ✅ |
| Stops, search, contractions, stations | `script.js`, `js/contractions.js`, `js/station-search.js` | `lib/data/stops.dart`, `search.dart`, `contractions.dart`, `stations.dart` | ✅ |
| Bus network (routes, first/last, graph) | `js/network.js` | `lib/data/network.dart` | ✅ |
| Times and when | `js/when.js` | `lib/data/when.dart` | ✅ |
| Theme: Material You (default: the phone's fonts and wallpaper colours) and the UwU Apps theme | `js/theme.js`, `js/colours.js`, `js/material.js` | `lib/theme/theme.dart` | ✅ |
| Edge Tray, pages, links, Back twice | `script.js`, `js/main-screen.js` | `lib/app/` | ✅ |

## Screens

| Feature | Site | Status |
|---|---|---|
| A stop's timings | `script.js` (loadStop, renderArrivals) | ✅ |
| Bus timings page: search, near me, postal codes | `script.js` | ✅ |
| Bus route | `script.js` (openService) | ✅ |
| Glance | `js/glance.js` | ✅ |
| Favourites and lists | `script.js` | ✅ |
| Settings | `index.html`, `script.js` | ✅ |
| Theme, Material You switch, Your colours, High contrast | `js/theme.js`, `js/colours.js`, `js/wheel.js` | ✅ |
| Weather | `js/weather.js` | ✅ |
| Disruptions bar, Service alerts, push | `js/alerts.js` | ✅ |
| Board, Flag, Will I make it | `js/board.js`, `js/flag.js`, `js/make-it.js` | ✅ |
| Navigate (bus and train), train doors, walks and traffic on the live map | `js/nav.js`, `js/mrt-doors.js` | ✅ |
| Route planner (bus only), journeys checked against the site's | `js/planner.js`, `js/journeys.js` | ✅ |
| Live map, Explorer, station cards, Save the map (MapLibre; NUS and NTU shuttles to do) | `js/map*.js`, `js/rail-tracks.js` | 🚧 |
| Places and past searches | `js/places.js`, `js/recents.js` | ✅ |
| Calendar: the phone's, an iCal link or an .ics file, checked against the site's | `js/calendar.js` | ✅ |
| Get Off Alert (core: follow, alert, arrive, bar, timeline), Your trips and Trip Mix | `js/trip.js`, `js/history.js`, `js/rides.js` | 🚧 |
| Rides checked real, uwuCoins and the wheel, feats, Easter eggs, Achievements, past trips, the celebration, team runs | `js/rides.js`, `js/coins.js`, `js/eggs.js`, `js/retrofit.js`, `js/celebrate.js`, `js/team.js` | ✅ |
| Sync | `js/sync.js` | ⬜ |
| Reminders, routines, widgets, shortcuts | `js/reminders.js`, `js/widget.js` | ⬜ |
| Share card and links (QR, Offline Sharing to do) | `js/share.js`, `js/qr.js`, `js/offline-share.js` | 🚧 |
| Card value, Scan, Voice | `js/card.js`, `js/scan.js`, `js/voice.js` | ⬜ |
| Terminal | `js/terminal.js`, `js/sgbus-core.js` | ⬜ |
| Bug report, updates, tours, first run | `js/bug-report.js`, `js/app-update.js`, `js/tour.js` | ⬜ |

## Screenshots

`flutter test test/shots/` renders the guide's shots of the app into
`docs-site/public/screenshots/android/`, at 3x, from fixed data (see `test/shots/harness.dart`).
