// The tray icon (the menu bar on macOS), and its menu: an update when there's one, the tray
// countdown, Open SG Bus Timings, Service alerts, Navigate, Add a Bus timings widget, Make it
// yours..., Check for updates..., Start when I sign in, and Quit. Clicking the icon (Windows,
// Linux) shows the window, or hides it if it's in front; macOS opens the menu on a click.
// The menu's built again each time it opens, so its check box is true.
import 'dart:async';

import 'package:tray_manager/tray_manager.dart';

import '../i18n/i18n.dart';
import 'desktop.dart';
import 'glance.dart';
import 'settings.dart';
import 'updater.dart';
import 'welcome.dart';
import 'widgets_window.dart';

class DeskTray {
  DeskTray._();

  static TrayIcon? _icon;
  static String _tip = Desktop.name;
  static bool _startsAtLogin = false;

  static Future<void> init() async {
    final icon = TrayIcon.create();
    if (icon == null) return;
    _icon = icon;
    // sgbusnotificon.png made square, at twice the tray's size for sharp high-DPI screens; a
    // template on macOS, so it follows the menu bar's light or dark.
    icon.icon = ImageAsset.fromAsset(Desktop.mac ? 'assets/desktop/tray@2x.png' : 'assets/desktop/tray@2x.png');
    if (Desktop.mac) icon.isIconTemplate = true;
    icon.setTooltip(_tip);
    _startsAtLogin = await Desktop.startsAtLogin();
    await refresh();
    icon.setContextMenuTrigger(Desktop.windows ? ContextMenuTrigger.rightClicked : ContextMenuTrigger.clicked);
    icon.addListener((e) async {
      switch (e) {
        case TrayIconClickedEvent():
          if (Desktop.mac || Desktop.linux) return;
          if (Desktop.inFront) {
            Desktop.window?.hide();
          } else {
            Desktop.show();
          }
        case TrayIconRightClickedEvent():
          _startsAtLogin = await Desktop.startsAtLogin();
          await refresh();
        default:
          break;
      }
    });
    icon.setVisible(true);
    for (final n in [Updater.available, Updater.ready, Updater.checking]) {
      n.addListener(refresh);
    }
  }

  static void tooltip(String text) {
    _tip = text;
    _icon?.setTooltip(text);
  }

  /// macOS: words beside the icon in the menu bar.
  static void title(String text) => _icon?.setTitle(text.isEmpty ? null : text);

  static MenuItem _item(String label, void Function() onClick, {bool enabled = true}) {
    final item = MenuItem.createWithLabelAndType(label, MenuItemType.normal)!;
    item.isEnabled = enabled;
    item.addListener((e) {
      if (e is MenuItemClickedEvent) onClick();
    });
    return item;
  }

  /// The menu, made again.
  static Future<void> refresh() async {
    final icon = _icon;
    if (icon == null) return;
    final menu = Menu.create();
    if (menu == null) return;
    final ready = Updater.ready.value;
    final available = Updater.available.value;
    if (ready != null) {
      menu.addItem(_item(tr('desktop.tray.restart', 'Restart to update to {v}', {'v': ready}), Updater.restartToUpdate));
      menu.addSeparator();
    } else if (available != null && !Updater.canInstall) {
      menu.addItem(_item(tr('desktop.tray.download', 'Download version {v}', {'v': available}), () => Desktop.openExternal(Desktop.releases)));
      menu.addSeparator();
    }
    final countdown = Glance.menuLabel();
    if (countdown != null) {
      menu.addItem(_item(countdown, Glance.openStop));
      menu.addItem(_item(tr('desktop.tray.stopCountdown', 'Stop the tray countdown'), () => Glance.setStop(null)));
      menu.addSeparator();
    }
    menu.addItem(_item(tr('desktop.tray.open', 'Open {app}', {'app': Desktop.name}), () => Desktop.show()));
    menu.addItem(_item(tr('tray.alerts', 'Service alerts'), () => Desktop.show('#alerts')));
    menu.addItem(_item(tr('tray.navigate', 'Navigate'), () => Desktop.show('#nav')));
    menu.addItem(_item(tr('desktop.tray.addWidget', 'Add a Bus timings widget'), DeskWidgets.add));
    menu.addItem(_item(tr('desktop.tray.makeItYours', 'Make it yours...'), () => Welcome.open()));
    menu.addSeparator();
    menu.addItem(Updater.checking.value
        ? _item(tr('desktop.tray.checking', 'Checking for updates...'), () {}, enabled: false)
        : _item(tr('desktop.tray.check', 'Check for updates...'), Updater.checkNow));
    final login = MenuItem.createWithLabelAndType(tr('desktop.tray.startAtLogin', 'Start when I sign in'), MenuItemType.checkbox)!;
    login.state = _startsAtLogin ? MenuItemState.checked : MenuItemState.unchecked;
    login.addListener((e) async {
      if (e is! MenuItemClickedEvent) return;
      final on = !_startsAtLogin;
      await Desktop.setStartAtLogin(on);
      DeskSettings.write({'loginChosen': true});
      _startsAtLogin = await Desktop.startsAtLogin();
      unawaited(refresh());
    });
    menu.addItem(login);
    menu.addSeparator();
    menu.addItem(_item(tr('desktop.tray.quit', 'Quit'), () => Desktop.quit()));
    icon.setContextMenu(menu);
  }
}
