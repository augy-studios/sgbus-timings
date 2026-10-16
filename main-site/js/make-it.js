// Will I make it? Under a stop's tools, roughly how long the walk there is from where you are,
// and which buses you'd catch if you set off now; the ones that'd leave before you got there
// are greyed in the timings. The walk is the straight line with a quarter more for corners, at
// 80 m a minute, as Navigate's guesses go: an estimate, said as one.
//
// Where you are is only looked up once you've asked ("How far's my walk?"), and then each time
// a stop opens, at most a minute old. A browser and the app alike.
// Loaded before script.js and uses its helpers (current, stopsIndex, haversine, renderArrivals)
// only once the page is running. Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const KEY = 'sgbus_makeit';
  const M_PER_MIN = 80;
  const DETOUR = 1.25;
  // Nearer than this, you're at the stop; further than this, it's not a walk.
  const AT_STOP_M = 60;
  const TOO_FAR_M = 3000;
  const FRESH_MS = 60 * 1000;

  // The stop worked out last: { code, metres, at }.
  let walk = null;
  let locating = null;

  const asked = () => {
    try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
  };

  function forStop(code) {
    if (!navigator.geolocation) return hide();
    if (walk?.code === code && Date.now() - walk.at < FRESH_MS) return;
    walk = null;
    if (asked()) locate(code);
    else showAsk();
  }

  function hide() {
    $('#makeIt').hidden = true;
  }

  function showAsk() {
    $('#makeIt').innerHTML = `<button type="button" class="iconBtn" data-makeit>${ico('walk')} How far’s my walk?</button>`;
    $('#makeIt').hidden = false;
  }

  function locate(code) {
    if (locating === code) return;
    locating = code;
    navigator.geolocation.getCurrentPosition((pos) => {
      locating = null;
      try { localStorage.setItem(KEY, 'on'); } catch { /* this visit only */ }
      const stop = stopsIndex?.[code];
      if (current?.code !== code) return;
      if (stop?.lat == null) return hide();
      const metres = haversine(pos.coords.latitude, pos.coords.longitude, stop.lat, stop.lng);
      walk = { code, metres, at: Date.now() };
      if (lastArrivals) renderArrivals();
      else render(code, []);
    }, () => {
      locating = null;
      hide();
    }, { maximumAge: FRESH_MS, timeout: 10000, enableHighAccuracy: false });
  }

  // How long the walk to `code` is, in ms, or null if it isn't known or isn't a walk.
  function walkMs(code) {
    if (walk?.code !== code || walk.metres == null || walk.metres < AT_STOP_M || walk.metres > TOO_FAR_M) return null;
    return Math.ceil((walk.metres * DETOUR) / M_PER_MIN) * 60000;
  }

  const tooSoon = (code, etaMs) => {
    const w = walkMs(code);
    return w != null && etaMs != null && etaMs < w;
  };

  // After the timings are drawn (script.js renderArrivals): the line under the tools.
  function render(code, services) {
    if (walk?.code !== code) return;
    const box = $('#makeIt');
    if (walk.metres == null) return hide();
    if (walk.metres < AT_STOP_M) {
      box.textContent = 'You’re at the stop.';
      box.hidden = false;
      return;
    }
    if (walk.metres > TOO_FAR_M) {
      box.textContent = `You’re ${(walk.metres / 1000).toFixed(1)} km away: try Navigate to get here.`;
      box.hidden = false;
      return;
    }
    const w = walkMs(code);
    const mins = w / 60000;
    // Each bus's first one you'd make, soonest first.
    const catchable = services.map((s) => {
      const bus = [s.next, s.next2, s.next3].find((b) => b?.eta_ms != null && b.eta_ms >= w);
      return bus ? { no: s.serviceNo, min: Math.round(bus.eta_ms / 60000) } : null;
    }).filter(Boolean).sort((a, b) => a.min - b.min).slice(0, 3);
    const list = catchable.map((c) => `the <strong>${esc(c.no)}</strong> in ${c.min} min`);
    box.innerHTML = `${ico('walk')} About a ${mins} min walk from you. ` + (list.length
      ? `Leave now for ${list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list.at(-1)}` : list[0]}.`
      : 'Every bus due now would leave before you got there.');
    box.hidden = false;
  }

  function init() {
    $('#makeIt').addEventListener('click', (e) => {
      if (e.target.closest('[data-makeit]') && current) {
        $('#makeIt').textContent = 'Finding where you are…';
        locate(current.code);
      }
    });
  }

  window.MakeIt = { forStop, tooSoon, render };
  init();
})();
