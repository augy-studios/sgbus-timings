The last call on every platform: a trip buzzes "NOW" in Morse code a stop before you get off, and "END" when you arrive, with what the trip cost, how far you went and the coins it earned. Every bus in Navigate gets Route on the map, and its timings button shows every bus straight to where you get off.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.8.0.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.8.0-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.8.0-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.8.0-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.8.0-all.deb`, or `sgbus` |

The Linux files need Ubuntu 22.04, Debian 12 or newer.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray.

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.8.0 is out; install the new one over the old one.

**Wear OS**: nothing has changed on the watch, so there's no hurry to install 2.8.0 on it.

Your favourites and settings stay when you update.

## What's new

### Trips
- **The last call**: a stop before you get off, the phone buzzes "NOW" in Morse code and says Ring the bell NOW on a bus, or Get off at the next station on a train. It takes the Get Off Alert's place on a short ride, so you're buzzed once, not twice.
- **Trip ended**: as you arrive, the phone buzzes "END" in Morse code and sums the trip up: about what its rides cost by card, how far you went and the uwuCoins it earned.
- **Every direct bus from a stop**: tap a bus stop on the trip's timeline for your bus and every other bus that goes straight from there to where you get off.

### Navigate
- **Route on the map**: every bus on a way has a button for the part you ride on the live map, with its stops and its road coloured by the traffic, slowed or not.
- **Every direct bus in the timings**: a bus's timings button shows that stop's timings for every bus that goes straight to where you get off, not just the one.

### Android app
- **Alarms & reminders, asked once**: in the app from Google Play, the first time you turn on a last bus reminder, Time to leave or a routine, the app asks you to allow Alarms & reminders, so they come on time.
- **New versions from Google Play**: in the app from Google Play, New versions of the app now works too. It tells you once Google Play has the new version for your phone, and opens the Play Store.

### Telegram bot
- **Buttons work again**: since 2.6.0, tapping an inline button, such as Train times, a stop list or Refresh, did nothing. They all answer again.
- **/nav's route on the map**: each bus on a way has a 🗺 route on the map button, slowed or not.
