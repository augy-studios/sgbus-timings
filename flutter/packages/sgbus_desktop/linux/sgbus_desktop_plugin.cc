// SG Bus Timings' desktop native parts on Linux (lib/sgbus_desktop.dart): this engine's window,
// and a second copy's command line, which the runner's GApplication hands the first copy
// (runner/my_application.cc calls sgbus_desktop_plugin_forward). Starting at sign-in is a file in
// ~/.config/autostart, written from Dart.
#include "include/sgbus_desktop/sgbus_desktop_plugin.h"

#include <flutter_linux/flutter_linux.h>
#include <gtk/gtk.h>

#include <cstring>

#define SGBUS_DESKTOP_PLUGIN(obj) \
  (G_TYPE_CHECK_INSTANCE_CAST((obj), sgbus_desktop_plugin_get_type(), SgbusDesktopPlugin))

struct _SgbusDesktopPlugin {
  GObject parent_instance;
  FlPluginRegistrar* registrar;
  FlMethodChannel* channel;
};

G_DEFINE_TYPE(SgbusDesktopPlugin, sgbus_desktop_plugin, g_object_get_type())

// The main window's engine's: the first registered.
static SgbusDesktopPlugin* main_plugin = nullptr;

static void handle_call(FlMethodChannel* channel, FlMethodCall* call, gpointer user_data) {
  SgbusDesktopPlugin* self = SGBUS_DESKTOP_PLUGIN(user_data);
  const gchar* method = fl_method_call_get_name(call);
  g_autoptr(FlMethodResponse) response = nullptr;
  if (strcmp(method, "handle") == 0) {
    FlView* view = fl_plugin_registrar_get_view(self->registrar);
    GtkWidget* top = view ? gtk_widget_get_toplevel(GTK_WIDGET(view)) : nullptr;
    g_autoptr(FlValue) value = top ? fl_value_new_int((int64_t)(intptr_t)top) : fl_value_new_null();
    response = FL_METHOD_RESPONSE(fl_method_success_response_new(value));
  } else if (strcmp(method, "ready") == 0) {
    response = FL_METHOD_RESPONSE(fl_method_success_response_new(nullptr));
  } else {
    response = FL_METHOD_RESPONSE(fl_method_not_implemented_response_new());
  }
  fl_method_call_respond(call, response, nullptr);
}

static void sgbus_desktop_plugin_dispose(GObject* object) {
  SgbusDesktopPlugin* self = SGBUS_DESKTOP_PLUGIN(object);
  if (main_plugin == self) main_plugin = nullptr;
  g_clear_object(&self->channel);
  G_OBJECT_CLASS(sgbus_desktop_plugin_parent_class)->dispose(object);
}

static void sgbus_desktop_plugin_class_init(SgbusDesktopPluginClass* klass) {
  G_OBJECT_CLASS(klass)->dispose = sgbus_desktop_plugin_dispose;
}

static void sgbus_desktop_plugin_init(SgbusDesktopPlugin* self) {}

void sgbus_desktop_plugin_register_with_registrar(FlPluginRegistrar* registrar) {
  SgbusDesktopPlugin* plugin = SGBUS_DESKTOP_PLUGIN(g_object_new(sgbus_desktop_plugin_get_type(), nullptr));
  plugin->registrar = registrar;
  g_autoptr(FlStandardMethodCodec) codec = fl_standard_method_codec_new();
  plugin->channel = fl_method_channel_new(fl_plugin_registrar_get_messenger(registrar), "org.uwuapps.sgbus/desktop", FL_METHOD_CODEC(codec));
  fl_method_channel_set_method_call_handler(plugin->channel, handle_call, g_object_ref(plugin), g_object_unref);
  if (main_plugin == nullptr) main_plugin = plugin;
  g_object_unref(plugin);
}

void sgbus_desktop_plugin_forward(gchar** argv) {
  if (main_plugin == nullptr || main_plugin->channel == nullptr) return;
  g_autoptr(FlValue) list = fl_value_new_list();
  for (int i = 1; argv && argv[i]; i++) fl_value_append_take(list, fl_value_new_string(argv[i]));
  g_autoptr(FlValue) args = fl_value_new_map();
  fl_value_set_string(args, "args", list);
  fl_method_channel_invoke_method(main_plugin->channel, "open", args, nullptr, nullptr, nullptr);
}
