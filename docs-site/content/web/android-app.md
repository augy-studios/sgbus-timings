---
title: The Android app
description: What only SG Bus Timings' Android app does: trips with the screen off, card value over NFC, reminders, Home and Work tiles, voice and camera search, Offline Sharing, notifications, your phone's calendar, opening SimplyGo, and updating itself.
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

From version 2.0.8, the app also goes by how fast you're moving to tell walking
from riding, as your steps can't be counted with the screen off. Up to about
10 km/h is walking; a bus or train's speed, about 40 km/h on average, is riding.
So walking to your stop never counts as boarding, and once you're riding, 150 m
down your bus's route is enough.

Swiping the app away from your recent apps ends that; the server's alert takes
over, as it does for the website.

From version 2.1.0, your first trip also asks to leave the app out of battery
optimisation, once. Some phones (Xiaomi, Samsung, Oppo and others) otherwise stop
a trip in the background to save battery. The trip starts whichever you choose.

In **Settings**, **Get Off Alert's sound** can be **Earphones only**: with
earphones in, the beeps play just in them; with none, the phone only buzzes.
Never out loud on a quiet bus.

## Card value

On a phone with NFC, the app reads an **EZ-Link** or **NETS FlashPay** card.

1. Tap the card button in the Edge Tray, or long-press the app's icon and pick
   **Card value**. From version 2.0.8 you can also just hold the card to the
   phone: Android offers SG Bus Timings for it, even with the app closed, and
   the value opens straight away. While the app is open, it takes the card
   without asking.
2. Hold the card flat against the back of the phone, near the camera on most
   phones. From version 2.2.0, the moment the phone finds it the app says
   **Reading your card…**: keep holding. It takes about a second, and when it's
   done the phone buzzes twice and the app says **Done: you can take your card
   away**.

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
stop's name to pick another, a bus to open it in the app, or anywhere else on
it to open the stop. A new widget with no stop yet opens its setup wherever you
tap it. Add as many as you
like, each for its own stop.

## Reminders

From version 2.1.0, in **Settings**, the app can tell you things with itself
closed. Each is off until you turn it on, and asks for what it needs then.

<figure>
<img src="/screenshots/web/android-reminders.png" alt="The app's reminders in Settings: Timings near a stop with 1 stop watched, Time to leave turned on, On a bus? turned off, and two last bus reminders, for the 14 at Bedok Int and the 10 at Tampines Int, each with a button to remove it." width="358" height="494" loading="lazy">
<figcaption>The reminders in Settings, each off until you turn it on.</figcaption>
</figure>

- **Timings near a stop**: tap **Pick stops** and choose some of your favourite
  stops. As you walk up to one (within about 120 m), a quiet notification shows
  its next buses, refreshed every minute until you leave. It needs location
  **All the time**, as it's watched with the app closed.
- **Time to leave**: for events in your phone's calendar with a place for a
  location, a notification when it's time to set off by bus and train to get
  there on time, with the way to go. Planned from where you are, or, when the
  phone won't say with the app closed, from Home in [Places](places.md).
- **"On a bus?"**: when the phone notices you're riding and no trip is running, a
  quiet notification offers to start one, for the Get Off Alert. It can't tell a
  bus from a car, so it only offers. At most once every two hours. It needs
  **Physical activity**.
- **Last bus reminders**: on a stop's timings, tap the bell by a bus's last bus
  time. You're reminded 20 minutes before its last bus there, every day it runs.
  Settings lists them, to remove. Public holidays run Sunday's times, which the
  reminder doesn't know about.
- **Routines** (from version 2.2.0): tap **Add a routine**, pick a stop (the one
  you have open, or a favourite), the buses you want or none for all of them, a
  time and the days, such as 7:45 on weekdays. At that time a notification shows
  the stop's next buses; tap it for their timings. Settings lists them, to
  remove. Like the [Telegram bot's routines](../bot/routines.md), but on your
  phone.

### Location turned off

From version 2.2.0, when you tap **Near me**, start from where you are in
Navigate, or save where you are in Places with your phone's Location turned
off, the app asks to turn it on with one tap, then carries on. Without Google
Play services it opens Android's Location settings instead.

<figure>
<img src="/screenshots/web/android-near-stops.png" alt="Timings near a stop: the favourite stops Bedok Int, ticked, and Tampines Int, not, above a Save button." width="396" height="310" loading="lazy">
<figcaption>Timings near a stop: pick which favourite stops to watch.</figcaption>
</figure>

## Home and Work, a tap away

From version 2.1.0, once Home or Work is set in [Places](places.md):

- Long-press the app's icon for **Bus home** and **Bus to work**: each opens
  Navigate from where you are. With them there, the shortcuts are Near me,
  Navigate, Bus home and Bus to work.
- Add the **Bus home** and **Bus to work** tiles to Quick Settings: pull down
  twice from the top of the screen, tap the pencil, and drag them in.

## Search by voice, and scan a stop

From version 2.1.0, the search box has two more buttons:

<figure>
<img src="/screenshots/web/search-voice-scan.png" alt="The search box with 84009 typed in, and a microphone and a camera button at its right end, beside Get Timings." width="310" height="48" loading="lazy">
<figcaption>The microphone and the camera, in the search box.</figcaption>
</figure>

- The **microphone**: say a stop, its code or a bus. It uses Android's own speech
  screen, so SG Bus Timings itself never hears you.
- The **camera**: point it at the 5-digit code on a bus stop's pole, and that
  stop's timings open. The text is read on your phone, by Google's ML Kit; nothing
  is sent anywhere.

## NFC stickers

From version 2.1.0, write a stop, a place or a way home onto a blank NFC sticker
(an NTAG213 or bigger): stick it by the door, and a tap of any phone opens it. A
stop's timings have **NFC sticker**; for a place or directions, use
[Offline Sharing](#offline-sharing)'s **Write it to an NFC sticker**. Hold the
sticker to the back of the phone until it says it's written.

<figure>
<img src="/screenshots/web/android-sticker.png" alt="NFC sticker: hold a blank NFC sticker to the back of the phone, near the camera on most phones, until it's written." width="396" height="274" loading="lazy">
<figcaption>Waiting for a sticker to write to.</figcaption>
</figure>

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
and **Trip in progress**, and from 2.1.0 the [reminders](#reminders): **Near a
stop**, **Last bus**, **Time to leave**, **On a bus?**, and **Get Off Alert,
earphones only**, and from 2.1.1 **New versions** (see [Update it](#update-it)).
Each can be turned off on its own.

## Your phone's calendar

The [Calendar](calendar.md#your-phones-calendar) tab can read your phone's own
calendar, every calendar on it, with no link to paste. The app asks for calendar
access only when you pick **Use this phone's calendar**.

## SimplyGo, sharing and links

- The [SimplyGo](install.md#simplygo) button opens the SimplyGo app itself,
  rather than its store page.
- **More** on a share card, and anywhere else the app shares, opens Android's own
  share sheet. From version 2.1.0, **Telegram** and **WhatsApp** open those apps
  straight away, ready to pick a chat.
- From version 2.1.0, a share card also has **Offline Sharing**: see
  [Offline Sharing](#offline-sharing) below.
- The website's own links, `uwu://sgbus/` links (see
  [Links you can share](links.md#app-links)) and places shared from Google Maps
  open in the app.
- Long-press the app's icon for shortcuts: **Near me**, **Navigate**, **Alerts**
  and **Card value**, or, with Home or Work set, **Bus home** and **Bus to work**
  in place of the last two (see [Home and Work](#home-and-work-a-tap-away)).
- AI assistants on your phone or elsewhere can open the app at the right place
  with the links in its [guide for AI assistants](https://sgbus.uwuapps.org/llms.txt).

## Offline Sharing

From version 2.1.0, **Offline Sharing** on a share card hands a place,
directions or your live ETA to a phone next to you, with no internet on either
phone.

<figure>
<img src="/screenshots/web/android-share-targets.png" alt="A share card's buttons: Telegram, WhatsApp, Copy link, More and Offline Sharing." width="358" height="81" loading="lazy">
<figcaption>Offline Sharing, the share card's fifth button in the app.</figcaption>
</figure>

Tap it, then either:

- **Hold the backs of your phones together.** Their phone needs NFC on and to be
  unlocked, but nothing open: it opens in SG Bus Timings if they have it, or in
  their browser if not. Hold another phone to yours to send it again.
- **Send it to a phone nearby**, without touching, over Bluetooth. On their
  phone, they open SG Bus Timings and tap **Receive nearby** (the two phones) in
  the Edge Tray. Their phone shows up on yours by the name in their
  [Settings](settings.md), or its model; tap it to send. The first time, both
  phones ask to use **Nearby devices**.

<figure>
<img src="/screenshots/web/android-offline-sharing.png" alt="Offline Sharing for One Raffles Place: hold the backs of your phones together, or tap Alex under Phones nearby to send it; and a button to write it to an NFC sticker." width="396" height="541" loading="lazy">
<figcaption>Sharing: hold the phones together, or pick a phone nearby.</figcaption>
</figure>

<figure>
<img src="/screenshots/web/android-receive.png" alt="Receive nearby: ready to receive; on their phone, Share, then Offline Sharing, and pick Sam." width="396" height="300" loading="lazy">
<figcaption>Receive nearby, on the phone getting it.</figcaption>
</figure>

Directions go across with both ends and the time, so they get every way there,
not just the one you'd picked. Planning the way, and following a live ETA, still
needs the internet on their phone once it's open.

The phone sharing needs NFC (for a tap) or Google Play services (to send without
touching). On a phone with neither, the button isn't there.

## Update it

When there's a new version, a bar at the top of the app says so:

1. Tap **Update**. The app downloads the new version.
2. The first time, Android asks you to allow SG Bus Timings to install apps:
   turn on **Allow from this source**, then go back.
3. Tap **Update** on Android's own screen. The app closes to update; open it
   again.

Everything you've saved stays. **Not now** hides the bar until you next open
the app.

From version 2.0.8 you can also check whenever you like: tap the download
arrow in the Edge Tray (**Check for app updates**). It says if you already have
the newest version, or which one is out, with **Update** to install it as above.

### Hear about new versions

From version 2.1.1, the app can tell you the moment a new version is out, even
when it's closed: open [Service alerts](service-alerts.md) (the bell in the Edge
Tray) and pick **On** under **New versions of the app**. The first time, Android
asks to allow notifications. Tap the notification ("SG Bus Timings 2.1.2 is
out") and the app says which version you have and offers **Update**. A watch
paired with your phone shows it too.

It's off until you turn it on. It needs Google Play services, as most phones
have.

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
| **Location all the time** | Once, on your first trip, and when you pick stops for **Timings near a stop** | Asked so trips can keep your location in the background; trips work without it too. Timings near a stop needs it |
| **Notifications** | Your first trip, turning on Service alerts, or a reminder | Service alerts, the Get Off Alert, the "On a trip" notification while a trip runs, and the [reminders](#reminders) |
| **Calendar** | Only if you choose **Use this phone's calendar**, or turn on **Time to leave** | Listing your events with a location in Navigate, and planning when to leave for them |
| **Physical activity** | Only if you turn on **"On a bus?"** | Noticing you're riding |
| **Camera** | The first time you scan a stop's code | Reading the code on its pole. Nothing is recorded or sent |
| **Battery optimisation** | Once, on your first trip | Keeping a trip running in the background. You can say no |
| **NFC** | Not asked: Android allows it | Reading a card, opening the app when you hold a card to the phone, and Offline Sharing by tap |
| **Nearby devices** | The first time you send without touching, or tap **Receive nearby** | Offline Sharing to and from phones nearby, over Bluetooth. Before Android 12, it's location instead |
| **Install unknown apps** | The first time you tap **Update** | Installing its own updates from GitHub. Android still asks before each one |

## iPhone and iPad

There's no iPhone app. Add the website to your home screen instead: see
[Open and install the app](install.md#iphone-and-ipad).
