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
- **Navigate** to the stop in Google Maps or Citymapper

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
- **Sync favourites with another device** from Settings: show a code (with a link and QR code) on one device, enter it on the other, then tick which favourites to import or export, or select all. Copying only adds, never removes
  - Peer to peer over WebRTC, STUN only, as in [STUN-p2p-spec.md](../STUN-p2p-spec.md): both devices must be on the same wifi, or one on the other's hotspot
  - PeerJS's public broker introduces the two devices and sees their IP addresses, and each device learns the other's; the favourites themselves never pass through a server

### Incoming Buses Bar
- Visual summary of the next arriving bus across all services at the current stop
- Sorted by ETA (earliest first) and colour-coded by load status

### Bus Service Route
- Click **Route** on any service, or search a bus number, to view its full route
- Shows where it starts and ends (or where a loop service turns), and the interchanges, stations and hospitals it passes
- Both directions with a tab switcher, and your favourite stops on the route listed first
- **Route from here** lists only the stops still ahead of the one you're at
- Tap any stop to open its timings for that bus

### Route Planner
- Pick a start and end stop (typed, or near your location) to see every bus that runs from one to the other without a change, heading the right way
- With one end set, the stops offered for the other (typed suggestions, stops near you, or near a postal code) list those with a bus straight there first, tinted and naming the buses
- When no single bus does, the quickest five journeys with up to three changes and short walks
- Picked the stop on the wrong side of the road? When the buses for your trip go from the stop across the road, the planner says so, with a button to swap it in
- Open a journey leg by leg with live timings, which bus you'd catch at each change, and a rough arrival time
- A bus opened from a route or journey says how many stops it has left to go

### Service Alerts
- **Service alerts** under the search box opens a card with train service alerts (disrupted lines, affected stations, free buses and shuttles, service notices) and traffic incidents across Singapore, the ones that can block or reroute a bus listed first. From `/api/service-alerts`, never served from the offline cache
- **Notify me** turns on notifications that arrive with the app closed: **All updates** (every train status change and every new traffic incident) or **Disruptions only** (train disruptions, and new accidents, breakdowns, road blocks, diversions and the like). The same two modes as the Telegram bot's `/sub`
- Web Push, sent by the push server in [`../push-server`](../push-server/SETUP.md) at `push.sgbus.uwuapps.org`, which has to be running for notifications to turn on. On iPhone and iPad, only from the app added to the Home Screen
- Tapping a notification opens the card, as does `#alerts`

### Themes
- 7 built-in colour themes: **Classic**, **Not Green 1–5**, **Really Really Light Green**
- Theme preference is saved automatically

### Personalisation
- Open settings from the gear or the app title to set your name and birthday
- The greeting changes based on time of day, and wishes you a happy birthday on the day
- Settings are stored in local storage

### URL-based Navigation
- Stops and services are reflected in the URL hash (e.g. `#84009` or `#84009,174`)
- `#bus/22` opens a bus's route and `#route/84009/75009` opens the route planner
- `#sync/BCDFGH` opens Settings with another device's sync code filled in
- `#alerts` opens the Service alerts card
- Bookmark or share a direct link to any stop, service or route

### PWA / Offline Support
- Installable on mobile and desktop as a standalone app
- Service Worker with Workbox for offline caching

## How to Use

1. **Search for a bus stop** - type a stop name or 5-digit stop code into the search box. Select a suggestion from the dropdown or press **Enter** / tap **Get Timings**.
2. **View arrivals** - a card appears showing each bus service and the next 3 arrival times.
3. **Filter by service** - append a bus service number to your search (e.g. `84009 174`) to show only that service.
4. **See the full route** - tap **Route** next to any service, or search its number, to open a modal with the complete stop list.
5. **Save a favourite** - tap **Save** on a stop card, **Save bus** on a route, or **Save route** in the planner.
6. **Plan a route** - tap **Plan a route**, then pick a start and end stop.
7. **Switch themes** - tap the theme button in the header to cycle through colour schemes.
8. **Install as an app** - use your browser's "Add to Home Screen" or "Install" prompt to use the app offline.

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript (no frameworks)
- **Backend**: Vercel Edge Functions proxying the [LTA DataMall API](https://datamall.lta.gov.sg/)
- **Bus stop and route data**: LTA DataMall, via `/api/bus-stops` and `/api/bus-routes` (every route in one response, edge-cached for a day)
- **PWA**: Workbox service worker, Web App Manifest
- **Deployment**: Vercel

## Development

Clone the repository and use the [Vercel CLI](https://vercel.com/docs/cli) for local development (required to run the API routes):

```bash
npm i -g vercel
vercel dev
```

Set the `LTA_ACCOUNT_KEY` environment variable with your [LTA DataMall API key](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html).

## License

MIT
