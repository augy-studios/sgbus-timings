---
title: Windows and Linux apps
description: SG Bus Timings for Windows and Linux, in its own window, with a tray icon and Service alerts as desktop notifications.
---

SG Bus Timings is also a desktop app for Windows and Linux. It's the same app as
the website, in a window of its own, and it adds:

- **a tray icon**: closing the window keeps it running there, so
  [Service alerts](service-alerts.md) still reach you;
- **Service alerts as desktop notifications**, without a browser open;
- **Start when I sign in**, from the tray icon's menu, straight into the tray;
- **`uwu://sgbus/` links** open it, on the stop, bus or page they name, as they
  do the Android app (see [App links](links.md#app-links)).

Everything else updates the moment the website does.

## Download and install it

Open the [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
and download the one for your computer from under **Assets**:

| Computer | File |
|---|---|
| Windows 10 or 11 | `sg-bus-timings-2.0.1-setup.exe`. (The `.msi` is the same app, for installing it on many computers at once.) |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.0.1-amd64.deb` |
| Any other Linux | `sg-bus-timings-2.0.1-x86_64.AppImage` |

**Windows**: open the `.exe`. If Windows says "Windows protected your PC", click
**More info**, then **Run anyway**: the app isn't signed with a certificate yet.
Pick where to install it, then open **SG Bus Timings** from the Start menu.

**Debian, Ubuntu, Mint**: open the `.deb` with your software installer, or in a
terminal, `sudo apt install ./sg-bus-timings-2.0.1-amd64.deb`.

**AppImage**: make it runnable (right-click > **Properties** > **Allow executing
file as program**, or `chmod +x` it), then open it.

## Service alerts

Turn them on as on the website: the bell in the Edge Tray, then pick what to hear
about. The app checks every minute while it's running, open or in the tray, and
shows what's new as a notification. Click one to open Service alerts.

Quit the app from the tray and the notifications stop until you open it again.
To have them all the time, tick **Start when I sign in** in the tray icon's menu.

## Location

**Stops near me** and the [live map](live-map.md) need to know where the computer
is. On Windows, turn on **Settings** > **Privacy & security** > **Location**.
Most Linux computers can't tell where they are; type a place instead.

## Update it

The app doesn't update itself yet. When there's a new version, download it from
the [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
and install it over the old one. Your favourites and settings stay.
