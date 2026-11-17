# Porting the site to the native Flutter app (2.4.0), and the desktop app to it (2.5.0)

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
| Live map, Explorer, station cards, Save the map (MapLibre), shuttle buses (NUS, NTU and the rest: routes, stops, cards, Layers, credits) | `js/map*.js`, `js/rail-tracks.js`, `js/campus.js` | ✅ |
| Places and past searches | `js/places.js`, `js/recents.js` | ✅ |
| Calendar: the phone's, an iCal link or an .ics file, checked against the site's | `js/calendar.js` | ✅ |
| Get Off Alert: follow, alert, arrive, get ready to board, last bus with rerouting and Undo, traffic, a faster way, the server following the bus, MyICA, Change here, Are you walking?, Your trips | `js/trip.js`, `js/history.js` | ✅ |
| Rides checked real, uwuCoins and the wheel, feats, Easter eggs, Achievements, past trips, the celebration, team runs | `js/rides.js`, `js/coins.js`, `js/eggs.js`, `js/retrofit.js`, `js/celebrate.js`, `js/team.js` | ✅ |
| Sync with another device (PeerJS over WebRTC, BinaryPack, the site's own wire) or the Telegram bot | `js/sync.js`, `js/p2p.js`, `js/sync-relay.js` | ✅ |
| Reminders (near a stop, time to leave, on a bus, last bus), routines, widgets, shortcuts | `js/reminders.js` | ✅ |
| Share card and links, opening shared links, live progress both ways, Offline Sharing and NFC stickers | `js/share.js`, `js/offline-share.js` | ✅ |
| Card value, Scan, Voice | `js/card.js`, `js/scan.js`, `js/voice.js` | ✅ |
| Terminal | `js/terminal.js`, `js/sgbus-core.js` | ✅ `lib/features/terminal` |
| Bug report, the update bar, SimplyGo, the first-run choice and every page's tour | `js/bug-report.js`, `js/app-update.js`, `js/tour.js`, `js/first-run.js` | ✅ |
| Offline mode, picture-in-picture, shake to refresh, the twice-yearly coffee ask | `js/offline.js`, `js/pip.js`, `js/shake.js`, `js/donate.js` | ✅ `lib/api/net.dart`, `lib/features/misc/extras.dart` |

## Screenshots

`flutter test test/shots/` renders the guide's shots of the app into
`docs-site/public/screenshots/android/`, at 3x, from fixed data (see `test/shots/harness.dart`).
`test/shots/desktop_shots_test.dart` renders the desktop app's into
`docs-site/public/screenshots/desktop/`, at 2x; the final set is made on Windows.

## Desktop (2.5.0)

The Electron desktop app (2.0.0 to 2.4.8, `desktop/`, removed in 2.5.0 and kept in git history)
showed the site in a window, with its own parts around it. From 2.5.0 the desktop app is this
Flutter app, so the screens above are the desktop's too, and each Electron part is ported to the
desktop layer (`lib/desktop/`) with the Electron app's words, settings keys and file names, so its
users update in place. `docs/desktop-features-spec.md` (its checklist, §21) and
`docs/flutter-desktop-app-spec.md` are the spec; `DESKTOP-HANDOVER.md` says what's left.

✅ here means built, tested with Flutter 3.50.0 and seen on macOS; the Windows and Linux builds
come from CI and haven't been run on a real machine yet (`DESKTOP-HANDOVER.md`, item 1).

| Part | Electron | Dart | Status |
|---|---|---|---|
| Start-up order, the window (maximised, size kept, close to tray), one copy at a time | `main.js` | `lib/desktop/desktop_main.dart`, `desktop.dart`, the runners in `windows/`, `macos/`, `linux/` | ✅ |
| Title bar: back, forward, reload, copy, screenshots, Restart to update, window buttons | `titlebar.html`, `titlebar.js`, `titlebar-preload.js` | `title_bar.dart`, `chrome.dart`, `screenshot.dart`, `lib/app/nav.dart` (`ViewHistory`) | ✅ |
| The command bar (Electron's address bar only copied its address) | `main.js` | `command_bar.dart`, `chrome.dart`, `lib/app/links.dart` (`Links.read`) | ✅ |
| Keyboard shortcuts and the macOS menu bar | `main.js` | `menubar.dart` | ✅ |
| Navigation rail, split panes, dialogs and side panels, right-click menus (new in 2.5.0) | none | `rail.dart`, `chrome.dart`, `lib/app/shell.dart`, `adaptive.dart` | ✅ |
| What the page asked of the app (notify, favourites, tray, widgets, full screen, location) | `preload.js` | `host.dart`, answering `lib/native/native_bridge.dart` | ✅ |
| Make it yours | `setup.html`, `setup.js`, `setup-preload.js` | `welcome.dart` | ✅ |
| The update window and updating itself | `splash.html`, `updater.js` | `splash.dart`, `updater.dart` | ✅ |
| The tray and its menu | `main.js` (`createTray`) | `tray.dart` | ✅ |
| Tray countdown, Jump List, thumbnail buttons, Dock menu and badge | `glance.js` | `glance.dart`, `packages/sgbus_desktop/` | ✅ |
| Bus timings widgets | `widgets.js`, `main-site/widget.html` | `widgets_window.dart` | ✅ |
| Service Alerts every minute, as notifications | `main-site/js/alerts.js` (its desktop part), `main.js` | `alerts_poll.dart`, `notify.dart` | ✅ |
| `uwu://` links, claimed and handed on | `links.js` | `links.dart` | ✅ |
| Location on Linux (NetworkManager and BeaconDB) | `location.js`, `main-site/js/desktop-location.js` | `location.dart`, `lib/data/location.dart` | ✅ (unbuilt here) |
| The settings file | `settings.js` | `settings.dart` | ✅ |
| "No connection" on a first launch offline | `offline.html` | `chrome.dart` | ✅ |
| The old app's data, brought across once | Chromium's `localStorage` | `leveldb.dart`, `host.dart` (`Migrate.read`), `lib/data/migrate.dart` | ✅ |
| The live map, Explorer and Save the map | the site's `js/map*.js` in Chromium | `lib/features/map/sg_map.dart`, `lib/features/map/web/`, `assets/desktop/map/` | ✅ |
| Installers and update files under the Electron app's names | electron-builder (`package.json`), `build-linux.sh` | `installers/` (`installers/README.md`) | ✅ (Windows and Linux packages unrun) |
| Release builds on GitHub | `.github/workflows/build-desktop.yml` | the same file, rebuilt for Flutter; `desktop-check.yml` | ✅ (not run yet) |
| The desktop's words in four languages (`desktop.*` in `assets/i18n_app/`) | `setup.js`, `main.js` | `tr('desktop.…')` | ✅ |

`test/desktop/` holds the desktop layer's tests, and `tool/playwright/map.test.cjs` the map page's
(`README.md`, "Build the desktop app").
