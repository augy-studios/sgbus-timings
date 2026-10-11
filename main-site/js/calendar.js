// Calendar, as Citymapper's: your events with a location, today and the next two weeks, on
// the Calendar tab of Navigate's From and To (js/recents.js). Picking one plans the way there
// to arrive by its start (navToEvent in js/nav.js).
//
// A website can't read the phone's calendar, so the events come from one of two places:
//
//   a link   the calendar's private iCal link (Google's "Secret address in iCal format",
//            Outlook's published ICS link, iCloud's public calendar), kept in this browser and
//            read again each time the tab opens, through api/calendar.js, since the calendar
//            services don't let a page read it itself. Nothing is kept on the server.
//   a file   an .ics file exported from the calendar app, read here and never sent anywhere;
//            a snapshot, so imported again for new events.
//
// Each event's location is free text, matched to a place with Navigate's own search
// (/api/places), the postal code first when it has one; what it matched is remembered in this
// browser. An event whose location matches nothing is still listed, and picking it puts the
// location in the box to pick the place by hand. Online meetings (a link for a location) are
// left out, as is anything with no location.
//
// Repeating events are expanded here (RRULE: daily, weekly, monthly, yearly, with INTERVAL,
// COUNT, UNTIL, BYDAY, BYMONTHDAY and BYMONTH; EXDATE; RECURRENCE-ID changes and
// cancellations), in the time zone each event was set in.
// Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_calendar';
  const PLACES_KEY = 'sgbus_calendar_places';
  const DAYS = 14;
  const REFETCH_MS = 10 * 60 * 1000;
  const MAX_PLACES = 300;
  const MAX_EVENTS = 2000;
  const MAX_HIDDEN = 200;
  const DAY_MS = 24 * 3600 * 1000;
  const SG = 'Asia/Singapore';
  const ONLINE_RE = /^(https?:|www\.)|zoom\.us|meet\.google|teams\.microsoft|microsoft teams|webex/i;

  // ---------- storage ----------

  // { url?, file?: { name, importedAt, events }, hidden: [key] }
  function settings() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && typeof v === 'object' ? { hidden: [], ...v } : { hidden: [] };
    } catch {
      return { hidden: [] };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      throw new Error("This browser won't keep the calendar. Try a smaller file.");
    }
  }

  const connected = () => {
    const s = settings();
    return !!(s.url || s.file);
  };

  // ---------- reading iCal ----------

  function unfold(text) {
    return text.replace(/\r\n[ \t]|\n[ \t]/g, '').split(/\r?\n/);
  }

  function parseLine(line) {
    let i = 0;
    let quoted = false;
    for (; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      else if (line[i] === ':' && !quoted) break;
    }
    const [name, ...rest] = line.slice(0, i).split(';');
    const params = {};
    for (const kv of rest) {
      const j = kv.indexOf('=');
      if (j > 0) params[kv.slice(0, j).toUpperCase()] = kv.slice(j + 1).replace(/^"|"$/g, '');
    }
    return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
  }

  const unescapeText = (v) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();

  // "20261013T180000Z", "20261013T180000" with its TZID, or "20261013" for a whole day.
  function parseDate(value, params = {}) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    const allDay = !m[4] || params.VALUE === 'DATE';
    return {
      c: { y: +m[1], m: +m[2], d: +m[3], h: allDay ? 0 : +m[4], mi: allDay ? 0 : +m[5], s: allDay ? 0 : +(m[6] || 0) },
      tz: m[7] ? 'UTC' : allDay ? SG : params.TZID || null,
      allDay,
    };
  }

  // Outlook's own names for the zones most likely to turn up here.
  const WINDOWS_ZONES = {
    'singapore standard time': SG, 'malay peninsula standard time': SG, 'china standard time': 'Asia/Shanghai',
    'taipei standard time': 'Asia/Taipei', 'tokyo standard time': 'Asia/Tokyo', 'korea standard time': 'Asia/Seoul',
    'se asia standard time': 'Asia/Bangkok', 'india standard time': 'Asia/Kolkata', 'aus eastern standard time': 'Australia/Sydney',
    'gmt standard time': 'Europe/London', 'w. europe standard time': 'Europe/Berlin', 'eastern standard time': 'America/New_York',
    'pacific standard time': 'America/Los_Angeles', 'utc': 'UTC',
  };

  const zoneCache = new Map();
  function zone(tz) {
    if (!tz) return SG; // a floating time is Singapore's
    if (zoneCache.has(tz)) return zoneCache.get(tz);
    let z = WINDOWS_ZONES[tz.toLowerCase()] || tz.match(/([A-Za-z_]+\/[A-Za-z_+-]+)$/)?.[1] || tz;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: z });
    } catch {
      z = SG;
    }
    zoneCache.set(tz, z);
    return z;
  }

  const fmtCache = new Map();
  // How far ahead of UTC a zone's clock is at a moment.
  function offset(ms, tz) {
    if (tz === 'UTC') return 0;
    let fmt = fmtCache.get(tz);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      fmtCache.set(tz, fmt);
    }
    const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, +x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }

  // A wall-clock time in a zone as a moment.
  function toMs(c, tz) {
    const z = tz === 'UTC' ? 'UTC' : zone(tz);
    const guess = Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s);
    if (z === 'UTC') return guess;
    const first = guess - offset(guess, z);
    const second = guess - offset(first, z);
    return second;
  }

  // Every VEVENT with a location, as { uid, title, location, start, rrule, exdates, recurrenceId, cancelled }.
  function parseIcs(text) {
    const events = [];
    let ev = null;
    for (const line of unfold(text)) {
      if (!line) continue;
      const { name, params, value } = parseLine(line);
      if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
        ev = { exdates: [] };
      } else if (name === 'BEGIN' && ev) {
        ev.nested = (ev.nested || 0) + 1; // an alarm inside the event
      } else if (name === 'END' && ev && ev.nested) {
        ev.nested--;
      } else if (name === 'END' && value.toUpperCase() === 'VEVENT' && ev) {
        if (ev.start && ev.location && !ONLINE_RE.test(ev.location)) {
          delete ev.nested;
          events.push(ev);
        }
        ev = null;
      } else if (ev && !ev.nested) {
        if (name === 'UID') ev.uid = value.trim();
        else if (name === 'SUMMARY') ev.title = unescapeText(value);
        else if (name === 'LOCATION') ev.location = unescapeText(value);
        else if (name === 'DTSTART') ev.start = parseDate(value, params);
        else if (name === 'RRULE') ev.rrule = Object.fromEntries(value.split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
        else if (name === 'EXDATE') {
          for (const v of value.split(',')) {
            const d = parseDate(v, params);
            if (d) ev.exdates.push(toMs(d.c, d.tz));
          }
        } else if (name === 'RECURRENCE-ID') {
          const d = parseDate(value, params);
          if (d) ev.recurrenceId = toMs(d.c, d.tz);
        } else if (name === 'STATUS') ev.cancelled = value.trim().toUpperCase() === 'CANCELLED';
      }
    }
    return events;
  }

  // ---------- repeating events ----------

  const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const dayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const ymd = (date) => ({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
  const addDays = (c, n) => ymd(new Date(Date.UTC(c.y, c.m - 1, c.d + n)));
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const before = (a, b) => a.y !== b.y ? a.y < b.y : a.m !== b.m ? a.m < b.m : a.d < b.d;

  // The days a rule gives in its k-th period, in order.
  function periodDays(rule, c0, k) {
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const byDay = (rule.BYDAY || '').split(',').filter(Boolean);
    const byMonthDay = (rule.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
    switch (rule.FREQ) {
      case 'DAILY': {
        const d = addDays(c0, k * interval);
        return !byDay.length || byDay.some((t) => WEEKDAYS[t.slice(-2)] === dayOf(d.y, d.m, d.d).getUTCDay()) ? [d] : [];
      }
      case 'WEEKLY': {
        const monday = addDays(c0, -((dayOf(c0.y, c0.m, c0.d).getUTCDay() + 6) % 7) + k * interval * 7);
        const wanted = byDay.length ? byDay.map((t) => WEEKDAYS[t.slice(-2)]) : [dayOf(c0.y, c0.m, c0.d).getUTCDay()];
        return [...new Set(wanted)].map((w) => addDays(monday, (w + 6) % 7)).sort((a, b) => (before(a, b) ? -1 : 1));
      }
      case 'MONTHLY': {
        const total = c0.m - 1 + k * interval;
        const y = c0.y + Math.floor(total / 12);
        const m = (total % 12) + 1;
        const n = daysIn(y, m);
        let days = [];
        if (byDay.length) {
          for (const t of byDay) {
            const w = WEEKDAYS[t.slice(-2)];
            const nth = Number(t.slice(0, -2)) || 0;
            const all = [];
            for (let d = 1; d <= n; d++) if (dayOf(y, m, d).getUTCDay() === w) all.push(d);
            if (!nth) days.push(...all);
            else if (all[nth > 0 ? nth - 1 : all.length + nth]) days.push(all[nth > 0 ? nth - 1 : all.length + nth]);
          }
        } else if (byMonthDay.length) {
          days = byMonthDay.map((d) => (d < 0 ? n + d + 1 : d)).filter((d) => d >= 1 && d <= n);
        } else if (c0.d <= n) {
          days = [c0.d];
        }
        return [...new Set(days)].sort((a, b) => a - b).map((d) => ({ y, m, d }));
      }
      case 'YEARLY': {
        const y = c0.y + k * interval;
        const months = (rule.BYMONTH || '').split(',').filter(Boolean).map(Number);
        const days = byMonthDay.length ? byMonthDay : [c0.d];
        return (months.length ? months : [c0.m]).flatMap((m) => days.filter((d) => d >= 1 && d <= daysIn(y, m)).map((d) => ({ y, m, d })));
      }
      default:
        return [];
    }
  }

  const PERIOD_DAYS = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 };

  // The moments an event starts in [from, to).
  function occurrences(ev, from, to) {
    const { c, tz, allDay } = ev.start;
    const first = toMs(c, tz);
    const rule = ev.rrule;
    if (!rule || !PERIOD_DAYS[rule.FREQ]) return first >= from - (allDay ? DAY_MS : 0) && first < to ? [first] : [];
    // UNTIL is UTC, a whole day (to its end), or, unmarked, the event's own zone.
    const end = rule.UNTIL ? parseDate(rule.UNTIL) : null;
    const until = end ? toMs(end.c, end.tz ?? tz) + (end.allDay ? DAY_MS - 1 : 0) : Infinity;
    const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
    const exdates = new Set(ev.exdates);
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    // Without a count, skip straight to the periods near now rather than walking from the start.
    let k = 0;
    if (count === Infinity && from > first) k = Math.max(0, Math.floor((from - first) / (PERIOD_DAYS[rule.FREQ] * interval * DAY_MS)) - 1);
    const out = [];
    let seen = 0;
    for (let steps = 0; steps < 1500; steps++, k++) {
      for (const day of periodDays(rule, c, k)) {
        if (before(day, c)) continue;
        const ms = toMs({ ...day, h: c.h, mi: c.mi, s: c.s }, tz);
        if (ms > until || ++seen > count || ms >= to) return out;
        if (ms >= from - (allDay ? DAY_MS : 0) && !exdates.has(ms)) out.push(ms);
      }
    }
    return out;
  }

  // Every event starting from now (or today, for a whole day) to DAYS ahead, soonest first, as
  // { key, title, location, start, allDay }, without the ones hidden.
  function upcoming(events) {
    const now = Date.now();
    const to = now + DAYS * DAY_MS;
    const hidden = new Set(settings().hidden);
    const changed = new Map(); // uid -> moments moved or cancelled by a RECURRENCE-ID
    for (const ev of events) if (ev.recurrenceId != null && ev.uid) (changed.get(ev.uid) || changed.set(ev.uid, new Set()).get(ev.uid)).add(ev.recurrenceId);
    const out = [];
    for (const ev of events) {
      if (ev.cancelled) continue;
      const skip = ev.recurrenceId == null ? changed.get(ev.uid) : null;
      for (const start of occurrences(ev, now, to)) {
        if (skip?.has(start)) continue;
        if (ev.start.allDay ? start + DAY_MS <= now : start < now) continue;
        const key = `${ev.uid || ev.title}|${start}`;
        if (!hidden.has(key)) out.push({ key, title: ev.title || 'Event', location: ev.location, start, allDay: ev.start.allDay });
      }
    }
    return out.sort((a, b) => a.start - b.start).slice(0, 100);
  }

  // Only what could still come round, for keeping an imported file.
  function stillAhead(ev) {
    const first = toMs(ev.start.c, ev.start.tz);
    if (!ev.rrule) return first > Date.now() - DAY_MS;
    const until = ev.rrule.UNTIL && parseDate(ev.rrule.UNTIL);
    return !until || toMs(until.c, until.tz) > Date.now();
  }

  // ---------- where each event is ----------

  function placeCache() {
    try {
      return JSON.parse(localStorage.getItem(PLACES_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function keepPlace(location, place) {
    const cache = placeCache();
    cache[location] = place;
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PLACES))) delete cache[k];
    try {
      localStorage.setItem(PLACES_KEY, JSON.stringify(cache));
    } catch { /* matched again next time */ }
  }

  const finding = new Map();
  // The place a location names, null for none, or undefined when it couldn't be looked up.
  function placeFor(location) {
    const cache = placeCache();
    if (location in cache) return Promise.resolve(cache[location]);
    if (finding.has(location)) return finding.get(location);
    const job = (async () => {
      const postal = location.match(/\b(\d{6})\b/)?.[1];
      const tries = [postal, location.slice(0, 150), location.split(',')[0]].filter((q, i, all) => q && q.trim().length >= 2 && all.indexOf(q) === i);
      for (const q of tries) {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        if (!r.ok) continue;
        const list = await r.json().catch(() => []);
        if (Array.isArray(list) && list[0]) {
          // Named as the event names it ("Punggol Coast Mall"), rather than as the search
          // found it ("Punggol Coast Mall (tower 7)"), at the point the search found.
          const own = location.split(',')[0].trim();
          const place = { label: own.length >= 3 && own.length <= 80 ? own : list[0].label, lat: list[0].lat, lng: list[0].lng };
          keepPlace(location, place);
          return place;
        }
      }
      keepPlace(location, null);
      return null;
    })().catch(() => undefined).finally(() => finding.delete(location));
    finding.set(location, job);
    return job;
  }

  // ---------- getting the events ----------

  let fetched = null; // { url, at, events } from the link
  let fetching = null;

  async function events({ fresh = false } = {}) {
    const s = settings();
    if (s.file) return s.file.events;
    if (!s.url) return [];
    if (!fresh && fetched?.url === s.url && Date.now() - fetched.at < REFETCH_MS) return fetched.events;
    if (fetching) return fetching;
    fetching = (async () => {
      const r = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url }), cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't read your calendar right now.");
      const list = parseIcs(await r.text());
      fetched = { url: s.url, at: Date.now(), events: list };
      return list;
    })().finally(() => { fetching = null; });
    return fetching;
  }

  // ---------- the tab ----------

  const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: SG, month: 'short', day: 'numeric' });
  const sgDay = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);

  function whenText(ev) {
    const today = sgDay(Date.now());
    const d = sgDay(ev.start);
    const tomorrow = sgDay(Date.now() + DAY_MS);
    const dayText = d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : dayFmt.format(ev.start);
    return ev.allDay ? `All day: ${dayText}` : `Arrive: ${dayText}, ${When.clock(ev.start)}`;
  }

  function render(box, onPick) {
    if (!connected()) {
      box.innerHTML = `<button type="button" class="calSetup" data-cal-settings>${ico('calendar')}` +
        `<span class="recentText"><span class="name">Sync with calendar</span><span class="sub">Plan trips from your events</span></span>${ico('forward')}</button>`;
    } else {
      box.innerHTML = `<p class="recentEmpty">Reading your calendar…</p>`;
    }
    let list = [];
    let menu = null;
    const places = new Map();

    const draw = () => {
      if (!box.isConnected) return;
      const today = sgDay(Date.now());
      const row = (ev, i) => {
        const place = places.get(ev.location);
        const open = menu === ev.key;
        // The menu is always there, folded shut until the dots open it (toggleRowMenu in js/ui.js).
        return `<div class="recentRow${open ? ' open' : ''}" data-menu-row="${escapeHtml(ev.key)}">` +
          `<button type="button" class="recentMain" data-cal-pick="${i}">${ico('calendar')}<span class="recentText">` +
          `<span class="calWhen">${escapeHtml(whenText(ev))}</span><span class="name">${escapeHtml(ev.title)}</span>` +
          `<span class="sub">${escapeHtml(ev.location)}${place === null ? ' <em>· Location not found. Tap to pick it.</em>' : ''}</span></span></button>` +
          `<button type="button" class="recentMore" data-cal-menu="${escapeHtml(ev.key)}" data-menu-toggle aria-expanded="${open}" aria-label="More for ${escapeHtml(ev.title)}">${ico('more')}</button>` +
          `<div class="rowMenu"><div><div class="recentMenu">` +
          (place ? `<button type="button" class="iconBtn" data-cal-act="save" data-cal="${i}">${ico('pin')} Save as place</button>` : '') +
          (place ? `<button type="button" class="iconBtn" data-cal-act="share" data-cal="${i}">${ico('share')} Share place</button>` : '') +
          `<button type="button" class="iconBtn" data-cal-act="hide" data-cal="${i}">${ico('close')} Hide this event</button>` +
          `</div></div></div>` +
          `</div>`;
      };
      const todays = list.filter((ev) => sgDay(ev.start) === today);
      const later = list.filter((ev) => sgDay(ev.start) !== today);
      box.innerHTML =
        (list.length
          ? (todays.length ? `<p class="recentHead">Today</p>${todays.map((ev) => row(ev, list.indexOf(ev))).join('')}` : '') +
            (later.length ? `<p class="recentHead">Later</p>${later.map((ev) => row(ev, list.indexOf(ev))).join('')}` : '')
          : `<p class="recentEmpty">No events with a location in the next ${DAYS} days.</p>`) +
        `<button type="button" class="recentClear" data-cal-settings>Calendar settings</button>`;
    };

    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-cal-settings]')) return openSettings();
      const m = e.target.closest('[data-cal-menu]');
      if (m) {
        menu = menu === m.dataset.calMenu ? null : m.dataset.calMenu;
        return toggleRowMenu(box, menu);
      }
      const act = e.target.closest('[data-cal-act]');
      if (act) {
        const ev = list[Number(act.dataset.cal)];
        const place = ev && places.get(ev.location);
        if (!ev) return;
        if (act.dataset.calAct === 'hide') {
          const s = settings();
          s.hidden = [...s.hidden, ev.key].slice(-MAX_HIDDEN);
          saveSettings(s);
          list = list.filter((x) => x !== ev);
          menu = null;
          return draw();
        }
        document.activeElement?.blur();
        if (act.dataset.calAct === 'save') Places.edit(null, { ...place, name: ev.title });
        else Share.place(place);
        return;
      }
      const pick = e.target.closest('[data-cal-pick]');
      if (pick) {
        const ev = list[Number(pick.dataset.calPick)];
        if (ev) onPick({ ...ev, place: places.get(ev.location) || null });
      }
    });

    if (!connected()) return;
    events().then((all) => {
      list = upcoming(all);
      draw();
      // Matched a few at a time, each row filled in as its place comes back.
      const locations = [...new Set(list.map((ev) => ev.location))];
      let next = 0;
      const worker = async () => {
        while (next < locations.length) {
          const loc = locations[next++];
          const place = await placeFor(loc);
          if (place !== undefined) places.set(loc, place);
          draw();
        }
      };
      return Promise.all([worker(), worker(), worker()]);
    }).catch((err) => {
      if (!box.isConnected) return;
      box.innerHTML = `<p class="recentEmpty">${escapeHtml(err.message)}</p><button type="button" class="recentClear" data-cal-settings>Calendar settings</button>`;
    });
  }

  // ---------- settings ----------

  function renderSettings(note = '', tone = '') {
    const s = settings();
    $('#calUrl').value = s.url || '';
    $('#calSource').textContent = s.url ? 'Linked to your calendar by its iCal link.'
      : s.file ? `Imported from ${s.file.name}, ${new Date(s.file.importedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Import it again for new events.`
      : 'Not linked yet.';
    $('#calRemove').hidden = !(s.url || s.file);
    $('#calNote').textContent = note;
    $('#calNote').hidden = !note;
    $('#calNote').classList.toggle('error', tone === 'error');
  }

  function openSettings() {
    document.activeElement?.blur();
    renderSettings();
    openModal('calendarModal');
  }

  async function saveUrl() {
    const url = $('#calUrl').value.trim();
    if (!url) return renderSettings('Paste the link first.', 'error');
    const s = settings();
    const btn = $('#calSave');
    btn.disabled = true;
    renderSettings('Reading your calendar…');
    $('#calUrl').value = url;
    try {
      saveSettings({ hidden: s.hidden, url });
      const list = upcoming(await events({ fresh: true }));
      renderSettings(`Linked. ${list.length ? `${plural(list.length, 'event')} with a location in the next ${DAYS} days.` : `No events with a location in the next ${DAYS} days yet.`} Find them under Calendar when you tap into Navigate's From or To.`);
    } catch (err) {
      saveSettings(s);
      renderSettings(err.message, 'error');
      $('#calUrl').value = url;
    } finally {
      btn.disabled = false;
    }
  }

  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('That file is too big. Export just the next few months.');
      const text = await file.text();
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new Error("That isn't a calendar file. Pick an .ics file.");
      const kept = parseIcs(text).filter(stillAhead).slice(0, MAX_EVENTS);
      saveSettings({ hidden: settings().hidden, file: { name: file.name.slice(0, 80), importedAt: Date.now(), events: kept } });
      const list = upcoming(kept);
      renderSettings(`Imported. ${list.length ? `${plural(list.length, 'event')} with a location in the next ${DAYS} days.` : `No events with a location in the next ${DAYS} days.`}`);
    } catch (err) {
      renderSettings(err.message, 'error');
    } finally {
      $('#calFile').value = '';
    }
  }

  function remove() {
    if (!confirm('Stop showing your calendar here? This forgets the link or file on this device.')) return;
    saveSettings({ hidden: [] });
    fetched = null;
    try {
      localStorage.removeItem(PLACES_KEY);
    } catch { /* nothing to forget */ }
    renderSettings('Removed.');
  }

  function init() {
    $('#calSave').addEventListener('click', saveUrl);
    $('#calUrl').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveUrl();
    });
    $('#calFile').addEventListener('change', (e) => importFile(e.target.files?.[0]));
    $('#calRemove').addEventListener('click', remove);
  }

  window.Calendar = { init, render, openSettings, parseIcs, upcoming, occurrences };
})();
