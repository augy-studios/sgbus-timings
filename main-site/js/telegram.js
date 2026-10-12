// The site as the Telegram bot's Mini App (telegram-bot/src/mini_app.py): opened from the bot's
// menu button, /start's Open web app button, or a t.me/<bot>?startapp= link. The head of
// index.html has already noticed it's inside Telegram (html[data-telegram]) and taken
// Telegram's launch data off the address; this loads Telegram's own script and fits the page
// to Telegram:
//
//   - tells Telegram it's ready and opens to full height
//   - Telegram's bar and background take the page's own colours, following the theme
//   - Telegram's Back button steps back through the page's history (the live map)
//   - links out of the site open in the browser, and t.me links in Telegram itself
//   - swiping down doesn't close the app while the live map is open, so the map can be panned
//
// Anywhere else this does nothing, and Telegram's script isn't even fetched.
// Plain script: exports go on window.
(function () {
  const root = document.documentElement;
  if (!root.hasAttribute('data-telegram')) return;

  const SDK = 'https://telegram.org/js/telegram-web-app.js';

  const script = document.createElement('script');
  script.src = SDK;
  script.async = true;
  script.onload = () => {
    const tg = window.Telegram?.WebApp;
    if (tg) start(tg);
  };
  document.head.appendChild(script);

  // Each of Telegram's calls is tried on its own: one an older Telegram doesn't have throws,
  // and that shouldn't stop the rest.
  const attempt = (fn) => {
    try {
      fn();
    } catch (e) {
      /* not in this version of Telegram */
    }
  };

  // A colour as #rrggbb, which is all Telegram takes. Read through a canvas, since the page's
  // colours are color-mix()es that getComputedStyle hands back in forms Telegram can't read.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function hex(color) {
    if (!ctx || !color) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (!a) return null;
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Back ----------

  // How many steps back the page's history goes since it opened here. The site mostly replaces
  // its address rather than adding to it, so only what pushes counts: the live map. Counted
  // from the start, before Telegram's script is in, as #map/ links open the map straight away.
  let webApp = null;
  let depth = 0;
  const backButton = () => webApp && attempt(() => (depth > 0 ? webApp.BackButton.show() : webApp.BackButton.hide()));
  const push = history.pushState;
  history.pushState = function (...args) {
    depth++;
    backButton();
    return push.apply(this, args);
  };
  window.addEventListener('popstate', () => {
    depth = Math.max(0, depth - 1);
    backButton();
  });

  function start(tg) {
    webApp = tg;
    attempt(() => tg.ready());
    attempt(() => tg.expand());

    // ---------- colours ----------

    let lastColour = null;
    function paint() {
      const colour = hex(getComputedStyle(document.body).backgroundColor);
      if (!colour || colour === lastColour) return;
      lastColour = colour;
      attempt(() => tg.setHeaderColor(colour));
      attempt(() => tg.setBackgroundColor(colour));
      attempt(() => tg.setBottomBarColor(colour));
    }
    paint();
    // A theme or mode picked in Settings (js/theme.js), and the time based mode turning over:
    // the page fades to its new colour (style.css's body), so it's read once the fade is done.
    document.body.addEventListener('transitionend', (e) => {
      if (e.target === document.body && e.propertyName === 'background-color') paint();
    });

    backButton();
    attempt(() => tg.BackButton.onClick(() => history.back()));

    // ---------- links ----------

    // A link out of the site would open inside the Mini App's own view, with no way back out of
    // it but closing the app. Telegram opens it in the browser instead, and a t.me link in
    // Telegram itself (the bot, a share to a chat).
    function openOutside(href) {
      let url;
      try {
        url = new URL(href, location.href);
      } catch (e) {
        return false;
      }
      if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return false;
      try {
        if (url.hostname === 't.me') tg.openTelegramLink(url.href);
        else tg.openLink(url.href);
        return true;
      } catch (e) {
        return false;
      }
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (!a || e.defaultPrevented || a.hasAttribute('download')) return;
      if (openOutside(a.href)) e.preventDefault();
    });
    // Share's Telegram target and the like open their links with window.open.
    const open = window.open;
    window.open = function (href, ...rest) {
      if (href && openOutside(href)) return null;
      return open.call(window, href, ...rest);
    };

    // ---------- swipes ----------

    // Swiping down closes a Mini App on a phone, which on the live map is the gesture for moving
    // it. The class is the map's own (js/map.js).
    const mapOpen = () => document.body.classList.contains('map-open');
    let swipesOff = null;
    function swipes() {
      const off = mapOpen();
      if (off === swipesOff) return;
      swipesOff = off;
      attempt(() => (off ? tg.disableVerticalSwipes() : tg.enableVerticalSwipes()));
    }
    swipes();
    new MutationObserver(swipes).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
})();
