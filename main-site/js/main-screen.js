// The app's pages: Glance (the next bus and your stops' buses, js/glance.js), Bus timings (the
// search and a stop's timings), Favourites, Navigate (its two tabs, Bus and train and Bus only,
// inside it), Service alerts, Your trips and Places are each a page of its own, switched by tabs
// at the top of the Edge Tray (docs/edge-tray-spec.md, 6.2: the one on show in the brand fill).
// Settings' Custom home is the page the app opens on, and its tab comes first: Glance unless
// it's set otherwise, or turned off, which takes its tab away too. The small things (Settings,
// the theme, the weather, a bus's route, a list of stops) still open as windows over the page.
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
  // on the tab used last.
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

  // Glance's page, unless Settings has the glance off (js/glance.js).
  const glanceOn = () => window.Glance?.enabled() ?? true;
  const shows = (id) => id !== 'glance' || glanceOn();

  function home() {
    let v = null;
    try { v = localStorage.getItem(HOME_KEY); } catch { /* Glance */ }
    if (!IDS.includes(v)) v = 'glance';
    return shows(v) ? v : 'timings';
  }

  // Custom home: the app opens on `id`, its tab goes first, and it's on show at once.
  function setHome(id) {
    if (!IDS.includes(id)) return;
    try {
      if (id === 'glance') localStorage.removeItem(HOME_KEY);
      else localStorage.setItem(HOME_KEY, id);
    } catch { /* this visit only */ }
    layout();
    open(id);
    window.dispatchEvent(new Event('mainscreenchange'));
  }

  const docked = (elId) => !!byEl[elId];

  // Shows `id`, from code that has already opened it (js/ui.js): only the page changes, to its
  // panel `el` if it has more than one. A switch of page is a step Back goes back from (js/ui.js,
  // Steps); a switch of Navigate's tab isn't.
  let ready = false;
  function select(id, el) {
    const changed = active !== id;
    active = id;
    if (el && byEl[el]?.id === id) shown[id] = el;
    opened.add(id);
    apply();
    if (!changed) return;
    if (ready) window.Steps?.step({});
    window.dispatchEvent(new Event('viewchange'));
  }

  // Shows `id` from its tab, filling it in as its own button would.
  function open(id) {
    const part = byId[id];
    if (!part) return false;
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

  // The tabs at the top of the tray, the home's first, and Glance's only while it's on.
  function layout() {
    const views = $('trayViews');
    const first = home();
    for (const id of [first, ...IDS.filter((n) => n !== first)]) {
      const btn = $(byId[id].btn);
      btn.hidden = !shows(id);
      views.appendChild(btn);
    }
  }

  // The glance turned on or off in Settings: its tab comes or goes, and off its page, Bus
  // timings is on show instead.
  function glanceChanged() {
    layout();
    if (active === 'glance' && !glanceOn()) open('timings');
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
      for (const id of part.els || []) $(id).classList.add('docked');
    }
    window.addEventListener('glancechange', glanceChanged);
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
    // On the home, unless a link opens something else (script.js, init).
    active = home();
    layout();
    apply();
    if (active !== 'timings' && active !== 'glance') open(active);
    window.Steps?.mark();
    ready = true;
  }

  const label = (id) => byId[id]?.label || id;
  window.MainScreen = { IDS, init, home, setHome, docked, select, open, label, active: () => active, byEl: (elId) => byEl[elId]?.id };
})();
