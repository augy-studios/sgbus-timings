// The Get Off Alert's background half (api/_push/trip.js): the app sends its trip here when
// it starts, at each change of leg or alert, and whenever it's put in the background (PUT),
// and takes it back when the trip ends (DELETE). The cron in api/push/trip-poll.js follows
// it from there.
//
// The answer to a PUT is how far the server has got, { tripId, leg, legStartedAt, alerted }, so an app
// coming back from the background picks up a change of leg or an alert sent while it was away.

import { trips, rateLimited, storeConfigured } from '../../_push/store.js';
import { ttlSeconds } from '../../_push/trip.js';
import { ValidationError, isId, parseTrip } from '../../_push/validate.js';

const RATE_LIMIT = 60; // requests per IP per minute

export default async function handler(req, res) {
  if (!storeConfigured()) return res.status(503).json({ error: 'Get Off Alert is not set up: no Redis store' });

  const { id } = req.query;
  if (!isId(id)) return res.status(400).json({ error: 'bad device id' });

  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    if (await rateLimited(ip, RATE_LIMIT)) return res.status(429).json({ error: 'too many requests' });

    if (req.method === 'PUT') {
      const now = Date.now();
      const sent = parseTrip(req.body, now);
      const trip = merge(await trips.get(id), sent);
      await trips.set(id, trip, ttlSeconds(trip, now));
      return res.status(200).json({ tripId: trip.tripId, leg: trip.leg, legStartedAt: trip.legStartedAt, alerted: trip.alerted });
    }

    if (req.method === 'DELETE') {
      await trips.delete(id);
      return res.status(204).end();
    }

    res.setHeader('Allow', 'PUT, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}

// The same trip again: whatever either side has done stays done. An alert sent by one isn't
// sent again by the other, and a leg the server moved on to isn't undone by an app that
// hasn't heard yet. A new trip replaces the old one outright.
function merge(old, sent) {
  if (!old || old.tripId !== sent.tripId) return { ...sent, track: null };
  const alerted = sent.alerted.map((a, i) => a || Boolean(old.alerted[i]));
  if (old.leg > sent.leg) return { ...old, subscription: sent.subscription, alerted };
  if (old.leg < sent.leg) return { ...sent, alerted, track: null };
  // The bus being followed stays, unless the app has since seen you well past it: then it
  // was the wrong bus.
  const known = Math.max(sent.at, sent.pos);
  const track = old.track && old.track.pos >= known - 1.5 ? old.track : null;
  return {
    ...sent,
    at: Math.max(sent.at, old.at),
    pos: Math.max(sent.pos, old.pos || 0),
    seenAt: Math.max(sent.seenAt, old.seenAt),
    alerted,
    track,
  };
}
