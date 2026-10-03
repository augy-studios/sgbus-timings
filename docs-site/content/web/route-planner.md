---
title: Plan a route
description: Find every bus between two stops, or the quickest journeys with a change or a short walk, with live timings for each leg.
---

The route planner answers "which bus gets me from here to there?" Give it a
start and an end, and it lists every bus that runs from one to the other. When
no single bus does, it finds the quickest journeys with up to three changes.

## Set the two ends

<figure>
<img src="/screenshots/web/route-planner-ends.png" alt="The route planner with Start set to Bedok Int (84009) and End set to Serangoon Int (66009), each with a pin button, and the swap button between them." width="994" height="168" loading="lazy">
<figcaption>Start and End, each with a pin for the stops near you, and the swap button between them.</figcaption>
</figure>

1. Tap **Plan a route** under the search box.
2. In **Start**, type a stop's name, its code, or a 6-digit postal code, and pick
   it from the list. Or tap the pin next to the box to pick from the stops near
   you.
3. Do the same in **End**.

The swap button between the two boxes turns the route around.

### Direct buses to the other end

<figure>
<img src="/screenshots/web/route-planner-direct-suggest.png" alt="With Start set to Bedok Int, tampines typed into End: the suggestions say 36 have a bus straight from Bedok Int, listed first, and each tinted stop shows its buses, such as 38 and 69 for Tampines Int." width="970" height="379" loading="lazy">
<figcaption>Once one end is set, the stops with a bus straight to it lead the suggestions, with their buses.</figcaption>
</figure>

Once one end is set, the stops offered for the other do some of the planning for
you. The stops with a bus straight to your end (or, when you're picking the end,
straight from your start) go to the top, tinted green, with their buses shown:

- **Typing a name** in the box: they lead the suggestions, with the buses under
  the stop code and a line above saying how many there are. Every stop matching
  what you typed is checked, so one further down the alphabet still makes the
  top. **Enter** picks the first one shown.
- **The pin, or a postal code**: they lead the list of nearby stops, with
  **Direct: 10, 24** under each name. The line above the list also says when
  none of them has one, so the planner will look for journeys with a change.

Only a bus heading the right way counts, the same rule as the list of buses
below. Among the marked stops, and among the rest, the usual order still holds:
nearest first for nearby stops, best match first for a typed name.

## Buses that run the whole way

<figure>
<img src="/screenshots/web/route-planner-direct.png" alt="The planner from Bedok Int to Tampines Int, saying 2 buses run between these stops, with buttons for 38 and 69." width="994" height="251" loading="lazy">
<figcaption>The buses that run the whole way, as a grid.</figcaption>
</figure>

If one or more buses run from the start to the end without a change, the
planner lists them as a grid, with your favourite buses starred. Only a bus
heading the right way counts: one that calls at your start and then, later on
the same trip, at your end. A loop service counts as far as its interchange,
but not round past it.

Tap a bus to open the start stop's timings for it. The timings say how many
stops the bus has to go to your end, and **Back to route** returns to the
planner.

## Journeys with a change

<figure>
<img src="/screenshots/web/route-planner-journeys.png" alt="From Bedok Int to Serangoon Int, no single bus links the two stops, so the planner lists journeys such as 60 then 45 and 87 then 45, about 34 minutes with 1 change, each saying where to change." width="994" height="632" loading="lazy">
<figcaption>No single bus runs from Bedok Int to Serangoon Int, so the planner offers journeys with a change.</figcaption>
</figure>

When no single bus links the two stops, the planner offers the quickest five
journeys instead. Each one shows:

- the buses in order, such as **60** then **45**;
- roughly how long it takes on the move, and how many changes;
- where to change, and where you get off when that is not your end stop.

A journey can take up to three changes, and can include a walk of up to 200 m:
to a stop across the road at either end, or between two buses. Journeys are
ranked by time riding and walking, plus 6 minutes for each change, so a
slightly longer ride is preferred to an extra change.

At an interchange, terminal or station, a change can also be between any two of its
stops up to 400 m apart, such as Tampines Int and Tampines Stn/Int. The walk is timed
like any other, so a long one is only suggested when it's worth it. If your first bus
goes on into the interchange your next one leaves from, the journey stays on
it, unless getting off at the station's stop and walking is clearly quicker.

> [!NOTE]
> LTA publishes no journey times, so these are estimates from the straight line
> distance between stops: about 15 km/h on a bus and 60 m a minute on foot.
> They are good for comparing journeys, but rough as a clock. They do not count
> the time spent waiting for a bus.

## Open a journey

<figure>
<img src="/screenshots/web/route-planner-journey.png" alt="A journey leg by leg: bus 60 for 2 stops to Blk 45, then bus 45 for 16 stops, each with live timings and a button for its stop, a short walk at the end, and a rough arrival time." width="994" height="699" loading="lazy">
<figcaption>A journey leg by leg, with live timings for each bus and a rough arrival time.</figcaption>
</figure>

Tap a journey to see it leg by leg:

- each bus, how many stops you ride it, and roughly how long;
- any walk, with its distance;
- the live timings of each bus at the stop you board it.

From the second bus on, the planner works out roughly when you would reach that
stop. Buses due before then are struck through, because they will have gone,
and the one you would catch is in bold. At the end it gives a rough arrival
time for the whole journey.

Each leg has a button to open that stop's timings for the bus. Use
**Refresh** to update the live timings, and **Back to route** to return to the
list of journeys. **Start trip** follows you along the journey and buzzes two
stops before each change and the end: see [Get Off Alert](get-off-alert.md).

For a journey that takes a train too, or starts or ends somewhere other than a
bus stop, use [Navigate](nav.md).

## Picked the wrong side of the road?

<figure>
<img src="/screenshots/web/route-planner-wrong-side.png" alt="The planner from Opp Waterfront Waves to Serangoon Int, with a note: Wrong side of the road? The quickest buses for this trip leave from Aft Waterfront Waves, across the road from your start, about 27 m away; and a button, Use Aft Waterfront Waves instead." width="994" height="255" loading="lazy">
<figcaption>The planner spots a start on the wrong side of the road, and offers the stop across it.</figcaption>
</figure>

The two sides of a road are two different bus stops, and a bus only calls at
the one on its side. It is easy to pick the stop your bus does not go your way
from.

When the quickest journey boards or gets off at the stop **across the road**
from one of your ends, and staying where you are would be at least 5 minutes
slower or impossible, the planner says so:

> **Wrong side of the road?** The quickest buses for this trip leave from Opp
> Waterfront Waves, across the road from your start, ~27 m away.

with a button, **Use Opp Waterfront Waves instead**, that swaps the stop in.
When both ends are on the wrong side, the button reads
**Use the stops across the road**. Swap before you save the route, so the one
you save is the right one.

## Save the route

<figure>
<img src="/screenshots/web/route-planner-save.png" alt="The top of the route planner, with a Saved button and a filled star." width="986" height="83" loading="lazy">
<figcaption>Save route turns into Saved.</figcaption>
</figure>

Tap **Save route** to add it to your [favourites](favourites.md). A route is
saved in the direction you set it: Bedok Int to Serangoon Int, and Serangoon Int
to Bedok Int, are two different favourites.

To close the planner, tap the close button at its top right.
