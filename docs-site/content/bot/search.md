---
title: Search for a stop or bus
description: Type a stop code, a name, a road, a bus number or a postal code, and the bot works out which you meant.
---

Anything you send the bot that is not a command, and not the answer to a
question it has just asked, is treated as a search.

## What it understands

- **A bus stop code**, always exactly 5 digits, such as `84009`, opens that
  stop's timings.
- **A bus number**, such as `22`, `971E` or `NR7`, opens the
  [stops along its route](bus-routes.md). The bot checks it against LTA's live
  list of services, so anything that is not a real bus is searched as a name
  instead.
- **Part of a stop's name or road**, such as `bedok` or `changi`, finds the
  matching stops.
- **A 6-digit postal code**, such as `519599`, lists the stops nearest that
  address. See [Stops near you](nearby.md#stops-near-an-address).

A stop code is always 5 digits and a bus number is always shorter, so the bot
never has to ask which one you meant.

## One match or several

If only one stop matches, its timings open straight away. If several do, the
bot replies **Did you mean:** with a button for each, your favourite stops
starred. Tap the one you meant.

Stops that share a name say which part of Singapore they're in, so the stops
called Blk 111 read **Blk 111 (84229) · Bedok**, **Blk 111 (65029) · Sengkang**
and so on. Where two of the same name are in one area, the button gives the road
instead.

## Going back to the list

Timings opened from a list of matches have a **Back** button as their last row.
It puts the same list back on screen, so you can pick a different stop without
searching again. The way back survives refreshing, favouriting, and narrowing
the timings to one bus.

> [!TIP]
> Searching from another chat, without opening the bot? Use
> [inline mode](inline.md): type `@UwUsgbus_bot bedok` in any chat.
