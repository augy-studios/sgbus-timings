// Every bus route in Singapore in one response: the stops each service calls at, in
// order, per direction, with first/last bus times, plus each service's operator and
// terminals. The client builds the route view, the bus picker, first/last bus lines and
// the route planner from this, so none of them need a request of their own.

const BASE = "https://datamall2.mytransport.sg/ltaodataservice";
const PAGE_SIZE = 500;
// LTA pages are fetched this many at a time, until one comes back short.
const BATCH = 8;

async function page(path, skip) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set("$skip", String(skip));
    const r = await fetch(url, {
        headers: { AccountKey: process.env.LTA_ACCOUNT_KEY, accept: "application/json" },
        cache: "no-store",
    });
    if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
    return (await r.json())?.value || [];
}

async function fetchAll(path) {
    const rows = [];
    for (let start = 0; ; start += BATCH) {
        const pages = await Promise.all(
            Array.from({ length: BATCH }, (_, i) => page(path, (start + i) * PAGE_SIZE))
        );
        for (const p of pages) rows.push(...p);
        if (pages.some(p => p.length < PAGE_SIZE)) return rows;
    }
}

// LTA's "HHmm", or "----" where a stop has no bus that day (LTA sends "-").
const hhmm = v => (/^\d{4}$/.test(v || "") ? v : "----");

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!process.env.LTA_ACCOUNT_KEY) return res.status(500).json({ error: "LTA_ACCOUNT_KEY not configured" });

    try {
        const [serviceRows, routeRows] = await Promise.all([fetchAll("BusServices"), fetchAll("BusRoutes")]);

        const services = {};
        for (const s of serviceRows) {
            if (!s.ServiceNo) continue;
            const svc = (services[s.ServiceNo] ??= { op: s.Operator || "", cat: s.Category || "", loop: "", dirs: {} });
            svc.dirs[s.Direction] = [s.OriginCode || null, s.DestinationCode || null];
            if ((s.LoopDesc || "").trim()) svc.loop = s.LoopDesc.trim();
        }

        // One row per stop per run, the earliest in the sequence where LTA lists a stop
        // twice, the same as the Telegram bot keeps them.
        const best = new Map();
        for (const r of routeRows) {
            if (!r.ServiceNo || !r.BusStopCode || r.Direction == null || r.StopSequence == null) continue;
            const key = `${r.ServiceNo}|${r.Direction}|${r.BusStopCode}`;
            const prev = best.get(key);
            if (!prev || r.StopSequence < prev.StopSequence) best.set(key, r);
        }

        const grouped = {};
        for (const r of best.values()) {
            ((grouped[r.ServiceNo] ??= {})[r.Direction] ??= []).push(r);
        }

        const runs = {};
        for (const [serviceNo, dirs] of Object.entries(grouped)) {
            runs[serviceNo] = {};
            for (const [dir, rows] of Object.entries(dirs)) {
                rows.sort((a, b) => a.StopSequence - b.StopSequence);
                runs[serviceNo][dir] = {
                    stops: rows.map(r => r.BusStopCode),
                    // Weekday, Saturday and Sunday first and last bus, 24 characters.
                    times: rows.map(r =>
                        [r.WD_FirstBus, r.WD_LastBus, r.SAT_FirstBus, r.SAT_LastBus, r.SUN_FirstBus, r.SUN_LastBus]
                            .map(hhmm)
                            .join("")
                    ),
                };
            }
        }

        // Routes change a few times a year, so a day at the edge and a few hours in the
        // browser keeps the ~50 LTA requests behind this rare.
        res.setHeader("Cache-Control", "public, max-age=21600, s-maxage=86400, stale-while-revalidate=86400");
        return res.status(200).json({ services, runs });
    } catch (err) {
        return res.status(502).json({ error: "Failed to fetch bus routes", detail: String(err) });
    }
}
