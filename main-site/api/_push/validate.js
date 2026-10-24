// Checks what the app sends before it is stored. Anything that fails throws a
// ValidationError, which the server turns into a 400. The subscription checks
// are alarm-clock's push-server/validate.js.

import { MODES } from './alerts.js';

// The server POSTs to whatever endpoint a subscription names, so only the
// browsers' own push services are accepted. Otherwise anyone could point it at
// an arbitrary URL, including ones inside this VPS.
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Samsung Internet, Opera
  '.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari, and iOS home screen apps
  '.notify.windows.com', // Edge on Windows
];

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
// An FCM registration token, the Android app's subscription: { fcm: token } (api/_push/fcm.js).
const FCM_RE = /^[A-Za-z0-9_:\-]{100,400}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+=*$/;

export class ValidationError extends Error {}

function fail(message) {
  throw new ValidationError(message);
}

export function isId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

// { subscription, train, traffic, newsfeed }: each mode one of MODES, and at least one on, or the
// device should have been deleted rather than stored.
export function parseDevice(body) {
  if (!body || typeof body !== 'object') fail('body must be an object');
  for (const kind of ['train', 'traffic']) {
    if (!MODES.includes(body[kind])) fail(`${kind} must be one of ${MODES.join(', ')}`);
  }
  // The newsfeed came later: a page from before it sends none.
  const newsfeed = body.newsfeed ?? 'off';
  if (!MODES.includes(newsfeed)) fail(`newsfeed must be one of ${MODES.join(', ')}`);
  if (body.train === 'off' && body.traffic === 'off' && newsfeed === 'off') fail('turn at least one kind of alert on, or delete the device');
  return { subscription: parseSubscription(body.subscription), train: body.train, traffic: body.traffic, newsfeed };
}

// A trip for the Get Off Alert (js/trip.js): the subscription to push to, the legs, and how
// far along the app last saw you. Only what api/_push/trip.js reads is kept.
const SG = { lat: [1.1, 1.5], lng: [103.5, 104.2] };
const SERVICE_RE = /^[A-Za-z0-9]{1,5}$/;
const STOP_RE = /^\d{5}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const text = (v, name) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 120) fail(`${name} must be a short string`);
  return v.trim();
};

export function parseTrip(body, now = Date.now()) {
  if (!body || typeof body !== 'object') fail('body must be an object');
  if (!isId(body.tripId)) fail('bad tripId');
  // Up to 12: a ride across the Causeway is three legs (js/trip.js, acrossTheCauseway).
  if (!Array.isArray(body.legs) || !body.legs.length || body.legs.length > 12) fail('legs must be 1 to 12 legs');

  const legs = body.legs.map((l, i) => {
    if (!l || typeof l !== 'object') fail(`leg ${i} must be an object`);
    // A walk: to the first stop, between rides, or to the end (js/trip.js), followed by the clock.
    if (l.kind !== 'bus' && l.kind !== 'train' && l.kind !== 'walk') fail(`leg ${i}: kind must be bus, train or walk`);
    if (!Array.isArray(l.points) || l.points.length < 2 || l.points.length > 200) fail(`leg ${i}: 2 to 200 points`);
    const points = l.points.map((p) => {
      if (!Array.isArray(p) || !isNum(p[0], ...SG.lat) || !isNum(p[1], ...SG.lng)) fail(`leg ${i}: a point is outside Singapore`);
      return [p[0], p[1]];
    });
    if (!isNum(l.minutes, 0, 300)) fail(`leg ${i}: minutes must be 0 to 300`);
    if (l.wait != null && !isNum(l.wait, 0, 60)) fail(`leg ${i}: wait must be 0 to 60`);
    const leg = { kind: l.kind, to: text(l.to, `leg ${i} to`), points, minutes: l.minutes, wait: l.wait || 0 };
    // For a live ETA link (api/_lib/share-links.js, etaFromTrip): the ride's name, and the
    // minutes walked after it, to the next ride or the end.
    if (l.label != null) leg.label = text(l.label, `leg ${i} label`).slice(0, 40);
    if (l.walkAfter != null) {
      if (!isNum(l.walkAfter, 0, 120)) fail(`leg ${i}: walkAfter must be 0 to 120`);
      leg.walkAfter = l.walkAfter;
    }
    // A bus followed live needs both; without them it goes by the clock.
    if (l.kind === 'bus' && SERVICE_RE.test(l.service ?? '') && STOP_RE.test(l.alight ?? '')) {
      Object.assign(leg, { service: l.service, alight: l.alight });
      // For Get ready to board (api/_push/trip.js): the stop you get on at, and its name.
      if (STOP_RE.test(l.board ?? '')) {
        leg.board = l.board;
        if (l.boardName != null) leg.boardName = text(l.boardName, `leg ${i} boardName`).slice(0, 80);
      }
    }
    return leg;
  });

  const leg = body.leg;
  if (!Number.isInteger(leg) || leg < 0 || leg >= legs.length) fail('bad leg');
  const last = legs[leg].points.length - 1;
  if (!Number.isInteger(body.at) || body.at < 0 || body.at > last) fail('bad at');
  if (body.pos != null && !isNum(body.pos, 0, last)) fail('bad pos');
  if (!isNum(body.legStartedAt, now - DAY_MS, now + DAY_MS)) fail('bad legStartedAt');
  if (!isNum(body.seenAt, now - DAY_MS, now + DAY_MS)) fail('bad seenAt');
  if (!Array.isArray(body.alerted) || body.alerted.length !== legs.length) fail('alerted must have one entry per leg');
  // Get ready to board, given or not, per leg. An app from before it doesn't send it.
  if (body.readied != null && (!Array.isArray(body.readied) || body.readied.length !== legs.length)) fail('readied must have one entry per leg');
  // Where the app's clock goes on from: { pos, t }, t possibly ahead while it waits for the bus.
  let anchor = null;
  if (body.anchor != null) {
    if (!isNum(body.anchor.pos, 0, last) || !isNum(body.anchor.t, now - DAY_MS, now + DAY_MS)) fail('bad anchor');
    anchor = { pos: body.anchor.pos, t: body.anchor.t };
  }
  if (body.realignedAt != null && !isNum(body.realignedAt, 0, now + DAY_MS)) fail('bad realignedAt');
  if (body.movedAt != null && !isNum(body.movedAt, 0, now + DAY_MS)) fail('bad movedAt');

  return {
    tripId: body.tripId,
    subscription: parseSubscription(body.subscription),
    legs,
    leg,
    at: body.at,
    pos: body.pos || 0,
    legStartedAt: Math.min(now, body.legStartedAt),
    seenAt: Math.min(now, body.seenAt),
    anchor,
    realignedAt: Math.min(now, body.realignedAt || 0),
    // When the trip was last moved on or back by hand (Back or Next); an older app doesn't say.
    movedAt: Math.min(now, body.movedAt || 0),
    // False while the app waits to be sure you're on the bus; an older app doesn't say.
    clockRuns: body.clockRuns !== false,
    alerted: body.alerted.map(Boolean),
    readied: body.readied ? body.readied.map(Boolean) : legs.map(() => false),
    share: parseShare(body.share),
  };
}

// The trip's live ETA link, if it's being shared: the cron keeps it updated while the app is
// in the background (api/push/trip-poll.js). The secret is what api/share.js handed the app.
function parseShare(share) {
  if (share == null) return null;
  if (typeof share !== 'object') fail('bad share');
  if (typeof share.id !== 'string' || !/^[a-z0-9]{10}$/.test(share.id)) fail('bad share.id');
  if (typeof share.secret !== 'string' || !B64URL_RE.test(share.secret) || share.secret.length > 64) fail('bad share.secret');
  const to = share.to;
  if (!to || typeof to !== 'object' || !isNum(to.lat, ...SG.lat) || !isNum(to.lng, ...SG.lng)) fail('bad share.to');
  const name = share.name == null || share.name === '' ? '' : text(share.name, 'share.name').slice(0, 64);
  return { id: share.id, secret: share.secret, name, to: { label: text(to.label, 'share.to.label'), lat: to.lat, lng: to.lng } };
}

function parseSubscription(sub) {
  if (!sub || typeof sub !== 'object') fail('subscription is required');
  if (sub.fcm != null) {
    if (typeof sub.fcm !== 'string' || !FCM_RE.test(sub.fcm)) fail('bad subscription.fcm');
    return { fcm: sub.fcm };
  }

  let url;
  try {
    url = new URL(sub.endpoint);
  } catch {
    fail('subscription.endpoint must be a URL');
  }
  if (url.protocol !== 'https:') fail('subscription.endpoint must be https');
  const host = url.hostname;
  const known = PUSH_HOSTS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));
  if (!known) fail('subscription.endpoint is not a known push service');

  const { p256dh, auth } = sub.keys ?? {};
  if (typeof p256dh !== 'string' || p256dh.length > 200 || !B64URL_RE.test(p256dh)) fail('bad subscription.keys.p256dh');
  if (typeof auth !== 'string' || auth.length > 100 || !B64URL_RE.test(auth)) fail('bad subscription.keys.auth');

  return { endpoint: url.href, keys: { p256dh, auth } };
}
