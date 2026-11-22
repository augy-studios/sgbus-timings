Train times at every MRT and LRT station, by LTA's timetable and with a disruption's changes, from a station search, the map, Navigate's train rides, the Telegram bot and the command line, with the last trains marked in red, and offline too. Places opens its form in a window of its own, and Restart to update no longer hangs on Windows.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.7.0.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.7.0-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.7.0-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.7.0-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.7.0-all.deb`, or `sgbus` |

The Linux files need Ubuntu 22.04, Debian 12 or newer.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray.

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.7.0 is out; install the new one over the old one.

**Wear OS**: nothing has changed on the watch, so there's no hurry to install 2.7.0 on it.

Your favourites and settings stay when you update.

## What's new

### Train times
- **At a station**: search for a station and tap **Train times** for its next trains, every line each way, with the platform and the minutes until each.
- **The last trains**: when each platform's last train leaves today, with its last three marked 3rd last, 2nd last and Last train in red.
- **During a disruption**: LTA's changes show over the timetable, a late train with its new time and a cancelled one crossed out. LTA gives live train times only then.
- **On the map**: a station's card has its next trains and last train too.
- **In Navigate**: a train ride lists the next trains that reach where you get off, and warns you when the one you'd catch is one of the last three.
- **Offline**: every station's usual timetable is kept on your device.

### Website, Android and desktop apps
- **Easier to read**: the last trains' red and the map's bubbles in dark mode meet WCAG's AA contrast, and a late train says New time in words, not only in colour.
- **A place's own window**: Save a new place and Edit open their form in a window of its own.

### Desktop app
- **Restart to update on Windows**: the app closes cleanly to update, rather than hanging as Not responding.

### Telegram bot
- **🚆 Train times**: a station search has a button for the station's next trains, every line each way, with 🔄 Refresh.

### Linux command line
- **`sgbus trains`**: `sgbus trains tampines`, or `sgbus trains EW2`, lists a station's next trains on every line, each way.
