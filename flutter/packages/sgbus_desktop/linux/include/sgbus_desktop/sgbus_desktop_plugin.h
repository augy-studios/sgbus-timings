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

FLUTTER_PLUGIN_EXPORT GType sgbus_desktop_plugin_get_type();

FLUTTER_PLUGIN_EXPORT void sgbus_desktop_plugin_register_with_registrar(FlPluginRegistrar* registrar);

// A second copy's command line, to the first copy's Dart (runner/my_application.cc).
FLUTTER_PLUGIN_EXPORT void sgbus_desktop_plugin_forward(gchar** argv);

G_END_DECLS

#endif  // FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_H_
