// The newest release of the Android app (android/), for its update bar (js/app-update.js) and
// its own updater (UpdateActivity.java). Read from the repository's GitHub Releases, tagged
// android-v<version> with the APK attached (release/README.md), and cached at Vercel's edge,
// so GitHub sees a request every few minutes however many phones ask: its limit is 60 an hour
// per IP without a token, and phones on one mobile network share IPs.
//
//   { version: "1.2.0", apk: "https://github.com/.../sg-bus-timings-1.2.0.apk", size: 712345,
//     sha256: "ab12…" (GitHub's checksum of the file, or null), page: the release's page }
//   or { version: null } while there's no release with an APK.

const RELEASES = "https://api.github.com/repos/augy-studios/sgbus-timings/releases?per_page=30";
const TAG = /^android-v(\d+(?:\.\d+)*)$/;

// Whether version a comes after version b, number by number: 1.10.0 after 1.9.0.
function newer(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

export default async function handler(req, res) {
  let releases;
  try {
    const r = await fetch(RELEASES, {
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "sgbus-timings" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`GitHub replied ${r.status}`);
    releases = await r.json();
  } catch (err) {
    console.error("app-release:", err.message);
    return res.status(502).json({ error: "Couldn't reach GitHub" });
  }

  let best = null;
  for (const rel of Array.isArray(releases) ? releases : []) {
    const version = TAG.exec(rel.tag_name || "")?.[1];
    if (!version || rel.draft || rel.prerelease) continue;
    const assets = rel.assets || [];
    const apk = assets.find((a) => a.name === `sg-bus-timings-${version}.apk`) || assets.find((a) => /\.apk$/i.test(a.name));
    // A release published before its APK finished uploading: not one to offer yet.
    if (!apk || apk.state !== "uploaded") continue;
    if (best && !newer(version, best.version)) continue;
    best = {
      version,
      apk: apk.browser_download_url,
      size: apk.size,
      sha256: /^sha256:[0-9a-f]{64}$/i.test(apk.digest || "") ? apk.digest.slice(7).toLowerCase() : null,
      page: rel.html_url,
    };
  }

  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  return res.status(200).json(best || { version: null });
}
