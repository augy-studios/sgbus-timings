# The desktop installers

The scripts that pack a release build of the desktop app (`flutter build windows`, `macos` or
`linux`) into the files a GitHub release carries, and the small update files every copy of the app
reads to find a new version. GitHub Actions runs them all for each release
(`.github/workflows/build-desktop.yml`); run them yourself only to try a build, or to build one
system's files by hand. The version in every file name is `pubspec.yaml`'s, without the build
number.

Every name, folder and key here is the Electron app's (2.0.0 to 2.4.8), read from its published
2.4.8 installers, so its own updater (electron-updater) downloads and runs these, and each Electron
copy becomes the Flutter app in place, with its settings and data (see "Kept from the Electron
app" below). Each script's header says where every name came from. Change none of them, or old
copies stop updating.

## What each script builds

| Script | Builds, into `build/dist/` | Run on |
|---|---|---|
| `windows/stage-windows.ps1` | Gets one Windows build ready: copies it to `build/installers/windows/<arch>/` and renames `sgbus_timings.exe` to `SG Bus Timings.exe` (Flutter's CMake can't name a program with spaces) | the Windows PC that built it, x64 or Arm64 |
| `windows/package-windows.ps1` | `sg-bus-timings-<v>-setup.exe` (NSIS, `sgbus-timings.nsi`: x64 and Arm64 in one, installs per person or updates an all-users copy where it is) and `sg-bus-timings-<v>.msi` (WiX 5, `sgbus-timings.wxs`: x64) | Windows, with both builds staged |
| `macos/package-macos.sh` | `sg-bus-timings-<v>-mac-<arch>.zip` (what the app updates from) and `.dmg` (what people download), ad-hoc signed, `<arch>` `arm64` or `x64` | a Mac |
| `linux/package-linux.sh` | `sg-bus-timings-<v>-amd64.deb`, `-x86_64.rpm`, `-x86_64.AppImage` (or `-arm64.deb`, `-aarch64.rpm`, `-arm64.AppImage`) | a Linux machine of that processor |
| `update-files.mjs` | `latest.yml` (Windows), `latest-mac.yml`, `latest-linux.yml` and `latest-linux-arm64.yml`, byte for byte as electron-builder wrote them | anywhere with Node 18 or later |

`linux/` also holds what the packages carry: `sgbus-timings.desktop` (the menu entry, with the
`uwu://` handler), `icons/` (the full-square app icon in each size the menus use, 16 to 512
pixels, also the AppImage's), `after-install.sh` and `after-remove.sh` (the `.deb`'s and `.rpm`'s
scripts), `apparmor-profile`, and `LINUX-BUILD.md`, building them on a Linux machine of your own
and the apt repository. `linux/check-glibc.sh` checks a Linux build opens on Ubuntu 22.04 and
Debian 12 (GitHub Actions runs it after each one).

`macos/make-mac-icon.py` remakes the Mac app's own rounded icon from new artwork: by default
`main-site/sgbusicon1.png`, or the picture you give it. It needs Pillow (`pip install pillow`).

## The commands

All from the `flutter` folder, with Flutter 3.50.0 (`README.md`, "Flutter 3.50.0").

**Windows.** On an x64 PC and on an Arm64 PC, each:

```powershell
flutter build windows --release
pwsh installers/windows/stage-windows.ps1 -Arch x64      # -Arch arm64 on the Arm64 PC
```

Then, with both staged folders on one PC (NSIS 3 and the WiX Toolset 5 needed:
`choco install nsis`, `dotnet tool install --global wix --version 5.0.2`,
`wix extension add --global WixToolset.UI.wixext/5.0.2`):

```powershell
pwsh installers/windows/package-windows.ps1
node installers/update-files.mjs windows
```

**macOS**, each processor on its own (`FLUTTER_XCODE_ARCHS` keeps the build to one):

```bash
FLUTTER_XCODE_ARCHS=arm64 flutter build macos --release
installers/macos/package-macos.sh arm64
FLUTTER_XCODE_ARCHS=x86_64 flutter build macos --release
installers/macos/package-macos.sh x64
node installers/update-files.mjs mac
```

**Linux**, on a machine of each processor (`dpkg-deb`, `rpmbuild` and `appimagetool` needed:
`LINUX-BUILD.md`):

```bash
flutter build linux --release
installers/linux/package-linux.sh x64                  # or arm64
node installers/update-files.mjs linux-x64             # or linux-arm64
```

Every file in `build/dist/` then goes on the release: the installers and the `latest*.yml` files.
Without the update files no copy of the app, old or new, can tell there's a new version
(`release/README.md`).

## Kept from the Electron app

| What | Value |
|---|---|
| App id, AppUserModelID, Linux application id | `org.uwuapps.sgbus` |
| Windows program and uninstaller | `SG Bus Timings.exe`, `Uninstall SG Bus Timings.exe` |
| Windows folder (per person) | `%LOCALAPPDATA%\Programs\SG Bus Timings`, or the one an earlier install recorded |
| Windows registry keys | `HKCU\Software\8b1cb8d1-c06f-5377-97bb-cd1bae528f5a` (`InstallLocation`) and the uninstall key `...\Uninstall\8b1cb8d1-c06f-5377-97bb-cd1bae528f5a`; under `HKLM` for an all-users copy |
| Windows installer options | `/S`, `--updated`, `--force-run` (what electron-updater passes) |
| `.msi` UpgradeCode | `{3FF645DE-1032-5174-93DD-DE717BE68737}` |
| macOS app | `SG Bus Timings.app`, bundle id `org.uwuapps.sgbus`, ad-hoc signed |
| Linux package, folder and program | `sgbus-timings-desktop`, `/opt/SG Bus Timings`, `sgbus-timings` (also on the PATH), menu entry `sgbus-timings.desktop` |
| File names | `sg-bus-timings-<v>-setup.exe`, `.msi`, `-mac-<arch>.zip` and `.dmg`, `-<arch>.deb`, `.rpm` and `.AppImage`, and the `latest*.yml` names |
| Settings folder (read by the app, not the installers) | `%APPDATA%\SG Bus Timings`, `~/Library/Application Support/SG Bus Timings`, `~/.config/SG Bus Timings` |

The one difference from Electron's files: there are no `.blockmap` files, so electron-updater
downloads the whole installer rather than only its changed parts.

None of the installers is signed with a paid certificate: Windows SmartScreen warns before the
first run, and macOS asks once (the guide's "Install and update it" page says how to get past
both).
