---
title: Sync between devices
description: Copy your favourites, places, routines, calendar, settings, trips and past searches from one device to another, directly, or with the Telegram bot, with a 6-letter code.
---

Your favourites, places, trips and the rest are kept on each device separately.
Sync copies them from one device to another, say from your phone to your laptop,
without an account. The two devices talk to each other directly; nothing passes
through a server. You can sync with the
[Telegram bot](#with-the-telegram-bot) too.

> [!WARNING]
> Both devices have to be on the **same wifi**, or one has to be joined to the
> other's **hotspot**. Two devices on different networks, or a phone on mobile
> data, usually cannot reach each other.

## On the first device: show a code

<figure>
<img src="/screenshots/web/sync-show-code.png" alt="Settings showing a 6-letter sync code in large type, a QR code and the link under it, the status Waiting for the other device, and New code and Stop buttons." width="420" height="411" loading="lazy">
<figcaption>The code, its QR code and its link, waiting for the other device.</figcaption>
</figure>

1. Open **Settings**, from the gear in the Edge Tray or by tapping the app's title.
2. Under **Sync with another device or Telegram**, tap
   **Show a code on this device**.
3. A 6-character code appears in large type, with a QR code and a link under
   it. Tap the code to copy the link.

The status reads "Waiting for the other device" until the second device joins.

## On the second device: enter it

<figure>
<img src="/screenshots/web/sync-enter-code.png" alt="Settings on the second device, with the code typed into the box and a Connect button beside it." width="420" height="197" loading="lazy">
<figcaption>Type the code from the first device and tap Connect.</figcaption>
</figure>

Do one of these:

- Scan the QR code with the second device's camera, and open the link.
- Open the link, if you sent it to yourself.
- Open **Settings**, type the code into
  **Or enter the other device's code**, and tap **Connect**.

Codes ignore capitals, spaces and dashes, so `bcd-fgh` works as well as
`BCDFGH`. The code never contains a vowel, a `0`, an `O`, a `1` or an `I`, so it
cannot be misread.

## Pick what to copy

<figure>
<img src="/screenshots/web/sync-pick.png" alt="Connected to the other device: Import and Export tabs, Select all ticked, and the other device's favourites listed with ticks, one marked Already here." width="420" height="639" loading="lazy">
<figcaption>Tick what to copy. Favourites this device already has are marked.</figcaption>
</figure>

Once connected, both devices show two tabs:

- **Import** lists the other device's favourites that this one does not have.
- **Export** lists this device's favourites that the other one does not have.

Above the list, a button for each kind of thing, such as **Bus stops**,
**Places** or **Routines**, with how many of it are on offer, shows just that
kind; **All** shows everything again. Tick the ones you want, or **Select all**
for the kind on show, then tap the button underneath to copy them. Ticks in
other kinds stay ticked, and their button is highlighted, so one tap copies
everything you ticked. The other device saves them straight away and says how
many were new.

Copying only ever adds, except where there's only one of a thing: your name, your
birthday, your calendar's link and each setting (see below). Nothing else is
removed or replaced on either device.

Besides favourite stops, buses, routes and navs, the lists hold:

- **You**: your name and birthday from Settings. Each is listed when the two
  devices have different ones, and copying it replaces the one on the device it's
  copied to.
- **Places**: Home, Work and your other [places](places.md). A device that
  already has a Home or Work keeps its own; a place already saved at the same
  spot isn't copied again.
- **Trips**: trips from [Your trips](trips.md) that the other device doesn't
  have, and its stats count them from then on.
- **Past searches**: the searches the other device doesn't have, each in its
  place by when it was searched, keeping the newest 50.
- **Routines** and **Last bus reminders**, between two phones with the
  [Android app](android-app.md#reminders). Each phone runs its own, so a routine
  copied to both notifies on both.
- **Calendar**: your [calendar](calendar.md)'s link, replacing the calendar on
  the device it's copied to. A calendar imported from a file, or the phone's own
  calendar in the Android app, stays on its device.
- **Settings**: the ones you've changed from how they start, such as dark mode,
  the colour, where favourites pin, the Edge Tray's side and buttons, the Get Off
  Alert, Shake to refresh and birthday confetti. Copying one changes that setting
  on the other device.

Only what the other device can keep is listed: a browser without the Android app
isn't offered routines.

## Finish

<figure>
<img src="/screenshots/web/sync-finish.png" alt="Settings while connected, with New code and Stop buttons." width="420" height="355" loading="lazy">
<figcaption>Stop ends the sync; New code retires the code on screen.</figcaption>
</figure>

Tap **Stop** to end the sync, or just close Settings. Closing Settings ends it
too. **New code** retires the code on screen and shows a fresh one, so the old
code stops working.

## If it will not connect

<figure>
<img src="/screenshots/web/sync-wont-connect.png" alt="Settings after a failed connection, with a red dot and the message Nobody is showing that code. Check it and try again." width="420" height="224" loading="lazy">
<figcaption>What the app says when no device is showing the code you entered.</figcaption>
</figure>

| The app says | What to do |
|---|---|
| Could not reach the other device. Both have to be on the same network... | Put both devices on the same wifi, or turn on a hotspot on one and join it from the other. Work, school, hotel and guest wifi often block devices from reaching each other, even on the same network; use a hotspot. Check the code is still the one on screen. |
| Nobody is showing that code. Check it and try again. | The code was mistyped, or the first device has stopped or shown a new code. |
| Cannot reach the pairing service. Everything else still works. | The service that introduces the two devices is down or blocked. Try again later. |
| Could not load syncing. Check your connection. | This device is offline, or something is blocking the sync script. |
| This browser cannot make peer-to-peer connections. | Use an up-to-date Chrome, Edge, Firefox or Safari. |
| Lost the connection to the other device. Tap Connect to try again. | The connection was working and dropped, often because a screen locked. Tap **Connect**. |

> [!NOTE]
> Switching one device to mobile data does not help. Two different networks is
> exactly the case that fails.

## With the Telegram bot

You can sync with the [Telegram bot](../bot/start.md) the same way, from any
network:

1. In **Settings**, under **Sync with another device or Telegram**, tap
   **Sync with the Telegram bot**. A code appears, with **Open the bot** and the
   command to send it, such as `/sync BX7K2P`.
2. Tap **Open the bot**, which opens the bot with the code filled in, then
   **Start**. Or send the bot the command yourself. On a computer, scan the QR
   code with your phone to open the bot there.
3. Once the bot says it's connected, **Import** lists what the bot has, and
   **Export** what this device has that the bot keeps. Tick and copy as between
   two devices; the bot says in the chat what it saved.

The bot keeps your name and birthday, favourite stops, buses, routes and navs,
places, routines, your calendar's link, and where favourites pin. It has no
trips, past searches or last bus reminders, and no other settings, so those
aren't offered.

The sync ends when you tap **Stop** or close Settings, when you send the bot
`/sync stop`, or after 10 minutes.

## Privacy

Syncing with the Telegram bot goes through this site's server, as the bot can't
connect to your device directly. What's copied is held there for 10 minutes at
most and deleted as soon as either side ends the sync. Only your device and the
bot can read it.

Between two devices, a free public service, run by PeerJS, introduces the two to each other.
It sees the code and both devices' IP addresses, and each device learns the
other's IP address. Your favourites go straight from one device to the other,
encrypted, and never through that service. Anyone with the code can connect
while it is on screen, so do not share it beyond your own devices. See
[Privacy and your data](../help/privacy.md).
