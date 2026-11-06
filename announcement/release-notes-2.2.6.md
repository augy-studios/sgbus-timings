Buses timed by live traffic, trips that find another way by themselves, the Newsfeed of road closures and service changes, bus and train plans with no connection, a stop on the way in Navigate, and Settings in groups.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.2.6.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.2.6-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.2.6-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.2.6-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.2.6-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.2.6-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.2.6-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.2.6-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. Install this one if you use the Get Off Alert with a Bluetooth earpiece: the beeps reaching it are new in the app itself. Everything else below is already in the app you have.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.2.6 on it.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**. Nothing has changed in the desktop app itself, so there's no hurry.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.2.6 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux**: the single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.2.6-all.deb`. New to it? It needs Node.js 18 or newer (Debian 12, Ubuntu 24.04 and later have it); `sgbus help` lists everything.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Android app
- **Get Off Alert in a Bluetooth earpiece**: with the alert's sound set to **Earphones only**, its beeps now reach an earpiece or hearing aid that only takes calls, not just earphones for music. Without any in, the phone only buzzes, never beeps out loud.

### Command line for Linux
- **Midnight as 00:00**: a last bus at midnight says 00:00, not 24:00.

### Navigate
- **Buses timed by the traffic**: setting off now, buses go by LTA's live traffic, so a bus through a jam takes longer and a train can win. A slowed bus says by how much and why: the roads by name, and any accident or breakdown on its way.
- **Traffic on the map**: tap where it says a bus is slowed to see its road on the live map, green when clear, orange when slow, red when jammed, with its incidents marked.
- **A stop on the way**: Bus and train can add one stop between From and To, and plans each half on its own. Links, shares and trips keep it.
- **Walking and cycling**: where walking the whole way might be as quick, Navigate says how long it takes. Turn on **Cycling** in Settings for how long cycling takes too. Each has **Walk it** or **Cycle it** on the live map.
- **Last buses**: a way says when you'd be catching a bus within half an hour of its last of the day.
- **Plans with no connection**: offline, Bus and train plans on your phone, between stops, stations, your location or your places. Its times are estimates, and it plans again when you reconnect.

### On a trip
- **Another way, found for you**: when a last bus on your trip is lost, the trip finds another way and switches to it by itself. A buzz and a notification say what to do now ("after Bus 21 to Blk 390, walk 3 min to Opp Blk 5, take Bus 12 there"), with **Undo** on the trip bar.
- **A faster way**: every few minutes while you wait or ride, the trip looks for a quicker way. If one saves enough, the trip bar suggests it and says why: **Reroute** takes it, **Keep my way** doesn't.
- **Last bus soon**: a red warning on the trip bar, with a buzz and a notification, when a bus you've still to catch is down to its last three of the day, its last bus leaves before you'll reach the stop, or it's gone.
- **Change here**: **Change my way** on the trip's timeline puts **Change here** beside every stop ahead. Pick one, then a way on from there, and the trip changes to it, the Get Off Alert and all.
- **Minutes left by live timing**: while you wait at the stop, the trip bar, the live map and a shared ETA count the wait by your bus's live timing there.
- **Trips follow the roads**: on the live map, a bus ride's line runs along the roads the bus takes, and every walk's dotted line along its streets, not straight across.
- **Walks off the footpaths**: where the footpaths stop short of a place, such as on an industrial road, the walk goes the last stretch along the road and says so, so you can watch for traffic. Never along an expressway.
- **Other direct buses**: a bus stop tapped on the trip bar's timeline shows the other buses that go straight there too, not only yours.

### Service alerts
- **The Newsfeed**: what LTA and SBS Transit, SMRT, Tower Transit and Go-Ahead Singapore announce ahead of time, such as roads closed for a run and the stops buses skip, night closures, new services and train service changes. It shows what's on in the next two weeks with the buses affected, and marks anything that names your favourite stops or buses.
- **Newsfeed notifications**: a third kind beside trains and traffic, for all news or service changes only.
- **Skipped stops on a stop's timings**: when buses skip a stop today or tomorrow, its timings say which and for how long.

### Explorer and the map
- **Singapore's map, offline**: the download button on Explorer saves the whole map of Singapore, under 50 MB, so it works with no connection. **Update map** and **Remove** are on the same panel.
- **The MRT and LRT lines**: drawn in their colours under the stations and stops.
- **Interchanges as pills**: a station on more than one line is a pill in all their colours, split on a slant as on the MRT's signs.
- **More on a stop's card**: tap a bus for its timings at the stop, or **Show bus timings** for the stop's full timings.
- **The map starts afresh**: Explorer and the live map open flat and north up, without gliding over from where you left them.

### Settings and pages
- **Minimal or Full**: the very first time you open the app, it asks. Minimal keeps to the essentials, with Glance, Service alerts, Your trips and the Edge Tray's optional buttons off; Full has everything. Either can be changed in Settings later. If you've used the app before, it doesn't ask.
- **Settings in groups**: Settings opens on a list: **You**, **Pages and Edge Tray**, **Trips and alerts**, **Navigate**, **Help and extras** and **Sync**. **Find a setting** at the top searches them all.
- **Turn pages off**: Glance, Service alerts, Your trips, Card value and Receive nearby can each be turned off in **Settings** > **Pages and Edge Tray**, and it syncs to your other devices.
- **Offline, the app steps aside**: with no connection, pages that need one step aside and Favourites opens instead. They're all back when you reconnect.
- **Refresh one bus**: round arrows under each bus's **Flag** button fetch that bus's timings alone.
- **Refresh on Glance**: a round button beside the stops chip fetches the times at once.
- **Tours for Explorer and the terminal**: each shows you round the first time it opens. **Settings** > **Show me around** has them again.
- **The terminal's full width**: with the Edge Tray tucked away, the sgbus terminal uses the whole window.

## What's fixed
- **A last bus at midnight said 24:00**: it says 00:00 now, in a stop's timings, Explorer, on a trip and in the command line.
- **The bottom of a page was hidden under the trip bar**: while a trip runs, the page scrolls far enough to clear the trip bar, however tall it gets.
- **Turn on location popped up by itself**: Favourites and Glance no longer ask on their own. Only tapping **Nearby** or **Use my location** does.
