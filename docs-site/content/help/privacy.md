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
box: up to the last 50. Both stay in the browser, unless you copy them to another
device with [Sync](#sync).

### Your location

**Stops near me** uses your location inside your browser to measure how far
away each stop is. Your location is not sent anywhere.

In the Linux app, where the computer can't tell where it is by itself, the app
asks [BeaconDB](https://beacondb.net) where the Wi-Fi networks around it are:
their hardware addresses and signal strengths go to BeaconDB, never their names,
your location or anything else of yours. See
[Windows, Mac and Linux apps](../web/desktop-app.md#location).

### What goes to the server

To show timings, the app asks its own server for the stop you opened, and the
server asks LTA DataMall. To search a postal code, the server looks it up with
OneMap. Neither request includes anything about you beyond what any website
sees, such as your IP address.

### Analytics

The web app and this guide use Google Analytics to count visits and see which
pages are used. It's a Google service that may set cookies; Google's own privacy
policy covers what it collects. There are no ads.

### Sync

Sync uses a free public service from PeerJS to introduce your two devices. It
sees the sync code and both devices' IP addresses, and each device learns the
other's IP address. What you pick to copy (favourites, your name and birthday,
places, trips, past searches, routines, your calendar's link and settings)
travels directly between the two devices, encrypted, and never through that
service.

Syncing with the Telegram bot is different: the bot can't connect to your
device directly, so what's copied either way passes through SG Bus Timings'
server. It's held there, in the same database as Service Alerts, for 10 minutes
at most from when you tap **Sync with the Telegram bot**, and deleted as soon as
either side ends the sync. Only your device, with a secret it makes up for that
sync, and the bot can read it. What you send to the bot is then kept in the
bot's own database, as anything you save in the bot is.

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
you are, and when you should get there, updated every 10 seconds as you go. "Where
you are" is your location itself, from your last good GPS fix, so whoever has the
link can follow your dot on a map; it's sent only while you're sharing, and **Stop
sharing** stops it.
It's deleted three hours after its last update. The map on a link is drawn by
OneMap.

### Get Off Alert

On a trip, your live location is used in your browser to count the stops left,
and your phone's motion (its accelerometer) to tell walking from riding. Neither
leaves your device for that.
It never leaves your device, unless you share your ETA: then it's sent with it
(see [Share links](#share-links)).

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

### The live map

The [live map](../web/live-map.md) uses your location on your device to follow
you. To draw a walk, the two ends, where you are and where you're going (rounded
to about 10 m), go to SG Bus Timings' server, which asks OneMap's walking router,
or, if that's down, the one OpenStreetMap Germany runs. Nothing else about you
goes with them. The map itself comes from OpenStreetMap's or OneMap's servers,
which see your IP address and which part of the map you're looking at, like any
website's map.

### The Android app

The [Android app](../web/android-app.md) shows the website, so everything on this
page applies to it the same way. It keeps its own storage, not
Chrome's. On its own it reads nothing about you. It opens SimplyGo when you tap
that button, and reads your calendar only as above.

On a trip it keeps your location coming with the screen off, for the trip in the
page only: it isn't sent anywhere the website wouldn't send it.

**Card value** reads the value, expiry and number of the card you hold to the
phone, shows them, and forgets them. Nothing is written to the card, and nothing
read is sent anywhere or kept.

**Notifications from the server** reach the app through Google's Firebase Cloud
Messaging rather than Web Push. The app gets a token from Google, and that token
is what's sent to SG Bus Timings' server in place of a browser's push
subscription, for the same purposes and kept the same way. Google carries each
notification to the phone.

### The desktop app

The Windows, Mac and Linux app shows the website in its own window, so everything on
this page applies to it the same way. For Service alerts it asks the server for
the current alerts every minute while it runs, the same request the alerts card
makes, and shows what's new itself: nothing is sent about you, and no push
subscription is made.

### Weather

The weather button asks SG Bus Timings' server for Singapore's forecast and air
quality, from Open-Meteo and NEA (data.gov.sg). Nothing about you is sent; the
forecast is the same for everyone.

### Directions

The **Directions** button on a stop's timings opens the live map (see
[The live map](#the-live-map)) or Citymapper, with the stop as the destination.
Once you're in Citymapper, its own privacy policy applies.

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
