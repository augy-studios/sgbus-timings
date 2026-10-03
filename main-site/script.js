// ----------- Utilities -----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
}

const LS = {
    nameKey:       'sgbus_name',
    favKey:        'sgbus_favs_v2',
    stopsCacheKey: 'sgbus_stops_v3',
    favBusKey:     'sgbus_fav_buses',
    favRouteKey:   'sgbus_fav_routes',
    favNavKey:     'sgbus_fav_navs',
    pinKey:        'sgbus_pin_prefs',
    birthdayKey:   'sgbus_birthday',

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

    // Bus numbers, e.g. ["22", "NR7"].
    getFavBuses() { const v = readJson(this.favBusKey, []); return Array.isArray(v) ? v : []; },
    setFavBuses(arr) { localStorage.setItem(this.favBusKey, JSON.stringify(arr)); },

    // [{ start, startName, end, endName }], start and end as stop codes.
    getFavRoutes() { const v = readJson(this.favRouteKey, []); return Array.isArray(v) ? v : []; },
    setFavRoutes(arr) { localStorage.setItem(this.favRouteKey, JSON.stringify(arr)); },

    // [{ from: { label, lat, lng }, to: { label, lat, lng } }], from Navigate (js/nav.js).
    getFavNavs() { const v = readJson(this.favNavKey, []); return Array.isArray(v) ? v : []; },
    setFavNavs(arr) { localStorage.setItem(this.favNavKey, JSON.stringify(arr)); },

    // Where favourites pin in a list, per kind ("bus" or "stop"): "top" unless set otherwise.
    getPin(kind) { return readJson(this.pinKey, {})?.[kind] === 'bottom' ? 'bottom' : 'top'; },
    setPin(kind, position) {
        const prefs = readJson(this.pinKey, {}) || {};
        prefs[kind] = position;
        localStorage.setItem(this.pinKey, JSON.stringify(prefs));
    },

    // "YYYY-MM-DD", or empty.
    getBirthday() { return localStorage.getItem(this.birthdayKey) || ''; },
    setBirthday(v) {
        if (v) localStorage.setItem(this.birthdayKey, v);
        else localStorage.removeItem(this.birthdayKey);
    },

    getStops() {
        try { return JSON.parse(localStorage.getItem(this.stopsCacheKey) || 'null'); }
        catch { return null; }
    },
    setStops(obj) { localStorage.setItem(this.stopsCacheKey, JSON.stringify(obj)); },
};

// Theme state lives in js/theme.js, which also wires #themeBtn and #themeModal.

// ----------- Greeting -----------
function getGreeting(now = new Date()) {
    const h = now.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
}

function isBirthday(now = new Date()) {
    const b = LS.getBirthday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
    return Number(b.slice(5, 7)) === now.getMonth() + 1 && Number(b.slice(8, 10)) === now.getDate();
}

function updateGreeting() {
    const name = LS.getName();
    const g    = isBirthday() ? 'Happy Birthday' : getGreeting();
    $('#greeting').textContent = name ? `${g}, ${name}!` : `${g}!`;
}

// ----------- Helpers -----------
function msToMins(ms) {
    if (ms == null) return '-';
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

function formatDistance(m) {
    if (m == null) return '';
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// An icon from js/icons.js, for markup built here rather than hydrated from data-icon.
function ico(name) {
    return `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;
}

const favMark = () => `<span class="favMark" title="Favourite">${window.icon('star')}</span>`;

// Stable-partitions items into favourited and not, per `position` ("top" or "bottom"),
// keeping each group's own order. `key` pulls the value to look up out of each item.
function pinFavourites(items, favourites, position, key = x => x) {
    if (!favourites.size) return items;
    const fav  = items.filter(i => favourites.has(key(i)));
    const rest = items.filter(i => !favourites.has(key(i)));
    return position === 'bottom' ? [...rest, ...fav] : [...fav, ...rest];
}

// A star toggle's pressed state and label.
function setFavButton(btn, on, offLabel, onLabel) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    const lbl = btn.querySelector('.lbl');
    if (lbl) lbl.textContent = on ? onLabel : offLabel;
}

function busButton(no, isFav, attrs) {
    return `<button type="button" class="busBtn${isFav ? ' fav' : ''}" ${attrs}>${isFav ? favMark() : ''}${escapeHtml(no)}</button>`;
}

// "Origin → Destination" for a service, or where a loop service starts and ends.
function serviceEndsText(no) {
    if (!BusNet.isReady() || !BusNet.hasService(no)) return '';
    const t = BusNet.terminals(no);
    if (!t.origin || !t.dest) return '';
    if (t.loop || t.origin === t.dest) return `Loop from ${nameOf(t.origin) || t.origin}`;
    return `${nameOf(t.origin) || t.origin} → ${nameOf(t.dest) || t.dest}`;
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

function matchStops(q, limit = 20) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const isCode = /^\d+$/.test(q);
    return acData
        .filter(it => isCode
            ? it.code.startsWith(q)
            : it.name.toLowerCase().includes(q) || it.road.toLowerCase().includes(q))
        .slice(0, limit);
}

// How many matches are checked for a direct bus before the list is cut to its usual 20, so
// a stop with one further down still makes it, without checking thousands on a short query.
const DIRECT_CHECK_LIMIT = 300;

// A postal code is six digits and a stop code five, so the two never collide.
const isPostalCode = v => /^\d{6}$/.test(v.trim());

// `direct` (stop code to bus numbers) marks the stops with a bus straight to the other end of
// a planned route; `note` says so above them.
function renderAcList(box, stops, services = [], postal = null, direct = null, note = '') {
    if (!stops.length && !services.length && !postal) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML =
        (note ? `<div class="acNote">${escapeHtml(note)}</div>` : '') +
        (postal
            ? `<div class="acItem acService" data-postal="${escapeHtml(postal)}">` +
              `<span class="code">${ico('pin')} ${escapeHtml(postal)}</span>` +
              `<span class="name">Bus stops near this postal code</span>` +
              `</div>`
            : '') +
        services.map(no =>
            `<div class="acItem acService" data-svc="${escapeHtml(no)}">` +
            `<span class="code">${ico('bus')} Bus ${escapeHtml(no)}</span>` +
            `<span class="name">${escapeHtml(serviceEndsText(no))}</span>` +
            `</div>`
        ).join('') +
        stops.map(it => {
            const buses = direct?.get(it.code);
            return `<div class="acItem${buses ? ' direct' : ''}" data-code="${it.code}">` +
                `<span class="code">${it.code}` +
                (buses ? `<span class="acDirect">${ico('bus')} ${escapeHtml(buses.join(', '))}</span>` : '') + `</span>` +
                `<span class="name">${escapeHtml(it.name)}${it.road ? `<span class="road"> · ${escapeHtml(it.road)}</span>` : ''}</span>` +
                `</div>`;
        }).join('');
    box.hidden = false;
}

// Stop suggestions under an input, plus bus numbers with `withServices`, and the stops near
// a postal code once one is typed. Enter picks the stop typed or the first match, unless
// `onEnter` takes it over. A postal code goes to `onPostal`, by default a list of the stops
// near it to pick one from. With `directFor` (a stop code to the buses running straight to
// where the route planner is going, or null), those stops go first and are marked, and
// `directNote` (given how many) says so above them.
function attachAutocomplete(input, box, { withServices = false, onStop, onService, onEnter, onPostal, directFor, directNote }) {
    onPostal ??= code => postalStops(code)
        .then(({ title, stops }) => openStopList(title, stops, { pin: false, onPick: onStop }))
        .catch(e => alert(e.message));
    // The stops to suggest, in the order shown, so Enter picks the one at the top.
    const suggest = (v) => {
        if (!directFor) return { stops: matchStops(v), direct: null, note: '' };
        const all = matchStops(v, DIRECT_CHECK_LIMIT);
        const direct = new Map();
        for (const s of all) {
            const buses = directFor(s.code);
            if (buses) direct.set(s.code, buses);
        }
        const stops = [...all.filter(s => direct.has(s.code)), ...all.filter(s => !direct.has(s.code))].slice(0, 20);
        return { stops, direct, note: direct.size ? directNote?.(direct.size) || '' : '' };
    };
    const render = () => {
        const v = input.value;
        const { stops, direct, note } = suggest(v);
        renderAcList(box, stops, withServices && BusNet.isReady() ? BusNet.matchServices(v, 4) : [],
            isPostalCode(v) ? v.trim() : null, direct, note);
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
    input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        box.hidden = true;
        if (onEnter) { onEnter(input.value); return; }
        const v = input.value.trim();
        if (isPostalCode(v)) { onPostal(v); return; }
        const code = v.match(/\b\d{5}\b/)?.[0];
        const pick = code && stopsIndex?.[code] ? code : suggest(v).stops[0]?.code;
        if (pick) onStop(pick);
        else if (v) alert('No bus stops matched that. Try a bus stop number or part of its name.');
    });
    box.addEventListener('click', e => {
        const postal = e.target.closest('[data-postal]');
        if (postal) { box.hidden = true; onPostal(postal.getAttribute('data-postal')); return; }
        const svc = e.target.closest('[data-svc]');
        if (svc) { box.hidden = true; onService?.(svc.getAttribute('data-svc')); return; }
        const item = e.target.closest('[data-code]');
        if (!item) return;
        box.hidden = true;
        onStop(item.getAttribute('data-code'));
    });
}

// ----------- Favourites -----------
const removeIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>';

function chip(openAttr, removeAttr, code, name, title) {
    return `<span class="chip">` +
        `<button type="button" class="chipMain" ${openAttr} title="${escapeHtml(title)}">` +
        (code ? `<span class="code">${escapeHtml(code)}</span>` : '') +
        (name ? `<span class="name">${escapeHtml(name)}</span>` : '') +
        `</button>` +
        `<button type="button" class="remove" ${removeAttr} title="Remove from favourites" aria-label="Remove ${escapeHtml(title)} from favourites">${removeIcon}</button>` +
        `</span>`;
}

function renderFavs() {
    const favs   = LS.getFavs();
    const buses  = LS.getFavBuses();
    const routes = LS.getFavRoutes();
    const navs   = LS.getFavNavs();

    $('#favChips').innerHTML = favs.map(({ code, name }) => {
        const displayName = name || nameOf(code) || 'Bus Stop';
        return chip(`data-fav="${escapeHtml(code)}"`, `data-remove="${escapeHtml(code)}"`, code, displayName, `${displayName} (${code})`);
    }).join('');

    $('#favBusChips').innerHTML = buses.map(no =>
        chip(`data-fav-bus="${escapeHtml(no)}"`, `data-remove-bus="${escapeHtml(no)}"`, no, serviceEndsText(no), `Bus ${no}`)
    ).join('');

    $('#favRouteChips').innerHTML = routes.map((r, i) => {
        const label = `${nameOf(r.start) || r.startName} → ${nameOf(r.end) || r.endName}`;
        return chip(`data-fav-route="${i}"`, `data-remove-route="${i}"`, '', label, label);
    }).join('');

    $('#favNavChips').innerHTML = navs.map((n, i) => {
        const label = `${n.from.label} → ${n.to.label}`;
        return chip(`data-fav-nav="${i}"`, `data-remove-nav="${i}"`, '', label, label);
    }).join('');

    $('#favStopsGroup').hidden  = !favs.length;
    $('#favBusesGroup').hidden  = !buses.length;
    $('#favRoutesGroup').hidden = !routes.length;
    $('#favNavsGroup').hidden   = !navs.length;
    $('#favEmpty').hidden = favs.length + buses.length + routes.length + navs.length > 0;
}

function isFavStop(code) {
    return LS.getFavs().some(f => f.code === code);
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

function isFavBus(no) {
    return LS.getFavBuses().includes(no);
}

function toggleFavBus(no) {
    const buses = LS.getFavBuses();
    LS.setFavBuses(buses.includes(no) ? buses.filter(b => b !== no) : [...buses, no]);
    renderFavs();
    if (current && lastArrivals) renderArrivals();
}

// Redraws everything that marks favourites, after they change from outside their own star
// buttons: a sync with another device (js/sync.js).
function favouritesChanged() {
    renderFavs();
    if (current) renderStopHeader();
    if (current && lastArrivals) renderArrivals();
    if (!$('#plannerSection').hidden) renderPlanner();
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

// The stop being shown, and how it's being shown:
//   service   the bus it's narrowed to, if any
//   expanded  widened back out to every bus, remembering `service` to collapse back to
//   ctx       where it was opened from, for the way back and the stops-left note:
//             { kind: 'route', start, end } | { kind: 'journey', start, end, legs }
//             | { kind: 'service', service, dir, fromStop, onward } | { kind: 'nearby', stops }
//   dir       the direction of `service`'s route the user was looking at
let current = null;
let lastArrivals = null;
let navOpen = false;
let loadSeq = 0;

const MAP_APPS = [
    { id: 'google',     label: 'Google Maps' },
    { id: 'citymapper', label: 'Citymapper' },
];

// Directions to a stop in a map app: the app itself where it's installed, its website otherwise.
function directionsUrl(stop, app) {
    if (app === 'citymapper') {
        let q = `endcoord=${stop.lat}%2C${stop.lng}&endname=${encodeURIComponent(stop.n || '')}`;
        if (stop.road) q += `&endaddress=${encodeURIComponent(stop.road)}`;
        return `https://citymapper.com/directions?${q}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat}%2C${stop.lng}`;
}

function stopHash() {
    return current ? `#${current.code}${current.service ? ',' + current.service : ''}` : '';
}

async function fetchArrivals(code, service) {
    const qs = new URLSearchParams({ stop: code });
    if (service) qs.set('service', service);
    const res = await fetch(`/api/bus-arrivals?${qs}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch arrivals');
    return res.json();
}

function renderStopHeader() {
    const { code } = current;
    $('#stopCode').textContent = code;
    $('#stopName').textContent = nameOf(code) || 'Bus Stop';
    $('#stopRoad').textContent = stopsIndex?.[code]?.road || '';
    setFavButton($('#stopFavBtn'), isFavStop(code), 'Save', 'Saved');
}

function renderStopTools() {
    const { code, service, expanded } = current;
    const parts = [];
    if (service) {
        parts.push(expanded
            ? `<button type="button" class="iconBtn" data-tool="collapse">${ico('bus')} Only bus ${escapeHtml(service)}</button>`
            : `<button type="button" class="iconBtn" data-tool="expand">Show all services</button>`);
        if (!expanded) parts.push(`<button type="button" class="iconBtn" data-tool="onward">${ico('route')} Route from here</button>`);
    }
    parts.push(`<button type="button" class="iconBtn" data-tool="pick">${ico('bus')} Pick a bus</button>`);

    const stop = stopsIndex?.[code];
    if (stop && stop.lat != null && stop.lng != null) {
        parts.push(navOpen
            ? MAP_APPS.map(app =>
                `<a class="iconBtn" href="${escapeHtml(directionsUrl(stop, app.id))}" target="_blank" rel="noopener noreferrer">${ico('navigate')} ${escapeHtml(app.label)}</a>`
            ).join('')
            : `<button type="button" class="iconBtn" data-tool="navigate">${ico('navigate')} Directions</button>`);
    }
    $('#stopTools').innerHTML = parts.join('');
}

function backLabel(ctx) {
    switch (ctx?.kind) {
        case 'route':   return 'Back to route';
        case 'journey': return 'Back to journey';
        case 'service': return `Back to bus ${ctx.service}`;
        case 'nearby':  return 'Back to nearby stops';
        default:        return 'Back';
    }
}

function renderStopContext() {
    const { ctx, code, service } = current;
    const needsNetwork = ctx && (ctx.kind === 'route' || ctx.kind === 'journey');
    if (needsNetwork && !BusNet.isReady()) {
        BusNet.load(stopsIndex).then(() => { if (current?.ctx === ctx) renderStopContext(); }).catch(() => {});
    }
    const note = ctx ? stopsLeftNote(ctx, code, service) : null;
    $('#stopNote').textContent = note || '';
    $('#stopNote').hidden = !note;
    $('#stopBackLabel').textContent = backLabel(ctx);
    $('#stopContext').hidden = !ctx;
}

function goBack(ctx) {
    if (ctx.kind === 'route')        openPlanner(ctx.start, ctx.end);
    else if (ctx.kind === 'journey') openPlanner(ctx.start, ctx.end, { journey: ctx.legs });
    else if (ctx.kind === 'service') openService(ctx.service, { fromStop: ctx.fromStop, onward: ctx.onward, dir: ctx.dir });
    else if (ctx.kind === 'nearby')  openNearbyList(ctx.stops, ctx.title);
}

const wheelchairBadge = `<span class="badge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M192 96a48 48 0 1 0 0-96 48 48 0 1 0 0 96zM120.5 247.2c12.4-4.7 18.7-18.5 14-30.9s-18.5-18.7-30.9-14C43.1 225.1 0 283.5 0 352c0 88.4 71.6 160 160 160c61.2 0 114.3-34.3 141.2-84.7c6.2-11.7 1.8-26.2-9.9-32.5s-26.2-1.8-32.5 9.9C240 440 202.8 464 160 464C98.1 464 48 413.9 48 352c0-47.9 30.1-88.8 72.5-104.8zM259.8 176l-1.9-9.7c-4.5-22.3-24-38.3-46.8-38.3c-30.1 0-52.7 27.5-46.8 57l23.1 115.5c6 29.9 32.2 51.4 62.8 51.4h5.1c.4 0 .8 0 1.3 0h94.1c6.7 0 12.6 4.1 15 10.4L402 459.2c6 16.1 23.8 24.6 40.1 19.1l48-16c16.8-5.6 25.8-23.7 20.2-40.5s-23.7-25.8-40.5-20.2l-18.7 6.2-25.5-68c-11.7-31.2-41.6-51.9-74.9-51.9H282.2l-9.6-48H336c17.7 0 32-14.3 32-32s-14.3-32-32-32H259.8z"/></svg> Wheelchair</span>`;

const DAY_NAMES = { Weekday: 'weekday', Sat: 'Saturday', Sun: 'Sunday' };

function firstLastText(svcNo, code) {
    const fl = BusNet.isReady() ? BusNet.firstLast(svcNo, code) : null;
    if (!fl) return '';
    // LTA gives "-" for both on a day type the bus doesn't run.
    if (fl.first === '-' && fl.last === '-') return `No ${DAY_NAMES[fl.label]} service at this stop`;
    return `${fl.label}: first bus ${fl.first} · last bus ${fl.last}`;
}

function renderArrivals() {
    const { code, service, expanded } = current;
    const data = lastArrivals;

    // First/last bus times come from the route list; show them once it's in.
    if (!BusNet.isReady()) {
        BusNet.load(stopsIndex).then(() => { if (lastArrivals === data && current?.code === code) renderArrivals(); }).catch(() => {});
    }

    const favBuses = new Set(LS.getFavBuses());
    let svcs = [...(data?.services || [])].sort((a, b) => BusNet.byNumber(a.serviceNo || '', b.serviceNo || ''));
    if (service && !expanded) svcs = svcs.filter(s => (s.serviceNo || '').toUpperCase() === service);
    svcs = pinFavourites(svcs, favBuses, LS.getPin('bus'), s => s.serviceNo);

    renderIncomingBar({ services: svcs });

    const svcWrap = $('#services');
    if (!svcs.length) {
        svcWrap.innerHTML = '';
        const narrowed = service && !expanded;
        const fl = narrowed ? firstLastText(service, code) : '';
        $('#emptySvc').textContent = narrowed
            ? `No live arrivals for bus ${service} right now.${fl ? ` ${fl}.` : ''}`
            : 'No live buses right now.';
        $('#emptySvc').hidden = false;
        return;
    }
    $('#emptySvc').hidden = true;

    const stopLat = stopsIndex?.[code]?.lat ?? null;
    const stopLng = stopsIndex?.[code]?.lng ?? null;

    const piece = (bus) => {
        if (!bus) return `<div class="eta"><strong>-</strong></div>`;
        const mins  = msToMins(bus.eta_ms);
        const cls   = loadTextClass(bus.load);
        const haveCoords = bus.lat != null && bus.lng != null && stopLat != null && stopLng != null;
        const dist  = haveCoords ? ` ~ ${haversine(bus.lat, bus.lng, stopLat, stopLng)}m` : '';
        const maybei  = bus.rough ? '<i>' : '';
        const maybei2 = bus.rough ? '</i>' : '';
        const wheelchair = bus.wheelchair ? wheelchairBadge : '';
        const deck  = `<span class="badge">${escapeHtml(bus.deck || '')}</span>`;
        const distBadge = haveCoords
            ? `<span class="badge badge-dist">${dist}</span>`
            : `<span class="badge badge-dist badge-dist-na">~ &#8734;m</span>`;
        const badges = `<div class="badges">${wheelchair}${deck}${distBadge}</div>`;
        return `<div class="eta">${maybei}<strong class="${cls}">${mins}</strong>${maybei2}${badges}</div>`;
    };

    svcWrap.innerHTML = svcs.map(s => {
        const svcNo = s.serviceNo || '?';
        const fav = favBuses.has(svcNo);
        const fl = firstLastText(svcNo, code);
        return `<div class="svc" data-svc="${escapeHtml(svcNo)}">` +
            `<div class="svcLeft">` +
            `<div class="svcNo">${fav ? favMark() : ''}${escapeHtml(svcNo)}</div>` +
            (s.operator ? `<div class="svcOp">${escapeHtml(s.operator)}</div>` : '') +
            `<button class="viewRouteBtn" data-view-route="${escapeHtml(svcNo)}">Route</button>` +
            `</div>` +
            `<div class="etaWrap">${piece(s.next)}${piece(s.next2)}${piece(s.next3)}` +
            (fl ? `<div class="firstLast">${escapeHtml(fl)}</div>` : '') +
            `</div>` +
            `</div>`;
    }).join('');
}

async function loadStop(code, { service = null, expanded = false, ctx = null, dir = null, pushHistory = true, scroll = false } = {}) {
    if (!/^\d{5}$/.test(code)) { alert('Please enter a valid 5-digit bus stop code.'); return; }
    const seq = ++loadSeq;
    current = { code, service: service ? String(service).toUpperCase() : null, expanded, ctx, dir };
    navOpen = false;

    $('#q').value = current.service ? `${code} ${current.service}` : code;
    $('#acList').hidden = true;
    renderStopHeader();
    renderStopTools();
    renderStopContext();
    $('#services').innerHTML = '<div class="empty">Loading live arrivals&hellip;</div>';
    $('#emptySvc').hidden   = true;
    $('#resultCard').hidden = false;
    $('#incomingBar').hidden = true;
    if (scroll) $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (pushHistory) history.replaceState(null, '', stopHash());

    try {
        const data = await fetchArrivals(code);
        if (seq !== loadSeq) return;
        lastArrivals = data;
        renderArrivals();
    } catch (e) {
        if (seq !== loadSeq) return;
        console.error(e);
        lastArrivals = null;
        $('#services').innerHTML = '<div class="empty">Could not load arrivals. Please try again.</div>';
    }
}

function refreshStop() {
    if (!current) return;
    loadStop(current.code, { ...current, pushHistory: false });
}

// Narrows the stop already on screen down to one bus, or back out, without a new request:
// every service's arrivals are already in hand.
function showOnlyService(service) {
    current.service = service;
    current.expanded = false;
    // A direction belongs to the bus it was picked for; the new one finds its own.
    current.dir = null;
    $('#q').value = `${current.code} ${service}`;
    history.replaceState(null, '', stopHash());
    renderStopTools();
    renderStopContext();
    if (lastArrivals) renderArrivals();
}

// ----------- Pick a bus at the stop -----------
async function openBusPicker() {
    const code = current.code;
    let services = [];
    try {
        await BusNet.load(stopsIndex);
        services = BusNet.servicesAtStop(code);
    } catch (e) {
        console.warn('Bus routes failed:', e);
    }
    // Without the route list, the buses running right now are the next best thing.
    if (!services.length) services = (lastArrivals?.services || []).map(s => s.serviceNo).sort(BusNet.byNumber);

    const favs = new Set(LS.getFavBuses());
    services = pinFavourites(services, favs, LS.getPin('bus'));
    $('#busPickTitle').textContent = `Buses at ${nameOf(code) || code}`;
    $('#busPickGrid').innerHTML =
        services.map(no => busButton(no, favs.has(no), `data-pick-bus="${escapeHtml(no)}"`)).join('') ||
        '<div class="empty">No buses found for this stop.</div>';
    openModal('busPickModal');
}

// ----------- Bus Service Modal -----------
// The service on show: { service, dir, fromStop, onward }. `fromStop` is the stop it was
// opened from, if that stop is on its route, and `onward` narrows the list to the stops
// still ahead of it.
let svcState = null;

async function openService(service, { fromStop = null, onward = false, dir = null } = {}) {
    service = String(service).toUpperCase();
    try {
        await BusNet.load(stopsIndex);
    } catch (e) {
        console.error(e);
        alert('Could not load route information.');
        return;
    }
    if (!BusNet.hasService(service)) { alert(`No route found for bus ${service}.`); return; }

    const dirs = BusNet.directions(service);
    const onRoute = !!fromStop && dirs.some(d => BusNet.runStops(service, d).includes(fromStop));
    // The direction asked for, as long as it's one this bus runs and passes the stop on;
    // otherwise the direction the stop is on.
    const fits = dirs.includes(dir) && (!onRoute || BusNet.runStops(service, dir).includes(fromStop));
    svcState = {
        service,
        fromStop: onRoute ? fromStop : null,
        onward: onward && onRoute,
        dir: fits ? dir : (onRoute ? BusNet.directionAt(service, fromStop) : dirs[0]),
        pickAlight: false,
    };
    renderGetOffPick();
    renderServiceModal();
    openModal('svcModal');
    $('#svcModal .modalBody').scrollTop = 0;
    // Centre the stop it was opened from within the list alone. scrollIntoView would scroll
    // the modal body too, and push the route's summary out of sight.
    const list = $('#routeList');
    const me = svcState.onward ? null : list.querySelector('.routeStop.me');
    list.scrollTop = me ? me.offsetTop - (list.clientHeight - me.offsetHeight) / 2 : 0;
}

function dirLabel(service, dir) {
    const stops = BusNet.runStops(service, dir);
    const [o, d] = BusNet.serviceInfo(service)?.dirs?.[dir] || [];
    const origin = o || stops[0];
    const dest = d || stops[stops.length - 1];
    return `${nameOf(origin) || origin} → ${nameOf(dest) || dest}`;
}

function renderServiceModal() {
    const { service, fromStop, onward } = svcState;
    const dirs = BusNet.directions(service);
    const info = BusNet.serviceInfo(service) || {};
    const t = BusNet.terminals(service);
    const isLoop = !!(t.loop || (t.origin && t.origin === t.dest));
    const label = code => code ? `${nameOf(code) || code} (${code})` : '-';

    $('#svcModalTitle').textContent = `Bus ${service}`;
    setFavButton($('#busFavBtn'), isFavBus(service), 'Save bus', 'Saved');

    let codes;
    if (onward) {
        const found = BusNet.onwardFrom(service, fromStop, svcState.dir);
        svcState.dir = found.dir;
        codes = found.stops;
    } else {
        codes = BusNet.runStops(service, svcState.dir);
    }

    const summary = isLoop
        ? `Loop service, starting and ending at ${label(t.origin)}${t.loop ? ` (loops at ${t.loop})` : ''}`
        : `${label(t.origin)} → ${label(t.dest)}${t.directions > 1 ? ' (and back)' : ''}`;
    // Traced over the stops on show, so the onward view reads as the journey left to make.
    const via = BusNet.landmarks(codes);
    $('#svcMeta').innerHTML =
        `<div><strong>Route:</strong> ${escapeHtml(summary)}</div>` +
        (via.length ? `<div><strong>Via:</strong> ${escapeHtml(via.join(' → '))}</div>` : '') +
        `<div><strong>Operator:</strong> ${escapeHtml(info.op || '-')}</div>` +
        (info.cat ? `<div><strong>Category:</strong> ${escapeHtml(info.cat)}</div>` : '');

    const modeTabs = $('#svcModeTabs');
    modeTabs.hidden = !fromStop;
    if (fromStop) {
        modeTabs.querySelector('[data-svc-mode="onward"]').textContent = `From ${nameOf(fromStop) || fromStop}`;
        modeTabs.querySelectorAll('.tab').forEach(tab =>
            tab.classList.toggle('active', (tab.dataset.svcMode === 'onward') === onward));
    }

    const dirTabs = $('#svcDirTabs');
    const showDirs = !onward && dirs.length > 1;
    dirTabs.hidden = !showDirs;
    dirTabs.innerHTML = showDirs
        ? dirs.map(d => `<button type="button" class="tab${d === svcState.dir ? ' active' : ''}" data-dir="${d}">${escapeHtml(dirLabel(service, d))}</button>`).join('')
        : '';

    const note = $('#svcNote');
    note.hidden = !onward;
    if (onward) {
        const toGo = codes.length - 1;
        note.textContent = toGo > 0
            ? `${toGo} stop${toGo === 1 ? '' : 's'} to go, ending at ${label(codes[codes.length - 1])}`
            : `This is the last stop on bus ${service}'s route; there's nothing further to go.`;
    }

    const favs = new Set(LS.getFavs().map(f => f.code));
    const row = (code, seq) =>
        `<button type="button" class="routeStop${code === fromStop ? ' me' : ''}" data-stop="${escapeHtml(code)}">` +
        `<span class="seq">${seq}</span>` +
        `<span class="name">${favs.has(code) ? favMark() : ''}${escapeHtml(nameOf(code) || code)}</span>` +
        `<span class="pill">${escapeHtml(code)}</span>` +
        `</button>`;

    let html;
    if (onward) {
        html = codes.map((c, i) => row(c, i === 0 ? 'Here' : `+${i}`)).join('');
    } else {
        const all = codes.map((c, i) => row(c, i + 1)).join('');
        const favCodes = codes.filter(c => favs.has(c));
        if (favCodes.length) {
            // The favourited stops get a section of their own, then the whole route, in
            // which they still appear in their place.
            const favHtml = `<div class="routeSection">Your favourite stops on ${escapeHtml(service)}</div>` +
                favCodes.map(c => row(c, codes.indexOf(c) + 1)).join('');
            const allHtml = `<div class="routeSection">All stops</div>${all}`;
            html = LS.getPin('stop') === 'bottom' ? allHtml + favHtml : favHtml + allHtml;
        } else {
            html = all;
        }
    }
    $('#routeList').innerHTML = html || '<div class="empty">No route data.</div>';
}

// ----------- Nearby stops -----------
function stopsNear(lat, lng, limit = 8) {
    return Object.entries(stopsIndex || {})
        .map(([code, s]) => ({ code, distance: haversine(lat, lng, s.lat, s.lng) }))
        .filter(s => s.distance != null)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
}

function findNearbyStops(limit = 8) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("This browser can't share its location."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve(stopsNear(pos.coords.latitude, pos.coords.longitude, limit)),
            err => reject(new Error(err.code === 1
                ? 'Location access is turned off for this site. Allow it in your browser to find stops near you.'
                : "Couldn't get your location. Please try again.")),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
    });
}

// Runs a location lookup with its button showing that it's working, and says what went wrong.
async function withLocating(btn, work) {
    btn.disabled = true;
    btn.classList.add('busy');
    try { await work(); }
    catch (e) { alert(e.message); }
    finally { btn.disabled = false; btn.classList.remove('busy'); }
}

let stopListPick = null;

// A list of stops to pick one from. `pin` pins favourites per the stop preference; without
// it they're only starred, and the list keeps its own order. `direct` (stop code to bus
// numbers) marks the stops with a bus straight to where the route planner is going, and
// puts them first; `note` says above the list what that means.
function openStopList(title, stops, { pin = true, onPick, direct = null, note = '' }) {
    const favs = new Set(LS.getFavs().map(f => f.code));
    let list = pin ? pinFavourites(stops, favs, LS.getPin('stop'), s => s.code) : stops;
    if (direct?.size) list = [...list.filter(s => direct.has(s.code)), ...list.filter(s => !direct.has(s.code))];
    $('#stopListTitle').textContent = title;
    const rows = list.map(s => {
        const road = stopsIndex?.[s.code]?.road || '';
        const buses = direct?.get(s.code);
        return `<button type="button" class="routeStop${buses ? ' direct' : ''}" data-stop="${escapeHtml(s.code)}">` +
            `<span class="name">${favs.has(s.code) ? favMark() : ''}${escapeHtml(nameOf(s.code) || s.code)}` +
            (road ? `<span class="road">${escapeHtml(road)}</span>` : '') +
            (buses ? `<span class="via">${ico('bus')} Direct: ${escapeHtml(buses.join(', '))}</span>` : '') + `</span>` +
            (s.distance != null ? `<span class="dist">${formatDistance(s.distance)}</span>` : '') +
            `<span class="pill">${escapeHtml(s.code)}</span>` +
            `</button>`;
    }).join('');
    $('#stopListBody').innerHTML = rows
        ? (note ? `<p class="stopListNote">${escapeHtml(note)}</p>` : '') + rows
        : '<div class="empty">No bus stops found nearby.</div>';
    stopListPick = onPick;
    openModal('stopListModal');
}

function openNearbyList(stops, title = 'Nearby bus stops') {
    openStopList(title, stops, {
        onPick: code => loadStop(code, { ctx: { kind: 'nearby', stops, title }, scroll: true }),
    });
}

// The stops nearest the address with a 6-digit postal code, and a title naming it.
async function postalStops(code) {
    const [r] = await Promise.all([fetch(`/api/postal-code?code=${encodeURIComponent(code)}`), ensureStopsIndex()]);
    if (r.status === 404) throw new Error(`No address has the postal code ${code}.`);
    if (!r.ok) throw new Error("Couldn't look up that postal code. Please try again.");
    const place = await r.json();
    return { title: `Stops near ${place.address} (${code})`, stops: stopsNear(place.lat, place.lng) };
}

function openPostalList(code) {
    postalStops(code)
        .then(({ title, stops }) => openNearbyList(stops, title))
        .catch(e => alert(e.message));
}

// ----------- Settings -----------
function syncPinButtons() {
    $$('[data-pin-kind]').forEach(group => {
        const position = LS.getPin(group.dataset.pinKind);
        group.querySelectorAll('[data-pin]').forEach(btn => {
            const on = btn.dataset.pin === position;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', String(on));
        });
    });
}

function openSettings() {
    $('#setName').value = LS.getName();
    $('#setBirthday').value = LS.getBirthday();
    syncPinButtons();
    prepareSync();
    openModal('settingsModal');
}

// ----------- Search -----------
async function runSearch() {
    const v = $('#q').value.trim();
    $('#acList').hidden = true;
    if (!v) return;

    if (isPostalCode(v)) { openPostalList(v); return; }

    // A stop code, optionally followed by a bus to narrow it to: "84009 174".
    const stopMatch = v.match(/\b\d{5}\b/);
    if (stopMatch) {
        const rest = v.replace(stopMatch[0], '').trim().toUpperCase();
        loadStop(stopMatch[0], { service: /^[0-9A-Z]{1,4}$/.test(rest) ? rest : null });
        return;
    }

    // A bus number on its own opens its route. Stop codes are always five digits and bus
    // numbers shorter, so the two never collide.
    const svc = v.toUpperCase();
    if (/^[0-9A-Z]{1,4}$/.test(svc)) {
        try { await BusNet.load(stopsIndex); } catch { /* fall through to the stop search */ }
        if (BusNet.hasService(svc)) { openService(svc); return; }
    }

    const first = matchStops(v)[0];
    if (first) loadStop(first.code);
    else alert('Type a bus stop name, 5-digit stop code, 6-digit postal code, or bus number.');
}

// ----------- Events -----------
$('#titleBtn').addEventListener('click', openSettings);
$('#settingsBtn').addEventListener('click', openSettings);

$('#setName').addEventListener('input', e => { LS.setName(e.target.value.trim()); updateGreeting(); });
$('#setBirthday').addEventListener('change', e => { LS.setBirthday(e.target.value); updateGreeting(); });
$('#clearBirthday').addEventListener('click', () => {
    LS.setBirthday('');
    $('#setBirthday').value = '';
    updateGreeting();
});
$$('[data-pin-kind]').forEach(group => group.addEventListener('click', e => {
    const btn = e.target.closest('[data-pin]');
    if (!btn) return;
    LS.setPin(group.dataset.pinKind, btn.dataset.pin);
    syncPinButtons();
    if (current && lastArrivals) renderArrivals();
}));

$('#searchBtn').addEventListener('click', runSearch);
attachAutocomplete($('#q'), $('#acList'), {
    withServices: true,
    onStop: code => { $('#q').value = code; loadStop(code); },
    onService: svc => openService(svc),
    onEnter: runSearch,
    onPostal: openPostalList,
});

$('#nearMeBtn').addEventListener('click', e =>
    withLocating(e.currentTarget, () => findNearbyStops().then(openNearbyList)));
$('#planBtn').addEventListener('click', () => openPlanner());

$('#refreshBtn').addEventListener('click', refreshStop);
$('#stopFavBtn').addEventListener('click', () => {
    if (!current) return;
    if (isFavStop(current.code)) removeFav(current.code);
    else addFav(current.code);
    renderStopHeader();
});
$('#stopBackBtn').addEventListener('click', () => { if (current?.ctx) goBack(current.ctx); });

$('#stopTools').addEventListener('click', e => {
    const tool = e.target.closest('[data-tool]')?.dataset.tool;
    if (!tool) return;
    if (tool === 'expand' || tool === 'collapse') {
        current.expanded = tool === 'expand';
        renderStopTools();
        if (lastArrivals) renderArrivals();
    } else if (tool === 'onward') {
        openService(current.service, { fromStop: current.code, onward: true, dir: current.dir });
    } else if (tool === 'pick') {
        openBusPicker();
    } else if (tool === 'navigate') {
        navOpen = true;
        renderStopTools();
    }
});

$('#services').addEventListener('click', e => {
    const btn = e.target.closest('[data-view-route]');
    if (!btn) return;
    const svc = btn.getAttribute('data-view-route');
    openService(svc, { fromStop: current?.code, dir: svc === current?.service ? current.dir : null });
});

$('#busPickGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-pick-bus]');
    if (!btn) return;
    closeModal('busPickModal');
    showOnlyService(btn.getAttribute('data-pick-bus'));
});

$('#stopListBody').addEventListener('click', e => {
    const btn = e.target.closest('[data-stop]');
    if (!btn) return;
    closeModal('stopListModal');
    stopListPick?.(btn.getAttribute('data-stop'));
});

$('#busFavBtn').addEventListener('click', () => {
    toggleFavBus(svcState.service);
    renderServiceModal();
});

$('#svcModeTabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-svc-mode]');
    if (!tab) return;
    svcState.onward = tab.dataset.svcMode === 'onward';
    renderServiceModal();
    $('#routeList').scrollTop = 0;
});

$('#svcDirTabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-dir]');
    if (!tab) return;
    svcState.dir = Number(tab.dataset.dir);
    renderServiceModal();
    $('#routeList').scrollTop = 0;
});

// ----------- Get Off Alert on a bus's route -----------
// Tap Get Off Alert, then the stop you're getting off at: a trip starts on this bus and this
// direction, and js/trip.js alerts you two stops before it.
$('#getOffPickBtn').addEventListener('click', () => {
    svcState.pickAlight = !svcState.pickAlight;
    renderGetOffPick();
});

function renderGetOffPick() {
    const on = !!svcState?.pickAlight;
    const btn = $('#getOffPickBtn');
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
    $('#getOffPickNote').hidden = !on;
    $('#routeList').classList.toggle('picking', on);
}

// Stop codes as points, and a ride time from distance at the planner's ~15 km/h.
function tripLegForBus(service, codes, toCode) {
    const known = codes.filter(c => stopsIndex?.[c]?.lat != null);
    const points = known.map(c => [stopsIndex[c].lat, stopsIndex[c].lng]);
    let metres = 0;
    for (let i = 1; i < points.length; i++) metres += haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]) || 0;
    return {
        kind: 'bus', label: `Bus ${service}`, to: nameOf(toCode) || toCode,
        points, names: known.map(c => nameOf(c) || c), minutes: metres / 250, wait: 0,
    };
}

function startBusTrip(service, dir, toCode, fromStop) {
    const stops = BusNet.runStops(service, dir);
    const end = stops.indexOf(toCode);
    const start = fromStop && stops.indexOf(fromStop) !== -1 && stops.indexOf(fromStop) < end ? stops.indexOf(fromStop) : 0;
    if (end < 1) return;
    Trip.start({ title: `Bus ${service} to ${nameOf(toCode) || toCode}`, legs: [tripLegForBus(service, stops.slice(start, end + 1), toCode)] });
}

$('#routeList').addEventListener('click', e => {
    const row = e.target.closest('[data-stop]');
    if (!row) return;
    if (svcState.pickAlight) {
        startBusTrip(svcState.service, svcState.dir, row.getAttribute('data-stop'), svcState.fromStop);
        svcState.pickAlight = false;
        renderGetOffPick();
        closeModal('svcModal');
        return;
    }
    const { service, fromStop, onward, dir } = svcState;
    closeModal('svcModal');
    loadStop(row.getAttribute('data-stop'), {
        service,
        dir,
        ctx: { kind: 'service', service, dir, fromStop, onward },
        scroll: true,
    });
});

$('#refreshAllBtn').addEventListener('click', () => {
    if (current) { refreshStop(); return; }
    const favs = LS.getFavs();
    if (favs.length) loadStop(favs[0].code, { pushHistory: false });
});

$('.favBar').addEventListener('click', e => {
    const t = e.target.closest('[data-remove],[data-fav],[data-remove-bus],[data-fav-bus],[data-remove-route],[data-fav-route],[data-remove-nav],[data-fav-nav]');
    if (!t) return;
    const d = t.dataset;
    if (d.remove) {
        removeFav(d.remove);
        if (current?.code === d.remove) renderStopHeader();
    } else if (d.fav) {
        loadStop(d.fav, { scroll: true });
    } else if (d.removeBus) {
        toggleFavBus(d.removeBus);
    } else if (d.favBus) {
        openService(d.favBus);
    } else if (d.removeRoute) {
        LS.setFavRoutes(LS.getFavRoutes().filter((_, i) => i !== Number(d.removeRoute)));
        renderFavs();
        if (!$('#plannerSection').hidden) renderPlanner();
    } else if (d.favRoute) {
        const r = LS.getFavRoutes()[Number(d.favRoute)];
        if (r) openPlanner(r.start, r.end);
    } else if (d.removeNav) {
        LS.setFavNavs(LS.getFavNavs().filter((_, i) => i !== Number(d.removeNav)));
        renderFavs();
        if (!$('#navSection').hidden) renderNavFav();
    } else if (d.favNav) {
        const n = LS.getFavNavs()[Number(d.favNav)];
        if (n) openNav(n.from, n.to);
    }
});

// ----------- URL -----------
// "#84009" or "#84009,174" for a stop, "#bus/22" for a bus's route, "#route/84009/75009"
// for the route planner, "#sync/BCDFGH" for another device's code to sync favourites with,
// "#alerts" for the service alerts card, "#nav/lat,lng/lat,lng" for Navigate.
function routeFromHash() {
    const hash = decodeURIComponent(location.hash.replace('#', ''));
    let m;
    // Opens Settings over the page rather than showing anything in it, so it answers false and
    // the first favourite stop still loads behind.
    if ((m = hash.match(/^sync\/([0-9A-Za-z]{6})$/))) { openSyncLink(m[1]); return false; }
    // Where a Service Alerts notification opens. Shown above the page, so the first
    // favourite stop still loads behind it.
    if (hash === 'alerts') { window.Alerts.open({ scroll: false }); return false; }
    if ((m = hash.match(/^route\/(\d{5})\/(\d{5})$/))) { openPlanner(m[1], m[2], { scroll: false }); return true; }
    if ((m = hash.match(/^nav\/(-?[\d.]+,-?[\d.]+)\/(-?[\d.]+,-?[\d.]+)$/))) { openNavHash(m[1], m[2]); return true; }
    if ((m = hash.match(/^bus\/([0-9A-Za-z]{1,4})$/))) { openService(m[1]); return true; }
    const [hashCode, hashSvc] = hash.split(',');
    if (/^\d{5}$/.test(hashCode)) {
        loadStop(hashCode, { service: hashSvc || null, pushHistory: false });
        return true;
    }
    return false;
}

window.addEventListener('hashchange', routeFromHash);

// ----------- Init -----------
(async function init() {
    updateGreeting();
    setInterval(updateGreeting, 30_000);
    initPlanner();
    initNav();
    initSync();

    // Started alongside the stops so it's usually in by the time anything wants it.
    BusNet.load().catch(e => console.warn('Bus routes failed:', e));

    await buildAc();
    renderFavs();

    BusNet.load(stopsIndex)
        .then(() => {
            renderFavs();
            if (current && lastArrivals) renderArrivals();
        })
        .catch(() => {});

    if (!routeFromHash() && LS.getFavs()[0]) {
        loadStop(LS.getFavs()[0].code, { pushHistory: false });
    }
})();
