// The event colours: brand colours (js/theme.js, style.css) anyone can set until an event's UNTIL.
// Set once by then, they're theirs for good, whatever they change to afterwards. After that
// they're locked until the uwuCoins wheel's egg slice gives them (js/coins.js), which it does
// before any more eggs, one event at a time in EVENTS' order, and until it does the slice stays a
// prize once the eggs are all found.
//
//   GTA VI's (Augy, 7 November 2026), for the game's release on 19 November: open until midnight
//   going into 15 December in Singapore, as Discord's Vice City Makeover, from 17 November.
//   The IKEA shuttle's (Augy, 27 November 2026), in IKEA's blue and yellow, to see off the free
//   shuttle to IKEA Tampines, which runs for the last time on 31 December: open until midnight
//   going into 1 January 2027.
//
// A window offers each once, the first time the app opens with it in it: never over anything else
// (first open's choice, the welcome, a window, a trip, the live map), so it's tried every TRY_MS
// until it's quiet, and only one a visit. Not once it's theirs, nor after UNTIL.
//
// Each kept under its key as { at, how: "set", "wheel" or "egglink" }, and its offer key once
// offered: this device's, not synced, as the coins and eggs aren't. Each says <id>:change, and
// eventcolours:change, when it becomes theirs. Plain script: exports go on window. In step with
// flutter/lib/data/gta6.dart.
(function () {
  const WAIT_MS = 2500;
  const TRY_MS = 3000;

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } };
  const $ = (id) => document.getElementById(id);

  // One window a visit, if two events are both still to offer.
  let offeredNow = false;

  function quiet() {
    if (get('sgbus_first_run') === 'ask') return false;
    if (window.Trip?.active() || window.LiveMap?.isOpen()) return false;
    if (document.body.classList.contains('touring') || document.body.classList.contains('modal-open')) return false;
    return document.visibilityState === 'visible';
  }

  // Your colours stand over a brand colour, so setting one takes them away, and says so.
  const hasYours = () => { try { return !!JSON.parse(get('sgbus_colours') || 'null'); } catch { return false; } };

  // An event's colours. Its window's ids start with `id` (#<id>Modal, #<id>Set, ...).
  function eventColours({ id, theme, until }) {
    const key = `sgbus_${id}`;
    const offerKey = `sgbus_${id}_offer`;
    const modal = `${id}Modal`;

    const owned = () => !!get(key);
    const open = () => Date.now() < until;
    const canPick = () => owned() || open();
    // The wheel's to give.
    const due = () => !canPick();

    function claim(how) {
      if (owned()) return;
      put(key, JSON.stringify({ at: Date.now(), how }));
      window.dispatchEvent(new CustomEvent(`${id}:change`));
      window.dispatchEvent(new CustomEvent('eventcolours:change'));
    }

    // Set from the theme picker or its window: true if it may be, and kept if that's what does it.
    function pick() {
      if (owned()) return true;
      if (!open()) return false;
      claim('set');
      return true;
    }

    const offerDue = () => open() && !owned() && !get(offerKey) && !offeredNow;

    function offer() {
      if (!quiet()) return false;
      offeredNow = true;
      put(offerKey, String(Date.now()));
      $(`${id}Replace`).hidden = !hasYours();
      window.openModal(modal);
      return true;
    }

    function set() {
      if (hasYours()) window.Colours?.clear();
      window.applyColorTheme(theme);
      window.refreshThemeModal?.();
      window.closeModal(modal);
    }

    function init() {
      if (!$(modal)) return;
      $(`${id}Set`).addEventListener('click', set);
      $(`${id}Later`).addEventListener('click', () => window.closeModal(modal));
      if (!offerDue()) return;
      setTimeout(() => {
        if (!offerDue() || offer()) return;
        const timer = setInterval(() => {
          if (!offerDue() || offer()) clearInterval(timer);
        }, TRY_MS);
      }, WAIT_MS);
    }

    return { ID: id, THEME: theme, UNTIL: until, owned, open, canPick, due, claim, pick, init };
  }

  window.Gta6 = eventColours({ id: 'gta6', theme: 'gta-6', until: Date.UTC(2026, 11, 14, 16) });
  window.Ikea = eventColours({ id: 'ikea', theme: 'ikea', until: Date.UTC(2026, 11, 31, 16) });

  // Every event's colours, counted beside the Easter eggs found. The wheel gives them in this order.
  const EVENTS = [Gta6, Ikea];
  window.EventColours = {
    list: EVENTS,
    all: EVENTS.map((e) => e.THEME),
    found: () => EVENTS.filter((e) => e.owned()).map((e) => e.THEME),
    byTheme: (theme) => EVENTS.find((e) => e.THEME === theme) || null,
    byId: (id) => EVENTS.find((e) => e.ID === id) || null,
    // The first the wheel's egg slice gives, or null.
    due: () => EVENTS.find((e) => e.due()) || null,
  };

  const init = () => EVENTS.forEach((e) => e.init());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
