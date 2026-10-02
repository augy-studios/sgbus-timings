// Run by Vercel Cron every minute (vercel.json): polls LTA's train alerts and traffic
// incidents, and pushes what changed to every device with Service Alerts on, filtered by
// its mode. The rules are api/_push/alerts.js, the same as the Telegram bot's
// (telegram-bot/src/service_alerts.py), which polls for its own subscribers.

import webpush from 'web-push';
import { diffTraffic, diffTrain, notificationFor, updateFor } from '../_push/alerts.js';
import { fetchTrafficIncidents, fetchTrainAlerts } from '../_push/lta.js';
import { devices, getState, releaseLock, setState, storeConfigured, takeLock } from '../_push/store.js';

// A push the device can't receive within this many seconds is dropped: an alert about a
// jam from yesterday is worse than none.
const PUSH_TTL = 30 * 60;
// Sends in flight at once, so a long device list doesn't open thousands of connections.
const SEND_BATCH = 50;
// Longer than a poll ever takes, shorter than the minute between them.
const LOCK_SECONDS = 55;

export default async function handler(req, res) {
  // Vercel Cron sends CRON_SECRET as a bearer token; nobody else can make the server poll.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, LTA_ACCOUNT_KEY } = process.env;
  if (!storeConfigured() || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT || !LTA_ACCOUNT_KEY) {
    return res.status(503).json({ error: 'Service Alerts are not set up: see SERVICE-ALERTS-SETUP.md' });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // A poll that overran is still sending; this one would announce the same changes again.
  if (!(await takeLock('poll', LOCK_SECONDS))) return res.status(200).json({ skipped: 'a poll is already running' });
  try {
    return res.status(200).json(await poll(LTA_ACCOUNT_KEY));
  } catch (err) {
    console.error('poll failed:', err);
    return res.status(500).json({ error: 'poll failed' });
  } finally {
    await releaseLock('poll').catch(() => {});
  }
}

async function poll(accountKey) {
  const [train, traffic] = await Promise.allSettled([fetchTrainAlerts(accountKey), fetchTrafficIncidents(accountKey)]);

  // Each feed is diffed on its own, so one being down doesn't hold the other back.
  const feeds = { train: await getState('train'), traffic: await getState('traffic') };
  const trainUpdate = (await noteFeed('train', train)) ? diffTrain(feeds, train.value) : null;
  const newIncidents = (await noteFeed('traffic', traffic)) ? diffTraffic(feeds, traffic.value) : [];
  await Promise.all([
    feeds.train && setState('train', feeds.train),
    feeds.traffic && setState('traffic', feeds.traffic),
  ]);

  if (!trainUpdate && !newIncidents.length) return { changed: false };

  const payloads = {};
  const sends = [];
  for (const [deviceId, device] of await devices.all()) {
    if (!device) continue;
    if (!(device.mode in payloads)) {
      const { train: t, incidents } = updateFor(device.mode, trainUpdate, newIncidents);
      payloads[device.mode] = t || incidents.length
        ? JSON.stringify({ type: 'service-alert', ...notificationFor(t, incidents), url: '/#alerts' })
        : null;
    }
    if (payloads[device.mode]) sends.push([deviceId, device, payloads[device.mode]]);
  }

  let sent = 0;
  let dropped = 0;
  for (let i = 0; i < sends.length; i += SEND_BATCH) {
    const results = await Promise.all(sends.slice(i, i + SEND_BATCH).map(([id, device, payload]) => send(id, device, payload)));
    sent += results.filter((r) => r === 'sent').length;
    dropped += results.filter((r) => r === 'dropped').length;
  }
  return { changed: true, train: Boolean(trainUpdate), incidents: newIncidents.length, sent, dropped };
}

async function send(deviceId, device, payload) {
  try {
    await webpush.sendNotification(device.subscription, payload, { TTL: PUSH_TTL, urgency: 'normal' });
    return 'sent';
  } catch (err) {
    // 404 and 410 mean the subscription is gone for good: permission revoked, app
    // uninstalled, or site data cleared.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await devices.delete(deviceId).catch(() => {});
      console.info(`dropped expired subscription ${deviceId}`);
      return 'dropped';
    }
    console.error(`push to ${deviceId} failed:`, err.statusCode ?? '', err.body ?? err.message);
    return 'failed';
  }
}

// An LTA outage is logged once when it starts and once when it clears, rather than every
// minute. Functions don't keep memory between runs, so the last error is kept in Redis.
async function noteFeed(feed, result) {
  const last = await getState(`error:${feed}`);
  if (result.status === 'rejected') {
    const message = result.reason?.message ?? String(result.reason);
    if (message !== last) {
      console.error(`${feed} fetch failed (will keep retrying quietly): ${message}`);
      await setState(`error:${feed}`, message);
    }
    return false;
  }
  if (last) {
    console.info(`${feed} fetch recovered`);
    await setState(`error:${feed}`, null);
  }
  return true;
}
