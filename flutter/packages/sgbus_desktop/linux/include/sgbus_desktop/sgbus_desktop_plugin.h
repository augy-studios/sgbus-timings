// SG Bus Timings' desktop native parts on Linux: what the runner and Flutter's generated plugin
// list can call (sgbus_desktop_plugin.cc has the rest).
#ifndef FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_H_
#define FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_H_

#include <flutter_linux/flutter_linux.h>

G_BEGIN_DECLS

#ifdef FLUTTER_PLUGIN_IMPL
#define FLUTTER_PLUGIN_EXPORT __attribute__((visibility("default")))
#else
#define FLUTTER_PLUGIN_EXPORT
#endif

typedef struct _SgbusDesktopPlugin SgbusDesktopPlugin;
typedef struct {
  GObjectClass parent_class;
} SgbusDesktopPluginClass;

// The plugin's GObject type (GLib's boilerplate).
FLUTTER_PLUGIN_EXPORT GType sgbus_desktop_plugin_get_type();

// Called by Flutter's generated plugin list once per engine as it starts.
FLUTTER_PLUGIN_EXPORT void sgbus_desktop_plugin_register_with_registrar(FlPluginRegistrar* registrar);

// A second copy's command line (argv[0] is the program, then its arguments), to the main
// window's Dart side, which opens a uwu:// link among them or brings the window forward. Called
// by the runner (linux/runner/my_application.cc) when the app's started again.
FLUTTER_PLUGIN_EXPORT void sgbus_desktop_plugin_forward(gchar** argv);

G_END_DECLS

#endif  // FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_H_
