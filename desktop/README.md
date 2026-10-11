# SG Bus Timings for Windows and Linux

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

## What it adds to the site

- **A tray icon.** Closing the window keeps the app running there; Quit is in the tray's menu.
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
- **Updates itself** (`updater.js`): reads `latest.yml` / `latest-linux.yml` from the newest
  GitHub release. The `.exe` and AppImage download and install with a restart; the `.msi` and
  `.deb` only say there's a new version. Upload the `.yml` files and the `.blockmap` with the
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
APK. For Linux, see `LINUX-BUILD.md`.

The installers aren't code-signed, so Windows SmartScreen says "Windows protected your PC"
the first time: **More info** > **Run anyway**. A code-signing certificate would remove that.

To try it without installing: `npm start`.

## A new version

Raise `version` in `package.json` to the Android app's new version (`android/README.md`,
"Build the APK"), build both, and publish them on the same GitHub release (see
`release/README.md`).
