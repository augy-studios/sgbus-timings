// The tray icon (the menu bar on macOS) and its menu (desktop-features-spec §4), as the Electron
// app's main.js createTray had them. The menu, top to bottom: an update when there's one, the tray
// countdown (glance.dart), Open SG Bus Timings, Service alerts, Navigate, Add a Bus timings widget,
// Make it yours..., Check for updates..., Start when I sign in, and Quit.
//
// Clicking the icon on Windows shows the window, or hides it if it's in front; a right-click opens
// the menu. On macOS and Linux a click opens the menu (Linux's tray icons can only do that).
// The menu's built again each time it opens on Windows, and whenever an update, a check or the
// countdown changes, so what it says is current.
import 'dart:async';

import 'package:tray_manager/tray_manager.dart';

import '../i18n/i18n.dart';
import 'desktop.dart';
import 'glance.dart';
import 'settings.dart';
import 'updater.dart';
import 'welcome.dart';
import 'widgets_window.dart';

/// The tray icon, its tooltip, its menu-bar text on macOS, and its menu.
class DeskTray {
  DeskTray._();

  static TrayIcon? _icon;
  static String _tip = Desktop.name;

  /// Whether the app starts at sign-in, as last asked: the menu's check box.
  static bool _startsAtLogin = false;

  /// Puts the icon in the tray with its menu, and keeps the menu up to date with the updater.
  static Future<void> init() async {
    final icon = TrayIcon.create();
    if (icon == null) return;
    _icon = icon;
    // sgbusnotificon.png made square, at twice the tray's size for sharp high-DPI screens (one
    // picture: nativeapi loads a single file, not one per pixel density). A template on macOS, so
    // it follows the menu bar's light or dark.
    icon.icon = ImageAsset.fromAsset('assets/desktop/tray@2x.png');
    if (Desktop.mac) icon.isIconTemplate = true;
    icon.setTooltip(_tip);
    _startsAtLogin = await Desktop.startsAtLogin();
    await refresh();
    icon.setContextMenuTrigger(Desktop.windows ? ContextMenuTrigger.rightClicked : ContextMenuTrigger.clicked);
    icon.addListener(_clicked);
    icon.setVisible(true);
    for (final n in [Updater.available, Updater.ready, Updater.checking]) {
      n.addListener(refresh);
    }
  }

  /// A click on the icon. On Windows a left click shows or hides the window and a right click
  /// opens the menu, made again first so its check box is true. On macOS and Linux the click
  /// opens the menu itself, so it's only made again here for next time.
  static Future<void> _clicked(TrayIconEvent e) async {
    final showsMenu = e is TrayIconRightClickedEvent || (e is TrayIconClickedEvent && !Desktop.windows);
    if (e is TrayIconClickedEvent && Desktop.windows) {
      if (Desktop.inFront) {
        Desktop.window?.hide();
      } else {
        Desktop.show();
      }
    }
    if (showsMenu) {
      _startsAtLogin = await Desktop.startsAtLogin();
      await refresh();
    }
  }

  /// The icon's tooltip: the app's name, or the tray countdown (glance.dart). Kept, so it's
  /// right even if it's set before the icon's made.
  static void tooltip(String text) {
    _tip = text;
    _icon?.setTooltip(text);
  }

  /// macOS: words beside the icon in the menu bar (the tray countdown), or none for ''.
  static void title(String text) => _icon?.setTitle(text.isEmpty ? null : text);

  /// A plain menu item that runs [onClick].
  static MenuItem _item(String label, void Function() onClick, {bool enabled = true}) {
    final item = MenuItem.createWithLabelAndType(label, MenuItemType.normal)!;
    item.isEnabled = enabled;
    item.addListener((e) {
      if (e is MenuItemClickedEvent) onClick();
    });
    return item;
  }

  /// Makes the menu again from how things are now, and gives it to the icon.
  static Future<void> refresh() async {
    final icon = _icon;
    if (icon == null) return;
    final menu = Menu.create();
    if (menu == null) return;
    _addUpdate(menu);
    final countdown = Glance.menuLabel();
    if (countdown != null) {
      menu.addItem(_item(countdown, Glance.openStop));
      menu.addItem(_item(tr('desktop.tray.stopCountdown', 'Stop the tray countdown'), () => Glance.setStop(null)));
      menu.addSeparator();
    }
    menu.addItem(_item(tr('desktop.tray.open', 'Open {app}', {'app': Desktop.name}), () => Desktop.show()));
    // The two most-used pages, as the Electron app's menu had them.
    menu.addItem(_item(tr('tray.alerts', 'Service alerts'), () => Desktop.show('#alerts')));
    menu.addItem(_item(tr('tray.navigate', 'Navigate'), () => Desktop.show('#nav')));
    menu.addItem(_item(tr('desktop.tray.addWidget', 'Add a Bus timings widget'), DeskWidgets.add));
    menu.addItem(_item(tr('desktop.tray.makeItYours', 'Make it yours...'), () => Welcome.open()));
    menu.addSeparator();
    menu.addItem(Updater.checking.value
        ? _item(tr('desktop.tray.checking', 'Checking for updates...'), () {}, enabled: false)
        : _item(tr('desktop.tray.check', 'Check for updates...'), Updater.checkNow));
    menu.addItem(_startAtLoginItem());
    menu.addSeparator();
    menu.addItem(_item(tr('desktop.tray.quit', 'Quit'), () => Desktop.quit()));
    icon.setContextMenu(menu);
  }

  /// The menu's first line while there's an update: "Restart to update to x.y.z" once one's
  /// downloaded, or "Download version x.y.z" for an install that can't update itself.
  static void _addUpdate(Menu menu) {
    final ready = Updater.ready.value;
    final available = Updater.available.value;
    if (ready != null) {
      menu.addItem(_item(tr('desktop.tray.restart', 'Restart to update to {v}', {'v': ready}), Updater.restartToUpdate));
      menu.addSeparator();
    } else if (available != null && !Updater.canInstall) {
      menu.addItem(_item(tr('desktop.tray.download', 'Download version {v}', {'v': available}), () => Desktop.openExternal(Desktop.releases)));
      menu.addSeparator();
    }
  }

  /// "Start when I sign in", a check box. Choosing either way marks the choice as made
  /// (loginChosen), so the app never turns it back on by itself.
  static MenuItem _startAtLoginItem() {
    final login = MenuItem.createWithLabelAndType(tr('desktop.tray.startAtLogin', 'Start when I sign in'), MenuItemType.checkbox)!;
    login.state = _startsAtLogin ? MenuItemState.checked : MenuItemState.unchecked;
    login.addListener((e) async {
      if (e is! MenuItemClickedEvent) return;
      await Desktop.setStartAtLogin(!_startsAtLogin);
      DeskSettings.write({'loginChosen': true});
      _startsAtLogin = await Desktop.startsAtLogin();
      unawaited(refresh());
    });
    return login;
  }
}
