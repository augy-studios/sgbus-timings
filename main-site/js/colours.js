// High contrast, Your colours and Your phone's colours, in the Theme window (help desk #6).
//
// High contrast: Phone's setting (the default, following prefers-contrast: more), On or Off,
// kept under CONTRAST_KEY and drawn as data-contrast="more" on <html> (style.css), which
// index.html's head sets again before first paint.
//
// Your colours and Your phone's colours are secrets, each unlocked by an Easter egg (js/eggs.js).
//
// Your colours: one colour, picked on the colour wheel (js/wheel.js, the Color Guess Game's) or
// from the presets the eggs bring, and the app makes the rest from it (derive): a background and
// cards tinted with its hue, text dark or light on them, buttons in it, and the softer text and
// coloured text that go with them, for light and for dark. Every pair is held to WCAG AA's 4.5:1
// (problems): the buttons are made lighter or darker than the colour picked until their text
// reads, and the softer text darker or lighter. So no colour can be picked that doesn't read.
//
// Your phone's colours: Material You's, in the Android app on Android 12 and later
// (SgBusPlugin.phoneColours), its tonal palettes read into the same tokens (fromPhone) and held
// to the same 4.5:1 (repair). Asked again each time the app opens or comes back, so a new
// wallpaper's colours follow.
//
// Either is kept under COLOURS_KEY as { kind: "base", base, preset } or { kind: "phone" }, with
// the tokens for each mode, { light: { "--bg": ... }, dark: { ... } }, which index.html's head
// puts in place before first paint for the mode it's in. Switching light and dark repaints.
// Back to the usual colours takes them away.
//
// Window.Colours = { paint(saved), contrast(a, b), derive(base, mode), fromPhone(palettes, mode),
// problems(tokens), open(), usePhone(), phoneOn(), stopPhone() }. Plain script: exports go on window.
(function () {
  const CONTRAST_KEY = 'sgbus_contrast';
  const COLOURS_KEY = 'sgbus_colours';
  const AA = 4.5;
  const DARK_TEXT = '#121815';
  const CLASSIC = '#ccffcc';
  const MODES = ['light', 'dark'];
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const tr = (k, en, v) => I18n.t(k, en, v);

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };

  // ---------- colour maths ----------

  function rgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
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
  // `share` of a, the rest b.
  const mix = (a, b, share) => {
    const [x, y] = [rgb(a), rgb(b)];
    return toHex(...x.map((v, i) => v * share + y[i] * (1 - share)));
  };
  const onColour = (bg) => (contrast(DARK_TEXT, bg) >= contrast('#ffffff', bg) ? DARK_TEXT : '#ffffff');

  function hsl(hex) {
    const [r, g, b] = rgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  // ---------- the theme from one colour ----------

  // The button colour nearest `base` whose text, dark or light, reads on it and on the fills
  // made from it over the cards (style.css's --brand-fill, 55%, and --brand-fill-strong, 75%).
  function buttonFor(base, card) {
    const { h, s, l } = hsl(base);
    const reads = (fill, text) => [fill, mix(fill, card, 0.55), mix(fill, card, 0.75)].every((c) => contrast(text, c) >= AA);
    let best = null;
    for (const [text, step] of [[DARK_TEXT, 0.01], ['#ffffff', -0.01]]) {
      for (let L = l; L >= 0 && L <= 1; L += step) {
        const fill = fromHsl(h, s, L);
        if (reads(fill, text)) {
          if (!best || Math.abs(L - l) < best.off) best = { fill: L === l ? base : fill, text, off: Math.abs(L - l) };
          break;
        }
      }
    }
    return best || { fill: base, text: onColour(base), off: 0 };
  }

  // Text of `hue` that reads on both `bg` and `card`: darker in light, lighter in dark.
  function inkOf(hue, bg, card, mode) {
    const { h, s } = hsl(hue);
    // A grey stays grey; any other hue is given enough colour to show.
    const sat = s < 0.05 ? 0 : Math.max(0.35, Math.min(s, 0.8));
    const step = mode === 'dark' ? 0.01 : -0.01;
    for (let L = mode === 'dark' ? 0.7 : 0.42; L >= 0 && L <= 1; L += step) {
      const c = fromHsl(h, sat, L);
      if (contrast(c, bg) >= AA && contrast(c, card) >= AA) return c;
    }
    return mode === 'dark' ? '#ffffff' : '#000000';
  }

  // Softer text: as little of the text colour mixed into the cards as still reads on them and
  // on the background.
  function softer(ink, bg, card, from = 0.55) {
    for (let share = from; share < 1; share += 0.05) {
      const c = mix(ink, card, share);
      if (contrast(c, card) >= AA && contrast(c, bg) >= AA) return c;
    }
    return ink;
  }

  function tokens({ bg, card, ink, brand, onBrand, brandInk, muted, mutedStrong, border }) {
    return {
      '--bg': bg,
      '--surface': card,
      '--surface-strong': card,
      '--surface-border': border,
      '--ink': ink,
      '--muted': muted,
      '--muted-strong': mutedStrong,
      '--brand': brand,
      '--brand-rgb': rgb(brand).join(', '),
      '--on-brand': onBrand,
      '--brand-ink': brandInk,
    };
  }

  // The whole theme from one colour, for `mode`.
  function derive(base, mode) {
    const { h, s } = hsl(base);
    const dark = mode === 'dark';
    const bg = dark ? fromHsl(h, Math.min(s, 0.25), 0.07) : fromHsl(h, Math.min(s, 0.3), 0.94);
    const card = dark ? fromHsl(h, Math.min(s, 0.2), 0.13) : fromHsl(h, Math.min(s, 0.4), 0.985);
    const ink = dark ? fromHsl(h, Math.min(s, 0.15), 0.94) : fromHsl(h, Math.min(s, 0.25), 0.1);
    const button = buttonFor(base, card);
    const muted = softer(ink, bg, card);
    return tokens({
      bg, card, ink, muted,
      mutedStrong: softer(ink, bg, card, 0.7),
      border: mix(ink, card, 0.18),
      brand: button.fill,
      onBrand: button.text,
      brandInk: inkOf(base, bg, card, mode),
    });
  }

  // Material You's tonal palettes (SgBusPlugin.phoneColours) as the theme, for `mode`: the
  // background and cards from the neutral palette, the buttons from the accent's container tone,
  // as Android's own apps have them.
  function fromPhone(p, mode) {
    const tone = (palette, t, fallback) => (/^#[0-9a-f]{6}$/i.test(p?.[palette]?.[t] || '') ? p[palette][t] : fallback);
    const dark = mode === 'dark';
    const accent = tone('accent1', '500', CLASSIC);
    const bg = dark ? tone('neutral1', '900', '#1b1b1f') : tone('neutral1', '50', '#f1f0f4');
    const card = dark ? tone('neutral1', '800', '#303034') : tone('neutral1', '10', '#fefbff');
    const ink = dark ? tone('neutral1', '100', '#e4e2e6') : tone('neutral1', '900', '#1b1b1f');
    let brand = dark ? tone('accent1', '700', accent) : tone('accent1', '100', accent);
    let onBrand = dark ? tone('accent1', '100', '#ffffff') : tone('accent1', '900', DARK_TEXT);
    const reads = (text) => [brand, mix(brand, card, 0.55), mix(brand, card, 0.75)].every((c) => contrast(text, c) >= AA);
    if (!reads(onBrand)) {
      const button = buttonFor(brand, card);
      brand = button.fill;
      onBrand = button.text;
    }
    let brandInk = dark ? tone('accent1', '200', accent) : tone('accent1', '600', accent);
    if (contrast(brandInk, bg) < AA || contrast(brandInk, card) < AA) brandInk = inkOf(accent, bg, card, mode);
    const variant = dark ? tone('neutral2', '200', ink) : tone('neutral2', '700', ink);
    const muted = contrast(variant, card) >= AA && contrast(variant, bg) >= AA ? variant : softer(ink, bg, card);
    if (contrast(ink, bg) < AA || contrast(ink, card) < AA) return derive(accent, mode);
    return tokens({
      bg, card, ink, muted, brand, onBrand, brandInk,
      mutedStrong: softer(ink, bg, card, 0.7),
      border: dark ? tone('neutral2', '700', mix(ink, card, 0.18)) : tone('neutral2', '200', mix(ink, card, 0.18)),
    });
  }

  // Each pair of a theme that doesn't read, as { what, ratio }: none for a theme made here.
  function problems(t) {
    const out = [];
    const need = (what, a, b) => {
      const r = contrast(t[a], t[b]);
      if (r < AA) out.push({ what, ratio: Math.round(r * 10) / 10 });
    };
    need('text on background', '--ink', '--bg');
    need('text on cards', '--ink', '--surface');
    need('softer text on cards', '--muted', '--surface');
    need('softer text on background', '--muted', '--bg');
    need('coloured text on background', '--brand-ink', '--bg');
    need('coloured text on cards', '--brand-ink', '--surface');
    need('button text', '--on-brand', '--brand');
    for (const share of [0.55, 0.75]) {
      if (contrast(t['--on-brand'], mix(t['--brand'], t['--surface-strong'], share)) < AA) out.push({ what: 'button text on a tinted card', ratio: 0 });
    }
    return out;
  }

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

  // ---------- kept, and painted ----------

  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

  // What's kept, or null. Kept from before there was one colour ({ bg, text, button, card }):
  // its buttons' colour is the one.
  function saved() {
    let v = null;
    try { v = JSON.parse(get(COLOURS_KEY) || 'null'); } catch { return null; }
    if (!v || typeof v !== 'object') return null;
    if (v.kind === 'phone' && v.light && v.dark) return v;
    if (v.kind === 'base' && isHex(v.base)) return v.light && v.dark ? v : withModes(v);
    if (isHex(v.button)) {
      const now = withModes({ kind: 'base', base: v.button.toLowerCase() });
      put(COLOURS_KEY, JSON.stringify(now));
      return now;
    }
    return null;
  }

  const withModes = (v) => ({ ...v, light: derive(v.base, 'light'), dark: derive(v.base, 'dark') });
  const mode = () => (root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light');

  const TOKENS = ['--bg', '--ink', '--brand', '--brand-rgb', '--surface', '--surface-strong', '--surface-border', '--muted', '--muted-strong', '--on-brand', '--brand-ink'];
  // The kept theme on the page, for the mode it's in; null puts the usual back.
  function paint(c) {
    for (const t of TOKENS) root.style.removeProperty(t);
    root.toggleAttribute('data-custom-colours', !!c);
    if (!c) {
      // The brand colour back as the theme has it (js/theme.js).
      window.applyColorTheme?.(window.getStoredColorTheme?.());
      return;
    }
    const t = c[mode()] || c.light;
    for (const [k, v] of Object.entries(t || {})) root.style.setProperty(k, v);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t['--brand']);
  }

  function keep(c) {
    put(COLOURS_KEY, c ? JSON.stringify(c) : null);
    paint(c);
    render();
  }

  // ---------- Your colours ----------

  let draft = null;
  let wheel = null;

  // The presets: the app's own green, and one for each egg found with one (js/eggs.js).
  const presets = () => [{ id: 'classic', base: CLASSIC, name: () => tr('colours.preset.classic', 'Classic') }, ...(window.Eggs?.presets() || [])];

  function renderPreview(t) {
    const prev = $('colourPreview');
    prev.style.background = t['--bg'];
    prev.style.color = t['--ink'];
    const card = prev.querySelector('.colourCard');
    card.style.background = t['--surface'];
    card.style.color = t['--ink'];
    prev.querySelector('.colourSoft').style.color = t['--muted'];
    const btn = prev.querySelector('.colourButton');
    btn.style.background = t['--brand'];
    btn.style.color = t['--on-brand'];
  }

  function renderColours() {
    const box = $('customColours');
    if (!box) return;
    box.hidden = !window.Eggs?.has('colours');
    if (box.hidden) return;
    const kept = saved();
    draft ??= kept?.kind === 'base' ? { base: kept.base, preset: kept.preset || null } : { base: CLASSIC, preset: 'classic' };
    if (!wheel && window.ColourWheel) {
      wheel = new ColourWheel({ wrap: $('colourWheel'), canvas: $('colourWheelCanvas'), slider: $('colourBrightness'), marker: $('colourWheelMarker') }, (hex) => {
        draft = { base: hex, preset: null };
        renderColours();
      });
      wheel.set(draft.base);
    }
    if (wheel && wheel.hex !== draft.base) wheel.set(draft.base);
    else wheel?.draw();
    $('colourPresets').innerHTML = presets().map((p) => `<button type="button" class="colourPreset" data-colour-preset="${p.id}" aria-pressed="${draft.preset === p.id}"><span class="colourPresetDot" style="background:${p.base}"></span>${escape(p.name())}</button>`).join('');
    const t = derive(draft.base, mode());
    renderPreview(t);
    // Said when the buttons aren't the colour picked, so it's no surprise.
    const moved = t['--brand'].toLowerCase() !== draft.base.toLowerCase();
    $('colourWarn').hidden = !moved;
    $('colourWarn').textContent = moved ? tr('colours.adjusted', 'The buttons are a little {way} than the colour picked, so their text is easy to read.', { way: luminance(t['--brand']) > luminance(draft.base) ? tr('colours.lighter', 'lighter') : tr('colours.darker', 'darker') }) : '';
    $('colourKeep').disabled = kept?.kind === 'base' && kept.base === draft.base;
    $('colourReset').hidden = !kept;
    $('colourReplay').hidden = !window.Eggs?.list().includes('lines');
  }

  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // ---------- Your phone's colours ----------

  const phoneCan = () => !!window.AppBridge?.has?.('phonecolours');
  let palettes = null;

  async function readPhone() {
    if (!phoneCan()) return null;
    try {
      palettes = await window.AppBridge.call('SgBus', 'phoneColours');
    } catch { palettes = null; }
    return palettes;
  }

  const phoneTheme = (p) => ({ kind: 'phone', light: fromPhone(p, 'light'), dark: fromPhone(p, 'dark') });

  // In use: asked again, for a new wallpaper's colours.
  async function refreshPhone() {
    if (saved()?.kind !== 'phone') return;
    const p = await readPhone();
    if (p) keep(phoneTheme(p));
  }

  // On: the phone's colours read now and put in place (Use my phone's colours, and the trick in
  // js/eggs.js).
  async function usePhone() {
    const p = palettes || (await readPhone());
    if (p) keep(phoneTheme(p));
    return !!p;
  }

  const phoneOn = () => saved()?.kind === 'phone';
  const stopPhone = () => { if (phoneOn()) keep(null); };

  function renderPhone() {
    const box = $('phoneColours');
    if (!box) return;
    box.hidden = !(window.Eggs?.has('phone') && phoneCan());
    if (box.hidden) return;
    const on = saved()?.kind === 'phone';
    $('phoneColoursOn').hidden = on;
    $('phoneColoursOff').hidden = !on;
    const p = palettes;
    $('phoneSwatches').innerHTML = p ? ['accent1', 'accent2', 'accent3', 'neutral1'].map((k) => `<span class="phoneSwatch" style="background:${p[k]?.['500'] || '#888'}"></span>`).join('') : '';
    if (!p) readPhone().then((got) => { if (got) renderPhone(); });
  }

  // ---------- the Easter eggs found ----------

  function renderEggs() {
    const box = $('eggsFound');
    if (!box || !window.Eggs) return;
    const found = Eggs.list();
    box.hidden = !found.length;
    if (box.hidden) return;
    $('eggsFoundCount').textContent = tr('eggs.count', '{n} of {all} Easter eggs found', { n: found.length, all: Eggs.all.length });
    $('eggsFoundList').innerHTML = found.map((id) => `<li>${escape(Eggs.name(id))}</li>`).join('');
  }

  function render() {
    renderColours();
    renderPhone();
    renderEggs();
  }

  function open() {
    window.openModal('themeModal');
    render();
    setTimeout(() => ($('customColours')?.hidden ? $('phoneColours') : $('customColours'))?.scrollIntoView({ block: 'nearest' }), 100);
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
    // Light and dark each have their own: switching repaints.
    new MutationObserver(() => {
      const now = saved();
      if (now) paint(now);
      if (!$('themeModal')?.classList.contains('hidden')) renderColours();
    }).observe(root, { attributes: true, attributeFilter: ['data-mode'] });

    $('colourPresets')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-colour-preset]');
      const p = btn && presets().find((x) => x.id === btn.dataset.colourPreset);
      if (!p) return;
      draft = { base: p.base, preset: p.id };
      renderColours();
    });
    $('colourKeep')?.addEventListener('click', () => {
      if (!draft) return;
      keep(withModes({ kind: 'base', base: draft.base, preset: draft.preset || null }));
    });
    $('colourReset')?.addEventListener('click', () => {
      draft = { base: CLASSIC, preset: 'classic' };
      keep(null);
    });
    $('phoneColoursOn')?.addEventListener('click', usePhone);
    $('phoneColoursOff')?.addEventListener('click', () => keep(null));
    $('themeModal')?.addEventListener('modalclose', () => { draft = null; });
    $('themeBtn')?.addEventListener('click', () => { draft = null; setTimeout(render, 0); });
    $('unlockGo')?.addEventListener('click', () => {
      window.closeModal('unlockModal');
      setTimeout(() => window.Coins?.open(), 50);
    });
    $('unlockLater')?.addEventListener('click', () => window.closeModal('unlockModal'));
    // Watch the celebration again, from Your colours.
    $('colourReplay')?.addEventListener('click', () => {
      window.closeModal('themeModal');
      setTimeout(() => (window.Celebrate ? window.Celebrate.start() : window.openModal('unlockModal')), 80);
    });

    window.addEventListener('eggs:unlocked', render);
    window.addEventListener('eggs:found', render);
    // In the app, the phone's colours asked again as it opens and comes back.
    window.AppBridge?.ready?.(4000).then(refreshPhone);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshPhone(); });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Colours = { paint, contrast, derive, fromPhone, problems, open, usePhone, phoneOn, stopPhone };
})();
