// Feats, Easter eggs, and the secrets the eggs unlock (Augy, 1 November 2026).
//
// Nine feats, each done once, and each worth FEAT_COINS uwuCoins (js/coins.js):
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
//   first  First to last (Augy, 2 November 2026): on or off a bus at stop 01012 and at stop
//          99189 (FIRST_LAST), the first and last codes, over any trips, in either order
//   hundred  100 rides (HUNDRED), buses and trains together, as js/rides.js counts them
//   ends   Ends of the island: off a train at Tuas Link, Woodlands North, Punggol Coast and
//          Changi Airport (ENDS, within ENDS_M), over any trips
// first and ends are kept as they're done (MARKS_KEY, { first: { code: when }, ends: { code:
// when } }) from each real ride (rideDone, from js/rides.js).
//
// A ride counts only once it's shown to be real (js/rides.js, verdict), and a trip feat needs at
// least one such ride on it.
//
// The Easter eggs are the uwuCoins wheel's prizes (js/coins.js), one for each feat and named
// after it: a feat done doesn't find its egg, only the wheel does. The first egg found unlocks
// the secret, Your colours (js/colours.js, one colour of your own for the whole app); after
// that, an egg unlocks nothing more. Eggs found in a browser count when the app is opened later:
// the secret catches up with the eggs (settle). Each egg but `lines` also adds a preset to Your
// colours.
//
// Material You (Your phone's colours and the Material You look) is no longer a secret (Augy, 5
// November 2026): it's a feature of the Android app, on by default in the Flutter app from 3.0.0
// and in Theme for anyone in the 2.x app (js/colours.js, js/material.js), and the website never
// has it. The greeting-and-Settings trick that unlocked it is gone with it, and what it or an egg
// unlocked before (PHONE_KEY, MATERIAL_KEY) is let go of (settle).
//
// Kept under FEATS_KEY and EGGS_KEY as { id: when }. Your colours unlocked is UNLOCKED_KEY, as
// it was when riding every line unlocked it. Riding every line before there were eggs counts as
// that feat done and its egg found. A feat is said once (TOLD_KEY) in #eggModal, or for `lines`
// the celebration (js/celebrate.js). Not synced: they're this phone's.
//
// Settings' Achievements lists each feat with how far along it is (progress, renderAchievements).
// Each feat done has its Share, and Achievements as a whole has one too: a card for socials with
// a short /feat/<id> link (js/share.js, Share.feat). Opened, the link says what was done, here
// in #eggModal, with how far along the person opening it is (showShared).
//
// Team runs (Augy, 4 November 2026, js/team.js): a team's rides and trips, from every member's
// phone, do the feats together, and each member gets the feat done and its coins, said as the
// team's (feat(id, { team }), TEAM_FEATS_KEY). Each phone sends its own real rides (rideMarks)
// and trips (tripDone) to the team; nothing here is synced otherwise.
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
  // What Material You's two secrets were kept under, before they were the Android app's own.
  const PHONE_KEY = 'sgbus_phone_colours_unlocked';
  const MATERIAL_KEY = 'sgbus_material_unlocked';
  const TOLD_KEY = 'sgbus_eggs_told';
  const TEAM_FEATS_KEY = 'sgbus_team_feats'; // js/team.js
  const MARKS_KEY = 'sgbus_feat_marks';
  const FIRST_LAST = ['01012', '99189'];
  const HUNDRED = 100;
  // The island's four ends, by their stations (data/rail.json).
  const ENDS_M = 400;
  const ENDS = {
    EW33: [1.340429, 103.636961], // Tuas Link
    TE1: [1.448646, 103.785519], // Woodlands North
    NE18: [1.415018, 103.910329], // Punggol Coast
    CG2: [1.357338, 103.988565], // Changi Airport
  };
  const FEAT_COINS = 100;
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
    first: { goal: () => tr('eggs.first.goal', 'Get on or off a bus at stop 01012 and at stop 99189, the first and last stop codes.'), name: () => tr('eggs.first', 'First to last'), how: () => tr('eggs.first.how', 'You took buses at stop 01012 and at stop 99189, the first and last stop codes.'), preset: { id: 'firstlast', base: '#c2185b', name: () => tr('colours.preset.firstlast', 'End to end') } },
    hundred: { goal: () => tr('eggs.hundred.goal', 'Take 100 rides on buses and trains.'), name: () => tr('eggs.hundred', '100 rides'), how: () => tr('eggs.hundred.how', 'You took 100 rides on buses and trains.'), preset: { id: 'century', base: '#c99a06', name: () => tr('colours.preset.century', 'Century') } },
    ends: { goal: () => tr('eggs.ends.goal', 'Get off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport.'), name: () => tr('eggs.ends', 'Ends of the island'), how: () => tr('eggs.ends.how', 'You got off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport.'), preset: { id: 'compass', base: '#00897b', name: () => tr('colours.preset.compass', 'Compass') } },
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

  const SECRETS = { colours: UNLOCKED_KEY };
  const has = (secret) => !!get(SECRETS[secret] || UNLOCKED_KEY);
  const told = () => {
    const v = readJson(TOLD_KEY, null);
    return Array.isArray(v) ? v : [];
  };
  const tell = (what) => put(TOLD_KEY, JSON.stringify([...new Set([...told(), what])]));

  // The secrets still locked.
  const locked = () => Object.keys(SECRETS).filter((s) => !has(s));

  // As many secrets unlocked as there are eggs found. Returns the ones unlocked now.
  function settle() {
    // Material You's old unlocks, from an egg or the trick: it's the Android app's own now.
    put(PHONE_KEY, null);
    put(MATERIAL_KEY, null);
    const got = [];
    const unlockedCount = () => Object.keys(SECRETS).filter(has).length;
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

  // `quiet`: not said (simulateEgg('all')), and never said later either. `team`: done by a team
  // run you're in (js/team.js), its name, kept under TEAM_FEATS_KEY for Achievements to say so;
  // the feat and its coins are yours all the same, as Augy wanted (4 November 2026).
  function feat(id, { quiet = false, team = null } = {}) {
    if (!EGGS[id] || read(FEATS_KEY)[id]) return false;
    const all = read(FEATS_KEY);
    all[id] = Date.now();
    put(FEATS_KEY, JSON.stringify(all));
    if (team) put(TEAM_FEATS_KEY, JSON.stringify({ ...teamFeats(), [id]: { team: String(team), at: all[id] } }));
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
    window.Coins?.add(FEAT_COINS, { why: 'feat', feat: id, ...(team && { team: String(team) }) });
    window.dispatchEvent(new CustomEvent('eggs:feat', { detail: { id } }));
    announce(id);
    return true;
  }

  // The feats a team run did for you: { id: { team, at } }.
  const teamFeats = () => {
    const v = readJson(TEAM_FEATS_KEY, {});
    return v && typeof v === 'object' ? v : {};
  };

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
    // With uwuCoins hidden (js/coins.js), the feat without its coins, or the wheel to spin.
    const coinsOn = window.Coins?.shown?.() !== false;
    const coins = coinsOn ? tr('eggs.featCoins', '+{n} uwuCoins, for a spin of the wheel in Settings.', { n: FEAT_COINS }) : '';
    if (id === 'lines' && window.Celebrate) {
      const text = `${tr('eggs.lines.text', 'You’ve ridden every MRT and LRT line.')} ${coins}`;
      for (const el of ['celebrateText', 'unlockText']) { const n = document.getElementById(el); if (n) n.textContent = text; }
      window.Celebrate.start();
      return;
    }
    if (!document.getElementById('eggModal')) return;
    document.getElementById('eggTitle').textContent = tr('eggs.featDone', 'You did something special!');
    document.getElementById('eggName').textContent = EGGS[id].name();
    const team = teamFeats()[id]?.team;
    document.getElementById('eggHow').textContent = team ? tr('eggs.teamHow', 'Your team run, {team}, did it together: {goal}', { team, goal: EGGS[id].goal() }) : EGGS[id].how();
    document.getElementById('eggGot').textContent = coins;
    document.getElementById('eggCount').textContent = tr('eggs.featCount', '{n} of {all} feats done', { n: feats().length, all: IDS.length });
    const go = document.getElementById('eggGo');
    if (go) { go.hidden = false; go.dataset.go = 'coins'; go.textContent = tr('coins.spinGo', 'Spin the wheel'); go.hidden = !coinsOn; }
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
      } else if (id === 'hundred') {
        need = HUNDRED;
        have = done[id] ? need : Math.min(need, rideCount(rec));
      } else if (id === 'first') {
        need = FIRST_LAST.length;
        have = done[id] ? need : FIRST_LAST.filter((c) => marks().first[c]).length;
      } else if (id === 'ends') {
        need = Object.keys(ENDS).length;
        have = done[id] ? need : Object.keys(ENDS).filter((c) => marks().ends[c]).length;
      }
      return { id, name: e.name(), how: done[id] ? e.how() : e.goal(), done: !!done[id], have, need, egg: !!eggs[id], team: done[id] ? teamFeats()[id]?.team || null : null };
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
        (a.team ? `<p class="achievementTeam">${esc(tr('achievements.withTeam', 'Done with your team run, {team}', { team: a.team }))}</p>` : '') +
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
    if (go) { go.hidden = false; go.dataset.go = 'achievements'; go.textContent = tr('achievements.see', 'See your achievements'); }
    window.openModal('eggModal');
    if (one) window.Confetti?.burst?.();
  }

  // ---------- the feats ----------

  // Rides really taken, as js/rides.js keeps them: the bus feats, and 100 rides.
  const rideCount = (rec) => [...Object.values(rec?.lines || {}), ...Object.values(rec?.buses || {})].reduce((sum, x) => sum + (Number(x?.n) || 0), 0);
  function rides(rec) {
    for (const id of ['up', 'down']) {
      if (EGGS[id].buses.every((b) => rec?.buses?.[b]?.n >= 1)) feat(id);
    }
    if (rideCount(rec) >= HUNDRED) feat('hundred');
  }

  // A ride judged real (js/rides.js, done): a bus on or off at 01012 or 99189, and a train off
  // at one of the island's ends, kept towards First to last and Ends of the island.
  const marks = () => {
    const v = readJson(MARKS_KEY, {});
    return { first: v?.first || {}, ends: v?.ends || {} };
  };
  // What a ride is towards those two: { first: the FIRST_LAST codes it got on or off at, end: the
  // ENDS station it got off at, or null }. A team run's rides too (js/team.js).
  function rideMarks(leg) {
    const out = { first: [], end: null };
    if (!leg || !Array.isArray(leg.points) || leg.points.length < 2) return out;
    if (leg.kind === 'bus') {
      const codes = [leg.board, leg.alight, leg.codes?.[0], leg.codes?.[leg.codes.length - 1]].filter(Boolean).map(String);
      out.first = FIRST_LAST.filter((code) => codes.includes(code));
    } else if (leg.kind === 'train') {
      const end = leg.points[leg.points.length - 1];
      out.end = Object.keys(ENDS).find((code) => metres(end, ENDS[code]) <= ENDS_M) || null;
    }
    return out;
  }
  function rideDone(leg) {
    if (!leg || !Array.isArray(leg.points) || leg.points.length < 2) return;
    const m = marks();
    const now = Date.now();
    let changed = false;
    const got = rideMarks(leg);
    for (const code of got.first) if (!m.first[code]) { m.first[code] = now; changed = true; }
    if (got.end && !m.ends[got.end]) { m.ends[got.end] = now; changed = true; }
    if (changed) put(MARKS_KEY, JSON.stringify(m));
    if (FIRST_LAST.every((c) => m.first[c])) feat('first');
    if (Object.keys(ENDS).every((c) => m.ends[c])) feat('ends');
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
    // Your team run's, if you're in one, for a trip handed on to put together (js/team.js).
    window.Team?.tripDone?.({ start, end, via: viaAt, startedAt: trip.startedAt, endedAt: Date.now() });
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
      if (go) { go.hidden = false; go.dataset.go = 'theme'; go.textContent = tr('eggs.go', 'Open Theme'); }
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
      for (const k of [FEATS_KEY, EGGS_KEY, UNLOCKED_KEY, PHONE_KEY, MATERIAL_KEY, TOLD_KEY, TEAM_FEATS_KEY]) put(k, null);
      window.Colours?.paint(null);
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

  window.Eggs = { feat, found, progress, renderAchievements, prizeText, rides, rideDone, tripDone, pastTrip, gather, feats, list, has, presets, settle, name: (id) => EGGS[id]?.name() || id, doneOn, showShared, all: IDS, KTM, FEAT_COINS,
    // For js/team.js, which works out a team run's feats by the same rules.
    rideMarks, metres, goal: (id) => EGGS[id]?.goal() || '', buses: (id) => EGGS[id]?.buses || null, FIRST_LAST, ENDS: Object.keys(ENDS),
    RULES: { LOOP_M, LOOP_AWAY_M, LONG_MS, KTM_M, HUNDRED } };
})();
