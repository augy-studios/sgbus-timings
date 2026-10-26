// The bus and rail network the nav router rides on, built once per function instance and
// kept while it stays warm. The graph itself is js/nav-core/network.js's, the same code that
// builds it on the phone for planning offline (js/nav-core/offline.js).
//
// - Bus routes and stops come from this site's own /api/bus-routes and /api/bus-stops,
//   which the edge caches for a day, so building this costs two cached requests.
// - Rail comes from data/rail.json, a vendored sgraildata snapshot (scripts/vendor-rail.mjs),
//   served as it is to the browser too.

import { readFileSync } from "node:fs";
import { buildGraph as buildNetwork } from "../../js/nav-core/network.js";

export { LRT_LINES, STATION_ACCESS_MIN, WALK_M_PER_MIN, haversine, metresTo, nodesNear } from "../../js/nav-core/network.js";

const rail = JSON.parse(readFileSync(new URL("../../data/rail.json", import.meta.url), "utf8"));

// The graph from the two payloads, with rail.json's stations and lines.
const buildGraph = (stopsPayload, routesPayload, options) => buildNetwork(rail, stopsPayload, routesPayload, options);

// ---------- loading, cached for the life of the instance ----------

const TTL_MS = 6 * 3600 * 1000;
// /api/bus-routes is rebuilt from LTA whenever the edge has no copy (after every deploy),
// and LTA sometimes turns that away. It's asked again once after this long before giving up.
const RETRY_MS = 1500;
let cached = null;
let loading = null;
// The graph with the restricted stops open (`open`), built from the same payloads the first
// time someone with Restricted areas on asks, and dropped with them.
let openGraph = null;

export async function getGraph(origin, { open = false } = {}) {
  const graph = await publicGraph(origin);
  if (!open) return graph;
  if (openGraph?.from !== graph) openGraph = { from: graph, graph: buildGraph(...graph.payloads, { open: true }) };
  return openGraph.graph;
}

async function publicGraph(origin) {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.graph;
  if (!loading) {
    loading = (async () => {
      const get = async (path) => {
        for (let attempt = 0; ; attempt++) {
          const r = await fetch(`${origin}${path}`).catch((err) => ({ ok: false, status: err.message }));
          if (r.ok) return r.json();
          if (attempt >= 1) throw new Error(`${path} replied ${r.status}`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      };
      const [stops, routes] = await Promise.all([get("/api/bus-stops"), get("/api/bus-routes")]);
      const graph = buildGraph(stops, routes);
      graph.payloads = [stops, routes];
      cached = { graph, at: Date.now() };
      return graph;
    })()
      // Routes hardly change, so a graph past its six hours beats no journeys at all; the
      // next request tries for a fresh one again.
      .catch((err) => {
        if (!cached) throw err;
        console.warn("nav: kept the old network, couldn't refresh it:", err.message);
        return cached.graph;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

// The site's own address, for fetching its other routes from inside a function.
export function originOf(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export { rail, buildGraph };
