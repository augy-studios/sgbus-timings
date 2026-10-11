# SG Bus Timings for Android

The Android app, `org.uwuapps.sgbus`: the web app at sgbus.uwuapps.org in a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity),
made with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). It shows the site full
screen in Chrome, so the site's own updates reach it at once; the app itself only needs
building again for its native parts.

Native parts of its own, beyond Bubblewrap's:

- **OpenAppActivity** opens another app by its package, as a native app does, for the site's
  SimplyGo button (`main-site/script.js`, "SimplyGo"). A web page can't. Only the apps listed in
  `OpenAppActivity.java` can be opened, each also named under `<queries>` in
  `AndroidManifest.xml`.

## Build the APK

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

It lands in `release/` at the project root as `sg-bus-timings-<version>.apk`, signed and ready
to share. Raise `appVersion` and `appVersionCode` in `twa-manifest.json`, and `versionName` and
`versionCode` in `app/build.gradle`, before building one to replace an installed copy.

`bubblewrap build` would do the same, but fails on Windows with newer Node ("spawn EINVAL"), so
the script runs its steps itself. It uses the JDK and Android SDK Bubblewrap installed in
`~/.bubblewrap`; the JDK there must be the 64-bit one (`config.json`'s `jdkPath`).

## The signing key

`android.keystore` and its passwords in `keystore.properties` are kept out of git. **Back both
up somewhere safe.** An APK signed with a different key can't update one already installed, and
the site's `main-site/.well-known/assetlinks.json` lists this key's SHA-256 fingerprint, which is
what lets the app show the site without an address bar:

```text
4E:D5:3F:F1:F4:CB:4E:5E:A7:CB:C1:28:46:48:F6:2E:B3:90:47:EB:C2:9B:25:20:F5:7D:FE:5B:76:CB:44:EB
```

## Install it

Copy the APK to the phone and open it. Android asks to allow installing apps from wherever it
was opened (Files, Chrome, Telegram); allow it once. A copy of `org.uwuapps.sgbus` signed with
another key, say from PWABuilder, has to be uninstalled first.

## Changing the app

Edit `twa-manifest.json` for the name, colours, icons, shortcuts and so on, then regenerate with
`bubblewrap update --skipVersionUpgrade`. That rewrites `AndroidManifest.xml`, so put back the
two blocks marked "Not Bubblewrap's" in it afterwards: `<queries>` and the `OpenAppActivity`
`<activity>`. `OpenAppActivity.java` is kept.
