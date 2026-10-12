// The title bar's buttons (titlebar.html), through titlebar-preload.js's window.bar.
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

root.classList.toggle('mac', window.bar.platform === 'darwin');

$('back').addEventListener('click', () => window.bar.back());
$('forward').addEventListener('click', () => window.bar.forward());
$('reload').addEventListener('click', () => window.bar.reload());

let copiedTimer = null;
$('address').addEventListener('click', async () => {
  if (!(await window.bar.copy())) return;
  root.classList.add('copied');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => root.classList.remove('copied'), 1500);
});

// Light or dark writing, whichever reads on the site's colour.
function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

window.bar.onState((s) => {
  $('url').textContent = s.display;
  $('address').title = `${s.url}\nClick to copy the link`;
  $('back').disabled = !s.canBack;
  $('forward').disabled = !s.canForward;
  root.classList.toggle('loading', s.loading);
  root.classList.toggle('fullscreen', s.fullscreen);
  if (s.color) {
    root.style.setProperty('--bg', s.color);
    root.classList.toggle('dark', isDark(s.color));
  }
});
