# SG Bus Timings

Real-time Singapore bus arrival timings, powered by [LTA DataMall](https://datamall.lta.gov.sg/), available as a web app, Android, Windows and Linux apps, and a Telegram bot. The web app's weather and air quality come from [Open-Meteo](https://open-meteo.com/) and NEA via [data.gov.sg](https://data.gov.sg/).

## Projects

### [Web App](main-site/) — [sgbus.uwuapps.org](https://sgbus.uwuapps.org/)
A Progressive Web App (PWA) for live bus arrival timings, with favourites, route maps, themes, and offline support. See [main-site/README.md](main-site/README.md) for full details.

### [Android App](android/) — [releases](https://github.com/augy-studios/sgbus-timings/releases)
The web app as an Android app (`org.uwuapps.sgbus`), made with Capacitor: the live site in the app, plus what only an app can do: following a trip with the screen off, notifications through Firebase, reading a card's value over NFC, the phone's calendar, and opening SimplyGo. Shared as an APK file for now. See [android/README.md](android/README.md) for building it, [android/FIREBASE-SETUP.md](android/FIREBASE-SETUP.md) for its notifications, and [release/README.md](release/README.md) for publishing it on GitHub.

### [Windows and Linux Apps](desktop/) — [releases](https://github.com/augy-studios/sgbus-timings/releases)
The web app in its own window, made with Electron, with a tray icon and Service Alerts as desktop notifications. `.exe` and `.msi` for Windows, `.deb` and `.AppImage` for Linux (built on the VPS: [desktop/LINUX-BUILD.md](desktop/LINUX-BUILD.md)). See [desktop/README.md](desktop/README.md).

### [Telegram Bot](telegram-bot/) — [@UwUsgbus_bot](https://t.me/UwUsgbus_bot)
"Singapore Bus Timings" — a Telegram bot for looking up live arrivals, finding nearby stops, working out which buses run between two stops, and saving favourites, right from a chat. See [telegram-bot/README.md](telegram-bot/README.md) for full details.

### [Guide](docs-site/) at [guide.sgbus.uwuapps.org](https://guide.sgbus.uwuapps.org/)
How to use the web app and the Telegram bot, as a GitBook-style docs site. See [docs-site/README.md](docs-site/README.md) for writing pages and deploying.

## License

See [LICENSE](LICENSE).
