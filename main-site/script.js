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
    confettiKey:   'sgbus_confetti',
    restrictedKey: 'sgbus_restricted',
    customsKey:    'sgbus_customs',
    bikeKey:       'sgbus_bike',
    homeKey:       'sgbus_home',
    workKey:       'sgbus_work',

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
    // Confetti on your birthday: on unless turned off in Settings.
    getConfetti() { return localStorage.getItem(this.confettiKey) !== 'off'; },
    setConfetti(on) {
        if (on) localStorage.removeItem(this.confettiKey);
        else localStorage.setItem(this.confettiKey, 'off');
    },
    // Restricted areas: journeys through the stops behind a checkpoint, for those with a pass.
    // Off unless turned on in Settings.
    getRestricted() { try { return localStorage.getItem(this.restrictedKey) === 'on'; } catch { return false; } },
    setRestricted(on) {
        if (on) localStorage.setItem(this.restrictedKey, 'on');
        else localStorage.removeItem(this.restrictedKey);
    },
    // Immigration time across the Causeway: 'auto', by when you cross (When.customsMin), or
    // the minutes you usually take, '15' to '60'.
    getCustoms() {
        try { const v = localStorage.getItem(this.customsKey); return ['15', '30', '45', '60'].includes(v) ? v : 'auto'; } catch { return 'auto'; }
    },
    setCustoms(v) {
        if (v === 'auto') localStorage.removeItem(this.customsKey);
        else localStorage.setItem(this.customsKey, v);
    },
    // Whether you have a bike with you: Navigate and a trip then weigh cycling there too.
    getBike() {
        try { return localStorage.getItem(this.bikeKey) === 'on'; } catch { return false; }
    },
    setBike(on) {
        try {
            if (on) localStorage.setItem(this.bikeKey, 'on');
            else localStorage.removeItem(this.bikeKey);
        } catch { /* this visit only */ }
    },

    // Home or Work ("home" or "work"), set in Places (js/places.js): { label, lat, lng }, with `stop` the
    // stop code when the place is a bus stop. Null while it isn't set.
    getPlace(kind) {
        const v = readJson(kind === 'work' ? this.workKey : this.homeKey, null);
        return v && typeof v.label === 'string' && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
    },
    setPlace(kind, place) {
        const key = kind === 'work' ? this.workKey : this.homeKey;
        if (place) localStorage.setItem(key, JSON.stringify(place));
        else localStorage.removeItem(key);
        // The Android app's Bus home and Bus to work (js/reminders.js).
        window.dispatchEvent(new Event('places:change'));
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

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st.
function ordinal(n) {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    const end = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    return `${n}${end}`;
}

// How old you turn this year, by the birthday's year; null without a likely one.
function birthdayAge(now = new Date()) {
    const year = Number(LS.getBirthday().slice(0, 4));
    const age = now.getFullYear() - year;
    return age >= 1 && age <= 130 ? age : null;
}

// On your birthday the greeting takes two lines, the wish and then your name, so a long name
// isn't cut off: "Happy 25th Birthday," then "Sam!".
function updateGreeting() {
    const name = LS.getName();
    const h1 = $('#greeting');
    const birthday = isBirthday();
    h1.classList.toggle('birthday', birthday);
    if (!birthday) {
        const g = getGreeting();
        h1.textContent = name ? `${g}, ${name}!` : `${g}!`;
        return;
    }
    const age = birthdayAge();
    const wish = `Happy ${age ? `${ordinal(age)} ` : ''}Birthday`;
    h1.innerHTML = name
        ? `<span class="greetLine">${escapeHtml(wish)},</span><span class="greetLine">${escapeHtml(name)}!</span>`
        : `<span class="greetLine">${escapeHtml(wish)}!</span>`;
}

// Confetti each time the app's opened on your birthday: as the page loads, and as it comes
// back after a while away (an installed app is often resumed rather than loaded again).
const CONFETTI_AWAY_MS = 10 * 60 * 1000;
let hiddenAt = null;
function birthdayConfetti() {
    if (isBirthday() && LS.getConfetti()) window.Confetti?.burst();
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt != null && Date.now() - hiddenAt >= CONFETTI_AWAY_MS) birthdayConfetti();
    hiddenAt = null;
});

function syncConfettiButtons() {
    $$('[data-confetti]').forEach(btn => {
        const on = (btn.dataset.confetti === 'on') === LS.getConfetti();
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
}

// Restricted areas, in Settings: the route planner's network (js/network.js) follows it at once,
// and Navigate asks /api/nav with it.
function syncRestrictedButtons() {
    BusNet.setOpenAccess(LS.getRestricted());
    $$('[data-restricted]').forEach(btn => {
        const on = (btn.dataset.restricted === 'on') === LS.getRestricted();
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
}
syncRestrictedButtons();

// Immigration time, in Settings: read by the planner (customsFor in js/planner.js) and sent
// to /api/nav (js/nav.js) each time they plan.
function syncCustomsButtons() {
    $$('[data-customs]').forEach(btn => {
        const on = btn.dataset.customs === LS.getCustoms();
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
}

// Cycling, in Settings: sent to /api/nav (js/nav.js), so ways by bike are weighed too.
function syncBikeButtons() {
    $$('[data-bike]').forEach(btn => {
        const on = (btn.dataset.bike === 'on') === LS.getBike();
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
}

// The X on a stop's timings, which puts them away (closeStop): there with the glance on or off,
// now Bus timings is a page of its own with the search box to come back to.
function syncStopClose() {
    $('#stopCloseBtn').hidden = false;
}

// Custom home, in Settings (js/main-screen.js).
function syncMainButtons() {
    const home = MainScreen.home();
    $$('[data-home]').forEach(btn => {
        // Only the pages that are on (Settings' Edge Tray buttons).
        btn.hidden = !MainScreen.shows(btn.dataset.home);
        const on = btn.dataset.home === home;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
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

// A Share button's link: the share sheet on a phone, copied elsewhere, the button saying so for
// a moment. Where neither works, it's shown to copy by hand.
async function shareLink(btn, url, title) {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try {
            await navigator.share({ title, url });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(url);
    } catch {
        prompt('Copy this link:', url);
        return;
    }
    const lbl = btn.querySelector('.lbl');
    if (!lbl) return;
    lbl.dataset.label ??= lbl.textContent;
    lbl.textContent = 'Link copied';
    clearTimeout(btn.shareTimer);
    btn.shareTimer = setTimeout(() => { lbl.textContent = lbl.dataset.label; }, 2000);
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
    // The stations, for a search like "Bedok MRT" (js/station-search.js).
    StationSearch.load();
    const idx = await ensureStopsIndex();
    // Lowercased once here rather than for every stop on every keystroke.
    acData = Object.entries(idx).map(([code, v]) => {
        const name = v.n || '', road = v.road || '';
        return { code, name, road, find: `${name}\n${road}`.toLowerCase() };
    });
}

// The stops a search matches, as { stops, note }. Stops are checked in order and the search
// stops at `limit` matches of the query in one piece, so a short query doesn't run through
// all five thousand. A station ("Bedok MRT") gives the stops at it, nearest an exit first,
// each with its `distance`. Otherwise a word LTA shortens matches all its forms, and a query
// of several words matches them in any order across name and road, so "blk 109 bedok" finds
// Blk 109 on Bedok Nth Rd (js/contractions.js); those come after the matches in one piece, so
// a road typed in full still lists its own stops first. `note` says which forms were
// searched, when some stops were only found that way.
function matchStops(q, limit = 20) {
    q = q.trim().toLowerCase();
    if (!q) return { stops: [], note: '' };

    const station = StationSearch.find(q);
    const atStation = station ? StationSearch.stopsAt(station, stopsIndex, haversine).slice(0, limit) : [];
    if (atStation.length) {
        return {
            stops: atStation.map(s => ({ code: s.code, name: nameOf(s.code), road: stopsIndex[s.code]?.road || '', distance: s.distance })),
            note: `Bus stops at ${StationSearch.label(station)}`,
        };
    }

    const isCode = /^\d+$/.test(q);
    const swaps = isCode ? null : Contractions.matcher(q);
    const out = [];
    const loose = [];
    const swappedOnly = [];
    for (const it of acData) {
        const plain = isCode ? it.code.startsWith(q) : it.find.includes(q);
        if (plain || swaps?.test(it.find)) {
            out.push(it);
            if (!plain) swappedOnly.push(it.find);
            if (out.length >= limit) break;
        } else if (loose.length < limit && swaps?.words(it.find)) {
            loose.push(it);
        }
    }
    // Word by word only fills what's left, and counts as swapped for the note.
    const extra = loose.slice(0, limit - out.length);
    swappedOnly.push(...extra.map(it => it.find));
    return { stops: [...out, ...extra], note: swappedOnly.length ? swaps.note(swappedOnly) : '' };
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
                `<span class="name">${escapeHtml(it.name)}${it.road ? `<span class="road"> · ${escapeHtml(it.road)}</span>` : ''}` +
                // How far from the station's nearest exit, for a search like "Bedok MRT".
                (it.distance != null ? `<span class="road"> · ${formatDistance(it.distance)}</span>` : '') +
                (BusNet.crossBorder(it.code) ? `<span class="road"> · ${escapeHtml(BusNet.crossBorder(it.code).label)}</span>` : '') + `</span>` +
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
        if (!directFor) return { ...matchStops(v), direct: null };
        const { stops: all, note } = matchStops(v, DIRECT_CHECK_LIMIT);
        const direct = new Map();
        for (const s of all) {
            const buses = directFor(s.code);
            if (buses) direct.set(s.code, buses);
        }
        const stops = [...all.filter(s => direct.has(s.code)), ...all.filter(s => !direct.has(s.code))].slice(0, 20);
        return { stops, direct, note: [direct.size ? directNote?.(direct.size) : '', note].filter(Boolean).join(' · ') };
    };
    const render = () => {
        const v = input.value;
        const { stops, direct, note } = suggest(v);
        renderAcList(box, stops, withServices && BusNet.isReady() ? BusNet.matchServices(v, 4) : [],
            isPostalCode(v) ? v.trim() : null, direct, note);
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    // Not if the box has been tapped back into meanwhile, which would close what that opened.
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) box.hidden = true; }, 150));
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
    window.Glance?.favsChanged();
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

    shareFavsWithWidgets(favs);

    // How many, on the star in the Edge Tray that opens them.
    const total = favs.length + buses.length + routes.length + navs.length;
    $('#favCount').textContent = total > 99 ? '99+' : String(total);
    $('#favCount').hidden = !total;
    const label = total ? `Favourites: ${total}` : 'Favourites';
    $('#favsBtn').setAttribute('aria-label', label);
    $('#favsBtn').title = label;

    $('#favStopsGroup').hidden  = !favs.length;
    $('#favBusesGroup').hidden  = !buses.length;
    $('#favRoutesGroup').hidden = !routes.length;
    $('#favNavsGroup').hidden   = !navs.length;
    $('#favEmpty').hidden = favs.length + buses.length + routes.length + navs.length > 0;
}

// The favourite stops, copied where the installed app's Bus timings widget can offer them in
// its setup (sw.js). The cache is the one storage a service worker and a page both reach.
// The Android app's widget (TimingsWidget.java) gets them too, for its own setup.
function shareFavsWithWidgets(favs, waited = false) {
    // Names and places come from the stops list: shared once it's in, or without if it can't be.
    if (!stopsIndex && !waited) {
        const again = () => shareFavsWithWidgets(favs, true);
        ensureStopsIndex().then(again, again);
        return;
    }
    // With where each is, for the Wear OS tile's nearest favourite (android WearSync.java).
    const list = favs.map(({ code, name }) => ({
        code, name: name || nameOf(code) || '', lat: stopsIndex?.[code]?.lat ?? null, lng: stopsIndex?.[code]?.lng ?? null,
    }));
    if (window.AppBridge?.native) {
        AppBridge.ready(5000).then(() => AppBridge.has('widget') && AppBridge.call('SgBus', 'setFavourites', { stops: list })).catch(() => {});
    }
    // The desktop app's Jump List, Dock menu and taskbar thumbnail buttons (desktop/glance.js).
    window.sgbusDesktop?.favourites?.(list);
    if (!('caches' in window)) return;
    caches.open('sgbus-widgets')
        .then(c => c.put('/widget/favourites', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } })))
        .catch(() => {});
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

// ----------- Which way each bus is going -----------
// Some stops have a bus calling both ways, on a road it runs up and back (136 at 66271, both
// ways of 21 at 52129), and LTA lists it twice, once per way, with nothing on show to tell
// the two apart. A loop service passing a stop on its way out and again on its way back (73
// at 66271) mixes the two in one list instead, and is split in two the same way, one entry
// per time round, at the cost of fewer than three buses in each. Each way gets where it's
// heading and a tone, the same on its card, in the Incoming buses bar and on the board.

const busesOf = s => [s.next, s.next2, s.next3];
const destOf = s => busesOf(s).find(b => b?.dest)?.dest || null;

// The direction of a service's route that ends at a stop, or null.
function dirEndingAt(no, dest) {
    const dirs = BusNet.isReady() ? BusNet.serviceInfo(no)?.dirs : null;
    const hit = dirs && Object.entries(dirs).find(([, ends]) => ends[1] === dest);
    return hit ? Number(hit[0]) : null;
}

// Each service listed more than once, one per way: Map of entry -> { to, dir, tone }. The
// tone goes by where it's heading, so each way keeps its colour from one refresh to the next.
function twoWayHeadings(services) {
    const byNo = new Map();
    for (const s of services) (byNo.get(s.serviceNo) || byNo.set(s.serviceNo, []).get(s.serviceNo)).push(s);
    const out = new Map();
    for (const [no, group] of byNo) {
        if (group.length < 2) continue;
        const dests = group.map(destOf);
        if (dests.some(d => !d) || new Set(dests).size < group.length) continue;
        const order = [...dests].sort();
        group.forEach((s, i) => out.set(s, { to: dests[i], dir: dirEndingAt(no, dests[i]), tone: order.indexOf(dests[i]) % 3 }));
    }
    return out;
}

// The services at a stop with each way apart, as { services, ways }: `services` has a service
// passing the stop twice split into an entry per time round, its buses in order, and `ways`
// maps each entry going one of two ways to { label, short, tone, dir, round }, `round` for a
// time round rather than a way.
function busWays(services) {
    const headings = twoWayHeadings(services);
    const out = [];
    const ways = new Map();
    for (const s of services) {
        const heading = headings.get(s);
        if (heading) {
            const to = nameOf(heading.to) || heading.to;
            ways.set(s, { label: `To ${to}`, short: `→ ${to}`, tone: heading.tone, dir: heading.dir });
            out.push(s);
            continue;
        }
        const buses = busesOf(s).filter(Boolean);
        if (!buses.some(b => b.visit === 2)) { out.push(s); continue; }
        for (const visit of [1, 2]) {
            const these = buses.filter(b => (b.visit === 2 ? 2 : 1) === visit);
            if (!these.length) continue;
            const entry = { ...s, next: these[0] || null, next2: these[1] || null, next3: these[2] || null };
            ways.set(entry, { ...timeRound(s.serviceNo, these[0]), dir: null, round: true });
            out.push(entry);
        }
    }
    return { services: out, ways };
}

// Which time round a bus is on, at a stop its service passes twice: { label, short, tone }.
function timeRound(no, bus) {
    // Where it loops, once the route list is in.
    const loop = (BusNet.isReady() && BusNet.serviceInfo(no)?.loop) || '';
    const isLoop = !!(loop || (bus.origin && bus.origin === bus.dest));
    const home = nameOf(bus.dest) || bus.dest || '';
    if (bus.visit === 2) {
        return isLoop
            ? { label: `Back to ${home}`, short: `↩ ${home}`, tone: 1 }
            : { label: 'Second time past here', short: '2nd time', tone: 1 };
    }
    return isLoop
        ? { label: loop ? `Out to ${loop}` : 'On its way out', short: `→ ${loop || 'Out'}`, tone: 0 }
        : { label: 'First time past here', short: '1st time', tone: 0 };
}

// ----------- Incoming Buses Bar -----------
function renderIncomingBar(data) {
    const bar       = $('#incomingBar');
    const container = $('#incomingBuses');
    const svcs      = data?.services || [];
    const ways      = data?.ways || new Map();

    const items = svcs
        .filter(s => s.next && s.next.eta_ms != null)
        .map(s => ({ svcNo: s.serviceNo, eta_ms: s.next.eta_ms, load: s.next.load, to: ways.get(s) || null }))
        .sort((a, b) => a.eta_ms - b.eta_ms);

    if (!items.length) { bar.hidden = true; return; }

    container.innerHTML = items.map(item => {
        const secs      = Math.max(0, Math.round(item.eta_ms / 1000));
        const m         = Math.floor(secs / 60), s = secs % 60;
        const timeLabel = m > 0 ? `${m} min` : `${s}s`;
        const cls       = loadTextClass(item.load);
        const to        = item.to;
        return `<div class="incomingBusItem${to ? ` toned tone${to.tone}` : ''}"${to ? ` title="${escapeHtml(`${item.svcNo}: ${to.label}`)}"` : ''}>` +
            `<div class="incomingBusTime${cls ? ' ' + cls : ''}">${timeLabel}</div>` +
            `<div class="incomingBusNo">${escapeHtml(item.svcNo)}</div>` +
            (to ? `<div class="incomingBusTo">${escapeHtml(to.short)}</div>` : '') +
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
//             | { kind: 'nav' }, a way in Navigate, which keeps it (js/nav.js, backToNav)
//   dir       the direction of `service`'s route the user was looking at
let current = null;
let lastArrivals = null;
let navOpen = false;
let loadSeq = 0;

// Directions to a stop: the live map (js/map.js), walking there turn by turn from where you
// are, and these map apps besides.
const MAP_APPS = [
    { id: 'citymapper', label: 'Citymapper' },
];

// Directions to a stop (or any { lat, lng, n }) in a map app: the app itself where it's
// installed, its website otherwise. `from` starts them somewhere other than where you are.
// Citymapper's links have no mode, and it offers walking among its own.
function directionsUrl(stop, app, { from = null } = {}) {
    let q = `endcoord=${stop.lat}%2C${stop.lng}&endname=${encodeURIComponent(stop.n || '')}`;
    if (stop.road) q += `&endaddress=${encodeURIComponent(stop.road)}`;
    if (from) q += `&startcoord=${from.lat}%2C${from.lng}`;
    return `https://citymapper.com/directions?${q}`;
}

function stopHash() {
    return current ? `#${current.code}${current.service ? ',' + current.service : ''}` : '';
}

// The buses a stop is narrowed to, as typed after its code or in a link: one ("174"), several
// ("174, 175" or "174 175"), or any starting with something ("22*": 22, 222, 225G...).
// Normalised to "174,175" and "22*", or null if it isn't a list of buses.
function busFilter(text) {
    const parts = String(text || '').toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (!parts.length || !parts.every(p => /^[0-9A-Z]{1,4}$|^[0-9A-Z]{1,3}\*$/.test(p))) return null;
    return [...new Set(parts)].join(',');
}

// Whether a bus is one of a filter's.
function busFilterHas(filter, serviceNo) {
    const no = String(serviceNo || '').toUpperCase();
    return filter.split(',').some(p => (p.endsWith('*') ? no.startsWith(p.slice(0, -1)) : no === p));
}

// The bus a filter names, when it's just the one: what Route from here and the rest need.
const oneBus = (filter) => (filter && /^[0-9A-Z]{1,4}$/.test(filter) ? filter : null);

// "bus 174", "buses 174 and 175", "buses 22*".
function busFilterText(filter) {
    const parts = filter.split(',');
    return parts.length === 1 && !parts[0].endsWith('*') ? `bus ${parts[0]}` : `buses ${listText(parts)}`;
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
            ? `<button type="button" class="iconBtn" data-tool="collapse" title="Show just these timings here">${ico('bus')} Only ${escapeHtml(busFilterText(service))}</button>`
            : `<button type="button" class="iconBtn" data-tool="expand" title="Show every bus at this stop">Show all services</button>`);
        if (!expanded && oneBus(service)) parts.push(`<button type="button" class="iconBtn" data-tool="onward" title="The stops this bus goes on to from here">${ico('route')} Route from here</button>`);
    }
    parts.push(`<button type="button" class="iconBtn" data-tool="pick" title="Pick one bus to see just its timings here">${ico('bus')} Pick a bus</button>`);

    const stop = stopsIndex?.[code];
    if (stop && stop.lat != null && stop.lng != null) {
        parts.push(navOpen
            ? `<button type="button" class="iconBtn" data-tool="livemap" title="Walk here on the live map">${ico('map')} Live map</button>` +
              MAP_APPS.map(app =>
                `<a class="iconBtn" title="Walking directions here in ${escapeHtml(app.label)}" href="${escapeHtml(directionsUrl(stop, app.id))}" target="_blank" rel="noopener noreferrer">${ico('navigate')} ${escapeHtml(app.label)}</a>`
              ).join('')
            : `<button type="button" class="iconBtn" data-tool="navigate" title="Walking directions to this stop">${ico('navigate')} Directions</button>`);
    }
    parts.push(`<button type="button" class="iconBtn" data-tool="board" title="This stop's buses full screen, like an interchange's departure screens">${ico('clock')} Board</button>`);
    // The desktop app: this stop's (or bus's) next buses in the tray (desktop/glance.js).
    if (window.sgbusDesktop?.tray) {
        parts.push(`<button type="button" class="iconBtn" data-tool="tray" title="Show ${oneBus(service) && !expanded ? `bus ${escapeHtml(service)}'s` : "this stop's"} next buses in the tray, and stop it from the tray's menu">${ico('bell')} Tray countdown</button>`);
    }
    // The Android app with NFC: this stop on a sticker (js/offline-share.js).
    if (window.OfflineShare?.canSticker()) {
        parts.push(`<button type="button" class="iconBtn" data-tool="sticker" title="Write this stop onto an NFC sticker">${ico('nearby')} NFC sticker</button>`);
    }
    $('#stopTools').innerHTML = parts.join('');
}

function backLabel(ctx) {
    switch (ctx?.kind) {
        case 'route':   return 'Back to route';
        case 'journey': return 'Back to journey';
        case 'service': return `Back to bus ${ctx.service}`;
        case 'nearby':  return 'Back to nearby stops';
        case 'nav':     return 'Back to Navigate';
        default:        return 'Back';
    }
}

function renderStopContext() {
    const { ctx, code, service } = current;
    const needsNetwork = ctx && (ctx.kind === 'route' || ctx.kind === 'journey');
    if (needsNetwork && !BusNet.isReady()) {
        BusNet.load(stopsIndex).then(() => { if (current?.ctx === ctx) renderStopContext(); }).catch(() => {});
    }
    const note = ctx ? stopsLeftNote(ctx, code, oneBus(service)) : null;
    $('#stopNote').textContent = note || '';
    $('#stopNote').hidden = !note;
    $('#stopBackLabel').textContent = backLabel(ctx);
    $('#stopContext').hidden = !ctx;
}

// A stop with the same name as another this close is the same place under two codes: an
// interchange split in two, each with buses of its own (Woodlands Int is 46008 and 46009).
// The same as SAME_PLACE_M in the Telegram bot's bus_stops.py.
const SAME_PLACE_M = 250;

function samePlaceStops(code) {
    const here = stopsIndex?.[code];
    if (!here?.n) return [];
    const name = here.n.toLowerCase();
    return Object.entries(stopsIndex)
        .filter(([c, s]) => c !== code && s.n?.toLowerCase() === name && haversine(here.lat, here.lng, s.lat, s.lng) <= SAME_PLACE_M)
        .map(([c]) => c);
}

// Under the stop's name: a stop only authorised people may use or one across the border
// (js/network.js), and a way to the other half of one split in two, where some buses only
// ever stop.
function renderStopAside() {
    const { code } = current;
    const parts = [];
    const r = BusNet.restricted(code);
    if (r) {
        parts.push(`<p class="stopAsideNote">${ico('alert')} <span><strong>Authorised personnel only.</strong> ` +
            escapeHtml(r.through
                ? `This stop is at ${r.place}: the public can't get on or off here, but can ride past.`
                : `This stop is inside ${r.place}: the public can't get on or off here, or ride through.`) +
            `</span></p>`);
    }
    const border = BusNet.crossBorder(code);
    if (border) {
        parts.push(`<p class="stopAsideNote">${ico('alert')} <span><strong>${escapeHtml(border.label)}.</strong> ` +
            `${escapeHtml(border.note)}</span></p>`);
    }
    for (const other of samePlaceStops(code)) {
        parts.push(`<button type="button" class="iconBtn" data-same-place="${escapeHtml(other)}" title="Some buses here only stop at the other code">` +
            `${ico('bus')} Also ${escapeHtml(nameOf(other) || other)} (${escapeHtml(other)})</button>`);
    }
    // Buses skipping it today or tomorrow, from the newsfeed (js/alerts.js): drawn again once
    // it's in.
    const notes = window.Alerts?.stopNotes(code) || [];
    parts.unshift(...notes.map((n) => n.html));
    $('#stopAside').innerHTML = parts.join('');
    $('#stopAside').hidden = !parts.length;
    if (!notes.length && window.Alerts?.notices) {
        Alerts.notices().then(() => {
            if (current?.code === code && Alerts.stopNotes(code).length) renderStopAside();
        }).catch(() => {});
    }
}

function goBack(ctx) {
    if (ctx.kind === 'route')        openPlanner(ctx.start, ctx.end, { when: ctx.when });
    else if (ctx.kind === 'journey') openPlanner(ctx.start, ctx.end, { journey: ctx.legs, when: ctx.when });
    else if (ctx.kind === 'service') openService(ctx.service, { fromStop: ctx.fromStop, onward: ctx.onward, dir: ctx.dir });
    else if (ctx.kind === 'nearby')  openNearbyList(ctx.stops, ctx.title);
    else if (ctx.kind === 'nav')     backToNav();
}

// The icon is drawn once, in a hidden <symbol> on the page, and each badge points at it:
// a stop shows up to three buses per service, and copying the whole drawing into every
// badge made a busy stop's timings several times heavier to parse.
const wheelchairBadge = `<span class="badge"><svg class="icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><use href="#i-wheelchair"/></svg> Wheelchair</span>`;

(function addWheelchairSymbol() {
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    sprite.innerHTML = `<symbol id="i-wheelchair" viewBox="0 0 512 512"><path fill="currentColor" d="M192 96a48 48 0 1 0 0-96 48 48 0 1 0 0 96zM120.5 247.2c12.4-4.7 18.7-18.5 14-30.9s-18.5-18.7-30.9-14C43.1 225.1 0 283.5 0 352c0 88.4 71.6 160 160 160c61.2 0 114.3-34.3 141.2-84.7c6.2-11.7 1.8-26.2-9.9-32.5s-26.2-1.8-32.5 9.9C240 440 202.8 464 160 464C98.1 464 48 413.9 48 352c0-47.9 30.1-88.8 72.5-104.8zM259.8 176l-1.9-9.7c-4.5-22.3-24-38.3-46.8-38.3c-30.1 0-52.7 27.5-46.8 57l23.1 115.5c6 29.9 32.2 51.4 62.8 51.4h5.1c.4 0 .8 0 1.3 0h94.1c6.7 0 12.6 4.1 15 10.4L402 459.2c6 16.1 23.8 24.6 40.1 19.1l48-16c16.8-5.6 25.8-23.7 20.2-40.5s-23.7-25.8-40.5-20.2l-18.7 6.2-25.5-68c-11.7-31.2-41.6-51.9-74.9-51.9H282.2l-9.6-48H336c17.7 0 32-14.3 32-32s-14.3-32-32-32H259.8z"/></symbol>`;
    document.body.prepend(sprite);
})();

const DAY_NAMES = { Weekday: 'weekday', Sat: 'Saturday', Sun: 'Sunday' };

function firstLastText(svcNo, code, dir = null) {
    const fl = BusNet.isReady() ? BusNet.firstLast(svcNo, code, dir) : null;
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
    // Over every bus at the stop, so narrowing to one still tells its two ways apart.
    const { services: apart, ways } = busWays(data?.services || []);
    let svcs = [...apart].sort((a, b) => BusNet.byNumber(a.serviceNo || '', b.serviceNo || ''));
    if (service && !expanded) svcs = svcs.filter(s => busFilterHas(service, s.serviceNo));
    svcs = pinFavourites(svcs, favBuses, LS.getPin('bus'), s => s.serviceNo);

    renderIncomingBar({ services: svcs, ways });

    const svcWrap = $('#services');
    if (!svcs.length) {
        svcWrap.innerHTML = '';
        const narrowed = service && !expanded;
        const fl = narrowed && oneBus(service) ? firstLastText(service, code) : '';
        $('#emptySvc').textContent = narrowed
            ? `No live arrivals for ${busFilterText(service)} right now.${fl ? ` ${fl}.` : ''}`
            : 'No live buses right now.';
        $('#emptySvc').hidden = false;
        window.MakeIt?.render(code, []);
        return;
    }
    $('#emptySvc').hidden = true;

    const stopLat = stopsIndex?.[code]?.lat ?? null;
    const stopLng = stopsIndex?.[code]?.lng ?? null;

    const piece = (bus, svcNo) => {
        if (!bus) return `<div class="eta"><strong>-</strong></div>`;
        const mins  = msToMins(bus.eta_ms);
        const cls   = loadTextClass(bus.load);
        const haveCoords = bus.lat != null && bus.lng != null && stopLat != null && stopLng != null;
        // Along its route where the route list has the distances (js/network.js), otherwise
        // the straight line.
        const along = haveCoords && BusNet.isReady() ? BusNet.busDistance(svcNo, code, bus) : null;
        const dist  = haveCoords ? ` ~ ${along ?? haversine(bus.lat, bus.lng, stopLat, stopLng)}m` : '';
        const maybei  = bus.rough ? '<i>' : '';
        const maybei2 = bus.rough ? '</i>' : '';
        const wheelchair = bus.wheelchair ? wheelchairBadge : '';
        const deck  = `<span class="badge">${escapeHtml(bus.deck || '')}</span>`;
        const distBadge = haveCoords
            ? `<span class="badge badge-dist" title="${along != null ? 'Along its route' : 'In a straight line'}">${dist}</span>`
            : `<span class="badge badge-dist badge-dist-na">~ &#8734;m</span>`;
        const badges = `<div class="badges">${wheelchair}${deck}${distBadge}</div>`;
        // Gone before you could walk here (js/make-it.js): greyed.
        const late = window.MakeIt?.tooSoon(code, bus.eta_ms) ? ' tooSoon' : '';
        return `<div class="eta${late}">${maybei}<strong class="${cls}">${mins}</strong>${maybei2}${badges}</div>`;
    };

    svcWrap.innerHTML = svcs.map(s => {
        const svcNo = s.serviceNo || '?';
        const fav = favBuses.has(svcNo);
        const way = ways.get(s);
        const fl = firstLastText(svcNo, code, way?.dir);
        return `<div class="svc${way ? ` toned tone${way.tone}` : ''}" data-svc="${escapeHtml(svcNo)}">` +
            `<div class="svcLeft">` +
            `<div class="svcNo">${fav ? favMark() : ''}${escapeHtml(svcNo)}</div>` +
            // Which way this one's going, or which time round, where the stop has it both ways.
            (way ? `<div class="svcTo" title="Bus ${escapeHtml(svcNo)}: ${escapeHtml(way.label)}">${escapeHtml(way.short)}</div>` : '') +
            (s.operator ? `<div class="svcOp">${escapeHtml(s.operator)}</div>` : '') +
            `<button class="viewRouteBtn" data-view-route="${escapeHtml(svcNo)}"${way?.dir != null ? ` data-dir="${way.dir}"` : ''} title="Bus ${escapeHtml(svcNo)}'s route and stops">Route</button>` +
            // The flag-down screen (js/flag.js).
            `<button class="viewRouteBtn" data-flag="${escapeHtml(svcNo)}" title="Show ${escapeHtml(svcNo)} full screen, to flag the bus down">Flag</button>` +
            // Just this bus's times again, from wherever down the list it is (refreshService).
            `<button class="viewRouteBtn svcRefresh" data-refresh-svc="${escapeHtml(svcNo)}" aria-label="Refresh bus ${escapeHtml(svcNo)}" title="Refresh bus ${escapeHtml(svcNo)}'s times">${ico('sync')}</button>` +
            `</div>` +
            `<div class="etaWrap">${piece(s.next, svcNo)}${piece(s.next2, svcNo)}${piece(s.next3, svcNo)}` +
            // With the Android app's last bus reminder bell (js/reminders.js).
            (fl ? `<div class="firstLast">${escapeHtml(fl)}${window.Reminders?.bell(svcNo, code) || ''}</div>` : '') +
            `</div>` +
            `</div>`;
    }).join('');
    window.MakeIt?.render(code, svcs);
}

// Puts a stop's timings away, back to Bus timings' search box. Back goes back to the page the
// stop was opened from, such as Glance.
function closeStop() {
    loadSeq++;
    current = null;
    lastArrivals = null;
    $('#resultCard').hidden = true;
    $('#q').value = '';
    history.replaceState(null, '', location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadStop(code, { service = null, expanded = false, ctx = null, dir = null, pushHistory = true, scroll = false } = {}) {
    if (!/^\d{5}$/.test(code)) { alert('Please enter a valid 5-digit bus stop code.'); return; }
    // Offline, Bus timings is gone till it's back (js/offline.js): a stop tapped anywhere, a
    // link to one or Refresh brings the offline bar back to say so, and what's on show stays.
    if (window.Offline?.blocked()) return;
    const seq = ++loadSeq;
    current = { code, service: service ? busFilter(service) : null, expanded, ctx, dir };
    navOpen = false;
    // A stop's timings are Bus timings' page, from wherever on the main screen it was opened.
    MainScreen.open('timings');

    $('#q').value = current.service ? `${code} ${current.service}` : code;
    $('#acList').hidden = true;
    renderStopHeader();
    renderStopTools();
    renderStopContext();
    renderStopAside();
    window.MakeIt?.forStop(code);
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

// Refresh, and Shake to refresh: the stop open, or with none, the glance (js/glance.js).
function refreshStop() {
    if (!current) return Glance.refresh();
    loadStop(current.code, { ...current, pushHistory: false });
}

// Back online (js/offline.js): a stop left open in Bus timings, out of sight while offline,
// has its times fetched again behind the page on show, which stays, so the ones from before
// aren't what's there when Bus timings is opened.
window.Offline?.onChange(off => {
    if (off || !current) return;
    const seq = ++loadSeq;
    fetchArrivals(current.code).then(data => {
        if (seq !== loadSeq) return;
        lastArrivals = data;
        renderArrivals();
    }, () => {});
});

// One bus's times at the stop on screen fetched again, put in place of the ones it had, so the
// list stays where it's scrolled to.
async function refreshService(btn, svc) {
    const code = current?.code;
    if (!code || btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    const same = (s) => String(s.serviceNo).toUpperCase() === svc.toUpperCase();
    try {
        const fresh = (await fetchArrivals(code, svc)).services?.filter(same) || [];
        if (current?.code !== code || !lastArrivals) return;
        const services = lastArrivals.services || [];
        const at = services.findIndex(same);
        const rest = services.filter((s) => !same(s));
        rest.splice(at === -1 ? rest.length : at, 0, ...fresh);
        lastArrivals = { ...lastArrivals, services: rest };
        renderArrivals();
    } catch (e) {
        console.warn(`Refreshing bus ${svc} failed:`, e);
    } finally {
        btn.classList.remove('busy');
    }
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
        `<span class="name">${favs.has(code) ? favMark() : ''}${escapeHtml(nameOf(code) || code)}` +
        (BusNet.restricted(code) ? `<span class="road">Authorised personnel only</span>` : '') +
        (BusNet.crossBorder(code) ? `<span class="road">${escapeHtml(BusNet.crossBorder(code).label)}: passport needed</span>` : '') + `</span>` +
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

// What went wrong getting your location, to show: the desktop or Android app's own explanation
// if it gave one (js/desktop-location.js, js/geo-retry.js), otherwise by the error's code.
// `toDo` ends the sentence on what location was wanted for.
function locationMessage(err, toDo) {
    if (err?.desktopMessage || err?.appMessage) return err.desktopMessage || err.appMessage;
    return err?.code === 1
        ? `Location access is turned off for this site. Allow it in your browser ${toDo}.`
        : "Couldn't get your location. Check that Location is turned on for this device, then try again.";
}

function findNearbyStops(limit = 8) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("This browser can't share its location."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve(stopsNear(pos.coords.latitude, pos.coords.longitude, limit)),
            err => reject(new Error(locationMessage(err, 'to find stops near you'))),
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
            (BusNet.crossBorder(s.code) ? `<span class="road">${escapeHtml(BusNet.crossBorder(s.code).label)}: passport needed</span>` : '') +
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

// ----------- The Edge Tray -----------
// sg-psi's tray of glass buttons at the top of the screen (index.html), on the side Settings picks,
// tucked away and brought back by its arrow tab. Both are kept as attributes on <html>, set
// before first paint by the script in index.html's head; per-browser conveniences, so
// storage failing only means the defaults: on the right, out.
const TRAY = { sideKey: 'sgbus_tray_side', closedKey: 'sgbus_tray_closed', hideKey: 'sgbus_tray_hide' };
const page = document.documentElement;

function storeTray(key, value) {
    try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch { /* for this page view only */ }
}

function setTrayOpen(open, save = true) {
    page.toggleAttribute('data-tray-closed', !open);
    const label = open ? 'Hide the Edge Tray' : 'Show the Edge Tray';
    $('#trayTab').setAttribute('aria-expanded', String(open));
    $('#trayTab').setAttribute('aria-label', label);
    $('#trayTab').title = label;
    // Buttons slid off the screen mustn't take focus.
    $('#trayButtons').inert = !open;
    if (save) storeTray(TRAY.closedKey, open ? '' : '1');
}

function setTraySide(side) {
    if (side === 'left') page.setAttribute('data-tray-side', 'left');
    else page.removeAttribute('data-tray-side');
    storeTray(TRAY.sideKey, side === 'left' ? 'left' : '');
    syncTraySideButtons();
}

function syncTraySideButtons() {
    const side = page.getAttribute('data-tray-side') === 'left' ? 'left' : 'right';
    $$('#traySidePick [data-side]').forEach(btn => {
        const on = btn.dataset.side === side;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    syncTrayExtras();
}

// The tray's optional buttons, Explorer, SimplyGo, Telegram, Buy Augy a Coffee, the guide, and
// the Android app's Timings near a stop and Routines (js/reminders.js), Card value (js/card.js)
// and Receive nearby (js/offline-share.js), each turned off or on in Settings: kept as
// data-tray-hide on <html>, "telegram coffee", which index.html's head sets again before first
// paint. The pages that can be turned off have their switches there too (data-page-show), kept
// by js/main-screen.js.
const trayHidden = () => (page.getAttribute('data-tray-hide') || '').split(' ').filter(Boolean);

function setTrayExtra(name, show) {
    const hidden = trayHidden().filter(n => n !== name);
    if (!show) hidden.push(name);
    if (hidden.length) page.setAttribute('data-tray-hide', hidden.join(' '));
    else page.removeAttribute('data-tray-hide');
    storeTray(TRAY.hideKey, hidden.join(' '));
    syncTrayExtras();
}

function syncTrayExtras() {
    const hidden = trayHidden();
    $$('#trayExtrasPick [data-tray-show]').forEach(btn => {
        const on = !hidden.includes(btn.dataset.trayShow);
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    $$('#trayExtrasPick [data-page-show]').forEach(btn => {
        const on = MainScreen.shows(btn.dataset.pageShow);
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
}

// ----------- SimplyGo -----------
// A button in the Edge Tray for SimplyGo's app, for card balances, top-ups and travel history,
// shown on phones and tablets only.
//
// On Android with SG Bus Timings' own Android app installed (android/), the app opens SimplyGo
// itself, by its package, as a native app does (OpenAppActivity.java): the link names this
// app, so Chrome hands it there, from the app or from Chrome. Without it, Chrome goes to the
// link's fallback, SimplyGo's Play Store page. On iPhone and iPad, its App Store page. Either
// store page says Open once SimplyGo is installed.
//
// SimplyGo publishes no link that opens it. Its Android app (9.29.0) does answer
// sg.com.transitlink: links, but sg.com.transitlink://main sent it into a loop of opening and
// closing, so they're not used.
const SIMPLYGO_PLAY = 'https://play.google.com/store/apps/details?id=sg.com.transitlink';
const SIMPLYGO_ANDROID = 'intent://open/simplygo#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;' +
    `S.browser_fallback_url=${encodeURIComponent(SIMPLYGO_PLAY)};end`;

(function showSimplyGo() {
    const ua = navigator.userAgent;
    const android = /Android/i.test(ua);
    // iPadOS asks for desktop sites, so says it's a Mac; a touch screen gives it away.
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 0);
    if (!android && !ios) return;
    const btn = $('#simplyGoBtn');
    if (android) {
        btn.href = SIMPLYGO_ANDROID;
        // An intent is handed to Android, not opened in a tab.
        btn.removeAttribute('target');
    }
    btn.hidden = false;
})();

setTrayOpen(!page.hasAttribute('data-tray-closed'), false);
$('#trayTab').addEventListener('click', () => setTrayOpen(page.hasAttribute('data-tray-closed')));
$('#traySidePick').addEventListener('click', e => {
    const btn = e.target.closest('[data-side]');
    if (btn) setTraySide(btn.dataset.side);
});
$('#trayExtrasPick').addEventListener('click', e => {
    const btn = e.target.closest('[data-tray-show], [data-page-show]');
    if (!btn) return;
    const show = btn.getAttribute('aria-pressed') !== 'true';
    if (btn.dataset.pageShow) MainScreen.setShown(btn.dataset.pageShow, show);
    else setTrayExtra(btn.dataset.trayShow, show);
});

// Settings opens on its list of groups (index.html, #settingsModal), or straight into the group
// `group` names ('sync' for a sync link, js/sync.js); one already open stays as it is.
function openSettings(group) {
    if ($('#settingsModal').classList.contains('hidden')) {
        $('#settingsFind').value = '';
        settingsListHeight = 0;
        findSettings();
        settingsView(null);
    }
    $('#setName').value = LS.getName();
    $('#setBirthday').value = LS.getBirthday();
    syncPinButtons();
    syncTraySideButtons();
    syncConfettiButtons();
    syncRestrictedButtons();
    syncCustomsButtons();
    syncBikeButtons();
    syncMainButtons();
    prepareSync();
    $('#settingsTour').innerHTML = Tour.pickers();
    openModal('settingsModal');
    if (typeof group === 'string') openSettingsGroup(group);
}

// ----------- Settings' groups -----------
// Each group is a view of its own, over the list, with Back (the arrow, Esc, Android's and a
// browser's) going to the list before Settings closes: a step of its own (js/ui.js,
// Steps.sub), which closing Settings from a group takes off too. A group with nothing on show
// (the Android app's own settings, on the web) leaves the list, and each group's line names
// what's on show in it, as js/reminders.js, js/shake.js and js/pip.js show and hide theirs.
const settingsGroups = () => $$('#settingsModal [data-settings-group]');
const settingsGroupEl = name => document.querySelector(`#settingsModal [data-settings-group="${name}"]`);
let settingsAt = null;

// Whether `el` is on show within its group, whether the group's open or not.
function settingsShown(el, group) {
    for (let n = el; n && n !== group; n = n.parentElement) if (n.hidden) return false;
    return true;
}

const settingsLabels = group => [...group.querySelectorAll('.modal-section-label')].filter(l => settingsShown(l, group));
const settingsShort = label => ('short' in label.dataset ? label.dataset.short : label.textContent.trim());

function renderSettingsGroups() {
    for (const group of settingsGroups()) {
        const row = document.querySelector(`[data-settings-open="${group.dataset.settingsGroup}"]`);
        const labels = settingsLabels(group);
        // Only a change: the observer below watches this too.
        if (row.hidden !== !labels.length) row.hidden = !labels.length;
        row.querySelector('.sub').textContent = labels.map(settingsShort).filter(Boolean).join(' · ');
    }
}

// The list (`name` null) or a group on show, Back's arrow and the title to match.
function settingsView(name) {
    const was = settingsAt;
    settingsAt = settingsGroupEl(name) ? name : null;
    $('#settingsHome').hidden = !!settingsAt;
    settingsGroups().forEach(g => { g.hidden = g.dataset.settingsGroup !== settingsAt; });
    $('#settingsBack').hidden = !settingsAt;
    $('#settingsTitle').textContent = settingsAt ? settingsGroupEl(settingsAt).dataset.title : 'Settings';
    // Back on the list with Find's words still there: the list's height again, as above.
    const finding = !settingsAt && settingsListHeight && $('#settingsFind').value.trim();
    $('#settingsModal .modal').style.minHeight = finding ? `${settingsListHeight}px` : '';
    $('#settingsModal .modal').scrollTop = 0;
    if (settingsAt) $('#settingsBack').focus({ preventScroll: true });
    else if (was) $(`[data-settings-open="${was}"]`)?.focus({ preventScroll: true });
}

function openSettingsGroup(name) {
    if (!settingsGroupEl(name) || $('#settingsModal').classList.contains('hidden')) return;
    if (settingsAt === name) return;
    Steps.sub('settingsModal', name);
    settingsView(name);
}

function closeSettingsGroup() {
    if (!settingsAt) return;
    settingsView(null);
    Steps.subBack('settingsModal');
}

// Find: the blocks whose label (or its data-find words) has every word typed, each a row that
// opens its group on it. Nothing typed, the groups. The modal keeps the list's height while
// there's something typed, so the box doesn't move up and down with what's found.
let settingsListHeight = 0;
function findSettings() {
    const words = $('#settingsFind').value.toLowerCase().split(/\s+/).filter(Boolean);
    const modal = $('#settingsModal .modal');
    if (words.length && !settingsAt && !$('#settingsGroups').hidden) settingsListHeight = modal.offsetHeight;
    modal.style.minHeight = words.length && settingsListHeight ? `${settingsListHeight}px` : '';
    $('#settingsGroups').hidden = !!words.length;
    $('#settingsFound').hidden = !words.length;
    if (!words.length) return renderSettingsGroups();
    const found = [];
    for (const group of settingsGroups()) {
        settingsLabels(group).forEach((label, i) => {
            const text = `${label.textContent} ${label.dataset.find || ''} ${group.dataset.title}`.toLowerCase();
            if (words.every(w => text.includes(w))) found.push({ group, label, i });
        });
    }
    $('#settingsFound').innerHTML = found.length
        ? found.map(f => `<button class="shareMenuItem" type="button" data-settings-find="${f.group.dataset.settingsGroup}:${f.i}">` +
            `<span><strong>${escapeHtml(f.label.textContent.trim())}</strong><span class="sub">${escapeHtml(f.group.dataset.title)}</span></span>` +
            `<span class="settingsGo" aria-hidden="true">${window.icon('chevron')}</span></button>`).join('')
        : '<p class="mode-note settingsFindNone">No setting by that name. Try a word such as tray, alert or sync.</p>';
}

// A block from Find: its group, scrolled to it, its label lit a moment.
function openSettingsFound(key) {
    const [name, i] = key.split(':');
    const group = settingsGroupEl(name);
    const label = group && settingsLabels(group)[Number(i)];
    if (!label) return;
    openSettingsGroup(name);
    label.scrollIntoView({ block: 'start' });
    label.classList.remove('settingsFlash');
    void label.offsetWidth;
    label.classList.add('settingsFlash');
}

$('#settingsGroups').addEventListener('click', e => {
    const row = e.target.closest('[data-settings-open]');
    if (row) openSettingsGroup(row.dataset.settingsOpen);
});
$('#settingsFound').addEventListener('click', e => {
    const row = e.target.closest('[data-settings-find]');
    if (row) openSettingsFound(row.dataset.settingsFind);
});
$('#settingsFind').addEventListener('input', findSettings);
$('#settingsFind').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = $('#settingsFound [data-settings-find]');
    if (first) openSettingsFound(first.dataset.settingsFind);
});
$('#settingsBack').addEventListener('click', closeSettingsGroup);
// Esc, with Settings the window on top: a group goes back to the list, and the list closes
// Settings. In Find with words typed, Esc clears them first, as a search box does.
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.body.classList.contains('touring')) return;
    const open = $$('.modal-backdrop:not(.hidden):not(.docked)');
    if (open[open.length - 1]?.id !== 'settingsModal') return;
    if (e.target === $('#settingsFind') && e.target.value) return;
    e.preventDefault();
    if (settingsAt) closeSettingsGroup();
    else closeModal('settingsModal');
});
// Back (Android's, a browser's) from a group: the list. js/ui.js has closed whatever opened
// after the step gone back to, and Settings too if it's not that step's.
window.addEventListener('popstate', e => {
    if ($('#settingsModal').classList.contains('hidden')) return;
    const s = e.state;
    const name = s?.sg && s.modal === 'settingsModal' ? s.sub || null : null;
    if (name !== settingsAt) settingsView(name);
});
// The Android app's settings come and go as it says what it can: the list follows.
new MutationObserver(() => {
    if (!settingsAt && !$('#settingsGroups').hidden) renderSettingsGroups();
}).observe($('#settingsModal'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });

// ----------- Search -----------
async function runSearch() {
    const v = $('#q').value.trim();
    $('#acList').hidden = true;
    if (!v) return;

    if (isPostalCode(v)) { searchPostal(v); return; }

    // A stop code, optionally followed by the buses to narrow it to: "84009 174", "84009 174,
    // 175" or "84009 22*" (busFilter).
    const stopMatch = v.match(/\b\d{5}\b/);
    if (stopMatch) {
        const rest = v.replace(stopMatch[0], '');
        if (stopsIndex?.[stopMatch[0]]) Recents.add(Recents.stopItem(stopMatch[0]));
        loadStop(stopMatch[0], { service: busFilter(rest) });
        return;
    }

    // A bus number on its own opens its route. Stop codes are always five digits and bus
    // numbers shorter, so the two never collide.
    const svc = v.toUpperCase();
    if (/^[0-9A-Z]{1,4}$/.test(svc)) {
        try { await BusNet.load(stopsIndex); } catch { /* fall through to the stop search */ }
        if (BusNet.hasService(svc)) { searchBus(svc); return; }
    }

    const { stops, note } = matchStops(v);
    // A station ("Bedok MRT") lists its stops to pick from, as a postal code does.
    if (stops[0]?.distance != null) { openNearbyList(stops, note); return; }
    const first = stops[0];
    if (first) {
        Recents.add(Recents.stopItem(first.code));
        loadStop(first.code);
    }
    else alert('Type a bus stop name, 5-digit stop code, 6-digit postal code, or bus number.');
}

// ----------- Events -----------
$('#titleBtn').addEventListener('click', openSettings);
$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsPlaces').addEventListener('click', () => { closeModal('settingsModal'); Places.open(); });
$('#settingsCalendar').addEventListener('click', () => { closeModal('settingsModal'); Calendar.openSettings(); });
$('#settingsTerminal').addEventListener('click', () => { closeModal('settingsModal'); openTerminal(); });

$('#setName').addEventListener('input', e => { LS.setName(e.target.value.trim()); updateGreeting(); });
$('#setBirthday').addEventListener('change', e => {
    LS.setBirthday(e.target.value);
    updateGreeting();
    birthdayConfetti();
});
$$('[data-confetti]').forEach(btn => btn.addEventListener('click', () => {
    LS.setConfetti(btn.dataset.confetti === 'on');
    syncConfettiButtons();
    birthdayConfetti();
}));
$$('[data-restricted]').forEach(btn => btn.addEventListener('click', () => {
    LS.setRestricted(btn.dataset.restricted === 'on');
    syncRestrictedButtons();
}));
$$('[data-customs]').forEach(btn => btn.addEventListener('click', () => {
    LS.setCustoms(btn.dataset.customs);
    syncCustomsButtons();
}));
$$('[data-bike]').forEach(btn => btn.addEventListener('click', () => {
    LS.setBike(btn.dataset.bike === 'on');
    syncBikeButtons();
}));
$('#homePick').addEventListener('click', e => {
    const btn = e.target.closest('[data-home]');
    if (btn) MainScreen.setHome(btn.dataset.home);
});
// From Settings or a synced device: the home, or a page turned on or off.
window.addEventListener('mainscreenchange', () => {
    syncMainButtons();
    syncTrayExtras();
});
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
// Each pick here is kept as a past search (js/recents.js), shown when the box is tapped into.
const searchStop = code => { Recents.add(Recents.stopItem(code)); $('#q').value = code; loadStop(code); };
const searchBus = svc => { Recents.add(Recents.busItem(svc)); openService(svc); };
const searchPostal = code => { Recents.add(Recents.postalItem(code)); openPostalList(code); };
attachAutocomplete($('#q'), $('#acList'), {
    withServices: true,
    onStop: searchStop,
    onService: searchBus,
    onEnter: runSearch,
    onPostal: searchPostal,
});
Recents.attach($('#q'), $('#acList'), {
    accepts: r => r.kind === 'bus' || r.kind === 'postal' || (r.kind === 'stop' && !!r.code),
    saved: 'favs',
    // A favourite from the Saved tab (it has an icon) opens without being kept as a search.
    onPick: r => (r.icon ? (r.kind === 'bus' ? openService(r.code) : loadStop(r.code))
        : r.kind === 'bus' ? searchBus(r.code) : r.kind === 'postal' ? searchPostal(r.code) : searchStop(r.code)),
});

$('#nearMeBtn').addEventListener('click', e =>
    withLocating(e.currentTarget, () => findNearbyStops().then(openNearbyList)));
// Explorer: the live map with every stop and station on it (js/map.js).
$('#explorerBtn').addEventListener('click', () => LiveMap.explore());

$('#refreshBtn').addEventListener('click', refreshStop);
$('#stopFavBtn').addEventListener('click', () => {
    if (!current) return;
    if (isFavStop(current.code)) removeFav(current.code);
    else addFav(current.code);
    renderStopHeader();
});
$('#stopBackBtn').addEventListener('click', () => { if (current?.ctx) goBack(current.ctx); });
$('#stopCloseBtn').addEventListener('click', closeStop);
$('#settingsTour').addEventListener('click', e => {
    const btn = e.target.closest('[data-tour]');
    if (!btn) return;
    closeModal('settingsModal');
    setTimeout(() => Tour.start(btn.dataset.tour), 300);
});
$('#stopAside').addEventListener('click', e => {
    const btn = e.target.closest('[data-same-place]');
    if (btn) loadStop(btn.dataset.samePlace);
});

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
    } else if (tool === 'livemap') {
        const stop = stopsIndex?.[current.code];
        if (stop) LiveMap.walkTo({ lat: stop.lat, lng: stop.lng, label: stop.n || current.code, code: current.code });
    } else if (tool === 'navigate') {
        navOpen = true;
        renderStopTools();
    } else if (tool === 'board') {
        Board.open(current.code);
    } else if (tool === 'tray') {
        const btn = e.target.closest('[data-tool]');
        window.sgbusDesktop.tray.set({
            code: current.code, name: nameOf(current.code) || '', service: !current.expanded ? oneBus(current.service) : null,
        }).then(() => {
            btn.lastChild.textContent = ' In the tray';
            setTimeout(() => { if (btn.isConnected) btn.lastChild.textContent = ' Tray countdown'; }, 2500);
        }).catch(() => {});
    } else if (tool === 'sticker') {
        OfflineShare.sticker({ url: `${location.origin}/#${current.code}`, title: `${nameOf(current.code) || 'Bus stop'} (${current.code})` });
    }
});

$('#services').addEventListener('click', e => {
    const again = e.target.closest('[data-refresh-svc]');
    if (again) return refreshService(again, again.dataset.refreshSvc);
    const btn = e.target.closest('[data-view-route]');
    if (!btn) return;
    const svc = btn.getAttribute('data-view-route');
    // A bus listed once per way at this stop opens its route the way that card's going.
    const dir = btn.dataset.dir ? Number(btn.dataset.dir) : (svc === current?.service ? current.dir : null);
    openService(svc, { fromStop: current?.code, dir });
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
        points, names: known.map(c => nameOf(c) || c), codes: known, minutes: metres / 250, wait: 0,
        service, board: known[0], alight: toCode,
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

// Favourites, in their own window from the star in the Edge Tray. Opening one closes it, so what
// it opened is in view; removing one leaves it open.
$('#favsBtn').addEventListener('click', () => {
    renderFavs();
    openModal('favsModal');
});

$('#favsModal').addEventListener('click', e => {
    const t = e.target.closest('[data-remove],[data-fav],[data-remove-bus],[data-fav-bus],[data-remove-route],[data-fav-route],[data-remove-nav],[data-fav-nav]');
    if (!t) return;
    const d = t.dataset;
    if (d.fav || d.favBus || d.favRoute || d.favNav) closeModal('favsModal');
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
// "#84009" for a stop, "#84009,174" narrowed to a bus, or to several or a wildcard
// ("#84009,174,175", "#84009,22*": busFilter), "#bus/22" for a bus's route, "#route/84009/75009"
// for the route planner, "#sync/BCDFGH" for another device's code to sync with,
// "#share/<id>" for a short share link (js/share.js), "#board/84009" for a stop's departures
// board (js/board.js),
// "#alerts" for the service alerts card, "#nav/lat,lng~Name/here" for Navigate (navHash in
// js/nav.js), with "/via/lat,lng~Name" after its ends for a stop on the way, and "#near" and
// "#nav" for the installed app's shortcuts. Either end of a route
// or nav can be "-", not set yet, as Share gives them part filled in, and "#route" opens the
// planner empty. A route or nav can end "/leave/2026-10-09T08:30" or "/arrive/..." for a
// picked time (js/when.js); one that has passed opens saying so.
const WHEN_HASH = When.HASH_RE_SOURCE;
const ROUTE_HASH_RE = new RegExp(`^route\\/(\\d{5}|-)\\/(\\d{5}|-)${WHEN_HASH}$`);
const NAV_END = '(-|here|-?[\\d.]+,-?[\\d.]+(?:~[^/]*)?)';
const NAV_VIA = '(?:\\/via\\/(-?[\\d.]+,-?[\\d.]+(?:~[^/]*)?))?';
const NAV_HASH_RE = new RegExp(`^nav\\/${NAV_END}\\/${NAV_END}${NAV_VIA}${WHEN_HASH}$`);

function routeFromHash() {
    // The short link itself, when the app was served for it offline (sw.js) rather than
    // api/share-page.js sending it on.
    const short = location.pathname.match(/^\/(?:go|trip|eta)\/([a-z0-9]{10})$/);
    if (short) history.replaceState(null, '', `/#share/${short[1]}`);
    const raw = location.hash.replace('#', '');
    const hash = decodeURIComponent(raw);
    const end = (code) => (code === '-' ? null : code);
    let m;
    // Opens Settings over the page rather than showing anything in it, so it answers false and
    // the first favourite stop still loads behind.
    if ((m = hash.match(/^sync\/([0-9A-Za-z]{6})$/))) { openSyncLink(m[1]); return false; }
    // Where a Service Alerts notification opens. Shown above the page, so the first
    // favourite stop still loads behind it.
    if (hash === 'alerts') { window.Alerts.open(); return false; }
    // The live map, walking to a stop or a place: the Telegram bot's Live map button. Over the
    // page, so the stop's timings load behind it, ready for when you get there.
    if ((m = hash.match(/^map\/(\d{5})$/))) {
        const code = m[1];
        ensureStopsIndex().then(() => LiveMap.openFromHash(code));
        loadStop(code, { pushHistory: false });
        return true;
    }
    if ((m = hash.match(/^map\/(-?[\d.]+,-?[\d.]+(?:~.*)?)$/))) { LiveMap.openFromHash(m[1]); return false; }
    // The traffic on a bus's way, from the Telegram bot's traffic button (js/map.js).
    if ((m = hash.match(/^traffic\/(.+)$/))) { LiveMap.trafficFromHash(m[1]); return false; }
    // The Android app's Card value shortcut (js/card.js).
    if (hash === 'card') { window.Card?.open(); return false; }
    // A stop's departures board (js/board.js), over its timings.
    if ((m = hash.match(/^board\/(\d{5})$/))) {
        const code = m[1];
        loadStop(code, { pushHistory: false });
        Board.open(code);
        return true;
    }
    // A short share link (js/share.js), sent on here by api/share-page.js: a place or
    // directions open Navigate, live progress opens over the page.
    if ((m = hash.match(/^share\/([a-z0-9]{10})$/))) { Share.open(m[1]); return true; }
    // The installed app's shortcuts (manifest.json): the stops around you, and Navigate empty.
    if (hash === 'near') { $('#nearMeBtn').click(); return true; }
    if (hash === 'nav') { openNav(); return true; }
    if (hash === 'route') { openPlanner(); return true; }
    if ((m = hash.match(ROUTE_HASH_RE))) { openPlanner(end(m[1]), end(m[2]), { when: When.fromHash(m[3], m[4]) }); return true; }
    // Matched before decoding, so a "/" in a place's name stays inside it.
    if ((m = raw.match(NAV_HASH_RE) || hash.match(NAV_HASH_RE))) { openNavHash(m[1], m[2], When.fromHash(m[4], m[5]), m[3]); return true; }
    if ((m = hash.match(/^bus\/([0-9A-Za-z]{1,4})$/))) { openService(m[1]); return true; }
    const [hashCode, ...hashSvc] = hash.split(',');
    if (/^\d{5}$/.test(hashCode)) {
        loadStop(hashCode, { service: busFilter(hashSvc.join(',')), pushHistory: false });
        return true;
    }
    return false;
}

window.addEventListener('hashchange', routeFromHash);

// "/?title=...&text=...&url=..." is something shared into the installed app (manifest.json's
// share_target), usually a Google Maps place: it goes into Navigate's To. The query is cleared
// so a reload doesn't share it again.
function routeFromShare() {
    const params = new URLSearchParams(location.search);
    const shared = ['title', 'text', 'url'].map(k => params.get(k)?.trim()).filter(Boolean);
    if (!shared.length) return false;
    history.replaceState(null, '', location.pathname + location.hash);
    openNavShared(shared.join('\n'));
    return true;
}

// ----------- Init -----------
(async function init() {
    updateGreeting();
    setInterval(updateGreeting, 30_000);
    birthdayConfetti();
    initPlanner();
    initNav();
    Share.init();
    initSync();
    TripHistory.init();
    Places.init();
    Calendar.init();
    MainScreen.init();

    // Started alongside the stops so it's usually in by the time anything wants it.
    BusNet.load().catch(e => console.warn('Bus routes failed:', e));

    await buildAc();
    renderFavs();
    Glance.init();
    syncStopClose();

    BusNet.load(stopsIndex)
        .then(() => {
            renderFavs();
            if (current && lastArrivals) renderArrivals();
        })
        .catch(() => {});

    if (!routeFromShare() && !routeFromHash()) openStartPage();
    Tour.maybeStart();
})();

// The sgbus terminal (js/terminal.js), the Linux app's sgbus> prompt on the page: fetched with its
// commands (js/sgbus-core.js) the first time it's opened, from this site only. Opened from
// Settings, by Ctrl+` anywhere, or by typing sgbus in the browser's console, which a page can't
// give a prompt of its own: what's typed there runs as code, so sgbus alone, a getter, opens it.
let terminalLoading = null;
function openTerminal(action = 'open') {
    const load = src => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    terminalLoading ??= load('/js/sgbus-core.js').then(() => load('/js/terminal.js'));
    terminalLoading.then(() => Terminal[action](), () => {
        terminalLoading = null;
        console.error("Couldn't load the sgbus terminal. Check your connection, then try again.");
    });
}

document.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'Backquote') {
        e.preventDefault();
        openTerminal('toggle');
    }
});

Object.defineProperty(window, 'sgbus', {
    configurable: true,
    get() {
        openTerminal();
        return 'sgbus> is open on the page.';
    },
});

// What the browser's console shows when it's opened, as Discord's does: what's here, and a
// warning, since a scam can have someone paste code into it that then runs as them.
console.log('%csgbus', 'font: bold 40px ui-monospace, Menlo, Consolas, monospace; color: #1f9d55');
console.log("%cSingapore's live bus timings, with the Linux app's commands.", 'font-size: 14px');
console.log('%cWait!', 'font-size: 24px; font-weight: bold; color: #d1242f');
console.log("%cIf someone told you to paste something here, don't. Whatever's pasted here runs as you on this site, and can read your saved stops, places, routines and calendar link.",
    'font-size: 14px; color: #d1242f');
console.log('%cType sgbus and press Enter for the sgbus> prompt, or press Ctrl+` on the page.', 'font-size: 14px; font-weight: bold');

// What the app opens on when its link has nothing else to show: the home, from Settings' Custom
// home, already on show (js/main-screen.js). Bus timings with the glance off opens the first
// favourite stop's timings, as it did before the glance (with the glance on, Glance shows them).
function openStartPage() {
    if (MainScreen.home() === 'timings' && LS.getFavs()[0] && !Glance.enabled()) {
        loadStop(LS.getFavs()[0].code, { pushHistory: false });
    }
}
