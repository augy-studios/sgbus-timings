IKEA's Tampines shuttle ends on 31 Dec 2026. Until then, a way or a trip on it says so; from 1 Jan 2027 it shows as Discontinued, and Navigate stops using it, on every platform.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.8.1.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.8.1-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.8.1-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.8.1-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.8.1-all.deb`, or `sgbus` |

The Linux files need Ubuntu 22.04, Debian 12 or newer.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray.

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.8.1 is out; install the new one over the old one.

**Wear OS**: nothing has changed on the watch, so there's no hurry to install 2.8.1 on it.

Your favourites and settings stay when you update.

## What's new

### Shuttle buses
- **IKEA's shuttle ends on 31 Dec 2026**: until then, a way or a trip that rides IKEA's Tampines shuttle says so, at the top of the way, under it in the list and on the trip's timeline.
- **Discontinued**: from 1 Jan 2027, an ended shuttle stays in Bus timings and on the map's cards, but says Discontinued in place of its times, with no live times.
- **Never in Navigate once it's ended**: judged by the date of the trip you're planning, so a trip for 2 January leaves it out even in December.
- **Discontinued shuttles in Explorer**: a layer in Layers for ended shuttles' routes, drawn dashed, and their own stops. It's off until you turn it on.

### Telegram bot
- **/nav says when a shuttle ends**: a way on IKEA's shuttle says it ends on 31 Dec 2026, and after that the bot stops offering it.

### Linux command line
- **`sgbus nav` says when a shuttle ends**: the same notice, on a way that rides IKEA's shuttle.
