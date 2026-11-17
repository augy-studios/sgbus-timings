// SG Bus Timings for macOS: the app's delegate, which macOS asks how the app should behave as a
// whole (rather than one window). It keeps the app running in the menu bar with its window closed,
// gives the Dock icon its menu of favourite stops, brings the window back when the Dock icon is
// clicked, and lets the app tidy up before ⌘Q quits it.
//
// The work itself is in the sgbus_desktop plugin (packages/sgbus_desktop/macos), which talks to
// the Dart side; this file only hands macOS's questions to it. uwu://sgbus/ links need nothing
// here: FlutterAppDelegate passes them to the plugin (its handleOpen).
import Cocoa
import FlutterMacOS
import sgbus_desktop

@main
class AppDelegate: FlutterAppDelegate {
  /// Keeps the app running when its last window closes. Closing the main window only hides it,
  /// and the app carries on in the menu bar, checking for Service Alerts, until it's quit from
  /// there or with ⌘Q (desktop-features-spec §5). Flutter's template quits here instead.
  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return false
  }

  /// Lets macOS save and restore the app's state securely (Flutter's default, kept).
  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    return true
  }

  /// The menu that opens when the Dock icon is right-clicked: one item per favourite stop, or
  /// "Star a stop to see it here" when there are none. The Dart side sends the items whenever the
  /// favourites change (lib/desktop/glance.dart).
  override func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
    return SgbusDesktopPlugin.main?.dockMenu()
  }

  /// The Dock icon clicked while the app's running: the Dart side brings the main window back,
  /// as the Electron app did on every Dock click. Returns false once Dart has it, so macOS
  /// doesn't also try to bring a window forward itself.
  override func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    let handled = SgbusDesktopPlugin.main?.reopen() ?? false
    return !handled
  }

  /// ⌘Q, the app menu's Quit or the Dock's Quit: if the Dart side has asked to hear about quitting,
  /// it quits the app itself after tidying up (keeping the window's size, installing a downloaded
  /// update), so the quit is cancelled here. Otherwise, and whenever macOS itself is logging out,
  /// restarting or shutting down, Flutter's own handling quits as usual.
  override func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if let plugin = SgbusDesktopPlugin.main, plugin.passQuitToDart() {
      return .terminateCancel
    }
    return super.applicationShouldTerminate(sender)
  }
}
