// Train times at an MRT or LRT station, from /api/trains: LTA's timetable, with a disruption's
// cancellations and delays over it when its feed has any (api/trains.js). LTA publishes no live
// train times otherwise, so these are the timetable's, and say so.
//
// Two places use them:
// - a station search ("Tampines MRT") offers Train times above the station's bus stops
//   (script.js, renderAcList), which opens #trainsModal: each platform's next trains;
// - Navigate's train rides say when the next trains that reach the ride's stop leave
//   (js/nav.js, legStep), by Trains.forLeg.
//
// Offline, both still work: each station's answer is kept under KEY for the rest of its service
// day (it lists all the day's trains still to come), and every station's usual weekday,
// Saturday and Sunday trains come from /api/trains-all, fetched once a day and kept by the
// service worker as the bus routes are (sw.js). A station never opened online gets those.
//
// Keep in step with flutter/lib/data/trains.dart and telegram-bot/src/trains.py.
// Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_trains';
  // Stations kept offline: the most recent ones.
  const KEEP = 12;
  // Asked again after this, while the modal's open or a nav's on show.
  const FRESH_MS = 30 * 1000;
  // A train this close is "now": it's at the platform or pulling in.
  const NOW_S = 30;
  const NEXT_N = 3;

  const tr = (key, en, params) => (window.I18n ? I18n.t(key, en, params) : en.replace(/\{(\w+)\}/g, (_, k) => params?.[k] ?? ''));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const codesKey = (codes) => [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))].sort().join(',');
  // "EW2/DT32" as Navigate's station nodes have it, or a list.
  const codesOf = (x) => (Array.isArray(x) ? x : String(x || '').split('/')).filter(Boolean);

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
  }
  function keep(key, data) {
    const all = readAll();
    all[key] = { ...data, savedAt: Date.now() };
    const keys = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0));
    for (const k of keys.slice(KEEP)) delete all[k];
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* not kept: asked again next time */ }
  }
  // A kept answer still of use: its service day isn't over (the day's 3am after next midnight).
  function kept(key) {
    const d = readAll()[key];
    return d && Date.now() < d.start + (24 + 3) * 3600 * 1000 ? d : null;
  }

  const fresh = new Map(); // key -> { at, data }
  const asking = new Map();

  // A station's trains, as /api/trains has them plus { offline } when it's a kept copy. Null
  // when there are none to be had.
  async function load(codes, { force = false } = {}) {
    const key = codesKey(codesOf(codes));
    if (!key) return null;
    const f = fresh.get(key);
    if (!force && f && Date.now() - f.at < FRESH_MS) return f.data;
    if (asking.has(key)) return asking.get(key);
    const p = fetch(`/api/trains?codes=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        fresh.set(key, { at: Date.now(), data });
        keep(key, data);
        return data;
      })
      .catch(async () => {
        const old = kept(key);
        return old ? { ...old, offline: true } : fromNetwork(codesOf(codes));
      })
      .finally(() => asking.delete(key));
    asking.set(key, p);
    return p;
  }

  // ---------- the whole network, for offline ----------
  const ALL_URL = '/api/trains-all';
  const ALL_KEY = 'sgbus_trains_all';
  let network = null; // the parsed /api/trains-all, once wanted
  const SG_MS = 8 * 3600 * 1000;
  const DAY_ENDS_HOUR = 3; // as api/_trains/gtfs.js: after midnight is the day before's

  // The service day of a moment, as { day: "2026-11-22", start, dow }.
  function serviceDayOf(ms) {
    const d = new Date(ms + SG_MS);
    if (d.getUTCHours() < DAY_ENDS_HOUR) d.setUTCDate(d.getUTCDate() - 1);
    const day = d.toISOString().slice(0, 10);
    return { day, start: Date.parse(`${day}T00:00:00Z`) - SG_MS, dow: d.getUTCDay() };
  }
  // Sunday's trains on a public holiday, as LTA runs them.
  const kindOf = (day, dow) => (dow === 0 || window.When?.isHoliday?.(day) ? 'sun' : dow === 6 ? 'sat' : 'wd');

  // Every station's usual trains, once a day while online, for the service worker to keep.
  function warm() {
    if (navigator.onLine === false) return;
    const today = serviceDayOf(Date.now()).day;
    try { if (localStorage.getItem(ALL_KEY) === today) return; } catch { /* asked again */ }
    fetch(ALL_URL).then((r) => {
      if (!r.ok) return;
      network = null;
      try { localStorage.setItem(ALL_KEY, today); } catch { /* asked again next time */ }
    }).catch(() => {});
  }

  // A station's trains worked out from /api/trains-all, shaped as /api/trains answers, with
  // { offline, usual }. Null without a copy.
  async function fromNetwork(codes, ms = Date.now()) {
    if (!network) {
      network = fetch(ALL_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
    const all = await network;
    if (!all?.platforms) { network = null; return null; }
    const want = new Set(codes.map((c) => String(c).toUpperCase()));
    const parents = new Set(want);
    for (const p of all.platforms) if (want.has(p.code) || want.has(p.parent)) parents.add(p.parent);
    const { day, start, dow } = serviceDayOf(ms);
    const kind = kindOf(day, dow);
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const nextKind = kindOf(next, (dow + 1) % 7);
    const now = (ms - start) / 1000;
    const platforms = all.platforms
      .filter((p) => parents.has(p.parent) || parents.has(p.code))
      .map((p) => {
        const flat = p.trains[kind] || [];
        const trains = [];
        for (let i = 0; i < flat.length; i += 3) if (flat[i] >= now - 60) trains.push([flat[i], flat[i + 1], flat[i + 2], 0]);
        const tomorrow = p.trains[nextKind] || [];
        return { ...p, trains, first: tomorrow.length ? [tomorrow[0], tomorrow[1]] : null };
      })
      .filter((p) => p.trains.length || p.first);
    if (!platforms.length) return null;
    return { day, start, now, live: false, platforms, offline: true, usual: true };
  }

  // A platform's trains from `ms` on, as { ms, head, state, way }: `state` 0 the timetable's,
  // 1 changed by a disruption, 2 cancelled or not stopping. Cancelled ones are kept, to say so.
  function trainsFrom(data, p, ms) {
    const after = (ms - data.start) / 1000 - NOW_S;
    return p.trains
      .filter((x) => x[0] >= after)
      .map((x) => ({ ms: data.start + x[0] * 1000, head: p.heads[x[1]], way: p.ways[x[2]], state: x[3] }));
  }

  // The next trains on a Navigate ride: from its boarding station, those that call at its stop,
  // from `ms` (when you're on the platform), as { trains: [{ ms, head, state }], live, offline }.
  // Null when there's nothing to say: no answer, or no train that goes there.
  function forLeg(data, toCodes, ms) {
    if (!data?.platforms) return null;
    const want = new Set(codesOf(toCodes).map((c) => c.toUpperCase()));
    const trains = [];
    for (const p of data.platforms) {
      for (const x of trainsFrom(data, p, ms)) if (x.way.some((c) => want.has(c))) trains.push(x);
    }
    trains.sort((a, b) => a.ms - b.ms);
    const running = trains.filter((x) => x.state !== 2);
    const out = running.slice(0, NEXT_N);
    if (!out.length) return null;
    // The day's last train there, and how far from the last the next one is: 1 the last, 2 and
    // 3 the two before it (the bus card's "last 3 buses of the day").
    const lastMs = running[running.length - 1].ms;
    const rank = running.length <= 3 ? running.length : null;
    return { trains: out, live: trains.some((x) => x.state), offline: !!data.offline, lastMs, rank };
  }

  // ---------- the last trains ----------
  // A platform's last three trains of the day (that run), each its rank from the last: a map of
  // its time (seconds after the day's midnight) to 1, 2 or 3. The answer lists the whole rest of
  // the day, so its end is the day's end.
  function lastRanks(p) {
    const runs = p.trains.filter((x) => x[3] !== 2);
    return new Map(runs.slice(-3).reverse().map((x, i) => [x[0], i + 1]));
  }
  // The platform's last train today, as ms, or null when none is left.
  function lastTrainMs(data, p) {
    const runs = p.trains.filter((x) => x[3] !== 2);
    return runs.length ? data.start + runs[runs.length - 1][0] * 1000 : null;
  }
  // "Last train", "2nd last", "3rd last".
  const rankText = (r) => (r === 1 ? tr('trains.rank1', 'Last train') : r === 2 ? tr('trains.rank2', '2nd last') : tr('trains.rank3', '3rd last'));
  // A platform's last train, as a line: red once only its last three are left.
  function lastLineHtml(data, p, now) {
    const lastMs = lastTrainMs(data, p);
    if (lastMs == null) return '';
    const left = trainsFrom(data, p, now).filter((x) => x.state !== 2).length;
    return `<p class="trainLastLine${left && left <= 3 ? ' lastThree' : ''}">${esc(tr('trains.lastAt', 'Last train today at {time}', { time: clock(lastMs) }))}</p>`;
  }
  // A train's mark among the last three, or nothing.
  function rankHtml(ranks, t) {
    const r = ranks.get(t);
    return r ? `<span class="trainRank">${esc(rankText(r))}</span>` : '';
  }

  // A platform as the map's station card shows it (js/map-card.js): its next trains in a row,
  // the last three marked, and its last train today.
  function compactHtml(data, p, now = Date.now()) {
    const ranks = lastRanks(p);
    const next = trainsFrom(data, p, now).filter((x) => x.state !== 2).slice(0, NEXT_N);
    const chips = next.map((x) => {
      const r = ranks.get((x.ms - data.start) / 1000);
      const mark = [r ? rankText(r) : '', x.state === 1 ? tr('trains.changed', 'New time') : ''].filter(Boolean).join(' · ');
      return `<span class="trainChip${r ? ' last' : ''}${x.state === 1 ? ' changed' : ''}" title="${esc(clock(x.ms))}${mark ? ` · ${esc(mark)}` : ''}">${esc(when(x.ms, now))}${mark ? `<small>${esc(mark)}</small>` : ''}</span>`;
    }).join('');
    return `<div class="trainCompact">` +
      (chips ? `<div class="trainChips">${chips}</div>` : `<p class="mcNote">${esc(p.first
        ? tr('trains.lastGone', 'No more trains today. First train tomorrow at {time}.', { time: clock(data.start + (p.first[0] + 86400) * 1000) })
        : tr('trains.noneToday', 'No more trains today.'))}</p>`) +
      lastLineHtml(data, p, now) + `</div>`;
  }

  // "Now", "4 min", or the clock past an hour away.
  function when(ms, now = Date.now()) {
    const s = (ms - now) / 1000;
    if (s <= NOW_S) return tr('trains.now', 'Now');
    const min = Math.round(s / 60);
    if (min >= 60) return clock(ms);
    return tr('trains.min', '{n} min', { n: min });
  }
  const clock = (ms) => (window.When?.clock ? When.clock(ms) : new Date(ms).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false }));

  // ---------- the modal ----------
  const ID = 'trainsModal';
  let showing = null; // { codes, name, timer }

  function platformHtml(data, p, now) {
    const list = trainsFrom(data, p, now).slice(0, NEXT_N + 1);
    const ranks = lastRanks(p);
    const heads = [...new Set(list.map((x) => x.head))];
    const towards = heads.length ? heads.join(' · ') : p.heads.join(' · ');
    const dot = p.colour ? `<span class="lineDot" style="--line:${esc(p.colour)}"></span>` : '';
    const rows = list.length
      ? list.map((x) => {
        const label = x.state === 2 ? tr('trains.cancelled', 'Cancelled') : when(x.ms, now);
        const t = (x.ms - data.start) / 1000;
        const cls = (x.state === 2 ? ' gone' : x.state === 1 ? ' changed' : '') + (ranks.has(t) ? ' last' : '');
        // Where it's going, when the platform's trains don't all go the same way.
        const where = heads.length > 1 ? `<span class="trainHead">${esc(x.head)}</span>` : '';
        // A new time from the disruption feed is said in words, not only in orange (WCAG 1.4.1).
        const changed = x.state === 1 ? `<span class="trainTag">${esc(tr('trains.changed', 'New time'))}</span>` : '';
        return `<li class="trainRow${cls}"><span class="trainWhen">${esc(label)}</span>${where}${changed}${rankHtml(ranks, t)}<span class="trainClock">${esc(clock(x.ms))}</span></li>`;
      }).join('')
      : `<li class="trainRow none">${esc(p.first
        ? tr('trains.lastGone', 'No more trains today. First train tomorrow at {time}.', { time: clock(data.start + (p.first[0] + 86400) * 1000) })
        : tr('trains.noneToday', 'No more trains today.'))}</li>`;
    return `<section class="trainPlatform">` +
      `<h3 class="trainLine"><span class="busChip lineChip">${dot}${esc(p.line || p.code)}</span>` +
      `<span class="trainTowards">${esc(tr('trains.towards', 'Towards {place}', { place: towards }))}</span>` +
      (p.platform ? `<span class="trainPlat">${esc(tr('trains.platform', 'Platform {p}', { p: p.platform }))}</span>` : '') +
      `</h3>${lastLineHtml(data, p, now)}<ul class="trainRows">${rows}</ul></section>`;
  }

  function draw(data) {
    const body = document.getElementById('trainsBody');
    if (!body) return;
    if (!data) {
      body.innerHTML = `<div class="empty">${esc(navigator.onLine === false
        ? tr('trains.offlineNone', 'You’re offline, and this station’s train times aren’t saved yet.')
        : tr('trains.failed', 'Couldn’t get the train times. Try again in a moment.'))}</div>`;
      return;
    }
    const now = Date.now();
    const status = data.live
      ? `<p class="trainsNote live"><span class="liveDot" aria-hidden="true"></span>${esc(tr('trains.liveNote', 'Live: LTA reports a disruption here. Changed and cancelled trains are marked.'))}</p>`
      : `<p class="trainsNote">${esc(tr('trains.timetableNote', 'Timetable times from LTA. LTA gives live train times only during a disruption.'))}</p>`;
    body.innerHTML =
      (data.usual
        ? `<p class="trainsNote warn">${esc(tr('trains.usualNote', 'Offline: LTA’s usual timetable for today. Works or a disruption may change it.'))}</p>`
        : data.offline ? `<p class="trainsNote warn">${esc(tr('trains.savedNote', 'Offline: times saved earlier today.'))}</p>` : '') +
      (data.usual ? '' : status) +
      data.platforms.map((p) => platformHtml(data, p, now)).join('');
  }

  // Opens the modal on a station ({ name, codes }, as js/station-search.js has them).
  async function open(station) {
    const modal = document.getElementById(ID);
    if (!modal || !station?.codes?.length) return;
    stop();
    document.getElementById('trainsTitle').textContent = tr('trains.titleAt', 'Trains at {station}', { station: station.name });
    const body = document.getElementById('trainsBody');
    body.innerHTML = `<div class="empty">${esc(tr('trains.loading', 'Loading train times…'))}</div>`;
    window.openModal(ID);
    showing = { codes: station.codes, data: null };
    const tick = async (force) => {
      if (!showing) return;
      const data = force || !showing.data || Date.now() - (showing.at || 0) >= FRESH_MS ? await load(showing.codes) : showing.data;
      if (!showing) return;
      if (data !== showing.data) { showing.data = data; showing.at = Date.now(); }
      draw(showing.data);
    };
    await tick(true);
    // The minutes count down; the answer's asked again every half a minute.
    if (showing) showing.timer = setInterval(() => tick(false), 10 * 1000);
  }

  function stop() {
    if (showing?.timer) clearInterval(showing.timer);
    showing = null;
  }

  function init() {
    document.getElementById(ID)?.addEventListener('modalclose', stop);
    // Not as the page loads: a little after, when it's quiet.
    setTimeout(warm, 15 * 1000);
    window.addEventListener('online', () => setTimeout(warm, 5 * 1000));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Trains = { load, forLeg, when, open, codesKey, fromNetwork, warm, lastRanks, lastTrainMs, compactHtml, rankText };
})();
