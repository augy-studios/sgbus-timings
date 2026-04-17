// ----------- Utilities -----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS = {
    nameKey:       'sgbus_name',
    favKey:        'sgbus_favs_v2',
    stopsCacheKey: 'sgbus_stops_v3',
    themeKey:      'sgbus_theme',

    getName()  { return localStorage.getItem(this.nameKey) || ''; },
    setName(v) { localStorage.setItem(this.nameKey, v); },

    getFavs() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.favKey) || 'null');
            if (Array.isArray(raw)) return raw;
            // Migrate from old string[] format
            const old = JSON.parse(localStorage.getItem('sgbus_favourites') || '[]');
            if (Array.isArray(old) && old.length) {
                const migrated = old.map(c => (typeof c === 'string' ? { code: c, name: '' } : c));
                this.setFavs(migrated);
                return migrated;
            }
            return [];
        } catch { return []; }
    },
    setFavs(arr) { localStorage.setItem(this.favKey, JSON.stringify(arr)); },

    getStops() {
        try { return JSON.parse(localStorage.getItem(this.stopsCacheKey) || 'null'); }
        catch { return null; }
    },
    setStops(obj) { localStorage.setItem(this.stopsCacheKey, JSON.stringify(obj)); },

    getTheme()  { return localStorage.getItem(this.themeKey) || 'classic'; },
    setTheme(v) { localStorage.setItem(this.themeKey, v); },
};

// ----------- Theme -----------
function applyTheme(themeId) {
    document.documentElement.setAttribute('data-theme', themeId);
    LS.setTheme(themeId);
    $$('.themeOption').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === themeId);
    });
}

// ----------- Greeting -----------
function getGreeting(now = new Date()) {
    const h = now.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
}

function updateGreeting() {
    const name = LS.getName();
    const g    = getGreeting();
    $('#greeting').textContent = name ? `${g}, ${name}!` : `${g}!`;
}

async function promptName() {
    const current = LS.getName();
    const v = prompt('Your name for a friendly greeting:', current || '');
    if (v !== null) {
        LS.setName(v.trim());
        updateGreeting();
    }
}

// ----------- Helpers -----------
function msToMins(ms) {
    if (ms == null) return '—';
    const sec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} min${m > 1 ? 's' : ''}${s ? ` ${s}s` : ''}` : `${s}s`;
}

function loadTextClass(load) {
    switch ((load || '').toUpperCase()) {
        case 'SEA': return 'load-ok';
        case 'SDA': return 'load-warn';
        case 'LSD': return 'load-busy';
        default:    return '';
    }
}

function haversine(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(v => v == null)) return null;
    const R      = 6371000;
    const toRad  = d => d * Math.PI / 180;
    const dLat   = toRad(lat2 - lat1);
    const dLon   = toRad(lon2 - lon1);
    const a      = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// ----------- Stops Index -----------
let stopsIndex = null;

async function ensureStopsIndex() {
    if (stopsIndex) return stopsIndex;
    const cached = LS.getStops();
    if (cached) { stopsIndex = cached; return cached; }
    try {
        const res = await fetch('/api/bus-stops');
        if (!res.ok) throw new Error('Failed to load stops');
        const raw = await res.json();
        const map = {};
        for (const row of raw) {
            map[row.c] = { n: row.n, road: row.r, lat: row.la, lng: row.lo };
        }
        LS.setStops(map);
        stopsIndex = map;
        return map;
    } catch (e) {
        console.warn('Stops index failed:', e);
        stopsIndex = {};
        return stopsIndex;
    }
}

function nameOf(code) {
    return (stopsIndex && stopsIndex[code] && stopsIndex[code].n) || '';
}

// ----------- Autocomplete -----------
let acData = [];

async function buildAc() {
    const idx = await ensureStopsIndex();
    acData = Object.entries(idx).map(([code, v]) => ({ code, name: v.n, road: v.road || '' }));
}

function matchStops(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const isCode = /^\d+$/.test(q);
    return acData
        .filter(it => isCode
            ? it.code.startsWith(q)
            : it.name.toLowerCase().includes(q) || it.road.toLowerCase().includes(q))
        .slice(0, 20);
}

function renderAc(list) {
    const box = $('#acList');
    if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = list.map(it =>
        `<div class="acItem" data-code="${it.code}">` +
        `<span class="code">${it.code}</span>` +
        `<span class="name">${escapeHtml(it.name)}${it.road ? `<span class="road"> · ${escapeHtml(it.road)}</span>` : ''}</span>` +
        `</div>`
    ).join('');
    box.hidden = false;
}

// ----------- Favourites -----------
function renderFavs() {
    const favs  = LS.getFavs();
    const wrap  = $('#favChips');
    wrap.innerHTML = favs.map(({ code, name }) => {
        const displayName = name || nameOf(code) || 'Bus Stop';
        return `<button class="chip" data-fav="${escapeHtml(code)}" title="${escapeHtml(displayName)} (${escapeHtml(code)})">` +
            `<span class="code">${escapeHtml(code)}</span>` +
            `<span class="name">${escapeHtml(displayName)}</span>` +
            `<button class="remove" data-remove="${escapeHtml(code)}" title="Remove from favourites"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>` +
            `</button>`;
    }).join('');
    $('#favEmpty').hidden = favs.length > 0;
}

function addFav(code) {
    if (!/^\d{5}$/.test(code)) return;
    const favs = LS.getFavs();
    if (!favs.some(f => f.code === code)) {
        const name = nameOf(code) || '';
        favs.push({ code, name });
        LS.setFavs(favs);
        renderFavs();
    }
}

function removeFav(code) {
    LS.setFavs(LS.getFavs().filter(f => f.code !== code));
    renderFavs();
}

// ----------- Incoming Buses Bar -----------
function renderIncomingBar(data) {
    const bar       = $('#incomingBar');
    const container = $('#incomingBuses');
    const svcs      = data?.services || [];

    const items = svcs
        .filter(s => s.next && s.next.eta_ms != null)
        .map(s => ({ svcNo: s.serviceNo, eta_ms: s.next.eta_ms, load: s.next.load }))
        .sort((a, b) => a.eta_ms - b.eta_ms);

    if (!items.length) { bar.hidden = true; return; }

    container.innerHTML = items.map(item => {
        const secs      = Math.max(0, Math.round(item.eta_ms / 1000));
        const m         = Math.floor(secs / 60), s = secs % 60;
        const timeLabel = m > 0 ? `${m} min` : `${s}s`;
        const cls       = loadTextClass(item.load);
        return `<div class="incomingBusItem">` +
            `<div class="incomingBusTime${cls ? ' ' + cls : ''}">${timeLabel}</div>` +
            `<div class="incomingBusNo">${escapeHtml(item.svcNo)}</div>` +
            `</div>`;
    }).join('');

    bar.hidden = false;
}

// ----------- Arrivals -----------
async function fetchArrivals(code, service) {
    const qs = new URLSearchParams({ stop: code });
    if (service) qs.set('service', service);
    const res = await fetch(`/api/bus-arrivals?${qs}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch arrivals');
    return res.json();
}

function renderArrivals(code, data, { filterService = null } = {}) {
    $('#resultCard').hidden = false;
    $('#stopCode').textContent = code;
    const nm = nameOf(code) || '';
    $('#stopName').textContent = nm || 'Bus Stop';

    const svcWrap = $('#services');
    let svcs = data?.services || [];
    if (filterService) svcs = svcs.filter(s => (s.serviceNo || '').toUpperCase() === filterService.toUpperCase());

    renderIncomingBar({ services: svcs });

    if (!svcs.length) {
        svcWrap.innerHTML = '';
        $('#emptySvc').hidden = false;
        return;
    }
    $('#emptySvc').hidden = true;

    const stopLat = stopsIndex?.[code]?.lat ?? null;
    const stopLng = stopsIndex?.[code]?.lng ?? null;

    const piece = (bus) => {
        if (!bus) return `<div class="eta"><strong>—</strong></div>`;
        const mins  = msToMins(bus.eta_ms);
        const cls   = loadTextClass(bus.load);
        const dist  = (bus.lat != null && bus.lng != null && stopLat != null && stopLng != null)
            ? ` ~ ${haversine(bus.lat, bus.lng, stopLat, stopLng)}m` : '';
        const maybei  = bus.rough ? '<i>' : '';
        const maybei2 = bus.rough ? '</i>' : '';
        const wheelchair = bus.wheelchair ? `<span class="badge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M192 96a48 48 0 1 0 0-96 48 48 0 1 0 0 96zM120.5 247.2c12.4-4.7 18.7-18.5 14-30.9s-18.5-18.7-30.9-14C43.1 225.1 0 283.5 0 352c0 88.4 71.6 160 160 160c61.2 0 114.3-34.3 141.2-84.7c6.2-11.7 1.8-26.2-9.9-32.5s-26.2-1.8-32.5 9.9C240 440 202.8 464 160 464C98.1 464 48 413.9 48 352c0-47.9 30.1-88.8 72.5-104.8zM259.8 176l-1.9-9.7c-4.5-22.3-24-38.3-46.8-38.3c-30.1 0-52.7 27.5-46.8 57l23.1 115.5c6 29.9 32.2 51.4 62.8 51.4h5.1c.4 0 .8 0 1.3 0h94.1c6.7 0 12.6 4.1 15 10.4L402 459.2c6 16.1 23.8 24.6 40.1 19.1l48-16c16.8-5.6 25.8-23.7 20.2-40.5s-23.7-25.8-40.5-20.2l-18.7 6.2-25.5-68c-11.7-31.2-41.6-51.9-74.9-51.9H282.2l-9.6-48H336c17.7 0 32-14.3 32-32s-14.3-32-32-32H259.8z"/></svg> Wheelchair</span>` : '';
        const deck  = `<span class="badge">${escapeHtml(bus.deck || '')}</span>`;
        const distBadge = dist ? `<span class="badge">${dist}</span>` : '';
        const badges = `<div class="badges">${wheelchair}${deck}${distBadge}</div>`;
        return `<div class="eta">${maybei}<strong class="${cls}">${mins}</strong>${maybei2}${badges}</div>`;
    };

    svcWrap.innerHTML = svcs.map(s => {
        const svcNo = s.serviceNo || '?';
        return `<div class="svc" data-svc="${escapeHtml(svcNo)}">` +
            `<div class="svcLeft">` +
            `<div class="svcNo">${escapeHtml(svcNo)}</div>` +
            `<button class="viewRouteBtn" data-view-route="${escapeHtml(svcNo)}">Route</button>` +
            `</div>` +
            `<div class="etaWrap">${piece(s.next)}${piece(s.next2)}${piece(s.next3)}</div>` +
            `</div>`;
    }).join('');
}

async function loadStop(code, { service = null, pushHistory = true } = {}) {
    if (!/^\d{5}$/.test(code)) { alert('Please enter a valid 5-digit bus stop code.'); return; }
    $('#q').value   = service ? `${code} ${service}` : code;
    $('#acList').hidden = true;
    try {
        $('#services').innerHTML = '<div class="empty">Loading live arrivals&hellip;</div>';
        $('#resultCard').hidden  = false;
        $('#incomingBar').hidden = true;
        const data = await fetchArrivals(code, service);
        renderArrivals(code, data, { filterService: service });
        if (pushHistory) history.replaceState({ code, service }, '', `#${code}${service ? ',' + service : ''}`);
    } catch (e) {
        console.error(e);
        $('#services').innerHTML = '<div class="empty">Could not load arrivals. Please try again.</div>';
        $('#resultCard').hidden  = false;
        $('#stopName').textContent = nameOf(code) || 'Bus Stop';
        $('#stopCode').textContent  = code;
    }
}

// ----------- Bus Service Modal -----------
const modal = $('#svcModal');

$('#services').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-view-route]');
    if (!btn) return;
    const svc = btn.getAttribute('data-view-route');
    try {
        const res  = await fetch(`/api/bus-service-info?service=${encodeURIComponent(svc)}`);
        const info = await res.json();
        const t    = info.terminals || {};
        const nameOfOr = c => c ? (nameOf(c) || c) : '—';

        // Determine which direction the current stop belongs to
        const currentStop = $('#stopCode').textContent.trim();
        const inDir1 = (info.route1 || []).some(r => r.stopCode === currentStop);
        const inDir2 = (info.route2 || []).some(r => r.stopCode === currentStop);
        const activeDir = (!inDir1 && inDir2) ? 2 : 1;

        const dir2Exists = !!t.dir2?.first;
        const dirLine = (dir, terminals) => {
            const isCurrent = dir === activeDir;
            return `<div><strong>Dir ${dir}${isCurrent ? ' (current)' : ''}:</strong> ` +
                `${escapeHtml(nameOfOr(terminals?.first))} &rarr; ${escapeHtml(nameOfOr(terminals?.last))}</div>`;
        };

        $('#svcMeta').innerHTML =
            `<div><strong>Service:</strong> ${escapeHtml(svc)}</div>` +
            `<div><strong>Operator(s):</strong> ${escapeHtml((info.operators || []).join(', ') || '—')}</div>` +
            dirLine(1, t.dir1) +
            (dir2Exists ? dirLine(2, t.dir2) : '');

        modal._routes  = { 1: info.route1 || [], 2: info.route2 || [] };
        modal._service = svc;

        // Show/hide the Direction 2 tab depending on whether that direction exists
        $$('.tab[data-dir="2"]').forEach(tab => { tab.hidden = !dir2Exists; });
        $$('.tab').forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-dir') === String(activeDir)));
        renderRouteList(activeDir);
        modal.hidden = false;
    } catch (e) {
        console.error(e);
        alert('Could not load route information.');
    }
});

$('#modalClose').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

$('.dirTabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (!b) return;
    $$('.tab').forEach(t => t.classList.remove('active'));
    b.classList.add('active');
    renderRouteList(Number(b.getAttribute('data-dir')));
});

function renderRouteList(dir) {
    const code = $('#stopCode').textContent.trim();
    const list = modal._routes?.[dir] || [];
    $('#routeList').innerHTML = list.map(row => {
        const nm = nameOf(row.stopCode) || row.stopCode;
        const me = row.stopCode === code ? ' me' : '';
        return `<div class="routeStop${me}">` +
            `<span class="seq">${row.seq}</span>` +
            `<span class="name">${escapeHtml(nm)}</span>` +
            `<span class="pill">${escapeHtml(row.stopCode)}</span>` +
            `</div>`;
    }).join('') || '<div class="empty">No route data.</div>';
}

// ----------- Theme Modal -----------
const themeModal = $('#themeModal');

$('#themeBtn').addEventListener('click', () => {
    applyTheme(LS.getTheme()); // Refresh active state
    themeModal.hidden = false;
});

$('#themeModalClose').addEventListener('click', () => { themeModal.hidden = true; });
themeModal.addEventListener('click', e => { if (e.target === themeModal) themeModal.hidden = true; });

$('.themeGrid').addEventListener('click', e => {
    const opt = e.target.closest('.themeOption');
    if (!opt) return;
    applyTheme(opt.getAttribute('data-theme'));
});

// ----------- Search / Favourites Events -----------
$('#titleBtn').addEventListener('click', promptName);

$('#searchBtn').addEventListener('click', () => {
    const v = $('#q').value.trim();
    const stopMatch = v.match(/\b\d{5}\b/);
    const svcMatch  = v.match(/\b\d{1,3}[A-Z]?\b/i);
    if (stopMatch) {
        const code    = stopMatch[0];
        const service = (svcMatch && svcMatch[0] !== code) ? svcMatch[0].toUpperCase() : null;
        loadStop(code, { service });
    } else {
        const first = matchStops(v)[0];
        if (first) loadStop(first.code);
        else alert('Type a bus stop name or 5-digit stop code.');
    }
});

$('#refreshBtn').addEventListener('click', () => {
    const code = $('#stopCode').textContent.trim();
    if (/^\d{5}$/.test(code) && code !== '—') loadStop(code, { pushHistory: false });
});

$('#refreshAllBtn').addEventListener('click', () => {
    const favs = LS.getFavs();
    if (!favs.length) return;
    const activeCode = $('#stopCode').textContent.trim();
    const code = (/^\d{5}$/.test(activeCode) && activeCode !== '—') ? activeCode : favs[0].code;
    loadStop(code, { pushHistory: false });
});

$('#addFavBtn').addEventListener('click', () => {
    const displayed = $('#stopCode').textContent.trim();
    const fromInput = $('#q').value.trim().match(/\d{5}/)?.[0];
    const code = (/^\d{5}$/.test(displayed) && displayed !== '—') ? displayed : fromInput;
    if (code) addFav(code);
    else alert('Search for a bus stop first.');
});

$('#favChips').addEventListener('click', e => {
    const rm   = e.target.closest('[data-remove]');
    if (rm) { removeFav(rm.getAttribute('data-remove')); return; }
    const chip = e.target.closest('[data-fav]');
    if (chip)  loadStop(chip.getAttribute('data-fav'));
});

$('#q').addEventListener('input',  e  => renderAc(matchStops(e.target.value)));
$('#q').addEventListener('focus',  e  => renderAc(matchStops(e.target.value)));
$('#q').addEventListener('blur',   () => setTimeout(() => { $('#acList').hidden = true; }, 150));
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') $('#searchBtn').click(); });

$('#acList').addEventListener('click', e => {
    const item = e.target.closest('.acItem');
    if (!item) return;
    const code = item.getAttribute('data-code');
    $('#q').value      = code;
    $('#acList').hidden = true;
    loadStop(code);
});

// ----------- Init -----------
(async function init() {
    // Apply stored theme (also done inline in <head> to prevent flash)
    applyTheme(LS.getTheme());

    updateGreeting();
    setInterval(updateGreeting, 30_000);

    await buildAc();
    renderFavs();

    const hash          = location.hash.replace('#', '');
    const [hashCode, hashSvc] = hash.split(',');
    if (/^\d{5}$/.test(hashCode)) {
        loadStop(hashCode, { service: hashSvc || null, pushHistory: false });
    } else if (LS.getFavs()[0]) {
        loadStop(LS.getFavs()[0].code, { pushHistory: false });
    }
})();
