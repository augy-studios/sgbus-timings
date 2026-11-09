// Team runs (api/_lib/team-runs.js), from js/team.js.
//
//   GET   ?id=                                              → the team, its members, and what
//                                                             each has added
//   POST  { action: 'create', team, name }                  → { id, name, member: { id, secret } }
//   POST  { action: 'join', id, name }                      → { id, name, member: { id, secret } }
//   POST  { action: 'add', id, member, secret, events }     → 204
//   POST  { action: 'leave', id, member, secret }           → 204

import { rateLimited, storeConfigured } from './_push/store.js';
import { supabaseConfigured } from './_lib/supabase.js';
import { ValidationError, addEvents, createTeam, getTeam, isTeamId, joinTeam, leaveTeam, parseEvents, parseName } from './_lib/team-runs.js';

const RATE_LIMIT = 60; // writes per IP per minute
const GONE = 'This team run has ended, or doesn’t exist.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseConfigured()) return res.status(503).json({ error: 'Team runs are not set up yet.' });

  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (!isTeamId(id)) return res.status(400).json({ error: 'That isn’t a team code.' });
      const team = await getTeam(id);
      if (!team) return res.status(404).json({ error: GONE });
      return res.status(200).json(team);
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method not allowed' });
    }

    // Not the Telegram bot's, whose team runs all come from its one address (telegram-bot/src/teams.py).
    const bot = Boolean(process.env.BOT_API_TOKEN) && req.headers.authorization === `Bearer ${process.env.BOT_API_TOKEN}`;
    if (!bot && storeConfigured() && (await rateLimited(`team:${ip}`, RATE_LIMIT))) {
      return res.status(429).json({ error: 'Too many at once. Try again in a minute.' });
    }

    const b = req.body || {};
    if (b.action === 'create') {
      const made = await createTeam(parseName(b.team), parseName(b.name));
      return res.status(200).json(made);
    }
    if (!isTeamId(b.id)) return res.status(400).json({ error: 'That isn’t a team code.' });

    if (b.action === 'join') {
      const joined = await joinTeam(b.id, parseName(b.name));
      if (!joined) return res.status(404).json({ error: GONE });
      if (joined === 'full') return res.status(409).json({ error: 'This team run is full.' });
      return res.status(200).json({ id: b.id, ...joined });
    }
    if (b.action === 'add') {
      const events = parseEvents(b.events);
      if (!(await addEvents(b.id, b.member, b.secret, events))) return res.status(404).json({ error: GONE });
      return res.status(204).end();
    }
    if (b.action === 'leave') {
      await leaveTeam(b.id, b.member, b.secret);
      return res.status(204).end();
    }
    return res.status(400).json({ error: 'bad action' });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Couldn’t reach the team run right now. Please try again.' });
  }
}
