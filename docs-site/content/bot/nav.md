---
title: Navigate with /nav
description: Get from any place to any other by bus and train, with every worthwhile mix of the two to choose from.
---

`/route` links two bus stops. `/nav` goes further: from any place to any other, by
bus, train or both, including the walk at each end.

## Plan a nav

1. Send `/nav`. The bot asks where you're starting.
2. Reply with an address, a building, a postal code, an MRT or LRT station, a
   bus stop, GPS coordinates or a plus code. If several places match, tap the
   one you meant under **Did you mean**. Or **send your location** instead, or a
   **Google Maps link**: paste one, or share a place from Google Maps to the
   bot. Short links (`maps.app.goo.gl`) work too.
3. It asks where you're going. Answer the same way.

**Set start** and **Set end** stay on the panel, so either end can be
changed later. Send `/cancel` to stop at any point.

### Did you mean

Each place under **Did you mean** carries what tells it apart: a bus stop's
number and road (**🚌 Blk 109 · 84221 · Bedok Nth Rd**), a station's line codes, a
building's address.

A bus stop is found however you'd [search](search.md) for it: the words in any
order, across the stop's name and its road, and the long forms of LTA's short
ones, **Block** for Blk, **Jalan** for Jln. So `block 29 bahagia` finds Blk 29 on
Jln Bahagia.

### Coordinates and plus codes

Either end can be a point on the map, set as soon as it's sent:

- **GPS coordinates**, latitude then longitude: `1.35, 103.85`, or
  `1.35N 103.85E`.
- **A plus code**, the code Google Maps shows for a place without an address,
  whole (`6PH57RQ8+X2`) or short (`7RQ8+X2`, or `7RQ8+X2 Singapore` as Google
  Maps copies it).

A point outside Singapore and the stops across the Causeway gets a message
saying so.

### Home, Work and your places

Under them, **🏠 From home**, **💼 From work**, **🏠 To home** and **💼 To work**
set that end to your home or work, saved with `/sethome` and `/setwork`, in
`/settings` (see [Settings](settings.md#home-and-work)) or in `/places`. One that
isn't saved yet asks for it; once it's saved, tap the button again.

Every other place saved in [/places](places.md) follows as a button too, such as
**📍 From Gym** and **📍 To Gym**.

## Pick a time

The panel starts at **🕒 Leave now**. Tap it, then **Leave at…** or **Arrive
by…**, and send the time: `8:30`, `8.30pm` or `2030`, or with a day, `tmr 8am` or
`sat 9:15`, up to a week ahead. A time with no day that has already passed today
means tomorrow. Or tap one of **In 15 min**, **In 30 min**, **In 1 h** or **In 2
h**. **Leave now** on the same menu goes back.

With a time picked, each way shows when you'd set off and get in, as **08:30 →
09:05**; for Arrive by, a way you'd have had to leave on already says **too
late**.

Only buses and trains running at that time are used, for Leave now as well: a bus
counts as running between its first and last bus at that stop, for that day of
the week, with public holidays counted as Sundays, and trains between about
5:30am (6am on Sundays and public holidays) and midnight.

A new `/nav`, and a nav opened from `/mynavs`, starts at Leave now again.

## The ways there

The panel lists the ways to get there, quickest first, each as a line and a
button:

> 1. ~35 min · EW → 25 · 1 change, 111 m walk

It doesn't stop at the fastest: it keeps the best journey for every mix of bus and
train, up to four vehicles, so a train then two buses, or two trains then a bus, is
there to compare. A mix that's clearly slower than another of the same kind, and
no better in changes or walking, is left out as a detour.

Where OneMap's timetable-based planner rides the same way, its time is shown too,
as **OneMap ~42 min**. A warning sign marks a way on a line LTA reports a
disruption on, ⏰ a bus you'd catch near its last of the day (**⏰ last 38
23:48**), and 🚦 a bus slowed by the traffic right now (**🚦 38 +6 min in
traffic**).

Setting off now, bus times allow for the traffic right now, from LTA's live
speeds on every road. Under the ways, **🚶 Walk there** says how long walking the
whole way takes, where it might compete, and **🚲 Cycle there** how long cycling
takes, once you've said you have a bike in [Settings](settings.md#cycling).

> [!NOTE]
> No timetables are published for trains, so train times are estimates from the
> distance between stations, with an average wait to board.

## Open a way

Tap a way to see it part by part: each walk, each train with the line, the direction
to take and where to get off, and each bus with the **live timings** of that bus
at the stop you board it. A button with the bus and stop opens that stop's
timings for the bus, with **Back to the way** and **All ways** to come back.
**Back to all ways** returns to the list.

A bus near its last of the day says when the last one is. A bus slowed by
traffic says by how much and why, the roads by name and any accident or
breakdown on its way:

> 🚦 ~6 min slower than usual: heavy traffic on Tampines Avenue 7. Vehicle
> breakdown on Tampines Avenue 7 (towards Tampines Avenue 5).

Its **🗺 Traffic on 38's way** button opens the bus's road on the web app's [live
map](../web/live-map.md#traffic-on-a-buss-way), orange where it's slow and red
where it's jammed.

With a time picked, each bus and train says roughly when you'd board it. A way
setting off more than half an hour from now shows those times instead of live
timings, which don't reach that far ahead.

A way across the Causeway to Johor Bahru, or back, has a 🛂 step after its bus:
get off at the checkpoint, clear immigration on both sides, then get on again.
Its time counts about 15 minutes when it's quiet and up to an hour at the rush,
by when you'd get there, as on the [web](../web/nav.md#across-the-causeway).

## Save it

Tap **Add favourite** on the panel. `/mynavs` lists your starred navs; tap one
to plan it again. A nav and its reverse are two separate favourites.

## Also on the web

The [web app's Navigate](../web/nav.md) uses the same planner, and can follow you
on the trip with a [Get Off Alert](../web/get-off-alert.md).
