// When a journey is for: Leave now, Leave at a time, or Arrive by one, and whether a bus or
// train is running then. Keep in step with js/when.js and the Telegram bot's when.py.
//
// No timetables are published, so "running" means between the first and last bus LTA lists
// for that service at that stop, for that kind of day, and between the hours trains run.
// A time is Singapore's own clock, written "2026-10-09T08:30".

// Public holidays run Sunday's buses. From MOM's lists; add each year's once it's out.
export const HOLIDAYS = new Set([
  "2026-01-01", "2026-02-17", "2026-02-18", "2026-03-21", "2026-04-03", "2026-05-01",
  "2026-05-27", "2026-06-01", "2026-08-10", "2026-11-09", "2026-12-25",
  "2027-01-01", "2027-02-06", "2027-02-08", "2027-03-10", "2027-03-26", "2027-05-01",
  "2027-05-17", "2027-05-20", "2027-08-09", "2027-10-28", "2027-12-25",
]);

// Trains run from about 5:30am (6am on Sundays and public holidays) to about midnight.
const TRAIN_FIRST_MIN = { wd: 330, sat: 330, sun: 360 };
const TRAIN_LAST_MIN = 1440;
// A first bus can be waited for: a stop reached a little before it still gets on it.
const FIRST_BUS_GRACE_MIN = 10;

const SG_OFFSET_MS = 8 * 3600 * 1000;
const AT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

// "2026-10-09T08:30" as a moment, or null when it isn't one.
export function atToMs(at) {
  const m = AT_RE.exec(at || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - SG_OFFSET_MS : null;
}

// A moment as Singapore's date and minute of the day.
export function sgClock(ms) {
  const d = new Date(ms + SG_OFFSET_MS);
  return { ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}

function dayType(ymd, dow) {
  if (dow === 0 || HOLIDAYS.has(ymd)) return "sun";
  return dow === 6 ? "sat" : "wd";
}

const DAY_OFFSET = { wd: 0, sat: 8, sun: 16 };
const hhmm = (s) => (/^\d{4}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(2)) : null);

// Whether `min` minutes into a day of this type falls within the 24-character first/last
// string (see /api/bus-routes). A last bus before the first runs past midnight.
function inWindow(times, type, min) {
  const first = hhmm(times.slice(DAY_OFFSET[type], DAY_OFFSET[type] + 4));
  let last = hhmm(times.slice(DAY_OFFSET[type] + 4, DAY_OFFSET[type] + 8));
  if (first == null || last == null) return false;
  if (last < first) last += 1440;
  return min >= first - FIRST_BUS_GRACE_MIN && min <= last;
}

// Whether a bus is running at a stop at a moment: within that day's hours, or the night
// before's when they run past midnight. A stop with no times listed counts as running.
export function busRunsAt(times, ms) {
  if (!times || times.length < 24) return true;
  const today = sgClock(ms);
  const before = sgClock(ms - 86400000);
  return inWindow(times, dayType(today.ymd, today.dow), today.min) || inWindow(times, dayType(before.ymd, before.dow), today.min + 1440);
}

// When the last bus of the service running at `ms` leaves the stop, as a moment: that day's,
// or the night before's when its last runs past midnight. Null when it isn't running then, or
// the stop has no times listed.
export function lastBusAfter(times, ms) {
  if (!times || times.length < 24) return null;
  for (const back of [0, 1]) {
    const day = sgClock(ms - back * 86400000);
    const type = dayType(day.ymd, day.dow);
    const min = sgClock(ms).min + back * 1440;
    if (!inWindow(times, type, min)) continue;
    const first = hhmm(times.slice(DAY_OFFSET[type], DAY_OFFSET[type] + 4));
    let last = hhmm(times.slice(DAY_OFFSET[type] + 4, DAY_OFFSET[type] + 8));
    if (last < first) last += 1440;
    return ms + (last - min) * 60000;
  }
  return null;
}

export function trainRunsAt(ms) {
  const { ymd, dow, min } = sgClock(ms);
  return min >= TRAIN_FIRST_MIN[dayType(ymd, dow)] && min < TRAIN_LAST_MIN;
}

// Clearing immigration on a bus across the Causeway, Woodlands and the Johor Bahru checkpoint
// together: getting off, through both, and on again. About 15 minutes when it's quiet, an hour
// at the rush, and half an hour in the hour either side of one. `dir` is "out" (Singapore to
// Johor Bahru) or "in", at a moment by Singapore's clock. Public holidays count as Sundays.
// Keep in step with js/when.js and the Telegram bot's when.py.
export const CUSTOMS_MIN = { quiet: 15, edge: 30, rush: 60 };
const CUSTOMS_RUSH = {
  // Out: going home to Johor Bahru on weekday evenings, Friday nights, Saturday mornings.
  out: { wd: [[1020, 1260]], fri: [[960, 1440]], sat: [[360, 720]], sun: [] },
  // In: coming to work on weekday mornings, and back from the weekend on Sunday evenings.
  in: { wd: [[300, 540]], fri: [[300, 540]], sat: [], sun: [[900, 1440]] },
};

export function customsMin(dir, ms) {
  const { ymd, dow, min } = sgClock(ms);
  const type = dayType(ymd, dow);
  let edge = false;
  for (const [from, to] of CUSTOMS_RUSH[dir][type === "wd" && dow === 5 ? "fri" : type]) {
    if (min >= from && min < to) return CUSTOMS_MIN.rush;
    if (min >= from - 60 && min < to + 60) edge = true;
  }
  return edge ? CUSTOMS_MIN.edge : CUSTOMS_MIN.quiet;
}

// The journey's time from a request: { mode: "now" | "leave" | "arrive", ms }, where ms is
// the moment to leave at or arrive by (now, for Leave now). Null when it can't be read.
export function readWhen(mode, at, now = Date.now()) {
  if (!mode || mode === "now") return { mode: "now", ms: now };
  if (mode !== "leave" && mode !== "arrive") return null;
  const ms = atToMs(at);
  return ms == null ? null : { mode, ms };
}
