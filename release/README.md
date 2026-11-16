# Releases

The installers built here, each version in a folder of its own, all with the same version
number:

```text
release/2.5.0/
  sg-bus-timings-2.5.0.apk                 Android     flutter\build-apk.ps1
  sg-bus-timings-2.5.0-watch.apk           Wear OS     the same, built with the phone's (from 2.1.0)
  sg-bus-timings-2.5.0-mapping.txt         Android     the same, for reading the APK's crashes; not uploaded
  sgbus                                    Linux CLI   node cli/build.mjs, from 2.2.2 (cli/README.md)
  sg-bus-timings-cli-2.5.0-all.deb         Linux CLI   the same
```

The desktop installers aren't kept here: GitHub Actions builds them onto the release (below).
Each release carries:

```text
  sg-bus-timings-2.5.0-setup.exe           Windows     x64 and Arm64 in one
  sg-bus-timings-2.5.0.msi                 Windows     x64, for installing on many PCs at once
  latest.yml                               Windows     what the desktop app reads to update itself
  sg-bus-timings-2.5.0-mac-arm64.dmg       macOS       Apple silicon
  sg-bus-timings-2.5.0-mac-x64.dmg         macOS       Intel
  sg-bus-timings-2.5.0-mac-arm64.zip       macOS       what the Mac app updates itself from
  sg-bus-timings-2.5.0-mac-x64.zip         macOS       the same, Intel
  latest-mac.yml                           macOS       what the Mac app reads to update itself
  sg-bus-timings-2.5.0-amd64.deb           Linux       Debian, Ubuntu, Mint (x64)
  sg-bus-timings-2.5.0-arm64.deb           Linux       the same on 64-bit Arm
  sg-bus-timings-2.5.0-x86_64.rpm          Linux       Fedora, openSUSE, RHEL (x64)
  sg-bus-timings-2.5.0-aarch64.rpm         Linux       the same on 64-bit Arm
  sg-bus-timings-2.5.0-x86_64.AppImage     Linux       any other Linux (x64)
  sg-bus-timings-2.5.0-arm64.AppImage      Linux       the same on 64-bit Arm
  latest-linux.yml, latest-linux-arm64.yml Linux       what the AppImage reads to update itself
```

The command-line edition's two files are a few hundred KB, so they're committed with the
APKs, and GitHub Actions also builds and attaches them.

The `latest*.yml` files must be on every release: without them no copy of the desktop app can
tell there's a new version (`flutter/lib/desktop/updater.dart`, and electron-updater in the old
Electron app, 2.4.8 and before, which reads the same files). There are no `.blockmap` files any
more (`flutter/installers/README.md`).

The APKs up to 2.4.0 are committed alongside the code they were built from. From 2.4.1 the
phone's APK is around 100 MB, and the desktop installers are large too. GitHub refuses any file
over 100 MB in git, so these are kept out of git (`.gitignore`) and only uploaded to the GitHub
release.

Share them through a **GitHub Release**, where anyone can download them from
<https://github.com/augy-studios/sgbus-timings/releases>.

## Build them

The APKs, the phone's and (from 2.1.0) the watch's, in one go, in PowerShell, from the
project root:

```powershell
powershell -ExecutionPolicy Bypass -File flutter\build-apk.ps1
```

The Android App Bundle for Google Play, which stays here and never goes on a GitHub release:
`powershell -ExecutionPolicy Bypass -File flutter\build-apk.ps1 -Aab` (`flutter/README.md`).

The desktop ones (Windows, macOS and Linux) are the same Flutter app, built on GitHub
(`.github/workflows/build-desktop.yml`): publish the release, and a few minutes later they're
added to it by themselves. Or run **Build desktop apps** by hand (Actions, on `main`) with the new
tag, such as `android-v2.5.0`, and they land on a draft release of that tag, ready for the APK.
The workflow runs the Flutter tests first, and builds nothing from code that fails them. To build
them yourself: `flutter/installers/README.md`; the Linux ones on a machine of your own,
`flutter/installers/linux/LINUX-BUILD.md`.

The command-line edition, on any computer with Node: `node cli/build.mjs`. It writes both its
files into `release\<version>\`.

For a new version, raise it first in all three places, or the builds stop: `version:` in
`flutter/pubspec.yaml` (the name and, after the `+`, a higher `versionCode`, or phones with the old
one won't take it as an update: `flutter/README.md`, "Build the APK"), `appVersion` in
`flutter/lib/app/version.dart` (the desktop app's own idea of its version;
`flutter/test/desktop/version_test.dart` checks the two match, from 2.5.0), and `cli/package.json`, which `cli/build.mjs` checks against `pubspec.yaml`.

## Put it on GitHub

1. Commit and push your changes, so the release points at the code it was built from. The APKs
   stay out of the commit: step 6's upload is where they go.
2. Open <https://github.com/augy-studios/sgbus-timings/releases/new>.
3. **Choose a tag**: type a new one, such as `android-v2.5.0`, and pick
   **Create new tag: android-v2.5.0 on publish**. Leave the target as `main`. Keep to
   `android-v<version>`, even with the desktop installers on it: it's how the Android app's
   updater finds its releases.
4. **Release title**: `SG Bus Timings 2.5.0`.
5. **Describe this release**: what's new, for the people installing it, in the form the Android
   app's update page reads (`notesOf` in `main-site/api/_lib/release.js`): the first paragraph is
   the summary; under `## What's new`, each `###` heading is a group, and each `- **Title**: text`
   an item in it. Past notes are in `announcement/release-notes-<version>.md`. For example:

   ```markdown
   The desktop app rebuilt as an app of its own, with the Android app's screens, a command bar,
   keyboard shortcuts and split panes, with every platform now on 2.5.0.

   ## Download

   | Device | File |
   |---|---|
   | Android 7.0 or newer | `sg-bus-timings-2.5.0.apk` |
   | Windows 10 or 11 | `sg-bus-timings-2.5.0-setup.exe` (or the `.msi`) |
   | Mac with Apple silicon, or Intel | `sg-bus-timings-2.5.0-mac-arm64.dmg`, or `-mac-x64.dmg` |
   | Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
   | Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |

   The Linux files need Ubuntu 22.04, Debian 12 or newer.

   The desktop files join the release a few minutes after it's out. Windows SmartScreen: More
   info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

   ## Updating

   **Windows (`.exe`), Mac and AppImage**: the app updates itself, the old desktop app too.
   **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.5.0 is out; install the new
   one over the old one. Your favourites and settings stay.

   ## What's new

   ### Desktop app
   - **An app of its own**: the Android app's screens, laid out for a computer, with everything
     you'd saved brought across.
   - **A command bar**: Ctrl+K (⌘K on a Mac) finds any stop, bus or command, and opens a pasted link.
   - **Made for a big window**: a navigation rail, and a stop or bus opening beside your list.
   ```

6. Drag in both APKs from `release\<version>\`, the phone's and the `-watch` one (the
   desktop installers and the command line's `sgbus` and `.deb` follow by themselves), into
   the box that says
   **Attach binaries by dropping them here or selecting them**. Wait for them all to finish
   uploading.
7. Tick **Set as the latest release**, then **Publish release**.
8. Within the hour, check the release's **Assets** have every file listed at the top, and that
   **Actions** > **Build desktop apps** went green. A job that failed can be run again from there
   (**Re-run failed jobs**); it replaces any file of the same name.

`https://github.com/augy-studios/sgbus-timings/releases/latest` always points at the newest
one: a good link to share. GitHub also adds the source code as zips; those are fine to leave.

## Publishing 2.5.0

2.5.0 is the first release of the Flutter desktop app, and every Electron copy (2.0.0 to 2.4.8)
updates to it by itself, so before publishing:

- **Merge `desktop-flutter-rewrite` into `main` first.** A published release runs the workflow as
  it is on the tagged commit: tagged on a `main` without the merge, the old Electron workflow
  builds Electron installers instead.
- **Raise the versions** to 2.5.0 in the three places above (`pubspec.yaml` to `2.5.0+42`;
  `version.dart` already says 2.5.0; `cli/package.json`).
- **In the same commit, remove the `skip:`** in `flutter/test/desktop/version_test.dart`, so the
  test checks `version.dart` against `pubspec.yaml` from then on.
- **The tests must pass**, the translations of the desktop's words included
  (`flutter/test/i18n_test.dart`), or the workflow builds no desktop installer.
- **Try the installers first, if you can**: a hand run of **Build desktop apps** with the tag
  left empty keeps them on the run, under **Artifacts**, for 30 days. Installing the `.exe` over an
  Electron 2.4.8 copy, and opening the AppImage on a Linux desktop, are the two to try
  (`flutter/DESKTOP-HANDOVER.md`).

Once it's published, the Electron copies installed with the `.exe`, as an AppImage or on a Mac
download 2.5.0 at their next hourly check, as soon as the `latest*.yml` files are on the release,
and install it over themselves. Those from the `.msi`, `.deb` or `.rpm` say a new version is out.
`https://github.com/augy-studios/sgbus-timings/releases/latest/download/latest.yml` (and
`latest-mac.yml`, `latest-linux.yml`) shows what they see.

## How phones and computers hear about it

From 2.1.1, the moment a release is published, phones that turned on **New versions of the
app** in Service alerts get a notification, "SG Bus Timings 2.1.1 is out", even with the app
closed: GitHub calls the site (a webhook, `main-site/api/push/release.js`), which pushes it
through Firebase. Tapping it opens the app's update window. That's why the APK has to be
attached **before** you click **Publish release**: a release without its APK is skipped, and
the webhook isn't called again. Setting it up: `flutter/FIREBASE-SETUP.md`, steps 5 and 6.

Within about 10 minutes of publishing, the Android app also offers the new version in a bar at
the top of the page. The bar comes from the site, which reads the releases through
`main-site/api/app-release.js`. It skips drafts, pre-releases, tags that don't start
`android-v`, and releases whose APK hasn't finished uploading. **Update** downloads the APK
in the app, checks it against GitHub's checksum and hands it to Android's installer
(`UpdateActivity.java`). From 1.1.0, which can't update itself, **Download** opens the release
page instead. 1.2.0 updates itself to 2.0.0 like any other version.

The desktop apps look for themselves (`flutter/lib/desktop/updater.dart`): as they open, every hour
while they run and when the computer wakes, as a computer can't be pushed to. They read the
`latest*.yml` files on the newest release, so they hear once GitHub Actions has added the
installers, a few minutes after publishing. A notification says it's out (or downloaded, ready
to restart), unless **New versions of the app** is off in their Service alerts. The Electron
copies (2.4.8 and before) read the same files the same way.

## Before you share it

- **Deploy the site first.** 2.0.0's features need the site's side of them (the live map,
  `js/app-bridge.js`, `api/walk.js`, FCM in `api/_push/`), and the update bar comes from the
  site too.
- **Set up Firebase** (`flutter/FIREBASE-SETUP.md`) before building, or the APK can't get
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
| Play Protect warns about the app | See "Google's developer verification" in `flutter/README.md`. |
| Windows says "Windows protected your PC" | The installer isn't code-signed. **More info** > **Run anyway**. |
| You uploaded the wrong file | On the release, **Edit**, delete the file with the bin icon, attach the right one, **Update release**. The Android app checks the file is newer and matches GitHub's checksum, so phones won't install a mismatch, and the desktop app checks each file's SHA-512 against its `latest*.yml`. |
| No update bar in the Android app | The tag doesn't start `android-v`, the release is a draft or pre-release, or it's been under 10 minutes. `https://sgbus.uwuapps.org/api/app-release` shows what phones see. |
| No "new version" notification on phones | Open the webhook in GitHub (**Settings** > **Webhooks**) and look at **Recent Deliveries**: the answer says why (`flutter/FIREBASE-SETUP.md`, "If something goes wrong"). Published before the APK finished uploading? **Redeliver** it now. |
| The desktop installers never came | **Actions** > **Build desktop apps**: a failed test stops every build, and each job's log says why. Fix it on `main`, then **Run workflow** with the release's tag. |
| Desktop apps don't see the new version | A `latest*.yml` is missing from the release, or still uploading. Run **Build desktop apps** by hand with the tag to add them. |
| The Linux build stops at **Check it opens on Ubuntu 22.04** | A file in the build needs a newer C or C++ library than Ubuntu 22.04 and Debian 12 have, so it wouldn't open there; the step's log names it. Usually a package that brings its own library was upgraded: go back to the version before (`flutter/pubspec.yaml`), or decide to raise the Linux minimum. |
| The Linux jobs (or the tests) fail at once, before any step runs, on 23 or 30 March or 6 or 13 April 2027 | GitHub's planned "brownouts" of its Ubuntu 22.04 machines, 14:00 to 00:00 UTC (10pm to 8am in Singapore), warning that they're going (actions/runner-images#14254). Run the workflow again after 8am. |
| No Ubuntu 22.04 machine any more (from 17 April 2027) | GitHub has retired them. Move the Linux build (and the tests) into an `ubuntu:22.04` container on a newer machine, which keeps the app opening on Ubuntu 22.04 and Debian 12; or decide to raise the Linux minimum. |
| A Linux AppImage won't open after updating | It needs Ubuntu 22.04, Debian 12 or newer, and the computer's GTK 3 and WebKitGTK 4.1 (the guide's "Install and update it" page says what to install). |
