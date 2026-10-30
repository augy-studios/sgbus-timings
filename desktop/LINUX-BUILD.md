# Building the Linux app on the VPS

The Linux installers (`.deb`, `.rpm` and `.AppImage`, each for 64-bit PCs and for 64-bit Arm)
have to be built on Linux. GitHub Actions builds them with the others (`desktop/README.md`,
"Build it"), so this is only needed to build them yourself. The Debian 13 VPS can: it builds
files and nothing else, no website, no port, and nginx isn't touched. The Arm ones are made on
the same machine: the app has nothing in it that has to run on Arm to be packaged.

You need about 2 GB free on the VPS for the tools and the build. Each build takes a few
minutes.

## Set it up, once

SSH into the VPS, then:

1. **Install Node.js, npm, git and rpm.** Debian 13's own Node.js (20) is new enough. `rpm`
   is what makes the `.rpm`.

   ```bash
   sudo apt update
   sudo apt install -y nodejs npm git rpm
   node --version   # v20 or later
   ```

2. **Get the project.** In your home folder:

   ```bash
   cd ~
   git clone https://github.com/augy-studios/sgbus-timings.git
   cd sgbus-timings/desktop
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
   bash build-linux.sh
   ```

   The first build downloads Electron for both processors and the packaging tools (a few
   hundred MB); later ones reuse them. It ends with `Done:` and the files, in
   `~/sgbus-timings/release/<version>/`:

   | File | For |
   |---|---|
   | `sg-bus-timings-<version>-amd64.deb`, `-arm64.deb` | Debian, Ubuntu, Mint; Raspberry Pi OS (64-bit) |
   | `sg-bus-timings-<version>-x86_64.rpm`, `-aarch64.rpm` | Fedora, openSUSE, RHEL and the like |
   | `sg-bus-timings-<version>-x86_64.AppImage`, `-arm64.AppImage` | Any 64-bit Linux, without installing |
   | `latest-linux.yml`, `latest-linux-arm64.yml` | What the AppImages read to update themselves |

   Each name says the processor in its own system's word for it, so the x64 ones keep the
   names they had before Arm came along.

3. **Bring them back to your PC.** In PowerShell on your PC, from the project folder,
   with your VPS's user and address in place of `you@your-vps`:

   ```powershell
   scp "you@your-vps:~/sgbus-timings/release/2.2.8/sg-bus-timings-2.2.8-*" release\2.2.8\
   scp "you@your-vps:~/sgbus-timings/release/2.2.8/latest-linux*.yml" release\2.2.8\
   ```

   They then sit beside the Windows `.exe` and `.msi` and the Android `.apk`. See
   `release/README.md` for putting them on GitHub.

If you need to change a file on the VPS, use `micro` (`micro build-linux.sh`; Ctrl+S
saves, Ctrl+Q quits). Changes are better made on your PC and pulled, though, so the two
don't drift apart.

## Try it on the VPS (optional)

The VPS has no screen, so the app can't run there. To check the `.deb` is a sound package:

```bash
dpkg-deb --info ~/sgbus-timings/release/2.2.8/sg-bus-timings-2.2.8-amd64.deb
rpm -qip ~/sgbus-timings/release/2.2.8/sg-bus-timings-2.2.8-x86_64.rpm
```

## If something goes wrong

| What happens | What to do |
|---|---|
| `npm ci` says `EBADENGINE` or Node is too old | Install Node 22 from NodeSource: `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` then `sudo apt install -y nodejs`. |
| `npm ci` fails with "package-lock.json not in sync" | Run `npm install` once on your PC in `desktop/`, commit `package-lock.json`, push, then `git pull` and build again. |
| `rpmbuild is missing`, or the build stops at `fpm` saying it needs `rpmbuild` | `sudo apt install -y rpm`, then build again. |
| The build stops at `fpm` with a Ruby error | `sudo apt install -y ruby ruby-dev rpm`, then build again. electron-builder normally brings its own. |
| `No space left on device` | `rm -rf ~/.cache/electron ~/.cache/electron-builder` clears the downloaded tools; they're fetched again next build. |
| `git pull` says your local changes to a file would be overwritten | The VPS's copy changed (a `chmod` on the script does it). Put it back with `git fetch` then `git reset --hard origin/main`, and pull again. Run the script with `bash build-linux.sh`, which needs no `chmod`. |

## Installing it, on a Linux PC

Most PCs want the x64 files (`amd64`, `x86_64`); an Arm computer, such as a Raspberry Pi 4 or
5 on 64-bit Raspberry Pi OS or an Arm laptop, the Arm ones (`arm64`, `aarch64`). `uname -m`
says which: `x86_64` or `aarch64`. There's no 32-bit build: Electron no longer makes one.

- **`.deb`** (Debian, Ubuntu, Mint, Raspberry Pi OS): `sudo apt install
  ./sg-bus-timings-2.2.8-amd64.deb` (or `-arm64.deb`), then open **SG Bus Timings** from the
  app menu. For updates with the rest of the system, add the apt repository below instead.
- **`.rpm`** (Fedora, openSUSE, RHEL): `sudo dnf install ./sg-bus-timings-2.2.8-x86_64.rpm`
  (or `-aarch64.rpm`; `sudo zypper install` on openSUSE).
- **`.AppImage`** (any distribution): `chmod +x sg-bus-timings-2.2.8-x86_64.AppImage` (or
  `-arm64.AppImage`), then run it. Some need FUSE 2 first: `sudo apt install libfuse2t64` on
  Debian 13 and Ubuntu 24.04 or later, `sudo apt install libfuse2` on older ones.

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
files of around 100 MB each fit, though a thousand installs or updates a month would reach
the download limit. If it does, the repository can move elsewhere, with a new address in the
install lines.
