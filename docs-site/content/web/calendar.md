---
title: Calendar
description: Link your calendar to see its events with a location in Navigate, and plan the way to each one, arriving on time.
---

Link your calendar and its events with a location, today and the next two weeks,
show in [Navigate](nav.md). Tap one for the way there, arriving by its start.

<figure>
<img src="/screenshots/web/calendar-list.png" alt="The calendar tab in Navigate's To, listing events under Later: Arrive Tomorrow 19:00, Henry Dinner at Punggol Coast Mall; Arrive 13 Oct 18:00, Thomas Dinner and Movie at Jem; Arrive 16 Oct 17:00, Ramen with Henry at Dhoby Ghaut Exchange; Arrive 17 Oct 14:00, Sean Swimming and Dinner at SAFRA Choa Chu Kang; and Haircut." width="360" height="476" loading="lazy">
<figcaption>Your events with a location, in Navigate.</figcaption>
</figure>

## Your phone's calendar

In the [Android app](android-app.md), the app can read your phone's own
calendar: every calendar on the phone, Google, Outlook, Samsung and the rest,
with nothing to paste.

1. In [Navigate](nav.md), tap into **From** or **To**, then the calendar tab, then
   **Use this phone's calendar**. Or in **Calendar settings**, tap
   **Use this phone's calendar**.
2. The first time, tap **Allow calendar access**, then **Allow** on Android's
   prompt.
3. Your events with a location show, and are read fresh each time you open the
   tab.

Your events stay on the phone: the app hands them straight to the page. As with
a link, only each event's location is looked up, to find the place.

Refused the prompt? Tap **Allow calendar access** again. After a second refusal
Android stops asking, and the button opens the app's settings instead: turn on
**Calendar** under **Permissions**.

## Link your calendar

On the website, or on an iPhone, a web page can't read your phone's calendar,
so you link it once by its **private iCal link**, or import it as a file.

<figure>
<img src="/screenshots/web/calendar-setup.png" alt="Navigate's calendar tab before linking, with one row: Sync with calendar, Plan trips from your events." width="360" height="135" loading="lazy">
<figcaption>Before it's linked, the calendar tab offers to.</figcaption>
</figure>

1. In [Navigate](nav.md), tap into **From** or **To**, then the calendar tab, then
   **Sync with calendar**. Or open **Settings** and tap **Calendar settings**.
2. Find your calendar's private iCal link (see below), copy it, paste it in, and
   tap **Link**.
3. The window says how many events with a location it found.

<figure>
<img src="/screenshots/web/calendar-settings.png" alt="The Sync with calendar window: a box for the private iCal link with a Link button, where to find the link for Google Calendar, Outlook and iCloud, a note on how the link is kept, and Or import an .ics file." width="416" height="680" loading="lazy">
<figcaption>Paste the link, or import a file.</figcaption>
</figure>

### Where to find the link

| Calendar | Where |
|---|---|
| **Google Calendar** | On a computer: Settings, then your calendar under "Settings for my calendars", then **Integrate calendar**. Copy **Secret address in iCal format**. |
| **Outlook** | Settings, Calendar, **Shared calendars**. Under Publish a calendar, pick the calendar and "Can view all details", tap **Publish**, then copy the **ICS** link. |
| **iCloud** | In Calendar, share the calendar and turn on **Public Calendar**, then copy its link. Anyone with that link can see the calendar. |

> [!WARNING]
> Treat the link like a password: anyone who has it can see your calendar. If it
> gets out, reset it in your calendar's settings (Google's is **Reset**, under the
> secret address) and link the new one.

### Or import a file

Under **Or import an .ics file**, pick a calendar file exported from your
calendar app. It's read on this device only and never sent anywhere, but it's a
snapshot: import it again for new events.

## Plan the way to an event

Tap into Navigate's **To**, then the calendar tab. Events are listed **Today**,
then **Later**, each with when to arrive, its name and its location.

Tap one, and Navigate plans the way there from where you are, set to **Arrive by**
the event's start. An all-day event, or one more than a week away, plans for
**Leave now** instead.

<figure>
<img src="/screenshots/web/calendar-nav.png" alt="Navigate from Your location to Punggol Coast Mall, with Arrive by picked for tomorrow at 7:00 pm, and the ways there counted below." width="392" height="560" loading="lazy">
<figcaption>Henry Dinner, tapped: the way there, arriving by 19:00.</figcaption>
</figure>

Each event's location is matched to a place on the map with Navigate's own search,
by its postal code where it has one. One that matches nothing, such as "Wei's
place", says **Location not found**; tap it, and its location goes into **To** for
you to pick the right place from the suggestions. Online meetings, with a link for
a location, and events with no location aren't listed.

Repeating events show each time they come round in the two weeks.

### An event's menu

Tap the three dots beside an event:

- **Save as place** saves its location to [Places](places.md), named after the event.
- **Share place** makes a "How to get to" link to its location.
- **Hide this event** takes it off the list.

## Change or remove it

**Calendar settings**, at the foot of the calendar tab or in Settings, links a
different calendar or imports another file. **Remove calendar** forgets the link or
file on this device.

## How the link is kept

The link stays in this browser. Each time the calendar tab opens, the calendar is
read through SG Bus Timings' server, because calendar services don't let a web page
read a calendar directly. The server passes the calendar straight back to your
browser, and keeps and logs nothing. Matching each location to a place uses
Navigate's search, as typing it would. See [Privacy](../help/privacy.md#calendar).

The [Telegram bot](../bot/calendar.md) has the same, with `/calendar`.
