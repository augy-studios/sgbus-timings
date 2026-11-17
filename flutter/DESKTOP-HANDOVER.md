# Desktop Flutter rewrite: handover

Work on the `desktop-flutter-rewrite` branch. Paused on 13 November 2026 so another session could
take over; picked up again on 16 November. The goal: replace the Electron desktop app with Windows,
macOS and Linux builds of this Flutter project, with every desktop feature kept, then release
2.5.0 on every platform.

## Where it stands (16 November 2026)

Items 1 to 10 of "Left to do" below are done as far as this Mac can take them: every desktop part
is built and tested with Flutter 3.50.0 and was seen running on macOS (with 3.47.9), and the docs are written. What's
left needs a real Windows PC and a Linux desktop (item 1, and the Windows integration tests in
item 9), and the release itself (item 11), which is Augy's. The Windows and Linux builds, their
installers and the workflows have only been read and compiled where possible here; CI builds them.

The Electron app (`desktop/`) is removed from the branch, as the Flutter app replaces it. It stays
in git history: `git show android-v2.4.11:desktop/main.js` (or any file) shows it as it was, at
its last release's tag.

Read first, in this order:

1. `docs/desktop-features-spec.md`: every desktop feature to keep (the checklist; §21).
2. `docs/flutter-desktop-app-spec.md`: how to build them in Flutter. The user has since added more
   native desktop features to it, and brought the features spec in line; follow those two over
   anything below. Its §1 lists an `import_old.dart` for bringing the old app's data across: in
   this app that's `lib/desktop/host.dart` (`Migrate.read`), `lib/desktop/leveldb.dart` and
   `lib/data/migrate.dart`, which the Android app's own move from Capacitor already used. The specs
   are generic and stay as they are.
3. `docs/flutter-android-app-spec.md`: the shared Flutter structure.
4. `README.md` ("The desktop app", "Build the desktop app"), `PORTING.md` ("Desktop (2.5.0)": each
   Electron part and its Dart) and `installers/README.md`.
5. The Electron app, from git history, for exact behaviour and wording.

## Decisions the user made

| Question | Answer |
|---|---|
| Where the desktop app lives | `android/` renamed to `flutter/`, with `windows/`, `macos/`, `linux/` added beside `flutter/android/` |
| Map (maplibre_gl has no desktop build) | MapLibre GL JS in a WebView (`webview_all`), behind a Dart shim with maplibre_gl's controller API so `live_map.dart` stays shared |
| Existing Electron users | Bring their data across (Electron's localStorage LevelDB and `settings.json`), and update in place: same NSIS install path, uninstall key and file names, so electron-updater installs 2.5.0 |
| Testing | Playwright (the map's page in Chromium, attached over CDP to WebView2 in the Windows build, and the guide's pages) plus Flutter unit and integration tests |
| Specs | All three generic: no mention of this project |
| Git | Only the three specs go to `main` for now; everything else on this branch |
| When it's done | Bump every platform to 2.5.0 (Android: version bump only), build the APK, commit and push to `main`, publish release `android-v2.5.0` with the APKs, and have GitHub Actions attach the desktop installers to it |
| Layout | The desktop-style layout (navigation rail, split panes, dialogs instead of bottom sheets, right-click menus, the macOS menu bar) now, not later |
| Flutter version | 3.50.0, as CI pins it, with `nativeapi` 0.6, `window_manager` 0.7 and `tray_manager` 0.9 (Augy, on the progress page, 17 November 2026: upgrade now, as the API we use is the same). It was 3.47.9 until then: Flutter 3.50's Dart 3.14 can't compile `nativeapi` 0.5.10 |

## Done before 13 November

- **The rename**: everything from `android/` is in `flutter/`. The paths in other files
  (README.md, release/README.md, GOOGLE-PLAY.md, cli/, docs-site, main-site comments, the
  workflows, `flutter/build-apk.ps1`'s own comments) now say `flutter/` (16 November). The specs
  under `docs/` for the old apps are left as they are.
- **Runners**: `flutter create --platforms=windows,linux,macos`. Windows: `runner/main.cpp` keeps
  one copy (a named mutex; a second copy sends its command line with `WM_COPYDATA`), sets the
  AppUserModelID `org.uwuapps.sgbus`, titles the window "SG Bus Timings" and doesn't show it
  (Dart does); `flutter_window.cpp` registers plugins for desktop_multi_window's engines;
  `Runner.rc` names; icons from the Electron app's `build/icon.png`, except the Mac app's, which
  `installers/macos/make-mac-icon.py` makes from `main-site/sgbusicon1.png`.
- **`packages/sgbus_desktop/`**, a local plugin registered in every engine: each window's native
  handle (nativeapi's `getCurrent()` is the *active* window, so it can't be used), Windows' Jump
  List, thumbnail buttons and start at sign-in (the same `Run` value Electron wrote), the macOS
  Dock menu, badge, links and reopen, Linux forwarding.
- **`lib/desktop/`**, the desktop layer: `desktop.dart`, `desktop_main.dart`, `host.dart`,
  `leveldb.dart` (**tested against a real Electron profile**: all 40 keys), `settings.dart`,
  `notify.dart`, `alerts_poll.dart`, `updater.dart` and `splash.dart`, `welcome.dart`, `tray.dart`,
  `glance.dart`, `widgets_window.dart`, `chrome.dart` (with `title_bar.dart`, `command_bar.dart`
  and `rail.dart`), `screenshot.dart`, `links.dart`, `location.dart`. Each file's header says what it does.
- **Shared code touched**: `native/native_bridge.dart` (a `NativeHost` behind the bridge),
  `main.dart` (desktop start, other windows' entry), `app/app.dart` (title bar and history
  observer), `app/nav.dart` (`push(address:)`, given on stop, bus, board, eta, sync and team),
  `features/alerts/alerts.dart` (`Alerts.polled`: no push server on the desktop),
  `data/location.dart` (`Locate.fallback`), `app/version.dart` (2.5.0, ahead of `pubspec.yaml`).
- **Assets**: `assets/desktop/` (icon, tray icons), `assets/desktop/map/` (MapLibre GL JS 5.24.0,
  the UMD build: 6.x is ES modules with a separate worker).
- `flutter build windows --debug` succeeds.

## Left to do, and where each stands

1. **Run it on Windows and fix what breaks**: window set-up through nativeapi, the update window
   (`SGBUS_SPLASH_DEMO=1` from source), Make it yours and widget windows (desktop_multi_window plus
   `Window.createWithNativeWindow` in a second engine is unproven), tray, notifications (unpackaged
   toasts), close to tray, single instance, Jump List. **Not done: needs a real Windows PC.** The
   app has been run on macOS (title bar, rail and split layout, the map, one copy, `uwu://` links
   at start and while running). Linux is unbuilt here and needs a Linux desktop too: the window,
   the tray (GNOME shows tray icons only with an extension), the AppImage on a system with GTK 3 and
   WebKitGTK 4.1, and location through `nmcli`. Also worth trying on real machines: installing
   the new `.exe` over an Electron 2.4.8 copy (per user and in Program Files), the `.msi` over
   Electron's, the `.deb` and `.rpm` over Electron's, and an Electron AppImage and Mac app
   updating themselves to 2.5.0.
2. **Translations**: every `tr('desktop.…')` key needs adding to `assets/i18n_app/{en,ms,ta,zh-SG}.json`;
   `test/i18n_test.dart` fails until then. **Done** ("Desktop: every desktop word in English,
   Malay, Tamil and Chinese"). A new desktop word needs all four again, or the release workflow
   builds no desktop installer, as it runs the tests first.
3. **The map shim**: **done** ("Desktop: the live map in a WebView").
   `lib/features/map/sg_map.dart` with `native_map.dart` on Android and
   `lib/features/map/web/` on the desktop: the WebView, numbered commands, a local
   server on 127.0.0.1 proxying OpenFreeMap through a disk cache, Save the map, the location dot
   drawn from Dart, no "turn with the way you face".
4. **Shared-screen hooks**: **done** ("Desktop: dialogs, side panels, right-click menus" and
   "Desktop: title bar, command bar, navigation rail"): Tray countdown and Desktop widget on a
   stop, the board and flag-down full screen, no SimplyGo, MyICA or Android update bar, bug
   reports saying "desktop", the alerts wording, the computer's accent colour (`useSystemAccent`
   rather than Material You's `dynamic_color`), and "No connection" on a first launch offline.
   Plus dialogs and side panels for sheets, and right-click menus.
5. **macOS runner**: **done** ("Desktop: macOS and Linux runners"). Built and run here.
6. **Linux runner**: **done** (the same). Unbuilt here.
7. **Installers**: **done** ("Desktop: installers that take over Electron in place"), in
   `installers/` (`installers/README.md`). The NSIS script compiles and the macOS packages were
   built and opened here; the Windows and Linux packages haven't been built on their systems yet.
8. **CI**: **done** (the same): `build-desktop.yml` for the Flutter matrix, the CLI and apt jobs
   kept, and `desktop-check.yml` on every push to this branch. Neither has run yet.
9. **Tests**: **mostly done.** `test/desktop/`: version (skipped until `pubspec.yaml` says 2.5.0),
   LevelDB against a fixture written by real Chromium (`tool/leveldb_fixture.mjs`), alerts
   polling, glance's tooltip, links and the command bar's reading of what's typed, the update file parser
   and install types, settings, location, notifications, screenshots, the welcome window, the
   shell's layout, history and theme, and the map's controller, commands, server, cache and
   prefetch; `tool/playwright/map.test.cjs`, the map's page in Chromium (11 tests). **Not done:**
   integration tests on Windows, and Playwright attached over CDP to WebView2 in the Windows
   build: both need a Windows PC.
10. **Docs**: **done** (16 November): the guide's own section, `docs-site/content/desktop/` (four
    pages; `/web/desktop-app` redirects to it), `main-site/PATCHNOTES.md` (2.5.0),
    `README.md`, `PORTING.md`, `installers/README.md`, `release/README.md` (publishing 2.5.0),
    the root README, `installers/linux/LINUX-BUILD.md` (moved from the Electron folder), and
    `desktop/` retired. `main-site/sw.js` was bumped for the comment changes in cached files.
    **Still wanted:** new screenshots of the Flutter app for the guide (see the guide's pages;
    the Make it yours and update window shots are the Electron app's, which the new windows
    copy, without the System accent swatch).
11. **Release 2.5.0** as in the table above: **Augy's.** `release/README.md`, "Publishing
    2.5.0", has the order: merge this branch into `main` first (a release runs the workflow from
    its tag's commit), raise `pubspec.yaml` to `2.5.0+42` and `cli/package.json` to 2.5.0 (until
    then `node cli/build.mjs` stops, as it checks `cli/package.json` against `pubspec.yaml`), the
    tests passing, then publish with the APKs.

## Things that bit

- VS Code's Dart and Java language servers hold folders open on Windows: the rename was a copy, and
  an empty `android/` folder may linger locally until VS Code lets go.
- Visual Studio needed the "Desktop development with C++" workload (now installed on this PC).
- window_manager 0.6 and tray_manager 0.8 are rewrites on nativeapi; their API isn't the 0.5 one
  most examples show. nativeapi 0.5.10 doesn't compile on Flutter 3.50 (Dart 3.14); the app is now on nativeapi 0.6
  and Flutter 3.50.0.
- Electron's real data on this PC: `%APPDATA%\SG Bus Timings\` (`settings.json`, `Local Storage\leveldb`),
  installed at `%LOCALAPPDATA%\Programs\SG Bus Timings\`. Copy the LevelDB without its `LOCK` file
  while the Electron app runs.
- Running the whole test suite (or anything in `test/shots/`) rewrites the guide's screenshots in
  `docs-site/public/screenshots/`: `git checkout -- docs-site/public/screenshots` puts them back.
