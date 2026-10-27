// Confetti, on your birthday (script.js, "Greeting"): a burst from the top of the screen that
// falls and fades over a few seconds, drawn on a canvas over everything that taps go through.
// Nothing with reduced motion asked for. burst({ colours, count, life }) for other occasions: the
// flat celebration for every line ridden (js/celebrate.js) throws the lines' colours. stop() takes
// a burst away at once (the console's simulateAllLines(), js/celebrate.js). Plain script: exports
// go on window.
(function () {
  const COLOURS = ["#ff5d8f", "#ffd166", "#06d6a0", "#4cc9f0", "#9b5de5", "#f15bb5", "#00bbf9", "#fee440"];
  const COUNT = 160;
  const LIFE_MS = 4500;
  let running = null;
  let tidy = null;

  function burst({ colours = COLOURS, count = COUNT, life = LIFE_MS } = {}) {
    if (running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const size = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener("resize", size);
    tidy = () => {
      window.removeEventListener("resize", size);
      canvas.remove();
    };

    // Thrown up and out from two points along the top, then falling, tumbling as they go.
    const bits = Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 70;
      const speed = 5 + Math.random() * 7;
      return {
        x: w * (fromLeft ? 0.25 : 0.75),
        y: h * 0.2,
        vx: Math.cos((angle * Math.PI) / 180) * speed,
        vy: Math.sin((angle * Math.PI) / 180) * speed,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.3,
        sway: Math.random() * Math.PI * 2,
        colour: colours[i % colours.length],
        round: Math.random() < 0.25,
      };
    });

    const started = performance.now();
    let last = started;
    running = requestAnimationFrame(function frame(now) {
      const dt = Math.min(3, (now - last) / 16.7);
      last = now;
      const age = now - started;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, (life - age) / 1000));
      for (const b of bits) {
        b.vy += 0.18 * dt;
        b.vx *= Math.pow(0.985, dt);
        b.vy = Math.min(b.vy, 4.5);
        b.sway += 0.08 * dt;
        b.x += (b.vx + Math.sin(b.sway) * 0.8) * dt;
        b.y += b.vy * dt;
        b.spin += b.vspin * dt;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.fillStyle = b.colour;
        if (b.round) {
          ctx.beginPath();
          ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Squashed as it turns, like a flat piece of paper.
          ctx.fillRect(-b.w / 2, (-b.h / 2) * Math.cos(b.sway), b.w, b.h * Math.cos(b.sway));
        }
        ctx.restore();
      }
      if (age < life) {
        running = requestAnimationFrame(frame);
        return;
      }
      tidy();
      tidy = null;
      running = null;
    });
  }

  function stop() {
    if (!running) return;
    cancelAnimationFrame(running);
    tidy?.();
    tidy = null;
    running = null;
  }

  window.Confetti = { burst, stop };
})();
