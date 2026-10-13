# SG Bus Timings

A Progressive Web App (PWA) for real-time Singapore bus arrival timings.

## Features

### Live Bus Arrivals
- View real-time bus arrival ETAs for any Singapore bus stop
- Up to 3 upcoming buses shown per service, with the operator
- Load status indicators: **SEA** (Seats Available), **SDA** (Standing Available), **LSD** (Limited Standing)
- Wheelchair accessibility (WAB) and bus type (single, double or bendy) badges
- Estimated distance from the stop to each incoming bus
- Today's first and last bus for each service at the stop
- **Pick a bus** to narrow the timings to one service (even one not running right now), and **Show all services** to widen them back out
- **Directions** to the stop in Google Maps or Citymapper

### Bus Stop Search
- Search by stop name (e.g. `Orchard`) or 5-digit stop code (e.g. `84009`)
- Search by bus number (e.g. `22`, `NR7`) to open that bus's route
- Autocomplete dropdown with matching buses and up to 20 stops
- Filter results to a specific service by appending the bus number (e.g. `84009 174`)
- **Stops near me** lists the 8 nearest stops to your location
- A 6-digit postal code (e.g. `519599`) lists the 8 stops nearest that address, in the search box or either end of the route planner. Looked up with OneMap; set `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` in Vercel for the API token, renewed every 3 days

### Favourites
- Star bus stops, buses and planned routes; each appears as a one-tap chip
- Favourite buses are starred and pinned in every stop's timings
- Choose whether favourite buses and stops pin to the top or bottom of lists
- Favourites are persisted in your browser's local storage
- Favourites open in their own window from the star at the top of the Edge Tray
- **Sync favourites with another device** (stops, buses, routes and navs) from Settings: show a code (with a link and QR code) on one device, enter it on the other, then tick which favourites to import or export, or select all. Copying only adds, never removes
  - Peer to peer over WebRTC, STUN only, as in [STUN-p2p-spec.md](../docs/STUN-p2p-spec.md): both devices must be on the same wifi, or one on the other's hotspot
  - PeerJS's public broker introduces the two devices and sees their IP addresses, and each device learns the other's; the favourites themselves never pass through a server

### The Edge Tray
- Favourites, Stops near me, Navigate and Service alerts, then the Telegram bot, coffee, the guide, Settings and the theme, as a column of glass buttons fixed at the top corner of the screen (sg-psi's tray); the weather stays under the search box. There's no top bar: the greeting sits above the search box and scrolls with the page
- Its arrow tab tucks it away at the edge of the screen and remembers that; Settings puts it on the left or the right
- Navigate (both its tabs) and Service alerts open as windows over the page (`.panelModal`, `showPanel` in `js/ui.js`); a tap outside closes them, and opening a stop's timings or starting a trip from one closes it
- On a touch screen, pressing and holding any button with a `title` (or `aria-label`) shows it in a label beside it, as a mouse's hover does, and the tap that ends the hold is swallowed (`js/ui.js`). A note says so the first time the site's opened on a touch screen

### Incoming Buses Bar
- Visual summary of the next arriving bus across all services at the current stop
- Sorted by ETA (earliest first) and colour-coded by load status

### Bus Service Route
- Click **Route** on any service, or search a bus number, to view its full route
- Shows where it starts and ends (or where a loop service turns), and the interchanges, stations and hospitals it passes
- Both directions with a tab switcher, and your favourite stops on the route listed first
- **Route from here** lists only the stops still ahead of the one you're at
- Tap any stop to open its timings for that bus

### Route Planner (Navigate's Bus only tab)
- Navigate has two tabs, **Bus and train** (`#navSection`, `js/nav.js`) and **Bus only** (`#plannerSection`, `js/planner.js`), each its own panel. Switching carries the ends across (a place to the stop at it, or the nearest within 150 m; a stop to its place) and the time picked; the Edge Tray's Navigate opens the tab used last (`sgbus_nav_mode`)
- Pick a start and end stop (typed, or near your location) to see every bus that runs from one to the other without a change, heading the right way
- With one end set, the stops offered for the other (typed suggestions, stops near you, or near a postal code) list those with a bus straight there first, tinted and naming the buses
- When no single bus does, the quickest five journeys with up to three changes and short walks
- Picked the stop on the wrong side of the road? When the buses for your trip go from the stop across the road, the planner says so, with a button to swap it in
- Open a journey part by part with live timings, which bus you'd catch at each change, and a rough arrival time
- A bus opened from a route or journey says how many stops it has left to go

### Service Alerts
- **Service alerts** under the search box opens a card with train service alerts (disrupted lines, affected stations, free buses and shuttles, service notices) and traffic incidents across Singapore, the ones that can block or reroute a bus listed first. From `/api/service-alerts`, never served from the offline cache
- **Notify me** turns on notifications that arrive with the app closed, chosen separately for **train service alerts** and **traffic alerts**: each **Off**, **All updates**, or **Disruptions only** (train disruptions / accidents, breakdowns, road blocks, diversions and the like). The same choices as the Telegram bot's `/sub`
- Web Push, sent by a Vercel cron function (`api/push/poll.js`, every minute) with subscriptions kept in Upstash Redis. One-off setup in [SERVICE-ALERTS-SETUP.md](SERVICE-ALERTS-SETUP.md). On iPhone and iPad, only from the app added to the Home Screen
- Tapping a notification opens the card, as does `#alerts`
- A disruptions bar along the top, under the update bar, only while a train line is disrupted or delayed; checked every two minutes while the site is on screen, with **Details** for the card and **Hide** until the disruption changes

### Navigate
- **Navigate** gets you from any place to any other by bus and train: addresses, buildings, postal codes, stations, bus stops, Google Maps links or your location, at either end
- A Google Maps link, full or short (`maps.app.goo.gl`), is read by `/api/places` (`api/_lib/gmaps.js`) for the place it points at: its pin where the link has one, otherwise its address looked up on OneMap. Things shared into the installed app (the manifest's `share_target`, `/?text=...&url=...`) go into **To**
- Lists the best journey for every mix of buses and trains (up to four vehicles), not just the fastest, with OneMap's timetable-based time where it rides the same way and a warning on lines LTA reports disrupted
- Open one part by part, with live timings for every bus ride; save it to Favourites (Navs); **Share** sends its link, part filled in or not, with **Your location** sent as `here` so it's whoever opens it. The Bus only tab has the same **Share**
- The router is `api/_nav/` over the bus routes and a vendored MRT/LRT network (`scripts/vendor-rail.mjs`, from cheeaun/sgraildata via mrtroute-game); the Telegram bot's `/nav` uses the same `/api/nav`

### Get Off Alert
- On a trip (**Start trip** on a nav or a planned journey, or **Get Off Alert** on a bus's route and then the stop you're getting off at), the site follows your live location and alerts you two stops before each change and the end: "OFF" vibrated in Morse code, three beeps and a notification
- Keeps the screen awake while the trip runs, since a website only gets your location while it's open; underground it goes by the expected ride time
- In the background, with notifications allowed, the server takes over: `api/push/trip-poll.js` (Vercel Cron, every minute) follows your bus from LTA's live bus positions, or the clock for trains, and pushes the alert. Uses the Service Alerts setup (Redis, VAPID keys, `CRON_SECRET`)
- Each bus ride is followed along its road, not the straight lines between its stops: `GET /api/road?points=...` (the ride's stops) routes through them on OSRM's car router (cached a month at the edge), and a fix within 100 m of that road places you on it. Without it, the straight lines, with room for the road to bend away from them on a long stretch
- Tap the trip bar for the timeline: the stops ahead, with a blue dot where you are, redrawn 20 times a second so it glides between stops. Tapping a bus stop on it closes it and scrolls down to that stop's timings for the bus (a bus ride's `codes`, from `/api/nav` or the route)
- **Back** and **Next** on the trip bar move the trip a part (a ride or a walk) by hand. Back restores where you'd got to on the part before (or its start, if you'd finished it) and re-arms its alerts; the app sends `movedAt` with the trip, and the server's merge (`api/push/trips/[id].js`) lets a hand move stand over its own place
- Boarding is noticed without the road too: a fix off the bus's road falls back on the straight lines between its stops, and one within 250 m of a stop 150 m or more down the route counts as on board, once you're 150 m from the first stop (less a rough fix's error). A fix 150 m down the next ride (100 m further from the walk's end than you've been, 300 m without the accelerometer, or off the ride you were on) moves the trip on to it, on board
- Walking is told from riding by the accelerometer (`Motion` in `js/trip.js`, `devicemotion`): steps are peaks in the acceleration above gravity, and walking is 7 in 5 s at an even rhythm, which a bus's bumps aren't. Walking never counts as boarding; your first steps within 250 m of a ride's last stop end the ride; and on a walk with no good fix, steps (0.7 m each, against 1.3 times the straight line) move you along instead of the clock. iOS asks for it as the trip starts
- **Get ready to board**: while you wait at the stop for a bus ride's bus (not yet seen on board), its live timing there is checked, and at about a minute away a notification, two buzzes and the bar say so, once per ride. The server sends it too while the app's in the background (`api/_push/trip.js`, `boardStep`), and each side tells the other it's been said (`readied`)
- On by default; Settings turns it off

### Your trips and stats
- Every trip taken with the Get Off Alert is kept in **Your trips** (the bar chart in the Edge Tray), by week, once at least one ride was taken (`js/history.js`)
- Each ride's wait and ride time, measured from when the fixes showed you board where they could, the plan's otherwise; walking is always the plan's
- **Trip Mix** (walking, waiting, riding) and **Trip Modes** (rides by bus operator, MRT and LRT); a trip can be planned again, shared as a directions link, or deleted

### Places
- **Places** (the bookmark in the Edge Tray) keeps Home, Work and any other place, named as you like (`js/places.js`); each is a button under Navigate's ends, on both its tabs
- Tap one for the way there; its menu edits, shares (a `/go` link) or deletes it

### Past searches and calendar
- Tapping into a search box drops down past searches (last 24 hours, then earlier) with tabs for saved places and, in Navigate, calendar events (`js/recents.js`). Kept in the browser, last 50, not synced
- **Calendar**: a private iCal link, read through `POST /api/calendar` (https only, public hosts, not stored or logged), or an imported `.ics` file read in the browser, or, in the Android app, the phone's own calendar. Events with a location for the next 14 days; tap one to Navigate there arriving by its start (`js/calendar.js`)

### The live map
- **Live map** (`js/map.js`): OpenStreetMap with Leaflet (`vendor/leaflet/`, loaded the first time it opens), full screen, following your location. Replaces Google Maps: a stop's Directions, a walk in a nav, `#map/<stop>` and `#map/<lat>,<lng>~<name>` (the Telegram bot's Live map button) walk you there turn by turn, from `GET /api/walk` (OneMap's walking router, OSRM's as a fallback, a straight line without either; cached a day at the edge), asked again if you stray
- On a trip, the trip bar's map button shows every ride and walk, the stops and you; a shared trip's viewer follows the sharer's dot on it
- Kept light: one canvas, markers moved rather than redrawn, fixes drawn at most once a second, tiles cached by `sw.js` (cache-first, 2,000 tiles, refreshed after 14 days); OpenStreetMap's tiles only (OneMap's lag), with tiles that failed asked for again once the signal's back

### In the Android app
- The site is also an Android app, `org.uwuapps.sgbus` (`../android/`): from 2.0.0 the site in Capacitor's WebView, with native plugins for what a web page can't do
- `js/app-bridge.js` talks to the app: from 2.0.0 straight to its plugins through Capacitor's bridge (`AppBridge.call`, `AppBridge.on`); for 1.1.0 and 1.2.0 (Bubblewrap), over Chrome's postMessage for Trusted Web Activities. In a browser neither is there, and nothing changes
- In the app: the Get Off Alert follows the trip with the screen off (`js/trip.js`, the app's TripPlugin), Service Alerts come through Firebase Cloud Messaging (`js/alerts.js`, `api/_push/fcm.js`), the Calendar tab reads the phone's calendar (`js/calendar.js`), and a card's value is read over NFC (`js/card.js`, the tray's card button). The website keeps its own versions of each that a browser can do
- Links into the app name its package, with a fallback for phones without it: the SimplyGo button (`intent://open/simplygo...`, falling back to SimplyGo's Play Store page), the calendar permission prompt for 1.1.0 to 1.2.0 (`intent://calendar/permission...`) and the app's updater (`intent://update...`). From 2.0.0 the app follows them itself (`SgBusPlugin.shouldOverrideLoad`)
- `js/app-update.js` shows a bar when the app is older than its newest GitHub release, read through `GET /api/app-release` (cached 10 minutes at the edge, so GitHub's per-IP limit isn't shared by every phone). From app 1.2.0, Update has the app download and install it; on 1.1.0, Download opens the release's page
- `.well-known/assetlinks.json` vouches for the app's signing key, with `handle_all_urls` (the site's links open in it) and `use_as_origin` (1.1.0 to 1.2.0's message channel)

### In the desktop app
- The site is also a Windows and Linux app (`../desktop/`), in Electron. `window.sgbusDesktop` (its `preload.js`) lets the page show desktop notifications: `js/alerts.js` checks `/api/service-alerts` every minute there instead of Web Push, by the same rules as the server
- On Linux, where Chromium can't find its location, `sgbusDesktop.locate` (2.0.7 and later, `desktop/location.js`: a NetworkManager Wi-Fi scan looked up on BeaconDB) stands in for `navigator.geolocation` (`js/desktop-location.js`), and its errors' own explanation is shown (`locationMessage` in `script.js`)

### In Telegram
- The site is also the Telegram bot's Mini App, opened from the bot's menu button, `/start`'s Open web app, or a `t.me/<bot>?startapp=` link (`../telegram-bot/src/mini_app.py`)
- The head of `index.html` notices Telegram's launch data in the hash, keeps it where Telegram's script looks on a reload (sessionStorage) and takes it off the address before analytics or the router read it. A `startapp` page comes as its start parameter, with `-` for `/` and `_` for `,` (`map-84009` opens `#map/84009`)
- `js/telegram.js` then loads Telegram's script (only there) and fits the page to Telegram: its bar and background take the page's colour, its Back button steps back through what the page pushed (the live map), links out open in the browser and t.me links in Telegram, and swiping down doesn't close the app while the live map is open. The tray's Telegram button hides

### Weather
- The button at the right of the quick actions reads today's ranges across Singapore: temperature, 24-hour PSI and 1-hour PM2.5, lowest to highest region
- Tap it for today's weather: current conditions, the day's range and rain chance, the next hours, the two-hour rain nowcast, and PSI and PM2.5 by region with NEA's bands
- [Open-Meteo](https://open-meteo.com/) for the forecast; NEA's PSI and PM2.5 readings from [data.gov.sg](https://data.gov.sg/) (`DATA_GOV_KEY`)

### Themes
- 7 built-in colour themes: **Classic**, **Not Green 1–5**, **Really Really Light Green**
- Theme preference is saved automatically

### Personalisation
- Open settings from the gear or the app title to set your name and birthday, and to reach Places and Calendar
- The greeting changes based on time of day, and on your birthday wishes you a happy one with your age from the birthday's year, on two lines so a long name isn't cut off: "Happy 25th Birthday," then "Sam!"
- Confetti (`js/confetti.js`, a canvas over the page) each time the app's opened on your birthday, and again on coming back after 10 minutes away; Settings turns it off (`sgbus_confetti`), and there's none with reduced motion
- Settings are stored in local storage

### URL-based Navigation
- Stops and services are reflected in the URL hash (e.g. `#84009` or `#84009,174`)
- `#bus/22` opens a bus's route and `#route/84009/75009` opens Navigate's Bus only tab (the route planner)
- `#sync/BCDFGH` opens Settings with another device's sync code filled in
- `#alerts` opens the Service alerts card
- `#nav/1.30050,103.85580~Bedok%20Mall/1.33320,103.92920~Name` opens Navigate between two points; an end can be `here` (the opener's location) or `-` (not set), and the name after `~` is optional. `#route/-/75009` likewise leaves a route's start empty, and `#route` opens the planner empty
- `#near` opens the stops near you and `#nav` opens Navigate empty (the app's shortcuts)
- `/?text=<Google Maps link>` (what sharing to the installed app opens) opens Navigate with that place in **To**
- Bookmark or share a direct link to any stop, service or route

### PWA / Offline Support
- Installable on mobile and desktop as a standalone app
- Service Worker with Workbox for offline caching
- Three app shortcuts (`manifest.json`): Stops near me, Navigate and Service alerts, with icons in `images/icons/`
- A **Bus timings** widget for the Windows 11 Widgets board (Edge-installed app only): pick a stop and optionally its buses, like the bot's routines. An Adaptive Card (`widgets/timings.json`) filled in by `sw.js`; small, medium and large show 2, 4 and up to 12 buses

## How to Use

1. **Search for a bus stop** - type a stop name or 5-digit stop code into the search box. Select a suggestion from the dropdown or press **Enter** / tap **Get Timings**.
2. **View arrivals** - a card appears showing each bus service and the next 3 arrival times.
3. **Filter by service** - append a bus service number to your search (e.g. `84009 174`) to show only that service.
4. **See the full route** - tap **Route** next to any service, or search its number, to open a modal with the complete stop list.
5. **Save a favourite** - tap **Save** on a stop card, **Save bus** on a route, or **Save route** on Navigate's Bus only tab.
6. **Navigate** - tap **Navigate** (the arrowhead), then pick **Bus and train** for any two places or **Bus only** for two stops.
7. **Switch themes** - tap the theme button at the bottom of the Edge Tray to pick a colour scheme.
8. **Install as an app** - use your browser's "Add to Home Screen" or "Install" prompt to use the app offline, or on Android, install the APK from the [releases](https://github.com/augy-studios/sgbus-timings/releases).

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript (no frameworks)
- **Backend**: Vercel Edge Functions proxying the [LTA DataMall API](https://datamall.lta.gov.sg/)
- **Bus stop and route data**: LTA DataMall, via `/api/bus-stops` and `/api/bus-routes` (every route in one response, edge-cached for a day)
- **Weather and air quality**: [Open-Meteo](https://open-meteo.com/) for the forecast and NEA's PSI and PM2.5 from [data.gov.sg](https://data.gov.sg/), via `/api/weather`
- **PWA**: Workbox service worker, Web App Manifest
- **Deployment**: Vercel

## Development

Clone the repository and use the [Vercel CLI](https://vercel.com/docs/cli) for local development (required to run the API routes):

```bash
npm i -g vercel
npm install
vercel dev
```

Copy `.env.example` to `.env.local` and set at least `LTA_ACCOUNT_KEY`, your [LTA DataMall API key](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html). Service Alerts notifications need a few more; see [SERVICE-ALERTS-SETUP.md](SERVICE-ALERTS-SETUP.md). `DATA_GOV_KEY`, a [data.gov.sg](https://data.gov.sg/) API key, is optional: without it the weather button's PSI and PM2.5 still load, at data.gov.sg's lower rate limit.

## License

MIT
