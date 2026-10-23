// sgbus in the browser's console: the Linux CLI's commands (cli/sgbus.js), typed as
// sgbus('84009 22*'), sgbus('nav home work'), sgbus('favs -w'), against this page's own data:
// its stops, the route list (js/network.js) and what you've saved here. Fetched the first time
// sgbus() is called (script.js has the stand-in), so the page doesn't carry it otherwise.
//
// Safe to have about, as nothing here can be reached except by typing into the console, which
// already runs anything typed as this page:
// - What's typed is only ever read as words. Nothing is evaluated, and nothing goes into the
//   page's HTML: it's printed with console.log, styles from a fixed list.
// - It answers no link, hash, message from another page or window, or event: only a call.
// - It asks the same public endpoints the app does, as the app does, and changes only what the
//   app's own buttons do (favourites, here in this browser).
// - It prints nothing secret: no sync codes, share links' secrets or device ids.
// Plain script: exports go on window.
(function () {
  const VERSION = 'console';
  const STYLE = {
    bold: 'font-weight:bold',
    dim: 'color:#8a958f',
    green: 'color:#1f9d55;font-weight:bold',
    yellow: 'color:#b08800;font-weight:bold',
    red: 'color:#d1242f;font-weight:bold',
    cyan: 'color:#0a7ea4',
    tone0: 'color:#2f6fdb',
    tone1: 'color:#b03fb0',
    tone2: 'color:#0a8a8a',
    title: 'font-weight:bold;font-size:1.1em',
  };

  // A line is a list of pieces, each text or [text, style name].
  function print(...lines) {
    for (const line of lines) {
      const parts = Array.isArray(line) ? line : [line];
      let fmt = '';
      const css = [];
      for (const p of parts) {
        const [text, style] = Array.isArray(p) ? p : [p, null];
        fmt += `%c${String(text).replace(/%/g, '%%')}`;
        css.push(STYLE[style] || '');
      }
      console.log(fmt, ...css);
    }
  }
  const pad = (s, n) => String(s).padEnd(n);

  class Fail extends Error {}

  // ---------- reading what was typed ----------

  // Words, with "quoted phrases" kept whole, and the flags the CLI takes.
  function parse(text) {
    const words = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(String(text || '')))) words.push(m[1] ?? m[2] ?? m[3]);
    const args = [];
    const opts = {};
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const next = () => (/^\d+$/.test(words[i + 1] || '') ? Number(words[++i]) : true);
      if (w === '-w' || w === '--watch') opts.watch = next();
      else if (w === '-d' || w === '--details') opts.details = true;
      else if (w === '--json') opts.json = true;
      else if (w === '--all') opts.all = true;
      else if (w === '--way') opts.way = next();
      else if (w === '--dir') opts.dir = next();
      else if (w === '-h' || w === '--help') opts.help = true;
      else args.push(w);
    }
    return { args, opts };
  }

  async function get(path) {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Fail(`${path.split('?')[0]} answered ${r.status}.`);
    return r.json();
  }

  async function ready() {
    await ensureStopsIndex();
    try { await BusNet.load(stopsIndex); } catch { /* without the route list: no first and last buses */ }
  }

  // ---------- a stop's timings ----------

  function etaPiece(bus) {
    if (!bus || bus.eta_ms == null) return [pad('-', 8), 'dim'];
    const min = Math.floor(bus.eta_ms / 60000);
    const load = (bus.load || '').toUpperCase();
    return [pad(min < 1 ? 'Arr' : `${min} min`, 8), load === 'LSD' ? 'red' : load === 'SDA' ? 'yellow' : 'green'];
  }

  async function stopLines(code, filter, opts) {
    const data = await get(`/api/bus-arrivals?stop=${encodeURIComponent(code)}`);
    const { services: all, ways } = busWays(data.services || []);
    const favBuses = new Set(LS.getFavBuses());
    let services = all.sort((a, b) => a.serviceNo.localeCompare(b.serviceNo, undefined, { numeric: true }));
    if (filter) services = services.filter((s) => busFilterHas(filter, s.serviceNo));
    services = pinFavourites(services, favBuses, LS.getPin('bus'), (s) => s.serviceNo);
    if (opts.json) return { json: { stop: code, name: nameOf(code), road: stopsIndex[code]?.road || '', services } };

    const where = stopsIndex[code];
    const lines = [[[where?.n || 'Bus stop', 'bold'], [` (${code})`, 'dim'], where?.road ? [`  ${where.road}`, 'dim'] : '', filter ? [`  ${filter.split(',').join(', ')}`, 'cyan'] : '']];
    const restricted = BusNet.restricted?.(code);
    if (restricted) lines.push([[`Authorised personnel only: ${restricted.through ? `at ${restricted.place}, the public can't get on or off here` : `inside ${restricted.place}, the public can't get on, off or ride through`}.`, 'yellow']]);
    if (!services.length) {
      lines.push([[filter ? `No live arrivals for ${busFilterText(filter)} right now.` : 'No live buses right now.', 'dim']]);
      const one = oneBus(filter);
      const fl = one ? firstLastText(one, code) : '';
      if (fl) lines.push([[fl, 'dim']]);
      return { lines };
    }
    const width = Math.max(...services.map((s) => s.serviceNo.length)) + 2;
    for (const s of services) {
      const way = ways.get(s);
      lines.push([
        favBuses.has(s.serviceNo) ? ['*', 'yellow'] : ' ',
        [pad(s.serviceNo, width), 'bold'],
        ...[s.next, s.next2, s.next3].map(etaPiece),
        way ? [`  ${way.short}`, `tone${way.tone ?? 0}`] : '',
      ]);
      if (opts.details) {
        const decks = [s.next, s.next2, s.next3].filter(Boolean).map((b) => (b.deck || '?').toLowerCase());
        const fl = firstLastText(s.serviceNo, code, way?.dir ?? null);
        lines.push([[`${' '.repeat(width + 1)}${[s.operator, decks.join(', '), fl].filter(Boolean).join(' · ')}`, 'dim']]);
      }
    }
    return { lines };
  }

  // Printed once, or with -w kept up: printed again every so often until the next sgbus().
  let watching = null;
  async function show(make, opts) {
    const once = async () => {
      const got = await make();
      if (got.json) return console.log(got.json);
      if (opts.watch) console.clear();
      print(...got.lines);
      if (opts.watch) print([[`Every ${watchSeconds(opts)}s. sgbus('unwatch') or any other sgbus() stops it.`, 'dim']]);
    };
    await once();
    if (opts.watch && !opts.json) watching = setInterval(() => once().catch(report), watchSeconds(opts) * 1000);
  }
  const watchSeconds = (opts) => Math.max(10, typeof opts.watch === 'number' ? opts.watch : 30);

  // ---------- finding stops ----------

  function stopListLines(title, stops) {
    const lines = [[[title, 'bold']]];
    for (const s of stops) {
      const at = stopsIndex[s.code] || {};
      lines.push([[`  ${s.code}  `, 'cyan'], at.n || s.name || '', at.road ? [`  ${at.road}`, 'dim'] : '', s.distance != null ? [`  ${Math.round(s.distance)} m`, 'dim'] : '']);
    }
    lines.push([['  Then: sgbus(\'<code>\') for a stop\'s timings.', 'dim']]);
    return lines;
  }

  async function postalPlace(code) {
    const r = await fetch(`/api/postal-code?code=${encodeURIComponent(code)}`);
    if (r.status === 404) throw new Fail(`No address has the postal code ${code}.`);
    if (!r.ok) throw new Fail("Couldn't look up that postal code right now.");
    return r.json();
  }

  const LATLNG_RE = /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)$/;

  // ---------- a bus's route ----------

  function busLines(no, opts) {
    no = no.toUpperCase();
    if (!BusNet.isReady() || !BusNet.hasService(no)) throw new Fail(`There's no bus ${no}.`);
    const info = BusNet.serviceInfo(no) || {};
    const dirs = BusNet.directions(no);
    const pick = opts.dir && dirs.includes(Number(opts.dir)) ? [Number(opts.dir)] : dirs;
    const lines = [];
    for (const dir of pick) {
      const stops = BusNet.runStops(no, dir);
      if (!stops.length) continue;
      lines.push([[`Bus ${no}`, 'title'], [`  ${[info.op, info.loop ? `loop at ${info.loop}` : `to ${nameOf(stops[stops.length - 1])}`, dirs.length > 1 ? `direction ${dir}` : ''].filter(Boolean).join(' · ')}`, 'dim']]);
      stops.forEach((code, i) => lines.push([[`  ${pad(i + 1, 4)}`, 'dim'], [`${code}  `, 'cyan'], nameOf(code)]));
    }
    if (dirs.length > 1 && !opts.dir) lines.push([['  One way only: --dir 1 or --dir 2.', 'dim']]);
    return lines;
  }

  // ---------- getting somewhere ----------

  // One end of a nav, as a point: your places by name, a stop code, a postal code, lat,lng, or
  // a stop or station by name.
  async function endOf(text) {
    const t = text.trim();
    const ll = t.match(LATLNG_RE);
    if (ll) return { lat: Number(ll[1]), lng: Number(ll[2]), label: t };
    const place = (window.Places?.all() || []).find((p) => p.name.toLowerCase() === t.toLowerCase() || p.key === t.toLowerCase());
    if (place) return { lat: place.lat, lng: place.lng, label: place.name };
    if (/^\d{5}$/.test(t) && stopsIndex[t]) return { lat: stopsIndex[t].lat, lng: stopsIndex[t].lng, label: `${nameOf(t)} (${t})` };
    if (/^\d{6}$/.test(t)) {
      const p = await postalPlace(t);
      return { lat: p.lat, lng: p.lng, label: p.address };
    }
    const found = matchStops(t, 1).stops[0];
    if (found) return { lat: stopsIndex[found.code].lat, lng: stopsIndex[found.code].lng, label: `${nameOf(found.code)} (${found.code})` };
    throw new Fail(`Couldn't tell where "${t}" is. Try a stop code, a postal code, lat,lng, or one of your places.`);
  }

  async function navLines(fromText, toText, opts) {
    const [from, to] = await Promise.all([endOf(fromText), endOf(toText)]);
    const at = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const data = await get(`/api/nav?from=${at(from)}&to=${at(to)}`);
    if (opts.json) return { json: data };
    const options = data.options || [];
    const lines = [[[`${from.label} to ${to.label}`, 'title']]];
    if (!options.length) return { lines: [...lines, [['No way found right now.', 'dim']]] };
    const legText = (l) => (l.mode === 'walk' ? `walk ${Math.round(l.metres || 0)} m` : `${l.mode === 'train' ? (l.name || l.route || 'train') : `bus ${l.route}`}`);
    if (!opts.way) {
      options.forEach((o, i) => lines.push([[`  ${i + 1}  `, 'cyan'], [`~${o.minutes} min  `, 'bold'], o.legs.filter((l) => l.mode !== 'walk' || l.metres >= 100).map(legText).join(' > '), o.source === 'onemap' ? [' (OneMap)', 'dim'] : '']));
      lines.push([['  Step by step: add --way N.', 'dim']]);
      return { lines };
    }
    const o = options[Math.max(0, Math.min(options.length - 1, Number(opts.way) - 1))];
    lines.push([[`~${o.minutes} min`, 'bold']]);
    for (const l of o.legs) {
      if (l.mode === 'walk') lines.push([['  Walk ', 'dim'], `${Math.round(l.metres || 0)} m to ${l.to?.name || 'the end'}`, [`, ~${Math.round(l.minutes || 0)} min`, 'dim']]);
      else lines.push([[`  ${l.mode === 'train' ? (l.name || l.route) : `Bus ${l.route}`} `, 'bold'], `from ${l.from?.name || '?'} to ${l.to?.name || '?'}`, [`, ${l.stops} stop${l.stops === 1 ? '' : 's'}, ~${Math.round(l.minutes || 0)} min`, 'dim']]);
    }
    return { lines };
  }

  // ---------- saved ----------

  async function favsLines(opts) {
    const favs = LS.getFavs();
    if (!favs.length) return { lines: [[['No favourite stops yet: sgbus(\'fav add 84009\').', 'dim']]] };
    const lines = [];
    for (const f of favs) lines.push(...(await stopLines(f.code, null, opts)).lines, '');
    return { lines };
  }

  function favCommand(rest) {
    const [what, ...more] = rest;
    if (!what) {
      const stops = LS.getFavs();
      const buses = LS.getFavBuses();
      return print([['Favourite stops', 'bold']], ...(stops.length ? stops.map((f) => [[`  ${f.code}  `, 'cyan'], nameOf(f.code) || f.name]) : [[['  none', 'dim']]]),
        [['Favourite buses', 'bold']], [buses.length ? `  ${buses.join(', ')}` : ['  none', 'dim']]);
    }
    if (what === 'bus') {
      const [act, ...nos] = more;
      if (!['add', 'rm'].includes(act) || !nos.length) throw new Fail("sgbus('fav bus add 14 60') or sgbus('fav bus rm 14')");
      for (const no of nos.map((n) => n.toUpperCase())) {
        if (!/^[0-9A-Z]{1,4}$/.test(no)) throw new Fail(`"${no}" isn't a bus number.`);
        if ((act === 'add') !== isFavBus(no)) toggleFavBus(no);
      }
      return print([['Favourite buses: ', 'bold'], LS.getFavBuses().join(', ') || 'none']);
    }
    if (!['add', 'rm'].includes(what) || !more.length) throw new Fail("sgbus('fav add 84009') or sgbus('fav rm 84009')");
    for (const code of more) {
      if (!/^\d{5}$/.test(code) || !stopsIndex[code]) throw new Fail(`There's no bus stop ${code}.`);
      if (what === 'add') addFav(code);
      else removeFav(code);
    }
    return favCommand([]);
  }

  // ---------- around Singapore ----------

  async function alertsLines(opts) {
    const d = await get('/api/service-alerts');
    if (opts.json) return { json: d };
    const lines = [[['Trains', 'bold']]];
    const t = d.train;
    if (!t) lines.push([["  Couldn't reach LTA for train alerts.", 'dim']]);
    else if ((Number(t.Status) || 1) <= 1 && !(t.AffectedSegments || []).length) lines.push([['  All train services are running normally.', 'green']]);
    else for (const s of t.AffectedSegments || []) lines.push([[`  ${MRT.lineLabel(s.Line || '?')}: `, 'red'], `${s.Direction || ''} ${s.Stations || ''}`.trim()]);
    for (const m of t?.Message || []) if (m.Content) lines.push([[`  ${m.Content}`, 'dim']]);
    lines.push([['Roads', 'bold']]);
    const roads = d.traffic;
    if (!roads) lines.push([["  Couldn't reach LTA for traffic incidents.", 'dim']]);
    else {
      const BLOCKING = /accident|vehicle breakdown|road block|diversion|obstacle|fire|plant failure/i;
      const shown = opts.all ? roads : roads.filter((r) => BLOCKING.test(r.type));
      lines.push([`  ${roads.length} incidents, ${roads.filter((r) => BLOCKING.test(r.type)).length} able to block or reroute a bus.`]);
      shown.forEach((r) => lines.push([['  • ', 'dim'], r.message]));
      if (!opts.all && roads.length > shown.length) lines.push([['  The rest too: --all.', 'dim']]);
    }
    return { lines };
  }

  async function weatherLines(opts) {
    const d = await get('/api/weather');
    if (opts.json) return { json: d };
    const span = (r, unit = '') => (!r ? '' : r.min === r.max ? `${r.min}${unit}` : `${r.min} - ${r.max}${unit}`);
    const lines = [[['Weather', 'bold']]];
    if (d.now) lines.push([`  Now ${Math.round(d.now.temp)} °C, feels like ${Math.round(d.now.feels)} °C, humidity ${Math.round(d.now.humidity)}%`]);
    if (d.today) lines.push([`  Today ${Math.round(d.today.min)} to ${Math.round(d.today.max)} °C${d.today.rainChance ? `, rain chance up to ${d.today.rainChance}%` : ''}`]);
    const air = [d.temp && span(d.temp, ' °C'), d.psi && `${span(d.psi)} PSI`, d.pm25 && `${span(d.pm25)} PM2.5`].filter(Boolean).join(', ');
    if (air) lines.push([['  Across the island: ', 'dim'], air]);
    return { lines };
  }

  // ---------- help ----------

  const HELP = [
    [['sgbus in the console: ', 'title'], ['Singapore\'s live bus timings, the Linux app\'s commands, typed as sgbus(\'...\')', 'dim']],
    '',
    [['Timings and search', 'bold']],
    [['  sgbus(\'84009\')                  ', 'cyan'], 'a stop\'s timings; sgbus(\'84009 174,175\'), sgbus(\'84009 22*\')'],
    [['    -w [seconds]                   ', 'cyan'], 'keep them up to date (every 30s); -d for operator, decks, first and last bus'],
    [['  sgbus(\'bedok int\')              ', 'cyan'], 'find stops by name, road or station'],
    [['  sgbus(\'519599\')                 ', 'cyan'], 'the stops nearest an address; sgbus(\'near 1.35,103.94\') from a point'],
    [['  sgbus(\'bus 22\')                 ', 'cyan'], 'a bus\'s route, --dir 1 or 2 for one way; sgbus(\'22\') works too'],
    '',
    [['Getting somewhere', 'bold']],
    [['  sgbus(\'nav home work\')          ', 'cyan'], 'by bus and train; ends are your places, stop or postal codes, lat,lng, or names'],
    [['    --way N                        ', 'cyan'], 'way N step by step. Quote an end with spaces: sgbus(\'nav "Bedok Mall" home\')'],
    '',
    [['Saved here', 'bold']],
    [['  sgbus(\'favs\')                   ', 'cyan'], 'every favourite stop\'s timings (-w too)'],
    [['  sgbus(\'fav\')                    ', 'cyan'], 'what\'s saved; fav add|rm 84009, fav bus add|rm 14'],
    [['  sgbus(\'places\')                 ', 'cyan'], 'Home, Work and your own'],
    '',
    [['Around Singapore', 'bold']],
    [['  sgbus(\'alerts\')                 ', 'cyan'], 'train disruptions and traffic incidents, --all for every one'],
    [['  sgbus(\'weather\')                ', 'cyan'], 'today\'s weather, PSI and PM2.5'],
    '',
    [['  --json', 'cyan'], ['  the data itself, to look through here', 'dim']],
    [['Routines, the route planner, calendar and settings are in the app and the Linux app.', 'dim']],
  ];

  function report(e) {
    if (e instanceof Fail) print([[e.message, 'red']]);
    else console.error(e);
  }

  // ---------- one command ----------

  async function run(text) {
    clearInterval(watching);
    watching = null;
    const { args, opts } = parse(text);
    const [cmd = '', ...rest] = args;
    const word = cmd.toLowerCase();
    if (!cmd || opts.help || word === 'help') return print(...HELP);
    if (word === 'version') return print(`sgbus ${VERSION}`);
    if (word === 'unwatch') return print([['Stopped.', 'dim']]);
    await ready();

    switch (word) {
      case 'stop': {
        const code = rest[0] || '';
        if (!stopsIndex[code]) throw new Fail(`There's no bus stop ${code || '(none given)'}.`);
        return show(() => stopLines(code, busFilter(rest.slice(1).join(',')), opts), opts);
      }
      case 'find': case 'search': {
        const { stops, note } = matchStops(rest.join(' '));
        if (opts.json) return console.log(stops);
        if (!stops.length) throw new Fail('No bus stops matched that. Try a stop code, part of its name or road, a station, or a postal code.');
        return print(...stopListLines(note || 'Bus stops', stops));
      }
      case 'near': {
        const t = rest.join(' ');
        const ll = t.match(LATLNG_RE);
        const p = ll ? { lat: Number(ll[1]), lng: Number(ll[2]), address: t } : /^\d{6}$/.test(t) ? await postalPlace(t) : null;
        if (!p) throw new Fail("sgbus('near <postal code | lat,lng>')");
        return print(...stopListLines(`Bus stops near ${p.address}`, stopsNear(p.lat, p.lng)));
      }
      case 'bus': return print(...busLines(rest[0] || '', opts));
      case 'nav': case 'navigate':
        if (rest.length < 2) throw new Fail('sgbus(\'nav <from> <to>\'): quote an end with spaces, sgbus(\'nav "Bedok Mall" home\')');
        return show(() => navLines(rest[0], rest.slice(1).join(' '), opts), { ...opts, watch: false });
      case 'favs': return show(() => favsLines(opts), opts);
      case 'fav': return favCommand(rest);
      case 'places': {
        const all = window.Places?.all() || [];
        return print([['Places', 'bold']], ...(all.length ? all.map((p) => [[`  ${pad(p.name, 12)}`, 'bold'], p.label || '', [`  ${p.lat.toFixed(5)},${p.lng.toFixed(5)}`, 'dim']]) : [[['  none yet: set them in Places.', 'dim']]]));
      }
      case 'alerts': return show(() => alertsLines(opts), { ...opts, watch: false });
      case 'weather': return show(() => weatherLines(opts), { ...opts, watch: false });
      case 'route': case 'routes': case 'navs': case 'routine': case 'routines': case 'calendar': case 'settings': case 'update': case 'place':
        throw new Fail(`"${word}" is in the app and the Linux app, not here. sgbus('help') for what is.`);
      default: break;
    }

    // As the CLI: a stop code, with buses after it; a postal code; a bus number; else a search.
    const all = args.join(' ');
    const stop = all.match(/^(\d{5})(?:[\s,]+(.+))?$/);
    if (stop) {
      if (!stopsIndex[stop[1]]) throw new Fail(`There's no bus stop ${stop[1]}.`);
      const filter = stop[2] ? busFilter(stop[2]) : null;
      if (stop[2] && !filter) throw new Fail(`"${stop[2]}" isn't a list of buses: 174, or 174,175, or 22*.`);
      return show(() => stopLines(stop[1], filter, opts), opts);
    }
    if (/^\d{6}$/.test(all)) return run(`near ${all}${opts.json ? ' --json' : ''}`);
    if (/^[0-9A-Za-z]{1,4}$/.test(all) && BusNet.isReady() && BusNet.hasService(all.toUpperCase())) return print(...busLines(all, opts));
    return run(`find ${all}`);
  }

  // Called as sgbus('84009') or sgbus`84009`. Prints, so it hands back nothing for the console
  // to print after it.
  function sgbus(text, ...values) {
    const line = Array.isArray(text) && text.raw ? String.raw(text, ...values) : text;
    run(line).catch(report);
  }
  sgbus.unwatch = () => sgbus('unwatch');
  window.sgbus = sgbus;
})();
