---
title: What the web app can't do
description: Home screen widgets on Android and iPhone, and location while the app is in the background, aren't possible for a web app. Please don't ask for them.
---

SG Bus Timings is a web app: it runs in your browser, or installed from it, rather
than coming from the Play Store or App Store. That keeps it free, quick to update
and the same on every phone, but phones only allow a web app so much. Two things
come up often, and **neither can be done**, so please don't suggest them:

## Home screen widgets on Android and iPhone

Android and iPhone only let apps from the Play Store or App Store put widgets on
the home screen. A web app can't add one at any size, and no setting or browser
changes that.

The **Bus timings** widget only works on Windows 11, in its Widgets board. See
[Shortcuts and widgets](../web/shortcuts-and-widgets.md). On a phone, these come
closest:

- On Android, press and hold the app's icon and drag a **Stops near me**
  shortcut onto your home screen.
- In the Telegram bot, a [routine](../bot/routines.md) sends a stop's timings to
  you.

## Location while the app is in the background

A web page only gets your location while it's open on screen. The moment you
switch apps or lock the phone, the browser stops giving it any, on every phone
and in every browser. Letting the browser run in the background, or turning off
battery saving for it, doesn't change that.

So the [Get Off Alert](../web/get-off-alert.md) keeps the screen awake while a
trip runs. If you leave the app anyway, SG Bus Timings' server follows your bus
from LTA's live bus positions instead, and still sends the alert, as long as
you've allowed notifications.
