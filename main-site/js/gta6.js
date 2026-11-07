// GTA VI's colours (Augy, 7 November 2026), for the game's release on 19 November: a brand colour
// (js/theme.js, style.css) anyone can set until UNTIL, midnight going into 26 November in
// Singapore. Set once by then, it's theirs for good, whatever they change to afterwards. After
// that it's locked until the uwuCoins wheel's egg slice gives it (js/coins.js), which it does
// before any more eggs, and until it does the slice stays a prize once the eggs are all found.
//
// A window offers it once, the first time the app opens with this in it: never over anything else
// (first open's choice, the welcome, a window, a trip, the live map), so it's tried every TRY_MS
// until it's quiet. Not once it's theirs, nor after UNTIL.
//
// Kept under KEY as { at, how: "set" or "wheel" }, and OFFER_KEY once offered: this device's, not
// synced, as the coins and eggs aren't. Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_gta6';
  const OFFER_KEY = 'sgbus_gta6_offer';
  const ID = 'gta6Modal';
  const THEME = 'gta-6';
  const UNTIL = Date.UTC(2026, 10, 25, 16);
  const WAIT_MS = 2500;
  const TRY_MS = 3000;

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } };

  const owned = () => !!get(KEY);
  const open = () => Date.now() < UNTIL;
  const canPick = () => owned() || open();
  // The wheel's to give.
  const due = () => !canPick();

  function claim(how) {
    if (owned()) return;
    put(KEY, JSON.stringify({ at: Date.now(), how }));
    window.dispatchEvent(new CustomEvent('gta6:change'));
  }

  // Set from the theme picker or this window: true if it may be, and kept if that's what does it.
  function pick() {
    if (owned()) return true;
    if (!open()) return false;
    claim('set');
    return true;
  }

  // ---------- offered once ----------

  const offerDue = () => open() && !owned() && !get(OFFER_KEY);

  function quiet() {
    if (get('sgbus_first_run') === 'ask') return false;
    if (window.Trip?.active() || window.LiveMap?.isOpen()) return false;
    if (document.body.classList.contains('touring') || document.body.classList.contains('modal-open')) return false;
    return document.visibilityState === 'visible';
  }

  // Your colours stand over a brand colour, so setting this takes them away, and says so.
  const hasYours = () => { try { return !!JSON.parse(get('sgbus_colours') || 'null'); } catch { return false; } };

  function offer() {
    if (!quiet()) return false;
    put(OFFER_KEY, String(Date.now()));
    document.getElementById('gta6Replace').hidden = !hasYours();
    window.openModal(ID);
    return true;
  }

  function set() {
    if (hasYours()) window.Colours?.clear();
    window.applyColorTheme(THEME);
    window.refreshThemeModal?.();
    window.closeModal(ID);
  }

  function init() {
    if (!document.getElementById(ID)) return;
    document.getElementById('gta6Set').addEventListener('click', set);
    document.getElementById('gta6Later').addEventListener('click', () => window.closeModal(ID));
    if (!offerDue()) return;
    setTimeout(() => {
      if (!offerDue() || offer()) return;
      const timer = setInterval(() => {
        if (!offerDue() || offer()) clearInterval(timer);
      }, TRY_MS);
    }, WAIT_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Gta6 = { THEME, owned, open, canPick, due, claim, pick };
})();
