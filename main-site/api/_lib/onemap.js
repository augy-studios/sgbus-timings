// OneMap, Singapore's official map: the token, address search, and public transport routing.
// Shared by /api/postal-code, /api/places and /api/nav.
//
// With ONEMAP_EMAIL and ONEMAP_PASSWORD set, requests carry a OneMap token, fetched with
// them and reused until it runs out: three days, per OneMap. It's kept in the function's
// memory, so each new instance fetches its own. Search works without one; routing doesn't.

const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";
const ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route";
// A token is renewed this long before it runs out, so no request goes out on one that lapses
// on the way.
const TOKEN_MARGIN_MS = 3600 * 1000;
const TOKEN_LIFETIME_MS = 3 * 24 * 3600 * 1000;

let token = null;
let tokenExpires = 0;

export async function getToken(renew = false) {
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
        console.warn(`[onemap] couldn't get a token: ${err}`);
        token = null;
        tokenExpires = 0;
    }
    return token;
}

// A GET with the token if there is one, and one more try on a new token if OneMap has
// stopped taking the old one before its expiry.
async function get(url) {
    const send = (t) => fetch(url, { headers: { accept: "application/json", ...(t ? { Authorization: t } : {}) }, cache: "no-store" });
    const t = await getToken();
    let r = await send(t);
    if (t && (r.status === 401 || r.status === 403)) r = await send(await getToken(true));
    return r;
}

// OneMap writes addresses in capitals: "1 PASIR RIS CLOSE" reads as "1 Pasir Ris Close".
export const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export function addressOf(hit) {
    const blk = hit.BLK_NO && hit.BLK_NO !== "NIL" ? `${hit.BLK_NO} ` : "";
    const road = hit.ROAD_NAME && hit.ROAD_NAME !== "NIL" ? hit.ROAD_NAME : hit.BUILDING;
    return titleCase(`${blk}${road}`.trim());
}

// Raw search hits for free text: addresses, buildings, postal codes, places.
export async function search(text, page = 1) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("searchVal", text);
    url.searchParams.set("returnGeom", "Y");
    url.searchParams.set("getAddrDetails", "Y");
    url.searchParams.set("pageNum", String(page));
    const r = await get(url);
    if (!r.ok) throw new Error(`OneMap search responded ${r.status}`);
    return (await r.json())?.results || [];
}

// Public transport itineraries from OneMap's router, in its own (OpenTripPlanner) shape.
// Needs a token. `mode` is TRANSIT, BUS or RAIL. Times are Singapore time.
export async function route(from, to, { mode = "TRANSIT", when = new Date(), count = 3 } = {}) {
    const sg = new Date(when.getTime() + 8 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const url = new URL(ROUTE_URL);
    url.searchParams.set("start", `${from.lat},${from.lng}`);
    url.searchParams.set("end", `${to.lat},${to.lng}`);
    url.searchParams.set("routeType", "pt");
    url.searchParams.set("mode", mode);
    url.searchParams.set("date", `${pad(sg.getUTCMonth() + 1)}-${pad(sg.getUTCDate())}-${sg.getUTCFullYear()}`);
    url.searchParams.set("time", `${pad(sg.getUTCHours())}:${pad(sg.getUTCMinutes())}:00`);
    url.searchParams.set("maxWalkDistance", "1000");
    url.searchParams.set("numItineraries", String(count));
    if (!(await getToken())) throw new Error("OneMap routing needs ONEMAP_EMAIL and ONEMAP_PASSWORD");
    const r = await get(url);
    if (!r.ok) throw new Error(`OneMap route responded ${r.status}`);
    return (await r.json())?.plan?.itineraries || [];
}
