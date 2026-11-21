# SG Bus Timings

Live Singapore bus timings, and a way to get anywhere by bus and train, from
[LTA DataMall](https://datamall.lta.gov.sg/)'s own data. One app in many places:
the website, Android phones and watches, Windows, macOS and Linux, a command line,
and a Telegram bot.

**[Open the web app](https://sgbus.uwuapps.org)** ·
**[Read the guide](https://guide.sgbus.uwuapps.org)** ·
**[Download the apps](https://github.com/augy-studios/sgbus-timings/releases/latest)** ·
**[Chat to the bot](https://t.me/sgbus_app)** ·
**[What's new](main-site/PATCHNOTES.md)**

## What it does

- **Bus timings**: the next three buses at any stop, with how full each is, whether
  it's wheelchair accessible, single, double or bendy, how far away it is, and the
  day's first and last bus. Narrow a stop to one bus with **Pick a bus**, or see a
  bus's whole route.
- **Navigate**: ways by bus and train between any two places, leaving now, at a time
  or arriving by one, timed by the traffic right now and never on a bus that has
  finished for the day. Sorted by Best (less walking), Fastest, Least walking or Fewest
  changes, with your preferred buses first, each way's fare, and the buses you'd catch,
  live, with how full each is. With a stop on the way, walking, cycling or driving
  instead, and a **Bus only** route planner between two stops.
- **Trips**: follow a way with the **Get Off Alert**, which says when your stop is
  next, reroutes when a last bus is missed or a faster way turns up, and shares your
  progress live. The trip bar shows the part you're on stop by stop, and the map pins
  where to board, change and get off. On Android 16, a Live Update. Your trips are
  kept, with stats.
- **Favourites**: stops, buses, buses at one stop, routes and ways, in lists of your
  own, synced between your devices straight from one to the other.
- **Explorer and the live map**: buses moving along their routes, trains on their
  lines, and traffic on the roads.
- **Service alerts** as notifications, and the **weather** and air quality for the day.
- **Campus shuttles** at NUS and NTU, and **Causeway Link**'s buses to Johor Bahru.
- **Places**, past searches, and ways to your calendar's events.
- **uwuCoins**, feats, team runs and Easter eggs, for the fun of it.
- **Your look**: the UwU Apps theme in eight brand colours or your own, Material You
  on Android, your computer's own look on the desktop (Fluent 2, macOS Tahoe, or
  Deepin and COSMIC's frosted glass), light, dark or by the clock, and High contrast.
- **Four languages**: English, Chinese, Malay and Tamil.

## The apps

| App | Get it | Made with | More |
| --- | --- | --- | --- |
| **Website** (a PWA, installable and offline) | [sgbus.uwuapps.org](https://sgbus.uwuapps.org) | HTML, CSS and JavaScript with no framework, on Vercel Functions | [main-site/](main-site/README.md) |
| **Android**, with a **Wear OS** watch app | [APK on GitHub](https://github.com/augy-studios/sgbus-timings/releases/latest), and [Google Play](GOOGLE-PLAY.md) | Flutter, with Java for the native parts | [flutter/](flutter/README.md) |
| **Windows, macOS and Linux**: `.exe`, `.msi`, `.dmg`, `.deb`, `.rpm` and `.AppImage`, on Intel, AMD and Arm | [Releases](https://github.com/augy-studios/sgbus-timings/releases/latest) | The same Flutter app, with a desktop layer: title bar and command bar, tray, desktop widgets, notifications | [flutter/](flutter/README.md#the-desktop-app), [installers](flutter/installers/README.md) |
| **Command line** for Linux (`sgbus`) | `.deb` on [Releases](https://github.com/augy-studios/sgbus-timings/releases/latest) | Node.js 18, running the website's own planner and search | [cli/](cli/README.md) |
| **Telegram bot** and Mini App | [@sgbus_app](https://t.me/sgbus_app) | Python and Telethon, with SQLite | [telegram-bot/](telegram-bot/README.md) |
| **Guide** | [guide.sgbus.uwuapps.org](https://guide.sgbus.uwuapps.org) | A static site built from Markdown | [docs-site/](docs-site/README.md) |

Every app shares one version number. The apps keep up with the website feature for
feature, and add what only an app can do: trips with the screen off, home-screen
and desktop widgets, NFC card value, picture-in-picture, the tray and more.

## In this repository

| Folder | What's in it |
| --- | --- |
| [`main-site/`](main-site/) | The website, and its API under `api/` (timings, routes, Navigate's router, service alerts, push, sharing, sync) |
| [`flutter/`](flutter/) | The Android, Wear OS, Windows, macOS and Linux apps: shared screens in `lib/`, the desktop layer in `lib/desktop/`, the desktop's native plugin in `packages/sgbus_desktop/`, and the installers in `installers/` |
| [`cli/`](cli/) | The command line |
| [`telegram-bot/`](telegram-bot/) | The Telegram bot |
| [`docs-site/`](docs-site/) | The guide, and the tools that take its screenshots |
| [`docs/`](docs/) | Specs for the apps' parts, written to be reused in other apps |
| [`migrations/`](migrations/) | The database's SQL, one numbered file per change, never edited once written |
| [`scripts/`](scripts/) | Checks and tests for the website and the API |
| [`release/`](release/) | Each version's Android builds and notes, and [how to publish one](release/README.md) |
| [`announcement/`](announcement/) | Release notes and announcements for each version |

## Where the data comes from

- **[LTA DataMall](https://datamall.lta.gov.sg/)**: bus arrivals, stops, routes,
  first and last buses, train service alerts and traffic.
- **[OneMap](https://www.onemap.gov.sg/)**: places and postal codes, and a second
  opinion on Navigate's ways from its timetables.
- **[Open-Meteo](https://open-meteo.com/)** and NEA via **[data.gov.sg](https://data.gov.sg/)**:
  the weather, PSI and PM2.5.
- **[OpenFreeMap](https://openfreemap.org/)** with **[MapLibre](https://maplibre.org/)**:
  the maps. **[sgraildata](https://github.com/cheeaun/sgraildata)**: the MRT and LRT
  network.
- The campus shuttles' operators, and Causeway Link's timetables.

Behind the website: [Vercel](https://vercel.com/) for hosting and its functions,
[Upstash Redis](https://upstash.com/) for service alerts and rate limits,
[Supabase](https://supabase.com/) for short share links, and Firebase Cloud
Messaging for the Android app's notifications.

## Working on it

Each part's README has the full steps. In short:

- **Website**: from `main-site/`, `npm install`, then `vercel dev`, with your
  [LTA DataMall key](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html)
  as `LTA_ACCOUNT_KEY` in `.env.local`.
- **Apps**: Flutter 3.50.0. From `flutter/`, `flutter pub get`, then `flutter run`
  (`-d windows`, `-d macos` or `-d linux` for the desktop app). The APK:
  `powershell -ExecutionPolicy Bypass -File flutter\build-apk.ps1`. GitHub Actions
  builds the desktop installers for each release.
- **Command line**: Node.js 18 or later; `node cli/build.mjs` builds it.
- **Telegram bot**: Python 3 with `pip install -r requirements.txt`; see
  [telegram-bot/SETUP.md](telegram-bot/SETUP.md).
- **Guide**: from `docs-site/`, `npm run dev`.

Tests: `flutter test` in `flutter/` (leave out `test/shots/` unless you mean to take
the guide's screenshots again), and the checks in `scripts/` listed in
[main-site/README.md](main-site/README.md#checks).

## License

[MIT](LICENSE). Please follow the [code of conduct](CODE_OF_CONDUCT.md).
