// Places, from their own button in the Edge Tray: Home, Work and any other place saved, each
// with a name of your own if you like ("Gym", "Mum's"), as Citymapper's Edit Home, Share Home
// and Save New Place.
//
// Tapping a place plans the way there from where you are (Navigate). Its menu edits it, shares
// it as a "How to get to" link (js/share.js), or deletes it (clears Home or Work). Every place
// is also a button under each end of Navigate, on both its tabs (js/nav.js, showSavedPlaces),
// after Home and Work, and is on the Saved tab of the search boxes (js/recents.js).
//
// Home and Work keep their own keys (LS.getPlace in script.js); the rest are one list,
// [{ id, name, label, lat, lng, stop? }], `name` empty for none, `stop` the stop code when the
// place is a bus stop. Kept in this browser; favourites sync (js/sync.js) offers them as the
// "Places" kind, and never replaces a Home or Work already set on the other device.
//
// Loaded before script.js and uses its helpers ($, LS, escapeHtml, ...), so nothing here runs
// until script.js calls Places.init(). Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_places';
  const MAX_PLACES = 100;
  const FIXED = { home: { name: 'Home', icon: 'home' }, work: { name: 'Work', icon: 'work' } };
  const SHARE_NOTE = 'Anyone with this link can see where this place is. Place links don\'t expire.';

  // ---------- storage ----------

  const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

  function custom() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter((p) => p && typeof p.id === 'string' && typeof p.label === 'string' && isPoint(p)) : [];
    } catch {
      return [];
    }
  }

  function storeCustom(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PLACES)));
    } catch (err) {
      console.warn("couldn't save places:", err);
    }
    changed();
  }

  // Every place, Home and Work first while they're set: { key, name, label, lat, lng, stop?,
  // icon }, with `key` "home", "work" or "p:<id>" and `name` what it's called.
  function all({ unset = false } = {}) {
    const out = [];
    for (const [key, f] of Object.entries(FIXED)) {
      const p = LS.getPlace(key);
      if (p) out.push({ key, name: f.name, icon: f.icon, ...p });
      else if (unset) out.push({ key, name: f.name, icon: f.icon, unset: true });
    }
    for (const p of custom()) out.push({ key: `p:${p.id}`, name: p.name || p.label, icon: 'pin', label: p.label, lat: p.lat, lng: p.lng, ...(p.stop && { stop: p.stop }), id: p.id });
    return out;
  }

  const get = (key) => all().find((p) => p.key === key) || null;

  function set(key, place) {
    const clean = { label: place.label, lat: place.lat, lng: place.lng, ...(place.stop && { stop: place.stop }) };
    if (FIXED[key]) {
      LS.setPlace(key, clean);
      changed();
      return;
    }
    const list = custom();
    const id = key?.startsWith('p:') ? key.slice(2) : null;
    const i = list.findIndex((p) => p.id === id);
    const item = { id: id || crypto.randomUUID().slice(0, 8), name: (place.name || '').trim().slice(0, 40), ...clean };
    if (i >= 0) list[i] = item;
    else list.push(item);
    storeCustom(list);
  }

  function remove(key) {
    if (FIXED[key]) {
      LS.setPlace(key, null);
      changed();
    } else {
      storeCustom(custom().filter((p) => `p:${p.id}` !== key));
    }
  }

  function metres(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // The name of the saved place within `within` metres of a point, nearest first, or null.
  function nameNear(point, within = 150) {
    if (!isPoint(point)) return null;
    let best = null;
    let bestM = within;
    for (const p of all()) {
      const m = metres(point, p);
      if (m <= bestM) [best, bestM] = [p.name, m];
    }
    return best;
  }

  // Whatever shows the places redraws: the buttons under Navigate's and the planner's ends.
  function changed() {
    if (typeof showSavedPlaces === 'function') showSavedPlaces();
    if (!$('#placesSection').hidden) render();
  }

  // ---------- sync (js/sync.js) ----------

  const pointKey = (p) => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
  const inSingapore = (p) => isPoint(p) && p.lat > 1.15 && p.lat < 1.48 && p.lng > 103.55 && p.lng < 104.1;
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // For sync: Home and Work as themselves, the rest by where they are.
  const syncKey = (p) => (FIXED[p.key] ? p.key : `place:${pointKey(p)}`);
  const syncList = () => all().map((p) => ({ key: p.key, name: FIXED[p.key] ? '' : (p.name === p.label ? '' : p.name), label: p.label, lat: p.lat, lng: p.lng, ...(p.stop && { stop: p.stop }) }));

  function clean(raw) {
    if (!raw || typeof raw !== 'object' || !inSingapore(raw) || !text(raw.label, 120)) return null;
    const key = raw.key === 'home' || raw.key === 'work' ? raw.key : 'place';
    return { key, name: key === 'place' ? text(raw.name, 40) : '', label: text(raw.label, 120), lat: raw.lat, lng: raw.lng, ...(/^\d{5}$/.test(raw.stop || '') && { stop: raw.stop }) };
  }

  // Adds the places this device doesn't have. Home or Work only where it isn't set here; a
  // place already saved at the same spot is left as it is. Says how many were added.
  function merge(places) {
    let added = 0;
    const have = new Set(all().map(syncKey));
    const list = custom();
    for (const p of places) {
      if (p.key === 'home' || p.key === 'work') {
        if (LS.getPlace(p.key)) continue;
        LS.setPlace(p.key, { label: p.label, lat: p.lat, lng: p.lng, ...(p.stop && { stop: p.stop }) });
        added++;
      } else if (!have.has(`place:${pointKey(p)}`)) {
        have.add(`place:${pointKey(p)}`);
        list.push({ id: crypto.randomUUID().slice(0, 8), name: p.name, label: p.label, lat: p.lat, lng: p.lng, ...(p.stop && { stop: p.stop }) });
        added++;
      }
    }
    if (added) storeCustom(list);
    return added;
  }

  // ---------- the panel ----------

  let menuFor = null; // the key whose menu is open
  let editing = null; // { key, place } while the form is open; key null for a new place

  function rowHtml(p) {
    if (p.unset) {
      return `<div class="placeRow unset">` +
        `<button type="button" class="placeMain" data-place-edit="${p.key}">${ico(p.icon)}<span><strong>${escapeHtml(p.name)}</strong><span class="sub">Not set yet. Tap to set your ${p.name.toLowerCase()}.</span></span></button>` +
        `</div>`;
    }
    const open = menuFor === p.key;
    const fixed = !!FIXED[p.key];
    const key = escapeHtml(p.key);
    // The menu is always there, folded shut until the dots open it (toggleRowMenu in js/ui.js).
    return `<div class="placeRow${open ? ' open' : ''}" data-menu-row="${key}">` +
      `<button type="button" class="placeMain" data-place-go="${key}" title="Directions there from where you are">${ico(p.icon)}` +
      `<span><strong>${escapeHtml(p.name)}</strong>${p.name !== p.label ? `<span class="sub">${escapeHtml(p.label)}</span>` : ''}</span></button>` +
      `<button type="button" class="iconBtn placeMore" data-place-menu="${key}" data-menu-toggle aria-expanded="${open}" aria-label="More for ${escapeHtml(p.name)}">${ico('more')}</button>` +
      `<div class="rowMenu"><div><div class="placeMenu">` +
      `<button type="button" class="iconBtn" data-place-edit="${key}">${ico('edit')} Edit ${escapeHtml(fixed ? p.name : '')}</button>` +
      `<button type="button" class="iconBtn" data-place-share="${key}">${ico('share')} Share ${escapeHtml(fixed ? p.name : '')}</button>` +
      `<button type="button" class="iconBtn" data-place-delete="${key}">${ico('trash')} ${fixed ? 'Clear' : 'Delete'}</button>` +
      `</div></div></div>` +
      `</div>`;
  }

  function render() {
    $('#placesList').innerHTML = all({ unset: true }).map(rowHtml).join('');
    renderForm();
  }

  function renderForm() {
    const form = $('#placeForm');
    form.hidden = !editing;
    $('#placeNewBtn').hidden = !!editing;
    if (!editing) return;
    const fixed = FIXED[editing.key];
    $('#placeFormTitle').textContent = editing.key ? `Edit ${fixed ? fixed.name : get(editing.key)?.name || 'place'}` : 'Save a new place';
    $('#placeNameRow').hidden = !!fixed;
    $('#placeChosen').textContent = editing.place ? `Saving: ${editing.place.label}` : 'Search for the place, or use where you are.';
    $('#placeSave').disabled = !editing.place;
  }

  // The form, for a new place (`key` null) or one saved, `place` filled in if given.
  function edit(key = null, place = null) {
    const saved = key ? get(key) : null;
    editing = { key, place: place || (saved ? { label: saved.label, lat: saved.lat, lng: saved.lng, ...(saved.stop && { stop: saved.stop }) } : null) };
    menuFor = null;
    $('#placeSearch').value = editing.place?.label || '';
    $('#placeName').value = place?.name || (saved && !FIXED[key] && saved.name !== saved.label ? saved.name : '');
    $('#placeName').placeholder = editing.place?.label ? `e.g. ${editing.place.label}` : "e.g. Gym, Mum's place";
    if (!$('#placesSection').hidden) render();
    else open();
    const input = editing.place ? $('#placeName') : $('#placeSearch');
    if (!$('#placeNameRow').hidden || input === $('#placeSearch')) {
      input.scrollIntoView({ block: 'center' });
      input.focus({ preventScroll: true });
    }
  }

  function choose(place) {
    if (!editing) return;
    editing.place = { label: place.label, lat: place.lat, lng: place.lng, ...(place.kind === 'stop' && place.code && { stop: place.code }), ...(place.stop && { stop: place.stop }) };
    $('#placeSearch').value = place.label;
    $('#placeName').placeholder = `e.g. ${place.label}`;
    renderForm();
  }

  function save(e) {
    e.preventDefault();
    if (!editing?.place) return;
    set(editing.key || null, { ...editing.place, name: $('#placeName').value });
    editing = null;
    render();
  }

  async function useHere() {
    await withLocating($('#placeHere'), () => new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("This browser can't share its location."));
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let label = 'Pinned place';
        try {
          await ensureStopsIndex();
          const [near] = stopsNear(lat, lng, 1);
          if (near) label = `Near ${nameOf(near.code) || near.code}`;
        } catch { /* named plainly */ }
        choose({ label, lat, lng });
        resolve();
      }, (err) => reject(new Error(locationMessage(err, 'to save where you are'))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    }));
  }

  function share(key) {
    const p = get(key);
    if (p) Share.place({ label: FIXED[key] ? p.label : p.name, lat: p.lat, lng: p.lng }, SHARE_NOTE);
  }

  function open() {
    showPanel('placesSection', true);
    render();
  }

  function close() {
    showPanel('placesSection', false);
    editing = null;
    menuFor = null;
  }

  function init() {
    $('#placesBtn').addEventListener('click', () => ($('#placesSection').hidden ? open() : close()));
    $('#placesClose').addEventListener('click', close);
    wirePanel('placesSection', close);
    $('#placeNewBtn').addEventListener('click', () => edit());
    $('#placeCancel').addEventListener('click', () => {
      editing = null;
      render();
    });
    $('#placeForm').addEventListener('submit', save);
    $('#placeHere').addEventListener('click', useHere);
    attachPlaceSearch($('#placeSearch'), $('#placeSearchAc'), choose, { recents: true });

    $('#placesList').addEventListener('click', (e) => {
      const go = e.target.closest('[data-place-go]');
      if (go) {
        const p = get(go.dataset.placeGo);
        if (!p) return;
        close();
        openNavAt('here', { label: p.name, lat: p.lat, lng: p.lng });
        return;
      }
      const menu = e.target.closest('[data-place-menu]');
      if (menu) {
        menuFor = menuFor === menu.dataset.placeMenu ? null : menu.dataset.placeMenu;
        toggleRowMenu($('#placesList'), menuFor);
        return;
      }
      const ed = e.target.closest('[data-place-edit]');
      if (ed) return edit(ed.dataset.placeEdit);
      const sh = e.target.closest('[data-place-share]');
      if (sh) return share(sh.dataset.placeShare);
      const del = e.target.closest('[data-place-delete]');
      if (del) {
        const p = get(del.dataset.placeDelete);
        if (p && confirm(FIXED[p.key] ? `Clear your ${p.name.toLowerCase()}?` : `Delete ${p.name} from your places?`)) {
          menuFor = null;
          remove(p.key);
        }
      }
    });
  }

  window.Places = { init, open, all, get, set, remove, edit, nameNear, share, syncKey, syncList, clean, merge, FIXED };
})();
