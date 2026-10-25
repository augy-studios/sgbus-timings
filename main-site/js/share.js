// Navigate's Share, as Citymapper has it: a menu of what to share, then a card with its map
// and a short link, and the apps to send it with.
//
//   Share my ETA            on a trip (js/trip.js): /eta/<id>, live progress, updated from
//                           here every ETA_EVERY_MS with where you really are and the stops
//                           ahead, and by the server while the app is in the background
//                           (api/push/trip-poll.js). Whoever opens it follows along on the live
//                           map (js/map.js) or the timeline, with your dot moving.
//   Share these directions  both ends, the time and the way that's open: /trip/<id>.
//   Share start, Share end  "How to get to" one end: /go/<id>, opened from wherever the person
//                           opening it is.
//
// In the Android app, the card also has Offline Sharing: a tap, phone to phone, or Nearby, with
// no internet (js/offline-share.js).
//
// Share.place and Share.directions open the same card for a place from Places (js/places.js),
// a past search (js/recents.js) or a calendar event (js/calendar.js), and for a trip from Your
// trips (js/history.js), without the menu.
//
// The links are made and read by api/share.js; opening one goes through api/share-page.js to
// #share/<id> here (Share.open). Uses nav.js's state and script.js's helpers, so nothing
// here runs until script.js calls Share.init().
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const ETA_KEY = 'sgbus.etaShare';
  const ETA_EVERY_MS = 10 * 1000;
  const VIEW_EVERY_MS = 10 * 1000;
  // Updated longer ago than this and the viewer says so.
  const VIEW_STALE_MS = 3 * 60 * 1000;
  const PATH_POINTS = 300;

  const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' });
  const minutesTo = (ms) => Math.max(0, Math.round((ms - Date.now()) / 60000));

  function thin(points, max) {
    if (points.length <= max) return points;
    const step = (points.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
  }

  async function api(url, options) {
    const r = await fetch(url, { cache: 'no-store', ...options });
    const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || 'Something went wrong. Please try again.'), { status: r.status });
    return body;
  }

  async function makeLink(kind, data) {
    const body = await api('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, data }) });
    return { ...body, url: `${location.origin}${body.path}` };
  }

  // ---------- what's shared ----------

  const placeOf = (p) => ({ label: p.label === HERE_LABEL ? 'My location' : p.label, lat: p.lat, lng: p.lng });
  // An end of the directions: Your location stays "wherever you are" for whoever opens it.
  const endOf = (p) => (p.label === HERE_LABEL ? 'here' : placeOf(p));

  // ", via Tampines Mall" for directions with a stop on the way.
  const viaText = () => (nav.via ? `, via ${placeOf(nav.via).label}` : '');

  function directionsData() {
    const o = nav.option;
    return {
      from: endOf(nav.from),
      to: endOf(nav.to),
      when: nav.when,
      way: o ? wayKey(o) : null,
      summary: o ? `~${o.minutes} min · ${navMixText(o)}` : '',
      path: o ? thin(o.legs.flatMap((l) => (l.mode !== 'walk' && l.path) || []), PATH_POINTS) : null,
      // A stop on the way, only when there is one, so a link without one stays the same link.
      ...(nav.via && { via: placeOf(nav.via) }),
    };
  }

  function etaData(p, extra = {}) {
    return {
      name: LS.getName(),
      to: p.to,
      arriveAt: Date.now() + p.minutesLeft * 60000,
      leg: { label: p.leg.label || '', to: p.leg.to || '', stopsLeft: p.leg.stopsLeft, kind: p.leg.kind },
      legIndex: p.legIndex,
      legCount: p.legCount,
      at: p.at,
      path: thin(p.path, PATH_POINTS),
      trains: p.trains,
      me: p.me,
      timeline: p.timeline,
      ended: p.arrived,
      ...extra,
    };
  }

  // ---------- the menu ----------

  function openMenu() {
    const items = [];
    if (Trip.active()) items.push({ pick: 'eta', icon: 'clock', title: 'Share my ETA', sub: 'Live progress, until you get there' });
    if (nav.from && nav.to) items.push({ pick: 'directions', icon: 'route', title: 'Share these directions', sub: `${nav.from.label} to ${nav.to.label}${viaText()}` });
    if (nav.from) items.push({ pick: 'start', icon: 'pin', title: 'Share start', sub: placeOf(nav.from).label });
    if (nav.to) items.push({ pick: 'end', icon: 'flag', title: 'Share end', sub: placeOf(nav.to).label });
    $('#shareMenuList').innerHTML = items.map((it) =>
      `<button type="button" class="shareMenuItem" data-share-pick="${it.pick}">${ico(it.icon)}` +
      `<span><strong>${escapeHtml(it.title)}</strong><span class="sub">${escapeHtml(it.sub)}</span></span></button>`
    ).join('');
    openModal('shareMenuModal');
  }

  // ---------- the card ----------

  let card = null; // { kind, title, text, url, data } of the card open
  let lastPick = null; // what the menu picked, for Try again

  function openCard(pick) {
    lastPick = pick;
    if (pick === 'eta') return openEtaCard();
    if (pick === 'directions') {
      const o = nav.option;
      showCard({
        heading: 'Share these directions',
        name: `${placeOf(nav.from).label} to ${placeOf(nav.to).label}${viaText()}`,
        sub: o ? `~${o.minutes} min · ${navMixText(o)}` : When.describe(nav.when),
        kind: 'directions',
        data: directionsData(),
        text: `${placeOf(nav.from).label} to ${placeOf(nav.to).label}${viaText()}, by bus and train`,
      });
      return;
    }
    if (pick?.kind === 'place') return sharePlaceCard(pick.place, pick.note);
    if (pick?.kind === 'directions') return shareDirectionsCard(pick);
    sharePlaceCard(placeOf(pick === 'start' ? nav.from : nav.to));
  }

  function sharePlaceCard(place, note = '') {
    showCard({ heading: 'How to get to:', name: place.label, sub: note, kind: 'place', data: place, text: `How to get to ${place.label}` });
  }

  // A trip from Your trips: its two ends, with no time or way picked, so whoever opens it gets
  // every way there from now.
  function shareDirectionsCard({ from, to, summary }) {
    const ends = `${from.label} to ${to.label}`;
    showCard({
      heading: 'Share this trip',
      name: ends,
      sub: summary,
      kind: 'directions',
      data: { from: placeOf(from), to: placeOf(to), when: null, way: null, summary, path: null },
      text: `${ends}, by bus and train`,
    });
  }

  // `note` goes under the name, such as a word on what the link gives away.
  function place(p, note = '') {
    lastPick = { kind: 'place', place: placeOf(p), note };
    openCard(lastPick);
  }

  function directions(trip) {
    lastPick = { kind: 'directions', ...trip };
    openCard(lastPick);
  }

  // Shows the card at once, and the link and map as soon as the link is made.
  async function showCard({ heading, name, sub = '', kind, data, text, made = null }) {
    card = { kind, title: name, text, url: null, data };
    $('#shareCardTitle').textContent = heading;
    $('#shareCardName').textContent = name;
    $('#shareCardSub').textContent = sub;
    $('#shareCardSub').hidden = !sub;
    setLink(null);
    $('#shareMapImg').hidden = true;
    $('#shareStopEta').hidden = kind !== 'eta';
    openModal('shareCardModal');
    try {
      const link = made || (await makeLink(kind, data));
      if (card?.kind !== kind || card.title !== name) return;
      card.url = link.url;
      setLink(link.url);
      const img = $('#shareMapImg');
      img.onload = () => { img.hidden = false; };
      img.src = `/api/share-map?id=${link.id}${kind === 'eta' ? `&v=${Date.now()}` : ''}`;
      return link;
    } catch (e) {
      setLink(null, e.message);
      return null;
    }
  }

  // The link under the card's name: being made, made, or why it couldn't be.
  function setLink(url, error = '') {
    const el = $('#shareCardLink');
    el.classList.toggle('making', !url && !error);
    el.textContent = url || error || 'Making a short link…';
    $('#shareRetry').hidden = !error;
    for (const btn of document.querySelectorAll('#shareTargets [data-share-to]')) {
      btn.disabled = btn.dataset.shareTo === 'offline' ? !offlineUrl() : !url;
    }
  }

  // Offline Sharing's link (js/offline-share.js): Navigate's own link for a place or directions,
  // which opens with no server to look it up, so it goes across with no internet; the short
  // link for live progress, which needs the internet to follow anyway. The way picked isn't
  // in Navigate's link, so they get every way from the ends and the time.
  function offlineUrl() {
    if (!card) return null;
    if (card.kind === 'eta') return card.url;
    const d = card.data;
    const hash = card.kind === 'place' ? navHashFor('here', d) : navHashFor(d.from, d.to, d.when, d.via);
    return `${location.origin}/${hash}`;
  }

  async function sendTo(target, btn) {
    if (target === 'offline') {
      const url = offlineUrl();
      if (url) OfflineShare.send({ url, title: card.title });
      return;
    }
    if (!card?.url) return;
    const { url, text, title } = card;
    // In the Android app, straight into the app's own chat picker rather than through its web
    // link, which the WebView hands to the browser first. Its web link if it isn't installed,
    // or on an app from before it could (SgBusPlugin.share).
    if ((target === 'telegram' || target === 'whatsapp') && window.AppBridge?.has('shareto')) {
      const got = await AppBridge.call('SgBus', 'share', { text, url, app: target }).catch(() => null);
      if (got?.sent) return;
    }
    if (target === 'telegram') window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    else if (target === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
    else if (target === 'more') {
      try { await navigator.share({ title, text, url }); } catch { /* closed */ }
    } else if (target === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        prompt('Copy this link:', url);
        return;
      }
      const lbl = btn.querySelector('.lbl');
      lbl.textContent = 'Copied';
      setTimeout(() => { lbl.textContent = 'Copy link'; }, 2000);
    }
  }

  // ---------- sharing my ETA ----------
  // { id, secret, url, tripId }, kept for the session so a reload mid-trip carries on.

  let eta = null;
  let etaTimer = null;
  let etaLast = null; // the last progress sent, for the ended one

  // Kept past the page too, as the trip is (js/trip.js, KEPT_KEY), so a trip brought back
  // after the app was closed goes on updating its link. `ended` is the trip whose share has
  // ended, so another tab's kept share is left alone.
  function saveEta(ended = null) {
    try {
      if (eta) sessionStorage.setItem(ETA_KEY, JSON.stringify(eta));
      else sessionStorage.removeItem(ETA_KEY);
    } catch { /* this page view only */ }
    try {
      if (eta) localStorage.setItem(ETA_KEY, JSON.stringify(eta));
      else if (ended && JSON.parse(localStorage.getItem(ETA_KEY) || 'null')?.tripId === ended) localStorage.removeItem(ETA_KEY);
    } catch { /* this page view only */ }
  }

  function etaText(p) {
    const mins = Math.max(0, Math.round(p.minutesLeft));
    return `I'm on my way to ${p.to.label}, arriving around ${clock(Date.now() + mins * 60000)}. Follow along live:`;
  }

  async function openEtaCard() {
    const p = Trip.progress();
    if (!p) return;
    const mine = eta?.tripId === p.tripId ? eta : null;
    const link = await showCard({
      heading: 'Share live progress',
      name: `I will arrive in ${Math.max(0, Math.round(p.minutesLeft))} min`,
      sub: `at ${p.to.label}, around ${clock(Date.now() + p.minutesLeft * 60000)}`,
      kind: 'eta',
      data: etaData(p),
      text: etaText(p),
      made: mine,
    });
    if (link && !mine) {
      eta = { id: link.id, secret: link.secret, url: link.url, path: link.path, tripId: p.tripId };
      saveEta();
      Trip.setShare({ id: eta.id, secret: eta.secret, name: LS.getName(), to: p.to });
      etaLast = etaData(p);
      runEta();
    }
  }

  function runEta() {
    clearInterval(etaTimer);
    etaTimer = setInterval(() => sendEta(), ETA_EVERY_MS);
  }

  // This trip's progress to its link. A trip that's over, or another one started since, ends it.
  async function sendEta({ keepalive = false } = {}) {
    if (!eta) return;
    const p = Trip.progress();
    if (!p || p.tripId !== eta.tripId) return endEta();
    etaLast = etaData(p);
    await patchEta(etaLast, keepalive);
    if (p.arrived) clearEta();
  }

  async function patchEta(data, keepalive) {
    const { id, secret } = eta;
    try {
      await api(`/api/share?id=${id}`, { method: 'PATCH', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, data }) });
    } catch (e) {
      // Gone: expired, so there's nothing more to update.
      if (e.status === 404 && eta?.id === id) clearEta();
      else console.warn('eta link update failed:', e);
    }
  }

  function endEta(extra = { ended: true }) {
    if (!eta) return;
    if (etaLast) patchEta({ ...etaLast, arriveAt: extra.stopped ? etaLast.arriveAt : Date.now(), ...extra }, true);
    clearEta();
  }

  function clearEta() {
    clearInterval(etaTimer);
    etaTimer = null;
    const ended = eta?.tripId;
    eta = null;
    etaLast = null;
    saveEta(ended);
  }

  function stopEta() {
    endEta({ stopped: true });
    if (Trip.active()) Trip.setShare(null);
    closeModal('shareCardModal');
  }

  // ---------- following someone's ETA ----------

  let view = null; // { id, data, updatedAt, timer, tick }

  async function openEtaView(id, first) {
    view = { id, ...first };
    renderView();
    openModal('etaModal');
    view.timer = setInterval(refreshView, VIEW_EVERY_MS);
    // The minutes count down between updates.
    view.tick = setInterval(renderView, 15 * 1000);
  }

  async function refreshView() {
    if (!view) return;
    const id = view.id;
    try {
      const got = await api(`/api/share?id=${id}`);
      if (view?.id !== id) return;
      Object.assign(view, { data: got.data, updatedAt: got.updatedAt, gone: false });
    } catch (e) {
      if (view?.id !== id) return;
      if (e.status === 404) view.gone = true;
    }
    renderView();
  }

  function renderView() {
    if (!view) return;
    const { data: d, updatedAt, gone } = view;
    const name = d.name;
    let head;
    if (gone) head = 'This trip has ended';
    else if (d.stopped) head = name ? `${name} stopped sharing` : 'Sharing stopped';
    else if (d.ended) head = name ? `${name} has arrived` : 'Arrived';
    else {
      const mins = minutesTo(d.arriveAt);
      head = mins === 0 ? `${name || 'They'}'re arriving now` : `${name ? `${name} will arrive` : 'Arriving'} in ${mins} min`;
    }
    $('#etaHead').textContent = head;
    $('#etaSub').textContent = d.ended || d.stopped || gone ? `at ${d.to.label}` : `at ${d.to.label}, around ${clock(d.arriveAt)}`;

    const leg = d.leg;
    const live = !d.ended && !d.stopped && !gone;
    $('#etaLeg').hidden = !(live && leg?.label);
    if (live && leg?.label) {
      $('#etaLeg').textContent = (leg.kind === 'walk'
        ? `Walking to ${leg.to}`
        : `On ${leg.label}: ${leg.stopsLeft === 0 ? `at ${leg.to}` : `${leg.stopsLeft} stop${leg.stopsLeft === 1 ? '' : 's'} to ${leg.to}`}`) +
        (d.legCount > 1 ? ` · part ${d.legIndex + 1} of ${d.legCount}` : '');
    }
    renderViewTimeline(live ? d.timeline : null);
    $('#etaLiveMap').hidden = gone;
    if (window.LiveMap?.mode() === 'follow') LiveMap.updateFollow(d);
    const ago = Math.round((Date.now() - updatedAt) / 60000);
    $('#etaUpdated').textContent = gone ? 'The link has expired.'
      : !live ? `Updated ${clock(updatedAt)}.`
      : Date.now() - updatedAt > VIEW_STALE_MS ? `Last updated ${ago} min ago, so the arrival time is the last estimate.`
      : `Updated ${ago < 1 ? 'just now' : `${ago} min ago`}. This refreshes by itself.`;

    const img = $('#etaMapImg');
    const src = `/api/share-map?id=${view.id}&v=${updatedAt}`;
    if (!gone && img.getAttribute('src') !== src) {
      img.onload = () => { img.hidden = false; };
      img.src = src;
    }
  }

  // Their stops from here on, with a dot where they are along the one they're on: the same
  // look as the trip bar's own timeline (js/trip.js), drawn afresh with each update.
  function renderViewTimeline(t) {
    const box = $('#etaTimeline');
    box.hidden = !t?.legs?.length;
    if (box.hidden) return;
    const pos = t.pos || 0;
    box.innerHTML = t.legs.map((leg, k) => {
      const last = leg.names.length - 1;
      const stops = leg.names.map((n, i) =>
        `<li class="tlStop${k === 0 && i <= Math.floor(pos + 0.001) ? ' passed' : ''}${i === last ? ' end' : ''}"><span class="tlNode"></span><span class="tlName">${escapeHtml(n)}</span>` +
        (k === 0 && i === Math.min(last, Math.round(pos)) ? `<span class="tlTag etaHere">${ico('pin')} Here</span>` : '') + `</li>`
      ).join('');
      const icon = leg.kind === 'train' ? 'train' : leg.kind === 'walk' ? 'walk' : 'bus';
      return `<section class="tlLeg${k === 0 ? ' current' : ''}"><p class="tlHead">${ico(icon)} ${escapeHtml(leg.label)} <span>to ${escapeHtml(leg.to)}</span></p>` +
        `<ol class="tlStops">${stops}</ol></section>`;
    }).join('');
  }

  function closeView() {
    if (!view) return;
    clearInterval(view.timer);
    clearInterval(view.tick);
    view = null;
    if (location.hash.startsWith('#share/')) history.replaceState(null, '', stopHash() || location.pathname);
  }

  // ---------- opening a link ----------

  async function open(id) {
    let got;
    try {
      got = await api(`/api/share?id=${encodeURIComponent(id)}`);
    } catch (e) {
      alert(e.status === 404 ? 'This link has expired, or doesn’t exist.' : e.message);
      if (location.hash.startsWith('#share/')) history.replaceState(null, '', location.pathname);
      return;
    }
    const { kind, data } = got;
    if (kind === 'place') openNavAt('here', data);
    else if (kind === 'directions') openNavAt(data.from, data.to, data.when, data.way, data.via || null);
    else if (kind === 'eta') openEtaView(id, { data, updatedAt: got.updatedAt });
  }

  // ---------- wiring ----------

  function init() {
    $('#shareMenuList').addEventListener('click', (e) => {
      const item = e.target.closest('[data-share-pick]');
      if (!item) return;
      closeModal('shareMenuModal');
      openCard(item.dataset.sharePick);
    });
    $('#shareTargets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-share-to]');
      if (btn) sendTo(btn.dataset.shareTo, btn);
    });
    $('#shareTargets [data-share-to="more"]').hidden = !navigator.share;
    // Offline Sharing: the Android app only, once it's said it can.
    const showOffline = () => { $('#shareTargets [data-share-to="offline"]').hidden = !window.OfflineShare?.canSend(); };
    window.addEventListener('app:ready', showOffline);
    showOffline();
    $('#shareRetry').addEventListener('click', () => {
      if (lastPick) openCard(lastPick);
    });
    $('#shareStopEta').addEventListener('click', stopEta);
    $('#shareCardModal').addEventListener('modalclose', () => { card = null; });
    $('#tripShare').addEventListener('click', () => openCard('eta'));
    $('#etaModal').addEventListener('modalclose', closeView);
    // Their trip on the live map, their dot moving as the link updates.
    $('#etaLiveMap').addEventListener('click', () => {
      if (view?.data) LiveMap.follow(view.data);
    });
    $('#etaDirections').addEventListener('click', () => {
      const to = view?.data?.to;
      closeModal('etaModal');
      if (to) openNavAt('here', to);
    });

    window.addEventListener('trip:end', (e) => {
      if (eta && e.detail?.tripId === eta.tripId) endEta();
    });
    // Sent as the app goes into the background, so the server's updates take over from
    // where it really was.
    document.addEventListener('visibilitychange', () => {
      if (eta && document.visibilityState === 'hidden') sendEta({ keepalive: true });
    });

    // A reload mid-trip carries on sharing, if it's still the same trip, and so does opening
    // again after the app was closed, once the trip's back (js/trip.js, trip:resume).
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(ETA_KEY) || 'null') || JSON.parse(localStorage.getItem(ETA_KEY) || 'null');
    } catch { /* nothing to carry on */ }
    const carryOn = () => {
      const p = Trip.progress();
      if (p?.tripId !== saved.tripId) return false;
      eta = saved;
      saveEta();
      etaLast = etaData(p);
      runEta();
      return true;
    };
    if (saved && !carryOn()) {
      if (Trip.active()) {
        // Another trip on now: this one's share is over.
        eta = saved;
        clearEta();
      } else {
        window.addEventListener('trip:resume', function back(e) {
          if (e.detail?.tripId !== saved.tripId) return;
          window.removeEventListener('trip:resume', back);
          carryOn();
        });
      }
    }
  }

  window.Share = { init, open, openMenu, place, directions };
})();
