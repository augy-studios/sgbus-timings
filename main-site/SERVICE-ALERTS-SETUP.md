# Setting up Service Alerts notifications

The Service alerts card works as soon as `LTA_ACCOUNT_KEY` is set. Its
**Notify me** buttons, which send train disruptions and traffic incidents as
notifications while the app is closed, need a one-off setup in Vercel. Nothing
runs anywhere else: no VPS, no extra domain, no certificates.

How it fits together:

- The page subscribes to Web Push and sends the subscription and its mode to
  `/api/push/devices/<id>` (`api/push/devices/[id].js`).
- Every minute, Vercel Cron calls `/api/push/poll` (`api/push/poll.js`), which
  checks LTA's train alerts and traffic incidents and pushes what changed to
  each device, filtered by its mode. The rules are `api/_push/alerts.js`, the
  same as the Telegram bot's.
- Subscriptions, and what the feeds looked like at the last poll, are kept in
  Upstash Redis, because functions keep nothing between runs.

It takes about 10 minutes.

## 1. Add an Upstash Redis store

1. In the Vercel dashboard, open the **sgbus** project, then **Storage**.
2. **Create Database**, pick **Upstash**, then **Redis**. Any region near
   Singapore; the free plan is plenty.
3. Connect it to the project, for Production and Preview.

That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project's
environment variables. The code also accepts Upstash's own names,
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, if you set the store up
on upstash.com instead.

Connect it without a prefix, so the names stay as above. One store can serve
several projects: every key this site writes starts with `sgbus:`, so it never
touches another project's data.

## 2. Make the VAPID keys

These identify the site to the browsers' push services. On your computer:

```sh
cd main-site
npm install
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**.

> **Make them once and keep them.** Every subscription is tied to them. New
> keys mean every device has to turn Service Alerts off and on again.

## 3. Add the environment variables

In the project's **Settings → Environment Variables**, for Production (and
Preview, if you want to try it there):

| Name | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | the Public Key from step 2 |
| `VAPID_PRIVATE_KEY` | the Private Key from step 2, marked **Sensitive** |
| `VAPID_SUBJECT` | `mailto:` and an address push services can reach, e.g. `mailto:augy@augystudios.com` |
| `CRON_SECRET` | any long random string, e.g. from `openssl rand -hex 32`, marked **Sensitive** |

`LTA_ACCOUNT_KEY` is already there for the rest of the site.

Vercel sends `CRON_SECRET` with every cron call, and `/api/push/poll` refuses
anything without it, so nobody else can make the site poll and push.

## 4. Deploy

Push to GitHub as usual. `vercel.json` schedules the poll every minute, which
needs the Pro plan; it then appears under the project's **Settings → Cron
Jobs**. `VERSION` in `sw.js` is already bumped for this change.

## 5. Check it

1. `https://sgbus.uwuapps.org/api/push/vapid-key` should show your public key.
   A `503` means `VAPID_PUBLIC_KEY` isn't set for that environment.
2. In **Settings → Cron Jobs**, press **Run** on `/api/push/poll`, then open
   **Logs**. The first run only records what the feeds look like, and returns
   `{"changed":false}`.
3. On your phone, open the site (press **Reload** if the update bar shows), tap
   **Service alerts**, then **All updates**, and allow notifications.
4. Close the app. Traffic incidents change every few minutes, so with **All
   updates** a notification usually arrives within a quarter of an hour.

On iPhone and iPad, notifications only work from the app added to the Home
Screen and opened from there.

## The Get Off Alert in the background

The same setup also sends the Get Off Alert while the app is in the background,
with no more to do. The app sends its trip to `/api/push/trips/<id>`
(`api/push/trips/[id].js`). A second cron, `/api/push/trip-poll`
(`api/push/trip-poll.js`), runs every minute. It follows each trip's bus from
LTA's bus arrivals at the stop you get off at, or the clock for trains, and
pushes the alert two stops out (`api/_push/trip.js`).

To check it: start a trip, allow notifications, and lock the phone. **Settings →
Cron Jobs → Logs** for `/api/push/trip-poll` shows `{"trips":1,"sent":0}` each
minute until the alert, then `"sent":1`. With no trips running it returns
`{"trips":0}` and touches nothing else.

## Troubleshooting

**The card says it couldn't reach the alerts server.** On a computer, open
DevTools → Console on the site and look for `service alerts unavailable:`.
A `503` from `/api/push/...` names what's missing: the Redis store, or a VAPID
variable. Environment variables only reach deployments made after they were
added, so redeploy after adding them.

**The cron runs but nothing arrives.** Open the function's logs:

- `train fetch failed` or `traffic fetch failed`: LTA refused or didn't answer.
  `replied 401` means `LTA_ACCOUNT_KEY` is wrong. Each outage is logged once
  when it starts and once when it clears.
- `push to ... failed: 403`: the VAPID keys changed after devices subscribed.
  Turn Service Alerts off and on again on each device.
- `dropped expired subscription`: normal. That device revoked permission,
  uninstalled the app or cleared its data.
- `{"skipped":"a poll is already running"}`: the previous minute's poll was
  still sending. Normal now and then; if it's every run, something is slow.

## Privacy

Redis holds each device's push subscription and its mode, All updates or
Disruptions only, under a random ID the device made up. No names, locations or
favourites. Picking **Off** deletes the device. A trip for the Get Off Alert is
kept only while it runs: its stops, its buses and trains, how many stops along it
the app last saw you, and the push subscription. Never your location itself. It's
deleted when the trip ends, and expires on its own if the app stops checking in. Clearing the store only means
each device re-sends its choice the next time the app opens.
