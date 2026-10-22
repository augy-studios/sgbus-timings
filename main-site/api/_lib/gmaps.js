// Google Maps links as nav ends, for /api/places: a link pasted or shared in, alone or in the
// text Google Maps shares ("ION Orchard\nhttps://maps.app.goo.gl/..."), read for where it
// points. Short links (maps.app.goo.gl, goo.gl/maps) are followed to the full link first.
//
// A full link carries the place's own pin (!3d<lat>!4d<lng>), coordinates in a parameter or
// the path, or only a name and address ("?q=ION+Orchard,+2+Orchard+Turn,+Singapore+238801"),
// which is looked up on OneMap, by its postal code where it has one.

import { addressOf, search, titleCase } from "./onemap.js";

const LINK_RE = /(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps|maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?\/?)[^\s<>"]*/i;
// Only Google's own hosts are fetched, so a link can't send this function anywhere else.
const GOOGLE_HOST_RE = /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.|consent\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?)$/i;
const MAX_HOPS = 5;
const LATLNG_RE = /^\s*(?:loc:\s*)?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;
// Singapore with a margin: the nav plans nowhere else. Typed coordinates and plus codes are
// held to it too (points.js).
export const inSingapore = (lat, lng) => lat > 1.1 && lat < 1.5 && lng > 103.55 && lng < 104.15;

export class MapsLinkError extends Error {}

// The Google Maps link in `text`, and whatever else was shared with it; null if there's none.
export function findMapsLink(text) {
  const m = String(text).match(LINK_RE);
  if (!m) return null;
  // Not the full stop or bracket a link in a sentence ends with.
  const link = m[0].replace(/[).,!?]+$/, "");
  const href = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  // The name and address shared on lines of their own read as "ION Orchard, 2 Orchard Turn".
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    .split(/\n+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");
  return { href, rest };
}

// { kind, label, sub, lat, lng } for a link from findMapsLink(); throws MapsLinkError, with a
// message for the user, when it can't be placed.
export async function placeFromMapsLink({ href, rest }) {
  const url = await expand(href);
  const read = url ? readUrl(url) : {};
  const shared = rest && !/^https?:/i.test(rest) ? rest : "";
  const name = nameOf(read.name) || nameOf(read.text) || nameOf(shared);

  if (read.lat != null) {
    if (!inSingapore(read.lat, read.lng)) throw new MapsLinkError("That Google Maps link points outside Singapore.");
    return { kind: "place", label: name || "Place from Google Maps", sub: "From Google Maps", lat: read.lat, lng: read.lng };
  }

  const text = read.text || read.name || shared;
  if (!text) {
    throw new MapsLinkError(url
      ? "Couldn't tell where that Google Maps link points. Try typing the place's name instead."
      : "Couldn't open that Google Maps link. Check it's complete, or type the place's name instead.");
  }
  // A postal code pins a building exactly; otherwise the whole name and address, then the name.
  const postal = text.match(/\b(\d{6})\b/)?.[1];
  let failed = false;
  for (const q of [postal, text, firstPart(text)].filter(Boolean)) {
    const hit = (await search(q).catch(() => { failed = true; return []; })).find((h) => h.LATITUDE && h.LONGITUDE);
    if (!hit) continue;
    const lat = Number(hit.LATITUDE);
    const lng = Number(hit.LONGITUDE);
    const building = hit.BUILDING && hit.BUILDING !== "NIL" ? titleCase(hit.BUILDING) : "";
    return { kind: "place", label: name || building || addressOf(hit), sub: "From Google Maps", lat, lng };
  }
  if (failed) throw new MapsLinkError("Couldn't look up that Google Maps place right now. Please try again shortly.");
  throw new MapsLinkError(`Couldn't find “${nameOf(text)}” in Singapore. Try typing the place's name or postal code instead.`);
}

// A short link followed to the full one it stands for, without fetching the map page itself;
// null if it goes nowhere.
async function expand(href) {
  try {
    let url = new URL(href);
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (!GOOGLE_HOST_RE.test(url.hostname)) return null;
      // The cookie consent page some regions get sends you on with the real link in `continue`.
      if (/^consent\./i.test(url.hostname)) {
        url = new URL(url.searchParams.get("continue"));
        continue;
      }
      if (!/^(?:maps\.app\.)?goo\.gl$/i.test(url.hostname)) return url;
      const r = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      const location = r.headers.get("location");
      if (!location) return null;
      url = new URL(location, url);
    }
  } catch {
    // A broken link, or a short link that didn't answer.
  }
  return null;
}

// What a full Google Maps link says: { lat, lng } where it has the place's coordinates, and
// the place's name and searchable text where it has those.
function readUrl(url) {
  const decode = (s) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, " ")).trim();
    } catch {
      return s.trim();
    }
  };
  const latLng = (s) => {
    const m = s?.match(LATLNG_RE);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  };
  const out = {};
  const segments = url.pathname.split("/").filter(Boolean).map(decode);
  const after = (word) => {
    const i = segments.indexOf(word);
    return i >= 0 && segments[i + 1] && !segments[i + 1].startsWith("@") && !segments[i + 1].startsWith("data=") ? segments[i + 1] : null;
  };

  // The text: the destination of directions, a search, or a place by name.
  const params = ["destination", "daddr", "q", "query"].map((k) => url.searchParams.get(k)).filter(Boolean);
  const dirTo = segments.includes("dir")
    ? segments.slice(segments.indexOf("dir") + 1).filter((s) => !s.startsWith("@") && !s.startsWith("data=")).pop()
    : null;
  const texts = [...params, dirTo, after("search")].filter(Boolean);
  const place = after("place");
  if (place && !latLng(place)) out.name = place;
  const words = texts.find((t) => !latLng(t));
  if (words) out.text = words;

  // The coordinates, most exact first: the place's own pin; a direction's last stop; any
  // given as text; then, last, where the map was looking.
  const pins = [...url.href.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  const stops = segments.includes("dir") ? [...url.href.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)] : [];
  const given = [...texts, place, url.searchParams.get("ll"), url.searchParams.get("center")].map(latLng).find(Boolean);
  const view = segments.map((s) => s.match(/^@(-?\d+\.\d+),(-?\d+\.\d+)/)).find(Boolean);
  const pin = pins.at(-1);
  const stop = stops.at(-1);
  const at = pin ? { lat: Number(pin[1]), lng: Number(pin[2]) }
    : stop ? { lat: Number(stop[2]), lng: Number(stop[1]) }
    : given || (view ? { lat: Number(view[1]), lng: Number(view[2]) } : null);
  // Only a link with no words at all falls back on where the map was looking: a search's view
  // is wherever the person sharing it happened to be.
  if (at && (pin || stop || given || !out.text)) Object.assign(out, at);
  return out;
}

// "ION Orchard" from "ION Orchard, 2 Orchard Turn, Singapore 238801".
function firstPart(text) {
  return text ? text.split(/,|\n/)[0].trim() : "";
}

// A place's name out of the address Google gives for it, to label the end with: the first part
// that isn't the street address or "Singapore 238826", less any unit number. "Takagi Ramen @
// Dhoby Ghaut Exchange" from "11 Orchard Rd, B1-11 Takagi Ramen @ Dhoby Ghaut Exchange, DHOBY
// GHAUT MRT STATION MRT Exit B, Singapore 238826"; just the address where that's all there is.
function nameOf(text) {
  const parts = (text || "").split(/,|\n/).map((s) => s.trim())
    .filter((s) => s && !/^singapore(\s+\d{6})?$/i.test(s))
    .map((s) => s.replace(/^#?[A-Z]?\d{1,3}-\d{1,4}[A-Z]?\s+/i, ""));
  return parts.find((s) => !/^\d/.test(s)) || parts[0] || "";
}
