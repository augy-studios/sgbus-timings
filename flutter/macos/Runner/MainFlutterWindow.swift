// SG Bus Timings for macOS: the main window, made from MainMenu.xib when the app starts. It holds
// the Flutter view that draws the app, and registers the plugins (window, tray, notifications,
// storage, the sgbus_desktop plugin and the rest) with it.
//
// The window starts hidden (visibleAtLaunch is off in MainMenu.xib): the Dart side shows it once
// it knows how, as the update window, after Make it yours, or as the app itself, maximised or
// not (lib/desktop/desktop.dart). The Windows runner does the same.
import Cocoa
import FlutterMacOS
import desktop_multi_window

class MainFlutterWindow: NSWindow {
  /// Puts the Flutter view in the window, keeps the window's size from the .xib, and registers
  /// every plugin with the main engine. Every other window (Make it yours, each Bus timings
  /// widget) runs an engine of its own through desktop_multi_window, and needs the same plugins
  /// registered with it, so they're registered again each time one is made.
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)

    FlutterMultiWindowPlugin.setOnWindowCreatedCallback { controller in
      RegisterGeneratedPlugins(registry: controller)
    }

    // Flutter only starts the Dart side when the window first appears on screen. This window
    // starts hidden and waits for the Dart side to show it, so the Dart side is started here
    // instead; without this, nothing would ever show the window.
    flutterViewController.engine.run(withEntrypoint: nil)

    super.awakeFromNib()
  }
}
