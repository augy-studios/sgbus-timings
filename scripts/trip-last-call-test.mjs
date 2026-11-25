// The Get Off Alert's last call and the trip's end, in the server's half (api/_push/trip.js), for
// while the app is in the background: a stop before the end of each ride, "Ring the bell NOW" on a
// bus and "Get off at the next station" on a train, and "Trip ended" at the end. Only for an app
// that sends nowAlerted: an older one has no channel for them, and gets the Get Off Alert as before.
//
//   node scripts/trip-last-call-test.mjs
import { merge } from "../main-site/api/push/trips/[id].js";
import { step } from "../main-site/api/_push/trip.js";
import { parseTrip } from "../main-site/api/_push/validate.js";

let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` :: ${extra}` : ""}`); if (!cond) fails++; };

const now = Date.now();
const line = (n, lng) => Array.from({ length: n + 1 }, (_, i) => [1.3, lng + i * 0.004]);
const legs = [
  { kind: "bus", label: "Bus 65", to: "Bef Siemens Ctr", service: "65", board: "70231", alight: "60219", points: line(5, 103.86), minutes: 10, wait: 3 },
  { kind: "walk", label: "Walk", to: "Mattar station", points: line(1, 103.9), minutes: 3 },
  { kind: "train", label: "DT Line", to: "Bugis", points: line(4, 103.91), minutes: 8 },
];
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
const body = (extra) => ({
  tripId: "trip-lastcall1", subscription, legs, leg: 0, at: 0, pos: 0, legStartedAt: now - 60000, seenAt: now - 60000,
  alerted: [false, false, false], readied: [false, false, false], ...extra,
});
// The server's place on the trip, as if it were following the bus there.
const at = (trip, leg, pos) => Object.assign(trip, { leg, track: { pos, t: now }, fixAt: 0 });

// ---- an app with the last call ----
{
  const trip = parseTrip(body({ nowAlerted: [false, false, false] }), now);
  ok("nowAlerted kept from the app", Array.isArray(trip.nowAlerted) && trip.nowAlerted.length === 3);

  let r = step(at(trip, 0, 2.6), null, now);
  ok("3 stops from the end: the Get Off Alert", r.alert && !r.lastCall, JSON.stringify(r.alert));

  r = step(at(trip, 0, 3.6), null, now);
  ok("a stop before the end of a bus ride: Ring the bell NOW", r.lastCall?.title === "Ring the bell NOW" && !r.alert, JSON.stringify(r.lastCall));
  ok("with the stop it's for", r.lastCall?.body === "Next stop: Bef Siemens Ctr.", r.lastCall?.body);
  ok("given once", trip.nowAlerted[0] === true && !step(at(trip, 0, 3.8), null, now).lastCall);

  r = step(at(trip, 2, 2.6), null, now);
  ok("on a train: Get off at the next station", r.lastCall?.title === "Get off at the next station" && r.lastCall?.body === "Next station: Bugis.", JSON.stringify(r.lastCall));
  ok("standing for its Get Off Alert, not as well", !r.alert && trip.alerted[2] === true);

  r = step(at(trip, 2, 4), null, now);
  ok("at the end of the last ride: the trip's end", r.done && r.end?.title === "Trip ended" && r.end?.body === "You've arrived at Bugis.", JSON.stringify(r.end));
}

// ---- in the app's language ----
{
  const words = { ringNow: "Tekan loceng SEKARANG", nextStop: "Perhentian seterusnya: {stop}." };
  const trip = parseTrip(body({ nowAlerted: [false, false, false], words }), now);
  const r = step(at(trip, 0, 3.6), null, now);
  ok("the app's words", r.lastCall?.title === "Tekan loceng SEKARANG" && r.lastCall?.body === "Perhentian seterusnya: Bef Siemens Ctr.", JSON.stringify(r.lastCall));
}

// ---- the trip's summary, as the app worked it out ----
{
  const words = { endSummary: "About S$1.68 in fares · 6.2 km travelled" };
  const trip = parseTrip(body({ nowAlerted: [false, false, false], words }), now);
  const r = step(at(trip, 2, 4), null, now);
  ok("the trip's end has its summary on a line of its own", r.end?.body === "You've arrived at Bugis.\nAbout S$1.68 in fares · 6.2 km travelled", JSON.stringify(r.end));
}

// ---- a short ride: not while you wait for the bus ----
{
  const short = [{ ...legs[0], points: line(1, 103.86) }];
  const trip = parseTrip({ ...body({ nowAlerted: [false] }), legs: short, alerted: [false], readied: [false] }, now);
  const r = step(at(trip, 0, 0), null, now);
  ok("a one-stop bus ride: no last call at the first stop", !r.lastCall, JSON.stringify(r));
}

// ---- an older app ----
{
  const trip = parseTrip(body({}), now);
  ok("an older app sends no nowAlerted", trip.nowAlerted === null);
  let r = step(at(trip, 0, 3.6), null, now);
  ok("it gets the Get Off Alert as before", Boolean(r.alert) && !r.lastCall, JSON.stringify(r));
  r = step(at(trip, 2, 4), null, now);
  ok("and no trip's end", r.done && !r.end);
}

// ---- given by either side stays given ----
{
  const old = parseTrip(body({ nowAlerted: [true, false, false] }), now);
  const sent = parseTrip(body({ nowAlerted: [false, false, false] }), now);
  const m = merge(old, sent, now);
  ok("the server's last call kept when the app sends again", m.nowAlerted[0] === true, JSON.stringify(m.nowAlerted));
  const fromOld = merge(old, parseTrip(body({}), now), now);
  ok("an older app's trip has none", fromOld.nowAlerted === null);
}

console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
