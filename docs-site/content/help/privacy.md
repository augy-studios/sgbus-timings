---
title: Privacy and your data
description: What the web app and the bot keep about you, where, and who else is involved.
---

SG Bus Timings needs very little about you, and keeps it as close to you as it
can.

## The web app

### Kept in your browser

Your favourites, your name and birthday, your [places](../web/places.md) (Home,
Work and the rest), [Your trips](../web/trips.md), your
[past searches](../web/past-searches.md), your calendar link or file, where
favourites pin, and your theme are saved in your browser's storage on your device.
They are not sent to SG Bus Timings' server, and there is no account. Clearing your
browsing data for the site deletes them.

Your trips keep where each trip started and ended, the buses and trains it used,
and how long you waited and rode. Past searches keep what you picked in a search
box: up to the last 50. Both stay in the browser; only places and trips can be
copied to another device, with [Sync](#sync).

### Your location

**Stops near me** uses your location inside your browser to measure how far
away each stop is. Your location is not sent anywhere.

### What goes to the server

To show timings, the app asks its own server for the stop you opened, and the
server asks LTA DataMall. To search a postal code, the server looks it up with
OneMap. Neither request includes anything about you beyond what any website
sees, such as your IP address.

### Analytics and ads

The web app and this guide use Google Analytics to count visits and see which
pages are used, and show Google AdSense ads. Both are Google services that may
set cookies; Google's own privacy policy covers what they collect.

### Sync

Syncing favourites uses a free public service from PeerJS to introduce your two
devices. It sees the sync code and both devices' IP addresses, and each device
learns the other's IP address. Your favourites, and your places and trips if you
pick them, travel directly between the two devices, encrypted, and never through
that service.

### Service alert notifications

Turning on notifications in the Service alerts card sends SG Bus Timings'
alerts server two things: your browser's push subscription, an address your
browser's push service (Google, Apple, Mozilla or Microsoft) gives the app for
delivering notifications to this device, and which updates you picked. Nothing
else: no name, no location, no favourites. The server also keeps a random ID
this device made up, so it can tell your device apart. It's stored in a database
run by Upstash for SG Bus Timings. Picking **Off** deletes all of it.

### Navigate

The places you type into **Navigate** are looked up by SG Bus Timings' server and
OneMap's search, and the two ends of a nav are sent to the server, which asks
OneMap's journey planner too. Nothing about you goes with them. Saved navs stay
in your browser, like other favourites.

A Google Maps link you paste or share in is sent to the server, which opens a
short link with Google to find the full one, then reads the place from it.

### Share links

A link made with Navigate's **Share** is kept in a database run by Supabase for
SG Bus Timings, so its short address can find what it points to. A place or
directions link holds the places' names and points, the time and the way if you
picked them, and nothing about you; anyone with the link can open it. An end set
to **Your location** in a directions link isn't sent at all. Shared on its own as
**Share start** or **Share end**, it is: as the point where you were.

Sharing one of your [places](../web/places.md), such as Home, makes a place link
with its name and where it is; it doesn't expire. A trip shared from Your trips is
a directions link from where it started to where it ended, without when you took
it.

A **Share my ETA** link also holds the name from Settings, if you set one, where
you are along the trip's route, and when you should get there, updated as you go.
It's deleted three hours after its last update. The map on a link is drawn by
OneMap.

### Get Off Alert

On a trip, your live location is used in your browser to count the stops left.
It never leaves your device, unless you share your ETA: then where you are along
the trip's route is sent with it (see [Share links](#share-links)).

If you've allowed notifications, the trip is also sent to SG Bus Timings' server
so it can send the alert while the site is in the background. That covers the
stops on the trip, the buses and trains it uses, how many stops along the trip
you've got, and the push subscription to send to, all under a random ID, and, if
you're sharing your ETA, that link and its name and destination, so the server can
keep it updated. Your location itself is never sent. The server deletes the trip when you end it, when
it's over, or a while after it should have been.

### Calendar

A [calendar](../web/calendar.md) linked by its private iCal link is read each time
the Calendar tab opens. Calendar services don't let a web page read a calendar
directly, so the link goes to SG Bus Timings' server, in the body of the request
rather than the address so request logs don't keep it, and the server fetches the
calendar and passes it straight back. It doesn't keep or log the link or the
calendar. An imported `.ics` file is read in your browser and never sent anywhere.

To place each event, its location (not its name or time) is searched for the way a
place typed into Navigate is. Which place each location matched is remembered in
your browser.

In the [Android app](../web/android-app.md), **Use this phone's calendar** reads
your phone's own calendar instead, with Android's calendar permission, which it
asks for only when you choose it. The app reads the next two weeks' events with a
location each time the Calendar tab opens, and hands them straight to the page:
they aren't sent to SG Bus Timings' server or kept by the app. Locations are
looked up as above. Turn the permission off in Android's settings for the app,
or pick **Remove calendar**, to stop it.

### The Android app

The [Android app](../web/android-app.md) is the website in Chrome, so everything
on this page applies to it the same way, and its storage is Chrome's for the
site. On its own it reads nothing about you. It opens SimplyGo when you tap that
button, and reads your calendar only as above.

### Weather

The weather button asks SG Bus Timings' server for Singapore's forecast and air
quality, from Open-Meteo and NEA (data.gov.sg). Nothing about you is sent; the
forecast is the same for everyone.

### Directions

The **Directions** button on a stop's timings opens Google Maps or Citymapper with
the stop as the destination.
From then on, that app's own privacy policy applies.

## The Telegram bot

### What the bot keeps

To work, the bot saves, against your Telegram chat:

- your favourite stops, buses and routes, and where they pin;
- your routines, and any routine, route or nav you are part way through setting up;
- your favourite navs, with the places at each end;
- the name you set, your birthday, your Home and Work places and any other
  places you've saved, and whether routine notifications are on;
- your calendar's private iCal link, if you've linked one with `/calendar`, and
  which of its events you've hidden. The bot reads the calendar with it each time
  you use `/calendar`, and keeps the events themselves nowhere. Which place each
  event's location matched is kept, without whose calendar it came from;
- whether you've subscribed to Service Alerts, and in which mode;
- what each button it has sent you does, so buttons keep working after a
  restart.

Telegram tells the bot your first name; it uses that to greet you unless you
set a different name.

### Your location and postal codes

A location you send is used to find the nearest stops and is not saved. The
buttons in the reply remember which stops they listed, so they keep working. A
postal code you send is looked up with OneMap to find the address.

### Removing your data

Remove favourites with `/unfavstop`, `/unfavbus` and the favourite buttons,
routines with `/routines`, Service Alerts with `/unsub`, favourite navs with
the star on their panel, your name with `/setname clear`, your birthday,
Home and Work with **Clear birthday**, **Clear home** and **Clear work** in
`/settings`, your other places with **Delete** in `/places`, and your calendar
link with **Remove calendar** in `/calendar`. To have everything about you deleted,
email Augy, who runs the bot, at
[augy@augystudios.com](mailto:augy@augystudios.com), with your Telegram username.

## Where the bus data comes from

All bus stops, routes and arrival times, train service alerts and traffic
incidents come from [LTA DataMall](https://datamall.lta.gov.sg/), the Land
Transport Authority's open data service. Postal code lookups use [OneMap](https://www.onemap.gov.sg/),
from the Singapore Land Authority.
