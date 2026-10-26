// The departures board: a stop's buses full screen, as an interchange's screens show them, for
// a TV, a spare monitor or a kiosk. Each bus, where it's going, its next three and how full
// they are; a page at a time, turning every PAGE_MS when there are more than fit, refreshed
// every REFRESH_MS. "Board" in a stop's tools opens it, and so does #board/84009, so a screen
// can be left on one. Full screen where the browser allows (the desktop app does).
// Loaded before script.js and uses its helpers (fetchArrivals, nameOf, ensureStopsIndex,
// loadTextClass, stopHash, busWays) only once the page is running. Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const REFRESH_MS = 20 * 1000;
  const PAGE_MS = 8 * 1000;
  const ROW_PX = 64;

  let board = null; // { code, services, ways, page, fetched, timers }

  const clock = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' });

  function when(bus, fetched) {
    if (!bus || bus.eta_ms == null) return '';
    const mins = Math.floor(Math.max(0, bus.eta_ms - (Date.now() - fetched)) / 60000);
    return `<span class="${loadTextClass(bus.load)}">${mins === 0 ? 'Arr' : `${mins}`}</span>`;
  }

  async function open(code) {
    if (!/^\d{5}$/.test(code)) return;
    close();
    board = { code, services: [], page: 0, fetched: 0, timers: [] };
    $('#boardScreen').hidden = false;
    document.body.classList.add('modal-open');
    history.replaceState(null, '', `#board/${code}`);
    // Only from a tap: a browser won't go full screen for a link opened by itself.
    if (navigator.userActivation?.isActive !== false) document.documentElement.requestFullscreen?.().catch(() => {});
    await ensureStopsIndex().catch(() => {});
    $('#boardStop').textContent = nameOf(code) || 'Bus stop';
    $('#boardCode').textContent = code;
    board.timers.push(setInterval(load, REFRESH_MS), setInterval(turn, PAGE_MS), setInterval(tick, 1000));
    tick();
    load();
  }

  async function load() {
    if (!board) return;
    const code = board.code;
    try {
      const data = await fetchArrivals(code);
      if (board?.code !== code) return;
      // A loop passing twice gets a row per time round, as on its cards (script.js).
      const { services, ways } = busWays(data?.services || []);
      board.services = services.sort((a, b) => (a.next?.eta_ms ?? Infinity) - (b.next?.eta_ms ?? Infinity));
      board.ways = ways;
      board.fetched = Date.now();
      $('#boardNote').textContent = '';
    } catch {
      $('#boardNote').textContent = 'Couldn’t refresh just now: these are the last timings.';
    }
    render();
  }

  function perPage() {
    // A row's real height, which enlarged text makes taller than ROW_PX (help desk #6).
    const row = $('#boardRows .boardRow:not(.boardLabels)');
    const h = Math.max(ROW_PX, row?.offsetHeight || 0);
    return Math.max(3, Math.floor(($('#boardRows').clientHeight || innerHeight * 0.7) / h));
  }

  function turn() {
    if (!board) return;
    const pages = Math.ceil(board.services.length / perPage());
    board.page = pages > 1 ? (board.page + 1) % pages : 0;
    render();
  }

  function tick() {
    $('#boardClock').textContent = clock();
    // The minutes count down between refreshes.
    if (board?.fetched) render();
  }

  function render() {
    if (!board) return;
    const n = perPage();
    const pages = Math.max(1, Math.ceil(board.services.length / n));
    if (board.page >= pages) board.page = 0;
    const rows = board.services.slice(board.page * n, board.page * n + n);
    $('#boardRows').innerHTML = rows.length
      ? rows.map((s) => {
        // A loop's row: which time round (script.js), not just where it ends.
        const way = board.ways?.get(s);
        const dest = way?.round ? way.label : s.next?.dest ? nameOf(s.next.dest) || s.next.dest : '';
        return `<div class="boardRow"><span class="boardNo">${esc(s.serviceNo)}</span><span class="boardTo">${esc(dest)}</span>` +
          `<span class="boardEta">${when(s.next, board.fetched)}</span><span class="boardEta">${when(s.next2, board.fetched)}</span>` +
          `<span class="boardEta">${when(s.next3, board.fetched)}</span></div>`;
      }).join('')
      : `<p class="boardEmpty">${board.fetched ? 'No live buses right now.' : 'Getting the timings…'}</p>`;
    $('#boardPage').textContent = pages > 1 ? `${board.page + 1} / ${pages}` : '';
  }

  function close() {
    if (!board) return;
    board.timers.forEach(clearInterval);
    board = null;
    $('#boardScreen').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.classList.toggle('modal-open', !!document.querySelector('.modal-backdrop:not(.hidden):not(.docked), .panelModal:not([hidden]):not(.docked)'));
    if (location.hash.startsWith('#board/')) history.replaceState(null, '', stopHash() || location.pathname);
  }

  function init() {
    $('#boardClose').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && board) close(); });
    window.addEventListener('resize', () => { if (board) render(); });
  }

  window.Board = { open, close };
  init();
})();
