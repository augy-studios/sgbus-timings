# SG Bus Timings - Patch Notes

**Latest update: 8 November 2026**
**Live at: https://sgbus.uwuapps.org**
**Guide: https://guide.sgbus.uwuapps.org**
**Telegram bot: https://t.me/UwUsgbus_bot**

Newest first. Each update covers the web app and the Telegram bot.

---

## 8 November 2026: The Android app on Google Play, and your trip as a Live Update (2.4.8)

### Android app

- **Your trip at a glance** - A trip's notification now has a bar of the whole trip: a segment for each part in its colour, and a marker for each alert still to come. On Android 16 and later it's a Live Update, near the top of your notifications and lock screen, with what you're on moving along the bar, and the stops or minutes left in the status bar.
- **What you're on** - The notification's icon, colour and name follow the bus, train or walk you're on again.
- **The Google Play version** - Google allows some permissions only for other kinds of app, so this version has no Timings near a stop or "On a bus?", and a trip doesn't ask about battery optimisation. The app from GitHub keeps them all.
- **Reminders on time, on Google Play** - Routines and Settings offer to allow Alarms & reminders, so routines, last bus reminders and Time to leave come on time. Without it they still come, but Android can deliver them late.
- **A smaller app** - The Android app's code is shrunk for release, so it takes less room on your phone and loads less on opening.
- **Time to leave needs somewhere to start** - In both versions, with Time to leave on and no Home saved, Settings now says so, with a button to Places. Without Home, and with the phone not saying where you are, no notification could come.

---

## 7 November 2026: Make the desktop app yours, and long words on the Android app (2.4.8)

### Desktop apps

- **Make it yours** - The first time 2.4.8 opens, a window sets your language, whether it starts when you sign in, light or dark, and your brand colour, all in one place. It's in the tray's menu whenever you want it again.
- **Updates with apt** - On Debian, Ubuntu, Mint and 64-bit Raspberry Pi OS, the app and the command line can now install and update from their own apt repository: see the guide.

### Everywhere: new names for the first open

- **Simple (Lite), Normal and Advanced Super App** - Minimal, Standard and Full have new names, on new installs of every version with a first-open choice.

### Website and desktop apps

- **Phone's setting** - A fourth choice under Mode in Theme, as the Android app has, following your device's light or dark as it changes.
- **Asked in every language** - New visitors whose browser isn't in English are now asked how much to start with, as everyone else is.
- **GTA VI's Edge Tray** - The page you're on now reads clearly, its icon dark on orange.

### Everywhere

- **The magic cup** - Changing the language now takes a sip from Singapore's famous language-changing cup: it spins in 3D with the tea swishing around it, for about a second, and the whole app comes back in the new language.

### Everywhere with uwuCoins

- **uwuCoins history** - Under the wheel, History lists every coin in and out and where it came from: which trip and what made up its coins, which feat, each spin and what it won, with All, Earned and Spent. It now keeps your last 2,000, where it kept 100.

### Android app

- **A stop's bus cards** - There's a gap between the buses, a long time goes onto a second line only between its minutes and seconds, and a long wheelchair label wraps rather than running into the next bus, in every language.
- **Choices that fit** - Where a language's words don't fit side by side, as in Tamil, choices such as Service alerts' and Settings' stack one under another rather than breaking in the middle of a word.

## 7 November 2026: Glance and languages on the Android app (2.4.7)

### Android app

- **Location messages follow your language** - Switching language and back no longer leaves "Couldn't get your location" in the other language, in Bus timings, Glance or Navigate.
- **Arriving fits in Tamil** - On Glance, the big "Arriving" gets smaller rather than breaking in the middle of the word.

## 7 November 2026: GTA VI colours, and the Android app catches up with the website on trips (2.4.6)

### Website and Android app

- **GTA VI colours** - To celebrate the game's release on 19 November, a new theme in its logo's pink, blue, orange, yellow and violet, with a colour to each kind of thing, and a violet page in dark mode. A window offers it once. Set it at least once before 26 November and it's yours to keep. After that, it's won on the uwuCoins wheel. It's a Brand colour in Theme, and in the app's Material You it's under Colours.

### Android app

- **Back to Navigate** - On a trip, it opens the way you picked, on Bus and train or Bus only, not the list of ways, and keeps Your location if you started from it.
- **On to your next ride by itself** - If your location shows you already on the next bus or train, the trip moves on to it, even if it never saw you reach the end of the part before, as the website does.
- **Trips follow you more closely** - Waiting at the stop no longer counts as riding, and with no GPS the trip holds until your bus is due. It follows the bus's real road, puts itself right when your location shows it's wrong, ignores a stray location further on than a bus could have gone, and goes back to waiting if it took you as on a bus you never boarded.
- **Back on the trip bar** - Goes back to where you'd got to on that part, not its start.
- **Previous and next in the small window** - On a trip by bus or train with more than one part, picture-in-picture has previous and next buttons, like a video's, to move between parts.
- **Next can't end your trip** - On the last part, Next is grey, on the trip bar and in the small window.
- **Across the Causeway** - A ride across is followed in parts, so the alert tells you to get off at each checkpoint, and the time to clear counts as the wait.
- **Citymapper** - A stop's Directions opens into Live map and Citymapper, and a walk in Navigate has both.
- **Share on Bus only** - Sends a link to the route, with the time if you picked one.
- **Navigate's tabs keep your ends** - A place becomes the bus stop at it, or the nearest within 150 m, and the time comes too.
- **Set Home and Work from Navigate** - Until they're set, their buttons show paler under each end, and tapping one asks where it is.
- **Directions there** - On someone's live progress, plans your own way to where they're going.
- **To Home** - A trip in Your trips that ended at Home, Work or one of your places says so.
- **Smaller things** - The incoming buses' heading and note, the tours' missing steps, an offline note in Favourites, and a word when a way can't be followed as a trip.
- **Clear of the navigation bar, everywhere** - Glance, Bus timings, Favourites, Navigate, Service alerts and Places no longer run under Android's buttons either.

## 7 November 2026: Tunnels and driving on the Android app's map (2.4.5)

### Android app 2.4.5

- **Through tunnels** - When the GPS stops, your dot keeps going along your route from how fast you were going, slowing for jams and braking by the phone's accelerometer, and says it's an estimate until the GPS is back.
- **A drive's own route on a trip** - A trip switched to driving or cycling shows the way by road or by bike, in place of the walking route it showed.
- **Directions from where you are** - Off the route on a trip's walk, ride or drive, the way is found again from where you are, with the next turn at the foot of the map.
- **Stays on the expressway** - A drive already under way goes by which way you're heading, so it carries on along the KPE or MCE rather than starting from a street above the tunnel.
- **Glance fits on a narrow screen** - With the Edge Tray out, the weather no longer runs off the side, "Tiba" stays on one line, and the note on what the times mean has a line of its own when there's no room for it.

## 7 November 2026: The Android app gets its own guide (2.4.4)

### Guide

- **A section for the Android app** - The app has its own screens, so the guide has its own pages for it, under Android app: basics and Android app: advanced, with pictures of the app itself. The old page's addresses take you there.

### Android app 2.4.4

- **The Guide button** - Opens the app's own section of the guide.
- **The departures board's page number** - No longer cut off at the foot of the screen on a phone held upright.

## 7 November 2026: Explorer's stops and stations open again (2.4.3)

### Android app 2.4.3

- **Tap a stop or station in Explorer** - Tapping a bus stop or an MRT or LRT station did nothing. Its card now opens on the dot, as on the website, and the stops and stations on a trip or a walk open theirs too.
- **Easier to tap** - A tap counts within a finger's width of a dot, and goes to a station first, then the stop nearest it.
- **Back where you left it** - Leave Explorer by a card's Show bus timings or Directions and it opens on that stop or station again, card and all. Show bus timings now closes the map, and stays on the map when you're offline.
- **More room in Navigate** - The swap button now sits between From and To, on Bus only too, so the boxes and your places get the full width.
- **Clear of the navigation bar** - Settings and other pages, and the sheets that pull up, no longer run under Android's buttons at the bottom of the screen.

## 7 November 2026: The Android app catches up with the website (2.4.2)

### Android app 2.4.2

- **A handle to tilt and turn** - The button with the four arrows moves beside the other map buttons and now changes the angle: hold it and drag up or down to tilt the map, or left or right to turn it. It no longer slides the map, and it takes the place of the 3D button.
- **Two fingers move the map while it follows you** - A slow two-finger drag now pans the map and stops it following you, where it used to do nothing.
- **Pinching keeps following** - Zooming with two fingers no longer stops the map following you.
- **The trip's timeline** - Tap the trip's bar for every stop on the way, with a blue dot gliding along the line as you move and the page keeping up with it.
- **The Get Off Alert buzzes OFF** - On a trip, the alert always buzzes "OFF" in Morse code, with the app open or not, and the bar says how many stops are left and the minutes to go.
- **Get Off Alert from a bus's route** - Tap Get Off Alert on a route, then the stop you're getting off at.
- **Your trips in full** - Trips by the week, each with how long you waited and rode, Plan again, Share and Delete, Trip Modes, and Clear Your trips.
- **Find a setting** - A box at the top of Settings finds any setting by name or by what it does.
- **Language, at once** - A new language shows straight away on every screen open, and the list has its flags.
- **Birthday button** - Choose your birthday is now a proper button.
- **Names beside the icons** - On a tablet, each Edge Tray button says what it is.
- **The gold uwuCoin and SimplyGo's logo** - Back on their Edge Tray buttons.
- **SimplyGo opens on its own** - As if from its own icon, not under SG Bus Timings, so its NFC works properly. MyICA too.
- **Screenshot a page** - Report a bug now lets you go to the page you mean, anywhere in the app, and takes all of it, top to bottom, with what you've typed kept. The first box's label is no longer cut off.
- **More on a trip** - Back to Navigate, the other buses that go straight there, which way round on the Circle Line, walking or cycling the rest when that's quicker, and a word when your location's weak or no other way is running.
- **Google Maps links** - Paste one into From, To or a place, and it's read and picked straight away.
- **Bus and train with no connection** - Navigate plans on your phone when you're offline, even straight after opening the app, with the same ways as the website, and plans again when you reconnect. From, To and a stop on the way find stations and bus stops offline too.
- **Shuttle buses and the Causeway in Navigate** - A way's shuttle says what it costs, who may ride it and when to board, with its times a tap away, and a way across the Causeway has its immigration steps and the time they're counted as.
- **A last bus lost on a trip** - The trip looks for another way from where your last ride ends, says what to do first in words, and switches by itself with Undo, or offers Navigate from here or See all ways when there's none.
- **A faster way, with its reason** - On a ride it looks from your next stop, with the first bus by its live timing, says why (traffic, or a long wait), and sends a notification once.
- **The saved map** - It says when OpenFreeMap has a newer map, Cancel stops a download straight away, an update cancelled keeps the map you had, and a download stops at OpenFreeMap's limit and keeps what it has.
- **Share in Navigate** - Share my ETA, these directions, the start or the end, and a share card says straight away when you're offline.
- **Bus only's stops** - Pick a stop near you or near a saved place, with those that have a bus straight there listed first and marked, and a bus opened from a route or a journey says how far it still has to go.
- **Smaller things** - Select all for each kind in Sync, Watch the celebration again in Your colours, the tip about holding a button, and more stops on the tours.

### Desktop app and Linux command line

- No changes: they stay on 2.4.0.

---

## 6 November 2026: The Android app's map, better to use (2.4.1)

### Android app 2.4.1

- **The map follows you properly** - On Explorer and the live map, while the map is following you, your dot now stays in the middle of the screen as you move, where it used to wait until you'd moved well off-centre.
- **The compass button stays on** - Turn the map with the way you face no longer switches itself off and snaps back to north.
- **Two fingers move the map** - A two-finger drag now pans the map in any direction, where it used to stop as soon as your fingers drifted up or down.
- **A button to slide the map** - Hold the button with the four arrows and drag it, and the map slides that way until you let go.
- **A button for 3D** - The 3D button tilts the map and stands the buildings up when you're zoomed in, in place of dragging two fingers up or down.
- **Your speed on the map** - Cycle it and Drive it show how fast you're going, in km/h.

### Desktop app and Linux command line

- No changes: they stay on 2.4.0.

---

## 6 November 2026: The Android app, rebuilt as an app of its own (2.4.0)

### Android app 2.4.0

- **A real Android app** - Until now the Android app showed this website inside it. From 2.4.0 every screen is the app's own, built for Android: it opens faster and scrolls and animates smoothly. Install it over the old one as usual, and everything you've saved comes across by itself the first time you open it: favourites, lists, places, routines, trips, uwuCoins and feats, settings and all.
- **Material You by default** - The app follows your phone: its own font, and your wallpaper's colours. Your colours (from the Easter eggs) can take over in Theme. Turn Material You off in Theme for the UwU Apps theme, the look you know from the website.
- **The Edge Tray, smoother** - The same tray, with the same buttons, now sliding in and out as the website's does, with your favourites' count and your uwuCoins on it.
- **Explorer on a proper map** - Explorer and the live map draw with MapLibre, faster and sharper, with the shuttle buses' routes and stops, station doors and Save the map for offline as before.
- **Everything else, as on the website** - Bus timings, Glance, Navigate and the route planner, Service alerts, the Get Off Alert (Change here and Are you walking? included), Your trips, Places, the calendar, uwuCoins, the wheel and team runs, Sync, sharing, Card value, the sgbus terminal, tours, offline mode, picture-in-picture and shake to refresh.
- **A bigger download** - The app is about 100 MB to download now, up from about 9 MB, so you may want to be on Wi-Fi to update.
- The web app's changes from 4 and 5 November: team runs, every stop in a list on Glance, a shared feat that closes, and Material You in Theme with no Easter egg needed.

### Desktop app 2.4.0

- The web app's changes from 4 and 5 November, which it had as soon as they went live.
- No changes of its own: numbered 2.4.0 to stay in step with the Android app.

### Linux command line 2.4.0

- No changes of its own: numbered 2.4.0 to stay in step with the Android app.

### Guide

- The Android app's page is rewritten for 2.4.0: coming from 2.3 or earlier, Material You and the UwU Apps theme, the Edge Tray, and Explorer, with new screenshots of the app itself.

---

## 5 November 2026: Material You is the Android app's own

### Web app

- **Material You isn't a secret any more** - Your phone's colours and the Material You look are features of the Android app now, with no Easter egg needed: find them in Theme in the app. The website doesn't have them. Easter eggs unlock Your colours, and bring their presets, as before. The greeting-and-Settings shortcut is gone with them.

---

## 4 November 2026: Team runs, a shared feat closes, and every stop in a list on Glance

### Web app

- **Team runs** - Speedrun the feats with friends. In Settings, Achievements, Team run, one of you starts a team with a name and sends the invite; the rest join with its link or code, up to eight of you. Rides and trips any of you take count for the whole team, and everyone gets each feat the team does, with its 100 uwuCoins. Hand a trip on by starting yours where a teammate's ended, within 30 minutes, and it counts as one trip, for The long way round, There and back again and Down the old railway: Continue from there plans from where they got to. Only rides your phone's location shows you took count, as ever, and only feats done after you joined. A team run ends 14 days after its last ride.
- **A shared feat closes** - Opening someone's feat link showed their feat, but Later, the close button or a tap outside only brought it back again. Now any of them closes it, as with any other window.
- **Every stop in a list on Glance** - Glance showed only the first four stops of a list or of your saved stops, so a stop added after those never showed. Now it shows every stop you've picked, up to twelve. Nearby and a place still show the nearest four.

---

## 3 November 2026: The nearest exit, folding doors, saved stops, and the app's language

### Web app

- **The nearest exit** - Navigate's walks to and from a station go by its exit nearest the walk's other end, and say which: Walk ~276 m to Tampines station, Exit F, and Leave Serangoon station by Exit G. Directions, the live map and a trip started from the way walk you to and from that exit, not the middle of the station.
- **Doors fold away** - A train ride's doors panel in Navigate starts folded to its line, such as Changing at MacPherson for the Circle Line. Tap it to see the doors, and again to fold it; it stays as you left it while live timings come in. Explorer's are always shown.
- **Saved navs keep their stop** - Save nav with a stop on the way saves the stop too, and opening it from Favourites puts it back. Favourites shows it as Home → Gym → Work, apart from Home → Work. It syncs with your other devices and the Telegram bot.
- **The whole page in a bug report** - Screenshot this page takes the whole page, top to bottom, not only the part on the screen.
- **Bug report IDs** - A report sent says its ID, such as 20261103-7K3Q, to mention if you write to Augy about it.

### Telegram bot

- **Saved navs keep their stop** - A nav saved on the web with a stop on the way keeps it in /mynavs, planned by way of it, with Remove the stop on the way to go straight there.
- **The nearest exit** - A way's walks say which exit to use, as on the web.

### Android app 2.3.1

- The web app's changes above.
- **The app's language** - On Android 13 and later, Settings, Apps, SG Bus Timings, Language picks the app's language, and it's the same as the app's own Language in Settings: change either and the other follows, the app's notifications, widget and update page too.

### Desktop app 2.3.1

- The web app's changes above.

### Linux command line 2.3.1

- `sgbus nav` takes `--via` for a stop on the way, kept with `--save`, and says which exit to use at each station.

### Guide

- New and retaken screenshots of the nearest exit, the folding doors, a saved nav with its stop, and a bug report's ID and whole-page screenshot.

---

## 3 November 2026: 100 rides, in the right words

### Web app

- **100 rides, in Malay and Tamil** - The 100 rides feat said trips (perjalanan, பயணங்கள்) in Malay and Tamil, though it counts rides, so it looked like it disagreed with the trips in Your trips. It says rides now (tunggangan, சவாரிகள்), and so do Your trips' stats in Tamil.
- **Why the rides differ** - Achievements now says a ride counts there once your phone's location shows you took it, so it can show fewer than the rides in Your trips.

---

## 2 November 2026: Apps 2.3.0, shuttle buses everywhere, uwuCoins, and Your colours from one colour

### Web app

- **Shuttle buses in Navigate** - Bus and train rides NUS's and NTU's campus shuttles, and the island's others anyone can ride: IKEA Tampines', Changi Airport's, KKH's, SGH Campus' Orange, Blue and Car Park H routes, Mandai's, Clarke Quay's late-night shuttles home, Orchid Country Club's and the TS1 to Johor Bahru. A shuttle's wait is its timetable's average wait then, and one that isn't running isn't used. The Novotel and Mercure on Stevens' shuttle, for hotel guests, is only used to or from the hotel.
- **Free or paid shuttles** - Settings' new Shuttle buses, under Navigate: Free only (the default), or Free and paid for Mandai's, the Tanah Merah Ferry Terminal shuttle and the TS1 too. Explorer's shuttle layers follow it.
- **Search shuttle buses** - Type a shuttle's route, such as A1, CL-B or M2, for its stops and what its timetable says now, or a stop only shuttles use, such as PGP or IKEA Tampines, for its shuttle times.
- **SGH's campus shuttles** - The Orange and Blue routes from Outram Park round the SGH campus, and the Car Park H shuttle, on Explorer, Bus timings, search and Navigate. On the eve of a public holiday the Orange and Blue run 8am to 2pm, as SGH has them.
- **Shuttle routes along their roads** - Every shuttle route on Explorer follows its roads, drawn at once and offline too, including Changi Airport's overnight loop, the TS1 back from Johor Bahru and KKH's two routes, which used to be straight lines.
- **Bug reports, laid out** - A report reaches Augy as a Telegram rich message: a heading, what the app added as a table, what you typed, and your pictures inside it.
- **Shuttles live** - IKEA's and the Stevens hotels' shuttles show their next bus live, Live: 4 min, from the operator's tracker.
- **uwuCoins** - Trips taken with the Get Off Alert to the end earn uwuCoins: more for longer trips, changes, and each bus and train operator and line. Spend them on the wheel in Settings' Help and extras, like gacha: every spin wins an Easter egg or more coins. The coin in the Edge Tray shows how many you have.
- **Achievements** - A new group in Settings lists the feats, each with how far along you are, such as 6 of 9 lines ridden, and the Easter eggs you've found.
- **Your colours from one colour** - Your colours, a secret an Easter egg unlocks, now takes one colour, on the Color Guess Game's colour wheel or from presets, and makes the whole theme from it, light and dark, with all the text easy to read.
- **Glance and Favourites in step** - Pick a list on Glance and Favourites opens on it, and the other way round.
- **The greeting** - Tapping the greeting at the top no longer opens Settings.
- **For the curious** - Something new in the browser's console, for whoever looks.
- **The wheel spins** - Spinning the uwuCoins wheel turns it for a few seconds and slows it gradually to a stop on what you won, instead of jumping straight there.
- **Coins count up** - Coins coming in count up to the new total, on the Edge Tray's coin and above the wheel. A spin's winnings are counted once the wheel stops.
- **Watch the celebration again** - Shows under Your colours only once you've ridden every line, not for the Every line ridden egg alone.
- **Explorer's tour** - Explorer's tour shows its Layers button too, for what the map shows.
- **Coins for your past trips** - Trips you took before uwuCoins earn their coins too, once, the first time you open the app after this update: each one in Your trips that you finished with the Get Off Alert, where your location saw you get on. They count towards Achievements as well, with the buses and lines you rode on them, and any trip feats they did. A window says how many trips counted and what they earned.
- **Share your feats** - Each feat done in Achievements has a Share, and Share your achievements shares them all: a card with your feat, your name and the day, and a link. Send it to Telegram or WhatsApp, copy the link, or share the card as a picture with More, or save it with Save image. Whoever opens the link sees what you did, and how far along they are.
- **Updates by themselves** - A new version goes in by itself when you come back to the app or pick a page in the Edge Tray, never mid-trip, mid-typing or with a window open. The Reload bar is still there for it sooner.
- **Easter eggs, named for each language** - 彩蛋 in Chinese, Ciri Tersembunyi in Malay and மறைந்த அம்சம் in Tamil, not the literal Easter egg.
- **Tours in your language from the start** - A copy of the words kept from before an update is never used, so a tour, or anything else new, doesn't show in English first.
- **Minimal, Standard or Full** - The first time the app opens, there's a new Standard: everything but a few extras, with no uwuCoins, Buy Augy a Coffee, Receive nearby, Telegram bot or Card value buttons in the Edge Tray. Minimal and Standard start with coin pop-ups off.
- **Hide uwuCoins** - Settings' Help and extras has Show uwuCoins: off, the wheel, the coin in the Edge Tray and every coin pop-up are put away, while trips and feats still earn coins for when you turn it back on. Coin pop-ups turns off just the coin that floats up after a trip.
- **Three new feats** - First to last: take buses at stop 01012 and stop 99189, the first and last stop codes. 100 rides: buses and trains together. Ends of the island: get off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport. Each is worth 100 uwuCoins, with its own Easter egg and colour preset.
- **Pictures in bug reports** - Report a bug takes up to three pictures: from your phone, or Screenshot this page for the app as it is under the window. They reach Augy with the report.
- **Which way round on the Circle Line** - A trip on the CC Line says whether it goes clockwise or anticlockwise round the loop: CW or ACW on the timeline, and on the bar.
- **Trips that follow your location** - With your location on, the trip no longer moves on early: the clock can't take you past where your location shows you, a ride can't jump further than a bus or train could have gone, and the server that alerts you in the background leaves the trip to the app while the app has your location. Its notifications are now in the app's language.
- **Words in your language, straight away** - New translations are used as soon as they're fetched, not only the next time the app opens, so an app left open no longer shows English for new words. The trip timeline's "to" is translated too.
- **Trains on a trip** - Coming in to a station alongside the next bus's route no longer counts as getting off the train and on the bus: the trip waits till the train has stopped, and a bus is only boarded going its way. Seen standing at the stop after it had you on board, it's back to waiting for the bus, so it doesn't arrive while you're still waiting. Changing lines underground, it goes on to the next line when the plan has you there, instead of riding the first line through the change.
- **Train times in Your trips** - A train ride's time is kept as planned when the trip went by the clock, or when the time measured is far off the plan (Next tapped late, a change it didn't see), not as a ride of 15 or 24 minutes for three stops.
- **Faster ways and your stop on the way** - On a trip with a stop on the way, a faster way, another way for a last bus, and Change here go to that stop, then on as planned, instead of skipping it for the end.
- **Another secret, for Android** - The Android app has a new secret for an Easter egg to unlock, the way Android's own apps look. The shortcut that turns on your phone's colours turns it on too.
- **All of it in your language** - Chinese, Malay and Tamil now cover the whole app, not just its buttons and settings: Navigate's ways and steps, the trip bar and its alerts, Service alerts, the weather, Your trips and its stats, Places, past searches, Calendar, Sync, Offline Sharing, Card value, the live map and Explorer's cards, the tours, and Settings' summaries. Dates and times follow the language too.

### Guide

- Something hidden in the sidebar, for whoever finds it.

### Android app 2.3.0

- The web app's changes above, and those from 1 November.
- Something new for Android 12 and later, for whoever finds it.
- The app's own words, outside the web app, in Chinese, Malay and Tamil too: its shortcuts, Quick Settings tiles, the Bus timings widget and its setup, and the watch's tile. The widget's buses can be split with Chinese commas as well.

### Desktop app 2.3.0

- The web app's changes above, and those from 1 November.

### Linux command line 2.3.0

- The same version number as the apps.

---

## 1 November 2026: Are you walking?, Explorer's layers, and more in your language

### Web app

- **Are you walking?** - On a trip, if a walk goes faster than anyone walks and your phone feels no steps, the site asks whether you're walking. Pick **I'm cycling** or **I'm driving** and it reminds you to ride safely, then offers each bus or train still ahead on your trip to cycle or drive to instead, or all the way there. The live map shows the way, and Undo puts the trip back.
- **Calendar in Add a stop** - Navigate's Add a stop has the Calendar tab too, so an event's place can be the stop on the way.
- **Events until they end** - Your calendar's events stay listed until they end, not just until they start, marked On now with when they end, so you can still plan the way to one you're late for.
- **Drive there** - Navigate's Bus and train lists how long driving the whole way takes, under Walk there and Cycle there, and **Drive it** shows the way by car on the live map.
- **Explorer's layers** - A Layers button on Explorer turns bus stops, MRT and LRT stations, MRT and LRT lines, and the campus shuttles' routes and stops off or on.
- **More in your language** - Routines' days, the line under the greeting, Navigate's Leave now, Leave at and Arrive by, a trip's Also direct and Change my way, the train door tips, the Wheelchair badge, and Settings' Last bus reminders and Sync show in Chinese, Malay and Tamil.

### Android app

- **Every version in Updates** - The app's update page lists every version back to 1.0.0, not just the newest twelve. It needs no app update.

---

## 31 October 2026: Apps 2.2.8, bus times by the clock, and updates in your phone's colours

### Web app

- **Clock times** - Settings' new Bus times: keep each bus as how long till it comes, such as 3 mins 20s, or pick Clock time to see the time it comes, such as 14:32. A stop's timings, the incoming buses bar, Glance, the departures board, Navigate and Bus only all follow it, and so do the desktop app's widgets. It syncs with your other devices and the Telegram bot.
- **Campus shuttle stops** - NUS's A1, A2, D2, K and P show at Kent Ridge Stn Exit A / NUH, where they stop, instead of the NUH stop up the road, and every campus stop's card shows its postcode.
- **More in your language** - Routines' form and the messages for when your location can't be found show in Chinese, Malay and Tamil.

### Telegram bot

- **Clock times** - 🕒 Show clock times in /settings shows each bus as the time it comes, such as 14:32, in a stop's timings, /nav and a route's journeys. It syncs with the web app's Bus times.

### Linux command line 2.2.8

- The same version number as the apps.

### Android app 2.2.8

- The web app's changes above, and those from 28 and 30 October.
- **Never zoomed out** - From 28 October: the page always stays at its own size.
- **Updates in your phone's colours** - The update page is a page of its own in Material You: its colours from your wallpaper on Android 12 and later, light or dark as your phone is. It shows what's new in each version on a timeline, the one you'd get open with its changes in cards, and the one you have marked Installed. Downloads show as a wavy line growing along its track.

### Desktop app 2.2.8

- The web app's changes above, and those from 28 and 30 October.
- **Updates as it opens** - A small window with the app's icon checks for a new version as the app opens. One it can install downloads there with a bar, then it installs and opens again as the new version; Later opens the app now and finishes the download in the background. Restart to update shows the same window as it installs.

---

## 30 October 2026: campus shuttles, report a bug, back to Navigate from a trip, /start works again

### Web app

- **Back to Navigate** - On a trip's timeline, beside Change my way: Navigate as it was when you started the trip, the same ends and the way you picked, on Bus and train or Bus only.
- **Change my way, the right size** - Its icon filled half the timeline. It's the size of the others now.
- **NUS and NTU campus shuttles** - Explorer draws each university's shuttle routes in their own colours, with their stops; a stop's card and Bus timings list the shuttles that call there under the live buses, marked as scheduled, not live, with when they run today. Public holidays run as Sundays.
- **Report a bug** - In Settings, Help and extras: say what went wrong, and it reaches Augy on Telegram, with the app's version and your device to help track it down. A way to reach you is optional.
- **Stops near me on Bus timings** - The stops around you are a list on Bus timings' page, nearest first with your favourites pinned, rather than a pin in the Edge Tray. Once you've allowed your location, it finds them by itself.
- **Buildings in 3D offline** - With Singapore's map saved, a few places lost their whole tile offline, buildings and all, over a street name in an unusual script. Every tile shows now. Save the map again to get the fix.

### Telegram bot

- **/start works again** - In a private chat, /start answered with nothing. Its 🌐 Open web app button now opens the web app inside Telegram, as it should.

---

## 28 October 2026: Navigate far from any stop, Explorer where you left it, room on small screens

### Web app

- **Navigate far from any stop** - A place with no stop or station within 900 m, such as a ferry terminal or a lodge out in Tuas, used to get no way at all. Navigate now walks you to the nearest stops and stations within 3 km, and says how far the walk is.
- **Explorer where you left it** - Show bus timings or Directions on a stop's or station's card closes Explorer; open it again and it's back on that stop or station, its card open. Close Explorer yourself and it starts afresh.
- **More room beside the Edge Tray** - With the tray open, the page reaches its buttons rather than stopping at its arrow, about a finger's width more on a phone, on either side. The greeting and the bars at the top keep clear of the arrow.
- **No more zooming out** - Some stops, such as 17179, zoomed the whole page out on a phone, everything tiny. They fit now.
- **"no GPS", not "~ ∞m"** - A bus LTA times by its timetable, with no position, says "no GPS" rather than an infinite distance, and an empty slot shows a dash, never "NaN".
- **Favourites on narrow screens** - New list wraps under the tabs, and a bus at a stop's chip shortens the stop's name before its bus numbers.
- **The subtitle wraps neatly** - It breaks between phrases, keeping "Made with ♥ by Augy" together.

### Android app

- **Never zoomed out** - The app keeps the page at its own size, whatever's on it. Needs version 2.2.8.

---

## 27 October 2026: Apps 2.2.7, buses at stops, lists, four languages, and a secret

### Web app

- **Save a bus at a stop** - Each bus in a stop's timings has a star: tap it to save that bus at that stop only, as LTA's MyTransport does. Favourites lists them under Buses at stops, one chip per stop; tap it for that stop's timings with just those buses. Glance shows just them at that stop too.
- **Lists** - Group your favourites into lists, such as Work or School, with New list at the top of Favourites. Favourites itself keeps every favourite and can't be deleted. A list can be renamed, changed or deleted, and what's in it stays in Favourites. Each list with a stop in it is also a choice on Glance, with just its buses. Lists and buses at stops sync to your other devices.
- **English, 中文, Bahasa Melayu, தமிழ்** - Pick the app's language in Settings, You, Language, from a list with each language's flag and its name in its own words; until you do, it follows your phone's. Think a translation looks wrong? The link under the list tells us. Glance, Bus timings, Navigate, the trip bar, Settings, Favourites and Theme are translated so far, the rest still in English. The translations are new: tell us anything that reads wrong.
- **High contrast** - In Theme: black or white text, solid cards and clear edges. It follows your phone's high contrast setting unless you turn it on or off there.
- **A secret** - Ride every MRT and LRT line at least once with the Get Off Alert and see what you unlock, with a celebration to match (a lighter one on phones with less memory). Only rides you really take count.
- **Explorer offline** - Once Singapore's map is saved, Explorer stays with no connection, and its stop cards show which buses run there.
- **No sharing your ETA offline** - With no connection, Share my ETA leaves the trip bar, as live progress needs one. Offline Sharing still sends a place or directions to a phone nearby.
- **Room to type on a trip** - With the keyboard up, the trip bar shrinks to one line, so you can see what you're typing and its suggestions.
- **Station names, tidied** - Ways from OneMap say "Pasir Ris station", not "PASIR RIS MRT STATION".
- **Easier with a screen reader** - Windows take the focus when they open and give it back when they close, and Esc closes them. Bus timings read out how full a bus is and when a time is an estimate. Search suggestions can be picked with the arrow keys and say how many there are. The trip bar no longer interrupts every minute, and the Settings switches say what they're for. Pages have proper headings, and with a keyboard a clear ring shows where you are.
- **Bigger text** - Text follows your browser's text size, small buttons are easier to tap, and the departures board's rows grow with the text. Stop and station cards on the map can be pinched to zoom. With your phone or computer set to reduce motion (Remove animations on Android), the page and the map jump rather than glide.
- **Copy a stop's name or code** - Press and hold a stop's name, its code or a bus number to copy it.
- **Love SG Bus Timings?** - About once every six months, a small window asks if you'd consider donating. Not in your first two weeks, never on a trip or offline, and never if you've turned the coffee button off in Settings.

### Linux command line 2.2.7

- The same version number as the apps.

### Android app 2.2.7

- The web app's changes above.
- **The trip notification shows where you are** - Its icon is a bus, a train or walking for the part you're on, in the train line's colour, with the bus or line beside the app's name.
- **Press back twice to exit** - With nothing open, Back says "Press back again to exit" on any page, and a second press leaves the app.
- **Your font size** - The app's text follows your phone's font size.

### Desktop app 2.2.7

- The web app's changes above.

---

## 26 October 2026: Apps 2.2.6, offline plans and a tidier Settings

### Web app

- **Minimal or Full** - The very first time you open the app, it asks: Minimal keeps to the essentials, with Glance, Service alerts, Your trips and the Edge Tray's optional buttons off; Full has everything. Either can be changed in Settings later. If you've used the app before, it doesn't ask.
- **Settings in groups** - Settings opens on a list: You, Pages and Edge Tray, Trips and alerts, Navigate, Help and extras, and Sync. Tap one to open it, Back to return to the list. Find a setting at the top searches them all.
- **Turn pages off** - Glance, Service alerts, Your trips, Card value and Receive nearby can each be turned off in Settings, Pages and Edge Tray. A page that's off leaves the Edge Tray, Custom home and the tour, and syncs to your other devices.
- **A stop on the way** - Navigate's Bus and train can add one stop between From and To, planning each half on its own. Links, shares and trips carry it.
- **Bus and train plans offline** - With no connection, Navigate's Bus and train plans on your phone from the bus routes and train lines it has kept, between stops, stations, your location or your places. Its times are estimates, and it plans again when you reconnect.
- **Offline, the app steps aside** - With no connection, pages that need one step aside and Favourites opens instead; they're all back when you reconnect.
- **Singapore's map, offline** - Explorer's download button saves the whole map of Singapore, under 50 MB, so it works with no connection. Update map and Remove are on the same panel.
- **The MRT and LRT lines on Explorer** - The lines are drawn in their colours under the stations and stops.
- **No location pop-up by itself** - Favourites and Glance never ask you to turn on location on their own; only tapping Nearby or Use my location does.

### Linux command line 2.2.6

- The same version number as the apps.

### Android app 2.2.6

- The web app's changes above.
- **Get Off Alert in a Bluetooth earpiece** - Its beeps reach an earpiece or hearing aid that only takes calls, and with Earphones only on they're never played out loud.

### Desktop app 2.2.6

- The web app's changes above.

---

## 24 October 2026 (later): Apps 2.2.5, the sgbus terminal

### Web app

- **The sgbus terminal** - The Linux app's `sgbus>` prompt, full screen in the web app: type `84009`, `nav home work`, `favs -w` or any other of its commands instead of tapping. Tab finishes a word, Up brings back what you typed, Ctrl+C stops a `-w`. Open it from Settings, with Ctrl+` on a computer, or by typing `sgbus` in your browser's console. The Edge Tray stays beside it. What it saves is the app's own: `fav add 84009` there is a favourite on Bus timings too.
- **Every command, as on Linux** - The route planner, saved routes and navs, setting places, your calendar and Settings' pins, restricted areas and immigration time, with `--leave` and `--arrive`. It replaces `sgbus('...')` in the console, which took only some of them.
- **A warning in the console** - Opening your browser's console shows a warning, as Discord's does: never paste code there that someone sent you.
- **Explorer** - The live map from its own Edge Tray button, with every bus stop and MRT and LRT station round you as a dot to tap. A stop's card shows every bus there, green while it's running, red once it's down to its last three buses of the day, grey when it isn't running. A station's card has its codes in their lines' colours and, a platform at a time with arrows at the sides, the doors nearest its escalators, lifts and stairs and where each leads. Both have Directions, to Navigate's Bus and train from where you are. Explorer can be turned off in Settings, Edge Tray buttons.
- **Tap the stops on your trip** - On the live map, a trip's stops and stations, and the stop a walk goes to, open the same cards.
- **Tours for Explorer and the terminal** - Each shows you round the first time it opens, as the pages do, and Settings, Show me around, has a button for each.
- **Another way, found for you** - When a last bus on your trip is lost, the trip finds another way and switches to it by itself, keeping the trip up to where the ride before that bus ends. A buzz and a notification say why and what to do now ("after Bus 21 to Blk 390, walk 3 min to Opp Blk 5, take Bus 12 there"), with Undo on the bar. Undone, Reroute takes it after all, and with your location on, Navigate from here opens Navigate from where you are.
- **Buses timed by the traffic** - Setting off now, Navigate times buses by LTA's live traffic, so a bus through a jam is slower and a train can win; a trip's minutes left go by it too. A bus slowed by traffic says by how much and why, the roads by name and any accident or breakdown on its way.
- **Traffic on the map** - Tap where it says a bus is slowed for its road on the live map: green clear, orange slow, red jammed, with its incidents marked.
- **A faster way, on a trip** - Every few minutes, while you wait or ride, the trip looks for a quicker way, its first bus by live timing. If one saves enough, the bar suggests it, and why: Reroute takes it, Keep my way doesn't.
- **Walking and cycling** - Navigate says how long walking the whole way takes where it might compete, and with Settings' new Cycling, how long cycling takes, each with Walk it or Cycle it on the live map. A trip counts them for a faster way too.
- **Last buses in Navigate** - A way says when you'd be catching a bus within half an hour of its last of the day.
- **Walks to places off the footpaths** - Where the footpaths stop short of a place, out on a road with none, such as an industrial road or a lamp post along one, the live map's walk goes the last stretch along the road and says so, so you can watch for traffic. Never along an expressway: the walk stops at the nearest footpath and says why.
- **Change here** - On a trip's timeline, Change my way puts a Change here by every stop ahead, so any can be where you get off instead: pick from the ways on from there, and the trip changes to it, the Get Off Alert and all. Hidden until asked for, and every change to a trip, yours or its own, has Undo.
- **Midnight as 00:00** - A last bus at midnight says 00:00, not 24:00, in a stop's timings, Explorer and on a trip.
- **The Newsfeed in Service alerts** - What LTA and the operators announce ahead of time, read every hour from LTA's announcements and SBS Transit's, SMRT's, Tower Transit's and Go-Ahead Singapore's news: a run's closed roads and the stops buses skip, night closures, new services, train service adjustments. What's on in the next two weeks, with its buses, marked where it names your favourite stops or buses, then the operators' latest news.
- **Skipped stops on a stop's timings** - When buses skip a stop today or tomorrow, its timings say which and for how long: "Today: 97, 106, 133 skip this stop, first bus to 8.30am."
- **Newsfeed notifications** - A third kind beside trains and traffic: All news, or Service changes only.
- **Last bus soon, on a trip** - A red warning on the trip bar, with a buzz and a notification, when a bus you've still to get on is down to its last three of the day, its last bus leaves before you'll reach its stop, or it's gone.
- **Also direct buses in a stop's timings** - On a trip, a bus stop tapped on the trip bar's timeline shows the other direct buses' timings there too, not only your bus's.
- **Refresh one bus** - Round arrows under each bus's Flag button fetch that bus's timings alone, without scrolling back up to Refresh.
- **Nothing hidden under the trip bar** - While a trip runs, the page scrolls far enough that its end, such as the bottom bus's first and last bus times, clears the trip bar, however tall it gets.
- **Trips on the live map follow the roads** - A bus ride's line runs along the roads the bus takes, stop to stop, with your dot on them, and every walk's dotted line along its streets, not straight across.
- **Tap a bus on a stop card** - On Explorer and the live map, each bus on a stop's card opens that bus's timings at the stop.
- **Minutes left by the bus's live timing** - While you wait at the stop on a trip, the trip bar, the live map and a shared ETA count the wait by your bus's live timing there, not the wait planned when the trip began.
- **Show bus timings from a stop card** - On Explorer and the live map, a bus stop's card has Show bus timings above Directions: the stop's full timings on Bus timings.
- **The map starts afresh** - Opening Explorer or the live map goes straight to where it starts, flat and north up, with nothing left over from the last time, rather than gliding over from where it was left.
- **Refresh on Glance** - A round button beside the chip fetches the times at once, rather than waiting for the next 30-second refresh.
- **Interchanges as pills** - On Explorer, a station on more than one line is a pill in all their colours, split on a slant as on the MRT's signs, always in the same order: green, red, purple, orange, blue, brown, then the LRT's grey.
- **A clearer escalator** - The escalator beside a station's doors is drawn as one: its handrail from landing to landing, with someone on it.
- **The terminal's full width** - With the Edge Tray tucked away, the terminal uses the whole width of the window. Only its top bar keeps clear of the tray's arrow.

### Telegram bot

- **Buses timed by the traffic in /nav** - As on the web: setting off now, buses go by LTA's live traffic. 🚦 marks a bus it slows, and the way itself says by how much and why, with a button to its road on the web app's live map, coloured by how jammed it is.
- **Last buses in /nav** - ⏰ marks a bus you'd catch near its last of the day, and the way says when the last one is.
- **Walking and cycling in /nav** - How long walking the whole way takes, where it might compete, and cycling with Settings' new 🚲 I have a bike, which syncs with the web app.
- **Midnight as 00:00** - A stop's first and last bus line says 00:00 for a last bus at midnight, not 24:00.
- **The Newsfeed in /alerts and /sub** - LTA's notices for the next two weeks, with their buses, and the operators' latest news; a third row in /sub to be sent new ones, all or service changes only; and a stop's timings say when its buses skip it today or tomorrow.

### Linux command line 2.2.5

- **Its commands shared with the web app** - The same file runs both, so they say the same thing. `nav` and `place set` list plus codes among the ends they take.
- **Midnight as 00:00** - A last bus at midnight says 00:00, not 24:00.
- **Safer to print** - Text from the data, such as a calendar event's title or a place synced from another device, can't send your terminal escape codes: only sgbus's own colours get through.
- **Your calendar's link stays out of the history** - `calendar set <link>` isn't kept in `~/.cache/sgbus/history`, or for Up.
- **Settings line up** - `sgbus settings` keeps its columns straight when a pin is at the bottom.

### Android app 2.2.5

- The web app's changes above. In the app, the terminal's `routine` commands set the app's routines.

### Desktop app 2.2.5

- The web app's changes above.

---

## 24 October 2026: train doors at almost every station

### Web app

- **Just the door number** - The door tips now give the number on the platform door itself ("Door 8"), not a car and a door in it: the platform screen doors hide where one car ends. Each is drawn as a little door in the line's colour.
- **Where the door number is** - Under the doors, a little drawing shows where to find the number on the platform door: on the panel above the doors, at the top right of each door, or near the top of the post beside it at elevated stations.
- **A tour for every page** - Like Glance's, each page now shows you around the first time you open it: Bus timings, Favourites, Navigate, Service alerts, Your trips and Places. Settings, Show me around, has a button for each to see it again.
- **Which door, at a glance** - The door tip is a panel now, not a sentence: a row for each escalator, lift and stairs with its icon, where it goes, and its doors as "Car 3 · Door 1".
- **Which door, nearly everywhere** - Navigate's door tips now cover almost every MRT station, not a handful.
- **The doors for your next line** - Changing trains, it gives the doors nearest the way to the line you're changing to, not just the way out.
- **Malls and terminals** - Getting off, it names where an escalator or lift leads when it's somewhere in particular: Jewel, a terminal at Changi Airport, Nex, City Square and so on.
- **Changi Airport branch** - Rides to Expo and Changi Airport now get door tips too.

### Telegram bot

- **Which Blk 109?** - Did you mean in `/nav`, `/places` and Home and Work now gives each stop's number and road, each station's line codes and each building's address, so two stops of the same name can be told apart.
- **Coordinates and plus codes, said out loud** - `/nav`, `/places` and Home and Work now tell you they take GPS coordinates (`1.35, 103.85`) and plus codes (`7RQ8+X2`), as Navigate does on the web.

---

## 23 October 2026 (late): the live map in 3D, which train door to stand at

### Web app

- **Which door to stand at** - On a train ride in Navigate, where the station's in: the car and door that stop nearest the escalators, lift and stairs where you get off ("car 2, door 3 or car 5, door 1 for the escalators to the exit"), or that your next train is just across the platform. More stations are on the way.
- **A new live map, buildings in 3D** - The live map is now OpenFreeMap's, drawn on the phone: sharper at every zoom, with shops, stops and street names. Drag two fingers up the screen to tilt it and the buildings stand up in 3D; twist two fingers to turn it. The compass mode turns it smoothly now, the whole map rather than a picture of it. Dark mode has its own dark map.
- **OpenStreetMap as the fallback** - If OpenFreeMap can't be reached, the map changes to OpenStreetMap's own tiles. A phone or browser that can't draw the new map gets the flat OpenStreetMap map it had before.
- **Kept on the phone** - The map, and every part of Singapore you've looked at on it, is saved as you go, so it comes back at once and works offline, underground included.

---

## 23 October 2026 (night): Glance gets its own page, a compass map, sgbus in the console

### Web app

- **Glance, a page of its own** - The next bus, the chip and your stops' buses are now **Glance**, with the eye button at the top of the Edge Tray, and the weather with them. **Bus timings** comes next, just the search box and a stop's timings. The app opens on Glance unless Custom home says otherwise; tap a bus there for its timings, and Back comes back.
- **Next bus at a glance switches off** - Its On and Off in Settings did nothing before. Off now takes Glance out of the Edge Tray, and the app opens on Bus timings.
- **Back to Navigate** - A bus's timings opened from a way in Navigate have **Back to Navigate**, which goes back to that same way, instead of starting over from the Edge Tray.
- **Settings reachable on a trip** - The trip bar covered the bottom of the Edge Tray, Settings and the theme among it. The tray now scrolls up clear of the bar.
- **The map turns with you** - The live map has a compass button: the map stays on you and turns so the way your phone points is up, like a map app's compass mode. Without a compass, it turns the way you're moving.
- **sgbus in the console** - In a browser's developer console, `sgbus('84009 22*')`, `sgbus('nav home work')`, `sgbus('favs -w')` and the Linux app's other commands work against the site. `sgbus('help')` lists them.

### Android app

- **Picture-in-picture can be turned off** - Settings, **Picture-in-picture**: Off, and leaving the app on a trip or the map sends it to the background like any other app, without the small window.

---

## 23 October 2026 (evening): your buses at a glance, distances on loops, train alerts

### Web app

- **Only your buses at a glance** - Once you've starred a bus, the stops under the search box show only your favourite buses, and leave out a stop none of them is due at. A busy interchange is a line or two instead of a dozen. With no favourite buses, every bus shows as before.
- **Bus distance on loop services** - A loop that comes back up the other side of the same road (183 on Clementi Rd) could show a bus still on its way out as about 1 km away, in a straight line, when it had about 7 km to go round. It's along the route now.
- **Truer times on OneMap's ways** - A way in Navigate found by OneMap left out the waits for its buses and trains, so its time, and the arrival time on a trip's shared ETA, came out too soon: about 50 minutes for a trip that would take over an hour. They count the waits now, from OneMap's timetable.
- **Start trip fits on phones** - On a way in Navigate or the route planner, **Start trip** ran off the side of the card, under the Edge Tray. It now has a line of its own under All ways and Refresh.
- **Train alerts more often there** - Service alerts asks LTA again when its train alerts don't answer the first time, instead of saying it couldn't reach them.
- **Minutes left on a trip** - The trip bar, and the Android app's trip notification, end with how long is left to the end of the whole trip: `Bus 282: 1 stop to Blk 460 · part 2 of 6 · ~42 min left`. It counts the same as a shared ETA, waits included.
- **A trip survives the app closing** - Closing the app from recent apps, or Android closing it in the background, ended a trip with no trace, and its shared ETA link never arrived. Opening the app again now picks the trip back up where it was, and carries on its shared ETA, if it was still going within the last 3 hours.
- **Someone's ETA closes** - The window for a shared ETA link came straight back when you closed it with its X or Back, and only went away when the app was closed. It closes now.

### Telegram bot

- **A stop narrowed to some buses** - Send `84009 174, 175`, or `84009 22*` for every bus there starting with 22, as in the web app and the Linux app, and the stop opens narrowed to them. Works in inline mode too (`@UwUsgbus_bot 84009 22*`), and a narrowed stop with none of them due now says so.
- **Wildcards in routines** - In `/addroutine`, type `96*` for 96, 96A and every other bus at the stop starting with 96, as the web app takes it. The buses it covers are ticked in the grid, and unticking one keeps the rest. Changing a routine's stop keeps a wildcard that still covers a bus there.

### Android and desktop apps

- The web app's changes above, with no update needed.

---

## 23 October 2026 (later): Custom home, the next bus at a glance, and a tour

### Web app

- **The next bus at a glance** - Bus timings opens on the next bus in big letters, then your stops under the search box, each bus on one line with where it's going and its next three times. A chip over it picks the stops: your saved stops, the ones nearby (with when to leave, for the walk), or the ones near Home, Work or another place. Tap any of it for the full timings, and the X on those puts them away. Settings, **Next bus at a glance**, turns it off.
- **Pages, not windows** - Bus timings, Favourites, Navigate (with its Bus and train and Bus only tabs), Service alerts, Your trips and Places are each a page of their own now, with their buttons at the top of the Edge Tray, the one on show filled in. Taps that lead somewhere still go there: a saved stop opens its timings on Bus timings, a place opens the way there. Settings, the theme, the weather and other small things still open as windows.
- **Back goes back** - The Android app's back button (and a browser's, and Telegram's) closes the window that's open, then goes back to the page you were on, and only leaves the app once there's nothing to go back to. Before, it left the app with a window still open.
- **Custom home** - In Settings, **Custom home** (it was Opens on) picks the page the app opens on, first in the Edge Tray. A link to a stop, a bus or a journey still opens that. It syncs like the other settings.
- **A tour** - The first time the app opens, a short tour shows the basics, a light and an arrow on each. **Show me around** in Settings shows it again.

### Android and desktop apps

- The web app's changes above, with no update needed.

---

## 23 October 2026: Apps 2.2.4, choose what the app opens on, bus distance along its route, Navigate finds more, Arm and .rpm

### Web app

- **Choose what the app opens on** - In Settings, **Opens on**: your first favourite stop (as before), Favourites, or Navigate. A link to a stop, a bus or a journey still opens that. It syncs like the other settings.
- **Bus distance along its route** - A bus's distance in its timings is now how far it has to ride along its route to your stop, not a straight line, including a loop service passing your stop for the second time. Where the route isn't known, it's the straight line as before.
- **Stops by any name in Navigate** - Bus and train finds a stop however the stop search would: Block for Blk, Jalan for Jln, and the words in any order across the stop's name and road, so `block 29 bahagia` finds Blk 29 on Jln Bahagia. Stops no longer drop off the list when stations and places fill it.
- **Coordinates and plus codes in Navigate** - Type GPS coordinates (`1.35, 103.85`, or `1.35N 103.85E`) or a plus code, whole (`6PH57RQ8+X2`) or short (`7RQ8+X2`), at either end.

### Android app 2.2.4

- **Updating on Samsung phones and tablets** - When Auto Blocker stops an update, the app now says so, shows where to turn it off, and lets you try again, instead of closing.
- The web app's changes above.

### Desktop app 2.2.4

- **On Arm PCs** - The Windows installer now also installs on Windows on Arm, and Linux has .deb, .rpm and AppImage for 64-bit Arm, such as a Raspberry Pi on 64-bit Raspberry Pi OS. The .msi stays for Intel and AMD PCs.
- **An .rpm for Fedora and openSUSE** - For x64 and Arm.
- **When an update can't download** - A notification says so, once, with a link to download it from GitHub, rather than nothing happening.
- The web app's changes above.

### Command line for Linux 2.2.4

- **Plus codes and stops by any name in `sgbus nav`** - The same as Navigate's, at either end.

### Telegram bot

- **Coordinates and plus codes in /nav** - The same as the web app's.

---

## 21 October 2026 (night): Apps 2.2.3, time for immigration across the Causeway, a prompt for sgbus, wildcards in routines

### Web app

- **Immigration across the Causeway** - Journeys to Johor Bahru, and back, now count time to get off at the checkpoint, clear immigration on both sides and get on again, and show it as a step: get off at W'lands Checkpt, ride any bus across to the Johor Bahru checkpoint, then on. About 15 minutes when it's quiet and up to an hour at the rush, by when you'd get there: weekday mornings into Singapore, weekday evenings and Friday nights out, Saturday mornings out and Sunday evenings back. In Navigate and the route planner alike.
- **Immigration time** - In Settings, **By the time** (the default), or the time you usually take: 15, 30, 45 minutes or an hour. It syncs like the other settings.
- **Off at each checkpoint** - A trip across the Causeway has the Get Off Alert tell you to get off at both checkpoints, with the time to clear as the wait before getting on again.
- **Tidier immigration buttons** - Settings' Immigration time sits as By the time across the top, with the four times in a row under it.

### Android app 2.2.3

- **Wildcards in routines** - A routine's buses can be a wildcard, `22*` for every bus starting with 22. Before 2.2.3, the Routines window asks you to update for one.

### Desktop app 2.2.3

- The web app's changes above. Nothing new of its own: the same number as the Android app.

### Command line for Linux 2.2.3

- **Its own prompt** - `sgbus` on its own opens `sgbus>`, where each command goes without `sgbus` in front, with history from last time, Tab to finish a command or a place, and `exit` to leave. Ctrl+C stops a `-w` and goes back to it.
- **Immigration time** - Routes and navs across the Causeway count it, and show the step; `sgbus settings customs` sets your own.
- **Wildcards in routines** - `--buses 22*`.

### Telegram bot

- **Immigration across the Causeway** - `/route` and `/nav` count the time and show a 🛂 step for it, by the time of day.
- **Wildcards from the app** - A routine synced from the Android app with `22*` keeps it, and sends every bus starting with 22.

---

## 21 October 2026 (evening): Apps 2.2.2, a command line for Linux, Larkin by bus and train, several buses at a stop, editing routines

### Web app

- **Navigate to Johor Bahru** - Bus and train now plans to and from the stops across the Causeway, Larkin Terminal included, rather than saying both ends have to be in Singapore. Past searches, places and trips there are kept too.
- **Several buses at a stop** - After a stop's code, list the buses to see just those: **84009 174, 175**, or a link like `#84009,174,175`. A star picks every bus starting with what's before it: **84009 22\*** shows 22, 222, 225G and the rest.
- **Restricted areas** - In Settings, **I have a pass** lets Navigate and the route planner get on and off inside Changi Airport's cargo area and at MINDEF's stops, for the people who work there. Off unless turned on, and it syncs like the other settings.
- **Off where the stop faces your end** - The route planner now rides on a stop where that's nearer where you're going, rather than getting off a minute early and walking further: to Opp SAF Ferry Ter, off at SAF Ferry Ter across the road, not Changi Beach CP 5.
- **Close stays in reach** - On a phone, Navigate's close button stays at the top right of its title, with Refresh, Share and Save nav on the line below, rather than pushed off the edge.
- **Get the Android app** - On an Android phone's browser, a bar offers the Android app, with **Download** for the newest version and a link to how to install it. **Not now** puts it away for a month.

### Android app 2.2.2

- **Edit routines** - Each routine has an **Edit** button, which fills the form in with it to change and **Save**. No update needed: it reaches the app from the web.
- **A routine's own buses** - Tapping a routine for several buses opens the stop with just those buses, not every bus there.

### Desktop app 2.2.2

- The web app's changes above. Nothing new of its own: the same number as the Android app.

### Command line for Linux 2.2.2 (new)

- **sgbus** - SG Bus Timings in a terminal: a stop's timings (`sgbus 84009`, `sgbus 84009 22*`, `-w` to keep them on screen), search by name, road, station or postal code, a bus's route, the route planner, Navigate, favourites, places, routines as desktop notifications, service alerts, the weather and your calendar. It runs the web app's own route planner and search, so it finds the same journeys. A `.deb` for any architecture, or one file, needing only Node.js 18.

### Telegram bot

- **Off where the stop faces your end** - `/route` gets off at the stop nearest your end when it's only a minute or two further, as the web app now does.

---

## 21 October 2026 (later): Sync with the Telegram bot, and sync more

### Web app

- **Sync with the Telegram bot** - In Settings, **Sync with the Telegram bot** shows a code and **Open the bot**, which opens the bot with it filled in (or send it `/sync` and the code). Then Import and Export work as between two devices: your name and birthday, favourite stops, buses, routes and navs, places, routines, your calendar's link and where favourites pin, either way. It goes through the site's server, kept there 10 minutes at most.
- **New tray icons** - In the Android app, the Edge Tray's **Timings near a stop** button is now a clock, and **Routines** an alarm clock.
- **Sync by kind** - Above what's on offer, a button for each kind (Bus stops, Places, Routines, Settings and so on), with how many of it there are, shows just that one, and **Select all** ticks just those. Ticks in other kinds stay, so one tap still copies the lot.
- **Sync more** - Between two devices, sync now copies routines and last bus reminders (between two phones with the Android app), your calendar's link, and the settings you've changed, such as dark mode, the colour, the Edge Tray's side and buttons, the Get Off Alert and Shake to refresh. Each side is only offered what the other can keep.

### Telegram bot

- **/sync** - Syncs with the web app or the Android app by the code its Settings shows: the bot sends what it has, and says what it saved from your device. `/sync stop` ends it.

---

## 21 October 2026: Apps 2.2.1, MyICA on trips to the checkpoints

### Web app

- **MyICA at the checkpoint** - On a phone, a trip to Tuas or Woodlands Checkpoint (or Woodlands Train Checkpoint), or on across the Causeway, has a **MyICA** button on the trip bar, for ICA's app and its immigration QR code. It opens MyICA Mobile's Play Store or App Store page, which says **Open** once it's installed. From the route planner and Navigate alike.

### Android app 2.2.1

- **Opens MyICA itself** - The trip's **MyICA** button opens MyICA Mobile straight away, as the SimplyGo button does SimplyGo, or its Play Store page if it isn't installed.

### Desktop app 2.2.1

- The web app's change above. Nothing new of its own: the same number as the Android app.

---

## 21 October 2026: Routines and Timings near a stop in the Edge Tray

### Android app

No update needed: these reach the app from the web.

- **Their own buttons** - **Timings near a stop** and **Routines** move out of Settings onto buttons of their own in the Edge Tray, a crosshair and a clock, each opening its own window.
- **Routines in one place** - Its window lists your routines, to remove, with **Add a routine** underneath, and stays open after adding so you can set up another.
- **Turn them off** - Either button can be turned off in Settings, **Edge Tray buttons**, like SimplyGo and the guide.

---

## 20 October 2026: Shortened names in search, stations on the web, loops split in two

### Web app

- **Name and road together** - Type a stop's name and its road in any order, **Blk 109 Bedok**, and the list narrows to the Blk 109s on Bedok's roads rather than every Blk 109 in Singapore. Stops matching what you typed in one piece still come first.
- **Shortened names** - Search finds a stop whichever way the word is typed: **Bukit Batok** finds Bt Batok Int, **Opposite Block 10** finds Opp Blk 10, and Ctr and Ctrl both find Centre and Central, among about 90 of LTA's short forms. A line above the matches says when some were only found that way: **Also searched Bt for Bukit**.
- **Stops at a station** - Type **Bedok MRT**, **Senja LRT** or **Botanic Gardens station** and the list is the stops within about 250 m of its exits, nearest first, with how far each is, as in the Telegram bot.
- **Loops in two** - A loop service passing a stop twice, such as 73, is now listed twice, **→ Lor 6 Toa Payoh** on its way out and **↩ Ang Mo Kio Int** on its way back, each in its own colour, as a bus going both ways is. Each may show fewer than three buses, since LTA gives three for the two. The departures board too.
- **Across the border** - Woodlands Checkpoint says **Immigration checkpoint**, and the stops in Johor Bahru (its checkpoint, JB Sentral and Larkin Terminal) say **In Malaysia**, both with a passport reminder, on the stop, in search results and in route lists.

### Telegram bot

- **Name and road together** - The same: `blk 109 bedok` finds the Blk 109s on Bedok Nth Rd and Bedok Nth Ave 3.
- **Shortened names** - The same: `bukit batok` finds Bt Batok Int, and the list says **Did you mean (also searched Bt for Bukit)**.
- **Loops in two** - A loop passing twice gets a heading per time round, `73 (SBST) 🔵 → Out to Lor 6 Toa Payoh` and `🔴 ↩ Back to Ang Mo Kio Int`, in place of the Way row.
- **Across the border** - Those stops say so under their name, and their buttons in a list carry 🛂.

---

## 20 October 2026: Apps 2.2.0, which way each bus is going, routines on Android

### Web app

- **Which way it's going** - At a stop a bus calls at going both ways, such as 136 at S'goon Gdn Circus, each of its two listings says where it's heading under its number, **→ Punggol Int**, in a colour of its own, and the Incoming buses bar matches. Its first and last bus, and its **Route** button, are now for that way, not always the first.
- **Loops passing twice** - Where a loop service passes on its way out and again on its way back, such as 73, each bus says which time round it's on: **Out to Lor 6 Toa Payoh** or **Back to Ang Mo Kio Int**. The departures board too.
- **One place, two stops** - Woodlands Int is two stops, 46008 and 46009, with different buses. Each now has a button to the other, as does any stop sharing its name with one close by.
- **Authorised personnel only** - The stops inside Changi Airport's cargo area, and MINDEF's on Gombak Drive, say so. The route planner and Navigate never have you get on or off at one, and never ride through the cargo area. Route lists mark them.
- **Room to type** - With the side tray out on a phone, **Get Timings** moves under the search box rather than squeezing it to a few letters.
- **Location, second try** - When your location can't be found at full accuracy, as indoors where GPS can't reach, it tries again with Wi-Fi and the mobile network before giving up. If it still can't, it says to check Location is turned on.
- **A tidier Edge Tray** - **Edge Tray buttons** in Settings turns off any of SimplyGo, the Telegram bot, Buy Augy a Coffee and the guide.

### Telegram bot

- **Which way it's going** - A bus listed twice at a stop says where each is heading in its heading, `136 (GAS) 🔵 → Punggol Int`, with that way's first and last bus. A loop passing twice gets a **Way** row: 🔵 Out or 🔴 Back.
- **One place, two stops** - Woodlands Int's two stops each say so, with a button to the other.
- **Authorised personnel only** - Those stops say so, and routes never get on or off at one or ride through the cargo area.

### Android app 2.2.0

All of the web app's changes above reach the app as they are. These need the update:

- **Routines** - In Settings, **Add a routine**: a stop, the buses you want or all of them, a time and the days. At that time a notification shows the stop's next buses, like the Telegram bot's routines. Tap it for their timings.
- **Turn on location** - Tapping Near me, Navigate's "from where you are" or Places' "where you are" with the phone's Location off now asks to turn it on with one tap, then carries on, rather than saying it couldn't find you.
- **Card value, read** - Holding a card to the phone, the app says **Reading your card…** the moment it finds it, then **Done: you can take your card away** with two short buzzes, so you know how long to hold it.

### Desktop app 2.2.0

- All of the web app's changes above. Nothing new of its own: the same number as the Android app.

---

## 19 October 2026: Apps 2.1.2, desktop links shared with other UwU apps

### Desktop app 2.1.2

- **Other UwU apps' links reach them** - With another UwU desktop app installed, such as uwuPromptr, a `uwu://` link for it now opens that app rather than SG Bus Timings, whichever of the two you opened last. Links for SG Bus Timings open it as before.

### Android app 2.1.2

- **Same number as the desktop app** - Nothing new of its own: Android already sends each `uwu://` link to the app it's for.

---

## 18 October 2026: Direct buses on trips, timeline fix

### Web app

- **Other direct buses** - On a trip, while you wait at the stop, the trip bar lists the other buses that go straight to the same stop, with how long each is: **Also direct: 51 in 3 min**. The timeline lists them under each bus ride too.
- **Timeline stops open their timings again** - On a trip, tapping a bus stop on the timeline shows that stop's timings for your bus again. Some trips' stops, such as ways found by OneMap in Navigate, were plain names that did nothing when tapped. A trip already under way gets its stops back too.

---

## 18 October 2026: Picture-in-picture fix

### Android app

- **Back from picture-in-picture, the right size** - Opening the app again from its small picture-in-picture window no longer leaves the page zoomed in, with the side buttons cut off and the page scrolling every way, worse each time. It comes back at its usual size, where you left it; now and then it reloads to get there, and a trip carries on. No app update needed.

---

## 18 October 2026: Apps 2.1.1, new versions as notifications

### Android app 2.1.1

- **Hear about new versions** - Turn on **New versions of the app** in Service alerts, and a notification says the moment a new version is out, even with the app closed. Tap it to update. A watch paired with your phone shows it too. Needs Google Play services.
- **Widget preview** - Adding the Bus timings widget, the widget list now shows it with some example buses rather than an empty card, in light and dark.

### Desktop app 2.1.1

- **New versions sooner** - The app looks for a new version every hour rather than every six, and again when your computer wakes from sleep.
- **New versions of the app** - A choice in Service alerts: turn it **Off** to stop the notifications about new versions. The tray's menu and the title bar still offer the update.

---

## 17 October 2026: Apps 2.1.0, and a watch app

### Web app

- **Flag down your bus** - **Flag** by each bus on a stop's timings shows its number as big as the screen allows, white on black, to hold up at a dark stop. The screen stays on while it's up.
- **Departures board** - **Board** on a stop's timings shows its buses full screen, like an interchange's screens: where each is going, its next three, how full they are, a page at a time. Leave a TV or spare monitor on one with a `#board/` link.
- **Will I make it?** - **How far's my walk?** under a stop's buttons says roughly how long the walk there is from where you are, and which buses you'd make if you left now; the ones you wouldn't are greyed.
- **Shake to refresh** - On a phone, a firm shake refreshes the stop's timings, for when one hand's on a pole. It can be turned off in Settings.
- **Search by voice** - In browsers that can listen, such as Chrome, the microphone in the search box takes a stop, its code or a bus, said out loud.
- **Train lines found by OneMap get their colours** - Fixed: in Navigate, train rides in the ways OneMap found (marked "Found by OneMap") had no line colour dot. They now have the same dot as the rest.
- **The Edge Tray scrolls** - When its buttons run past the bottom of the screen, as they can now in the apps, the column scrolls rather than leaving the last ones out of reach.
- **A new icon** - A green bus with an UwU face, on the site's mint, on your home screen, in the browser tab and in the apps.
- **For AI assistants** - [`llms.txt`](https://sgbus.uwuapps.org/llms.txt) tells an AI assistant how to open the app at a stop, a bus or a journey for you, and how to read the live timings.

### Android app 2.1.0

- **Share straight to Telegram and WhatsApp** - On the share card, Telegram and WhatsApp now open the app itself, ready to pick a chat, rather than a web page in the browser that then passes you on to the app. If the app isn't installed, the web page opens as before.
- **Offline Sharing** - A fifth button on the share card hands a place, directions or your live ETA to a phone next to you, with no internet on either. Hold the backs of your phones together, and it opens on theirs in SG Bus Timings, or in their browser if they don't have it. Or, without touching, send it over Bluetooth to a phone with **Receive nearby** open, a new button in the Edge Tray. The receiving phone needs the internet to plan the way there.
- **NFC stickers** - Write a stop, a place or the way home onto a blank NFC sticker, and a tap of any phone opens it: **NFC sticker** on a stop's timings, or from Offline Sharing.
- **Timings near a stop** - Pick favourite stops in Settings, and as you walk up to one, a quiet notification shows its next buses until you leave, with the app closed.
- **Time to leave** - For events in your phone's calendar with a place, a notification when it's time to set off by bus and train, with the way to go.
- **Last bus reminders** - The bell by a bus's last bus time reminds you 20 minutes before it, every day it runs.
- **"On a bus?"** - When you seem to be riding with no trip running, a quiet notification offers to start one for the Get Off Alert.
- **Bus home and Bus to work** - With Home or Work set in Places, long-press the app's icon, or add their Quick Settings tiles, to go to Navigate from where you are.
- **Search by voice, and scan a stop** - The search box's microphone uses Android's own speech screen, and its camera reads the 5-digit code off a stop's pole.
- **Earphones-only Get Off Alert** - In Settings, the alert's beeps can play only in your earphones, never out loud; without earphones in, it just buzzes.
- **Flag-down screen** - In the app, it also goes to full brightness, with the torch, steady, if you want it.
- **Trips that keep running** - The first trip offers to leave the app out of battery optimisation, so phones that stop apps in the background don't stop the trip.
- The web app's changes above.

### Wear OS app 2.1.0 (new)

- **A Bus timings tile** - On Wear OS 3 and later, the next buses at your nearest favourite stop, counting down on the watch by itself. Your favourites come from the phone's app. Tap it for every favourite stop. Installed from a computer for now: see the guide's Wear OS page.

### Desktop app 2.1.0

- **A stop's buses in the tray** - **Tray countdown** on a stop's timings puts its next buses in the tray icon's tooltip, and on a Mac beside the icon in the menu bar and on the Dock icon, refreshed every 30 seconds.
- **Favourites on the taskbar and Dock** - Your favourite stops in the Windows taskbar icon's right-click menu and the Mac's Dock menu; on Windows, Refresh and the previous and next favourite under the taskbar preview too.
- The web app's changes above.

---

## 13 October 2026 (evening): Trains on the live map follow the track

### Web app

- **Train rides follow the track** - On a trip's live map, a train ride is drawn along its line's real track, the way [sgraildata](https://github.com/cheeaun/sgraildata) maps it, from the station you board at to the one you get off at, rather than straight from station to station. Underground, where there's no GPS, your dot moves along the track too.
- **On someone's shared trip too** - Following a friend's live ETA on the map, their train rides follow the track as well, and underground their dot moves along it. Links shared before this update are drawn as before.
- **Live map stays on OpenStreetMap** - The live map no longer switches to OneMap's map when OpenStreetMap's is slow to load, as OneMap's lags. Parts of the map that didn't load, on a weak signal or underground, are fetched again once the signal's back. Shared links' preview images still use OneMap.
- A website update, so the Android and desktop apps have it as soon as they open, with no new version to install.

---

## 13 October 2026 (later): Apps 2.0.8

### Web app

- **Your places fit in Navigate** - Fixed: with more than a few places saved, the buttons under From and To ran off the side of Navigate and pushed it wider than the screen. They now wrap onto as many lines as they need, on both the Bus and train and Bus only tabs.
- **Your trips open smoothly** - Tapping a trip in Your trips now slides its details open, and tapping it again (or another trip) slides them shut, rather than snapping.

### Android app 2.0.8

- **Walking or riding, by speed** - On a trip, the app also goes by how fast you're moving, so it tells walking from riding with the screen off, when your steps can't be counted. Up to about 10 km/h is walking; a bus or train's speed, about 40 km/h on average, is riding. Riding speed 150 m down your bus's route counts as boarding, and riding speed is never taken for walking, whatever the motion sensor says.
- **Hold a card to the phone** - Hold an EZ-Link or NETS FlashPay card to your phone and Android offers SG Bus Timings for it, even with the app closed: the card's value opens straight away. While the app is open, it takes the card without asking.
- The web app's changes above.

### Desktop app 2.0.8

- The web app's changes above.

---

## 13 October 2026: Apps 2.0.7

### Web app

- **Navigate, now with Bus only** - Plan a route is now a tab in Navigate: **Bus and train** for any two places, **Bus only** for two bus stops. Switching tab keeps your two ends (a place becomes the bus stop at it, or the nearest one) and your time. The Edge Tray has one **Navigate** button, the arrowhead, which opens on the tab you used last. Saved routes are under **Bus-only routes** in Favourites.
- **Press and hold for a button's name** - On a phone or tablet, press and hold any button to see what it does, as hovering does with a mouse. Letting go doesn't press it.
- **Bigger buttons and text** - The Edge Tray's buttons and icons are bigger, and the smallest text across the app is a size up.
- **Birthday** - On your birthday the greeting says how old you're turning, "Happy 28th Birthday, Sam!", on two lines so your whole name shows. And there's confetti each time you open the app that day; turn it off in Settings with **Birthday confetti**.
- **Get Off Alert notices you've boarded sooner** - You count as on the bus once you're 150 m down its route, rather than 300 m.
- **Walking or riding** - On a trip, your phone's motion sensor tells walking from riding by your steps. Walking along a bus's route to your stop never counts as boarding; after a walk, 100 m down the next bus's route is enough once you've stopped walking; your first steps off a bus at your stop start the walk; and on a walk with no GPS, your steps move you along rather than the clock.

### Android app 2.0.7

- **Bus timings widget** - A new widget with no stop yet opens its setup wherever you tap it, as it says, not only on its title. Once set up, tapping anywhere but a bus or the refresh button opens the stop.

### Desktop app 2.0.7

- **Location on Linux** - Fixed: Stops near me, Navigate's "where I am", the live map and trips couldn't get your location in the Linux app (AppImage and .deb). It now works it out from the Wi-Fi networks around you, so Wi-Fi needs to be on. If it still can't, it says why.

---

## 12 October 2026 (night): Apps 2.0.6

### Web app

- **Get Off Alert notices you've boarded** - Fixed: on some buses, the trip didn't notice you'd got on, so it stayed at your first stop as the bus moved off. This happened when the bus used a road that the map's route for it missed, like a bus-only road. Now, if your location is off that road, the trip falls back on the line between the stops. Once you're near a stop further down the route, it counts you as on the bus whatever the road says.
- **On to the bus after a walk** - Fixed: if you waited a little way from where the walk to your stop ends, the trip stayed on the walk after you'd boarded. Once you're on the next bus, a few hundred metres down its route, the trip moves on to it.
- **Back on the trip bar** - Pressed **Next** by mistake? **Back** takes the trip back to the part before, where you'd got to on it, and its Get Off Alert can go off again. If you'd already finished that part, it starts again from the beginning, and your location puts you where you really are.
- **Parts, not legs** - The trip bar now says "part 2 of 3" rather than "leg 2 of 3", and its buttons are **Back** and **Next**. Each ride and each walk is a part. A shared live ETA says the same.

### Android app 2.0.6

- Kept in step with the web app's version; the fixes above are in the web app it shows.

### Desktop app 2.0.6

- Kept in step with the Android app's version; the fixes above are in the web app it shows.

---

## 12 October 2026 (evening): Apps 2.0.5

### Web app

- **Get Off Alert on expressways** - Fixed: on a bus that runs a long way between stops, like along an expressway to the airport, the trip didn't notice you'd boarded, so the dot stayed at your stop and the alert never came. The trip now follows the road the bus actually takes, and counts you on the bus once you're within 100 m of that road and moving along it, or once you reach a later stop.
- **Get Off Alert with the app open** - Fixed: when the server spotted your bus nearing your stop before the app did, with the Android app open, the trip bar showed the alert without a buzz, beep or notification. It now sounds like any other alert.

### Android app 2.0.5

- **Smoother tracking** - On a trip, the app asks for your location 20 times a second (as fast as your phone's GPS can give it), so the dot follows the bus closely.

### Desktop app 2.0.5

- Kept in step with the Android app's version; the fixes above are in the web app it shows.

---

## 12 October 2026: Apps 2.0.4

### Web app

- **Get ready to board** - On a trip, while you're waiting at the stop, the app checks your bus's live timing and pings you when it's **1 minute away**: a notification, two short buzzes, and the trip bar says so. Only once per bus, and only while you haven't boarded yet; with the app in the background, the server sends it instead.
- **Trip timeline** - Tap a bus stop on the trip's timeline to see that stop's timings for your bus. The timeline closes and the page scrolls down to them, with the trip still running.

### Android app 2.0.4

- **Get ready to board** has its own notification kind in Android's settings for the app, with a short double buzz rather than the Get Off Alert's "OFF".

### Desktop app 2.0.4

- **Check for updates...** - In the tray's menu: checks now, and tells you what it found, even when you're up to date.
- **Update button** - Once an update's downloaded, a green button in the title bar, right of the long screenshot button, restarts the app to install it.
- The Get Off Alert and Get ready to board show as desktop notifications.

---

## 12 October 2026 (late night): A sharp launch screen

### Android app

- **Launch screen** - The bus icon on the screen you see while the app opens is sharp now, not blurry.

---

## 12 October 2026 (night): Instant View for every share link

### Web app

- **Share to Telegram** - Shared places and live ETAs are ready for Telegram's **Instant View** too, like shared directions: a place shows where it is, and an ETA shows where they're going, when they'll get there and where they are, with the time it's from and a link on to follow along live.

---

## 12 October 2026 (evening): Instant View for shared trips

### Web app

- **Share to Telegram** - Shared directions are ready for Telegram's **Instant View**: both ends, the time and the map, right in the chat, with a link on to the app. Share's **Telegram** button sends the plain trip link, like every other button.

---

## 12 October 2026 (afternoon): The web app inside Telegram

### Telegram bot

- **Open app** - The menu button beside the message box now opens the full web app inside Telegram, as a Mini App. **Open web app** on `/start` opens it there too.

### Web app

- **In Telegram** - Opened from the bot, the app takes on its theme's colours in Telegram's bar, Telegram's **Back** closes the live map, links out open in your browser, and swiping down no longer closes the app while you're moving the live map.

---

## 12 October 2026 (morning): Apps 2.0.2

### Web app

- **Sync** - Now called **Sync with another device**, it copies your name and birthday and your past searches too, as well as favourites, places and trips.
- The Edge Tray keeps its buttons full size when the keyboard's open, scrolling instead of squashing them.

### Android app 2.0.2

- **Bus timings widget** - A stop's live timings on your home screen, resizable any way, for every bus or just the ones you pick.
- **Picture-in-picture** - During a trip or with the live map open, going home shrinks the app into a small window over your other apps.
- **Card value** - Reads the card's value correctly, and lists its recent rides and top-ups.
- **Share** - **More** on share cards opens Android's share sheet.
- Sharper notification icon.

### Windows and Linux apps 2.0.2

- **Bus timings widgets** - A stop's live timings in a small window on your desktop, from the tray's **Add a Bus timings widget**.
- **Updates itself** - Checks for new versions; the `.exe` and AppImage install them with a restart.
- Opens maximised, and starts when you sign in (the tray's menu turns that off).
- Sharper tray icon.

---

## 12 October 2026 (late): Apps 2.0.1

### Android app 2.0.1

- **Card value** - Auto top-up only shows for a card that has it turned on. A value the card can't really hold now says it couldn't be read rather than showing a wrong amount, and **Card data** lets you copy what the card said, without its number, to report a card that reads wrongly.

### Windows and Linux apps 2.0.1

- **App links** - `uwu://sgbus/` links open the desktop app, such as `uwu://sgbus/84009` for a stop.

---

## 12 October 2026 (later): Live map, walks on trips, and the 2.0 apps

### Web app

- **Live map** - Directions on a stop, and on a walk in Navigate, now open a live map instead of Google Maps: OpenStreetMap, following where you are, with the walk drawn turn by turn and the next turn spelt out. It opens close in at street level, and **Overview** shows the whole way at once. Stray from it and it finds the way again. Citymapper is still there too.
- **Live map on trips** - The map button on the trip bar shows the whole trip, every ride and walk, with its stops and you on it.
- **Walks on trips** - A trip now starts with the walk to your first stop, includes the walks between rides, and ends with the walk to where you're going, rather than starting at the first stop and ending at the last. Each walk shows on the timeline, and the trip moves on as you get there. A way that's all walking can be followed as a trip too.
- **Follow a shared trip live** - Someone you share your ETA with now sees your dot move: on the live map (**Follow on the map**) or on a timeline of your stops, updated every 10 seconds.
- **Navigate's button** in the Edge Tray is now a train, so it isn't mistaken for directions.
- **No more ads**, on the web app or the guide.

### Android app 2.0.0

- **Rebuilt as a real app** (Capacitor instead of a Chrome wrapper). 1.2.0 updates to it like any update.
- **Trips with the screen off** - The Get Off Alert follows your trip with the phone locked, with an "On a trip" notification (and End trip on it), and sounds over the lock screen. The first trip also asks to allow location all the time.
- **Card value** - Hold an EZ-Link or NETS FlashPay card to the back of the phone to see what's on it, with its expiry and auto top-up: the card button in the Edge Tray, or long-press the app's icon. On phones with NFC.
- **Service alerts as notifications** in the app.

### Windows and Linux apps 2.0.0

- **SG Bus Timings for Windows** (`.exe` or `.msi`) **and Linux** (`.deb` or `.AppImage`), from the releases page. It stays in the tray when closed, shows Service alerts as desktop notifications, and can start when you sign in.

### Telegram bot

- **Live map** - A stop's Directions now offers **Live map**, which opens the web app's live map (or the Android app's, if you have it) walking you to the stop, in place of Google Maps.

---

## 12 October 2026: The Android app updates itself

### Web app

- **App updates** (Android app 1.2.0) - When there's a new version of the Android app, a bar at the top says so. Tap **Update** and the app downloads it and opens Android's installer, with nothing to find on GitHub. The first time, Android asks you to allow SG Bus Timings to install apps. On 1.1.0, the bar's **Download** opens the new version on GitHub, to install once by hand.
- **App links** (Android app 1.2.0) - App links are now `uwu://sgbus/`: `uwu://sgbus/84009` for a stop, `uwu://sgbus/nav` for Navigate. `uwusgbus://` links no longer open the app.

---

## 11 October 2026 (later): Your trips, Places, past searches and calendar

### Web app

- **Your trips and stats** - Every trip you take with the Get Off Alert is kept in Your trips (the bar chart in the Edge Tray), grouped by week, with each ride's wait and ride time. Tap a trip to plan it again, share it as a link, or delete it. Below the trips, **Trip Mix** shows how your time splits between walking, waiting and riding, and **Trip Modes** which operators and lines you ride most (SBS Transit, SMRT, Tower Transit, Go-Ahead Singapore, MRT, LRT).
- **Places** - A new Places window (the bookmark in the Edge Tray) keeps Home, Work and any other place, with a name of your own like "Gym" or "Mum's". Tap one for the way there; its menu edits, shares or deletes it. Every place is also a button under the ends of Navigate and Plan a route. Home and Work moved here from Settings.
- **Share a place or a trip** - Share Home, Work or any place as a "How to get to" link, and share a past trip as a link with every way there.
- **Past searches** - Tap into any search box (the main search, Navigate, Plan a route, Places) and it drops down what you searched for before, from the last 24 hours and earlier, with tabs for your saved places and, in Navigate, your calendar. Each search can be saved as a place, shared or removed.
- **Calendar** - Link your calendar by its private iCal link (Google Calendar, Outlook, iCloud), or import an .ics file, and its events with a location show in Navigate for the next two weeks. Tap one for the way there, arriving by its start.
- **Sync** - Syncing favourites between devices now copies your places and trips too.

### Telegram bot

- **/places** - Home, Work and your own places: get there, share as a link, rename, move or delete. **/addplace** saves a new one. Your places are buttons on the `/nav` and `/route` panels too.
- **/calendar** - Link your calendar's private iCal link once, then see its events with a location, each a button that plans the way there to arrive on time.

### Fixes

- A search box no longer closes its suggestions when you tap back into it quickly.
- The menus behind the three dots, in Places, past searches and Calendar, now slide open and closed.
- **SimplyGo** - On a phone or tablet, SimplyGo's icon in the Edge Tray goes to its app, for your card balance, top-ups and travel history. It opens SimplyGo's store page, where Open launches the app; with the Android app, SimplyGo itself.
- **Android app** - SG Bus Timings is now an Android app too, shared as an APK file on GitHub Releases: the same app, full screen, opening SimplyGo straight from its button.
- **Your phone's calendar** (Android app 1.1.0) - The Calendar tab can read your phone's own calendar, every calendar on it, with nothing to paste.
- **App links** (Android app 1.1.0) - `uwusgbus://` links open the app: `uwusgbus://84009` for a stop, `uwusgbus://nav` for Navigate.

---

## 11 October 2026: Home and Work, and short share links

### Web app

- **Home and Work** - Set them once, then tap Home or Work under either end of Navigate or Plan a route.
- **Share menu** - Navigate's Share makes short links: your live ETA on a trip (`/eta/...`), these directions (`/trip/...`), or the start or end (`/go/...`). A live ETA keeps updating while the app is in the background.
- **Start trip on OneMap ways** - Ways found by OneMap can now be followed as a trip, and a way that can't be followed says so instead of closing Navigate.

### Telegram bot

- **Home and Work** - `/sethome` and `/setwork`, or Set home / Set work in `/settings`, add Home and Work buttons to the `/nav` and `/route` panels.

### Guide

- The top bar stays pinned as you scroll, with a back to top button on every page.

---

## 10 October 2026: Edge Tray, sharing and Google Maps links

- **Edge Tray** - The top buttons moved into a tray fixed to the corner of the screen, tucked away with its arrow. Settings picks left or right. Favourites open in their own window from the star, with a count.
- **Windows** - Navigate, Plan a route and Service alerts open as windows over the page; tap outside or the close button to go back.
- **Share** - Share a nav or a planned route as a link, even part filled in.
- **Google Maps links** - Paste a Google Maps link into Navigate, or share a place from Google Maps to the installed app, and it becomes that end. The bot's `/nav` takes them too.
- **Fix** - The route planner's "stops near me" buttons work again.

---

## 9 October 2026: Leave at and Arrive by

- **Pick a time** - Navigate and Plan a route take Leave now, Leave at or Arrive by, up to a week ahead, and only plan with buses and trains running then. Each way shows its clock times. In the bot, a clock button picks the time.

---

## 3 to 5 October 2026: Navigate, Get Off Alert, Service Alerts and the guide

### Web app

- **Navigate** - Get from any place to any other by bus, train or both, with every worthwhile mix to choose from and walking directions for each walk.
- **Get Off Alert** - Start a trip and the app follows your location, then buzzes "OFF" in Morse code, beeps and notifies you two stops before each change and your stop, even in the background. Tap the trip bar for a timeline of the stops ahead.
- **Service Alerts** - Train service alerts and traffic incidents, with notifications even when the app is closed; trains and traffic chosen separately.
- **Weather** - Today's forecast, rain and air quality (PSI and PM2.5).
- **Disruptions bar** - Shows while a train line is disrupted.
- **App shortcuts and a Windows widget** for bus timings.
- **Route planner** - Picking an end lists stops with a direct bus first.
- **Faster** stop pages and route planning, and a notification icon that shows on Android's status bar.
- **Guide** - A full guide at guide.sgbus.uwuapps.org, with screenshots.

### Telegram bot

- **/nav** and **/mynavs**, **/sub**, **/unsub** and **/alerts** for Service Alerts.
- Stops that share a name are told apart by area; search finds stops by MRT or LRT station.

---

## 30 September to 2 October 2026: The bot's features come to the web app

### Web app

- **Bus numbers** - Search a bus number to see its route, with landmarks and the stops ahead.
- **Stop timings** - Pick a bus, first and last bus times, directions to the stop, and bendy buses marked.
- **Favourites** - Favourite buses and routes as well as stops, pinned to the top or bottom.
- **Stops near me** and **postal code search**.
- **Plan a route** - Every bus between two stops, or journeys with up to three changes, with live part-by-part timings. Spots an end on the wrong side of the road and offers the stop across it.
- **Settings** - Your name and a birthday greeting.
- **Sync favourites** between devices on the same network, with a code or QR code.

### Telegram bot

- `/newroute` and `/favroutes` are now **/route** and **/myroutes**, and suggest journeys with changes when no single bus links two stops.
- **Routines** can pick which buses they send.

---

## 23 September 2026: Time-based theme and updates

- **Time-based mode** - Light from 09:00, dark from 18:00, switching by itself.
- **Update bar** - A new version waits for you to tap Reload. The app shell works offline; live timings always come from the network.

---

## 16 July to 5 September 2026: Dark mode and the Telegram bot

### Web app

- **Dark mode**, a new logo, and new screenshots.
- **Distance badge** - Shows an approximate distance when a bus has no GPS fix.
- **Directions** - Open a stop in Google Maps or Citymapper from its timings.

### Telegram bot

- **Launched** at [@UwUsgbus_bot](https://t.me/UwUsgbus_bot): timings by stop code, name or location, and inline mode in any chat.
- **Favourites** - Favourite stops and buses, pinned to the top or bottom.
- **Routines** - Timings sent to you on a schedule.
- **Settings** - Your name, birthday wishes and notification preferences.
- **Bus routes** - Paginated stops with first and last bus times, landmarks, and the stops onward from where you are.
- **Routes** - Build a route between two stops, from a name, code or location, and save it.
- **/done** and **/cancel** for any multi-step flow.

---

## 18 April 2026: New look

### New Look (Glassmorphism UI Redesign)
The entire app has been redesigned with a frosted glass aesthetic. Cards now use backdrop blur and translucent backgrounds for a cleaner, more modern feel. Font has been updated to Jua across the board.

### Theme Picker
Pick from 7 colour themes directly in the app. Your choice is saved and applied instantly on next load, no flash of the wrong colour.

- Classic
- Not Green 1 through 5
- Really Really Light Green

### Incoming Buses Bar
A new summary bar now appears inside each result card. It shows the next bus arriving from each service at your stop, sorted by ETA, so you can see everything at a glance without scrolling through the full list.

### Favourites Now Show Stop Names
Favourite stops now save the stop name alongside the stop code. Your saved chips will display both so you know exactly which stop you are looking at.

### Official LTA Bus Stop Data
Bus stop names and road names now come directly from the LTA DataMall API instead of a third-party source. Search now also matches by road name, so you can type a street to find nearby stops.

### Support the App
A donation button has been added to the nav bar. If you find the app useful, you can buy Augy a coffee!

### Bug Fixes

- **Distance badge** - Buses without a GPS fix no longer show a spurious large distance. They are now marked in italics to indicate the location is approximate.
- **Route direction tabs** - Each direction tab now only shows stops for that direction. Previously both directions could bleed into the same list.
- **Operator info** - The info modal now shows only the operators for the service you looked up, not all services.
- **Current direction detection** - The app now auto-selects the direction tab that contains your current stop and labels it "(current)". The second direction tab is hidden when there is no data for it.
- **Bus service direction and coordinate parsing** - Fixed an issue where direction detection and GPS coordinates were not being read correctly from the LTA API.
- **Bus route pagination** - The LTA BusRoutes API has a 500-record cap and does not support server-side filtering. Route fetching now paginates correctly and filters client-side, so full route data is loaded reliably.

---

Check it out at https://sgbus.uwuapps.org
