// The Material You look, a secret unlocked by an Easter egg (js/eggs.js), in the Android app only
// (Augy, 2 November 2026): the whole app redrawn the way Android's own apps are. The phone's own
// font, solid tonal cards in place of the glass, Material 3's rounder shapes, pill buttons,
// windows as bottom sheets on a phone, and a ripple where a button's tapped. The colours are
// whichever are on (the brand colour, Your colours or Your phone's colours, js/colours.js), so it
// goes with any of them; style.css has the look, under :root[data-look="material"].
//
// Kept under LOOK_KEY as "material", and drawn as data-look="material" on <html>, which
// index.html's head sets again before first paint (with the unlock and the app, as here). Turned
// on and off in the Theme window, under Your phone's colours.
//
// Window.Material = { on(), use(), stop(), can() }. Plain script: exports go on window.
(function () {
  const LOOK_KEY = 'sgbus_look'; // index.html's head
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };

  const can = () => !!window.AppBridge?.native;
  const unlocked = () => !!window.Eggs?.has('material');
  const on = () => get(LOOK_KEY) === 'material' && can() && unlocked();

  function apply() {
    if (on()) root.setAttribute('data-look', 'material');
    else root.removeAttribute('data-look');
    render();
  }

  function use() { put(LOOK_KEY, 'material'); apply(); }
  function stop() { put(LOOK_KEY, null); apply(); }

  function render() {
    const box = $('materialLook');
    if (!box) return;
    box.hidden = !(unlocked() && can());
    if (box.hidden) return;
    const now = on();
    $('materialOn').hidden = now;
    $('materialOff').hidden = !now;
  }

  // ---------- the ripple ----------

  // Spreads from where the finger came down, inside the button's own shape: a layer the size of
  // the button, cut to its corners, holds it, so the button itself needn't clip anything (the
  // favourites badge and the small buttons' wider tap edge sit outside it).
  const RIPPLED = '.btn, .iconBtn, .icon-btn, .glass-btn, .tray-tab, .chip, .tab, .mode-btn, .swatch, .shareMenuItem, .colourPreset, .viewRouteBtn, .glanceChip';
  const still = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function ripple(e) {
    if (!root.hasAttribute('data-look') || still?.matches) return;
    const el = e.target.closest?.(RIPPLED);
    if (!el || el.disabled) return;
    const box = el.getBoundingClientRect();
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const layer = document.createElement('span');
    layer.className = 'mdRipple';
    layer.setAttribute('aria-hidden', 'true');
    const wave = document.createElement('span');
    const size = Math.hypot(box.width, box.height) * 2;
    wave.style.width = wave.style.height = `${size}px`;
    wave.style.left = `${e.clientX - box.left - size / 2}px`;
    wave.style.top = `${e.clientY - box.top - size / 2}px`;
    layer.appendChild(wave);
    el.appendChild(layer);
    const gone = () => {
      layer.classList.add('done');
      setTimeout(() => layer.remove(), 300);
    };
    el.addEventListener('pointerup', gone, { once: true });
    el.addEventListener('pointercancel', gone, { once: true });
    el.addEventListener('pointerleave', gone, { once: true });
    // However the finger left, it's gone in the end.
    setTimeout(gone, 1200);
  }

  function init() {
    apply();
    $('materialOn')?.addEventListener('click', use);
    $('materialOff')?.addEventListener('click', stop);
    $('themeBtn')?.addEventListener('click', () => setTimeout(render, 0));
    for (const ev of ['eggs:unlocked', 'eggs:found']) window.addEventListener(ev, apply);
    document.addEventListener('pointerdown', ripple, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Material = { on, use, stop, can };
})();
