// Polls LTA's train alerts and traffic incidents, and pushes what changed to
// every subscribed device, filtered by its mode. The Telegram bot runs the same
// poll for its own subscribers (telegram-bot/src/handlers/servicealerts.py).

import webpush from 'web-push';
import { diffTraffic, diffTrain, notificationFor, updateFor } from './alerts.js';
import { fetchTrafficIncidents, fetchTrainAlerts } from './lta.js';

// A push the device can't receive within this many seconds is dropped: an
// alert about a jam from yesterday is worse than none.
const PUSH_TTL = 30 * 60;

export function startPoller({ devices, state, accountKey, intervalMs, log = console }) {
  const lastError = { train: null, traffic: null };

  // An LTA outage is logged once when it starts and once when it clears,
  // rather than on every poll.
  function noteFeed(feed, result) {
    if (result.status === 'rejected') {
      const message = result.reason?.message ?? String(result.reason);
      if (message !== lastError[feed]) {
        log.error(`${feed} fetch failed (will keep retrying quietly): ${message}`);
        lastError[feed] = message;
      }
      return false;
    }
    if (lastError[feed]) {
      log.info(`${feed} fetch recovered`);
      lastError[feed] = null;
    }
    return true;
  }

  async function poll() {
    const [train, traffic] = await Promise.allSettled([
      fetchTrainAlerts(accountKey),
      fetchTrafficIncidents(accountKey),
    ]);

    // Each feed is diffed on its own, so one being down doesn't hold the other back.
    const feeds = { train: state.get('train'), traffic: state.get('traffic') };
    const trainUpdate = noteFeed('train', train) ? diffTrain(feeds, train.value) : null;
    const newIncidents = noteFeed('traffic', traffic) ? diffTraffic(feeds, traffic.value) : [];
    if (feeds.train) state.set('train', feeds.train);
    if (feeds.traffic) state.set('traffic', feeds.traffic);

    if (!trainUpdate && !newIncidents.length) return;

    const payloads = {};
    const sends = [];
    for (const [deviceId, device] of devices.entries()) {
      if (!(device.mode in payloads)) {
        const { train: t, incidents } = updateFor(device.mode, trainUpdate, newIncidents);
        payloads[device.mode] = t || incidents.length
          ? JSON.stringify({ type: 'service-alert', ...notificationFor(t, incidents), url: '/#alerts' })
          : null;
      }
      const payload = payloads[device.mode];
      if (payload) sends.push(send(deviceId, device, payload));
    }
    await Promise.allSettled(sends);
  }

  async function send(deviceId, device, payload) {
    try {
      await webpush.sendNotification(device.subscription, payload, { TTL: PUSH_TTL, urgency: 'normal' });
    } catch (err) {
      // 404 and 410 mean the subscription is gone for good: permission
      // revoked, app uninstalled, or site data cleared.
      if (err.statusCode === 404 || err.statusCode === 410) {
        devices.delete(deviceId);
        log.info(`dropped expired subscription ${deviceId}`);
      } else {
        log.error(`push to ${deviceId} failed:`, err.statusCode ?? '', err.body ?? err.message);
      }
    }
  }

  // One poll at a time: a slow LTA reply never stacks a second poll on top.
  async function loop() {
    try {
      await poll();
    } catch (err) {
      log.error('poll failed:', err);
    }
    setTimeout(loop, intervalMs);
  }

  loop();
}
