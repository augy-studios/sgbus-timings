// Service Alerts right now: LTA's train service alerts and traffic incidents,
// for the card in js/alerts.js. Either is null when LTA couldn't be reached for
// it, so one feed being down doesn't blank the other.

async function dm(path) {
    const r = await fetch(`https://datamall2.mytransport.sg/ltaodataservice/${path}`, {
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

    const [train, traffic] = await Promise.allSettled([dm("TrainServiceAlerts"), dm("TrafficIncidents")]);

    const trainValue = train.status === "fulfilled" ? (train.value?.value ?? train.value) : null;
    const incidents = traffic.status === "fulfilled"
        ? (traffic.value?.value || [])
            .map((i) => ({ type: String(i.Type || "Incident").trim(), message: String(i.Message || "").trim() }))
            .filter((i) => i.message)
        : null;

    if (train.status === "rejected") console.error("TrainServiceAlerts:", train.reason);
    if (traffic.status === "rejected") console.error("TrafficIncidents:", traffic.reason);

    // Both down: an error, so the card says so rather than showing nothing.
    if (!trainValue && !incidents) return res.status(502).json({ error: "Could not reach LTA" });

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ train: trainValue, traffic: incidents, fetchedAt: Date.now() });
}
