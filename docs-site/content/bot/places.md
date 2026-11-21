---
title: Places with /places
description: Save Home, Work and any other place in the bot, named as you like, to get there or share it, and the buses you'd rather take to each.
---

`/places` lists **Home**, **Work** and any other place you've saved, each with a
name of your own if you like: "Gym", "Mum's". Each one is also a button on the
[/nav](nav.md) and [/route](routes.md) panels: **📍 From Gym**, **📍 To Gym**.

## Save a new place

1. Send `/addplace`, or tap **➕ Save a new place** under `/places`.
2. Send the place: an address, a building, a postal code, an MRT station, a bus
   stop, a Google Maps link, GPS coordinates or a plus code, as in
   [/nav](nav.md#coordinates-and-plus-codes), or tap **📍 Send my location**. If
   more than one place matches, tap the one you meant.
3. Send a name for it, or `/done` to keep calling it what it is.

You can save up to 30 places, besides Home and Work.

## Use a place

Tap a place in `/places` to open it:

| Button | What it does |
|---|---|
| **🧭 Get me there** | A [/nav](nav.md) panel with the place as the end, asking where you're starting from. Send your location, or a place. |
| **🔗 Share** | A "How to get to" link: whoever opens it gets the web app's Navigate with the place in To, from wherever they are. **📤 Send to a chat** passes it on. |
| **✏️ Rename** | Send a new name. (Not for Home or Work.) |
| **📌 Move** | Send where it is now. |
| **🚌 Buses to take here** | Send the buses you'd rather take there. See [below](#buses-to-take-there). |
| **🗑 Delete** | Removes it. For Home or Work, **🗑 Clear** unsets it. |

> [!WARNING]
> Anyone with a place's link can see where it is, and place links don't expire.

## Buses to take there

Tap **🚌 Buses to take here** on a place and reply with the buses you'd rather take
there, such as `228` for the bus that stops by your home. Going to within 400 m of
the place, [/nav](nav.md#sort-the-ways) tags a way on one as **⭐ Your bus** and puts
it first when sorting by **Best**. They stay with the place when it moves, and
**🗑 Clear buses** removes them. The web app keeps its own, on each of its
[places](../web/places.md#buses-you-like-to-take-there); [/sync](sync.md) doesn't
copy them yet.

## Home and Work

Home and Work are always listed first. Until one is set, tapping it asks for it,
the same as `/sethome`, `/setwork` or **Set home** and **Set work** in
[/settings](settings.md#home-and-work).

The [web app's Places](../web/places.md) are kept in your browser. To copy places
between the two, use [/sync](sync.md).
