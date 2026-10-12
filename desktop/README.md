# SG Bus Timings for Windows, macOS and Linux

The desktop app: the web app at sgbus.uwuapps.org in a window of its own, made with
[Electron](https://www.electronjs.org) and [electron-builder](https://www.electron.build). As
with the Android app (`android/`), the site's own updates reach it at once; the app itself
only needs building again for its own parts. It shares the Android app's version number.

| Installer | For | Built on |
|---|---|---|
| `sg-bus-timings-<version>-setup.exe` | Windows 10 and 11: a normal installer that asks where to install | Windows (`npm run build:win`) |
| `sg-bus-timings-<version>.msi` | Windows, for installing with Group Policy or `msiexec` | Windows (`npm run build:win`) |
| `sg-bus-timings-<version>-amd64.deb` | Debian, Ubuntu, Mint and the like | Linux: the VPS (`LINUX-BUILD.md`) |
| `sg-bus-timings-<version>-x86_64.AppImage` | Any 64-bit Linux, without installing | Linux: the VPS (`LINUX-BUILD.md`) |
| `sg-bus-timings-<version>-mac-arm64.dmg` | Macs with Apple silicon (M1 and later) | GitHub Actions (`.github/workflows/build-macos.yml`) |
| `sg-bus-timings-<version>-mac-x64.dmg` | Macs with an Intel processor | GitHub Actions (`.github/workflows/build-macos.yml`) |

## What it adds to the site

- **A tray icon** (in the menu bar on macOS). Closing the window keeps the app running there;
  Quit is in the tray's menu.
- **Service Alerts as desktop notifications.** Electron has no Web Push, so while the app
  runs, the page checks `/api/service-alerts` every minute, by the same rules as the server
  (`main-site/js/alerts.js`, "the desktop app"), and hands what's new to the app to show
  (`preload.js`, `main.js`). Clicking one opens Service alerts.
- **Starts when you sign in**, maximised, from the first run; the tray's menu turns it off.
- **Opens maximised**, unless it was last closed un-maximised.
- **Bus timings widgets** (`widgets.js`): small frameless windows on the desktop, each showing
  a stop's timings from `main-site/widget.html`, resizable, optionally on top, restored where
  they were at start-up. Added from the tray. A Windows app outside the Microsoft Store can't
  add to Windows 11's Widgets board, so they live on the desktop instead.
- **Updates itself** (`updater.js`): reads `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
  from the newest GitHub release. The `.exe` and AppImage download and install with a restart;
  the `.msi`, `.deb` and the Mac app only say there's a new version. Upload the `.yml` files and the `.blockmap` with the
  installers on every release.
- **Links elsewhere open in your browser**; the site's own pages stay in the app.
- **`uwu://sgbus/` links open it**, on the page they name, mapped as the Android app maps
  them (`fromAppLink` in `main.js`). On Windows the app registers the `uwu` scheme for your
  account each time it starts, so links work once it's been opened once (the `.exe` installer
  opens it as it finishes; after the `.msi`, open it yourself);
  on Linux the `.deb`'s menu entry declares it (`protocols` in `package.json`). Windows and Linux
  give a scheme to one app only, unlike Android, which shares `uwu://` out by host: so the
  desktop app takes every `uwu://` link on the computer, and only opens `sgbus`'s. If
  another UwU App ever wants `uwu://` on the desktop, the apps will need one shared handler
  that passes each link on by its host. An AppImage only gets links once it's been set up
  in the desktop's menu, as AppImageLauncher or Gear Lever do.

The page reaches the app only through `window.sgbusDesktop` (`preload.js`), and `main.js`
only answers the site's own origin. The site's location and notification permissions are
allowed; anything else it asks for is refused. No key or secret is in the app.

Location works where the computer can tell where it is: on Windows, with **Settings** >
**Privacy & security** > **Location** on. Linux desktops usually can't, so Near me and the
live map ask for a place instead.

## Build it

On Windows, in PowerShell:

```powershell
cd desktop
npm ci
npm run build:win
```

The `.exe` and `.msi` land in `desktop\dist\`; copy them to `release\<version>\` beside the
APK. For Linux, see `LINUX-BUILD.md`. For macOS, see below.

The installers aren't code-signed, so Windows SmartScreen says "Windows protected your PC"
the first time: **More info** > **Run anyway**. A code-signing certificate would remove that.

To try it without installing: `npm start`.

### macOS

A Mac app can only be built on a Mac, so GitHub builds it (`.github/workflows/build-macos.yml`):
a `.dmg` and a `.zip` each for Apple silicon (`arm64`) and Intel (`x64`), and `latest-mac.yml`
for the updater.

- **Every push that changes `desktop/`** builds it. The files are on the run's page, under
  **Artifacts** (Actions > Build macOS app > the run), for 30 days.
- **To add it to a release**: Actions > **Build macOS app** > **Run workflow**, on `main`, with
  the release's tag (such as `android-v2.0.2`). The files are added to that release, replacing
  any of the same name.
- **Publishing a release** builds it from the release's tag and adds it there by itself.

Locally on a Mac, `npm ci` then `npm run build:mac` does the same, into `desktop/dist/`.

It isn't signed with an Apple Developer ID (only ad-hoc), so the first time it's opened macOS
says it "can't be opened because Apple cannot check it for malicious software". Open it from
**Finder** with right-click > **Open** > **Open**, or on macOS 15 and later: **System Settings**
> **Privacy & Security**, **Open Anyway**. If macOS says it's "damaged", run
`xattr -cr "/Applications/SG Bus Timings.app"` in Terminal. Updates can't install themselves
either: the app says there's a new version, and you download the new `.dmg`. An Apple Developer
ID ($99 a year) would fix all of that.

## A new version

Raise `version` in `package.json` to the Android app's new version (`android/README.md`,
"Build the APK"), build both, and publish them on the same GitHub release (see
`release/README.md`).
