# Runs as root after the .deb or .rpm is installed or upgraded (package-linux.sh puts it into both
# packages). Safe to run more than once.

app_dir='/opt/SG Bus Timings'

# sgbus-timings on the PATH, through update-alternatives as the Electron app's package did. When
# upgrading from the Electron app, its own removal script deletes this link on the way out (a .deb
# runs that before this; an .rpm after, so the .rpm runs this again at the very end).
if type update-alternatives >/dev/null 2>&1; then
  # A plain link left by something else: update-alternatives won't replace it, so it goes first.
  if [ -L /usr/bin/sgbus-timings ] && [ "$(readlink /usr/bin/sgbus-timings)" != /etc/alternatives/sgbus-timings ]; then
    rm -f /usr/bin/sgbus-timings
  fi
  update-alternatives --install /usr/bin/sgbus-timings sgbus-timings "$app_dir/sgbus-timings" 100 ||
    ln -sf "$app_dir/sgbus-timings" /usr/bin/sgbus-timings
else
  ln -sf "$app_dir/sgbus-timings" /usr/bin/sgbus-timings
fi

# The menu entry (with its uwu:// handler) and the icons, picked up now rather than at next login.
if type update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if type gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

# Ubuntu 24.04 and later only let a program make the user namespaces a web view's sandbox needs if
# AppArmor says it may. This profile says so, as the Electron app's did. Older AppArmor (Ubuntu
# 22.04) can't read it and doesn't need it, so it's only installed where it parses.
profile_source=/usr/share/sgbus-timings/apparmor-profile
profile_target=/etc/apparmor.d/sgbus-timings
if apparmor_status --enabled >/dev/null 2>&1; then
  if apparmor_parser --skip-kernel-load --debug "$profile_source" >/dev/null 2>&1; then
    cp -f "$profile_source" "$profile_target"
    # Not inside a chroot (an image being built), where loading it means nothing.
    if ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; } && type apparmor_parser >/dev/null 2>&1; then
      apparmor_parser --replace --write-cache --skip-read-cache "$profile_target" || true
    fi
  fi
fi
