// Report a bug (help desk #13), from Settings' Help and extras: a small form for what went
// wrong, and a way to be reached if they'd like an answer, sent to Augy on Telegram by
// api/bug-report.js.
//
// The form adds what helps find the bug, and says so under the box before it's sent: which app
// and its version (the site's from sw.js; the Android or desktop app's own too), the device as
// the browser describes it, the page on show (a stop's or a bus's code if one's open, never a
// place or where you are) and the language. Nothing else goes.
//
// What's typed stays while the app's open, closed or not, until it's sent. Offline it waits for
// the connection. If the site can't send it (not set up, or Telegram's down), it offers email
// instead, with the same words filled in.
//
// Window.BugReport = { open() }. Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const ID = 'bugModal';
  const EMAIL = 'augy@augystudios.com';
  const MIN_TEXT = 5;
  const VERSION_MS = 1500;

  let siteVersion = null;
  let details = null;
  let sending = false;

  // The site's version, from the service worker serving it ("v127"), or null without one.
  function askVersion() {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) return Promise.resolve(null);
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), VERSION_MS);
      channel.port1.onmessage = ({ data }) => { clearTimeout(timer); resolve(typeof data === 'string' ? data : null); };
      sw.postMessage({ type: 'version' }, [channel.port2]);
    });
  }

  // Which app this is: the Android app, the desktop app, the Telegram Mini App, the site
  // installed, or the site in a browser.
  function platform() {
    if (window.AppBridge?.native) return 'android';
    if (window.sgbusDesktop) return 'desktop';
    if (document.documentElement.hasAttribute('data-telegram')) return 'telegram';
    if (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone) return 'pwa';
    return 'web';
  }
  const PLATFORM_NAMES = { web: 'Web', pwa: 'Web, installed', android: 'Android app', desktop: 'Desktop app', telegram: 'Telegram Mini App' };

  // "2.2.7, site v127": the app's own version where it has one, then the site's.
  function version() {
    const app = window.AppBridge?.version?.() || window.sgbusDesktop?.version || '';
    const site = siteVersion ? `site ${siteVersion}` : '';
    return [app, site].filter(Boolean).join(', ');
  }

  // The system and browser, and the window's size: "Android 14 · Chrome 130 · 412×915".
  // Each [pattern, name], the first that matches; a number caught is the version.
  const SYSTEMS = [[/Android ([\d.]+)/, 'Android'], [/(?:iPhone|iPad|iPod).*? OS (\d+)/, 'iOS'], [/Windows NT/, 'Windows'],
    [/CrOS/, 'ChromeOS'], [/Mac OS X/, 'macOS'], [/Linux/, 'Linux']];
  const BROWSERS = [[/SamsungBrowser\/(\d+)/, 'Samsung Internet'], [/Edg\/(\d+)/, 'Edge'], [/Firefox\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'], [/Version\/(\d+).*Safari/, 'Safari']];
  function first(list, ua, none) {
    for (const [re, name] of list) {
      const m = re.exec(ua);
      if (m) return m[1] ? `${name} ${m[1]}` : name;
    }
    return none;
  }
  function device() {
    const ua = navigator.userAgent || '';
    return `${first(SYSTEMS, ua, 'Unknown system')} · ${first(BROWSERS, ua, 'Unknown browser')} · ${window.innerWidth}×${window.innerHeight}`;
  }

  // The page on show, and a stop or bus if one's open: never Navigate's places or a share link.
  function page() {
    if (window.LiveMap?.isOpen()) return 'Explorer or the live map';
    const id = window.MainScreen?.active() || 'glance';
    const name = window.MainScreen?.label?.(id) || id;
    const hash = decodeURIComponent(location.hash.slice(1));
    if (id === 'timings' && /^\d{5}\b/.test(hash)) return `${name}, stop ${hash.slice(0, 5)}`;
    if (/^bus\/[0-9A-Za-z]{1,4}$/.test(hash)) return `${name}, bus ${hash.slice(4)}`;
    return name;
  }

  function collect() {
    const p = platform();
    return { version: version(), platform: p, device: device(), page: page(), lang: window.I18n?.lang() || 'en', platformName: PLATFORM_NAMES[p] };
  }

  function say(text, { email = false } = {}) {
    const el = $('#bugStatus');
    el.hidden = !text;
    el.textContent = text || '';
    if (email) {
      const body = `${$('#bugText').value.trim()}\n\n${detailsText()}`;
      const a = document.createElement('a');
      a.href = `mailto:${EMAIL}?subject=${encodeURIComponent('SG Bus Timings bug report')}&body=${encodeURIComponent(body)}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = I18n.t('bug.email_it_instead', 'Email it instead.');
      el.append(' ', a);
    }
  }

  const detailsText = () => [details.platformName, details.version, details.device, details.page].filter(Boolean).join(' · ');

  function renderDetails() {
    $('#bugDetails').textContent = `${detailsText()}.`;
  }

  async function open() {
    details = collect();
    renderDetails();
    say('');
    window.openModal(ID);
    setTimeout(() => $('#bugText').focus(), 50);
    // The site's version arrives a moment later, the first time.
    if (!siteVersion) {
      siteVersion = await askVersion();
      if (siteVersion && details) { details.version = version(); renderDetails(); }
    }
  }

  async function send(e) {
    e.preventDefault();
    if (sending) return;
    const text = $('#bugText').value.trim();
    if (text.length < MIN_TEXT) {
      say(I18n.t('bug.say_what_went_wrong', 'Please say what went wrong first.'));
      $('#bugText').focus();
      return;
    }
    if (window.Offline?.on() || navigator.onLine === false) {
      say(I18n.t('bug.offline', "You're offline. It's kept here: send it once you're back online."));
      return;
    }
    sending = true;
    $('#bugSend').disabled = true;
    say(I18n.t('bug.sending', 'Sending…'));
    try {
      const { platformName, ...sent } = details;
      const r = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sent, text, contact: $('#bugContact').value.trim(), website: $('#bugWebsite').value }),
      });
      if (r.ok) {
        $('#bugText').value = '';
        $('#bugContact').value = '';
        say(I18n.t('bug.sent', 'Sent. Thank you! Augy will look into it.'));
        return;
      }
      const err = await r.json().then((d) => d?.error).catch(() => null);
      // Something about what was typed, or too many at once: said as it is. Otherwise, email.
      if (r.status === 400 || r.status === 413 || r.status === 429) say(err || I18n.t('bug.couldnt_send', "Couldn't send it right now."));
      else say(r.status === 503 ? I18n.t('bug.not_set_up', "Bug reports can't be sent from the app yet.") : I18n.t('bug.couldnt_send', "Couldn't send it right now."), { email: true });
    } catch {
      say(I18n.t('bug.couldnt_send', "Couldn't send it right now."), { email: true });
    } finally {
      sending = false;
      $('#bugSend').disabled = false;
    }
  }

  function init() {
    if (!document.getElementById(ID)) return;
    $('#bugForm').addEventListener('submit', send);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.BugReport = { open };
})();
