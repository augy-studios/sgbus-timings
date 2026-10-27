// The celebration for riding every MRT and LRT line (help desk #6): a 3D scene, drawn with
// three.js, of the whole MRT and LRT network raised off a dark slab in the lines' colours,
// tilted and turning slowly, with a gold trophy spinning above it and confetti falling, then
// Pick my colours (js/colours.js) and Close. Shown once as Your colours unlock, and again from
// Theme, Your colours, Watch the celebration.
//
// three.js 0.169.0 (MIT) is vendored in /vendor/three-0.169.0/, fetched only the first time this
// runs and kept by sw.js as MapLibre is, so it runs offline once it's been fetched; js/rides.js
// fetches it ahead once only two lines are left. The trophy is made here from three.js's own
// shapes (a lathe for the cup, tori for its handles, a stem and a base), so there's no model to
// download. The network is /data/rail-tracks.json (js/rail-tracks.js) and its stations
// /data/rail-stations.json.
//
// With reduced motion, the scene is drawn once and stands still, with no confetti. On a phone
// with little memory (low(): navigator.deviceMemory of 2 GB or less, or where a browser doesn't
// say, 2 processor cores or fewer), the flat celebration instead: the same card over a gold
// trophy drawn in SVG, and confetti in the lines' colours on a 2D canvas (js/confetti.js), with
// no three.js fetched (Augy, 27 October 2026). Without WebGL, or with Data Saver on, or if
// three.js can't be had, the plain window (#unlockModal) says it instead.
//
// Window.Celebrate = { start({ as }) } → resolves to "scene", "flat" or "plain". The
// console's simulateAllLines() (below) plays it to see how it looks. Plain script: exports go
// on window.
(function () {
  const THREE_URL = '/vendor/three-0.169.0/three.module.min.js';
  const ID = 'celebrateModal';
  const COLOURS = { NS: '#d42e12', EW: '#009645', NE: '#9900aa', CC: '#fa9e0d', DT: '#005ec4', TE: '#9d5b25', BP: '#748477', SK: '#748477', PG: '#748477' };
  // The network's middle, worked out from its tracks (buildScene); Singapore's until then.
  let CENTRE = [1.3521, 103.8198];
  // Kilometres to scene units.
  const SCALE = 0.3;
  const CONFETTI = 260;
  // How high the trophy floats over the network.
  const LIFT = 1.6;
  const $ = (id) => document.getElementById(id);

  let three = null;
  let running = null; // { renderer, frame, stop }

  const still = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function webgl() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  const canRun = () => webgl() && !navigator.connection?.saveData;
  const low = () => (navigator.deviceMemory != null ? navigator.deviceMemory <= 2 : (navigator.hardwareConcurrency || 8) <= 2);

  // The trophy, flat: a cup, its handles, stem and base, in gold, with a star.
  const TROPHY_SVG = '<svg class="flatTrophy" viewBox="0 0 120 140" aria-hidden="true" focusable="false">' +
    '<defs><linearGradient id="flatGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset="0.45" stop-color="#f5c542"/><stop offset="1" stop-color="#a87a12"/></linearGradient></defs>' +
    '<path d="M28 18 C10 18 8 46 34 56" fill="none" stroke="url(#flatGold)" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M92 18 C110 18 112 46 86 56" fill="none" stroke="url(#flatGold)" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M26 10 H94 C94 52 80 72 60 76 C40 72 26 52 26 10 Z" fill="url(#flatGold)"/>' +
    '<rect x="54" y="76" width="12" height="22" fill="url(#flatGold)"/>' +
    '<path d="M38 98 H82 L88 110 H32 Z" fill="url(#flatGold)"/>' +
    '<rect x="26" y="110" width="68" height="20" rx="3" fill="#1f2a24"/>' +
    '<path d="M60 22 l5 10 11 1.6 -8 7.8 1.9 11 -9.9-5.2 -9.9 5.2 1.9-11 -8-7.8 11-1.6 Z" fill="#fff6c8" opacity="0.9"/>' +
    '</svg>';

  function flat() {
    stop();
    $(ID).classList.add('flat');
    $('celebrateScene').innerHTML = TROPHY_SVG;
    window.openModal(ID);
    running = { scene: null, frame: 0, flat: true };
    window.Confetti?.burst({ colours: [...new Set(Object.values(COLOURS))].concat(['#ffd166', '#ffffff']), count: 220, life: 6000 });
    return 'flat';
  }

  function loadThree() {
    three ??= import(THREE_URL).catch((e) => { three = null; throw e; });
    return three;
  }

  // [lat, lng] to the scene's ground: x east, z south, in SCALE units.
  function ground([lat, lng]) {
    const x = (lng - CENTRE[1]) * 111.32 * Math.cos((CENTRE[0] * Math.PI) / 180);
    const z = -(lat - CENTRE[0]) * 110.57;
    return [x * SCALE, z * SCALE];
  }

  // At most n points, evenly through, the ends kept.
  function thin(pts, n) {
    if (pts.length <= n) return pts;
    return Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
  }

  async function network() {
    const [tracks, stations] = await Promise.all([
      window.RailTracks?.lines().catch(() => []) ?? [],
      fetch('/data/rail-stations.json').then((r) => (r.ok ? r.json() : { stations: [] })).then((d) => d.stations || []).catch(() => []),
    ]);
    return { tracks, stations };
  }

  function trophy(T) {
    const gold = new T.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.95, roughness: 0.22, emissive: 0x3a2a00, emissiveIntensity: 0.25 });
    const dark = new T.MeshStandardMaterial({ color: 0x1f2a24, metalness: 0.3, roughness: 0.6 });
    const group = new T.Group();
    // The cup: a profile turned round its axis, flaring to the rim.
    const profile = [[0, 0], [0.18, 0], [0.2, 0.05], [0.12, 0.2], [0.1, 0.45], [0.22, 0.62], [0.42, 0.82], [0.56, 1.1], [0.6, 1.36], [0.55, 1.38], [0.5, 1.12], [0.36, 0.86], [0, 0.78]]
      .map(([x, y]) => new T.Vector2(x, y));
    const cup = new T.Mesh(new T.LatheGeometry(profile, 48), gold);
    cup.position.y = 0.55;
    group.add(cup);
    // Handles: half rings either side.
    for (const side of [-1, 1]) {
      const handle = new T.Mesh(new T.TorusGeometry(0.26, 0.045, 12, 32, Math.PI), gold);
      handle.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      handle.position.set(side * 0.55, 1.65, 0);
      group.add(handle);
    }
    // Stem and the stepped base.
    const stem = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 0.5, 24), gold);
    stem.position.y = 0.35;
    group.add(stem);
    const plinth = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 0.16, 32), gold);
    plinth.position.y = 0.08;
    group.add(plinth);
    const block = new T.Mesh(new T.BoxGeometry(0.9, 0.3, 0.9), dark);
    block.position.y = -0.15;
    group.add(block);
    // A star on the front of the block, in gold.
    const star = new T.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.07 : 0.16;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const badge = new T.Mesh(new T.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: false }), gold);
    badge.position.set(0, -0.15, 0.451);
    group.add(badge);
    return group;
  }

  function buildScene(T, { tracks, stations }, canvas) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(0, 9, 12);
    camera.lookAt(0, 1.4, 0);

    scene.add(new T.AmbientLight(0xffffff, 0.65));
    const sun = new T.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 6);
    scene.add(sun);
    const glow = new T.PointLight(0xffd27a, 18, 12);
    glow.position.set(0, 5, 2.5);
    scene.add(glow);

    // Centred on the network itself, so it turns round its own middle under the trophy.
    const all = tracks.flatMap((t) => t.points);
    if (all.length) {
      const lats = all.map((p) => p[0]);
      const lngs = all.map((p) => p[1]);
      CENTRE = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2];
    }
    // The network, on its slab, tilted towards you and turning.
    const map = new T.Group();
    map.rotation.x = -0.12;
    scene.add(map);
    const slab = new T.Mesh(new T.CylinderGeometry(6.4, 6.6, 0.18, 64), new T.MeshStandardMaterial({ color: 0x14201a, metalness: 0.2, roughness: 0.8 }));
    slab.position.y = -0.12;
    map.add(slab);
    for (const { line, points } of tracks) {
      const pts = thin(points, 160).map((p) => {
        const [x, z] = ground(p);
        return new T.Vector3(x, 0.08, z);
      });
      if (pts.length < 2) continue;
      const curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
      const tube = new T.TubeGeometry(curve, Math.min(400, pts.length * 3), 0.05, 8, false);
      const colour = COLOURS[line] || '#748477';
      map.add(new T.Mesh(tube, new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.35, metalness: 0.1, roughness: 0.45 })));
    }
    // The stations, as white beads on the lines.
    if (stations.length) {
      const bead = new T.InstancedMesh(new T.SphereGeometry(0.06, 12, 8), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), stations.length);
      const m = new T.Matrix4();
      stations.forEach((s, i) => {
        const [x, z] = ground([s.lat, s.lng]);
        m.makeTranslation(x, 0.1, z);
        bead.setMatrixAt(i, m);
      });
      map.add(bead);
    }

    const cup = trophy(T);
    // Above the network, so the lines show under it.
    cup.position.set(0, LIFT, 0);
    cup.scale.setScalar(1.15);
    scene.add(cup);

    // Confetti: small paper bits in the lines' colours, falling and tumbling, coming round again.
    let confetti = null;
    let bits = [];
    if (!still()) {
      const palette = [...new Set(Object.values(COLOURS))].concat(['#ffd166', '#ffffff', '#f15bb5']);
      confetti = new T.InstancedMesh(new T.PlaneGeometry(0.12, 0.2), new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.6 }), CONFETTI);
      const c = new T.Color();
      bits = Array.from({ length: CONFETTI }, (_, i) => {
        confetti.setColorAt(i, c.set(palette[i % palette.length]));
        return {
          x: (Math.random() - 0.5) * 12, y: 4 + Math.random() * 9, z: (Math.random() - 0.5) * 8,
          vy: 0.6 + Math.random() * 0.9, spin: Math.random() * 6, vs: 1 + Math.random() * 3, sway: Math.random() * 6,
        };
      });
      confetti.instanceColor.needsUpdate = true;
      scene.add(confetti);
    }

    const dummy = new T.Object3D();
    function size() {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // On a narrow phone, back away until the whole network fits across.
      const away = 12 / Math.min(1, (w / h) * 1.1);
      camera.position.set(0, away * 0.75, away);
      camera.lookAt(0, 1.4, 0);
      camera.updateProjectionMatrix();
    }
    size();

    let last = performance.now();
    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!still()) {
        map.rotation.y += dt * 0.12;
        cup.rotation.y += dt * 1.1;
        cup.position.y = LIFT + Math.sin(now / 700) * 0.08;
        bits.forEach((b, i) => {
          b.y -= b.vy * dt;
          b.sway += dt * 2;
          b.spin += b.vs * dt;
          if (b.y < -0.5) { b.y = 6 + Math.random() * 4; b.x = (Math.random() - 0.5) * 12; }
          dummy.position.set(b.x + Math.sin(b.sway) * 0.3, b.y, b.z);
          dummy.rotation.set(b.spin, b.spin * 0.7, b.sway);
          dummy.updateMatrix();
          confetti.setMatrixAt(i, dummy.matrix);
        });
        if (confetti) confetti.instanceMatrix.needsUpdate = true;
      } else {
        map.rotation.y = 0.5;
        cup.rotation.y = 0.6;
      }
      renderer.render(scene, camera);
    }

    window.addEventListener('resize', size);
    return {
      renderer,
      draw,
      dispose() {
        window.removeEventListener('resize', size);
        scene.traverse((o) => {
          o.geometry?.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
        });
        renderer.dispose();
      },
    };
  }

  function stop() {
    if (!running) return;
    cancelAnimationFrame(running.frame);
    running.scene?.dispose();
    running = null;
    const box = $('celebrateScene');
    if (box) box.innerHTML = '';
  }

  // The plain window, where there's no scene to be had.
  function plain() {
    window.openModal('unlockModal');
    return 'plain';
  }

  // `as` picks one whatever this phone is ("scene", "flat" or "plain"), for the console's
  // preview below; the 3D one still needs WebGL.
  async function start({ as } = {}) {
    if (!$(ID) || as === 'plain') return plain();
    // Little memory: the flat celebration, with no three.js fetched.
    if (as === 'flat' || (!as && low())) return flat();
    if (as === 'scene' ? !webgl() : !canRun()) return plain();
    let T;
    let net;
    try {
      [T, net] = await Promise.all([loadThree(), network()]);
    } catch (e) {
      console.warn('No celebration, so the plain window:', e);
      return plain();
    }
    stop();
    $(ID).classList.remove('flat');
    const canvas = document.createElement('canvas');
    canvas.className = 'celebrateCanvas';
    $('celebrateScene').appendChild(canvas);
    window.openModal(ID);
    let scene;
    try {
      scene = buildScene(T, net, canvas);
    } catch (e) {
      console.warn('The celebration could not be drawn:', e);
      window.closeModal(ID);
      return plain();
    }
    running = { scene, frame: 0 };
    if (still()) {
      scene.draw(performance.now());
    } else {
      const loop = (now) => {
        if (!running) return;
        scene.draw(now);
        running.frame = requestAnimationFrame(loop);
      };
      running.frame = requestAnimationFrame(loop);
    }
    return 'scene';
  }

  // Fetched ahead, so it's there even if the last line's ridden offline (js/rides.js).
  function prefetch() {
    if (canRun() && !low()) fetch(THREE_URL).catch(() => {});
  }

  function init() {
    if (!$(ID)) return;
    $(ID).addEventListener('modalclose', stop);
    $('celebrateClose').addEventListener('click', () => window.closeModal(ID));
    $('celebrateGo').addEventListener('click', () => {
      window.closeModal(ID);
      setTimeout(() => window.Colours?.open(), 50);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Celebrate = { start, prefetch, running: () => !!running, mode: () => (running ? (running.flat ? 'flat' : 'scene') : null) };

  // ---------- simulateAllLines(), in the browser's console (help desk #13) ----------
  //
  // The celebration, as riding the last line plays it, to see how it looks: typed in the
  // browser's console, or in chrome://inspect's for the Android app. A preview unless asked:
  // no rides are saved and Your colours stays locked, so what's been ridden stays true.
  //
  //   simulateAllLines()                     this phone's own (3D, flat or plain), and the help
  //   simulateAllLines('3d' | 'flat' | 'plain')   that one, whatever this phone is
  //   simulateAllLines({ unlock: true })     Your colours unlocked too, as riding them does
  //   simulateAllLines('undo')               locked again, if this unlocked them
  //   simulateAllLines('help')               the help only
  //
  // Unlocking saves no rides: it sets what js/rides.js sets (UNLOCKED_KEY) and fires
  // "rides:unlocked" for js/colours.js, and notes what was there before under SIM_KEY, which
  // undo puts back. Undo never locks colours that rides unlocked. It's this browser's own
  // storage and nothing else, as anything typed in its console is; no link, message or sync
  // can call it, and nothing on the page shows it.
  const UNLOCKED_KEY = 'sgbus_colours_unlocked'; // js/rides.js
  const TOLD_KEY = 'sgbus_colours_told'; // js/colours.js
  const COLOURS_KEY = 'sgbus_colours'; // js/colours.js
  const SIM_KEY = 'sgbus_colours_simulated';
  const AS = { '3d': 'scene', scene: 'scene', flat: 'flat', low: 'flat', plain: 'plain', nowebgl: 'plain' };
  const HELP = "simulateAllLines() plays the every-line celebration as a preview (nothing saved). Options: '3d', 'flat' (low-memory phones) or 'plain' (no WebGL); { unlock: true, as: 'flat' } unlocks Your colours too; 'undo' locks them again; 'help' shows this.";
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    put: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } },
  };
  const closeAll = () => ['celebrateModal', 'unlockModal'].forEach((m) => $(m) && !$(m).classList.contains('hidden') && window.closeModal(m));

  function undo() {
    let was;
    try { was = JSON.parse(store.get(SIM_KEY) || 'null'); } catch { was = null; }
    if (!was) {
      console.log(window.RideCheck?.unlocked() ? 'Nothing to undo: Your colours were unlocked by riding every line, so they stay.' : 'Nothing to undo: Your colours are locked.');
      return 'nothing';
    }
    store.put(SIM_KEY, null);
    closeAll();
    window.Confetti?.stop?.();
    // Ridden for real since: unlocked, as it would have been anyway.
    if (!window.RideCheck?.progress().left.length) {
      console.log('Every line has been ridden since, so Your colours stay unlocked.');
      return 'kept';
    }
    store.put(UNLOCKED_KEY, was.unlocked ?? null);
    store.put(TOLD_KEY, was.told ?? null);
    store.put(COLOURS_KEY, was.colours ?? null);
    let back = null;
    try { back = was.colours ? JSON.parse(was.colours) : null; } catch { /* the usual colours */ }
    window.Colours?.paint(back);
    window.closeModal?.('themeModal');
    console.log('Undone: Your colours are locked again, and the usual colours are back.');
    return 'undone';
  }

  async function simulateAllLines(opts) {
    const word = typeof opts === 'string' ? opts.trim().toLowerCase() : null;
    if (word === 'help' || word === '?') {
      console.log(HELP);
      return 'help';
    }
    if (word === 'undo') return undo();
    const o = word != null ? { as: word } : opts && typeof opts === 'object' ? opts : {};
    const as = o.as == null ? undefined : AS[String(o.as).toLowerCase()];
    if (o.as != null && !as) {
      console.log(`No celebration called "${o.as}". ${HELP}`);
      return 'help';
    }
    if (opts === undefined) console.log(HELP);
    if (as === 'scene' && !webgl()) console.warn('No WebGL in this browser, so the 3D celebration can\'t be drawn: the plain window instead.');
    if (o.unlock) {
      if (window.RideCheck?.unlocked()) {
        console.log(store.get(SIM_KEY) ? 'Already unlocked by simulateAllLines(); simulateAllLines(\'undo\') locks them again.' : 'Already unlocked by riding every line.');
      } else {
        store.put(SIM_KEY, JSON.stringify({ at: Date.now(), unlocked: store.get(UNLOCKED_KEY), told: store.get(TOLD_KEY), colours: store.get(COLOURS_KEY) }));
        store.put(UNLOCKED_KEY, String(Date.now()));
        // Said here, so js/colours.js doesn't play it a second time.
        store.put(TOLD_KEY, String(Date.now()));
        window.dispatchEvent(new Event('rides:unlocked'));
        console.log('Your colours are unlocked (no rides saved). simulateAllLines(\'undo\') locks them again.');
      }
    } else {
      console.log('Preview: nothing saved, so Pick my colours opens Theme with Your colours still locked.');
    }
    closeAll();
    stop();
    window.Confetti?.stop?.();
    return start({ as });
  }

  window.simulateAllLines = simulateAllLines;
})();
