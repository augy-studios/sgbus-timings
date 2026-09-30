// Where a 6-digit postal code is, from OneMap's address search: { postal, address, lat, lng }.
//
// With ONEMAP_EMAIL and ONEMAP_PASSWORD set, searches carry a OneMap token, fetched with
// them and reused until it runs out: three days, per OneMap. It's kept in the function's
// memory, so each new instance fetches its own. Without them, or when the token can't be
// had, the search goes without one, which OneMap still answers.

const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";
// A token is renewed this long before it runs out, so no search goes out on one that lapses
// on the way.
const TOKEN_MARGIN_MS = 3600 * 1000;
const TOKEN_LIFETIME_MS = 3 * 24 * 3600 * 1000;

let token = null;
let tokenExpires = 0;

async function getToken(renew = false) {
    const { ONEMAP_EMAIL: email, ONEMAP_PASSWORD: password } = process.env;
    if (!email || !password) return null;
    if (!renew && token && Date.now() < tokenExpires - TOKEN_MARGIN_MS) return token;
    try {
        const r = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
        });
        if (!r.ok) throw new Error(`OneMap token responded ${r.status}`);
        const data = await r.json();
        if (!data?.access_token) throw new Error("OneMap token response had no access_token");
        token = data.access_token;
        // expiry_timestamp is Unix seconds, as a string.
        tokenExpires = Number(data.expiry_timestamp) * 1000 || Date.now() + TOKEN_LIFETIME_MS;
    } catch (err) {
        console.warn(`[onemap] couldn't get a token, searching without one: ${err}`);
        token = null;
        tokenExpires = 0;
    }
    return token;
}

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

    const url = new URL(SEARCH_URL);
    url.searchParams.set("searchVal", code);
    url.searchParams.set("returnGeom", "Y");
    url.searchParams.set("getAddrDetails", "Y");
    url.searchParams.set("pageNum", "1");
    const search = (t) =>
        fetch(url, { headers: { accept: "application/json", ...(t ? { Authorization: t } : {}) }, cache: "no-store" });

    try {
        const t = await getToken();
        let r = await search(t);
        // A token OneMap has stopped taking before its expiry: one more try on a new one.
        if (t && (r.status === 401 || r.status === 403)) r = await search(await getToken(true));
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
