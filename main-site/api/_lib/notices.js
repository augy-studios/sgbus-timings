// Bus and train notices: what LTA and the operators announce ahead of time, which no live
// feed carries. A road closed for a run, stops skipped till 8.30am, a new service, a train
// line closing early. Kept by a cron (api/notices.js, hourly) from:
//
// - LTA's announcements (lta.gov.sg's map, Announcements): its tables of Train Service
//   Adjustments, Bus Service and Bus Stop Changes, and Temporary Bus Service Changes, each
//   row a date (as people write them: "9 to 11 Oct 2026", "26 & 30 May 2026") and a notice,
//   usually a poster as a PDF.
// - Each operator's own news: SBS Transit, SMRT, Tower Transit and Go-Ahead Singapore, which
//   run the buses, and SBS Transit and SMRT the trains as well.
//
// LTA's notices are read too (readDoc): a PDF's text (unpdf) or a page's, for the buses and
// stops it names, checked against the route list so a "2026" isn't taken for a bus. A poster
// of skipped stops is a table, which comes out of the PDF as its cells in order: each stop's
// code, then the buses that skip it and for how long, written once for a run of stops that
// share them. So each stop takes the last buses and hours written before it (stopsOf).
//
// A notice: { id, source, kind, title, url, dates, from, to, days, published, seen, modes,
// services, stops, codes }. `kind` is "temporary", "change", "train" or "news"; `from` and
// `to` are Singapore dates, "2026-10-25", and `days` the dates themselves when it's on some
// days and not those between ("26 & 30 May"). `stops` is { code: { services, when } } where a
// poster lists them, and `codes` every stop it names.

import { createHash } from "node:crypto";
import { redis, storeConfigured } from "../_push/store.js";

const KEY = "sgbus:notices";
const DOC_KEY = "sgbus:notices:doc";
// A notice's reading is kept this long, so each is fetched and read once.
const DOC_TTL_S = 90 * 24 * 3600;
// Read at most this many new notices a run, a few at a time; the rest wait for the next.
const DOCS_PER_RUN = 24;
const DOCS_AT_ONCE = 4;
// Older than this, a notice that's over isn't kept, nor news.
const KEEP_PAST_DAYS = 14;
const NEWS_DAYS = 60;
const UA = "Mozilla/5.0 (compatible; sgbus-timings; +https://sgbus.uwuapps.org)";

const SOURCES = {
  lta: { name: "LTA", url: "https://www.lta.gov.sg/content/ltagov/en/map/announcement.html" },
  sbs: { name: "SBS Transit", url: "https://www.sbstransit.com.sg/news" },
  smrt: { name: "SMRT", url: "https://www.smrt.com.sg/news-publications/newsroom/service-announcements/" },
  tower: { name: "Tower Transit", url: "https://www.towertransit.sg/announcements" },
  goahead: { name: "Go-Ahead Singapore", url: "https://go-aheadsingapore.com/announcements/" },
};
export const SOURCE_NAMES = Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v.name]));

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const SG_MS = 8 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const sgToday = (now = Date.now()) => new Date(now + SG_MS).toISOString().slice(0, 10);

const ENTITIES = { amp: "&", nbsp: " ", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">", "#8211": "–", "#8217": "’", "#8216": "‘", "#038": "&" };
const decode = (s) => String(s).replace(/&(#?\w+);/g, (m, e) => ENTITIES[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCharCode(Number(e.slice(1))) : m));
const text = (html) => decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const absolute = (href, base) => new URL(decode(href), base).href;
const idOf = (url) => createHash("sha1").update(url).digest("hex").slice(0, 12);

async function get(url, { binary = false } = {}) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: binary ? "*/*" : "text/html" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!res.ok) throw new Error(`${url} replied ${res.status}`);
  return binary ? { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "" } : res.text();
}

// ---------- dates, as people write them ----------

// "25 Oct 2026", "9 to 11 Oct 2026", "19 Jun to 30 Oct 2026", "26 & 30 May 2026", "11, 18 &
// 25 July", "From 1 Nov 2026": { from, to, days }, or nulls where it can't be read. A day
// without a month takes the next month written, and a month without a year the next year
// written, or else the year that puts it nearest today.
export function parseDates(raw, now = Date.now()) {
  const s = decode(raw).replace(/\s+/g, " ").trim();
  const tokens = [...s.matchAll(/(\d{1,2})(?:st|nd|rd|th)?(?:\s+([A-Za-z]{3,9})\.?)?(?:\s+(\d{4}))?|(\bto\b|–|-|&|,|\band\b|\bfrom\b|\buntil\b|\btill\b)/gi)];
  const parts = [];
  for (const t of tokens) {
    if (t[4]) parts.push({ sep: t[4].toLowerCase() });
    else {
      const month = t[2] ? MONTHS[t[2].slice(0, 4).toLowerCase()] ?? MONTHS[t[2].slice(0, 3).toLowerCase()] : null;
      if (t[2] && !month) continue;
      parts.push({ day: Number(t[1]), month, year: t[3] ? Number(t[3]) : null });
    }
  }
  const dates = parts.filter((p) => p.day);
  if (!dates.length) return { from: null, to: null, days: null };
  for (let i = dates.length - 2; i >= 0; i--) {
    dates[i].month ??= dates[i + 1].month;
    dates[i].year ??= dates[i + 1].month === dates[i].month || !dates[i].year ? dates[i + 1].year : dates[i].year;
  }
  const today = new Date(now + SG_MS);
  for (const d of dates) {
    if (!d.month) return { from: null, to: null, days: null };
    if (!d.year) {
      // The year that puts it nearest today.
      const y = today.getUTCFullYear();
      const near = [y - 1, y, y + 1].map((yy) => [yy, Math.abs(Date.UTC(yy, d.month - 1, d.day) - today.getTime())]).sort((a, b) => a[1] - b[1]);
      d.year = near[0][0];
    }
  }
  const iso = dates.map((d) => ymd(d.year, d.month, d.day));
  const ranged = parts.some((p) => ["to", "–", "-", "until", "till"].includes(p.sep));
  const open = /^\s*from\b/i.test(s) && dates.length === 1;
  if (open) return { from: iso[0], to: null, days: null };
  if (ranged && iso.length === 2) return { from: iso[0], to: iso[1], days: null };
  const sorted = [...iso].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1], days: sorted.length > 1 ? sorted : null };
}

// "October 22, 2026", "22 Oct 2026": "2026-10-22", or null.
function dateOf(raw) {
  const s = decode(raw);
  let m = s.match(/([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return ymd(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(/(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{4})/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return ymd(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  return null;
}

// Whether a notice is on, on a date ("2026-10-25").
export function onDate(n, date) {
  if (n.days) return n.days.includes(date);
  if (!n.from) return false;
  return n.from <= date && (n.to == null || date <= n.to);
}

// ---------- each source's list ----------

const modesOf = (title, tags = "") => {
  const t = `${title} ${tags}`;
  const train = /\b(train|mrt|lrt|line|station|ewl|nsl|nel|ccl|dtl|tel|bplrt|sklrt|pglrt)\b/i.test(t);
  const bus = /\b(bus|service|svc|interchange|stops?|route|diversion|berths?)\b/i.test(t) || /\b\d{1,3}[A-Z]?\b/.test(t);
  return [...(bus || !train ? ["bus"] : []), ...(train ? ["train"] : [])];
};

async function ltaList() {
  const html = await get(SOURCES.lta.url);
  const out = [];
  // Its tables in turn, each under its heading.
  const parts = html.split(/<h5[^>]*>/i).slice(1);
  for (const part of parts) {
    const head = text(part.split(/<\/h5>/i)[0]).toLowerCase();
    const kind = /temporary/.test(head) ? "temporary" : /train/.test(head) ? "train" : "change";
    for (const row of part.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
      const link = row[2].match(/href="([^"]+)"/i);
      const title = text(row[2]);
      const dates = text(row[1]);
      if (!link || !title || /^date/i.test(dates)) continue;
      const when = parseDates(dates);
      // A lasting change on a date (a new service from 25 Oct) is on from then, not that day only.
      if (kind === "change" && !when.days && when.from === when.to) when.to = null;
      out.push({ source: "lta", kind, title, url: absolute(link[1], SOURCES.lta.url), dates, ...when, modes: kind === "train" ? ["train"] : ["bus"] });
    }
  }
  return out;
}

async function sbsList() {
  const html = await get(SOURCES.sbs.url);
  const out = [];
  // Month by month, each item its day of the month.
  for (const block of html.split(/<h4 class="panel-title">/i).slice(1)) {
    const month = text(block.split(/<\/h4>/i)[0]);
    const mm = month.match(/([A-Za-z]+) (\d{4})/);
    for (const a of block.matchAll(/<a href="(\/news\/[^"]+)">\s*<span class="number">(\d{1,2})<\/span>\s*<span class="text">([\s\S]*?)<\/span>/gi)) {
      const title = text(a[3]);
      const m = mm && MONTHS[mm[1].slice(0, 3).toLowerCase()];
      out.push({ source: "sbs", kind: "news", title, url: absolute(a[1], SOURCES.sbs.url), published: m ? ymd(+mm[2], m, +a[2]) : null, modes: modesOf(title) });
    }
  }
  return out;
}

async function smrtList() {
  const html = await get(SOURCES.smrt.url);
  const out = [];
  for (const a of html.matchAll(/<a href="([^"]*service-announcements\/[^"]+)">([\s\S]*?)<\/a>/gi)) {
    const date = a[2].match(/latestNewsCardDate">([^<]+)</i);
    const title = a[2].match(/latestNewsCardTitle">([\s\S]*?)<\/div>/i);
    if (!title) continue;
    const tags = [...a[2].matchAll(/latestNewsChip[^>]*>([^<]+)</gi)].map((t) => t[1].trim()).join(" ");
    const t = text(title[1]);
    out.push({ source: "smrt", kind: "news", title: t, url: absolute(a[1], SOURCES.smrt.url), published: date ? dateOf(date[1]) : null, modes: modesOf(t, tags) });
  }
  return out;
}

async function towerList() {
  const html = await get(SOURCES.tower.url);
  const out = [];
  for (const a of html.matchAll(/<a href="(\/announcements\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const all = text(a[2]);
    const date = dateOf(all);
    // Its dates come first, published then updated, then its title.
    const title = all.replace(/^([A-Za-z]+ \d{1,2}, \d{4}\s*)+/, "").trim();
    if (!title) continue;
    out.push({ source: "tower", kind: "news", title, url: absolute(a[1], SOURCES.tower.url), published: date, modes: modesOf(title) });
  }
  return out;
}

async function goaheadList() {
  const html = await get(SOURCES.goahead.url);
  const out = [];
  for (const art of html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)) {
    const head = art[1].match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    if (!head) continue;
    const title = text(head[1]);
    const link = head[1].match(/href="([^"]+)"/i) || art[1].match(/href="(https:\/\/go-aheadsingapore\.com\/(?!topics\/)[^"]+)"/i);
    if (!title || !link) continue;
    out.push({ source: "goahead", kind: "news", title, url: absolute(link[1], SOURCES.goahead.url), published: dateOf(art[1]), modes: modesOf(title) });
  }
  return out;
}

const LISTS = { lta: ltaList, sbs: sbsList, smrt: smrtList, tower: towerList, goahead: goaheadList };

// ---------- reading a notice ----------

// A poster's stops, from its table's cells in order (see the top): { code: { services, when } }.
// Only where buses follow a stop's code, as they do in a table of skipped stops.
const WHEN_RE = /((?:first bus|last bus|\d{1,2}(?:[.:]\d{2})?\s*[ap]\.?m\.?)\s*(?:to|till|until|-|–)\s*(?:first bus|last bus|\d{1,2}(?:[.:]\d{2})?\s*[ap]\.?m\.?)|all day|whole day)/i;
function stopsOf(body, known) {
  const stops = {};
  let services = null;
  let when = null;
  let any = false;
  const codes = [...body.matchAll(/\b(\d{5})\b/g)].filter((m) => known.stops.has(m[1]));
  codes.forEach((m, k) => {
    const after = body.slice(m.index + 5, codes[k + 1]?.index ?? body.length);
    const list = after.match(/^\s*((?:\d{1,3}[A-Za-z]?\*?\s*(?:,|&|and)\s*)*\d{1,3}[A-Za-z]?\*?)/);
    const found = list ? list[1].split(/,|&|and/).map((x) => x.replace(/\*/g, "").trim().toUpperCase()).filter((x) => known.services.has(x)) : [];
    if (found.length) {
      services = found;
      any = true;
    }
    const w = after.match(WHEN_RE);
    if (w) when = w[1].replace(/\s+/g, " ");
    if (services) stops[m[1]] = { services, ...(when && { when }) };
  });
  return any ? stops : null;
}

// What a notice's PDF or page says: { services, stops, codes }, by the route list (`known`).
async function readDoc(url, known) {
  const got = await get(url, { binary: true });
  let body;
  if (/pdf/i.test(got.type) || /\.pdf($|\?)/i.test(url)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(got.bytes);
    body = (await extractText(pdf, { mergePages: true })).text;
  } else {
    body = text(new TextDecoder().decode(got.bytes).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
  }
  body = String(body).replace(/\s+/g, " ");
  const stops = stopsOf(body, known);
  const codes = [...new Set([...body.matchAll(/\b(\d{5})\b/g)].map((m) => m[1]).filter((c) => known.stops.has(c)))];
  return { services: servicesIn(body, known, stops), stops, codes };
}

// The buses a notice names. Not every number in it: a time ("7.30am"), a date or a phone number
// would pass for one. Only the buses in its table of stops, lists of two or more buses ("56,
// 77, 97, 106"), and those after "Service" or "Services".
const BUS = String.raw`\d{1,3}[A-Za-z]?\*?`;
const SEP = String.raw`\s*(?:,|&|and|/)\s*`;
// Not a list of dates ("3, 4, 10 & 11 Jan") or of times.
const LIST_RE = new RegExp(String.raw`(?<![\d.:/])${BUS}(?:${SEP}${BUS})+(?![\d.:]|\s*(?:am|pm|[ap]\.m|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))`, "gi");
const NAMED_RE = new RegExp(String.raw`\b(?:services?|svcs?|bus(?:es)?|cds)\s+(${BUS}(?:${SEP}${BUS})*)`, "gi");
const busesIn = (list, known) => list.split(/,|&|and|\//).map((x) => x.replace(/\*/g, "").trim().toUpperCase()).filter((x) => known.services.has(x));
function servicesIn(body, known, stops) {
  const found = new Set(Object.values(stops || {}).flatMap((s) => s.services));
  for (const m of body.matchAll(LIST_RE)) {
    const buses = busesIn(m[0], known);
    if (buses.length >= 2) buses.forEach((b) => found.add(b));
  }
  for (const m of body.matchAll(NAMED_RE)) busesIn(m[1], known).forEach((b) => found.add(b));
  return [...found];
}

// The buses named in a title: "Services 80, 86, 87, 372 and 374", "New Service 873/873M".
function servicesInTitle(title, known) {
  if (!/\b(service|services|svc|svcs|bus|buses|cds)\b/i.test(title)) return [];
  return [...new Set([...title.matchAll(/\b(\d{1,3}[A-Za-z]?)\b/g)].map((m) => m[1].toUpperCase()).filter((s) => known.services.has(s)))];
}

// ---------- the refresh ----------

async function knownLists(origin) {
  const [stops, routes] = await Promise.all([
    fetch(`${origin}/api/bus-stops`).then((r) => r.json()),
    fetch(`${origin}/api/bus-routes`).then((r) => r.json()),
  ]);
  return { stops: new Set(stops.map((s) => s.c)), services: new Set(Object.keys(routes.services || {}).map((s) => s.toUpperCase())) };
}

const worthReading = (n, today) => n.source === "lta" && n.kind !== "train" && (n.to == null ? !n.from || n.from >= addDays(today, -KEEP_PAST_DAYS) : n.to >= today);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// Fetches every source, reads what's new, and keeps it. Answers what it did, in numbers.
export async function refreshNotices(origin, now = Date.now()) {
  const today = sgToday(now);
  const had = await getNotices();
  const old = had || { items: [] };
  const oldById = new Map(old.items.map((n) => [n.id, n]));
  const known = await knownLists(origin);
  const lists = await Promise.allSettled(Object.entries(LISTS).map(async ([source, list]) => [source, await list()]));
  const items = [];
  const failed = [];
  lists.forEach((r, i) => {
    const source = Object.keys(LISTS)[i];
    // A source that's down keeps what was last had from it.
    if (r.status === "rejected" || !r.value[1].length) {
      failed.push(source);
      items.push(...old.items.filter((n) => n.source === source));
      return;
    }
    for (const n of r.value[1]) {
      const id = idOf(n.url + n.title);
      const was = oldById.get(id);
      items.push({ ...n, id, seen: was?.seen ?? now, services: was?.services ?? servicesInTitle(n.title, known), stops: was?.stops ?? null, codes: was?.codes ?? [], read: was?.read ?? false });
    }
  });

  // Read what hasn't been, newest first, a few at a time.
  const unread = items.filter((n) => !n.read && worthReading(n, today)).slice(0, DOCS_PER_RUN);
  let read = 0;
  for (let i = 0; i < unread.length; i += DOCS_AT_ONCE) {
    await Promise.all(unread.slice(i, i + DOCS_AT_ONCE).map(async (n) => {
      const docKey = `${DOC_KEY}:${idOf(n.url)}`;
      try {
        let doc = JSON.parse((await kept("GET", docKey)) || "null");
        if (!doc) {
          doc = await readDoc(n.url, known);
          await kept("SET", docKey, JSON.stringify(doc), "EX", String(DOC_TTL_S));
        }
        n.services = [...new Set([...n.services, ...doc.services])];
        n.stops = doc.stops;
        n.codes = doc.codes;
        read++;
      } catch (err) {
        console.warn(`notices: couldn't read ${n.url}: ${err.message}`);
      }
      n.read = true;
    }));
  }

  // Not what's long over: a notice ended a fortnight ago, or news from two months back.
  const keep = items.filter((n) => {
    if (n.kind === "news") return (n.published ?? sgToday(n.seen)) >= addDays(today, -NEWS_DAYS);
    const end = n.to ?? n.days?.at(-1) ?? n.from;
    return !end || end >= addDays(today, -KEEP_PAST_DAYS);
  });
  const fresh = { at: now, items: keep };
  await kept("SET", KEY, JSON.stringify(fresh));
  memo = { notices: fresh, at: Date.now() };
  // The first run only takes note of what's there, so it isn't all announced as new.
  return { items: keep.length, read, failed, new: had ? keep.filter((n) => !oldById.has(n.id)) : [] };
}

// Whether a notice changes a bus or train service, for the newsfeed's 'disruptions': all of
// LTA's, and the operators' diversions, closures and the like, not their fares or awards.
export function changesService(n) {
  if (n.source === "lta") return true;
  return /divers|clos|skip|servic|stop|route|berth|shuttle|disrupt|extend|extension|operating hours|last (bus|train)|relocat|amend|adjust|new (bus|short|peak|service)|interchange|terminal/i.test(n.title) &&
    !/fare|award|recruit|career|contract|campaign|trial|winner|appoint/i.test(n.title);
}

// The notification for new notices: one, whatever the number, with the first few.
export function newsfeedNotification(items) {
  const first = items[0];
  const from = (n) => (n.source === "lta" ? "LTA" : SOURCE_NAMES[n.source]);
  if (items.length === 1) return { title: `Newsfeed: ${from(first)}`, body: `${first.title}${first.dates ? ` (${first.dates})` : ""}` };
  return {
    title: `Newsfeed: ${items.length} new notices`,
    body: items.slice(0, 3).map((n) => `${from(n)}: ${n.title}`).join("\n") + (items.length > 3 ? `\nAnd ${items.length - 3} more.` : ""),
  };
}

// Redis, as a nicety rather than a need: without it (not set up, down, or out of requests), the
// notices are read afresh and kept in this instance's memory instead. Null on any failure.
let storeDown = false;
async function kept(...command) {
  if (!storeConfigured()) return null;
  try {
    const result = await redis(...command);
    storeDown = false;
    return result;
  } catch (err) {
    if (!storeDown) console.warn("notices: the store's not answering, so they're kept in memory:", err.message);
    storeDown = true;
    return null;
  }
}

let memo = null;
// They change hourly, so an instance needn't ask the store more often than this.
const MEMO_MS = 10 * 60 * 1000;

// The notices as last kept: in this instance's memory, or Redis. A failed read of Redis keeps
// what memory had.
export async function getNotices() {
  if (memo?.notices && Date.now() - memo.at < MEMO_MS) return memo.notices;
  const stored = JSON.parse((await kept("GET", KEY)) || "null");
  const notices = stored && (!memo?.notices || stored.at >= memo.notices.at) ? stored : memo?.notices ?? null;
  memo = { notices, at: Date.now() };
  return notices;
}

// Older than this, what's kept is read afresh when asked for, as the hourly refresh can't have
// run (or kept it).
const STALE_MS = 2 * 3600 * 1000;
let reading = null;

// The notices for a page: as kept, or read now if there are none or they're stale. One read at
// a time per instance.
export async function noticesNow(origin) {
  const had = await getNotices();
  if (had?.at && Date.now() - had.at < STALE_MS) return had;
  reading ??= refreshNotices(origin).catch((err) => console.warn("notices: couldn't read them:", err.message)).finally(() => { reading = null; });
  await reading;
  return (await getNotices()) || had;
}
