#!/usr/bin/env bash
# Builds the Linux installers on a Linux machine, such as the Debian VPS (LINUX-BUILD.md):
#
#     cd desktop && bash build-linux.sh
#
# Run it with bash rather than chmod-ing it: a chmod shows up in git as a change to the file,
# and the next git pull refuses to go ahead.
#
# Installs the packages if they're missing, then electron-builder makes the .deb, the .rpm and
# the .AppImage, each for 64-bit PCs (x64) and 64-bit Arm (arm64), the Arm ones cross-built on
# this machine (the app has no native modules, so nothing has to run on Arm to package it).
# They're copied to release/<version>/ at the project root, beside the Windows installers and
# the Android app of the same version.
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
# The .rpm needs rpmbuild, from Debian's rpm package (LINUX-BUILD.md).
if ! command -v rpmbuild > /dev/null; then
  echo "rpmbuild is missing: sudo apt install -y rpm, then run this again." >&2
  exit 1
fi
npm run build:linux

mkdir -p "$root/release/$version"
# latest-linux.yml (x64) and latest-linux-arm64.yml are what the AppImages read to update
# themselves (updater.js): they go on the GitHub release with the installers. electron-builder
# names each by its system's own word for the processor: amd64 and arm64 for the .deb, x86_64
# and aarch64 for the .rpm, x86_64 and arm64 for the AppImage.
files=(
  "dist/sg-bus-timings-${version}-amd64.deb" "dist/sg-bus-timings-${version}-arm64.deb"
  "dist/sg-bus-timings-${version}-x86_64.rpm" "dist/sg-bus-timings-${version}-aarch64.rpm"
  "dist/sg-bus-timings-${version}-x86_64.AppImage" "dist/sg-bus-timings-${version}-arm64.AppImage"
  "dist/latest-linux.yml" "dist/latest-linux-arm64.yml"
)
cp "${files[@]}" "$root/release/$version/"
echo "Done:"
ls -lh "${files[@]/#dist/$root/release/$version}"
