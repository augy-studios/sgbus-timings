---
title: Windows and Linux apps
description: What only SG Bus Timings' Windows and Linux app does: the tray, Service alerts as desktop notifications, starting when you sign in, uwu:// links, and updating itself.
---

SG Bus Timings for Windows and Linux is the web app in a window of its own, with
a few extras only a desktop app can do. This page covers those extras;
everything else works as the rest of this guide describes, and updates the
moment the website does.

## Download and install it

Open the [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
and download the one for your computer from under **Assets**:

| Computer | File |
|---|---|
| Windows 10 or 11 | `sg-bus-timings-2.0.2-setup.exe`. (The `.msi` is the same app, for installing it on many computers at once.) |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.0.2-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.0.2-x86_64.AppImage` |

**Windows**: open the `.exe`. If Windows says "Windows protected your PC", click
**More info**, then **Run anyway**: the app isn't signed with a certificate yet.
Pick where to install it, then open **SG Bus Timings** from the Start menu.

**Debian, Ubuntu, Mint**: open the `.deb` with your software installer, or in a
terminal, `sudo apt install ./sg-bus-timings-2.0.2-amd64.deb`.

**AppImage**: make it runnable (right-click > **Properties** > **Allow executing
file as program**, or `chmod +x` it), then open it.

## The tray

Closing the window doesn't quit the app: it keeps running in the tray (the bus
by the clock on Windows), so [Service alerts](service-alerts.md) still reach you.
Click the bus to bring the window back. Right-click it for **Service alerts**,
**Navigate**, **Start when I sign in**, and **Quit**, which closes it for good.

## Service alerts on your desktop

Turn them on as on the website: the bell in the Edge Tray, then pick what to hear
about. The app checks every minute while it's running, open or in the tray, and
shows what's new as a desktop notification, with no browser open. Click one to
open Service alerts.

## Bus timings widgets

Keep a stop's live timings on your desktop, in a small window of its own:

1. Right-click the tray's bus and pick **Add a Bus timings widget**.
2. Pick one of your favourite stops, or type a stop's 5-digit code. To show only
   some buses, type their numbers, such as `15, 62`. Click **Save**.

Drag its top to move it, and its edges to resize it any way: it shows as many
buses as fit, and scrolls for the rest. It refreshes every 30 seconds. Its
buttons refresh it now, pick another stop, keep it on top of other windows, and
remove it. Click a bus to open it in the app. Add as many as you like; they're
where you left them each time the app starts.

## Starts when you sign in

The app opens when you sign in to your computer, so alerts reach you from the
start. To stop that, right-click the tray's bus and untick **Start when I sign
in**. It opens maximised; if you make the window smaller, it opens that size next
time.

## uwu://sgbus/ links

`uwu://sgbus/` links open the app on the stop, bus or page they name, as they do
the Android app: see [App links](links.md#app-links). On Windows they work once
you've opened the app once. An AppImage needs adding to your desktop's app menu
first, as AppImageLauncher or Gear Lever do.

## Updates

The app checks for a new version when it starts and every few hours after.

- Installed with the `.exe`, or as an AppImage: it downloads the update itself,
  then a notification and the tray's menu offer **Restart to update**. If you
  don't, it updates the next time you quit.
- Installed with the `.msi` or `.deb`: a notification says there's a new version;
  click it to download the new installer, and install it over the old one.

Your favourites and settings stay.

## Location

**Stops near me** and the [live map](live-map.md) need to know where the computer
is. On Windows, turn on **Settings** > **Privacy & security** > **Location**.
Most Linux computers can't tell where they are; type a place instead.
