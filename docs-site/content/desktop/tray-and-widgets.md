---
title: Tray, widgets and notifications
description: The desktop app's tray and its menu, a stop's next buses in the tray, favourites on the taskbar and Dock, Bus timings widgets, Service alerts as notifications, starting when you sign in, and uwu:// links.
---

The desktop app does a few things outside its window, so your next bus and any
disruptions reach you while you're doing something else.

## The tray

Closing the window doesn't quit the app: it keeps running in the tray (the bus
by the clock on Windows, the menu bar on a Mac), so
[Service alerts](#service-alerts-as-notifications) still reach you. The first
time, a notification says it's still running.

- **Windows**: click the bus to bring the window back, or to put it away if it's in
  front. Right-click it for its menu.
- **Mac and Linux**: click the bus for its menu. On a Mac, clicking the app's icon
  in the Dock brings the window back too.

The menu has:

- **Restart to update to 2.5.1**, once a new version has downloaded, or
  **Download version 2.5.1** where the app can't install it itself. See
  [Updates](install.md#updates).
- The [tray countdown](#a-stops-buses-in-the-tray), when one's set, and **Stop the
  tray countdown**.
- **Open SG Bus Timings**, **Service alerts** and **Navigate**.
- **Add a Bus timings widget**: see [Bus timings widgets](#bus-timings-widgets).
- **Make it yours…**, the [first window](install.md#make-it-yours) again.
- **Check for updates…**: a notification says what it found, even if you're up
  to date.
- **Start when I sign in**, ticked while it does.
- **Quit**, which closes the app for good, until you open it again. On a Mac,
  **⌘Q** quits too.

## A stop's buses in the tray

Open a stop and click **Tray countdown**, or right-click a stop anywhere and pick
**Set as tray countdown**. Its next buses then show when you hover over the
tray's bus on Windows and Linux, and beside it in the menu bar on a Mac, with the
next bus's minutes on the Dock icon too. Narrowed to one bus first, it follows
just that bus. It refreshes every 30 seconds, and carries on after the app
restarts.

The tray's menu names the stop: click it to open the stop. **Stop the tray
countdown** takes it away.

## Your favourites on the taskbar and Dock

Your first ten favourite stops are a right-click away on the app's taskbar icon
on Windows (its Jump List), and on its Dock icon on a Mac. Pick one to open its
timings. On Windows, hovering over the taskbar icon also gives **Refresh**, and
the previous and next favourite stop, under its preview.

## Bus timings widgets

<figure>
<img src="/screenshots/desktop/widget.png" alt="A Bus timings widget for Bedok Int: 84009, Every bus, with round Refresh, Pick another stop, Keep on top and Remove buttons, then a row per bus with its next three times, such as 14 in 1 min, 11 min and 22 min, and Updated 08:30 at the bottom." width="320" height="300" loading="lazy">
<figcaption>A widget for Bedok Int, every bus.</figcaption>
</figure>

Keep a stop's live timings on your desktop, in a small window of its own:

1. Pick **Add a Bus timings widget** in the tray's menu or the command bar (on a
   Mac, also in the **File** menu). Or open a stop and click **Desktop widget**, or
   right-click a stop and pick **Pin as a desktop widget**, to skip the next step.
2. Pick one of your favourite stops, or type a stop's 5-digit code. To show only
   some buses, type their numbers, such as `15, 62`. Click **Save**.

Drag its top to move it, and its edges to resize it any way: it shows as many
buses as fit, and scrolls for the rest. It refreshes every 30 seconds, and says
when it last did. Its buttons refresh it now, pick another stop, keep it on top of
other windows, and remove it. Click a bus to open it in the app. Add as many as
you like; they're where you left them each time the app starts. Quitting the app
keeps them; only the remove button takes one away.

<figure>
<img src="/screenshots/desktop/widget-dark.png" alt="The same widget with the app in dark mode: light writing on a dark background, each bus's next time in pale green." width="320" height="300" loading="lazy">
<figcaption>It's light or dark as the app is.</figcaption>
</figure>

Windows 11's own Widgets board only takes apps from the Microsoft Store, so the
widgets live on your desktop instead.

## Service alerts as notifications

Turn them on as on a phone: [Service alerts](../android/service-alerts.md#get-notified),
then pick what to hear about. A computer can't be sent them, so the app checks
every minute while it's running, open or in the tray, and shows what's new as a
desktop notification, by the same rules as the phone's: the train updates, traffic
incidents and newsfeed you picked. The disruptions bar updates from the same
check. Click a notification to open Service
alerts.

Starting the app never repeats old news: the first check after it opens only
notes what's going on. Windows and Linux show notifications without asking; a
Mac asks the first time. If it says notifications are off, turn them on in your
computer's notification settings for SG Bus Timings, then pick again.

## Starts when you sign in

The app opens when you sign in to your computer, so alerts reach you from the
start: close its window and it carries on in the tray. To stop that, untick **Start when I sign in** in the tray's menu,
or in [Make it yours](install.md#make-it-yours). Once you've chosen, it never
turns it back on by itself.

## Links

`uwu://sgbus/` links open the app on the stop, bus or page they name, as they do
the Android app: see [App links](../web/links.md#app-links). On Windows they work
once you've opened the app once. An AppImage needs adding to your desktop's app
menu first, as AppImageLauncher or Gear Lever do.

With another UwU app installed on the computer too, such as uwuPromptr, its
`uwu://` links open that app, not this one, whichever of the two you opened last.

A link to the website, pasted into the [command bar](window.md#the-command-bar),
opens in the app. Links in the app to anywhere else open in your browser.
