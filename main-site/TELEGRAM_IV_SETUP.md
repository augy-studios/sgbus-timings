# Telegram Instant View setup

A shared directions link (`/trip/…`, from **Share these directions** or Your trips'
**Share this trip**) can open in Telegram's **Instant View**: the trip's ends, its time
and its map, read right in Telegram, with a link on to the app.

The page is ready for it already ([`api/share-page.js`](api/share-page.js)). Telegram
also needs a template that says how to read it,
[`telegram-instant-view.txt`](telegram-instant-view.txt), and shows Instant View for
plain `/trip/…` links only once it has approved that template. Share always sends the
plain link, never a `t.me/iv` one, so nothing changes in the app until then.

1. Share some directions from the web app, and copy its `/trip/…` link.
2. Open [instantview.telegram.org](https://instantview.telegram.org/) and log in with
   your Telegram account.
3. Open **My templates**, and enter the link from step 1. That opens the template editor
   for `sgbus.uwuapps.org`.
4. Replace the rules on the left with the whole of
   [`telegram-instant-view.txt`](telegram-instant-view.txt). The preview on the right
   should show the trip's title, its map, and a list of From, To and When, with no errors.
   Try a second link or two, such as one with **Your location** at one end.
5. **View in Telegram** opens a `t.me/iv?url=…&rhash=…` link to check it in Telegram
   yourself. Keep that link to yourself: it's for testing, not for sharing.
6. Click **Submit template** to send it to Telegram for review. Once they approve it,
   every `/trip/…` link on the domain gets an **Instant View** button in Telegram.

## Changing the page

The template reads the page by its markup: `<header>` with the `<h1>`, the
`h2.subtitle` and the `figure.cover`, and `<article id="trip">` as the body. Change one
and change the other, then paste the template in again and check its preview. Telegram
keeps a page's Instant View for a while, so an old trip may show its old look.

Only `/trip/` links get Instant View. A `/go/` link has little to read beyond its
preview, and an `/eta/` link changes every few seconds, which Instant View, kept by
Telegram, wouldn't show.
