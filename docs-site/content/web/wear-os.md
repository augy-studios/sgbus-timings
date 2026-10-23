---
title: Wear OS watches
description: A tile on your watch with the next buses at your nearest favourite stop, counting down by itself.
---

SG Bus Timings has a watch app for Wear OS 3 and later
(Pixel Watch, Galaxy Watch 4 and newer, and others). Its **Bus timings** tile
shows the next buses at whichever of your
[favourite stops](favourites.md) is nearest, and the minutes count down on the
watch without it having to fetch them again. Tap the tile to open the watch app,
which lists your other favourites too.

## What it needs

- The [Android app](android-app.md) 2.1.0 or later on your phone, paired with
  the watch. Your favourite stops come from it, and change on the watch when you
  star or unstar one on the phone.
- Location on the watch, to know which stop is nearest. The watch app asks the
  first time you open it. Without it, the tile shows your first favourite.
- The internet, through the phone or the watch's own Wi-Fi or mobile data.

## Install it

The watch app isn't on Google Play, so it's installed from a computer, once,
over the watch's Wi-Fi. Updates are installed the same way.

1. Download `sg-bus-timings-2.1.0-watch.apk` (or newer) from the
   [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
   on your computer.
2. Install Android's [platform tools](https://developer.android.com/tools/releases/platform-tools),
   which include `adb`.
3. On the watch, turn on developer options: **Settings** > **System** >
   **About** > **Versions** (or **Software information**), and tap
   **Build number** seven times.
4. Still on the watch: **Settings** > **Developer options** > turn on
   **ADB debugging** and **Wireless debugging**. The watch and the computer must
   be on the same Wi-Fi.
5. Under **Wireless debugging**, tap **Pair new device**. The watch shows an
   address, such as `192.168.1.23:37199`, and a six-digit code. On the computer:

   ```
   adb pair 192.168.1.23:37199
   ```

   and type the code.
6. Back on **Wireless debugging**, the watch shows another address, such as
   `192.168.1.23:41235`. On the computer:

   ```
   adb connect 192.168.1.23:41235
   adb install sg-bus-timings-2.1.0-watch.apk
   ```

7. Turn **Wireless debugging** off again on the watch: it uses the battery.

Then add the tile: swipe left on the watch face to the end of your tiles, tap
**+ Add tile**, and pick **Bus timings**.

> [!TIP]
> No computer? Apps on the Play Store that install apps on a watch over its
> wireless debugging can do the same from your phone.

## Good to know

- The tile fetches the timings again when you swipe to it after a minute or
  more. In between, the minutes count down by themselves, from when they were
  fetched.
- "Nearest" is by the watch's last known location, so just after you've
  travelled it can take a moment to catch up.
