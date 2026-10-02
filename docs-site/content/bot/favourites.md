---
title: Favourites
description: Save bus stops, bus numbers and routes, and choose whether they pin to the top or bottom.
---

The bot keeps three kinds of favourite. They are saved against your Telegram
account, so they are the same on every device you use Telegram on.

## Favourite bus stops

- **Save one**: tap **Add favourite** under a stop's timings.
- **See them**: send `/favstops` for a button per stop. Tap one for its timings.
- **Remove one**: tap **Remove favourite** under its timings, or send
  `/unfavstop` and tap the stop to remove.

Favourite stops are starred and pinned in lists of stops: search results, stops
near you, and the stops on a bus's route.

## Favourite buses

1. Send `/addfavbus`.
2. Send bus numbers, as many as you like, separated by spaces or commas and
   across as many messages as you like: `22 25, 30`. Each one is checked against
   LTA's list of services and confirmed as saved.
3. Send `/done` when you have finished.

`/favbuses` lists your favourite buses as buttons; tap one to browse
[the stops it serves](bus-routes.md). `/unfavbus` lists them for removal.

A favourite bus is starred wherever it appears: in every stop's timings, in the
[**Select Bus Number**](more-from-a-stop.md#pick-one-bus-select-bus-number) grid, and in route results. In timings it is also pinned
to the top of the list, or the bottom.

## Favourite routes

Tap **Add favourite** on a [route](routes.md) panel. `/myroutes` lists them.

## Top or bottom

Send `/favouritepref` to choose where favourites are pinned. It has a page for
favourite buses and a page for favourite bus stops, each with a **Top** and a
**Bottom** button; the current choice is marked. Favourite routes have no
setting of their own.

`/settings` shows both choices alongside your favourite buses and stops.
