# SG Bus Timings - Patch Notes

**Latest update: 11 October 2026**
**Live at: https://sgbus.uwuapps.org**
**Guide: https://guide.sgbus.uwuapps.org**
**Telegram bot: https://t.me/UwUsgbus_bot**

Newest first. Each update covers the web app and the Telegram bot.

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
- **Android app** - SG Bus Timings is now an Android app too, shared as an APK file: the same app, full screen, opening SimplyGo straight from its button.

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
- **Plan a route** - Every bus between two stops, or journeys with up to three changes, with live leg-by-leg timings. Spots an end on the wrong side of the road and offers the stop across it.
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
