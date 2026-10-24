// Bus and train notices, the newsfeed (api/_lib/notices.js), two ways:
//
// - From Vercel Cron, hourly (vercel.json), with CRON_SECRET: reads LTA's announcements and
//   the operators' news afresh, keeps them, and pushes what's new to every device with the
//   newsfeed on: all of it, or with 'disruptions' only what changes a service.
// - GET /api/notices: { at, items, sources }, the notices kept, for Service alerts' Newsfeed,
//   a stop's timings (js/alerts.js) and the Telegram bot's /alerts. With ?stop=<code>, only
//   those naming that stop.

import webpush from "web-push";
import { modesOf } from "./_push/alerts.js";
import { sendPush } from "./_push/send.js";
import { devices, storeConfigured, takeLock } from "./_push/store.js";
import { changesService, newsfeedNotification, noticesNow, refreshNotices, SOURCE_NAMES } from "./_lib/notices.js";
import { originOf } from "./_nav/network.js";

// A notice can wait: a push not delivered within a day is dropped.
const PUSH_TTL = 24 * 3600;
const SEND_BATCH = 50;
const LOCK_SECONDS = 280;

async function push(fresh) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!fresh.length || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return { sent: 0 };
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const payloads = {
    all: JSON.stringify({ type: "service-alert", ...newsfeedNotification(fresh), url: "/#alerts" }),
    disruptions: fresh.some(changesService)
      ? JSON.stringify({ type: "service-alert", ...newsfeedNotification(fresh.filter(changesService)), url: "/#alerts" })
      : null,
  };
  const sends = [];
  for (const [id, device] of await devices.all()) {
    const payload = device && payloads[modesOf(device).newsfeed];
    if (payload) sends.push([id, device, payload]);
  }
  let sent = 0;
  for (let i = 0; i < sends.length; i += SEND_BATCH) {
    const results = await Promise.all(sends.slice(i, i + SEND_BATCH).map(async ([id, device, payload]) => {
      try {
        await sendPush(device.subscription, payload, { ttl: PUSH_TTL, urgency: "low" });
        return true;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await devices.delete(id).catch(() => {});
        return false;
      }
    }));
    sent += results.filter(Boolean).length;
  }
  return { sent };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization === `Bearer ${secret}`) {
    // The lock's a nicety: with the store not answering, the refresh goes ahead without it.
    if (storeConfigured() && !(await takeLock("notices", LOCK_SECONDS).catch(() => true))) return res.status(200).json({ skipped: "a refresh is already running" });
    try {
      const done = await refreshNotices(originOf(req));
      const pushed = storeConfigured() ? await push(done.new).catch((err) => ({ sent: 0, error: err.message })) : { sent: 0 };
      return res.status(200).json({ ...done, new: done.new.length, ...pushed });
    } catch (err) {
      console.error("notices refresh failed:", err);
      return res.status(502).json({ error: err.message });
    }
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  // As kept by the hourly refresh, or read now if it couldn't keep them.
  const notices = await noticesNow(originOf(req));
  const stop = /^\d{5}$/.test(req.query.stop || "") ? req.query.stop : null;
  const items = (notices?.items || [])
    .filter((n) => !stop || n.stops?.[stop] || n.codes?.includes(stop))
    // What the page needs, not what the refresh keeps for itself.
    .map(({ read, seen, ...n }) => ({ ...n, seen }));
  // Not long, if there are none to show: the next ask reads them again.
  res.setHeader("Cache-Control", notices?.at ? "public, s-maxage=600, stale-while-revalidate=3600" : "public, s-maxage=30");
  return res.status(200).json({ at: notices?.at ?? null, items, sources: SOURCE_NAMES });
}
