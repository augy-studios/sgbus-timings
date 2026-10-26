// Asking for a coffee, once every six months (help desk #6): a small window with the Edge Tray's
// Buy Augy a Coffee link (its href is the one link, index.html) and Not now.
//
// Never on the first weeks: the app has to have been open on MIN_DAYS different days, the first
// of them MIN_AGE_DAYS ago. Then once every EVERY_DAYS, counted from the last ask whatever the
// answer. Never on top of anything: not on a trip, offline, with a window open, over a link that
// opened something, during the welcome or first open's choice, or with Buy Augy a Coffee turned
// off in Settings' Edge Tray buttons (that's an answer already). Shown a little after the app's
// opened, on Glance or Bus timings, not as it loads.
//
// Kept under KEY as { first, days, last }: days counted up to MIN_DAYS only. Not synced.
// Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_donate';
  const ID = 'donateModal';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const EVERY_DAYS = 182;
  const MIN_DAYS = 5;
  const MIN_AGE_DAYS = 14;
  const WAIT_MS = 20 * 1000;

  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || null; } catch { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* asked as if new next time */ }
  }

  // Today counted as a day the app was open.
  function count() {
    const v = read() || { first: Date.now(), days: [], last: 0 };
    const d = today();
    if (v.days.length < MIN_DAYS && !v.days.includes(d)) v.days.push(d);
    write(v);
    return v;
  }

  function due(v) {
    if (v.days.length < MIN_DAYS || Date.now() - v.first < MIN_AGE_DAYS * DAY_MS) return false;
    return Date.now() - (v.last || 0) >= EVERY_DAYS * DAY_MS;
  }

  function quiet() {
    const root = document.documentElement;
    try { if (localStorage.getItem('sgbus_first_run') === 'ask') return false; } catch { /* asked as usual */ }
    if (root.hasAttribute('data-net-off')) return false;
    if ((root.getAttribute('data-tray-hide') || '').split(' ').includes('coffee')) return false;
    if (window.Trip?.active()) return false;
    if (document.body.classList.contains('touring') || document.body.classList.contains('modal-open')) return false;
    if (window.LiveMap?.isOpen()) return false;
    if (document.visibilityState !== 'visible') return false;
    const on = window.MainScreen?.active();
    return on === 'glance' || on === 'timings';
  }

  function show() {
    const v = read();
    if (!v || !due(v) || !quiet()) return;
    const link = document.querySelector('[data-tray-extra="coffee"]')?.href;
    if (!link) return;
    v.last = Date.now();
    write(v);
    document.getElementById('donateGo').href = link;
    window.openModal(ID);
  }

  function init() {
    if (!document.getElementById(ID)) return;
    const v = count();
    // A link that opened something (a stop, a share) isn't the moment.
    if (!due(v) || location.hash) return;
    setTimeout(show, WAIT_MS);
    document.getElementById('donateGo').addEventListener('click', () => setTimeout(() => window.closeModal(ID), 0));
    document.getElementById('donateLater').addEventListener('click', () => window.closeModal(ID));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Donate = { due: () => !!read() && due(read()), show };
})();
