// Bump on every deploy that changes anything this worker serves. The browser
// compares this file byte for byte, so an unchanged VERSION means nobody is
// offered the update bar and the old cache keeps answering.
const VERSION = "v17";
const CACHE = `sgbus-${VERSION}`;

const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/js/icons.js",
  "/js/ui.js",
  "/js/theme.js",
  "/js/network.js",
  "/js/journeys.js",
  "/js/planner.js",
  "/js/p2p.js",
  "/js/qr.js",
  "/js/sync.js",
  "/js/sw-update.js",
  "/manifest.json",
  "/favicon.ico",
  "/sgbusicon1.png",
  "/images/screenshot_1.png",
  "/images/screenshot_2.png"
];

// Cached on first use so the Jua font still renders offline.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

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
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
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
});

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
    // Analytics, ads and PeerJS for syncing (js/p2p.js) go straight to the network,
    // untouched: an old signalling client talking to the live broker is worse than
    // a clear "could not load".
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    // Live arrivals are never answered from a cache: an old arrival time shown
    // as live is worse than an error saying the network is down.
    if (url.pathname === "/api/bus-arrivals") return;
    // Stops and route info change rarely, so the last good copy is useful offline.
    event.respondWith(networkFirst(request));
    return;
  }

  // The app shell is served from this version's cache, so a page never mixes
  // files from two deploys. Offline navigations to anything uncached get the
  // app itself rather than the browser's error page.
  event.respondWith(cacheFirst(request, request.mode === "navigate" ? "/" : null));
});
