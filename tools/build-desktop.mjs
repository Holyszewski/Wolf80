// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Builds the Windows x64 desktop app: one EXE with the embedded single-file app and WebView2 loader
// (the same design as the maintainer's SFMT emulator).
//   node tools/build.mjs            (creates dist/Wolf80-offline.html)
//   node tools/build-desktop.mjs
// Needs the toolchain (llvm-mingw + WebView2 SDK) outside the repository; its folder comes from the
// environment variable WOLF80_TOOLCHAIN or from the gitignored desktop/toolchain.local.json
// ({"toolchain": "C:/path/to/toolchain"}). See docs/desktop.md.
// Output: dist/desktop/Wolf80.exe + README, licence texts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creditsText } from './credits.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);
// WebView2Loader.dll from Microsoft.Web.WebView2 1.0.4258.31 (nupkg verified against nuget.org)
const LOADER_SHA256 = '3426dcc55fdfb8b5e7ac623cf33b4ccf283fbf68a0c5a65bddfdb4d749a8abee';

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stop = text => { console.error(text); process.exit(1); };
const need = (file, hint) => { if (!fs.existsSync(file)) stop(`missing ${file}: ${hint}`); };

function toolchainDir() {
  if (process.env.WOLF80_TOOLCHAIN) return path.resolve(process.env.WOLF80_TOOLCHAIN);
  const local = rel('desktop', 'toolchain.local.json');
  if (fs.existsSync(local)) return path.resolve(root, JSON.parse(fs.readFileSync(local, 'utf8').replace(/^﻿/, '')).toolchain);
  stop('toolchain not configured: set WOLF80_TOOLCHAIN or create desktop/toolchain.local.json, see docs/desktop.md');
}
const TOOLCHAIN = toolchainDir();
const llvmName = fs.existsSync(TOOLCHAIN) && fs.readdirSync(TOOLCHAIN).find(n => /^llvm-mingw-.*-ucrt-x86_64$/.test(n));
if (!llvmName) stop(`no llvm-mingw-*-ucrt-x86_64 folder in ${TOOLCHAIN}`);
const LLVM = path.join(TOOLCHAIN, llvmName);
const SDK = path.join(TOOLCHAIN, 'webview2');
const LOADER = path.join(SDK, 'build', 'native', 'x64', 'WebView2Loader.dll');

need(rel('dist', 'Wolf80-offline.html'), 'run node tools/build.mjs first');
need(path.join(LLVM, 'bin', 'x86_64-w64-mingw32-clang++.exe'), 'unpack llvm-mingw into the toolchain folder');
need(LOADER, 'unpack the Microsoft.Web.WebView2 package into <toolchain>/webview2');
if (sha256(LOADER) !== LOADER_SHA256) stop('WebView2Loader.dll has an unexpected SHA-256');

// version from the web build (git describe), e.g. 0.0.0+12-g1a2b3c4-dirty -> 0,0,0,12
const ver = fs.readFileSync(rel('dist', 'version.txt'), 'utf8').trim();
const m = /^(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?/.exec(ver) || [];
const num = [m[1], m[2], m[3], m[4]].map(v => Math.min(65535, Number(v) || 0)).join(',');

const work = rel('desktop', 'build');
const out = rel('dist', 'desktop');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// resources: copied next to the .rc so the script holds plain file names only
fs.copyFileSync(rel('dist', 'Wolf80-offline.html'), path.join(work, 'index.html'));
fs.copyFileSync(LOADER, path.join(work, 'WebView2Loader.dll'));
fs.copyFileSync(rel('desktop', 'wolf80.manifest'), path.join(work, 'wolf80.manifest'));
// icon chosen by the maintainer on 2026-10-19 (tools/make-icon.mjs)
fs.copyFileSync(rel('assets', 'icon', 'wolf80.ico'), path.join(work, 'wolf80.ico'));
const rc = `#pragma code_page(65001)
#include "resource.h"
1 24 "wolf80.manifest"
IDI_APP ICON "wolf80.ico"
IDR_HTML RCDATA "index.html"
IDR_LOADER RCDATA "WebView2Loader.dll"
1 VERSIONINFO
FILEVERSION ${num}
PRODUCTVERSION ${num}
FILEOS 0x40004
FILETYPE 1
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904B0"
    BEGIN
      VALUE "FileDescription", "Wolf80 - emulator of Czechoslovak single-board computers"
      VALUE "ProductName", "Wolf80"
      VALUE "FileVersion", "${ver}"
      VALUE "ProductVersion", "${ver}"
      VALUE "LegalCopyright", "Copyright (C) 2026 Matěj ""Wolf"" Holyszewski; GPL-3.0-or-later"
      VALUE "OriginalFilename", "Wolf80.exe"
      VALUE "Comments", "Development build, not published. Contains monitors and programs by other authors (CREDITS.txt) and WebView2Loader.dll (Microsoft, BSD)."
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x0409, 1200
  END
END
`;
fs.writeFileSync(path.join(work, 'wolf80.rc'), rc);

const bin = name => path.join(LLVM, 'bin', name);
const run = (exe, args) => execFileSync(exe, args, { cwd: work, stdio: 'inherit' });
run(bin('x86_64-w64-mingw32-windres.exe'), ['-c', '65001', '-I', rel('desktop'), 'wolf80.rc', '-O', 'coff', '-o', 'wolf80_res.o']);
const exe = path.join(out, 'Wolf80.exe');
run(bin('x86_64-w64-mingw32-clang++.exe'), [
  '-std=c++17', '-O2', '-Wall', '-Wno-unknown-pragmas', '-municode', '-mwindows', '-static',
  '-D_WIN32_WINNT=0x0A00', '-DWINVER=0x0A00', // Windows 10+: per-monitor DPI functions
  '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections', '-s',
  '-I', rel('desktop'), '-I', path.join(SDK, 'build', 'native', 'include'),
  rel('desktop', 'wolf80_desktop.cpp'), 'wolf80_res.o', '-o', exe,
  '-lole32', '-lshlwapi', '-lshell32', '-lcomdlg32', '-lcrypt32', '-luuid',
]);

// documents next to the EXE: what it is and the licences of everything inside it
const text = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(out, 'README.txt'), text(rel('desktop', 'README-desktop.txt')));
fs.writeFileSync(path.join(out, 'LICENSE.txt'), text(rel('LICENSE')));
// who made the monitors and programs, for the user (roms/README.md and programs/README.md are for developers)
fs.writeFileSync(path.join(out, 'CREDITS.txt'),
  creditsText(text(rel('desktop', 'CREDITS-desktop.txt')), JSON.parse(text(rel('programs', 'catalog.json'))), ver));
const section = (title, file) => `${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n\n${text(file).trim()}\n\n`;
const mingw = path.join(LLVM, 'x86_64-w64-mingw32', 'share', 'mingw32');
fs.writeFileSync(path.join(out, 'THIRD-PARTY-NOTICES.txt'),
  'Third-party components in Wolf80.exe (the monitors and the programs by other authors: CREDITS.txt).\n\n' +
  section('WebView2Loader.dll (Microsoft.Web.WebView2 1.0.4258.31), embedded unchanged - LICENSE', path.join(SDK, 'LICENSE.txt')) +
  section('WebView2Loader.dll - NOTICE', path.join(SDK, 'NOTICE.txt')) +
  section(`mingw-w64 runtime libraries (statically linked, ${llvmName})`, path.join(mingw, 'COPYING.MinGW-w64-runtime.txt')) +
  section(`LLVM (libc++, libunwind, compiler-rt; statically linked parts, ${llvmName})`, path.join(LLVM, 'LICENSE.TXT')));

const size = fs.statSync(exe).size;
fs.writeFileSync(path.join(out, 'BUILD-SHA256.txt'), `${sha256(exe)}  Wolf80.exe\n`);
console.log(`built ${ver}: dist/desktop/Wolf80.exe (${(size / 1024).toFixed(0)} kB)`);
