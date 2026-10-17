// The newest release of the Android app (android/), for its update bar (js/app-update.js) and
// its own updater (UpdateActivity.java). Read from the repository's GitHub Releases, tagged
// android-v<version> with the APK attached (release/README.md, api/_lib/release.js), and cached
// at Vercel's edge, so GitHub sees a request every few minutes however many phones ask: its limit
// is 60 an hour per IP without a token, and phones on one mobile network share IPs.
//
//   { version: "1.2.0", apk: "https://github.com/.../sg-bus-timings-1.2.0.apk", size: 712345,
//     sha256: "ab12…" (GitHub's checksum of the file, or null), page: the release's page }
//   or { version: null } while there's no release with an APK.
//
// ?v=<version> is ignored, but makes a URL of its own that the cache hasn't seen: a tapped "new
// version" notification (api/push/release.js) asks with it, for a release published seconds ago.

import { latestRelease } from './_lib/release.js';

export default async function handler(req, res) {
  let best;
  try {
    best = await latestRelease();
  } catch (err) {
    console.error('app-release:', err.message);
    return res.status(502).json({ error: "Couldn't reach GitHub" });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  return res.status(200).json(best || { version: null });
}
