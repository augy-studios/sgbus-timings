Other UwU apps' links opening in their own app on the desktop, the other buses that go straight to your stop while you wait on a trip, and timeline stops you can tap again.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.1.2.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.1.2-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.1.2-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.1.2-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.1.2-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.1.2-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.1.2-x86_64.AppImage` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. Nothing has changed in the Android app itself in this version, so there's no hurry: everything new below is already in it.

**Wear OS**: install the new `-watch.apk` the same way as before, from a computer (see the guide's Wear OS page). Nothing has changed on the watch in this version, so there's no hurry.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.1.2 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Desktop apps
- **Other UwU apps' links reach them**: with another UwU desktop app installed too, such as uwuPromptr, its `uwu://` links now open that app rather than SG Bus Timings, whichever of the two you opened last. `uwu://sgbus/` links open SG Bus Timings as before.

### Everywhere
- **Other direct buses**: on a trip, while you wait at the stop, the trip bar lists the other buses that go straight to the same stop, with how long each is: **Also direct: 51 in 3 min**. The timeline lists them under each bus ride too.

## What's fixed
- **Timeline stops**: on some trips, such as ways found by OneMap in Navigate, the bus stops on the timeline were plain names that did nothing when tapped. Tapping one now shows that stop's timings for your bus again, and a trip already under way gets its stops back too.
- **Zoomed in after picture-in-picture**: on Android, opening the app again from its small picture-in-picture window left the page zoomed in, with the side buttons cut off, worse each time. It now comes back at its usual size, where you left it; now and then it reloads to get there, and a trip carries on.
