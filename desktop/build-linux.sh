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

if [ ! -d node_modules/electron-builder ]; then
  npm ci
fi
npx electron-builder --linux deb AppImage --x64

mkdir -p "$root/release/$version"
cp "dist/sg-bus-timings-${version}-amd64.deb" "dist/sg-bus-timings-${version}-x86_64.AppImage" "$root/release/$version/"
echo "Done:"
ls -lh "$root/release/$version/"*.deb "$root/release/$version/"*.AppImage
