// A feat link's card (api/_lib/share-links.js, kind 'feat'): the picture a chat app or social
// shows for /feat/<id>, and the one the app's share card shows and sends (js/share.js).
//
//   One feat     its name and what was done, on its colour, with a pip for each feat (the
//                ones done filled in), how many are done, and who did it and when.
//   Achievements every feat as a tile, the ones done in their colours, under how many.
//
// Drawn by @vercel/og (Satori, then resvg) at CARD_W × CARD_H (api/_lib/share-links.js).
// In Jua, the app's own font, fetched from Google Fonts for only the letters on the card; the
// package's own font if that can't be had. English, as every share link's page is.

import { ImageResponse } from '@vercel/og';
import { CARD_H, CARD_W, FEATS, featCount, featDay } from './share-links.js';

const BRAND = '#1f6b3d'; // style.css's --brand-ink, light
const DARK = '#0b0f0d';

// An element, as Satori takes them: Satori lays out with flexbox only, so every box is one.
const h = (style, children = []) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

// `c` mixed with DARK, `k` of the way: dark enough for white text on every feat's colour.
function shade(c, k) {
  const n = parseInt(c.slice(1), 16);
  const d = parseInt(DARK.slice(1), 16);
  const mix = (s) => Math.round(((n >> s) & 255) * (1 - k) + ((d >> s) & 255) * k);
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

const pill = (text) => h({ padding: '10px 26px', borderRadius: 999, background: 'rgba(255,255,255,0.18)', letterSpacing: 2 }, text);

const top = (label) => h({ justifyContent: 'space-between', alignItems: 'center', fontSize: 30 }, [
  pill(label),
  h({ opacity: 0.85 }, 'SG Bus Timings'),
]);

function featCard(data) {
  const f = FEATS[data.feat];
  const ids = Object.keys(FEATS);
  const pips = ids.map((id) => h({
    width: id === data.feat ? 34 : 26,
    height: id === data.feat ? 34 : 26,
    borderRadius: 999,
    marginRight: 12,
    ...(data.done.includes(id) ? { background: 'white' } : { border: '4px solid rgba(255,255,255,0.45)' }),
  }));
  const by = [data.name, data.on && featDay(data.on)].filter(Boolean).join(' · ');
  return h({
    flexDirection: 'column', width: '100%', height: '100%', padding: 64, color: 'white',
    backgroundImage: `linear-gradient(135deg, ${shade(f.colour, 0.38)}, ${shade(f.colour, 0.66)})`,
  }, [
    top('FEAT DONE'),
    h({ flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
      h({ fontSize: f.name.length > 18 ? 92 : 108, lineHeight: 1.05 }, f.name),
      h({ fontSize: 40, marginTop: 22, opacity: 0.9, lineHeight: 1.25 }, f.did),
    ]),
    h({ justifyContent: 'space-between', alignItems: 'center', fontSize: 30 }, [
      h({ alignItems: 'center' }, [...pips, h({ marginLeft: 8, opacity: 0.9 }, featCount(data))]),
      h({ opacity: 0.9 }, by),
    ]),
  ]);
}

function achievementsCard(data) {
  const tiles = Object.entries(FEATS).map(([id, f]) => {
    const done = data.done.includes(id);
    return h({
      width: 344, height: 104, marginRight: 20, marginBottom: 20, padding: '0 26px', borderRadius: 22, alignItems: 'center', fontSize: 32,
      ...(done
        ? { background: shade(f.colour, 0.3) }
        : { border: '3px dashed rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.5)' }),
    }, f.name);
  });
  return h({
    flexDirection: 'column', width: '100%', height: '100%', padding: 64, color: 'white',
    backgroundImage: `linear-gradient(135deg, ${shade(BRAND, 0.15)}, ${shade(BRAND, 0.7)})`,
  }, [
    top('ACHIEVEMENTS'),
    h({ flexDirection: 'column', marginTop: 34 }, [
      ...(data.name ? [h({ fontSize: 40, opacity: 0.9 }, `${data.name}’s feats`)] : []),
      h({ fontSize: 84, lineHeight: 1.1 }, featCount(data)),
    ]),
    h({ flexWrap: 'wrap', marginTop: 'auto', marginRight: -20, marginBottom: -20 }, tiles),
  ]);
}

// Every letter on the card, so the font fetched has them and no more.
const lettersOf = (node) => (typeof node === 'string' ? node : [].concat(node?.props?.children ?? []).map(lettersOf).join(''));

// Jua for these letters, as Google Fonts gives it to a client that isn't a browser: TrueType,
// which Satori reads (it can't read WOFF2). Kept while the function's warm.
const fonts = new Map();
async function jua(text) {
  const letters = [...new Set(text)].sort().join('');
  if (!fonts.has(letters)) {
    fonts.set(letters, (async () => {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Jua&text=${encodeURIComponent(letters)}`)).text();
      const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
      if (!src) throw new Error('no Jua');
      const r = await fetch(src);
      if (!r.ok) throw new Error(`Jua: ${r.status}`);
      return r.arrayBuffer();
    })());
    fonts.get(letters).catch(() => fonts.delete(letters));
  }
  return fonts.get(letters);
}

// The card for a feat link's data, as a PNG.
export async function featCardPng(data) {
  const card = data.feat && FEATS[data.feat] ? featCard(data) : achievementsCard(data);
  let font = null;
  try {
    font = await jua(lettersOf(card));
  } catch (err) {
    console.warn(err);
  }
  const img = new ImageResponse(
    { ...card, props: { ...card.props, style: { ...card.props.style, fontFamily: font ? 'Jua' : undefined } } },
    { width: CARD_W, height: CARD_H, ...(font && { fonts: [{ name: 'Jua', data: font, weight: 400, style: 'normal' }] }) }
  );
  return Buffer.from(await img.arrayBuffer());
}
