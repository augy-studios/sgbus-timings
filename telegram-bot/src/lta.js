import { config } from "./config.js";

const BASE = "https://datamall2.mytransport.sg/ltaodataservice";

async function ltaGet(pathname, params = {}) {
  const url = new URL(`${BASE}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    headers: {
      AccountKey: config.ltaAccountKey,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`LTA DataMall request failed (${res.status}): ${pathname}`);
  }
  return res.json();
}

/** Fetch the full bus stop list from LTA DataMall, paginating 500 records at a time. */
export async function fetchAllBusStops() {
  const stops = [];
  let skip = 0;
  for (;;) {
    const data = await ltaGet("/BusStops", { $skip: skip });
    const rows = data.value || [];
    if (rows.length === 0) break;
    for (const s of rows) {
      stops.push({
        code: s.BusStopCode,
        name: s.Description,
        road: s.RoadName,
        lat: s.Latitude,
        lng: s.Longitude,
      });
    }
    if (rows.length < 500) break;
    skip += 500;
  }
  return stops;
}

/** Live bus arrival timings for a given bus stop code, reshaped for display. */
export async function fetchArrivals(stopCode, serviceNo) {
  const data = await ltaGet("/v3/BusArrival", {
    BusStopCode: stopCode,
    ServiceNo: serviceNo,
  });

  const services = (data.Services || []).map((svc) => {
    const nexts = [svc.NextBus, svc.NextBus2, svc.NextBus3].map((nb) => shapeNextBus(nb));
    return {
      serviceNo: svc.ServiceNo,
      operator: svc.Operator,
      next: nexts[0],
      next2: nexts[1],
      next3: nexts[2],
    };
  });

  services.sort((a, b) => a.serviceNo.localeCompare(b.serviceNo, undefined, { numeric: true }));

  return { busStopCode: data.BusStopCode || stopCode, services };
}

function shapeNextBus(nb) {
  if (!nb || !nb.EstimatedArrival) return null;
  const etaMs = Math.max(0, new Date(nb.EstimatedArrival).getTime() - Date.now());
  const lat = nb.Latitude ? Number(nb.Latitude) : null;
  const lng = nb.Longitude ? Number(nb.Longitude) : null;
  return {
    etaMs,
    load: nb.Load || null,
    wheelchair: nb.Feature === "WAB",
    deck: nb.Type === "DD" ? "Double" : nb.Type === "BD" ? "Bendy" : "Single",
    lat,
    lng,
    rough: lat == null || lng == null,
  };
}
