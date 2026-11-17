# Building the Linux app on a machine of your own

The Linux installers (`.deb`, `.rpm` and `.AppImage`, each for 64-bit PCs and for 64-bit Arm)
have to be built on Linux, and each processor's on a machine of that processor: Flutter can't
cross-build for another one. GitHub Actions builds them all with the others for every release
(`.github/workflows/build-desktop.yml`; `../README.md`), so this is only needed to build them
yourself. The Debian 13 VPS can build the x64 ones: it builds files and nothing else, no website,
no port, and nginx isn't touched. The Arm ones need a 64-bit Arm Linux machine, such as a
Raspberry Pi 4 or 5 on 64-bit Raspberry Pi OS, with the same steps.

A Linux build only runs on systems at least as new as the one it was built on (their C library,
glibc), so build on the oldest system it should run on. GitHub Actions builds on Ubuntu 22.04,
so the released files need Ubuntu 22.04, Debian 12 or newer; `installers/linux/check-glibc.sh`
checks every build it makes. Built on the Debian 13 VPS, they need Debian 13 or newer, leaving
out Ubuntu 22.04 and 24.04 and Debian 12: to keep those, build on Ubuntu 22.04 or Debian 12.

You need about 5 GB free for Flutter, the tools and the build. The first build takes a while;
later ones a few minutes.

Before 2.5.0 the desktop app was made with Electron, built by `desktop/build-linux.sh` (now in git
history). The packages keep its names, so they install over it.

## Set it up, once

SSH into the machine, then:

1. **Install the build tools**: Flutter's own for Linux, the libraries the app builds against
   (GTK 3, WebKitGTK 4.1 for the map, X11 and Xi, PulseAudio), `rpm` for the `.rpm`, and Node.js
   for the update file. Debian 13's own Node.js (20) is new enough.

   ```bash
   sudo apt update
   sudo apt install -y git curl unzip xz-utils zip file rpm nodejs \
     clang cmake ninja-build pkg-config g++ liblzma-dev \
     libgtk-3-dev libwebkit2gtk-4.1-dev libx11-dev libxi-dev libpulse-dev
   ```

2. **Install Flutter 3.50.0**, the version the app is built with (`../../README.md`, "Flutter
   3.50.0"):

   ```bash
   git clone --depth 1 --branch 3.50.0 https://github.com/flutter/flutter.git ~/flutter
   echo 'export PATH="$HOME/flutter/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   flutter --version
   ```

3. **Install appimagetool** 1.9.1, which makes the AppImage (`appimagetool-aarch64.AppImage` on
   an Arm machine):

   ```bash
   curl -fsSL -o ~/appimagetool https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage
   chmod +x ~/appimagetool
   ```

4. **Get the project.** In your home folder:

   ```bash
   cd ~
   git clone https://github.com/augy-studios/sgbus-timings.git
   ```

## Build a version

1. On your PC, raise the version in `flutter/pubspec.yaml`, `flutter/lib/app/version.dart` and
   `cli/package.json` (they always match: `release/README.md`), commit and push.
2. On the machine, get that version and build (`arm64` and `linux-arm64` on an Arm machine):

   ```bash
   cd ~/sgbus-timings
   git pull
   cd flutter
   flutter pub get
   flutter build linux --release
   APPIMAGETOOL=~/appimagetool bash installers/linux/package-linux.sh x64
   node installers/update-files.mjs linux-x64
   ```

   It ends with the files, in `~/sgbus-timings/flutter/build/dist/`:

   | File | For |
   |---|---|
   | `sg-bus-timings-<version>-amd64.deb` (`-arm64.deb` on Arm) | Debian, Ubuntu, Mint; Raspberry Pi OS (64-bit) |
   | `sg-bus-timings-<version>-x86_64.rpm` (`-aarch64.rpm`) | Fedora, openSUSE, RHEL and the like |
   | `sg-bus-timings-<version>-x86_64.AppImage` (`-arm64.AppImage`) | Any 64-bit Linux with GTK 3 and WebKitGTK 4.1, without installing |
   | `latest-linux.yml` (`latest-linux-arm64.yml`) | What the AppImage reads to update itself |

   Each name says the processor in its own system's word for it, as the Electron app's did.

3. **Put them on the release.** In PowerShell on your PC, with your machine's user and address in
   place of `you@your-vps`:

   ```powershell
   scp "you@your-vps:~/sgbus-timings/flutter/build/dist/sg-bus-timings-2.5.0-*" .
   scp "you@your-vps:~/sgbus-timings/flutter/build/dist/latest-linux*.yml" .
   ```

   Then on the GitHub release, **Edit**, drag them in (replacing any of the same name), and
   **Update release**. Upload the `.yml` with the AppImage it was written for: it holds that
   file's SHA-512, and the app won't install a file that doesn't match.

If you need to change a file on the machine, use `micro` (Ctrl+S saves, Ctrl+Q quits). Changes
are better made on your PC and pulled, though, so the two don't drift apart.

## Try it (optional)

A VPS has no screen, so the app can't run there. To check the packages are sound:

```bash
dpkg-deb --info ~/sgbus-timings/flutter/build/dist/sg-bus-timings-2.5.0-amd64.deb
rpm -qip ~/sgbus-timings/flutter/build/dist/sg-bus-timings-2.5.0-x86_64.rpm
```

On a Linux desktop, open the AppImage, or install the `.deb`, and check the window, the tray and
the live map.

## If something goes wrong

| What happens | What to do |
|---|---|
| `flutter build linux` stops saying a package such as `gtk+-3.0` or `webkit2gtk-4.1` wasn't found | Install the build tools in step 1 again: one of the `-dev` packages is missing. |
| `flutter pub get` says a package `requires SDK version ^3.14.0` and suggests Flutter 3.50.0 | The wrong Flutter: `flutter --version` must say 3.50.0. |
| `No build in build/linux/x64/release/bundle` or "isn't built for x64" | Run `flutter build linux --release` first, on a machine of that processor. |
| `appimagetool not found` | Give its path: `APPIMAGETOOL=~/appimagetool` before the command, as above. |
| `rpmbuild` is missing | `sudo apt install -y rpm`, then pack again. |
| `No space left on device` | `flutter clean` in `flutter/` clears the build; `rm -rf ~/.pub-cache` clears the downloaded packages (fetched again next build). |
| `git pull` says your local changes to a file would be overwritten | The machine's copy changed. Put it back with `git fetch` then `git reset --hard origin/main`, and pull again. Run the scripts with `bash`, which needs no `chmod`. |

## Installing it, on a Linux PC

Most PCs want the x64 files (`amd64`, `x86_64`); an Arm computer, such as a Raspberry Pi 4 or
5 on 64-bit Raspberry Pi OS or an Arm laptop, the Arm ones (`arm64`, `aarch64`). `uname -m`
says which: `x86_64` or `aarch64`. There's no 32-bit build. The released files need Ubuntu
22.04, Debian 12 or newer, or another Linux as new.

- **`.deb`** (Debian, Ubuntu, Mint, Raspberry Pi OS): `sudo apt install
  ./sg-bus-timings-2.5.0-amd64.deb` (or `-arm64.deb`), then open **SG Bus Timings** from the
  app menu. It brings GTK 3 and WebKitGTK 4.1 with it if they're missing. For updates with the
  rest of the system, add the apt repository below instead.
- **`.rpm`** (Fedora, openSUSE, RHEL): `sudo dnf install ./sg-bus-timings-2.5.0-x86_64.rpm`
  (or `-aarch64.rpm`; `sudo zypper install` on openSUSE).
- **`.AppImage`** (any distribution as new, with GTK 3 and WebKitGTK 4.1): `chmod +x
  sg-bus-timings-2.5.0-x86_64.AppImage` (or `-arm64.AppImage`), then run it. Without those two:
  `sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0` (or `sudo dnf install gtk3 webkit2gtk4.1`).
  It needs FUSE to mount itself (`sudo apt install fuse3` if it says it can't), or run it with
  `--appimage-extract-and-run`.

The AppImage updates itself. The `.deb` and the `.rpm` only say there's a new version, as
installing one needs your password; the apt repository fixes that for the `.deb`.

## An apt repository, for updates with `apt upgrade`

From the release after it's set up, GitHub Actions also puts the newest release's `.deb`
files, the app's for `amd64` and `arm64` and the command line's (`cli/README.md`), into a
signed apt repository on GitHub Pages (`.github/workflows/build-desktop.yml`, the `apt` job).
A computer that has it gets each new version with its other updates.

### Adding it, on a Debian or Ubuntu PC

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://augy-studios.github.io/sgbus-timings/sgbus-timings.gpg | sudo tee /etc/apt/keyrings/sgbus-timings.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/sgbus-timings.gpg] https://augy-studios.github.io/sgbus-timings stable main" | sudo tee /etc/apt/sources.list.d/sgbus-timings.list
sudo apt update
sudo apt install sgbus-timings-desktop   # the app
sudo apt install sgbus-timings-cli       # the command line, sgbus
```

After that, `sudo apt update && sudo apt upgrade` brings each new version. An app already
installed from a downloaded `.deb` is the same package, so adding the repository is enough for
it to update. To take it away again:
`sudo rm /etc/apt/sources.list.d/sgbus-timings.list /etc/apt/keyrings/sgbus-timings.gpg`.

The repository holds only the newest version, as the releases' `latest` link does. The
signing key's fingerprint is shown by `gpg --show-keys /etc/apt/keyrings/sgbus-timings.gpg`.

### Setting it up, once (Augy)

Until these are done the `apt` job is skipped and releases go out as before.

1. **Make the signing key**, on the VPS or any computer with GnuPG. No passphrase, as GitHub
   Actions signs with it unattended; it never expires, as every computer that added the
   repository trusts this one key:

   ```bash
   gpg --batch --passphrase '' --quick-gen-key "SG Bus Timings apt repository <augybiz@gmail.com>" rsa4096 sign never
   gpg --armor --export-secret-keys "SG Bus Timings apt repository" > apt-signing-key.asc
   ```

2. **Add it as a secret**: on GitHub, the repository's **Settings** > **Secrets and
   variables** > **Actions** > **New repository secret**, name `APT_SIGNING_KEY`, and paste
   all of `apt-signing-key.asc` as the value. Then keep a copy of the file somewhere safe and
   offline (a password manager), and delete it from the computer:
   `shred -u apt-signing-key.asc`. Lost, a new key means everyone adds the repository again.

3. **Turn on GitHub Pages**: **Settings** > **Pages** > **Build and deployment** > **Source**:
   **GitHub Actions**.

4. **Let releases deploy to it**: **Settings** > **Environments** > **github-pages** >
   **Deployment branches and tags** > **Add deployment branch or tag rule**, **Tag**,
   `android-v*`. A published release builds from its tag, which the environment otherwise
   turns away.

5. **Fill it the first time**: Actions > **Build desktop apps** > **Run workflow**, on `main`,
   with the newest release's tag. It builds the files again, replaces them on the release, and
   the `apt` job publishes the repository. From then on, each release does it by itself.
   Check it at <https://augy-studios.github.io/sgbus-timings/dists/stable/InRelease>.

GitHub Pages keeps a site to 1 GB and about 100 GB of downloads a month: the app's two `.deb`
files fit, though a thousand installs or updates a month could reach the download limit. If it
does, the repository can move elsewhere, with a new address in the install lines.
