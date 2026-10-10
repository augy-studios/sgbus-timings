# Share links setup

Navigate's **Share** makes short links (`/go/…`, `/trip/…`, `/eta/…`) kept in
Supabase. Without it, Share still works with nothing set (the plain `#nav` link),
but every short link answers "Sharing is not set up yet."

1. Create a Supabase project, or use an existing one.
2. In its **SQL Editor**, run [`migrations/0001_share_links.sql`](../migrations/0001_share_links.sql)
   from the repo root. That makes the `share_links` table, with row level security on
   and no policies, so only the service key reaches it.
3. In **Project Settings → API**, copy the project URL and the `service_role` key
   (or a newer `sb_secret_…` key).
4. In the Vercel project's **Settings → Environment Variables**, set:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://<project>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | the key from step 3 |

   Both are server-only. Never put either in the page.
5. Redeploy.

## What else it uses

- **Rate limiting**: link-making is limited per IP with the Upstash Redis store from
  [SERVICE-ALERTS-SETUP.md](SERVICE-ALERTS-SETUP.md), when that's set up. Without
  it, there's no limit.
- **Live ETA in the background**: the Get Off Alert cron (`api/push/trip-poll.js`)
  keeps an ETA link updated while the sharer's app is in the background. That needs
  the Get Off Alert's own setup (Redis, VAPID keys, `CRON_SECRET`), and the sharer
  to have allowed notifications. Without it, the link updates only while the app
  is open.
- **Maps**: OneMap's static map, which needs no key.

## Schema changes

Each file in `migrations/` is run once and never edited afterwards. A change goes in
a new numbered file, such as `0002_….sql`.
