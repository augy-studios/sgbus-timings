// One stop on the way (api/nav.js, &via=lat,lng): Navigate's Add a stop, from the start to
// the stop and on to the end, with no time counted at the stop. Each half is planned as any
// nav is (api/nav.js, planViaFor) and checked by OneMap on its own, so a nav with a stop costs
// twice the calls of one without, never more. The best few of each half are joined here into
// whole journeys, in the shape the client already reads: both halves' legs in order, each
// ride's `board` counted from setting off, and the totals of the two.
//
// Each joined journey says where the stop is as `via`: { leg, minutes }, the index of the
// first leg after the stop and the minutes in that it's reached. The walk to the stop ends at
// it, and the walk from it starts there, each as a place with `via: true` and its point, so
// both can be followed and named.

// The best of each half that are joined: 3 x 3 at most.
export const VIA_EACH = 3;
// As router.js keeps its own options: within this of the quickest, and no more than this many.
const KEEP_FACTOR = 1.6;
const KEEP_EXTRA_MIN = 12;
const MAX_OPTIONS = 8;

// `fits(a, b)` says whether a first half and a second can be joined: whether each ride on
// them runs at the time it would be boarded once joined (api/nav.js).
export function joinWays(firsts, seconds, via, { fits = () => true, each = VIA_EACH } = {}) {
  const joined = [];
  for (const a of firsts.slice(0, each)) {
    for (const b of seconds.slice(0, each)) if (fits(a, b)) joined.push(join(a, b, via));
  }
  joined.sort((a, b) => a.minutes - b.minutes);
  const fastest = joined[0]?.minutes ?? Infinity;
  return joined.filter((o) => o.minutes <= fastest * KEEP_FACTOR + KEEP_EXTRA_MIN).slice(0, MAX_OPTIONS);
}

function join(a, b, via) {
  const at = { kind: "place", via: true, lat: via.lat, lng: via.lng };
  // Copies, as one half is joined to several of the other and annotate() writes on its legs.
  const first = a.legs.map((l) => ({ ...l }));
  const second = b.legs.map((l) => (l.board == null ? { ...l } : { ...l, board: l.board + a.minutes }));
  const last = first[first.length - 1];
  if (last?.mode === "walk") last.to = at;
  if (second[0]?.mode === "walk" && !second[0].from) second[0].from = at;
  const option = {
    minutes: a.minutes + b.minutes,
    mix: a.mix + b.mix,
    routes: [...a.routes, ...b.routes],
    legs: [...first, ...second],
    via: { leg: first.length, minutes: a.minutes },
  };
  if (a.walkOnly && b.walkOnly) option.walkOnly = true;
  if (a.source === "onemap" || b.source === "onemap") option.source = "onemap";
  // OneMap's time for the whole of it, where it has one for each half that rides (a half
  // walked counts as walked).
  else if (!option.walkOnly) {
    const om = (x) => (x.walkOnly ? x.minutes : x.onemapMinutes);
    if (om(a) != null && om(b) != null) option.onemapMinutes = om(a) + om(b);
  }
  return option;
}
