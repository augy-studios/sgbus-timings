# Putting SG Bus Timings on Google Play

A step-by-step guide for publishing the Android app on Google Play, written for this repo as it
stands on 2.2.8, ahead of the 3.0.0 release.

**Phone app only.** Augy has decided the Wear OS watch app stays off Google Play for now. It is
built and shipped the way it is today, and section 8 says what adding it later would take.

Written 28 October 2026 (Help desk #13). Google changes its Play rules often, so every rule below
names the official page it came from; re-check a page if the date here is far behind you.

**Nothing in this guide has been done yet.** It describes changes to make and steps to take. The
code changes in sections 4, 6 and 7 are not in the repo.

## Who does what

| Tag | Meaning |
|---|---|
| **[Augy]** | A hand step only Augy can do: his Google account, his money, his ID, his decisions, his clicks in Play Console |
| **[Dev]** | A change to this repo, made on a `help/*` branch and reviewed and merged by Augy |
| **[Windows]** | A build step. There is no Android SDK on the Mac, so builds run on the Windows PC, as `android/build-apk.ps1` does today |

## Contents

1. [The short version](#1-the-short-version)
2. [What the app is today](#2-what-the-app-is-today)
3. [Decisions Augy has to make](#3-decisions-augy-has-to-make)
4. [Will Play installs update the GitHub APK? (the signing and "suffix" question)](#4-will-play-installs-update-the-github-apk-the-signing-and-suffix-question)
5. [Step 1: Bump everything to 3.0.0](#5-step-1-bump-everything-to-300)
6. [Step 2: SDK levels and what Play will not allow](#6-step-2-sdk-levels-and-what-play-will-not-allow)
7. [Step 3: Play updates instead of GitHub updates](#7-step-3-play-updates-instead-of-github-updates)
8. [Step 4: The Wear OS app (left out for now)](#8-step-4-the-wear-os-app-left-out-for-now)
9. [Step 5: Build the .aab (Windows)](#9-step-5-build-the-aab-windows)
10. [Step 6: Developer account](#10-step-6-developer-account)
11. [Step 7: Create the app and fill in Play Console](#11-step-7-create-the-app-and-fill-in-play-console)
12. [Step 8: Testing tracks, then production](#12-step-8-testing-tracks-then-production)
13. [After launch](#13-after-launch)
14. [Final checklist](#14-final-checklist)
15. [What could not be checked](#15-what-could-not-be-checked)
16. [Sources](#16-sources)

---

## 1. The short version

- The phone app already targets **API 36** and compiles against 36. Play requires 36 for new
  phone apps (from 31 August 2026), so the SDK level needs no change.
- Google Play only takes an **Android App Bundle (.aab)**, not the APK that the GitHub releases use.
- The app must be signed through **Play App Signing**. The big choice is whether Play signs with
  your **existing key** (so people who installed the GitHub APK can update from Play) or a new
  Google-made key (they cannot). This guide recommends bringing the existing key. See section 4.
- The GitHub updater (`UpdateActivity`) and four permissions Play does not allow have to be left out
  of the Play build. Do that with a **`play` build flavor** that keeps the same `applicationId`.
  See sections 6 and 7.
- The watch app is **not** going on Play for now. It keeps shipping as a GitHub APK. See section 8.
- A personal developer account made after 13 November 2023 needs a **closed test with at least 12
  testers opted in for 14 days in a row** before it can apply for production. See section 10.

---

## 2. What the app is today

Everything here was read from the repo.

| Thing | Value | Where |
|---|---|---|
| Phone app id | `org.uwuapps.sgbus` | `android/capacitor.config.json`, `android/native/app/build.gradle` (`applicationId`, `namespace`) |
| applicationIdSuffix / flavors | None. One variant, `release` | `android/native/app/build.gradle` |
| Version | `versionName "2.2.8"`, `versionCode 24` | `android/native/app/build.gradle` |
| minSdk | 24 (Android 7) | `android/native/variables.gradle` |
| compileSdk / targetSdk | 36 / 36 | `android/native/variables.gradle` |
| Build tools | Android Gradle Plugin 8.13.0, Capacitor 8.5.3, JDK 21+ | `android/native/build.gradle`, `android/package.json` |
| What the app is | The live site `https://sgbus.uwuapps.org` in Capacitor's WebView, plus native plugins | `capacitor.config.json` (`server.url`) |
| Signing | Release APKs signed with `android/android.keystore`, read through `android/keystore.properties`. Both are kept out of git, and are not opened or copied in this guide | `build.gradle` (`signingConfigs.release`), `android/.gitignore` |
| Signing key fingerprint (public) | SHA-256 `4E:D5:3F:F1:...:76:CB:44:EB`; `build-apk.ps1` refuses any other key | `android/README.md` |
| Push notifications | Firebase Cloud Messaging; `google-services.json` kept out of git | `android/FIREBASE-SETUP.md` |
| How people get it today | APK from GitHub Releases (tag `android-v<version>`); the app updates itself from there | `release/README.md`, `UpdateActivity.java`, `main-site/js/app-update.js`, `main-site/api/app-release.js` |
| Watch app today | Not on Play, and stays off it for now. `sg-bus-timings-<version>-watch.apk`, attached to the GitHub release and installed by hand over `adb` Wi-Fi debugging | `docs-site/content/web/wear-os.md` |
| Build | `powershell -ExecutionPolicy Bypass -File android\build-apk.ps1` builds both signed APKs into `release/<version>/` | `android/build-apk.ps1` |
| Languages | English, Chinese (`zh-SG`), Malay (`ms`), Tamil (`ta`) in the site; the native app's own few strings are English only | `main-site/i18n/` |
| Ads | None | `docs-site/content/help/privacy.md` |
| Analytics | Google Analytics (gtag) on the site, which loads inside the app's WebView too | `main-site/index.html` |
| Privacy policy | Already written: `docs-site/content/help/privacy.md`, live at `https://guide.sgbus.uwuapps.org/help/privacy` (check the exact address) | docs-site |

Two more facts matter for Play:

- `main-site/.well-known/assetlinks.json` lists **two** signing fingerprints for `org.uwuapps.sgbus`.
  One is the current key. The other is probably the key from the old Bubblewrap/PWABuilder app
  (1.x); this was not checked. The site's links open in the app only if the signing key is listed
  there, so **Play's signing key has to be added** if it differs (section 4).
- The `capacitor.config.json` user agent suffix `SGBusTimingsApp/2` is read by nothing else in
  the repo. Raise it to `/3` if you like; it is not needed.

---

## 3. Decisions Augy has to make

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Which signing key does Play use?** (a) A new key made by Google, or (b) the existing key, brought to Play App Signing | **(b) the existing key.** Then the Play app and the GitHub APK are signed the same, and people can move between them without uninstalling. See section 4. Decide before the first release leaves internal testing, since the key can only be changed before then |
| D2 | **Keep the package name `org.uwuapps.sgbus`, or add a suffix?** | **Keep it, no suffix.** The package name on Play is permanent, the watch pairing, Firebase, `assetlinks.json` and about a dozen links in the site's code all use it, and a suffix only helps if you want two separate apps side by side (section 4) |
| D3 | **Personal or organisation account?** | Personal is the quick, $25 route and it needs the 12-tester, 14-day closed test. An organisation account does not have that rule (Play's page says the testing requirement is for personal accounts), but needs more paperwork (section 10) |
| D4 | **Keep publishing the GitHub APK too?** | Yes, for now. It is the only way for phones without Play and for the desktop/CLI users. It keeps its own updater (the `github` flavor) |
| D5 | **Background location ("Allow all the time")**: keep it in the Play build or drop it? | **Drop it from the first Play release.** Google only approves it for core features, and calls "convenience" a minimal benefit. It is used only by "Timings near a stop" (geofences when the app is closed); trips run as a foreground service and do not need it. Add it later, with a video, if you want that reminder on Play. See section 6 |
| D6 | **Exact alarms** (`USE_EXACT_ALARM`) for Last bus and Time to leave | **Leave it out of the Play build.** Play allows it only for alarm and calendar apps. The code already falls back to a slightly inexact alarm without it (`LastBus.java`, `Routines.java`, `LeaveTime.java`). Optionally ask for `SCHEDULE_EXACT_ALARM` instead (the user grants it) |
| D7 | **Who is the app for?** (target audience) | "13 and over" or "18 and over", not children. A kids' target brings extra Families-policy rules |
| D8 | **The watch app**: ship it on Play with the first release, or later? | **Decided by Augy: not on Play for now.** Phone app only. The watch stays a GitHub APK (section 8) |
| D9 | **Same version series for GitHub and Play?** | Yes: both 3.0.0, same `versionCode` unless a Play upload needs a retry (section 5) |

---

## 4. Will Play installs update the GitHub APK? (the signing and "suffix" question)

The friend's warning, "your old app will not be the same since your app will have different
suffixes", is about two things that make Android treat two copies as different apps: the
**package name (applicationId)**, including any suffix a build flavor adds to it, and the
**signing key**. Android only lets one copy replace another if **both match**. Either one
different, and the new copy cannot install over the old one: the person has to uninstall first,
and uninstalling deletes the app's local data.

Here is what that means for THIS app.

### What stays the same either way

- The app's `applicationId` is `org.uwuapps.sgbus` in `build.gradle` and `capacitor.config.json`.
  There is no suffix today.
- The site's code builds Android links to that exact name: `intent://...;package=org.uwuapps.sgbus;end`
  in `main-site/script.js` (SimplyGo), `main-site/js/trip.js` (MyICA), `main-site/js/calendar.js`
  and `main-site/js/app-update.js`. The shortcuts file (`res/xml/shortcuts.xml`) names it as
  `targetPackage`, and the `org.uwuapps.sgbus://` link scheme comes from `strings.xml`
  (`custom_url_scheme`). All of these would need changing for a different package name, and the
  live site serves old apps and new apps the same code.

### The three ways to do it

| | Option 1: Google makes a new signing key | Option 2: bring the existing key (recommended) | Option 3: a different package name (suffix) |
|---|---|---|---|
| Package on Play | `org.uwuapps.sgbus` | `org.uwuapps.sgbus` | e.g. `org.uwuapps.sgbus.play`, permanent |
| Key that signs the Play build | Google's | **The same as the GitHub APK** | Google's or the same, your choice |
| Play build over a GitHub-APK install | **Refused.** Same package, different key. Uninstall first | **Allowed.** Play offers it as an update | Installs beside it as a second app |
| GitHub APK over a Play install | Refused | Allowed | Separate app |
| Local data (favourites, places, settings) | Lost on uninstall unless moved first | **Kept** | Not shared; copy by hand |
| Watch app pairing (the GitHub watch APK, not on Play) | **Breaks.** The watch APK stays signed with the existing key, and the Wearable Data Layer needs the same package and key on both | Works | Needs the new package on both |
| Work needed | Add Google's fingerprint to `assetlinks.json` | Nothing extra; `assetlinks.json` already lists the key | New Firebase app + `google-services.json`, new `assetlinks.json` entry, change ~12 places that hard-code the name, a second app for users to confuse |

### Recommendation

**Option 2, with no `applicationIdSuffix`**, and a `play` / `github` build flavor pair that differ
only in what is in them (section 7), not in their package name.

- With Play App Signing you can "supply your own" key instead of the one Google makes. For a
  **new** app the step is **Change key** on the Play app signing page, before the release goes out
  to open testing or production. You export the existing key with Google's **PEPK tool**, and
  Play Console shows the exact command to run, with the encryption key it wants you to use. Do
  that on the Windows PC that holds `android.keystore`. [Augy]
- Play then signs what people download with that same key, so the Play app and the GitHub APK
  have the same signature. Google's page for this: [Play App Signing][signing].
- Keep your own copy of the keystore and its backup anyway: the GitHub APK is still signed with it.
- Play recommends a **separate upload key** for signing the .aab you upload (it can be reset if
  lost; the app signing key cannot). Make a new one for uploads. It must be kept out of git too:
  `android/.gitignore` already ignores `*.keystore` and `keystore.properties`; a differently
  named `upload-keystore.properties` would need adding to it.
- `build-apk.ps1` refuses any APK signed with a different key. A new `build-aab.ps1` for the .aab
  must skip that check, because the .aab is signed with the upload key, not the app signing key
  (section 9).
- Play's key is the one Android checks for App Links. If Option 2 is chosen, `assetlinks.json`
  needs nothing new; with Option 1, copy the SHA-256 from Play Console (Protected with Play,
  Manage Play app signing, App signing key) and add it, as Google's page says.

### What happens to people already using the GitHub APK

With Option 2, and the same `applicationId`:

1. They keep using their GitHub APK. It still updates itself from GitHub (the `github` flavor
   keeps the updater).
2. If they later install **SG Bus Timings from Play**, Play should treat it as an update to the
   app they have. This was not checked against a Google page; test it (section 12) with a phone
   that has the 2.2.8 APK, before telling anyone.
3. After that, they get Play's updates. Their favourites, places, trips and settings stay, since
   Android keeps the app's data across an update.
4. The GitHub updater and "New versions of the app" notifications only ever offer GitHub's
   APK. The Play build does not have them (section 7).

With Option 1 or 3, the move needs their data copied first.

### Local data, and how to move it

Favourites, places, trips, routines, past searches, your name and settings live in the site's
browser storage inside the app (`docs-site/content/help/privacy.md`, "Kept in your browser"). There
is **no account and no export-to-file**. Uninstalling the app deletes them. The ways to move them
(`docs-site/content/web/sync.md`):

- **Sync** (Settings, "Sync with another device or Telegram"): copy to another device with a
  6-letter code. Both devices must be on the same Wi-Fi.
- **Sync with the Telegram bot**: copy everything to the bot, uninstall, reinstall, and copy it back.
  This works with one phone.

The app sets `android:allowBackup="true"`, so Android's own backup may restore the app's data
after a reinstall on a phone with Google backup on. Whether it covers the WebView's storage was
not checked, so do not promise it.

Under Option 2 none of this is needed; it is the fallback if the key plan changes.

---

## 5. Step 1: Bump everything to 3.0.0

[Dev] The apps "share version numbers", so raise all of these together (`android/README.md`,
`release/README.md`).

| File | Change |
|---|---|
| `android/native/app/build.gradle` | `versionName "3.0.0"` and `versionCode 24` (or higher). **This is the one that matters on Play.** The GitHub watch APK reads both from here, so it follows by itself |
| `desktop/package.json` | `"version": "3.0.0"` |
| `desktop/package-lock.json` | `"version"` at lines 3 and 9 (`npm install --package-lock-only` does it) |
| `cli/package.json` | `"version": "3.0.0"`. `cli/build.mjs` stops the build if it differs from `desktop/package.json` |
| `cli/package-lock.json` | Not present in the repo, so nothing to change |
| `android/capacitor.config.json` | Optional: `appendUserAgent` `SGBusTimingsApp/2` to `/3`. Nothing reads it |
| `main-site/sw.js` | `VERSION = "v124"` is the site's cache version, not the app's. Raise it only if site files changed |
| `android/package.json`, `main-site/package.json`, `docs-site/package.json` | No version field. Leave alone |

Docs that quote the old number (update them in the same commit, for a tidy release):
`android/README.md`, `cli/README.md` (the `.deb` file name in the install lines),
`desktop/LINUX-BUILD.md` (examples), `docs-site/content/web/linux-cli.md`,
`main-site/README.md` and `main-site/PATCHNOTES.md` (a 3.0.0 entry).

Version codes on Play:

- Every upload needs a **higher** `versionCode` than any earlier upload, even a test one.
  The maximum is 2,100,000,000 ([Play Console help][release]). `versionName` is only for display.
- If a Play upload is refused or you need a second try, raise `versionCode` but keep
  `versionName "3.0.0"`. GitHub and Play can then have different `versionCode`s for the same name.
  Bring them level again at the next release.
- Don't make the GitHub release for 3.0.0 until the Play build is final, or the tag and the
  code will not match.

Release folder: `build-apk.ps1` will write `release/3.0.0/`. The GitHub tag stays
`android-v3.0.0` (`release/README.md`): the old apps' updater and the "new version" push find it by
that name.

---

## 6. Step 2: SDK levels and what Play will not allow

### Target API: already met

Google's rule ([target API level page][target]), current as of this guide:

| | New apps and updates | This app |
|---|---|---|
| Phone and tablet | **API 36** or higher, from 31 August 2026 | `targetSdk 36`, `compileSdk 36` |

So no SDK change is needed. The 2.x releases already ran with the API 36 behaviour changes that Android
documents (edge-to-edge always on, predictive back, large-screen rotation limits). `capacitor.config.json`
sets `SystemBars.insetsHandling` to `css`, and `MainActivity` already handles Back with
`OnBackPressedCallback`. Still, check on a tablet or a Chromebook, since Android 16 ignores
fixed-orientation settings on screens 600dp wide and up
([Android 16 behavior changes][a16]).

**16 KB memory pages**: from 1 February 2027, updates that target API 35+ must support 16 KB pages
on 64-bit devices, but the rule is about native code ([page sizes][pagesize]). This app's own code is
Java, and ML Kit text recognition comes from Google Play services, not bundled. Once the bundle is
built, check it has no `.so` files (section 9).

### Things Play will refuse in the Play build

The manifest (`android/native/app/src/main/AndroidManifest.xml`) has four items that its own comments
already call "not allowed on Google Play". The `play` flavor removes them.

| Item | Why | What the Play build does instead |
|---|---|---|
| `REQUEST_INSTALL_PACKAGES`, and `UpdateActivity` (with its `InstallStatus` receiver) | An app on Play can only update through Play. Self-installing APKs is the GitHub build's job | Removed. Updates come from Play (section 7) |
| `USE_EXACT_ALARM` | Allowed only for alarm/timer apps and calendar apps that show event notifications. Others "will be disallowed from publishing on Google Play" ([exact alarm policy][alarm]) | Removed. `LastBus`, `Routines` and `LeaveTime` already fall back to inexact alarms. The existing `SCHEDULE_EXACT_ALARM` line (max SDK 32) stays harmless |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Comment in the manifest: "Not allowed on Google Play for an app like this one" | Removed. `SgBusPlugin.batteryIntent` should return only `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (the list), which needs no permission, in the Play build |
| `ACCESS_BACKGROUND_LOCATION` (decision D5) | Must pass the permission declaration; only "core functionality" counts, and "convenience" is a minimal benefit ([background location][bgloc]) | Removed in the first Play release. `NearStops.canWatch()` already returns false without it, so "Timings near a stop" simply stays off and `main-site/js/reminders.js` already shows a message |

If you decide to keep background location on Play, the Play Console form is under App content,
Sensitive app permissions, Location permissions. You can declare only **one** feature that needs it,
and you must show an in-app disclosure (before the permission prompt, mentioning "location" and
"when the app is closed"), put the same wording in the store description, and record a short
video of it ([background location policy][bgloc]).

### Permissions the Play build still has, and what Play will ask

| Permission | What for | Play Console form |
|---|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Near me, Navigate, live map, trips | Data safety (Location) |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (`TripService`, type `location`) | Following a trip with the screen off | **Foreground service declaration** under App content: describe the feature, what happens if it is interrupted, and give a **video link** showing the user starting a trip. The use case to pick is navigation / ride tracking ([FGS declaration][fgs]) |
| `POST_NOTIFICATIONS` | Service alerts, Get Off Alert | None. Already asked at run time |
| `READ_CALENDAR` | Navigate's Calendar tab, only if the user picks "Use this phone's calendar" | Data safety (Calendar). The page reads event locations and the server searches them, so declare it |
| `ACTIVITY_RECOGNITION` | "On a bus?" reminder, Play services on-device | Data safety (Physical activity), processed on the device |
| `NFC`, host card emulation service (`ShareTagService`) | Card value, Offline Sharing | None, but mention NFC in the description |
| `CAMERA` | Scan a stop's code (ML Kit on device) | Data safety: not collected |
| `BLUETOOTH_*`, `NEARBY_WIFI_DEVICES`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE` | Offline Sharing (Nearby Connections) | None |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`, `ACCESS_NETWORK_STATE` | Reminders, alerts, networking | None |

[Dev] Also set up the flavors as in section 7 so the manifest changes sit in `src/play/`.

---

## 7. Step 3: Play updates instead of GitHub updates

### Why

Today the app checks GitHub: `main-site/js/app-update.js` asks `/api/app-release`
(`main-site/api/app-release.js`), shows the "Version X of the Android app is out" bar, and
`UpdateActivity` downloads the APK and hands it to Android's installer. The "New versions of
the app" switch in Service alerts pushes to the FCM topic `sgbus-releases`, driven by a GitHub
webhook. None of that is allowed or useful on Play.

Google Play's **in-app updates** do the same job: they work "only on Android mobile devices,
tablets and ChromeOS", API 21+, and the app has to have been installed from Play
([in-app updates][inapp]). Update types:

- **Flexible**: downloads in the background while the person keeps using the app; the app then
  asks to restart. Fits a bus app.
- **Immediate**: a full-screen block until the update is installed. Keep it for an emergency.

The friend recommends flexible, checked on every open. That is what the sketch below does.

### How: a build flavor, not a package suffix

Android's [build variants][variants] let one module build two products from the same code:

```groovy
// android/native/app/build.gradle
android {
    flavorDimensions = ["channel"]
    productFlavors {
        github { dimension "channel" }   // today's app: updates itself from GitHub
        play   { dimension "channel" }   // Play's: no self-updater, Play in-app updates
    }
    // NO applicationIdSuffix: both stay org.uwuapps.sgbus (section 4).
}

dependencies {
    playImplementation 'com.google.android.play:app-update:2.1.0'
}
```

A `debug` suffix such as `.debug` for development builds is fine if you want it, but then
`google-services.json` needs a matching client; skip it unless it is wanted.

This is the same idea as the examples the friend linked: a
[Stack Overflow answer on flavors](https://stackoverflow.com/questions/17976050) and
[KeePassDX's `build.gradle.kts`](https://github.com/Kunzisoft/KeePassDX/blob/master/app/build.gradle.kts),
which builds a Play variant and a "libre" one from one source tree. The alternative the friend
mentioned, a build-time variable, can be done with `buildConfigField`
(`buildConfigField "String", "UPDATE_CHANNEL", '"play"'`), but a manifest permission cannot be
removed by a variable, so the flavor's `src/play/AndroidManifest.xml` is needed anyway.

Files (all [Dev]):

```text
android/native/app/src/
  main/                 everything shared (as today), minus UpdateActivity
  github/java/org/uwuapps/sgbus/UpdateActivity.java   moved here, unchanged
  github/java/org/uwuapps/sgbus/Channel.java          (below)
  github/res/values/update.xml, values-night/update.xml   moved with it
  play/AndroidManifest.xml                            removals (below)
  play/java/org/uwuapps/sgbus/UpdateActivity.java     tiny stub: static check(Activity, String) does nothing
  play/java/org/uwuapps/sgbus/Channel.java            (below)
  play/java/org/uwuapps/sgbus/PlayUpdatePlugin.java   (below)
```

`MainActivity` calls `UpdateActivity.check(this, version)` (line ~200), so Play needs the stub, or
that call goes behind `Channel`. The `UpdateActivity` entries move out of `main/AndroidManifest.xml`
into `src/github/AndroidManifest.xml`.

`src/play/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" tools:node="remove" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" tools:node="remove" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" tools:node="remove" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove" />
</manifest>
```

(Removing the permission lines from `main` instead, and adding them back in `src/github/`, is
equivalent and a little tidier.)

### The Java side (sketch, not compiled)

`Channel.java` is the one place the two builds differ, so `MainActivity` and `SgBusPlugin` stay
the same for both:

```java
// src/play/java/org/uwuapps/sgbus/Channel.java
final class Channel {
    static final String NAME = "play";
    static void register(BridgeActivity a) { a.registerPlugin(PlayUpdatePlugin.class); }
    static void features(JSArray f) { f.put("playupdate"); }   // not "update", "checkupdate" or "releases"
}
// src/github/java/org/uwuapps/sgbus/Channel.java
final class Channel {
    static final String NAME = "github";
    static void register(BridgeActivity a) { }
    static void features(JSArray f) { f.put("update"); f.put("checkupdate"); /* "releases" is added by SgBusPlugin if Firebase is set up */ }
}
```

In `MainActivity.onCreate`, next to the other `registerPlugin` calls: `Channel.register(this);`.
In `SgBusPlugin.info()`, replace `features.put("update")` and `features.put("checkupdate")` with
`Channel.features(features);`, add `out.put("channel", Channel.NAME);`, and wrap
`features.put("releases")` in `if (!"play".equals(Channel.NAME))`, since the Play build must not
offer the GitHub "new versions" switch.

```java
// src/play/java/org/uwuapps/sgbus/PlayUpdatePlugin.java
@CapacitorPlugin(name = "PlayUpdate")
public class PlayUpdatePlugin extends Plugin {
    private AppUpdateManager manager;
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private InstallStateUpdatedListener listener;

    @Override public void load() {
        manager = AppUpdateManagerFactory.create(getContext());
        launcher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), result -> { /* declined or failed: ask again next open */ });
        listener = state -> {
            JSObject s = new JSObject();
            s.put("status", state.installStatus() == InstallStatus.DOWNLOADED ? "downloaded"
                          : state.installStatus() == InstallStatus.DOWNLOADING ? "downloading" : "other");
            notifyListeners("state", s);
        };
        manager.registerListener(listener);
    }

    // { available, downloaded, versionCode, staleDays } for the page to decide with.
    @PluginMethod public void check(PluginCall call) {
        manager.getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                JSObject o = new JSObject();
                o.put("available", info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                        && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
                o.put("downloaded", info.installStatus() == InstallStatus.DOWNLOADED);
                o.put("versionCode", info.availableVersionCode());
                o.put("staleDays", info.clientVersionStalenessDays());   // may be null
                call.resolve(o);
            })
            .addOnFailureListener(e -> call.reject("Couldn't check Google Play."));
    }

    @PluginMethod public void start(PluginCall call) {
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                    && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                manager.startUpdateFlowForResult(info, launcher,
                    AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build());
            }
            call.resolve();
        }).addOnFailureListener(e -> call.reject("Couldn't start the update."));
    }

    @PluginMethod public void restart(PluginCall call) {   // after "downloaded": installs and restarts
        manager.completeUpdate();
        call.resolve();
    }

    @Override protected void handleOnDestroy() { manager.unregisterListener(listener); }
}
```

This follows the Java snippets on Google's [in-app updates guide][inappjava] (`getAppUpdateInfo`,
`startUpdateFlowForResult` with `AppUpdateOptions`, `InstallStateUpdatedListener`, `completeUpdate`).
The `app-update` library there is version 2.1.0. Compile it and try it before relying on it.
Google also says to check for a downloaded-but-not-installed update whenever the app comes back
(`onResume`), which the page does below on every open.

### The web side (`main-site/js/app-update.js`)

The site is served to every version of the app at once, so the Play code has to be a branch that old
apps never take. The Play build says `playupdate`; the GitHub builds never do.

```js
// in AppBridge.ready(5000).then((inApp) => { ... }), before the existing check():
if (AppBridge.has('playupdate')) {
  playUpdates();
  return;                       // skip the GitHub check, the "Download" bar and the releases switch
}

async function playUpdates() {
  const run = async () => {
    try {
      const r = await AppBridge.call('PlayUpdate', 'check');
      if (r.downloaded) showRestartBar();                      // already downloaded: just ask to restart
      else if (r.available) await AppBridge.call('PlayUpdate', 'start');   // Play's own prompt, downloads in the background
    } catch { /* offline or not installed from Play: try next time */ }
  };
  AppBridge.on('PlayUpdate', 'state', (s) => { if (s.status === 'downloaded') showRestartBar(); });
  run();                                                     // every time the app opens
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();       // and when it comes back to the front
  });
}

function showRestartBar() {   // reuse the .app-update-notice markup
  // "An update has been downloaded." [Restart] -> AppBridge.call('PlayUpdate', 'restart')
}
```

Also in the same file:

- `offerApp()` (the bar in Android's browsers that offers the GitHub APK) runs only outside the
  app, so it is unchanged, but its link can point to the Play page once the app is live.
- The Edge Tray's "Check for app updates" button is shown only when `AppBridge.has('checkupdate')`,
  and the Play build doesn't say that, so it stays hidden. Likewise the "New versions of the app"
  switch needs `releases`, so it is hidden.
- `main-site/api/push/release.js`'s `sgbus-releases` topic keeps serving the GitHub builds.

Because the site is live for everyone, **deploy the site change before** (or with) the Play
release, and check that 2.2.8 and 3.0.0 GitHub builds still behave.

### Testing it

Google's [test guide][inapptest]: install a version from an **internal app sharing** link, upload
a build with a **higher `versionCode`**, open that link without installing, then launch the
installed app. The account must own the app and have downloaded it from Play at least once, and
both builds need the same application ID and signing key. That last point is another reason to
keep the package name and the key the same.

---

## 8. Step 4: The Wear OS app (left out for now)

Augy has decided: **the watch app is not going on Google Play for now.** Nothing in the other
sections depends on it, and the Play build is the phone app alone.

The watch app (`android/native/wear/`) is a small native Java app: a **Bus timings tile** and a
screen listing your favourite stops. Favourite stops come from the phone app over the Wearable
Data Layer (`WearSync.java` to `FavouritesListener`).

### How it ships now

Unchanged:

- `android/build-apk.ps1` builds it with the phone app and writes
  `release/<version>/sg-bus-timings-<version>-watch.apk`.
- It is attached to the GitHub release (`release/README.md`) and installed by hand over `adb`
  Wi-Fi debugging (`docs-site/content/web/wear-os.md`, which says it "isn't on Google Play").
  That page stays as it is.
- It has the phone's application id (`org.uwuapps.sgbus`), `versionName` and `versionCode`, read
  from `android/native/app/build.gradle`, and is signed with the same key
  (`android/native/wear/build.gradle`). It will be 3.0.0 with the phone app.

### What to watch for

- **Keep the signing key the same (Option 2, section 4).** The Data Layer pairs the phone and
  watch apps only if both have the same package and key. If the Play phone app were signed with a
  different key (Option 1), the GitHub watch APK would stop receiving favourites.
- **Keep `build-apk.ps1` building the watch.** It runs `assembleRelease` over the whole project.
  When it is changed for the flavors (section 9), it needs to build the watch APK as well as
  `assembleGithubRelease`, for example `assembleGithubRelease :wear:assembleRelease`. The watch
  has no flavors.

### What adding it later would take

None of this is done or needed now. From Google's [Wear OS packaging][wear] and
[form factor tracks][formfactor] pages:

1. A `versionCode` that differs from the phone's. A watch APK's code must be unique across all
   form factors, and `wear/build.gradle` sets it equal to the phone's today. Something like the
   phone's plus a fixed offset would do.
2. A Wear OS form factor on the same Play app (Test and release, Advanced settings, Form factors
   tab), with its own tracks, testers and review, and a `wear-release.aab` built with
   `:wear:bundleRelease`, signed with the upload key.
3. A listing that says "Wear OS", with at least one square screenshot (at least 384 x 384 pixels,
   no device frame) taken on a Wear OS device, and a mention of the tile in the description.
4. A check on a round emulator, and a real watch if possible.
5. Updating `docs-site/content/web/wear-os.md` (it says the app isn't on Google Play).

The watch app targets API 36 and Play asks Wear OS apps for 35 or higher, so the target level
would already be met.

---

## 9. Step 5: Build the .aab (Windows)

Play takes bundles, not APKs: "Starting August 2021, new apps are required to publish with the Android
App Bundle" and bundles require Play App Signing ([publishing with bundles][aab]).

[Dev] first change `android/build-apk.ps1` (or add `build-aab.ps1` beside it) for the flavors:

- `assembleRelease` becomes `assembleGithubRelease :wear:assembleRelease`, and the phone APK
  path becomes `native\app\build\outputs\apk\github\release\app-github-release.apk`. The watch
  APK path and the `-watch` file stay as they are (section 8). Without that edit, the old
  script builds both flavors and fails to find its file.
- A new `build-aab.ps1` runs Gradle for the bundles and checks the **upload** key's fingerprint,
  not the old SHA-256 pinned in `build-apk.ps1`.

[Windows] [Augy or Thomas] Then, in PowerShell from the project root:

```powershell
cd android
npm ci
npx cap sync android
```

```powershell
cd native
.\gradlew.bat clean :app:bundlePlayRelease --no-daemon
```

The file appears at:

```text
android\native\app\build\outputs\bundle\playRelease\app-play-release.aab
```

Signing:

- The build reads the signing key through `keystore.properties` and `android.keystore`, exactly as
  today (`build.gradle`, `signingConfigs.release`). **Use the new upload key** for the bundles
  (section 4): point the Play flavor at an `upload-keystore.properties` file so GitHub APKs
  keep using the old key. Never put either file in git or in this doc.
- `google-services.json` must be in `android/native/app/` for the build, or the app builds
  without push and the Play build would ship with no notifications (`FIREBASE-SETUP.md`).
- Check the bundle's certificate before uploading. `keytool -printcert -jarfile app-play-release.aab`
  prints the SHA-256 of the key that signed it: it should be the upload key's, not the old one.
- Check for native libraries (16 KB rule): rename a copy to `.zip` and look for `.so` files under
  `base/lib/`; there should be none, or use Android Studio's Analyze APK/bundle.
- File name: keep `release/3.0.0/sg-bus-timings-3.0.0.aab` for your own records. `.aab`
  files are already ignored by git (`android/.gitignore`), so they are not committed. They are not
  the thing to put on GitHub: GitHub gets the `github` flavor's APK.

Size: an app of a few MB is far below Play's limits.

---

## 10. Step 6: Developer account

[Augy]

1. Sign in to the Google account that will own the app, with 2-Step Verification on. Play
   recommends it for all Console users.
2. Register at <https://play.google.com/console/signup>. **US$25, one time**, by credit card in
   the account holder's legal name (no prepaid cards). You must be 18 or older, accept the
   Developer Distribution Agreement, and may be asked for a government ID ([Play Console
   registration][account]). The fee is not refunded if the details turn out invalid.
3. **Personal or organisation (decision D3).**
   - Personal: quicker. Subject to the testing rule below, and personal account owners must also
     confirm they have an Android device through the Play Console mobile app.
   - Organisation: the 12-tester closed test is described only for personal accounts. It needs a
     registered business (a D-U-N-S number is normally required; that detail was not on the page
     fetched, so check in Play Console).
4. **Identity verification.** Required once; allow a few days. Don't start the app until it is
   done. In Singapore, Google's developer verification also began on 30 September 2026
   ([developer verification][devverify]); Play registers most apps automatically, and
   **creating the app in Play Console registers the package name** to the account. Look at the Play
   Console Home page afterwards to confirm `org.uwuapps.sgbus` shows as registered
   ([Play Console guide][devverifyplay]). The README's earlier plan (registering through the
   Android Developer Console with the SHA-256) is the route for the GitHub APK alone; check
   whether the Play registration already covers it, since both use the same package and key.
5. **The new-personal-account testing rule.** For a personal account created after 13 November 2023
   ([testing requirements][testing]):
   - Run a **closed test** with **at least 12 testers opted in**.
   - They must stay opted in **continuously for at least 14 days**. Someone who opts out and in
     again restarts their count.
   - Then click **Apply for production** on the Dashboard and answer three sections (about the
     closed test, the app, and production readiness). Google says it usually replies within
     seven days.
   - Plan for roughly three weeks from first upload to launch. Recruit 15 or so testers, so a few
     dropping out doesn't restart the clock: friends, the Telegram bot's users, people who already run
     the GitHub APK.

---

## 11. Step 7: Create the app and fill in Play Console

[Augy], with the text and images prepared by [Dev]/Thomas.

### 11.1 Create the app ([setup help][release])

1. **Create app.** Name: `SG Bus Timings` (limit 30 characters). Default language: English.
   App (not game). Free. Contact email. Accept the Developer Programme Policies, US export laws
   declaration and the Play App Signing terms.
2. **Package name**: the console takes it from the first bundle you upload. It must be
   `org.uwuapps.sgbus`. **It is permanent**: the page says package names "are unique and permanent".
3. **Play App Signing** is set up when you create the first release. **Choose the existing key
   here (decision D1)**: on the Play app signing page use **Change key** and supply your key with
   PEPK, before the release goes beyond internal testing ([Play App Signing][signing]).
   Then add the **new upload key's** certificate. Note the app signing key's SHA-256 shown there.

### 11.2 Store listing ([asset specs][assets])

| Field | Limit | Notes |
|---|---|---|
| App name | 30 characters | `SG Bus Timings` |
| Short description | 80 characters | e.g. "Live bus arrival timings for every bus stop in Singapore" |
| Full description | 4,000 characters | Describe the real features from `android/README.md`: widget, Get Off Alert, trip following, reminders, NFC card value. Leave out the watch app, which is not on Play. Say what it needs. Include the background-location wording only if you keep that feature. Repeated keywords can get the app suspended |
| App icon | 512 x 512 px, 32-bit PNG with alpha, up to 1024 KB | Make from the launcher icon (`res/mipmap-*`), not scaled up from small PNGs |
| Feature graphic | 1024 x 500 px, JPEG or 24-bit PNG, **no alpha** | Required |
| Phone screenshots | 2 to 8 per device type, JPEG or 24-bit PNG, 320 to 3840 px per side | To be considered for recommendations, at least 4 at 1080 px or larger (1080x1920 portrait) |
| Tablet / Chromebook | At least 4, 1080 to 7680 px, 16:9 or 9:16 | The app runs resizable, so show it on a tablet |
| Promo video | Optional | A public or unlisted YouTube link with ads off, not age-restricted. Only the first 30 seconds autoplay. A short screen recording of a trip is enough |
| Category | One | Choose a transport / maps category |
| Tags | Up to **5** | Console: Grow users, Store presence, Store settings, App category, **Manage tags**. Pick only tags that clearly fit (public transport and the like) ([tags][tags]). Changes can take 24 hours to show |
| Contact | Email required | A website is recommended: `https://sgbus.uwuapps.org` |

### 11.3 Every language

The app has four languages: English, Chinese (`zh-SG`), Malay (`ms`) and Tamil (`ta`)
(`main-site/i18n/`). In Play Console: **Store listing, Manage translations, Select languages**,
then pick the closest Play language for each ([translate help][translate]). The codes Play
uses differ from the site's (for example Chinese is offered as a Chinese, Simplified entry);
pick them from Play's own list, which was not checked here.

- Write the name, short and full descriptions in each language. Use the site's own translations
  (`main-site/i18n/*.json`) for the feature names, so the listing and the app say the same thing.
  Machine translation in Console is free for ten languages (and not human-checked); human
  translation is a paid vendor service. Get a person who speaks each language to read the final text.
- **Screenshots are per language only if you upload them.** Google: "If you add text translations
  without localized graphic assets, your app's graphic assets show from the default language." So
  English screenshots show to everyone unless you add localized ones. The app switches language in
  Settings, so take a set of phone screenshots (and the feature graphic text, if it has any) in
  each of the four languages and upload each set under its language.
- The native part of the app (notification buttons, the "Press back again to exit" text) is English
  only (`res/values/strings.xml`); everything on screen is the site and is translated.
- Release notes: write them in each language too (`<en-US>`-style tags in the box, or one language
  at a time).

### 11.4 App content (the "Dashboard" tasks) ([prepare for review][review])

| Task | What to answer for this app |
|---|---|
| **Privacy policy** | A URL. Use the guide's privacy page, `https://guide.sgbus.uwuapps.org/help/privacy` (confirm the live address). It already covers the Android app, Firebase push, sync and the bot. Add a line about Play's in-app update check (device and version information goes to Google Play) and about reading the phone calendar |
| **Ads** | **No**, the app has none |
| **App access** | All features are available without signing in. No login needed |
| **Content rating** | The IARC questionnaire. Expect a low rating (a transit tool, no user-generated public content). Answer honestly: "Share my ETA" lets a person share their live location by link |
| **Target audience** | See decision D7. Not directed at children |
| **Data safety** | See below |
| **Foreground service declaration** | `location`, with a video (section 6) |
| **Permissions declarations** | Only if background location or exact alarms are kept |
| **News / government / financial / health / COVID** | No / No / No / No / No. The card-value feature only reads a stored value from a transit card and sends nothing; it is not a payment feature |
| **Advertising ID** | The app has no advertising SDK. Say it does not use it. Google Analytics for the web side doesn't use the Android advertising ID in the app. Re-check when answering |

### 11.5 Data safety form ([form help][datasafety])

Data counts as **collected** if the app (including its libraries and SDKs) sends it off the device.
Data only processed on the device is not collected. Mark data **optional** when the person can use
the app without providing it. Every collected item needs a purpose. The page lists the data the
privacy policy describes, so keep the two consistent.

| Data type | What the app does with it | Declare |
|---|---|---|
| **Approximate and precise location** | Stops near me, trips, the Get Off Alert and Navigate use it on the device. It leaves the device in two cases: the live map's walking route sends the two ends, rounded to about 10 m, and "Share my ETA" sends where you are while sharing. A shared place or "Share start" sends the point. Trips never send raw location (`docs-site/content/help/privacy.md`) | Collected, **optional**, purpose **App functionality**. Not used for ads. Passed to OneMap / OpenStreetMap routing as part of the service |
| **Name** | The name in Settings goes with a "Share my ETA" link | Collected, optional, App functionality |
| **Calendar events** | If "Use this phone's calendar" is picked, event **locations** are looked up by the server | Collected, optional, App functionality |
| **Device or other IDs** | A Firebase Cloud Messaging token, and a random device ID, go to the alerts server (kept by Upstash) so notifications can reach the phone. Google Analytics assigns its own IDs | Collected, optional (alerts are off until turned on), App functionality; plus **Analytics** for the Google Analytics ID |
| **App activity / app interactions** | Google Analytics counts page views on the site, inside the app's WebView too (`main-site/index.html`) | Collected, Analytics. **Ask Thomas to confirm** that gtag really runs in the app; if it does not, leave it out |
| **User-generated links** | Navigate share links hold places and times in Supabase | Collected, optional, App functionality |
| **Physical activity** | "On a bus?" is detected by Play services on the device | Processed on device, not collected |
| **Photos / camera** | Scan a stop's code runs on the device | Not collected |
| **NFC card contents** | Read, shown, forgotten | Not collected |
| **Financial info** | None. Card value is read but never stored or sent | Not collected |

Other answers:

- **Encrypted in transit**: Yes. The site and APIs are HTTPS and sync is encrypted
  (`privacy.md`).
- **Deletion**: there is no account. Data is on the person's own device, removed by clearing storage or
  uninstalling. The Telegram bot's data is deleted on request by email (the address is in
  `privacy.md`). Say so.
- **Shared with third parties?** OneMap and Google (Analytics, Firebase) receive some data to
  provide the service. Read Google's definition: transfers to service providers working for you are
  exempt; analytics to Google usually still gets declared. When unsure, declare it.
- SDKs count: Firebase Messaging, Play services location, Nearby, Wearable and ML Kit all
  publish their own data-safety notes; check the [Play SDK Index](https://play.google.com/sdks)
  for them.

---

## 12. Step 8: Testing tracks, then production

[Augy] uploads; builds come from [Windows].

1. **Internal testing.** Upload `app-play-release.aab`. Add yourself and a few people by email.
   It is quick (no review in the usual case) and gives an install link. Use it to:
   - Install the **2.2.8 GitHub APK** on a test phone, then install 3.0.0 from the internal test
     link, and check it **updates in place** with favourites kept (Option 2 in section 4).
   - Test in-app updates: upload a higher `versionCode` and follow the test guide in section 7.
   - Check the Play build has none of the removed permissions: Play Console's bundle page shows the
     merged manifest, or `aapt dump permissions`.
2. **Closed testing.** Make a closed track, add 12 or more testers (an email list or a Google
   Group), and share the opt-in link. Keep the testers opted in for 14 days in a row (section 10).
   Use the time to fix what they find; each fix needs a higher `versionCode`.
3. **Apply for production** from the Dashboard once the rule is met. Google usually answers within
   seven days.
4. **Production.** Create the release, add release notes in each language, choose a country
   list (Singapore alone, or worldwide; the site is Singapore-only), choose **managed publishing**
   if you want to control the go-live moment, then roll out. A staged percentage is available
   for the first release.
5. **Review.** The first review can take several days. Check email and the Policy status page.

---

## 13. After launch

- **Updates.** Every update: bump `versionName` and `versionCode`, build the `.aab` with the
  Windows command, upload to a track, roll out. Phones get it through Play, and open apps get the
  flexible in-app prompt.
- **GitHub releases continue** for the `github` flavor, tagged `android-v<version>`. Don't mix up
  which file is which: the GitHub release holds the `github` APK; Play holds the `.aab`.
- **Site links.** Add the Play badge/link to the web app's "Get the Android app" bar
  (`main-site/js/app-update.js`, `offerApp()`) and the guide's `android-app.md`.
- **Target API each year.** Google moves the requirement every August; raise `targetSdkVersion`
  in `android/native/variables.gradle` and test, or updates stop being accepted ([target API][target]).
- **Key upgrade.** Play can upgrade the app signing key once a year; if it does, update
  `assetlinks.json` with any new fingerprints.
- **Pruning.** If the Play build is the main one, update `android/README.md`'s "If the app ever
  goes on Google Play..." note, which this guide replaces.

---

## 14. Final checklist

**Before building**

- [ ] [Augy] Decisions D1 to D9 made (section 3)
- [ ] [Dev] Versions raised to 3.0.0, `versionCode` higher than 23 (section 5)
- [ ] [Dev] Docs updated for 3.0.0 (section 5)
- [ ] [Dev] `github` and `play` flavors, no `applicationIdSuffix`
- [ ] [Dev] `src/play/AndroidManifest.xml` removes `REQUEST_INSTALL_PACKAGES`, `USE_EXACT_ALARM`,
      `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and (D5) `ACCESS_BACKGROUND_LOCATION`
- [ ] [Dev] `UpdateActivity` only in the `github` flavor; `Channel`, `PlayUpdatePlugin` in the `play` one
- [ ] [Dev] `app-update.js` has the `playupdate` branch, deployed to the site first
- [ ] [Dev] `build-apk.ps1` updated for the flavors and still building the watch APK;
      `build-aab.ps1` added; any new keystore properties file added to `.gitignore`
- [ ] The 2.2.8 and 3.0.0 GitHub builds still update themselves from GitHub

**Account and signing**

- [ ] [Augy] Developer account paid and identity verified
- [ ] [Augy] Upload key made and backed up; original `android.keystore` still safely backed up
- [ ] [Augy] Existing key given to Play App Signing (Change key, PEPK) before leaving internal testing
- [ ] [Augy] App signing SHA-256 noted; `assetlinks.json` updated if it differs (Option 1 only)

**Build**

- [ ] [Windows] `app-play-release.aab` built, signed by the upload key
- [ ] [Windows] No `.so` files; merged manifest has none of the removed permissions
- [ ] `google-services.json` present for the build

**Play Console**

- [ ] [Augy] App created as `org.uwuapps.sgbus`, free, default language English
- [ ] [Augy] Store listing: name, short and full description, icon, feature graphic, phone and tablet screenshots, category, up to 5 tags
- [ ] [Augy] Translations: English, Chinese, Malay, Tamil, each with screenshots in that language
- [ ] [Augy] Optional YouTube promo video
- [ ] [Augy] Privacy policy URL
- [ ] [Augy] Ads: No. App access: no login. Content rating done. Target audience set
- [ ] [Augy] Data safety form done and matches the privacy policy
- [ ] [Augy] Foreground service declaration with video
- [ ] [Augy] Permissions declarations, if background location or exact alarms are kept
- [ ] [Augy] Internal test: 2.2.8 APK updates in place to the Play build; favourites survive; in-app update works
- [ ] [Augy] Closed test: 12 or more testers, 14 days in a row
- [ ] [Augy] Applied for production and approved
- [ ] [Augy] Production release with notes in each language

---

## 15. What could not be checked

- Whether Play offers the Play build as an update to an app installed from the GitHub APK
  (same package and key). Android's rules say it should; no Google page says so. Test it in
  internal testing before relying on it.
- Exactly which language codes and names Play uses for Singapore English, Chinese (Singapore),
  Malay and Tamil. Pick them in Play Console's language list.
- Whether Google's "minimum functionality" policy has anything to say about an app whose content is
  a website. The page fetched for this did not include it. This app has a lot of native
  functionality, and the site belongs to the developer, which is the usual test; read the current
  Spam, Functionality and User Experience policy before submitting.
- Whether Android's Auto Backup restores the WebView's local storage after a reinstall.
- Whether the second fingerprint in `assetlinks.json` (`E4:EB:13:...`) is the old Bubblewrap key.
- Whether Google Analytics' gtag runs inside the app's WebView (affects the Data safety answers).
- Whether an organisation account needs a D-U-N-S number today, and the exact review times for new
  apps. Both change.
- The exact PEPK command: Play Console shows it with the encryption key, so it isn't written here.
- The Java and JavaScript sketches in section 7 were not compiled or run.

---

## 16. Sources

Fetched on 28 October 2026.

[target]: https://support.google.com/googleplay/android-developer/answer/11926878?hl=en
[signing]: https://support.google.com/googleplay/android-developer/answer/9842756
[tags]: https://support.google.com/googleplay/android-developer/answer/9859673
[aab]: https://support.google.com/googleplay/android-developer/answer/9844279
[release]: https://support.google.com/googleplay/android-developer/answer/9859152
[inapp]: https://developer.android.com/guide/playcore/in-app-updates
[inappjava]: https://developer.android.com/guide/playcore/in-app-updates/kotlin-java
[inapptest]: https://developer.android.com/guide/playcore/in-app-updates/test
[variants]: https://developer.android.com/build/build-variants
[testing]: https://support.google.com/googleplay/android-developer/answer/14151465
[account]: https://support.google.com/googleplay/android-developer/answer/6112435
[wear]: https://developer.android.com/training/wearables/packaging
[formfactor]: https://support.google.com/googleplay/android-developer/answer/13295490
[assets]: https://support.google.com/googleplay/android-developer/answer/9866151
[translate]: https://support.google.com/googleplay/android-developer/answer/9844778
[review]: https://support.google.com/googleplay/android-developer/answer/9859455
[datasafety]: https://support.google.com/googleplay/android-developer/answer/10787469
[alarm]: https://support.google.com/googleplay/android-developer/answer/13161072
[fgs]: https://support.google.com/googleplay/android-developer/answer/13392821
[bgloc]: https://support.google.com/googleplay/android-developer/answer/9799150
[devverify]: https://developer.android.com/developer-verification
[devverifyplay]: https://developer.android.com/developer-verification/guides/google-play-console
[a16]: https://developer.android.com/about/versions/16/behavior-changes-16
[pagesize]: https://developer.android.com/guide/practices/page-sizes

| Topic | Page |
|---|---|
| Target API level (36 phone; 35 Wear OS, for later) | [Play target API requirements][target] |
| Play App Signing | [Use Play App Signing][signing] |
| Tags (up to five) | [App tags][tags] |
| Publishing with an Android App Bundle | [Prepare and roll out][aab], [Create and set up your app][release] |
| In-app updates | [Overview][inapp], [Java guide][inappjava], [Testing][inapptest] |
| Build flavors | [Build variants][variants] |
| New personal account testing | [Testing requirements][testing] |
| Developer account and fee | [Get started with Play Console][account] |
| Wear OS on Play (for later) | [Wear OS packaging][wear], [Form factor tracks][formfactor] |
| Store listing assets | [Preview assets][assets], [Translate and localize][translate], [Prepare your app for review][review] |
| Data safety | [Provide information for Data safety][datasafety] |
| Exact alarms, foreground services, background location | [Exact alarm policy][alarm], [FGS declaration][fgs], [Background location][bgloc] |
| Developer verification (Singapore, 30 September 2026) | [Overview][devverify], [Play Console guide][devverifyplay] |
| Android 16 behaviour changes, 16 KB pages | [Android 16][a16], [Page sizes][pagesize] |
