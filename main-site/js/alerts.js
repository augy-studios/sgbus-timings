// Service Alerts: the card showing train service alerts and traffic incidents
// right now (/api/service-alerts), and notifications for them while the app is
// closed. The page subscribes to Web Push and tells /api/push which updates it
// wants; a cron function (api/push/poll.js) polls LTA every minute and pushes.
// The subscribing follows alarm-clock's main-site/js/push.js.
//
// In the Android app (2.0.0 and later), whose WebView has no Web Push, the app registers with
// Firebase Cloud Messaging instead (Capacitor's PushNotifications plugin, js/app-bridge.js),
// and the "subscription" sent to the server is { fcm: token }, which it pushes to through FCM
// (api/_push/fcm.js). FCM shows the notification itself while the app's in the background; in
// front, the app hands it here and it's shown through the app (AppBridge.notify).
//
// In the desktop app (desktop/), which has no Web Push either but stays open in the tray, the
// page checks /api/service-alerts itself every DESKTOP_POLL_MS, by the same rules as
// api/_push/alerts.js, and the app shows what's new as a notification (window.sgbusDesktop).
// The Newsfeed (/api/notices): what LTA and the bus and train operators announce ahead of time,
// a run's closed roads and the stops skipped, a new service, a line closing early. Its own
// part of the card, today's and coming notices first, those naming your favourite stops and
// buses marked; the operators' news under them; and a note on a stop's timings when buses
// skip it today or tomorrow (stopNotes). Notifications for it are a third kind, `newsfeed`.
//
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const API_BASE = "/api/push";
  const MODES_KEY = "sgbus.alertModes";
  const MODE_KEY = "sgbus.alertMode"; // the single mode from before train and traffic were split
  const DEVICE_KEY = "sgbus.pushDeviceId";
  const MODES = ["all", "disruptions", "off"];

  // Keep in step with BLOCKING_TYPES in api/_push/alerts.js and
  // telegram-bot/src/service_alerts.py.
  const BLOCKING_TYPES = new Set([
    "accident", "vehicle breakdown", "road block", "diversion", "obstacle", "fire", "plant failure",
  ]);

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
  const ico = (name) => `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;
  const split = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);
  const stationLabel = (code) => window.MRT.stationName(code) || code;
  const isBlocking = (i) => BLOCKING_TYPES.has(i.type.trim().toLowerCase());

  let loadToken = 0;

  // ---------- the card ----------

  // Over the page, as a .panelModal (js/ui.js). Offline, Service alerts is gone till it's back
  // (js/offline.js): a link or notification to it brings the offline bar back to say so.
  function open() {
    if (window.Offline?.blocked()) return;
    window.showPanel("alertsSection", true);
    load();
  }

  function close() {
    window.showPanel("alertsSection", false);
    loadToken++;
    if (location.hash === "#alerts") history.replaceState(null, "", location.pathname);
  }

  async function load() {
    const token = ++loadToken;
    const body = $("#alertsBody");
    if (!body.innerHTML) body.innerHTML = `<p class="plannerStatus">Loading service alerts&hellip;</p>`;
    $("#alertsRefresh").classList.add("busy");
    try {
      const [res, news] = await Promise.all([fetch("/api/service-alerts", { cache: "no-store" }), notices(true).catch(() => null)]);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (data.train) showBar(disruptionText(data.train));
      if (token === loadToken) body.innerHTML = render(data) + renderNewsfeed(news);
    } catch {
      if (token === loadToken) {
        body.innerHTML = `<p class="plannerStatus">Couldn&rsquo;t reach LTA for service alerts. Check your connection, then tap Refresh.</p>`;
      }
    } finally {
      if (token === loadToken) $("#alertsRefresh").classList.remove("busy");
    }
  }

  function render({ train, traffic, fetchedAt }) {
    const time = new Date(fetchedAt || Date.now()).toLocaleTimeString("en-GB", { timeZone: "Asia/Singapore" });
    return renderTrain(train) + renderTraffic(traffic) + `<p class="estimateNote">From LTA, updated ${esc(time)}</p>`;
  }

  function renderTrain(value) {
    let html = `<h3 class="alertsHead">${ico("train")} Trains</h3>`;
    if (!value) return html + `<p class="alertsLine">Couldn&rsquo;t reach LTA for train alerts.</p>`;

    const status = Number(value.Status) || 1;
    const segments = Array.isArray(value.AffectedSegments) ? value.AffectedSegments : [];
    const notices = Array.isArray(value.Message) ? value.Message : [];

    if (status <= 1 && !segments.length) {
      html += `<p class="alertsLine"><span class="statusDot ok" aria-hidden="true"></span>All train services are running normally.</p>`;
    } else {
      html += segments.map((seg) => {
        const disrupted = (Number(seg.Status ?? status) || status) > 1;
        const stations = split(seg.Stations).map(stationLabel);
        const extras = [];
        const bus = split(seg.FreePublicBus).map(stationLabel);
        const shuttle = split(seg.FreeMRTShuttle).map(stationLabel);
        if (bus.length) extras.push(`Free buses at ${bus.join(", ")}`);
        if (shuttle.length) extras.push(`Free shuttle at ${shuttle.join(", ")}${seg.MRTShuttleDirection ? ` (${seg.MRTShuttleDirection})` : ""}`);
        return `<div class="alertItem ${disrupted ? "error" : "warn"}">` +
          `<p class="alertsLine"><span class="statusDot ${disrupted ? "error" : "warn"}" aria-hidden="true"></span>` +
          `<strong>${esc(window.MRT.lineLabel(seg.Line || "?"))}</strong> ${disrupted ? "disrupted" : "minor delay"}` +
          // LTA's Direction is "Both", or the terminus the affected trains head to.
          `${seg.Direction ? (/both/i.test(seg.Direction) ? ", both directions" : `, towards ${esc(seg.Direction)}`) : ""}</p>` +
          (stations.length ? `<p class="alertsDetail">Affects ${esc(stations.join(", "))}</p>` : "") +
          extras.map((e) => `<p class="alertsDetail">${esc(e)}</p>`).join("") +
          `</div>`;
      }).join("");
    }

    const contents = notices.map((n) => String(n.Content || "").trim()).filter(Boolean);
    if (contents.length) {
      html += `<ul class="alertsList">${contents.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
    }
    return html;
  }

  function renderTraffic(incidents) {
    let html = `<h3 class="alertsHead">${ico("cone")} Roads</h3>`;
    if (!incidents) return html + `<p class="alertsLine">Couldn&rsquo;t reach LTA for traffic incidents.</p>`;
    if (!incidents.length) {
      return html + `<p class="alertsLine"><span class="statusDot ok" aria-hidden="true"></span>No traffic incidents reported.</p>`;
    }

    const blocking = incidents.filter(isBlocking);
    const others = incidents.filter((i) => !isBlocking(i));
    html += `<p class="alertsLine">${incidents.length} incident${incidents.length === 1 ? "" : "s"} across Singapore, ` +
      `${blocking.length} of them able to block or reroute a bus.</p>`;
    if (blocking.length) html += list(blocking);
    if (others.length) {
      const counts = {};
      others.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; });
      const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ");
      html += `<p class="alertsDetail">Also reported: ${esc(summary)}.</p>` +
        `<button type="button" class="iconBtn alertsMore" aria-expanded="false" aria-controls="alertsOthers">Show the other ${others.length}</button>` +
        `<div id="alertsOthers" class="alertsOthers" hidden>${list(others)}</div>`;
    }
    return html;
  }

  const list = (items) => `<ul class="alertsList">${items.map((i) => `<li>${esc(i.message)}</li>`).join("")}</ul>`;

  // ---------- the newsfeed ----------

  const NOTICES_FOR_MS = 15 * 60 * 1000;
  // Coming notices shown this far ahead, and the operators' news this many.
  const AHEAD_DAYS = 14;
  const NEWS_SHOWN = 8;
  let noticesHad = null; // { at, data }

  // /api/notices, kept a while; `fresh` asks again.
  async function notices(fresh = false) {
    if (!fresh && noticesHad && Date.now() - noticesHad.at < NOTICES_FOR_MS) return noticesHad.data;
    const res = await fetch("/api/notices");
    if (!res.ok) throw new Error(String(res.status));
    noticesHad = { at: Date.now(), data: await res.json() };
    return noticesHad.data;
  }

  const sgDate = (offset = 0) => new Date(Date.now() + 8 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
  const onDate = (n, date) => (n.days ? n.days.includes(date) : !!n.from && n.from <= date && (n.to == null || date <= n.to));
  // When a notice is, by today: "Today", "Tomorrow", "From Sun 1 Nov", or its own words.
  function whenText(n) {
    const today = sgDate();
    if (onDate(n, today)) return n.to && n.to !== today ? `Today, till ${dayText(n.to)}` : "Today";
    if (onDate(n, sgDate(1))) return "Tomorrow";
    return n.dates || (n.from ? dayText(n.from) : "");
  }
  const dayText = (date) => new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" });

  // Your favourite stops and buses a notice names.
  function yours(n) {
    // script.js's LS, a top-level const rather than a property of window.
    const ls = typeof LS === "undefined" ? null : LS; // eslint-disable-line no-undef
    // A bus starred at a stop (help desk #6) counts as both.
    const atStops = ls?.getFavStopBuses?.() || [];
    const stops = new Set([...(ls?.getFavs() || []).map((s) => s.code), ...atStops.map((b) => b.code)]);
    const buses = new Set([...(ls?.getFavBuses() || []), ...atStops.map((b) => b.service)].map((b) => String(b).toUpperCase()));
    const myStops = [...new Set([...(n.codes || []), ...Object.keys(n.stops || {})])].filter((c) => stops.has(c));
    const myBuses = (n.services || []).filter((s) => buses.has(s));
    return { myStops, myBuses };
  }

  function noticeItem(n, sources) {
    const { myStops, myBuses } = yours(n);
    const services = (n.services || []).slice(0, 14);
    const mine = [
      myStops.length && `your stop${myStops.length > 1 ? "s" : ""} ${myStops.map((c) => (window.nameOf?.(c) || c)).join(", ")}`,
      myBuses.length && `your bus${myBuses.length > 1 ? "es" : ""} ${myBuses.join(", ")}`,
    ].filter(Boolean);
    return `<li class="noticeItem${mine.length ? " mine" : ""}">` +
      `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(n.title)}</strong></a>` +
      `<span class="noticeMeta">${esc(whenText(n))} · ${esc(n.source === "lta" ? "LTA" : sources[n.source] || n.source)}</span>` +
      (services.length ? `<span class="noticeBuses">${services.map((s) => `<span class="busChip">${esc(s)}</span>`).join("")}${n.services.length > services.length ? ` +${n.services.length - services.length}` : ""}</span>` : "") +
      (mine.length ? `<span class="noticeMine">${ico("star")} Affects ${esc(mine.join(" and "))}</span>` : "") +
      `</li>`;
  }

  function renderNewsfeed(data) {
    let html = `<h3 class="alertsHead">${ico("chart")} Newsfeed</h3>`;
    // Nothing read yet (`at` null) isn't nothing announced.
    if (!data || !data.at) return html + `<p class="alertsLine">Couldn&rsquo;t get the newsfeed just now. Tap Refresh in a minute.</p>`;
    const today = sgDate();
    const ahead = sgDate(AHEAD_DAYS);
    const items = data.items || [];
    // LTA's notices on now or soon, soonest first; yours first of all.
    const coming = items
      .filter((n) => n.source === "lta" && (n.days ? n.days.some((d) => d >= today && d <= ahead) : n.from && n.from <= ahead && (n.to == null ? n.from >= sgDate(-7) : n.to >= today)))
      .sort((a, b) => (yours(b).myStops.length + yours(b).myBuses.length > 0) - (yours(a).myStops.length + yours(a).myBuses.length > 0) || (a.from || "").localeCompare(b.from || ""));
    const news = items.filter((n) => n.kind === "news").sort((a, b) => (b.published || "").localeCompare(a.published || "")).slice(0, NEWS_SHOWN);
    html += coming.length
      ? `<p class="alertsSub">Today and the next two weeks</p><ul class="noticeList">${coming.map((n) => noticeItem(n, data.sources || {})).join("")}</ul>`
      : `<p class="alertsLine"><span class="statusDot ok" aria-hidden="true"></span>No bus or train changes announced for the next two weeks.</p>`;
    if (news.length) {
      html += `<p class="alertsSub">From the operators</p><ul class="noticeList news">` +
        news.map((n) => `<li class="noticeItem"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` +
          `<span class="noticeMeta">${esc(n.published ? dayText(n.published) : "")} · ${esc((data.sources || {})[n.source] || n.source)}</span></li>`).join("") + `</ul>`;
    }
    return html;
  }

  // A stop's notes from the newsfeed: its buses skipping it, or a notice naming it, today or
  // tomorrow. [{ html }], for its timings (script.js renderStopAside); empty till the newsfeed's in.
  function stopNotes(code) {
    const data = noticesHad?.data;
    if (!data) return [];
    const notes = [];
    for (const [offset, word] of [[0, "Today"], [1, "Tomorrow"]]) {
      const date = sgDate(offset);
      for (const n of data.items || []) {
        if (n.source !== "lta" || !onDate(n, date) || !(n.stops?.[code] || n.codes?.includes(code))) continue;
        const here = n.stops?.[code];
        const what = here
          ? `${here.services.join(", ")} skip${here.services.length === 1 ? "s" : ""} this stop${here.when ? `, ${here.when.replace(/^first bus/i, "first bus")}` : ""}`
          : "this stop is affected";
        notes.push({ html: `<p class="stopAsideNote noticeNote">${ico("alert")} <span><strong>${word}:</strong> ${esc(what)}. ${esc(n.title)}. ` +
          `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">Details</a></span></p>` });
      }
      if (notes.length) break;
    }
    return notes;
  }

  // ---------- the disruptions bar ----------
  // Along the top, under the update bar, only while a train line is disrupted or delayed: what's
  // affected, and Details for the card. Hide puts it away for this page view, until the
  // disruption changes. Traffic incidents don't count: there's nearly always one somewhere.

  const BAR_REFRESH_MS = 2 * 60 * 1000;
  let barPutAway = null; // the text of the disruption last hidden

  function disruptionText(train) {
    const status = Number(train.Status) || 1;
    const segments = Array.isArray(train.AffectedSegments) ? train.AffectedSegments : [];
    if (status <= 1 && !segments.length) return null;
    const parts = segments.map((seg) => {
      const stations = split(seg.Stations).map(stationLabel);
      const where = stations.length > 1 ? `, ${stations[0]} to ${stations[stations.length - 1]}`
        : stations.length ? `, at ${stations[0]}` : "";
      const towards = seg.Direction && !/both/i.test(seg.Direction) ? `, towards ${seg.Direction}` : "";
      return `${window.MRT.lineLabel(seg.Line || "?")}${where}${towards}`;
    });
    const what = status > 1 ? "Train disruption" : "Train delay";
    if (parts.length) return `${what}: ${parts.join("; ")}`;
    const notice = (Array.isArray(train.Message) ? train.Message : []).map((n) => String(n.Content || "").trim()).find(Boolean);
    return notice || `${what} on the MRT or LRT`;
  }

  function showBar(text) {
    const bar = $("#disruptionBar");
    bar.hidden = !text || text === barPutAway;
    if (bar.hidden || bar.dataset.text === text) return;
    bar.dataset.text = text;
    bar.innerHTML = `<div class="disruption-inner">${ico("alert")}<p>${esc(text)}</p>` +
      `<button type="button" class="btn" data-disruption="details">Details</button>` +
      `<button type="button" class="iconBtn" data-disruption="hide">Hide</button></div>`;
  }

  // Only while the page is on screen; coming back to it checks straight away.
  async function refreshBar() {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/service-alerts", { cache: "no-store" });
      if (!res.ok) return;
      const { train } = await res.json();
      // LTA's train feed down: whatever's shown stays.
      if (train) showBar(disruptionText(train));
    } catch {}
  }

  // ---------- notifications ----------

  const inApp = () => Boolean(window.AppBridge?.native);
  const inDesktop = () => Boolean(window.sgbusDesktop);

  function pushSupported() {
    if (inDesktop()) return true;
    if (inApp()) return AppBridge.has("push");
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  // "granted", "denied" or "default", as Notification.permission says it.
  async function permission({ ask = false } = {}) {
    if (inDesktop()) return "granted";
    if (!inApp()) {
      if (Notification.permission !== "default" || !ask) return Notification.permission;
      return Notification.requestPermission();
    }
    const now = (await AppBridge.call("PushNotifications", "checkPermissions")).receive;
    const state = now === "granted" || !ask ? now : (await AppBridge.call("PushNotifications", "requestPermissions")).receive;
    return state === "granted" ? "granted" : state === "denied" ? "denied" : "default";
  }

  // The choice, { train, traffic }, each "all", "disruptions" or "off". Before the two were
  // split, one mode under MODE_KEY covered both; that carries over as the same for each.
  function storedModes() {
    try {
      const saved = JSON.parse(localStorage.getItem(MODES_KEY) || "null");
      if (saved && MODES.includes(saved.train) && MODES.includes(saved.traffic)) {
        return { ...saved, newsfeed: MODES.includes(saved.newsfeed) ? saved.newsfeed : "off" };
      }
      const old = localStorage.getItem(MODE_KEY);
      if (old === "all" || old === "disruptions") return { train: old, traffic: old, newsfeed: "off" };
    } catch {}
    return { train: "off", traffic: "off", newsfeed: "off" };
  }

  function storeModes(modes) {
    try {
      localStorage.removeItem(MODE_KEY);
      if (!anyOn(modes)) localStorage.removeItem(MODES_KEY);
      else localStorage.setItem(MODES_KEY, JSON.stringify(modes));
    } catch {}
  }

  const anyOn = (modes) => modes.train !== "off" || modes.traffic !== "off" || (modes.newsfeed || "off") !== "off";

  function deviceId() {
    let id = null;
    try {
      id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_KEY, id);
      }
    } catch {}
    return id || crypto.randomUUID();
  }

  const TRAIN_NOTES = {
    all: "every change to MRT and LRT services, including service notices",
    disruptions: "train disruptions starting, changing or clearing",
  };
  const TRAFFIC_NOTES = {
    all: "every new traffic incident in Singapore",
    disruptions: "accidents, breakdowns, road blocks and diversions",
  };
  const NEWSFEED_NOTES = {
    all: "every new notice and piece of news from LTA and the bus and train operators",
    disruptions: "new notices that change a bus or train service",
  };
  const PROBLEMS = {
    unsupported: "This browser can't receive notifications. On iPhone or iPad, add the app to your Home Screen, open it from there, and try again.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then pick again.",
    failed: "Couldn't reach the alerts server. Try again in a minute.",
    appUnsupported: "This copy of the app can't get notifications from the server yet. Update it when an update's offered, or use the website.",
    appDenied: "Notifications are off for SG Bus Timings. Turn them on in Android's settings for the app, then pick again.",
  };

  function noteFor(modes) {
    const parts = [TRAIN_NOTES[modes.train], TRAFFIC_NOTES[modes.traffic], NEWSFEED_NOTES[modes.newsfeed]].filter(Boolean);
    if (!parts.length) return "Notifications are off. This window still shows what's happening now.";
    return `You'll be notified of ${parts.join(", and of ")}.`;
  }

  function showModes(modes, problem) {
    for (const kind of ["train", "traffic", "newsfeed"]) {
      document.querySelectorAll(`[data-alert-kind="${kind}"] [data-alert-mode]`).forEach((btn) => {
        const on = btn.dataset.alertMode === modes[kind];
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", String(on));
      });
    }
    $("#alertsNote").textContent = problem ? PROBLEMS[problem] : noteFor(modes);
  }

  // navigator.serviceWorker.ready never settles if registration failed, so it
  // gets a time limit.
  function readyRegistration() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("service worker not ready")), 10_000)),
    ]);
  }

  async function fetchPublicKey() {
    const res = await fetch(`${API_BASE}/vapid-key`);
    if (!res.ok) throw new Error(`alerts server replied ${res.status}`);
    const { publicKey } = await res.json();
    const b64 = (publicKey + "=".repeat((4 - (publicKey.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  // The app's FCM token, from PushNotifications.register(): its answer comes as an event.
  let fcmToken = null;
  function appToken() {
    if (fcmToken) return Promise.resolve(fcmToken);
    return new Promise((resolve, reject) => {
      const ok = AppBridge.on("PushNotifications", "registration", (t) => {
        ok.remove();
        bad.remove();
        fcmToken = t.value;
        resolve(fcmToken);
      });
      const bad = AppBridge.on("PushNotifications", "registrationError", (e) => {
        ok.remove();
        bad.remove();
        reject(new Error(e?.error || "FCM registration failed"));
      });
      AppBridge.call("PushNotifications", "register").catch(reject);
      setTimeout(() => reject(new Error("FCM registration timed out")), 20_000);
    });
  }

  // What the server pushes to: a Web Push subscription, or in the app { fcm: token }. Either
  // way it has toJSON(), as a PushSubscription does.
  async function subscription() {
    if (inApp()) {
      const fcm = await appToken();
      return { toJSON: () => ({ fcm }) };
    }
    const reg = await readyRegistration();
    return (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: await fetchPublicKey(),
    });
  }

  // This device's id and push subscription, for the Get Off Alert's background half
  // (js/trip.js), which pushes to the same subscription. Null without permission.
  async function pushTarget() {
    if (!pushSupported() || (await permission()) !== "granted") return null;
    return { deviceId: deviceId(), subscription: (await subscription()).toJSON() };
  }

  async function subscribe(modes) {
    if (inDesktop()) return desktopWatch(modes);
    const sub = await subscription();
    const res = await fetch(`${API_BASE}/devices/${deviceId()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), train: modes.train, traffic: modes.traffic, newsfeed: modes.newsfeed || "off" }),
    });
    if (!res.ok) throw new Error(`alerts server replied ${res.status}`);
  }

  // Unsubscribe and have the server forget this device. Browsers don't let a
  // page revoke notification permission itself; this is the closest it gets.
  async function unsubscribe() {
    if (inDesktop()) return desktopWatch(null);
    try {
      // A trip still running needs the subscription for its Get Off Alert. The app's FCM
      // token stays: it's the app's, not this choice's, and the server forgets the device.
      if (!inApp()) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!window.Trip?.active()) await sub?.unsubscribe();
      }
    } catch (err) {
      console.warn("unsubscribe failed:", err);
    }
    try {
      await fetch(`${API_BASE}/devices/${deviceId()}`, { method: "DELETE" });
    } catch (err) {
      // The subscription is already gone, so the server drops the device the
      // first time a push to it fails.
      console.warn("device delete failed:", err);
    }
  }

  async function setMode(kind, mode) {
    const previous = storedModes();
    const modes = { ...previous, [kind]: mode };
    if (!anyOn(modes)) {
      storeModes(modes);
      showModes(modes);
      if (pushSupported()) await unsubscribe();
      return;
    }
    if (!pushSupported()) return showModes(previous, inApp() ? "appUnsupported" : "unsupported");

    let perm;
    try {
      perm = await permission({ ask: true });
    } catch {
      perm = "denied";
    }
    if (perm !== "granted") return showModes(previous, inApp() ? "appDenied" : "denied");

    showModes(modes);
    try {
      await subscribe(modes);
      storeModes(modes);
    } catch (err) {
      console.warn("service alerts unavailable:", err);
      showModes(previous, "failed");
    }
  }

  // Re-sends the choice on every load, which also refreshes the subscription. A
  // permission revoked in the browser's settings turns both off here too.
  async function resync() {
    const modes = storedModes();
    if (!anyOn(modes)) return;
    // The app's features are known once it's answered.
    if (inApp()) await AppBridge.ready(5000);
    let perm = "default";
    try {
      if (pushSupported()) perm = await permission();
    } catch {}
    if (perm !== "granted") {
      const off = { train: "off", traffic: "off" };
      storeModes(off);
      showModes(off);
      return;
    }
    // Saved again, so a single pre-split mode moves to the new key.
    storeModes(modes);
    // The server's told again only when the choice or the subscription has changed, or once a
    // day to keep it fresh, rather than on every load: each telling is a write to its store.
    // The desktop app watches by itself, every load.
    if (!inDesktop()) {
      let key = JSON.stringify(modes);
      try {
        key += (await subscription()).endpoint;
        const last = JSON.parse(localStorage.getItem(SYNCED_KEY) || "null");
        if (last?.key === key && Date.now() - last.at < RESYNC_MS) return;
      } catch {}
      subscribe(modes)
        .then(() => {
          try { localStorage.setItem(SYNCED_KEY, JSON.stringify({ key, at: Date.now() })); } catch {}
        })
        .catch((err) => console.warn("service alerts resync failed:", err));
      return;
    }
    subscribe(modes).catch((err) => console.warn("service alerts resync failed:", err));
  }
  const SYNCED_KEY = "sgbus.alertSynced";
  const RESYNC_MS = 24 * 60 * 60 * 1000;

  // ---------- the desktop app ----------
  // The same rules as api/_push/alerts.js (diffTrain, diffTraffic, updateFor): the first look
  // only notes how things are; after that, a train update when anything about the trains
  // changes ("disruptions": only while one's on, and as it clears), and each traffic incident
  // not seen in the last SEEN_FOR_MS ("disruptions": only those that can block a bus).

  const DESKTOP_POLL_MS = 60 * 1000;
  const SEEN_FOR_MS = 6 * 60 * 60 * 1000;
  let desktop = null; // { modes, timer, train, seen }

  function desktopWatch(modes) {
    clearInterval(desktop?.timer);
    desktop = null;
    if (!modes || !anyOn(modes)) return;
    desktop = { modes, train: null, seen: null, timer: setInterval(desktopPoll, DESKTOP_POLL_MS) };
    desktopPoll();
  }

  async function desktopPoll() {
    const d = desktop;
    if (!d) return;
    let data;
    try {
      const res = await fetch("/api/service-alerts", { cache: "no-store" });
      if (!res.ok) return;
      data = await res.json();
    } catch {
      return;
    }
    if (desktop !== d) return;
    const parts = [];
    let title = "Service Alerts";

    if (data.train) {
      const status = Number(data.train.Status) || 1;
      const segments = Array.isArray(data.train.AffectedSegments) ? data.train.AffectedSegments : [];
      const now = JSON.stringify([status, segments, data.train.Message || []]);
      const disrupted = status > 1 || segments.length > 0;
      if (d.train && d.train.key !== now && (d.modes.train === "all" || (d.modes.train === "disruptions" && (disrupted || d.train.disrupted)))) {
        parts.push(disruptionText(data.train) || "All train services are running normally again.");
        title = disrupted ? "Train disruption" : "Train service update";
      }
      d.train = { key: now, disrupted };
    }

    if (Array.isArray(data.traffic)) {
      const t = Date.now();
      const first = !d.seen;
      const seen = Object.fromEntries(Object.entries(d.seen || {}).filter(([, at]) => t - at < SEEN_FOR_MS));
      const fresh = [];
      for (const i of data.traffic) {
        const k = `${i.type}|${i.message}`;
        if (!first && !(k in seen)) fresh.push(i);
        seen[k] = t;
      }
      d.seen = seen;
      const heard = d.modes.traffic === "all" ? fresh : d.modes.traffic === "disruptions" ? fresh.filter(isBlocking) : [];
      if (heard.length) {
        parts.push(heard[0].message + (heard.length > 1 ? `\nAnd ${heard.length - 1} more traffic incident${heard.length > 2 ? "s" : ""}.` : ""));
        if (title === "Service Alerts" && !parts[1]) title = heard.length === 1 ? `New ${heard[0].type.toLowerCase()}` : `${heard.length} new traffic incidents`;
        if (parts.length > 1) title = "Service Alerts";
      }
    }

    if (parts.length) window.sgbusDesktop.notify({ title, body: parts.join("\n"), url: "/#alerts" });
    if (data.train) showBar(disruptionText(data.train));
    desktopNews(d);
  }

  // The newsfeed in the desktop app: what's new since the last look, as api/notices.js pushes it.
  const CHANGES_RE = /divers|clos|skip|servic|stop|route|berth|shuttle|disrupt|extend|extension|operating hours|last (bus|train)|relocat|amend|adjust|new (bus|short|peak|service)|interchange|terminal/i;
  const NOT_CHANGES_RE = /fare|award|recruit|career|contract|campaign|trial|winner|appoint/i;
  async function desktopNews(d) {
    if ((d.modes.newsfeed || "off") === "off") return;
    let data;
    try {
      data = await notices(true);
    } catch {
      return;
    }
    if (desktop !== d) return;
    const ids = new Set((data.items || []).map((n) => n.id));
    const fresh = d.news ? (data.items || []).filter((n) => !d.news.has(n.id)) : [];
    d.news = ids;
    const heard = d.modes.newsfeed === "all" ? fresh : fresh.filter((n) => n.source === "lta" || (CHANGES_RE.test(n.title) && !NOT_CHANGES_RE.test(n.title)));
    if (!heard.length) return;
    const from = (n) => (n.source === "lta" ? "LTA" : (data.sources || {})[n.source] || n.source);
    window.sgbusDesktop.notify({
      title: heard.length === 1 ? `Newsfeed: ${from(heard[0])}` : `Newsfeed: ${heard.length} new notices`,
      body: heard.slice(0, 3).map((n) => (heard.length === 1 ? n.title : `${from(n)}: ${n.title}`)).join("\n"),
      url: "/#alerts",
    });
  }

  // ---------- wiring ----------

  function init() {
    $("#alertsBtn").addEventListener("click", () => {
      if ($("#alertsSection").hidden) open();
      else close();
    });
    window.wirePanel("alertsSection", close);
    $("#alertsClose").addEventListener("click", close);
    $("#alertsRefresh").addEventListener("click", load);
    $("#alertModes").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-alert-mode]");
      if (btn) setMode(btn.closest("[data-alert-kind]").dataset.alertKind, btn.dataset.alertMode);
    });
    $("#alertsBody").addEventListener("click", (e) => {
      const more = e.target.closest(".alertsMore");
      if (!more) return;
      const others = $("#alertsOthers");
      others.hidden = !others.hidden;
      more.setAttribute("aria-expanded", String(!others.hidden));
      more.textContent = others.hidden ? `Show the other ${others.querySelectorAll("li").length}` : "Hide them";
    });

    // In the app: a push that came while it was in front, which FCM leaves to the app to
    // show, and a tapped one. The Get Off Alert's and Get ready to board's go to js/trip.js.
    if (inApp()) {
      const fromPush = (n) => ({ ...(n?.data || {}), title: n?.title ?? n?.data?.title, body: n?.body ?? n?.data?.body });
      AppBridge.on("PushNotifications", "pushNotificationReceived", (n) => {
        const d = fromPush(n);
        if (d.type === "get-off") {
          window.dispatchEvent(new CustomEvent("push:get-off", { detail: { tripId: d.tripId, leg: Number(d.leg), text: d.body } }));
        } else if (d.type === "board") {
          window.dispatchEvent(new CustomEvent("push:board", { detail: { tripId: d.tripId, leg: Number(d.leg), text: d.body } }));
        } else if (d.type === "service-alert") {
          AppBridge.notify({ channel: "alerts", tag: "service-alert", title: d.title || "Service Alerts", body: d.body || "", url: d.url || "/#alerts" });
          if (!$("#alertsSection").hidden) load();
        }
      });
      AppBridge.on("PushNotifications", "pushNotificationActionPerformed", (a) => {
        if (fromPush(a?.notification).type === "service-alert") open();
      });
    }

    // A tapped notification on a page that's already open: the service worker
    // asks it to show the card rather than opening a second window.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "open-alerts") open();
      });
    }

    $("#disruptionBar").addEventListener("click", (e) => {
      const action = e.target.closest("[data-disruption]")?.dataset.disruption;
      if (action === "details") {
        open();
      } else if (action === "hide") {
        barPutAway = $("#disruptionBar").dataset.text;
        $("#disruptionBar").hidden = true;
      }
    });
    refreshBar();
    setInterval(refreshBar, BAR_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshBar);

    showModes(storedModes());
    resync();
  }

  window.Alerts = { open, close, pushTarget, notices, stopNotes };
  init();
})();
