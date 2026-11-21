Desktop widgets are off for now: opening one could still crash the app on Windows, so the desktop app no longer offers them until that's fixed.

## Download

| Device | File |
|---|---|
| Windows 10 or 11 | `sg-bus-timings-2.5.2-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.5.2-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.5.2-all.deb`, or `sgbus` |

This update is for the desktop app. The Android app and its watch app stay on 2.5.0, from that release.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.5.2 is out; install the new one over the old one. Your favourites and settings stay.

## What's new

### Desktop app
- **Desktop widgets are off for now**: on Windows, opening a desktop widget could still crash the app, as 2.5.1 only made it less likely. Until that's fixed, the app doesn't offer widgets (not in a stop's buttons, its right-click menu, the tray, the menus or the command bar) and opens none when it starts. The widgets you had are kept, and come back where they were once widgets return.

### Linux command line
- No changes of its own: numbered 2.5.2 to stay in step with the desktop app.
