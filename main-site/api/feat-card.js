// A feat link's card (api/_lib/feat-card.js), in place of a map: for a chat app's or a
// social's preview of /feat/<id> (api/share-page.js), and for the app's share card, which
// shows it and sends it as a picture (js/share.js). A feat link never changes, so it's kept
// as long as a place's map is.

import { supabaseConfigured } from './_lib/supabase.js';
import { getLink, isLinkId } from './_lib/share-links.js';
import { featCardPng } from './_lib/feat-card.js';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!supabaseConfigured()) return res.status(503).end();
  if (!isLinkId(id)) return res.status(400).end();
  try {
    const link = await getLink(id);
    if (link?.kind !== 'feat') return res.status(404).end();
    const png = await featCardPng(link.data);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).send(png);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}
