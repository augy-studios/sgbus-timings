---
title: Get Off Alert
description: The site follows you on a trip and buzzes two stops before you get off or change.
---

Dozing on the bus, or deep in your phone on the train? Start a trip and the site
follows your live location along it, then alerts you **two stops before** each
change and your stop.

The Get Off Alert is on by default.

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
many stops are left, and which leg of the journey you're on. The first time, the
browser asks for your location and for notifications; allow both.

Tap the bar to open the timeline: every stop still ahead, with a blue dot where
you are that glides along between stops as you go, the stop the alert goes off at,
and where to get off or change. Tap it again to close it.

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

At a change, the trip moves on to the next leg by itself once you're near its
first stop. **Next leg** moves it on by hand, and **End trip** stops it.

## Keep the site open

<figure>
<img src="/screenshots/web/get-off-alert-keep-open.png" alt="The trip bar along the bottom of the screen: Bus 60 to Blk 133, 3 stops to Blk 133, with an End trip button." width="720" height="62" loading="lazy">
<figcaption>The trip bar while a trip runs.</figcaption>
</figure>

A website only gets your location while it's open on screen. So while a trip
runs, the site keeps the screen awake.

If you switch to another app or lock the phone, SG Bus Timings' server takes over
as long as you've allowed notifications. It follows your bus using LTA's live bus
positions, and sends the alert as a notification. For trains it goes by the
expected ride time. It's less exact than your own location: LTA's positions are a
minute or so behind, so the alert can come a little early or late. When you come
back, the site picks up where you are again.

Underground, where there's no GPS, it goes by the clock instead: how long the ride
should take, stop by stop. The trip bar says when it's doing that.

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
