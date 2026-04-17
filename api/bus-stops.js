export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    const key = process.env.LTA_ACCOUNT_KEY;
    if (!key) return res.status(500).json({ error: "LTA_ACCOUNT_KEY not configured" });

    const stops = [];
    let skip = 0;
    const PAGE_SIZE = 500;

    try {
        while (true) {
            const url = new URL("https://datamall2.mytransport.sg/ltaodataservice/BusStops");
            url.searchParams.set("$skip", String(skip));

            const r = await fetch(url, {
                headers: { AccountKey: key, accept: "application/json" },
                cache: "no-store",
            });

            if (!r.ok) throw new Error(`LTA API responded ${r.status}`);
            const data = await r.json();
            const page = data?.value || [];

            for (const s of page) {
                stops.push({
                    c: s.BusStopCode,
                    n: s.Description,
                    r: s.RoadName,
                    la: s.Latitude,
                    lo: s.Longitude,
                });
            }

            if (page.length < PAGE_SIZE) break;
            skip += PAGE_SIZE;
        }

        res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=3600");
        return res.status(200).json(stops);
    } catch (err) {
        return res.status(502).json({ error: "Failed to fetch bus stops", detail: String(err) });
    }
}
