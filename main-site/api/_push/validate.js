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
