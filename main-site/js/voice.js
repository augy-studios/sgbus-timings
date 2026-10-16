// Search by voice: the mic in the search box. Say a stop's name, its 5-digit code or a bus,
// and it's searched as if typed. In the Android app, Android's own speech screen (SgBusPlugin
// .listen), which needs no microphone permission for the app; in a browser that has speech
// recognition (Chrome's), the browser's, which asks for the mic. Elsewhere there's no mic.
// Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const inApp = () => Boolean(window.AppBridge?.native && AppBridge.has('listen'));
  const available = () => inApp() || Boolean(Recognition && !window.AppBridge?.native);

  // What was heard, as it'd be typed: "8 4 0 0 9" and "84 009" as 84009, "bus 22" as 22.
  function asTyped(text) {
    let t = String(text || '').trim().replace(/[.,!?]+$/g, '');
    t = t.replace(/\b(?:bus|buses|service|stop|code|number|no\.?)\b/gi, ' ');
    // Digits said one by one, or in groups, run together.
    t = t.replace(/\b(\d[\d\s-]{3,}\d)\b/g, (m) => {
      const joined = m.replace(/[\s-]/g, '');
      return /^\d{5,6}$/.test(joined) ? joined : m;
    });
    return t.replace(/\s+/g, ' ').trim();
  }

  function search(text) {
    const q = asTyped(text);
    if (!q) return;
    $('#q').value = q;
    $('#searchBtn').click();
  }

  async function listen() {
    const btn = $('#voiceBtn');
    if (inApp()) {
      try {
        const { text } = await AppBridge.call('SgBus', 'listen', { prompt: 'Say a stop, its code, or a bus' });
        search(text);
      } catch { /* cancelled */ }
      return;
    }
    const r = new Recognition();
    r.lang = 'en-SG';
    r.interimResults = false;
    r.maxAlternatives = 1;
    btn.classList.add('listening');
    r.onresult = (e) => search(e.results[0]?.[0]?.transcript);
    r.onend = () => btn.classList.remove('listening');
    r.onerror = () => btn.classList.remove('listening');
    r.start();
  }

  function init() {
    const show = () => { $('#voiceBtn').hidden = !available(); };
    window.addEventListener('app:ready', show);
    show();
    $('#voiceBtn').addEventListener('click', listen);
  }

  init();
})();
