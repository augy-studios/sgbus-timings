// The route planner's journey search, off the page's thread (js/planner.js). Finding journeys
// with a change walks the whole bus network, which on a phone can hold the page still for a
// second or more; here it can't. Runs the same js/when.js, js/network.js and js/journeys.js
// as the page.
//
// The first message carries the stops index from script.js, and every message is
// { id, start, end, timing, open, customs }, answered { id, journeys, fixes } or { id, error }.
// `open` is Settings' Restricted areas (BusNet.setOpenAccess), and `customs` the minutes to
// clear immigration across the Causeway (BusNet.setCustoms), as the page has them.
self.window = self;
importScripts("/js/when.js", "/js/network.js", "/js/journeys.js");

let stopsIndex = null;

self.onmessage = async ({ data }) => {
  const { id, stops, start, end, timing, open, customs } = data;
  try {
    if (stops) stopsIndex = stops;
    BusNet.setOpenAccess(open);
    if (customs) BusNet.setCustoms(customs);
    // Shared and kept once loaded; a failed load is tried again on the next search.
    await BusNet.load(stopsIndex);
    const journeys = Journeys.findJourneys(start, end, undefined, timing);
    const fixes = journeys.length ? Journeys.wrongSideEnds(start, end) : {};
    self.postMessage({ id, journeys, fixes });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
