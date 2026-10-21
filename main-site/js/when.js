// When a journey is for, in Navigate and the route planner: Leave now, Leave at a time, or
// Arrive by one, picked up to a week ahead. A picked time is { mode: 'leave' | 'arrive', at }
// with `at` Singapore's own clock, "2026-10-09T08:30"; Leave now is null.
//
// Also whether a bus or train is running at a moment. No timetables are published, so that's
// between the first and last bus LTA lists for that service at that stop, for that kind of
// day, and the hours trains run. Keep in step with api/_nav/when.js and the bot's when.py.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  // Public holidays run Sunday's buses. From MOM's lists; add each year's once it's out.
  const HOLIDAYS = new Set([
    '2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03', '2026-05-01',
    '2026-05-27', '2026-06-01', '2026-08-10', '2026-11-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-08', '2027-03-10', '2027-03-26', '2027-05-01',
    '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28', '2027-12-25',
  ]);

  // Trains run from about 5:30am (6am on Sundays and public holidays) to about midnight.
  const TRAIN_FIRST_MIN = { wd: 330, sat: 330, sun: 360 };
  const TRAIN_LAST_MIN = 1440;
  // A first bus can be waited for: a stop reached a little before it still gets on it.
  const FIRST_BUS_GRACE_MIN = 10;
  // The average wait for a bus, half the gap between them: what a clock time adds per bus
  // where there's no live timing to go on. The same as WAIT_MIN.B in api/_nav/router.js.
  const BUS_WAIT_MIN = 5;
  // Live timings reach about half an hour ahead, so they're only shown for a journey setting
  // off within this.
  const LIVE_WINDOW_MIN = 30;
  const DAYS_AHEAD = 7;
  const STEP_MIN = 5;
  // A time a minute or two behind is one picked just before the clock ticked over.
  const BEHIND_MS = 2 * 60000;

  const SG_OFFSET_MS = 8 * 3600 * 1000;
  const AT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
  const pad = (n) => String(n).padStart(2, '0');
  const DAY_OFFSET = { wd: 0, sat: 8, sun: 16 };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function atToMs(at) {
    const m = AT_RE.exec(at || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - SG_OFFSET_MS : null;
  }

  // A moment as Singapore's date, minute of the day and day of the week.
  function sgClock(ms) {
    const d = new Date(ms + SG_OFFSET_MS);
    return {
      ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      min: d.getUTCHours() * 60 + d.getUTCMinutes(),
      dow: d.getUTCDay(),
      day: d.getUTCDate(),
      month: d.getUTCMonth(),
    };
  }

  const msToAt = (ms) => {
    const c = sgClock(ms);
    return `${c.ymd}T${pad(Math.floor(c.min / 60))}:${pad(c.min % 60)}`;
  };

  function dayType(ymd, dow) {
    if (dow === 0 || HOLIDAYS.has(ymd)) return 'sun';
    return dow === 6 ? 'sat' : 'wd';
  }

  const hhmm = (s) => (/^\d{4}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(2)) : null);

  function inWindow(times, type, min) {
    const first = hhmm(times.slice(DAY_OFFSET[type], DAY_OFFSET[type] + 4));
    let last = hhmm(times.slice(DAY_OFFSET[type] + 4, DAY_OFFSET[type] + 8));
    if (first == null || last == null) return false;
    // A last bus before the first runs past midnight.
    if (last < first) last += 1440;
    return min >= first - FIRST_BUS_GRACE_MIN && min <= last;
  }

  // Whether a bus is running at a stop at a moment, from its 24-character first/last string
  // (see /api/bus-routes): within that day's hours, or the night before's when they run past
  // midnight. A stop with no times listed counts as running.
  function busRunsAt(times, ms) {
    if (!times || times.length < 24) return true;
    const today = sgClock(ms);
    const before = sgClock(ms - 86400000);
    return inWindow(times, dayType(today.ymd, today.dow), today.min) || inWindow(times, dayType(before.ymd, before.dow), today.min + 1440);
  }

  function trainRunsAt(ms) {
    const { ymd, dow, min } = sgClock(ms);
    return min >= TRAIN_FIRST_MIN[dayType(ymd, dow)] && min < TRAIN_LAST_MIN;
  }

  // Clearing immigration on a bus across the Causeway, Woodlands and the Johor Bahru
  // checkpoint together: getting off, through both, and on again. About 15 minutes when it's
  // quiet, an hour at the rush, and half an hour in the hour either side of one. `dir` is
  // 'out' (Singapore to Johor Bahru) or 'in', at a moment by Singapore's clock; Settings'
  // Immigration time can set its own instead (js/network.js). Public holidays count as
  // Sundays. Keep in step with api/_nav/when.js and the bot's when.py.
  const CUSTOMS_MIN = { quiet: 15, edge: 30, rush: 60 };
  const CUSTOMS_RUSH = {
    // Out: going home to Johor Bahru on weekday evenings, Friday nights, Saturday mornings.
    out: { wd: [[1020, 1260]], fri: [[960, 1440]], sat: [[360, 720]], sun: [] },
    // In: coming to work on weekday mornings, and back from the weekend on Sunday evenings.
    in: { wd: [[300, 540]], fri: [[300, 540]], sat: [], sun: [[900, 1440]] },
  };

  function customsMin(dir, ms) {
    const { ymd, dow, min } = sgClock(ms);
    const type = dayType(ymd, dow);
    let edge = false;
    for (const [from, to] of CUSTOMS_RUSH[dir][type === 'wd' && dow === 5 ? 'fri' : type]) {
      if (min >= from && min < to) return CUSTOMS_MIN.rush;
      if (min >= from - 60 && min < to + 60) edge = true;
    }
    return edge ? CUSTOMS_MIN.edge : CUSTOMS_MIN.quiet;
  }

  // ---- Reading a picked time ----

  const msOf = (when) => (when ? atToMs(when.at) : Date.now());

  // Why a picked time can't be planned for, or null when it can.
  function problem(when) {
    if (!when) return null;
    const ms = atToMs(when.at);
    if (ms == null) return 'Pick a day and a time.';
    if (ms < Date.now() - BEHIND_MS) return 'That time has already passed. Pick a later one, or Leave now.';
    if (ms > Date.now() + (DAYS_AHEAD + 1) * 86400000) return 'Pick a time within the next week.';
    return null;
  }

  // When a journey taking `minutes` sets off and gets in, as moments.
  function span(when, minutes) {
    const ms = msOf(when);
    return when?.mode === 'arrive' ? { leave: ms - minutes * 60000, arrive: ms } : { leave: ms, arrive: ms + minutes * 60000 };
  }

  // Minutes from now until setting off, when that's soon enough for live timings to say
  // which bus you'd catch; null otherwise.
  function liveLead(leaveMs) {
    const lead = (leaveMs - Date.now()) / 60000;
    return lead >= -1 && lead <= LIVE_WINDOW_MIN ? Math.max(0, lead) : null;
  }

  const clock = (ms) => {
    const { min } = sgClock(ms);
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  };

  // "today", "tomorrow" or "Sat 10 Oct", by Singapore's calendar.
  function dayLabel(ms) {
    const c = sgClock(ms);
    if (c.ymd === sgClock(Date.now()).ymd) return 'today';
    if (c.ymd === sgClock(Date.now() + 86400000).ymd) return 'tomorrow';
    return `${DOW[c.dow]} ${c.day} ${MONTHS[c.month]}`;
  }

  // A clock time with its day, unless that's today: "08:30", "08:30 tomorrow".
  const clockDay = (ms) => (dayLabel(ms) === 'today' ? clock(ms) : `${clock(ms)} ${dayLabel(ms)}`);

  // "Leave at 08:30 tomorrow", "Arrive by 09:00", or "Leave now".
  function describe(when) {
    if (!when) return 'Leave now';
    return `${when.mode === 'arrive' ? 'Arrive by' : 'Leave at'} ${clockDay(atToMs(when.at))}`;
  }

  // ---- In the address ----

  // "/arrive/2026-10-09T08:30" on the end of a #nav or #route link, or nothing for now.
  const hashPart = (when) => (when ? `/${when.mode}/${when.at}` : '');
  const HASH_RE_SOURCE = '(?:\\/(leave|arrive)\\/(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}))?';
  const fromHash = (mode, at) => (mode && at && atToMs(at) != null ? { mode, at } : null);

  // ---- The picker ----

  // Leave now / Leave at / Arrive by, and for the last two a day and a time, in `el`.
  // `onChange(when)` hears every change. Returns { get, set }.
  function picker(el, onChange) {
    el.classList.add('whenRow');
    el.innerHTML =
      `<div class="mode-toggle whenModes" role="group" aria-label="When">` +
      `<button type="button" class="mode-btn" data-when-mode="now">Leave now</button>` +
      `<button type="button" class="mode-btn" data-when-mode="leave">Leave at</button>` +
      `<button type="button" class="mode-btn" data-when-mode="arrive">Arrive by</button>` +
      `</div>` +
      `<div class="whenPick" hidden>` +
      `<select class="input" aria-label="Day"></select>` +
      `<input class="input" type="time" step="${STEP_MIN * 60}" aria-label="Time" />` +
      `</div>`;
    const pick = el.querySelector('.whenPick');
    const day = el.querySelector('select');
    const time = el.querySelector('input');
    let mode = 'now';

    // Today and the six days after it, named the way describe() names them.
    const fillDays = (keep) => {
      const today = Date.now();
      const days = Array.from({ length: DAYS_AHEAD }, (_, i) => today + i * 86400000);
      day.innerHTML = days.map((ms) => {
        const label = dayLabel(ms);
        return `<option value="${sgClock(ms).ymd}">${label[0].toUpperCase()}${label.slice(1)}</option>`;
      }).join('');
      if (keep && [...day.options].some((o) => o.value === keep)) day.value = keep;
    };

    const draw = () => {
      for (const btn of el.querySelectorAll('[data-when-mode]')) {
        const on = btn.dataset.whenMode === mode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
      }
      pick.hidden = mode === 'now';
    };

    const get = () => (mode === 'now' || !time.value ? null : { mode, at: `${day.value}T${time.value}` });

    function set(when) {
      mode = when ? when.mode : 'now';
      if (when) {
        const [ymd, hm] = when.at.split('T');
        fillDays(ymd);
        time.value = hm;
      }
      draw();
    }

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-when-mode]');
      if (!btn || btn.dataset.whenMode === mode) return;
      mode = btn.dataset.whenMode;
      // A first pick starts on the next five minutes, or half an hour on for Arrive by.
      if (mode !== 'now') {
        const keep = time.value && problem({ mode, at: `${day.value}T${time.value}` }) == null;
        if (!keep) {
          const step = STEP_MIN * 60000;
          const start = Math.ceil((Date.now() + (mode === 'arrive' ? 30 * 60000 : 0)) / step) * step;
          fillDays(sgClock(start).ymd);
          time.value = clock(start);
        } else {
          fillDays(day.value);
        }
      }
      draw();
      onChange(get());
    });
    day.addEventListener('change', () => onChange(get()));
    time.addEventListener('change', () => { if (time.value) onChange(get()); });

    set(null);
    return { get, set };
  }

  window.When = {
    BUS_WAIT_MIN,
    atToMs,
    msToAt,
    busRunsAt,
    trainRunsAt,
    customsMin,
    problem,
    span,
    liveLead,
    clock,
    clockDay,
    describe,
    hashPart,
    HASH_RE_SOURCE,
    fromHash,
    picker,
  };
})();
