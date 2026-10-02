---
title: Welcome to SG Bus Timing
description: Live Singapore bus arrivals, bus routes and journeys between any two stops, in your browser and in Telegram.
---

SG Bus Timing tells you when the next bus is coming. Pick a bus stop and you see
every service that calls there, the next three buses for each, how full they
are and how far away. It also shows where a bus goes, and which buses get you
from one stop to another, with a change or two if no single bus does.

It comes in two forms, built on the same live data from LTA:

<div class="cards">
<a class="card-link glass" href="web/install.md"><span class="card-icon" data-icon="globe"></span><span class="card-title">The web app</span><span class="card-text">At sgbus.uwuapps.org. Search, timings, a route planner, favourites and service alert notifications, installable on your phone like an app.</span></a>
<a class="card-link glass" href="bot/start.md"><span class="card-icon" data-icon="send"></span><span class="card-title">The Telegram bot</span><span class="card-text">@UwUsgbus_bot. The same timings in a chat, plus routines and Service Alerts sent to you as they happen.</span></a>
<a class="card-link glass" href="getting-started/reading-timings.md"><span class="card-icon" data-icon="clock"></span><span class="card-title">Reading bus timings</span><span class="card-text">What the colours, badges and distances next to each bus mean.</span></a>
<a class="card-link glass" href="help/troubleshooting.md"><span class="card-icon" data-icon="info"></span><span class="card-title">Troubleshooting</span><span class="card-text">No timings, the wrong stop, location not working, or sync that will not connect.</span></a>
</div>

## What you can do

- **See live arrivals** at any of Singapore's bus stops, by stop name, road,
  5-digit stop code, or the 6-digit postal code of an address nearby.
- **Find the stops near you** from your phone's location.
- **Browse a bus's route** from end to end, or just the stops still ahead of
  you.
- **Plan a route** between two stops: every bus that runs the whole way, or the
  quickest journeys with up to three changes when none does.
- **Save favourites**: bus stops, bus numbers and whole routes, one tap away.
- **Get timings sent to you** at the same time every day, in the Telegram bot.
- **Hear about disruptions**: train service alerts and traffic incidents, as
  notifications on your phone or messages from the bot.

## How this guide is organised

The web app and the bot each have two sections in the sidebar:

- **Basics**: finding a stop or a bus, reading its timings, the stops near you,
  favourites and settings. Everything most people need, a tap or two away.
- **Advanced**: anything that takes more steps, such as narrowing a stop to one
  bus, planning a route, routines, service alerts and syncing.

Start with [Reading bus timings](getting-started/reading-timings.md): it explains
what the colours and badges mean, in both.

## Quick start

### In your browser

1. Open [sgbus.uwuapps.org](https://sgbus.uwuapps.org).
2. Type a stop name such as `Bedok Int`, or a stop code such as `84009`, and
   pick it from the list.
3. Read the next three buses for every service at that stop. Tap **Save** to
   keep the stop in your favourites.

Read more in [Find a bus stop](web/search.md).

### In Telegram

1. Open [@UwUsgbus_bot](https://t.me/UwUsgbus_bot) and tap **Start**.
2. Send it a stop code (`84009`), part of a stop's name (`bedok`), or a bus
   number (`22`).
3. Tap **Refresh** under the timings whenever you want them brought up to date.

Read more in [Start the bot](bot/start.md).

> [!TIP]
> Not sure which to use? Most people use both: the web app to look things up,
> and the bot for a morning routine that sends the timings at their own stop.
> See [Web app or Telegram bot?](getting-started/choosing.md)

## Where the timings come from

Every arrival time, bus stop and route comes from
[LTA DataMall](https://datamall.lta.gov.sg/), the Land Transport Authority's
open data service. Arrival times are fetched live each time you open or refresh
a stop, and are only as good as what the buses report to LTA. A bus that is not
sending its position is shown differently, as
[Reading bus timings](getting-started/reading-timings.md) explains.
