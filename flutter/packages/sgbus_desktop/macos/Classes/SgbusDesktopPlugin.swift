// SG Bus Timings' desktop native parts on macOS (the Dart side is lib/sgbus_desktop.dart): each
// window's native handle, uwu:// links, the Dock's menu and badge, the Dock icon clicked, ⌘Q, and
// starting at sign-in.
//
// Every engine (the main window's, Make it yours', each Bus timings widget's) registers its own
// copy of this plugin. The first one registered is the main window's, kept as
// `SgbusDesktopPlugin.main`: links, the Dock and quitting all go to it. The runner's AppDelegate
// (macos/Runner/AppDelegate.swift) asks it for the Dock menu, the Dock click and quitting.
import Cocoa
import FlutterMacOS
import ServiceManagement

public class SgbusDesktopPlugin: NSObject, FlutterPlugin, FlutterAppLifecycleDelegate {
  /// The main window's plugin: the first one registered. Nil until the main window's engine has
  /// started, which is before anything can ask for it.
  public private(set) static var main: SgbusDesktopPlugin?

  private let channel: FlutterMethodChannel
  private weak var registrar: FlutterPluginRegistrar?

  /// Whether the Dart side is listening for events yet (it says "ready" when it starts).
  private var dartListening = false

  /// uwu:// links that came before the Dart side was listening, such as the link that started the
  /// app. They're sent as soon as it's ready.
  private var waitingLinks: [String] = []

  /// The Dock menu's items, as the Dart side last sent them.
  private var dockItems: [(title: String, enabled: Bool)] = []

  /// Whether the Dart side has a quit handler (it says so with "quitHandler").
  private var dartHandlesQuit = false

  /// Whether a quit has already been passed to the Dart side. A second ⌘Q then quits at once, so
  /// the app can always be quit, even if the Dart side never finishes.
  private var quitPassedOn = false

  /// Makes the plugin for one engine, answering on that engine's channel.
  init(channel: FlutterMethodChannel, registrar: FlutterPluginRegistrar) {
    self.channel = channel
    self.registrar = registrar
    super.init()
  }

  /// Called by Flutter once per engine as it starts. Sets up the channel the Dart side calls, and
  /// for the main window's engine, asks FlutterAppDelegate to pass it the app's uwu:// links.
  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "org.uwuapps.sgbus/desktop", binaryMessenger: registrar.messenger)
    let plugin = SgbusDesktopPlugin(channel: channel, registrar: registrar)
    registrar.addMethodCallDelegate(plugin, channel: channel)
    if main == nil {
      main = plugin
      registrar.addApplicationDelegate(plugin)
    }
  }

  // ---------- from the Dart side ----------

  /// Answers a call from the Dart side. Calls for something macOS hasn't got (the Jump List and
  /// the taskbar's thumbnail buttons are Windows only) answer "not implemented", which the Dart
  /// side takes quietly. "startLink" answers the uwu:// link the app was started with, before
  /// "ready" (nil if none, or once Dart is listening); the link stays waiting and still arrives
  /// as an "open" event after "ready". "quitHandler" says whether the Dart side takes quits.
  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "ready":
      startSending()
      result(nil)
    case "startLink":
      result(dartListening ? nil : waitingLinks.first)
    case "quitHandler":
      dartHandlesQuit = args["on"] as? Bool ?? false
      result(nil)
    case "handle":
      result(windowAddress())
    case "dockMenu":
      setDockItems(args["items"] as? [[String: Any]] ?? [])
      result(nil)
    case "badge":
      setBadge(args["text"] as? String ?? "")
      result(nil)
    case "getLogin":
      result(startsAtLogin())
    case "setLogin":
      result(setStartAtLogin(args["on"] as? Bool ?? false))
    case "front":
      bringAppForward()
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  /// The Dart side is listening: from now on events go straight to it, and any links that came
  /// before (the one that started the app) are sent now.
  private func startSending() {
    dartListening = true
    let links = waitingLinks
    waitingLinks = []
    for link in links {
      channel.invokeMethod("open", arguments: ["url": link])
    }
  }

  /// The address of this engine's window (an NSWindow), so the Dart side can drive the window
  /// it's drawing in through nativeapi. Nil if the engine has no window yet.
  private func windowAddress() -> Int? {
    guard let window = registrar?.view?.window else { return nil }
    return Int(bitPattern: Unmanaged.passUnretained(window).toOpaque())
  }

  /// Keeps the Dock menu's items for the next time the menu's opened (macOS asks for it then).
  private func setDockItems(_ items: [[String: Any]]) {
    dockItems = items.map { item in
      (title: item["title"] as? String ?? "", enabled: item["enabled"] as? Bool ?? true)
    }
  }

  /// The Dock icon's badge for the tray countdown: the soonest bus's minutes, or "Arr". An empty
  /// text takes the badge away.
  private func setBadge(_ text: String) {
    NSApp.dockTile.badgeLabel = text.isEmpty ? nil : text
  }

  /// Whether the app is in the person's login items (macOS 13 and later; false before then,
  /// where the app can't add itself).
  private func startsAtLogin() -> Bool {
    if #available(macOS 13.0, *) {
      return SMAppService.mainApp.status == .enabled
    }
    return false
  }

  /// Adds the app to the person's login items, or takes it out. Returns whether that worked:
  /// macOS may refuse, for example on macOS 12 or older, or if the person has turned the app off
  /// in System Settings' Login Items.
  private func setStartAtLogin(_ on: Bool) -> Bool {
    guard #available(macOS 13.0, *) else { return false }
    do {
      if on {
        try SMAppService.mainApp.register()
      } else {
        try SMAppService.mainApp.unregister()
      }
      return true
    } catch {
      NSLog("SG Bus Timings: couldn't change the login item: \(error)")
      return false
    }
  }

  /// Brings the app in front of other apps, so the window the Dart side has just shown isn't
  /// left behind the browser a link was clicked in.
  private func bringAppForward() {
    if #available(macOS 14.0, *) {
      NSApp.activate()
    } else {
      NSApp.activate(ignoringOtherApps: true)
    }
  }

  // ---------- from macOS ----------

  /// uwu:// links, from FlutterAppDelegate, whether the app was running or the link started it.
  /// Each goes to the Dart side as an "open" event (kept until it's listening). Returns whether
  /// any link was this app's, so other plugins don't also act on it.
  public func handleOpen(_ urls: [URL]) -> Bool {
    var handled = false
    for url in urls where url.scheme?.lowercased() == "uwu" {
      handled = true
      if dartListening {
        channel.invokeMethod("open", arguments: ["url": url.absoluteString])
      } else {
        waitingLinks.append(url.absoluteString)
      }
    }
    return handled
  }

  /// The Dock icon clicked (AppDelegate's applicationShouldHandleReopen): the Dart side shows the
  /// main window. Returns false if the Dart side isn't listening yet (the app is still starting,
  /// and shows its window itself).
  public func reopen() -> Bool {
    guard dartListening else { return false }
    channel.invokeMethod("activate", arguments: [String: Any]())
    return true
  }

  /// The Dock icon's menu (AppDelegate's applicationDockMenu): one item per favourite stop, each
  /// opening that stop in the main window. Nil when there are no items, for no menu of the app's.
  public func dockMenu() -> NSMenu? {
    if dockItems.isEmpty { return nil }
    let menu = NSMenu()
    // Each item's own enabled flag is used, rather than macOS deciding.
    menu.autoenablesItems = false
    for (index, item) in dockItems.enumerated() {
      let menuItem = NSMenuItem(
        title: item.title, action: #selector(dockItemPicked(_:)), keyEquivalent: "")
      menuItem.target = self
      menuItem.tag = index
      menuItem.isEnabled = item.enabled
      menu.addItem(menuItem)
    }
    return menu
  }

  /// A Dock menu item picked: its place in the list goes to the Dart side, which opens that
  /// favourite stop (lib/desktop/glance.dart).
  @objc private func dockItemPicked(_ sender: NSMenuItem) {
    guard dartListening else { return }
    channel.invokeMethod("dock", arguments: ["index": sender.tag])
  }

  /// ⌘Q, the app menu's Quit or the Dock's Quit (AppDelegate's applicationShouldTerminate):
  /// passes the quit to the Dart side, which tidies up and then ends the app itself. Returns
  /// whether it did, in which case AppDelegate cancels this quit. Returns false (quit as usual)
  /// when the Dart side has no quit handler, when a quit was already passed on, and when macOS
  /// itself is logging out, restarting or shutting down, which mustn't wait. If the Dart side
  /// answers that it has no quit handler after all, the app quits as usual straight after.
  public func passQuitToDart() -> Bool {
    if !dartHandlesQuit || quitPassedOn || SgbusDesktopPlugin.macOSIsQuitting() { return false }
    quitPassedOn = true
    channel.invokeMethod("quit", arguments: nil) { answer in
      if answer as? Bool != true {
        NSApp.terminate(nil)
      }
    }
    return true
  }

  /// Whether the quit comes from macOS logging out, restarting or shutting down: its quit
  /// message then carries a reason. A quit from the person (⌘Q, the Dock) has none.
  private static func macOSIsQuitting() -> Bool {
    let event = NSAppleEventManager.shared().currentAppleEvent
    return event?.attributeDescriptor(forKeyword: AEKeyword(kAEQuitReason)) != nil
  }
}
