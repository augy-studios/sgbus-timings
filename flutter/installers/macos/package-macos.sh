#!/usr/bin/env bash
# Packs one macOS build of SG Bus Timings into the two files the release carries for that
# processor:
#
#   build/dist/sg-bus-timings-<version>-mac-<arch>.zip   the app updates itself from this one
#   build/dist/sg-bus-timings-<version>-mac-<arch>.dmg   people download this and drag the app
#                                                        to Applications
#
# <arch> is arm64 (Apple silicon) or x64 (Intel), the names the Electron app's files had, which
# its updater (and lib/desktop/updater.dart) tell apart by "arm64" in the name. Each is built on
# its own, for that processor only. Run from the flutter folder:
#
#   FLUTTER_XCODE_ARCHS=arm64 flutter build macos --release
#   installers/macos/package-macos.sh arm64
#   FLUTTER_XCODE_ARCHS=x86_64 flutter build macos --release
#   installers/macos/package-macos.sh x64
#
# (FLUTTER_XCODE_ARCHS is handed to Xcode as ARCHS; without it the build has both processors in
# one, twice the size.) Then write latest-mac.yml with `node installers/update-files.mjs mac`.
#
# The app is signed ad hoc ("codesign -s -"), as the Electron app was: no Apple Developer ID, so
# macOS asks once (right-click > Open). The .app keeps the Electron app's name, "SG Bus
# Timings.app", so the Electron app's updater swaps this one in for itself and reopens it.
set -euo pipefail

arch="${1:-}"
case "$arch" in
  arm64) lipo_arch=arm64 ;;
  x64) lipo_arch=x86_64 ;;
  *) echo "Usage: installers/macos/package-macos.sh arm64|x64" >&2; exit 2 ;;
esac

app_name="SG Bus Timings.app"
bundle_id="org.uwuapps.sgbus"
version="$(sed -n 's/^version:[[:space:]]*\([0-9.]*\).*/\1/p' pubspec.yaml | head -1)"
[ -n "$version" ] || { echo "No version line in pubspec.yaml (run this from the flutter folder)." >&2; exit 1; }
work="build/installers/macos/$arch"
dist="build/dist"
zip="$dist/sg-bus-timings-$version-mac-$arch.zip"
dmg="$dist/sg-bus-timings-$version-mac-$arch.dmg"

# ---------- the app ----------

# Flutter's build, whatever Xcode named it (the runner's product name).
built=(build/macos/Build/Products/Release/*.app)
if [ ! -d "${built[0]}" ] || [ "${#built[@]}" -ne 1 ]; then
  echo "Expected one .app in build/macos/Build/Products/Release/: run 'flutter build macos --release' first." >&2
  exit 1
fi

rm -rf "$work"
mkdir -p "$work" "$dist"
app="$work/$app_name"
# ditto copies a bundle whole: its links, permissions and signature.
ditto "${built[0]}" "$app"

plist="$app/Contents/Info.plist"
executable="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")"
archs="$(lipo -archs "$executable")"
if [ "$archs" != "$lipo_arch" ]; then
  echo "The build has '$archs' in it, not only $lipo_arch: build it with FLUTTER_XCODE_ARCHS=$lipo_arch." >&2
  exit 1
fi
found_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
if [ "$found_id" != "$bundle_id" ]; then
  # Not fatal, so the packaging can be tried before the runner's settings are final; a release
  # needs the Electron app's id, or macOS takes it for a different app.
  echo "WARNING: the bundle id is $found_id, not $bundle_id (macos/Runner/Configs/AppInfo.xcconfig)." >&2
fi

# ---------- signing (ad hoc) ----------

# Inside out, as codesign wants: each framework and library first, then the app. The app keeps
# the entitlements Xcode gave it (location, network), which a plain re-sign would drop.
entitlements="$work/entitlements.plist"
codesign -d --entitlements - --xml "$app" > "$entitlements" 2>/dev/null || true
find "$app/Contents/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -print0 2>/dev/null |
  while IFS= read -r -d '' code; do
    codesign --force --sign - --timestamp=none "$code"
  done
if [ -s "$entitlements" ]; then
  codesign --force --sign - --timestamp=none --entitlements "$entitlements" "$app"
else
  codesign --force --sign - --timestamp=none "$app"
fi
codesign --verify --deep --strict "$app"

# ---------- the .zip ----------

# --keepParent: the zip holds "SG Bus Timings.app" itself, which the updaters unzip and swap in.
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip"

# ---------- the .dmg ----------

# The app and a link to Applications, to drag it onto. hdiutil is sometimes "busy" on a build
# machine for a moment, so it gets three tries.
dmg_stage="$work/dmg"
mkdir -p "$dmg_stage"
ditto "$app" "$dmg_stage/$app_name"
ln -s /Applications "$dmg_stage/Applications"
rm -f "$dmg"
for try in 1 2 3; do
  if hdiutil create -volname "SG Bus Timings" -srcfolder "$dmg_stage" -fs HFS+ -format UDZO -ov "$dmg"; then
    break
  fi
  [ "$try" = 3 ] && exit 1
  sleep 5
done

# ---------- check them ----------

# The .zip unpacks to a whole, validly signed app, as the updater will unpack it.
check="$work/check"
mkdir -p "$check/zip" "$check/mount"
ditto -x -k "$zip" "$check/zip"
codesign --verify --deep --strict "$check/zip/$app_name"
# The .dmg opens and has the app and the Applications link in it.
hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$check/mount" > /dev/null
dmg_ok=true
[ -d "$check/mount/$app_name" ] && [ -L "$check/mount/Applications" ] || dmg_ok=false
codesign --verify --deep --strict "$check/mount/$app_name" || dmg_ok=false
hdiutil detach "$check/mount" > /dev/null
[ "$dmg_ok" = true ] || { echo "The .dmg doesn't hold a valid $app_name and an Applications link." >&2; exit 1; }
rm -rf "$check" "$dmg_stage"

ls -l "$zip" "$dmg"
