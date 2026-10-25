// Pushes to the Android app (android/) through Firebase Cloud Messaging, as Web Push pushes to
// browsers: the app's WebView has no Web Push, so it registers with FCM and sends its token as
// its subscription, { fcm: token } (js/alerts.js). Service Alerts (api/push/poll.js) and the
// Get Off Alert (api/push/trip-poll.js) both come through here for the app, via sendPush in
// api/_push/send.js; and "a new version is out" (api/push/release.js), to a topic (sendToTopic).
//
// FCM's HTTP v1 API, with an OAuth token made from the Firebase project's service account:
// FIREBASE_SERVICE_ACCOUNT holds its JSON key, as downloaded or base64'd
// (android/FIREBASE-SETUP.md). The token is signed here with node:crypto, so there's no
// Google library, and kept until just before it runs out (an hour).
//
// Each push carries a notification, which Android shows itself while the app is in the
// background, on the app's own channels (android/.../Notifications.java), and the same as
// data, for the page when the app's in front.

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_MARGIN_S = 300;

let account;
let token = null;
let tokenExpires = 0;

function serviceAccount() {
  if (account !== undefined) return account;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  account = null;
  if (!raw) return account;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.project_id && parsed.client_email && parsed.private_key) account = parsed;
    else console.error('[fcm] FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key');
  } catch {
    console.error("[fcm] FIREBASE_SERVICE_ACCOUNT isn't the service account's JSON key");
  }
  return account;
}

export const fcmConfigured = () => Boolean(serviceAccount());

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (token && now < tokenExpires - TOKEN_MARGIN_S) return token;
  const sa = serviceAccount();
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    cache: 'no-store',
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.access_token) throw new Error(`Google token responded ${r.status}: ${data?.error_description || data?.error || ''}`);
  token = data.access_token;
  tokenExpires = now + (Number(data.expires_in) || 3600);
  return token;
}

// An error like web-push's, so callers treat the two alike: statusCode 410 means the app's
// token is gone for good (uninstalled, data cleared) and the device should be dropped.
class PushError extends Error {
  constructor(statusCode, body) {
    super(`FCM responded ${statusCode}`);
    this.statusCode = statusCode;
    this.body = body;
  }
}

// `payload` is the same JSON string a Web Push carries: { type: 'service-alert', title, body,
// url }, { type: 'get-off', tripId, leg, body, quiet } or { type: 'board', title, tripId, leg, body }.
export async function sendFcm(fcmToken, payload, { ttl = 60, urgency = 'normal' } = {}) {
  if (!fcmConfigured()) throw new PushError(503, 'FIREBASE_SERVICE_ACCOUNT is not set');
  const msg = JSON.parse(payload);
  const getOff = msg.type === 'get-off';
  const board = msg.type === 'board';
  const title = msg.title || (getOff ? 'Get Off Alert' : board ? 'Get ready to board' : 'Service Alerts');
  const data = {};
  for (const [k, v] of Object.entries({ ...msg, title })) if (v != null) data[k] = String(v);

  const message = {
    token: fcmToken,
    data,
    notification: { title, body: msg.body || '' },
    android: {
      priority: urgency === 'high' ? 'HIGH' : 'NORMAL',
      ttl: `${ttl}s`,
      notification: {
        // The app's channels (Notifications.java): the Get Off Alert's buzzes "OFF". An app from
        // before 2.0.4 has no board channel, and Android puts it on its default one. With
        // Settings' earphones only (`quiet`, sent only by an app from 2.1.0, which has the
        // channel), get_off_quiet: it buzzes, and never sounds out loud.
        channel_id: getOff ? (msg.quiet === true ? 'get_off_quiet' : 'get_off') : board ? 'board' : 'alerts',
        tag: getOff ? 'get-off' : board ? 'board' : 'service-alert',
        icon: 'ic_notification_icon',
        notification_priority: getOff ? 'PRIORITY_MAX' : board ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
        visibility: 'PUBLIC',
      },
    },
  };

  await post(message);
}

// To every phone that joined an FCM topic, rather than to one token: the app's switches join
// them (SgBusPlugin.setReleases), so the server keeps no list of phones. Topics are shared by
// every app in the UwU Apps Firebase project, hence the sgbus- prefix on each. Used for "a new
// version is out" (api/push/release.js), which only the app shows: there's no Web Push to it.
export async function sendToTopic(topic, { title, body = '', data = {}, channel, tag, ttl = 24 * 3600 }) {
  if (!fcmConfigured()) throw new PushError(503, 'FIREBASE_SERVICE_ACCOUNT is not set');
  const strings = {};
  for (const [k, v] of Object.entries({ ...data, title, body })) if (v != null) strings[k] = String(v);
  await post({
    topic,
    data: strings,
    notification: { title, body },
    android: {
      // Not urgent: a phone dozing gets it when it next wakes, within the day.
      priority: 'NORMAL',
      ttl: `${ttl}s`,
      notification: { channel_id: channel, tag, icon: 'ic_notification_icon', visibility: 'PUBLIC' },
    },
  });
}

async function post(message) {
  const send = async () => fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount().project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
    cache: 'no-store',
  });
  let r = await send();
  // A token Google took back early: once more with a fresh one.
  if (r.status === 401) {
    token = null;
    r = await send();
  }
  if (r.ok) return;
  const body = await r.json().catch(() => null);
  // Only FCM's own word that the token's gone drops the device. A plain 404 can also mean the
  // project in the key is wrong, and that would drop every phone.
  const code = body?.error?.details?.find((d) => d.errorCode)?.errorCode;
  if (code === 'UNREGISTERED') throw new PushError(410, body);
  throw new PushError(r.status, body);
}
