Wolf80 - emulator of Czechoslovak single-board computers (PMI-80, Savia-84, Stone 1),
desktop version for Windows x64

Web version: https://holyszewski.github.io/Wolf80/
Source code and releases: https://github.com/Holyszewski/Wolf80

Start: Wolf80.exe. It is a single file; nothing is installed.

Requirement: Microsoft Edge WebView2 Runtime (part of Windows 11). If it is missing,
the application says so and quits; install the Evergreen WebView2 Runtime from
Microsoft and start it again.

The emulation runs in JavaScript inside the window, exactly as in the offline HTML.
A small C++ wrapper creates the window, offers the "Save as" dialog for memory exports
and keeps the emulation running while the window is minimised. The page is stored
inside the EXE; no network is used.

While running: %TEMP%\Wolf80-<GUID>\ holds WebView2Loader.dll (Microsoft), which the
EXE carries inside; it is deleted on exit. The page's settings (language, sound,
board, monitor) are kept in %LOCALAPPDATA%\Wolf80\WebView2.

Licence of the emulator: GPL-3.0-or-later, see LICENSE.txt.
The monitors (ROM images) and the programs by other authors inside the EXE are not
the work of this project and are not covered by its licence; who made them: CREDITS.txt.
Third-party components of the EXE: THIRD-PARTY-NOTICES.txt.
