---
title: Stops near you
description: Send your location, or a postal code, to find the nearest bus stops.
---

## Stops near your location

Send the bot your location, from Telegram's attachment menu, and it replies with
up to 8 bus stops near you as buttons. Each button shows the stop's name, its
code and how far away it is. Tap one for its timings.

`/nearme` does the same, with a **Share my location** button so you do not need
to find the attachment menu. Any location you send gets the same answer,
whether or not you used `/nearme` first.

The stops are sorted by distance, with your favourite stops pinned to the top
(or bottom, if you have set that with `/favouritepref`). The timings a stop
opens have a **Back** button returning to the list.

> [!NOTE]
> On Telegram Desktop and Telegram Web you may not be able to send your
> location. Send a postal code instead.

## Stops near an address

Send a 6-digit Singapore postal code, such as `519599`, as a message. The bot
looks the address up with OneMap, Singapore's official map, and lists the stops
nearest it the same way.

Postal codes and locations also work when [building a route](routes.md): they
list the nearby stops, and tapping one sets that end of the route rather than
opening its timings.
