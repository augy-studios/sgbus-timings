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
                n: row[1]
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
async function fetchArrivals(code) {
    const u = `https://arrivelah2.busrouter.sg/?id=${encodeURIComponent(code)}&rand=${Date.now()}`;
    const res = await fetch(u, {
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch arrivals');
    return await res.json();
}

function renderArrivals(code, data) {
    $('#resultCard').hidden = false;
    $('#stopCode').textContent = code;
    const nm = nameOf(code) || data?.stop_name || '';
    $('#stopName').textContent = nm || 'Bus Stop';

    const svcWrap = $('#services');
    const svcs = (data && data.services) || [];
    if (!svcs.length) {
        svcWrap.innerHTML = '';
        $('#emptySvc').hidden = false;
        return;
    }
    $('#emptySvc').hidden = true;

    const html = svcs.map(s => {
        const next = s.next || s.next_bus; // different keys in some variants
        const subs = s.subsequent || s.subsequent_bus;
        const subs2 = s.subsequent2 || s.subsequent_bus2;
        const eta1 = next ? msToMins(next.duration_ms) : '—';
        const eta2 = subs ? msToMins(subs.duration_ms) : '—';
        const eta3 = subs2 ? msToMins(subs2.duration_ms) : '—';
        const loadCls = loadClass(next?.load);
        return `
        <div class="svc">
          <div class="svcNo">${s.no || s.service_no || s.ServiceNo || '?'}</div>
          <div class="etaWrap">
            <div class="eta"><strong>${eta1}</strong> <span class="tag ${loadCls}">${(next?.load)||''}</span></div>
            <div class="eta"><strong>${eta2}</strong></div>
            <div class="eta"><strong>${eta3}</strong></div>
          </div>
        </div>`;
    }).join('');

    svcWrap.innerHTML = html;
}

async function loadStop(code, {
    pushHistory = true
} = {}) {
    if (!/^\d{5}$/.test(code)) {
        alert('Please enter a valid 5-digit bus stop code.');
        return;
    }
    $('#q').value = code;
    $('#acList').hidden = true;
    try {
        $('#services').innerHTML = '<div class="empty">Loading live arrivals…</div>';
        const data = await fetchArrivals(code);
        renderArrivals(code, data);
        if (pushHistory) history.replaceState({
            code
        }, '', `#${code}`);
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
    const m = v.match(/\d{5}/);
    if (m) loadStop(m[0]);
    else {
        const first = matchStops(v)[0];
        if (first) loadStop(first.code);
        else alert('Type a bus stop code (5 digits).');
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

// ----------- Init -----------
(async function init() {
    updateGreeting();
    setInterval(updateGreeting, 30_000);
    await buildAc();
    renderFavs();
    // Load stop from hash or last favourite
    const hashCode = location.hash.replace('#', '');
    if (/^\d{5}$/.test(hashCode)) loadStop(hashCode, {
        pushHistory: false
    });
    else if (LS.getFavs()[0]) loadStop(LS.getFavs()[0], {
        pushHistory: false
    });
})();