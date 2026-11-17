# Runs as root after the .deb or .rpm is removed for good (not on an upgrade: package-linux.sh
# only calls it then).

update-alternatives --remove sgbus-timings '/opt/SG Bus Timings/sgbus-timings' 2>/dev/null ||
  rm -f /usr/bin/sgbus-timings

if [ -f /etc/apparmor.d/sgbus-timings ]; then
  if apparmor_status --enabled >/dev/null 2>&1 && ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; }; then
    apparmor_parser --remove /etc/apparmor.d/sgbus-timings 2>/dev/null || true
  fi
  rm -f /etc/apparmor.d/sgbus-timings
fi

if type update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
