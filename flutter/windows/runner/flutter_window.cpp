// SG Bus Timings for Windows: the main window, which holds the Flutter view that draws the app.
// It registers the plugins with the main engine and every other window's engine, and leaves
// showing the window to the Dart side.
#include "flutter_window.h"

#include <optional>

#include "flutter/generated_plugin_registrant.h"
#include "desktop_multi_window/desktop_multi_window_plugin.h"

// Keeps the Dart project (the app's compiled code and assets) to start once the window exists.
FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

// Nothing of its own to free: the Flutter view goes in OnDestroy.
FlutterWindow::~FlutterWindow() {}

// The window exists: starts the Flutter engine and its view at the window's size, registers the
// plugins, and puts the view in the window. Returns false if Flutter couldn't start.
bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  // Every other window (the Bus timings widgets, Make it yours) runs an engine of its own, which
  // needs the same plugins.
  DesktopMultiWindowSetWindowCreatedCallback([](void *controller) {
    auto *flutter_view_controller =
        reinterpret_cast<flutter::FlutterViewController *>(controller);
    RegisterPlugins(flutter_view_controller->engine());
  });
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  // Not shown here: Dart shows the window once it knows how (lib/desktop/desktop.dart), as the
  // update window, Make it yours, or the app, maximised or not.
  flutter_controller_->ForceRedraw();

  return true;
}

// The window's going: stops the Flutter engine with it.
void FlutterWindow::OnDestroy() {
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

// Every message to the window: Flutter and its plugins see it first (the sgbus_desktop plugin
// picks out a second copy's command line and the taskbar's buttons here), then the template's
// own handling (the system's fonts changing, resizing, closing).
LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
