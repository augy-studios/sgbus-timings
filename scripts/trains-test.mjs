// /api/trains against a made-up timetable and disruption feed, without LTA: which days run
// which trains (a public holiday as a Sunday, a works day's own timetable), trains after
// midnight, an interchange's platforms, and a disruption's cancellations, delays and skipped
// stations. From the repo's root: node scripts/trains-test.mjs
import assert from "node:assert/strict";
import { buildIndex, serviceDay, unzip } from "../main-site/api/_trains/gtfs.js";
import { decodeFeed } from "../main-site/api/_trains/rt.js";
import { answer } from "../main-site/api/trains.js";
import { network, usualDay } from "../main-site/api/trains-all.js";
import { lastTrains, trainsLeft } from "../main-site/api/_nav/last-trains.js";

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
};

// ---------- a zip, stored, as LTA's but smaller ----------
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function zip(files) {
  const locals = [];
  const dirs = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const n = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(n.length, 28); dir.writeUInt32LE(off, 42);
    locals.push(local, n, data);
    dirs.push(dir, n);
    off += 30 + n.length + data.length;
  }
  const dirBuf = Buffer.concat(dirs);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dirs.length / 2, 8); end.writeUInt16LE(dirs.length / 2, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

// A line A1 - A2 - A3 (A2 also B5, as an interchange), and a line B4 - B5.
const GTFS = {
  "stops.txt": [
    "stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,platform_code,parent_station",
    "A1,A1,Alpha,1.30,103.80,1,,", "A1_A,A1,Alpha,1.30,103.80,0,A,A1", "A1_B,A1,Alpha,1.30,103.80,0,B,A1",
    "A2,A2,Bravo,1.31,103.81,1,,", "A2_A,A2,Bravo,1.31,103.81,0,A,B5", "A2_B,A2,Bravo,1.31,103.81,0,B,B5",
    "A3_A,A3,Charlie,1.32,103.82,0,A,A3", "A3_B,A3,Charlie,1.32,103.82,0,B,A3",
    "A3_EA,A3,A,1.32,103.82,2,,A3",
    "B4_A,B4,Delta,1.33,103.83,0,A,B4", "B5_A,B5,Bravo,1.31,103.81,0,A,B5",
  ].join("\n"),
  "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\nAL,X,AL,A Line,1,112233,FFFFFF\nBL,X,BL,B Line,1,445566,FFFFFF",
  "trips.txt": [
    "route_id,service_id,trip_id,trip_headsign,direction_id,block_id",
    "AL,WD,wd1,Charlie,0,", "AL,WD,wd2,Charlie,0,", "AL,WD,late,Charlie,0,", "AL,WD,short,Bravo,0,",
    "AL,SUN,sun1,Charlie,0,", "AL,WORKS,works1,Charlie,0,", "BL,WD,b1,Bravo,0,", "BL,WD,b2,Delta,1,",
  ].join("\n"),
  "stop_times.txt": [
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign",
    "wd1,8:00:00,8:00:30,A1_A,1,", "wd1,8:03:00,8:03:30,A2_A,2,", "wd1,8:06:00,8:06:30,A3_A,3,",
    "wd2,8:10:00,8:10:30,A1_A,1,", "wd2,8:13:00,8:13:30,A2_A,2,", "wd2,8:16:00,8:16:30,A3_A,3,",
    "late,24:30:00,24:30:30,A1_A,1,", "late,24:33:00,24:33:30,A2_A,2,Charlie (last)", "late,24:36:00,24:36:30,A3_A,3,",
    "short,8:05:00,8:05:30,A1_A,1,", "short,8:08:00,8:08:30,A2_A,2,",
    "sun1,9:00:00,9:00:30,A1_A,1,", "sun1,9:03:00,9:03:30,A2_A,2,", "sun1,9:06:00,9:06:30,A3_A,3,",
    "works1,7:00:00,7:00:30,A1_A,1,", "works1,7:03:00,7:03:30,A2_A,2,", "works1,7:06:00,7:06:30,A3_A,3,",
    "b1,8:20:00,8:20:30,B4_A,1,", "b1,8:25:00,8:25:30,B5_A,2,",
    "b2,8:30:00,8:30:30,B5_A,1,", "b2,8:35:00,8:35:30,B4_A,2,",
  ].join("\n"),
  "calendar.txt": [
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
    "WD,1,1,1,1,1,0,0,20260101,20271231", "SUN,0,0,0,0,0,0,1,20260101,20271231", "WORKS,0,0,0,0,0,0,0,20260101,20271231",
  ].join("\n"),
  // Wednesday 2 December 2026 runs the works timetable instead of the weekday one.
  "calendar_dates.txt": "service_id,date,exception_type\nWD,20261202,2\nWORKS,20261202,1",
};
const index = buildIndex(unzip(zip(GTFS)));
const none = { timestamp: null, updates: [] };
const at = (iso) => Date.parse(`${iso}+08:00`);
const times = (p) => p.trains.map((t) => t[0] / 3600);

test("a weekday's trains at a platform, in order, ending trains left out", () => {
  const a = answer(index, none, ["A1"], at("2026-11-24T07:00:00"));
  assert.equal(a.day, "2026-11-24");
  const p = a.platforms.find((x) => x.id === "A1_A");
  assert.deepEqual(times(p), [8, 8 + 5 / 60, 8 + 10 / 60, 24.5]);
  assert.equal(p.line, "AL");
  assert.equal(p.colour, "#112233");
  // A1_B has no trains at all, so isn't listed.
  assert.deepEqual(a.platforms.map((x) => x.id), ["A1_A"]);
  // At A3 every train ends: nothing to board.
  assert.equal(answer(index, none, ["A3"], at("2026-11-24T07:00:00")).platforms.length, 0);
});

test("ways and heads: the stations each train goes on to", () => {
  const p = answer(index, none, ["A1"], at("2026-11-24T07:00:00")).platforms[0];
  const ways = p.trains.map((t) => p.ways[t[2]].join(" "));
  assert.deepEqual(ways, ["A2 A3", "A2", "A2 A3", "A2 A3"]);
  assert.deepEqual(p.trains.map((t) => p.heads[t[1]]), ["Charlie", "Bravo", "Charlie", "Charlie"]);
});

test("a stop's own headsign wins over its trip's", () => {
  const p = answer(index, none, ["A2"], at("2026-11-24T23:00:00")).platforms.find((x) => x.id === "A2_A");
  assert.equal(p.heads[p.trains[0][1]], "Charlie (last)");
});

test("an interchange: any of its codes gives every line's platforms", () => {
  for (const code of ["A2", "B5"]) {
    const ids = answer(index, none, [code], at("2026-11-24T07:00:00")).platforms.map((x) => x.id).sort();
    assert.deepEqual(ids, ["A2_A", "B5_A"], `asked for ${code}`);
  }
});

test("Sundays, and a public holiday as one", () => {
  assert.deepEqual(times(answer(index, none, ["A1"], at("2026-11-22T07:00:00")).platforms[0]), [9]);
  // Christmas 2026 is a Friday.
  assert.deepEqual(times(answer(index, none, ["A1"], at("2026-12-25T07:00:00")).platforms[0]), [9]);
});

test("a works day's own timetable, from calendar_dates", () => {
  assert.deepEqual(times(answer(index, none, ["A1"], at("2026-12-02T06:00:00")).platforms[0]), [7]);
});

test("after midnight is still the day before, until 3am", () => {
  assert.deepEqual(serviceDay(at("2026-11-25T00:20:00")), { day: "2026-11-24", now: 87600 });
  assert.deepEqual(serviceDay(at("2026-11-25T03:00:00")), { day: "2026-11-25", now: 10800 });
  const p = answer(index, none, ["A1"], at("2026-11-25T00:20:00")).platforms[0];
  assert.deepEqual(times(p), [24.5]);
});

test("gone trains drop off, with a minute's grace; the next day's first is given", () => {
  const p = answer(index, none, ["A1"], at("2026-11-24T08:05:50")).platforms[0];
  assert.deepEqual(times(p), [8 + 5 / 60, 8 + 10 / 60, 24.5]);
  // Tuesday's next day is a Wednesday's weekday timetable.
  assert.equal(p.first[0], 8 * 3600);
  // Saturday has no trains here, and its next day (Sunday) starts at 9.
  const sat = answer(index, none, ["A1"], at("2026-11-28T07:00:00")).platforms[0];
  assert.deepEqual(sat.trains, []);
  assert.equal(sat.first[0], 9 * 3600);
});

// ---------- the disruption feed ----------
const varint = (n) => {
  const out = [];
  let v = BigInt.asUintN(64, BigInt(n));
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return out;
};
const vf = (field, n) => [...varint(field * 8), ...varint(n)];
const lf = (field, bytes) => [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes];
const str = (s) => [...Buffer.from(s)];
const feedOf = (...entities) => Buffer.from([...lf(1, [...lf(1, str("2.0")), ...vf(2, 0), ...vf(3, 1795330000)]), ...entities.flatMap((e, i) => lf(2, [...lf(1, str(`e${i}`)), ...lf(3, e)]))]);
const trip = (id, rel = 0) => lf(1, [...lf(1, str(id)), ...vf(4, rel)]);
const stu = ({ seq, stop, delay, time, rel }) => lf(2, [
  ...(seq != null ? vf(1, seq) : []),
  ...(delay != null || time != null ? lf(2, [...(delay != null ? vf(1, delay) : []), ...(time != null ? vf(2, time) : [])]) : []),
  ...(stop ? lf(4, str(stop)) : []),
  ...(rel != null ? vf(5, rel) : []),
]);

test("LTA's empty feed, as it comes on a normal day", () => {
  const f = decodeFeed(Buffer.from("0a0d0a03322e30100018c5948ad806", "hex"));
  assert.deepEqual(f, { timestamp: 1795328581, updates: [] });
});

test("a cancelled train, a late one, and one that skips a station", () => {
  const rt = decodeFeed(feedOf(
    trip("wd1", 3),
    [...trip("wd2"), ...stu({ seq: 1, delay: 240 })],
    [...trip("late"), ...stu({ seq: 2, rel: 1 })],
  ));
  assert.equal(rt.updates.length, 3);
  const a = answer(index, rt, ["A2"], at("2026-11-24T07:00:00"));
  assert.equal(a.live, true);
  const p = a.platforms.find((x) => x.id === "A2_A");
  // wd1 cancelled; wd2 four minutes late from A1, so at A2 too; late skips A2.
  assert.deepEqual(p.trains.map((t) => [t[0], t[3]]), [[8 * 3600 + 3 * 60, 2], [8 * 3600 + 17 * 60, 1], [24 * 3600 + 33 * 60, 2]]);
});

test("a new time given outright, and an early train's negative delay", () => {
  const start = at("2026-11-24T00:00:00") / 1000;
  const rt = decodeFeed(feedOf(
    [...trip("wd1"), ...stu({ stop: "A1_A", time: start + 8 * 3600 + 120 })],
    [...trip("wd2"), ...stu({ seq: 1, delay: -60 })],
  ));
  assert.equal(rt.updates[1].stops[0].departure, undefined);
  assert.equal(rt.updates[1].stops[0].arrival.delay, -60);
  const p = answer(index, rt, ["A1"], at("2026-11-24T07:00:00")).platforms[0];
  assert.deepEqual(p.trains.slice(0, 3).map((t) => [t[0], t[3]]), [[8 * 3600 + 120, 1], [8 * 3600 + 300, 0], [8 * 3600 + 540, 1]]);
});

test("a feed about other trains leaves the station's alone", () => {
  const rt = decodeFeed(feedOf(trip("b1", 3)));
  const a = answer(index, rt, ["A1"], at("2026-11-24T07:00:00"));
  assert.equal(a.live, false);
  assert.ok(a.platforms[0].trains.every((t) => t[3] === 0));
});

// ---------- every station, for offline ----------
test("a usual day of each kind: no works, no public holiday", () => {
  assert.equal(usualDay(index, "2026-12-01", "wd"), "2026-12-01");
  // 2 December runs the works timetable, so the 3rd is taken.
  assert.equal(usualDay(index, "2026-12-02", "wd"), "2026-12-03");
  // Christmas, a Friday, is passed over for the Monday after.
  assert.equal(usualDay(index, "2026-12-25", "wd"), "2026-12-28");
  assert.equal(usualDay(index, "2026-12-25", "sun"), "2026-12-27");
});

test("the whole network's usual trains, by kind of day", () => {
  const n = network(index, at("2026-12-02T09:00:00"));
  assert.deepEqual(n.days, { wd: "2026-12-03", sat: "2026-12-05", sun: "2026-12-06" });
  const a1 = n.platforms.find((p) => p.id === "A1_A");
  const times = (flat) => flat.filter((_, i) => i % 3 === 0).map((t) => t / 3600);
  // The works train (7:00) isn't usual; the weekday's are, after midnight's included.
  assert.deepEqual(times(a1.trains.wd), [8, 8 + 5 / 60, 8 + 10 / 60, 24.5]);
  assert.deepEqual(times(a1.trains.sat), []);
  assert.deepEqual(times(a1.trains.sun), [9]);
  assert.equal(a1.ways[a1.trains.wd[5]].join(" "), "A2");
  assert.equal(a1.parent, "A1");
  // Platforms nothing leaves from aren't listed.
  assert.ok(!n.platforms.some((p) => p.id === "A3_A" || p.id === "A1_B"));
});

// ---------- the last trains, for Navigate's ways ----------
test("the trains left today to a station, and when the last one leaves", () => {
  // To A3: 8:00, 8:10 and 00:30 (the short 8:05 ends at A2).
  const left = trainsLeft(index, ["A1"], ["A3"], at("2026-11-24T07:00:00"));
  assert.equal(left.count, 3);
  assert.equal(left.lastMs, at("2026-11-25T00:30:00"));
  assert.equal(trainsLeft(index, ["A1"], ["A2"], at("2026-11-24T07:00:00")).count, 4);
  assert.equal(trainsLeft(index, ["A1"], ["A3"], at("2026-11-25T00:20:00")).count, 1);
  assert.equal(trainsLeft(index, ["A1"], ["A3"], at("2026-11-25T00:40:00")), null);
});

test("a way's train ride: its rank among the last three, from when you're on the platform", () => {
  const way = (minutes) => ({ legs: [
    { mode: "walk", minutes },
    { mode: "train", route: "AL", board: minutes + 3, wait: 3, minutes: 6, from: { code: "A1" }, to: { code: "A3" } },
  ] });
  const early = way(5);
  const late = way(5);
  const busy = { legs: [{ mode: "train", route: "AL", board: 0, wait: 0, minutes: 3, from: { code: "A1" }, to: { code: "A2" } }] };
  lastTrains([early, busy], { index, setOff: at("2026-11-24T07:00:00") });
  assert.equal(early.legs[1].lastTrainRank, 3);
  assert.equal(early.legs[1].lastTrain, "00:30");
  assert.equal(busy.legs[0].lastTrain, undefined, "four trains left to A2: not yet");
  // On the platform at 8:07: only 8:10 and 00:30 are left.
  lastTrains([late], { index, setOff: at("2026-11-24T08:02:00") });
  assert.equal(late.legs[1].lastTrainRank, 2);
  assert.equal(late.legs[1].lastTrain, "00:30");
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
