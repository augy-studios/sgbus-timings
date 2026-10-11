// A calendar's private iCal link, read for js/calendar.js: POST { url } answers the calendar
// as text/calendar. Google, Outlook and iCloud don't let a page read their links itself, so it
// comes through here.
//
// The link is as good as a password to the calendar, so it's sent in the body, not the query
// (which request logs keep), and it's neither stored nor logged: not even on an error. Only
// https links (webcal:// is https) to public hosts are followed, redirects included, and only
// an answer that is a calendar, up to MAX_BYTES, is passed back.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { rateLimited, storeConfigured } from './_push/store.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const RATE_LIMIT = 30; // reads per IP per minute

class LinkError extends Error {}

// Loopback, private, link-local, carrier-grade NAT and the like: nowhere a calendar lives.
function isPrivate(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function checkUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new LinkError("That isn't a link. Paste your calendar's iCal (.ics) link.");
  }
  if (url.protocol !== 'https:') throw new LinkError('Calendar links have to start with https:// or webcal://.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) || host === 'localhost' || /\.(local|internal|localhost)$/i.test(host)) throw new LinkError("That link doesn't go to a calendar service.");
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new LinkError("Couldn't reach that calendar. Check the link.");
  if (addresses.some((a) => isPrivate(a.address))) throw new LinkError("That link doesn't go to a calendar service.");
  return url;
}

async function readCalendar(raw) {
  let url = await checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'text/calendar, */*;q=0.5', 'User-Agent': 'SG Bus Timings calendar reader' },
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = await checkUrl(new URL(r.headers.get('location'), url).href);
      continue;
    }
    if (r.status === 401 || r.status === 403 || r.status === 404) {
      throw new LinkError("The calendar service turned that link down. It may have been reset: copy the private iCal link again.");
    }
    if (!r.ok) throw new LinkError(`The calendar service didn't answer properly (${r.status}). Try again later.`);
    if (Number(r.headers.get('content-length')) > MAX_BYTES) throw new LinkError('That calendar is too big to read here. Try importing a smaller .ics file instead.');
    const body = await r.arrayBuffer();
    if (body.byteLength > MAX_BYTES) throw new LinkError('That calendar is too big to read here. Try importing a smaller .ics file instead.');
    const text = new TextDecoder().decode(body);
    if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new LinkError("That link isn't a calendar. Use the iCal (.ics) link, not the calendar's web page.");
    return text;
  }
  throw new LinkError('That link redirects too many times.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (storeConfigured() && (await rateLimited(`calendar:${ip}`, RATE_LIMIT))) {
    return res.status(429).json({ error: 'Too many calendar reads at once. Try again in a minute.' });
  }
  const url = req.body?.url;
  if (typeof url !== 'string' || !url.trim() || url.length > 2000) return res.status(400).json({ error: 'Paste your calendar\'s iCal link.' });

  try {
    const text = await readCalendar(url);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    if (err instanceof LinkError) return res.status(422).json({ error: err.message });
    // The link itself stays out of the log, since it unlocks the calendar.
    console.warn('calendar read failed:', err?.name || 'error');
    return res.status(502).json({ error: "Couldn't read that calendar right now. Check your connection and try again." });
  }
}
