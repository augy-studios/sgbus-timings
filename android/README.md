# SG Bus Timings for Android

The Android app, `org.uwuapps.sgbus`: the web app at sgbus.uwuapps.org in
[Capacitor](https://capacitorjs.com)'s WebView (`capacitor.config.json`, `server.url`). The
site's own updates reach it at once, and the app only needs building again for its native
parts. Those are what a web page can't do, which the page reaches through Capacitor's bridge
(`main-site/js/app-bridge.js`).

From 2.0.0. Versions 1.0.0 to 1.2.0 were a Bubblewrap Trusted Web Activity: the site in
Chrome. It's the same package and signing key, so 2.0.0 installs over them as an update, and
1.2.0 offers it in its update bar. The site still answers 1.1.0 and 1.2.0's message channel
until they've updated (`js/app-bridge.js`).

Shared as an APK file through GitHub Releases: see `release/README.md`. It updates itself
from there.

## What it adds to the site

| Feature | Native side (`native/app/src/main/java/org/uwuapps/sgbus/`) | Site side (`main-site/`) |
|---|---|---|
| **Trip following with the screen off**: location all trip long, an ongoing "On a trip" notification with End trip, and the Get Off Alert over the lock screen. The screen no longer has to stay on. From 2.0.8, walking or riding by your average speed (up to 10 km/h walking, a bus or train's 40 km/h or so riding), as the page can't count steps with the screen off | `TripPlugin`, `TripService` (a foreground service of the location type), `Pace` | `js/trip.js` |
| **Notifications from the server**: Service Alerts, and the Get Off Alert if the app was closed mid-trip, through Firebase Cloud Messaging, as the WebView has no Web Push | Capacitor's PushNotifications plugin, `Notifications` (channels) | `js/alerts.js`, `api/_push/fcm.js`, `api/_push/send.js` |
| **The phone's calendar**, for Navigate's Calendar tab | `PhoneCalendarPlugin`, `CalendarReader` | `js/calendar.js` |
| **Card value**: an EZ-Link or NETS FlashPay card's stored value and recent rides over NFC, and from 2.0.8 Android offering the app when a card's held to the phone (`TECH_DISCOVERED`, `res/xml/nfc_tech.xml`), straight to it while it's open (foreground dispatch) | `CardPlugin`, `MainActivity` | `js/card.js` |
| **Bus timings widget** on the home screen: any stop, resizable, refreshed every 15 minutes or on tap | `TimingsWidget`, `TimingsWidgetService`, `WidgetConfigActivity`, `WidgetStore`, `WidgetRefreshWorker` | favourites from `script.js` (`shareFavsWithWidgets`) |
| **Picture-in-picture** during a trip or with the live map open | `MainActivity` (PiP), `SgBusPlugin.pip` | `js/pip.js` |
| **Share sheet** for every share button (the WebView has no `navigator.share`) | `SgBusPlugin.share` | `js/app-bridge.js` |
| **Telegram and WhatsApp** on the share card open the app's own chat picker, not its web link through the browser | `SgBusPlugin.share` (`app`) | `js/share.js` (`sendTo`) |
| **Opening SimplyGo** itself, not its store page | `OpenAppActivity`, reached by `SgBusPlugin.shouldOverrideLoad` | `script.js` ("SimplyGo") |
| **Updating itself** from GitHub Releases: the update bar, and from 2.0.8 the Edge Tray's "Check for app updates" | `UpdateActivity` | `js/app-update.js`, `api/app-release.js` |
| **Links**: the site's own (`https://sgbus.uwuapps.org/...`, verified by `.well-known/assetlinks.json`), `uwu://sgbus/` links, the launcher shortcuts, and places shared into it from Google Maps | `MainActivity` | `script.js` (`routeFromHash`, `routeFromShare`) |

`SgBusPlugin` also tells the page what this build can do (`info`, with `features`), posts
notifications for it, and opens Android's settings pages. `MainActivity` makes Back go back
through the page's history.

The site keeps its own versions of all of these that a browser can do (the Get Off Alert
with the screen on, Web Push, the iCal calendar link), and only uses the app's when it's
running in it. The website and PWA lose nothing.

### Permissions

| Permission | Asked | For |
|---|---|---|
| Location (while using) | First time the site asks: Near me, Navigate, the live map, a trip | The site's own location, and `TripService` |
| Location all the time (`ACCESS_BACKGROUND_LOCATION`) | Once, on the first trip, after location's allowed. Android 11 and later ask it on a settings page | Not needed for a trip, which runs as a foreground service; asked as decided for future features. The trip works without it |
| Notifications | First trip, or turning on Service alerts | Alerts, and the trip's own notification |
| Calendar | Only when you pick "Use this phone's calendar" | `PhoneCalendarPlugin` |
| NFC | Not asked: Android grants it | `CardPlugin` |
| Install unknown apps | First update | `UpdateActivity` |

If the app ever goes on Google Play, that build has to drop `UpdateActivity` and
`REQUEST_INSTALL_PACKAGES` (Play updates apps itself), and would need Play's declaration for
background location.

### Card value

CEPAS cards (EZ-Link and NETS FlashPay) hold their value in a purse that CEPAS's Read Purse
command reads without a key. `CardPlugin` reads it in NFC reader mode and nothing is written.
The layout is FareBot's and Metrodroid's, which read the same cards. Cards on SimplyGo's
account-based ticketing keep their value in the account, so the card's own figure can be out
of date for them, and the page says so. **It hasn't been tried on a real card yet**: if the
first read says "couldn't be read as an EZ-Link or NETS FlashPay card", the command bytes in
`READ_PURSE` are where to look.

## The project

```text
android/
  package.json, package-lock.json   Capacitor and its push plugin
  capacitor.config.json             the site's address, and where the native project is
  www/offline.html                  shown when the site can't load at all (first launch offline)
  native/                           the Android Studio / Gradle project
  build-apk.ps1                     builds the signed APK into release/<version>/
  FIREBASE-SETUP.md                 setting up push notifications
```

`npx cap sync android` (which the build script runs) copies `www/` and the config into
`native/` and links the plugins from `node_modules`. What it writes is kept out of git.

## Build the APK

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

It installs the packages if they're missing, syncs, builds with Gradle and checks the
signature, then puts the APK in `release/<version>/sg-bus-timings-<version>.apk`. It needs a
JDK 21 or later (it finds the newest under Program Files, or `JAVA_HOME`) and the Android SDK
(`ANDROID_HOME`, or the one Bubblewrap left in `~/.bubblewrap`). Gradle fetches any SDK
platform it's missing.

For a new version, raise `versionName` and `versionCode` in `native/app/build.gradle`; a phone
only takes a higher `versionCode` as an update. Raise `desktop/package.json`'s `version` to the
same: the apps share version numbers.

Without `native/app/google-services.json` the app builds and works, but can't get
notifications from the server. See `FIREBASE-SETUP.md`.

To try changes on a phone over USB, open `native/` in Android Studio and run it, or
`native\gradlew.bat installDebug` with the phone plugged in and USB debugging on.

## The signing key

`android.keystore` and its passwords in `keystore.properties` are kept out of git. **Back both
up somewhere safe.** An APK signed with a different key can't update one already installed, and
the site's `main-site/.well-known/assetlinks.json` lists this key's SHA-256 fingerprint, which is
what lets the site's links open in the app:

```text
4E:D5:3F:F1:F4:CB:4E:5E:A7:CB:C1:28:46:48:F6:2E:B3:90:47:EB:C2:9B:25:20:F5:7D:FE:5B:76:CB:44:EB
```

`build-apk.ps1` refuses an APK signed with any other key.

## Google's developer verification

From 30 September 2026, Android in Singapore (with Brazil, Indonesia and Thailand) checks that
apps come from a verified developer, starting with installs through participating app stores,
with more to follow in 2027. To stay ahead of it and keep Play Protect from warning about the
APK:

1. Sign up on the [Android Developer Console](https://developer.android.com/developer-verification/guides/android-developer-console).
   **Full distribution** (US$25 once, ID check) to share it with anyone; **limited** (free, up
   to 20 named devices) only for testing.
2. Register the package `org.uwuapps.sgbus` with the SHA-256 fingerprint above.
3. As the package already exists, the Console asks for an APK signed with this key to prove
   it's yours: it says what to put in it.

Check [Google's guide](https://developer.android.com/developer-verification/guides) for the
current steps; they were still settling in October 2026.

## Install it

Copy the APK to the phone and open it. Android asks to allow installing apps from wherever it
was opened (Files, Chrome, Telegram); allow it once. A copy of `org.uwuapps.sgbus` signed with
another key, say from PWABuilder, has to be uninstalled first.

## Changing it

- **The site's address, the user agent, the status bars**: `capacitor.config.json`, then
  `npx cap sync android`.
- **Permissions, activities, links**: `native/app/src/main/AndroidManifest.xml`.
- **A new plugin of this app's own**: a `Plugin` class like `CardPlugin`, registered in
  `MainActivity.onCreate`, called from the page with `AppBridge.call('Name', 'method', {...})`.
- **A Capacitor plugin from npm**: `npm install` it here, then `npx cap sync android`; the page
  reaches it the same way.
- **Upgrading Capacitor**: raise all three `@capacitor/*` versions together, `npm install`,
  `npx cap sync android`, and compare `native/` with a fresh `npx cap add android` for template
  changes.
