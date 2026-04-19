async function dm(path, qs) {
    const url = new URL(`https://datamall2.mytransport.sg/ltaodataservice/${path}`);
    if (qs) Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url, {
        headers: {
            AccountKey: process.env.LTA_ACCOUNT_KEY,
            accept: "application/json"
        },
        cache: "no-store",
    });
    if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
    return r.json();
}

// LTA DataMall BusRoutes does not support $filter — must paginate and filter client-side.
async function fetchRoutesForService(service) {
    const route1 = [];
    const route2 = [];
    const BATCH = 5;
    const MAX_PAGES = 200;

    for (let batchStart = 0; batchStart < MAX_PAGES; batchStart += BATCH) {
        const results = await Promise.all(
            Array.from({ length: BATCH }, (_, i) =>
                dm("BusRoutes", { $skip: String((batchStart + i) * 500), $top: "500" })
            )
        );

        let done = false;
        for (const result of results) {
            const rows = result?.value || [];

            for (const row of rows) {
                if (row.ServiceNo !== service) continue;
                if (row.Direction === 1) {
                    route1.push({ stopCode: row.BusStopCode, seq: row.StopSequence, dir: 1 });
                } else if (row.Direction === 2) {
                    route2.push({ stopCode: row.BusStopCode, seq: row.StopSequence, dir: 2 });
                }
            }

            if (rows.length < 500) { done = true; break; }
        }

        if (done) break;
    }

    route1.sort((a, b) => a.seq - b.seq);
    route2.sort((a, b) => a.seq - b.seq);
    return { route1, route2 };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    const { service } = req.query;
    if (!service) return res.status(400).json({ error: "Missing ?service=15" });

    try {
        const [servicesRaw, { route1, route2 }] = await Promise.all([
            dm("BusServices", { $filter: `ServiceNo eq '${service}'` }),
            fetchRoutesForService(service),
        ]);

        const serviceRows = (servicesRaw?.value || []).filter(s => s.ServiceNo === service);
        const dir1Row = serviceRows.find(s => s.Direction === 1);
        const dir2Row = serviceRows.find(s => s.Direction === 2);

        const operators = [...new Set(serviceRows.map(s => s.Operator))];
        const isLoop = !!(dir1Row?.LoopDesc);
        const loopDesc = dir1Row?.LoopDesc || '';
        const category = dir1Row?.Category || '';

        const terms = {
            dir1: {
                first: route1[0]?.stopCode || dir1Row?.OriginCode || null,
                last: route1[route1.length - 1]?.stopCode || dir1Row?.DestinationCode || null,
                originCode: dir1Row?.OriginCode || null,
                destCode: dir1Row?.DestinationCode || null,
            },
            dir2: dir2Row ? {
                first: route2[0]?.stopCode || dir2Row?.OriginCode || null,
                last: route2[route2.length - 1]?.stopCode || dir2Row?.DestinationCode || null,
                originCode: dir2Row?.OriginCode || null,
                destCode: dir2Row?.DestinationCode || null,
            } : null,
        };

        res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
        return res.status(200).json({
            serviceNo: service,
            operators,
            isLoop,
            loopDesc,
            category,
            route1,
            route2,
            terminals: terms,
        });
    } catch (e) {
        return res.status(502).json({ error: String(e) });
    }
}
