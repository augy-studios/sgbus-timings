// High contrast and Your colours, in the Theme window (help desk #6).
//
// High contrast: Phone's setting (the default, following prefers-contrast: more), On or Off,
// kept under CONTRAST_KEY and drawn as data-contrast="more" on <html> (style.css), which
// index.html's head sets again before first paint.
//
// Your colours: a secret, unlocked by riding every MRT and LRT line (js/rides.js, which says
// when). Then the Theme window has a colour for the background, the text, the buttons and the
// cards, put in place on <html> as the style.css tokens they stand for (paint), and kept under
// COLOURS_KEY, which index.html's head puts in place again before first paint. Text has to be
// readable: against the background and the cards, at least AA's 4.5:1, or they can't be used,
// and the buttons' text is black or white, whichever reads better on them. Back to the usual
// colours takes them away.
//
// Unlocked, the celebration says so once (js/celebrate.js), or a plain window where it can't
// run, with a button to the Theme window; Your colours has Watch the celebration again.
//
// Window.Colours = { paint(c), contrast(a, b), open() }. Plain script: exports go on window.
(function () {
  const CONTRAST_KEY = 'sgbus_contrast';
  const COLOURS_KEY = 'sgbus_colours';
  const TOLD_KEY = 'sgbus_colours_told';
  const AA = 4.5;
  const DARK_TEXT = '#121815';
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const T = (k, en, v) => I18n.t(k, en, v);

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };

  // ---------- contrast ----------

  function rgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  const onColour = (bg) => (contrast(DARK_TEXT, bg) >= contrast('#ffffff', bg) ? DARK_TEXT : '#ffffff');
  const mix = (a, b, share) => {
    const [x, y] = [rgb(a), rgb(b)];
    return `#${x.map((v, i) => Math.round(v * share + y[i] * (1 - share)).toString(16).padStart(2, '0')).join('')}`;
  };

  // ---------- high contrast ----------

  const prefers = window.matchMedia ? window.matchMedia('(prefers-contrast: more)') : null;
  function contrastChoice() {
    const v = get(CONTRAST_KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  }
  function applyContrast() {
    const v = contrastChoice();
    const on = v === 'on' || (v === 'auto' && !!prefers?.matches);
    if (on) root.setAttribute('data-contrast', 'more');
    else root.removeAttribute('data-contrast');
    document.querySelectorAll('#contrastPick [data-contrast-pick]').forEach((btn) => {
      const pressed = btn.dataset.contrastPick === v;
      btn.classList.toggle('active', pressed);
      btn.setAttribute('aria-pressed', String(pressed));
    });
  }

  // ---------- your colours ----------

  const DEFAULTS = { bg: '#eef2f0', text: '#121815', button: '#ccffcc', card: '#ffffff' };

  function saved() {
    try {
      const v = JSON.parse(get(COLOURS_KEY) || 'null');
      return v && ['bg', 'text', 'button', 'card'].every((k) => /^#[0-9a-f]{6}$/i.test(v[k])) ? v : null;
    } catch { return null; }
  }

  // Whether `c` is readable: the problems, in words, or none.
  function problems(c) {
    const out = [];
    const bg = contrast(c.text, c.bg);
    const card = contrast(c.text, c.card);
    const btn = contrast(onColour(c.button), c.button);
    if (bg < AA) out.push(T('colours.lowBg', 'The text on the background is {r}:1; it needs 4.5:1 to read easily.', { r: bg.toFixed(1) }));
    if (card < AA) out.push(T('colours.lowCard', 'The text on the cards is {r}:1; it needs 4.5:1 to read easily.', { r: card.toFixed(1) }));
    if (btn < AA) out.push(T('colours.lowButton', 'The buttons’ text is {r}:1 on that colour; it needs 4.5:1.', { r: btn.toFixed(1) }));
    return out;
  }

  // The tokens style.css draws with, from the four colours; null puts the usual back.
  const TOKENS = ['--bg', '--ink', '--brand', '--brand-rgb', '--surface', '--surface-strong', '--surface-border', '--muted', '--muted-strong', '--on-brand', '--brand-ink'];
  function paint(c) {
    for (const t of TOKENS) root.style.removeProperty(t);
    root.toggleAttribute('data-custom-colours', !!c);
    if (!c) {
      // The brand colour back as the theme has it (js/theme.js).
      window.applyColorTheme?.(window.getStoredColorTheme?.());
      return;
    }
    const set = (k, v) => root.style.setProperty(k, v);
    set('--bg', c.bg);
    set('--ink', c.text);
    set('--brand', c.button);
    set('--brand-rgb', rgb(c.button).join(', '));
    set('--surface', c.card);
    set('--surface-strong', c.card);
    set('--surface-border', mix(c.text, c.card, 0.25));
    set('--muted', contrast(mix(c.text, c.card, 0.75), c.card) >= AA ? mix(c.text, c.card, 0.75) : c.text);
    set('--muted-strong', contrast(mix(c.text, c.card, 0.85), c.card) >= AA ? mix(c.text, c.card, 0.85) : c.text);
    set('--on-brand', onColour(c.button));
    set('--brand-ink', c.text);
  }

  let draft = null;
  function renderColours() {
    const box = $('customColours');
    if (!box) return;
    box.hidden = !window.RideCheck?.unlocked();
    if (box.hidden) return;
    draft ??= { ...(saved() || DEFAULTS) };
    for (const k of Object.keys(DEFAULTS)) {
      const input = box.querySelector(`[data-colour="${k}"]`);
      if (input && input.value !== draft[k]) input.value = draft[k];
    }
    const prev = $('colourPreview');
    prev.style.background = draft.bg;
    prev.style.color = draft.text;
    const card = prev.querySelector('.colourCard');
    card.style.background = draft.card;
    card.style.color = draft.text;
    const btn = prev.querySelector('.colourButton');
    btn.style.background = draft.button;
    btn.style.color = onColour(draft.button);
    const bad = problems(draft);
    $('colourWarn').hidden = !bad.length;
    $('colourWarn').textContent = bad.join(' ');
    $('colourKeep').disabled = bad.length > 0;
    $('colourReset').hidden = !saved();
  }

  // ---------- unlocked ----------

  function told() {
    if (get(TOLD_KEY) || !document.getElementById('unlockModal')) return;
    put(TOLD_KEY, String(Date.now()));
    // The 3D celebration (js/celebrate.js), or the plain window where it can't run.
    if (window.Celebrate) window.Celebrate.start();
    else window.openModal('unlockModal');
  }

  function open() {
    window.openModal('themeModal');
    setTimeout(() => $('customColours')?.scrollIntoView({ block: 'nearest' }), 100);
  }

  function init() {
    applyContrast();
    prefers?.addEventListener?.('change', applyContrast);
    $('contrastPick')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-contrast-pick]');
      if (!btn) return;
      put(CONTRAST_KEY, btn.dataset.contrastPick === 'auto' ? null : btn.dataset.contrastPick);
      applyContrast();
    });

    const c = saved();
    if (c) paint(c);
    const box = $('customColours');
    box?.addEventListener('input', (e) => {
      const k = e.target.dataset?.colour;
      if (!k) return;
      draft[k] = e.target.value;
      renderColours();
    });
    $('colourKeep')?.addEventListener('click', () => {
      if (!draft || problems(draft).length) return;
      put(COLOURS_KEY, JSON.stringify(draft));
      paint(draft);
      renderColours();
    });
    $('colourReset')?.addEventListener('click', () => {
      put(COLOURS_KEY, null);
      draft = { ...DEFAULTS };
      paint(null);
      renderColours();
    });
    $('themeModal')?.addEventListener('modalclose', () => { draft = null; });
    $('themeBtn')?.addEventListener('click', () => { draft = null; renderColours(); });
    $('unlockGo')?.addEventListener('click', () => {
      window.closeModal('unlockModal');
      setTimeout(open, 50);
    });
    $('unlockLater')?.addEventListener('click', () => window.closeModal('unlockModal'));
    // Watch the celebration again, from Your colours.
    $('colourReplay')?.addEventListener('click', () => {
      window.closeModal('themeModal');
      setTimeout(() => (window.Celebrate ? window.Celebrate.start() : window.openModal('unlockModal')), 80);
    });

    window.addEventListener('rides:unlocked', () => { renderColours(); told(); });
    // Unlocked on a trip followed with the app away: said the next time it's open.
    if (window.RideCheck?.unlocked()) setTimeout(told, 1500);
    renderColours();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Colours = { paint, contrast, problems, open };
})();
