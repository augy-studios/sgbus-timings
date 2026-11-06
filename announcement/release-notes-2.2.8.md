Bus times by the clock, NUS and NTU campus shuttles, Stops near me on Bus timings, Report a bug, back to Navigate from a trip, and updates in your phone's own colours on Android and as the desktop app opens.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.2.8.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.2.8-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.2.8-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.2.8-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.2.8-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.2.8-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.2.8-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.2.8-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. The new update page and the page never zooming out need this version: everything else below is already in the app you have. You'll see the new update page from the next update on.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.2.8 on it.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**. From 2.2.8 on, the app also checks each time it opens, in a small window of its own.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.2.8 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux**: the single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.2.8-all.deb`. Nothing has changed in it in this version, so there's no hurry. New to it? It needs Node.js 18 or newer (Debian 12, Ubuntu 24.04 and later have it); `sgbus help` lists everything.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Android app
- **Updates in your phone's colours**: the update page is a page of its own in Material You, its colours from your wallpaper on Android 12 and later, light or dark as your phone is. Each version is on a timeline with what's new in it, the one you'd get open with its changes in cards, and the one you have marked **Installed**. Tap any earlier version to see what came with it. While it downloads, a wavy line grows along its track.

### Desktop app
- **Updates as it opens**: a small window with the app's icon checks for a new version each time the app opens. One it can install downloads there with a bar, then it installs and opens again as the new version. **Later** opens the app straight away and finishes the download in the background. **Restart to update** shows the same window as it installs.

### Bus timings
- **Clock times**: in **Settings** > **Pages and Edge Tray** > **Bus times**, pick **Clock time** to see when each bus comes, such as 14:32, rather than how long till it does. A stop's timings, the incoming buses bar, Glance, the departures board, Navigate and the desktop app's widgets all follow it, and it syncs with your other devices.
- **NUS and NTU campus shuttles**: at a stop the universities' shuttles call at, **Campus shuttles** lists them under the live buses, each in its route's colour, with how often they run or their next departures. They're the universities' timetables, not live times. Public holidays run to Sunday's times.
- **Stops near me on Bus timings**: the stops around you are a list right on Bus timings' page, nearest first, with your favourites pinned. Once you've allowed your location, it finds them by itself.

### Navigate and trips
- **Back to Navigate**: on a trip's timeline, beside **Change my way**, it opens Navigate as it was when you started the trip, with the way you picked, on **Bus and train** or **Bus only**.
- **Places far from any stop**: a place with no stop or station within 900 m, such as a ferry terminal or a lodge out in Tuas, used to get no way at all. Navigate walks you to the nearest stops and stations within 3 km, and says how far the walk is.

### Explorer
- **Campus shuttles on the map**: NUS's and NTU's shuttle routes, each in its own colour, with their stops. A stop's card lists the shuttles that call there.
- **Back where you left it**: **Show bus timings** or **Directions** on a card closes Explorer; open it again and it's back on that stop or station, its card open.

### Help
- **Report a bug**: in **Settings** > **Help and extras**, say what went wrong and it reaches Augy on Telegram, with the app's version and your device to help track it down. A way to reach you is optional.

### Telegram bot
- **Clock times**: **Show clock times** in `/settings` shows each bus as the time it comes, in a stop's timings, `/nav` and a route's journeys. It syncs with the app's **Bus times**.

## What's fixed
- **Pages zoomed out on a phone**: some stops, such as 17179, zoomed the whole page out, everything tiny. They fit now, and the Android app keeps the page at its own size whatever's on it.
- **Room beside the Edge Tray**: with the tray open, the page stopped at its arrow. It reaches the tray's buttons now, about a finger's width more on a phone.
- **"~ ∞m" and "NaN"**: a bus with no position says **no GPS**, and an empty slot shows a dash.
- **Favourites on narrow screens**: **New list** wraps under the tabs, and a bus at a stop's chip keeps its bus numbers.
- **Blank tiles on the saved map**: offline, a few places lost their whole tile, 3D buildings and all. Every tile shows now: save the map again in Explorer to get the fix.
- **Change my way's icon**: it filled half the trip's timeline. It's the size of the others now.
- **`/start` in the Telegram bot**: in a private chat it answered with nothing. It's back, with its **Open web app** button.
