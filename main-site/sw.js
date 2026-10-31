// Bump on every deploy that changes anything this worker serves. The browser
// compares this file byte for byte, so an unchanged VERSION means nobody is
// offered the update bar and the old cache keeps answering.
const VERSION = "v133";
const CACHE = `sgbus-${VERSION}`;

const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/js/offline.js",
  // Languages (js/i18n.js): English is the page's own, and each other language's file is kept
  // here, so the language can be changed offline.
  "/js/i18n.js",
  "/i18n/zh-SG.json",
  "/i18n/ms.json",
  "/i18n/ta.json",
  // Rides really taken, and the secret colours they unlock (js/rides.js, js/colours.js).
  "/js/rides.js",
  "/js/colours.js",
  // The celebration for every line ridden; three.js itself is kept as MapLibre is, once fetched.
  "/js/celebrate.js",
  "/js/lang-pick.js",
  // Report a bug, from Settings (js/bug-report.js).
  "/js/bug-report.js",
  // A coffee, asked once every six months (js/donate.js).
  "/js/donate.js",
  // The first open's choice, Minimal or Full (js/first-run.js).
  "/js/first-run.js",
  "/js/icons.js",
  "/js/ui.js",
  "/js/confetti.js",
  "/js/desktop-location.js",
  "/js/geo-retry.js",
  "/js/theme.js",
  "/js/when.js",
  "/js/network.js",
  "/js/contractions.js",
  // A search for "Bedok MRT" lists the stops at the station's exits (js/station-search.js).
  "/js/station-search.js",
  "/data/rail-stations.json",
  "/js/journeys.js",
  "/js/planner.js",
  "/js/planner-worker.js",
  "/js/p2p.js",
  "/js/qr.js",
  "/js/sync-relay.js",
  "/js/sync.js",
  "/js/mrt-stations.js",
  "/js/alerts.js",
  "/js/weather.js",
  "/js/trip.js",
  "/js/history.js",
  "/js/places.js",
  // The parts picked for the main screen, as tabs in the Edge Tray (js/main-screen.js).
  "/js/main-screen.js",
  // The next bus at a glance, on Bus timings (js/glance.js).
  "/js/glance.js",
  // The tour of the basics, the first time the app opens (js/tour.js).
  "/js/tour.js",
  "/js/recents.js",
  "/js/app-bridge.js",
  "/js/telegram.js",
  "/js/map.js",
  "/js/map-card.js",
  // The MRT and LRT tracks a train ride's drawn along on the live map (js/rail-tracks.js).
  "/js/rail-tracks.js",
  "/data/rail-tracks.json",
  // NUS's and NTU's campus shuttles, their routes and timetables (js/campus.js): Augy's two files
  // as he sent them, and what goes with them.
  "/js/campus.js",
  "/data/campus/nus.json",
  "/data/campus/ntu.json",
  "/data/campus/config.json",
  "/js/card.js",
  "/js/offline-share.js",
  "/js/reminders.js",
  "/js/shake.js",
  "/js/voice.js",
  "/js/scan.js",
  "/js/flag.js",
  "/js/make-it.js",
  "/js/board.js",
  "/js/pip.js",
  // The sgbus terminal and its commands, fetched the first time it's opened (script.js).
  "/js/sgbus-core.js",
  "/js/terminal.js",
  // The desktop app's widgets (desktop/widgets.js).
  "/widget.html",
  "/js/widget.js",
  // The live map's engine (js/map-engine.js), and Leaflet, its fallback without WebGL, so the
  // map opens offline too. MapLibre's kept apart, in MAP_CACHE, once it's first used.
  "/js/map-engine.js",
  // Singapore's map saved for offline, from Explorer (js/map-save.js).
  "/js/map-save.js",
  "/vendor/leaflet/leaflet.js",
  "/vendor/leaflet/leaflet.css",
  "/js/calendar.js",
  "/js/mrt-doors.js",
  "/js/nav.js",
  // Bus and train planned on the phone offline (js/nav.js, planOnPhone): the router and graph
  // /api/nav uses, as ES modules, in their worker, and the rail network they ride on.
  "/js/nav-worker.js",
  "/js/nav-core/offline.js",
  "/js/nav-core/network.js",
  "/js/nav-core/router.js",
  "/js/nav-core/plan.js",
  "/js/nav-core/via.js",
  "/js/nav-core/when.js",
  "/data/rail.json",
  "/js/share.js",
  "/js/sw-update.js",
  "/js/app-update.js",
  "/manifest.json",
  "/favicon.ico",
  "/sgbusicon1.png",
  // The status bar's notification icon. Android draws only its shape, so the app icon's
  // solid square came out as a plain white one; this has its window and wheels cut out.
  "/sgbusnotificon.png",
  // SimplyGo's own icon, on its button in the Edge Tray.
  "/images/icons/simplygo.png",
  "/images/screenshot_1.png",
  "/images/screenshot_2.png",
  "/widgets/timings.json",
  "/widgets/timings-data.json"
];

// What the widgets keep: each one's stop and buses, and the favourite stops the page copies in
// for their setup. Not versioned, so a new deploy doesn't forget what each widget shows.
const WIDGET_CACHE = "sgbus-widgets";

// Cached on first use so the Jua font still renders offline.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// The live map's tiles (js/map.js): kept as they're seen, so a place looked at once comes back
// at once, and offline, and OpenStreetMap's servers are asked for each tile once rather than
// on every pan. Not versioned, so a deploy doesn't throw them away. Capped at TILE_MAX, the
// oldest going first (about 30 MB of OpenStreetMap's), and a tile older than TILE_REFRESH_MS
// is still shown but fetched again behind it.
const TILE_CACHE = "sgbus-tiles";
const TILE_MAX = 2000;
const TILE_REFRESH_MS = 14 * 24 * 3600 * 1000;
const isTile = (url) => url.hostname === "tile.openstreetmap.org";

// The live map on MapLibre (js/map-engine.js), all kept as it's first used, and none of it
// versioned with the site, so a deploy doesn't throw it away:
// - MAP_CACHE: MapLibre itself (its folder is named for its version, so it never changes),
//   and OpenFreeMap's fonts, sprites and world overview, kept as they are; its styles and
//   TileJSON (which names this week's tiles) shown from the cache and fetched again behind,
//   so the map opens offline on what it last had.
// - VECTOR_CACHE: OpenFreeMap's vector tiles. Each week's are at their own address, so a tile
//   never changes; capped at VECTOR_MAX, the oldest going first. Singapore at the closest
//   zoom they go is about 240 of them.
const MAP_CACHE = "sgbus-map";
const VECTOR_CACHE = "sgbus-vector";
const VECTOR_MAX = 1500;
const OFM_HOST = "tiles.openfreemap.org";
const isVectorTile = (url) => url.hostname === OFM_HOST && /\.pbf$/.test(url.pathname) && !url.pathname.startsWith("/fonts/");
const isOfmFresh = (url) => url.hostname === OFM_HOST && (url.pathname.startsWith("/styles/") || /^\/planet\/?$/.test(url.pathname));
// Singapore's map saved for offline (js/map-save.js, Explorer's Save the map): its vector tiles,
// fetched and kept here by "map-save-tile" apart from VECTOR_CACHE, so trimming never drops one,
// until it's removed. Each is kept under its zoom and place without the week (savedKey), with the
// address it came from in x-saved-from: that week's is served from here as it is, and any week's
// when the network can't be reached, as the map asks for this week's once it's been online.
const SAVED_MAP_CACHE = "sgbus-map-saved";
const savedKey = (url) => url.replace(/^(https:\/\/[^/]+\/planet\/)[^/]+\//, "$1saved/");

// No skipWaiting() here: a new worker installs and then waits until somebody
// presses Reload on the update bar (js/sw-update.js).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: "reload" so the new version is precached from the network,
      // not from whatever the HTTP cache still holds of the old one.
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))
    )
  );
});

// No clients.claim() here either, for the same reason.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => ![CACHE, WIDGET_CACHE, TILE_CACHE, MAP_CACHE, VECTOR_CACHE, SAVED_MAP_CACHE].includes(key)).map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("message", (event) => {
  const type = typeof event.data === "string" ? event.data : event.data?.type;

  // The only place either of these is ever called.
  if (type === "skip-waiting") {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()));
  }

  // This worker's version, for a bug report (js/bug-report.js), answered on the port sent.
  if (type === "version") event.ports[0]?.postMessage(VERSION);

  // One tile of the map being saved for offline (js/map-save.js), answered on the port sent.
  if (type === "map-save-tile") {
    event.waitUntil(saveMapTile(event.data.url).catch(() => ({ ok: false })).then((r) => event.ports[0]?.postMessage(r)));
  }
});

/* -- Push: Service Alerts, sent by the cron function in api/push/poll.js -- */

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data?.json();
  } catch {}
  if (data?.type === "get-off") return event.waitUntil(getOff(data));
  if (data?.type === "board") return event.waitUntil(board(data));
  if (data?.type !== "service-alert") return;

  // One tag for every alert, so a burst of traffic incidents replaces one
  // notification rather than filling the tray; renotify still buzzes for each.
  event.waitUntil(
    self.registration.showNotification(data.title || "Service Alerts", {
      body: data.body || "",
      tag: "service-alert",
      renotify: true,
      icon: "/sgbusicon1.png",
      badge: "/sgbusnotificon.png",
      data: { url: data.url || "/#alerts" },
    })
  );
});

/* -- Push: the Get Off Alert, sent by api/push/trip-poll.js while the app is in the background -- */

// The same tag and buzz as the alert js/trip.js shows itself (keep VIBRATION in step), so
// the two replace each other rather than stacking. Any open page is told too, so it marks
// the alert as given and doesn't sound it again when you come back.
// "OFF" in Morse code: see VIBRATION in js/trip.js.
const VIBRATION = [
  360, 120, 360, 120, 360, 360, // O  ---
  120, 120, 120, 120, 360, 120, 120, 360, // F  ..-.
  120, 120, 120, 120, 360, 120, 120, // F  ..-.
];

async function getOff(data) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "get-off", tripId: data.tripId, leg: data.leg, text: data.body }));
  await self.registration.showNotification("Get Off Alert", {
    body: data.body || "",
    tag: "get-off",
    renotify: true,
    requireInteraction: true,
    vibrate: VIBRATION,
    icon: "/sgbusicon1.png",
    badge: "/sgbusnotificon.png",
    data: { url: "/", kind: "get-off" },
  });
}

/* -- Push: Get ready to board, from the same cron, when the bus you wait for is a minute away -- */

// The same tag and two short buzzes as js/trip.js uses for it (BOARD_VIBRATION), and any open
// page is told so it doesn't say it again.
async function board(data) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "board", tripId: data.tripId, leg: data.leg, text: data.body }));
  await self.registration.showNotification(data.title || "Get ready to board", {
    body: data.body || "",
    tag: "board",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 120, 200],
    icon: "/sgbusicon1.png",
    badge: "/sgbusnotificon.png",
    data: { url: "/", kind: "board" },
  });
}

// Tapping a service alert opens the service alerts card, a Get Off Alert or Get ready to board the app with
// its trip bar: in the app if it's open already, otherwise in a new window.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const kind = event.notification.data?.kind || event.notification.tag;
  const getOff = kind === "get-off" || kind === "board";
  const url = new URL(event.notification.data?.url || (getOff ? "/" : "/#alerts"), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (!client) return self.clients.openWindow(url);
      if (!getOff) client.postMessage({ type: "open-alerts" });
      return client.focus();
    })
  );
});

/* -- Widgets: Bus timings, for the installed app (manifest.json "widgets") -- */

// Only Windows 11 shows a web app's widgets, in its Widgets board, for an app installed
// from Edge; elsewhere self.widgets doesn't exist and none of this runs. Each widget is an
// Adaptive Card (widgets/timings.json) in one of two states: setup, where you pick a stop and
// optionally its buses, like the Telegram bot's /routine; and timings, the next buses there.
// The card picks how many rows to show from the widget's size.

const WIDGET_TAG = "timings";
const WIDGET_ROWS = 12;

const widgetKey = (id) => `/widget/instance/${encodeURIComponent(id)}`;

async function widgetRead(key) {
  const res = await (await caches.open(WIDGET_CACHE)).match(key);
  return res ? res.json() : null;
}

async function widgetWrite(key, value) {
  const cache = await caches.open(WIDGET_CACHE);
  if (value == null) await cache.delete(key);
  else await cache.put(key, new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }));
}

async function widgetTemplate(widget) {
  const url = widget?.definition?.msAcTemplate || "/widgets/timings.json";
  const res = (await caches.match(url)) || (await fetch(url));
  return res.text();
}

// A stop's name from the stops the page last fetched (cached by the fetch handler below),
// or fetched now.
async function stopName(code) {
  try {
    const res = (await caches.match("/api/bus-stops")) || (await fetch("/api/bus-stops"));
    const stops = await res.json();
    return stops.find((s) => s.c === code)?.n || null;
  } catch {
    return null;
  }
}

const eta = (bus) => {
  if (!bus || bus.eta_ms == null) return null;
  const mins = Math.floor(bus.eta_ms / 60000);
  return mins < 1 ? "Arr" : `${mins} min`;
};

function sgTime(ms) {
  return new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" });
}

async function setupData(config, message = "") {
  const favs = (await widgetRead("/widget/favourites")) || [];
  return {
    state: "setup",
    choices: favs.map((f) => ({ title: f.name ? `${f.name} (${f.code})` : f.code, value: f.code })),
    fav: favs.some((f) => f.code === config?.code) ? config.code : "",
    stop: config && !favs.some((f) => f.code === config.code) ? config.code : "",
    buses: config?.buses?.join(", ") || "",
    message,
  };
}

async function timingsData(config) {
  const data = {
    state: "timings",
    title: config.name || `Bus stop ${config.code}`,
    subtitle: `${config.code} · ${config.buses.length ? `Bus ${config.buses.join(", ")}` : "Every bus"}`,
    rows: [],
    empty: "",
    updated: sgTime(Date.now()),
    url: new URL(`/#${config.code}${config.buses.length === 1 ? `,${config.buses[0]}` : ""}`, self.location.origin).href,
  };
  try {
    const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(config.code)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const { services = [] } = await res.json();
    const wanted = config.buses.length ? services.filter((s) => config.buses.includes(String(s.serviceNo).toUpperCase())) : services;
    data.rows = wanted.slice(0, WIDGET_ROWS).map((s) => ({
      service: s.serviceNo,
      etas: [s.next, s.next2, s.next3].map(eta).filter(Boolean).join(" · ") || "No estimate",
    }));
    if (!data.rows.length) data.empty = config.buses.length ? "None of those buses are due here right now." : "No buses are due here right now.";
  } catch {
    data.empty = "Couldn't reach LTA. Tap Refresh to try again.";
  }
  return data;
}

// `draft` fills the setup in with what was just typed, when it couldn't be saved.
async function renderWidget(instanceId, { setup = false, message = "", draft = null } = {}) {
  const widget = await self.widgets.getByInstanceId(instanceId);
  const config = await widgetRead(widgetKey(instanceId));
  const data = setup || !config ? await setupData(draft || config, message) : await timingsData(config);
  await self.widgets.updateByInstanceId(instanceId, { template: await widgetTemplate(widget), data: JSON.stringify(data) });
}

async function renderAllWidgets() {
  const widget = await self.widgets.getByTag(WIDGET_TAG);
  await Promise.all((widget?.instances || []).map((i) => renderWidget(i.id).catch(() => {})));
}

// What was typed or picked on the card. Hosts have handed it over as an object or as JSON.
function widgetInputs(event) {
  let data = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
    }
  }
  return data && typeof data === "object" ? data : {};
}

async function saveWidget(instanceId, inputs) {
  const old = await widgetRead(widgetKey(instanceId));
  const typed = String(inputs.stop || "").trim();
  const picked = String(inputs.fav || "").trim();
  // A favourite just picked wins over a code left in the box from before.
  const code = picked && picked !== old?.code ? picked : typed || picked;
  const buses = [...new Set(String(inputs.buses || "").toUpperCase().split(/[\s,]+/).filter(Boolean))];
  const draft = { code, buses };
  if (!/^\d{5}$/.test(code)) {
    return renderWidget(instanceId, { setup: true, draft, message: "Pick a favourite, or type a 5-digit stop code." });
  }
  if (buses.some((b) => !/^[0-9A-Z]{1,4}$/.test(b))) {
    return renderWidget(instanceId, { setup: true, draft, message: "Bus numbers are like 21 or NR7, separated by commas." });
  }
  const favs = (await widgetRead("/widget/favourites")) || [];
  const name = favs.find((f) => f.code === code)?.name || (await stopName(code));
  await widgetWrite(widgetKey(instanceId), { code, buses, name });
  return renderWidget(instanceId);
}

if ("widgets" in self) {
  self.addEventListener("widgetinstall", (event) => {
    event.waitUntil((async () => {
      await renderWidget(event.instanceId);
      // Kept fresh as often as the browser allows; opening the Widgets board does it too.
      const every = (event.widget?.definition?.update || 60) * 1000;
      const tags = (await self.registration.periodicSync?.getTags()) || [];
      if (!tags.includes(WIDGET_TAG)) await self.registration.periodicSync?.register(WIDGET_TAG, { minInterval: every }).catch(() => {});
    })());
  });

  self.addEventListener("widgetuninstall", (event) => {
    event.waitUntil((async () => {
      await widgetWrite(widgetKey(event.instanceId), null);
      const widget = await self.widgets.getByTag(WIDGET_TAG);
      if ((widget?.instances || []).length <= 1) await self.registration.periodicSync?.unregister(WIDGET_TAG).catch(() => {});
    })());
  });

  self.addEventListener("widgetresume", (event) => {
    event.waitUntil(renderWidget(event.instanceId));
  });

  self.addEventListener("widgetclick", (event) => {
    const { action, instanceId } = event;
    if (action === "save") event.waitUntil(saveWidget(instanceId, widgetInputs(event)));
    else if (action === "setup") event.waitUntil(renderWidget(instanceId, { setup: true }));
    else if (action === "refresh") event.waitUntil(renderWidget(instanceId));
  });

  self.addEventListener("periodicsync", (event) => {
    if (event.tag === WIDGET_TAG) event.waitUntil(renderAllWidgets());
  });
}

async function cacheFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  } catch (err) {
    const fallback = fallbackUrl && (await cache.match(fallbackUrl));
    if (fallback) return fallback;
    throw err;
  }
}

// The last copy straight away, and a fresh one fetched behind it for next time. For the
// bus routes and stops, a megabyte that changes a few times a year: waiting on the network
// for it held up the route view, the planner and first/last bus times on every visit.
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (!cached) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return cached;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (FONT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(request));
    else if (isTile(url)) event.respondWith(tile(event, request));
    else if (isVectorTile(url)) event.respondWith(vectorTile(request));
    else if (isOfmFresh(url)) event.respondWith(mapFresh(event, request));
    else if (url.hostname === OFM_HOST) event.respondWith(mapKept(request));
    // Analytics and PeerJS for syncing (js/p2p.js) go straight to the network,
    // untouched: an old signalling client talking to the live broker is worse than
    // a clear "could not load".
    return;
  }

  // MapLibre, in its versioned folder: kept apart from the site's cache, which a deploy clears.
  // three.js too, for the celebration (js/celebrate.js), the same way.
  if (url.pathname.startsWith("/vendor/maplibre-") || url.pathname.startsWith("/vendor/three-")) {
    event.respondWith(mapKept(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    // Live arrivals and service alerts are never answered from a cache: an old
    // arrival time or disruption shown as live is worse than an error saying the
    // network is down.
    if (url.pathname === "/api/bus-arrivals" || url.pathname === "/api/service-alerts") return;
    // Service Alerts sign-up talks to the server and nothing else: a cached answer
    // could hand back a key from before the server's keys changed.
    if (url.pathname.startsWith("/api/push/")) return;
    // Journeys use live alerts and the time of day, and place searches go to OneMap:
    // neither is worth answering from an old copy.
    if (url.pathname === "/api/nav" || url.pathname === "/api/places") return;
    // A walk on the live map is asked for from where you are now, and Vercel's edge already
    // keeps the ones asked for before (api/walk.js).
    if (url.pathname === "/api/walk") return;
    // Share links: live progress moves, and a link just made has to be read fresh.
    if (url.pathname === "/api/share" || url.pathname === "/api/share-map") return;
    // The Android app's newest version: an old answer offers an update already installed.
    if (url.pathname === "/api/app-release") return;
    // Syncing with the Telegram bot: what it's said is only ever news.
    if (url.pathname === "/api/sync") return;
    // The MRT doors (js/mrt-doors.js) change as rarely, and are as useful underground.
    if (url.pathname === "/api/bus-routes" || url.pathname === "/api/bus-stops" || url.pathname === "/api/mrt-doors") {
      event.respondWith(staleWhileRevalidate(event, request));
      return;
    }
    // Stops and route info change rarely, so the last good copy is useful offline.
    event.respondWith(networkFirst(request));
    return;
  }

  // A short share link (api/share-page.js) is never kept: the server sends it on into the
  // app. Offline, the app itself, which reads the link from its path (script.js).
  if (request.mode === "navigate" && /^\/(go|trip|eta)\/[a-z0-9]{10}$/.test(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }

  // The app shell is served from this version's cache, so a page never mixes
  // files from two deploys. Offline navigations to anything uncached get the
  // app itself rather than the browser's error page.
  event.respondWith(cacheFirst(request, request.mode === "navigate" ? "/" : null));
});

/* -- The live map's tiles (js/map.js) -- */

let tilePuts = 0;

async function tile(event, request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  const fresh = async () => {
    const res = await fetch(request);
    // Only what can be read: OpenStreetMap sends CORS (js/map.js asks with it), and an
    // opaque answer would count as megabytes against the site's storage in Chrome.
    if (res.ok) {
      await cache.put(request, res.clone());
      if (++tilePuts % 50 === 0) trimTiles(cache);
    }
    return res;
  };
  if (hit) {
    const age = Date.now() - Date.parse(hit.headers.get("date") || "");
    if (!(age < TILE_REFRESH_MS)) event.waitUntil(fresh().catch(() => {}));
    return hit;
  }
  return fresh();
}

// The oldest first: Cache Storage lists its keys in the order they went in.
async function trimTiles(cache, max = TILE_MAX) {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/* -- The live map on MapLibre (js/map-engine.js) -- */

// Kept as it is once it's in: MapLibre, OpenFreeMap's fonts, sprites and world overview.
async function mapKept(request) {
  const cache = await caches.open(MAP_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  let res;
  try {
    res = await fetch(request);
  } catch (err) {
    // A label font's range never fetched: none of its letters, rather than MapLibre leaving the
    // whole tile undrawn (js/map-save.js, GLYPH_RANGES). Not kept, so it's fetched once the
    // network's back.
    if (new URL(request.url).pathname.startsWith("/fonts/")) return new Response(new Uint8Array(0), { headers: { "content-type": "application/x-protobuf" } });
    throw err;
  }
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

// A style or TileJSON: what's kept at once, and the newest fetched behind it for next time.
// Asked for afresh (cache: "no-cache", js/map-save.js checking this week's tiles), the
// network's first, and what's kept only if it can't be reached.
async function mapFresh(event, request) {
  const cache = await caches.open(MAP_CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request).then(async (res) => {
    if (res.ok) await cache.put(request, res.clone());
    return res;
  });
  if (hit && (request.cache === "no-cache" || request.cache === "reload")) return fresh.catch(() => hit);
  if (hit) {
    event.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

let vectorPuts = 0;
async function vectorTile(request) {
  const cache = await caches.open(VECTOR_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  // The map saved for offline: this week's tile as it is, another week's only if the network
  // can't give this one.
  const saved = await caches.match(savedKey(request.url), { cacheName: SAVED_MAP_CACHE });
  if (saved && saved.headers.get("x-saved-from") === request.url) return saved;
  let res;
  try {
    res = await fetch(request);
  } catch (err) {
    if (saved) return saved;
    throw err;
  }
  if (res.ok) {
    await cache.put(request, res.clone());
    if (++vectorPuts % 50 === 0) trimTiles(cache, VECTOR_MAX);
  } else if (saved) {
    return saved;
  }
  return res;
}

// A tile of the map being saved: { ok, bytes, sent }, `bytes` as kept and `sent` as it came over
// the network (compressed, where its Content-Length says), 0 when this week's was kept already.
// OpenFreeMap's vector tiles only.
async function saveMapTile(url) {
  const u = new URL(url);
  if (!isVectorTile(u)) return { ok: false };
  const cache = await caches.open(SAVED_MAP_CACHE);
  const key = savedKey(url);
  const kept = await cache.match(key);
  if (kept && kept.headers.get("x-saved-from") === url) return { ok: true, bytes: Number(kept.headers.get("x-saved-bytes")) || 0, sent: 0 };
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.blob();
  await cache.put(key, new Response(body, {
    headers: { "content-type": res.headers.get("content-type") || "application/x-protobuf", "x-saved-from": url, "x-saved-bytes": String(body.size), date: new Date().toUTCString() },
  }));
  return { ok: true, bytes: body.size, sent: Number(res.headers.get("content-length")) || body.size };
}
