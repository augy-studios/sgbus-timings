// The desktop app's keyboard shortcuts on all three systems, and on macOS the menu bar along the
// top of the screen (desktop-features-spec §5, flutter-desktop-app-spec §2.5). chrome.dart wraps
// the main window in both; the actions themselves are DeskChrome's.
//
// The shortcuts, with ⌘ on a Mac where Windows and Linux use Ctrl:
//
//   Ctrl+K, Ctrl+F            the command bar (search stops, buses and commands)
//   Ctrl+L, F6                the command bar with the address in it, as a browser's address bar
//   Ctrl+Shift+C              copy the link to what's on show
//   Alt+Left, Alt+Right       Back, Forward (⌘[ and ⌘] on a Mac)
//   F5, Ctrl+R                Reload
//   Ctrl+,                    Settings
//   Ctrl+W                    close the dialog or panel in front, or hide the window to the tray
//   F11                       full screen (⌃⌘F on a Mac)
//   Esc                       close the dialog, panel or command bar, or leave full screen
//                             (chrome.dart, as it must let Esc through when it has nothing to do)
//
// The Mac's menu bar: the app's menu (About, Settings, Make it yours, updates, Hide, Quit), File,
// Edit, View, Window and Help, each item with its shortcut.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/nav.dart';
import '../app/pages.dart';
import '../i18n/i18n.dart';
import 'chrome.dart';
import 'desktop.dart';
import 'screenshot.dart';
import 'updater.dart';
import 'welcome.dart';
import 'widgets_window.dart';

/// The shortcuts and the Mac's menus. Everything is static: there is one main window.
class DeskMenus {
  DeskMenus._();

  /// The guide's page about the desktop app, for Help.
  static const guide = 'https://guide.sgbus.uwuapps.org/web/desktop-app';

  static bool get _mac => Desktop.mac;

  /// A shortcut as the system writes it, for tooltips and the command bar: "⌘K" or "⇧⌘C" on a
  /// Mac, "Ctrl+K" or "Ctrl+Shift+C" elsewhere.
  static String keys(String key, {bool shift = false}) {
    if (_mac) return '${shift ? '⇧' : ''}⌘$key';
    return 'Ctrl+${shift ? 'Shift+' : ''}$key';
  }

  /// A key with ⌘ on a Mac, Ctrl elsewhere.
  static SingleActivator _cmd(LogicalKeyboardKey key, {bool shift = false}) => SingleActivator(key, meta: _mac, control: !_mac, shift: shift);

  /// Every shortcut, and what it does.
  static Map<ShortcutActivator, VoidCallback> shortcuts() => {
        _cmd(LogicalKeyboardKey.keyK): DeskChrome.openCommandBar,
        _cmd(LogicalKeyboardKey.keyF): DeskChrome.openCommandBar,
        _cmd(LogicalKeyboardKey.keyL): () => DeskChrome.openCommandBar(withAddress: true),
        const SingleActivator(LogicalKeyboardKey.f6): () => DeskChrome.openCommandBar(withAddress: true),
        _cmd(LogicalKeyboardKey.keyC, shift: true): DeskChrome.copyLink,
        // Alt+Left moves a word in a Mac's text boxes, so a Mac has only ⌘[ and ⌘].
        if (_mac) const SingleActivator(LogicalKeyboardKey.bracketLeft, meta: true): DeskChrome.back,
        if (_mac) const SingleActivator(LogicalKeyboardKey.bracketRight, meta: true): DeskChrome.forward,
        if (!_mac) const SingleActivator(LogicalKeyboardKey.arrowLeft, alt: true): DeskChrome.back,
        if (!_mac) const SingleActivator(LogicalKeyboardKey.arrowRight, alt: true): DeskChrome.forward,
        const SingleActivator(LogicalKeyboardKey.f5): DeskChrome.reload,
        _cmd(LogicalKeyboardKey.keyR): DeskChrome.reload,
        _cmd(LogicalKeyboardKey.comma): _settings,
        _cmd(LogicalKeyboardKey.keyW): DeskChrome.closePanelOrHide,
        if (_mac) const SingleActivator(LogicalKeyboardKey.keyF, meta: true, control: true): DeskChrome.toggleFullScreen,
        if (!_mac) const SingleActivator(LogicalKeyboardKey.f11): DeskChrome.toggleFullScreen,
      };

  /// Settings, over whatever's open.
  static void _settings() {
    AppNav.fromPane = false;
    AppNav.open('settings');
  }

  /// The main window's shortcuts around [child], and on a Mac its menu bar too.
  static Widget wrap({required Widget child}) {
    final keyed = CallbackShortcuts(bindings: shortcuts(), child: child);
    if (!_mac) return keyed;
    // Rebuilt when an update's ready, so the app's menu offers Restart to update.
    return ValueListenableBuilder<String?>(
      valueListenable: Updater.ready,
      builder: (context, ready, _) => PlatformMenuBar(menus: _menus(ready), child: keyed),
    );
  }

  /// One of the system's own menu items, if this Mac has it.
  static List<PlatformMenuItem> _provided(PlatformProvidedMenuItemType type) =>
      PlatformProvidedMenuItem.hasMenu(type) ? [PlatformProvidedMenuItem(type: type)] : const [];

  /// Runs a text box's own action (copy, paste…) on the box that has the focus, for the Edit
  /// menu; nothing if no text box has it.
  static void _text(Intent intent) {
    final context = FocusManager.instance.primaryFocus?.context;
    if (context != null) Actions.maybeInvoke(context, intent);
  }

  /// The Mac's menus, the app's own first. [ready] is a downloaded update's version, if any.
  static List<PlatformMenuItem> _menus(String? ready) => [
        PlatformMenu(label: Desktop.name, menus: [
          PlatformMenuItemGroup(members: _provided(PlatformProvidedMenuItemType.about)),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.menu.settings', 'Settings…'), shortcut: _cmd(LogicalKeyboardKey.comma), onSelected: _settings),
            PlatformMenuItem(label: tr('desktop.tray.makeItYours', 'Make it yours…'), onSelected: () => Welcome.open()),
            if (ready != null)
              PlatformMenuItem(label: tr('desktop.tray.restart', 'Restart to update to {v}', {'v': ready}), onSelected: Updater.restartToUpdate)
            else
              PlatformMenuItem(label: tr('desktop.tray.check', 'Check for updates…'), onSelected: Updater.checkNow),
          ]),
          PlatformMenuItemGroup(members: _provided(PlatformProvidedMenuItemType.servicesSubmenu)),
          PlatformMenuItemGroup(members: [
            ..._provided(PlatformProvidedMenuItemType.hide),
            ..._provided(PlatformProvidedMenuItemType.hideOtherApplications),
            ..._provided(PlatformProvidedMenuItemType.showAllApplications),
          ]),
          // The app's own Quit, not the system's, so an update waiting for the quit installs.
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(
                label: tr('desktop.menu.quit', 'Quit {app}', {'app': Desktop.name}),
                shortcut: const SingleActivator(LogicalKeyboardKey.keyQ, meta: true),
                onSelected: () => Desktop.quit()),
          ]),
        ]),
        PlatformMenu(label: tr('desktop.menu.file', 'File'), menus: [
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.tray.addWidget', 'Add a Bus timings widget'), onSelected: DeskWidgets.add),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.cmd.shot', 'Take a screenshot'), onSelected: () => DeskShot.take(long: false)),
            PlatformMenuItem(label: tr('desktop.cmd.longShot', 'Take a long screenshot'), onSelected: () => DeskShot.take(long: true)),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.menu.close', 'Close Window'), shortcut: _cmd(LogicalKeyboardKey.keyW), onSelected: DeskChrome.closePanelOrHide),
          ]),
        ]),
        PlatformMenu(label: tr('desktop.menu.edit', 'Edit'), menus: [
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.menu.undo', 'Undo'), shortcut: _cmd(LogicalKeyboardKey.keyZ), onSelected: () => _text(const UndoTextIntent(SelectionChangedCause.keyboard))),
            PlatformMenuItem(
                label: tr('desktop.menu.redo', 'Redo'), shortcut: _cmd(LogicalKeyboardKey.keyZ, shift: true), onSelected: () => _text(const RedoTextIntent(SelectionChangedCause.keyboard))),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.menu.cut', 'Cut'), shortcut: _cmd(LogicalKeyboardKey.keyX), onSelected: () => _text(const CopySelectionTextIntent.cut(SelectionChangedCause.keyboard))),
            PlatformMenuItem(label: tr('desktop.menu.copy', 'Copy'), shortcut: _cmd(LogicalKeyboardKey.keyC), onSelected: () => _text(CopySelectionTextIntent.copy)),
            PlatformMenuItem(label: tr('desktop.menu.paste', 'Paste'), shortcut: _cmd(LogicalKeyboardKey.keyV), onSelected: () => _text(const PasteTextIntent(SelectionChangedCause.keyboard))),
            PlatformMenuItem(
                label: tr('desktop.menu.selectAll', 'Select All'), shortcut: _cmd(LogicalKeyboardKey.keyA), onSelected: () => _text(const SelectAllTextIntent(SelectionChangedCause.keyboard))),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.cmd.copyLink', 'Copy link'), shortcut: _cmd(LogicalKeyboardKey.keyC, shift: true), onSelected: DeskChrome.copyLink),
            PlatformMenuItem(label: tr('desktop.menu.find', 'Find…'), shortcut: _cmd(LogicalKeyboardKey.keyF), onSelected: DeskChrome.openCommandBar),
          ]),
        ]),
        PlatformMenu(label: tr('desktop.menu.view', 'View'), menus: [
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.cmd.reload', 'Reload'), shortcut: _cmd(LogicalKeyboardKey.keyR), onSelected: DeskChrome.reload),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.cmd.back', 'Back'), shortcut: const SingleActivator(LogicalKeyboardKey.bracketLeft, meta: true), onSelected: DeskChrome.back),
            PlatformMenuItem(label: tr('desktop.cmd.forward', 'Forward'), shortcut: const SingleActivator(LogicalKeyboardKey.bracketRight, meta: true), onSelected: DeskChrome.forward),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(label: tr('desktop.menu.search', 'Search Stops and Buses…'), shortcut: _cmd(LogicalKeyboardKey.keyK), onSelected: DeskChrome.openCommandBar),
            PlatformMenuItem(
                label: tr('desktop.menu.address', 'Open Address…'), shortcut: _cmd(LogicalKeyboardKey.keyL), onSelected: () => DeskChrome.openCommandBar(withAddress: true)),
          ]),
          PlatformMenuItemGroup(members: [
            for (final p in Pages.tabs())
              PlatformMenuItem(
                label: p.label(),
                onSelected: () {
                  AppNav.fromPane = false;
                  AppNav.showPage(p.id);
                },
              ),
          ]),
          PlatformMenuItemGroup(members: [
            PlatformMenuItem(
                label: tr('desktop.cmd.fullScreen', 'Full screen'),
                shortcut: const SingleActivator(LogicalKeyboardKey.keyF, meta: true, control: true),
                onSelected: DeskChrome.toggleFullScreen),
          ]),
        ]),
        PlatformMenu(label: tr('desktop.menu.window', 'Window'), menus: [
          PlatformMenuItemGroup(members: [
            ..._provided(PlatformProvidedMenuItemType.minimizeWindow),
            ..._provided(PlatformProvidedMenuItemType.zoomWindow),
          ]),
          PlatformMenuItemGroup(members: _provided(PlatformProvidedMenuItemType.arrangeWindowsInFront)),
        ]),
        PlatformMenu(label: tr('desktop.menu.help', 'Help'), menus: [
          PlatformMenuItem(label: tr('html.how_to_use_sg_bus', 'How to use SG Bus Timings'), onSelected: () => Desktop.openExternal(guide)),
          PlatformMenuItem(label: tr('desktop.menu.releases', 'What’s new'), onSelected: () => Desktop.openExternal(Desktop.releases)),
        ]),
      ];
}
