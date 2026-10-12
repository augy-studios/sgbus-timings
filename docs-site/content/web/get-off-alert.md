---
title: Get Off Alert
description: The site follows you on a trip and buzzes two stops before you get off or change.
---

Dozing on the bus, or deep in your phone on the train? Start a trip and the site
follows your live location along it, from the walk to your first stop to the walk
at the end, then alerts you **two stops before** each change and your stop.

The Get Off Alert is on by default. Every trip you take with it is kept in
[Your trips](trips.md), with your stats.

## Start a trip

<figure>
<img src="/screenshots/web/get-off-alert-timeline.png" alt="The trip bar opened into its timeline: bus 60's stops in a column with a blue line filled up to a blue dot between the second and third stops, Alert marked two stops before the end, and Get off at the last stop." width="720" height="373" loading="lazy">
<figcaption>Tap the trip bar to see the stops ahead, with a blue dot where you are.</figcaption>
</figure>

Any of these starts one:

- **Navigate**: open a way, then tap **Start trip**. See
  [Navigate by bus and train](nav.md).
- **Plan a route**: open a journey, then tap **Start trip**. See
  [Plan a route](route-planner.md#open-a-journey).
- **A bus's route**: open the route, tap **Get Off Alert**, then tap the stop
  you're getting off at. See [Bus routes](bus-routes.md).

A bar along the bottom of the screen shows where you are: the bus or line, how
many stops are left, and which part of the journey you're on (each ride and
each walk is a part). The first time, the
browser asks for your location and for notifications; allow both.

Tap the bar to open the timeline: every stop still ahead, with a blue dot where
you are that glides along between stops as you go, the stop the alert goes off at,
and where to get off or change. Tap it again to close it. The map button on the
bar shows the trip on the [live map](live-map.md).

Tap a bus stop on the timeline to see that stop's timings for your bus: the
timeline closes and the page scrolls down to them, with the trip still running.

## Walks

A trip from [Navigate](nav.md) starts with the walk to your first stop, has the
walks between rides, and ends with the walk to where you're going. Each shows on
the timeline as **Walk to** where it ends, with about how long is left. The trip
moves on to the ride when you reach its stop, and on to the next walk when you
get off. Without your location, it goes by how long each walk should take.

There's no alert on a walk. The trip ends when you reach where you're going.

## The alert

<figure>
<img src="/screenshots/web/get-off-alert-timeline-alert.png" alt="The trip bar lit up green, its timeline showing the blue dot at the stop marked Alert, and the status Get off in 2 stops, at Christ Ch." width="720" height="373" loading="lazy">
<figcaption>Two stops before you get off, the bar lights up and says so.</figcaption>
</figure>

Two stops before you get off, the phone:

- **buzzes "OFF" in Morse code** (– – –  · · – ·  · · – ·), rather than one long
  vibration;
- **beeps** three times;
- shows a **notification**, "Get off in 2 stops, at Bedok Int";
- and the trip bar lights up with the same.

At a change, the trip moves on to the next part by itself once you're near its
first stop, or once you're on the next bus even if it never saw you reach the
stop. **Next** moves it on by hand, and **Back** takes it back to the part
before: where you'd got to on it, or its start if you'd finished it, with its
alert ready to go off again. Your location then puts you where you really are.
**End trip** stops it.

## Waiting for the bus

You can start a trip while you wait at the stop.

### Get ready to board

While you wait at the stop for a bus on your trip, the site keeps an eye on its
live timing there. When it's **1 minute away**, the phone buzzes twice and shows
a notification, "Bus 174 is 1 min away from Tampines Int. Get ready to board.",
and the trip bar says the same. It comes once for each bus on the trip, and only
while you're still waiting: once your location shows you on the bus, it doesn't.
With the site in the background, the server sends it instead, as it does the
alert.
 On a bus, the trip stays at the
stop you get on at until your location shows you moving along the bus's route,
so waiting, even a long while inside an interchange, never counts as riding.
Only then does it count the stops down.

It follows the road the bus actually takes, not a straight line from stop to
stop, so a long stretch with no stops, like an expressway, still moves the dot
along and counts the stops you pass. You count as on the bus once you're within
100 m of its road and moving along it away from your stop, or once you reach a
later stop on its route.

If the trip ever has you somewhere you aren't, say a few stops ahead while
you're still at the interchange, it notices from your location and moves back
to where you are. An alert that went off too early goes off again at the right
stop.

## In the Android app

In the [Android app](android-app.md), the trip carries on with the screen off or
the app in the background: the app keeps your location coming, shows "On a
trip" in a notification with **End trip** on it, and the alert sounds over the
lock screen. The screen doesn't need to stay on. Swiping the app away ends that,
and the server takes over as below.

## Keep the site open

<figure>
<img src="/screenshots/web/get-off-alert-keep-open.png" alt="The trip bar along the bottom of the screen: Bus 60 to Blk 133, 3 stops to Blk 133, with an End trip button." width="720" height="62" loading="lazy">
<figcaption>The trip bar while a trip runs.</figcaption>
</figure>

A website only gets your location while it's open on screen, and no setting
changes that. So while a trip runs in a browser, the site keeps the screen awake. See
[What the web app can't do](../help/web-app-limits.md).

If you switch to another app or lock the phone, SG Bus Timings' server takes over
as long as you've allowed notifications. It follows your bus using LTA's live bus
positions, and sends the alert as a notification. For trains it goes by the
expected ride time. It's less exact than your own location: LTA's positions are a
minute or so behind, so the alert can come a little early or late. When you come
back, the site picks up where you are again.

Underground, where there's no GPS, it goes by the clock instead: how long the ride
should take, stop by stop, counted from the last place it was sure of. The trip
bar says when it's doing that. On a bus it only does so once it has seen you
riding.

> [!TIP]
> On iPhone, add the app to your Home Screen first: notifications only work from
> there. See [Open and install the app](install.md).

## Turn it off

<figure>
<img src="/screenshots/web/get-off-alert-turn-off.png" alt="Settings showing Get Off Alert on a trip, with On and Off buttons, On chosen." width="420" height="165" loading="lazy">
<figcaption>The Get Off Alert switch in Settings.</figcaption>
</figure>

Open **Settings** and set **Get Off Alert on a trip** to **Off**. Trips still show
how many stops are left; only the alerts stop.
