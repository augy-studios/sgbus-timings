// Navigate's Bus and train planned offline (js/nav-core/offline.js), off the page's thread
// (js/nav.js, planOnPhone): building the graph of every stop, station and run takes a moment
// on a phone, and here it can't hold the page still. Kept between plans, so it's built once.
//
// A module worker, unlike js/planner-worker.js, as js/nav-core/ is ES modules shared with the
// server. Every message is { id, ask, stops? } or { id, warm, stops? }, answered { id, data }
// or { id, error }: `stops`, the stops index from script.js, comes with the first, and
// `ask` is what planOffline takes.
import { planOffline, setStops, warm } from "./nav-core/offline.js";

self.onmessage = async ({ data: { id, ask, warm: warming, stops } }) => {
  try {
    if (stops) setStops(stops);
    const data = warming ? await warm(warming) : await planOffline(ask);
    self.postMessage({ id, data });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
