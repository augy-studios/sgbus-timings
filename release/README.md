# Releases

The installers built here, each version in a folder of its own, all with the same version
number:

```text
release/2.0.0/
  sg-bus-timings-2.0.0.apk                 Android     android\build-apk.ps1
  sg-bus-timings-2.0.0-setup.exe           Windows     GitHub Actions: Build desktop apps
  sg-bus-timings-2.0.0.msi                 Windows     the same (or desktop: npm run build:win)
  sg-bus-timings-2.0.0-amd64.deb           Linux       the same (or desktop/build-linux.sh)
  sg-bus-timings-2.0.0-x86_64.AppImage     Linux       the same (or desktop/build-linux.sh)
  sg-bus-timings-2.0.0-mac-arm64.dmg       macOS       GitHub Actions: Build desktop apps
  sg-bus-timings-2.0.0-mac-x64.dmg         macOS       the same, for Intel Macs
  *-mac-*.zip, latest-mac.yml              macOS       what the Mac app reads to update itself
  latest.yml, *-setup.exe.blockmap         Windows     what the desktop app reads to update itself
  latest-linux.yml                         Linux       the same, for the AppImage
```

Upload the `.yml` and `.blockmap` files with the installers on every release: without them
the desktop app can't tell there's a new version (`desktop/updater.js`).

The APKs (a few MB each) are committed alongside the code they were built from. The desktop
installers are around 80 to 110 MB each, and GitHub refuses any file over 100 MB in git, so
they're kept out of git (`.gitignore`) and only uploaded to the GitHub release.

Share them through a **GitHub Release**, where anyone can download them from
<https://github.com/augy-studios/sgbus-timings/releases>.

## Build them

The APK, in PowerShell, from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

The desktop ones (Windows, Linux and macOS) build on GitHub (`desktop/README.md`, "Build
it"): run **Build desktop apps** with the new tag, such as `android-v2.0.3`, and they land on
a draft release of that tag, ready for the APK. Or publish the release first, and they're
added to it by themselves a few minutes later. They aren't kept in
`release\<version>\`. To build the Windows ones yourself, `cd desktop; npm ci; npm run
build:win`; the Linux ones, `desktop/LINUX-BUILD.md`.

For a new version, raise it first in both places (`android/README.md`, "Build the APK"), or
phones with the old one won't take it as an update.

## Put it on GitHub

1. Commit and push your changes, the new APK included, so the release points at the code it
   was built from.
2. Open <https://github.com/augy-studios/sgbus-timings/releases/new>.
3. **Choose a tag**: type a new one, such as `android-v2.0.0`, and pick
   **Create new tag: android-v2.0.0 on publish**. Leave the target as `main`. Keep to
   `android-v<version>`, even with the desktop installers on it: it's how the Android app's
   updater finds its releases.
4. **Release title**: `SG Bus Timings 2.0.0`.
5. **Describe this release**: what's new, for the people installing it. For example:

   ```markdown
   Android: download `sg-bus-timings-2.0.0.apk` on your phone and open it. If Android
   asks, allow installing apps from your browser or Files.
   Windows: `sg-bus-timings-2.0.0-setup.exe` (or the `.msi`). If SmartScreen warns,
   More info > Run anyway.
   Linux: the `.deb` for Debian and Ubuntu, or the `.AppImage` for anything else.
   macOS: the `-mac-arm64.dmg` for Apple silicon, `-mac-x64.dmg` for Intel. The first
   time, right-click the app > Open.

   New:
   - Android: follows your trip with the screen off, reads your card's value over NFC,
     and gets Service Alerts as notifications
   - Live map with walking directions, on trips, and for trips shared with you
   - Trips now include the walks at the start, between rides and at the end
   - Windows and Linux apps, with Service Alerts as desktop notifications
   ```

6. Drag in the APK from `release\<version>\` (the desktop installers follow by themselves), into the box that says
   **Attach binaries by dropping them here or selecting them**. Wait for them all to finish
   uploading.
7. Tick **Set as the latest release**, then **Publish release**.

`https://github.com/augy-studios/sgbus-timings/releases/latest` always points at the newest
one: a good link to share. GitHub also adds the source code as zips; those are fine to leave.

## How phones hear about it

Within about 10 minutes of publishing, the Android app offers the new version in a bar at the
top of the page. The bar comes from the site, which reads the releases through
`main-site/api/app-release.js`. It skips drafts, pre-releases, tags that don't start
`android-v`, and releases whose APK hasn't finished uploading. **Update** downloads the APK
in the app, checks it against GitHub's checksum and hands it to Android's installer
(`UpdateActivity.java`). From 1.1.0, which can't update itself, **Download** opens the release
page instead. 1.2.0 updates itself to 2.0.0 like any other version.

The desktop apps don't check for updates yet: people download the new installer and run it
over the old one.

## Before you share it

- **Deploy the site first.** 2.0.0's features need the site's side of them (the live map,
  `js/app-bridge.js`, `api/walk.js`, FCM in `api/_push/`), and the update bar comes from the
  site too.
- **Set up Firebase** (`android/FIREBASE-SETUP.md`) before building, or the APK can't get
  notifications from the server.
- **The repository has to be public** for others to download it. A private repository's
  releases are only visible to people with access to it.
- **Never upload `android.keystore`, `keystore.properties` or Firebase's service account
  key.** Only the installers.

## If something goes wrong

| What happens | What to do |
|---|---|
| "App not installed" on the phone | An older copy signed with a different key is installed, such as one from PWABuilder. Uninstall SG Bus Timings, then install again. |
| "App not installed as package appears to be invalid" | The download didn't finish. Download it again. |
| Play Protect warns about the app | See "Google's developer verification" in `android/README.md`. |
| Windows says "Windows protected your PC" | The installer isn't code-signed. **More info** > **Run anyway**. |
| You uploaded the wrong file | On the release, **Edit**, delete the file with the bin icon, attach the right one, **Update release**. The Android app checks the file is newer and matches GitHub's checksum, so phones won't install a mismatch. |
| No update bar in the Android app | The tag doesn't start `android-v`, the release is a draft or pre-release, or it's been under 10 minutes. `https://sgbus.uwuapps.org/api/app-release` shows what phones see. |
