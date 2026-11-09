// Navigate's short share links (api/_lib/share-links.js), from js/share.js.
//
//   POST  { kind, data }            → { id, path, secret? }  a link, made or found again; an
//                                    egg only from the Telegram bot (BOT_API_TOKEN)
//   POST  { action: 'redeem', id }  → { ok } or 409  an egg link opened, once for everyone
//   GET   ?id=                      → { kind, data, updatedAt }  what a link holds
//   PATCH ?id=  { secret, data }    → 204  an ETA link's new progress

import { rateLimited, storeConfigured } from './_push/store.js';
import { supabaseConfigured } from './_lib/supabase.js';
import { PATHS, ValidationError, createLink, getLink, isLinkId, parseLink, redeemEgg, updateEta } from './_lib/share-links.js';

const RATE_LIMIT = 60; // writes per IP per minute

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseConfigured()) return res.status(503).json({ error: 'Sharing is not set up yet.' });

  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (!isLinkId(id)) return res.status(400).json({ error: 'That isn’t a share link.' });
      const link = await getLink(id);
      if (!link) return res.status(404).json({ error: 'This link has expired, or doesn’t exist.' });
      return res.status(200).json({ kind: link.kind, data: link.data, updatedAt: link.updatedAt });
    }

    // Writes only: reading a link back is what everyone it's sent to does.
    // Except the Telegram bot's, which all come from its one address (telegram-bot/src/bot_trips.py).
    const bot = Boolean(process.env.BOT_API_TOKEN) && req.headers.authorization === `Bearer ${process.env.BOT_API_TOKEN}`;
    if (!bot && storeConfigured() && (await rateLimited(`share:${ip}`, RATE_LIMIT))) {
      return res.status(429).json({ error: 'Too many shares at once. Try again in a minute.' });
    }

    if (req.method === 'POST' && req.body?.action === 'redeem') {
      if (!isLinkId(req.body.id)) return res.status(400).json({ error: 'That isn’t a share link.' });
      if (!(await redeemEgg(req.body.id))) return res.status(409).json({ error: 'This Easter egg link has been used, or doesn’t exist.' });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST') {
      const { kind } = req.body || {};
      if (kind === 'egg' && !bot) return res.status(403).json({ error: 'Easter egg links come from the Telegram bot.' });
      if (!PATHS[kind]) return res.status(400).json({ error: 'bad kind' });
      const data = parseLink(kind, req.body.data);
      const { id, secret } = await createLink(kind, data);
      return res.status(200).json({ id, path: `/${PATHS[kind]}/${id}`, ...(secret && { secret }) });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!isLinkId(id)) return res.status(400).json({ error: 'bad id' });
      const data = parseLink('eta', req.body?.data);
      if (!(await updateEta(id, req.body?.secret, data))) return res.status(404).json({ error: 'This link has expired.' });
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Couldn’t make that link right now. Please try again.' });
  }
}
