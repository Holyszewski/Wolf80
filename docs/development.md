# Development guide

How the source is laid out, how to build and test it, and the conventions the code follows. How to send a contribution is in [CONTRIBUTING.md](../CONTRIBUTING.md).

## The source

Wolf80 emulates two Czechoslovak educational single-board computers, the **PMI-80** (Intel 8080 compatible MHB8080A, 1982) and the **Savia-84** (Z80/U880), and the **Stone 1**, a modern cross of the two by Radek Veselý.

- **CPU cores:** `src/core/i8080.js` (mnemonics and disassembler in `i8080-disasm.js`) and `src/core/z80.js` (`z80-disasm.js`). They are two cores, not one extended core: the flags (P/V, H, N), the timing and the undocumented opcodes differ.
- **Boards:** `src/board/pmi80.js`, `savia84.js`, `stone1.js`, with the 8255 (`src/machine/i8255.js`) and the multiplexed display (`src/machine/display.js`); `src/board/profiles.js` describes them for the UI.
- **User interface:** `src/ui/`, with sound from the tape output (a virtual amplifier, `src/machine/audio-render.js`, `src/ui/audio.js`).
- **Assembler:** `src/asm/asm8080.js`, a two-pass 8080 assembler with Intel syntax, compatible enough with TASM to rebuild TENIS byte for byte.
- **Desktop EXE:** `desktop/wolf80_desktop.cpp`, a C++ wrapper around WebView2, built by `tools/build-desktop.mjs`; see [desktop.md](desktop.md).

How each board is modelled, with the certainty of every fact, is in [pmi80.md](pmi80.md), [savia84.md](savia84.md) and [stone1.md](stone1.md). Checks that need a physical machine are queued in [hardware-tests.md](hardware-tests.md); planned work is in [TODO.md](TODO.md).

### Layers

CPU core → machine (board, memory map, I/O, time) → debug API → UI. The UI never reaches into a core directly. The debug API (reading and writing memory and registers, the 8255 port state, stepping, breakpoints, watches, the disassembler) is a layer of its own, so that the memory, I/O and debugging panels, and later a development environment for the 8080 and Z80 (editor, assembler, assembling straight into the emulated memory), are built on it.

### Technology

- Plain ES modules, no third-party packages, Node.js 20 or newer.
- `tools/build.mjs` joins the modules into one IIFE and produces a static web site and a single-file offline HTML.
- The desktop version is one EXE, a C++ wrapper around WebView2 built with llvm-mingw. The toolchain lives outside the repository and its path is configurable; nothing else in the build depends on files outside the repository.

## Commands

```bash
node tools/build.mjs                       # dist/web + dist/Wolf80-offline.html (after every change in src/, programs/, roms/)
node tools/build.mjs --with-sources        # the same, with the demo programs' sources embedded (see "Demo programs")
node tools/serve.mjs 8780                  # serves dist/web on 127.0.0.1:8780
node tools/build-desktop.mjs               # dist/desktop/Wolf80.exe (needs the toolchain, see desktop.md)
node tools/make-listings.mjs               # Intel HEX and a byte list beside every demo program and every extras/ source (--check: only compare)
node tools/make-icon.mjs                   # EXE icon assets/icon/wolf80.ico (16–256 px) + preview docs/img/icon.png
npm test                                   # all unit tests (node --test "tests/*.test.mjs")
node --test tests/i8080.test.mjs           # one test file
node --test --test-name-pattern="DAA" tests/i8080.test.mjs   # one test
node tools/cpu-exercise.mjs third_party/cpu-tests/TST8080.COM        # a CP/M CPU test program
node tools/cpu-exercise.mjs --z80 third_party/cpu-tests/zexall.com   # the Z80 exerciser (ZEXDOC, ZEXALL)
```

The CP/M CPU test programs (TST8080, 8080PRE, CPUTEST, 8080EXM; ZEXDOC and ZEXALL for the Z80) are third-party files kept only locally in the gitignored `third_party/cpu-tests/`; where to get them is in `third_party/README.md`. 8080EXM takes about 70 s and ZEXDOC and ZEXALL about 160 s each, so they are worth running after a change to a CPU core, not after every change.

### The build

`tools/build.mjs` bundles the modules listed in its `MODULES` array (in dependency order) into one IIFE. Imports and exports are stripped, so top-level names must be unique across all modules; the build checks it. The ROMs and the demo programs are embedded as `globalThis.WOLF80_ASSETS`.

To check the UI, serve it with `tools/serve.mjs`. For a sharp full-size screenshot, headless Edge works: `msedge --headless=new --window-size=1920,970 --virtual-time-budget=1500 --screenshot=<png> http://127.0.0.1:8780/#ladeni` (the hash opens a work-area tab: `tahak`, `instrukce`, `ladeni`).

`site/` holds files served only beside the web version on GitHub Pages (the Search Console verification file, `sitemap.xml`). `.github/workflows/pages.yml` builds the latest release tag reachable from `main`, adds them and deploys, at each tag push or by hand.

## Demo programs

Demo programs are data, not code. `programs/catalog.json` lists them in display order: board and optionally the firmware they run on, file, format (`ihex`, `bin`, `asm`, `rom`), load and start address, author, and help in Czech and English. A name, an author and the help are a text or `{ cs, en }`. The origin and SHA-256 of each file go into `programs/README.md`; a test checks it.

- One folder per program, one file per board (`programs/bagels/bagels-savia.asm`).
- Beside every `.asm` and `.bin` there is an Intel HEX (`<name>.hex`) and a list of bytes to type in by hand (`<name>-bytes.txt`), made by `node tools/make-listings.mjs`, so a program can be entered into a real board without the emulator. Run it after changing a program; a test fails when a listing is out of date.
- The builds embed the assembled programs, not their sources: for an `asm` entry, `tools/build.mjs` (`tools/program-assets.mjs`) embeds the neighbouring `.hex` and fails if it does not match the source. `node tools/build.mjs --with-sources` adds each source, gzipped, as an optional `source` field. Why, and what the sources may be good for later, is in `programs/README.md` ("Sources in the builds").
- A program is started by typing the monitor's run command on the emulated keyboard (`pmi80RunKeys`: `= EX addr =`; `savia84RunKeys`: `Ex addr dA`), so the monitor's state is as after a real start. COSMOS, for example, relies on the display pointer the monitor sets.

### Extras

`extras/` holds small programs to try on the emulated and the real boards. They are distributed with the source but are not part of the emulator: not in `programs/catalog.json`, not in the builds. One folder per program, one source per board or monitor (`extras/clock/clock-pmi80.asm`, `-pmi80c` for the PMI-80 C monitor). Each is a commented `.asm` whose header explains how to use it (a README in the folder only when the header is not enough), with the Intel HEX and byte list beside it from `node tools/make-listings.mjs`. `extras/README.md` lists the programs; tests are in `tests/extras.test.mjs`. Programs by other authors name their author and source.

## Conventions

### Language

The repository is in English: code, comments, tool messages, documentation, `CHANGELOG.md` and commit messages. The user interface is English with a Czech switch at the bottom of the side panel, remembered per browser; before any choice, a browser set to Czech or Slovak opens in Czech, any other in English.

All UI texts live in `src/ui/i18n.js`, in an `en` and a `cs` catalogue (English is the fallback). `index.html` names them with `data-i18n`, `data-i18n-html`, `data-i18n-title`, `data-i18n-placeholder` and `data-i18n-aria`; the code calls `t(key, params)`. No user-visible string goes straight into the HTML or JS; `tests/i18n.test.mjs` checks that both catalogues match and that every used key exists.

The case's wordmark (the board's name) is not translated; the subtitle beside it (JEDNODESKOVÝ MIKROPOČÍTAČ / SINGLE-BOARD MICROCOMPUTER) is. The demo programs keep their names, except the project's own Czech-named ones, which have English names too (Mikrovarhany / Micro Organ, Světelný had / Light Snake).

### License and third-party material

The project is GPL-3.0-or-later. Every hand-written source file starts with an `SPDX-License-Identifier: GPL-3.0-or-later` line and the copyright line. Outside contributions need the [CLA](../CLA.md).

The ROM images and the programs by other authors are published with the emulator but are not covered by its license. They stay in their own folders (`roms/`, `programs/`) with a note on their origin. Everything that is not the project's own work names its author (when known) and its source, with a link, in those notes and in "About the emulator" in the UI.

### Faithfulness

- Each board has a **profile**, nothing is hardcoded: CPU, clock, ROM, memory map, digit select polarity and key labels.
- The default firmware is each board's **factory monitor**. Other monitors are a choice within a board, not separate computers: PMI-80 C is the PMI-80's second monitor, STONE-PMI the Stone 1's.
- ROM behaviour is emulated faithfully, bugs included, never "fixed".
- A ROM is identified by its SHA-256, never by a board or file name alone; neither is a clock.
- Documentation, ROM analysis, the emulator's behaviour and a test on a physical machine are different levels of evidence. A ROM running in the emulator, or passing tests, does not verify a physical board or a particular EPROM.

## Hardware in brief

The board documents have the details and sources; these are the facts that shape the architecture.

- **CPU and clock.** PMI-80: TESLA MHB8080A, a clone of the Intel 8080A (Intel's 8080 documentation is the reference), at about 1.111 MHz (10 MHz crystal divided by 9 in the MH8224). Savia-84: Z80/U880 at 2 MHz. Stone 1: Z80 at 2 MHz. STONE-PMI contains the Z80 instruction IM 1.
- **Memory.** PMI-80: ROM 0000–03FF, optional EPROM 0400–07FF, RAM 1C00–1FFF, 2000–3FFF mirrors the lower 8 KiB, from 4000h the decoder is blocked. Savia-84: ROM 0000–03FF, RAM 1800–1FFF, A15 ignored (mirrors from 8000h); Nostalcomp's simplified decoder (2716 at 0000–07FF) is an option. Stone 1: ROM 0000–07FF, RAM 1800–1FFF, full decoding. An unpopulated address returns the last value on the data bus.
- **I/O.** The system 8255 is at F8–FBh (PA, PB, PC, CWR); the PMI-80 has an optional second one at F4–F7h. Port decoding is incomplete (PMI-80: any upper nibble; Savia-84 and Stone 1: only A2=0), so ports have aliases. At start the PMI-80 monitor writes CWR 8Ah, the Savia-84 monitor 88h.
- **Display.** 9 digits; PA0–6 are segments a–g, active low; PA7 is not a segment (the tape on the PMI-80). The digit is selected by the low nibble of PC: PMI-80 and Stone 1 `(~index)&0Fh`, Savia-84 `index` (through a 74145). The display is multiplexed: the picture and its brightness come from the timing of writes to PA and PC, not from a buffer in RAM, so the timing must be cycle-exact. Both factory ROMs scan 10 times (E=0..9) for 9 positions; PMI-80 C leaves the last digit lit longer, so it is brighter.
- **Keyboard.** PC4–6 are inputs, a pressed key reads 0; columns are selected by the same decoder as the display digits (a 3×9 matrix). RE (and I on the PMI-80) are wired to hardware (reset, interrupt), outside the matrix. The PMI-80 layout, 5×5:

  ```text
  RE  I  EX  R  BR
   C  D   E  F   M
   8  9   A  B   L
   4  5   6  7   S
   0  1   2  3   =
  ```

  The Savia-84 has the same functions with other labels (Ad, dA and minus instead of M, = and S, depending on the monitor).
- **Tape.** Only the factory PMI-80 monitor has it (PA6 burst, PA7 data, input PC7, about 5 kHz). PMI-80 C has none; in the factory Savia-84 ROM, LOAD and SAVE point into an unfilled FFh area.
- **Savia-84 with eight digits.** The factory Savia-84 ROM drives 9 digits and shows SLAVIA 84, but the book builds the board with 8: output 1 of the 74145 has no digit, so it reads SAVIA 84. The emulator shows 8 by default, with an option for 9.

## User interface

- **Stylized skeuomorphism:** the UI resembles the real machine, with flat colours and simple outlines; no photorealism, textures, gradients, shadows or imitated materials. The PMI-80 is in a yellow plastic case; the keyboard follows the real colour scheme (dark grey hex keys, blue function keys, a light grey frame). The keycaps show their bevel as flat bands (a light strip on top, a dark one at the bottom, no blur), and the grey panel has the outline of the real one (notches with their own pitch, sharp top corners, rounded bottom corners, a square tab from the middle of key 1 to the middle of key 3). The bubble LED display is not imitated: the digits are enlarged and readable, unlit segments only faintly visible, lit ones bright with a slight glow.
- **Layout,** from right to left: the control panel; the display and keyboard (always visible); a switchable work area with the cheat sheet (monitor commands, services, scratchpad, memory map), the 8080 opcode table, the debug view, and later a board view or the development environment. All boards share the same layout and size: the PMI-80 layout with relabelled keys, the board's name in the header at the same height (a long name is narrowed, never made smaller). The Savia-84 can also use the 4×6 arrangement of a real board, with keys of the same size on a wider, lower panel centred in the same space.
- **The page always fits the window, with no horizontal scroll bar,** including on laptops with a low vertical resolution. The computer panel is drawn at a fixed design size and scaled as a whole (`fitCase` in `src/ui/app.js`, at most 1.2×); the work area takes the remaining width (at least 320 px); only the panels scroll vertically. Check new UI at 1366×768 and 1920×970 at least.
- **Small screens:** in a window narrower than 900 px or lower than 500 px (`setLayout` in `src/ui/app.js`, chosen by size, not by detecting a phone), the side panel becomes the first work-area tab, Controls, and the whole page scrolls vertically (still never horizontally). Portrait: the computer on top, fitting the window, the work area under it. Landscape: the computer on the left, the work area on the right; the whole computer fits the window height, and when that would make the keys too small, the part from the display down fits it and the computer sticks to the top. Check such changes at 375×812 and 844×390 as well.
- **Light and dark theme,** dark by default, or following the system, remembered per browser (`applyTheme` in `src/ui/app.js`; an inline script in `index.html` sets a light theme before the first paint). Only the page around the computer changes (the panel tokens under `:root[data-theme="light"]` in `style.css`); the case, board, display and keyboard keep the colours of the real machine. Panel rules use the panel tokens (`--heading`, `--value`, `--hl` …), never the computer's (`--case`, `--cream`). Samsung Internet recolours pages in its dark mode whatever they declare; the display's workaround, limited to that browser, is described in [TODO.md](TODO.md) (Known behaviour).
- **Opcode reference:** the code next to the mnemonic, with bytes and states, sorted by code or by name, with a search field; the 16×16 grid is an extra view.
- **Memory** is a scrollable hex view of the whole address space with a go-to-address field, the ROM, RAM and unpopulated areas told apart by colour.
- **No manufacturers' logos** in the UI or the builds; naming a manufacturer in the text is fine. The brand element is the wordmark: a heavy cream board name, a thin vertical bar, the spaced caps subtitle on two lines, and a yellow rule underneath.

## Versions and releases

Versions are `x.y.z`: `z+1` for fixes, `y+1` for features. The number is never hardcoded in the source: a development build derives it from `git describe` (e.g. `1.0.2+3-g1a2b3c4`, plus `-dirty`), and every change goes into the `## Unreleased` section of `CHANGELOG.md`.

A release: the `## Unreleased` items move under `## X.Y.Z – date` (a new empty `## Unreleased` stays above), which is committed as "Release X.Y.Z" and tagged with an annotated tag `vX.Y.Z`. Then, from the clean tree, `npm test`, `node tools/build.mjs` and `node tools/build-desktop.mjs`; the builds show exactly `X.Y.Z`. The tag push deploys the web version; the EXE, a ZIP of `dist/desktop` (`Wolf80-X.Y.Z-windows-x64.zip`) and `Wolf80-offline.html` are attached to the GitHub release. The download button in the app relies on the asset name `Wolf80-offline.html`.
