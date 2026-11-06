// The channel to the Android app (android/), when the site is open in it: what the app can do
// for the page that a web page can't do for itself, such as reading the phone's calendar
// (js/calendar.js), following a trip with the screen off (js/trip.js), reading a card's value
// over NFC (js/card.js) and notifications from the server (js/alerts.js).
//
// Two kinds of app, told apart as the page loads:
//
//   2.0.0 and later  Capacitor. The site runs inside the app's own WebView, which injects
//            window.Capacitor before the page's scripts, and calls go straight to the app's
//            plugins (android/android/app/src/main/java/org/uwuapps/sgbus/*Plugin.java).
//   1.1.0 to 1.2.0  Bubblewrap, a Trusted Web Activity: the site runs in Chrome, and the app
//            sends a hello as each page loads, over Chrome's postMessage for TWAs, with a port to
//            answer on. Only the calendar, until it updates itself to 2.0.0 (js/app-update.js).
//
// In a browser, or an app from before 1.1.0, there's neither, and the page carries on as a
// website.
//
//   AppBridge.native                   true in the Capacitor app
//   AppBridge.has('calendar')          whether the app says it can
//   AppBridge.ready(ms)                resolves true once the app's answered, false after ms
//   AppBridge.request('calendar', {})  the app's answer to a request, as an object
//   AppBridge.call(plugin, method, {}) a plugin's answer (the Capacitor app only)
//   AppBridge.on(plugin, event, fn)    a plugin's events, as { remove() } (the same)
//   AppBridge.notify({...})            a notification from the app (the same; SgBusPlugin)
//   AppBridge.tellLanguage(code)       the app's own language set to the page's (2.3.1)
//
// The page's Language and the app's own (Android's per-app languages, 2.3.1, "applang") follow
// each other. Picking one in Settings tells the app (js/i18n.js, set). The app's, picked in
// Android's settings, is what the page opens in, and a change to it while the page is open is
// followed at once ("language" events); "System default" there drops the page's choice too. An
// app language not set yet, as on the first open after updating, is set to the page's choice
// if it has one.
// Plain script: exports go on window.
(function () {
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.nativePromise === 'function' && cap.getPlatform?.() === 'android');

  let port = null;
  let hello = null;
  let seq = 0;
  const pending = new Map();
  const waiting = [];

  function heard(info) {
    hello = info;
    waiting.splice(0).forEach((resolve) => resolve(true));
    window.dispatchEvent(new CustomEvent('app:ready', { detail: hello }));
  }

  // ---------- the Capacitor app ----------

  const call = (plugin, method, options = {}) =>
    native ? cap.nativePromise(plugin, method, options) : Promise.reject(new Error('Not in the app.'));

  function on(plugin, event, fn) {
    if (!native) return { remove() {} };
    return cap.addListener(plugin, event, (data, err) => {
      if (!err) fn(data);
    });
  }

  if (native) {
    document.documentElement.setAttribute('data-app', 'android');
    // The WebView has no navigator.share: Android's own share sheet stands in, so every share
    // button on the site works as it does in Chrome.
    if (!navigator.share) {
      navigator.share = (data = {}) => call('SgBus', 'share', { title: data.title || '', text: data.text || '', url: data.url || '' });
    }
    call('SgBus', 'info')
      .then((info) => heard({ type: 'hello', app: 'org.uwuapps.sgbus', ...info }))
      .catch(() => heard({ type: 'hello', features: [] }));
  }

  // ---------- the Bubblewrap app (1.1.0 to 1.2.0) ----------

  if (!native) {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.ports?.[0] || typeof e.data !== 'string') return;
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data?.type !== 'hello') return;
      port = e.ports[0];
      port.onmessage = (m) => {
        let reply;
        try {
          reply = JSON.parse(m.data);
        } catch {
          return;
        }
        const done = pending.get(reply?.id);
        if (done) {
          pending.delete(reply.id);
          done(reply);
        }
      };
      heard(data);
    });
  }

  function ready(ms = 1500) {
    if (hello) return Promise.resolve(true);
    return new Promise((resolve) => {
      waiting.push(resolve);
      setTimeout(() => resolve(false), ms);
    });
  }

  function request(type, body = {}, ms = 15000) {
    if (native) {
      if (type === 'calendar') return call('PhoneCalendar', 'events', { days: body.days });
      return Promise.resolve({ type, error: 'unknown' });
    }
    if (!port) return Promise.reject(new Error('Not in the app.'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      port.postMessage(JSON.stringify({ ...body, id, type }));
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(I18n.t("appBridge.noAnswer", "The app didn't answer. Try again.")));
      }, ms);
    });
  }

  // Asks for one of a plugin's permissions, as Android's own prompt. Once it's been refused
  // for good, Android won't prompt any more, so this opens the app's settings to turn it on
  // there instead. Resolves whether it's allowed now.
  async function allow(plugin, alias) {
    const now = await call(plugin, 'checkPermissions');
    if (now[alias] === 'granted') return true;
    if (now[alias] === 'denied') {
      await call('SgBus', 'openSettings', { what: 'app' });
      return false;
    }
    const after = await call(plugin, 'requestPermissions', { permissions: [alias] });
    return after[alias] === 'granted';
  }

  // { channel: 'alerts' | 'get_off', tag, title, body, url }: url, one of the site's pages,
  // is where tapping it opens.
  const notify = (n) => call('SgBus', 'notify', { ...n, url: n.url ? new URL(n.url, location.origin).href : undefined });

  // ---------- the app's own language (2.3.1) ----------

  const canLang = () => native && !!hello?.features?.includes('applang');
  // The page's language as the app's: a promise, or null where the app can't.
  const tellLanguage = (code) => (canLang() ? call('SgBus', 'setLanguage', { lang: code }).catch(() => null) : null);
  // The app's language (a tag, "" for the phone's) as the page's.
  function followLanguage(tag) {
    const I = window.I18n;
    if (!I) return;
    if (!tag) return I.unset();
    const code = I.match(tag);
    if (code && code !== I.lang()) I.set(code);
  }
  window.addEventListener('app:ready', () => {
    if (!canLang()) return;
    const appLang = typeof hello.lang === 'string' ? hello.lang : '';
    if (appLang) followLanguage(appLang);
    else if (window.I18n?.chosen()) tellLanguage(window.I18n.chosen());
    on('SgBus', 'language', (d) => followLanguage(typeof d?.lang === 'string' ? d.lang : ''));
  });

  window.AppBridge = {
    native,
    has: (feature) => !!hello?.features?.includes(feature),
    ready,
    request,
    call,
    on,
    allow,
    notify,
    tellLanguage,
    version: () => hello?.version || null,
  };
})();
