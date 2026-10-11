---
title: Calendar with /calendar
description: Link your calendar to see its events with a location, each a button that plans the way there, arriving on time.
---

`/calendar` lists your calendar's events with a location, today and the next two
weeks. Each one is a button that plans the way there, arriving by its start.

## Link your calendar

Telegram can't read your phone's calendar, so you send the bot its **private
iCal link** once.

1. Send `/calendar`. The first time, it says where to find the link:
   - **Google Calendar**, on a computer: Settings, then your calendar under
     "Settings for my calendars", then **Integrate calendar**. Copy **Secret
     address in iCal format**.
   - **Outlook**: Settings, Calendar, **Shared calendars**. Under Publish a
     calendar, pick the calendar and "Can view all details", tap **Publish**, then
     copy the **ICS** link.
   - **iCloud**: in Calendar, share the calendar and turn on **Public Calendar**,
     then copy its link.
2. Send the link.
3. The bot checks it, deletes your message with the link so it isn't left in the
   chat, and lists your events.

> [!WARNING]
> Anyone who has the link can see your calendar. The bot keeps it in its database
> for your chat only, and reads it each time you send `/calendar`. If it gets out,
> reset it in your calendar's settings and send the new one with **🔗 Change link**.

## Plan the way to an event

Each event shows its name, when to arrive and its location, under **Today** or
**Later**. Tap **🧭** beside one, and a [/nav](nav.md) panel opens with the event
as the end, set to **Arrive by** its start, asking where you're starting from.
Send your location, or a place.

An all-day event, or one more than a week away, plans for **Leave now** instead.
An event whose location matched no place says **location not found**; tap it,
and the bot asks you for the place to go to.

Online meetings, with a link for a location, and events with no location aren't
listed. Repeating events show each time they come round in the two weeks.

| Button | What it does |
|---|---|
| **🙈 Hide** | Takes that event off the list. |
| **🔄 Refresh** | Reads the calendar again. |
| **🔗 Change link** | Asks for a new link. |
| **🗑 Remove calendar** | Forgets the link. |

The [web app](../web/calendar.md) has the same, under Calendar in Navigate,
linked separately.
