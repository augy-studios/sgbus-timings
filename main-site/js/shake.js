// Shake to refresh: a firm shake of the phone refreshes the stop's timings on screen, for a
// hand that's holding on to a pole. On in the app and on phones' browsers that tell the page
// how the phone moves (Android's do without asking; iPhones would need a prompt, so not
// there). Off in Settings.
//
// A shake is several sharp swings back and forth within a second: the push of a bus pulling
// away or braking is one way at a time, and its bumps are far softer.
// Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_shake';
  // m/s², gravity aside: a deliberate shake goes well past this, a bus ride doesn't.
  const HARD = 14;
  const SWINGS = 4;
  const WITHIN_MS = 1000;
  const REST_MS = 4000;

  const $ = (sel) => document.querySelector(sel);

  const supported = () => 'DeviceMotionEvent' in window
    && typeof DeviceMotionEvent.requestPermission !== 'function'
    && matchMedia('(pointer: coarse)').matches;

  const enabled = () => {
    try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
  };

  let swings = [];
  let lastSign = 0;
  let restUntil = 0;

  function onMotion(e) {
    const a = e.acceleration;
    if (!a || a.x == null) return;
    // The axis it's swinging along most.
    const axis = [a.x, a.y, a.z].reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
    if (Math.abs(axis) < HARD) return;
    const sign = Math.sign(axis);
    if (sign === lastSign) return;
    lastSign = sign;
    const now = Date.now();
    swings = swings.filter((t) => now - t < WITHIN_MS);
    swings.push(now);
    if (swings.length >= SWINGS && now > restUntil) {
      swings = [];
      restUntil = now + REST_MS;
      shaken();
    }
  }

  function shaken() {
    if (!enabled() || document.visibilityState !== 'visible') return;
    // The timings on screen, with nothing open over them.
    if ($('#resultCard').hidden || document.body.classList.contains('modal-open')) return;
    if (typeof refreshStop !== 'function') return;
    navigator.vibrate?.(30);
    refreshStop();
  }

  function syncSetting() {
    document.querySelectorAll('[data-shake]').forEach((btn) => {
      const on = (btn.dataset.shake === 'on') === enabled();
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function init() {
    if (!supported()) return;
    $('#shakeSetting').hidden = false;
    syncSetting();
    document.querySelectorAll('[data-shake]').forEach((btn) => btn.addEventListener('click', () => {
      try { localStorage.setItem(KEY, btn.dataset.shake === 'on' ? 'on' : 'off'); } catch { /* this visit only */ }
      syncSetting();
    }));
    window.addEventListener('devicemotion', onMotion);
  }

  init();
})();
