---
title: The Android app
description: SG Bus Timings as an Android app, with what only an app can do: trips with the screen off, card value over NFC, notifications, your phone's calendar and opening SimplyGo.
---

SG Bus Timings is also an Android app. It's the same app as the website, with
things a website can't do:

- **Trips with the screen off**: the [Get Off Alert](get-off-alert.md) follows
  your trip with the phone locked, and alerts you over the lock screen;
- **Card value**: hold your EZ-Link or NETS FlashPay card to the phone to see
  what's on it (see [below](#card-value));
- **Service alerts** as [notifications](service-alerts.md), like the website's;
- the [Calendar](calendar.md#your-phones-calendar) tab can read your phone's own
  calendar, with no link to paste;
- the [SimplyGo](install.md#simplygo) button opens SimplyGo itself, not its
  store page;
- `uwu://sgbus/` links and the website's own links open it (see
  [Links you can share](links.md#app-links));
- it updates itself, with a tap.

Everything else, timings, Navigate, the [live map](live-map.md), favourites,
updates the moment the website does: there's nothing to update for those.

## Download and install it

It's shared as a file rather than on Google Play, for now.

1. On your Android phone, open the
   [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
   and tap the `.apk` file under **Assets**, such as `sg-bus-timings-2.0.1.apk`,
   to download it. Or open one someone sent you, from Files or Telegram.
2. Open the downloaded file. If Android asks, allow installing apps from your
   browser or Files, then tap **Install**. If Play Protect asks about the app,
   tap **More details** > **Install anyway**.
3. Open **SG Bus Timings** from your home screen or app list.

> [!NOTE]
> Already added the website to your home screen from Chrome? Remove that one
> first, so you don't have two icons.

If Android says **App not installed**, an older copy made a different way is in
the way. Uninstall SG Bus Timings, then install the file again.

## Coming from version 1

Versions 1.0.0 to 1.2.0 were the website in Chrome, and kept your favourites,
places, trips and settings in Chrome. Version 2 keeps its own, so after updating
the app starts empty. Everything is still in Chrome; bring it across with
[Sync](sync.md):

1. In **Chrome** on the same phone, open `sgbus.uwuapps.org`. Your favourites are
   there.
2. Open **Settings**, and under **Sync favourites with another device** tap
   **Show a code on this device**.
3. Switch to the **app** straight away, open **Settings**, type the code into the
   same section and tap **Connect**. Pick **Select all**, then copy them over.

Do it in one go: Chrome stops answering if it's left in the background for long.
If it says it can't reach the other device, show a new code in Chrome and try
again.

Service alerts you turned on in version 1 now come from Chrome. Turn them off
there (**Service alerts** > **Off** in Chrome), then on in the app, so you don't
get each one twice.

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

## Card value

On a phone with NFC, the app reads the value stored on an **EZ-Link** or **NETS
FlashPay** card.

1. Tap the card button in the Edge Tray, or long-press the app's icon and pick
   **Card value**.
2. Hold the card flat against the back of the phone, near the camera on most
   phones, until it's read.

It shows the value, when the card expires, and its auto top-up if it has one,
and warns when it's under $3. **Read another** reads the next card. If NFC is
off, **Turn on NFC** opens its setting.

Nothing is written to the card, and what it says stays on your phone. Bank
cards, phones and watches have no stored value to read. A card on SimplyGo's
account-based ticketing keeps its value in your SimplyGo account instead, so for
those the card can show an old figure: check the SimplyGo app.

## What it asks for

| Permission | When | Why |
|---|---|---|
| **Location** | The first time you use Stops near me, Your location, the live map or a trip | Finding stops near you, the live map, and following your trip |
| **Location all the time** | Once, on your first trip | Asked so trips can keep your location in the background. Trips work without it too: you can say no |
| **Notifications** | Your first trip, or turning on Service alerts | Service alerts, the Get Off Alert, and the "On a trip" notification while a trip runs |
| **Calendar** | Only if you choose **Use this phone's calendar** | Listing your events with a location in Navigate. See [Calendar](calendar.md#your-phones-calendar) |
| **NFC** | Not asked: Android allows it | Reading a card's value |
| **Install unknown apps** | The first time you tap **Update** | Installing its own updates from GitHub. Android still asks before each one |

## iPhone and iPad

There's no iPhone app. Add the website to your home screen instead: see
[Open and install the app](install.md#iphone-and-ipad).
