Time for immigration on journeys across the Causeway, a prompt of its own for the Linux command line, and wildcards in routines.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.2.3.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.2.3-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.2.3-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.2.3-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.2.3-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.2.3-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.2.3-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.2.3-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. Only wildcards in routines need this version: everything else below is already in the app.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.2.3 on it.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**. Nothing has changed in the desktop app itself, so there's no hurry.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.2.3 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux**: the single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.2.3-all.deb`. New to it? It needs Node.js 18 or newer (Debian 12, Ubuntu 24.04 and later have it); `sgbus help` lists everything.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Command line for Linux
- **Its own prompt**: type `sgbus` on its own and it opens `sgbus>`, where each command goes without `sgbus` in front: `84009`, `nav home work`, `favs`. Up and down bring back what you typed, even from last time, Tab finishes a command or a place's name, and `exit` leaves. Ctrl+C stops timings kept on screen with `-w` and goes back to the prompt.
- **Immigration time**: routes and navs across the Causeway count it and show the step, as below; `sgbus settings customs 30` sets your own.
- **Wildcards in routines**: `sgbus routine add 84009 07:45 --buses 22*`.

### Android app
- **Wildcards in routines**: a routine's buses can be `22*`, for every bus starting with 22, and its notification shows just those.

### Everywhere
- **Immigration across the Causeway**: journeys to Johor Bahru, and back, count the time to get off at the checkpoint, clear immigration on both sides and get on again, and show it as a step of its own. About 15 minutes when it's quiet and up to an hour at the rush, by when you'd get there: weekday mornings into Singapore, weekday evenings and Friday nights out, Saturday mornings out and Sunday evenings back. In Navigate, the route planner and the Telegram bot.
- **Immigration time**: in **Settings** > **Immigration time**, **By the time**, or the time you usually take: **15 min**, **30 min**, **45 min** or **1 hr**.
- **Off at each checkpoint**: on a trip across the Causeway, the Get Off Alert tells you to get off at both checkpoints, with the time to clear as the wait before getting on again.

## What's fixed
- **Journeys to Johor Bahru were far too quick**: the crossing counted as an ordinary 9-minute bus ride, as if nobody got off for immigration. Changi Airport to Larkin Terminal showed about 2 hours 36 minutes; it now counts an extra 15 minutes to an hour for clearing both checkpoints, depending on the time.
