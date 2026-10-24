// Where Service Alerts keeps its state between function runs: each device's push
// subscription and mode, what the two LTA feeds looked like at the last poll, a lock so
// two polls never overlap, and a per-IP request count. Upstash Redis, over its REST API
// with plain fetch, so there's no client library or connection to manage.
//
// Connected from the Vercel Marketplace, Upstash sets KV_REST_API_URL and
// KV_REST_API_TOKEN; set up on Upstash directly, it's UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN. Either pair works.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const KEY = 'sgbus:push';
const DEVICES = `${KEY}:devices`;

export const storeConfigured = () => Boolean(REDIS_URL && TOKEN);

// Also for syncing with the Telegram bot (api/_lib/sync-relay.js), which keeps its sessions
// in the same Redis.
export async function redis(...command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command.map(String)),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new Error(`redis ${command[0]} failed: ${data?.error ?? res.status}`);
  return data.result;
}

// Several commands as one transaction (Upstash's /multi-exec): all of them or none, answered
// with each one's result in order.
export async function multi(...commands) {
  const res = await fetch(`${REDIS_URL.replace(/\/+$/, '')}/multi-exec`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  const failed = !Array.isArray(data) ? data?.error ?? res.status : data.find((r) => r?.error)?.error;
  if (!res.ok || failed) throw new Error(`redis multi failed: ${failed ?? res.status}`);
  return data.map((r) => r.result);
}

const parse = (value) => (value == null ? null : JSON.parse(value));

// ---------- devices: { subscription, mode, updatedAt } by device id ----------

export const devices = {
  async has(id) {
    return (await redis('HEXISTS', DEVICES, id)) === 1;
  },
  async set(id, device) {
    await redis('HSET', DEVICES, id, JSON.stringify(device));
  },
  async delete(id) {
    await redis('HDEL', DEVICES, id);
  },
  async size() {
    return Number(await redis('HLEN', DEVICES)) || 0;
  },
  // Every device, as [id, device] pairs. HGETALL answers with a flat [field, value, ...].
  async all() {
    const flat = (await redis('HGETALL', DEVICES)) ?? [];
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i], parse(flat[i + 1])]);
    return out;
  },
};

// ---------- trips: the Get Off Alert, by device id (api/_push/trip.js) ----------
// Each its own key, so it expires on its own when the app stops checking in, with a set of
// the ids so the cron can find them. An id whose key has expired is dropped from the set
// the next time the cron looks.

const TRIPS = `${KEY}:trips`;
const tripKey = (id) => `${KEY}:trip:${id}`;

export const trips = {
  async get(id) {
    return parse(await redis('GET', tripKey(id)));
  },
  async set(id, trip, seconds) {
    await redis('SET', tripKey(id), JSON.stringify(trip), 'EX', Math.max(60, seconds));
    await redis('SADD', TRIPS, id);
  },
  // Only if it's still there, so a trip ended while the cron was working on it stays ended.
  async update(id, trip, seconds) {
    await redis('SET', tripKey(id), JSON.stringify(trip), 'EX', Math.max(60, seconds), 'XX');
  },
  async delete(id) {
    await redis('DEL', tripKey(id));
    await redis('SREM', TRIPS, id);
  },
  // Every trip still running, as [id, trip] pairs.
  async all() {
    const ids = (await redis('SMEMBERS', TRIPS)) ?? [];
    if (!ids.length) return [];
    const values = await redis('MGET', ...ids.map(tripKey));
    const out = [];
    const gone = [];
    ids.forEach((id, i) => (values[i] == null ? gone.push(id) : out.push([id, parse(values[i])])));
    if (gone.length) await redis('SREM', TRIPS, ...gone);
    return out;
  },
};

// ---------- the feeds' last state, and the last error per feed ----------

export async function getState(name) {
  return parse(await redis('GET', `${KEY}:state:${name}`));
}

// Several at once, in one request: { name: state }.
export async function getStates(names) {
  const values = await redis('MGET', ...names.map((n) => `${KEY}:state:${n}`));
  return Object.fromEntries(names.map((n, i) => [n, parse(values?.[i] ?? null)]));
}

export async function setState(name, value) {
  if (value == null) await redis('DEL', `${KEY}:state:${name}`);
  else await redis('SET', `${KEY}:state:${name}`, JSON.stringify(value));
}

// ---------- a lock, so a slow poll and the next one can't both send ----------

// It lapses by itself after `seconds`; a cron run a minute apart needn't release it, which
// saves a request every run.
export async function takeLock(name, seconds) {
  return (await redis('SET', `${KEY}:lock:${name}`, '1', 'NX', 'EX', seconds)) === 'OK';
}

export async function releaseLock(name) {
  await redis('DEL', `${KEY}:lock:${name}`);
}

// ---------- requests per IP per minute ----------

// Counted in this function instance's memory, not Redis: a request or two less for every use of
// Navigate, a walk or a road, which was most of the store's traffic. Each instance counts on
// its own, so someone spread across several gets a little more; it's there to stop a runaway
// script, not to meter. Kept async, as it was.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_KEYS_MAX = 10000;
const rates = new Map(); // key: { n, until }
export async function rateLimited(ip, limit) {
  const now = Date.now();
  let r = rates.get(ip);
  if (!r || r.until <= now) {
    if (rates.size >= RATE_KEYS_MAX) for (const [k, v] of rates) if (v.until <= now) rates.delete(k);
    r = { n: 0, until: now + RATE_WINDOW_MS };
    rates.set(ip, r);
  }
  r.n += 1;
  return r.n > limit;
}
