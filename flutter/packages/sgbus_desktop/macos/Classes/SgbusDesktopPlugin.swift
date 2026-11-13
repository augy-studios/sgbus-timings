// SG Bus Timings' desktop native parts on macOS (lib/sgbus_desktop.dart): this engine's window,
// uwu:// links (Apple events, kept until Dart's listening), the Dock menu and badge, the Dock
// icon clicked with no window showing, and starting at sign-in (SMAppService, macOS 13 and
// later). The runner's AppDelegate asks `SgbusDesktopPlugin.main` for the Dock menu and reopen.
import Cocoa
import FlutterMacOS
import ServiceManagement

public class SgbusDesktopPlugin: NSObject, FlutterPlugin {
  /// The main window's engine's: the first registered.
  public static var main: SgbusDesktopPlugin?

  private let channel: FlutterMethodChannel
  private weak var registrar: FlutterPluginRegistrar?
  private var ready = false
  private var waiting: [(String, [String: Any])] = []
  private var dockItems: [(String, Bool)] = []

  init(channel: FlutterMethodChannel, registrar: FlutterPluginRegistrar) {
    self.channel = channel
    self.registrar = registrar
    super.init()
  }

  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: "org.uwuapps.sgbus/desktop", binaryMessenger: registrar.messenger)
    let plugin = SgbusDesktopPlugin(channel: channel, registrar: registrar)
    registrar.addMethodCallDelegate(plugin, channel: channel)
    if main == nil {
      main = plugin
      NSAppleEventManager.shared().setEventHandler(
        plugin, andSelector: #selector(handleURL(_:withReply:)),
        forEventClass: AEEventClass(kInternetEventClass), andEventID: AEEventID(kAEGetURL))
    }
  }

  @objc func handleURL(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
    guard let url = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue else { return }
    send("open", ["url": url])
  }

  /// The Dock icon clicked with no window showing.
  public func reopen() { send("activate", [:]) }

  private func send(_ method: String, _ args: [String: Any]) {
    if ready {
      channel.invokeMethod(method, arguments: args)
    } else {
      waiting.append((method, args))
    }
  }

  /// The Dock's menu, for AppDelegate.applicationDockMenu.
  public func dockMenu() -> NSMenu? {
    let menu = NSMenu()
    for (i, item) in dockItems.enumerated() {
      let m = NSMenuItem(title: item.0, action: item.1 ? #selector(dockPicked(_:)) : nil, keyEquivalent: "")
      m.target = self
      m.tag = i
      m.isEnabled = item.1
      menu.addItem(m)
    }
    return menu
  }

  @objc func dockPicked(_ sender: NSMenuItem) { send("dock", ["index": sender.tag]) }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "handle":
      if let window = registrar?.view?.window {
        result(Int(bitPattern: Unmanaged.passUnretained(window).toOpaque()))
      } else {
        result(nil)
      }
    case "ready":
      ready = true
      let queued = waiting
      waiting = []
      for (m, a) in queued { channel.invokeMethod(m, arguments: a) }
      result(nil)
    case "dockMenu":
      dockItems = (args["items"] as? [[String: Any]] ?? []).map { ($0["title"] as? String ?? "", $0["enabled"] as? Bool ?? true) }
      result(nil)
    case "badge":
      let text = args["text"] as? String ?? ""
      NSApp.dockTile.badgeLabel = text.isEmpty ? nil : text
      result(nil)
    case "getLogin":
      if #available(macOS 13.0, *) {
        result(SMAppService.mainApp.status == .enabled)
      } else {
        result(false)
      }
    case "setLogin":
      if #available(macOS 13.0, *) {
        let on = args["on"] as? Bool ?? false
        do {
          if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {}
      }
      result(nil)
    case "front":
      NSApp.activate(ignoringOtherApps: true)
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }
}
