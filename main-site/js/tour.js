// The tours (help desk #2): a few steps over a page showing what's on it, each a spotlight on
// the real thing with a chalk arrow to it and a line saying what it does. Next moves on, Skip
// in the corner ends it.
//
// - Every page in the Edge Tray has its own, shown the first time that page is (js/main-screen.js
//   fires "viewchange"). Glance's is the welcome: the first time the app opens it shows Glance,
//   then the Edge Tray and Settings, on whatever page is home, and not over a link that opened
//   something, which came for that; a page switched to later gets its own then.
// - Settings, Show me around, has a button for each page's, to see it again.
// - A tour switches to its page (Glance's only while Glance is on) and ends back on the page it
//   began on. A step whose thing isn't there (no trips yet, a button this phone hasn't) is left
//   out.
// - The views that aren't pages, the sgbus terminal and Explorer, each full screen over the page,
//   have one too (`view`): shown the first time the view opens (first(id), from js/terminal.js
//   and js/map.js), and from Settings opening the view (`open`) and leaving it open after.
// Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  // Glance's, the welcome, seen ("done"); and the other pages' seen, a list of their ids.
  const KEY = 'sgbus_tour';
  const PAGES_KEY = 'sgbus_tours';
  const PAD = 8;

  // Each page's: `steps` are `el` (what's lit) and `text` (what's said about it).
  const TOURS = {
    glance: {
      icon: 'eye',
      steps: [
        { el: '#glanceHero', text: 'Your next bus, big enough to read on the move. Tap it for all its times.' },
        { el: '#glanceSource', text: 'Pick whose buses: your saved stops, the ones nearby, or the ones near Home or Work.' },
        { el: '#glanceStops .glanceStop', text: 'Each bus on one line, with its next three times. Tap one for the full timings, and the star there saves the stop. Star a bus, and only your buses show here.' },
        { el: '#trayViews', text: 'Each page has its button at the top of the Edge Tray: Glance, Bus timings, Favourites, Navigate, alerts, your trips and places. Press and hold a button to see what it does.' },
        { el: '#settingsBtn', text: 'In Settings, Custom home picks the page the app opens on, and Show me around shows any page’s tour again.' },
      ],
    },
    timings: {
      icon: 'bus',
      steps: [
        { el: '.searchWrap', text: 'Look up any stop by its name or 5-digit code, the stops near an address by its postal code, or a bus by its number for its route.' },
        { el: '#voiceBtn', text: 'Or say it: a stop, a road or a bus number.' },
        { el: '#scanBtn', text: 'Or scan the code on a bus stop’s pole with the camera.' },
        { el: '#nearMeBtn', text: 'The stops around you, nearest first.' },
        { el: '#weatherBtn', text: 'Today’s weather and air, before you head out.' },
      ],
    },
    favs: {
      icon: 'star',
      steps: [
        { el: '#favStopsGroup:not([hidden])', text: 'Every stop you’ve starred. Tap one for its timings.' },
        { el: '#favBusesGroup:not([hidden])', text: 'Buses you’ve starred. Glance shows only these at your stops.' },
        { el: '#favRoutesGroup:not([hidden]), #favNavsGroup:not([hidden])', text: 'Journeys you’ve saved in Navigate, ready to plan again in a tap.' },
        { el: '#favEmpty:not([hidden])', text: 'Nothing here yet. Tap the star on a stop, a bus or a journey in Navigate, and it shows here.' },
      ],
    },
    nav: {
      icon: 'navigate',
      steps: [
        { el: '#navSection .navModes, #plannerSection .navModes', text: 'Bus and train plans with the MRT too; Bus only keeps to buses, stop to stop.' },
        { el: '#navSection .navFields, #plannerSection .plannerFields', text: 'Where from and where to: a place, an address, a stop, a postal code. Home, Work and your places are a tap away under each box.' },
        { el: '#navWhen, #routeWhen', text: 'Leave now, leave at a time, or arrive by one.' },
        { el: '#navBody [data-nav-option], #plannerBody [data-journey]', text: 'Your ways, quickest first. Open one for every part of it, which train door to stand at, and Start trip to be told when to get off.' },
        { el: '#navFavBtn, #routeFavBtn', text: 'Save the journey to Favourites, and Share sends it to someone.' },
      ],
    },
    alerts: {
      icon: 'bell',
      steps: [
        { el: '#alertModes', text: 'Be told about MRT and LRT disruptions and road incidents, even with the app closed: every update, disruptions only, or off.' },
        { el: '#alertsBody', text: 'What’s going on right now, on the trains and the roads.' },
      ],
    },
    trips: {
      icon: 'chart',
      steps: [
        { el: '#tripsBody .empty', text: 'Each trip you take with Start trip shows here. Start one from a way in Navigate, or a bus’s route.' },
        { el: '#tripsBody .statsSince', text: 'How many trips and rides you’ve taken, and how long on the move.' },
        { el: '#tripsBody .statsCard', text: 'How your time splits between walking, waiting and riding, and the buses and lines you ride most.' },
        { el: '#tripsBody .tripRowMain', text: 'Each trip, by week. Tap one for its rides and times, to take it again or share it.' },
      ],
    },
    places: {
      icon: 'bookmark',
      steps: [
        { el: '#placesList .placeRow', text: 'Home, Work and your own places. Tap one for the way there from where you are.' },
        { el: '#placesList .placeMore', text: 'The dots edit, share or delete it.' },
        { el: '#placeNewBtn', text: 'Add a place: the gym, school, a friend’s. Each one shows under From and To in Navigate, and on Glance.' },
      ],
    },
    // The views that aren't pages.
    explorer: {
      icon: 'map',
      label: 'Explorer',
      view: true,
      open: () => window.LiveMap?.explore(),
      isOpen: () => window.LiveMap?.mode() === 'explore',
      steps: [
        { el: '#mapSpot', text: 'Every bus stop round you is a white dot ringed in green, and every MRT and LRT station a dot in its line’s colour. Zoom in to see the stops.' },
        { el: '#mapSpot', text: 'Tap a dot for its card: a stop’s buses, green while running, red down to their last three, grey when not; a station’s doors to stand at on each platform. Every card has Directions.' },
        { el: '#mapHeading', text: 'The compass turns the map with you, the way your phone points up.' },
        { el: '#mapClose', text: 'Back closes Explorer. Its button in the Edge Tray can be turned off in Settings.' },
      ],
    },
    terminal: {
      icon: 'terminal',
      label: 'sgbus terminal',
      view: true,
      open: () => window.openTerminal?.(),
      isOpen: () => !!document.querySelector('#terminalModal:not(.hidden)'),
      after: () => document.getElementById('termIn')?.focus(),
      steps: [
        { el: '#terminalModal .termLine', text: 'Type a command, as on the Linux command line: a stop like 84009, a stop’s name, nav home work, favs. Tab finishes a word, and Up brings back the last one.' },
        { el: '#terminalModal .termScreen', text: 'The answers show here. Ctrl+C stops one that keeps updating, or clears the line; with text selected, it copies.' },
        { el: '#terminalModal .termClose', text: 'Esc, exit or this closes it. Ctrl+` opens it again on a computer, as does Settings.' },
      ],
    },
  };
  const PAGES = Object.keys(TOURS);

  let steps = [];
  let at = 0;
  let root = null;
  let began = null;
  let page = null;

  function seen(id) {
    try {
      if (id === 'glance') return localStorage.getItem(KEY) === 'done';
      return JSON.parse(localStorage.getItem(PAGES_KEY) || '[]').includes(id);
    } catch { return true; }
  }
  function markSeen(id) {
    try {
      if (id === 'glance') return localStorage.setItem(KEY, 'done');
      const list = JSON.parse(localStorage.getItem(PAGES_KEY) || '[]');
      if (!list.includes(id)) localStorage.setItem(PAGES_KEY, JSON.stringify([...list, id]));
    } catch { /* shown again next time */ }
  }

  // The first of a step's things there to light.
  const target = (s) => [...document.querySelectorAll(s.el)].find(visible) || null;

  function visible(el) {
    if (!el || el.closest('[hidden]')) return false;
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
    const el = steps[i].target;
    if (el.closest('#trayButtons') && document.documentElement.hasAttribute('data-tray-closed')) window.setTrayOpen?.(true);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    root.querySelector('.tourText').textContent = steps[i].text;
    root.querySelector('.tourDots').innerHTML = steps.map((_, n) => `<span${n === i ? ' class="on"' : ''}></span>`).join('');
    root.querySelector('.tourNext').textContent = i === steps.length - 1 ? 'Done' : 'Next';
    requestAnimationFrame(place);
    root.querySelector('.tourNext').focus({ preventScroll: true });
  }

  // The light round the step's thing, the card above or below it, whichever has more room, and
  // the arrow from the card's edge to the thing, bowed like a hand drew it.
  function place() {
    if (!root) return;
    const el = steps[at]?.target;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hole = root.querySelector('.tourHole');
    hole.style.left = `${r.left - PAD}px`;
    hole.style.top = `${r.top - PAD}px`;
    hole.style.width = `${r.width + PAD * 2}px`;
    hole.style.height = `${r.height + PAD * 2}px`;
    // Skip out of the way of what's lit, where that's in its corner.
    root.querySelector('.tourSkip').classList.toggle('right', r.left < 140 && r.top < 90);

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
    if (page) markSeen(page);
    const view = TOURS[page]?.view ? TOURS[page] : null;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    root?.remove();
    root = null;
    page = null;
    document.body.classList.remove('touring');
    const back = began;
    began = null;
    // A view's stays open, to be used.
    if (view) return view.after?.();
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Back where it began, which may be a page with a tour of its own still to see.
    if (back && window.MainScreen && MainScreen.active() !== back) MainScreen.open(back);
    else setTimeout(forPage, 600);
  }

  // A view's tour, over the view: opened first, from Settings, then a moment for it to draw.
  function startView(id) {
    const tour = TOURS[id];
    const wasOpen = tour.isOpen();
    // Marked as starting before the view opens, so its own first() doesn't start another.
    root = true;
    if (!wasOpen) tour.open();
    setTimeout(() => {
      root = null;
      if (!tour.isOpen()) return;
      steps = tour.steps.map((s) => ({ ...s, target: target(s) })).filter((s) => s.target);
      if (!steps.length) return markSeen(id);
      page = id;
      began = null;
      document.body.classList.add('touring');
      build();
      show(0);
    }, wasOpen ? 600 : 1500);
  }

  // A view's tour, the first time it opens (js/terminal.js, js/map.js).
  function first(id) {
    if (!TOURS[id]?.view || seen(id) || root) return;
    startView(id);
  }

  // `id`'s tour, on its page.
  function start(id = 'glance') {
    if (root || !TOURS[id]) return;
    if (TOURS[id].view) return startView(id);
    const from = window.MainScreen?.active() || null;
    const onPage = id !== 'glance' || window.Glance?.enabled();
    if (onPage && window.MainScreen && from !== id) MainScreen.open(id);
    // A moment for the page to draw what it shows, then the steps it has.
    root = true;
    setTimeout(() => {
      root = null;
      steps = TOURS[id].steps.map((s) => ({ ...s, target: target(s) })).filter((s) => s.target);
      if (!steps.length) {
        markSeen(id);
        if (from && window.MainScreen && MainScreen.active() !== from) MainScreen.open(from);
        return;
      }
      page = id;
      began = from;
      // The press-and-hold tip (js/ui.js) is the Edge Tray's step.
      if (id === 'glance') try { localStorage.setItem('sgbus_hold_hint', '1'); } catch { /* shown as well */ }
      document.body.classList.add('touring');
      build();
      show(0);
    }, from === id ? 0 : 400);
  }

  // Something over the page: a window, the live map or Explorer, or the terminal.
  const covered = () => document.body.classList.contains('modal-open') || document.body.classList.contains('map-open');

  // The page on show's tour, the first time: Glance's once it has its buses to show (or a few
  // seconds without), the others once drawn. Not while something's over the page.
  let waiting = null;
  function forPage() {
    const id = window.MainScreen?.active();
    if (!id || root || seen(id) || !TOURS[id] || TOURS[id].view) return;
    clearInterval(waiting);
    let tries = 0;
    waiting = setInterval(() => {
      tries++;
      if (MainScreen.active() !== id || root) return clearInterval(waiting);
      const hero = $('#glanceHero');
      const ready = id !== 'glance' || !window.Glance?.enabled() || (hero.textContent.trim() && !hero.textContent.includes('Getting the times'));
      if (ready ? tries < 2 : tries <= 16) return;
      clearInterval(waiting);
      if (!covered()) start(id);
    }, 500);
  }

  // At start: the welcome, unless a link opened something. On Glance it waits on its buses;
  // on another home (or with Glance off), it's Glance's page then back, or the tray and
  // Settings, and the home's own tour after.
  function maybeStart() {
    window.addEventListener('viewchange', forPage);
    if (location.hash.length > 1 || location.search) return;
    if (!seen('glance') && window.MainScreen?.active() !== 'glance') {
      setTimeout(() => { if (!covered()) start('glance'); }, 1500);
      return;
    }
    forPage();
  }

  // Settings' Show me around: a button for each page's tour, then the views'.
  function pickers() {
    return PAGES.filter((id) => id !== 'glance' || window.Glance?.enabled())
      .map((id) => `<button class="iconBtn" type="button" data-tour="${id}"><span class="ico" aria-hidden="true">${window.icon(TOURS[id].icon)}</span> ${TOURS[id].label || window.MainScreen?.label(id) || id}</button>`)
      .join('');
  }

  window.Tour = { start, first, maybeStart, end, pickers, PAGES };
})();
