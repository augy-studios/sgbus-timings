# SG Bus Timings for Android

The Android app, `org.uwuapps.sgbus`: the web app at sgbus.uwuapps.org in a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity),
made with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). It shows the site full
screen in Chrome, so the site's own updates reach it at once; the app itself only needs
building again for its native parts. The APK is small (about 700 KB) for the same reason: it
holds the shell, and the site's service worker caches the rest on first launch.

Shared as an APK file for now, through GitHub Releases: see `release/README.md`. From 1.2.0 it
updates itself from there.

## What it adds to the site

Bubblewrap's usual parts: the launcher icon, splash screen, shortcuts (Near me, Navigate,
Service alerts), the share menu entry (Google Maps places into Navigate), notifications and
location through Chrome. Then its own, in `app/src/main/java/org/uwuapps/sgbus/`:

| File | What it does |
|---|---|
| `OpenAppActivity.java` | Opens another app by its package, as a native app does, for the site's SimplyGo button (`main-site/script.js`, "SimplyGo"). A web page can't. Only the apps listed in it can be opened, each also named under `<queries>` in `AndroidManifest.xml`. |
| `AppBridge.java` | A message channel to the site's pages (Chrome's [postMessage for TWAs](https://developer.chrome.com/docs/android/post-message-twa), Chrome 115+), answered by `main-site/js/app-bridge.js`. Says hello as each page loads, with what the app can do, and answers its requests. |
| `CalendarReader.java` | The phone's calendar events with a location, for the site's Calendar tab, over AppBridge. Every calendar on the phone; Android expands repeating events. |
| `CalendarPermissionActivity.java` | The calendar permission prompt, which the page links to when it isn't given yet; settings instead, once it's been refused for good. |
| `UpdateActivity.java` | Updates the app to its newest GitHub release, for the site's update bar (`main-site/js/app-update.js`). Asks `main-site/api/app-release.js` for the newest version, downloads its APK from this repository's releases only, checks GitHub's SHA-256, that it's this app and a higher `versionCode`, then hands it to Android's installer, which asks you to confirm. Needs `REQUEST_INSTALL_PACKAGES`, and "Install unknown apps" allowed once, which it sends you to. |
| `LauncherActivity.java` | Bubblewrap's, plus AppBridge's hooks, and `uwu://sgbus/` links turned into the site's addresses: `uwu://sgbus/84009` a stop, `uwu://sgbus/bus/22`, `uwu://sgbus/nav`, `uwu://sgbus/go/<id>` a share link. Only the `sgbus` host, so other UwU Apps can answer `uwu://` links of their own. |

The site's links into the app: `intent://open/simplygo#Intent;scheme=org.uwuapps.sgbus;...`
(OpenAppActivity), `intent://calendar/permission#Intent;scheme=org.uwuapps.sgbus;...`
(CalendarPermissionActivity) and `intent://update#Intent;scheme=org.uwuapps.sgbus;...`
(UpdateActivity). Each names this package, so a phone without the app takes the link's
fallback, or nothing happens.

If the app ever goes on Google Play, that build has to drop UpdateActivity and
`REQUEST_INSTALL_PACKAGES`: Play updates apps itself, and doesn't allow apps that install others.

AppBridge reads android-browser-helper's TwaLauncher session by its field's name, so that
library stays at 2.5.0 (`app/build.gradle`), and `app/proguard-rules.pro` keeps the name through
R8. If a newer version moves it, the calendar just stops reaching the page; nothing else
breaks. The site lists the app with `use_as_origin` as well as `handle_all_urls` in
`main-site/.well-known/assetlinks.json`, which the message channel needs.

## Build the APK

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

It lands in `release/` at the project root as `sg-bus-timings-<version>.apk`, signed and ready
to share. For a new version, raise `appVersion` and `appVersionCode` in `twa-manifest.json`, and
`versionName` and `versionCode` in `app/build.gradle`, to the same; a phone only takes a higher
`versionCode` as an update.

`bubblewrap build` would do the same, but fails on Windows with newer Node ("spawn EINVAL"), so
the script runs its steps itself: Gradle, zipalign, apksigner, and a signature check. It uses
the JDK and Android SDK Bubblewrap keeps in `~/.bubblewrap`; the JDK there must be the 64-bit
one (`config.json`'s `jdkPath`), as Gradle can't get the memory it needs from a 32-bit one.

## The signing key

`android.keystore` and its passwords in `keystore.properties` are kept out of git. **Back both
up somewhere safe.** An APK signed with a different key can't update one already installed, and
the site's `main-site/.well-known/assetlinks.json` lists this key's SHA-256 fingerprint, which is
what lets the app show the site without an address bar, and open a message channel to it:

```text
4E:D5:3F:F1:F4:CB:4E:5E:A7:CB:C1:28:46:48:F6:2E:B3:90:47:EB:C2:9B:25:20:F5:7D:FE:5B:76:CB:44:EB
```

## Install it

Copy the APK to the phone and open it. Android asks to allow installing apps from wherever it
was opened (Files, Chrome, Telegram); allow it once. A copy of `org.uwuapps.sgbus` signed with
another key, say from PWABuilder, has to be uninstalled first.

## Changing the app

Edit `twa-manifest.json` for the name, colours, icons, shortcuts and so on, then regenerate with
`bubblewrap update --skipVersionUpgrade`. That rewrites some files, so put this app's own parts
back afterwards, each marked "Not Bubblewrap's":

- `AndroidManifest.xml`: `<queries>`, the `READ_CALENDAR`, `INTERNET` and
  `REQUEST_INSTALL_PACKAGES` permissions, the `uwu://sgbus` `<intent-filter>` on
  LauncherActivity, the `OpenAppActivity`, `CalendarPermissionActivity` and `UpdateActivity`
  `<activity>` entries, the `UpdateActivity$InstallStatus` `<receiver>`, and the
  `PostMessageService` `<service>`.
- `app/build.gradle`: `proguardFiles 'proguard-rules.pro'` and the `androidx.browser`
  dependency.
- `LauncherActivity.java`: `createTwaLauncher`, `getCustomTabsCallback` and `fromAppLink`.

The other Java files, `res/values/update.xml`, `res/values-night/update.xml` and
`proguard-rules.pro` are kept as they are. Check `git diff` after an
update to see what it changed.
