Explorer, which train door to stand at, the live map in 3D, Glance on a page of its own, and the Linux command line's prompt inside the web app.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.2.5.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.2.5-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.2.5-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.2.5-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.2.5-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.2.5-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.2.5-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.2.5-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. Nothing has changed in the Android app itself: everything below is already in the app you have, so there's no hurry.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.2.5 on it.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**. Nothing has changed in the desktop app itself, so there's no hurry.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.2.5 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux**: this is the one that needs 2.2.5. The single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.2.5-all.deb`. New to it? It needs Node.js 18 or newer (Debian 12, Ubuntu 24.04 and later have it); `sgbus help` lists everything.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Command line for Linux
- **The same commands as the web app's terminal**: one set of commands runs both, so they answer the same. `nav` and `place set` take plus codes as well as addresses, stops, stations and coordinates.
- **Safer to print**: text from the data, such as a calendar event's title or a place synced from another device, can't send your terminal its own escape codes. Only sgbus's colours get through.
- **Your calendar's link stays private**: `sgbus calendar set <link>` isn't kept in what Up brings back, or in `~/.cache/sgbus/history`.

### Android app
- **Picture-in-picture can be turned off**: **Settings** > **Picture-in-picture** > **Off**, and leaving the app on a trip or the map sends it to the background like any other app, without the small window.

### Everywhere
- **Explorer**: the map button in the Edge Tray opens the live map with every bus stop and MRT and LRT station round you as a dot. Tap a stop for every bus there, green while it's running, red once it's down to its last three buses of the day, grey when it isn't running. Tap a station for its codes in their lines' colours and, a platform at a time with arrows at the sides, the doors nearest its escalators, lifts and stairs and where each leads. Every card has **Directions**, to Navigate's Bus and train from where you are. Turn it off in **Settings** > **Edge Tray buttons**.
- **Tap the stops on your trip**: on the live map, a trip's stops and stations, and the stop a walk goes to, open the same cards.
- **Which train door to stand at**: on a train ride in Navigate, the doors that stop nearest the escalators, lift and stairs where you get off, or nearest the way to your next line when you change. At almost every MRT station, including Expo and Changi Airport, with where they lead: the exit, another line, Jewel, a terminal or a mall. Each door is drawn as the platform door, with the number it shows and where on the door to find it.
- **The live map in 3D**: sharper at every zoom, with shops, stops and street names. Drag two fingers up to tilt it and the buildings stand up; twist two fingers to turn it. Dark mode has a dark map, and every part of Singapore you've looked at is kept, so it opens at once and works offline, underground too.
- **The map turns with you**: the compass button keeps the map on you, the way your phone points up, like a map app's compass mode.
- **Glance**: the next bus in big letters, the weather and your stops' buses, on a page of its own with the eye button at the top of the Edge Tray. Once you've starred buses, it shows only those. **Settings** > **Next bus at a glance** turns it off.
- **Pages in the Edge Tray**: Bus timings, Favourites, Navigate, Service alerts, Your trips and Places are each a page, with **Custom home** in Settings picking the one the app opens on. Back closes what's open, then goes back a page, before leaving the app.
- **A tour for every page**: each page shows you around the first time you open it. **Settings** > **Show me around** has them all again.
- **The sgbus terminal**: the Linux command line's `sgbus>` prompt, full screen in the web app. Type `84009`, `nav home work` or `favs -w` instead of tapping. Open it from **Settings** > **Open the sgbus terminal**, with Ctrl+` on a computer, or by typing `sgbus` in your browser's console. What it saves is the app's own, so `fav add 84009` is a favourite on Bus timings too.
- **Minutes left on a trip**: the trip bar, and the Android app's trip notification, end with how long is left to the end of the whole trip, waits included.

## What's fixed
- **A trip ended when the app was closed**: closing the app from recent apps, or Android closing it in the background, ended the trip with no trace, and its shared ETA never arrived. Opening the app again now picks the trip back up, if it was still going within the last 3 hours.
- **Ways found by OneMap came out too quick**: they left out the waits for the buses and trains, so a trip of over an hour could show about 50 minutes. They count the waits now.
- **Loop buses looked closer than they were**: on a loop that comes back up the same road, like 183 on Clementi Rd, a bus still on its way out could show as about 1 km away when it had about 7 km to go round. Its distance is along the route now.
- **Settings out of reach on a trip**: the trip bar covered the bottom of the Edge Tray. The tray now scrolls clear of it.
- **Next bus at a glance couldn't be turned off**: its On and Off in Settings did nothing. Off now takes Glance out of the Edge Tray.
- **Someone's ETA wouldn't close**: the window for a shared ETA link came straight back after its X or Back. It closes now.
