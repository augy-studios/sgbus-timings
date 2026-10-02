// Where a 6-digit postal code is, from OneMap's address search: { postal, address, lat, lng }.
// The OneMap token and search live in _lib/onemap.js.

import { addressOf, search } from "./_lib/onemap.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    const code = String(req.query.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "code must be a 6-digit postal code" });

    try {
        // The search matches addresses as text, so a result only counts on the exact code.
        const hit = (await search(code)).find((x) => x.POSTAL === code && x.LATITUDE && x.LONGITUDE);
        // A postal code's place doesn't move, so both answers keep well.
        res.setHeader("Cache-Control", "s-maxage=2592000, stale-while-revalidate=86400");
        if (!hit) return res.status(404).json({ error: "No address has that postal code" });
        return res.status(200).json({
            postal: code,
            address: addressOf(hit),
            lat: Number(hit.LATITUDE),
            lng: Number(hit.LONGITUDE),
        });
    } catch (err) {
        return res.status(502).json({ error: "Failed to look up postal code", detail: String(err) });
    }
}
