// Service Alerts: the card showing train service alerts and traffic incidents
// right now (/api/service-alerts), and notifications for them while the app is
// closed. The page subscribes to Web Push and tells /api/push which updates it
// wants; a cron function (api/push/poll.js) polls LTA every minute and pushes.
// The subscribing follows alarm-clock's main-site/js/push.js.
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

  function open({ scroll = true } = {}) {
    $("#alertsSection").hidden = false;
    load();
    if (scroll) $("#alertsSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function close() {
    $("#alertsSection").hidden = true;
    loadToken++;
    if (location.hash === "#alerts") history.replaceState(null, "", location.pathname);
  }

  async function load() {
    const token = ++loadToken;
    const body = $("#alertsBody");
    if (!body.innerHTML) body.innerHTML = `<p class="plannerStatus">Loading service alerts&hellip;</p>`;
    $("#alertsRefresh").classList.add("busy");
    try {
      const res = await fetch("/api/service-alerts", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (token === loadToken) body.innerHTML = render(data);
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

  // ---------- notifications ----------

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  // The choice, { train, traffic }, each "all", "disruptions" or "off". Before the two were
  // split, one mode under MODE_KEY covered both; that carries over as the same for each.
  function storedModes() {
    try {
      const saved = JSON.parse(localStorage.getItem(MODES_KEY) || "null");
      if (saved && MODES.includes(saved.train) && MODES.includes(saved.traffic)) return saved;
      const old = localStorage.getItem(MODE_KEY);
      if (old === "all" || old === "disruptions") return { train: old, traffic: old };
    } catch {}
    return { train: "off", traffic: "off" };
  }

  function storeModes(modes) {
    try {
      localStorage.removeItem(MODE_KEY);
      if (modes.train === "off" && modes.traffic === "off") localStorage.removeItem(MODES_KEY);
      else localStorage.setItem(MODES_KEY, JSON.stringify(modes));
    } catch {}
  }

  const anyOn = (modes) => modes.train !== "off" || modes.traffic !== "off";

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
  const PROBLEMS = {
    unsupported: "This browser can't receive notifications. On iPhone or iPad, add the app to your Home Screen, open it from there, and try again.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then pick again.",
    failed: "Couldn't reach the alerts server. Try again in a minute.",
  };

  function noteFor(modes) {
    const parts = [TRAIN_NOTES[modes.train], TRAFFIC_NOTES[modes.traffic]].filter(Boolean);
    if (!parts.length) return "Notifications are off. The card still shows what's happening now.";
    return `You'll be notified of ${parts.join(", and of ")}.`;
  }

  function showModes(modes, problem) {
    for (const kind of ["train", "traffic"]) {
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

  async function subscribe(modes) {
    const reg = await readyRegistration();
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: await fetchPublicKey(),
    });
    const res = await fetch(`${API_BASE}/devices/${deviceId()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), train: modes.train, traffic: modes.traffic }),
    });
    if (!res.ok) throw new Error(`alerts server replied ${res.status}`);
  }

  // Unsubscribe and have the server forget this device. Browsers don't let a
  // page revoke notification permission itself; this is the closest it gets.
  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
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
    if (!pushSupported()) return showModes(previous, "unsupported");

    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return showModes(previous, "denied");

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
  function resync() {
    const modes = storedModes();
    if (!anyOn(modes)) return;
    if (!pushSupported() || Notification.permission !== "granted") {
      const off = { train: "off", traffic: "off" };
      storeModes(off);
      showModes(off);
      return;
    }
    // Saved again, so a single pre-split mode moves to the new key.
    storeModes(modes);
    subscribe(modes).catch((err) => console.warn("service alerts resync failed:", err));
  }

  // ---------- wiring ----------

  function init() {
    $("#alertsBtn").addEventListener("click", () => {
      if ($("#alertsSection").hidden) open();
      else close();
    });
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

    // A tapped notification on a page that's already open: the service worker
    // asks it to show the card rather than opening a second window.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "open-alerts") open();
      });
    }

    showModes(storedModes());
    resync();
  }

  window.Alerts = { open, close };
  init();
})();
