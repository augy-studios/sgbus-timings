---
title: The Android app
description: SG Bus Timings as an Android app, with what only an app can do: opening SimplyGo, and your phone's own calendar.
---

SG Bus Timings is also an Android app. It's the same app as the website, full
screen, with a few things a website can't do:

- the [SimplyGo](install.md#simplygo) button opens SimplyGo itself, not its
  store page;
- the [Calendar](calendar.md#your-phones-calendar) tab can read your phone's
  own calendar, with no link to paste;
- `uwu://sgbus/` links open it (see [Links you can share](links.md#app-links));
- it updates itself, with a tap.

Everything else, timings, Navigate, the Get Off Alert, favourites, updates the
moment the website does: there's nothing to update for those.

## Download and install it

It's shared as a file rather than on Google Play, for now.

1. On your Android phone, open the
   [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
   and tap the `.apk` file under **Assets**, such as `sg-bus-timings-1.2.0.apk`,
   to download it. Or open one someone sent you, from Files or Telegram.
2. Open the downloaded file. If Android asks, allow installing apps from your
   browser or Files, then tap **Install**.
3. Open **SG Bus Timings** from your home screen or app list.

> [!NOTE]
> Already added the website to your home screen from Chrome? Remove that one
> first, so you don't have two icons. Your favourites and settings stay: both
> use Chrome's storage for the site.

If Android says **App not installed**, an older copy made a different way is in
the way. Uninstall SG Bus Timings, then install the file again.

## Update it

The app itself only needs updating for its own extras. When there's a new
version, a bar at the top of the app says so:

1. Tap **Update**. The app downloads the new version.
2. The first time, Android asks you to allow SG Bus Timings to install apps:
   turn on **Allow from this source**, then go back.
3. Tap **Update** on Android's own screen. The app closes to update; open it
   again.

Everything you've saved stays. **Not now** hides the bar until you next open
the app.

On version 1.1.0, the bar says **Download** instead: it opens the
[latest release](https://github.com/augy-studios/sgbus-timings/releases/latest),
where you download the newer `.apk` and install it over the old one, once.
From then on, the app updates itself.

## What it asks for

| Permission | When | Why |
|---|---|---|
| **Location** | The first time you use Stops near me, Your location or the Get Off Alert | The same as the website: finding stops near you, and following your trip |
| **Notifications** | The first time you turn on Service alerts or start a trip | The same as the website: alerts, and the Get Off Alert in the background |
| **Calendar** | Only if you choose **Use this phone's calendar** | Listing your events with a location in Navigate. See [Calendar](calendar.md#your-phones-calendar) |
| **Install unknown apps** | The first time you tap **Update** | Installing its own updates from GitHub. Android still asks before each one |

## iPhone and iPad

There's no iPhone app. Add the website to your home screen instead: see
[Open and install the app](install.md#iphone-and-ipad).
