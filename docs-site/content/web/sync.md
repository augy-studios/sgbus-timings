---
title: Sync favourites between devices
description: Copy favourite stops, buses, routes and navs from one device to another, directly, with a 6-letter code.
---

Your favourites are kept in each browser separately. Sync copies them from one
device to another, say from your phone to your laptop, without an account. The
two devices talk to each other directly; your favourites never pass through a
server.

> [!WARNING]
> Both devices have to be on the **same wifi**, or one has to be joined to the
> other's **hotspot**. Two devices on different networks, or a phone on mobile
> data, usually cannot reach each other.

## On the first device: show a code

<figure>
<img src="/screenshots/web/sync-show-code.png" alt="Settings showing a 6-letter sync code in large type, a QR code and the link under it, the status Waiting for the other device, and New code and Stop buttons." width="420" height="411" loading="lazy">
<figcaption>The code, its QR code and its link, waiting for the other device.</figcaption>
</figure>

1. Open **Settings**, from the gear or by tapping the app's title.
2. Under **Sync favourites with another device**, tap
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

Tick the ones you want, or **Select all**, then tap the button underneath to copy
them. The other device saves them straight away and says how many were new.

Copying only ever adds. Nothing is removed or replaced on either device.

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

## Privacy

A free public service, run by PeerJS, introduces the two devices to each other.
It sees the code and both devices' IP addresses, and each device learns the
other's IP address. Your favourites go straight from one device to the other,
encrypted, and never through that service. Anyone with the code can connect
while it is on screen, so do not share it beyond your own devices. See
[Privacy and your data](../help/privacy.md).
