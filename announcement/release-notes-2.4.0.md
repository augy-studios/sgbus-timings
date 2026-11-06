The Android app rebuilt as an app of its own, in Material You by default, with Explorer on a proper map, plus team runs for the feats and every stop in a list on Glance.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.4.0.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.4.0-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.4.0-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.4.0-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.4.0-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.4.0-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.4.0-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.4.0-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. 2.4.0 is a bigger download than before, about 100 MB, so you may want to be on Wi-Fi. Install it over the old one as usual: the first time it opens, everything you've saved comes across by itself, once, with nothing to do and nothing to sync.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.4.0 on it.

**Windows (`.exe`), Mac and AppImage**: the app checks as it opens and every hour, downloads the update, and offers **Restart to update**. To get it sooner, right-click the tray icon and pick **Check for updates...**. Nothing has changed in the desktop app itself: it's numbered 2.4.0 to stay in step with the Android app, and the website's changes below are already in the app you have.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.4.0 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one. There's no hurry, as nothing has changed in it.

**Command line for Linux**: the single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.4.0-all.deb`. Nothing has changed in it in this version, so there's no hurry.

Your favourites and settings stay when you update.

## What's new

### Android app
- **A real Android app**: until now the app showed the website inside it. From 2.4.0 every screen is the app's own, built for Android, so it opens straight away, and scrolls and animates smoothly.
- **Everything comes across**: the first time 2.4.0 opens, it brings over your favourites and lists, places, past searches, trips, routines, reminders, uwuCoins, feats and Easter eggs, your calendar's link and every setting. A note at the bottom says so.
- **Material You by default**: the app follows your phone, in its own font and, on Android 12 and later, your wallpaper's colours, with solid cards, pill buttons and sheets that slide up from the bottom. In **Theme**, **Colours** picks your wallpaper's or Your colours, once an Easter egg has unlocked it.
- **The UwU Apps theme**: turn **Material You** off in **Theme** for the look you know from the website, with its Jua font and glass cards. **Mode** and **High contrast** work in both.
- **The Edge Tray, smoother**: the same tray with the same buttons, now sliding in and out as the website's does, with your favourites' count and your uwuCoins on it.
- **Explorer on a proper map**: Explorer and the live map are faster and sharper, with the shuttle buses' routes and stops, station doors and **Save the map** for offline as before.
- **Everything else, as on the website**: Bus timings, Glance, Navigate and the route planner, Service alerts, the Get Off Alert with **Change here** and Are you walking?, Your trips, Places, Calendar, uwuCoins, the wheel and team runs, Sync, sharing, Card value, the sgbus terminal, the tours, offline mode, picture-in-picture and shake to refresh.

### Everywhere
- **Team runs**: speedrun the feats with friends. In **Settings** > **Achievements** > **Team run**, one of you starts a team and sends the invite, and up to eight of you join with its link or code. Rides and trips any of you take count for the whole team, and everyone gets each feat the team does, with its 100 uwuCoins.
  - Hand a trip on by starting yours where a teammate's ended, within 30 minutes, and it counts as one trip: **Continue from there** plans from where they got to.
  - Only rides your location shows you took count, and only feats done after you joined. A team run ends 14 days after its last ride.
- **Material You is the Android app's**: your phone's colours and the Material You look aren't a secret an Easter egg unlocks any more. They're in the Android app's **Theme**, and the website no longer has them. Easter eggs unlock Your colours and bring their presets, as before.

## What's fixed
- **Every stop in a list on Glance**: Glance showed only the first four stops of a list or of your saved stops, so a stop added after those never showed. Now it shows every stop you've picked, up to twelve. Nearby and a place still show the nearest four.
- **A shared feat closes**: opening someone's feat link showed their feat, but **Later**, the close button or a tap outside only brought it back. Now any of them closes it.
