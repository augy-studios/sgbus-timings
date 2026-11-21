Navigate sorts its ways as you like, with each way's fare and the buses you'd catch, live, and a trip shows the part you're on stop by stop, with bubbles on the map where to board, change and get off, on every platform.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.6.0.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.6.0-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.6.0-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.6.0-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.6.0-all.deb`, or `sgbus` |

The Linux files need Ubuntu 22.04, Debian 12 or newer.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray.

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.6.0 is out; install the new one over the old one.

**Wear OS**: nothing has changed on the watch, so there's no hurry to install 2.6.0 on it.

Your favourites and settings stay when you update.

## What's new

### Navigate
- **Sort the ways**: Best (your buses first, and a long walk counted for more), Fastest, Least walking or Fewest changes, kept for next time. Each way is tagged with what it's best at.
- **Your buses**: Preferred buses in Settings, going anywhere, and the buses you like to take to a place, in Places. A way on one is tagged Your bus and comes first in Best.
- **The fare**: roughly what each way costs by card, for the Fare type in Settings: Adult, Student, Senior or PwD, or Workfare.
- **Live buses**: setting off soon, every bus that goes straight from your first stop to where you'd get off, each with its next three in the colour of how full it is.
- **A bus to your door**: the best way ending on each bus or line is kept, beside a quicker one that leaves you a long walk.

### Trips
- **The strip**: under the trip bar, the part you're on stop by stop, with the stops, minutes and distance left, and an icon for each part of the trip.
- **Bubbles on the map**: Board 228, Change to 70 and Get off over the stops still ahead, and pins where the trip starts and ends.
- **You as a bus**: on a bus or a train, you're a round badge in the ride's colour on the map; driving or cycling, a car or a bike.

### Android app
- **Live Updates**: on Android 16 and later, a trip can stay at the top of your notifications and on the lock screen, with a chip in the status bar. On your first trip the app says where to turn it on, and Settings, Trips and alerts says whether it's on.

### uwuCoins
- **A spin costs 50**: the wheel now costs 50 uwuCoins a spin, not 100, on the website, the apps and the Telegram bot.

### Telegram bot
- **/nav sorts, tags and prices its ways** as Navigate does, with the buses you'd catch, live. Fare type and Preferred buses are in /settings, and Buses to take here on each place in /places.

### Linux command line
- **`sgbus nav` sorts and prices its ways** as Navigate does: `--sort walk` for one go, or `sgbus settings sort`, `fare` and `buses` to keep them, and `sgbus place buses home 228` for a place's own.
