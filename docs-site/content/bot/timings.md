---
title: Timings and their buttons
description: A stop's timings message, the buttons that are always under it, and the way back to where you came from.
---

A stop's timings arrive as one message: the stop's name and code, its road,
then a table for each bus service. [Reading bus timings](../getting-started/reading-timings.md)
explains the table. Under the message are buttons, and they keep working even
after the bot has restarted.

## Always there

| Button | What it does |
|---|---|
| **Add favourite** / **Remove favourite** | Saves the stop to your [favourites](favourites.md), or removes it. |
| **Refresh** | Fetches the latest timings into the same message. |

Your favourite buses are starred in the timings and pinned to the top or bottom
of the list, as you set with `/favouritepref`.

**Select Bus Number**, **All services**, **View route from here** and
**Navigate** are covered in [More from a stop](more-from-a-stop.md).

## Back buttons

How you reached a stop decides how you get back. A back button is always the
last row, so the way out is always in the same place.

| You came from | The button |
|---|---|
| A search with several matches, or a list of stops near you | **Back** |
| A bus number, or a bus in `/favbuses` | **Back to bus stop selection** |
| A bus picked in a route | **Back to route** |
| A leg of a journey | **Back to journey** |

## Stops left to go

Timings opened from a [route or a journey](routes.md) also say how many stops
the bus has left: to the end of your route, or to where you get off that leg,
with the stops left in the whole journey.
