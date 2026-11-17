// SG Bus Timings' desktop native parts on Windows: what Flutter's generated plugin list calls
// (sgbus_desktop_plugin.cpp has the rest).
#ifndef FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_C_API_H_
#define FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_C_API_H_

#include <flutter_plugin_registrar.h>

#ifdef FLUTTER_PLUGIN_IMPL
#define FLUTTER_PLUGIN_EXPORT __declspec(dllexport)
#else
#define FLUTTER_PLUGIN_EXPORT __declspec(dllimport)
#endif

#if defined(__cplusplus)
extern "C" {
#endif

// Registers the plugin with an engine, once per engine as it starts.
FLUTTER_PLUGIN_EXPORT void SgbusDesktopPluginCApiRegisterWithRegistrar(FlutterDesktopPluginRegistrarRef registrar);

#if defined(__cplusplus)
}  // extern "C"
#endif

#endif  // FLUTTER_PLUGIN_SGBUS_DESKTOP_PLUGIN_C_API_H_
