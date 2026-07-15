# SG Bus Timings

A Progressive Web App (PWA) for real-time Singapore bus arrival timings.

## Features

### Live Bus Arrivals
- View real-time bus arrival ETAs for any Singapore bus stop
- Up to 3 upcoming buses shown per service
- Load status indicators: **SEA** (Seats Available), **SDA** (Standing Available), **LSD** (Limited Standing)
- Wheelchair accessibility (WAB) and deck type (single/double) badges
- Estimated distance from your location to each incoming bus

### Bus Stop Search
- Search by stop name (e.g. `Orchard`) or 5-digit stop code (e.g. `84009`)
- Autocomplete dropdown with up to 20 suggestions
- Filter results to a specific service by appending the bus number (e.g. `84009 174`)

### Favourites
- Save bus stops as favourites for quick access
- Favourites appear as one-tap chips at the top of the page
- Refresh all favourites at once with the **Refresh All** button
- Favourites are persisted in your browser's local storage

### Incoming Buses Bar
- Visual summary of the next arriving bus across all services at the current stop
- Sorted by ETA (earliest first) and colour-coded by load status

### Bus Service Route
- Click **Route** on any service to view its full route in a modal
- Supports both directions with a tab switcher
- Lists every stop in sequence with names and stop codes
- Shows route terminals and operator information

### Themes
- 7 built-in colour themes: **Classic**, **Not Green 1–5**, **Really Really Light Green**
- Theme preference is saved automatically

### Personalisation
- Set your name by clicking the app title — the greeting changes based on time of day
- Name is stored in local storage

### URL-based Navigation
- Stops and services are reflected in the URL hash (e.g. `#84009` or `#84009,174`)
- Bookmark or share a direct link to any stop or service

### PWA / Offline Support
- Installable on mobile and desktop as a standalone app
- Service Worker with Workbox for offline caching

## How to Use

1. **Search for a bus stop** — type a stop name or 5-digit stop code into the search box. Select a suggestion from the dropdown or press **Enter** / tap **Get Timings**.
2. **View arrivals** — a card appears showing each bus service and the next 3 arrival times.
3. **Filter by service** — append a bus service number to your search (e.g. `84009 174`) to show only that service.
4. **See the full route** — tap **Route** next to any service to open a modal with the complete stop list.
5. **Save a favourite** — tap **Favourite** on a stop card to pin it as a quick-access chip.
6. **Switch themes** — tap the theme button in the header to cycle through colour schemes.
7. **Install as an app** — use your browser's "Add to Home Screen" or "Install" prompt to use the app offline.

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript (no frameworks)
- **Backend**: Vercel Edge Functions proxying the [LTA DataMall API](https://datamall.lta.gov.sg/)
- **Bus stop data**: [busrouter.sg](https://busrouter.sg/)
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
