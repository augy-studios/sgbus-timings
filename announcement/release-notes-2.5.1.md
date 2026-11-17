A steadier start for the desktop app: no more crash and black window as it opens with a desktop widget kept, and update checks that say what went wrong.

## Download

| Device | File |
|---|---|
| Windows 10 or 11 | `sg-bus-timings-2.5.1-setup.exe` (or the `.msi`) |
| Mac with Apple silicon, or Intel | `sg-bus-timings-2.5.1-mac-arm64.dmg`, or `-mac-x64.dmg` |
| Debian, Ubuntu, Mint; Fedora, openSUSE, RHEL | the `.deb`; the `.rpm` |
| Any other Linux (with GTK 3 and WebKitGTK 4.1) | the `.AppImage` |
| Linux command line | `sg-bus-timings-cli-2.5.1-all.deb`, or `sgbus` |

This update is for the desktop app. The Android app and its watch app stay on 2.5.0, from the release before.

The desktop files join the release a few minutes after it's out. Windows SmartScreen: More info > Run anyway. macOS, the first time: System Settings > Privacy & Security > Open Anyway.

## Updating

**Windows (`.exe`), Mac and AppImage**: the app updates itself. **Windows (`.msi`), `.deb` and `.rpm`**: a notification says 2.5.1 is out; install the new one over the old one. Your favourites and settings stay.

## What's new

### Desktop app
- **No crash as it opens**: with a desktop widget kept, the Windows app could crash as it opened, leaving a black window. Your widgets now open a moment after the main window has finished drawing, one at a time.
- **Why an update check failed**: Check for updates says what went wrong (no connection, the files not up yet, GitHub busy) rather than always blaming the connection.

### Linux command line
- No changes of its own: numbered 2.5.1 to stay in step with the desktop app.
