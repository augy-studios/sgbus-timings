// The app's pages: Glance (the next bus and your stops' buses, js/glance.js), Bus timings (the
// search and a stop's timings), Favourites, Navigate (its two tabs, Bus and train and Bus only,
// inside it), Service alerts, Your trips and Places are each a page of its own, switched by tabs
// at the top of the Edge Tray (docs/edge-tray-spec.md, 6.2: the one on show in the brand fill).
// Settings' Custom home is the page the app opens on, and its tab comes first: Glance unless
// it's set otherwise. Glance, Service alerts and Your trips can be turned off in Settings' Edge
// Tray buttons, which takes their tabs away too, and a home that's off opens Bus timings
// instead. The other pages don't need them: trips are still kept with Your trips off
// (js/trip.js, TripHistory.record). The small things (Settings,
// the theme, the weather, a bus's route, a list of stops) still open as windows over the page.
//
// Offline (js/offline.js), Glance, Bus timings and Service alerts need the network, so their tabs
// go too, without touching what Settings keeps, and Favourites is on show in place of any of
// them. Back online, they come back and the page on show stays.
//
// Each page's panel or modal is "docked" (style.css): drawn in the page, with no close button.
// js/ui.js asks here before showing or hiding one: showing one switches to its page, and hiding
// it is ignored, as a page can't be closed. So whatever opened a part before, such as a saved
// stop in Favourites opening its timings, or a place opening the way there, now goes to its page.
(function () {
  // The home. No value (or "stop", the default from when it was Opens on) is Glance, which Bus
  // timings had at its top before it was a page, so a home left as it was opens on the same thing.
  const HOME_KEY = 'sgbus_start';

  // In the tray's order, after the home. `els` are the panels or modal the page draws in, one
  // at a time (Glance and Bus timings are the page's own glance, search and results, style.css,
  // data-view; Navigate has a panel per tab); `btn` its Edge Tray button. On its tab, `show`
  // runs every time and `first` only the first time, so Navigate keeps what was being planned,
  // on the tab used last: both plan without the network (Bus and train on the phone, js/nav.js).
  const PARTS = [
    { id: 'glance', label: 'Glance', btn: 'glanceBtn' },
    { id: 'timings', label: 'Bus timings', btn: 'timingsBtn' },
    { id: 'favs', label: 'Favourites', btn: 'favsBtn', els: ['favsModal'], modal: true, show: () => renderFavs() },
    { id: 'nav', label: 'Navigate', btn: 'navBtn', els: ['navSection', 'plannerSection'], first: () => (lastNavMode() === 'bus' ? openPlanner() : openNav()) },
    { id: 'alerts', label: 'Service alerts', btn: 'alertsBtn', els: ['alertsSection'], show: () => Alerts.open() },
    { id: 'trips', label: 'Your trips', btn: 'tripsBtn', els: ['tripsSection'], show: () => TripHistory.open() },
    { id: 'places', label: 'Places', btn: 'placesBtn', els: ['placesSection'], show: () => Places.open() },
  ];
  const IDS = PARTS.map((p) => p.id);
  const byId = Object.fromEntries(PARTS.map((p) => [p.id, p]));
  const byEl = Object.fromEntries(PARTS.flatMap((p) => (p.els || []).map((el) => [el, p])));
  // Each page's panel on show: its first, until another of its own is shown.
  const shown = Object.fromEntries(PARTS.filter((p) => p.els).map((p) => [p.id, p.els[0]]));

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  let active = 'glance';
  const opened = new Set();

  // The pages Settings can turn off. Glance keeps its own switch (js/glance.js, and "glance" in
  // js/sync.js); the others are kept as "alerts trips" under OFF_KEY. All of them are kept as
  // data-pages-off on <html> too, which index.html's head sets again before first paint, so a
  // page that's off doesn't show its tab for a moment first (style.css).
  const CAN_HIDE = ['glance', 'alerts', 'trips'];
  const OFF_KEY = 'sgbus_pages_off';
  const glanceOn = () => window.Glance?.enabled() ?? true;
  const offList = new Set();
  try {
    for (const n of (localStorage.getItem(OFF_KEY) || '').split(' ')) if (n !== 'glance' && CAN_HIDE.includes(n)) offList.add(n);
  } catch { /* all on */ }
  const hidden = () => [...(glanceOn() ? [] : ['glance']), ...CAN_HIDE.filter((n) => offList.has(n))];
  const shows = (id) => !hidden().includes(id);

  // On top of those, the pages that need the network, while offline. hidden() and shows() stay
  // what Settings says, which js/sync.js and Settings' switches show; here() is whether a page
  // can be on show now, and fallback() the page on show when one can't: Bus timings, or
  // offline, Favourites, which can't be turned off.
  const NEEDS_NETWORK = ['glance', 'timings', 'alerts'];
  const offline = () => !!window.Offline?.on();
  const here = (id) => shows(id) && !(offline() && NEEDS_NETWORK.includes(id));
  const fallback = () => (offline() ? 'favs' : 'timings');

  // Settings' Custom home, or Bus timings while it's off. js/sync.js syncs this, so it's the
  // same offline; start() is the page the app opens on now.
  function home() {
    let v = null;
    try { v = localStorage.getItem(HOME_KEY); } catch { /* Glance */ }
    if (!IDS.includes(v)) v = 'glance';
    return shows(v) ? v : 'timings';
  }
  const start = () => (here(home()) ? home() : fallback());

  // Custom home: the app opens on `id`, its tab goes first, and it's on show at once. One
  // that's off (from a synced device) is kept for when it's on again: Bus timings until then,
  // or Favourites offline.
  function setHome(id) {
    if (!IDS.includes(id)) return;
    try {
      if (id === 'glance') localStorage.removeItem(HOME_KEY);
      else localStorage.setItem(HOME_KEY, id);
    } catch { /* this visit only */ }
    layout();
    open(start());
    window.dispatchEvent(new Event('mainscreenchange'));
  }

  // A page turned on or off, in Settings or from a synced device. Glance's goes through its own
  // switch, which fires "glancechange" back here.
  function setShown(id, on) {
    if (!CAN_HIDE.includes(id)) return;
    if (id === 'glance') return window.Glance?.setEnabled(on);
    if (on) offList.delete(id);
    else offList.add(id);
    try {
      if (offList.size) localStorage.setItem(OFF_KEY, [...offList].join(' '));
      else localStorage.removeItem(OFF_KEY);
    } catch { /* this visit only */ }
    changed();
  }

  const docked = (elId) => !!byEl[elId];

  // Shows `id`, from code that has already opened it (js/ui.js): only the page changes, to its
  // panel `el` if it has more than one. A switch of page is a step Back goes back from (js/ui.js,
  // Steps); a switch of Navigate's tab isn't.
  let ready = false;
  let quiet = false;
  function select(id, el) {
    // A page that's off, or offline one that needs the network, isn't shown: whatever opened
    // it (a link, Back to it) gets Bus timings, or offline Favourites, filled in as its tab would.
    if (!here(id)) return open(fallback());
    const changed = active !== id;
    active = id;
    if (el && byEl[el]?.id === id) shown[id] = el;
    opened.add(id);
    apply();
    if (!changed) return;
    if (ready && !quiet) window.Steps?.step({});
    window.dispatchEvent(new Event('viewchange'));
  }

  // Shows `id` from its tab, filling it in as its own button would.
  function open(id) {
    if (!byId[id]) return false;
    if (!here(id)) id = fallback();
    const part = byId[id];
    const first = !opened.has(id);
    select(id);
    if (part.show) part.show();
    else if (part.first && first) part.first();
    return true;
  }

  // The page on show: its panel in the page and the others hidden, Bus timings' search and
  // results hidden under any other (style.css, data-view), and its tab selected.
  function apply() {
    root.setAttribute('data-view', active);
    for (const part of PARTS) {
      for (const id of part.els || []) {
        const el = $(id);
        const hide = part.id !== active || shown[part.id] !== id;
        if (part.modal) el.classList.toggle('hidden', hide);
        else el.hidden = hide;
      }
      const btn = $(part.btn);
      const on = part.id === active;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    window.syncModalOpen?.();
  }

  // The tabs at the top of the tray, the home's first, and those turned off, or offline, left
  // out. data-pages-off is only Settings'; offline's are style.css's, on data-net-off.
  function layout() {
    const views = $('trayViews');
    const first = home();
    const off = hidden();
    for (const id of [first, ...IDS.filter((n) => n !== first)]) {
      const btn = $(byId[id].btn);
      btn.hidden = !here(id);
      views.appendChild(btn);
    }
    if (off.length) root.setAttribute('data-pages-off', off.join(' '));
    else root.removeAttribute('data-pages-off');
  }

  // A page turned on or off: its tab comes or goes, and off its page, Bus timings is on show
  // instead, as the step on show rather than a new one, as offline's below: Back has no page
  // that's gone to go back to, and Back from the window it was turned off in (Settings, the
  // first open's choice, js/first-run.js) closes just that. Settings' switches and Custom home
  // follow (script.js, "mainscreenchange").
  function changed() {
    if (!ready) return;
    layout();
    if (!here(active)) {
      quiet = true;
      try { open(fallback()); } finally { quiet = false; }
    }
    window.dispatchEvent(new Event('mainscreenchange'));
  }

  // Offline or online again: the tabs that need the network go or come back. On a page that
  // went, Favourites is on show in its place, as the step on show rather than a new one Back
  // would go back to the page from. Online again, the page on show stays.
  function netChanged() {
    if (!ready) return;
    layout();
    if (here(active)) return;
    quiet = true;
    try { open(fallback()); } finally { quiet = false; }
    window.Steps?.mark();
  }

  function init() {
    // Favourites is a modal outside the page's column; as a page, it sits in it.
    document.querySelector('.container').appendChild($('favsModal'));
    for (const part of PARTS) {
      const btn = $(part.btn);
      btn.dataset.part = part.id;
      btn.setAttribute('role', 'tab');
      btn.removeAttribute('aria-haspopup');
      btn.hidden = false;
      // A page, not a window over one (help desk #6): no aria-modal, which would hide the Edge
      // Tray from a screen reader, but its tab's panel, keeping its own name (or its tab's).
      const panels = [];
      for (const id of part.els || []) {
        const el = $(id);
        el.classList.add('docked');
        const box = el.matches('[role="dialog"]') ? el : el.querySelector('[role="dialog"]');
        if (!box) continue;
        box.removeAttribute('aria-modal');
        box.setAttribute('role', 'tabpanel');
        if (!box.hasAttribute('aria-label') && !box.hasAttribute('aria-labelledby')) box.setAttribute('aria-labelledby', part.btn);
        if (!box.id) box.id = `${id}Panel`;
        panels.push(box.id);
      }
      if (panels.length) btn.setAttribute('aria-controls', panels.join(' '));
    }
    window.addEventListener('glancechange', changed);
    window.Offline?.onChange(netChanged);
    // The tabs switch the page, before the buttons' own handlers would open or close a window.
    $('trayButtons').addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"][data-part]');
      if (!tab) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open(tab.dataset.part);
    }, true);
    // Up and down (or left and right), Home and End, move along the tabs.
    $('trayViews').addEventListener('keydown', (e) => {
      const tabs = [...$('trayViews').querySelectorAll('[role="tab"]:not([hidden])')];
      const i = tabs.findIndex((t) => t.dataset.part === active);
      const next = { ArrowUp: i - 1, ArrowLeft: i - 1, ArrowDown: i + 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null || !tabs.length) return;
      e.preventDefault();
      const tab = tabs[(next + tabs.length) % tabs.length];
      open(tab.dataset.part);
      tab.focus();
    });
    // On the home, unless a link opens something else (script.js, init). Offline, a home that
    // needs the network opens Favourites.
    active = start();
    layout();
    apply();
    if (active !== 'timings' && active !== 'glance') open(active);
    window.Steps?.mark();
    ready = true;
  }

  const label = (id) => byId[id]?.label || id;
  window.MainScreen = { IDS, CAN_HIDE, init, home, setHome, shows, here, hidden, setShown, docked, select, open, label, active: () => active, byEl: (elId) => byEl[elId]?.id };
})();
