// Syncing with the Telegram bot (api/sync.js): the one sync that passes through a server, as
// the bot can't join the direct WebRTC channel two devices use (js/p2p.js). Held in the same
// Upstash Redis as Service Alerts (api/_push/store.js), each session for SESSION_S at most
// from when the device opened it, whatever happens in it, and gone the moment either side ends
// it.
//
// A session is the device's sync code, and three keys:
//   sgbus:sync:<code>        { secret, expiresAt, joined, ended }: `secret` a SHA-256 hash of
//                            the secret only the device holds, `joined` once the bot is in,
//                            `ended` once the bot has left
//   sgbus:sync:<code>:site   messages waiting for the device, oldest first
//   sgbus:sync:<code>:bot    messages waiting for the bot
//
// The messages are js/sync.js's wire, as between two devices. The device reads and writes with
// its secret, the bot with BOT_API_TOKEN; nobody else can do either.

import { createHash } from 'node:crypto';
import { multi, redis } from '../_push/store.js';

const KEY = 'sgbus:sync';
export const SESSION_S = 10 * 60;
// The biggest message either side may send: the most favourites, places and trips anybody
// keeps come to tens of kilobytes.
export const MAX_MESSAGE_BYTES = 256 * 1024;
// Messages left unread past this many are dropped, oldest first.
const MAX_QUEUE = 20;

// js/p2p.js's CODE_ALPHABET and CODE_LENGTH.
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$/;
const SECRET_RE = /^[0-9a-f]{32,64}$/;

export const isCode = (v) => typeof v === 'string' && CODE_RE.test(v);
export const isSecret = (v) => typeof v === 'string' && SECRET_RE.test(v);

const metaKey = (code) => `${KEY}:${code}`;
const queueKey = (code, to) => `${KEY}:${code}:${to}`;
const hash = (secret) => createHash('sha256').update(secret).digest('hex');
const parse = (value) => (value == null ? null : JSON.parse(value));

async function session(code) {
  return parse(await redis('GET', metaKey(code)));
}

// Starts a session, or carries on with the device's own: 'ok', or 'taken' when another
// device has the code.
export async function open(code, secret) {
  const meta = { secret: hash(secret), expiresAt: Date.now() + SESSION_S * 1000, joined: false };
  if ((await redis('SET', metaKey(code), JSON.stringify(meta), 'NX', 'EX', SESSION_S)) === 'OK') return 'ok';
  return (await session(code))?.secret === hash(secret) ? 'ok' : 'taken';
}

// The device's session, when the secret is its own; null otherwise, or once it's over.
export async function forDevice(code, secret) {
  const meta = await session(code);
  return meta && meta.secret === hash(secret) ? meta : null;
}

// The bot comes in: the session, or null when there's none or a bot is in it already.
export async function join(code) {
  const meta = await session(code);
  if (!meta || meta.joined || meta.ended) return null;
  await redis('SET', metaKey(code), JSON.stringify({ ...meta, joined: true }), 'KEEPTTL');
  return meta;
}

export async function forBot(code) {
  const meta = await session(code);
  return meta?.joined && !meta.ended ? meta : null;
}

// A message for the other side, `to` 'site' or 'bot', kept until the session ends.
export async function push(code, to, message, expiresAt) {
  const key = queueKey(code, to);
  await multi(['RPUSH', key, JSON.stringify(message)], ['LTRIM', key, -MAX_QUEUE, -1], ['PEXPIREAT', key, expiresAt]);
}

// Every message waiting for one side, taken off the queue.
export async function drain(code, to) {
  const key = queueKey(code, to);
  const [list] = await multi(['LRANGE', key, 0, -1], ['DEL', key]);
  return (list || []).map(parse);
}

// The device ends it: the bot is told, and the rest goes.
export async function close(code, meta) {
  if (meta.joined) await push(code, 'bot', { type: 'bye' }, meta.expiresAt);
  await multi(['DEL', metaKey(code)], ['DEL', queueKey(code, 'site')]);
}

// The bot ends it: marked ended, so the device still reads what was left for it, and is told.
export async function leave(code, meta) {
  await push(code, 'site', { type: 'bye' }, meta.expiresAt);
  await redis('SET', metaKey(code), JSON.stringify({ ...meta, ended: true }), 'KEEPTTL');
  await redis('DEL', queueKey(code, 'bot'));
}

// Gone altogether, once the device has read the last of an ended session.
export async function forget(code) {
  await multi(['DEL', metaKey(code)], ['DEL', queueKey(code, 'site')], ['DEL', queueKey(code, 'bot')]);
}
