// SG Bus Timing push server. Stores each device's push subscription and
// Service Alerts mode, polls LTA, and sends a Web Push when train alerts or
// traffic incidents change, so alerts arrive with the app closed.
// Modelled on alarm-clock's push-server. See SETUP.md for running it on the VPS.

import { createServer } from 'node:http';
import { join } from 'node:path';
import webpush from 'web-push';
import { startPoller } from './poller.js';
import { createStore } from './store.js';
import { ValidationError, isId, parseDevice } from './validate.js';

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  LTA_ACCOUNT_KEY,
  POLL_SECONDS = '60',
  PORT = '8788',
  HOST = '127.0.0.1',
  DATA_DIR = './data',
  ALLOWED_ORIGINS = 'https://sgbus.uwuapps.org',
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set. See SETUP.md.');
  process.exit(1);
}
if (!LTA_ACCOUNT_KEY) {
  console.error('LTA_ACCOUNT_KEY must be set. See SETUP.md.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const MAX_DEVICES = 50_000;
const MAX_BODY = 8 * 1024;
const RATE_LIMIT = 60; // requests per IP per minute

const origins = new Set(ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));
const devices = createStore(join(DATA_DIR, 'devices.json'));
const state = createStore(join(DATA_DIR, 'state.json'));

// ---------- Routes ----------

const routes = [
  ['GET', /^\/healthz$/, () => [200, { ok: true, devices: devices.size }]],

  ['GET', /^\/v1\/vapid-key$/, () => [200, { publicKey: VAPID_PUBLIC_KEY }]],

  // Turn Service Alerts on for a device, or change its mode. Sent again on
  // every app load, which also keeps the subscription fresh.
  ['PUT', /^\/v1\/devices\/([^/]+)$/, async (req, id) => {
    if (!isId(id)) return [400, { error: 'bad device id' }];
    if (!devices.has(id) && devices.size >= MAX_DEVICES) return [503, { error: 'server full' }];
    const device = parseDevice(await readJson(req));
    devices.set(id, { ...device, updatedAt: Date.now() });
    return [200, { mode: device.mode }];
  }],

  // Turn Service Alerts off: the server forgets the device.
  ['DELETE', /^\/v1\/devices\/([^/]+)$/, (req, id) => {
    if (!isId(id)) return [400, { error: 'bad device id' }];
    devices.delete(id);
    return [204];
  }],
];

// ---------- HTTP plumbing (as alarm-clock's push-server) ----------

const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

function rateLimited(req) {
  // Behind nginx, the client address arrives in X-Forwarded-For. Only trust it
  // when the connection itself comes from the local proxy.
  const direct = req.socket.remoteAddress;
  const local = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
  const ip = (local && req.headers['x-forwarded-for']?.split(',')[0].trim()) || direct;
  const n = (hits.get(ip) ?? 0) + 1;
  hits.set(ip, n);
  return n > RATE_LIMIT;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ValidationError('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ValidationError('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !origins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(res, headers, status, body) {
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') return reply(res, headers, 204);
  if (rateLimited(req)) return reply(res, headers, 429, { error: 'too many requests' });

  const path = new URL(req.url, 'http://localhost').pathname;
  for (const [method, pattern, handler] of routes) {
    const match = path.match(pattern);
    if (!match || method !== req.method) continue;
    try {
      const [status, body] = await handler(req, ...match.slice(1));
      return reply(res, headers, status, body);
    } catch (err) {
      if (err instanceof ValidationError) return reply(res, headers, 400, { error: err.message });
      console.error(err);
      return reply(res, headers, 500, { error: 'internal error' });
    }
  }
  reply(res, headers, 404, { error: 'not found' });
});

server.listen(Number(PORT), HOST, () => {
  console.log(`sgbus push server on http://${HOST}:${PORT}, ${devices.size} devices loaded`);
});

startPoller({
  devices,
  state,
  accountKey: LTA_ACCOUNT_KEY,
  intervalMs: Math.max(30, Number(POLL_SECONDS) || 60) * 1000,
});

// Write any pending changes before systemd stops the service.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    devices.flush();
    state.flush();
    process.exit(0);
  });
}
