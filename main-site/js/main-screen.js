// The app's pages: Bus timings (the search and a stop's timings), Favourites, Navigate's two
// tabs (Bus and train, Bus only), Service alerts, Your trips and Places are each a page of its
// own, switched by tabs at the top of the Edge Tray (docs/edge-tray-spec.md, 6.2: the one on
// show in the brand fill). Settings' Custom home is the page the app opens on, and its tab
// comes first. The small things (Settings, the theme, the weather, a bus's route, a list of
// stops) still open as windows over the page.
//
// Each page's panel or modal is "docked" (style.css): drawn in the page, with no close button.
// js/ui.js asks here before showing or hiding one: showing one switches to its page, and hiding
// it is ignored, as a page can't be closed. So whatever opened a part before, such as a saved
// stop in Favourites opening its timings, or a place opening the way there, now goes to its page.
(function () {
  // The home, as Opens on kept it before it was Custom home: no value or "stop" for Bus timings.
  const HOME_KEY = 'sgbus_start';

  // In the tray's order, after the home. `el` is the panel or modal the page draws in (Bus
  // timings is the page's own search and results); `btn` its Edge Tray button. On its tab,
  // `show` runs every time and `first` only the first time, so Navigate keeps what was being
  // planned.
  const PARTS = [
    { id: 'timings', label: 'Bus timings', btn: 'timingsBtn' },
    { id: 'favs', label: 'Favourites', btn: 'favsBtn', el: 'favsModal', modal: true, show: () => renderFavs() },
    { id: 'nav', label: 'Bus and train', btn: 'navBtn', el: 'navSection', first: () => openNav() },
    { id: 'routes', label: 'Bus only', btn: 'routesBtn', el: 'plannerSection', first: () => openPlanner() },
    { id: 'alerts', label: 'Service alerts', btn: 'alertsBtn', el: 'alertsSection', show: () => Alerts.open() },
    { id: 'trips', label: 'Your trips', btn: 'tripsBtn', el: 'tripsSection', show: () => TripHistory.open() },
    { id: 'places', label: 'Places', btn: 'placesBtn', el: 'placesSection', show: () => Places.open() },
  ];
  const IDS = PARTS.map((p) => p.id);
  const byId = Object.fromEntries(PARTS.map((p) => [p.id, p]));
  const byEl = Object.fromEntries(PARTS.filter((p) => p.el).map((p) => [p.el, p]));

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  let active = 'timings';
  const opened = new Set();

  function home() {
    let v = null;
    try { v = localStorage.getItem(HOME_KEY); } catch { /* Bus timings */ }
    return IDS.includes(v) ? v : 'timings';
  }

  // Custom home: the app opens on `id`, its tab goes first, and it's on show at once.
  function setHome(id) {
    if (!IDS.includes(id)) return;
    try {
      if (id === 'timings') localStorage.removeItem(HOME_KEY);
      else localStorage.setItem(HOME_KEY, id);
    } catch { /* this visit only */ }
    layout();
    open(id);
    window.dispatchEvent(new Event('mainscreenchange'));
  }

  const docked = (elId) => !!byEl[elId];

  // Shows `id`, from code that has already opened it (js/ui.js): only the page changes. A
  // switch is a step Back goes back from (js/ui.js, Steps).
  let ready = false;
  function select(id) {
    const changed = active !== id;
    active = id;
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
      if (part.el) {
        const el = $(part.el);
        const hide = part.id !== active;
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

  // The tabs at the top of the tray, the home's first.
  function layout() {
    const views = $('trayViews');
    const first = home();
    for (const id of [first, ...IDS.filter((n) => n !== first)]) views.appendChild($(byId[id].btn));
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
      if (part.el) $(part.el).classList.add('docked');
    }
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
      const tabs = [...$('trayViews').querySelectorAll('[role="tab"]')];
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
    if (active !== 'timings') open(active);
    window.Steps?.mark();
    ready = true;
  }

  const label = (id) => byId[id]?.label || id;
  window.MainScreen = { IDS, init, home, setHome, docked, select, open, label, active: () => active, byEl: (elId) => byEl[elId]?.id };
})();
