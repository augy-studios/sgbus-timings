// SG Bus Timings for Windows. One copy at a time: a second one (a shortcut, signing in, a uwu://
// link, a Jump List task) hands its command line to the first with WM_COPYDATA, which the
// sgbus_desktop plugin passes to Dart, and goes. The window starts hidden; Dart shows it once
// it's ready (lib/desktop/desktop.dart).
#include <flutter/dart_project.h>
#include <flutter/flutter_view_controller.h>
#include <shobjidl.h>
#include <windows.h>

#include "flutter_window.h"
#include "utils.h"

namespace {

const wchar_t kAppId[] = L"org.uwuapps.sgbus";
const wchar_t kTitle[] = L"SG Bus Timings";
const wchar_t kMutex[] = L"Local\\org.uwuapps.sgbus.single";
const ULONG_PTR kForwardTag = 0x53474255;  // "SGBU", as the plugin expects

// The first copy's main window: the runner's window class with the app's title.
HWND FindFirst() {
  return ::FindWindowW(L"FLUTTER_RUNNER_WIN32_WINDOW", kTitle);
}

bool HandOver() {
  HWND first = nullptr;
  // The first copy may still be making its window.
  for (int i = 0; i < 50 && !first; i++) {
    first = FindFirst();
    if (!first) ::Sleep(100);
  }
  if (!first) return false;
  DWORD pid = 0;
  ::GetWindowThreadProcessId(first, &pid);
  ::AllowSetForegroundWindow(pid);
  const wchar_t* line = ::GetCommandLineW();
  COPYDATASTRUCT data = {};
  data.dwData = kForwardTag;
  data.cbData = static_cast<DWORD>((wcslen(line) + 1) * sizeof(wchar_t));
  data.lpData = const_cast<wchar_t*>(line);
  DWORD_PTR answer = 0;
  ::SendMessageTimeoutW(first, WM_COPYDATA, 0, reinterpret_cast<LPARAM>(&data), SMTO_ABORTIFHUNG, 5000, &answer);
  return true;
}

}  // namespace

int APIENTRY wWinMain(_In_ HINSTANCE instance, _In_opt_ HINSTANCE prev,
                      _In_ wchar_t *command_line, _In_ int show_command) {
  HANDLE single = ::CreateMutexW(nullptr, TRUE, kMutex);
  if (single && ::GetLastError() == ERROR_ALREADY_EXISTS) {
    if (HandOver()) return EXIT_SUCCESS;
  }

  // Attach to console when present (e.g., 'flutter run') or create a
  // new console when running with a debugger.
  if (!::AttachConsole(ATTACH_PARENT_PROCESS) && ::IsDebuggerPresent()) {
    CreateAndAttachConsole();
  }

  // The same identity the Electron app had: notifications, the taskbar's group, pins and the
  // Jump List hang on it.
  ::SetCurrentProcessExplicitAppUserModelID(kAppId);

  // Initialize COM, so that it is available for use in the library and/or
  // plugins.
  ::CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

  flutter::DartProject project(L"data");

  std::vector<std::string> command_line_arguments =
      GetCommandLineArguments();

  project.set_dart_entrypoint_arguments(std::move(command_line_arguments));

  FlutterWindow window(project);
  Win32Window::Point origin(10, 10);
  Win32Window::Size size(480, 880);
  if (!window.Create(kTitle, origin, size)) {
    return EXIT_FAILURE;
  }
  window.SetQuitOnClose(true);

  ::MSG msg;
  while (::GetMessage(&msg, nullptr, 0, 0)) {
    ::TranslateMessage(&msg);
    ::DispatchMessage(&msg);
  }

  ::CoUninitialize();
  if (single) ::CloseHandle(single);
  return EXIT_SUCCESS;
}
