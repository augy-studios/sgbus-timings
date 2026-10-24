---
title: Sync with the web app
description: Copy your favourites, places, routines and calendar between the bot and the web app or the Android app, with a 6-letter code.
---

The bot and the web app keep your favourites separately. Sync copies them from
one to the other, either way, with a code the web app shows.

## Start it from the web app

1. In the web app or the Android app, open **Settings** and, under
   **Sync with another device or Telegram**, tap **Sync with the Telegram bot**.
2. Tap **Open the bot**: it opens this chat with the code filled in. Tap
   **Start**. Or send the bot the command the web app shows, such as
   `/sync BX7K2P`. On a computer, scan its QR code with your phone instead.
3. The bot says it's connected. On the web app, **Import** lists what the bot
   has, and **Export** what the web app has that the bot keeps. Tick what to copy
   and tap the button under the list.

Whenever something's sent to it, the bot says what it saved, such as
"Saved from your device: 2 stops and 1 routine."

## What syncs

- Your name and birthday, from [Settings](settings.md)
- Favourite stops, buses, routes and navs
- [Places](places.md): Home, Work and your own. Home or Work is only filled
  where it isn't set yet.
- [Routines](routines.md). The web app's routines are in the Android app only,
  so on a computer or a phone's browser, routines aren't offered. Each side runs
  its own, so a routine on both notifies you on both: remove one if you only
  want one.
- Your [calendar](calendar.md)'s link, which replaces the one on the other side
- Where favourites pin, [top or bottom](favourites.md#top-or-bottom)
- Whether you have a bike, for [cycling in /nav](settings.md#cycling)

Copying only adds: nothing is removed. Your name, birthday, calendar link, pin
and cycling settings replace the other side's when you copy them.

## Finish

The sync ends when you tap **Stop** on the web app or close its Settings, when
you send `/sync stop`, or after 10 minutes. Start it again for a new code.

## Privacy

The bot can't connect to your phone or computer directly, so what's copied goes
through the web app's server, held there for 10 minutes at most and deleted as
soon as either side ends the sync. See
[Privacy and your data](../help/privacy.md#sync).
