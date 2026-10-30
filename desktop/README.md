# SG Bus Timings for Windows, macOS and Linux

The desktop app: the web app at sgbus.uwuapps.org in a window of its own, made with
[Electron](https://www.electronjs.org) and [electron-builder](https://www.electron.build). As
with the Android app (`android/`), the site's own updates reach it at once; the app itself
only needs building again for its own parts. It shares the Android app's version number.

| Installer | For | Built on |
|---|---|---|
| `sg-bus-timings-<version>-setup.exe` | Windows 10 and 11: a normal installer that asks where to install, on an Intel or AMD PC or an Arm one (one installer carries both, and installs the right one) | GitHub Actions, or Windows (`npm run build:win`) |
| `sg-bus-timings-<version>.msi` | Windows on Intel or AMD (x64), for installing with Group Policy or `msiexec`. Not for Arm: electron-builder can't make an Arm `.msi` | GitHub Actions, or Windows (`npm run build:win`) |
| `sg-bus-timings-<version>-amd64.deb` | Debian, Ubuntu, Mint and the like; also from an apt repository (`LINUX-BUILD.md`) | GitHub Actions, or Linux (`LINUX-BUILD.md`) |
| `sg-bus-timings-<version>-arm64.deb` | The same on 64-bit Arm: Raspberry Pi OS (64-bit), Arm laptops | GitHub Actions, or Linux (`LINUX-BUILD.md`) |
| `sg-bus-timings-<version>-x86_64.rpm`, `-aarch64.rpm` | Fedora, openSUSE, RHEL and the like, x64 and Arm | GitHub Actions, or Linux (`LINUX-BUILD.md`) |
| `sg-bus-timings-<version>-x86_64.AppImage`, `-arm64.AppImage` | Any 64-bit Linux, without installing, x64 and Arm | GitHub Actions, or Linux (`LINUX-BUILD.md`) |
| `sg-bus-timings-<version>-mac-arm64.dmg` | Macs with Apple silicon (M1 and later) | GitHub Actions |
| `sg-bus-timings-<version>-mac-x64.dmg` | Macs with an Intel processor | GitHub Actions |

GitHub Actions builds them all (`.github/workflows/build-desktop.yml`, see "Build it").

## What it adds to the site

- **Its own title bar** (`titlebar.html`): back, forward, reload, the page's address, and
  screenshot and long screenshot buttons, in the site's colour. The address can't be typed
  in: clicking it copies the link. A screenshot is of the site (not the bar), as it is on
  screen; a long one is the whole page, top to bottom (up to 16384 pixels tall). Either is
  copied, and saved in your **Downloads** folder. Once an update's downloaded, a green update
  button right of them restarts the app to install it (`updater.js`). On Windows and Linux the bar has its own
  minimise, maximise and close at its right (close keeps it in the tray); macOS keeps its
  traffic lights over the bar's left. Alt+Left and Alt+Right (⌘[ and ⌘] on a Mac) go
  back and forward, F5 or Ctrl+R reloads. The site itself is in a view below the bar
  (`main.js`, `createWindow`), and it hides while the site is full screen.
- **A tray icon** (in the menu bar on macOS). Closing the window keeps the app running there;
  Quit is in the tray's menu, and **Check for updates...** checks now, with a notification of
  what it found, up to date or not.
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
- **At a glance** (`glance.js`, 2.1.0): a stop picked with the page's **Tray countdown**, its
  next buses in the tray icon's tooltip, and on macOS beside the icon in the menu bar and as
  the Dock badge, every 30 s; and the favourite stops (from the page's
  `shareFavsWithWidgets`) in the Windows Jump List (`app.setUserTasks`, each a
  `uwu://sgbus/<code>` link back to the app), the macOS Dock menu, and Windows' taskbar
  thumbnail buttons (Refresh, previous and next favourite; their 16 px icons are drawn in
  code). The departures board (`#board/<code>`) goes full screen through the page's own
  fullscreen, which `main.js` already handles.
- **Updates itself** (`updater.js`): reads `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
  (`latest-linux-arm64.yml` on Arm Linux) from the newest GitHub release, 30 seconds after it
  starts, then every hour (from 2.1.1; every six hours before) and 20 seconds after the
  computer wakes. The `.exe`, the AppImage and the Mac app download and install with a
  restart; the `.msi`, `.deb` and `.rpm` only say there's a new version (a `.deb` from the apt
  repository updates with `apt upgrade`, `LINUX-BUILD.md`). If a new version is found but
  doesn't download (or a Mac's won't unzip), a notification says "Couldn't download SG Bus
  Timings 2.2.4", once per version, and clicking it opens the release page; the next check
  tries again. A check that fails, offline say, stays quiet unless it was asked for from the
  tray. Upload the `.yml` files, the Mac `.zip`s and the `.blockmap`s with the installers on
  every release (the workflow does).
- **Updates as it opens, as Discord does** (2.2.8, `updater.js`'s `startup`, `splash.html`): a
  small frameless window with the icon checks first ("Checking for updates…", up to 10
  seconds), and an update the `.exe`, AppImage or Mac app can install downloads there with a
  bar, then "Installing update…" and the app restarts as the new version. Later, under the bar,
  opens the app and leaves the download to finish in the background as above. Nothing found,
  offline, or the `.msi`, `.deb` or `.rpm`: "Starting…" and the app's window. Restart to update
  shows the same window. From source, `SGBUS_SPLASH_DEMO=1 npm start` runs it through the
  steps with made-up numbers (in a VS Code terminal, unset `ELECTRON_RUN_AS_NODE` first).
- **New versions as notifications** (2.1.1): "SG Bus Timings 2.1.1 is out" (or "is ready",
  once downloaded, or "Couldn't download"), unless **New versions of the app** is turned off
  in the site's Service alerts (`main-site/js/app-update.js`, through `preload.js`'s `sgbusDesktop.releases`, kept
  as `updateNotices` in `settings.json`). It looks for itself rather than being told, as
  Electron has no Web Push or FCM for the GitHub webhook the Android app hears from
  (`main-site/api/push/release.js`). The tray's menu and the title bar's button offer the
  update either way.
- **Links elsewhere open in your browser**; the site's own pages stay in the app.
- **`uwu://sgbus/` links open it**, on the page they name, mapped as the Android app maps
  them (`fromAppLink` in `main.js`). On Windows the app registers the `uwu` scheme for your
  account each time it starts, so links work once it's been opened once (the `.exe` installer
  opens it as it finishes; after the `.msi`, open it yourself);
  on Linux the `.deb`'s menu entry declares it (`protocols` in `package.json`). Windows, macOS
  and Linux give a scheme to one app only, unlike Android, which shares `uwu://` out by host,
  so every UwU desktop app shares `links.js` (copied as is from uwuPromptr): as it starts,
  the app notes which app held `uwu://` (kept as `linkHandoff` in `settings.json`), then takes
  it, and hands every link that isn't `sgbus`'s on to that app. With two UwU apps installed,
  whichever started last holds the scheme and passes the other its links. An AppImage only
  gets links once it's been set up in the desktop's menu, as AppImageLauncher or Gear Lever do.

The page reaches the app only through `window.sgbusDesktop` (`preload.js`), and `main.js`
only answers the site's own origin. The site's location and notification permissions are
allowed; anything else it asks for is refused. No key or secret is in the app.

Location works where the computer can tell where it is: on Windows, with **Settings** >
**Privacy & security** > **Location** on, and on macOS, once allowed. On Linux Chromium has
only Google's location service, which needs an API key Electron doesn't have, so from 2.0.7
the app finds it itself (`location.js`): it scans the Wi-Fi around with NetworkManager
(`nmcli`) and asks [BeaconDB](https://beacondb.net) where those networks are (hardware
addresses and strengths only; `_nomap` networks left out), turning down anything rougher
than 3 km (an internet-address guess). GNOME's Location Services switch is respected. The
page reaches it as `sgbusDesktop.locate`, and `main-site/js/desktop-location.js` points
`navigator.geolocation` at it.

## Build it

GitHub builds every one of them, each on its own system (`.github/workflows/build-desktop.yml`):

- **Every push that changes `desktop/`** builds them. The files are on the run's page, under
  **Artifacts** (Actions > Build desktop apps > the run), for 30 days.
- **To add them to a release**: Actions > **Build desktop apps** > **Run workflow**, on
  `main`, with the release's tag (such as `android-v2.0.3`). The files are added to that
  release, replacing any of the same name. With no release of that tag yet, a **draft**
  release is made for them: add the APK, write what's new, and publish it. Nobody's app sees a
  draft, so nothing updates until then.
- **Publishing a release** builds them from the release's tag and adds them there by itself,
  unless they're on it already.

To build them yourself instead, on Windows, in PowerShell:

```powershell
cd desktop
npm ci
npm run build:win
```

The `.exe` and `.msi` land in `desktop\dist\`; copy them to `release\<version>\` beside the
APK. The `.exe` holds the app for both x64 and Arm (`nsis:x64 nsis:arm64` in `build:win`),
so it's about twice the size of an x64-only one, under the same name, and `latest.yml` still
lists the one file. For Linux, see `LINUX-BUILD.md`. For macOS, see below.

The installers aren't code-signed, so Windows SmartScreen says "Windows protected your PC"
the first time: **More info** > **Run anyway**. A code-signing certificate would remove that.

To try it without installing: `npm start`.

### macOS

A Mac app can only be built on a Mac, so GitHub builds it (above): a `.dmg` and a `.zip` each
for Apple silicon (`arm64`) and Intel (`x64`), and `latest-mac.yml` for the updater.

Locally on a Mac, `npm ci` then `npm run build:mac` does the same, into `desktop/dist/`.

It isn't signed with an Apple Developer ID (only ad-hoc), so the first time it's opened macOS
says it "can't be opened because Apple cannot check it for malicious software". Open it from
**Finder** with right-click > **Open** > **Open**, or on macOS 15 and later: **System Settings**
> **Privacy & Security**, **Open Anyway**. If macOS says it's "damaged", run
`xattr -cr "/Applications/SG Bus Timings.app"` in Terminal. An Apple Developer ID ($99 a
year) would fix that.

It still updates itself, though not as signed Mac apps do: macOS's own updater (Squirrel.Mac)
only takes apps signed with a Developer ID. So `updater.js` downloads the new `.zip` (its
SHA-512 checked against `latest-mac.yml`), unzips it, and once the app quits, swaps the new
`SG Bus Timings.app` in for the old one, and opens it again for **Restart to update**. That
needs the app in a folder you can write to, as `/Applications` is for an admin; run from the
`.dmg`, or straight from Downloads (macOS runs that from a read-only copy), it only says
there's a new version. macOS may ask again for your location after an update, as it can't
tell an ad-hoc signed app's new version is the same app.

## A new version

Raise `version` in `package.json` to the Android app's new version (`android/README.md`,
"Build the APK"), build both, and publish them on the same GitHub release (see
`release/README.md`).
