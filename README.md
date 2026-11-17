# SG Bus Timings

Real-time Singapore bus arrival timings, powered by [LTA DataMall](https://datamall.lta.gov.sg/), available as a web app, an Android app, an app for Windows, macOS and Linux, a command line for Linux, and a Telegram bot. The web app's weather and air quality come from [Open-Meteo](https://open-meteo.com/) and NEA via [data.gov.sg](https://data.gov.sg/).

## Projects

### [Web App](main-site/) — [sgbus.uwuapps.org](https://sgbus.uwuapps.org/)
A Progressive Web App (PWA) for live bus arrival timings, with favourites, route maps, themes, and offline support. See [main-site/README.md](main-site/README.md) for full details.

### [Android App](flutter/) — [releases](https://github.com/augy-studios/sgbus-timings/releases)
The Android app (`org.uwuapps.sgbus`), in Flutter from 2.4.0: every screen its own, with full parity with the web app, plus what only an app can do: following a trip with the screen off, notifications through Firebase, widgets and reminders, reading a card's value over NFC, the phone's calendar, and opening SimplyGo. Shared as an APK file from GitHub, with a Google Play build too ([GOOGLE-PLAY.md](GOOGLE-PLAY.md)). See [flutter/README.md](flutter/README.md) for building it, [flutter/FIREBASE-SETUP.md](flutter/FIREBASE-SETUP.md) for its notifications, and [release/README.md](release/README.md) for publishing it on GitHub.

### [Windows, macOS and Linux App](flutter/) — [releases](https://github.com/augy-studios/sgbus-timings/releases)
From 2.5.0 the same Flutter app as Android, with a desktop layer around its screens (`flutter/lib/desktop/`): its own title bar and command bar, keyboard shortcuts, split panes, the tray, desktop widgets, and Service Alerts as desktop notifications. `.exe` and `.msi` for Windows, `.dmg` for macOS, `.deb`, `.rpm` and `.AppImage` for Linux, on Intel, AMD and Arm, built by GitHub Actions ([flutter/installers/README.md](flutter/installers/README.md); on a Linux machine of your own, [flutter/installers/linux/LINUX-BUILD.md](flutter/installers/linux/LINUX-BUILD.md)). See [flutter/README.md](flutter/README.md), "The desktop app". Versions 2.0.0 to 2.4.8 were the web app in an Electron window (`desktop/`, now in git history); they update to the Flutter app in place.

### [Command Line for Linux](cli/) — [releases](https://github.com/augy-studios/sgbus-timings/releases)
`sgbus`: timings, search, routes, the route planner, Navigate, favourites, routines, service alerts and the weather in the terminal, running the site's own planner and search code. One file needing only Node.js 18, or an any-architecture `.deb`, built with plain Node. See [cli/README.md](cli/README.md).

### [Telegram Bot](telegram-bot/) — [@sgbus_app](https://t.me/sgbus_app)
"Singapore Bus Timings" — a Telegram bot for looking up live arrivals, finding nearby stops, working out which buses run between two stops, and saving favourites, right from a chat. See [telegram-bot/README.md](telegram-bot/README.md) for full details.

### [Guide](docs-site/) at [guide.sgbus.uwuapps.org](https://guide.sgbus.uwuapps.org/)
How to use the web app, the Android app, the Windows, macOS and Linux app and the Telegram bot, as a GitBook-style docs site. See [docs-site/README.md](docs-site/README.md) for writing pages and deploying.

## License

See [LICENSE](LICENSE).
