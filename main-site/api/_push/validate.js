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
const B64URL_RE = /^[A-Za-z0-9_-]+=*$/;

export class ValidationError extends Error {}

function fail(message) {
  throw new ValidationError(message);
}

export function isId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

// { subscription, train, traffic }: each mode one of MODES, and at least one on, or the
// device should have been deleted rather than stored.
export function parseDevice(body) {
  if (!body || typeof body !== 'object') fail('body must be an object');
  for (const kind of ['train', 'traffic']) {
    if (!MODES.includes(body[kind])) fail(`${kind} must be one of ${MODES.join(', ')}`);
  }
  if (body.train === 'off' && body.traffic === 'off') fail('turn at least one kind of alert on, or delete the device');
  return { subscription: parseSubscription(body.subscription), train: body.train, traffic: body.traffic };
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
  if (!Array.isArray(body.legs) || !body.legs.length || body.legs.length > 8) fail('legs must be 1 to 8 legs');

  const legs = body.legs.map((l, i) => {
    if (!l || typeof l !== 'object') fail(`leg ${i} must be an object`);
    if (l.kind !== 'bus' && l.kind !== 'train') fail(`leg ${i}: kind must be bus or train`);
    if (!Array.isArray(l.points) || l.points.length < 2 || l.points.length > 200) fail(`leg ${i}: 2 to 200 points`);
    const points = l.points.map((p) => {
      if (!Array.isArray(p) || !isNum(p[0], ...SG.lat) || !isNum(p[1], ...SG.lng)) fail(`leg ${i}: a point is outside Singapore`);
      return [p[0], p[1]];
    });
    if (!isNum(l.minutes, 0, 300)) fail(`leg ${i}: minutes must be 0 to 300`);
    if (l.wait != null && !isNum(l.wait, 0, 60)) fail(`leg ${i}: wait must be 0 to 60`);
    const leg = { kind: l.kind, to: text(l.to, `leg ${i} to`), points, minutes: l.minutes, wait: l.wait || 0 };
    // A bus followed live needs both; without them it goes by the clock.
    if (l.kind === 'bus' && SERVICE_RE.test(l.service ?? '') && STOP_RE.test(l.alight ?? '')) {
      Object.assign(leg, { service: l.service, alight: l.alight });
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
  // Where the app's clock goes on from: { pos, t }, t possibly ahead while it waits for the bus.
  let anchor = null;
  if (body.anchor != null) {
    if (!isNum(body.anchor.pos, 0, last) || !isNum(body.anchor.t, now - DAY_MS, now + DAY_MS)) fail('bad anchor');
    anchor = { pos: body.anchor.pos, t: body.anchor.t };
  }
  if (body.realignedAt != null && !isNum(body.realignedAt, 0, now + DAY_MS)) fail('bad realignedAt');

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
    // False while the app waits to be sure you're on the bus; an older app doesn't say.
    clockRuns: body.clockRuns !== false,
    alerted: body.alerted.map(Boolean),
  };
}

function parseSubscription(sub) {
  if (!sub || typeof sub !== 'object') fail('subscription is required');

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
