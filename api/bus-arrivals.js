export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    const {
        stop,
        service
    } = req.query;
    if (!stop) return res.status(400).json({
        error: "Missing ?stop=BUS_STOP_CODE"
    });

    const url = new URL("https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival");
    url.searchParams.set("BusStopCode", String(stop));
    if (service) url.searchParams.set("ServiceNo", String(service));

    try {
        const r = await fetch(url, {
            headers: {
                AccountKey: process.env.LTA_ACCOUNT_KEY,
                accept: "application/json"
            },
            cache: "no-store",
        });
        const raw = await r.json();

        // Shape it into something easy for your client
        const out = {
            busStopCode: raw?.BusStopCode || stop,
            services: (raw?.Services || []).map(s => {
                const toMs = (iso) => (iso ? Math.max(0, new Date(iso) - new Date()) : null);
                const slurp = (nb) => nb ? ({
                    eta_ms: toMs(nb.EstimatedArrival),
                    load: nb.Load, // SEA / SDA / LSD
                    wheelchair: nb.Feature === "WAB",
                    deck: nb.Type === "DD" ? "Double" : "Single", // SD/DD/BD -> Single/Double
                    lat: nb.Latitude ?? null,
                    lng: nb.Longitude ?? null,
                    rough: (nb.Latitude == null || nb.Longitude == null), // italicise if true
                    origin: nb.OriginCode,
                    dest: nb.DestinationCode
                }) : null;

                return {
                    serviceNo: s.ServiceNo,
                    operator: s.Operator, // SBS, SMRT, TTS, GAS, etc.
                    next: slurp(s.NextBus),
                    next2: slurp(s.NextBus2),
                    next3: slurp(s.NextBus3),
                };
            }),
        };

        // Edge cache lightly to respect rate limits
        res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
        return res.status(200).json(out);
    } catch (err) {
        return res.status(502).json({
            error: "Upstream fetch failed",
            detail: String(err)
        });
    }
}