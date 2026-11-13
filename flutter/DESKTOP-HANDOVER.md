# Desktop Flutter rewrite: handover

Work in progress on the `desktop-flutter-rewrite` branch, paused on 13 November 2026 so another
session can take over. The goal: replace the Electron desktop app (`desktop/`) with Windows, macOS
and Linux builds of this Flutter project, with every desktop feature kept, then release 2.5.0 on
every platform.

Read first, in this order:

1. `docs/desktop-features-spec.md`: every desktop feature to keep (the checklist; §21).
2. `docs/flutter-desktop-app-spec.md`: how to build them in Flutter. The user has since added more
   native desktop features to it, and brought the features spec in line; follow those two over
   anything below.
3. `docs/flutter-android-app-spec.md`: the shared Flutter structure.
4. The Electron app itself (`desktop/*.js`, `*.html`) for exact behaviour and wording.

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

## Done

- **The rename**: everything from `android/` is in `flutter/`. Other files still say `android/`
  (README.md, release/README.md, GOOGLE-PLAY.md, cli/README.md, cli/build.mjs, docs-site,
  main-site comments, `.github/workflows/build-desktop.yml`, `flutter/build-apk.ps1`'s own
  comments, the specs under `docs/` for the old apps): update the paths, not the guide's
  `content/android/` page paths.
- **Runners**: `flutter create --platforms=windows,linux,macos`. Windows: `runner/main.cpp` keeps
  one copy (a named mutex; a second copy sends its command line with `WM_COPYDATA`), sets the
  AppUserModelID `org.uwuapps.sgbus`, titles the window "SG Bus Timings" and doesn't show it
  (Dart does); `flutter_window.cpp` registers plugins for desktop_multi_window's engines;
  `Runner.rc` names; icons from `desktop/build/icon.png`. **macOS and Linux runners are still the
  templates** (see "Left to do").
- **`packages/sgbus_desktop/`**, a local plugin registered in every engine: each window's native
  handle (nativeapi's `getCurrent()` is the *active* window, so it can't be used), Windows' Jump
  List, thumbnail buttons and start at sign-in (the same `Run` value Electron wrote), the macOS
  Dock menu, badge, links and reopen, Linux forwarding. Windows compiles; macOS and Linux unbuilt.
- **`lib/desktop/`**, the desktop layer, analyser-clean, never run yet:
  `desktop.dart` (window, close to tray, links, start at sign-in), `desktop_main.dart` (start-up
  order and the `sgbus/main` channel the other windows call), `host.dart` (the bridge's answers:
  links, share, notify, releases, favourites, migration), `leveldb.dart` (Chromium localStorage
  reader, **tested against a real Electron profile**: all 40 keys), `settings.dart`
  (`settings.json` in Electron's folder, read in place), `notify.dart`, `alerts_poll.dart` (the
  site's desktop polling rules), `updater.dart` and `splash.dart` (latest*.yml, SHA-512, per
  install type, the update window), `welcome.dart` (Make it yours, its own window and engine, its
  own four-language words), `tray.dart`, `glance.dart`, `widgets_window.dart` (each widget its own
  engine), `chrome.dart` (title bar, history, reload, address, shortcuts, 1000 px column),
  `screenshot.dart` (short and long), `links.dart` (uwu:// claim and hand-off), `location.dart`
  (Linux nmcli + BeaconDB fallback).
- **Shared code touched**: `native/native_bridge.dart` (a `NativeHost` behind the bridge),
  `main.dart` (desktop start, other windows' entry), `app/app.dart` (title bar and history
  observer), `app/nav.dart` (`push(address:)`, given on stop, bus, board, eta, sync and team),
  `features/alerts/alerts.dart` (`Alerts.polled`: no push server on the desktop),
  `data/location.dart` (`Locate.fallback`), `app/version.dart` (2.5.0, ahead of `pubspec.yaml`).
- **Assets**: `assets/desktop/` (icon, tray icons), `assets/desktop/map/` (MapLibre GL JS 5.24.0,
  the UMD build: 6.x is ES modules with a separate worker).
- `flutter build windows --debug` succeeds.

## Left to do

In rough order:

1. **Run it on Windows and fix what breaks**: window set-up through nativeapi, the update window
   (`SGBUS_SPLASH_DEMO=1` from source), Make it yours and widget windows (desktop_multi_window plus
   `Window.createWithNativeWindow` in a second engine is unproven), tray, notifications (unpackaged
   toasts), close to tray, single instance, Jump List.
2. **Translations**: every `tr('desktop.…')` key needs adding to `assets/i18n_app/{en,ms,ta,zh-SG}.json`;
   `test/i18n_test.dart` fails until then.
3. **The map shim**: an `SgMapController` interface (the calls `live_map.dart` makes:
   `addGeoJsonSource`, `setGeoJsonSource`, `addLine/Circle/FillLayer`, `animateCamera`,
   `moveCamera`, `cameraPosition`, `toScreenLocation`, `queryRenderedFeaturesInRect`,
   `updateMyLocationTrackingMode`), maplibre_gl's controller behind it on Android, a WebView one on
   the desktop; `assets/desktop/map/map.html`; a local `HttpServer` serving the page and proxying
   OpenFreeMap through a disk cache (MapLibre's `transformRequest`); Save the map on the desktop
   (`map_save.dart`, through that cache); the location dot drawn from Dart (as `MapPreview` does);
   no "turn with the way you face" on the desktop.
4. **Shared-screen hooks** (desktop-features-spec §13): the Tray countdown button on a stop
   (`Glance.setStop`), the board full screen (`DeskChrome.setFullScreen`), no SimplyGo or MyICA
   buttons (the site hides them off phones), bug reports saying "Desktop app", the Android update
   bar never on the desktop, the alerts "Android's settings" wording, the computer's accent colour
   for Material You (`dynamic_color`), the offline first-launch message.
5. **macOS runner**: `AppDelegate` (stay alive with no window, `applicationDockMenu` from
   `SgbusDesktopPlugin.main`, reopen), `MainFlutterWindow` (desktop_multi_window callback),
   `Info.plist` (`CFBundleURLTypes` for `uwu`, location usage strings), entitlements (network
   client, location), product name "SG Bus Timings", bundle id `org.uwuapps.sgbus`.
6. **Linux runner**: `my_application.cc` as a unique `GApplication` with
   `G_APPLICATION_HANDLES_COMMAND_LINE`, a second copy's arguments to
   `sgbus_desktop_plugin_forward`; the desktop_multi_window callback; application id.
7. **Installers** (`flutter/installers/`): NSIS with x64 and Arm64 payloads, honouring
   `/S --updated --force-run`, installing to the folder in `HKCU\Software\8b1cb8d1-c06f-5377-97bb-cd1bae528f5a`
   (`InstallLocation`, default `%LOCALAPPDATA%\Programs\SG Bus Timings`), the same uninstall key
   (`…\Uninstall\8b1cb8d1-c06f-5377-97bb-cd1bae528f5a`), `Uninstall SG Bus Timings.exe`, the exe
   renamed from `sgbus_timings.exe` to `SG Bus Timings.exe` (CMake can't name a target with
   spaces), clearing Electron's files; WiX `.msi` with Electron's UpgradeCode (read it from an old
   `.msi`, such as `desktop/dist/sg-bus-timings-2.0.2.msi`); `.deb` and `.rpm` named
   `sgbus-timings-desktop` into `/opt/SG Bus Timings/` with `sgbus-timings.desktop`; AppImage;
   macOS `.app`, `.zip` and `.dmg` per processor; the `latest*.yml` files in electron-updater's
   format.
8. **CI**: rewrite `.github/workflows/build-desktop.yml` for the Flutter matrix (Windows x64 and
   Arm, macOS, Linux x64 and Arm), keeping the CLI and apt repository jobs.
9. **Tests**: `version_test` (version.dart = pubspec), LevelDB with a fixture, alerts polling,
   glance's tooltip, `typedAddress`/`fromAppLink`, the update file parser and `newer`,
   integration tests on Windows, Playwright as above.
10. **Docs**: the guide's `web/desktop-app.md` (maybe a desktop section of its own) with new
    high-resolution screenshots (welcome and update windows light and dark, title bar, widget) from
    `test/shots/`; `PATCHNOTES.md`; `flutter/README.md`, `PORTING.md`, `release/README.md`,
    `desktop/LINUX-BUILD.md` (moved); retire `desktop/`; bump a service worker's cache version if a
    cached file changes.
11. **Release 2.5.0** as in the table above.

## Things that bit

- VS Code's Dart and Java language servers hold folders open on Windows: the rename was a copy, and
  an empty `android/` folder may linger locally until VS Code lets go.
- Visual Studio needed the "Desktop development with C++" workload (now installed on this PC).
- window_manager 0.6 and tray_manager 0.8 are rewrites on nativeapi; their API isn't the 0.5 one
  most examples show.
- Electron's real data on this PC: `%APPDATA%\SG Bus Timings\` (`settings.json`, `Local Storage\leveldb`),
  installed at `%LOCALAPPDATA%\Programs\SG Bus Timings\`. Copy the LevelDB without its `LOCK` file
  while the Electron app runs.
