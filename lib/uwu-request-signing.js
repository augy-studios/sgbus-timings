// Shared client-side request signing for UwU Apps PWAs.
// Loaded as a plain script (no bundler) — exposes window.UwuSigning.
(function (global) {
    const STORAGE_KEY = "uwu_signing_key";

    function readKey(storage) {
        try {
            const raw = storage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.signingKey || !parsed.keyId) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    function storeSigningKey(signingKey, keyId, persistent = false) {
        const payload = JSON.stringify({ signingKey, keyId });
        const target = persistent ? localStorage : sessionStorage;
        const other = persistent ? sessionStorage : localStorage;
        target.setItem(STORAGE_KEY, payload);
        other.removeItem(STORAGE_KEY);
    }

    function getSigningKey() {
        const fromLocal = readKey(localStorage);
        if (fromLocal) return fromLocal;
        const fromSession = readKey(sessionStorage);
        if (fromSession) return fromSession;
        return null;
    }

    function clearSigningKey() {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
    }

    async function initGuestKey(appId) {
        if (getSigningKey()) return;
        const res = await fetch(`/api/auth/guest-key?app_id=${encodeURIComponent(appId)}`);
        if (!res.ok) throw new Error("Failed to obtain guest signing key");
        const data = await res.json();
        if (!data || !data.signing_key || !data.key_id) {
            throw new Error("Malformed guest signing key response");
        }
        storeSigningKey(data.signing_key, data.key_id, false);
    }

    async function hmacHex(keyStr, message) {
        const enc = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            enc.encode(keyStr),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    async function signedFetch(url, options = {}) {
        const key = getSigningKey();
        if (!key) {
            throw new Error("signedFetch: no signing key in storage — call initGuestKey() or log in first");
        }

        const u = new URL(url, location.origin);
        const path = u.pathname + u.search;
        const method = (options.method || "GET").toUpperCase();
        const ts = Math.floor(Date.now() / 1000);

        const bodyStr = typeof options.body === "string" ? options.body : null;
        const bodyHash = bodyStr ? await hmacHex(key.signingKey, bodyStr) : "empty";

        const message = `${ts}:${method}:${path}:${bodyHash}`;
        const token = await hmacHex(key.signingKey, message);

        const headers = new Headers(options.headers || {});
        headers.set("X-Request-Token", token);
        headers.set("X-Request-TS", String(ts));
        headers.set("X-Key-ID", key.keyId);

        return fetch(url, { ...options, headers });
    }

    global.UwuSigning = { storeSigningKey, getSigningKey, clearSigningKey, initGuestKey, signedFetch };
})(window);
