// What the live map (js/map.js) draws with: MapLibre GL over OpenFreeMap's vector tiles, with
// the buildings in 3D, or failing that Leaflet over OpenStreetMap's own. Either way js/map.js
// asks for the same few things: lines, dots, discs and shapes in groups, the view, and turning.
//
//   MapEngine.open(el, hooks)  the map in `el`, once its code is in: a promise of the engine
//
// MapLibre (vendor/maplibre-4.7.1, 211 KB gzipped, only fetched when the map's first opened):
// - Styles: OpenFreeMap's Liberty in light mode, its Dark in dark mode with Liberty's 3D
//   buildings added (Dark has none). Two fingers dragged up or down tilt the map, and the
//   buildings stand up from zoom 15 or so; two fingers twisted turn it.
// - OpenStreetMap as the fallback: if OpenFreeMap's style doesn't come, or its tiles keep
//   failing while the phone's online, the map changes to OpenStreetMap's raster tiles (darkened
//   in dark mode) for the rest of this page view.
// - What it draws for js/map.js goes in three GeoJSON sources over the style, put back
//   whenever the style changes.
// Leaflet (vendor/leaflet) where there's no WebGL at all, or MapLibre won't start: the map as it
// was before, flat, north up, without turning.
//
// Explorer's stops and stations (js/map.js) are dots of their own, pois(list): every station
// from zoom 11, every stop from zoom 15. An interchange is a pill instead, its lines' colours
// side by side, left to right in the order js/map.js gives them. A tap on one, or on a dot drawn with a `pick`, goes to
// hooks.onPick(pick); a tap on the map elsewhere to hooks.onBlank(); hooks.onMove() as it moves,
// for a card kept on its dot (js/map-card.js).
//
// Explorer's MRT and LRT lines, rails(list), go under those dots and over the map's own: each
// line's track in its colour, a little wider the closer in, edged in white so a dark line still
// shows on the dark map.
//
// Everything's cached by sw.js: the library, the styles, fonts, sprites and every tile seen.
//
// Zooms here are Leaflet's (OpenStreetMap's 256-pixel tiles): MapLibre's are one less for the
// same scale, and this turns them.
// Plain script: exports go on window.
(function () {
  const ML_JS = '/vendor/maplibre-4.7.1/maplibre-gl.js';
  const ML_CSS = '/vendor/maplibre-4.7.1/maplibre-gl.css';
  const LEAFLET_JS = '/vendor/leaflet/leaflet.js';
  const LEAFLET_CSS = '/vendor/leaflet/leaflet.css';

  const OFM = 'https://tiles.openfreemap.org';
  const STYLE_LIGHT = `${OFM}/styles/liberty`;
  const STYLE_DARK = `${OFM}/styles/dark`;
  const OSM = {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };
  // Over Singapore and a little round it, [[south, west], [north, east]].
  const BOUNDS = [[0.9, 103.2], [1.8, 104.5]];
  const MIN_ZOOM = 10;
  // OpenFreeMap's style not in by then, or this many of its tiles failing in a row online:
  // OpenStreetMap instead.
  const STYLE_WAIT_MS = 10 * 1000;
  const FAILS_TO_FALL_BACK = 6;
  const TILE_RETRY_MS = 10 * 1000;
  // Drawn above everything else in its group: lines, then stops, marks and you.
  const ORDER = { lines: 0, stops: 1, marks: 2, me: 3 };
  // Explorer's dots: stations from here, stops from closer in (Leaflet's zooms).
  const POI_STATION_ZOOM = 11;
  const POI_STOP_ZOOM = 15;
  const STOP_DOT = { fill: '#ffffff', stroke: '#1f9d55' };
  // An interchange's pill: as tall as a station's dot with its white edge, and longer by 60% of
  // that for each line after the first. MapLibre's is drawn this tall and scaled down with the
  // zoom, its edge 2px where a dot's is 17px across, as at zoom 15.
  const PILL_H = 24;
  const pillWidth = (n, h) => h * (1 + 0.6 * (n - 1));

  // The pill on a canvas, `h` CSS pixels tall, drawn `ratio` times as big for sharp screens.
  function pillCanvas(colours, h, edge, ratio) {
    const w = pillWidth(colours.length, h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * ratio);
    c.height = Math.round(h * ratio);
    const g = c.getContext('2d');
    g.scale(ratio, ratio);
    const shape = (x, y, pw, ph) => {
      const r = ph / 2;
      g.beginPath();
      g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
      g.arc(x + pw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
      g.closePath();
    };
    shape(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fill();
    shape(edge, edge, w - 2 * edge, h - 2 * edge);
    g.clip();
    // Split on a slant, as the colours are on the MRT's signs: each boundary leans right, `lean`
    // either side of its middle. The ends run past the pill, and each colour a little past its
    // share, so no seam shows between them.
    const seg = (w - 2 * edge) / colours.length;
    const lean = h * 0.2;
    colours.forEach((colour, i) => {
      const x0 = i === 0 ? -h : edge + i * seg;
      const x1 = i === colours.length - 1 ? w + h : edge + (i + 1) * seg + 0.5;
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(x0 + lean, 0);
      g.lineTo(x1 + lean, 0);
      g.lineTo(x1 - lean, h);
      g.lineTo(x0 - lean, h);
      g.closePath();
      g.fill();
    });
    return c;
  }
  const pillRatio = () => Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  // MapLibre's name for a pill's image, and the colours back from it.
  const pillId = (colours) => `sg-pill-${colours.map((c) => c.slice(1)).join('-')}`;
  const pillColours = (id) => id.slice('sg-pill-'.length).split('-').map((c) => `#${c}`);
  // Explorer's lines, at Leaflet's zooms: [zoom, px] for the line itself, its edge one each
  // side more. Thin enough out at the island not to hide the streets, and under a station's dot
  // close in.
  const RAIL_WIDTHS = [[11, 2], [13, 3], [15, 4], [19, 7]];
  const railWidth = (z) => {
    const at = RAIL_WIDTHS.findIndex(([zz]) => z <= zz);
    if (at === -1) return RAIL_WIDTHS[RAIL_WIDTHS.length - 1][1];
    if (at === 0) return RAIL_WIDTHS[0][1];
    const [[z0, w0], [z1, w1]] = [RAIL_WIDTHS[at - 1], RAIL_WIDTHS[at]];
    return w0 + ((z - z0) / (z1 - z0)) * (w1 - w0);
  };

  function load(js, css) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = js;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Couldn't load the map. Check your connection and try again."));
      document.head.appendChild(script);
    });
  }

  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  const dark = () => document.documentElement.getAttribute('data-mode') === 'dark';

  // ---------- MapLibre ----------

  // OpenFreeMap's Dark, with Liberty's 3D buildings in its colours, over its flat ones.
  const BUILDINGS_3D = {
    id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    paint: {
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-color': 'hsl(240,4%,16%)',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0], 'fill-extrusion-opacity': 0.85,
    },
  };
  function addBuildings(map) {
    const layers = map.getStyle()?.layers || [];
    if (!map.getSource('openmaptiles')) return;
    // Liberty's own: a building with no height counts as flat, rather than a warning.
    if (map.getLayer('building-3d')) {
      map.setPaintProperty('building-3d', 'fill-extrusion-height', ['coalesce', ['get', 'render_height'], 0]);
      map.setPaintProperty('building-3d', 'fill-extrusion-base', ['coalesce', ['get', 'render_min_height'], 0]);
    }
    if (layers.some((l) => l.type === 'fill-extrusion')) return;
    const at = layers.findIndex((l) => l['source-layer'] === 'building');
    map.addLayer(BUILDINGS_3D, at === -1 ? undefined : layers[at + 1]?.id);
  }

  // OpenStreetMap's own tiles, as a style: the fallback. In dark mode, turned dark as the
  // Leaflet map's were, light for dark with the colours kept.
  function osmStyle() {
    const paint = dark() ? { 'raster-brightness-min': 0.9, 'raster-brightness-max': 0.1, 'raster-hue-rotate': 180, 'raster-contrast': -0.1 } : {};
    return {
      version: 8,
      sources: { osm: { type: 'raster', tiles: [OSM.url], tileSize: 256, maxzoom: OSM.maxZoom, attribution: OSM.attribution } },
      layers: [{ id: 'osm', type: 'raster', source: 'osm', paint }],
    };
  }

  function glEngine(el, hooks) {
    const ml = window.maplibregl;
    const ll = ([lat, lng]) => [lng, lat];
    const toGl = (z) => z - 1;
    const map = new ml.Map({
      container: el,
      style: dark() ? STYLE_DARK : STYLE_LIGHT,
      center: [103.8198, 1.3521],
      zoom: toGl(12),
      minZoom: toGl(MIN_ZOOM),
      maxZoom: toGl(20),
      maxBounds: [ll(BOUNDS[0]), ll(BOUNDS[1])],
      maxPitch: 60,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      fadeDuration: 0,
    });
    map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
    // An interchange's pill, drawn the first time it's wanted, and again after the style
    // changes. An icon OpenFreeMap's style names that its sprite hasn't got: nothing, rather
    // than a warning for each.
    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      if (e.id.startsWith('sg-pill-')) {
        const ratio = pillRatio();
        const c = pillCanvas(pillColours(e.id), PILL_H, (2 * PILL_H) / 17, ratio);
        map.addImage(e.id, c.getContext('2d').getImageData(0, 0, c.width, c.height), { pixelRatio: ratio });
        return;
      }
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    // What js/map.js has drawn: id -> { group, kind, geometry, props }.
    const items = new Map();
    let nextId = 1;
    let dirty = false;
    let flushing = null;
    let fallen = false;
    let fails = 0;
    let styled = false;

    const toFeature = (it, id) => ({ type: 'Feature', id, geometry: it.geometry, properties: { ...it.props, z: ORDER[it.group] ?? 0 } });

    // Into the sources as soon as they're there, tiles loading or not (isStyleLoaded() waits for
    // every tile, so a route cleared or a dot moved would wait on the map's streets). Mid-change
    // of style they aren't: addOverlays() flushes once it's in.
    function flush() {
      flushing = null;
      if (!dirty || !map.getSource('sg-dot')) return;
      dirty = false;
      const fc = { line: [], dot: [], fill: [] };
      for (const [id, it] of items) fc[it.kind].push(toFeature(it, id));
      for (const kind of Object.keys(fc)) map.getSource(`sg-${kind}`)?.setData({ type: 'FeatureCollection', features: fc[kind] });
    }
    function changed() {
      dirty = true;
      flushing ??= requestAnimationFrame(flush);
    }

    // Explorer's stops and stations, as one source under everything else drawn, and its lines
    // under them.
    let poiData = { type: 'FeatureCollection', features: [] };
    const poiPicks = new Map();
    let railData = { type: 'FeatureCollection', features: [] };

    // The sources and layers for what's drawn, over the style: put back each time it changes.
    function addOverlays() {
      const empty = { type: 'FeatureCollection', features: [] };
      for (const kind of ['fill', 'line', 'dot']) if (!map.getSource(`sg-${kind}`)) map.addSource(`sg-${kind}`, { type: 'geojson', data: empty });
      const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
      // Explorer's lines first, so every layer after is over them: the stops and stations, then
      // what's drawn.
      if (!map.getSource('sg-rail')) map.addSource('sg-rail', { type: 'geojson', data: railData });
      const railWidths = (more) => ['interpolate', ['linear'], ['zoom'], ...RAIL_WIDTHS.flatMap(([z, w]) => [toGl(z), w + more])];
      const railLayout = { 'line-cap': 'round', 'line-join': 'round' };
      add({
        id: 'sg-rail-edge', type: 'line', source: 'sg-rail', layout: railLayout,
        paint: { 'line-color': '#ffffff', 'line-width': railWidths(2), 'line-opacity': dark() ? 0.35 : 0.9 },
      });
      add({ id: 'sg-rail', type: 'line', source: 'sg-rail', layout: railLayout, paint: { 'line-color': ['get', 'color'], 'line-width': railWidths(0) } });
      if (!map.getSource('sg-poi')) map.addSource('sg-poi', { type: 'geojson', data: poiData });
      const grow = (small, big) => ['interpolate', ['linear'], ['zoom'], toGl(POI_STOP_ZOOM), small, toGl(19), big];
      add({
        id: 'sg-poi-stop', type: 'circle', source: 'sg-poi', minzoom: toGl(POI_STOP_ZOOM), filter: ['==', ['get', 'kind'], 'stop'],
        paint: { 'circle-radius': grow(3.5, 7), 'circle-color': STOP_DOT.fill, 'circle-stroke-color': STOP_DOT.stroke, 'circle-stroke-width': grow(2, 3) },
      });
      add({
        id: 'sg-poi-station', type: 'circle', source: 'sg-poi', minzoom: toGl(POI_STATION_ZOOM),
        filter: ['all', ['==', ['get', 'kind'], 'station'], ['!', ['has', 'pill']]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], toGl(POI_STATION_ZOOM), 3.5, toGl(15), 6.5, toGl(19), 10],
          'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
        },
      });
      // Interchanges: as tall as the dots beside them (radius and edge, 11px, 17px, 24px), and
      // level on the screen however the map's turned.
      add({
        id: 'sg-poi-pill', type: 'symbol', source: 'sg-poi', minzoom: toGl(POI_STATION_ZOOM),
        filter: ['all', ['==', ['get', 'kind'], 'station'], ['has', 'pill']],
        layout: {
          'icon-image': ['get', 'pill'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], toGl(POI_STATION_ZOOM), 11 / PILL_H, toGl(15), 17 / PILL_H, toGl(19), 1],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      });
      add({ id: 'sg-fill', type: 'fill', source: 'sg-fill', paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'opacity'] } });
      const line = (id, dash) => ({
        id, type: 'line', source: 'sg-line', filter: ['==', ['get', 'dash'], dash],
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'z'] },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], ...(dash && { 'line-dasharray': [0.4, 2.2] }) },
      });
      add(line('sg-line', false));
      add(line('sg-line-dash', true));
      add({
        id: 'sg-dot', type: 'circle', source: 'sg-dot',
        layout: { 'circle-sort-key': ['get', 'z'] },
        paint: {
          'circle-radius': ['get', 'radius'], 'circle-color': ['get', 'fill'], 'circle-opacity': ['get', 'fillOpacity'],
          'circle-stroke-color': ['get', 'stroke'], 'circle-stroke-width': ['get', 'weight'],
        },
      });
      dirty = true;
      flush();
    }
    map.on('style.load', () => {
      styled = true;
      fails = 0;
      addBuildings(map);
      addOverlays();
    });

    function fallBack(why) {
      if (fallen) return;
      fallen = true;
      console.warn('OpenFreeMap not answering, OpenStreetMap instead:', why);
      map.setStyle(osmStyle(), { diff: false });
    }
    // OpenFreeMap's style not in after a while (nothing cached and offline, or it's down).
    setTimeout(() => { if (!styled) fallBack('style'); }, STYLE_WAIT_MS);
    map.on('error', (e) => {
      if (fallen) return;
      const ofm = !e.sourceId || e.sourceId === 'openmaptiles' || e.sourceId === 'ne2_shaded';
      if (!styled) return fallBack(e.error?.message || 'style');
      if (ofm && navigator.onLine !== false && ++fails >= FAILS_TO_FALL_BACK) fallBack(e.error?.message || 'tiles');
    });
    map.on('sourcedata', (e) => { if (e.sourceId === 'openmaptiles' && e.tile) fails = 0; });

    // Tiles that failed are asked for again once the phone's back online, or a while after.
    let retry = null;
    function refetch() {
      clearTimeout(retry);
      retry = null;
      if (!el.isConnected || el.closest('[hidden]') || navigator.onLine === false) return;
      for (const [id, src] of Object.entries(map.getStyle()?.sources || {})) {
        if (id.startsWith('sg-')) continue;
        const s = map.getSource(id);
        if (s?.setTiles && src.tiles) s.setTiles(src.tiles);
        else if (s?.setUrl && src.url) s.setUrl(src.url);
      }
    }
    map.on('error', () => { retry ??= setTimeout(refetch, TILE_RETRY_MS); });
    window.addEventListener('online', refetch);

    // Light or dark with the page.
    new MutationObserver(() => {
      styled = false;
      if (fallen) map.setStyle(osmStyle(), { diff: false });
      else map.setStyle(dark() ? STYLE_DARK : STYLE_LIGHT, { diff: false });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });

    // A stop's or a place's name, on a tap (or under the pointer, with a mouse). A dot that says
    // what it is (a `pick`), or one of Explorer's, opens its card instead (hooks.onPick).
    const popup = new ml.Popup({ closeButton: false, closeOnClick: true, offset: 12, className: 'mapTip' });
    const tip = (e) => {
      const f = e.features?.find((x) => x.properties.label);
      if (!f) return;
      popup.setLngLat(f.geometry.coordinates).setText(f.properties.label).addTo(map);
    };
    const hover = matchMedia('(hover: hover)').matches;
    map.on('click', (e) => {
      const layers = ['sg-dot', 'sg-poi-station', 'sg-poi-pill', 'sg-poi-stop'].filter((id) => map.getLayer(id));
      // A finger's width round the tap, as the dots are small.
      const pad = 10;
      const hits = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers });
      const dot = hits.find((f) => f.layer.id === 'sg-dot' && f.properties.pick);
      const poi = hits.find((f) => f.layer.id === 'sg-poi-station' || f.layer.id === 'sg-poi-pill') || hits.find((f) => f.layer.id === 'sg-poi-stop');
      if (dot) return hooks.onPick?.(JSON.parse(dot.properties.pick));
      if (poi) return hooks.onPick?.(poiPicks.get(poi.properties.id));
      const label = hits.find((f) => f.layer.id === 'sg-dot' && f.properties.label);
      if (label) return tip({ features: [label] });
      hooks.onBlank?.();
    });
    if (hover) {
      map.on('mouseenter', 'sg-dot', (e) => { map.getCanvas().style.cursor = 'pointer'; if (!e.features?.[0]?.properties.pick) tip(e); });
      map.on('mouseleave', 'sg-dot', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      for (const id of ['sg-poi-station', 'sg-poi-pill', 'sg-poi-stop']) {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }
    }
    map.on('move', () => hooks.onMove?.());

    map.on('dragstart', () => hooks.onUserMove?.());
    map.on('zoomstart', (e) => { if (e.originalEvent) hooks.onUserZoom?.(); });
    map.on('rotate', () => hooks.onTurn?.(map.getBearing()));

    // A thing drawn: its id kept, so it can be moved or taken away.
    function item(group, kind, geometry, props) {
      const id = nextId++;
      items.set(id, { group, kind, geometry, props });
      changed();
      return {
        get alive() { return items.has(id); },
        set(geometryNext) { const it = items.get(id); if (it) { it.geometry = geometryNext; changed(); } },
        remove() { if (items.delete(id)) changed(); },
      };
    }
    const lineGeo = (pts) => ({ type: 'LineString', coordinates: pts.map(ll) });
    const polyGeo = (pts) => ({ type: 'Polygon', coordinates: [[...pts.map(ll), ll(pts[0])]] });
    // A circle `metres` across the ground, as a 48-sided shape.
    const discGeo = ([lat, lng], m) => {
      const ky = 110540, kx = 111320 * Math.cos((lat * Math.PI) / 180);
      const ring = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * 2 * Math.PI;
        ring.push([lng + (Math.sin(a) * m) / kx, lat + (Math.cos(a) * m) / ky]);
      }
      return { type: 'Polygon', coordinates: [ring] };
    };

    return {
      kind: 'gl',
      canTurn: true,
      line(group, pts, s) {
        const h = item(group, 'line', lineGeo(pts), { color: s.color, width: s.weight, opacity: s.opacity ?? 1, dash: !!s.dash });
        return { ...h, set: (p) => h.set(lineGeo(p)), get alive() { return h.alive; } };
      },
      dot(group, at, s) {
        const h = item(group, 'dot', { type: 'Point', coordinates: ll(at) }, {
          radius: s.radius, fill: s.fill, fillOpacity: s.fillOpacity ?? 1, stroke: s.stroke || '#fff', weight: s.weight ?? 0, label: s.label || '',
          ...(s.pick && { pick: JSON.stringify(s.pick) }),
        });
        return { ...h, set: (p) => h.set({ type: 'Point', coordinates: ll(p) }), get alive() { return h.alive; } };
      },
      disc(group, at, m, s) {
        const h = item(group, 'fill', discGeo(at, m), { fill: s.fill, opacity: s.opacity });
        return { ...h, set: (p, mm) => h.set(discGeo(p, mm)), get alive() { return h.alive; } };
      },
      poly(group, pts, s) {
        const h = item(group, 'fill', polyGeo(pts), { fill: s.fill, opacity: s.opacity });
        return { ...h, set: (p) => h.set(polyGeo(p)), get alive() { return h.alive; } };
      },
      clear(group) {
        for (const [id, it] of items) if (it.group === group) items.delete(id);
        changed();
      },
      // Explorer's dots, [{ kind: 'stop' | 'station', lat, lng, color?, colors?, pick }], a pill
      // where `colors` has more than one; [] takes them away.
      pois(list) {
        poiPicks.clear();
        poiData = {
          type: 'FeatureCollection',
          features: list.map((p, i) => {
            poiPicks.set(i, p.pick);
            const props = { id: i, kind: p.kind, color: p.color || '#7a4fd6', ...(p.colors?.length > 1 && { pill: pillId(p.colors) }) };
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: props };
          }),
        };
        map.getSource('sg-poi')?.setData(poiData);
      },
      // Explorer's lines, [{ color, points }] with points [lat, lng]; [] takes them away.
      rails(list) {
        railData = { type: 'FeatureCollection', features: list.map((r) => ({ type: 'Feature', geometry: lineGeo(r.points), properties: { color: r.color } })) };
        map.getSource('sg-rail')?.setData(railData);
      },
      setView(at, z, animate = false) {
        map.easeTo({ center: ll(at), zoom: toGl(z), duration: animate ? 500 : 0 });
      },
      // Straight there, flat and north up, however it was left; without `at`, only flat and
      // north up.
      jump(at, z) {
        map.stop();
        map.jumpTo({ ...(at && { center: ll(at), zoom: toGl(z) }), bearing: 0, pitch: 0 });
      },
      panTo(at, ms) { map.easeTo({ center: ll(at), duration: ms }); },
      // The whole of `pts`, flat and north up, clear of the bars by `pad`.
      fit(pts, pad, maxZ) {
        const b = new ml.LngLatBounds();
        pts.forEach((p) => b.extend(ll(p)));
        map.jumpTo({ bearing: 0, pitch: 0 });
        map.fitBounds(b, { padding: pad, maxZoom: toGl(maxZ), duration: 500 });
      },
      zoom: () => map.getZoom() + 1,
      toScreen: (at) => map.project(ll(at)),
      size: () => ({ x: el.clientWidth, y: el.clientHeight }),
      resize: () => map.resize(),
      refetch,
      // Turned with the way you face: kept on `at`, `bearing` up, not dragged, zoomed about you.
      turn(at, bearing) { map.jumpTo({ ...(at && { center: ll(at) }), bearing }); },
      setTurning(on) {
        if (on) {
          map.dragPan.disable();
          map.touchZoomRotate.disableRotation();
          map.touchZoomRotate.enable({ around: 'center' });
          map.scrollZoom.enable({ around: 'center' });
        } else {
          map.dragPan.enable();
          map.touchZoomRotate.enable();
          map.touchZoomRotate.enableRotation();
          map.scrollZoom.enable();
          map.easeTo({ bearing: 0, duration: 400 });
        }
      },
      upright() { map.easeTo({ bearing: 0, pitch: 0, duration: 400 }); },
      source: () => (fallen ? 'osm' : 'openfreemap'),
    };
  }

  // ---------- Leaflet, the fallback ----------

  function leafletEngine(el, hooks) {
    const L = window.L;
    const map = L.map(el, {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: true,
      markerZoomAnimation: false,
      // Pinch zooms about the fingers, and a double tap doesn't fight a tap on a stop.
      tap: false,
      maxBounds: BOUNDS,
      minZoom: MIN_ZOOM,
    }).setView([1.3521, 103.8198], 12);
    map.attributionControl.setPrefix(false);
    // OpenStreetMap's tiles. One that fails stays blank until asked for again: once tiles stop
    // failing for TILE_RETRY_MS, or the phone's back online, or the map's opened again.
    const tiles = L.tileLayer(OSM.url, {
      attribution: OSM.attribution, maxZoom: OSM.maxZoom,
      // CORS (OpenStreetMap sends it), so sw.js can keep them without the size an opaque
      // response costs.
      crossOrigin: true, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 3, detectRetina: false,
    }).addTo(map);
    let retry = null;
    const refetch = () => {
      clearTimeout(retry);
      retry = null;
      if (el.closest('[hidden]') || navigator.onLine === false) return;
      tiles.redraw();
    };
    tiles.on('tileerror', () => {
      clearTimeout(retry);
      retry = setTimeout(refetch, TILE_RETRY_MS);
    });
    window.addEventListener('online', refetch);
    // Explorer's dots under the rest, and only those in view: thousands of stops at once would
    // make a canvas map crawl.
    const poiLayer = L.layerGroup().addTo(map);
    let pois = [];
    // An interchange's pill, as tall as a station's dot (radius 7 and its edge), one image per
    // set of colours.
    const pillIcons = new Map();
    const pillIcon = (colours) => {
      const key = colours.join();
      if (!pillIcons.has(key)) {
        const h = 16;
        const url = pillCanvas(colours, h, 2, pillRatio()).toDataURL();
        pillIcons.set(key, L.icon({ iconUrl: url, iconSize: [pillWidth(colours.length, h), h] }));
      }
      return pillIcons.get(key);
    };
    function drawPois() {
      poiLayer.clearLayers();
      const z = map.getZoom();
      if (!pois.length || z < POI_STATION_ZOOM) return;
      const view = map.getBounds().pad(0.2);
      for (const p of pois) {
        if (p.kind === 'stop' && z < POI_STOP_ZOOM) continue;
        if (!view.contains([p.lat, p.lng])) continue;
        const style = p.kind === 'stop'
          ? { radius: 5, color: STOP_DOT.stroke, weight: 2, fillColor: STOP_DOT.fill, fillOpacity: 1 }
          : { radius: 7, color: '#ffffff', weight: 2, fillColor: p.color || '#7a4fd6', fillOpacity: 1 };
        const marker = p.kind === 'station' && p.colors?.length > 1
          ? L.marker([p.lat, p.lng], { icon: pillIcon(p.colors), keyboard: false })
          : L.circleMarker([p.lat, p.lng], style);
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          hooks.onPick?.(p.pick);
        }).addTo(poiLayer);
      }
    }
    map.on('moveend zoomend', drawPois);
    // Explorer's lines, in a pane of their own between the tiles and the rest (overlayPane is
    // 400), drawn on a canvas of their own: all of them at once, as they're few.
    map.createPane('sgRails').style.zIndex = 350;
    const railLayer = L.layerGroup().addTo(map);
    const railRenderer = L.canvas({ pane: 'sgRails' });
    const railStyle = () => {
      const w = railWidth(map.getZoom());
      return { edge: { weight: w + 2, opacity: dark() ? 0.35 : 0.9 }, line: { weight: w } };
    };
    map.on('zoomend', () => {
      const s = railStyle();
      railLayer.eachLayer((l) => l.setStyle(l.options.sgEdge ? s.edge : s.line));
    });
    map.on('move', () => hooks.onMove?.());
    map.on('click', () => hooks.onBlank?.());

    const groups = {};
    const group = (name) => (groups[name] ??= L.layerGroup().addTo(map));
    Object.keys(ORDER).forEach(group);
    map.on('dragstart', () => hooks.onUserMove?.());
    map.on('zoomstart', (e) => { if (e.originalEvent) hooks.onUserZoom?.(); });

    const wrap = (layer, g, set) => ({ get alive() { return group(g).hasLayer(layer); }, set, remove: () => group(g).removeLayer(layer) });
    return {
      kind: 'leaflet',
      canTurn: false,
      line(g, pts, s) {
        const l = L.polyline(pts, { color: s.color, weight: s.weight, opacity: s.opacity ?? 1, dashArray: s.dash ? '2 9' : null, lineCap: 'round', interactive: false }).addTo(group(g));
        return wrap(l, g, (p) => l.setLatLngs(p));
      },
      dot(g, at, s) {
        const d = L.circleMarker(at, { radius: s.radius, color: s.stroke || '#fff', weight: s.weight ?? 0, fillColor: s.fill, fillOpacity: s.fillOpacity ?? 1, interactive: !!(s.label || s.pick) });
        if (s.pick) {
          d.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            hooks.onPick?.(s.pick);
          });
        } else if (s.label) d.bindTooltip(String(s.label).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`), { direction: 'top', offset: [0, -8] });
        d.addTo(group(g));
        return wrap(d, g, (p) => d.setLatLng(p));
      },
      disc(g, at, m, s) {
        const c = L.circle(at, { radius: m, stroke: false, fillColor: s.fill, fillOpacity: s.opacity, interactive: false }).addTo(group(g));
        return wrap(c, g, (p, mm) => c.setLatLng(p).setRadius(mm));
      },
      poly(g, pts, s) {
        const p = L.polygon(pts, { stroke: false, fillColor: s.fill, fillOpacity: s.opacity, interactive: false }).addTo(group(g));
        return wrap(p, g, (q) => p.setLatLngs(q));
      },
      clear: (g) => group(g).clearLayers(),
      pois(list) {
        pois = list;
        drawPois();
      },
      rails(list) {
        railLayer.clearLayers();
        const s = railStyle();
        const opts = { pane: 'sgRails', renderer: railRenderer, lineCap: 'round', lineJoin: 'round', interactive: false };
        for (const r of list) L.polyline(r.points, { ...opts, ...s.edge, color: '#ffffff', sgEdge: true }).addTo(railLayer);
        for (const r of list) L.polyline(r.points, { ...opts, ...s.line, color: r.color, opacity: 1 }).addTo(railLayer);
      },
      setView: (at, z, animate = false) => map.setView(at, z, { animate }),
      jump(at, z) { if (at) map.setView(at, z, { animate: false }); },
      panTo: (at, ms) => map.panTo(at, { animate: true, duration: ms / 1000 }),
      fit: (pts, pad, maxZ) => map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], maxZoom: maxZ }),
      zoom: () => map.getZoom(),
      toScreen: (at) => map.latLngToContainerPoint(at),
      size: () => map.getSize(),
      resize: () => map.invalidateSize(),
      refetch,
      turn() {},
      setTurning() {},
      upright() {},
      source: () => 'osm',
    };
  }

  // ---------- opening ----------

  let loading = null;
  async function open(el, hooks = {}) {
    if (hasWebGL()) {
      try {
        loading ??= load(ML_JS, ML_CSS);
        await loading;
        return glEngine(el, hooks);
      } catch (err) {
        loading = null;
        console.warn('MapLibre would not start, Leaflet instead:', err);
        el.innerHTML = '';
      }
    }
    if (!window.L) await load(LEAFLET_JS, LEAFLET_CSS);
    return leafletEngine(el, hooks);
  }

  // `styles` and `files`, for saving the map for offline (js/map-save.js): OpenFreeMap's styles
  // and MapLibre's own files.
  window.MapEngine = { open, styles: [STYLE_LIGHT, STYLE_DARK], files: [ML_JS, ML_CSS] };
})();
