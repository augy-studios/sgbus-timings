// SG Bus Timings for Linux: the app itself, as a GTK application. One copy at a time: GTK
// registers the app on the session's D-Bus under its id (org.uwuapps.sgbus), so starting it again
// (from the menu, at sign-in, a uwu:// link) runs a second copy only long enough to hand its
// command line to the first, which passes it to Dart through the sgbus_desktop plugin
// (desktop-features-spec §5). The second copy then exits.
//
// The main window starts hidden: the Dart side shows it once it knows how, as the update window,
// after Make it yours, or as the app itself, maximised or not (lib/desktop/desktop.dart). The
// Windows and macOS runners do the same.
#include "my_application.h"

#include <flutter_linux/flutter_linux.h>
#ifdef GDK_WINDOWING_X11
#include <gdk/gdkx.h>
#endif

#include "desktop_multi_window/desktop_multi_window_plugin.h"
#include "flutter/generated_plugin_registrant.h"
#include "sgbus_desktop/sgbus_desktop_plugin.h"

struct _MyApplication {
  GtkApplication parent_instance;

  // The arguments this copy was started with, minus the program's name, for Dart's main().
  char** dart_entrypoint_arguments;

  // The main window, once it's made. GTK keeps the app running while it exists, hidden or not.
  GtkWindow* window;
};

G_DEFINE_TYPE(MyApplication, my_application, GTK_TYPE_APPLICATION)

// Registers every plugin with an engine that desktop_multi_window has just made for another
// window (Make it yours, or a Bus timings widget), as each engine needs its own copies.
static void register_plugins_for_new_window(FlPluginRegistry* registry) {
  fl_register_plugins(registry);
}

// Makes the main window, hidden, with the Flutter view that draws the app in it, and registers
// the plugins. GTK calls this (GApplication's activate) when the app starts.
static void my_application_activate(GApplication* application) {
  MyApplication* self = MY_APPLICATION(application);

  // Started again some other way than its command line (a desktop asking the running app over
  // D-Bus): bring the window that's there forward rather than making a second one.
  if (self->window != nullptr) {
    gchar* no_arguments[] = {const_cast<gchar*>(""), nullptr};
    sgbus_desktop_plugin_forward(no_arguments);
    return;
  }

  GtkWindow* window =
      GTK_WINDOW(gtk_application_window_new(GTK_APPLICATION(application)));
  self->window = window;

  // Use a header bar when running in GNOME as this is the common style used
  // by applications and is the setup most users will be using (e.g. Ubuntu
  // desktop).
  // If running on X and not using GNOME then just use a traditional title bar
  // in case the window manager does more exotic layout, e.g. tiling.
  // If running on Wayland assume the header bar will work (may need changing
  // if future cases occur).
  // The Dart side hides it for the app's own title bar (lib/desktop/desktop.dart).
  gboolean use_header_bar = TRUE;
#ifdef GDK_WINDOWING_X11
  GdkScreen* screen = gtk_window_get_screen(window);
  if (GDK_IS_X11_SCREEN(screen)) {
    const gchar* wm_name = gdk_x11_screen_get_window_manager_name(screen);
    if (g_strcmp0(wm_name, "GNOME Shell") != 0) {
      use_header_bar = FALSE;
    }
  }
#endif
  if (use_header_bar) {
    GtkHeaderBar* header_bar = GTK_HEADER_BAR(gtk_header_bar_new());
    gtk_widget_show(GTK_WIDGET(header_bar));
    gtk_header_bar_set_title(header_bar, "SG Bus Timings");
    gtk_header_bar_set_show_close_button(header_bar, TRUE);
    gtk_window_set_titlebar(window, GTK_WIDGET(header_bar));
  } else {
    gtk_window_set_title(window, "SG Bus Timings");
  }

  gtk_window_set_default_size(window, 1280, 720);

  g_autoptr(FlDartProject) project = fl_dart_project_new();
  fl_dart_project_set_dart_entrypoint_arguments(
      project, self->dart_entrypoint_arguments);

  FlView* view = fl_view_new(project);
  GdkRGBA background_color;
  // Background defaults to black, override it here if necessary, e.g. #00000000
  // for transparent.
  gdk_rgba_parse(&background_color, "#000000");
  fl_view_set_background_color(view, &background_color);
  gtk_widget_show(GTK_WIDGET(view));
  gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(view));

  // Realised so Flutter starts drawing while the window is still hidden. Flutter's template
  // shows the window on the first frame here; this app leaves that to the Dart side.
  gtk_widget_realize(GTK_WIDGET(view));

  // After the view is in the window: desktop_multi_window finds the main window through it.
  fl_register_plugins(FL_PLUGIN_REGISTRY(view));
  desktop_multi_window_plugin_set_window_created_callback(
      register_plugins_for_new_window);

  gtk_widget_grab_focus(GTK_WIDGET(view));
}

// A command line for the app (GApplication's command_line). In the first copy this runs once
// for its own start, and again each time the app's started while it runs, with that copy's
// command line (GTK passes it over D-Bus). The first time it starts the app; after that the
// command line goes to Dart, which opens a uwu:// link in it or brings the window forward.
static gint my_application_command_line(GApplication* application,
                                        GApplicationCommandLine* command_line) {
  MyApplication* self = MY_APPLICATION(application);
  gchar** arguments =
      g_application_command_line_get_arguments(command_line, nullptr);

  if (self->window == nullptr) {
    // Strip out the first argument as it is the binary name.
    g_clear_pointer(&self->dart_entrypoint_arguments, g_strfreev);
    self->dart_entrypoint_arguments =
        g_strdupv(arguments[0] != nullptr ? arguments + 1 : arguments);
    g_application_activate(application);
  } else {
    sgbus_desktop_plugin_forward(arguments);
  }

  g_strfreev(arguments);
  return 0;
}

// Runs as the app starts, before any window (GApplication's startup). Nothing of the app's own.
static void my_application_startup(GApplication* application) {
  G_APPLICATION_CLASS(my_application_parent_class)->startup(application);
}

// Runs as the app ends (GApplication's shutdown). Nothing of the app's own: the Dart side has
// tidied up before it quits.
static void my_application_shutdown(GApplication* application) {
  G_APPLICATION_CLASS(my_application_parent_class)->shutdown(application);
}

// Lets go of the kept command line when the app object goes (GObject's dispose).
static void my_application_dispose(GObject* object) {
  MyApplication* self = MY_APPLICATION(object);
  g_clear_pointer(&self->dart_entrypoint_arguments, g_strfreev);
  G_OBJECT_CLASS(my_application_parent_class)->dispose(object);
}

// Tells GTK which of the functions above answer which of its calls.
static void my_application_class_init(MyApplicationClass* klass) {
  G_APPLICATION_CLASS(klass)->activate = my_application_activate;
  G_APPLICATION_CLASS(klass)->command_line = my_application_command_line;
  G_APPLICATION_CLASS(klass)->startup = my_application_startup;
  G_APPLICATION_CLASS(klass)->shutdown = my_application_shutdown;
  G_OBJECT_CLASS(klass)->dispose = my_application_dispose;
}

// Sets up a new app object (GLib's boilerplate): nothing to do.
static void my_application_init(MyApplication* self) {}

// Makes the app object, unique under its id, taking its command lines itself. GLib passes
// unknown options such as --updated through to the command line untouched, as no options are
// declared here.
MyApplication* my_application_new() {
  // The program's name and class are the app's id (org.uwuapps.sgbus), set before GTK starts, so
  // on X11 the window's WM_CLASS (name and class alike) matches the .desktop file's
  // StartupWMClass, and the dock and taskbar put the window under the app's own icon. GTK would
  // otherwise use the binary's name, and a class with a capital first letter.
  g_set_prgname(APPLICATION_ID);
  gdk_set_program_class(APPLICATION_ID);

  return MY_APPLICATION(g_object_new(my_application_get_type(),
                                     "application-id", APPLICATION_ID, "flags",
                                     G_APPLICATION_HANDLES_COMMAND_LINE, nullptr));
}
