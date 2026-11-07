// The magic cup (Augy, 7 November 2026): Singapore's famous language-changing cup, as a quick
// loading screen while the language changes, all of it within a second. One sip, one new language.
//
// All of it within a second, the page opening again included, which can't be cut short. So I18n.set
// and unset (js/i18n.js) call play(), wait only LEAD_MS, and start the page opening again in the new
// language: this one stays up, and the cup spinning, until the new one's ready, which then fades
// in from the page's colour (data-cup-out, index.html's first script, style.css).
//
// The cup's made with three.js, as the celebration is (js/celebrate.js): a lathe of its outside
// painted with magic-cup-texture.png, its inside, and tea swishing the other way as it turns. three.js
// (the same vendored copy, kept as MapLibre is once fetched) is fetched when the language list
// opens (warm), and never waited for: with it not here yet, or no WebGL, Data Saver or little
// memory, a flat cup turns instead, its pattern sliding across it. With reduced motion, the flat
// cup stands still. Plain script: exports go on window.
(function () {
  const THREE_URL = '/vendor/three-0.169.0/three.module.min.js';
  const TEXTURE = '/magic-cup-texture.png';
  const LEAD_MS = 300;
  const STILL_MS = 100;
  const TURN_MS = 300;
  const OUT_KEY = 'sgbus_cup_out';
  const ID = 'magicCup';

  // The cup's shape, [radius, height], foot to rim, and inside, rim to the bottom.
  const OUTSIDE = [[0, 0], [0.3, 0], [0.31, 0.03], [0.29, 0.05], [0.36, 0.1], [0.44, 0.3], [0.46, 0.55], [0.44, 0.78], [0.43, 0.9], [0.46, 1]];
  const INSIDE = [[0.46, 1], [0.44, 1], [0.415, 0.9], [0.425, 0.75], [0.43, 0.5], [0.4, 0.25], [0.3, 0.1], [0, 0.08]];
  const TEA_Y = 0.8;
  const TEA_R = 0.423;

  const still = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const low = () => !!navigator.connection?.saveData || (navigator.deviceMemory || 8) <= 2;
  const webgl = () => {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  };

  let T = null;
  let loading = null;
  let picture = null;

  // Ahead of it being wanted: the language list opening. Nothing waits for this.
  function warm() {
    if (T || loading || still() || low() || !webgl()) return;
    loading = import(THREE_URL).then((m) => { T = m; }, () => { loading = null; });
    if (!picture) {
      const img = new Image();
      img.onload = () => { picture = img; };
      img.src = TEXTURE;
    }
  }

  let frame = 0;
  let renderer = null;

  function scene3d(stage) {
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
    const size = stage.clientWidth;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    renderer.setSize(size, size, false);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 2.05, 2.45);
    camera.lookAt(0, 0.48, 0);
    scene.add(new T.HemisphereLight(0xffffff, 0x9fb2d6, 1.5));
    const sun = new T.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 3.5, 2.5);
    scene.add(sun);

    const cup = new T.Group();
    scene.add(cup);
    const texture = new T.Texture(picture);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.RepeatWrapping;
    texture.needsUpdate = true;
    const lathe = (points) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), 64);
    const outside = lathe(OUTSIDE);
    // Painted by height, not by how far along its outline, so the flowers keep their shape.
    const pos = outside.attributes.position;
    const uv = outside.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i));
    cup.add(new T.Mesh(outside, new T.MeshPhongMaterial({ map: texture, shininess: 110, specular: 0x777777 })));
    cup.add(new T.Mesh(lathe(INSIDE), new T.MeshPhongMaterial({ color: 0xf6f8fb, shininess: 90, specular: 0x555555, side: T.DoubleSide })));

    // The tea doesn't turn with the cup: it swishes round inside it.
    const RINGS = 8;
    const SEGS = 48;
    const place = new Float32Array((RINGS * SEGS + 1) * 3);
    const order = [];
    for (let s = 0; s < SEGS; s++) {
      const next = (s + 1) % SEGS;
      order.push(0, 1 + next, 1 + s);
      for (let r = 0; r < RINGS - 1; r++) {
        const a = 1 + r * SEGS + s;
        const b = 1 + r * SEGS + next;
        order.push(a, b + SEGS, a + SEGS, a, b, b + SEGS);
      }
    }
    const shape = new T.BufferGeometry();
    shape.setAttribute('position', new T.BufferAttribute(place, 3));
    shape.setIndex(order);
    const tea = new T.Mesh(shape, new T.MeshPhongMaterial({ color: 0xa96a1e, shininess: 140, specular: 0xffe2b0 }));
    scene.add(tea);
    const swish = (spin) => {
      const amp = 0.05;
      place[0] = 0;
      place[1] = TEA_Y;
      place[2] = 0;
      let i = 3;
      for (let r = 1; r <= RINGS; r++) {
        const k = r / RINGS;
        for (let s = 0; s < SEGS; s++) {
          const a = (s / SEGS) * Math.PI * 2;
          place[i++] = Math.cos(a) * TEA_R * k;
          place[i++] = TEA_Y + amp * k * Math.cos(a - spin) + 0.008 * Math.sin(k * 14 - spin * 2);
          place[i++] = Math.sin(a) * TEA_R * k;
        }
      }
      shape.attributes.position.needsUpdate = true;
      shape.computeVertexNormals();
    };

    const start = performance.now();
    const draw = (now) => {
      const spin = (Math.PI * 2 * (now - start)) / TURN_MS;
      cup.rotation.y = spin;
      swish(spin);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw(start);
    stage.append(renderer.domElement);
    stage.classList.add('cupIn3d');
  }

  function close() {
    cancelAnimationFrame(frame);
    renderer?.dispose();
    renderer = null;
    document.getElementById(ID)?.remove();
  }

  // Up at once, and done in LEAD_MS whatever it's drawn with. Never rejects.
  function play(code) {
    try { sessionStorage.setItem(OUT_KEY, '1'); } catch { /* it just doesn't fade in */ }
    if (document.visibilityState !== 'visible') return Promise.resolve();
    close();
    const box = document.createElement('div');
    box.id = ID;
    box.setAttribute('role', 'status');
    const name = window.I18n?.languages?.[code] || '';
    const stage = document.createElement('div');
    stage.className = 'cupStage';
    const flat = document.createElement('div');
    flat.className = 'cupFlat';
    flat.style.backgroundImage = `url(${TEXTURE})`;
    stage.append(flat);
    box.append(stage);
    if (name) {
      const words = document.createElement('p');
      words.className = 'cupWords';
      words.textContent = name;
      words.lang = code;
      box.append(words);
    }
    document.body.append(box);
    if (T && picture && !still()) {
      try { scene3d(stage); } catch (err) { console.warn('the flat cup, then:', err); }
    }
    return new Promise((done) => { setTimeout(done, still() ? STILL_MS : LEAD_MS); });
  }

  window.MagicCup = { warm, play, close };
})();
