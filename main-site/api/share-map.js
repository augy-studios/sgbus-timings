// The map for a share link (api/_lib/share-links.js): OneMap's static map of it, passed
// through so a chat app's preview and the app's share card load it from here. A place or
// directions link never changes, so its map is cached for a day; an ETA link's moves, so
// it's asked for with ?v=<when it was updated> and kept only briefly.

import { supabaseConfigured } from './_lib/supabase.js';
import { getLink, isLinkId, mapUrl } from './_lib/share-links.js';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!supabaseConfigured()) return res.status(503).end();
  if (!isLinkId(id)) return res.status(400).end();
  try {
    const link = await getLink(id);
    if (!link) return res.status(404).end();
    const r = await fetch(mapUrl(link));
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return res.status(502).end();
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', link.kind === 'eta' ? 'public, max-age=30' : 'public, max-age=86400, s-maxage=604800');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (err) {
    console.error(err);
    return res.status(502).end();
  }
}
