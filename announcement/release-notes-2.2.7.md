Save a bus at a stop, lists of favourites, the app in 中文, Bahasa Melayu and தமிழ், high contrast, and a trip notification that shows the bus or train you're on.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.2.7.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.2.7-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.2.7-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.2.7-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.2.7-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.2.7-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.2.7-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.2.7-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. The trip notification, Back twice to exit and your phone's font size need this version: everything else below is already in the app you have.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.2.7 on it.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**. Nothing has changed in the desktop app itself, so there's no hurry.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.2.7 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux**: the single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.2.7-all.deb`. Nothing has changed in it in this version, so there's no hurry. New to it? It needs Node.js 18 or newer (Debian 12, Ubuntu 24.04 and later have it); `sgbus help` lists everything.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Android app
- **The trip notification shows where you are**: its icon is a bus, a train or walking for the part of the trip you're on, in the train line's colour, with the bus or line ("Bus 174", "EW Line") beside the app's name.
- **Press back twice to exit**: with nothing open, **Back** says "Press back again to exit" on any page, and a second press within two seconds leaves the app. A trip you're on carries on in the background.
- **Your font size**: the app's text follows your phone's font size (**Settings** > **Display** > **Font size**), even when you change it while the app's in the background.

### Favourites
- **Save a bus at a stop**: each bus in a stop's timings has a star. Tap it to save just that bus at just that stop, as LTA's MyTransport does. Favourites lists them under **Buses at stops**, one chip per stop: tap it for that stop's timings with only those buses. Glance shows only them at that stop too.
- **Lists**: group your favourites into lists, such as Work or School, with **New list** at the top of Favourites. Favourites itself keeps every favourite. A list can be renamed, changed or deleted, and deleting one leaves what was in it in Favourites. Each list with a stop in it is a choice on Glance too, with just its buses. Lists and buses at stops sync to your other devices.

### Languages and looks
- **English, 中文, Bahasa Melayu, தமிழ்**: pick the app's language in **Settings** > **You** > **Language**, each with its flag and its name in its own words. Until you pick, the app follows your phone's language. Glance, Bus timings, Navigate, the trip bar, Settings, Favourites and Theme are translated so far, and the rest is still in English. Think a translation looks wrong? **Tell us**, under the list.
- **High contrast**: in **Theme**, black or white text, solid cards and clear edges. It follows your phone's high contrast setting unless you turn it on or off there.
- **A secret**: ride every MRT and LRT line at least once with the Get Off Alert and see what you unlock. Only rides you really take count.

### On a trip and offline
- **Room to type on a trip**: with the keyboard up, the trip bar shrinks to one line, so you can see what you're typing and its suggestions.
- **Explorer offline**: once Singapore's map is saved, Explorer works with no connection, and its stop cards show which buses run there.

### Easier to use
- **Easier with a screen reader**: windows take the focus when they open and give it back when they close, and Esc closes them. Bus timings read out how full a bus is and when a time is an estimate. Search suggestions can be picked with the arrow keys and say how many there are. The Settings switches say what they're for, and pages have proper headings.
- **Easier with a keyboard**: a clear ring shows where you are.
- **Bigger text**: text follows your browser's text size, small buttons are easier to tap, and the departures board's rows grow with the text. Stop and station cards on the map can be pinched to zoom.
- **Less motion**: with your phone or computer set to reduce motion (**Remove animations** on Android), the page and the map jump rather than glide.
- **Copy a stop's name or code**: press and hold a stop's name, its code or a bus number to copy it.
- **Love SG Bus Timings?**: about once every six months, a small window asks if you'd consider donating. Never in your first two weeks, on a trip or offline, or if you've turned the coffee button off in Settings.

## What's fixed
- **Station names in capitals**: some ways in Navigate said "PASIR RIS MRT STATION". They say "Pasir Ris station" now.
- **Share my ETA with no connection**: it was offered offline, where live progress can't be sent. It now leaves the trip bar until you reconnect, and Offline Sharing still sends a place or directions to a phone nearby.
- **The trip bar talked over a screen reader**: it announced itself every minute. It doesn't any more.
