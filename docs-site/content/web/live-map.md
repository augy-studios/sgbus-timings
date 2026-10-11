---
title: Live map
description: Walking directions to a stop or place on a live map that follows you, your trip on a map, and following a trip someone shared with you.
---

The live map shows where you are on OpenStreetMap, and follows you as you go. It
opens three ways.

## Walk to a stop or place

<figure>
<img src="/screenshots/web/live-map-walk.png" alt="The live map close in on Bedok North Street 1: a blue dot where you are on the street, the walk ahead in blue, Walk to Bedok Int with 860 m, 11 min and the arrival time at the top, In 80 m: Turn left along the bottom, and the overview button on the right." width="400" height="820" loading="lazy">
<figcaption>The map opens close in on you, with the next turn along the bottom.</figcaption>
</figure>

- On a stop's timings, tap **Directions**, then **Live map**.
- In [Navigate](nav.md), on a walk in the way you've opened, tap **Directions**,
  then **Live map**.
- From the [Telegram bot](../bot/more-from-a-stop.md#directions-to-the-stop): a
  stop's **Directions** > **Live map** opens it here.

The map draws the walk there from where you are, along the streets, and the bar
along the bottom says the next turn ("In 80 m: Turn left onto Bedok North Road").
At the top: how far is left, how long it takes, and when you'll get there. Go
another way and it finds the way from where you are after a few steps. When you
arrive, it says so.

The first time, the browser asks for your location: allow it. Without it, the map
still shows the stop, but can't follow you.

**Citymapper**, beside **Live map**, opens the same walk in Citymapper instead.

## See the whole way

<figure>
<img src="/screenshots/web/live-map-overview.png" alt="The overview of the walk: the whole route in blue from Bedok North Street 1 down past the library to Bedok Int, ending at a pink pin by Bedok Mall, with the overview button and, under it, the button to go back to following you." width="400" height="820" loading="lazy">
<figcaption>Overview fits the whole walk on the screen.</figcaption>
</figure>

The map opens as close in as it goes, on you, and follows you as you walk. To
see the whole way at once, tap the overview button (the route, on the right). The
target button under it brings the map back in close, following you.

## Your trip on a map

<figure>
<img src="/screenshots/web/live-map-trip.png" alt="The overview of a trip from Bedok to ION Orchard: the East-West Line in green from Bedok to City Hall with a dot for each station, the North-South Line in red on to Orchard, and a pink pin at the end, with To ION Orchard, 28 min left at the top and Walk to the first bus stop, about 2 min, leg 1 of 5 at the bottom." width="400" height="820" loading="lazy">
<figcaption>A trip's overview: each line in its own colour, with its stops.</figcaption>
</figure>

While a trip runs, tap the map button on the trip bar. The map shows the whole
trip: each ride in its own colour with its stops, each walk as a dotted line,
where you change, and where it ends, with you on it. On a walk, the streets to
take are drawn too.

## Follow someone's trip

<figure>
<img src="/screenshots/web/live-map-shared.png" alt="Sam's trip, as a friend sees it: an orange dot on Bedok North Street 1 with Sam's route in orange, Arriving in 31 min at the top, and Bus 69: 1 stop to Bedok Interchange at the bottom." width="400" height="820" loading="lazy">
<figcaption>A shared trip, with your friend's dot moving along it.</figcaption>
</figure>

When someone shares their ETA with you, their link opens **Live progress**. Tap
**Follow on the map** to see their dot move along their trip, or read the
timeline under the arrival time: their stops ahead, with **Here** where they
are. Both update every 10 seconds.

## Moving around the map

Drag or pinch to look around. The map stops following you while you do; the
target button brings it back in close, on you. The back arrow, or your phone's Back
button, closes the map.

## Offline and data

Every bit of map you've seen is kept on your device, so a place looked at before
opens at once, even offline. Map tiles are small, but the first look at a new
area uses some data.

If OpenStreetMap's maps won't load, it switches to OneMap's, Singapore's official
map, for the rest of the visit.
