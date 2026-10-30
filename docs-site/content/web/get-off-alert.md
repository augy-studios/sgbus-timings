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
- **Navigate by bus only**: open a journey, then tap **Start trip**. See
  [Navigate by bus only](route-planner.md#open-a-journey).
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

On a phone, a trip to Tuas or Woodlands Checkpoint, or across the Causeway, has
a **MyICA** button on the bar, for ICA's MyICA Mobile app and its immigration QR
code. It opens the app's Play Store or App Store page, which says **Open** once
it's installed; in the [Android app](android-app.md#simplygo-sharing-and-links)
it opens MyICA itself.

A ride across the Causeway is followed in three parts: to Woodlands Checkpoint,
across to the Johor Bahru checkpoint, and on (or the other way round), so the alert
tells you to get off at each checkpoint for immigration, as everyone does. The time
to clear counts as the wait before you get on again: see
[Immigration time](settings.md).

Tap a bus stop on the timeline to see that stop's timings for your bus: the
timeline closes and the page scrolls down to them, with the trip still running.

While you wait at the stop for a bus, the bar also lists the other buses that go
straight to the same stop, with how long each is: **Also direct: 51 in 3 min**.
Any of them gets you there without a change. The timeline lists them under each
bus ride too, and a stop tapped on it shows their timings there with your bus's,
for those that call at it. The trip still shows the stops of the bus you planned.

## Walks

A trip from [Navigate](nav.md) starts with the walk to your first stop, has the
walks between rides, and ends with the walk to where you're going. Each shows on
the timeline as **Walk to** where it ends, with about how long is left. The trip
moves on to the ride when you reach its stop, and on to the next walk when you
get off. Without your location, it goes by how long each walk should take.

### Walking or riding

The trip also uses your phone's motion sensor (its accelerometer) to
tell walking from riding, by the rhythm of your steps. It knows you're walking
within a few steps, so:

- Walking along a bus's route to your stop, past another stop on it, never counts
  as being on the bus.
- Once you've stopped walking, being 100 m down the next bus's route after a walk
  is enough to put you on that bus, even if the trip never saw you reach the stop.
- Getting off a bus near your stop, your first few steps end the ride and start
  the walk.
- On a walk with no GPS, it goes by the steps you take, not the clock, so waiting
  at a crossing doesn't walk you on.

On an iPhone, the site asks to use motion and orientation when you start a trip.
Without the sensor, or if you say no, the trip works as it did before.

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
along and counts the stops you pass. You count as on the bus once you're
150 m down its route from your stop and not walking, or once you reach a later
stop on its route.

If the trip ever has you somewhere you aren't, say a few stops ahead while
you're still at the interchange, it notices from your location and moves back
to where you are. An alert that went off too early goes off again at the right
stop.

### Last bus soon

<figure>
<img src="/screenshots/web/trip-last-bus.png" alt="The trip bar with a red warning across its top: Last bus soon: Bus 38's last from Bedok Int is at 01:48. Under it, To Our Tampines Hub, Bus 38: 28 stops to Tampines Int, part 2 of 3, about 45 min left." width="366" height="182" loading="lazy">
<figcaption>A red warning when a bus on the trip is down to its last few.</figcaption>
</figure>

The trip keeps an eye on the last bus of the day for every bus on it you've
still to get on, at the stop you get on at, by its timetable and its live
timings: late at night, or on a bus that only runs at peak hours. The trip bar
shows a red warning when:

| Warning | When |
|---|---|
| **Last bus soon: Bus 21's last from Bedok Int is at 00:18.** | It's down to its last three buses, as a red pill on [Explorer](explorer.md)'s stop cards. |
| **Bus 59's last bus from Blk 390 is at 23:54, before you'll get there.** | A bus you change to later leaves for the last time before the trip gets you to its stop. |
| **Bus 21's last bus from Bedok Int has gone (00:18).** | Its last bus has passed and none is coming. |

The first warning for each bus also buzzes twice and comes as a notification.
Once you're on that bus, its warning goes.

### Another way, found for you

<figure>
<img src="/screenshots/web/trip-switched.png" alt="The trip bar with a green note at the top: Switched to another way. Bus 38's last bus from Bedok Int has gone. Now: walk 4 min to Bedok station, take the EW Line there. EW Line, about 23 min, there by 01:45. Undo and OK buttons under it, and the trip now on the EW Line, 3 stops to Tampines station." width="366" height="265" loading="lazy">
<figcaption>Switched to another way by itself, with why, what to do now, and Undo.</figcaption>
</figure>

When a last bus is lost, there's nothing to look up or decide: the trip finds
another way by bus and train to where you're going, leaving out that bus, and
switches to it straight away. The phone buzzes twice, a notification says why
and what to do first, and the trip bar says it too:

> Switched to another way. Bus 59's last bus from Blk 390 is at 23:54, before
> you'll get there. Now: after Bus 21 to Blk 390, walk 3 min to Opp Blk 5, take
> Bus 12 there.

It keeps your trip as far as it still works: up to where the ride before the
lost bus ends, planned for when you'll get there. So waiting for bus 21 with bus
59's last bus lost at Blk 390, you still take bus 21, and the way goes on from
Blk 390. With no ride before it, or nothing running from there by then, the way
starts where you are instead.

**OK** puts the note away. **Undo** puts the trip back as it was, and it isn't
switched again for that bus. The red warning stays, with the way it found under
it:

| Button | What it does |
|---|---|
| **Reroute** | Makes it your trip after that point after all, alerts and all. What comes before it stays as it was, and **Undo** is there again. |
| **Navigate from here** | With your location on: [Navigate](nav.md), from where you are to where you're going, with every way to pick from. |
| **See all ways** | With your location off, in its place: Navigate from where the way starts. |

When nothing else is running either, the warning says so, with the same
buttons. It looks again every few minutes while the warning stands, as what's
running thins out.

### Change here

<figure>
<img src="/screenshots/web/trip-change-timeline.png" alt="The trip bar opened into its timeline after Change my way: Tap Change here by the stop to get off at, with Cancel, then bus 38 to Tampines Int, Bedok Int with the blue dot, and Panasonic, Fujitec S'pore Ltd, Blk 18 and more stops, each with a Change here button on the right." width="366" height="546" loading="lazy">
<figcaption>After Change my way: Change here by every stop still ahead.</figcaption>
</figure>

<figure>
<img src="/screenshots/web/trip-change-ways.png" alt="The trip bar after Change here at Tanah Merah Stn Exit 2: the EW Line, about 19 min, there by 01:44, walk 2 min to Tanah Merah station, take the EW Line there, then See all ways and Cancel." width="366" height="264" loading="lazy">
<figcaption>The ways on from that stop, each with what to do first.</figcaption>
</figure>

To get off somewhere else and change to another bus or train, open the timeline
and tap **Change my way** at its top. Only then does **Change here** show by
every stop still ahead, so a stray tap on the timeline changes nothing;
**Cancel** puts them away. Tap **Change here** by the stop you want, and the bar
lists the ways on from there to where you're going, quickest first, each with
what to do first. **Cancel** keeps the trip as it was.

Tap one and the trip changes from there: the ride you're on ends at that stop,
the Get Off Alert goes off before it, and the new rides follow. The bar says
what changed, with **Undo** to put the trip back as it was, if it was a slip,
and **OK** to put the note away.

### Back to Navigate

<figure>
<img src="/screenshots/web/trip-back-nav-timeline.png" alt="The trip bar opened into its timeline, with Change my way and Back to Navigate side by side at the top, then bus 38 to Tampines Int with the blue dot at Bedok Int and the stops ahead." width="366" height="546" loading="lazy">
<figcaption>Back to Navigate, beside Change my way.</figcaption>
</figure>

<figure>
<img src="/screenshots/web/trip-back-nav.png" alt="Navigate opened again over the page: from Bedok Mall to Our Tampines Hub, Leave now, the bus 38 way open with Start trip, its walk, bus 38's 28 stops with its next buses in 3 and 14 mins, and the trip bar still at the bottom." width="390" height="1500" loading="lazy">
<figcaption>Navigate as the trip was started from it, the trip still running below.</figcaption>
</figure>

A trip started from [Navigate](nav.md) has **Back to Navigate** beside
**Change my way**, at the top of the timeline. It opens Navigate as it was when
you started: the same start, end and stop on the way, with the way you picked
open, on Bus and train or Bus only, whichever it was. Navigate opens over the
page while the trip carries on, and it's the same screen however the trip has
changed since. A time you picked that has passed is left out, so it plans for
now.

<figure>
<img src="/screenshots/web/trip-changed.png" alt="The trip bar after a way was picked: a green note, Changed at Tanah Merah Stn Exit 2. Now: walk 2 min to Tanah Merah station, take the EW Line there, with Undo and OK, and the trip now bus 38 for 8 stops to Tanah Merah Stn Exit 2, part 2 of 5." width="366" height="262" loading="lazy">
<figcaption>The trip changed, with Undo in case it was a slip.</figcaption>
</figure>

## Traffic and faster ways

### Traffic on the way

<figure>
<img src="/screenshots/web/trip-traffic.png" alt="The trip bar with an orange box at the top: Bus 38 about 6 min slower than usual: heavy traffic on Tampines Avenue 7 and Bedok North Road. Vehicle breakdown on Tampines Avenue 7 (towards Tampines Avenue 5). See it on the map. The trip below has about 61 min left." width="366" height="225" loading="lazy">
<figcaption>A bus slowed by traffic: by how much, and why.</figcaption>
</figure>

Every five minutes, each bus on the trip still ahead is checked against LTA's
live traffic: how fast every road on its way is moving, and any accident,
breakdown or roadworks on it. Its minutes, and so the minutes left for the whole
trip, go by it, stop by stop.

When the traffic makes a bus 2 minutes or more slower than usual, or an
incident is on its way, an orange box on the trip bar says by how much and why,
naming the roads. Tap it for that bus's road on the [live
map](live-map.md#traffic-on-a-buss-way): orange where it's slow, red where it's
jammed, and the incident marked.

### A faster way

<figure>
<img src="/screenshots/web/trip-faster.png" alt="The trip bar with the orange traffic box, then: Faster: EW Line, about 23 min, there by 01:47. Saves 38 min, as Bus 38 is slowed by traffic on Tampines Avenue 7 and Bedok North Road. Walk 4 min to Bedok station, take the EW Line there. With Reroute and Keep my way buttons." width="366" height="365" loading="lazy">
<figcaption>A faster way, with how much it saves and why.</figcaption>
</figure>

Every few minutes, the trip plans again from where you are: from where you're
standing while you wait or walk, or from the next stop while you're on a bus or
train. If another way would get you there at least 5 minutes sooner, and a
real share of the time left, the bar suggests it, with why: your bus slowed by
traffic, or a long wait for it. Its first bus counts by its live timing, so it's
one you can catch.

Walking the rest of the way counts too, and with **Cycling** set to **I have a
bike** in [Settings](settings.md), cycling it, with a couple of minutes for the
bike.

**Reroute** makes it your trip from there, alerts and all: on a ride, you get off
at that next stop. The bar then says what changed, with **Undo**. **Keep my way** puts the suggestion away for 15 minutes,
unless something comes along that saves more again. A notification says it once
too.

## In the Android app

In the [Android app](android-app.md), the trip carries on with the screen off or
the app in the background: the app keeps your location coming, shows "On a
trip" in a notification with **End trip** on it, and the alert sounds over the
lock screen. The screen doesn't need to stay on. Swiping the app away ends that,
and the server takes over as below. Opening the app again picks the trip back up
where it is, as long as it was still going in the last 3 hours.

While the trip bar is up, every page scrolls a little further, so the end of it,
such as a bus's first and last bus, comes up clear of the bar.

The trip bar and the notification both end with the minutes left to the end of
the whole trip, such as **· ~42 min left**, counted the same way as a
[shared ETA](nav.md#share-my-eta): what's left of this part, and each part after it with
its wait. While you wait at the stop for a bus, the wait is its live timing
there, so a bus 16 minutes away adds its 16 minutes to the ride.

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
