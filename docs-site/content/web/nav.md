---
title: Navigate by bus and train
description: Get from any place to any other by bus and train, with every worthwhile mix of the two to choose from.
---

**Plan a route** links two bus stops. **Navigate** goes further: from any place
to any other, by bus, train or both, including the walk at each end.

## Set where you're going

<figure>
<img src="/screenshots/web/nav-set-suggest.png" alt="Navigate with Bedok Mall typed into From, and suggestions for places, stations and stops dropping down below it." width="994" height="284" loading="lazy">
<figcaption>Type a place, an address, a station or a stop, and pick it from the suggestions.</figcaption>
</figure>

1. Tap **Navigate**, the arrowhead in the Edge Tray.
2. In **From**, type an address, a building, a postal code, an MRT or LRT
   station, or a bus stop, and pick it from the suggestions. Or tap the pin next
   to the box to start from where you are.
3. Do the same in **To**.

The swap button between the two boxes turns the journey around.

### From a Google Maps link

Either box also takes a Google Maps link: paste one in, and once it's read the
place is set as that end, named as Google Maps names it. Short links
(`maps.app.goo.gl`) work as well as full ones.

With the app installed on Android, you can also share a place to it. In Google
Maps, or on a Google Maps link in another app such as Telegram, tap **Share** and
pick **SG Bus Timings**. Navigate opens with the place in **To**; tap the pin by
**From** to go there from where you are.

A link to somewhere outside Singapore, or one with no place in it, says so under
the box.

## Pick a time

Under the boxes, **Leave now** is picked to start with. Tap **Leave at** or
**Arrive by** to plan for another time instead, then pick the day (today or any of
the next six) and the time.

- **Leave at** lists each way with the time you'd set off and roughly when you'd
  get in, as **08:30 → 09:05**.
- **Arrive by** lists each way with the time you'd have to set off to get in by
  then. A way you'd have had to leave on already says **Too late**.

Only buses and trains running at that time are used, for Leave now as well: a
bus counts as running between its first and last bus at that stop, for that day
of the week, with public holidays counted as Sundays, and trains between about
5:30am (6am on Sundays and public holidays) and midnight. A bus that's stopped
for the night, or only runs on weekdays, isn't offered on a Sunday.

Navigate goes back to **Leave now** each time it's opened, including from a saved
nav.

## The ways there

<figure>
<img src="/screenshots/web/nav-ways.png" alt="Navigate from Bedok Mall to Botanic Gardens station listing 8 ways, quickest first: trains on the EW and DT lines, buses, and mixes of the two, each with its changes, walk and time." width="994" height="800" loading="lazy">
<figcaption>Every worthwhile mix of bus and train, quickest first.</figcaption>
</figure>

Navigate lists the ways to get there, quickest first. It doesn't stop at the
fastest: it keeps the best journey for every mix of bus and train, up to four
vehicles, so a train then two buses, or two trains then a bus, is there to
compare. A mix that's clearly slower than another of the same kind, and no
better in changes or walking, is left out as a detour.

A change can be a short walk to another stop or station, or, at an interchange,
terminal or station, a walk of up to 400 m across it, such as Tampines Int to
Tampines Stn/Int. Every walk is timed, so a long one only shows up when it's worth
it. Staying on a bus into the interchange your next bus leaves from is
preferred over getting off early and walking, unless walking is clearly quicker.

Each way shows:

- its trains and buses in order, each train line marked in its colour;
- roughly how long it takes, door to door, walking and waiting included;
- how many changes, and how far you walk;
- **OneMap ~42 min**, where OneMap's timetable-based planner rides the same way,
  as a second opinion on the time;
- a warning when LTA reports a disruption on one of its lines.

> [!NOTE]
> No timetables are published for trains, so train times are estimates from the
> distance between stations, with an average wait to board. OneMap's time, where
> shown, comes from timetables.

## Open a way

<figure>
<img src="/screenshots/web/nav-open.png" alt="One way from Bedok Mall to Botanic Gardens station, leg by leg: the walks, each train with its line, direction and stops, and the buttons All ways, Refresh and Start trip." width="994" height="668" loading="lazy">
<figcaption>A way leg by leg, with Start trip for the Get Off Alert.</figcaption>
</figure>

Tap a way to see it leg by leg:

- **Walks**, with the distance and roughly how long. **Directions** opens the
  walk in Google Maps (as walking directions) or Citymapper.
- **Trains**, with the line, the direction to take (**towards** its last
  station), how many stops, and where to get off.
- **Buses**, with how many stops, where to get off, and the **live timings** of
  that bus at the stop you board it. A button opens that stop's timings for the
  bus.

With a time picked, each bus and train also says roughly when you'd board it. Live
timings only reach about half an hour ahead, so for a way setting off later than
that, each bus says when you'd board it instead, counting an average wait, and its
live timings show up from half an hour before you set off.

**All ways** goes back to the list, and **Refresh** beside it updates the way's
live bus timings.

**Refresh** at the top of the card, there once both ends are set, plans the ways
again, with any new disruptions and the time now. With a way open, it updates that
way's live timings too.

**Start trip** follows you along the way and buzzes two stops before each change
and the end: see [Get Off Alert](get-off-alert.md).

## Save it

<figure>
<img src="/screenshots/web/nav-save.png" alt="The top of Navigate, with Refresh, Share, and a Saved button with a filled star." width="986" height="75" loading="lazy">
<figcaption>Save nav turns into Saved.</figcaption>
</figure>

Tap **Save nav** to add it to your [favourites](favourites.md), under **Navs**.
Like routes, a nav and its reverse are two separate favourites.

A saved nav doesn't keep a time.

## Share it

Tap **Share** at the top of Navigate to send someone a link to it. On a phone it
opens your share sheet; on a computer it copies the link. It works whether both
ends are set, one, or neither, and keeps the time if you picked one.

An end set to **Your location** isn't sent as where you are: it becomes the
location of whoever opens the link. Share a nav from your location to the
Botanic Gardens, and your friend gets one from where they are to the Botanic
Gardens.

The address of the page changes to the nav too, so you can also bookmark it.

## Also in Telegram

The [Telegram bot](../bot/nav.md)'s `/nav` asks the same planner, so it finds the
same ways.
