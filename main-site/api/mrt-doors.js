// Where to stand on an MRT or LRT train for the escalators, lifts and stairs at each station,
// for Navigate's train rides (js/mrt-doors.js): every platform in the mrtinfo tables on
// Supabase, with its station and the doors nearest each of its facilities.
//
// The tables (one row each):
//   mrtinfo_stations    name_en, allCodes ...
//   mrtinfo_platforms   station, line, direction ("EW-1"), order (how many stops into that
//                       direction it is), code ("EW24"), crossPlatform (the directions across
//                       the platform), isOpen
//   mrtinfo_facilities  platform, type (escalator | lift | stairs), towards ("exit/DT-11/Jewel"), doors
//                       (counted from the front of the train)
// Not every station has its facilities in yet; a platform without any still says which way
// it goes and what's across it.
//
// Answers { platforms: [{ c, l, d, o, x, n, f: [{ t, to, doors }] }] }, short keys as it goes to
// every phone that opens Navigate. The data changes rarely, so a day at the edge keeps
// Supabase asked about once a day.
//
// MRTINFO_SUPABASE_URL and MRTINFO_SUPABASE_KEY where the tables are in a project of their own,
// otherwise the share links' (api/_lib/supabase.js). Server-side only.

const BASE = (process.env.MRTINFO_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.MRTINFO_SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

const SELECT = 'code,line,direction,order,crossPlatform,isOpen,station:mrtinfo_stations(name_en),mrtinfo_facilities(type,towards,doors)';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!BASE || !KEY) return res.status(503).json({ error: 'MRT door data is not set up' });

  try {
    const r = await fetch(`${BASE}/rest/v1/mrtinfo_platforms?select=${encodeURIComponent(SELECT)}&limit=10000`, {
      headers: {
        apikey: KEY,
        // As api/_lib/supabase.js: an older JWT key goes here too, a newer sb_ key doesn't.
        ...(KEY.startsWith('eyJ') && { Authorization: `Bearer ${KEY}` }),
      },
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`mrtinfo_platforms: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    const platforms = rows
      .filter((p) => p.isOpen !== false && p.code && p.line && p.direction)
      .map((p) => ({
        c: p.code,
        l: p.line,
        d: p.direction,
        o: p.order,
        x: p.crossPlatform || [],
        n: p.station?.name_en || '',
        f: (p.mrtinfo_facilities || [])
          .filter((f) => f.type && Array.isArray(f.doors) && f.doors.length)
          .map((f) => ({ t: f.type, to: f.towards || '', doors: f.doors })),
      }));
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ platforms });
  } catch (err) {
    console.error('mrt-doors failed:', err);
    return res.status(502).json({ error: "Couldn't get the MRT door data" });
  }
}
