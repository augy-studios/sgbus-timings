// The tour (help desk #2): the first time the app opens, a few steps over the page showing the
// basics, each a spotlight on the real thing with a chalk arrow to it and a line saying what it
// does: the next bus, the stops it's from, the search box, the Edge Tray and Settings. Next
// moves on, Skip in the corner ends it, and Settings has "Show me around" to see it again.
// A step on a page (`page`: Glance, Bus timings) switches to it, and the tour ends back on the
// page it began on. A step whose thing isn't there (the glance turned off, or no stops in it)
// is left out. Not over a link that opened something, which came for that.
// Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const KEY = 'sgbus_tour';
  const PAD = 8;

  // `el` is what's lit; `text` what's said about it; `page` the page it's on.
  const STEPS = [
    { el: '#glanceHero', page: 'glance', text: 'Your next bus, big enough to read on the move. Tap it for all its times.' },
    { el: '#glanceSource', page: 'glance', text: 'Pick whose buses: your saved stops, the ones nearby, or the ones near Home or Work.' },
    { el: '#glanceStops .glanceStop', page: 'glance', text: 'Each bus on one line, with its next three times. Tap one for the full timings, and the star there saves the stop. Star a bus, and only your buses show here.' },
    { el: '.searchWrap', page: 'timings', text: 'Bus timings: look up any stop by its name or code, or a bus by its number for its route.' },
    { el: '#trayViews', text: 'Each page has its button at the top of the Edge Tray: Glance, Bus timings, Favourites, Navigate, alerts, your trips and places. Press and hold a button to see what it does.' },
    { el: '#settingsBtn', text: 'In Settings, Custom home picks the page the app opens on. Make it Bus timings, Navigate, or whatever you use most.' },
  ];

  let steps = [];
  let at = 0;
  let root = null;
  let began = null;

  // There to be shown: on its page, if it has one, even while another page is on show.
  const there = (s) => {
    const el = document.querySelector(s.el);
    if (!s.page) return visible(el);
    if (!el || (s.page === 'glance' && !window.Glance?.enabled())) return false;
    return !el.closest('[hidden]');
  };

  const done = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } };
  const markDone = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* shown again next time */ } };

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function build() {
    root = document.createElement('div');
    root.className = 'tour';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tourText');
    root.innerHTML =
      '<div class="tourHole"></div>' +
      '<svg class="tourArrow" aria-hidden="true"><defs><filter id="tourChalk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/></filter></defs><path class="tourLine" filter="url(#tourChalk)"/><path class="tourHead" filter="url(#tourChalk)"/></svg>' +
      '<button class="tourSkip" type="button">Skip</button>' +
      '<div class="tourCard">' +
      '<p id="tourText" class="tourText" aria-live="polite"></p>' +
      '<div class="tourFoot"><span class="tourDots" aria-hidden="true"></span><button class="tourNext btn" type="button">Next</button></div>' +
      '</div>';
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
    const step = steps[i];
    if (step.page && window.MainScreen && MainScreen.active() !== step.page) MainScreen.open(step.page);
    const el = document.querySelector(step.el);
    if (el.closest('#trayButtons') && document.documentElement.hasAttribute('data-tray-closed')) window.setTrayOpen?.(true);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    root.querySelector('.tourText').textContent = step.text;
    root.querySelector('.tourDots').innerHTML = steps.map((_, n) => `<span${n === i ? ' class="on"' : ''}></span>`).join('');
    root.querySelector('.tourNext').textContent = i === steps.length - 1 ? 'Done' : 'Next';
    requestAnimationFrame(place);
    root.querySelector('.tourNext').focus({ preventScroll: true });
  }

  // The light round the step's thing, the card above or below it, whichever has more room, and
  // the arrow from the card's edge to the thing, bowed like a hand drew it.
  function place() {
    if (!root) return;
    const el = document.querySelector(steps[at].el);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hole = root.querySelector('.tourHole');
    hole.style.left = `${r.left - PAD}px`;
    hole.style.top = `${r.top - PAD}px`;
    hole.style.width = `${r.width + PAD * 2}px`;
    hole.style.height = `${r.height + PAD * 2}px`;

    const card = root.querySelector('.tourCard');
    const ch = card.offsetHeight;
    const below = vh - r.bottom > r.top;
    const gap = 70;
    let top = below ? r.bottom + PAD + gap : r.top - PAD - gap - ch;
    top = Math.max(12, Math.min(vh - ch - 12, top));
    card.style.top = `${top}px`;

    // From the card's edge, a third of the way across, to the middle of the thing's near side.
    const cw = card.offsetWidth;
    const cl = card.getBoundingClientRect().left;
    const sx = cl + cw * 0.3;
    const sy = below ? top - 6 : top + ch + 6;
    const tx = Math.max(r.left + 12, Math.min(r.right - 12, r.left + r.width / 2));
    const ty = below ? r.bottom + PAD + 4 : r.top - PAD - 4;
    const svg = root.querySelector('.tourArrow');
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const bow = (tx - sx) * 0.35 + (below ? 30 : -30);
    const mx = (sx + tx) / 2 + (sy - ty) * 0.25;
    const my = (sy + ty) / 2 - bow * 0.2;
    const line = root.querySelector('.tourLine');
    line.setAttribute('d', `M${sx},${sy} Q${mx},${my} ${tx},${ty}`);
    line.style.setProperty('--len', Math.ceil(line.getTotalLength()) + 10);
    // The head: two strokes back from the tip along the curve's last direction.
    const ang = Math.atan2(ty - my, tx - mx);
    const len = 14;
    const a1 = ang + Math.PI * 0.8;
    const a2 = ang - Math.PI * 0.8;
    root.querySelector('.tourHead').setAttribute('d',
      `M${tx + Math.cos(a1) * len},${ty + Math.sin(a1) * len} L${tx},${ty} L${tx + Math.cos(a2) * len},${ty + Math.sin(a2) * len}`);
  }

  function next() {
    if (at < steps.length - 1) show(at + 1);
    else end();
  }

  function end() {
    markDone();
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    root?.remove();
    root = null;
    document.body.classList.remove('touring');
    if (began && window.MainScreen && MainScreen.active() !== began) MainScreen.open(began);
    began = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function start() {
    if (root) return;
    steps = STEPS.filter(there);
    if (!steps.length) return;
    began = window.MainScreen?.active() || null;
    // The press-and-hold tip (js/ui.js) is the Edge Tray's step.
    try { localStorage.setItem('sgbus_hold_hint', '1'); } catch { /* shown as well */ }
    document.body.classList.add('touring');
    build();
    show(0);
  }

  // The first time, once the glance has its buses to show (or a few seconds without).
  function maybeStart() {
    if (done() || location.hash.length > 1 || location.search) return;
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      const hero = document.querySelector('#glanceHero');
      const ready = !window.Glance?.enabled() || (hero.textContent.trim() && !hero.textContent.includes('Getting the times'));
      if (ready || tries > 16) {
        clearInterval(wait);
        // Only if nothing's opened over the page in the meantime.
        if (!document.body.classList.contains('modal-open')) start();
      }
    }, 500);
  }

  window.Tour = { start, maybeStart, end };
})();
