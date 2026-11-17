// SG Bus Timings' desktop native parts on Linux (the Dart side is lib/sgbus_desktop.dart): each
// window's native handle, bringing the window forward, and a second copy's command line, which the
// runner hands to the first copy (linux/runner/my_application.cc calls
// sgbus_desktop_plugin_forward). Starting at sign-in is a file in ~/.config/autostart, written
// from Dart, and Linux has no Jump List, thumbnail buttons or Dock, so those calls answer "not
// implemented", which the Dart side takes quietly.
//
// Every engine (the main window's, Make it yours', each Bus timings widget's) registers its own
// copy of this plugin. The first one registered is the main window's: a second copy's command
// line goes to it.
#include "include/sgbus_desktop/sgbus_desktop_plugin.h"

#include <flutter_linux/flutter_linux.h>
#include <gtk/gtk.h>

#include <cstring>

#define SGBUS_DESKTOP_PLUGIN(obj)                                     \
  (G_TYPE_CHECK_INSTANCE_CAST((obj), sgbus_desktop_plugin_get_type(), \
                              SgbusDesktopPlugin))

struct _SgbusDesktopPlugin {
  GObject parent_instance;

  // This engine's Flutter view, to find its window later. A weak reference: the view belongs to
  // its window, and holding the registrar instead would keep the engine's messenger alive in a
  // loop (messenger -> channel -> plugin -> registrar -> messenger) that's never freed.
  GWeakRef view;

  // The channel the Dart side calls, and events go back on.
  FlMethodChannel* channel;

  // Whether the Dart side is listening for events yet (it says "ready" when it starts).
  gboolean dart_listening;

  // "open" events (each an FlValue map) that came before the Dart side was listening, such as
  // a second copy started while this one was still starting. Sent once it's ready.
  GPtrArray* waiting;
};

G_DEFINE_TYPE(SgbusDesktopPlugin, sgbus_desktop_plugin, g_object_get_type())

// The main window's plugin: the first one registered.
static SgbusDesktopPlugin* main_plugin = nullptr;

// This engine's window (the GtkWindow its Flutter view is in), or nullptr if it has none. The
// window belongs to GTK; the caller doesn't free it.
static GtkWindow* engine_window(SgbusDesktopPlugin* self) {
  g_autoptr(GObject) view = static_cast<GObject*>(g_weak_ref_get(&self->view));
  if (view == nullptr) return nullptr;
  GtkWidget* top = gtk_widget_get_toplevel(GTK_WIDGET(view));
  return GTK_IS_WINDOW(top) ? GTK_WINDOW(top) : nullptr;
}

// The Dart side is listening: from now on events go straight to it, and any second copy's
// command line kept until now is sent.
static void start_sending(SgbusDesktopPlugin* self) {
  self->dart_listening = TRUE;
  for (guint i = 0; i < self->waiting->len; i++) {
    FlValue* args = static_cast<FlValue*>(g_ptr_array_index(self->waiting, i));
    fl_method_channel_invoke_method(self->channel, "open", args, nullptr,
                                    nullptr, nullptr);
  }
  g_ptr_array_set_size(self->waiting, 0);
}

// Answers a call from the Dart side: "handle" (this engine's window, for nativeapi), "front"
// (the window in front of other apps) and "ready". Anything else is for Windows or macOS.
static void handle_call(FlMethodChannel* channel, FlMethodCall* call,
                        gpointer user_data) {
  SgbusDesktopPlugin* self = SGBUS_DESKTOP_PLUGIN(user_data);
  const gchar* method = fl_method_call_get_name(call);
  g_autoptr(FlMethodResponse) response = nullptr;
  if (strcmp(method, "handle") == 0) {
    GtkWindow* window = engine_window(self);
    g_autoptr(FlValue) value =
        window ? fl_value_new_int(reinterpret_cast<intptr_t>(window))
               : fl_value_new_null();
    response = FL_METHOD_RESPONSE(fl_method_success_response_new(value));
  } else if (strcmp(method, "front") == 0) {
    GtkWindow* window = engine_window(self);
    if (window != nullptr) gtk_window_present(window);
    response = FL_METHOD_RESPONSE(fl_method_success_response_new(nullptr));
  } else if (strcmp(method, "ready") == 0) {
    start_sending(self);
    response = FL_METHOD_RESPONSE(fl_method_success_response_new(nullptr));
  } else {
    response = FL_METHOD_RESPONSE(fl_method_not_implemented_response_new());
  }
  fl_method_call_respond(call, response, nullptr);
}

// Lets go of what the plugin holds when its engine goes (a widget's window closing).
static void sgbus_desktop_plugin_dispose(GObject* object) {
  SgbusDesktopPlugin* self = SGBUS_DESKTOP_PLUGIN(object);
  if (main_plugin == self) main_plugin = nullptr;
  g_clear_object(&self->channel);
  g_weak_ref_set(&self->view, nullptr);
  g_clear_pointer(&self->waiting, g_ptr_array_unref);
  G_OBJECT_CLASS(sgbus_desktop_plugin_parent_class)->dispose(object);
}

// Frees the weak reference itself, as the plugin's memory goes (after dispose).
static void sgbus_desktop_plugin_finalize(GObject* object) {
  SgbusDesktopPlugin* self = SGBUS_DESKTOP_PLUGIN(object);
  g_weak_ref_clear(&self->view);
  G_OBJECT_CLASS(sgbus_desktop_plugin_parent_class)->finalize(object);
}

// Sets up the plugin's GObject class (GLib's boilerplate): only its clean-up.
static void sgbus_desktop_plugin_class_init(SgbusDesktopPluginClass* klass) {
  G_OBJECT_CLASS(klass)->dispose = sgbus_desktop_plugin_dispose;
  G_OBJECT_CLASS(klass)->finalize = sgbus_desktop_plugin_finalize;
}

// Sets up a new plugin: no view yet, and an empty list of waiting events.
static void sgbus_desktop_plugin_init(SgbusDesktopPlugin* self) {
  g_weak_ref_init(&self->view, nullptr);
  self->waiting = g_ptr_array_new_with_free_func(
      reinterpret_cast<GDestroyNotify>(fl_value_unref));
}

// Called by Flutter once per engine as it starts: makes the plugin and its channel. The first is
// the main window's.
void sgbus_desktop_plugin_register_with_registrar(FlPluginRegistrar* registrar) {
  SgbusDesktopPlugin* plugin = SGBUS_DESKTOP_PLUGIN(
      g_object_new(sgbus_desktop_plugin_get_type(), nullptr));
  // The registrar itself is let go of straight after this call, so its view is kept instead.
  g_weak_ref_set(&plugin->view, fl_plugin_registrar_get_view(registrar));
  g_autoptr(FlStandardMethodCodec) codec = fl_standard_method_codec_new();
  plugin->channel = fl_method_channel_new(
      fl_plugin_registrar_get_messenger(registrar), "org.uwuapps.sgbus/desktop",
      FL_METHOD_CODEC(codec));
  fl_method_channel_set_method_call_handler(plugin->channel, handle_call,
                                            g_object_ref(plugin), g_object_unref);
  if (main_plugin == nullptr) main_plugin = plugin;
  g_object_unref(plugin);
}

// A second copy's command line (argv[0] is the program), to the main window's Dart side as an
// "open" event: a uwu:// link opens its page, anything else brings the window forward. Kept
// until the Dart side is listening.
void sgbus_desktop_plugin_forward(gchar** argv) {
  if (main_plugin == nullptr || main_plugin->channel == nullptr) return;
  g_autoptr(FlValue) list = fl_value_new_list();
  for (int i = 1; argv != nullptr && argv[0] != nullptr && argv[i] != nullptr; i++) {
    fl_value_append_take(list, fl_value_new_string(argv[i]));
  }
  g_autoptr(FlValue) args = fl_value_new_map();
  fl_value_set_string(args, "args", list);
  if (main_plugin->dart_listening) {
    fl_method_channel_invoke_method(main_plugin->channel, "open", args, nullptr,
                                    nullptr, nullptr);
  } else {
    g_ptr_array_add(main_plugin->waiting, fl_value_ref(args));
  }
}
