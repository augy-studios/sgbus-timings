// SG Bus Timings' desktop native parts on Windows (the Dart side is lib/sgbus_desktop.dart): this
// engine's window, the Jump List, the taskbar thumbnail's buttons, starting at sign-in (the same
// Run entry the Electron app wrote, so its setting carries on), and a second copy's command line,
// which the runner (windows/runner/main.cpp) sends here with WM_COPYDATA.
//
// Every engine (the main window's, Make it yours', each Bus timings widget's) registers its own
// copy of this plugin, each looking after its own window. Windows has no Dock, so the Dock calls
// answer "not implemented", which the Dart side takes quietly.
#include "include/sgbus_desktop/sgbus_desktop_plugin_c_api.h"

#include <flutter/method_channel.h>
#include <flutter/plugin_registrar_windows.h>
#include <flutter/standard_method_codec.h>
#include <windows.h>
#include <objectarray.h>
#include <propkey.h>
#include <propvarutil.h>
#include <shobjidl.h>
#include <shlobj.h>

#include <cmath>
#include <cstring>
#include <memory>
#include <optional>
#include <string>
#include <variant>
#include <vector>

#pragma comment(lib, "propsys.lib")

namespace {

using flutter::EncodableList;
using flutter::EncodableMap;
using flutter::EncodableValue;

// The app's identity for Windows (the AppUserModelID, as runner/main.cpp sets it), and the name of
// its Run value: the Electron app used both.
const wchar_t kAppId[] = L"org.uwuapps.sgbus";
// Where Windows keeps the programs that start at sign-in, and Task Manager's on/off switch for each.
const wchar_t kRunKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const wchar_t kApprovedKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
// runner/main.cpp's WM_COPYDATA tag for a second copy's command line.
const ULONG_PTR kForwardTag = 0x53474255;  // "SGBU"

// UTF-8 (Dart's strings) to UTF-16 (Windows' own).
std::wstring Wide(const std::string& s) {
  if (s.empty()) return std::wstring();
  int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
  std::wstring out(n, 0);
  MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), out.data(), n);
  return out;
}

// UTF-16 (Windows' own strings) to UTF-8, for Dart.
std::string Narrow(const std::wstring& s) {
  if (s.empty()) return std::string();
  int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0, nullptr, nullptr);
  std::string out(n, 0);
  WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), out.data(), n, nullptr, nullptr);
  return out;
}

// The value under [key] in a map from Dart, or nullptr if it isn't there.
const EncodableValue* Field(const EncodableMap& m, const char* key) {
  auto it = m.find(EncodableValue(key));
  return it == m.end() ? nullptr : &it->second;
}

// The text under [key] in a map from Dart, or "" if it's missing or not text.
std::string Str(const EncodableMap& m, const char* key) {
  auto v = Field(m, key);
  return v && std::holds_alternative<std::string>(*v) ? std::get<std::string>(*v) : std::string();
}

// The true/false under [key] in a map from Dart, or [fallback] if it's missing.
bool Bool(const EncodableMap& m, const char* key, bool fallback) {
  auto v = Field(m, key);
  return v && std::holds_alternative<bool>(*v) ? std::get<bool>(*v) : fallback;
}

// The full path of the running SG Bus Timings.exe, for the Jump List's links and the Run entry.
std::wstring ExePath() {
  wchar_t path[MAX_PATH * 4];
  DWORD n = GetModuleFileNameW(nullptr, path, ARRAYSIZE(path));
  return std::wstring(path, n);
}

// 16 px white glyphs for the thumbnail's buttons, as the Electron app drew them: ◀ (0), ▶ (1) and
// a refresh ring with its arrowhead (2). Drawn pixel by pixel, so no icon files are needed.
HICON Glyph(int which) {
  const int size = 16;
  std::vector<uint32_t> px(size * size, 0);
  for (int y = 0; y < size; y++) {
    for (int x = 0; x < size; x++) {
      double fx = x + 0.5, fy = y + 0.5;
      bool on = false;
      if (which == 0) on = fx >= 4 && fx <= 12 && std::abs(fy - 8) <= (fx - 4) * 0.75;
      if (which == 1) on = fx >= 4 && fx <= 12 && std::abs(fy - 8) <= (12 - fx) * 0.75;
      if (which == 2) {
        double dx = fx - 8, dy = fy - 8.5, r = std::hypot(dx, dy);
        bool ring = r >= 4 && r <= 6 && !(dx > 0 && dy < 0 && dx > -dy * 0.3);
        bool head = fy >= 1.5 && fy <= 6 && fx >= 9 && fx <= 13.5 && fx - 9 >= fy - 1.5;
        on = ring || head;
      }
      if (on) px[y * size + x] = 0xFFFFFFFF;
    }
  }
  BITMAPV5HEADER bi = {};
  bi.bV5Size = sizeof(bi);
  bi.bV5Width = size;
  bi.bV5Height = -size;
  bi.bV5Planes = 1;
  bi.bV5BitCount = 32;
  bi.bV5Compression = BI_BITFIELDS;
  bi.bV5RedMask = 0x00FF0000;
  bi.bV5GreenMask = 0x0000FF00;
  bi.bV5BlueMask = 0x000000FF;
  bi.bV5AlphaMask = 0xFF000000;
  HDC dc = GetDC(nullptr);
  void* bits = nullptr;
  HBITMAP color = CreateDIBSection(dc, reinterpret_cast<BITMAPINFO*>(&bi), DIB_RGB_COLORS, &bits, nullptr, 0);
  ReleaseDC(nullptr, dc);
  if (!color) return nullptr;
  memcpy(bits, px.data(), px.size() * 4);
  // The icon's mask, all clear: the colour picture's own transparency is what's used. (Made empty
  // rather than left as whatever was in memory.)
  std::vector<BYTE> mask_bits(size * size / 8, 0);
  HBITMAP mask = CreateBitmap(size, size, 1, 1, mask_bits.data());
  ICONINFO ii = {};
  ii.fIcon = TRUE;
  ii.hbmColor = color;
  ii.hbmMask = mask;
  HICON icon = CreateIconIndirect(&ii);
  DeleteObject(color);
  DeleteObject(mask);
  return icon;
}

// The plugin for one engine and its window.
class SgbusDesktopPlugin : public flutter::Plugin {
 public:
  // Sets up the channel the Dart side calls, and listens to the window's messages for the
  // taskbar's buttons and a second copy's command line.
  explicit SgbusDesktopPlugin(flutter::PluginRegistrarWindows* registrar) : registrar_(registrar) {
    channel_ = std::make_unique<flutter::MethodChannel<EncodableValue>>(
        registrar->messenger(), "org.uwuapps.sgbus/desktop", &flutter::StandardMethodCodec::GetInstance());
    channel_->SetMethodCallHandler([this](const auto& call, auto result) { Handle(call, std::move(result)); });
    taskbar_created_ = RegisterWindowMessageW(L"TaskbarButtonCreated");
    proc_id_ = registrar->RegisterTopLevelWindowProcDelegate(
        [this](HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) { return Proc(hwnd, message, wparam, lparam); });
  }

  // Stops listening to the window and frees the buttons' icons, when the engine goes.
  ~SgbusDesktopPlugin() override {
    registrar_->UnregisterTopLevelWindowProcDelegate(proc_id_);
    for (auto icon : icons_) if (icon) DestroyIcon(icon);
  }

 private:
  // This engine's window (the top-level one its Flutter view is in), or nullptr if it has none.
  HWND Top() {
    auto view = registrar_->GetView();
    return view ? GetAncestor(view->GetNativeWindow(), GA_ROOT) : nullptr;
  }

  // Every message to the window, before Flutter's own handling. Picks out: the taskbar's button
  // being (re)made, so the thumbnail buttons are added again (Explorer restarting loses them); a
  // thumbnail button pressed ('thumb' to Dart, with its id); and a second copy's command line
  // ('open' to Dart, with its arguments, or kept until Dart is listening). Anything else is left
  // to Flutter (nullopt).
  std::optional<LRESULT> Proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    if (message == taskbar_created_) {
      buttons_added_ = false;
      if (!buttons_.empty()) ApplyButtons();
      return std::nullopt;
    }
    if (message == WM_COMMAND && HIWORD(wparam) == THBN_CLICKED) {
      channel_->InvokeMethod("thumb", std::make_unique<EncodableValue>(EncodableMap{{EncodableValue("id"), EncodableValue((int)LOWORD(wparam))}}));
      return 0;
    }
    if (message == WM_COPYDATA) {
      auto data = reinterpret_cast<COPYDATASTRUCT*>(lparam);
      if (data && data->dwData == kForwardTag && data->lpData) {
        std::wstring line(reinterpret_cast<const wchar_t*>(data->lpData), data->cbData / sizeof(wchar_t));
        int argc = 0;
        LPWSTR* argv = CommandLineToArgvW(line.c_str(), &argc);
        EncodableList args;
        for (int i = 1; argv && i < argc; i++) args.push_back(EncodableValue(Narrow(argv[i])));
        if (argv) LocalFree(argv);
        EncodableValue open_event(EncodableMap{{EncodableValue("args"), EncodableValue(args)}});
        if (dart_listening_) {
          channel_->InvokeMethod("open", std::make_unique<EncodableValue>(open_event));
        } else {
          // Dart isn't listening yet (the update window can take 10 s or more): kept for "ready".
          waiting_.push_back(open_event);
        }
        return TRUE;
      }
    }
    return std::nullopt;
  }

  // Answers a call from the Dart side; see lib/sgbus_desktop.dart for what each one is for.
  void Handle(const flutter::MethodCall<EncodableValue>& call, std::unique_ptr<flutter::MethodResult<EncodableValue>> result) {
    const auto& name = call.method_name();
    EncodableMap args;
    if (call.arguments() && std::holds_alternative<EncodableMap>(*call.arguments())) args = std::get<EncodableMap>(*call.arguments());
    if (name == "handle") {
      result->Success(EncodableValue((int64_t)(intptr_t)Top()));
    } else if (name == "ready") {
      StartSending();
      result->Success();
    } else if (name == "jumpList") {
      auto tasks = Field(args, "tasks");
      result->Success(EncodableValue(JumpList(tasks && std::holds_alternative<EncodableList>(*tasks) ? std::get<EncodableList>(*tasks) : EncodableList())));
    } else if (name == "thumbButtons") {
      auto list = Field(args, "buttons");
      buttons_.clear();
      if (list && std::holds_alternative<EncodableList>(*list)) {
        for (const auto& b : std::get<EncodableList>(*list)) {
          if (std::holds_alternative<EncodableMap>(b)) buttons_.push_back(std::get<EncodableMap>(b));
        }
      }
      result->Success(EncodableValue(ApplyButtons()));
    } else if (name == "getLogin") {
      result->Success(EncodableValue(GetLogin()));
    } else if (name == "setLogin") {
      SetLogin(Bool(args, "on", false));
      result->Success();
    } else if (name == "front") {
      HWND top = Top();
      if (top) {
        if (IsIconic(top)) ShowWindow(top, SW_RESTORE);
        SetForegroundWindow(top);
      }
      result->Success();
    } else if (name == "trayFront") {
      result->Success(EncodableValue(TrayFront()));
    } else if (name == "quit") {
      // Ends the main window's message loop (windows/runner/main.cpp), so the runner shuts the
      // engine down as it does for a closed window. Called on the loop's own thread, so the
      // WM_QUIT is its. The answer goes first: Dart is waiting for it.
      result->Success();
      PostQuitMessage(0);
    } else {
      result->NotImplemented();
    }
  }

  // Just before the tray's menu opens: one of the app's own windows made the foreground window,
  // as Windows asks of a notification icon's menu, so that a click anywhere outside the menu
  // closes it. nativeapi gives the menu a message-only window, which can never be in front, so
  // without this the menu stayed open until something in it was picked. The window is a hidden
  // one of its own (as .NET's NotifyIcon has), made once and never shown, so the app's own window
  // doesn't come forward with the menu. Returns whether Windows let it come to the front.
  bool TrayFront() {
    static HWND front = nullptr;
    if (!front || !IsWindow(front)) {
      WNDCLASSW wc = {};
      wc.lpfnWndProc = DefWindowProcW;
      wc.hInstance = GetModuleHandleW(nullptr);
      wc.lpszClassName = L"SgbusTrayMenuOwner";
      RegisterClassW(&wc);  // Fails harmlessly once it's registered.
      front = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"", WS_POPUP, 0, 0, 0, 0, nullptr, nullptr, wc.hInstance, nullptr);
      if (!front) return false;
    }
    return SetForegroundWindow(front) != FALSE;
  }

  // The Dart side is listening: from now on events go straight to it, and any second copy's
  // command line kept until now is sent, in the order they came.
  void StartSending() {
    dart_listening_ = true;
    for (const auto& open_event : waiting_) {
      channel_->InvokeMethod("open", std::make_unique<EncodableValue>(open_event));
    }
    waiting_.clear();
  }

  // Replaces the Jump List's tasks (right-click the taskbar icon) with [tasks], each a link that
  // starts SG Bus Timings.exe with a uwu://sgbus/ link, which the running copy is handed. An
  // empty list clears them. Returns whether Windows took it.
  bool JumpList(const EncodableList& tasks) {
    ICustomDestinationList* list = nullptr;
    if (FAILED(CoCreateInstance(CLSID_DestinationList, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&list)))) return false;
    list->SetAppID(kAppId);
    UINT slots = 0;
    IObjectArray* removed = nullptr;
    bool ok = false;
    if (SUCCEEDED(list->BeginList(&slots, IID_PPV_ARGS(&removed)))) {
      IObjectCollection* items = nullptr;
      if (SUCCEEDED(CoCreateInstance(CLSID_EnumerableObjectCollection, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&items)))) {
        std::wstring exe = ExePath();
        for (const auto& t : tasks) {
          if (!std::holds_alternative<EncodableMap>(t)) continue;
          const auto& m = std::get<EncodableMap>(t);
          IShellLinkW* link = nullptr;
          if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&link)))) continue;
          link->SetPath(exe.c_str());
          link->SetArguments(Wide(Str(m, "args")).c_str());
          link->SetDescription(Wide(Str(m, "description")).c_str());
          link->SetIconLocation(exe.c_str(), 0);
          IPropertyStore* props = nullptr;
          if (SUCCEEDED(link->QueryInterface(IID_PPV_ARGS(&props)))) {
            PROPVARIANT title;
            if (SUCCEEDED(InitPropVariantFromString(Wide(Str(m, "title")).c_str(), &title))) {
              props->SetValue(PKEY_Title, title);
              props->Commit();
              PropVariantClear(&title);
            }
            props->Release();
          }
          items->AddObject(link);
          link->Release();
        }
        IObjectArray* array = nullptr;
        if (SUCCEEDED(items->QueryInterface(IID_PPV_ARGS(&array)))) {
          UINT count = 0;
          array->GetCount(&count);
          if (count > 0) list->AddUserTasks(array);
          array->Release();
        }
        items->Release();
      }
      ok = SUCCEEDED(list->CommitList());
      if (removed) removed->Release();
    }
    list->Release();
    return ok;
  }

  // Puts the kept buttons on the taskbar thumbnail: added the first time, updated after (Windows
  // allows up to 7, and adding only once per window). Fails until the window's on the taskbar;
  // the "taskbar button created" message in Proc tries again then. Returns whether it worked.
  bool ApplyButtons() {
    HWND top = Top();
    if (!top) return false;
    ITaskbarList3* bar = nullptr;
    if (FAILED(CoCreateInstance(CLSID_TaskbarList, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&bar)))) return false;
    bar->HrInit();
    if (icons_.empty()) icons_ = {Glyph(0), Glyph(1), Glyph(2)};
    THUMBBUTTON tb[7] = {};
    UINT n = 0;
    for (const auto& b : buttons_) {
      if (n >= 7) break;
      auto id = Field(b, "id");
      tb[n].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
      tb[n].iId = id && std::holds_alternative<int32_t>(*id) ? std::get<int32_t>(*id) : (int)n;
      std::string icon = Str(b, "icon");
      tb[n].hIcon = icons_[icon == "prev" ? 0 : icon == "next" ? 1 : 2];
      wcsncpy_s(tb[n].szTip, Wide(Str(b, "tooltip")).c_str(), _TRUNCATE);
      tb[n].dwFlags = Bool(b, "enabled", true) ? THBF_ENABLED : THBF_DISABLED;
      n++;
    }
    HRESULT hr = buttons_added_ ? bar->ThumbBarUpdateButtons(top, n, tb) : bar->ThumbBarAddButtons(top, n, tb);
    if (SUCCEEDED(hr)) buttons_added_ = true;
    bar->Release();
    return SUCCEEDED(hr);
  }

  // Whether the app starts at sign-in: its Run entry is there, and Task Manager's switch for it
  // isn't off (StartupApproved: 2 on, 3 off; an odd first byte means off).
  bool GetLogin() {
    HKEY key;
    bool on = false;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, kRunKey, 0, KEY_READ, &key) == ERROR_SUCCESS) {
      on = RegQueryValueExW(key, kAppId, nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS;
      RegCloseKey(key);
    }
    if (on && RegOpenKeyExW(HKEY_CURRENT_USER, kApprovedKey, 0, KEY_READ, &key) == ERROR_SUCCESS) {
      BYTE data[12] = {};
      DWORD size = sizeof(data);
      if (RegQueryValueExW(key, kAppId, nullptr, nullptr, data, &size) == ERROR_SUCCESS && size > 0 && (data[0] & 1)) on = false;
      RegCloseKey(key);
    }
    return on;
  }

  // Starts the app at sign-in (the Run entry, with the exe's path in quotes) or stops it, and
  // keeps Task Manager's switch in step.
  void SetLogin(bool on) {
    HKEY key;
    if (RegCreateKeyExW(HKEY_CURRENT_USER, kRunKey, 0, nullptr, 0, KEY_WRITE, nullptr, &key, nullptr) == ERROR_SUCCESS) {
      if (on) {
        std::wstring value = L"\"" + ExePath() + L"\"";
        RegSetValueExW(key, kAppId, 0, REG_SZ, reinterpret_cast<const BYTE*>(value.c_str()), (DWORD)((value.size() + 1) * sizeof(wchar_t)));
      } else {
        RegDeleteValueW(key, kAppId);
      }
      RegCloseKey(key);
    }
    // Turned on here, so Task Manager's own switch mustn't still say off.
    if (RegOpenKeyExW(HKEY_CURRENT_USER, kApprovedKey, 0, KEY_WRITE, &key) == ERROR_SUCCESS) {
      if (on) {
        BYTE data[12] = {2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        RegSetValueExW(key, kAppId, 0, REG_BINARY, data, sizeof(data));
      } else {
        RegDeleteValueW(key, kAppId);
      }
      RegCloseKey(key);
    }
  }

  flutter::PluginRegistrarWindows* registrar_;
  std::unique_ptr<flutter::MethodChannel<EncodableValue>> channel_;
  // Our place in the window's message listeners, to stop listening when the engine goes.
  int proc_id_ = 0;
  // The "taskbar button created" message's number, which Windows hands out at run time.
  UINT taskbar_created_ = 0;
  // Whether the thumbnail buttons have been added to this window yet (then they're updated).
  bool buttons_added_ = false;
  // The thumbnail buttons as the Dart side last sent them, kept to add again when needed.
  std::vector<EncodableMap> buttons_;
  // The ◀, ▶ and refresh icons, made once.
  std::vector<HICON> icons_;
  // Whether the Dart side is listening for events yet (it says "ready" when it starts).
  bool dart_listening_ = false;
  // "open" events (each {args: [...]}) that came before the Dart side was listening.
  std::vector<EncodableValue> waiting_;
};

}  // namespace

// Called by Flutter's generated plugin list once per engine as it starts.
void SgbusDesktopPluginCApiRegisterWithRegistrar(FlutterDesktopPluginRegistrarRef registrar) {
  auto windows_registrar = flutter::PluginRegistrarManager::GetInstance()->GetRegistrar<flutter::PluginRegistrarWindows>(registrar);
  windows_registrar->AddPlugin(std::make_unique<SgbusDesktopPlugin>(windows_registrar));
}
