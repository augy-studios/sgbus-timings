#!/usr/bin/env bash
# Packs one Linux build of SG Bus Timings into the three files the release carries for its
# processor:
#
#                 x64 (Intel/AMD)                     arm64
#   .deb          sg-bus-timings-<v>-amd64.deb        sg-bus-timings-<v>-arm64.deb
#   .rpm          sg-bus-timings-<v>-x86_64.rpm       sg-bus-timings-<v>-aarch64.rpm
#   AppImage      sg-bus-timings-<v>-x86_64.AppImage  sg-bus-timings-<v>-arm64.AppImage
#
# all in build/dist/. The names, the package name (sgbus-timings-desktop), the folder
# (/opt/SG Bus Timings), the program's name (sgbus-timings, also on the PATH) and the menu entry
# (sgbus-timings.desktop) are the Electron app's, read from its 2.4.8 .deb and .rpm (their control
# file, scripts and file lists). So `apt upgrade`, `dnf upgrade` or an installed .deb/.rpm opened
# again replaces the Electron app with this one, and the Electron AppImage's updater swaps itself
# for the new AppImage.
#
# Run from the flutter folder on a machine of that processor (Flutter can't cross-build Linux):
#
#   flutter build linux --release
#   installers/linux/package-linux.sh x64      (or arm64)
#
# It needs dpkg-deb, rpmbuild (`sudo apt-get install rpm`) and appimagetool (on the PATH, or its
# path in APPIMAGETOOL). Then write the update file with
# `node installers/update-files.mjs linux-x64` (or linux-arm64).
set -euo pipefail

arch="${1:-}"
case "$arch" in
  x64) deb_arch=amd64 rpm_arch=x86_64 appimage_arch=x86_64 tool_arch=x86_64 elf_machine=x86-64 ;;
  arm64) deb_arch=arm64 rpm_arch=aarch64 appimage_arch=arm64 tool_arch=aarch64 elf_machine=aarch64 ;;
  *) echo "Usage: installers/linux/package-linux.sh x64|arm64" >&2; exit 2 ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="$(sed -n 's/^version:[[:space:]]*\([0-9.]*\).*/\1/p' pubspec.yaml | head -1)"
[ -n "$version" ] || { echo "No version line in pubspec.yaml (run this from the flutter folder)." >&2; exit 1; }
bundle="build/linux/$arch/release/bundle"
work="build/installers/linux/$arch"
dist="build/dist"
app_dir="/opt/SG Bus Timings"
package="sgbus-timings-desktop"
maintainer="UwU Apps <augybiz@gmail.com>"
summary="Live Singapore bus timings, routes and journeys"
description="SG Bus Timings for Windows, macOS and Linux: Singapore's live bus timings, routes and journeys, with a tray icon, widgets and Service Alerts as desktop notifications."
# The icon in each size the menus use: the same pictures as the Mac app's icon.
icon_set="macos/Runner/Assets.xcassets/AppIcon.appiconset"
icon_sizes="16 32 64 128 256 512"

if [ ! -x "$bundle/sgbus_timings" ]; then
  echo "No build in $bundle: run 'flutter build linux --release' on an $arch machine first." >&2
  exit 1
fi
if ! file -b "$bundle/sgbus_timings" | grep -q "$elf_machine"; then
  echo "$bundle/sgbus_timings isn't built for $arch: $(file -b "$bundle/sgbus_timings")" >&2
  exit 1
fi

rm -rf "$work"
mkdir -p "$work" "$dist"

# ---------- the app's files, shared by the .deb and the .rpm ----------

# Flutter's bundle with the program renamed to the Electron app's name (Flutter's CMake names it
# sgbus_timings). It finds its lib/ and data/ beside itself, whatever it's called.
cp -a "$bundle" "$work/app"
mv "$work/app/sgbus_timings" "$work/app/sgbus-timings"

# Fills the folder $1 as the package will lay it out on the computer: the app in /opt, the menu
# entry, the icons, the AppArmor profile (after-install.sh) and the licence.
lay_out_files() {
  local root="$1" size
  mkdir -p "$root$app_dir" "$root/usr/share/applications" "$root/usr/share/sgbus-timings" \
    "$root/usr/share/doc/$package"
  cp -a "$work/app/." "$root$app_dir/"
  cp "$here/sgbus-timings.desktop" "$root/usr/share/applications/sgbus-timings.desktop"
  for size in $icon_sizes; do
    mkdir -p "$root/usr/share/icons/hicolor/${size}x${size}/apps"
    cp "$icon_set/app_icon_$size.png" "$root/usr/share/icons/hicolor/${size}x${size}/apps/sgbus-timings.png"
  done
  cp "$here/apparmor-profile" "$root/usr/share/sgbus-timings/apparmor-profile"
  cp ../LICENSE "$root/usr/share/doc/$package/copyright"
  # Readable by everyone, written only by root (dpkg-deb --root-owner-group makes root the owner).
  chmod -R u+rwX,go+rX,go-w "$root"
}

# ---------- the .deb ----------

deb_root="$work/deb"
lay_out_files "$deb_root"
mkdir -p "$deb_root/DEBIAN"
installed_kb="$(du -sk "$deb_root" | cut -f1)"
cat > "$deb_root/DEBIAN/control" <<EOF
Package: $package
Version: $version
License: MIT
Vendor: $maintainer
Architecture: $deb_arch
Maintainer: $maintainer
Installed-Size: $installed_kb
Depends: libgtk-3-0, libwebkit2gtk-4.1-0, libx11-6, libxi6, libpulse0, xdg-utils
Section: utils
Priority: optional
Homepage: https://sgbus.uwuapps.org
Description: $summary
 $description
EOF

# postinst: after-install.sh, every time (configure, or an aborted upgrade put back).
{
  echo '#!/bin/sh'
  echo '# Written from installers/linux/after-install.sh.'
  cat "$here/after-install.sh"
  echo 'exit 0'
} > "$deb_root/DEBIAN/postinst"
# postrm: after-remove.sh, only when it's removed for good (not on "upgrade").
{
  echo '#!/bin/sh'
  echo '# Written from installers/linux/after-remove.sh.'
  echo 'case "$1" in remove|purge) ;; *) exit 0 ;; esac'
  cat "$here/after-remove.sh"
  echo 'exit 0'
} > "$deb_root/DEBIAN/postrm"
chmod 755 "$deb_root/DEBIAN/postinst" "$deb_root/DEBIAN/postrm"

deb="$dist/sg-bus-timings-$version-$deb_arch.deb"
dpkg-deb --root-owner-group -Zxz --build "$deb_root" "$deb"
dpkg-deb --info "$deb"

# ---------- the .rpm ----------

rpm_root="$work/rpmroot"
lay_out_files "$rpm_root"
spec="$work/sgbus-timings.spec"
{
  cat <<EOF
# Written by installers/linux/package-linux.sh.
Name: $package
Version: %{app_version}
Release: 1
Summary: $summary
License: MIT
URL: https://sgbus.uwuapps.org
Vendor: $maintainer
Packager: $maintainer
Requires: gtk3, webkit2gtk4.1, libX11, libXi, pulseaudio-libs, xdg-utils
# The libraries in the bundle are the app's own: not offered to other packages, nor looked for.
AutoReqProv: no
# Packed as built: no stripping, no separate debug package.
%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none

%description
$description

%install
cp -a "%{app_root}/." "%{buildroot}/"

%files
"$app_dir"
/usr/share/applications/sgbus-timings.desktop
/usr/share/icons/hicolor/*/apps/sgbus-timings.png
/usr/share/sgbus-timings
/usr/share/doc/$package

%post
EOF
  cat "$here/after-install.sh"
  # posttrans: once more at the very end. Upgrading from the Electron app, its removal script
  # runs after %post and deletes the sgbus-timings link and the AppArmor profile.
  echo '%posttrans'
  cat "$here/after-install.sh"
  # postun: only when it's removed for good ($1 is the number of copies left: 0).
  echo '%postun'
  echo 'if [ "$1" -eq 0 ]; then'
  cat "$here/after-remove.sh"
  echo 'fi'
} > "$spec"

rpmbuild -bb --target "$rpm_arch" \
  --define "_topdir $PWD/$work/rpmbuild" \
  --define "app_version $version" \
  --define "app_root $PWD/$rpm_root" \
  "$spec"
rpm="$dist/sg-bus-timings-$version-$rpm_arch.rpm"
mv "$work/rpmbuild/RPMS/$rpm_arch/$package-$version-1.$rpm_arch.rpm" "$rpm"
rpm -qip "$rpm"

# ---------- the AppImage ----------

# One file that runs on most distributions without installing: the app, a start script (AppRun),
# the menu entry and the icon at the top. It uses the computer's own GTK and WebKitGTK.
appdir="$work/AppDir"
mkdir -p "$appdir/usr/lib/sgbus-timings" "$appdir/usr/bin"
cp -a "$work/app/." "$appdir/usr/lib/sgbus-timings/"
ln -s ../lib/sgbus-timings/sgbus-timings "$appdir/usr/bin/sgbus-timings"
cat > "$appdir/AppRun" <<'EOF'
#!/bin/sh
# Starts SG Bus Timings from inside the AppImage.
#
# The Electron app's updater (electron-updater), installing this AppImage as it quits, runs it
# once with APPIMAGE_EXIT_AFTER_INSTALL=true and waits for it to finish: there's nothing to
# install, so it ends at once rather than opening the app.
[ "$APPIMAGE_EXIT_AFTER_INSTALL" = true ] && exit 0
here="$(dirname "$(readlink -f "$0")")"
exec "$here/usr/lib/sgbus-timings/sgbus-timings" "$@"
EOF
chmod 755 "$appdir/AppRun"
sed -e 's|^Exec=.*|Exec=sgbus-timings %U|' "$here/sgbus-timings.desktop" > "$appdir/sgbus-timings.desktop"
echo "X-AppImage-Version=$version" >> "$appdir/sgbus-timings.desktop"
cp "$icon_set/app_icon_256.png" "$appdir/sgbus-timings.png"
ln -s sgbus-timings.png "$appdir/.DirIcon"

appimagetool="${APPIMAGETOOL:-$(command -v appimagetool || true)}"
[ -n "$appimagetool" ] || { echo "appimagetool not found: put it on the PATH or set APPIMAGETOOL." >&2; exit 1; }
appimage="$dist/sg-bus-timings-$version-$appimage_arch.AppImage"
# APPIMAGE_EXTRACT_AND_RUN: appimagetool is itself an AppImage, and build machines often have no
# FUSE to mount it with.
ARCH="$tool_arch" APPIMAGE_EXTRACT_AND_RUN=1 "$appimagetool" --no-appstream "$appdir" "$appimage"
chmod 755 "$appimage"

ls -l "$deb" "$rpm" "$appimage"
