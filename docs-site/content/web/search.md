---
title: Find a bus stop
description: Search by stop name, road, stop code, bus number or postal code, or let the app find the stops near you.
---

Everything starts with the search box at the top of the app. Type, pick a
suggestion, and the stop's timings open underneath.

## What you can type

<figure>
<img src="/screenshots/web/search-type.png" alt="The search box with orchard typed in, and a list of matching stops dropping down beneath it, each with its code, name and road." width="996" height="362" loading="lazy">
<figcaption>Typing a name lists the matching stops as you go. Tap one to open its timings.</figcaption>
</figure>

| Type this | Example | What happens |
|---|---|---|
| A stop's name | `Orchard`, `Bedok Int` | Lists the matching stops to pick from |
| A road | `Tampines Ave 4` | Lists the stops along it |
| A stop's name and its road | `Blk 109 Bedok` | Lists the Blk 109s on a road with Bedok in its name |
| A 5-digit stop code | `84009` | Opens that stop straight away |
| A stop code and a bus | `84009 174` | Opens that stop narrowed to bus 174 |
| A stop code and some buses | `84009 174, 175`, `84009 22*` | Opens that stop narrowed to those buses |
| A bus number | `22`, `NR7`, `971E` | Opens [that bus's route](bus-routes.md) |
| A 6-digit postal code | `519599` | Lists the 8 stops nearest that address |
| An MRT or LRT station | `Bedok MRT`, `Senja LRT` | Lists the stops at its exits |
| A shuttle bus route | `A1`, `CL-B`, `M2` | Opens [that shuttle's route](#shuttle-buses) |
| A shuttle bus stop | `PGP`, `IKEA` | Opens its shuttle times |

As you type, a list drops down with matching buses first, then up to 20
matching stops. Tap one to open it, or press **Enter** or tap **Get Timings** to
open the best match.

### Several words

Words can come in any order, and from the stop's name or its road, so
`blk 109 bedok` and `bedok blk 109` both find Blk 109 on Bedok Nth Rd and on
Bedok Nth Ave 3, out of every Blk 109 in Singapore. Each word matches the start
of a word, and whole words other than the last, which you may still be typing,
so `109` doesn't find Blk 1090. Stops matching what you typed exactly, in one
piece, still come first.

### Shortened names

LTA shortens a lot of words in stop and road names: **Bt** for Bukit, **W'lands**
for Woodlands, **Opp** for Opposite, **Ctr** and **Ctrl** for Centre and
Central. Type either the full word or the short one and the search finds both,
so `Bukit Batok` finds Bt Batok Int and `Opposite Block 10` finds Opp Blk 10.
When some of the stops were only found that way, a line above them says so,
such as **Also searched Bt for Bukit**.

### MRT and LRT stations

LTA names the stops at a station "Bedok Stn", or after a block or a road, never
"MRT". Type the station with **MRT**, **LRT** or **station** after it, such as
`Bedok MRT`, `Senja LRT` or `Botanic Gardens station`, and the list is the stops
within about 250 m of its exits, nearest first, with how far each one is.
**Enter** opens them as a list to pick from.

> [!TIP]
> The stop code is printed on the pole at every bus stop, and never changes.
> Once you know the code of a stop you use often, typing it is the quickest way
> in. Better still, [save it as a favourite](favourites.md).

### Shuttle buses

<figure>
<img src="/screenshots/web/search-shuttles.png" alt="The search box with ikea typed in, and under it IKEA's three shuttle stops: IKEA Tampines, Tampines Stn Exit B and Serangoon Stn Exit E, each marked IKEA and Shuttle buses only." width="342" height="302" loading="lazy">
<figcaption>Shuttle stops come up by name as you type.</figcaption>
</figure>

Shuttle buses come up as you type too: a route by its code, such as `A1` for
NUS's or `CL-B` for NTU's, and a stop only shuttles use by its name, such as
`PGP` or `IKEA Tampines`. A stop opens with its
[shuttle times](timings.md#shuttle-buses). A route opens in a window of its
own: what its timetable says now, and its stops in order. Tap a stop for its
times.

<figure>
<img src="/screenshots/web/shuttle-route.png" alt="NUS shuttle A1 in a window of its own: every 4–6 min till 23:00, a note that shuttle times are from the timetable and live where the operator shares them, then its stops in order from Kent Ridge Ter, through LT 13, AS 5, BIZ 2 and PGP to Kent Ridge Stn Exit A/NUH and on to Ctrl Lib, and a note that it is a loop." width="396" height="808" loading="lazy">
<figcaption>A shuttle's route: its timetable now, and its stops in order.</figcaption>
</figure>

## Say it, or scan it

<figure>
<img src="/screenshots/web/search-voice-scan.png" alt="The search box with 84009 typed in, and a microphone and a camera button at its right end, beside Get Timings." width="310" height="48" loading="lazy">
<figcaption>The microphone, and in the Android app the camera.</figcaption>
</figure>

Hands full? The **microphone** in the search box searches by voice: say a stop's
name, its code ("eight four zero zero nine") or a bus ("bus twenty-two"). It's
there in the [Android app](android-app.md#search-by-voice-and-scan-a-stop), and
in browsers that can listen, such as Chrome, which asks to use the microphone.

In the Android app, the **camera** beside it reads the code off a stop's pole:
point it at the 5-digit number and the stop opens.

## Stops near me

<figure>
<img src="/screenshots/web/search-near-me.png" alt="The Stops near me card on Bus timings: Bedok Int, starred as a favourite, then Bedok Stn Exit B, Bedok Stn Exit A, Aft Heartbeat @ Bedok and more, each with its road, its distance in metres and its stop code, and a refresh button at the top." width="362" height="462" loading="lazy">
<figcaption>The 8 nearest stops, with how far away each one is. Favourite stops are starred.</figcaption>
</figure>

**Stops near me** is a card on **Bus timings**, under the search box, while no
stop's timings are open. It lists the 8 nearest stops, each with how far away
it is. Tap one for its timings in the card's place; **Back to nearby stops** at their
top brings the list back.

<figure>
<img src="/screenshots/web/search-near-me-ask.png" alt="The Stops near me card before it may use your location: The bus stops around you, nearest first, and a Show stops near me button." width="362" height="153" loading="lazy">
<figcaption>Until the app may use your location, the card asks first.</figcaption>
</figure>

The first time, tap **Show stops near me**: your browser asks whether the app
may use your location; allow it. After that, the card finds the stops round you
by itself each time you open Bus timings. The refresh button at its top right
looks again, after you've moved.

Your location is only used in your browser to measure the distance to each
stop. It is not sent anywhere. If nothing happens, see
[Location does not work](../help/troubleshooting.md#location-does-not-work).

## Stops near an address

<figure>
<img src="/screenshots/web/search-address.png" alt="A list titled Stops near 1 Pasir Ris Close (519599), with eight stops such as Aft Loyang Gdns and Opp Downtown East, each with its distance and stop code." width="440" height="486" loading="lazy">
<figcaption>A postal code lists the 8 stops nearest that address, titled with the address OneMap found.</figcaption>
</figure>

Type a 6-digit Singapore postal code, such as `519599`, into the search box.
The app looks the address up with OneMap, Singapore's official map, and lists
the 8 stops nearest it, titled with the address it found. This works in the
route planner's Start and End boxes too, for planning a trip from somewhere you
are not; see [Navigate by bus only](route-planner.md).

## Narrow a stop to one bus

<figure>
<img src="/screenshots/web/search-narrow.png" alt="Bedok Int's timings narrowed to bus 60, with buttons for Show all services, Route from here, Pick a bus and Directions, and only bus 60's next three buses below." width="994" height="604" loading="lazy">
<figcaption>Bedok Int narrowed to bus 60. Show all services widens it back out.</figcaption>
</figure>

Add a bus number after the stop code, with a space: `84009 174`. The timings
show only that bus. You can also do this after opening a stop, with
**Pick a bus**; see [More from a stop](more-from-a-stop.md#pick-a-bus).

### A few buses at once

<figure>
<img src="/screenshots/web/search-several.png" alt="Bedok Int's timings narrowed with 84009 22*: the incoming buses bar and cards for 222, 225G, 228 and 229 only, with Show all services, Pick a bus, Directions and Board above." width="880" height="1044" loading="lazy">
<figcaption>Bedok Int with 84009 22*: every bus there starting with 22.</figcaption>
</figure>

For a few buses, list them with commas or spaces: `84009 174, 175`. A star after
a number takes every bus starting with it, so at Bedok Int `84009 22*` shows 222,
225G, 228, 229 and the rest of the 22s, and `84009 222*` just 222 and 222A.
**Route from here** is there only when it's one bus.
