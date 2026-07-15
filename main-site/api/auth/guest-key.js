import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const GUEST_TTL_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
    const origin = req.headers.origin;
    const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

    // Missing Origin is normal for same-origin requests — only reject when
    // Origin is present and not on the allow list.
    if (origin && allowed.length && !allowed.includes(origin)) {
        return res.status(403).json({ error: "Origin not allowed" });
    }

    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

    const appId = String(req.query.app_id || "unknown");
    const sessionToken = crypto.randomUUID();
    const signingKey = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + GUEST_TTL_MS).toISOString();

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from("uwu_signing_keys").insert({
        session_token: sessionToken,
        signing_key: signingKey,
        is_guest: true,
        app_id: appId,
        expires_at: expiresAt,
    });

    if (error) {
        return res.status(500).json({ error: "Failed to issue guest key" });
    }

    return res.status(200).json({ key_id: sessionToken, signing_key: signingKey });
}
