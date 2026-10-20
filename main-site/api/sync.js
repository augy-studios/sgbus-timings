// Syncing with the Telegram bot: the relay between a device's Settings (js/sync-relay.js) and
// the bot's /sync (telegram-bot/src/sync_bot.py). See api/_lib/sync-relay.js for what's kept
// and for how long.
//
// The device, with the secret it made:
//   POST { op: 'open', code, secret }            → 200 { expiresAt }, 409 code taken
//   GET  ?code=&secret=                          → { open, joined, messages }  its messages
//   POST { op: 'send', code, secret, message }   → 204
//   POST { op: 'close', code, secret }           → 204
//
// The bot, with Authorization: Bearer BOT_API_TOKEN:
//   POST { op: 'join', code, message }           → 200 { expiresAt }, 404 no such code
//   GET  ?code=                                  → { open, messages }  its messages
//   POST { op: 'send', code, message }           → 204
//   POST { op: 'leave', code }                   → 204

import { rateLimited, storeConfigured } from './_push/store.js';
import {
  MAX_MESSAGE_BYTES, close, drain, forBot, forDevice, forget, isCode, isSecret, join, leave, open, push,
} from './_lib/sync-relay.js';

// Requests per IP per minute from devices: a poll every two seconds, and room to spare.
const RATE_LIMIT = 90;

const isBot = (req) => Boolean(process.env.BOT_API_TOKEN) && req.headers.authorization === `Bearer ${process.env.BOT_API_TOKEN}`;

// A message is one of js/sync.js's: an object with a type, and not too big.
function message(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string' || raw.type.length > 20) return null;
  return JSON.stringify(raw).length <= MAX_MESSAGE_BYTES ? raw : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!storeConfigured()) return res.status(503).json({ error: 'Syncing with the Telegram bot isn’t set up on this site.' });

  const bot = isBot(req);
  const body = req.method === 'POST' ? req.body || {} : {};
  const code = req.method === 'GET' ? req.query.code : body.code;
  if (!isCode(code)) return res.status(400).json({ error: 'That isn’t a sync code.' });

  try {
    if (!bot) {
      const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      if (await rateLimited(`sync:${ip}`, RATE_LIMIT)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
      const secret = req.method === 'GET' ? req.query.secret : body.secret;
      if (!isSecret(secret)) return res.status(400).json({ error: 'bad secret' });

      if (req.method === 'POST' && body.op === 'open') {
        if ((await open(code, secret)) === 'taken') return res.status(409).json({ error: 'That code is in use. Try again.' });
        const meta = await forDevice(code, secret);
        return res.status(200).json({ expiresAt: meta.expiresAt });
      }

      const meta = await forDevice(code, secret);
      if (req.method === 'GET') {
        if (!meta) return res.status(200).json({ open: false, joined: false, messages: [] });
        const messages = await drain(code, 'site');
        // The bot left: what it said last, then the session goes altogether.
        if (meta.ended) await forget(code);
        return res.status(200).json({ open: !meta.ended, joined: meta.joined, messages });
      }
      if (req.method === 'POST' && body.op === 'send') {
        const msg = message(body.message);
        if (!msg) return res.status(400).json({ error: 'bad message' });
        if (!meta || !meta.joined || meta.ended) return res.status(404).json({ error: 'The bot isn’t connected.' });
        await push(code, 'bot', msg, meta.expiresAt);
        return res.status(204).end();
      }
      if (req.method === 'POST' && body.op === 'close') {
        if (meta) await close(code, meta);
        return res.status(204).end();
      }
    } else {
      if (req.method === 'POST' && body.op === 'join') {
        const msg = message(body.message);
        if (!msg) return res.status(400).json({ error: 'bad message' });
        const meta = await join(code);
        if (!meta) return res.status(404).json({ error: 'No device is showing that code.' });
        await push(code, 'site', msg, meta.expiresAt);
        return res.status(200).json({ expiresAt: meta.expiresAt });
      }

      const meta = await forBot(code);
      if (req.method === 'GET') {
        if (!meta) return res.status(200).json({ open: false, messages: await drain(code, 'bot') });
        return res.status(200).json({ open: true, messages: await drain(code, 'bot') });
      }
      if (req.method === 'POST' && body.op === 'send') {
        const msg = message(body.message);
        if (!msg) return res.status(400).json({ error: 'bad message' });
        if (!meta) return res.status(404).json({ error: 'The device has ended the sync.' });
        await push(code, 'site', msg, meta.expiresAt);
        return res.status(204).end();
      }
      if (req.method === 'POST' && body.op === 'leave') {
        if (meta) await leave(code, meta);
        return res.status(204).end();
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Couldn’t reach the sync relay. Please try again.' });
  }
}
