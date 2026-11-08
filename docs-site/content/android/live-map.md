---
title: Live map
description: The Android app's live map: walking, cycling and driving directions, your trip, traffic on a bus's way, and someone's shared trip, with buildings in 3D.
---

The live map shows where you are, and follows you as you go. It's drawn by the app over
OpenFreeMap's map, with buildings that stand up in 3D when you tilt it. It fills the whole screen,
and your phone's **Back** or its back arrow closes it.

## Walk to a stop or place

<figure>
<img src="/screenshots/android/map-walk.png" alt="A walk on the live map: a bar at the top saying Walk to Blk 27, 680 m, 8 min, arrive 08:38, the route as a blue line from your dot to the end, and a bar along the bottom saying In 60 m: Right." width="412" height="892" loading="lazy">
<figcaption>A walk, with how far and how long at the top, and the next turn at the foot.</figcaption>
</figure>

- On a stop's [timings](timings.md), tap **Directions**.
- In [Navigate](nav.md), on a walk in the way you've opened, tap **Live map**.
- In Navigate, under the ways, tap **Walk it**, **Cycle it** or **Drive it**, for the way on foot,
  by bike or by car.

The map draws the way there from where you are, along the streets, and the bar along the bottom says
the next turn. At the top: how far is left, how long it takes, and when you'll get there. Go another
way, and it finds the way from where you are. **Cycle it** and **Drive it** show how fast you're
going too.

A walk takes footpaths, through estates, void decks and linkways, as well as pavements. Where they stop
short of the place, the last stretch goes along the road, and a note says how much of it. It never goes
along an expressway.

The first time, Android asks for your location: allow it. Without it, the map still shows where you're
going, but can't follow you.

## Off the route

Leave the route on a walk, a ride or a drive, and after a few steps the app finds the way from where you are,
in the map and on a trip's walking, cycling or driving parts alike. A drive goes by which way you're heading,
so it carries on from the road you're on, such as the KPE, rather than a street above it.

## In a tunnel, or with weak GPS

When the GPS stops, as it does in the KPE and MCE tunnels, your dot keeps going along your route, paler, and
the bar at the foot says **No GPS here, so this is an estimate.** The next turn, the distance and the arrival
time keep going with it. As soon as the GPS is back, your dot goes to where you really are, and the app finds
a new way if you've left the route.

The estimate starts from how fast you were going. The phone's accelerometer then tells when you've stopped, as
in a jam, and when you pull away, and allows for braking once it's learned which way the phone faces. It's only
ever an estimate, and it runs while the app is open. It never says you've arrived, and it never sets off a
[Get Off Alert](get-off-alert.md). Trains follow their track by the time each ride should take.

## Move the map

- **Drag** with one finger, or two going the same way, to move it. That stops it following you.
- **Pinch** to zoom, and **twist** two fingers to turn it. Neither stops it following you.
- The **target button** comes back to you and follows again.

While it follows you, your dot stays in the middle of the screen, and its arrow turns with your phone's
compass.

### Tilt and turn it

Hold **the button with the four arrows**, beside the side buttons, and drag it: up and down tilt the map,
and left and right turn it. Close in, the buildings stand up in 3D, which helps tell which block is
which. It doesn't stop the map following you. Tap the compass in the corner to put north back at the top.

### Turn the map with you

The **compass button** turns the map so the way your phone points is up. Tap it again to put north back.
It's there on your own walk or trip, not on someone else's shared trip.

### See the whole way

**Show the whole route**, the corners button, shows the whole way at once.

## Your trip on a map

While a [trip](get-off-alert.md) runs, open its screen from the trip bar, and tap the map button at the
top. The map shows the whole trip: each ride in its own colour with its stops, each walk along the streets
to take, where you change, and where it ends, with you on it. A bus ride follows the roads the bus takes,
and a train ride its line's track, and underground your dot moves along it by the time each ride should
take.

Tap a stop or station on the trip for its card, as in [Explorer](explorer.md).

## Traffic on a bus's way

<figure>
<img src="/screenshots/android/map-traffic.png" alt="Traffic on bus 14's way out of Bedok: its road orange where slow and green where clear, its stops as dots, and Slow in places on New Upper Changi Road and Bedok North Street 1." width="412" height="892" loading="lazy">
<figcaption>The traffic on a bus's way, from LTA's live speeds.</figcaption>
</figure>

Wherever the app says a bus is slowed by traffic, in [Navigate](nav.md) or on a
[trip](get-off-alert.md#traffic-and-faster-ways), tap **See it on the map** for why: the bus's road,
coloured by LTA's live speeds. Once the speeds are in, the map closes in on the
slow and jammed stretches and any accidents or breakdowns.

- **Green**: moving freely.
- **Orange**: slow.
- **Red**: jammed.

Accidents, breakdowns and roadworks on its way are red dots: tap one for what LTA says about it. Along the
bottom, the map says which roads are slowest, and how long ago LTA's traffic was updated.

## Follow someone's trip

When someone shares their ETA with you, their link opens **Live progress**: when they'll arrive, which bus
or train they're on, and their stops ahead, updating by itself. **Live map** shows their dot moving along
their trip, and **Directions there** plans your own way to where they're going.

## Offline

The map keeps what you look at. For all of Singapore, right down to street level with the buildings in 3D,
save it from [Explorer](explorer.md#save-the-map-for-offline).

## In a small window

Leave the app with the live map open, and it shrinks into a small window over your other apps. See
[Picture-in-picture](picture-in-picture.md).
