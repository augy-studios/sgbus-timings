---
title: Routes and journeys
description: Use /route to find every bus between two stops, or the quickest journeys with a change, and save the routes you take often.
---

`/route` answers "which bus gets me from here to there?" It works the same way
as the web app's [route planner](../web/route-planner.md), in a chat.

## Build a route

1. Send `/route`. The bot posts a panel with both ends blank, and a
   **Set start** and **Set end** button, and waits for the start.
2. Reply with the start: a stop code, part of a stop's name, or a 6-digit postal
   code. If several stops match, tap the one you meant. You can also **send your
   location** and tap one of the stops nearest you.
3. The panel comes back asking for the end. Answer the same way.

Each answer brings a **new** panel, and the old one loses its buttons, so the
live panel is always the latest. **Set start** and **Set end** stay on it, so
you can change either end later. Send `/cancel` to stop at any point.

### Direct buses to the other end

Once one end is set, the stops offered for the other do some of the planning for
you. Those with a bus straight to your end (or, when you're picking the end,
straight from your start) are ticked, listed first, and name the buses:

> Opp Bedok Stn Exit A (22222) ~85m · 10, 24

with a tick in front of it.

- **A name matching several stops**: the ticked ones lead the **Did you mean**
  list. Every match is checked, so a stop with a direct bus makes the list even
  if it's well down the alphabet.
- **A location or postal code**: the ticked ones lead the list of nearby stops,
  nearest first among themselves.

The message above the buttons says how many there are, or that none of them has
one and the finished route will offer journeys with a change. Only a bus heading
the right way counts, the same rule as the list of buses below.

## Buses that run the whole way

A finished route lists every bus that runs from the start to the end without a
change, as a grid four across, your favourite buses starred and pinned. Only a
bus heading the right way counts: one that calls at your start and then, later
on the same trip, at your end. A loop service counts as far as its
interchange, but not past it.

Tap a bus to open the start stop's timings for it, with all the usual
[buttons](timings.md) and a **Back to route** button to pick a different bus.
The timings also say how many stops the bus has to go to your end.

## Journeys with a change

When no single bus links the two stops, the bot offers the quickest five
journeys instead. Each is listed in the panel, with its buses, where to change
and its time on the move, and has a button of its own.

A journey can take up to three changes, and can include a walk of up to 200 m:
to a stop across the road at either end, or between two buses. They are ranked
by time riding and walking, plus 6 minutes for each change. If no journey links
the stops even with three changes, the bot says so.

Tap a journey to see it leg by leg, with the live timings of each bus at the
stop you board it. From the second bus on, the bot estimates when you would
reach that stop, strikes through the buses due before then, and bolds the one
you would catch. It ends with a rough arrival time for the whole journey.

Each leg has a button to open that stop's timings for the bus, with
**Back to journey** to return.

> [!NOTE]
> LTA publishes no journey times, so rides are estimated at about 15 km/h along
> the straight line between stops, and walks at 60 m a minute. Good for
> comparing journeys; rough as a clock.

## The wrong side of the road

The two sides of a road are two different stops, and a bus only calls at the
one on its side. When the quickest journey boards or gets off at the stop across
the road from one of your ends, and staying put would be at least 5 minutes
slower or impossible, the panel says so:

> Wrong side of the road? The quickest buses for this trip leave from Opp
> Waterfront Waves (84631), across the road from your start, ~27 m away.

Tap **Use Opp Waterfront Waves instead** (or **Use the stops across the road**,
when both ends are wrong) to swap the stop in before you save the route.

## Save a route

Tap **Add favourite** on the panel to star the route. `/myroutes` lists your
starred routes as buttons labelled `Start → End`; tap one to reopen its panel,
with **Back to favourite routes** to return to the list.

A route is saved in the direction you set it, so a route and its reverse are two
separate favourites. To remove one, open it and tap the favourite button again.
