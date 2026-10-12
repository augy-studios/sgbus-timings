// What a share link opens: /go/<id>, /trip/<id> and /eta/<id> come here (vercel.json). A
// chat app reading it for a preview gets the link's title, a line about it and its map; a
// person is sent straight on to the app, at #share/<id>, which shows the place, the
// directions or the live progress (js/share.js).
//
// The page also carries the link's details in an <article>, for Telegram's Instant View
// (telegram-instant-view.txt, TELEGRAM_IV_SETUP.md). Nothing reads it but crawlers: people are
// sent on by the script before it shows. There's no meta refresh, as Instant View's crawler
// would follow it to the app, which has nothing for it to read.

import { supabaseConfigured } from './_lib/supabase.js';
import { IV_KINDS, PATHS, describeLink, getLink, isLinkId, sgDateTime, whenText } from './_lib/share-links.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const endText = (p) => (p === 'here' ? 'Wherever you are when you open it' : p.label);

// Where an ETA link's sharer was on their trip, as the app says it (renderView in js/share.js).
function legText(d) {
  const leg = d.leg;
  if (!leg?.label) return null;
  const now = leg.kind === 'walk'
    ? `Walking to ${leg.to}`
    : `On ${leg.label}: ${leg.stopsLeft === 0 ? `at ${leg.to}` : `${leg.stopsLeft} stop${leg.stopsLeft === 1 ? '' : 's'} to ${leg.to}`}`;
  return d.legCount > 1 ? `${now} (leg ${d.legIndex + 1} of ${d.legCount})` : now;
}

// Each kind's details: the cover's caption, the rows, a line about the app, and its link.
function details(link) {
  const d = link.data;
  if (link.kind === 'place') {
    return {
      caption: 'The place on the map',
      heading: 'The place',
      rows: [['Where', d.label]],
      note: 'Open it for directions by bus and train from wherever you are, with live bus timings on the way.',
      open: 'Get directions in SG Bus Timings',
    };
  }
  if (link.kind === 'directions') {
    return {
      caption: d.path ? 'The way on the map' : 'Both ends on the map',
      heading: 'The trip',
      rows: [['From', endText(d.from)], ['To', endText(d.to)], ['When', whenText(d.when)]],
      note: 'Open them for live bus timings, the other ways there, and a Get Off Alert on the way.',
      open: 'Open these directions in SG Bus Timings',
    };
  }
  // An ETA changes as the sharer goes, and Telegram keeps the Instant View it made, so it
  // says when it's from and sends people to the app for the live one.
  const live = !d.ended && !d.stopped;
  const as = sgDateTime(link.updatedAt);
  const leg = live ? legText(d) : null;
  return {
    caption: live ? 'Where they were on the map' : 'Where they were going',
    heading: 'The trip',
    rows: [
      ['Going to', d.to.label],
      ...(d.stopped ? [['Stopped sharing', as]] : d.ended ? [['Arrived', as]] : [['Arriving around', sgDateTime(d.arriveAt)]]),
      ...(leg ? [['Where they were', leg]] : []),
      ...(live ? [['As of', as]] : []),
    ],
    note: live ? `This is how the trip stood at ${as}. Open it for live progress, updated as they go.` : 'Open it to see the trip in SG Bus Timings.',
    open: live ? 'Follow this trip live in SG Bus Timings' : 'Open this trip in SG Bus Timings',
  };
}

// What the page shows: the link's details where Instant View is set up for its kind, else
// just the way on to the app.
function body(link, { title, description }, image, target, origin) {
  if (!link || !IV_KINDS.includes(link.kind)) return `<p><a href="${esc(target)}">Open in SG Bus Timings</a></p>`;
  const { caption, heading, rows, note, open } = details(link);
  return `<header>
<h1>${esc(title)}</h1>
<h2 class="subtitle">${esc(description)}</h2>
<figure class="cover"><img src="${esc(image)}" alt="${esc(caption)}" width="512" height="256"><figcaption>${esc(caption)}</figcaption></figure>
</header>
<article id="${PATHS[link.kind]}">
<h3>${esc(heading)}</h3>
<ul>
${rows.map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join('\n')}
</ul>
<p>${esc(note)}</p>
<p><a href="${esc(origin + target)}">${esc(open)}</a></p>
</article>`;
}

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
  const about = link
    ? describeLink(link)
    : { title: 'SG Bus Timings', description: 'Live bus arrivals, routes and directions by bus and train in Singapore.' };
  const { title, description } = about;
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
<meta property="og:type" content="${link && IV_KINDS.includes(link.kind) ? 'article' : 'website'}">
<meta property="og:site_name" content="SG Bus Timings">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(link ? `${origin}/${PATHS[link.kind]}/${id}` : origin)}">
<meta property="og:image" content="${esc(image)}">
${link ? '<meta property="og:image:width" content="512">\n<meta property="og:image:height" content="256">\n<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">'}
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
${body(link, about, image, target, origin)}
</body>
</html>
`);
}
