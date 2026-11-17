#!/usr/bin/env bash
# Checks that a Linux build of SG Bus Timings will open on the oldest systems it's for: Ubuntu
# 22.04 and Debian 12.
#
# A Linux program asks for the C library (glibc) and the C++ library (libstdc++) by version, the
# version each function it uses first came in, and won't start on a computer whose libraries are
# older. Built on Ubuntu 22.04 it asks for no more than 22.04 has, and Debian 12 has as much. This
# reads what every program and library in the build asks for, and fails if any of it is newer, so
# a build that wouldn't open there isn't released. GitHub Actions runs it after
# `flutter build linux` (.github/workflows/build-desktop.yml and desktop-check.yml):
#
#   bash installers/linux/check-glibc.sh build/linux/x64/release/bundle      (arm64 on Arm)
#
# Exits 0 when the build opens there, 1 when it wouldn't (or there was nothing in the folder to
# check), and 2 when it isn't given a folder. It needs objdump (binutils) and file.
set -euo pipefail

bundle="${1:-}"
if [ ! -d "$bundle" ]; then
  echo "Usage: installers/linux/check-glibc.sh <the build's bundle folder>" >&2
  exit 2
fi
if [ ! -f "$bundle/sgbus_timings" ]; then
  echo "No sgbus_timings in $bundle: give it the bundle folder of 'flutter build linux'." >&2
  exit 1
fi

# The newest versions Ubuntu 22.04 has: glibc 2.35, and libstdc++ 3.4.30 (GCC 12's). Debian 12
# has glibc 2.36 and the same libstdc++.
max_glibc=2.35
max_glibcxx=3.4.30

# Prints the newest version of library $1 (GLIBC or GLIBCXX) that the program or library $2 asks
# for, such as 2.34, or nothing if it asks for none. Only the functions it takes from elsewhere
# (*UND*) count: a library's own functions carry its own version, which it doesn't need.
needs() {
  objdump -T "$2" | { grep -F '*UND*' || true; } | { grep -oE "\b$1_[0-9][0-9.]*" || true; } |
    sed "s/^$1_//" | sort -V | tail -n 1
}

# True when version $1 is newer than version $2 (2.36 is newer than 2.35).
newer_than() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

too_new=0
checked=0
# Every program and library anywhere in the bundle (the program, Flutter's engine, the plugins'
# and the app's libraries), found by what's in the file rather than by its name or folder.
while IFS= read -r -d '' path; do
  if ! file -b "$path" | grep -q '^ELF'; then
    continue
  fi
  checked=$((checked + 1))
  glibc="$(needs GLIBC "$path")"
  glibcxx="$(needs GLIBCXX "$path")"
  echo "${path#"$bundle"/}: glibc ${glibc:-(none)}, libstdc++ ${glibcxx:-(none)}"
  if [ -n "$glibc" ] && newer_than "$glibc" "$max_glibc"; then
    echo "  needs glibc $glibc, newer than Ubuntu 22.04's $max_glibc" >&2
    too_new=1
  fi
  if [ -n "$glibcxx" ] && newer_than "$glibcxx" "$max_glibcxx"; then
    echo "  needs libstdc++ $glibcxx, newer than Ubuntu 22.04's $max_glibcxx" >&2
    too_new=1
  fi
done < <(find "$bundle" -type f -print0 | sort -z)

if [ "$checked" = 0 ]; then
  echo "No programs or libraries found in $bundle: nothing was checked." >&2
  exit 1
fi
if [ "$too_new" = 1 ]; then
  echo "This build won't open on Ubuntu 22.04 or Debian 12: build it on Ubuntu 22.04." >&2
  exit 1
fi
echo "Checked $checked files: opens on Ubuntu 22.04, Debian 12 and newer."
