// The Android app's reminders (2.1.0 and later), set from Settings, the Edge Tray and a stop's
// timings, and run by the app itself with the page closed (RemindersPlugin.java, through
// js/app-bridge.js):
//
//   Timings near a stop  the favourite stops you pick, watched by geofence (NearStops.java);
//                        its own Edge Tray button and modal
//   Time to leave        for the phone's calendar events with a place (LeaveTime.java)
//   "On a bus?"          offers a trip when you seem to be riding (OnABus.java)
//   Last bus             a bell by a bus's last bus time at a stop (LastBus.java)
//   Routines             a stop's next buses at a time, on the days picked (Routines.java,
//                        2.2.0); its own Edge Tray button and modal
//
// The two Edge Tray buttons show only where the app has the feature, and either can be
// turned off in Settings' Edge Tray buttons (script.js, setTrayExtra).
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
  const NO_NOTIFICATIONS = 'Notifications are off for SG Bus Timings, so these reminders can’t show.';

  // Where each is said: Settings, Timings near a stop's modal, or Routines'.
  const NOTES = { settings: '#remindersNote', near: '#nearStopsNote', routines: '#routinesNote' };

  function note(text, settings = false, where = 'settings') {
    const el = $(NOTES[where]);
    el.hidden = !text;
    el.innerHTML = text ? `${esc(text)}${settings ? ` <button type="button" class="iconBtn" data-reminders-settings>${ico('settings')} Open settings</button>` : ''}` : '';
  }

  function failed(err, where = 'settings') {
    const need = err?.data?.need;
    if (err?.code === 'permission' && NEEDS[need]) note(NEEDS[need], true, where);
    else note(err?.message || 'Couldn’t set that up. Try again.', false, where);
  }

  // ---------- the switches in Settings, and the two modals ----------

  let status = null;

  async function refresh() {
    if (!has('lastbus')) return;
    status = await call('status').catch(() => null);
    syncSwitches();
    renderLastBus();
    renderRoutines();
    const off = status && !status.notifications;
    // Each place says what stops its own reminders.
    note(off && (status.lastBus.length || status.leaveTime || status.onABus) ? NO_NOTIFICATIONS : '', true, 'settings');
    if (off && status.nearStops.length) note(NO_NOTIFICATIONS, true, 'near');
    else if (status && status.nearStops.length && !status.background) note(NEEDS.background, true, 'near');
    else note('', false, 'near');
    note(off && status.routines ? NO_NOTIFICATIONS : '', true, 'routines');
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
    refresh();
  }

  // Closes the modal once the app has them; what went wrong stays in it.
  async function saveNearStops() {
    const codes = [...document.querySelectorAll('#nearStopsList input:checked')].map((i) => i.value).slice(0, MAX_NEAR);
    const idx = await ensureStopsIndex().catch(() => ({}));
    const stops = codes.map((code) => ({ code, name: nameOf(code) || code, lat: idx[code]?.lat, lng: idx[code]?.lng }))
      .filter((s) => s.lat != null && s.lng != null);
    note('', false, 'near');
    try {
      await call('nearStops', { stops });
      write(NEAR_KEY, stops.map((s) => s.code));
      closeModal('nearStopsModal');
    } catch (err) {
      // Turned off rather than left half set up.
      write(NEAR_KEY, []);
      call('nearStops', { stops: [] }).catch(() => {});
      [...document.querySelectorAll('#nearStopsList input')].forEach((i) => { i.checked = false; });
      failed(err, 'near');
      return;
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

  // ---------- Routines (2.2.0) ----------
  // A stop's next buses as a notification at a time, on the days picked (Routines.java):
  // { id, code, name, buses: ['22'], time: 'HHMM', days: [1..7, Monday first] }.

  const ROUTINE_KEY = 'sgbus_routines';
  const MAX_ROUTINES = 20;
  const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const routines = () => read(ROUTINE_KEY, []);

  // "Weekdays", "Every day", "Weekends" or the days themselves.
  function daysText(days) {
    const set = [...days].sort((a, b) => a - b).join(',');
    if (set === '1,2,3,4,5,6,7') return 'Every day';
    if (set === '1,2,3,4,5') return 'Weekdays';
    if (set === '6,7') return 'Weekends';
    return days.map((d) => DAY_NAMES[d]).join(', ');
  }

  const clockText = (hhmm) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;

  function renderRoutines() {
    const list = routines();
    $('#routineList').innerHTML = list.length
      ? list.map((r, i) => `<div class="lastBusRow"><span><strong>${esc(clockText(r.time))}</strong> ${esc(daysText(r.days))} · ` +
        `${esc(r.name)} <span class="sub">${esc(r.code)}${r.buses.length ? ` · ${esc(r.buses.join(', '))}` : ''}</span></span>` +
        `<button type="button" class="icon-btn small" data-routine-remove="${i}" aria-label="Remove">${ico('close')}</button></div>`).join('')
      : '<p class="mode-note">None yet.</p>';
    $('#routineForm').hidden = list.length >= MAX_ROUTINES;
  }

  async function saveRoutines(list) {
    write(ROUTINE_KEY, list);
    renderRoutines();
    note('', false, 'routines');
    try {
      await call('routines', { list });
    } catch (err) {
      failed(err, 'routines');
      return;
    }
    refresh();
  }

  function setDays(days) {
    document.querySelectorAll('#routineDays [data-day]').forEach((btn) => {
      const on = days.includes(Number(btn.dataset.day));
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  // The modal, from its Edge Tray button: the routines set, and the form for another, filled
  // in afresh.
  function openRoutines() {
    resetRoutineForm();
    renderRoutines();
    openModal('routineModal');
    refresh();
  }

  function resetRoutineForm() {
    // The stop on screen first, then the favourites.
    const options = [];
    if (current?.code) options.push({ code: current.code, name: nameOf(current.code) || current.code });
    for (const f of LS.getFavs()) {
      if (!options.some((o) => o.code === f.code)) options.push({ code: f.code, name: f.name || nameOf(f.code) || f.code });
    }
    $('#routineStop').innerHTML = options.length
      ? options.map((o) => `<option value="${esc(o.code)}">${esc(o.name)} (${esc(o.code)})</option>`).join('')
      : '<option value="">Open a stop or save a favourite first</option>';
    $('#routineSave').disabled = !options.length;
    $('#routineBuses').value = current?.service || '';
    setDays([1, 2, 3, 4, 5]);
    $('#routineError').hidden = true;
  }

  function addRoutine() {
    const code = $('#routineStop').value;
    const time = $('#routineTime').value.replace(':', '');
    const days = [...document.querySelectorAll('#routineDays [data-day].active')].map((b) => Number(b.dataset.day));
    const buses = [...new Set($('#routineBuses').value.toUpperCase().split(/[\s,]+/).filter((b) => /^[0-9A-Z]{1,5}$/.test(b)))];
    const why = !/^\d{5}$/.test(code) ? 'Pick a stop.' : !/^\d{4}$/.test(time) ? 'Set a time.' : !days.length ? 'Pick at least one day.' : '';
    if (why) {
      $('#routineError').textContent = why;
      $('#routineError').hidden = false;
      return;
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // The modal stays open, the new one in its list and the form ready for another.
    saveRoutines([...routines(), { id, code, name: nameOf(code) || code, buses, time, days }].slice(0, MAX_ROUTINES));
    resetRoutineForm();
  }

  // ---------- setting up ----------

  function show() {
    $('#earphonesSetting').hidden = !has('earphones');
    $('#remindersSettings').hidden = !has('lastbus');
    document.querySelectorAll('#remindersSettings [data-need]').forEach((el) => { el.hidden = !has(el.dataset.need); });
    // The Edge Tray buttons, and their switches in Settings' Edge Tray buttons.
    for (const [feature, extra, btn] of [['nearstops', 'nearstops', '#nearStopsTrayBtn'], ['routines', 'routines', '#routinesTrayBtn']]) {
      $(btn).hidden = !has(feature);
      document.querySelector(`#trayExtrasPick [data-tray-show="${extra}"]`).hidden = !has(feature);
    }
    syncEarphones();
    sendPlaces();
    // The app's copy of the last bus reminders, after an update or a clear of its data.
    if (has('lastbus') && lastList().length) call('lastBus', { list: lastList() }).catch(() => {});
    // And of the routines, the same way (2.2.0).
    if (has('routines') && routines().length) call('routines', { list: routines() }).catch(() => {});
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
    $('#nearStopsTrayBtn').addEventListener('click', openNearStops);
    $('#nearStopsSave').addEventListener('click', saveNearStops);
    $('#routinesTrayBtn').addEventListener('click', openRoutines);
    // Open settings, wherever a note offers it: Settings or either modal.
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-reminders-settings]')) AppBridge.call('SgBus', 'openSettings', { what: 'app' });
    });
    $('#remindersSettings').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-lastbus-remove]');
      if (rm) removeLast(Number(rm.dataset.lastbusRemove));
    });
    $('#routineList').addEventListener('click', (e) => {
      const rr = e.target.closest('[data-routine-remove]');
      if (rr) saveRoutines(routines().filter((_, i) => i !== Number(rr.dataset.routineRemove)));
    });
    $('#routineSave').addEventListener('click', addRoutine);
    $('#routineDays').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-day]');
      if (!btn) return;
      const on = !btn.classList.contains('active');
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    $('#services').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lastbus]');
      if (btn && current) toggleLast(btn.dataset.lastbus, current.code);
    });
    // Settings opened: as things are now.
    new MutationObserver(() => {
      if (!$('#settingsModal').classList.contains('hidden')) refresh();
    }).observe($('#settingsModal'), { attributes: true, attributeFilter: ['class'] });
    // Back from Android's settings, to Settings or either modal.
    document.addEventListener('visibilitychange', () => {
      const open = ['#settingsModal', '#nearStopsModal', '#routineModal'].some((id) => !$(id).classList.contains('hidden'));
      if (document.visibilityState === 'visible' && open) refresh();
    });
  }

  // ---------- Sync (js/sync.js) ----------
  // Routines and last bus reminders go to another device with the app, and routines to the
  // Telegram bot and back. Each side's run on their own, so one synced is set on both.

  const routineKey = (r) => `${r.code}@${r.time}/${[...r.days].sort().join('')}/${[...r.buses].sort().join(',')}`;
  const syncRoutines = () => (has('routines') ? routines().map(({ code, name, buses, time, days }) => ({ code, name, buses, time, days })) : []);
  const syncLastBus = () => (has('lastbus') ? lastList() : []);

  // Adds whichever aren't here yet, and says how many.
  function mergeRoutines(list) {
    if (!has('routines')) return 0;
    const have = new Set(routines().map(routineKey));
    const fresh = list.filter((r) => !have.has(routineKey(r)) && have.add(routineKey(r)));
    const room = Math.max(0, MAX_ROUTINES - routines().length);
    const added = fresh.slice(0, room).map((r, i) => ({ id: `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, ...r, name: nameOf(r.code) || r.name || r.code }));
    if (added.length) saveRoutines([...routines(), ...added]);
    return added.length;
  }

  function mergeLastBus(list) {
    if (!has('lastbus')) return 0;
    const added = list.filter((r) => !isLast(r.code, r.service)).map((r) => ({ ...r, name: nameOf(r.code) || r.name || r.code }));
    if (!added.length) return 0;
    const next = [...lastList(), ...added].slice(-20);
    write(LAST_KEY, next);
    call('lastBus', { list: next }).catch(failed);
    renderLastBus();
    if (typeof renderArrivals === 'function' && lastArrivals) renderArrivals();
    return added.length;
  }

  window.Reminders = {
    earphonesOnly, bell,
    has, syncRoutines, syncLastBus, mergeRoutines, mergeLastBus, MAX_ROUTINES,
  };
  init();
})();
