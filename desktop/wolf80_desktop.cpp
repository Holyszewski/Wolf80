// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Desktop wrapper of the Wolf80 emulator (Windows x64), one EXE; the same design as the
// maintainer's SFMT emulator.
//
// The emulation runs entirely in JavaScript inside a WebView2 window. This program only
//  - creates the window and the WebView2 control,
//  - serves the embedded single-file app (resource IDR_HTML) at APP_ORIGIN from memory,
//  - shows the native "Save as" dialog for exports (web message "save"),
//  - can hide the WebView while minimised (kPauseWhenMinimised, off): the page then pauses emulation.
// The official WebView2Loader.dll is embedded as resource IDR_LOADER; at start it is written
// to a fresh folder in %TEMP% and removed again on exit.
// Its own messages (shown before the page can) are English, Czech when Windows runs in Czech or Slovak.
//
// Build: node tools/build-desktop.mjs (llvm-mingw + WebView2 SDK, see docs/desktop.md).

#define NOMINMAX
#include <windows.h>
#include <objbase.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shellapi.h>
#include <commdlg.h>
#include <wincrypt.h>
#include <algorithm>
#include <functional>
#include <string>
#include "WebView2.h"
#include "resource.h"

static const wchar_t APP_TITLE[] = L"Wolf80";
static const wchar_t APP_ORIGIN[] = L"https://wolf80.example/";
static const wchar_t TEMP_PREFIX[] = L"Wolf80-";
static const UINT WM_APP_SAVE = WM_APP + 1;
// Emulation keeps running while minimised, as in SFMT. Set to true to hide the WebView on
// minimise (the page then sees document.hidden); also needs PAUSE_WHEN_HIDDEN in src/ui/app.js,
// otherwise the page keeps emulating from a worker.
static const bool kPauseWhenMinimised = false;

static HWND g_hwnd;
static ICoreWebView2Environment* g_env;
static ICoreWebView2Controller* g_controller;
static ICoreWebView2* g_webview;
static std::wstring g_runtimeVersion;

// ---------- small helpers ----------

// English, or Czech when the Windows display language is Czech or Slovak.
static const wchar_t* tr(const wchar_t* en, const wchar_t* cs) {
  LANGID lang = PRIMARYLANGID(GetUserDefaultUILanguage());
  return lang == LANG_CZECH || lang == LANG_SLOVAK ? cs : en;
}

static void fail(const std::wstring& text) {
  MessageBoxW(g_hwnd, text.c_str(), APP_TITLE, MB_ICONERROR | MB_OK);
}

static bool resourceBytes(int id, const void** data, DWORD* size) {
  HRSRC r = FindResourceW(nullptr, MAKEINTRESOURCEW(id), MAKEINTRESOURCEW(10)); // RT_RCDATA
  HGLOBAL g = r ? LoadResource(nullptr, r) : nullptr;
  if (!g) return false;
  *data = LockResource(g);
  *size = SizeofResource(nullptr, r);
  return *data && *size;
}

static bool writeFileBytes(const std::wstring& path, const void* data, DWORD size) {
  HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  DWORD written = 0;
  BOOL ok = WriteFile(h, data, size, &written, nullptr) && written == size;
  return CloseHandle(h) && ok;
}

static std::string toUtf8(const std::wstring& s) {
  if (s.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0, nullptr, nullptr);
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), out.data(), n, nullptr, nullptr);
  return out;
}

static std::wstring hexCode(HRESULT hr) {
  wchar_t buf[16];
  wsprintfW(buf, L"%08X", (unsigned)hr);
  return buf;
}

static std::wstring tempDir() {
  wchar_t buf[MAX_PATH + 1];
  DWORD n = GetTempPathW(MAX_PATH + 1, buf);
  return std::wstring(buf, n);
}

// Removes loader folders left behind by a crashed earlier run (folders in use stay).
static void removeStaleTempFolders() {
  std::wstring base = tempDir();
  WIN32_FIND_DATAW fd;
  HANDLE f = FindFirstFileW((base + TEMP_PREFIX + L"*").c_str(), &fd);
  if (f == INVALID_HANDLE_VALUE) return;
  do {
    if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
    std::wstring dir = base + fd.cFileName;
    DeleteFileW((dir + L"\\WebView2Loader.dll").c_str());
    RemoveDirectoryW(dir.c_str());
  } while (FindNextFileW(f, &fd));
  FindClose(f);
}

static void openExternally(const std::wstring& uri) {
  if (uri.rfind(L"https://", 0) == 0 || uri.rfind(L"http://", 0) == 0)
    ShellExecuteW(nullptr, L"open", uri.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}

// ---------- COM callback object from a lambda ----------
// WebView2 handler interfaces have a single Invoke method; this implements IUnknown around it.

template <class I, class M> class Handler;
template <class I, class... A> class Handler<I, HRESULT (STDMETHODCALLTYPE I::*)(A...)> : public I {
 public:
  Handler(REFIID iid, std::function<HRESULT(A...)> fn) : iid_(iid), fn_(std::move(fn)) {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, iid_)) { *ppv = this; AddRef(); return S_OK; }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&ref_); }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG r = InterlockedDecrement(&ref_);
    if (!r) delete this;
    return r;
  }
  HRESULT STDMETHODCALLTYPE Invoke(A... args) override { return fn_(args...); }

 private:
  virtual ~Handler() = default;
  LONG ref_ = 1;
  IID iid_;
  std::function<HRESULT(A...)> fn_;
};

// Usage: auto* h = callback<ICoreWebView2XxxHandler>(IID_ICoreWebView2XxxHandler, lambda); ... h->Release();
template <class I, class F> I* callback(REFIID iid, F fn) {
  return new Handler<I, decltype(&I::Invoke)>(iid, fn);
}

// ---------- save dialog (web message "save") ----------
// Message from the page: "save\n<id>\n<1 text|0 base64>\n<file name>\n<payload>".
// Reply: "saved\n<id>\nok\n<path>", "saved\n<id>\ncancel" or "saved\n<id>\nerror\n<dialog N|write>".

struct SaveRequest {
  std::wstring id, name, payload;
  bool isText = true;
};

static void reply(const std::wstring& text) {
  if (g_webview) g_webview->PostWebMessageAsString(text.c_str());
}

static void runSave(SaveRequest* rq) {
  std::wstring ext = PathFindExtensionW(rq->name.c_str());
  std::wstring defExt = ext.empty() ? L"" : ext.substr(1);
  std::wstring filter;
  if (!ext.empty()) {
    std::wstring upper = defExt;
    CharUpperW(upper.data());
    filter += upper + L" (*" + ext + L")" + L'\0' + L"*" + ext + L'\0';
  }
  filter += std::wstring(tr(L"All files (*.*)", L"Všechny soubory (*.*)")) + L'\0' + L"*.*" + L'\0' + L'\0';

  wchar_t file[MAX_PATH * 4] = {};
  lstrcpynW(file, rq->name.c_str(), MAX_PATH);
  OPENFILENAMEW ofn = {};
  ofn.lStructSize = sizeof ofn;
  ofn.hwndOwner = g_hwnd;
  ofn.lpstrFilter = filter.c_str();
  ofn.lpstrFile = file;
  ofn.nMaxFile = sizeof file / sizeof file[0];
  ofn.lpstrDefExt = defExt.empty() ? nullptr : defExt.c_str();
  ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_EXPLORER;
  if (!GetSaveFileNameW(&ofn)) {
    DWORD err = CommDlgExtendedError();
    reply(L"saved\n" + rq->id + (err ? L"\nerror\ndialog " + std::to_wstring(err) : L"\ncancel"));
    return;
  }

  bool ok;
  if (rq->isText) {
    std::string utf8 = toUtf8(rq->payload);
    ok = writeFileBytes(file, utf8.data(), (DWORD)utf8.size());
  } else {
    DWORD n = 0;
    ok = CryptStringToBinaryW(rq->payload.c_str(), 0, CRYPT_STRING_BASE64, nullptr, &n, nullptr, nullptr);
    std::string bytes(n, '\0');
    ok = ok && CryptStringToBinaryW(rq->payload.c_str(), 0, CRYPT_STRING_BASE64, (BYTE*)bytes.data(), &n, nullptr, nullptr);
    ok = ok && writeFileBytes(file, bytes.data(), n);
  }
  reply(L"saved\n" + rq->id + (ok ? L"\nok\n" + std::wstring(file) : L"\nerror\nwrite"));
}

static void onWebMessage(const std::wstring& msg) {
  // split the first four lines; the payload may contain line breaks
  size_t p[4], pos = 0;
  for (int i = 0; i < 4; i++) {
    p[i] = msg.find(L'\n', pos);
    if (p[i] == std::wstring::npos) return;
    pos = p[i] + 1;
  }
  if (msg.compare(0, p[0], L"save") != 0) return;
  auto* rq = new SaveRequest;
  rq->id = msg.substr(p[0] + 1, p[1] - p[0] - 1);
  rq->isText = msg.compare(p[1] + 1, p[2] - p[1] - 1, L"1") == 0;
  rq->name = msg.substr(p[2] + 1, p[3] - p[2] - 1);
  rq->payload = msg.substr(p[3] + 1);
  // the modal dialog must not run inside the WebView2 event handler
  if (!PostMessageW(g_hwnd, WM_APP_SAVE, 0, (LPARAM)rq)) delete rq;
}

// ---------- WebView2 setup ----------

static void resizeWebView() {
  if (!g_controller) return;
  RECT rc;
  GetClientRect(g_hwnd, &rc);
  g_controller->put_Bounds(rc);
}

static HRESULT onController(HRESULT result, ICoreWebView2Controller* controller) {
  if (FAILED(result) || !controller) {
    fail(std::wstring(tr(L"WebView2 could not be started (error 0x", L"WebView2 se nepodařilo spustit (chyba 0x")) + hexCode(result) + L").");
    DestroyWindow(g_hwnd);
    return S_OK;
  }
  g_controller = controller;
  g_controller->AddRef();
  g_controller->get_CoreWebView2(&g_webview);

  ICoreWebView2Controller2* c2 = nullptr;
  if (SUCCEEDED(g_controller->QueryInterface(IID_ICoreWebView2Controller2, (void**)&c2))) {
    c2->put_DefaultBackgroundColor(COREWEBVIEW2_COLOR{255, 0x15, 0x17, 0x1a}); // --page in style.css
    c2->Release();
  }

  ICoreWebView2Settings* settings = nullptr;
  if (SUCCEEDED(g_webview->get_Settings(&settings))) {
    settings->put_AreDevToolsEnabled(FALSE);
    settings->put_AreDefaultContextMenusEnabled(FALSE);
    settings->put_IsStatusBarEnabled(FALSE);
    settings->put_IsZoomControlEnabled(FALSE); // the page scales itself to the window
    ICoreWebView2Settings3* s3 = nullptr;
    if (SUCCEEDED(settings->QueryInterface(IID_ICoreWebView2Settings3, (void**)&s3))) {
      s3->put_AreBrowserAcceleratorKeysEnabled(FALSE); // no F5 reload, Ctrl+P, Ctrl+F ...
      s3->Release();
    }
    settings->Release();
  }

  // host description for the page; the memory export uses the native dialog when present
  std::wstring hostScript = L"window.wolf80Host = Object.freeze({ wrapper: 'Wolf80 C++ / WebView2', webview2: '" +
                            g_runtimeVersion + L"' });";
  g_webview->AddScriptToExecuteOnDocumentCreated(hostScript.c_str(), nullptr);

  EventRegistrationToken token;

  // the app itself: one embedded HTML file served from memory
  g_webview->AddWebResourceRequestedFilter((std::wstring(APP_ORIGIN) + L"*").c_str(), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
  auto* onResource = callback<ICoreWebView2WebResourceRequestedEventHandler>(
      IID_ICoreWebView2WebResourceRequestedEventHandler,
      [](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
        ICoreWebView2WebResourceRequest* req = nullptr;
        LPWSTR uri = nullptr;
        args->get_Request(&req);
        if (req) req->get_Uri(&uri);
        std::wstring u = uri ? uri : L"";
        CoTaskMemFree(uri);
        if (req) req->Release();
        std::wstring path = u.substr(wcslen(APP_ORIGIN) - 1);
        size_t q = path.find_first_of(L"?#");
        if (q != std::wstring::npos) path.resize(q);

        const void* data = nullptr;
        DWORD size = 0;
        IStream* stream = nullptr;
        ICoreWebView2WebResourceResponse* resp = nullptr;
        if ((path == L"/" || path == L"/index.html") && resourceBytes(IDR_HTML, &data, &size)) {
          stream = SHCreateMemStream((const BYTE*)data, size);
          g_env->CreateWebResourceResponse(stream, 200, L"OK",
                                           L"Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store", &resp);
        } else {
          g_env->CreateWebResourceResponse(nullptr, 404, L"Not Found", L"", &resp);
        }
        if (resp) { args->put_Response(resp); resp->Release(); }
        if (stream) stream->Release();
        return S_OK;
      });
  g_webview->add_WebResourceRequested(onResource, &token);
  onResource->Release();

  // links leave the app: open them in the default browser instead
  auto* onNavigation = callback<ICoreWebView2NavigationStartingEventHandler>(
      IID_ICoreWebView2NavigationStartingEventHandler,
      [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
        LPWSTR uri = nullptr;
        args->get_Uri(&uri);
        std::wstring u = uri ? uri : L"";
        CoTaskMemFree(uri);
        if (u.rfind(APP_ORIGIN, 0) != 0) {
          args->put_Cancel(TRUE);
          openExternally(u);
        }
        return S_OK;
      });
  g_webview->add_NavigationStarting(onNavigation, &token);
  onNavigation->Release();

  auto* onNewWindow = callback<ICoreWebView2NewWindowRequestedEventHandler>(
      IID_ICoreWebView2NewWindowRequestedEventHandler,
      [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
        LPWSTR uri = nullptr;
        args->get_Uri(&uri);
        args->put_Handled(TRUE);
        if (uri) openExternally(uri);
        CoTaskMemFree(uri);
        return S_OK;
      });
  g_webview->add_NewWindowRequested(onNewWindow, &token);
  onNewWindow->Release();

  auto* onMessage = callback<ICoreWebView2WebMessageReceivedEventHandler>(
      IID_ICoreWebView2WebMessageReceivedEventHandler,
      [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
        LPWSTR source = nullptr, text = nullptr;
        args->get_Source(&source);
        bool fromApp = source && std::wstring(source).rfind(APP_ORIGIN, 0) == 0;
        CoTaskMemFree(source);
        if (fromApp && SUCCEEDED(args->TryGetWebMessageAsString(&text)) && text) onWebMessage(text);
        CoTaskMemFree(text);
        return S_OK;
      });
  g_webview->add_WebMessageReceived(onMessage, &token);
  onMessage->Release();

  auto* onFailed = callback<ICoreWebView2ProcessFailedEventHandler>(
      IID_ICoreWebView2ProcessFailedEventHandler,
      [](ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs* args) -> HRESULT {
        COREWEBVIEW2_PROCESS_FAILED_KIND kind;
        args->get_ProcessFailedKind(&kind);
        if (kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED) {
          fail(tr(L"The WebView2 process ended unexpectedly. The application will close.",
                 L"Proces WebView2 neočekávaně skončil. Aplikace se zavře."));
          DestroyWindow(g_hwnd);
        } else if (kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED ||
                   kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE) {
          fail(tr(L"The emulator page stopped responding and will be reloaded.",
                 L"Stránka emulátoru přestala odpovídat a načte se znovu."));
          if (g_webview) g_webview->Reload();
        }
        return S_OK;
      });
  g_webview->add_ProcessFailed(onFailed, &token);
  onFailed->Release();

  resizeWebView();
  g_controller->put_IsVisible(!(kPauseWhenMinimised && IsIconic(g_hwnd)));
  g_webview->Navigate(APP_ORIGIN);
  g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
  return S_OK;
}

static HRESULT onEnvironment(HRESULT result, ICoreWebView2Environment* env) {
  if (FAILED(result) || !env) {
    fail(std::wstring(tr(L"The WebView2 environment could not be created (error 0x", L"Prostředí WebView2 se nepodařilo vytvořit (chyba 0x")) + hexCode(result) + L").");
    DestroyWindow(g_hwnd);
    return S_OK;
  }
  g_env = env;
  g_env->AddRef();
  auto* h = callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
      IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler, onController);
  HRESULT hr = g_env->CreateCoreWebView2Controller(g_hwnd, h);
  h->Release();
  if (FAILED(hr)) onController(hr, nullptr);
  return S_OK;
}

// ---------- window ----------

static LRESULT CALLBACK wndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_SIZE:
      if (g_controller) {
        // optional (kPauseWhenMinimised): hide the WebView so the page sees document.hidden
        g_controller->put_IsVisible(!(kPauseWhenMinimised && wp == SIZE_MINIMIZED));
        if (wp != SIZE_MINIMIZED) resizeWebView();
      }
      return 0;
    case WM_MOVE:
      if (g_controller) g_controller->NotifyParentWindowPositionChanged();
      return 0;
    case WM_SETFOCUS:
      if (g_controller) g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
      return 0;
    case WM_GETMINMAXINFO: {
      UINT dpi = GetDpiForWindow(hwnd);
      auto* mm = (MINMAXINFO*)lp;
      mm->ptMinTrackSize.x = MulDiv(800, dpi, 96);
      mm->ptMinTrackSize.y = MulDiv(560, dpi, 96);
      return 0;
    }
    case WM_DPICHANGED: {
      const RECT* r = (const RECT*)lp;
      SetWindowPos(hwnd, nullptr, r->left, r->top, r->right - r->left, r->bottom - r->top, SWP_NOZORDER | SWP_NOACTIVATE);
      return 0;
    }
    case WM_APP_SAVE: {
      auto* rq = (SaveRequest*)lp;
      runSave(rq);
      delete rq;
      return 0;
    }
    case WM_DESTROY:
      if (g_controller) g_controller->Close();
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR, int show) {
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

  // 1. official WebView2 loader, unpacked to a fresh temporary folder
  removeStaleTempFolders();
  const void* loaderData = nullptr;
  DWORD loaderSize = 0;
  GUID guid;
  wchar_t guidText[40];
  CoCreateGuid(&guid);
  StringFromGUID2(guid, guidText, 40);
  std::wstring folder = tempDir() + TEMP_PREFIX + std::wstring(guidText + 1, 36);
  std::wstring dll = folder + L"\\WebView2Loader.dll";
  if (!resourceBytes(IDR_LOADER, &loaderData, &loaderSize) || !CreateDirectoryW(folder.c_str(), nullptr) ||
      !writeFileBytes(dll, loaderData, loaderSize)) {
    fail(std::wstring(tr(L"Cannot prepare the WebView2 loader in the temporary folder:\n",
                         L"Nelze připravit WebView2 loader v dočasné složce:\n")) + folder);
    return 1;
  }
  HMODULE loader = LoadLibraryExW(dll.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
  auto cleanup = [&] {
    if (loader) FreeLibrary(loader);
    DeleteFileW(dll.c_str());
    RemoveDirectoryW(folder.c_str());
  };
  auto createEnv = loader ? (decltype(&CreateCoreWebView2EnvironmentWithOptions))GetProcAddress(loader, "CreateCoreWebView2EnvironmentWithOptions") : nullptr;
  auto runtimeVersion = loader ? (decltype(&GetAvailableCoreWebView2BrowserVersionString))GetProcAddress(loader, "GetAvailableCoreWebView2BrowserVersionString") : nullptr;
  if (!createEnv || !runtimeVersion) {
    fail(tr(L"The WebView2 loader could not be loaded.", L"WebView2 loader se nepodařilo načíst."));
    cleanup();
    return 1;
  }

  // 2. WebView2 Runtime must be installed (part of Windows 11)
  LPWSTR version = nullptr;
  if (FAILED(runtimeVersion(nullptr, &version)) || !version) {
    fail(tr(L"Microsoft Edge WebView2 Runtime, which the application needs for its window, is missing.\n\n"
            L"It is part of Windows 11. Install the \"Evergreen WebView2 Runtime\" from Microsoft "
            L"(developer.microsoft.com/microsoft-edge/webview2) and start the application again.",
            L"Chybí Microsoft Edge WebView2 Runtime, který aplikace potřebuje k zobrazení.\n\n"
            L"Ve Windows 11 bývá součástí systému. Nainstalujte „Evergreen WebView2 Runtime“ "
            L"z webu Microsoftu (developer.microsoft.com/microsoft-edge/webview2) a aplikaci spusťte znovu."));
    cleanup();
    return 1;
  }
  g_runtimeVersion = version;
  CoTaskMemFree(version);

  // 3. window
  WNDCLASSEXW wc = {sizeof wc};
  wc.lpfnWndProc = wndProc;
  wc.hInstance = inst;
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  wc.hIcon = LoadIconW(inst, MAKEINTRESOURCEW(IDI_APP));
  wc.hIconSm = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
                                 GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR);
  wc.hbrBackground = CreateSolidBrush(RGB(0x15, 0x17, 0x1a));
  wc.lpszClassName = L"Wolf80Window";
  RegisterClassExW(&wc);
  UINT dpi = GetDpiForSystem();
  RECT work;
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
  int w = std::min(MulDiv(1366, dpi, 96), (int)(work.right - work.left));
  int h = std::min(MulDiv(768, dpi, 96), (int)(work.bottom - work.top));
  g_hwnd = CreateWindowExW(0, wc.lpszClassName, APP_TITLE, WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, w, h,
                           nullptr, nullptr, inst, nullptr);
  if (!g_hwnd) {
    fail(tr(L"The window could not be created.", L"Okno se nepodařilo vytvořit."));
    cleanup();
    return 1;
  }
  ShowWindow(g_hwnd, show);
  UpdateWindow(g_hwnd);

  // 4. WebView2 with its own profile folder (keeps the page's language and sound choices)
  PWSTR local = nullptr;
  std::wstring userData;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &local))) userData = std::wstring(local) + L"\\Wolf80\\WebView2";
  CoTaskMemFree(local);
  // no elastic overscroll: otherwise a touchpad or tilt-wheel scroll pulls the whole page out of
  // the window and lets it spring back. The loader reads this variable; arguments already set by
  // the caller (e.g. a remote debugging port) are kept after ours.
  std::wstring args = L"--disable-features=ElasticOverscroll";
  wchar_t existing[2048];
  DWORD n = GetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", existing, 2048);
  if (n && n < 2048) args += L" " + std::wstring(existing, n);
  SetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args.c_str());

  auto* envHandler = callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
      IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler, onEnvironment);
  HRESULT hr = createEnv(nullptr, userData.empty() ? nullptr : userData.c_str(), nullptr, envHandler);
  envHandler->Release();
  if (FAILED(hr)) onEnvironment(hr, nullptr);

  MSG m;
  while (GetMessageW(&m, nullptr, 0, 0) > 0) {
    TranslateMessage(&m);
    DispatchMessageW(&m);
  }

  if (g_webview) g_webview->Release();
  if (g_controller) g_controller->Release();
  if (g_env) g_env->Release();
  g_webview = nullptr;
  g_controller = nullptr;
  g_env = nullptr;
  cleanup();
  CoUninitialize();
  return (int)m.wParam;
}
