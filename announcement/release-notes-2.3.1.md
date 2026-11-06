The nearest exit at every station, saved navs that keep their stop on the way, the whole app in Chinese, Malay and Tamil, the app's language from Android's own settings, coins for your past trips, feats to share, SGH's campus shuttles, and trips that follow your location more closely.

## Download

| Device | File |
|---|---|
| Android 7.0 or newer | `sg-bus-timings-2.3.1.apk` |
| Wear OS 3 or newer watch | `sg-bus-timings-2.3.1-watch.apk` |
| Windows 10 or 11 | `sg-bus-timings-2.3.1-setup.exe` (or the `.msi`, for installing on many computers at once) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.3.1-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.3.1-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.3.1-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.3.1-x86_64.AppImage` |
| Command line on Debian, Ubuntu or Raspberry Pi OS, any architecture | `sg-bus-timings-cli-2.3.1-all.deb` |
| Command line on any other Linux | `sgbus` |

## Updating

**Android**: tap **Update** on the bar at the top of the app, or the download-arrow button in the Edge Tray. New to the app? Download the `.apk` on your phone and open it. If Play Protect asks about the app, tap **More details** > **Install anyway**. Most of what's below is already in the app you have, as it comes from the website. Picking the app's language in Android's settings, and notifications, shortcuts, Quick Settings tiles and the widget in Chinese, Malay and Tamil, need 2.3.1.

**Wear OS**: the watch's tile has its name in Chinese, Malay and Tamil now. Nothing else has changed on the watch, so there's no hurry to install 2.3.1 on it.

**Windows (`.exe`), Mac and AppImage**: the app checks as it opens and every hour, downloads the update, and offers **Restart to update**. To get it sooner, right-click the tray icon and pick **Check for updates...**. Everything new below is already in the app you have, as it comes from the website.

**Windows (`.msi`) and Debian (`.deb`)**: a notification says 2.3.1 is out, unless **New versions of the app** is off. Download the new installer and install it over the old one.

**Command line for Linux**: the single file updates itself with `sgbus update`. From the `.deb`, download the new one and `sudo apt install ./sg-bus-timings-cli-2.3.1-all.deb`.

Your favourites and settings stay when you update.

## What's new

### Navigate and trips
- **The nearest exit**: walks to and from a station go by its exit nearest the walk's other end, and say which: Walk ~276 m to Tampines station, Exit F, and Leave Serangoon station by Exit G. Directions, the live map and a trip started from the way go to and from that exit, not the middle of the station.
- **Doors fold away**: a train ride's doors panel starts folded to its line, such as Changing at MacPherson for the Circle Line. Tap it to see the doors, and again to fold it.
- **Saved navs keep their stop**: **Save nav** with a stop on the way saves the stop too, and Favourites shows it as Home → Gym → Work. It syncs with your other devices and the Telegram bot.
- **Trips that follow your location**: with your location on, a trip no longer moves on early. The clock can't take you past where your location shows you, and a ride can't jump further than a bus or train could have gone.
- **Faster ways and your stop on the way**: on a trip with a stop on the way, a faster way, another way for a last bus, and **Change here** go to that stop, then on as planned.
- **Which way round on the Circle Line**: a CC Line ride says CW or ACW, clockwise or anticlockwise, on the timeline and the bar.

### Shuttle buses
- **SGH's campus shuttles**: the Orange and Blue routes from Outram Park round the SGH campus, and the Car Park H shuttle, on Explorer, Bus timings, search and Navigate. On the eve of a public holiday the Orange and Blue run 8am to 2pm.
- **Shuttle routes along their roads**: every shuttle route on Explorer follows its roads, drawn at once and offline too, including Changi Airport's overnight loop, the TS1 back from Johor Bahru and KKH's two routes, which used to be straight lines.

### uwuCoins and Achievements
- **Coins for your past trips**: trips you took before uwuCoins earn their coins too, once, the first time you open the app: each one in Your trips you finished with the Get Off Alert, where your location saw you get on. They count towards Achievements as well.
- **Share your feats**: each feat done has a **Share**, and **Share your achievements** shares them all, as a card with a link. Whoever opens it sees what you did, and how far along they are.
- **Three new feats**: First to last (buses at stops 01012 and 99189), 100 rides, and Ends of the island (Tuas Link, Woodlands North, Punggol Coast and Changi Airport). Each is worth 100 uwuCoins, with its own Easter egg and colour preset.
- **Hide uwuCoins**: **Settings** > **Help and extras** > **Show uwuCoins** puts the wheel, the coin in the Edge Tray and the coin pop-ups away, while trips and feats still earn coins. **Coin pop-ups** turns off just the coin that floats up after a trip.
- **The wheel spins**: it turns for a few seconds and slows to a stop on what you won, and coins count up to the new total.

### Languages
- **All of it in your language**: Chinese, Malay and Tamil now cover the whole app, not just its buttons and settings: Navigate's ways and steps, the trip bar and its alerts, Service alerts, the weather, Your trips, Places, Calendar, Sync, the live map, Explorer's cards and the tours. Dates and times follow the language.
- **Words in your language, straight away**: new translations are used as soon as they're fetched, so nothing new shows in English first.

### Getting started
- **Minimal, Standard or Full**: the first time the app opens, there's a new Standard: everything but a few extras in the Edge Tray. Minimal and Standard start with coin pop-ups off.
- **Updates by themselves**: a new version goes in by itself when you come back to the app or pick a page in the Edge Tray, never mid-trip, mid-typing or with a window open.

### Report a bug
- **Pictures**: up to three, from your phone or **Screenshot this page**, which takes the whole page, top to bottom.
- **Report IDs**: a report sent says its ID, such as 20261103-7K3Q, to mention if you write to Augy about it.

### Android app
- **The app's language**: on Android 13 and later, **Settings** > **Apps** > **SG Bus Timings** > **Language** picks the app's language. It's the same as the app's own **Language** in Settings: change either and the other follows.
- **Notifications in your language**: notification channels, On a bus?, Time to leave and Routines, the shortcuts, the Quick Settings tiles and the Bus timings widget, in Chinese, Malay and Tamil.
- **Another secret**: one more for an Easter egg to unlock, for whoever finds it.

### Telegram bot
- **Saved navs keep their stop**: a nav saved with a stop on the way keeps it in `/mynavs`, with **Remove the stop on the way** to go straight there.
- **The nearest exit**: a way's walks say which exit to use.

### Command line for Linux
- **A stop on the way**: `sgbus nav home work --via 84009`, kept with `--save`.
- **The nearest exit**: each walk to or from a station says which exit to use.

## What's fixed
- **Trains on a trip**: coming in to a station alongside the next bus's route no longer counts as getting off the train and on the bus. The trip waits till the train has stopped, and a bus seen still at the stop after boarding goes back to waiting.
- **Train times in Your trips**: a train ride's time is kept as planned when the measured one is far off, not 15 or 24 minutes for three stops.
- **100 rides in Malay and Tamil**: the feat said trips, though it counts rides. It says rides now, and Achievements explains why it can show fewer than Your trips: only rides your location saw count.
- **Watch the celebration again**: shows only once you've ridden every line, not for the Easter egg alone.
