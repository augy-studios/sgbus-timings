// The live map's card for a stop or station tapped on it (js/map.js): Explorer's dots, and the
// stops and stations drawn on a trip or a walk. It opens out of the dot like a chat bubble, its
// tail on the dot, and stays there as the map moves (js/map-engine.js, hooks.onMove).
//
//   A bus stop   its number and name, and every bus that calls there as a pill to tap, for that
//                bus's timings at the stop (host.onTimings with the bus): green while
//                it's running, grey while it isn't (outside today's first and last bus, from
//                the route list, js/network.js), red once its last three buses of the day are
//                all that's left: its last bus is no later than the third coming (live
//                timings), or within LAST_MIN while fewer than three are on their way.
//   A station    its name, its codes in their lines' colours, and a page for each platform, a
//                direction each, with arrows at the sides (or a swipe): the doors nearest the
//                escalators, lifts and stairs, and where each leads (js/mrt-doors.js), drawn as
//                Navigate draws them (js/nav.js).
//
// Both end with Directions: Navigate's Bus and train, from where you are (openNavFromHere). A
// stop's has Show bus timings above it: the stop's timings on Bus timings, as a search opens
// them (host.onTimings).
// Plain script: exports go on window.
(function () {
  const LAST_MIN = 30;
  const SG_OFFSET_MS = 8 * 3600 * 1000;
  const DOOR_TYPE = { escalator: 'Escalator', lift: 'Lift', stairs: 'Stairs' };
  // Each line's colour, as js/map.js has them; LRT lines and anything else grey.
  const LINE_COLOURS = { EW: '#009645', CG: '#009645', NS: '#d42e12', NE: '#9900aa', CC: '#fa9e0d', CE: '#fa9e0d', DT: '#005ec4', TE: '#9d5b25', JS: '#0099aa', JE: '#0099aa', JW: '#0099aa', CR: '#97c616', CP: '#97c616' };
  const LRT = '#748477';
  const lineOf = (code) => String(code).toUpperCase().match(/^[A-Z]+/)?.[0] || '';
  const colourOf = (code) => LINE_COLOURS[lineOf(code).slice(0, 2)] || LRT;

  let host = null; // { panel, ink, onDirections, onTimings }
  let card = null;
  let at = null; // [lat, lng] of the dot
  let token = 0;

  const esc = (s) => escapeHtml(String(s ?? ''));
  const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  // ---------- where it sits ----------

  // Above the dot, its tail on it, unless there's no room under the map's top bar: then below.
  // Kept inside the screen's sides, the tail moved along to stay on the dot.
  function place() {
    if (!card || !at || !host) return;
    const panel = host.panel.getBoundingClientRect();
    const p = host.ink.toScreen(at);
    const off = p.x < -20 || p.y < -20 || p.x > panel.width + 20 || p.y > panel.height + 20;
    card.style.visibility = off ? 'hidden' : '';
    if (off) return;
    const top = (host.panel.querySelector('.mapTop')?.getBoundingClientRect().bottom ?? 0) - panel.top + 8;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const gap = 16;
    const below = p.y - gap - h < top;
    const x = Math.max(8, Math.min(panel.width - w - 8, p.x - w / 2));
    const y = below ? Math.min(panel.height - h - 8, p.y + gap) : p.y - gap - h;
    card.classList.toggle('below', below);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.setProperty('--tail-x', `${Math.max(20, Math.min(w - 20, p.x - x))}px`);
  }

  function close() {
    token++;
    card?.remove();
    card = null;
    at = null;
  }

  // The card's frame, its contents to come, in place of any card open: so the dot it's on is
  // set after this.
  function frame(label) {
    close();
    card = document.createElement('div');
    card.className = 'mapCard';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', label);
    card.innerHTML = '<div class="mcBubble"><div class="mcBody"></div></div>';
    card.addEventListener('click', (e) => {
      const timings = e.target.closest('[data-mc-timings]');
      if (e.target.closest('[data-mc-close]')) close();
      // Offline, Bus timings is away (js/offline.js), so a tap stays on the map: Explorer opens
      // offline once the map's saved (js/map-save.js), and its Show bus timings is hidden then.
      else if (timings) { if (!window.Offline?.on()) host.onTimings?.(timings.dataset.mcTimings, timings.dataset.mcBus || null); }
      else if (e.target.closest('[data-mc-go]')) go();
    });
    host.panel.appendChild(card);
    return card.querySelector('.mcBody');
  }

  let dest = null;
  function go() {
    if (dest) host.onDirections(dest);
  }

  const head = (inner) => `<div class="mcHead">${inner}<button class="icon-btn small mcClose" type="button" data-mc-close aria-label="Close">${ico('close')}</button></div>`;
  const foot = () => `<button class="btn mcGo" type="button" data-mc-go>${ico('navigate')} Directions</button>`;
  const timingsBtn = (code) => `<button class="btn mcGo" type="button" data-mc-timings="${esc(code)}">${ico('clock')} Show bus timings</button>`;

  // ---------- a bus stop ----------

  const sgMinutes = () => {
    const d = new Date(Date.now() + SG_OFFSET_MS);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const toMin = (s) => (/^\d\d:\d\d$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

  // 'on', 'last' or 'off' for a bus at a stop, by today's first and last bus and the minutes
  // to its next buses there (`etas`, null before they're in).
  function state(no, code, etas) {
    const fl = BusNet.isReady() ? BusNet.firstLast(no, code) : null;
    const first = toMin(fl?.first);
    const last = toMin(fl?.last);
    const now = sgMinutes();
    let running = false;
    let left = null;
    if (first != null && last != null) {
      // A last bus after midnight (00:30) is the day before's.
      if (last >= first) {
        running = now >= first && now <= last;
        left = last - now;
      } else {
        running = now >= first || now <= last;
        left = (now >= first ? last + 1440 : last) - now;
      }
    }
    if (etas?.length) running = true;
    if (!running) return 'off';
    if (left != null && left >= 0 && (etas?.length >= 3 ? left <= etas[2] + 1 : left <= LAST_MIN)) return 'last';
    return 'on';
  }

  async function stopCard(code) {
    const s = stopsIndex?.[code];
    if (!s) return;
    const body = frame(`Bus stop ${code}, ${s.n || ''}`);
    at = [s.lat, s.lng];
    dest = { label: s.n || code, lat: s.lat, lng: s.lng };
    const mine = token;
    const draw = (etas) => {
      if (mine !== token) return;
      const buses = BusNet.isReady() ? BusNet.servicesAtStop(code) : [];
      const pills = buses.length
        ? buses.map((no) => {
          const st = state(no, code, etas ? etas.get(no) || [] : null);
          const what = { on: 'running', last: 'last 3 buses of the day', off: 'not running now' }[st];
          return `<button class="svcPill ${st}" type="button" data-mc-timings="${esc(code)}" data-mc-bus="${esc(no)}" title="Bus ${esc(no)}: ${what}. Its timings here">${esc(no)}</button>`;
        }).join('')
        : '<p class="mcNote">No buses call here.</p>';
      body.innerHTML =
        head(`<span class="mcCode">${esc(code)}</span><div class="mcTitle"><strong>${esc(s.n || 'Bus stop')}</strong><span>${esc(s.road || '')}</span></div>`) +
        `<div class="mcPills">${pills}</div>` +
        (buses.length ? '<p class="mcKey"><span class="mcKeyDot on"></span>Running<span class="mcKeyDot last"></span>Last 3 buses<span class="mcKeyDot off"></span>Not running now</p>' : '') +
        timingsBtn(code) + foot();
      place();
    };
    draw(null);
    if (!BusNet.isReady()) {
      await BusNet.load(stopsIndex).catch(() => {});
      draw(null);
    }
    // The live timings, for what's running now and how many buses are left.
    try {
      const r = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const data = r.ok ? await r.json() : null;
      const etas = new Map();
      for (const svc of data?.services || []) {
        const mins = [svc.next, svc.next2, svc.next3].filter((b) => b?.eta_ms != null).map((b) => b.eta_ms / 60000);
        etas.set(svc.serviceNo, [...(etas.get(svc.serviceNo) || []), ...mins].sort((a, b) => a - b));
      }
      draw(etas);
    } catch { /* the timetable's word alone */ }
  }

  // ---------- a station ----------

  const leadText = (x) => (x === 'Exit' ? 'the exit' : /\b(Line|LRT)( towards |$)/.test(x) ? `the ${x}` : x);

  function slideHtml(p) {
    const colour = colourOf(p.code);
    const rows = p.rows.map((r) => `<li class="doorRow">${ico(DOOR_TYPE[r.t] ? r.t : 'train')}` +
      `<span class="doorChips">${r.doors.map((n) => `<span class="doorChip"><span class="doorTop">Door</span><b>${n}</b></span>`).join('')}</span>` +
      `<span class="doorWhere">${esc(DOOR_TYPE[r.t] || r.t)} to ${esc(listText(r.leads.map(leadText)))}</span></li>`).join('');
    return `<div class="mcDir" style="--line:${colour}">` +
      `<span class="lineCode" style="--line:${colour}">${esc(p.code)}</span>` +
      `<span class="mcDirText"><b>${p.last ? 'Trains end here' : `Towards ${esc(p.towards)}`}</b>${p.next ? `<span>Next: ${esc(p.next)}</span>` : ''}</span></div>` +
      (rows
        ? `<div class="legDoors" style="--line:${colour}"><ul class="doorRows">${rows}</ul>` +
          `<div class="doorFoot">${p.numberAt ? `${doorNumberAt(p.numberAt)}<span><b>Door number:</b> ${MrtDoors.NUMBER_AT[p.numberAt]}</span>` : '<span>Look for the number on each platform door</span>'}</div></div>`
        : '<p class="mcNote">No door details for this platform yet.</p>') +
      (p.cross.length ? `<p class="mcNote">${ico('swap')} Across the platform: ${esc(listText(p.cross))}</p>` : '');
  }

  async function stationCard(st) {
    const body = frame(`${st.name} station`);
    at = [st.lat, st.lng];
    dest = { label: `${st.name} station`, lat: st.lat, lng: st.lng };
    const mine = token;
    const codes = st.codes.map((c) => `<span class="lineCode" style="--line:${colourOf(c)}">${esc(c)}</span>`).join('');
    const top = head(`<div class="mcTitle"><strong>${esc(st.name)}</strong><span class="mcCodes">${codes}</span></div>`);
    body.innerHTML = `${top}<p class="mcNote">Finding the doors…</p>${foot()}`;
    place();
    await MrtDoors.load();
    if (mine !== token) return;
    const slides = MrtDoors.station(st.codes);
    if (!slides.length) {
      body.innerHTML = `${top}<p class="mcNote">No door details for this station yet.</p>${foot()}`;
      return place();
    }
    let i = 0;
    body.innerHTML = top +
      `<div class="mcCarousel">` +
      `<button class="mcArrow" type="button" data-mc-step="-1" aria-label="Previous direction">${ico('back')}</button>` +
      `<div class="mcSlide" aria-live="polite"></div>` +
      `<button class="mcArrow" type="button" data-mc-step="1" aria-label="Next direction">${ico('forward')}</button>` +
      `</div><p class="mcCount"></p>${foot()}`;
    const slide = body.querySelector('.mcSlide');
    const show = (step = 0) => {
      i = (i + step + slides.length) % slides.length;
      slide.innerHTML = slideHtml(slides[i]);
      slide.classList.remove('fromLeft', 'fromRight');
      if (step) {
        void slide.offsetWidth;
        slide.classList.add(step > 0 ? 'fromRight' : 'fromLeft');
      }
      body.querySelector('.mcCount').textContent = `${i + 1} of ${slides.length}`;
      body.querySelectorAll('.mcArrow').forEach((b) => { b.hidden = slides.length < 2; });
      place();
    };
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mc-step]');
      if (b) show(Number(b.dataset.mcStep));
    });
    // A swipe across the page turns it too.
    let x0 = null;
    slide.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    slide.addEventListener('pointerup', (e) => {
      if (x0 != null && Math.abs(e.clientX - x0) > 40) show(e.clientX < x0 ? 1 : -1);
      x0 = null;
    });
    show();
  }

  // ---------- opening ----------

  // `pick` is { kind: 'stop', code } or { kind: 'station', name, codes, lat, lng }.
  function open(pick, hostNow) {
    host = hostNow;
    if (pick?.kind === 'stop') return stopCard(pick.code);
    if (pick?.kind === 'station') return stationCard(pick);
    return null;
  }

  window.MapCard = { open, close, place, isOpen: () => !!card };
})();
