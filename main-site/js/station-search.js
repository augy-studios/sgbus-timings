// MRT and LRT stations and their exits, so a search for "Bedok MRT" or "Senja LRT" lists the
// bus stops at the station. LTA names those stops "Bedok Stn", or after a block or a road,
// never "MRT", so they're found by how close they are to an exit instead. The same as the
// Telegram bot's stations.py and bus_stops_at_station.
//
// The stations are /data/rail-stations.json, from sgraildata (scripts/vendor-rail.mjs),
// fetched with the stop list (StationSearch.load). Until it's in, a search for a station is
// a search of stop names like any other.
// Plain script: this project does not use ES modules, so it goes on window.
(function () {
  // How far from an exit a stop can be and still count as at the station: across the road
  // and a little way along it.
  const RADIUS_M = 250;
  // "Bedok MRT", "Bedok MRT station", "Senja LRT", "Bedok station". Not "Bedok Stn": that's
  // how LTA names stops, so it stays a search of their names.
  const QUERY_RE = /^(.+?)\s+(?:(?:mrt|lrt)(?:\s+(?:station|stn))?|station)\.?$/i;
  // Line code prefixes of the LRT lines: Bukit Panjang, Sengkang and Punggol.
  const LRT_PREFIXES = ['BP', 'SW', 'SE', 'STC', 'PW', 'PE', 'PTC'];

  let stations = null;
  let loading = null;

  function load() {
    loading ??= fetch('/data/rail-stations.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => { stations = data.stations; })
      .catch(() => { loading = null; });
    return loading;
  }

  const nameKey = (s) => s.toLowerCase().replace(/'/g, '').split(/\s+/).filter(Boolean).join(' ');

  // The station a search like "Bedok MRT" asks for: the one of that name, or else the only
  // one whose name starts with it ("Botanic MRT"). Null for any other search, one that could
  // be several stations, or before the stations are in.
  function find(query) {
    const m = stations && query.trim().match(QUERY_RE);
    if (!m) return null;
    const wanted = nameKey(m[1]);
    const exact = stations.find((s) => nameKey(s.name) === wanted);
    if (exact) return exact;
    const starts = stations.filter((s) => nameKey(s.name).startsWith(wanted));
    return starts.length === 1 ? starts[0] : null;
  }

  // "Bedok MRT station", "Senja LRT station", or both for an interchange like Choa Chu Kang.
  function label(station) {
    const lrt = station.codes.some((c) => LRT_PREFIXES.some((p) => c.startsWith(p)));
    const mrt = station.codes.some((c) => !LRT_PREFIXES.some((p) => c.startsWith(p)));
    return `${station.name} ${lrt && mrt ? 'MRT/LRT' : lrt ? 'LRT' : 'MRT'} station`;
  }

  // Each station's stops, worked out once per stop list rather than on every keystroke.
  let made = new WeakMap();
  let madeFor = null;

  // The stops within RADIUS_M of any of the station's exits (or the station itself, where
  // none are known), nearest first, as { code, distance } from the closest exit.
  function stopsAt(station, stopsIndex, distance) {
    if (madeFor !== stopsIndex) { made = new WeakMap(); madeFor = stopsIndex; }
    if (!made.has(station)) made.set(station, work(station, stopsIndex, distance));
    return made.get(station);
  }

  function work(station, stopsIndex, distance) {
    const points = station.exits.length ? station.exits : [[station.lat, station.lng]];
    const out = [];
    for (const [code, s] of Object.entries(stopsIndex || {})) {
      const ds = points.map(([lat, lng]) => distance(lat, lng, s.lat, s.lng)).filter((d) => d != null);
      const d = ds.length ? Math.min(...ds) : null;
      if (d != null && d <= RADIUS_M) out.push({ code, distance: d });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  // Every station, once they're in (null before): Navigate's places offline (js/nav.js).
  const all = () => stations;

  window.StationSearch = { load, find, label, stopsAt, all };
})();
