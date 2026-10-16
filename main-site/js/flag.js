// The flag-down screen: a bus's number as big as the screen allows, white on black, to hold up
// at a dark stop so its captain sees which bus you want. "Flag" by a bus in a stop's timings
// opens it. The screen stays on; in the Android app it also goes to full brightness, and the
// torch can be turned on, steady (SgBusPlugin.flag). Never a strobe: flashing it at a driver
// would dazzle them.
// Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const inApp = () => Boolean(window.AppBridge?.native && AppBridge.has('flag'));

  let open = false;
  let torch = false;
  let wakeLock = null;

  function fit() {
    const el = $('#flagNo');
    const n = Math.max(2, el.textContent.length);
    el.style.fontSize = `${Math.floor(Math.min(innerWidth / (n * 0.62), innerHeight * 0.55))}px`;
  }

  async function show(service) {
    open = true;
    torch = false;
    $('#flagNo').textContent = service;
    $('#flagScreen').hidden = false;
    $('#flagTorch').hidden = true;
    $('#flagTorch').setAttribute('aria-pressed', 'false');
    document.body.classList.add('modal-open');
    fit();
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* stays on while touched */ }
    if (inApp()) {
      const r = await AppBridge.call('SgBus', 'flag', { on: true, torch: false }).catch(() => null);
      $('#flagTorch').hidden = !r?.torch;
    } else {
      if (navigator.userActivation?.isActive !== false) document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  function hide() {
    if (!open) return;
    open = false;
    $('#flagScreen').hidden = true;
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    if (inApp()) AppBridge.call('SgBus', 'flag', { on: false }).catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.classList.toggle('modal-open', !!document.querySelector('.modal-backdrop:not(.hidden), .panelModal:not([hidden])'));
  }

  async function toggleTorch() {
    torch = !torch;
    $('#flagTorch').setAttribute('aria-pressed', String(torch));
    $('#flagTorch').classList.toggle('on', torch);
    await AppBridge.call('SgBus', 'flag', { on: true, torch }).catch(() => {});
  }

  function init() {
    $('#flagClose').addEventListener('click', hide);
    $('#flagTorch').addEventListener('click', toggleTorch);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    window.addEventListener('resize', () => { if (open) fit(); });
    // Away and back: the app turned the torch off as it went, and the wake lock lapsed.
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || !open) return;
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* as before */ }
      if (inApp()) AppBridge.call('SgBus', 'flag', { on: true, torch }).catch(() => {});
    });
    // "Flag" by a bus in a stop's timings (script.js renderArrivals).
    $('#services').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-flag]');
      if (btn) show(btn.dataset.flag);
    });
  }

  window.Flag = { show, hide };
  init();
})();
