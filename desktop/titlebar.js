// The title bar's buttons (titlebar.html), through titlebar-preload.js's window.bar.
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

root.classList.toggle('mac', window.bar.platform === 'darwin');

$('back').addEventListener('click', () => window.bar.back());
$('forward').addEventListener('click', () => window.bar.forward());
$('reload').addEventListener('click', () => window.bar.reload());
$('minimize').addEventListener('click', () => window.bar.minimize());
$('maximize').addEventListener('click', () => window.bar.maximize());
$('close').addEventListener('click', () => window.bar.close());

// Said for a moment in the address bar, over the address.
let copiedTimer = null;
function say(text) {
  $('copied').textContent = text;
  root.classList.add('copied');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => root.classList.remove('copied'), 1500);
}

$('copy').addEventListener('click', async () => {
  if (await window.bar.copy()) say('Link copied');
});

// The address, typed over: Enter goes there, Esc (or clicking away) puts the page's back.
const url = $('url');
let shownUrl = '';
let shownDisplay = '';
const showAddress = () => {
  url.value = document.activeElement === url ? shownUrl : shownDisplay;
};
function edit() {
  window.bar.edit();
  url.focus();
}
// The first click selects all of it, as in a browser; the next ones place the cursor.
let selectOnUp = false;
url.addEventListener('mousedown', () => {
  if (document.activeElement === url) return;
  selectOnUp = true;
  window.bar.edit();
});
url.addEventListener('mouseup', (e) => {
  if (selectOnUp && url.selectionStart === url.selectionEnd) {
    e.preventDefault();
    url.select();
  }
  selectOnUp = false;
});
url.addEventListener('focus', () => {
  url.value = shownUrl;
  url.select();
});
url.addEventListener('blur', showAddress);
url.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  url.blur();
  window.bar.done();
});
$('address').addEventListener('submit', async (e) => {
  e.preventDefault();
  const went = await window.bar.go(url.value);
  if (!went) {
    say('Not an address');
    return;
  }
  url.blur();
  if (went === 'browser') say('Opened in your browser');
});
window.bar.onEdit(edit);

// One screenshot at a time; a long one can take a moment.
async function screenshot(long) {
  if (root.classList.contains('shooting')) return;
  root.classList.add('shooting');
  try {
    const ok = await window.bar.screenshot(long);
    say(ok ? `${long ? 'Long screenshot' : 'Screenshot'} copied and saved` : "Couldn't take a screenshot");
  } finally {
    root.classList.remove('shooting');
  }
}
$('shot').addEventListener('click', () => screenshot(false));
$('longshot').addEventListener('click', () => screenshot(true));

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
  shownUrl = s.url;
  shownDisplay = s.display;
  if (document.activeElement !== url) showAddress();
  $('back').disabled = !s.canBack;
  $('forward').disabled = !s.canForward;
  root.classList.toggle('loading', s.loading);
  root.classList.toggle('fullscreen', s.fullscreen);
  root.classList.toggle('maximized', s.maximized);
  $('maximize').title = s.maximized ? 'Restore' : 'Maximise';
  $('maximize').setAttribute('aria-label', $('maximize').title);
  if (s.color) {
    root.style.setProperty('--bg', s.color);
    root.classList.toggle('dark', isDark(s.color));
  }
});
