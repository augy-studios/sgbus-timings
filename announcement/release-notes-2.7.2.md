The last trains on Navigate's ways and trips on every platform, as the last buses are: a way says when its train is one of the day's last three, and a trip warns you before the last one goes. Restart to update no longer hangs on Windows.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.7.2.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.7.2-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.7.2-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.7.2-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.7.2-all.deb`, or `sgbus` |

The Linux files need Ubuntu 22.04, Debian 12 or newer.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray.

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.7.2 is out; install the new one over the old one.

**Wear OS**: nothing has changed on the watch, so there's no hurry to install 2.7.2 on it.

Your favourites and settings stay when you update.

## What's new

### Navigate
- **The last trains on each way**: a way whose train is one of the day's last three to where you get off says so on its card, as a bus near its last does: 3rd last, 2nd last or Last train, and when the last one leaves, by LTA's timetable. Its train ride says it too.

### Trips
- **Last train soon**: a trip keeps an eye on the last train for every train you've still to get on. The bar warns once yours is one of the last three, when the last leaves before you'd get to the platform, or once it's gone, buzzing and with a notification the first time.
- **Another way for a lost last train**: one you'll miss has the trip find another way and switch to it, with Undo, as a lost last bus does.

### Desktop app
- **Restart to update doesn't hang**: on Windows, if closing to update stalls, the app ends itself after a couple of seconds, so the update carries on rather than the window showing Not responding. The update to 2.7.2 itself still runs 2.7.1's way of closing, so it may hang this one last time.

### Telegram bot
- **/nav's last trains**: a way whose train is one of the last three says so, such as ⏰ 2nd last EW train, last 00:12, and its ride says how many are left.

### Linux command line
- **`sgbus nav`'s last buses and trains**: a way near its last bus, or with one of the last three trains, says so in red, in the list and step by step.
