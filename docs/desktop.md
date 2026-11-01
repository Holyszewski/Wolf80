# Desktop EXE

The desktop version is one Windows x64 EXE, `dist/desktop/Wolf80.exe` (about 590 kB), built the same way as the maintainer's SFMT emulator: a small C++ wrapper around WebView2 (`desktop/wolf80_desktop.cpp`) that carries the single-file app `dist/Wolf80-offline.html` and Microsoft's `WebView2Loader.dll` as resources. Nothing is installed; the WebView2 Runtime (part of Windows 11) is the only requirement.

## Building

```bash
node tools/build.mjs           # dist/Wolf80-offline.html and dist/version.txt
node tools/build-desktop.mjs   # dist/desktop/Wolf80.exe + README.txt, LICENSE.txt, CREDITS.txt, THIRD-PARTY-NOTICES.txt, BUILD-SHA256.txt
```

The toolchain lives outside the repository (about 1 GB, only for building). Its folder is taken from the environment variable `WOLF80_TOOLCHAIN`, or from the gitignored `desktop/toolchain.local.json`:

```json
{ "toolchain": "C:/path/to/toolchain" }
```

The folder must contain:

| Folder | Source | Check |
|---|---|---|
| `llvm-mingw-<date>-ucrt-x86_64/` | https://github.com/mstorsjo/llvm-mingw/releases (built with 20261006) | the release's SHA-256 digest |
| `webview2/` (the unpacked `microsoft.web.webview2.1.0.4258.31.nupkg`, a ZIP) | https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31 | `build/native/x64/WebView2Loader.dll` must have SHA-256 `3426dcc55fdfb8b5e7ac623cf33b4ccf283fbf68a0c5a65bddfdb4d749a8abee`; `tools/build-desktop.mjs` checks it |

The same toolchain folder serves the SFMT emulator. The build writes its intermediate files to `desktop/build/` (gitignored).

The EXE's version resource comes from `git describe`, like the web build: `0.0.0+15-g8ce6956-dirty` gives the file version 0.0.0.15 and the version string itself.

## What the wrapper does

- Creates the window (1366 × 768 at 96 DPI, at most the work area; minimum 800 × 560; per-monitor DPI aware) with the icon `assets/icon/wolf80.ico`.
- Writes the embedded `WebView2Loader.dll` to a fresh `%TEMP%\Wolf80-<GUID>\` and deletes it on exit; folders left by a crashed run are removed at the next start.
- Serves the app from memory at `https://wolf80.example/` (no network). Links to other addresses open in the default browser.
- Keeps the page's settings (language, sound) in `%LOCALAPPDATA%\Wolf80\WebView2`.
- Defines `window.wolf80Host` (`wrapper`, `webview2` version). When it is present, the memory export in `src/ui/app.js` sends the web message `save\n<id>\n<1 text|0 base64>\n<file name>\n<payload>` instead of a browser download; the wrapper shows the native "Save as" dialog and replies `saved\n<id>\nok\n<path>`, `saved\n<id>\ncancel` or `saved\n<id>\nerror\n<dialog N|write>`. The page shows the result under the export buttons.
- Keeps the emulation running while minimised (`kPauseWhenMinimised = false`, as in SFMT).
- Turns off the developer tools, the default context menu, the zoom and the browser shortcut keys (F5, Ctrl+P …), and the elastic overscroll (`--disable-features=ElasticOverscroll`, prepended to `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`).
- Its own messages (shown before the page can show anything, e.g. a missing WebView2 Runtime) are English, Czech when the Windows display language is Czech or Slovak.

## Checked (2026-10-19, Windows 11, WebView2 155.0.4283.62)

Started with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` and inspected over the DevTools protocol:

- the page loads from `https://wolf80.example/`, the ticker worker runs, the monitor shows "PMI-80";
- the content is 1350 × 729 px in the default window, with no horizontal scroll bar;
- `window.wolf80Host` reports the C++ wrapper and the WebView2 version;
- Intel HEX and BIN export of 0000–000F through the real "Save as" dialog (filled through Win32: the Edit inside the ComboBox, then BM_CLICK on Save, as in SFMT's check): the files hold the first 16 bytes of the monitor (`3E 8A D3 FB …`), the page says "Saved: <path>";
- the icon read from the EXE (`System.Drawing.Icon.ExtractAssociatedIcon`) and the version resource;
- after closing the window the process ends and no `%TEMP%\Wolf80-*` folder is left.

Not checked yet: a PC without the WebView2 Runtime, a high-DPI monitor, sound in the EXE (needs a person listening).

## Notes

- After replacing the EXE at the same path, Explorer may show the old icon from its cache (rename the file, or `ie4uinit.exe -show`).
- An unsigned new EXE may wait for Defender's cloud check on another PC (up to about 10 s).
