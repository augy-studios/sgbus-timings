// Bump on every deploy that changes anything this worker serves. The browser
// compares this file byte for byte, so an unchanged VERSION means nobody is
// offered the update bar and the old cache keeps answering.
const VERSION = "v33";
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
  "/js/planner-worker.js",
  "/js/p2p.js",
  "/js/qr.js",
  "/js/sync.js",
  "/js/mrt-stations.js",
  "/js/alerts.js",
  "/js/weather.js",
  "/js/trip.js",
  "/js/nav.js",
  "/js/sw-update.js",
  "/manifest.json",
  "/favicon.ico",
  "/sgbusicon1.png",
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
        keys.filter((key) => key !== CACHE && key !== WIDGET_CACHE).map((key) => caches.delete(key))
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

/* -- Push: Service Alerts, sent by the cron function in api/push/poll.js -- */

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data?.json();
  } catch {}
  if (data?.type === "get-off") return event.waitUntil(getOff(data));
  if (data?.type !== "service-alert") return;

  // One tag for every alert, so a burst of traffic incidents replaces one
  // notification rather than filling the tray; renotify still buzzes for each.
  event.waitUntil(
    self.registration.showNotification(data.title || "Service Alerts", {
      body: data.body || "",
      tag: "service-alert",
      renotify: true,
      icon: "/sgbusicon1.png",
      badge: "/sgbusicon1.png",
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
    badge: "/sgbusicon1.png",
    data: { url: "/", kind: "get-off" },
  });
}

// Tapping a service alert opens the service alerts card, and a Get Off Alert the app with
// its trip bar: in the app if it's open already, otherwise in a new window.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const getOff = event.notification.data?.kind === "get-off" || event.notification.tag === "get-off";
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
    // Analytics, ads and PeerJS for syncing (js/p2p.js) go straight to the network,
    // untouched: an old signalling client talking to the live broker is worse than
    // a clear "could not load".
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
    if (url.pathname === "/api/bus-routes" || url.pathname === "/api/bus-stops") {
      event.respondWith(staleWhileRevalidate(event, request));
      return;
    }
    // Stops and route info change rarely, so the last good copy is useful offline.
    event.respondWith(networkFirst(request));
    return;
  }

  // The app shell is served from this version's cache, so a page never mixes
  // files from two deploys. Offline navigations to anything uncached get the
  // app itself rather than the browser's error page.
  event.respondWith(cacheFirst(request, request.mode === "navigate" ? "/" : null));
});
