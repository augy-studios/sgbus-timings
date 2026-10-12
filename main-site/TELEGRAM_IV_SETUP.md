# Telegram Instant View setup

Every share link can open in Telegram's **Instant View**, read right in Telegram with
its map and a link on to the app:

- a place (`/go/…`, from **Share start** or **Share end**): where it is;
- directions (`/trip/…`, from **Share these directions** or Your trips' **Share this
  trip**): the trip's ends and its time;
- live progress (`/eta/…`, from **Share my ETA**): where they're going, when they'll
  get there and where they are, as of when Telegram read it.

The page is ready for it already ([`api/share-page.js`](api/share-page.js)). Telegram
also needs a template that says how to read it,
[`telegram-instant-view.txt`](telegram-instant-view.txt), and shows Instant View for
plain links only once it has approved that template. Share always sends the
plain link, never a `t.me/iv` one, so nothing changes in the app until then.

1. Share some directions from the web app, and copy its `/trip/…` link. Copy a `/go/…`
   link and an `/eta/…` link too.
2. Open [instantview.telegram.org](https://instantview.telegram.org/) and log in with
   your Telegram account.
3. Open **My templates**, and enter the link from step 1. That opens the template editor
   for `sgbus.uwuapps.org`.
4. Replace the rules on the left with the whole of
   [`telegram-instant-view.txt`](telegram-instant-view.txt). The preview on the right
   should show the trip's title, its map, and a list of From, To and When, with no errors.
   Try a second link or two, such as one with **Your location** at one end, then the
   `/go/…` link (the place) and the `/eta/…` link (Going to, Arriving around, As of).
5. **View in Telegram** opens a `t.me/iv?url=…&rhash=…` link to check it in Telegram
   yourself. Keep that link to yourself: it's for testing, not for sharing.
6. Click **Submit template** to send it to Telegram for review. Once they approve it,
   every `/go/…`, `/trip/…` and `/eta/…` link on the domain gets an **Instant View**
   button in Telegram.

## Changing the page

The template reads the page by its markup: `<header>` with the `<h1>`, the
`h2.subtitle` and the `figure.cover`, and the `<article>` as the body (its id is the
link's path: `go`, `trip` or `eta`). Change one and change the other, then paste the
template in again and check its preview. Telegram keeps a page's Instant View for a while,
so an old link may show its old look.

An `/eta/` link changes as its sharer goes, but Telegram keeps the Instant View it made,
so the page says what time it's from ("As of …") and points people to the app to follow
along live. Someone opening it again later may still see the earlier one.
