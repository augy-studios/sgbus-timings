// POST /api/push/release   a new version of the apps is out
//
// GitHub calls this for the repository's releases (a webhook, android/FIREBASE-SETUP.md), and it
// pushes "SG Bus Timings 2.1.1 is out" to the sgbus-releases FCM topic, which the Android app
// joins when "New versions of the app" is on in Service alerts (js/app-update.js,
// SgBusPlugin.setReleases). Tapping it opens the app's update window (MainActivity,
// UpdateActivity), which installs it. A watch paired with the phone shows it too, as it shows
// the phone's other notifications.
//
// The desktop apps hear without this: Electron has no Web Push or FCM to push to, so they check
// GitHub themselves every hour and when the computer wakes (desktop/updater.js), and say so with
// a desktop notification. Their installers reach the release a few minutes after it's
// published anyway, once GitHub Actions has built them.
//
// GitHub signs each delivery with GITHUB_WEBHOOK_SECRET, checked here before anything is sent,
// so nobody else can make every phone buzz. Only "released" counts: a release published, or a
// pre-release made a full one. Drafts, pre-releases, other tags, releases without their APK, and
// a version older than the newest already out are answered with why, and nothing is sent.
//
// A web-standard handler (Request in, Response out), as the signature is over the body exactly as
// GitHub sent it, before any parsing.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sendToTopic } from '../_push/fcm.js';
import { asRelease, latestRelease, newer } from '../_lib/release.js';

const TOPIC = 'sgbus-releases';

function signedByGitHub(body, signature) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function POST(request) {
  const body = await request.text();
  if (!signedByGitHub(body, request.headers.get('x-hub-signature-256'))) {
    return Response.json({ error: 'Bad signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  // GitHub's hello when the webhook is first saved.
  if (event === 'ping') return Response.json({ ok: true, pong: true });
  if (event !== 'release') return Response.json({ sent: false, why: `Not a release event (${event})` });

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Not JSON: set the webhook\'s content type to application/json' }, { status: 400 });
  }
  if (payload.action !== 'released') return Response.json({ sent: false, why: `Release ${payload.action}, not released` });

  const release = asRelease(payload.release);
  if (!release) {
    return Response.json({ sent: false, why: 'Not an android-v* release with its APK uploaded' });
  }

  // Re-publishing an old version shouldn't tell everyone it's new. GitHub's list may not show
  // this release yet, so it's only skipped when something newer is already out.
  try {
    const latest = await latestRelease();
    if (latest && newer(latest.version, release.version)) {
      return Response.json({ sent: false, why: `${latest.version} is newer than ${release.version}` });
    }
  } catch (cause) {
    console.warn('push/release: could not compare with the newest release:', cause.message);
  }

  try {
    await sendToTopic(TOPIC, {
      title: `SG Bus Timings ${release.version} is out`,
      body: 'Tap to update the app.',
      data: { type: 'release', version: release.version },
      channel: 'releases',
      tag: 'release',
    });
  } catch (cause) {
    // What went wrong, as GitHub's Recent Deliveries shows it: "FIREBASE_SERVICE_ACCOUNT is not
    // set", or FCM's status with its reason.
    const why = typeof cause.body === 'string' ? cause.body
      : cause.body?.error?.message ? `${cause.message}: ${cause.body.error.message}` : cause.message;
    console.error('push/release:', why);
    return Response.json({ sent: false, error: why }, { status: 502 });
  }
  return Response.json({ sent: true, version: release.version });
}
