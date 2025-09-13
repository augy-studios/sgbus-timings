// ----------- Utilities -----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS = {
    nameKey: 'sgbus_name',
    favKey: 'sgbus_favourites',
    stopsCacheKey: 'sgbus_stops_v2',
    getName() {
        return localStorage.getItem(this.nameKey) || '';
    },
    setName(v) {
        localStorage.setItem(this.nameKey, v);
    },
    getFavs() {
        try {
            return JSON.parse(localStorage.getItem(this.favKey) || '[]')
        } catch {
            return []
        }
    },
    setFavs(arr) {
        localStorage.setItem(this.favKey, JSON.stringify(arr));
    },
    getStops() {
        try {
            return JSON.parse(localStorage.getItem(this.stopsCacheKey) || 'null')
        } catch {
            return null
        }
    },
    setStops(obj) {
        localStorage.setItem(this.stopsCacheKey, JSON.stringify(obj));
    }
}

function getGreeting(now = new Date()) {
    const h = now.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
}

function updateGreeting() {
    const name = LS.getName();
    const g = getGreeting();
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

function msToMins(ms) {
    if (ms == null) return '—';
    const sec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(sec / 60),
        s = sec % 60;
    return m > 0 ? `${m} min${m>1?'s':''}${s?` ${s}s`:''}` : `${s}s`;
}

function loadClass(load) {
    switch ((load || '').toUpperCase()) {
        case 'SEA':
            return 'load-ok';
        case 'SDA':
            return 'load-warn';
        case 'LSD':
            return 'load-busy';
        default:
            return '';
    }
}

function haversine(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(v => v == null)) return null;
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function loadTextClass(load) {
    switch ((load || '').toUpperCase()) {
        case 'SEA':
            return 'load-ok';
        case 'SDA':
            return 'load-warn';
        case 'LSD':
            return 'load-busy';
        default:
            return '';
    }
}

// ----------- Stops index (no lat/long shown) -----------
let stopsIndex = null; // { code -> {n:name} }

async function ensureStopsIndex() {
    if (stopsIndex) return stopsIndex;
    const cached = LS.getStops();
    if (cached) {
        stopsIndex = cached;
        return cached;
    }
    try {
        // Public, no-key dataset from BusRouter SG
        const url = 'https://busrouter.sg/data/2/stops.min.json';
        const res = await fetch(url, {
            cache: 'force-cache'
        });
        if (!res.ok) throw new Error('Failed to load stops');
        const raw = await res.json();
        // raw is array: [code, name, lat, lng]
        const map = {};
        for (const row of raw) {
            map[row[0]] = {
                n: row[1],
                lat: row[2],
                lng: row[3]
            };
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
    acData = Object.entries(idx).map(([code, v]) => ({
        code,
        name: v.n
    }));
}

function matchStops(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const isCode = /^\d{5}$/.test(q);
    const list = acData.filter(it => isCode ? it.code.startsWith(q) : it.name.toLowerCase().includes(q)).slice(0, 20);
    return list;
}

function renderAc(list) {
    const box = $('#acList');
    if (!list.length) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    box.innerHTML = list.map(it => `<div class="acItem" data-code="${it.code}"><span class="code">${it.code}</span><span class="name">${escapeHtml(it.name)}</span></div>`).join('');
    box.hidden = false;
}

function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    } [m]));
}

// ----------- Favourites -----------
function renderFavs() {
    const favs = LS.getFavs();
    const wrap = $('#favChips');
    wrap.innerHTML = favs.map(code => {
        const nm = nameOf(code) || 'Bus Stop';
        return `<button class="chip" data-fav="${code}" title="Show timings for ${code}"><span class="code">${code}</span><span class="name">${escapeHtml(nm)}</span><button class="remove" data-remove="${code}" title="Remove">✕</button></button>`
    }).join('');
    $('#favEmpty').hidden = favs.length > 0;
}

function addFav(code) {
    if (!/^\d{5}$/.test(code)) return;
    const favs = LS.getFavs();
    if (!favs.includes(code)) {
        favs.push(code);
        LS.setFavs(favs);
        renderFavs();
    }
}

function removeFav(code) {
    const favs = LS.getFavs().filter(c => c !== code);
    LS.setFavs(favs);
    renderFavs();
}

// ----------- Arrivals -----------
async function fetchArrivals(code, service) {
    const qs = new URLSearchParams({
        stop: code
    });
    if (service) qs.set('service', service);
    const res = await fetch(`/api/bus-arrivals?` + qs.toString(), {
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch arrivals');
    return await res.json();
}

function renderArrivals(code, data, {
    filterService = null
} = {}) {
    $('#resultCard').hidden = false;
    $('#stopCode').textContent = code;
    const nm = nameOf(code) || '';
    $('#stopName').textContent = nm || 'Bus Stop';

    const svcWrap = $('#services');
    let svcs = data?.services || [];
    if (filterService) svcs = svcs.filter(s => (s.serviceNo || '').toUpperCase() === filterService.toUpperCase());

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
        const mins = msToMins(bus.eta_ms);
        const cls = loadTextClass(bus.load);
        const dist = (bus.lat != null && bus.lng != null && stopLat != null && stopLng != null) ?
            ` ~ ${haversine(bus.lat,bus.lng,stopLat,stopLng)}m away` : '';
        const num = `<strong class="${cls}">${mins}</strong>`;
        const maybeItalicOpen = bus.rough ? '<i>' : '';
        const maybeItalicClose = bus.rough ? '</i>' : '';
        const wheelchair = bus.wheelchair ? `<span class="badge"><i class="fa-solid fa-wheelchair"></i> Wheelchair</span>` : '';
        const deck = `<span class="badge">${bus.deck}</span>`;
        const info = `<div class="badges">${wheelchair}${deck}${dist ? `<span class="badge">${dist}</span>`:''}</div>`;
        return `<div class="eta">${maybeItalicOpen}${num}${maybeItalicClose}${info}</div>`;
    };

    const html = svcs.map(s => {
        const n1 = piece(s.next);
        const n2 = piece(s.next2);
        const n3 = piece(s.next3);
        const svcNo = s.serviceNo || '?';
        return `
      <div class="svc" data-svc="${svcNo}">
        <div class="svcNo">${svcNo}</div>
        <div class="etaWrap">
          ${n1}${n2}${n3}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <button class="viewRouteBtn" data-view-route="${svcNo}">View Route</button>
        </div>
      </div>`;
    }).join('');

    svcWrap.innerHTML = html;
}

async function loadStop(code, {
    service = null,
    pushHistory = true
} = {}) {
    if (!/^\d{5}$/.test(code)) {
        alert('Please enter a valid 5-digit bus stop code.');
        return;
    }
    $('#q').value = service ? `${code} ${service}` : code;
    $('#acList').hidden = true;
    try {
        $('#services').innerHTML = '<div class="empty">Loading live arrivals…</div>';
        const data = await fetchArrivals(code, service);
        renderArrivals(code, data, {
            filterService: service
        });
        if (pushHistory) history.replaceState({
            code,
            service
        }, '', `#${code}${service?','+service:''}`);
    } catch (e) {
        console.error(e);
        $('#services').innerHTML = '<div class="empty">Could not load arrivals. Please try again.</div>';
        $('#resultCard').hidden = false;
        $('#stopName').textContent = nameOf(code) || 'Bus Stop';
        $('#stopCode').textContent = code;
    }
}

// ----------- Events -----------
$('#titleBtn').addEventListener('click', promptName);
$('#searchBtn').addEventListener('click', () => {
    const v = $('#q').value.trim();
    // Find first 5-digit code
    const stopMatch = v.match(/\b\d{5}\b/);
    // Find potential service number like "2", "15", "70A", "971E"
    const svcMatch = v.match(/\b\d{1,3}[A-Z]?\b/i);

    if (stopMatch) {
        const code = stopMatch[0];
        // If svcMatch is same token as code length=5, ignore; else use it
        const service = (svcMatch && svcMatch[0] !== code) ? svcMatch[0].toUpperCase() : null;
        loadStop(code, {
            service
        });
    } else {
        // treat as name search
        const first = matchStops(v)[0];
        if (first) loadStop(first.code);
        else alert('Type a bus stop name, a bus number, or a 5-digit bus stop code.');
    }
});
$('#refreshBtn').addEventListener('click', () => {
    const code = $('#q').value.trim().match(/\d{5}/)?.[0];
    if (code) loadStop(code, {
        pushHistory: false
    });
});
$('#refreshAllBtn').addEventListener('click', () => {
    const favs = LS.getFavs();
    if (!favs.length) return;
    // Refresh current if present; otherwise load first favourite
    const code = $('#q').value.trim().match(/\d{5}/)?.[0] || favs[0];
    loadStop(code, {
        pushHistory: false
    });
});
$('#addFavBtn').addEventListener('click', () => {
    const code = $('#q').value.trim().match(/\d{5}/)?.[0];
    if (code) {
        addFav(code);
    }
});

// favourites chip clicks
$('#favChips').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
        removeFav(rm.getAttribute('data-remove'));
        return;
    }
    const chip = e.target.closest('[data-fav]');
    if (chip) {
        loadStop(chip.getAttribute('data-fav'));
    }
});

// autocomplete interactions
$('#q').addEventListener('input', (e) => {
    const list = matchStops(e.target.value);
    renderAc(list);
});
$('#q').addEventListener('focus', (e) => {
    const list = matchStops(e.target.value);
    renderAc(list);
});
$('#q').addEventListener('blur', () => setTimeout(() => $('#acList').hidden = true, 120));
$('#acList').addEventListener('click', (e) => {
    const item = e.target.closest('.acItem');
    if (!item) return;
    const code = item.getAttribute('data-code');
    $('#q').value = code;
    $('#acList').hidden = true;
    loadStop(code);
});

// Enter key
$('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        $('#searchBtn').click();
    }
});

// ----- Bus Service Info Modal -----
const modal = $('#svcModal');
$('#services').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-view-route]');
    if (!btn) return;
    const svc = btn.getAttribute('data-view-route');

    // Fetch service info (routes in both directions)
    const res = await fetch(`/api/bus-service-info?service=${encodeURIComponent(svc)}`);
    const info = await res.json();

    // Meta (operators + interchanges)
    const t = info.terminals || {};
    const nameOfOr = (c) => c ? (nameOf(c) || c) : '—';
    $('#svcMeta').innerHTML = `
    <div><strong>Service:</strong> ${svc}</div>
    <div><strong>Operator(s):</strong> ${(info.operators||[]).join(', ') || '—'}</div>
    <div><strong>Interchanges:</strong>
      Dir 1: ${nameOfOr(t.dir1?.first)} → ${nameOfOr(t.dir1?.last)} &nbsp;&nbsp;|&nbsp;&nbsp;
      Dir 2: ${nameOfOr(t.dir2?.first)} → ${nameOfOr(t.dir2?.last)}
    </div>
  `;

    // Store routes in memory for the tab switcher
    modal._routes = {
        1: info.route1 || [],
        2: info.route2 || []
    };
    modal._service = svc;

    // Default to Dir 1
    renderRouteList(1);
    modal.hidden = false;
});

$('#modalClose').addEventListener('click', () => modal.hidden = true);
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
});

$('.dirTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    $$('.tab').forEach(t => t.classList.remove('active'));
    b.classList.add('active');
    renderRouteList(Number(b.getAttribute('data-dir')));
});

function renderRouteList(dir) {
    const code = $('#stopCode').textContent.trim();
    const list = modal._routes?. [dir] || [];
    const html = list.map(row => {
        const nm = nameOf(row.stopCode) || row.stopCode;
        const me = (row.stopCode === code) ? ' me' : '';
        return `<div class="routeStop${me}">
      <span class="seq">${row.seq}</span>
      <span class="name">${escapeHtml(nm)}</span>
      <span class="pill">${row.stopCode}</span>
    </div>`;
    }).join('') || '<div class="empty">No route data.</div>';
    $('#routeList').innerHTML = html;
}

// ----------- Init -----------
(async function init() {
    updateGreeting();
    setInterval(updateGreeting, 30_000);
    await buildAc();
    renderFavs();
    // Load stop from hash or last favourite
    const hash = location.hash.replace('#', '');
    const [hashCode, hashSvc] = hash.split(',');
    if (/^\d{5}$/.test(hashCode)) loadStop(hashCode, {
        service: hashSvc || null,
        pushHistory: false
    });
    else if (LS.getFavs()[0]) loadStop(LS.getFavs()[0], {
        pushHistory: false
    });
})();