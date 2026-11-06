A command line for Linux, Navigate all the way to Larkin Terminal, several buses at a stop at once, routines you can edit, access for people who work in restricted areas, and sync with the Telegram bot.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.2.2.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.2.2-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.2.2-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.2.2-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.2.2-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.2.2-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.2.2-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture (new) | `sg-bus-timings-cli-2.2.2-all.deb` |
| Command line on any other Linux (new) | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. Only a routine's notification opening on just its own buses needs this version: everything else below is already in the app.

**Wear OS**: nothing has changed on the watch in this version, so there's no need to install 2.2.2 on it.

**Windows (`.exe`), Mac and AppImage**: the app downloads the update by itself within the hour, then a notification (unless **New versions of the app** is off in Service alerts), the tray's menu and the green button in the title bar offer **Restart to update**. If you don't restart, it updates the next time you quit. To get it sooner, right-click the tray icon and pick **Check for updates...**. Nothing has changed in the desktop app itself, so there's no hurry.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.2.2 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux (new)**: both need Node.js 18 or newer, which Debian 12, Ubuntu 24.04 and later have; on Ubuntu 22.04, install Node.js 20 from NodeSource first.
- **The `.deb`**: `sudo apt install ./sg-bus-timings-cli-2.2.2-all.deb`, then `sgbus help`.
- **The single file**: `curl -Lo ~/.local/bin/sgbus https://github.com/augy-studios/sgbus-timings/releases/latest/download/sgbus && chmod +x ~/.local/bin/sgbus`. It updates itself with `sgbus update`.

**New to the desktop app?**
- **Windows**: if Windows says "Windows protected your PC", click **More info** > **Run anyway**.
- **Mac**: the first time, right-click the app in Finder > **Open** > **Open**, or on macOS 15 and later, **System Settings** > **Privacy & Security** > **Open Anyway**.
- **AppImage**: make it runnable (right-click > **Properties** > **Allow executing file as program**), then open it.

Your favourites and settings stay when you update.

## What's new

### Command line for Linux (new)
- **sgbus**: SG Bus Timings in a terminal, on a desktop, a server over SSH or a Raspberry Pi. `sgbus 84009` for a stop's timings, coloured by how full each bus is, and `-w` keeps them on screen, refreshed every 30 seconds. It finds stops by name, road, station or postal code, shows a bus's route, and plans journeys with the same route planner and Navigate as the website: `sgbus nav home "Bedok Mall" --arrive 9am`.
- **Your own saved things**: favourite stops and buses (`sgbus favs` for all their timings at once), Home, Work and your places, saved routes and navs, and the restricted areas setting, kept on the computer.
- **Routines as notifications**: `sgbus routine add 84009 07:45 --buses 14,60`, and once you turn on its timer (`systemctl --user enable --now sgbus-routines.timer`), a desktop notification with the stop's next buses at that time.
- **The rest**: service alerts, today's weather, PSI and PM2.5, and your calendar's events with the way to each. `--json` gives the data for your own scripts.

### Android app
- **Edit routines**: each routine in the Routines window has a pencil, which fills the form in with it. Change the stop, buses, time or days and tap **Save**, or **Cancel**.
- **A routine's own buses**: tap a routine's notification for several buses, and the stop opens with just those buses, not every bus there.
- **New tray icons**: the Edge Tray's **Timings near a stop** button is now a clock, and **Routines** an alarm clock.
- **Get the app from the website**: in a browser on an Android phone, a bar at the top offers the app, with **Download** for the newest version and a link to how to install it. **Not now** puts it away for a month.

### Everywhere
- **Several buses at a stop**: after a stop's code, list the buses you want to see: **84009 174, 175**. A star takes every bus starting with what's before it, so **84009 22\*** shows 222, 225G, 228, 229 and the rest. Links work too: `sgbus.uwuapps.org/#84009,174,175`.
- **Restricted areas**: for people who work inside Changi Airport's cargo area or at MINDEF's stops on Gombak Drive. In **Settings** > **Restricted areas**, **I have a pass** lets Navigate and the route planner get on and off at those stops, and ride through the cargo area. Bedok to the AirFreight Terminal Building drops from about 93 minutes to 64, on bus 9. Off unless you turn it on.
- **Sync with the Telegram bot**: in **Settings**, **Sync with the Telegram bot** shows a code and **Open the bot**, which opens the bot with it filled in (or send it `/sync` and the code). Your name and birthday, favourite stops, buses, routes and navs, places, routines, your calendar's link and where favourites pin go either way.
- **Sync more**: between two devices, sync now copies routines and last bus reminders (between two phones with the Android app), your calendar's link, and the settings you've changed, such as dark mode, the colour, the Edge Tray's side and buttons, the Get Off Alert and Shake to refresh.
- **Sync by kind**: above what's on offer, a button for each kind (Bus stops, Places, Routines, Settings and so on), with how many there are, shows just that kind, and **Select all** ticks just those.

## What's fixed
- **Navigate to Johor Bahru**: Bus and train said "Both ends have to be in Singapore" for Larkin Terminal. It now plans to and from the stops across the Causeway, and keeps your searches, places and trips there. A trip across the border has the **MyICA** button on its trip bar.
- **Getting off across the road**: the route planner could have you get off a stop early and walk further, such as at Changi Beach CP 5 on the way to Opp SAF Ferry Ter. It now rides on to the stop nearest your end when that's a minute or two more on the bus: SAF Ferry Ter, right across the road. The Telegram bot's `/route` too.
- **Navigate's close button**: on a phone, with Refresh, Share and Save nav showing, the close button was pushed off the edge of the window. It now stays at the top right, beside the title, with the other buttons on the line below.
- **The update bar on a phone**: with the Edge Tray out, its words were squeezed to a word or two a line. The buttons now go under the words.
