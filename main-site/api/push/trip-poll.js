// Run by Vercel Cron every minute (vercel.json): moves every trip on by a minute
// (api/_push/trip.js), from where LTA says its bus is or by the clock, and pushes the Get Off
// Alert to the ones that have reached it. The app does the same itself while it's open; this
// is for when it's in the background, where a website gets no location.

import webpush from 'web-push';
import { fetchBusPositions } from '../_push/lta.js';
import { releaseLock, storeConfigured, takeLock, trips } from '../_push/store.js';
import { step, ttlSeconds } from '../_push/trip.js';

// An alert that arrives a few minutes late is past the stop: better none.
const PUSH_TTL = 3 * 60;
const LOCK_SECONDS = 55;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, LTA_ACCOUNT_KEY } = process.env;
  if (!storeConfigured() || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT || !LTA_ACCOUNT_KEY) {
    return res.status(503).json({ error: 'Get Off Alert is not set up: see SERVICE-ALERTS-SETUP.md' });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  if (!(await takeLock('trips', LOCK_SECONDS))) return res.status(200).json({ skipped: 'a poll is already running' });
  try {
    return res.status(200).json(await poll(LTA_ACCOUNT_KEY));
  } catch (err) {
    console.error('trip poll failed:', err);
    return res.status(500).json({ error: 'trip poll failed' });
  } finally {
    await releaseLock('trips').catch(() => {});
  }
}

async function poll(accountKey) {
  const all = await trips.all();
  if (!all.length) return { trips: 0 };

  // Two people on the same bus to the same stop need asking about only once.
  const asked = new Map();
  const positions = (stop, service) => {
    const key = `${stop}|${service}`;
    if (!asked.has(key)) {
      asked.set(key, fetchBusPositions(accountKey, stop, service).catch((err) => {
        console.warn(`bus positions for ${service} at ${stop} failed: ${err.message}`);
        return null;
      }));
    }
    return asked.get(key);
  };

  const now = Date.now();
  let sent = 0;
  await Promise.all(all.map(async ([id, trip]) => {
    try {
      const leg = trip.legs[trip.leg];
      const buses = leg.kind === 'bus' && leg.service && leg.alight ? await positions(leg.alight, leg.service) : null;
      const { alert, done } = step(trip, buses?.length ? buses : null, now);

      if (alert && (await send(id, trip, alert))) sent++;
      if (done) await trips.delete(id);
      else await trips.update(id, trip, ttlSeconds(trip, now));
    } catch (err) {
      console.error(`trip ${id} failed:`, err);
    }
  }));
  return { trips: all.length, sent };
}

async function send(id, trip, alert) {
  const payload = JSON.stringify({ type: 'get-off', tripId: trip.tripId, leg: alert.leg, body: alert.text });
  try {
    await webpush.sendNotification(trip.subscription, payload, { TTL: PUSH_TTL, urgency: 'high' });
    return true;
  } catch (err) {
    // The subscription is gone for good, so nothing more can reach this trip.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await trips.delete(id).catch(() => {});
      return false;
    }
    console.error(`get off alert to ${id} failed:`, err.statusCode ?? '', err.body ?? err.message);
    return false;
  }
}
