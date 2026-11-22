// LTA's GTFS Realtime train trip updates (DataMall's GTFSRealtimeTrainTripUpdates), read from
// the protobuf by hand, for /api/trains.
//
// LTA only fills the feed while a line is disrupted (its API guide calls it "Train Trip
// Updates - Disruption"): on a normal day it's the header alone, 15 bytes. Then each trip
// update says a train is cancelled, or how late it is or when it now reaches each station, or
// that it skips one. Trips are LTA's timetable's (GTFS Schedule (Train)), by trip_id.
//
// Only what the trains need is read, by GTFS Realtime's field numbers:
//   FeedMessage   1 header, 2 entity
//   FeedHeader    3 timestamp
//   FeedEntity    1 id, 2 is_deleted, 3 trip_update
//   TripUpdate    1 trip, 2 stop_time_update, 4 timestamp, 5 delay
//   TripDescriptor 1 trip_id, 2 start_time, 3 start_date, 4 schedule_relationship, 5 route_id
//   StopTimeUpdate 1 stop_sequence, 2 arrival, 3 departure, 4 stop_id, 5 schedule_relationship
//   StopTimeEvent 1 delay, 2 time

// TripDescriptor's schedule_relationship.
export const TRIP = { SCHEDULED: 0, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, REPLACEMENT: 5, DUPLICATED: 6, DELETED: 7 };
// StopTimeUpdate's.
export const STOP = { SCHEDULED: 0, SKIPPED: 1, NO_DATA: 2, UNSCHEDULED: 3 };

// The fields of one message as [field, wire type, value]: a number for varints, a Uint8Array
// for length-delimited ones, null for fixed widths (none of which are read).
function fields(buf) {
  const out = [];
  let p = 0;
  // As a BigInt, as a negative int32 or int64 comes as ten bytes, past what a number holds.
  const big = () => {
    let v = 0n;
    let shift = 0n;
    for (;;) {
      if (p >= buf.length) throw new Error("protobuf ends early");
      const b = buf[p++];
      v |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
      shift += 7n;
    }
  };
  const varint = () => Number(big());
  while (p < buf.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) out.push([field, wire, Number(BigInt.asIntN(64, big()))]);
    else if (wire === 2) {
      const len = varint();
      out.push([field, wire, buf.subarray(p, p + len)]);
      p += len;
    } else if (wire === 1) { out.push([field, wire, null]); p += 8; } else if (wire === 5) { out.push([field, wire, null]); p += 4; } else throw new Error(`protobuf wire type ${wire}`);
  }
  return out;
}

const text = (b) => new TextDecoder().decode(b);
// Varints are read as signed 64-bit (fields() above), which int32 and int64 are: a negative
// one is sent as its two's complement.
const signed = (v) => v;

function stopTimeEvent(b) {
  const e = {};
  for (const [f, , v] of fields(b)) {
    if (f === 1) e.delay = signed(v);
    else if (f === 2) e.time = signed(v);
  }
  return e;
}

function stopTimeUpdate(b) {
  const u = { rel: STOP.SCHEDULED };
  for (const [f, , v] of fields(b)) {
    if (f === 1) u.seq = v;
    else if (f === 2) u.arrival = stopTimeEvent(v);
    else if (f === 3) u.departure = stopTimeEvent(v);
    else if (f === 4) u.stop = text(v);
    else if (f === 5) u.rel = v;
  }
  return u;
}

function tripDescriptor(b) {
  const t = { rel: TRIP.SCHEDULED };
  for (const [f, , v] of fields(b)) {
    if (f === 1) t.id = text(v);
    else if (f === 2) t.startTime = text(v);
    else if (f === 3) t.startDate = text(v);
    else if (f === 4) t.rel = v;
    else if (f === 5) t.route = text(v);
  }
  return t;
}

function tripUpdate(b) {
  const u = { trip: null, stops: [] };
  for (const [f, , v] of fields(b)) {
    if (f === 1) u.trip = tripDescriptor(v);
    else if (f === 2) u.stops.push(stopTimeUpdate(v));
    else if (f === 4) u.timestamp = v;
    else if (f === 5) u.delay = signed(v);
  }
  return u;
}

// The feed as { timestamp, updates: [{ trip, stops, delay? }] }, deleted entities left out.
export function decodeFeed(buf) {
  const feed = { timestamp: null, updates: [] };
  for (const [f, , v] of fields(buf)) {
    if (f === 1) {
      for (const [hf, , hv] of fields(v)) if (hf === 3) feed.timestamp = hv;
    } else if (f === 2) {
      let deleted = false;
      let update = null;
      for (const [ef, , ev] of fields(v)) {
        if (ef === 2) deleted = !!ev;
        else if (ef === 3) update = tripUpdate(ev);
      }
      if (update?.trip && !deleted) feed.updates.push(update);
    }
  }
  return feed;
}

// What the feed says about one train at one stop: { gone } when it's cancelled or skips it,
// { t } (seconds after the service day's midnight) when it gives a new time, else null.
// `update` is its trip's, `seq` and `stopId` this stop's in the timetable, `t` the
// timetable's time, `dayStart` the service day's midnight in seconds since 1970. A stop the
// update doesn't name takes the delay of the last stop before it that it does, as GTFS
// Realtime has it, or else the trip's own delay.
export function applyUpdate(update, { seq, stopId, t, dayStart }) {
  if (!update) return null;
  if (update.trip.rel === TRIP.CANCELED || update.trip.rel === TRIP.DELETED) return { gone: true };
  let before = null;
  for (const u of update.stops) {
    const same = (u.seq != null && u.seq === seq) || (u.seq == null && u.stop === stopId);
    if (same) {
      if (u.rel === STOP.SKIPPED) return { gone: true };
      if (u.rel === STOP.NO_DATA) return null;
      const e = u.arrival || u.departure;
      if (e?.time) return { t: e.time - dayStart };
      if (e?.delay != null) return { t: t + e.delay };
      return null;
    }
    if (u.seq != null && u.seq < seq && u.rel !== STOP.NO_DATA && u.rel !== STOP.SKIPPED) before = u;
  }
  const e = before && (before.departure || before.arrival);
  if (e?.delay != null) return { t: t + e.delay };
  if (update.delay != null) return { t: t + update.delay };
  return null;
}
