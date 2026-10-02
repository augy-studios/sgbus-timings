---
title: Privacy and your data
description: What the web app and the bot keep about you, where, and who else is involved.
---

SG Bus Timing needs very little about you, and keeps it as close to you as it
can.

## The web app

### Kept in your browser

Your favourites, your name and birthday, where favourites pin, and your theme
are saved in your browser's storage on your device. They are not sent to SG Bus
Timing's server, and there is no account. Clearing your browsing data for the
site deletes them.

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
learns the other's IP address. Your favourites travel directly between the two
devices, encrypted, and never through that service.

### Service alert notifications

Turning on notifications in the Service alerts card sends SG Bus Timing's
alerts server two things: your browser's push subscription, an address your
browser's push service (Google, Apple, Mozilla or Microsoft) gives the app for
delivering notifications to this device, and which updates you picked. Nothing
else: no name, no location, no favourites. The server also keeps a random ID
this device made up, so it can tell your device apart. Picking **Off** deletes
all of it from the server.

### Directions

**Navigate** opens Google Maps or Citymapper with the stop as the destination.
From then on, that app's own privacy policy applies.

## The Telegram bot

### What the bot keeps

To work, the bot saves, against your Telegram chat:

- your favourite stops, buses and routes, and where they pin;
- your routines, and any routine or route you are part way through setting up;
- the name you set, your birthday, and whether routine notifications are on;
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
routines with `/routines`, Service Alerts with `/unsub`, your name with `/setname clear`, and your birthday
with **Clear birthday** in `/settings`. To have everything about you deleted,
email Augy, who runs the bot, at
[augybiz@gmail.com](mailto:augybiz@gmail.com), with your Telegram username.

## Where the bus data comes from

All bus stops, routes and arrival times, train service alerts and traffic
incidents come from [LTA DataMall](https://datamall.lta.gov.sg/), the Land
Transport Authority's open data service. Postal code lookups use [OneMap](https://www.onemap.gov.sg/),
from the Singapore Land Authority.
