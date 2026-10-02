---
title: Reading bus timings
description: What the times, colours, badges and distances next to each bus mean, in the app and in the bot.
---

Each bus service at a stop shows up to its next three buses. For each bus you
get when it is due, how full it is, what kind of bus it is, whether it takes
wheelchairs, and how far away it is right now.

## When it arrives

The time is how long until the bus reaches the stop. The web app writes it as
`45s`, `3 mins` or `12 mins 20s`; the bot as `45s` or `12m 20s`, and `arr` for a
bus that is arriving now. It counts from the moment the timings were fetched,
so it does not tick down by itself. Refresh to bring it up to date.

LTA works these times out from where the bus is and how traffic is moving. They
can jump around, and two buses of different services can arrive in a different
order from the one shown.

### Times in italics

In the web app, a time in *italics* belongs to a bus that is not sending its
live position. LTA estimates it from the timetable instead, so it is less
certain. Its distance shows as <span class="badge badge-dashed">~ &infin;m</span>,
because there is no position to measure from.

## How full it is

LTA reports one of three loads for each bus.

| LTA code | Web app | Telegram bot | Meaning |
|---|---|---|---|
| `SEA` | Time in <span class="load-ok">green</span> | Seats | Seats available |
| `SDA` | Time in <span class="load-warn">amber</span> | Standing | Standing room only |
| `LSD` | Time in <span class="load-busy">red</span> | Limited | Limited standing room: it is packed |

## The badges

| Badge | Meaning |
|---|---|
| Wheelchair | The bus is wheelchair accessible. LTA calls this `WAB`, and the bot shows it in a row of its own as Yes or No. |
| <span class="badge">Single</span> <span class="badge">Double</span> <span class="badge">Bendy</span> | Single deck, double deck, or a bendy bus. |
| <span class="badge">~ 850m</span> | How far the bus is from the stop, in a straight line, right now. |

## In the web app

A stop's timings list each service as a row: the bus number, the operator, a
**Route** button, then the next three buses side by side with their badges.
Under them is today's first and last bus for that service at that stop, or a
note that it does not run today.

Above the list, the **incoming buses** bar puts the next bus of every service in
one line, soonest first and in the same colours. As the bar itself says, buses
might not arrive in exactly that order.

## In the Telegram bot

The bot sends each service under its own heading, the bus number and its
operator, as a small table with one column per bus:

| | Next 1 | Next 2 | Next 3 |
|---|---|---|---|
| Time | 3m 05s | 11m 40s | 19m 12s |
| Dist | 850m | 3.2km | 6.0km |
| Type | Double | Double | Single |
| Seats | Seats | Standing | Seats |
| WAB | Yes | Yes | No |

Under the table is the first and last bus for today, for weekdays, Saturdays or
Sundays as it happens to be. A service LTA has no buses for says "No arrival
data", and the message ends with the time it was fetched, `Updated 08:14:52`.
If nothing at all is coming, it says no bus services are currently reported
for the stop.
