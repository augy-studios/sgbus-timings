# Page tours: spec for building first-visit tutorials into a web app

A short guided tour over a page, shown the first time someone opens that page.
The page dims, one thing on it is lit, and a hand-drawn chalk arrow runs to it
from a line saying what it does. **Next** moves to the next thing, **Skip** ends
the tour. Every page in the app has its own tour. The one for the start page
also serves as the welcome the first time the app is opened. Settings can replay
any of them.

Use it for apps with several pages, each with a few controls that aren't
obvious at first sight. It isn't meant for long onboarding flows or forms: a
tour is three to five steps, each one line about one real thing on the page.

This document is self-contained. The reference implementation below is plain
HTML, CSS and JavaScript with no dependencies.

---

## 1. Behaviour

| | |
|---|---|
| When | The first time each page is shown, once its content has drawn. Never again on its own after it ends, whether by **Done** or **Skip**. |
| What | A spotlight on one element at a time, a chalk arrow to it, one line of text, step dots, **Next** (or **Done** on the last step) and **Skip**. |
| Where it ends | On the page it began on. A tour started from another page (a replay from Settings) switches to its page first and switches back at the end. |
| Replays | Settings has a **Show me around** section with one button per page. Replaying doesn't change what's been seen. |
| Not shown | Over a page someone reached by a link (a deep link came for that thing, not a tour); while a dialog or other window is open over the page; on a page with no tour; when none of its steps' elements are there. |

- **One tour per page, one at a time.** A tour never starts while another is
  showing. Switching pages during a tour (the tour does this itself on a
  replay) doesn't start that page's tour.
- **The welcome.** The first time the app is opened, the start page's tour
  runs. Its last steps go beyond the page, to the app's navigation and to
  Settings, so it also teaches how to reach the other pages and replay tours.
  If the app opens on a different page, the welcome switches to the start
  page, runs, then returns. That page's own tour then follows straight on, as
  it is now being seen for the first time.
- **Steps that aren't there are left out.** Each step names its element by a
  CSS selector (a list of alternatives is fine: the first visible match is
  used). A step whose element is missing or hidden when the tour starts is
  dropped, so a tour adapts to what's on screen: an empty list gets a step
  explaining how to fill it instead of steps about its items, and a button the
  device can't use (no camera, no microphone) is skipped. A tour whose steps
  are all dropped is marked seen without showing anything.
- **Waiting for content.** A page that loads its content (a list fetched from a
  server) waits until it has drawn, up to about eight seconds, before its tour
  starts. Pages that draw at once wait about one second, so the switch
  animation finishes first.
- **The element is scrolled into view** (centred) before it's lit. If it sits
  in a collapsible part of the navigation that's collapsed, that part opens.

## 2. Anatomy

```
┌──────────────────────────────────────────┐
│ Skip                     (dimmed page)   │
│                                          │
│        ╭──────────────────────╮          │
│        │   lit element        │ ◄─ hole: │
│        ╰──────────────────────╯   a box  │
│                 ↑                 shadow │
│                  ╲  chalk arrow   of     │
│                   ╲               200vmax│
│   Pick what shows here: everything, or   │
│   just your saved ones.                  │
│   ● ━━ ●  ●                     [ Next ] │
└──────────────────────────────────────────┘
```

- **Root:** a fixed, full-viewport layer above everything (`z-index` above the
  app's own dialogs). `role="dialog"`, `aria-modal="true"`, labelled by the
  step text.
- **Hole:** a fixed box the size of the lit element plus 8 px padding, with
  rounded corners, a very large spread `box-shadow` that dims everything
  outside it, and a soft white glow just around it. It animates between
  steps (left, top, width, height over 0.3 s), so the light visibly moves
  from one thing to the next. It never takes clicks.
- **Arrow:** a full-viewport SVG with two paths, the line and the head, in a
  chalk colour with a slight roughening filter so it looks hand-drawn. The line
  draws itself in over 0.6 s on each step.
- **Card:** the text (large, about 1.3 rem, light on the dim), the step dots
  (the current one a wider pill) and the **Next** button. It has no box of its
  own: it sits on the dim. It's full width less 16 px each side, at most
  460 px, centred.
- **Skip:** top left, clear of the safe area.

## 3. Placement

On each step, and again on resize or scroll:

1. **Hole:** the element's bounding rectangle, padded by 8 px.
2. **Card:** below the element if there's more room below than above,
   otherwise above it, with a 70 px gap for the arrow. Clamped to stay at least
   12 px inside the viewport.
3. **Arrow:** a quadratic curve from the card's near edge, a third of the way
   across it, to the middle of the element's near side, kept 12 px in from the
   element's ends. The control point is offset sideways from the midpoint so
   the line bows like a hand drew it. The head is two 14 px strokes back from
   the tip, at ±0.8π from the curve's last direction.

## 4. Accessibility

- The step text is the dialog's label and is `aria-live="polite"`, so each step
  is read as it comes.
- **Next** takes focus on every step (without scrolling the page).
- `Escape` ends the tour (as **Skip** does). `→` moves on (as **Next** does).
- While a tour shows, the page under it doesn't scroll (`overflow: hidden` on
  `body`).
- The drawing (arrow, dots) is `aria-hidden`.
- With `prefers-reduced-motion: reduce`, the hole jumps rather than glides, and
  the arrow appears without drawing in.

## 5. State

| Key | Value | Meaning |
|---|---|---|
| `tour.welcome` | `"done"` | The welcome (the start page's tour) has been seen. |
| `tour.pages` | JSON array of page ids | The other pages whose tours have been seen. |

Both are written when a tour ends, by **Done**, **Skip** or `Escape`. If storage
throws (private mode, blocked site data), treat every tour as seen, so a broken
storage never shows a tour on every visit.

Adding a page to the app adds its tour: existing users see it the first time
they open that page. Changing an existing tour doesn't show it again; give it a
new page id if it must be seen again.

## 6. Integrating with the app's pages

The tours need four things from the app's page switching:

| Need | Shape |
|---|---|
| The page on show | `pages.active()` → id |
| Switching to a page | `pages.open(id)`, as the page's own button would |
| A switch happened | a `pagechange` event on `window` after each switch |
| A window is open over the page | a class on `body` (here `modal-open`) |

A tour's steps can point at elements outside its page (the navigation, a
settings button); they're lit wherever they are.

## 7. Reference implementation

### 7.1 Markup

None in the page: the tour builds its own layer when it starts and removes it
when it ends. Settings needs one container:

```html
<p class="section-label">Show me around</p>
<div id="tourPicks" class="tourPicks"></div>
<p class="note">Each page shows you around the first time you open it. Pick one to see its tour again.</p>
```

### 7.2 CSS

```css
.tour { position: fixed; inset: 0; z-index: 2000; }
.tourHole {
  position: fixed;
  border-radius: 18px;
  box-shadow: 0 0 0 200vmax rgba(8, 14, 10, 0.86), 0 0 24px 8px rgba(255, 255, 255, 0.35);
  transition: left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease;
  pointer-events: none;
}
.tourArrow { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.tourLine, .tourHead {
  fill: none;
  stroke: #f6f1e6;
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Drawn in over its own length; the script sets --len. */
.tourLine { stroke-dasharray: var(--len, 600); stroke-dashoffset: var(--len, 600); animation: tour-draw 0.6s ease forwards; }
@keyframes tour-draw { to { stroke-dashoffset: 0; } }
.tourSkip {
  position: fixed;
  top: max(16px, calc(env(safe-area-inset-top) + 12px));
  left: 16px;
  padding: 8px 14px;
  background: none;
  border: 0;
  color: #f6f1e6;
  font-size: 1.05rem;
}
.tourCard { position: fixed; left: 16px; right: 16px; max-width: 460px; margin: 0 auto; color: #f6f1e6; }
.tourText { font-size: 1.3rem; line-height: 1.35; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6); }
.tourFoot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.tourNext { background: #f6f1e6; color: #1a221d; border: 0; border-radius: 999px; padding: 10px 22px; }
.tourDots { display: flex; gap: 6px; }
.tourDots > span { width: 7px; height: 7px; border-radius: 999px; background: rgba(246, 241, 230, 0.4); transition: width 0.2s ease; }
.tourDots > .on { width: 20px; background: #f6f1e6; }
body.touring { overflow: hidden; }
.tourPicks { display: flex; flex-wrap: wrap; gap: 8px; }

@media (prefers-reduced-motion: reduce) {
  .tourHole { transition: none; }
  .tourLine { animation: none; stroke-dashoffset: 0; }
}
```

The dim and chalk colours are fixed rather than themed: the tour reads the same
over a light or a dark page.

### 7.3 JavaScript

```js
(function () {
  const WELCOME_KEY = 'tour.welcome';
  const PAGES_KEY = 'tour.pages';
  const PAD = 8;
  const START = 'home'; // the start page, whose tour is the welcome

  // Each page's steps: `el` a selector (alternatives allowed), `text` one line.
  const TOURS = {
    home: {
      label: 'Home',
      steps: [
        { el: '#summary', text: 'Your day at a glance. Tap it for the details.' },
        { el: '#filterChip', text: 'Pick what shows here.' },
        { el: '#nav', text: 'Each page has its button here. Press and hold one to see what it does.' },
        { el: '#settingsBtn', text: 'Settings can show any page’s tour again.' },
      ],
    },
    search: {
      label: 'Search',
      steps: [
        { el: '#searchBox', text: 'Search by name or code.' },
        { el: '#voiceBtn', text: 'Or say it.' },
        { el: '#results .item, #results .empty', text: 'What you find shows here.' },
      ],
    },
    // ...one entry per page
  };

  let steps = [];
  let at = 0;
  let root = null; // the layer, or `true` while a tour is getting ready
  let page = null;
  let began = null;

  function seen(id) {
    try {
      if (id === START) return localStorage.getItem(WELCOME_KEY) === 'done';
      return JSON.parse(localStorage.getItem(PAGES_KEY) || '[]').includes(id);
    } catch { return true; }
  }
  function markSeen(id) {
    try {
      if (id === START) return localStorage.setItem(WELCOME_KEY, 'done');
      const list = JSON.parse(localStorage.getItem(PAGES_KEY) || '[]');
      if (!list.includes(id)) localStorage.setItem(PAGES_KEY, JSON.stringify([...list, id]));
    } catch { /* shown again next time */ }
  }

  function visible(el) {
    if (!el || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  const target = (s) => [...document.querySelectorAll(s.el)].find(visible) || null;

  function build() {
    root = document.createElement('div');
    root.className = 'tour';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tourText');
    root.innerHTML =
      '<div class="tourHole"></div>' +
      '<svg class="tourArrow" aria-hidden="true"><defs><filter id="tourChalk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/></filter></defs>' +
      '<path class="tourLine" filter="url(#tourChalk)"/><path class="tourHead" filter="url(#tourChalk)"/></svg>' +
      '<button class="tourSkip" type="button">Skip</button>' +
      '<div class="tourCard"><p id="tourText" class="tourText" aria-live="polite"></p>' +
      '<div class="tourFoot"><span class="tourDots" aria-hidden="true"></span><button class="tourNext" type="button">Next</button></div></div>';
    document.body.appendChild(root);
    root.querySelector('.tourSkip').addEventListener('click', end);
    root.querySelector('.tourNext').addEventListener('click', next);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') end();
      if (e.key === 'ArrowRight') next();
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }

  function show(i) {
    at = i;
    const el = steps[i].target;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    root.querySelector('.tourText').textContent = steps[i].text;
    root.querySelector('.tourDots').innerHTML = steps.map((_, n) => `<span${n === i ? ' class="on"' : ''}></span>`).join('');
    root.querySelector('.tourNext').textContent = i === steps.length - 1 ? 'Done' : 'Next';
    requestAnimationFrame(place);
    root.querySelector('.tourNext').focus({ preventScroll: true });
  }

  // §3: the hole, the card above or below, and the arrow between them.
  function place() {
    if (!root || root === true) return;
    const el = steps[at]?.target;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const hole = root.querySelector('.tourHole');
    Object.assign(hole.style, {
      left: `${r.left - PAD}px`, top: `${r.top - PAD}px`,
      width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`,
    });

    const card = root.querySelector('.tourCard');
    const ch = card.offsetHeight;
    const below = vh - r.bottom > r.top;
    const gap = 70;
    let top = below ? r.bottom + PAD + gap : r.top - PAD - gap - ch;
    top = Math.max(12, Math.min(vh - ch - 12, top));
    card.style.top = `${top}px`;

    const sx = card.getBoundingClientRect().left + card.offsetWidth * 0.3;
    const sy = below ? top - 6 : top + ch + 6;
    const tx = Math.max(r.left + 12, Math.min(r.right - 12, r.left + r.width / 2));
    const ty = below ? r.bottom + PAD + 4 : r.top - PAD - 4;
    root.querySelector('.tourArrow').setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const bow = (tx - sx) * 0.35 + (below ? 30 : -30);
    const mx = (sx + tx) / 2 + (sy - ty) * 0.25;
    const my = (sy + ty) / 2 - bow * 0.2;
    const line = root.querySelector('.tourLine');
    line.setAttribute('d', `M${sx},${sy} Q${mx},${my} ${tx},${ty}`);
    line.style.setProperty('--len', Math.ceil(line.getTotalLength()) + 10);
    const ang = Math.atan2(ty - my, tx - mx);
    const a1 = ang + Math.PI * 0.8, a2 = ang - Math.PI * 0.8, len = 14;
    root.querySelector('.tourHead').setAttribute('d',
      `M${tx + Math.cos(a1) * len},${ty + Math.sin(a1) * len} L${tx},${ty} L${tx + Math.cos(a2) * len},${ty + Math.sin(a2) * len}`);
  }

  function next() {
    if (at < steps.length - 1) show(at + 1);
    else end();
  }

  function end() {
    if (page) markSeen(page);
    removeEventListener('resize', place);
    removeEventListener('scroll', place, true);
    if (root && root !== true) root.remove();
    root = null;
    page = null;
    document.body.classList.remove('touring');
    const back = began;
    began = null;
    scrollTo({ top: 0, behavior: 'instant' });
    // Back where it began, which may be a page whose own tour is still to see.
    if (back && pages.active() !== back) pages.open(back);
    else setTimeout(forPage, 600);
  }

  // `id`'s tour, on its page.
  function start(id = START) {
    if (root || !TOURS[id]) return;
    const from = pages.active();
    if (from !== id) pages.open(id);
    root = true; // taken, while the page draws
    setTimeout(() => {
      root = null;
      steps = TOURS[id].steps.map((s) => ({ ...s, target: target(s) })).filter((s) => s.target);
      if (!steps.length) {
        markSeen(id);
        if (pages.active() !== from) pages.open(from);
        return;
      }
      page = id;
      began = from;
      document.body.classList.add('touring');
      build();
      show(0);
    }, from === id ? 0 : 400);
  }

  // The page on show's tour, the first time, once it's drawn. `ready(id)` says
  // whether a page that loads its content has it; most pages are ready at once.
  const ready = (id) => true;
  let waiting = null;
  function forPage() {
    const id = pages.active();
    if (!id || root || seen(id) || !TOURS[id]) return;
    clearInterval(waiting);
    let tries = 0;
    waiting = setInterval(() => {
      tries++;
      if (pages.active() !== id || root) return clearInterval(waiting);
      if (ready(id) ? tries < 2 : tries <= 16) return;
      clearInterval(waiting);
      if (!document.body.classList.contains('modal-open')) start(id);
    }, 500);
  }

  // At start-up: the welcome, unless a link opened something.
  function init() {
    addEventListener('pagechange', forPage);
    if (location.hash.length > 1 || location.search) return;
    if (!seen(START) && pages.active() !== START) {
      setTimeout(() => { if (!document.body.classList.contains('modal-open')) start(START); }, 1500);
      return;
    }
    forPage();
  }

  // Settings' Show me around: a button per page.
  function pickers() {
    return Object.entries(TOURS)
      .map(([id, t]) => `<button class="pick" type="button" data-tour="${id}">${t.label}</button>`)
      .join('');
  }

  window.Tour = { init, start, end, pickers };
})();
```

Wiring it up:

```js
Tour.init(); // once the app's pages are set up

// Each time Settings opens:
document.getElementById('tourPicks').innerHTML = Tour.pickers();

document.getElementById('tourPicks').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tour]');
  if (!btn) return;
  closeSettings();
  setTimeout(() => Tour.start(btn.dataset.tour), 300); // after the window has gone
});
```

## 8. Writing the steps

- **Three to five steps a page.** One element and one line each.
- **Say what it does, not what it is.** "Pick what shows here", not "This is
  the filter chip".
- **Light real things.** Never a placeholder or a mock: if it isn't on the page,
  the step drops out (§1).
- **Cover the empty state.** For a page that's empty until used, add a step on
  its empty message saying how to fill it; it shows only while the page is
  empty, and the steps on its items only once it has some.
- **Alternatives for variants.** A page with tabs or modes lists the matching
  element of each in one selector (`#tabA .fields, #tabB .fields`), so the step
  lights whichever is showing.
- **Keep the welcome short.** It's the first thing a new user sees: the start
  page's two or three key things, then where the other pages are and where to
  replay tours.

## 9. Adding it to an app

1. Add the CSS (§7.2) and the script (§7.3).
2. Give the script the app's page switching (§6): `pages.active()`,
   `pages.open(id)`, a `pagechange` event, and a `modal-open` class while a
   window is open.
3. Write a tour for each page (§8), with an id matching the page's.
4. Call `Tour.init()` once the pages are set up.
5. Add **Show me around** to Settings, with a button per tour.
6. Any automated screenshots or tests of the app's pages should mark every tour
   as seen first (`tour.welcome` = `"done"`, `tour.pages` = every id), so tours
   don't cover them.
