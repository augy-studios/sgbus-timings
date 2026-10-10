// What a share link opens: /go/<id>, /trip/<id> and /eta/<id> come here (vercel.json). A
// chat app reading it for a preview gets the link's title, a line about it and its map; a
// person is sent straight on to the app, at #share/<id>, which shows the place, the
// directions or the live progress (js/share.js).

import { supabaseConfigured } from './_lib/supabase.js';
import { PATHS, describeLink, getLink, isLinkId } from './_lib/share-links.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default async function handler(req, res) {
  const { id } = req.query;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;

  let link = null;
  if (isLinkId(id) && supabaseConfigured()) {
    try {
      link = await getLink(id);
    } catch (err) {
      console.error(err);
    }
  }

  // Without a link the app still opens, and says it's gone.
  const target = isLinkId(id) ? `/#share/${id}` : '/';
  const { title, description } = link
    ? describeLink(link)
    : { title: 'SG Bus Timings', description: 'Live bus arrivals, routes and directions by bus and train in Singapore.' };
  const image = link ? `${origin}/api/share-map?id=${id}${link.kind === 'eta' ? `&v=${link.updatedAt}` : ''}` : `${origin}/sgbusicon1.png`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', link?.kind === 'eta' || !link ? 'no-store' : 'public, max-age=300, s-maxage=86400');
  res.status(link || !isLinkId(id) ? 200 : 404).send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SG Bus Timings">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(link ? `${origin}/${PATHS[link.kind]}/${id}` : origin)}">
<meta property="og:image" content="${esc(image)}">
${link ? '<meta property="og:image:width" content="512">\n<meta property="og:image:height" content="256">\n<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">'}
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p><a href="${esc(target)}">Open in SG Bus Timings</a></p>
</body>
</html>
`);
}
