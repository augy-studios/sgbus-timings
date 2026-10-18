# SG Bus Timings - Patch Notes

**Latest update: 19 October 2026**
**Live at: https://sgbus.uwuapps.org**
**Guide: https://guide.sgbus.uwuapps.org**
**Telegram bot: https://t.me/UwUsgbus_bot**

Newest first. Each update covers the web app and the Telegram bot.

---

## 19 October 2026: Desktop links shared with other UwU apps

### Desktop app

- **Other UwU apps' links reach them** - With another UwU desktop app installed, such as uwuPromptr, a `uwu://` link for it now opens that app rather than SG Bus Timings, whichever of the two you opened last. Links for SG Bus Timings open it as before.

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
