#!/usr/bin/env bash
# Builds the Linux installers on a Linux machine, such as the Debian VPS (LINUX-BUILD.md):
#
#     cd desktop && ./build-linux.sh
#
# Installs the packages if they're missing, then electron-builder makes the .deb and the
# .AppImage, and they're copied to release/<version>/ at the project root, beside the Windows
# installers and the Android app of the same version.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
cd "$here"

version="$(node -p "require('./package.json').version")"
echo "Building SG Bus Timings ${version} for Linux..."

# Missing, or from before a package was added (electron-updater, 2.0.1).
if [ ! -d node_modules/electron-builder ] || [ ! -d node_modules/electron-updater ]; then
  npm ci
fi
npx electron-builder --linux deb AppImage --x64 --publish never

mkdir -p "$root/release/$version"
# latest-linux.yml is what the AppImage reads to update itself (updater.js): it goes on the
# GitHub release with the installers.
cp "dist/sg-bus-timings-${version}-amd64.deb" "dist/sg-bus-timings-${version}-x86_64.AppImage" "dist/latest-linux.yml" "$root/release/$version/"
echo "Done:"
ls -lh "$root/release/$version/"*.deb "$root/release/$version/"*.AppImage "$root/release/$version/latest-linux.yml"
