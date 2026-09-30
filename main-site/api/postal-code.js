// Where a 6-digit postal code is, from OneMap's address search: { postal, address, lat, lng }.
// OneMap still answers without a token, if with a warning; set ONEMAP_API_TOKEN should it
// start to insist.

// OneMap writes addresses in capitals: "1 PASIR RIS CLOSE" reads as "1 Pasir Ris Close".
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function addressOf(hit) {
    const blk = hit.BLK_NO && hit.BLK_NO !== "NIL" ? `${hit.BLK_NO} ` : "";
    const road = hit.ROAD_NAME && hit.ROAD_NAME !== "NIL" ? hit.ROAD_NAME : hit.BUILDING;
    return titleCase(`${blk}${road}`.trim());
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();

    const code = String(req.query.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "code must be a 6-digit postal code" });

    const url = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
    url.searchParams.set("searchVal", code);
    url.searchParams.set("returnGeom", "Y");
    url.searchParams.set("getAddrDetails", "Y");
    url.searchParams.set("pageNum", "1");
    const headers = { accept: "application/json" };
    if (process.env.ONEMAP_API_TOKEN) headers.Authorization = process.env.ONEMAP_API_TOKEN;

    try {
        const r = await fetch(url, { headers, cache: "no-store" });
        if (!r.ok) throw new Error(`OneMap responded ${r.status}`);
        const data = await r.json();
        // The search matches addresses as text, so a result only counts on the exact code.
        const hit = (data?.results || []).find((x) => x.POSTAL === code && x.LATITUDE && x.LONGITUDE);
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
