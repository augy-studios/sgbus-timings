// Navigate's short share links, kept in Supabase's share_links table (SHARE-LINKS-SETUP.md).
// Three kinds, each with its own path, as Citymapper has them:
//
//   place       /go/<id>    "How to get to" one place: opened, it's Navigate's To, from
//                           wherever the person opening it is.
//   directions  /trip/<id>  Both ends of a nav, its time, and the way that was open.
//   eta         /eta/<id>   Live progress on a trip (js/trip.js): when you'll arrive and how
//                           far along you are, updated by the sharer's app as it goes.
//
// The id is ten letters and digits. A place or directions link is the same link every time
// the same thing is shared (dedupe_key); an ETA link is new each time, and only the app that
// made it can update it, with the secret it was given (kept here only as a hash).
//
// Used by api/share.js (make, read, update), api/share-page.js (the page a link opens, with
// its preview for chat apps) and api/share-map.js (the map in that preview and the app).

import { createHash, randomBytes } from 'node:crypto';
import { rest } from './supabase.js';

const TABLE = 'share_links';
export const PATHS = { place: 'go', directions: 'trip', eta: 'eta' };
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_RE = /^[a-z0-9]{10}$/;

// An ETA link lasts this long after its last update, and this long once the trip's over.
const ETA_TTL_MS = 3 * 60 * 60 * 1000;
const ETA_ENDED_TTL_MS = 60 * 60 * 1000;

export class ValidationError extends Error {}

export const isLinkId = (id) => typeof id === 'string' && ID_RE.test(id);

function newId() {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------- checking what's sent ----------

function text(v, max, { required = false } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError('missing text');
    return '';
  }
  if (typeof v !== 'string') throw new ValidationError('bad text');
  return v.trim().slice(0, max);
}

// Singapore, with some sea around it.
function point(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 1.1 || lat > 1.5 || lng < 103.5 || lng > 104.2) {
    throw new ValidationError('a place outside Singapore');
  }
  return [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5];
}

function place(p) {
  if (!p || typeof p !== 'object') throw new ValidationError('bad place');
  const [lat, lng] = point(p.lat, p.lng);
  return { label: text(p.label, 120, { required: true }), lat, lng };
}

// Either end of a nav: a place, or "here" for wherever the person opening the link is.
const end = (p) => (p === 'here' ? 'here' : place(p));

function path(points, max) {
  if (points == null) return null;
  if (!Array.isArray(points)) throw new ValidationError('bad path');
  return points.slice(0, max).map((p) => {
    if (!Array.isArray(p)) throw new ValidationError('bad path');
    return point(p[0], p[1]);
  });
}

function when(w) {
  if (w == null) return null;
  if ((w.mode !== 'leave' && w.mode !== 'arrive') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(w.at)) throw new ValidationError('bad time');
  return { mode: w.mode, at: w.at };
}

function int(v, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) throw new ValidationError('bad number');
  return v;
}

export function parseLink(kind, data, now = Date.now()) {
  if (!data || typeof data !== 'object') throw new ValidationError('missing data');
  if (kind === 'place') return place(data);
  if (kind === 'directions') {
    const out = {
      from: end(data.from),
      to: end(data.to),
      when: when(data.when),
      // The way that was open (wayKey in js/nav.js), picked again when the link is opened.
      way: data.way == null ? null : text(data.way, 300),
      summary: text(data.summary, 160),
      path: path(data.path, 400),
    };
    if (out.from === 'here' && out.to === 'here') throw new ValidationError('both ends are "here"');
    return out;
  }
  if (kind === 'eta') return parseEta(data, now);
  throw new ValidationError('bad kind');
}

function parseEta(data, now) {
  if (!Number.isFinite(data.arriveAt) || Math.abs(data.arriveAt - now) > 24 * 60 * 60 * 1000) throw new ValidationError('bad arrival time');
  const leg = data.leg == null ? null : {
    label: text(data.leg.label, 40),
    to: text(data.leg.to, 120),
    stopsLeft: int(data.leg.stopsLeft, 0, 500),
  };
  return {
    name: text(data.name, 64),
    to: place(data.to),
    arriveAt: Math.round(data.arriveAt),
    leg,
    legIndex: int(data.legIndex ?? 0, 0, 20),
    legCount: int(data.legCount ?? 1, 1, 20),
    at: data.at == null ? null : point(data.at[0], data.at[1]),
    path: path(data.path, 400),
    // Arrived, or the trip ended; or the sharer stopped sharing before then.
    ended: Boolean(data.ended),
    stopped: Boolean(data.stopped),
  };
}

// ---------- the table ----------

// A link for this, made now or the one made before for the same thing. Answers { id } and,
// for an ETA link, the secret its updates need.
export async function createLink(kind, data, now = Date.now()) {
  if (kind === 'eta') {
    // Tidied as new ones are made, so the table doesn't fill with trips long over.
    await rest(`${TABLE}?expires_at=lt.${new Date(now).toISOString()}`, { method: 'DELETE', prefer: 'return=minimal' }).catch((err) => console.warn(err));
    const secret = randomBytes(18).toString('base64url');
    const id = await insert({ kind, data, secret_hash: sha256(secret), expires_at: etaExpiry(data, now) });
    return { id, secret };
  }
  const dedupeKey = sha256(`${kind}\n${JSON.stringify(data)}`);
  const found = await findByKey(dedupeKey);
  if (found) return { id: found };
  try {
    return { id: await insert({ kind, data, dedupe_key: dedupeKey }) };
  } catch (err) {
    // Shared twice at once: the other made it first.
    if (err.code === '23505') {
      const again = await findByKey(dedupeKey);
      if (again) return { id: again };
    }
    throw err;
  }
}

async function findByKey(dedupeKey) {
  const rows = await rest(`${TABLE}?dedupe_key=eq.${dedupeKey}&select=id&limit=1`);
  return rows?.[0]?.id || null;
}

// Retried on the one-in-billions chance of an id already taken.
async function insert(row) {
  for (let tries = 0; ; tries++) {
    const id = newId();
    try {
      await rest(TABLE, { method: 'POST', body: { id, ...row }, prefer: 'return=minimal' });
      return id;
    } catch (err) {
      if (err.code !== '23505' || row.dedupe_key || tries >= 2) throw err;
    }
  }
}

const etaExpiry = (data, now) => new Date(now + (data.ended ? ETA_ENDED_TTL_MS : ETA_TTL_MS)).toISOString();

// The link, or null when there's none or it has expired.
export async function getLink(id, now = Date.now()) {
  const rows = await rest(`${TABLE}?id=eq.${id}&select=kind,data,updated_at,expires_at&limit=1`);
  const row = rows?.[0];
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) < now) return null;
  return { id, kind: row.kind, data: row.data, updatedAt: Date.parse(row.updated_at) };
}

// An ETA link's new progress. Says whether it was updated: false for a wrong secret, a link
// that's gone, or, with `quietFor` (ms), one updated more recently than that. The cron sends
// that (api/push/trip-poll.js), so it only takes over once the app has gone quiet.
export async function updateEta(id, secret, data, now = Date.now(), { quietFor = 0 } = {}) {
  if (typeof secret !== 'string' || !secret) return false;
  const quiet = quietFor ? `&updated_at=lt.${new Date(now - quietFor).toISOString()}` : '';
  const rows = await rest(
    `${TABLE}?id=eq.${id}&kind=eq.eta&secret_hash=eq.${sha256(secret)}&expires_at=gt.${new Date(now).toISOString()}${quiet}&select=id`,
    {
      method: 'PATCH',
      body: { data, updated_at: new Date(now).toISOString(), expires_at: etaExpiry(data, now) },
      prefer: 'return=representation',
    }
  );
  return Array.isArray(rows) && rows.length > 0;
}

// ---------- an ETA from the Get Off Alert's background trip ----------
// What the app's Trip.progress (js/trip.js) works out, from where the cron has the trip
// (api/_push/trip.js): the rest of this ride by how far along it is, the wait for the bus if
// it hasn't come, the walk after it, and every ride after that with its wait and walk.
// Keep in step with progress() in js/trip.js.

const along = (points, pos) => {
  const i = Math.min(points.length - 1, Math.floor(pos));
  const j = Math.min(points.length - 1, i + 1);
  const f = pos - i;
  return [points[i][0] + (points[j][0] - points[i][0]) * f, points[i][1] + (points[j][1] - points[i][1]) * f];
};

export function etaFromTrip(trip, now, { ended = false } = {}) {
  const { share, legs } = trip;
  const leg = legs[trip.leg];
  const last = leg.points.length - 1;
  const pos = Math.min(last, Math.max(trip.est ?? 0, trip.pos || 0, trip.at || 0));
  let minutes = leg.minutes * (1 - pos / Math.max(1, last)) + (leg.walkAfter || 0);
  if (pos < 0.5 && trip.clockRuns === false) {
    const due = trip.anchor?.t ?? trip.legStartedAt + (leg.wait || 0) * 60000;
    minutes += Math.max(0, due - now) / 60000;
  }
  for (const l of legs.slice(trip.leg + 1)) minutes += (l.wait || 0) + l.minutes + (l.walkAfter || 0);
  return {
    name: share.name || '',
    to: share.to,
    arriveAt: Math.round(now + (ended ? 0 : minutes * 60000)),
    leg: { label: leg.label || (leg.kind === 'train' ? 'Train' : `Bus ${leg.service || ''}`.trim()), to: leg.to, stopsLeft: Math.max(0, Math.round(last - pos)) },
    legIndex: trip.leg,
    legCount: legs.length,
    at: point(...along(leg.points, pos)),
    path: legs.flatMap((l) => l.points).slice(0, 400).map(([lat, lng]) => point(lat, lng)),
    ended,
  };
}

// ---------- how a link reads ----------

const endLabel = (p) => (p === 'here' ? 'Your location' : p.label);

const sgClock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' });

// The title and line under it, for the page's preview in a chat app.
export function describeLink(link) {
  const { kind, data } = link;
  if (kind === 'place') {
    return { title: `How to get to: ${data.label}`, description: 'Directions by bus and train from wherever you are, on SG Bus Timings.' };
  }
  if (kind === 'directions') {
    return {
      title: `${endLabel(data.from)} to ${endLabel(data.to)}`,
      description: data.summary || 'Directions by bus and train, on SG Bus Timings.',
    };
  }
  const who = data.name || 'Someone';
  if (data.stopped) return { title: `${who} stopped sharing their trip to ${data.to.label}`, description: 'Live progress on SG Bus Timings.' };
  return {
    title: data.ended ? `${who} has arrived at ${data.to.label}` : `${who} is on the way to ${data.to.label}`,
    description: data.ended ? 'Live progress on SG Bus Timings.' : `Arriving around ${sgClock(data.arriveAt)}. Follow along live on SG Bus Timings.`,
  };
}

// ---------- the map ----------
// OneMap's static map: free, with no key, Singapore's own. Pins are one letter; the route is
// a line through up to MAP_POINTS of its points, so the address stays a sensible length.

const MAP_W = 512;
const MAP_H = 256;
const MAP_POINTS = 60;
const COLOURS = { start: '46,160,67', end: '200,40,40', you: '30,110,230', line: '122,40,160' };

const mercY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

// The zoom that fits every point in, with a margin, between OneMap's 11 and 17.
function fitZoom(points) {
  if (points.length < 2) return 16;
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const dx = (Math.max(...lngs) - Math.min(...lngs)) / 360;
  const dy = Math.abs(mercY(Math.min(...lats)) - mercY(Math.max(...lats)));
  const zx = dx ? Math.log2((MAP_W * 0.8) / (256 * dx)) : 17;
  const zy = dy ? Math.log2((MAP_H * 0.75) / (256 * dy)) : 17;
  return Math.max(11, Math.min(17, Math.floor(Math.min(zx, zy))));
}

function thin(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export function mapUrl(link) {
  const { kind, data } = link;
  const pins = [];
  let line = null;
  if (kind === 'place') {
    pins.push([data.lat, data.lng, COLOURS.end, 'B']);
  } else if (kind === 'directions') {
    if (data.from !== 'here') pins.push([data.from.lat, data.from.lng, COLOURS.start, 'A']);
    if (data.to !== 'here') pins.push([data.to.lat, data.to.lng, COLOURS.end, 'B']);
    line = data.path;
  } else {
    pins.push([data.to.lat, data.to.lng, COLOURS.end, 'B']);
    if (data.at && !data.ended && !data.stopped) pins.push([data.at[0], data.at[1], COLOURS.you, 'Y']);
    line = data.path;
  }
  const all = [...pins.map((p) => [p[0], p[1]]), ...(line || [])];
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  const params = new URLSearchParams({
    layerchosen: 'default',
    latitude: ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(5),
    longitude: ((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(5),
    zoom: String(fitZoom(all)),
    width: String(MAP_W),
    height: String(MAP_H),
  });
  if (line?.length >= 2) params.set('lines', `${JSON.stringify(thin(line, MAP_POINTS))}:${COLOURS.line}:4`);
  if (pins.length) params.set('points', pins.map(([lat, lng, colour, letter]) => `[${lat},${lng},"${colour}","${letter}"]`).join('|'));
  return `https://www.onemap.gov.sg/api/staticmap/getStaticImage?${params}`;
}
