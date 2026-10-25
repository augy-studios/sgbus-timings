// The first open's choice (help desk #3): Minimal, the essentials only, or Full, everything on,
// as the app has always opened. Asked once, in a window before the welcome (js/tour.js), so the
// welcome then shows only what's on.
//
// - Minimal turns off Glance, Service alerts and Your trips (js/main-screen.js, setShown) and
//   every optional Edge Tray button (script.js, setTrayExtra): the same switches as Settings,
//   Edge Tray buttons, so Settings shows them and js/sync.js syncs them. Bus timings, Favourites,
//   Navigate and Places stay.
// - Full changes nothing. The window put away without Start (Back, a tap around it, Esc) is Full.
// - Only someone new is asked: nothing of the app's in storage as the page loads ("sgbus" keys),
//   checked here before anything writes. They're kept as "ask" under KEY until asked, and asked
//   on the first visit the welcome would show, so not over a link that opened something, nor
//   offline. Anyone who's used the app before is never asked.
// - Settings used before then (a switch, or a sync, which brings another device's in) answers
//   it: they're left as they are.
// The answer isn't synced (js/sync.js): another device has its own, if it's ever new.
// Plain script: exports go on window. Loaded early, just after js/offline.js.
(function () {
  const KEY = 'sgbus_first_run';
  const ID = 'firstRunModal';

  // "ask" until asked, "done" after. Storage that can't be read or kept asks nobody.
  let state = 'done';
  try {
    state = localStorage.getItem(KEY);
    if (!state) {
      state = Object.keys(localStorage).some((k) => k.startsWith('sgbus')) ? 'done' : 'ask';
      if (state === 'ask') localStorage.setItem(KEY, state);
    }
  } catch { state = 'done'; }

  function done() {
    state = 'done';
    try { localStorage.setItem(KEY, 'done'); } catch { /* asked again next time */ }
  }

  // Minimal: the pages that can be off, then the tray's optional buttons, all of them, the
  // Android app's included.
  function minimal() {
    for (const id of MainScreen.CAN_HIDE) MainScreen.setShown(id, false);
    document.querySelectorAll('#trayExtrasPick [data-tray-show]').forEach((btn) => window.setTrayExtra(btn.dataset.trayShow, false));
  }

  let after = null;
  let picked = null;

  // Asks, if it's to be asked, and `then` runs once it's answered: true if so, false if not.
  function ask(then) {
    if (state !== 'ask' || !document.getElementById(ID)) return false;
    after = then;
    picked = null;
    const form = document.getElementById('firstRunForm');
    form.reset();
    window.openModal(ID);
    form.querySelector('input:checked').focus({ preventScroll: true });
    return true;
  }

  // However it's put away: Start's pick, or Full.
  function closed() {
    if (state !== 'ask') return;
    if (picked === 'minimal') minimal();
    done();
    const then = after;
    after = null;
    if (then) setTimeout(then, 0);
  }

  function init() {
    const backdrop = document.getElementById(ID);
    if (!backdrop) return;
    const form = document.getElementById('firstRunForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      picked = form.elements.firstRun.value;
      window.closeModal(ID);
    });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.closeModal(ID);
    });
    backdrop.addEventListener('modalclose', closed);
    // Settings used first answers it.
    document.addEventListener('click', (e) => {
      if (state === 'ask' && e.target.closest?.('#settingsModal')) done();
    }, true);
  }

  // Its window is in index.html above the scripts, so it's there already.
  init();

  window.FirstRun = { ask };
})();
