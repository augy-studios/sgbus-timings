// The Get Off Alert's server half leaves a trip to the app while the app has your location
// (help desk, 2 November 2026: moved on early with GPS on). The app sends `fixAt`, its last good
// fix; while that's recent (LIVE_MS), the server's clock neither moves the trip on nor alerts,
// and the app's place stands over a part the server had moved on to.
//
//   node scripts/trip-live-test.mjs
import { merge } from "../main-site/api/push/trips/[id].js";
import { live, LIVE_MS, step } from "../main-site/api/_push/trip.js";
import { parseTrip } from "../main-site/api/_push/validate.js";

let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` :: ${extra}` : ""}`); if (!cond) fails++; };

const now = Date.now();
const legs = [
  { kind: "train", label: "EW Line", to: "Clementi", points: [[1.3, 103.76], [1.3, 103.78], [1.3, 103.8]], minutes: 6, wait: 0 },
  { kind: "bus", label: "Bus 183", to: "Coll of Design", service: "183", board: "17179", alight: "16159", points: [[1.3005, 103.8], [1.3005, 103.798], [1.3005, 103.796]], minutes: 6, wait: 3 },
];
const body = (extra) => ({
  tripId: "trip-1234abcd", subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } },
  legs, leg: 0, at: 1, pos: 1.2, legStartedAt: now - 10 * 60000, seenAt: now - 5000, alerted: [false, false], readied: [false, false], ...extra,
});

let sent;
try {
  sent = parseTrip(body({ fixAt: now - 5000 }), now);
} catch (err) {
  console.log("FAIL parse:", err.message);
  process.exit(1);
}
ok("fixAt kept from the app", sent.fixAt === now - 5000);
ok("live while the fix is recent", live(sent, now) && !live(sent, now + LIVE_MS + 1000));
const older = parseTrip(body({}), now);
ok("an older app (no fixAt) isn't live", !live(older, now));

// The server's clock had moved on to the bus and alerted it; the app, with a fix, is still on the train.
const old = { ...sent, leg: 1, at: 0, pos: 0, alerted: [true, true], readied: [false, true], fixAt: now - 4 * 60000 };
const merged = merge(old, sent, now);
ok("live: the app's part stands over the server's", merged.leg === 0, JSON.stringify({ leg: merged.leg }));
ok("live: the server's alerts from that part on are dropped", merged.alerted[1] === false && merged.readied[1] === false, JSON.stringify(merged.alerted));
ok("live: alerts before the app's part kept", merge({ ...old, alerted: [true, true] }, { ...sent, leg: 1, alerted: [false, false] }, now).alerted[0] === true);
const notLive = merge(old, { ...sent, fixAt: 0 }, now);
ok("not live: the server's part stands, as before", notLive.leg === 1);

// step() isn't run for a live trip by the poll; and a stale one still moves on by the clock.
const stale = { ...older, leg: 0, at: 0, pos: 0, anchor: null, legStartedAt: now - 30 * 60000 };
step(stale, null, now);
ok("not live: the clock moves a train on as before", stale.leg === 1);

console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
