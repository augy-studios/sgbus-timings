---
title: Install and update it
description: Download SG Bus Timings for Windows, Mac or Linux, on Intel, AMD or Arm, get past the first-run warnings, set it up, and how it updates, including from the old desktop app.
---

The desktop app comes from GitHub, as a file for your computer. It's free, with no
account to make.

## Download it

Open the [latest release](https://github.com/augy-studios/sgbus-timings/releases/latest)
and download the one for your computer from under **Assets**:

| Computer | File |
|---|---|
| Windows 10 or 11, Intel, AMD or Arm | `sg-bus-timings-2.5.0-setup.exe`, which installs the right one for your PC. (The `.msi` is the same app on Intel and AMD, for installing it on many computers at once.) |
| Mac with Apple silicon (M1 and later) | `sg-bus-timings-2.5.0-mac-arm64.dmg` |
| Mac with an Intel processor | `sg-bus-timings-2.5.0-mac-x64.dmg` |
| Debian, Ubuntu, Mint | `sg-bus-timings-2.5.0-amd64.deb` |
| Debian or Raspberry Pi OS on 64-bit Arm | `sg-bus-timings-2.5.0-arm64.deb` |
| Fedora, openSUSE, RHEL | `sg-bus-timings-2.5.0-x86_64.rpm` |
| Fedora, openSUSE, RHEL on 64-bit Arm | `sg-bus-timings-2.5.0-aarch64.rpm` |
| Any other Linux | `sg-bus-timings-2.5.0-x86_64.AppImage` |
| Any other Linux on 64-bit Arm | `sg-bus-timings-2.5.0-arm64.AppImage` |

The version in the names goes up with each release; download the newest. The Mac
app needs macOS 12 or later. The Linux app needs Ubuntu 22.04, Debian 12 or
newer, or another Linux as new. On an older one, such as Ubuntu 20.04 or Debian
11, it won't open: use the [command line](../web/linux-cli.md) or the website
there. The `.zip` files and the `latest` files on the release are what the
app updates itself from: you don't need them.

> [!TIP]
> Not sure which Linux file? In a terminal, `uname -m` says `x86_64` for Intel and
> AMD, and `aarch64` for 64-bit Arm, such as a Raspberry Pi 4 or 5 on 64-bit
> Raspberry Pi OS. 32-bit Arm isn't supported.

Rather have it in a terminal, or on a server without a desktop? See
[the command line on Linux](../web/linux-cli.md).

## Install it

The app isn't signed with a paid certificate yet, so Windows and macOS warn about
it the first time. It's safe to carry on.

### Windows

Open the `.exe`. If Windows says "Windows protected your PC", click **More info**,
then **Run anyway**. Pick where to install it (it suggests your own Programs
folder, so it needs no administrator), then open **SG Bus Timings** from the
Start menu or its desktop shortcut.

The `.msi` installs it for you alone, or for everyone on the computer with
`msiexec /i sg-bus-timings-2.5.0.msi ALLUSERS=1`.

### Mac

Open the `.dmg` and drag **SG Bus Timings** into **Applications**, then open it
from there. It isn't signed with an Apple Developer ID yet, so the first time,
macOS says it can't be opened:

1. Click **Done** (or **OK**).
2. Open **System Settings** > **Privacy & Security**, scroll down, and click
   **Open Anyway** next to SG Bus Timings.
3. Click **Open Anyway** again, and sign in with your Mac's password if it asks.

On macOS 14 and earlier, right-clicking the app in Finder and picking **Open**,
then **Open** again, does the same. If macOS says the app is "damaged", run
`xattr -cr "/Applications/SG Bus Timings.app"` in Terminal, then open it again.

Run it from **Applications**, not straight from the `.dmg` or Downloads: from
there it can't update itself. On an account that isn't an administrator it can't
either, as only an administrator can change **Applications**: it says when
there's a new version instead.

### Debian, Ubuntu, Mint, Raspberry Pi OS

Open the `.deb` with your software installer, or in a terminal:
`sudo apt install ./sg-bus-timings-2.5.0-amd64.deb` (`-arm64.deb` on Arm). It
brings what the app needs with it. Then open **SG Bus Timings** from your app menu.

### Fedora, openSUSE, RHEL

Open the `.rpm` with your software installer, or in a terminal,
`sudo dnf install ./sg-bus-timings-2.5.0-x86_64.rpm` on Fedora and RHEL, or
`sudo zypper install ./sg-bus-timings-2.5.0-x86_64.rpm` on openSUSE
(`-aarch64.rpm` on Arm).

### AppImage

Make it runnable (right-click > **Properties** > **Allow executing file as
program**, or `chmod +x` it), then open it.

> [!WARNING]
> The AppImage uses your computer's own **GTK 3** and **WebKitGTK 4.1**, which
> draw its window and the live map. Most desktops have both. If it doesn't open,
> install them: `sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0` on Debian and
> Ubuntu, or `sudo dnf install gtk3 webkit2gtk4.1` on Fedora. Like the `.deb` and
> `.rpm`, it needs Ubuntu 22.04, Debian 12 or newer.

An AppImage also needs FUSE to open, which most desktops have. If it says it
can't mount itself, install it (`sudo apt install fuse3` on Debian and Ubuntu,
`sudo dnf install fuse3` on Fedora), or start it with `--appimage-extract-and-run`
after its name.

For `uwu://` links to open it, add the AppImage to your desktop's app menu first,
as AppImageLauncher or Gear Lever do.

### Install and update it with apt

On Debian, Ubuntu, Mint or 64-bit Raspberry Pi OS, you can add the app's own apt repository instead
of downloading each new `.deb`:

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://augy-studios.github.io/sgbus-timings/sgbus-timings.gpg | sudo tee /etc/apt/keyrings/sgbus-timings.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/sgbus-timings.gpg] https://augy-studios.github.io/sgbus-timings stable main" | sudo tee /etc/apt/sources.list.d/sgbus-timings.list
sudo apt update
sudo apt install sgbus-timings-desktop
```

After that, `sudo apt update && sudo apt upgrade` brings each new version with your other updates.
An app already installed from a downloaded `.deb` is the same package, so adding the repository is
enough for it to update. To take the repository away again:

```bash
sudo rm /etc/apt/sources.list.d/sgbus-timings.list /etc/apt/keyrings/sgbus-timings.gpg
```

## The first time it opens

It opens with a small window that checks for a newer version (see
[Updates](#updates)), then the app, maximised, with **Make it yours** in front.
It needs the internet that first time: without it, the app says **No connection**,
with **Try again**.

### Make it yours

<figure>
<img src="/screenshots/desktop/setup.png" alt="The Make SG Bus Timings yours window: a pale green welcome panel on the left with the app's icon, Bus timings, Navigate and Service alerts, and on the right rows for Language (Automatic), Start when I sign in (on), Follow system theme (off), Theme (Light) and Brand colour, with Classic picked and the blue System accent swatch last, then Get started at the bottom." width="940" height="660" loading="lazy">
<figcaption>Make it yours. The last swatch, System accent, is your computer's own accent colour.</figcaption>
</figure>

<figure>
<img src="/screenshots/desktop/setup-dark.png" alt="The same window with Theme set to Dark and System accent picked: the welcome panel and Get started in the computer's blue, and Your computer's own accent colour under Brand colour." width="940" height="660" loading="lazy">
<figcaption>It shows each choice as you pick it.</figcaption>
</figure>

The first time the app opens, it lets you set it up in one go:

- **Language**, or **Automatic** for your computer's.
- **Start when I sign in**.
- **Follow system theme**, for your computer's light or dark, or a **Theme** of your own: **Light**, **Dark** or **Time-based**.
- **Brand colour**, one of the [theme's](../android/theme.md#the-uwu-apps-theme), or
  **System accent**, your computer's own accent colour, where the app can read it.
  With [Your colours](../web/secret-features.md) on, they wait until you turn those off.

The window shows each choice as you pick it, and **Get started** opens the app
with them. Closing it changes nothing. To see it again, pick **Make it yours…**
in the [tray's menu](tray-and-widgets.md#the-tray), or in the
[command bar](window.md#the-command-bar).

## Updates

<figure>
<img src="/screenshots/desktop/update.png" alt="The small window the desktop app opens with: the app's icon, Downloading update, 31 of 85 MB, a bar a third of the way along, and Later under it." width="300" height="360" loading="lazy">
<figcaption>Updating as it opens.</figcaption>
</figure>

The app checks for a new version as it opens, in a small window with its icon:
**Checking for updates…**, then **Starting…** and the app's window. When
there's a new version it can install itself, it downloads in that window, with a
bar and how much has come, then says **Installing update…** and opens again as
the new version. **Later**, under the bar, opens the app now and lets the download
carry on in the background. Offline, it opens after a few seconds without it. The
window is light or dark as your computer is.

<figure>
<img src="/screenshots/desktop/update-dark.png" alt="The same window in dark mode: the app's icon on a dark green background, Downloading update, 31 of 85 MB, a bar a third of the way along, and Later." width="300" height="360" loading="lazy">
<figcaption>The same, with your computer in dark mode.</figcaption>
</figure>

After that it checks every hour while it runs, and again when your computer wakes
from sleep. To check now, pick **Check for updates…** in the tray's menu or the
command bar (on a Mac, also in the app's menu): a notification says what it found,
even if you're up to date. A new version is only found once its installers are on
the release, which is a few minutes after it's out on Android.

How it updates depends on how you installed it:

| Installed with | What happens |
|---|---|
| The `.exe`, an AppImage in a folder you can write to, or on a Mac in a folder you can write to (**Applications**, on an administrator's account) | It downloads the update itself and checks it's the real file. Then a notification, the tray's menu and a green **update** button in the title bar offer **Restart to update**, which shows the small window saying **Installing update…** as it goes. If you don't, it updates the next time you quit. |
| The `.msi`, `.deb` or `.rpm` | A notification and the tray's menu say there's a new version. Click it to open the release page, download the new installer, and install it over the old one. With the [apt repository](#install-and-update-it-with-apt) added, `sudo apt update && sudo apt upgrade` brings it instead. |
| The `.exe` for everyone on the computer (in Program Files), or a Mac app run from the `.dmg` or Downloads, or in **Applications** on an account that isn't an administrator | The same as the `.msi`: it says there's a new version, as installing it needs an administrator, or a folder it can write to. |

Your favourites and settings stay.

To stop the notifications about new versions, open [Service alerts](../android/service-alerts.md)
and turn off **New versions of the app**. It's on to start with. The tray's menu
still offers the update, and so does the title bar's green button once one has
downloaded and is ready to install.

## Coming from the old desktop app

Versions 2.0.0 to 2.4.8 of the desktop app were the website in a window. They
update to the new app the way they took any other update, and it carries on from
where they left off:

- Installed with the `.exe`, as an AppImage, or on a Mac: the old app downloads
  the new one and installs it over itself, as before. On Windows it goes into the
  same folder, with the same shortcuts. A copy installed for everyone, in Program
  Files, asks for an administrator first; if that's refused, the old app opens
  again as it was.
- Installed with the `.msi`, `.deb` or `.rpm`: the old app says there's a new
  version. Download it and install it over the old one, or let `apt upgrade` bring
  it. It replaces the old app rather than sitting beside it.

The first time the new app opens, it brings across everything the old one kept:
your favourites, places, past searches, trips, uwuCoins, settings and theme, and
the desktop app's own choices: the window's size, **Start when I sign in**, your
desktop widgets and where they were (kept while widgets are off), the tray countdown, and your Make it yours
picks, so that window doesn't ask again. It reads them once, and leaves the old
app's copy where it was.

> [!WARNING]
> **Linux:** the new app needs Ubuntu 22.04, Debian 12 or newer, where the old one
> ran on older systems too. On an older system, it may not open after the update.
> **AppImage:** the old app carried its own browser, and the new one uses your
> computer's GTK 3 and WebKitGTK 4.1. If the new version doesn't open after the
> update, install them as in [AppImage](#appimage) above.

On a Mac, macOS may ask again whether the app can use your location, as it can't
tell the new version is the same app.
