---
title: Routines
description: Have a bus stop's timings sent to you automatically, at the same time on the days you choose.
---

A routine sends you a stop's live timings at a set time, so you can see when
your bus is coming before you leave the house, without opening anything.

## Set one up

Send `/addroutine` and answer four questions, one at a time:

1. **What time?** Send it in 24 or 12 hour form: `9 AM`, `10 PM`, `0830` or
   `20:00`. Times are always Singapore time (GMT+8).
2. **How often?** Send `daily`, `weekdays`, `weekends`, or a list of days such as
   `Mon, Wed, Fri`.
3. **Which bus stop?** Tap one of your favourite stops, or send a stop code or
   part of its name.
4. **Which buses?** A grid of every bus at that stop appears. Tap buses to tick
   them, then tap **Done**. Leave them all unticked to get every bus. You can
   also type the numbers, `15, 25`, or `all`.

The bot confirms the routine, with its time, days, stop and buses. Send
`/cancel` at any point to stop without saving.

## What arrives

At the time you set, on the days you set, the bot sends the stop's live timings
narrowed to the buses you picked. An **All services** button widens it to
every bus at the stop. The message starts with a greeting for the time of day,
good morning, afternoon or evening, and your name: your Telegram first name, or
the one you set with `/setname`.

## See, change or delete routines

Send `/routines` for a numbered button per routine. Tap one to see it, with
**Edit** and **Delete** buttons.

**Edit** lets you change just one part: the time, the days, the bus stop or the
buses. Changing the time lets a routine that has already run today run again
later today. Changing the stop takes you on to the bus grid, with any buses you
had picked that also call at the new stop still ticked.

## Pause them all

To stop routines for a while without deleting them, such as on holiday, send
`/settings` and tap **Disable notifications**. **Enable notifications** turns
them back on. See [Settings](settings.md).
