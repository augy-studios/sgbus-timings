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

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    const {
        service
    } = req.query;
    if (!service) return res.status(400).json({
        error: "Missing ?service=15"
    });

    try {
        // BusServices: operator, cats, etc.
        const servicesRaw = await dm("BusServices", {
            $filter: `ServiceNo eq '${service}'`
        });
        const operators = [...new Set((servicesRaw?.value || []).map(s => s.Operator))];

        // BusRoutes for both dir=1 and dir=2
        const [r1, r2] = await Promise.all([
            dm("BusRoutes", {
                $filter: `ServiceNo eq '${service}' and Direction eq 1`,
                $orderby: "StopSequence asc",
                $top: 500
            }),
            dm("BusRoutes", {
                $filter: `ServiceNo eq '${service}' and Direction eq 2`,
                $orderby: "StopSequence asc",
                $top: 500
            }),
        ]);

        function shapeRoute(v) {
            const rows = v?.value || [];
            return rows.map(row => ({
                stopCode: row.BusStopCode,
                seq: row.StopSequence,
                dir: row.Direction,
            }));
        }

        const route1 = shapeRoute(r1);
        const route2 = shapeRoute(r2);

        // “Interchanges”: take first/last stop names on each direction (client maps code->name)
        const terms = {
            dir1: {
                first: route1[0]?.stopCode || null,
                last: route1[route1.length - 1]?.stopCode || null
            },
            dir2: {
                first: route2[0]?.stopCode || null,
                last: route2[route2.length - 1]?.stopCode || null
            },
        };

        res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
        return res.status(200).json({
            serviceNo: service,
            operators,
            route1,
            route2,
            terminals: terms,
        });
    } catch (e) {
        return res.status(502).json({
            error: String(e)
        });
    }
}