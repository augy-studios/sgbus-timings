import crypto from "node:crypto";

const MAX_SKEW_SECONDS = 30;

function hmacHex(key, message) {
    return crypto.createHmac("sha256", key).update(message).digest("hex");
}

// Vercel's body parser sets req.body = {} for GET/DELETE even with no body sent.
// Treat that the same as "no body" so client/server agree on the hash input.
function bodyHashFor(req, signingKey) {
    const raw = req.body;
    if (raw == null) return "empty";
    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (str === "" || str === "{}") return "empty";
    return hmacHex(signingKey, str);
}

function bearerKeyId(req) {
    const auth = req.headers["authorization"] || "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    return m ? m[1] : null;
}

function constantTimeEqual(a, b) {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

export async function verifySignedRequest(req, supabase) {
    const keyId = req.headers["x-key-id"] || bearerKeyId(req);
    const ts = req.headers["x-request-ts"];
    const token = req.headers["x-request-token"];

    if (!keyId || !ts || !token) {
        return { valid: false, reason: "missing_headers" };
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
        return { valid: false, reason: "invalid_timestamp" };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > MAX_SKEW_SECONDS) {
        return { valid: false, reason: "stale_timestamp" };
    }

    const { data: keyRow, error: keyErr } = await supabase
        .from("uwu_signing_keys")
        .select("signing_key, expires_at")
        .eq("session_token", keyId)
        .maybeSingle();

    if (keyErr || !keyRow) {
        return { valid: false, reason: "unknown_key" };
    }
    if (new Date(keyRow.expires_at).getTime() < Date.now()) {
        return { valid: false, reason: "key_expired" };
    }

    const bodyHash = bodyHashFor(req, keyRow.signing_key);
    const message = `${ts}:${req.method}:${req.url}:${bodyHash}`;
    const expected = hmacHex(keyRow.signing_key, message);

    if (!constantTimeEqual(expected, String(token))) {
        return { valid: false, reason: "bad_signature" };
    }

    const { data: usedRow } = await supabase
        .from("uwu_used_request_tokens")
        .select("token")
        .eq("token", token)
        .maybeSingle();
    if (usedRow) {
        return { valid: false, reason: "replay" };
    }

    const { error: insertErr } = await supabase
        .from("uwu_used_request_tokens")
        .insert({ token: String(token), session_token: keyId, used_at: new Date().toISOString() });
    if (insertErr) {
        return { valid: false, reason: "replay" };
    }

    return { valid: true, reason: "ok" };
}
