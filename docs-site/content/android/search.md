---
title: Find a bus stop
description: Search by name, road, stop code, bus number or postal code, say it, scan it, or let the app find the stops near you.
---

**Bus timings**, the clock in the Edge Tray, has the search box at the top and the
stops near you under it.

## What you can type

<figure>
<img src="/screenshots/android/search.png" alt="Bus timings with orchard typed into the search box, a cross, a microphone and a camera at its right end, and under it matching stops such as YMCA, Dhoby Ghaut Stn and Orchard Plaza, each with its code and road." width="412" height="892" loading="lazy">
<figcaption>Matches come up as you type. Tap one for its timings.</figcaption>
</figure>

| Type this | Example | What happens |
|---|---|---|
| A stop's name | `Orchard`, `Bedok Int` | Lists the matching stops |
| A road | `Tampines Ave 4` | Lists the stops along it |
| A stop's name and its road | `Blk 109 Bedok` | Lists the Blk 109s on a road with Bedok in its name |
| A 5-digit stop code | `84009` | Press enter to open that stop |
| A stop code and some buses | `84009 174`, `84009 174, 175`, `84009 22*` | Press enter to open that stop, narrowed to those buses |
| A bus number | `22`, `NR7`, `971E` | Offers [that bus's route](bus-routes.md) |
| A 6-digit postal code | `519599` | Offers **Bus stops near this postal code** |
| An MRT or LRT station | `Bedok MRT`, `Senja LRT` | Lists the stops at its exits |
| A shuttle bus route | `A1`, `CL-B`, `M2` | Offers [that shuttle's route](#shuttle-buses) |
| A shuttle bus stop | `PGP`, `IKEA` | Offers its shuttle times |

Tap a match to open it. Pressing enter on your keyboard opens the best match. The
cross clears the box.

Words can come in any order, from the stop's name or its road. Each word matches
the start of a word, so `109` doesn't find Blk 1090.

LTA shortens a lot of words in stop and road names: **Bt** for Bukit, **W'lands**
for Woodlands, **Opp** for Opposite, **Ctr** and **Ctrl** for Centre and Central.
Type either the full word or the short one, and the search finds both.

> [!TIP]
> The stop code is printed on the pole at every bus stop, and never changes. Better
> still, [save the stop as a favourite](favourites.md).

### Shuttle buses

Shuttle buses come up as you type too: a route by its code, such as `A1` for NUS's,
and a stop only shuttles use by its name, marked **Shuttle buses only**. A stop opens
with its [shuttle times](timings.md#shuttle-buses). A route opens on a screen of its
own, with what its timetable says now and its stops in order.

## Say it, or scan it

The search box has two more buttons:

- The **microphone**: say a stop, its code or a bus. It uses Android's own speech
  screen, so SG Bus Timings itself never hears you.
- The **camera**: point it at the 5-digit code on a bus stop's pole, and that stop's
  timings open. The text is read on your phone, by Google's ML Kit; nothing is sent
  anywhere.

## Your past searches

<figure>
<img src="/screenshots/android/search-recents.png" alt="Bus timings with the search box tapped and empty: a clock tab, picked, and a star tab, then Bedok Int and Bus 196 under 24 hours, Tampines Int under Earlier, each with a three-dot menu, and Clear all." width="412" height="892" loading="lazy">
<figcaption>Tap into the box, before typing, for what you searched before.</figcaption>
</figure>

Tap into the box before you type for your [past searches](past-searches.md). The
star tab beside them has your favourite stops and buses.

## Stops near me

<figure>
<img src="/screenshots/android/timings.png" alt="Bus timings: Good Morning, Sam!, the search box, then Stops near me with a refresh button, and eight stops, nearest first, from Bedok Int at 33 m to Opp Blk 3 at 430 m, each with its road and code, favourites starred." width="412" height="892" loading="lazy">
<figcaption>The stops round you, nearest first. Favourite stops are starred.</figcaption>
</figure>

**Stops near me** lists the stops around you, nearest first, each with how far away
it is. Tap one for its timings; **Back to nearby stops** at the top brings the list
back.

The first time, tap **Show stops near me**, and allow location on Android's prompt.
After that the list fills in by itself each time you open Bus timings. The button at
its top right looks again after you've moved.

If your phone's Location is turned off, the app asks to turn it on with one tap,
then carries on. Without Google Play services, it opens Android's Location settings
instead.

Your location is only used on your phone to measure the distance to each stop. If
nothing happens, see
[Location does not work](../help/troubleshooting.md#location-does-not-work).

## Stops near an address

Type a 6-digit postal code, such as `519599`, and tap **Bus stops near this postal
code**. The app looks the address up with OneMap, Singapore's official map, and
lists the stops nearest it, in a sheet titled with the address it found.

## Narrow a stop to some buses

Add bus numbers after the stop code: `84009 174`, or `84009 174, 175` for a few. A
star takes every bus starting with those numbers: `84009 22*` shows 222, 225G, 228
and the rest of the 22s. You can also do this once a stop is open, with
[Pick a bus](timings.md#pick-a-bus).
