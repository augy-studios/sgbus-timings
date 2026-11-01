// uwuCoins (Augy, 1 November 2026): coins for every trip taken with the Get Off Alert to the end,
// with a ride on it shown to be real (js/rides.js), and for each feat (js/eggs.js); spent on the
// wheel in Settings' Help and extras, where every spin wins something: an Easter egg not found
// yet, with what it unlocks, or coins.
//
// A trip's coins (forTrip):
//   FINISH                        for getting there
//   + 1 for every KM_PER_COIN km ridden, up to KM_COINS_MAX
//   + PER_CHANGE for each change between rides
//   + PER_OPERATOR for each bus operator ridden with (SBS Transit, SMRT, Tower Transit, Go-Ahead)
//   + PER_OPERATOR for each train operator (SMRT Trains, SBS Transit's rail lines)
//   + PER_LINE for each MRT or LRT line
// A feat is worth Eggs.FEAT_COINS, once.
//
// The wheel: SPIN_COST a spin, and SLOTS, each as likely as the others. The egg slot gives an egg
// not found yet, at random (Eggs.found); once every egg's found, it's coins instead.
//
// Kept under KEY as { balance, log: [{ at, n, why, trip?, feat? }] (the last LOG_MAX), spins }:
// this phone's, not synced, as the rides they're for are. The Edge Tray's coin button
// (#coinsBtn, data-tray-extra="coins") says the balance and opens the wheel.
//
// Window.Coins = { balance(), add(n, { why }), tripDone(trip), forTrip(trip), spin(), open() }.
// The console's simulateCoins(n) gives coins for a look (below). Plain script: exports go on
// window.
(function () {
  const KEY = 'sgbus_coins';
  const LOG_MAX = 100;
  const FINISH = 5;
  const KM_PER_COIN = 2;
  const KM_COINS_MAX = 30;
  const PER_CHANGE = 3;
  const PER_OPERATOR = 4;
  const PER_LINE = 2;
  const SPIN_COST = 100;
  // Round the wheel, clockwise from the top.
  // One egg among them (Augy, 2 November 2026): an egg is one spin in eight.
  const SLOTS = [{ egg: true }, { coins: 20 }, { coins: 50 }, { coins: 30 }, { coins: 70 }, { coins: 40 }, { coins: 150 }, { coins: 60 }];
  // The egg slot once every egg's found.
  const EGG_GONE_COINS = 80;
  const SPIN_MS = 3600;
  // The LRT loops' halves and the branches go by their line; SBS Transit runs these, SMRT the rest.
  const SAME_LINE = { CG: 'EW', CE: 'CC', SE: 'SK', SW: 'SK', PE: 'PG', PW: 'PG' };
  const SBS_LINES = ['NE', 'DT', 'SK', 'PG'];
  const $ = (id) => document.getElementById(id);
  const tr = (k, en, v) => (window.I18n ? I18n.t(k, en, v) : en);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v === 'object') return { balance: Math.max(0, Number(v.balance) || 0), log: Array.isArray(v.log) ? v.log : [], spins: Number(v.spins) || 0 };
    } catch { /* none yet */ }
    return { balance: 0, log: [], spins: 0 };
  }
  function write(v) {
    v.log = v.log.slice(0, LOG_MAX);
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* this visit only */ }
    window.dispatchEvent(new CustomEvent('coins:change', { detail: { balance: v.balance } }));
  }
  const balance = () => read().balance;

  function add(n, info = {}) {
    if (!(n > 0)) return;
    const v = read();
    v.balance += n;
    v.log.unshift({ at: Date.now(), n, ...info });
    write(v);
    toast(n);
  }

  // ---------- a trip's coins ----------

  function metres([lat1, lng1], [lat2, lng2]) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  const isRide = (leg) => leg && (leg.kind === 'bus' || leg.kind === 'train') && Array.isArray(leg.points) && leg.points.length >= 2;
  const lineOf = (leg) => {
    const code = String(leg.route || leg.label || '').toUpperCase().match(/^[A-Z]{2}/)?.[0] || '';
    return SAME_LINE[code] || code;
  };
  const busOperator = (leg) => {
    try { return (window.BusNet?.isReady?.() && BusNet.serviceInfo(leg.service || leg.route)?.op) || ''; } catch { return ''; }
  };

  // The coins a trip's worth, as { n, parts: { finish, km, changes, busOps, trainOps, lines } },
  // or null for one without a real ride.
  function forTrip(trip) {
    const rides = (trip?.legs || []).filter(isRide);
    if (!rides.length || !(trip.seen || []).some((s) => s?.ok)) return null;
    let m = 0;
    for (const leg of rides) for (let i = 1; i < leg.points.length; i++) m += metres(leg.points[i - 1], leg.points[i]);
    const lines = new Set(rides.filter((l) => l.kind === 'train').map(lineOf).filter(Boolean));
    const trainOps = new Set([...lines].map((l) => (SBS_LINES.includes(l) ? 'SBS' : 'SMRT')));
    const busOps = new Set(rides.filter((l) => l.kind === 'bus').map(busOperator).filter(Boolean));
    const parts = {
      finish: FINISH,
      km: Math.min(KM_COINS_MAX, Math.floor(m / 1000 / KM_PER_COIN)),
      changes: PER_CHANGE * (rides.length - 1),
      busOps: PER_OPERATOR * busOps.size,
      trainOps: PER_OPERATOR * trainOps.size,
      lines: PER_LINE * lines.size,
    };
    return { n: Object.values(parts).reduce((a, b) => a + b, 0), parts };
  }

  // A trip arrived at (js/trip.js): its coins, once.
  function tripDone(trip) {
    if (!trip?.tripId || read().log.some((e) => e.trip === trip.tripId)) return;
    const got = forTrip(trip);
    if (got) add(got.n, { why: 'trip', trip: trip.tripId });
  }

  // ---------- the wheel ----------

  const eggsLeft = () => (window.Eggs ? Eggs.all.filter((id) => !Eggs.list().includes(id)) : []);
  const slotNow = (s) => (s.egg && !eggsLeft().length ? { coins: EGG_GONE_COINS } : s);

  let spinning = false;
  let turned = 0;

  // A spin: the coins taken, a slot picked, and what it won given. Returns { slot, egg, got } or
  // null without enough coins.
  function spin() {
    const v = read();
    if (v.balance < SPIN_COST || spinning) return null;
    v.balance -= SPIN_COST;
    v.spins += 1;
    v.log.unshift({ at: Date.now(), n: -SPIN_COST, why: 'spin' });
    write(v);
    const index = Math.floor(Math.random() * SLOTS.length);
    const slot = slotNow(SLOTS[index]);
    let egg = null;
    let got = null;
    if (slot.egg) {
      const left = eggsLeft();
      egg = left[Math.floor(Math.random() * left.length)];
      got = Eggs.found(egg);
    } else {
      const w = read();
      w.balance += slot.coins;
      w.log.unshift({ at: Date.now(), n: slot.coins, why: 'wheel' });
      write(w);
    }
    return { index, slot, egg, got };
  }

  // The wheel as an SVG: a slice a slot, an egg or the coins it gives.
  function wheelSvg() {
    const n = SLOTS.length;
    const r = 100;
    const pt = (a, d) => [r + d * Math.sin(a), r - d * Math.cos(a)];
    return `<svg viewBox="0 0 200 200" class="coinWheelSvg" aria-hidden="true">${SLOTS.map((s0, i) => {
      const s = slotNow(s0);
      const a0 = (i / n) * 2 * Math.PI - Math.PI / n;
      const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / n;
      const [x0, y0] = pt(a0, r);
      const [x1, y1] = pt(a1, r);
      const [tx, ty] = pt((i / n) * 2 * Math.PI, r * 0.66);
      const label = s.egg ? '🥚' : String(s.coins);
      return `<path d="M${r},${r} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" class="coinSlice ${s.egg ? 'egg' : i % 2 ? 'odd' : 'even'}"/>` +
        `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" transform="rotate(${(i * 360) / n} ${tx.toFixed(2)} ${ty.toFixed(2)})" class="coinSliceText">${label}</text>`;
    }).join('')}<circle cx="100" cy="100" r="16" class="coinHub"/></svg>`;
  }

  function render() {
    const v = read();
    for (const el of document.querySelectorAll('[data-coins-balance]')) el.textContent = String(v.balance);
    const box = $('coinsBox');
    if (!box) return;
    if (!spinning) $('coinWheel').innerHTML = wheelSvg();
    const btn = $('coinSpin');
    btn.disabled = spinning || v.balance < SPIN_COST;
    btn.querySelector('.lbl').textContent = tr('coins.spin', 'Spin for {n}', { n: SPIN_COST });
    $('coinNeed').hidden = v.balance >= SPIN_COST || spinning;
    $('coinNeed').textContent = tr('coins.need', '{n} more uwuCoins for a spin.', { n: SPIN_COST - v.balance });
    const feats = window.Eggs?.feats() || [];
    const eggs = window.Eggs?.list() || [];
    $('coinFeats').textContent = `${tr('eggs.featCount', '{n} of {all} feats done', { n: feats.length, all: window.Eggs?.all.length || 6 })} · ${tr('eggs.count', '{n} of {all} Easter eggs found', { n: eggs.length, all: window.Eggs?.all.length || 6 })}`;
  }

  function result(r) {
    const out = $('coinResult');
    out.hidden = false;
    if (r.slot.egg) {
      out.innerHTML = `<strong>${esc(tr('coins.wonEgg', 'An Easter egg: {name}!', { name: Eggs.name(r.egg) }))}</strong> ${esc(Eggs.prizeText(r.egg, r.got))}`;
      window.Confetti?.burst?.();
    } else {
      out.innerHTML = `<strong>${esc(tr('coins.wonCoins', '{n} uwuCoins!', { n: r.slot.coins }))}</strong>`;
    }
  }

  function doSpin() {
    const r = spin();
    if (!r) return;
    spinning = true;
    $('coinResult').hidden = true;
    render();
    const svg = $('coinWheel').querySelector('svg');
    const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // A few turns, then slot `index` under the pointer at the top.
    const slice = 360 / SLOTS.length;
    turned += (still ? 0 : 5 * 360) + ((360 - ((turned % 360) + r.index * slice) % 360) % 360);
    svg.style.transition = still ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.25, 1)`;
    svg.style.transform = `rotate(${turned}deg)`;
    setTimeout(() => {
      spinning = false;
      result(r);
      render();
      $('coinWheel').querySelector('svg').style.transform = `rotate(${turned}deg)`;
    }, still ? 50 : SPIN_MS + 100);
  }

  // A chip that floats up from the bottom for a moment: coins in.
  function toast(n) {
    const el = document.createElement('div');
    el.className = 'coinToast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span data-icon="coin"></span> ${esc(tr('coins.toast', '+{n} uwuCoins', { n }))}`;
    document.body.appendChild(el);
    window.hydrateIcons?.(el);
    setTimeout(() => el.remove(), 3200);
  }

  // Settings, Help and extras, at the wheel.
  function open() {
    if (typeof window.openSettings !== 'function') return;
    window.openSettings('help');
    render();
    setTimeout(() => $('coinsBox')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
  }

  function init() {
    $('coinSpin')?.addEventListener('click', doSpin);
    // Achievements, Settings' group of their own (js/eggs.js).
    $('coinAchievements')?.addEventListener('click', () => window.openSettingsGroup?.('achievements'));
    $('coinsBtn')?.addEventListener('click', open);
    for (const ev of ['coins:change', 'eggs:found', 'eggs:feat']) window.addEventListener(ev, () => { if (!spinning) render(); });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // In the browser's console (or chrome://inspect's, for the Android app), for a look at the
  // wheel without the trips:
  //   simulateCoins(500)            500 more, with the coin that floats up; a minus takes away
  //   simulateCoins('set', 1000)    exactly that many
  //   simulateCoins()               how many there are; 'help' says the rest
  // Kept in the log as why: 'simulated'. This browser's own storage and nothing else.
  const COIN_HELP = "simulateCoins(n) gives n uwuCoins, simulateCoins(-n) takes n away, simulateCoins('set', n) makes it exactly n, simulateCoins() says how many there are, simulateCoins('help') shows this.";
  window.simulateCoins = (n, to) => {
    const v = read();
    if (n === undefined) return `${v.balance} uwuCoins. ${COIN_HELP}`;
    const want = n === 'set' ? Number(to) : v.balance + Number(n);
    if ((n !== 'set' && typeof n !== 'number') || !Number.isFinite(want)) return COIN_HELP;
    const next = Math.max(0, Math.round(want));
    const diff = next - v.balance;
    if (diff > 0) add(diff, { why: 'simulated' });
    else if (diff < 0) {
      v.balance = next;
      v.log.unshift({ at: Date.now(), n: diff, why: 'simulated' });
      write(v);
    }
    if (!spinning) render();
    return `${next} uwuCoins`;
  };

  window.Coins = { balance, add, tripDone, forTrip, spin, open, SPIN_COST };
})();
