// Feats, Easter eggs, and the secrets the eggs unlock (Augy, 1 November 2026).
//
// Six feats, each done once, and each worth FEAT_COINS uwuCoins (js/coins.js):
//
//   lines  every MRT and LRT line ridden (js/rides.js, UNLOCK)
//   up     buses 12, 34, 56, 78 and 90 all ridden, ever, in any order (js/rides.js's record)
//   down   buses 9, 87, 65, 43 and 21 the same
//   loop   a trip with a stop on the way that ends back where it started (LOOP_M), with a ride
//          on it, taken with the Get Off Alert to the end (js/trip.js, arrived)
//   long   a trip that took over LONG_MS from start to arriving, the same
//   ktm    a trip between two of the old KTM railway's places, the same: Woodlands Train
//          Checkpoint's bus stop, Cantonment MRT (by the old Tanjong Pagar station) and King
//          Albert Park MRT (by the old Bukit Timah station), each within KTM_M
//
// A ride counts only once it's shown to be real (js/rides.js, verdict), and a trip feat needs at
// least one such ride on it.
//
// The Easter eggs are the uwuCoins wheel's prizes (js/coins.js), one for each feat and named
// after it: a feat done doesn't find its egg, only the wheel does. Each egg found unlocks a
// secret still locked, picked at random, so which comes first is chance: Your colours
// (js/colours.js, one colour of your own for the whole app); in the Android app on Android 12
// and later, Your phone's colours (Material You's, from its wallpaper); and in the Android app,
// the Material You look (js/material.js, the whole app redrawn as Android's own apps are). Once
// every one that can be had is, an egg unlocks nothing more. Eggs found in a browser count when the app is opened later: the secrets
// catch up with the eggs (settle). Each egg but `lines` also adds a preset to Your colours.
//
// Kept under FEATS_KEY and EGGS_KEY as { id: when }. Your colours unlocked is UNLOCKED_KEY, as
// it was when riding every line unlocked it; Your phone's colours PHONE_KEY; the Material You
// look MATERIAL_KEY. Riding every line
// before there were eggs counts as that feat done and its egg found. A feat is said once
// (TOLD_KEY) in #eggModal, or for `lines` the celebration (js/celebrate.js). Not synced: they're
// this phone's.
//
// A shortcut to Your phone's colours and the Material You look (Augy, 1 and 2 November 2026): the
// greeting tapped three times and Settings' title tapped three times, within TRICK_MS of each
// other in either order, unlocks both and puts on each that can be had here at once (trick). Kept
// as "trick:<when>", so neither is counted as an egg's secret and the next egg still unlocks
// one. Done again, both are off, and locked again where the trick unlocked them.
//
// Settings' Achievements lists each feat with how far along it is (progress, renderAchievements).
// Each feat done has its Share, and Achievements as a whole has one too: a card for socials with
// a short /feat/<id> link (js/share.js, Share.feat). Opened, the link says what was done, here
// in #eggModal, with how far along the person opening it is (showShared).
//
// Window.Eggs = { feat(id), found(id), progress(), rides(record), tripDone(trip), pastTrip(trip),
// gather(fn), feats(), list(), has(secret), presets(), name(id), doneOn(id), showShared(data), all }. Past trips, from before
// uwuCoins, do their feats once (js/retrofit.js: pastTrip, inside gather). The console's
// simulateEgg(id) does a feat, and simulateEgg(id, 'egg') finds an egg, for a look;
// simulateHelp() lists every simulate command (these, simulateCoins in js/coins.js, simulateRide
// in js/rides.js, simulatePastTrips in js/retrofit.js, simulateAllLines in js/celebrate.js).
// Plain script: exports go on window.
(function () {
  const FEATS_KEY = 'sgbus_feats';
  const EGGS_KEY = 'sgbus_eggs';
  const UNLOCKED_KEY = 'sgbus_colours_unlocked'; // js/rides.js
  const PHONE_KEY = 'sgbus_phone_colours_unlocked';
  const MATERIAL_KEY = 'sgbus_material_unlocked'; // index.html's head
  const TOLD_KEY = 'sgbus_eggs_told';
  const FEAT_COINS = 100;
  const TRICK_MS = 30 * 1000;
  // Three taps this close together are a triple tap.
  const TAPS_MS = 700;
  const LOOP_M = 300;
  // The stop on the way at least this far from the start, so a lap of the block isn't a loop.
  const LOOP_AWAY_M = 1000;
  const LONG_MS = 3 * 3600 * 1000;
  const KTM_M = 400;
  const KTM = {
    woodlands: [1.442783, 103.769356], // W'lands Train Checkpt, 46069
    cantonment: [1.273115, 103.837028], // CC31
    kingAlbertPark: [1.33566, 103.78416], // DT6
  };
  const tr = (k, en, v) => (window.I18n ? I18n.t(k, en, v) : en);

  // Each feat and its egg: what it's called, how it was done, and the egg's preset. Their share
  // cards have them in English: keep FEATS in api/_lib/share-links.js in step.
  const EGGS = {
    lines: { goal: () => tr('eggs.lines.goal', 'Ride every MRT and LRT line.'), name: () => tr('eggs.lines', 'Every line ridden'), how: () => tr('eggs.lines.how', 'You rode every MRT and LRT line.') },
    up: { goal: () => tr('eggs.up.goal', 'Ride buses 12, 34, 56, 78 and 90.'), buses: ['12', '34', '56', '78', '90'], name: () => tr('eggs.up', '12, 34, 56, 78, 90'), how: () => tr('eggs.up.how', 'You rode buses 12, 34, 56, 78 and 90.'), preset: { id: 'rising', base: '#ff9e40', name: () => tr('colours.preset.rising', 'Rising') } },
    down: { goal: () => tr('eggs.down.goal', 'Ride buses 9, 87, 65, 43 and 21.'), buses: ['9', '87', '65', '43', '21'], name: () => tr('eggs.down', '9, 87, 65, 43, 21'), how: () => tr('eggs.down.how', 'You rode buses 9, 87, 65, 43 and 21.'), preset: { id: 'sunset', base: '#8e5bd0', name: () => tr('colours.preset.sunset', 'Sunset') } },
    loop: { goal: () => tr('eggs.loop.goal', 'Go somewhere by way of a stop, and come back to where you started.'), name: () => tr('eggs.loop', 'There and back again'), how: () => tr('eggs.loop.how', 'You went somewhere and came back to where you started.'), preset: { id: 'loop', base: '#fa9e0d', name: () => tr('colours.preset.loop', 'Loop') } },
    long: { goal: () => tr('eggs.long.goal', 'Take a trip of over three hours.'), name: () => tr('eggs.long', 'The long way round'), how: () => tr('eggs.long.how', 'You took a trip of over three hours.'), preset: { id: 'longhaul', base: '#2f5fd0', name: () => tr('colours.preset.longhaul', 'Long haul') } },
    ktm: { goal: () => tr('eggs.ktm.goal', 'Travel between two places on the old KTM railway line.'), name: () => tr('eggs.ktm', 'Down the old railway'), how: () => tr('eggs.ktm.how', 'You travelled between two places on the old KTM railway line.'), preset: { id: 'ktm', base: '#2e7d32', name: () => tr('colours.preset.ktm', 'KTM') } },
  };
  const IDS = Object.keys(EGGS);

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };
  const readJson = (k, empty) => { try { return JSON.parse(get(k) || 'null') ?? empty; } catch { return empty; } };

  function metres([lat1, lng1], [lat2, lng2]) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // { id: when }, of the feats done or the eggs found. Every line ridden when it unlocked Your
  // colours by itself counts as both.
  const legacy = () => !get(EGGS_KEY) && !get(FEATS_KEY) && !!get(UNLOCKED_KEY);
  function read(key) {
    const v = readJson(key, {});
    const out = v && typeof v === 'object' ? v : {};
    if (!Object.keys(out).length && legacy()) out.lines = Number(get(UNLOCKED_KEY)) || Date.now();
    return out;
  }
  const feats = () => IDS.filter((id) => read(FEATS_KEY)[id]);
  // The day a feat was done, Singapore's, as "2026-11-01": for its share card. Null if it isn't.
  const doneOn = (id) => {
    const at = Number(read(FEATS_KEY)[id]);
    return at > 0 ? new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }) : null;
  };
  const list = () => IDS.filter((id) => read(EGGS_KEY)[id]);

  // ---------- the secrets ----------

  const SECRETS = { colours: UNLOCKED_KEY, phone: PHONE_KEY, material: MATERIAL_KEY };
  const phoneCan = () => !!window.AppBridge?.has?.('phonecolours');
  // The Material You look: in the Android app, any version of Android.
  const materialCan = () => !!window.AppBridge?.native;
  const has = (secret) => !!get(SECRETS[secret] || UNLOCKED_KEY);
  const told = () => {
    const v = readJson(TOLD_KEY, null);
    return Array.isArray(v) ? v : [];
  };
  const tell = (what) => put(TOLD_KEY, JSON.stringify([...new Set([...told(), what])]));

  // The secrets still locked that can be had here.
  const locked = () => ['colours', ...(phoneCan() ? ['phone'] : []), ...(materialCan() ? ['material'] : [])].filter((s) => !has(s));

  // As many secrets unlocked as there are eggs found, each picked at random from those left.
  // Returns the ones unlocked now.
  function settle() {
    const got = [];
    // The trick's unlock isn't an egg's.
    const unlockedCount = () => Object.keys(SECRETS).filter((s) => has(s) && !String(get(SECRETS[s])).startsWith('trick')).length;
    while (unlockedCount() < list().length) {
      const left = locked();
      if (!left.length) break;
      const pick = left[Math.floor(Math.random() * left.length)];
      put(SECRETS[pick], String(Date.now()));
      got.push(pick);
    }
    if (got.length) window.dispatchEvent(new CustomEvent('eggs:unlocked', { detail: { secrets: got } }));
    return got;
  }

  // The presets of the eggs found, for Your colours.
  const presets = () => list().map((id) => EGGS[id].preset).filter(Boolean);

  // What was unlocked, in words.
  function unlockedText(secrets) {
    const said = {
      colours: () => tr('eggs.got.colours', 'Your colours: pick one colour, and the app makes the whole theme from it.'),
      phone: () => tr('eggs.got.phone', 'Your phone’s colours: the whole app in the colours of your phone’s wallpaper.'),
      material: () => tr('eggs.got.material', 'Material You: the whole app redrawn the way Android’s own apps are.'),
    };
    return secrets.map((s) => (said[s] || said.colours)()).join(' ');
  }

  // ---------- an egg found, by the wheel ----------

  // Returns { secrets, preset } for the wheel to say, or null if it was found already.
  function found(id) {
    if (!EGGS[id] || read(EGGS_KEY)[id]) return null;
    const all = read(EGGS_KEY);
    all[id] = Date.now();
    put(EGGS_KEY, JSON.stringify(all));
    const secrets = settle();
    secrets.forEach(tell);
    window.dispatchEvent(new CustomEvent('eggs:found', { detail: { id, secrets } }));
    return { secrets, preset: EGGS[id].preset || null };
  }

  // What an egg brought, in words, for the wheel's result.
  function prizeText(id, got) {
    const lines = [];
    if (got?.secrets?.length) lines.push(tr('eggs.unlockedSecret', 'You’ve unlocked a secret: {what}', { what: unlockedText(got.secrets) }));
    if (got?.preset) {
      lines.push(has('colours')
        ? tr('eggs.gotPreset', 'Your colours has a new preset: {name}.', { name: got.preset.name() })
        : tr('eggs.presetLater', 'It also comes with a preset, {name}, for when Your colours is unlocked.', { name: got.preset.name() }));
    }
    return lines.join(' ');
  }

  // ---------- a feat done ----------

  // `quiet`: not said (simulateEgg('all')), and never said later either.
  function feat(id, { quiet = false } = {}) {
    if (!EGGS[id] || read(FEATS_KEY)[id]) return false;
    const all = read(FEATS_KEY);
    all[id] = Date.now();
    put(FEATS_KEY, JSON.stringify(all));
    // Done by past trips (gather): kept for js/retrofit.js to say all at once, with no coin
    // floating up for each.
    if (gathered) {
      gathered.push(id);
      tell(`feat:${id}`);
      window.Coins?.add(FEAT_COINS, { why: 'feat', feat: id, past: true }, { quiet: true });
      window.dispatchEvent(new CustomEvent('eggs:feat', { detail: { id } }));
      return true;
    }
    if (quiet) tell(`feat:${id}`);
    window.Coins?.add(FEAT_COINS, { why: 'feat', feat: id });
    window.dispatchEvent(new CustomEvent('eggs:feat', { detail: { id } }));
    announce(id);
    return true;
  }

  // The feats `fn` does, done without a window or a coin each, for js/retrofit.js to say
  // together: their ids.
  let gathered = null;
  function gather(fn) {
    const got = [];
    gathered = got;
    try { fn(); } finally { gathered = null; }
    return got;
  }

  // Said once: the feat window, or for every line ridden, the celebration.
  function announce(id) {
    if (told().includes(`feat:${id}`)) return;
    tell(`feat:${id}`);
    const coins = tr('eggs.featCoins', '+{n} uwuCoins, for a spin of the wheel in Settings.', { n: FEAT_COINS });
    if (id === 'lines' && window.Celebrate) {
      const text = `${tr('eggs.lines.text', 'You’ve ridden every MRT and LRT line.')} ${coins}`;
      for (const el of ['celebrateText', 'unlockText']) { const n = document.getElementById(el); if (n) n.textContent = text; }
      window.Celebrate.start();
      return;
    }
    if (!document.getElementById('eggModal')) return;
    document.getElementById('eggTitle').textContent = tr('eggs.featDone', 'You did something special!');
    document.getElementById('eggName').textContent = EGGS[id].name();
    document.getElementById('eggHow').textContent = EGGS[id].how();
    document.getElementById('eggGot').textContent = coins;
    document.getElementById('eggCount').textContent = tr('eggs.featCount', '{n} of {all} feats done', { n: feats().length, all: IDS.length });
    const go = document.getElementById('eggGo');
    if (go) { go.dataset.go = 'coins'; go.textContent = tr('coins.spinGo', 'Spin the wheel'); }
    window.openModal('eggModal');
    window.Confetti?.burst?.();
  }

  // ---------- Achievements, in Settings ----------

  // How far along each feat is: { id, name, how, done, have, need, egg }.
  function progress() {
    const rec = window.RideCheck?.record() || { lines: {}, buses: {} };
    const done = read(FEATS_KEY);
    const eggs = read(EGGS_KEY);
    return IDS.map((id) => {
      const e = EGGS[id];
      let have = done[id] ? 1 : 0;
      let need = 1;
      if (id === 'lines') {
        need = window.RideCheck?.LINES.length || 9;
        have = done[id] ? need : window.RideCheck?.progress().done.length || 0;
      } else if (e.buses) {
        need = e.buses.length;
        have = done[id] ? need : e.buses.filter((b) => rec.buses?.[b]?.n >= 1).length;
      }
      return { id, name: e.name(), how: done[id] ? e.how() : e.goal(), done: !!done[id], have, need, egg: !!eggs[id] };
    });
  }

  // Settings' Achievements (#achievementsList): each feat, how it's done, how far along it is,
  // its egg once the wheel's given it, and its Share once it's done.
  function renderAchievements() {
    const box = document.getElementById('achievementsList');
    if (!box) return;
    const all = progress();
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const done = all.filter((a) => a.done).length;
    document.getElementById('achievementsSummary').textContent = tr('eggs.featCount', '{n} of {all} feats done', { n: done, all: all.length });
    const shareAll = document.getElementById('achievementsShare');
    if (shareAll) shareAll.hidden = !done;
    box.innerHTML = all.map((a) => {
      const pct = Math.round((a.have / a.need) * 100);
      const state = a.done ? tr('achievements.done', 'Done') : a.need > 1 ? tr('achievements.of', '{have} of {need}', { have: a.have, need: a.need }) : tr('achievements.notYet', 'Not yet');
      return `<li class="achievement${a.done ? ' done' : ''}">` +
        `<div class="achievementHead"><strong>${esc(a.name)}</strong><span class="achievementState">${esc(state)}</span></div>` +
        `<p class="achievementHow">${esc(a.how)}</p>` +
        `<div class="achievementBar" role="progressbar" aria-valuemin="0" aria-valuemax="${a.need}" aria-valuenow="${a.have}" aria-label="${esc(a.name)}"><span style="width:${pct}%"></span></div>` +
        (a.egg ? `<p class="achievementEgg">${esc(tr('achievements.eggFound', 'Its Easter egg: found'))}</p>` : '') +
        (a.done ? `<button type="button" class="iconBtn achievementShare" data-feat-share="${a.id}">${window.icon ? `<span class="ico" aria-hidden="true">${window.icon('share')}</span>` : ''}<span>${esc(tr('achievements.share', 'Share'))}</span></button>` : '') +
        `</li>`;
    }).join('');
    document.getElementById('achievementsEggs').textContent = tr('eggs.count', '{n} of {all} Easter eggs found', { n: list().length, all: IDS.length });
  }

  // ---------- a feat shared with you ----------

  // A /feat/<id> link opened (js/share.js): { feat, done, name } as the sharer's app sent them,
  // feat null for their Achievements as a whole. What they did, and how far along you are.
  function showShared(data) {
    if (!document.getElementById('eggModal')) return;
    const who = data?.name || tr('eggs.shared.someone', 'Someone');
    const theirs = (data?.done || []).filter((id) => EGGS[id]);
    const one = EGGS[data?.feat] ? data.feat : null;
    document.getElementById('eggTitle').textContent = one
      ? tr('eggs.shared.title', '{who} did a feat!', { who })
      : tr('eggs.shared.titleAll', '{who}’s achievements', { who });
    document.getElementById('eggName').textContent = one ? EGGS[one].name() : tr('eggs.featCount', '{n} of {all} feats done', { n: theirs.length, all: IDS.length });
    document.getElementById('eggHow').textContent = one
      ? (feats().includes(one) ? tr('eggs.shared.youToo', 'You’ve done this one too.') : tr('eggs.shared.yourTurn', 'Your turn: {goal}', { goal: EGGS[one].goal() }))
      : theirs.map((id) => EGGS[id].name()).join(' · ');
    document.getElementById('eggGot').textContent = '';
    document.getElementById('eggCount').textContent = tr('eggs.shared.you', 'You: {n} of {all} feats done', { n: feats().length, all: IDS.length });
    const go = document.getElementById('eggGo');
    if (go) { go.dataset.go = 'achievements'; go.textContent = tr('achievements.see', 'See your achievements'); }
    window.openModal('eggModal');
    if (one) window.Confetti?.burst?.();
  }

  // ---------- the feats ----------

  // Rides really taken, as js/rides.js keeps them: the bus feats.
  function rides(rec) {
    for (const id of ['up', 'down']) {
      if (EGGS[id].buses.every((b) => rec?.buses?.[b]?.n >= 1)) feat(id);
    }
  }

  // A trip arrived at (js/trip.js): the trip feats.
  function tripDone(trip) {
    const legs = trip?.legs || [];
    const realRide = (trip.seen || []).some((s) => s?.ok);
    if (!realRide || !legs.length) return;
    const start = legs[0].points?.[0];
    const lastLeg = legs[legs.length - 1];
    const end = lastLeg.points?.[lastLeg.points.length - 1];
    if (!start || !end) return;
    const via = trip.origin?.via;
    const viaAt = via && Number.isFinite(via.lat) ? [via.lat, via.lng] : null;
    tripFeats(start, end, Date.now() - trip.startedAt, viaAt && metres(start, viaAt) >= LOOP_AWAY_M);
  }

  // A trip's feats, by where it started and ended, how long it took, and whether it went by way
  // of somewhere well away.
  function tripFeats(start, end, ms, away) {
    // Over three hours, start to arriving.
    if (ms >= LONG_MS) feat('long');
    // Back where it started, by way of somewhere well away.
    if (away && metres(start, end) <= LOOP_M) feat('loop');
    // From one of the old railway's places to another.
    const near = (p) => Object.keys(KTM).find((k) => metres(p, KTM[k]) <= KTM_M);
    const a = near(start);
    const b = near(end);
    if (a && b && a !== b) feat('ktm');
  }

  // A trip from before uwuCoins, as Your trips keeps it (js/history.js, js/retrofit.js), that
  // got there with a ride on it: the trip feats too. Its stop on the way isn't kept, so a trip
  // back to where it started counts as by way of somewhere when it took two rides or more to
  // get there, there and back.
  function pastTrip(trip) {
    const at = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lat, p.lng] : null);
    const start = at(trip?.from);
    const end = at(trip?.to);
    const rides = (trip?.legs || []).filter((l) => l?.done && (l.kind === 'bus' || l.kind === 'train'));
    if (!trip?.arrived || !rides.length || !start || !end) return;
    const ms = (Number(trip.endedAt) || 0) - (Number(trip.startedAt) || 0);
    tripFeats(start, end, ms, rides.length >= 2);
  }

  // ---------- the trick ----------

  // Each place tapped three times, and when: both within TRICK_MS, and it's on.
  const tripled = {};
  function tapped(where) {
    const now = Date.now();
    const t = (tripled[where] ??= { taps: [], at: 0 });
    t.taps = [...t.taps.filter((at) => now - at <= TAPS_MS * 2), now];
    if (t.taps.length < 3 || now - t.taps[t.taps.length - 3] > TAPS_MS * 2) return;
    t.taps = [];
    t.at = now;
    const other = tripled[where === 'greeting' ? 'settings' : 'greeting'];
    if (other?.at && now - other.at <= TRICK_MS) {
      tripled.greeting.at = 0;
      tripled.settings.at = 0;
      trick();
    }
  }

  // The secrets the trick unlocks and puts on.
  const TRICKED = ['phone', 'material'];

  function trick() {
    const byTrick = (secret) => String(get(SECRETS[secret]) || '').startsWith('trick');
    // Done again: both off, and locked again where the trick was what unlocked them.
    if (TRICKED.some(byTrick) || window.Colours?.phoneOn?.() || window.Material?.on?.()) {
      if (window.Colours?.phoneOn?.()) window.Colours.stopPhone();
      if (window.Material?.on?.()) window.Material.stop();
      const relock = TRICKED.filter(byTrick);
      if (relock.length) {
        for (const secret of relock) put(SECRETS[secret], null);
        put(TOLD_KEY, JSON.stringify(told().filter((x) => !relock.includes(x))));
        window.dispatchEvent(new CustomEvent('eggs:unlocked', { detail: { secrets: [] } }));
      }
      return;
    }
    const fresh = TRICKED.filter((secret) => !has(secret));
    for (const secret of fresh) {
      put(SECRETS[secret], `trick:${Date.now()}`);
      tell(secret);
    }
    if (fresh.length) window.dispatchEvent(new CustomEvent('eggs:unlocked', { detail: { secrets: fresh } }));
    // Where they can be had, they're on now: the look in the Android app, and the colours there
    // on Android 12 and later. Anywhere else, it says where they work.
    let on = false;
    if (materialCan() && window.Material) { window.Material.use(); on = true; }
    if (phoneCan() && window.Colours?.usePhone) { window.Colours.usePhone(); on = true; }
    if (on || !document.getElementById('eggModal')) return;
    document.getElementById('eggTitle').textContent = tr('eggs.trick.title', 'A secret, unlocked');
    document.getElementById('eggName').textContent = tr('eggs.trick.what', 'Your phone’s colours and Material You');
    document.getElementById('eggHow').textContent = tr('eggs.trick.where', 'They work in the SG Bus Timings Android app: the whole app redrawn the way Android’s own apps are, and on Android 12 and later, in your phone’s own colours.');
    document.getElementById('eggGot').textContent = '';
    document.getElementById('eggCount').textContent = '';
    const go = document.getElementById('eggGo');
    if (go) { go.dataset.go = 'theme'; go.textContent = tr('eggs.go', 'Open Theme'); }
    window.openModal('eggModal');
  }

  function init() {
    renderAchievements();
    for (const ev of ['eggs:feat', 'eggs:found', 'eggs:unlocked']) window.addEventListener(ev, renderAchievements);
    // Opened: brought up to date, rides counted since included.
    document.querySelector('[data-settings-open="achievements"]')?.addEventListener('click', renderAchievements);
    document.getElementById('coinAchievements')?.addEventListener('click', renderAchievements);
    // Share: a feat's card, or Achievements' as a whole (js/share.js).
    document.getElementById('achievementsList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-feat-share]');
      if (btn) window.Share?.feat(btn.dataset.featShare);
    });
    document.getElementById('achievementsShare')?.addEventListener('click', () => window.Share?.feat(null));
    document.getElementById('greeting')?.addEventListener('click', () => tapped('greeting'));
    document.getElementById('settingsTitle')?.addEventListener('click', () => tapped('settings'));
    // Back in the app with eggs found elsewhere: the secrets catch up, said in the window.
    const catchUp = () => {
      const fresh = settle().filter((s) => !told().includes(s));
      if (!fresh.length || !document.getElementById('eggModal')) return;
      fresh.forEach(tell);
      document.getElementById('eggTitle').textContent = tr('eggs.catchUp.title', 'A secret for your eggs');
      document.getElementById('eggName').textContent = '';
      document.getElementById('eggHow').textContent = tr('eggs.catchUp.how', 'You’d found more Easter eggs than secrets unlocked.');
      document.getElementById('eggGot').textContent = tr('eggs.unlockedSecret', 'You’ve unlocked a secret: {what}', { what: unlockedText(fresh) });
      document.getElementById('eggCount').textContent = tr('eggs.count', '{n} of {all} Easter eggs found', { n: list().length, all: IDS.length });
      const go = document.getElementById('eggGo');
      if (go) { go.dataset.go = 'theme'; go.textContent = tr('eggs.go', 'Open Theme'); }
      window.openModal('eggModal');
    };
    window.AppBridge?.ready?.(4000).then(() => setTimeout(catchUp, 1500));
    document.getElementById('eggGo')?.addEventListener('click', () => {
      window.closeModal('eggModal');
      const to = document.getElementById('eggGo').dataset.go;
      setTimeout(() => (to === 'coins' ? window.Coins?.open() : to === 'achievements' ? window.openSettings?.('achievements') : window.Colours?.open()), 50);
    });
    document.getElementById('eggLater')?.addEventListener('click', () => window.closeModal('eggModal'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // In the browser's console (or chrome://inspect's, for the Android app), for a look:
  //   simulateEgg('ktm')          that feat done, as if it had been: its window and its coins
  //   simulateEgg('ktm', 'egg')   its egg found, as the wheel would, with what it unlocks
  //   simulateEgg('all')          every feat not done yet, done, without a window each
  //   simulateEgg('all', 'egg')   every egg not found yet, found
  //   simulateEgg('undo')         every feat, egg and secret taken away again (not the coins)
  //   simulateEgg('help')         this, in words
  // This browser's own storage and nothing else, as anything typed in its console is.
  const EGG_HELP = `simulateEgg(id) does a feat, with its window and ${FEAT_COINS} uwuCoins; simulateEgg(id, 'egg') finds its Easter egg, as the wheel would. ids: ${IDS.join(', ')}. simulateEgg('all') does every feat, simulateEgg('all', 'egg') finds every egg, simulateEgg('undo') takes every feat, egg and secret away again (not the coins), simulateEgg('help') shows this.`;
  window.simulateEgg = (id, what) => {
    if (id === 'undo') {
      for (const k of [FEATS_KEY, EGGS_KEY, UNLOCKED_KEY, PHONE_KEY, MATERIAL_KEY, TOLD_KEY]) put(k, null);
      window.Colours?.paint(null);
      window.Material?.stop();
      window.dispatchEvent(new Event('eggs:unlocked'));
      return 'undone';
    }
    if (id === 'all') {
      if (what === 'egg') {
        const got = IDS.filter((e) => found(e));
        return got.length ? `found: ${got.map((e) => EGGS[e].name()).join('; ')}. ${list().length} of ${IDS.length} Easter eggs found.` : 'every egg found already';
      }
      const done = IDS.filter((f) => feat(f, { quiet: true }));
      return done.length ? `done: ${done.map((f) => EGGS[f].name()).join('; ')}, +${done.length * FEAT_COINS} uwuCoins. ${feats().length} of ${IDS.length} feats done.` : 'every feat done already';
    }
    if (!EGGS[id]) return EGG_HELP;
    if (what === 'egg') {
      const got = found(id);
      return got ? `found: ${prizeText(id, got)}` : 'already found';
    }
    return feat(id) ? 'done' : 'already done';
  };

  // Every simulate command, in one place, as lines in the console.
  window.simulateHelp = () => console.log([
    "simulateEgg('ktm')            a feat done: its window and 100 uwuCoins",
    "simulateEgg('ktm', 'egg')     its Easter egg found, as the wheel would",
    "simulateEgg('all')            every feat done (or 'all', 'egg': every egg found)",
    "simulateEgg('undo')           feats, eggs and secrets taken away (not the coins)",
    "simulateCoins(500)            500 uwuCoins more (a minus takes them away)",
    "simulateCoins('set', 1000)    exactly 1000 uwuCoins",
    "simulatePastTrips()           what your trips from before uwuCoins earned",
    "simulateRide('12', 'NE')      a real ride on bus 12 and the NE Line, for Achievements",
    "simulateRide('undo')          the rides it added taken back",
    "simulateAllLines()            the every-line celebration, as a preview",
    "Each says more with 'help', such as simulateCoins('help').",
  ].join('\n'));

  window.Eggs = { feat, found, progress, renderAchievements, prizeText, rides, tripDone, pastTrip, gather, feats, list, has, presets, settle, name: (id) => EGGS[id]?.name() || id, doneOn, showShared, all: IDS, KTM, FEAT_COINS };
})();
