// Past trips, for uwuCoins and feats (Augy, 2 November 2026): someone who took trips before
// uwuCoins came gets what those trips would have earned, once, from Your trips (js/history.js),
// which keeps them (up to 1000).
//
// Which trips count:
//   - one started before uwuCoins (COINS_SINCE), taken with the Get Off Alert to the end
//     (arrived), with at least one bus or train ride got through (done), as a trip earns its
//     coins now, and not already given its coins (js/coins.js's log);
//   - started from RIDES_SINCE, when rides were first judged real (js/rides.js), only one with a
//     ride judged real then (kept in RideCheck.record()'s trips), as coins need now;
//   - started before then, nothing's left to judge its rides by, so getting through one is
//     taken for it.
// Each is worth Coins.forPast (the same sums as a trip now, the km from the time ridden), and
// does any trip feats it would have (Eggs.pastTrip: the long way round, there and back again,
// the old railway). Rides on trips from before RIDES_SINCE are kept by line and bus
// (RideCheck.addPast), so every line ridden and the bus feats count them too. A trip after
// COINS_SINCE was counted as it was taken, so never here.
//
// Done once on this device, as the page opens (DONE_KEY, { at, trips, coins, feats }), and
// said once in #eggModal, or the celebration (js/celebrate.js) when every line ridden is among
// the feats: how many trips, the coins, and the feats. With nothing to give, nothing's said.
// Trips another device's sync brings in later aren't counted: that device has counted them.
// Coins, rides and feats aren't synced, as ever.
//
// Window.Retrofit = { run(), plan() }: plan() is what run() would give, without giving it. The
// console's simulatePastTrips() says the same. Plain script: exports go on window. Loaded after
// js/coins.js, js/eggs.js and js/celebrate.js.
(function () {
  const DONE_KEY = 'sgbus_retrofit';
  // When rides were first judged real (help desk #6), and when uwuCoins came (2.3.0).
  const RIDES_SINCE = Date.parse('2026-10-27T00:53:11+08:00');
  const COINS_SINCE = Date.parse('2026-11-02T00:46:08+08:00');
  // The bus operators, for the coins: waited for this long at most.
  const BUSNET_WAIT_MS = 8000;
  const tr = (k, en, v) => (window.I18n ? I18n.t(k, en, v) : en);
  const $ = (id) => document.getElementById(id);

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

  const isRide = (l) => l && (l.kind === 'bus' || l.kind === 'train');
  const past = () => (window.TripHistory?.list() || []).filter((t) => t && Number(t.startedAt) < COINS_SINCE);

  // The trips owed coins, each with them: [{ trip, coins }].
  function owed() {
    const paid = window.Coins?.tripsPaid() || new Set();
    const judged = new Set((window.RideCheck?.record().trips || []).map((t) => t.id));
    return past().filter((t) => {
      if (!t.arrived || paid.has(t.id) || !(t.legs || []).some((l) => isRide(l) && l.done)) return false;
      return t.startedAt < RIDES_SINCE || judged.has(t.id);
    }).map((trip) => ({ trip, coins: window.Coins?.forPast(trip)?.n || 0 })).filter((x) => x.coins > 0);
  }

  // What run() would give: { trips, coins, rideTrips } (rideTrips: trips whose rides would be
  // kept by line and bus). The feats can't be told without doing them.
  function plan() {
    const due = owed();
    const have = new Set((window.RideCheck?.record().trips || []).map((t) => t.id));
    return {
      trips: due.length,
      coins: due.reduce((sum, x) => sum + x.coins, 0),
      rideTrips: past().filter((t) => t.startedAt < RIDES_SINCE && !have.has(t.id) && (t.legs || []).some((l) => isRide(l) && l.done)).length,
    };
  }

  const done = () => !!get(DONE_KEY);

  // Gives what past trips are owed, once: { trips, coins, feats }, or null if it's been done.
  function run() {
    if (done() || !window.Coins || !window.Eggs || !window.TripHistory) return null;
    const due = owed();
    const coins = due.reduce((sum, x) => sum + x.coins, 0);
    // Marked done first, so a reload partway can't give it twice.
    if (!put(DONE_KEY, JSON.stringify({ at: Date.now(), trips: due.length, coins, feats: [] }))) return null;
    const feats = window.Eggs.gather(() => {
      window.RideCheck?.addPast(past().filter((t) => t.startedAt < RIDES_SINCE));
      for (const { trip } of due) window.Eggs.pastTrip(trip);
    });
    if (coins) window.Coins.add(coins, { why: 'past', trips: due.length }, { quiet: true });
    put(DONE_KEY, JSON.stringify({ at: Date.now(), trips: due.length, coins, feats }));
    return { trips: due.length, coins, feats };
  }

  // Said once, in the feat window, or the celebration when every line ridden is among them.
  function tell({ trips, coins, feats }) {
    const all = coins + feats.length * (window.Eggs?.FEAT_COINS || 100);
    if (!all) return;
    const names = feats.map((id) => window.Eggs.name(id)).join('; ');
    const head = trips === 1
      ? tr('retrofit.trip', 'Your trip from before uwuCoins has earned its coins: +{coins} uwuCoins.', { coins })
      : trips
      ? tr('retrofit.trips', 'Your {n} trips from before uwuCoins have earned theirs: +{coins} uwuCoins.', { n: trips, coins })
      : tr('retrofit.ridesOnly', 'Your trips from before uwuCoins count towards the feats.');
    const each = window.Eggs?.FEAT_COINS || 100;
    const featText = feats.length === 1
      ? tr('retrofit.feat', 'Feat done: {names}, +{n} uwuCoins.', { names, n: each })
      : feats.length ? tr('retrofit.feats', 'Feats done: {names}, +{n} uwuCoins each.', { names, n: each }) : '';
    const spin = tr('retrofit.spin', '{n} uwuCoins in all, for a spin of the wheel in Settings.', { n: all });
    if (feats.includes('lines') && window.Celebrate) {
      const text = `${tr('eggs.lines.text', 'You’ve ridden every MRT and LRT line.')} ${head} ${featText} ${spin}`.replace(/\s+/g, ' ').trim();
      for (const el of ['celebrateText', 'unlockText']) { const n = $(el); if (n) n.textContent = text; }
      window.Celebrate.start();
      return;
    }
    if (!$('eggModal')) return;
    $('eggTitle').textContent = tr('retrofit.title', 'Coins for your past trips');
    $('eggName').textContent = tr('coins.wonCoins', '{n} uwuCoins!', { n: all });
    $('eggHow').textContent = head;
    $('eggGot').textContent = [featText, spin].filter(Boolean).join(' ');
    $('eggCount').textContent = tr('eggs.featCount', '{n} of {all} feats done', { n: window.Eggs.feats().length, all: window.Eggs.all.length });
    const go = $('eggGo');
    if (go) { go.dataset.go = 'coins'; go.textContent = tr('coins.spinGo', 'Spin the wheel'); }
    window.openModal('eggModal');
    window.Confetti?.burst?.();
  }

  // The bus operators known (js/network.js), or BUSNET_WAIT_MS gone by: then it's run.
  function whenReady() {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => (window.BusNet?.isReady?.() || Date.now() - start >= BUSNET_WAIT_MS ? resolve() : setTimeout(tick, 400));
      tick();
    });
  }

  async function init() {
    if (done()) return;
    await whenReady();
    // After the app's own first windows (js/eggs.js waits as long for its catch-up).
    await (window.AppBridge?.ready?.(4000) || Promise.resolve());
    setTimeout(() => {
      try {
        const got = run();
        if (got) tell(got);
      } catch (err) {
        console.warn("couldn't count past trips:", err);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // In the browser's console (or chrome://inspect's, for the Android app):
  //   simulatePastTrips()   what past trips would give, or what they gave, once it's done
  window.simulatePastTrips = () => {
    let was = null;
    try { was = JSON.parse(get(DONE_KEY) || 'null'); } catch { /* not yet */ }
    if (was) return `done ${new Date(was.at).toLocaleString()}: ${was.trips} past trip${was.trips === 1 ? '' : 's'}, +${was.coins} uwuCoins${was.feats?.length ? `, feats: ${was.feats.join(', ')}` : ''}.`;
    const p = plan();
    return `not done yet: ${p.trips} past trip${p.trips === 1 ? '' : 's'} owed +${p.coins} uwuCoins; ${p.rideTrips} with rides to keep for the feats.`;
  };

  window.Retrofit = { run, plan };
})();
