---
title: Your trips and stats
description: Every trip you take with the Get Off Alert, grouped by week, and how your time splits between walking, waiting and riding.
---

Every trip you take with the [Get Off Alert](get-off-alert.md) is kept in
**Your trips**, with your stats under them: how much of your time goes on
walking, waiting and riding, and which buses and trains you take most.

Open it with the bar chart in the Edge Tray.

<figure>
<img src="/screenshots/web/trips-tray.png" alt="The Edge Tray's buttons, with the bar chart for Your trips and the bookmark for Places after the bell for Service alerts." width="44" height="577" loading="lazy">
<figcaption>Your trips is the bar chart; Places, the bookmark under it.</figcaption>
</figure>

## Your trips

<figure>
<img src="/screenshots/web/trips-list.png" alt="Your trips: the week of Mon 5 Oct to Sun 11 Oct with five trips, each with its day and time, a chip for each bus or train, such as 14 then EW, and where it went, such as To Work. An All trips (11) button is under them." width="416" height="572" loading="lazy">
<figcaption>Newest first, grouped by week, Monday to Sunday.</figcaption>
</figure>

Each trip shows when it started, a chip for each bus or train you rode (a train
line with its colour), and where it went. A trip that ended at Home, Work or one
of your [places](places.md) says so: **To Home**.

The five newest show first. **All trips** lists every one.

A trip is kept once you've got on at least one bus or train. One you end before
the first one comes, say started by mistake, isn't. One you end partway keeps the
rides you took.

### A trip's details

<figure>
<img src="/screenshots/web/trips-details.png" alt="A trip opened: bus 14 from Bedok Int to Opp Bedok Stn, waited 4 min and rode 3 min; EW from Bedok to Raffles Place, waited 4 min (planned) and rode 21 min; walked 6 min (planned); about 38 min in all. Plan again, Share and Delete buttons are under it." width="388" height="260" loading="lazy">
<figcaption>Tap a trip for each ride's wait and ride, and what you can do with it.</figcaption>
</figure>

Tap a trip to open it. Each ride shows where you got on and off, how long you
waited and how long you rode.

- **Plan again** opens [Navigate](nav.md) with the same two ends.
- **Share** makes a link to the trip, from where it started to where it ended,
  that opens Navigate with every way there for whoever opens it. See
  [Links you can share](links.md).
- **Delete** removes the trip, and it no longer counts in your stats.

### How the times are worked out

Times marked **(planned)** are the plan's. The rest were measured on the trip:

| Time | Measured as |
|---|---|
| **Waiting** | From when you started the trip, or reached the next ride, to when your location showed you moving with the bus. The walk to the first stop is taken off. |
| **Riding** | From getting on to getting off. A train ride goes from reaching the station to getting off, less the plan's wait. |
| **Walking** | Always the plan's walks: before the first ride and after each one. |

Underground, or with location off, a wait can't be seen, so it's the plan's. A
time far from the plan's, say a trip started an hour before leaving, goes by the
plan too.

## Stats

<figure>
<img src="/screenshots/web/trips-stats.png" alt="Stats: 11 trips and 16 rides since 24 Sept 2026, about 7 hours on the move. Trip Mix: walking 1 hour 15%, waiting 1 hour 18%, riding 5 hours 66%. Trip Modes: MRT 9 rides 56%, SBS Transit 4 rides 25%, Go-Ahead Singapore 2 rides 13%, Tower Transit 1 ride 6%." width="418" height="601" loading="lazy">
<figcaption>Your stats, over every trip kept.</figcaption>
</figure>

- **Trip Mix** is the share of your time spent walking, waiting and riding.
- **Trip Modes** is the share of your rides taken with each bus operator (SBS
  Transit, SMRT, Tower Transit, Go-Ahead Singapore), the MRT and the LRT. Each bus
  or train you got on counts once, however long the ride.

## Where they're kept

Your trips stay in this browser. They aren't sent anywhere, and
[syncing favourites](sync.md) can copy them to another device. **Clear Your
trips**, at the bottom, deletes every one, and your stats with them.

> [!NOTE]
> Only trips started from this version on are kept. Trips taken in the
> [Telegram bot](../bot/start.md) aren't, since it has no Get Off Alert.
