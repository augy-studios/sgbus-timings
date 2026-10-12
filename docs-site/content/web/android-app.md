---
title: The Android app
description: What only SG Bus Timings' Android app does: trips with the screen off, card value over NFC, notifications, your phone's calendar, opening SimplyGo, and updating itself.
---

SG Bus Timings for Android is the web app with extras only an app can do. This
page covers those extras; everything else works as the rest of this guide
describes, and updates the moment the website does.

## Download and install it

It's shared as a file rather than on Google Play, for now.

1. On your Android phone, open the
   [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
   and tap the `.apk` file under **Assets**, such as `sg-bus-timings-2.0.2.apk`,
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

## Trips with the screen off

A [trip](get-off-alert.md) in the app carries on with the phone locked or the app
in the background. While it runs, an **On a trip** notification shows where you
are on it, with **End trip** to stop it, and the Get Off Alert sounds and buzzes
over the lock screen. The screen doesn't have to stay on.

Swiping the app away from your recent apps ends that; the server's alert takes
over, as it does for the website.

## Card value

On a phone with NFC, the app reads an **EZ-Link** or **NETS FlashPay** card.

1. Tap the card button in the Edge Tray, or long-press the app's icon and pick
   **Card value**.
2. Hold the card flat against the back of the phone, near the camera on most
   phones, until it's read.

It shows the value, when the card expires, its auto top-up if it has one turned
on, and **Recent rides and top-ups**: the last rides the card remembers, with
each fare and when. It warns when the value is under $3. **Read another** reads
the next card. If NFC is off, **Turn on NFC** opens its setting.

Nothing is written to the card, and what it says stays on your phone. Bank
cards, phones and watches have no stored value to read. A card on SimplyGo's
account-based ticketing keeps its value in your SimplyGo account instead, so for
those the card can show an old figure: check the SimplyGo app.

If a card's value can't be read, open **Card data**, tap **Copy** and send it to
us: it doesn't include your card's number.

## The Bus timings widget

Put a stop's live timings on your home screen:

1. Press and hold an empty part of your home screen, tap **Widgets**, and find
   **SG Bus Timings**.
2. Drag **Bus timings** onto the home screen.
3. Pick one of your favourite stops, or type a stop's 5-digit code. To show only
   some buses, type their numbers, such as `15, 62`. Tap **Save**.

Press and hold the widget to resize it any way: it shows as many buses as fit,
and scrolls for the rest. The refresh button fetches the latest timings; it also
refreshes itself about every 15 minutes, and says when it last did. Tap the
stop's name to pick another, or a bus to open it in the app. Add as many as you
like, each for its own stop.

## Picture-in-picture

During a trip, or with the [live map](live-map.md) open, going to your home
screen or another app shrinks SG Bus Timings into a small window over it, showing
just the map or how far along your trip you are. Drag it where you like, tap it
for its controls, or drag it off the screen to close it. Anywhere else in the
app, going home closes it as usual.

If it doesn't shrink, picture-in-picture may be off for the app: Android
**Settings** > **Apps** > **SG Bus Timings** > **Picture-in-picture**.

## Notifications

[Service alerts](service-alerts.md) come as the app's own notifications, even
with the app closed. Android's settings for the app list them by kind: **Service
alerts**, **Get Off Alert**, **Get ready to board** (from 2.0.4: your bus is a
minute away, on a trip; see [Get Off Alert](get-off-alert.md#get-ready-to-board))
and **Trip in progress**, each of which you can turn off on its own.

## Your phone's calendar

The [Calendar](calendar.md#your-phones-calendar) tab can read your phone's own
calendar, every calendar on it, with no link to paste. The app asks for calendar
access only when you pick **Use this phone's calendar**.

## SimplyGo, sharing and links

- The [SimplyGo](install.md#simplygo) button opens the SimplyGo app itself,
  rather than its store page.
- **More** on a share card, and anywhere else the app shares, opens Android's own
  share sheet.
- The website's own links, `uwu://sgbus/` links (see
  [Links you can share](links.md#app-links)) and places shared from Google Maps
  open in the app.
- Long-press the app's icon for shortcuts: **Near me**, **Navigate**, **Alerts**
  and **Card value**.

## Update it

When there's a new version, a bar at the top of the app says so:

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

## Coming from version 1

Versions 1.0.0 to 1.2.0 kept your favourites, places, trips and settings in
Chrome. Version 2 keeps its own, so after updating the app starts empty.
Everything is still in Chrome; bring it across with [Sync](sync.md):

1. In **Chrome** on the same phone, open `sgbus.uwuapps.org`.
2. Open **Settings**, and under **Sync with another device** tap
   **Show a code on this device**.
3. Switch to the **app** straight away, open **Settings**, type the code into the
   same section and tap **Connect**. Pick **Select all**, then copy them over.

Do it in one go: Chrome stops answering if it's left in the background for long.
If it says it can't reach the other device, show a new code in Chrome and try
again.

Service alerts you turned on in version 1 now come from Chrome. Turn them off
there (**Service alerts** > **Off** in Chrome), then on in the app, so you don't
get each one twice.

## What it asks for

| Permission | When | Why |
|---|---|---|
| **Location** | The first time you use Stops near me, Your location, the live map or a trip | Finding stops near you, the live map, and following your trip |
| **Location all the time** | Once, on your first trip | Asked so trips can keep your location in the background. Trips work without it too: you can say no |
| **Notifications** | Your first trip, or turning on Service alerts | Service alerts, the Get Off Alert, and the "On a trip" notification while a trip runs |
| **Calendar** | Only if you choose **Use this phone's calendar** | Listing your events with a location in Navigate |
| **NFC** | Not asked: Android allows it | Reading a card |
| **Install unknown apps** | The first time you tap **Update** | Installing its own updates from GitHub. Android still asks before each one |

## iPhone and iPad

There's no iPhone app. Add the website to your home screen instead: see
[Open and install the app](install.md#iphone-and-ipad).
