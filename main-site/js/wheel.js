// Your colours' picker (js/colours.js): the colour wheel of the Color Guess Game's Expert level
// (augy-studios/colorguess-game, main-site/js/wheel.js), brought over as it is. A hue and
// saturation wheel drawn on a canvas, and a brightness slider beside it, so any colour can be
// reached. Drag or tap the wheel, or focus it and use the arrow keys: left and right turn the
// hue, up and down change the saturation.
//
// The wheel and the slider's track show colours for what they are, so they're a fixed-meaning
// exception to the theme's tokens.
//
//   const wheel = new ColourWheel({ wrap, canvas, slider, marker }, (hex) => ...);
//   wheel.set('#ccffcc')   the wheel on a colour, without calling back
//   wheel.hex              the colour picked, "#rrggbb"
// Plain script: exports go on window.
(function () {
  const KEY_HUE = 5;
  const KEY_SAT = 0.05;

  const pad = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

  // h in degrees, s and v from 0 to 1, as "#rrggbb".
  function hsvToHex(h, s, v) {
    const f = (k) => {
      const x = (k + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(x, 4 - x, 1));
    };
    return `#${pad(f(5) * 255)}${pad(f(3) * 255)}${pad(f(1) * 255)}`;
  }

  function hexToHsv(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0;
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }

  class ColourWheel {
    // els: { wrap, canvas, slider, marker }
    constructor(els, onChange) {
      this.els = els;
      this.onChange = onChange;
      this.h = 0;
      this.s = 0;
      this.v = 1;
      this.drawnFor = null;

      const { wrap, slider } = els;
      wrap.tabIndex = 0;
      wrap.addEventListener('pointerdown', (e) => {
        wrap.setPointerCapture(e.pointerId);
        this.pointAt(e);
        wrap.focus({ preventScroll: true });
        e.preventDefault();
      });
      wrap.addEventListener('pointermove', (e) => {
        if (wrap.hasPointerCapture(e.pointerId)) this.pointAt(e);
      });
      wrap.addEventListener('keydown', (e) => {
        const turn = { ArrowLeft: KEY_HUE, ArrowRight: -KEY_HUE }[e.key];
        const sat = { ArrowUp: KEY_SAT, ArrowDown: -KEY_SAT }[e.key];
        if (turn === undefined && sat === undefined) return;
        e.preventDefault();
        if (turn) this.h = (this.h + turn + 360) % 360;
        if (sat) this.s = Math.max(0, Math.min(1, this.s + sat));
        this.changed();
      });
      slider.addEventListener('input', () => {
        this.v = Number(slider.value) / 100;
        this.changed();
      });
      window.addEventListener('resize', () => {
        this.drawnFor = null;
        if (wrap.offsetParent) this.draw();
      });
    }

    get hex() {
      return hsvToHex(this.h, this.s, this.v);
    }

    // On `hex`, without calling back: the colour already in use, or a preset.
    set(hex) {
      Object.assign(this, hexToHsv(hex));
      this.changed({ quiet: true });
    }

    pointAt(e) {
      const rect = this.els.wrap.getBoundingClientRect();
      const r = rect.width / 2;
      const x = (e.clientX - rect.left - r) / r;
      const y = (rect.top + r - e.clientY) / r;
      this.h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      this.s = Math.min(1, Math.hypot(x, y));
      this.changed();
    }

    place(el, h, s) {
      const a = (h * Math.PI) / 180;
      el.style.left = `${50 + 50 * s * Math.cos(a)}%`;
      el.style.top = `${50 - 50 * s * Math.sin(a)}%`;
    }

    changed({ quiet = false } = {}) {
      const { slider, marker, wrap } = this.els;
      slider.value = String(Math.round(this.v * 100));
      slider.style.setProperty('--wheel-top', hsvToHex(this.h, this.s, 1));
      this.place(marker, this.h, this.s);
      marker.style.background = this.hex;
      wrap.setAttribute('aria-valuenow', String(Math.round(this.s * 100)));
      wrap.setAttribute('aria-valuetext', (window.I18n ? I18n.t('colours.wheel.value', 'Hue {h} degrees, saturation {s} percent, brightness {v} percent', { h: Math.round(this.h), s: Math.round(this.s * 100), v: Math.round(this.v * 100) }) : this.hex));
      this.draw();
      if (!quiet) this.onChange?.(this.hex);
    }

    // Redrawn only when the brightness or the size changes.
    draw() {
      const { canvas } = this.els;
      const size = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
      if (!size) return;
      const key = `${size}|${this.v.toFixed(2)}`;
      if (this.drawnFor === key) return;
      this.drawnFor = key;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(size, size);
      const r = size / 2;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const x = (px + 0.5 - r) / r;
          const y = (r - py - 0.5) / r;
          const d = Math.hypot(x, y);
          // A pixel's worth of soft edge, so the rim is not jagged.
          const alpha = Math.max(0, Math.min(1, (1 - d) * r));
          if (!alpha) continue;
          const c = parseInt(hsvToHex(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, Math.min(1, d), this.v).slice(1), 16);
          const i = (py * size + px) * 4;
          img.data[i] = (c >> 16) & 255;
          img.data[i + 1] = (c >> 8) & 255;
          img.data[i + 2] = c & 255;
          img.data[i + 3] = Math.round(alpha * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  window.ColourWheel = ColourWheel;
})();
