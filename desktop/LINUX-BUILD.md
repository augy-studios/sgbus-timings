# Building the Linux app on the VPS

The Linux installers (`.deb` and `.AppImage`) have to be built on Linux. The Debian 13
VPS does it. It builds files and nothing else: no website, no port, and nginx isn't touched.

You need about 2 GB free on the VPS for the tools and the build. Each build takes a few
minutes.

## Set it up, once

SSH into the VPS, then:

1. **Install Node.js, npm and git.** Debian 13's own Node.js (20) is new enough.

   ```bash
   sudo apt update
   sudo apt install -y nodejs npm git
   node --version   # v20 or later
   ```

2. **Get the project.** In your home folder:

   ```bash
   cd ~
   git clone https://github.com/augy-studios/sgbus-timings.git
   cd sgbus-timings/desktop
   chmod +x build-linux.sh
   ```

   If the repository is private, GitHub asks for a username and password. Use your username
   and a [personal access token](https://github.com/settings/tokens) with read access to the
   repository as the password.

## Build a version

1. On your PC, raise `version` in `desktop/package.json` to the Android app's version (they
   always match), commit and push.
2. On the VPS, get that version and build:

   ```bash
   cd ~/sgbus-timings
   git pull
   cd desktop
   ./build-linux.sh
   ```

   The first build downloads Electron and the packaging tools (a few hundred MB); later
   ones reuse them. It ends with `Done:` and the two files, in
   `~/sgbus-timings/release/<version>/`.

3. **Bring them back to your PC.** In PowerShell on your PC, from the project folder,
   with your VPS's user and address in place of `you@your-vps`:

   ```powershell
   scp you@your-vps:~/sgbus-timings/release/2.0.1/sg-bus-timings-2.0.1-amd64.deb release\2.0.1\
   scp you@your-vps:~/sgbus-timings/release/2.0.1/sg-bus-timings-2.0.1-x86_64.AppImage release\2.0.1\
   ```

   They then sit beside the Windows `.exe` and `.msi` and the Android `.apk`. See
   `release/README.md` for putting them on GitHub.

If you need to change a file on the VPS, use `micro` (`micro build-linux.sh`; Ctrl+S
saves, Ctrl+Q quits). Changes are better made on your PC and pulled, though, so the two
don't drift apart.

## Try it on the VPS (optional)

The VPS has no screen, so the app can't run there. To check the `.deb` is a sound package:

```bash
dpkg-deb --info ~/sgbus-timings/release/2.0.1/sg-bus-timings-2.0.1-amd64.deb
```

## If something goes wrong

| What happens | What to do |
|---|---|
| `npm ci` says `EBADENGINE` or Node is too old | Install Node 22 from NodeSource: `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` then `sudo apt install -y nodejs`. |
| `npm ci` fails with "package-lock.json not in sync" | Run `npm install` once on your PC in `desktop/`, commit `package-lock.json`, push, then `git pull` and build again. |
| The build stops at `fpm` with a Ruby error | `sudo apt install -y ruby ruby-dev rpm`, then build again. electron-builder normally brings its own. |
| `No space left on device` | `rm -rf ~/.cache/electron ~/.cache/electron-builder` clears the downloaded tools; they're fetched again next build. |
| `Permission denied` running the script | `chmod +x build-linux.sh` |

## Installing it, on a Linux PC

- **`.deb`** (Debian, Ubuntu, Mint): `sudo apt install ./sg-bus-timings-2.0.1-amd64.deb`, then
  open **SG Bus Timings** from the app menu.
- **`.AppImage`** (any distribution): `chmod +x sg-bus-timings-2.0.1-x86_64.AppImage`, then
  run it. Some need FUSE 2 first: `sudo apt install libfuse2t64` on Debian 13 and Ubuntu
  24.04 or later, `sudo apt install libfuse2` on older ones.
