// The Android app's reminders (2.1.0 and later), set from Settings and a stop's timings, and
// run by the app itself with the page closed (RemindersPlugin.java, through js/app-bridge.js):
//
//   Timings near a stop  the favourite stops you pick, watched by geofence (NearStops.java)
//   Time to leave        for the phone's calendar events with a place (LeaveTime.java)
//   "On a bus?"          offers a trip when you seem to be riding (OnABus.java)
//   Last bus             a bell by a bus's last bus time at a stop (LastBus.java)
//
// Also here: the Get Off Alert's sound in earphones only (js/trip.js asks earphonesOnly()),
// and Home and Work handed to the app for its Bus home and Bus to work shortcuts and Quick
// Settings tiles (PlaceShortcuts.java). In a browser, none of this shows.
// Loaded before script.js and uses its helpers (LS, nameOf, stopsIndex, renderArrivals) only
// once the page is running. Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = (name) => `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;

  const LAST_KEY = 'sgbus_lastbus';
  const NEAR_KEY = 'sgbus_nearstops';
  const EAR_KEY = 'sgbus_getoff_earphones';
  const MAX_NEAR = 20;

  const native = () => Boolean(window.AppBridge?.native);
  const has = (feature) => native() && AppBridge.has(feature);
  const call = (method, options) => AppBridge.call('Reminders', method, options);

  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* this visit only */ }
  };

  // ---------- Home and Work, for the app's shortcuts and tiles ----------

  function sendPlaces() {
    if (!has('places')) return;
    const one = (kind) => {
      const p = LS.getPlace(kind);
      if (!p) return null;
      const end = { label: kind === 'home' ? 'Home' : 'Work', lat: p.lat, lng: p.lng };
      return { ...end, url: `${location.origin}/${navHashFor('here', end)}` };
    };
    AppBridge.call('SgBus', 'setPlaces', { home: one('home'), work: one('work') }).catch(() => {});
  }

  // ---------- the Get Off Alert's sound ----------

  const earphonesOnly = () => has('earphones') && read(EAR_KEY, false) === true;

  function syncEarphones() {
    document.querySelectorAll('[data-earphones]').forEach((btn) => {
      const on = (btn.dataset.earphones === 'on') === earphonesOnly();
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  // ---------- what went wrong, said under the reminders ----------

  const NEEDS = {
    location: 'Location isn’t allowed for SG Bus Timings, so it can’t tell when you’re near a stop.',
    background: 'To watch your stops with the app closed, allow location “All the time” for SG Bus Timings.',
    calendar: 'Time to leave needs to read this phone’s calendar: allow Calendar for SG Bus Timings.',
    activity: '“On a bus?” needs Physical activity: allow it for SG Bus Timings.',
  };

  function note(text, settings = false) {
    const el = $('#remindersNote');
    el.hidden = !text;
    el.innerHTML = text ? `${esc(text)}${settings ? ` <button type="button" class="iconBtn" data-reminders-settings>${ico('settings')} Open settings</button>` : ''}` : '';
  }

  function failed(err) {
    const need = err?.data?.need;
    if (err?.code === 'permission' && NEEDS[need]) note(NEEDS[need], true);
    else note(err?.message || 'Couldn’t set that up. Try again.');
  }

  // ---------- the switches in Settings ----------

  let status = null;

  async function refresh() {
    if (!has('lastbus')) return;
    status = await call('status').catch(() => null);
    syncSwitches();
    renderLastBus();
    const n = read(NEAR_KEY, []).length;
    $('#nearStopsLabel').textContent = n ? `${n} stop${n === 1 ? '' : 's'} watched · change` : 'Pick stops';
    if (status && !status.notifications && (status.nearStops.length || status.lastBus.length || status.leaveTime || status.onABus)) {
      note('Notifications are off for SG Bus Timings, so these reminders can’t show.', true);
    } else if (status && status.nearStops.length && !status.background) {
      note(NEEDS.background, true);
    } else {
      note('');
    }
  }

  function syncSwitches() {
    for (const [attr, on] of [['leavetime', status?.leaveTime], ['onabus', status?.onABus]]) {
      document.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
        const pressed = (btn.dataset[attr] === 'on') === Boolean(on);
        btn.classList.toggle('active', pressed);
        btn.setAttribute('aria-pressed', String(pressed));
      });
    }
  }

  async function setSwitch(method, on) {
    note('');
    try {
      await call(method, { on });
    } catch (err) {
      failed(err);
    }
    refresh();
  }

  // ---------- Timings near a stop ----------

  async function openNearStops() {
    const favs = LS.getFavs();
    const picked = new Set(read(NEAR_KEY, []));
    const idx = await ensureStopsIndex().catch(() => null);
    $('#nearStopsList').innerHTML = favs.length
      ? favs.map(({ code, name }) => {
        const label = name || nameOf(code) || 'Bus stop';
        const where = idx?.[code];
        return `<label class="syncItem"><input type="checkbox" value="${esc(code)}"${picked.has(code) ? ' checked' : ''}${where?.lat == null ? ' disabled' : ''}> <span>${esc(label)} <span class="sub">${esc(code)}</span></span></label>`;
      }).join('')
      : '<p class="mode-note">Save some stops to your favourites first, with the star on a stop’s timings.</p>';
    $('#nearStopsSave').hidden = !favs.length;
    openModal('nearStopsModal');
  }

  async function saveNearStops() {
    const codes = [...document.querySelectorAll('#nearStopsList input:checked')].map((i) => i.value).slice(0, MAX_NEAR);
    const idx = await ensureStopsIndex().catch(() => ({}));
    const stops = codes.map((code) => ({ code, name: nameOf(code) || code, lat: idx[code]?.lat, lng: idx[code]?.lng }))
      .filter((s) => s.lat != null && s.lng != null);
    closeModal('nearStopsModal');
    note('');
    try {
      await call('nearStops', { stops });
      write(NEAR_KEY, stops.map((s) => s.code));
    } catch (err) {
      // Turned off rather than left half set up.
      write(NEAR_KEY, []);
      call('nearStops', { stops: [] }).catch(() => {});
      failed(err);
    }
    refresh();
  }

  // ---------- Last bus ----------

  const lastList = () => read(LAST_KEY, []);
  const isLast = (code, service) => lastList().some((r) => r.code === code && r.service === service);

  // The bell by a bus's first and last bus line at a stop (script.js renderArrivals).
  function bell(service, code) {
    if (!has('lastbus') || !window.BusNet?.isReady()) return '';
    const times = BusNet.lastBuses(service, code);
    if (!times || ![times.wd, times.sat, times.sun].some((t) => /^\d{4}$/.test(t))) return '';
    const on = isLast(code, service);
    return `<button type="button" class="lastBusBell${on ? ' on' : ''}" data-lastbus="${esc(service)}" aria-pressed="${on}" ` +
      `title="${on ? 'Stop reminding me' : 'Remind me 20 minutes before'} the last ${esc(service)} here">${ico('bell')}</button>`;
  }

  async function toggleLast(service, code) {
    let list = lastList();
    if (isLast(code, service)) {
      list = list.filter((r) => !(r.code === code && r.service === service));
    } else {
      const times = BusNet.lastBuses(service, code);
      if (!times) return;
      list = [...list, { code, name: nameOf(code) || code, service, ...times }].slice(-20);
    }
    write(LAST_KEY, list);
    await call('lastBus', { list }).catch(failed);
    if (typeof renderArrivals === 'function' && lastArrivals) renderArrivals();
    renderLastBus();
  }

  function renderLastBus() {
    const list = lastList();
    $('#lastBusList').innerHTML = list.length
      ? list.map((r, i) => `<div class="lastBusRow"><span><strong>${esc(r.service)}</strong> at ${esc(r.name)} <span class="sub">${esc(r.code)}</span></span>` +
        `<button type="button" class="icon-btn small" data-lastbus-remove="${i}" aria-label="Remove">${ico('close')}</button></div>`).join('')
      : '<p class="mode-note">None yet.</p>';
  }

  async function removeLast(i) {
    const list = lastList();
    list.splice(i, 1);
    write(LAST_KEY, list);
    await call('lastBus', { list }).catch(failed);
    renderLastBus();
    if (typeof renderArrivals === 'function' && lastArrivals) renderArrivals();
  }

  // ---------- setting up ----------

  function show() {
    $('#earphonesSetting').hidden = !has('earphones');
    $('#remindersSettings').hidden = !has('lastbus');
    document.querySelectorAll('#remindersSettings [data-need]').forEach((el) => { el.hidden = !has(el.dataset.need); });
    syncEarphones();
    sendPlaces();
    // The app's copy of the last bus reminders, after an update or a clear of its data.
    if (has('lastbus') && lastList().length) call('lastBus', { list: lastList() }).catch(() => {});
  }

  function init() {
    if (!native()) return;
    // The app may have answered before this file loaded, and show() needs script.js's helpers:
    // once the page's scripts have all run, if it's already said, and whenever it does.
    window.addEventListener('app:ready', () => { if (document.readyState !== 'loading') show(); });
    document.addEventListener('DOMContentLoaded', () => { if (AppBridge.has('places')) show(); });
    window.addEventListener('places:change', sendPlaces);

    document.querySelectorAll('[data-earphones]').forEach((btn) => btn.addEventListener('click', () => {
      write(EAR_KEY, btn.dataset.earphones === 'on');
      syncEarphones();
    }));
    document.querySelectorAll('[data-leavetime]').forEach((btn) => btn.addEventListener('click', () => setSwitch('leaveTime', btn.dataset.leavetime === 'on')));
    document.querySelectorAll('[data-onabus]').forEach((btn) => btn.addEventListener('click', () => setSwitch('onABus', btn.dataset.onabus === 'on')));
    $('#nearStopsBtn').addEventListener('click', openNearStops);
    $('#nearStopsSave').addEventListener('click', saveNearStops);
    $('#remindersSettings').addEventListener('click', (e) => {
      if (e.target.closest('[data-reminders-settings]')) AppBridge.call('SgBus', 'openSettings', { what: 'app' });
      const rm = e.target.closest('[data-lastbus-remove]');
      if (rm) removeLast(Number(rm.dataset.lastbusRemove));
    });
    $('#services').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lastbus]');
      if (btn && current) toggleLast(btn.dataset.lastbus, current.code);
    });
    // Settings opened: as things are now.
    new MutationObserver(() => {
      if (!$('#settingsModal').classList.contains('hidden')) refresh();
    }).observe($('#settingsModal'), { attributes: true, attributeFilter: ['class'] });
    // Back from Android's settings.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !$('#settingsModal').classList.contains('hidden')) refresh();
    });
  }

  window.Reminders = { earphonesOnly, bell };
  init();
})();
