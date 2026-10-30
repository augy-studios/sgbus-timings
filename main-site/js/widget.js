// The Bus timings widget page (widget.html), for the desktop app's widgets: the same setup and
// timings as the Windows 11 widget (sw.js) and the Android one (TimingsWidget.java).
//
// Its stop comes from the desktop app (window.sgbusDesktop.widget: get, save, close, onTop),
// which keeps each widget's own. Opened in a browser, it keeps one in localStorage instead.
// Timings refresh every REFRESH_MS while it's shown, and the minutes count down in between.
// Plain script: this project does not use ES modules.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const REFRESH_MS = 30 * 1000;
  const TICK_MS = 15 * 1000;
  const MAX_ROWS = 30;
  const LOCAL_KEY = 'sgbus_widget';

  const host = window.sgbusDesktop?.widget || {
    get: async () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { return null; } },
    save: async (c) => localStorage.setItem(LOCAL_KEY, JSON.stringify(c)),
    close: () => window.close(),
    onTop: async () => false,
  };
  if (!window.sgbusDesktop) $('#pin').hidden = true;

  let config = null; // { code, name, buses: [] }
  let data = null; // { at, rows: [{ service, arrivals: [ms] }], error }
  let timer = null;

  const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' });
  // Settings' Bus times, from the app's page (script.js's LS): Clock time shows when each comes.
  const clockTimes = () => { try { return localStorage.getItem('sgbus_times') === 'clock'; } catch { return false; } };
  const mins = (ms) => {
    if (clockTimes()) return clock(Math.max(ms, Date.now()));
    const m = Math.floor((ms - Date.now()) / 60000);
    return m < 1 ? 'Arr' : `${m} min`;
  };

  function favourites() {
    try {
      const v = JSON.parse(localStorage.getItem('sgbus_favs_v2') || '[]');
      return Array.isArray(v) ? v.filter((f) => /^\d{5}$/.test(f?.code)) : [];
    } catch {
      return [];
    }
  }

  // ---------- the timings ----------

  async function refresh() {
    if (!config) return;
    $('#refresh').disabled = true;
    try {
      const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(config.code)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const { services = [] } = await res.json();
      const now = Date.now();
      const wanted = config.buses.length ? services.filter((s) => config.buses.includes(String(s.serviceNo).toUpperCase())) : services;
      data = {
        at: now,
        rows: wanted.slice(0, MAX_ROWS).map((s) => ({
          service: s.serviceNo,
          arrivals: [s.next, s.next2, s.next3].filter((b) => b && b.eta_ms != null).map((b) => now + b.eta_ms),
        })),
      };
    } catch {
      data = { ...(data || { rows: [] }), error: true };
    } finally {
      $('#refresh').disabled = false;
    }
    draw();
  }

  function draw() {
    $('#title').textContent = config.name || `Bus stop ${config.code}`;
    $('#subtitle').textContent = `${config.code} · ${config.buses.length ? `Bus ${config.buses.join(', ')}` : 'Every bus'}`;
    if (!data) {
      $('#body').innerHTML = `<p class="note">Getting the timings…</p>`;
      $('#updated').textContent = '';
      return;
    }
    $('#body').innerHTML = data.rows.length
      ? data.rows.map((r) => `<div class="row" data-service="${esc(r.service)}"><span class="no">${esc(r.service)}</span>` +
        [0, 1, 2].map((i) => `<span>${r.arrivals[i] != null ? mins(r.arrivals[i]) : i === 0 ? 'No estimate' : ''}</span>`).join('') + `</div>`).join('')
      : `<p class="note">${data.error ? "Couldn't reach LTA. Tap refresh to try again." : config.buses.length ? 'None of those buses are due here right now.' : 'No buses are due here right now.'}</p>`;
    $('#updated').textContent = data.at ? `${data.error ? 'Offline · ' : ''}Updated ${clock(data.at)}` : '';
  }

  // ---------- setup ----------

  function setup(message = '') {
    clearInterval(timer);
    const favs = favourites();
    $('#title').textContent = 'Bus timings';
    $('#subtitle').textContent = 'Pick a stop';
    $('#updated').textContent = '';
    $('#body').innerHTML = `<form id="setup">` +
      (favs.length ? `<p>Your favourite stops</p><div class="favs">${favs.map((f) =>
        `<button type="button" data-code="${esc(f.code)}" data-name="${esc(f.name || '')}">${esc(f.name || f.code)} · ${esc(f.code)}</button>`).join('')}</div>`
        : `<p>Stops you save in the app show here to pick from.</p>`) +
      `<input id="code" inputmode="numeric" maxlength="5" placeholder="Bus stop code (5 digits)" value="${esc(config?.code || '')}">` +
      `<input id="buses" placeholder="Just these buses, e.g. 15, 62 (optional)" value="${esc(config?.buses?.join(', ') || '')}">` +
      `<p class="error" id="msg">${esc(message)}</p>` +
      `<button class="save" type="submit">Save</button></form>`;
    $('#setup').addEventListener('click', (e) => {
      const b = e.target.closest('[data-code]');
      if (!b) return;
      $('#code').value = b.dataset.code;
      $('#code').dataset.name = b.dataset.name;
      document.querySelectorAll('.favs button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#setup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = $('#code').value.trim();
      const buses = [...new Set($('#buses').value.toUpperCase().split(/[\s,]+/).filter(Boolean))];
      if (!/^\d{5}$/.test(code)) return ($('#msg').textContent = 'Pick a favourite, or type a 5-digit stop code.');
      if (buses.some((b) => !/^[0-9A-Z]{1,4}$/.test(b))) return ($('#msg').textContent = 'Bus numbers are like 21 or NR7, separated by commas.');
      const fav = favourites().find((f) => f.code === code);
      const name = fav?.name || (await stopName(code));
      config = { code, name, buses };
      await host.save(config);
      start();
    });
  }

  async function stopName(code) {
    try {
      const cached = JSON.parse(localStorage.getItem('sgbus_stops_v3') || 'null');
      if (cached?.[code]?.n) return cached[code].n;
      const stops = await (await fetch('/api/bus-stops')).json();
      return stops.find((s) => s.c === code)?.n || '';
    } catch {
      return '';
    }
  }

  function start() {
    data = null;
    draw();
    refresh();
    clearInterval(timer);
    let ticks = 0;
    timer = setInterval(() => {
      ticks += TICK_MS;
      if (ticks >= REFRESH_MS) {
        ticks = 0;
        if (document.visibilityState === 'visible') refresh();
      } else if (data) {
        draw();
      }
    }, TICK_MS);
  }

  // ---------- wiring ----------

  $('#refresh').addEventListener('click', refresh);
  $('#edit').addEventListener('click', () => setup());
  $('#close').addEventListener('click', () => host.close());
  $('#pin').addEventListener('click', async () => {
    const on = $('#pin').getAttribute('aria-pressed') !== 'true';
    $('#pin').setAttribute('aria-pressed', String(await host.onTop(on)));
  });
  // A bus opens its timings at the stop in the app's window.
  $('#body').addEventListener('click', (e) => {
    const row = e.target.closest('[data-service]');
    if (row && config) window.sgbusDesktop?.open?.(`#${config.code},${row.dataset.service}`);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && config && (!data || Date.now() - data.at > REFRESH_MS)) refresh();
  });

  (async () => {
    const saved = await host.get();
    if (saved?.code) {
      config = { code: saved.code, name: saved.name || '', buses: Array.isArray(saved.buses) ? saved.buses : [] };
      $('#pin').setAttribute('aria-pressed', String(!!saved.onTop));
      start();
    } else {
      setup();
    }
  })();
})();
