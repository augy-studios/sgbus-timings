---
title: Live map
description: Walking directions to a stop or place on a live map that follows you, your trip on a map, and following a trip someone shared with you.
---

The live map shows where you are, with the buildings in 3D, and follows you as
you go. It opens three ways, and as [Explorer](explorer.md), with every stop and
station to tap, from its own button in the Edge Tray.

## Walk to a stop or place

<figure>
<img src="/screenshots/web/live-map-walk.png" alt="The live map close in on Bedok North Street 1, drawn by OpenFreeMap with its shops and bus stops: a blue dot where you are, the walk ahead in blue, Walk to Bedok Int with 480 m, 6 min and the arrival time at the top, the next turn along the bottom, and the compass and overview buttons on the right." width="400" height="820" loading="lazy">
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
<img src="/screenshots/web/live-map-overview.png" alt="The overview of the walk: the whole route in blue from Bedok North Street 1 down Bedok North Drive to Bedok Int, ending at a pink pin by Bedok Mall, with the compass, overview and follow-me buttons on the right." width="400" height="820" loading="lazy">
<figcaption>Overview fits the whole walk on the screen.</figcaption>
</figure>

The map opens as close in as it goes, on you, and follows you as you walk. To
see the whole way at once, tap the overview button (the route, on the right). The
target button under it brings the map back in close, following you.

## Turn the map with you

The compass button, above the overview button, turns the map so the way your
phone points is up, the way a map app's compass mode does. The map stays on
you, and its needle keeps pointing north. Tap it again to put north back at the
top; the overview button does too.

- It uses the phone's compass. On an iPhone, the first tap asks to use motion
  and orientation; allow it.
- Without a compass, such as on a computer, it turns the way you're moving
  once you start walking.
- While it's on, the map can't be dragged, as it's kept on you. Pinch or
  double-tap to zoom.

It's there on your own walk or trip, not on someone else's shared trip.

## Buildings in 3D

<figure>
<img src="/screenshots/web/live-map-3d.png" alt="The live map tilted on Bedok North Street 1: the blocks along the street standing up in grey 3D, the walk ahead in blue along the road, and Walk to Bedok Int, 480 m at the top." width="400" height="820" loading="lazy">
<figcaption>Two fingers dragged up the screen tilt the map, and the buildings stand up.</figcaption>
</figure>

Drag two fingers up the screen to tilt the map, and down again to flatten it.
Close in, the buildings stand up in 3D, which helps tell which block is which.
Twist two fingers to turn the map yourself; the compass button's needle follows
north. The overview button puts it flat and north up again.

### The map itself

The map is [OpenFreeMap](https://openfreemap.org)'s, made from OpenStreetMap,
drawn on the phone. If OpenFreeMap can't be reached, the map changes to
OpenStreetMap's own tiles, flat, for the rest of that visit. On a phone or
browser that can't draw it (no WebGL), it's OpenStreetMap's flat map, without
3D or the compass button.

Everything the map loads is kept on the phone: the map itself, and every part
of Singapore you've looked at. A place you've seen before comes up at once,
even with no signal underground.

## Your trip on a map

<figure>
<img src="/screenshots/web/live-map-trip.png" alt="The overview of a trip from Bedok to ION Orchard: the East-West Line in green from Bedok to City Hall with a dot for each station, the North-South Line in red on to Orchard, and a pink pin at the end, with To ION Orchard, 28 min left at the top and Walk to the first bus stop, about 2 min, part 1 of 5 at the bottom." width="400" height="820" loading="lazy">
<figcaption>A trip's overview: each line in its own colour, with its stops.</figcaption>
</figure>

While a trip runs, tap the map button on the trip bar. The map shows the whole
trip: each ride in its own colour with its stops, each walk as a dotted line,
where you change, and where it ends, with you on it. On a walk, the streets to
take are drawn too. A train ride follows its line's track, the way
[sgraildata](https://github.com/cheeaun/sgraildata) maps it, from the station
you board at to the one you get off at, and underground, where there's no GPS,
your dot moves along the track too.

Tap a stop or station on the trip for its card: a stop's buses, or a station's
doors for each platform, as in [Explorer](explorer.md).

## Follow someone's trip

<figure>
<img src="/screenshots/web/live-map-shared.png" alt="Sam's trip, as a friend sees it: an orange dot on Bedok North Street 1 with Sam's route in orange, Arriving in 31 min at the top, and Bus 69: 1 stop to Bedok Interchange at the bottom." width="400" height="820" loading="lazy">
<figcaption>A shared trip, with your friend's dot moving along it.</figcaption>
</figure>

When someone shares their ETA with you, their link opens **Live progress**. Tap
**Follow on the map** to see their dot move along their trip, or read the
timeline under the arrival time: their stops ahead, with **Here** where they
are. Both update every 10 seconds. Their train rides follow the track too, and
underground their dot moves along it.

## Moving around the map

Drag or pinch to look around. The map stops following you while you do; the
target button brings it back in close, on you. The back arrow, or your phone's Back
button, closes the map.

## Offline and data

Every bit of map you've seen is kept on your device, so a place looked at before
opens at once, even offline. Map tiles are small, but the first look at a new
area uses some data.

Somewhere with a weak signal, like underground, parts of the map that didn't load
are fetched again once the signal's back.
