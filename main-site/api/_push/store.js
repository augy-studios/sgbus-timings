// Where Service Alerts keeps its state between function runs: each device's push
// subscription and mode, what the two LTA feeds looked like at the last poll, a lock so
// two polls never overlap, and a per-IP request count. Upstash Redis, over its REST API
// with plain fetch, so there's no client library or connection to manage.
//
// Connected from the Vercel Marketplace, Upstash sets SGBUS_KV_REST_API_URL and
// SGBUS_KV_REST_API_TOKEN; set up on Upstash directly, it's UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN. Either pair works.

const REDIS_URL = process.env.SGBUS_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.SGBUS_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const KEY = 'sgbus:push';
const DEVICES = `${KEY}:devices`;

export const storeConfigured = () => Boolean(REDIS_URL && TOKEN);

async function redis(...command) {
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

// ---------- the feeds' last state, and the last error per feed ----------

export async function getState(name) {
  return parse(await redis('GET', `${KEY}:state:${name}`));
}

export async function setState(name, value) {
  if (value == null) await redis('DEL', `${KEY}:state:${name}`);
  else await redis('SET', `${KEY}:state:${name}`, JSON.stringify(value));
}

// ---------- a lock, so a slow poll and the next one can't both send ----------

export async function takeLock(name, seconds) {
  return (await redis('SET', `${KEY}:lock:${name}`, '1', 'NX', 'EX', seconds)) === 'OK';
}

export async function releaseLock(name) {
  await redis('DEL', `${KEY}:lock:${name}`);
}

// ---------- requests per IP per minute ----------

export async function rateLimited(ip, limit) {
  const key = `${KEY}:rate:${ip}`;
  const n = Number(await redis('INCR', key));
  if (n === 1) await redis('EXPIRE', key, 60);
  return n > limit;
}
