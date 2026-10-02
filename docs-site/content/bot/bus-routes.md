---
title: Bus routes
description: Send a bus number to see where it goes and every stop it calls at, in both directions.
---

Send a bus number, such as `22`, or tap a bus in `/favbuses`, and the bot
replies with that bus's route.

## Where it runs

The top of the message says where the bus starts and ends:

- `Pasir Ris Int → Changi Airport`, with `(and back)` when it runs the other
  way too;
- or, for a loop service, that it starts and ends at the same place, and where
  it turns around.

Under that, a line traces the route through its landmarks, so you can see where
it goes at a glance:

```text
Pasir Ris Int → Tampines Stn → Kallang Stn → Farrer Pk Stn → ...
```

Landmarks are the interchanges, bus terminals, MRT and LRT stations, and
hospitals along the way, in the order the bus reaches them. Each is named as the
place rather than the stop, so `Opp Tampines Stn/Int` and `Tampines Stn Exit B`
both read as `Tampines Stn`. A long route is thinned to about ten landmarks,
always keeping both ends.

## The stops

The stops follow as buttons, a page at a time. Your favourite stops on the
route get pages of their own first (or last, if you pin favourites to the
bottom), so the stops you use are a tap away even on a long route. The pages
after them list the whole route in order, with your favourites starred in their
proper places.

Use the **Prev** and **Next** buttons to turn pages. See
[Lists, flows and cancelling](flows.md#paginated-lists).

## Swap directions

A bus that runs both ways has a **Swap Directions** button under the pages. It
turns the route around: the stops list the other direction, and the lines at
the top describe it instead. It starts again from the first page. Loop services
only run one way, so they do not have the button.

## Open a stop

Tap a stop to see its timings for this bus only. From there:

- **All services** widens to every bus at the stop, and **Collapse view**
  narrows back.
- [**View route from here**](more-from-a-stop.md#view-route-from-here) shows
  the stops still ahead.
- **Back to bus stop selection** returns to this list, on the same page and in
  the same direction you left it.
