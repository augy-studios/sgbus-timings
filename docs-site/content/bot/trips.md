---
title: Live trips
description: Start a trip from /nav and get a live card of when you'll arrive, a Get Off Alert, and a link others can follow.
---

A live trip is a card in your chat with the bot that keeps itself up to date
while you travel. Share it, and whoever opens the link gets the same card in
their own chat with the bot, updated at the same moment as yours.

<figure>
<img src="/screenshots/bot/trip-widget.png" alt="A live trip card: Your trip to One Raffles Place, 24 min, arriving around a time, a bar of four parts with the first done and the second lit, Bus 28 to Paya Lebar Stn Exit D (81111), 6 stops left, now, Part 2 of 4, and when it was updated." width="400" height="197" loading="lazy">
<figcaption>Your trip, live. The bar has one piece for each part of the way.</figcaption>
</figure>

## Start a trip

1. Plan the way with `/nav` ([Navigate with /nav](nav.md)) and tap the way you're taking.
2. Tap **▶️ Start trip**. It's there for a way that sets off now or soon, and has
   a bus or a train in it.

The card shows:

- **When you'll arrive**, in minutes and around what time. Tap the minutes to
  see the time instead, and tap again to switch back.
- **The trip's parts**, as a bar: done, the one you're on (lit), and the ones
  still to come. Tap a part to see where it goes; tap it again to go back to the
  part you're on.
- **The part you're on**: the bus, train or walk, where it goes, and the stops
  left.
- **When it was last updated.** If it's been more than five minutes, it says
  when it last heard instead.

The trip moves on by itself, minute by minute: by the clock, and by where LTA
says your bus is.

### Get Off Alert

Two stops before you get off a bus or train, the bot sends
**🔔 Get off in 2 stops, at Paya Lebar Stn Exit D**, with **to change** when
there's another ride after it, and **Get off now** at the stop itself.

### End it

Tap **🏁 End trip** under the card. A trip also ends by itself when you get to
the end. Starting another trip ends the one you're on. Send `/trip` to see your
trip's card again.

## Share it

Tap **📤 Share this trip** and pick a chat. The message has two links:

| Link | Opens |
|---|---|
| `t.me/sgbus_app?start=eta_…` | The same live card, in their own chat with the bot |
| `sgbus.uwuapps.org/eta/…` | Your [live progress](../web/nav.md#share-my-eta) in the web app, for anyone not on Telegram |

When you arrive, everyone following gets **🏁 Sam has arrived at One Raffles
Place.** The name is the one the bot calls you by, from
`/setname` (see [Settings](settings.md)).

## Follow someone's trip

Open the `t.me/sgbus_app?start=eta_…` link they sent, or tap
**Follow in Telegram** on a trip someone shares from the
[web app](../web/nav.md#share-my-eta), and tap **Start** if the bot asks. Their
card arrives in your chat with the bot, with:

- **🗺 Follow on the map**, their trip on the web app's live map.
- **🔄 Refresh**, to check now rather than wait.
- **✖️ Stop following**, to stop getting their trip. The card stays as it was.

## Good to know

- Live cards are Telegram widgets, so they need an up-to-date Telegram app. They
  work in your own chat with the bot, not in groups, and can't be forwarded: share
  the link instead.
- Everything on the card is there for anyone with the link, until the trip ends.
  The web link stops working three hours after its last update.
