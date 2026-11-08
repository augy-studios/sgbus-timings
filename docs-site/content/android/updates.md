---
title: Updates and offline use
description: How the Android app updates itself, how to hear about new versions, and what works with no connection.
---

## Update it

The app from Google Play updates through Google Play, like any other app, and has no bar,
update page or **Check for app updates** of its own. The rest of this section is for the app
from GitHub.

<figure>
<img src="/screenshots/android/update-bar.png" alt="A green bar across the top of Glance: Version 9.9.9 of the Android app is out, with Update and Not now." width="412" height="892" loading="lazy">
<figcaption>The bar a new version brings.</figcaption>
</figure>

When there's a new version, a bar at the top of the app says so:

1. Tap **Update**. The app opens its update page and downloads the new version.
2. The first time, Android asks you to allow SG Bus Timings to install apps: turn on
   **Allow from this source**, then go back.
3. Tap **Update** on Android's own screen. The app closes to update; open it again.

Everything you've saved stays. **Not now** hides the bar until you next open the app.

You can also check whenever you like: tap **Check for app updates**, the arrow into a tray
in the [Edge Tray](main-screen.md#the-edge-tray). It says if you already have the newest
version, or which one is out, with **Update** to install it as above.

### What's new in each version

<figure>
<img src="/screenshots/web/android-update.png" alt="The update page in blue, from the phone's wallpaper: Update available, then the new version with a New chip, how many changes, a line saying what's in it, and cards for each part of the app with its changes, and Update and Not now buttons at the bottom." width="360" height="800" loading="lazy">
<figcaption>What's new in the version you'd get, in your phone's own colours.</figcaption>
</figure>

The update page is in your phone's own colours: on Android 12 and later they come from your
wallpaper, and it's light or dark as your phone is. On older Android, it's in the app's
green.

Each version is on a timeline, newest first: the one you'd get marked **New** and open, with
what's in it in cards by part of the app, and the one you have marked **Installed**.
**Earlier releases**, every one back to the first, are under them; tap any version to see
what came with it, and **Show all** in a card for the rest of its changes.

<figure>
<img src="/screenshots/web/android-update-downloading.png" alt="The update page while it downloads: Updating, how much has come, and a wavy line most of the way along its track, with the changelog under it and Cancel at the bottom." width="360" height="800" loading="lazy">
<figcaption>Downloading, the wave growing as it goes.</figcaption>
</figure>

While it downloads, a wavy line grows along its track, with how much has come; **Cancel**
stops it. With the newest version already, the page says **You're up to date**, with **GitHub**
for its page there.

### Hear about new versions

The app can tell you the moment a new version is out, even when it's closed: open
[Service alerts](service-alerts.md) and turn on **New versions of the app**. The first time,
Android asks to allow notifications. Tap the notification and the app says which version you
have and offers **Update**. A watch paired with your phone shows it too.

It's off until you turn it on, and needs Google Play services, as most phones have.

## With no connection

<figure>
<img src="/screenshots/android/offline-bar.png" alt="A dark bar across the top of the app: You're offline. Timings and alerts come back when you reconnect, with OK. Under it, Favourites, with the Edge Tray showing fewer buttons." width="412" height="892" loading="lazy">
<figcaption>Offline, pages that need a connection leave the Edge Tray.</figcaption>
</figure>

With no connection a bar says so, and **OK** puts it away. The pages and buttons that need a
connection leave the Edge Tray, and it all comes back by itself once you reconnect.

| With no connection | Works? |
|---|---|
| Opening the app | Yes, straight away, on a page that doesn't need a connection |
| **Favourites**, **Your trips**, **Places**, Settings and Theme | Yes |
| [Navigate's Bus and train](nav.md#with-no-connection) | Yes, planned on your phone, with estimated times |
| Navigate's [Bus only](route-planner.md) | Yes, with estimated times |
| The [live map and Explorer](explorer.md#save-the-map-for-offline) | Once you've saved Singapore's map |
| [Offline Sharing](sharing.md#offline-sharing) and Receive nearby | Yes |
| **Glance**, **Bus timings** and a stop's timings | No |
| **Service alerts** | No; notifications still arrive once you're back online |
| Searching addresses and postal codes | No: they're looked up online |
| Sync between devices | No |

Live timings are never shown from an old copy: an old arrival time shown as if it were live
would be worse than none.
