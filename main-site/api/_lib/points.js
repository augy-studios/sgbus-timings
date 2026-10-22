// Typed GPS coordinates and plus codes as nav ends, for /api/places: "1.35, 103.85",
// "1.35 103.85" or "1.35N 103.85E", and a plus code, full ("6PH57RQ8+X2") or short
// ("7RQ8+X2", or "7RQ8+X2 Singapore" as Google Maps gives it), a short one placed as the
// nearest code to Singapore.
//
// Plus codes are read with Google's Open Location Code library (Apache-2.0), vendored in
// vendor/open-location-code/ from github.com/google/open-location-code at commit 83986da0
// (20 June 2025), js/src/openlocationcode.js unchanged but for the .cjs name, which Node needs
// to load it as CommonJS in this ES module project.

import OpenLocationCode from "../../vendor/open-location-code/openlocationcode.cjs";
import { inSingapore } from "./gmaps.js";

// Decimal degrees only, both with a decimal point, so "12 34" is still a search. Each may
// have a degree sign and N, S, E or W, before or after it.
const COORDS_RE = /^([NS])?\s*(-?\d{1,2}\.\d+)\s*°?\s*([NS])?\s*(?:,\s*|\s+)([EW])?\s*(-?\d{1,3}\.\d+)\s*°?\s*([EW])?$/i;
// A plus code, alone or with the place Google Maps names after it. Its own characters only, so
// no word is taken for one.
const PLUS_CODE_RE = /^([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]*)(?:[\s,]+\S.*)?$/i;
// Short codes are recovered as the nearest code to here. Four characters cut (7RQ8+X2) leave
// a cell a degree across, which all of Singapore is well inside; any more and the cell is
// smaller than Singapore, so the code could be anywhere in it.
const SINGAPORE = { lat: 1.35, lng: 103.82 };
const MIN_SHORT_DIGITS = 4;
// 8 digits is a cell about 275 m across; a padded code ("6PH50000+") is far bigger.
const MIN_DIGITS = 8;

export class PointError extends Error {}

// { kind, label, sub, lat, lng } for coordinates or a plus code; null for anything else, to
// be searched as usual, including a code that's still being typed or can't be placed. Throws
// PointError, with a message for the user, only for a whole point outside Singapore.
export function findPoint(text) {
  const q = String(text).trim();

  const c = q.match(COORDS_RE);
  if (c) {
    if ((c[1] && c[3]) || (c[4] && c[6])) return null;
    const lat = Number(c[2]) * (/s/i.test(c[1] || c[3] || "") ? -1 : 1);
    const lng = Number(c[5]) * (/w/i.test(c[4] || c[6] || "") ? -1 : 1);
    if (!inSingapore(lat, lng)) throw new PointError("Those coordinates are outside Singapore.");
    return { kind: "place", label: `${lat}, ${lng}`, sub: "Coordinates", lat, lng };
  }

  const p = q.match(PLUS_CODE_RE);
  if (p) {
    const typed = p[1].toUpperCase();
    if (!OpenLocationCode.isValid(typed)) return null;
    if (OpenLocationCode.isShort(typed) && typed.indexOf("+") < MIN_SHORT_DIGITS) return null;
    const full = OpenLocationCode.recoverNearest(typed, SINGAPORE.lat, SINGAPORE.lng);
    const area = OpenLocationCode.decode(full);
    if (area.codeLength < MIN_DIGITS) return null;
    const lat = area.latitudeCenter;
    const lng = area.longitudeCenter;
    if (!inSingapore(lat, lng)) throw new PointError("That plus code is outside Singapore.");
    return { kind: "place", label: typed, sub: full === typed ? "Plus code" : `Plus code ${full}`, lat, lng };
  }

  return null;
}
