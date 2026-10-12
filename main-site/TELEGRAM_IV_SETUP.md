# Telegram Instant View setup

A shared directions link (`/trip/…`, from **Share these directions** or Your trips'
**Share this trip**) can open in Telegram's **Instant View**: the trip's ends, its time
and its map, read right in Telegram, with a link on to the app.

The page is ready for it already ([`api/share-page.js`](api/share-page.js)). Telegram
also needs a template that says how to read it,
[`telegram-instant-view.txt`](telegram-instant-view.txt), and until Telegram approves that
template, Instant View only shows for links sent through `t.me/iv` with the template's
`rhash`. Share's Telegram button sends that link once `TELEGRAM_IV_RHASH` is set.

1. Share some directions from the web app, and copy its `/trip/…` link.
2. Open [instantview.telegram.org](https://instantview.telegram.org/) and log in with
   your Telegram account.
3. Open **My templates**, and enter the link from step 1. That opens the template editor
   for `sgbus.uwuapps.org`.
4. Replace the rules on the left with the whole of
   [`telegram-instant-view.txt`](telegram-instant-view.txt). The preview on the right
   should show the trip's title, its map, and a list of From, To and When, with no errors.
   Try a second link or two, such as one with **Your location** at one end.
5. Click **View in Telegram**. The link it opens looks like
   `https://t.me/iv?url=…&rhash=abc123def456`; copy the `rhash` value from it.
6. In the Vercel project's **Settings → Environment Variables**, set:

   | Name | Value |
   |---|---|
   | `TELEGRAM_IV_RHASH` | the `rhash` from step 5 |

   It isn't a secret: it's in every link the Telegram button sends.
7. Redeploy.

Now Share's **Telegram** button sends `https://t.me/iv?url=<the trip link>&rhash=…`,
and the message in Telegram gets an **Instant View** button. Copy link, WhatsApp and
More still give the plain `/trip/…` link.

## Getting plain links to open in Instant View too

In the template editor, **Submit template** sends it to Telegram for review. If they
approve it, every `/trip/…` link on the domain gets Instant View, and the `rhash` isn't
needed (leave it set; the `t.me/iv` links keep working).

## Changing the page

The template reads the page by its markup: `<header>` with the `<h1>`, the
`h2.subtitle` and the `figure.cover`, and `<article id="trip">` as the body. Change one
and change the other, then paste the template in again and check its preview. Telegram
keeps a page's Instant View for a while, so an old trip may show its old look.

Only `/trip/` links get Instant View. A `/go/` link has little to read beyond its
preview, and an `/eta/` link changes every few seconds, which Instant View, kept by
Telegram, wouldn't show.
