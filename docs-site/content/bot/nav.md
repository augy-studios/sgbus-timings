---
title: Navigate with /nav
description: Get from any place to any other by bus and train, with every worthwhile mix of the two to choose from.
---

`/route` links two bus stops. `/nav` goes further: from any place to any other, by
bus, train or both, including the walk at each end.

## Plan a nav

1. Send `/nav`. The bot asks where you're starting.
2. Reply with an address, a building, a postal code, an MRT or LRT station, or a
   bus stop. If several places match, tap the one you meant under **Did you
   mean**. Or **send your location** instead, or a **Google Maps link**: paste
   one, or share a place from Google Maps to the bot. Short links
   (`maps.app.goo.gl`) work too.
3. It asks where you're going. Answer the same way.

**Set start** and **Set end** stay on the panel, so either end can be
changed later. Send `/cancel` to stop at any point.

### Home and Work

Under them, **🏠 From home**, **💼 From work**, **🏠 To home** and **💼 To work**
set that end to the place saved in `/settings` (see [Settings](settings.md#home-and-work)). One
that isn't saved yet asks for it; once it's saved, tap the button again.

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
disruption on.

> [!NOTE]
> No timetables are published for trains, so train times are estimates from the
> distance between stations, with an average wait to board.

## Open a way

Tap a way to see it leg by leg: each walk, each train with the line, the direction
to take and where to get off, and each bus with the **live timings** of that bus
at the stop you board it. A button with the bus and stop opens that stop's
timings for the bus, with **Back to the way** and **All ways** to come back.
**Back to all ways** returns to the list.

With a time picked, each bus and train says roughly when you'd board it. A way
setting off more than half an hour from now shows those times instead of live
timings, which don't reach that far ahead.

## Save it

Tap **Add favourite** on the panel. `/mynavs` lists your starred navs; tap one
to plan it again. A nav and its reverse are two separate favourites.

## Also on the web

The [web app's Navigate](../web/nav.md) uses the same planner, and can follow you
on the trip with a [Get Off Alert](../web/get-off-alert.md).
