---
title: Troubleshooting
description: Fixes for the things that most often go wrong, in the web app and the bot.
---

## No timings show up

- **Late at night or early in the morning**, "No live buses right now" is
  normal: nothing is on its way. Check the first and last bus times under each
  service.
- **Check your connection.** Live timings are never shown from a saved copy, so
  without a connection there are none to show.
- **LTA's service may be down.** Every timing comes from LTA DataMall. When it
  has problems, every app that uses it does too. Try again in a few minutes.
- **One bus is missing** from a stop's timings: LTA only lists a service when it
  has a bus coming. Use [**Pick a bus**](../web/more-from-a-stop.md#pick-a-bus)
  in the app, or [**Select Bus Number**](../bot/more-from-a-stop.md#pick-one-bus-select-bus-number)
  in the bot, to check the stop is on its route.

## A time jumped, or a bus never came

Arrival times are LTA's estimates, recalculated as the bus moves through
traffic, so they can go up as well as down. A time in *italics* in the app is a
bus that is not sending its position, estimated from the timetable; treat it
as a guess. See [Reading bus timings](../getting-started/reading-timings.md).

## I picked the wrong stop

Many places have two stops facing each other across a road, with similar names
such as `Bedok Stn Exit A` and `Bedok Stn Exit B`, or `Opp Waterfront Waves`.
A bus only calls at the one on its side. Check the road name under the stop's
name, or open the bus's route to see which stop it calls at. The route planner
in [the app](../web/route-planner.md#picked-the-wrong-side-of-the-road) and
[the bot](../bot/routes.md#the-wrong-side-of-the-road) spots this for you.

## Search finds nothing

- Search by a **part** of the name: `waterfront` rather than the full name.
- LTA abbreviates names, such as `Int` for Interchange, `Stn` for Station,
  `Opp` for Opposite, `Aft` for After, `Bef` for Before and `Blk` for Block.
- Use the **5-digit code** from the pole at the stop. It always works.
- A **postal code** must be 6 digits.

## Location does not work

### In the web app

- Your browser has to be allowed to use your location. If you said no once,
  the app cannot ask again: allow it in your browser's site settings for
  sgbus.uwuapps.org, then try again.
- On iPhone, also check **Settings**, **Privacy & Security**,
  **Location Services**, and that your browser is allowed to use it.
- Location needs a secure page, so open the app at `https://sgbus.uwuapps.org`.
- Indoors or underground, your position can be rough or slow to arrive. Search
  by name or postal code instead.

### In the bot

- Send your location from Telegram's attachment menu, or use `/nearme` and tap
  **Share my location**.
- Telegram Desktop and Telegram Web may not offer location. Send a 6-digit
  postal code instead.

## My favourites disappeared

**Web app:** favourites live in the browser. They are gone if you cleared your
browsing data, used a private window, or opened the app in a different browser,
or as an installed app rather than in the browser. Use
[sync](../web/sync.md) to copy them between browsers and devices in future.

**Bot:** favourites are kept with your Telegram account. They are the same on
every device, as long as you are using the same Telegram account.

## Sync will not connect

Both devices must be on the same wifi, or one on the other's hotspot. Work,
school and hotel wifi often stop devices from reaching each other; use a
hotspot. The full list of messages and fixes is in
[Sync favourites between devices](../web/sync.md#if-it-will-not-connect).

## The app looks out of date

When a new version is ready, a bar at the top offers **Reload**. If you never
see it, close every tab and window of the app, including the installed app, and
open it again. See [Updates and offline use](../web/updates.md).

## The bot does not answer

- Check you are in the chat with [@UwUsgbus_bot](https://t.me/UwUsgbus_bot).
- If it is waiting for an answer, such as during `/addroutine`, what you send is
  taken as that answer. Send `/cancel` and try again.
- Buttons on very old messages may no longer match what they opened. Search
  again for a fresh message.
- If it still says nothing, the bot may be restarting. Try again in a minute.

## Service alert notifications don't arrive

**Web app:**

- Open **Service alerts** and check **All updates** or **Disruptions only** is
  picked for the kind you want, train or traffic. If the note says the browser
  can't receive notifications, or that they're blocked, do what it says.
- On iPhone and iPad, notifications only work in the app added to your Home
  Screen and opened from there, not in a Safari tab.
- On Android, if they arrive late, set your browser or the installed app to
  **Unrestricted** under **Settings**, **Apps**, **Battery**.
- On a computer, the browser has to be running.
- **Disruptions only** can be quiet for days. That's normal when nothing is
  disrupted.

**Bot:** send `/settings` and check **Service Alerts** isn't Off. If you've
muted the bot's chat, its messages arrive silently.

## The Get Off Alert didn't go off

- Allow notifications for the site when asked. With the site in the background,
  the alert comes from the server as a notification, so without them nothing
  arrives until you open the site again.
- For the most exact alert, keep the site open on screen during the trip. A
  website only gets your location while it's open; in the background the server
  goes by LTA's live bus positions instead, which run a minute or so behind.
- Allow location for the site when asked. Without it the site goes by the clock,
  which is rougher.
- Underground there's no GPS, so it goes by the expected ride time; the trip bar
  says so. A delayed train can make it early or late.
- Check **Get Off Alert on a trip** is **On** in Settings.
- If your phone is on silent, the vibration still comes, but not the beeps.

## Navigate can't find a place

Type more of the name, or the postal code. Places come from OneMap's search,
which knows addresses, buildings and postal codes, plus every MRT and LRT
station and bus stop.

## Routines did not arrive

- Send `/settings` and check **Routine notifications** is Enabled.
- Send `/routines` and check the time, the days and the stop. Times are
  Singapore time.
- If you have muted the bot's chat in Telegram, its messages arrive silently.
