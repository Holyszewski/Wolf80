# Changelog

## Unreleased

## 1.1.0 – 2026-11-07

- A custom ROM (Memory, at the end): an Intel HEX or BIN image that the computer reads instead of its built-in ROM wherever the image has a byte, over the monitor or in an empty area as an extra EPROM; bytes meant for RAM are left out. It is remembered for each board; a note under Monitor and the memory view show it.
- Extras: a calibrated PMI-80 clock (`extras/clock/clock-cal-pmi80.asm`, `-pmi80c` for PMI-80 C, 93 bytes) that corrects for the board's own crystal; the correction is the program's last two bytes, in hundredths of a second a day, from -50 to +49.99 s, and as typed in it does nothing. `extras/clock/README.md` explains step by step how to work it out.

## 1.0.3 – 2026-11-02

- A development guide, `docs/development.md`: the source, building, testing and the conventions the code follows; the READMEs and `CONTRIBUTING.md` link to it.
- About the computer cites its sources as superscripts, and the basic specifications of the boards no longer cite one at every line.

## 1.0.2 – 2026-11-01

- On the first visit the page opens in Czech when the browser is set to Czech or Slovak, otherwise in English; a language chosen with the switch still wins and is remembered.

## 1.0.1 – 2026-11-01

- The page has a descriptive title, a description for search engines and a preview for links shared on social networks and forums (Open Graph, with an image of the PMI-80 in `site/`).
- The web version on GitHub Pages carries the Google Search Console verification and a sitemap (`site/`); the Pages workflow can deploy again without a new release, always building the latest release.

## 1.0.0 – 2026-11-01

The first public release.

- The web version is built and deployed to GitHub Pages by GitHub Actions at each release (`.github/workflows/pages.yml`); the desktop README links to it and to the source code.
- **The Stone 1's own monitor is withheld** until its author, Radek Veselý, agrees to its publication: its ROM is no longer in the repository or the builds, the Stone 1 runs Nostalcomp's STONE-PMI, and the COSMOS and TENIS3 ports for the own monitor are set aside. Everything else stays ready for its return (`docs/stone1.md`, "The own monitor, withheld").
- The name is settled as **Wolf80**, with the subtitle "emulator of Czechoslovak single-board computers" (About the emulator, the EXE's file description, the desktop README).
- `CLA.md` (Wolf80 Contributor License Agreement 1.0) and `CONTRIBUTING.md`.
- About the emulator gives Nostalcomp's full name, once.
- About the emulator links to the source code on GitHub and, in the web version, has a button to download the offline version from the latest release.
- The README (English and Czech): what Wolf80 is for, the computers, features, downloads and credits, with a link to the web version at the top.
- The notes of the programs no longer say that they were written with the help of AI, except Light Snake and AION Buzzer 80; About the emulator says it for the whole project.

## 0.5.0 – 2026-10-29

- The copyright lines, the About text and the EXE's version info name the author without the radio call sign.
- Multi-Maze 0.3.0 for the PMI-80: 8 and 2 also move up and down, as on the Savia-84.
- **Extras** (`extras/`): small programs to try on the emulated and the real boards, outside the emulator's program list, each as a commented source with its Intel HEX and byte list. The first is a clock for the PMI-80 showing HH-MM-SS, exact to the state at 10 MHz / 9, in two versions for the factory monitor (60 bytes) and for PMI-80 C (61 bytes) (`extras/clock/`). `node tools/make-listings.mjs` makes the listings for them too.

## 0.4.0 – 2026-10-29

- The EXE's file description (Properties, Details; also the Task Manager) names the Savia-84 too: "Wolf80 - emulator of the PMI-80 and Savia-84" (the Stone 1 is left out as a modernised PMI-80, the maintainer's choice) instead of "Wolf80 PMI-80 emulator".

- The build stops with the file and line when a module has a syntax error (`tools/build.mjs`); before, it built a page that did nothing.

- **Multi-Maze** (Jim Butterfield's maze game from *The First Book of KIM*) on the PMI-80, the Savia-84 and the Stone 1, version 0.2.0: written anew in compact code, with the maze and the eight wall patches kept as published, a key (S, on the Savia –S) that switches to generated mazes of 7 × 8 cells with exactly one way out, a title that waits for a key, a window of seven digits with the player in the middle, OUt and the move count at the exit, and beeping on the PMI-80; signature (`programs/multi-maze/`).

## 0.3.1 – 2026-10-29

- "About the emulator" no longer lists the original COSMOS and TENIS among what the emulator contains (they are no longer included); it names Jiří Šutera as the author of COSMOS and TENIS3 as Nostalcomp's version of TENIS.
- "About the emulator" states the licence (GPL-3.0-or-later, no warranty, the monitors and the programs by other authors not covered) and shows its full text on request; the text is embedded in the page, so the offline HTML carries it too (about 35 kB more).
- The desktop package has one `CREDITS.txt` for the user, naming who made each monitor and program, in place of `ROMS.txt` and `PROGRAMS.txt`, which were copies of the developers' notes `roms/README.md` and `programs/README.md`. The program list is made from `programs/catalog.json` (`tools/credits.mjs`), the monitors are in `desktop/CREDITS-desktop.txt`.

## 0.3.0 – 2026-10-29

- **Wumpus** on the PMI-80, version 0.1.0: closer to Stan Ockers's KIM-1 original than the Savia-84 and Stone 1 version, with the factory monitor's display routine and characters, which is what makes it fit into the PMI-80's RAM; a title that waits for a key makes even the first game random; factory monitor only (`programs/wumpus/wumpus-pmi80.asm`).
- The builds carry the assembled demo programs instead of their sources, which makes the offline HTML about half as big (470 kB instead of 834 kB); the build fails if a program's Intel HEX does not match its source, and `node tools/build.mjs --with-sources` puts the sources back in (background in `programs/README.md`).
- Duck Shoot (MK14) 0.1.3: the ducks move every 87 ms, as on the MK14 (it was 190 ms, from a wrong reading of the SC/MP II clock).
- Duck Shoot (Acorn) 0.1.3: the first duck moves every 320 ms, as on the Acorn System 1 (it was 148 ms, from a wrong reading of the Acorn monitor), and still speeds up by a tenth with every hit.
- "About the emulator" has a paragraph on the game ports and the computers they come from (KIM-1, NEC TK-80, Acorn System 1, MK14).
- The PMI-80 clock in the side panel reads just 1.111 MHz, without the crystal and divider.
- Program notes: the PMI-80 versions say that their sound is an addition (the originals are silent), the ports are said to be for the PMI-80, the Savia-84 and the Stone 1 rather than for the 8080 and Z80, Wumpus on the Savia-84 and the Stone 1 explains its pauses in plain words, and AION Buzzer 80 shows its version like the other programs.
- Duck Shoot (Acorn and MK14): the notes say that the sound and the lit segment for a shot are the port's, not the original's.

## 0.2.0 – 2026-10-27

- Demo programs: one folder per program, one file per board (the COSMOS and TENIS3 ports moved from `cosmos-<board>/` and `tenis3-<board>/` into `programs/cosmos/` and `programs/tenis3/`), and an Intel HEX and a list of bytes to type in beside every source and binary, made by `tools/make-listings.mjs` and checked by a test, so the programs can be handed out and entered into real boards without the emulator.

- **Z80 core** (`src/core/z80.js`): all documented and undocumented instructions (prefixes CB, DD, ED, FD, the halves of IX and IY, SLL, the register copies of DD CB), the undocumented flag bits 3 and 5 and MEMPTR, interrupt modes 0, 1 and 2, NMI, HALT, the R register, 16-bit port addresses, states per instruction after the Zilog manual. It passes ZEXDOC and ZEXALL in full (`node tools/cpu-exercise.mjs --z80 …`; the test programs are kept only locally). A Z80 disassembler in Zilog syntax and a Z80 opcode table (`src/core/z80-disasm.js`).
- **Savia-84** (`src/board/savia84.js`, `docs/savia84.md`): the board of the book *Radioamatérské konstrukce 4* at 2 MHz with its factory monitor, which was found identical with the book's printed listing. Memory map of the book's decoder (A15 not decoded), the 8255 on every port with A2 = 0, the digit index straight to the 74145, the stale data bus and the RAM after power on as measured on the maintainer's board, L and –S running into the empty tape area as the real ROM does; the mirrors, the empty space and the L crash were confirmed on the maintainer's board. Nostalcomp's simplified decoder is in the model but has no switch yet. The virtual amplifier listens to PA7, where a speaker can be connected.
- **Stone 1** (`src/board/stone1.js`, `docs/stone1.md`): Radek Veselý's cross of the PMI-80 and the Savia (Z80 at 2 MHz, 2716 and 6116 with full address decoding, inverted digit select, the I key), with its own monitor from malecky.cz and, as another monitor, Nostalcomp's STONE-PMI with its games COSMOS and TENIS3.
- The board drop-down offers PMI-80, Savia-84 and Stone 1, the monitor drop-down the firmware of the board; both choices are remembered per browser, and a change starts the computer afresh. The computer keeps the PMI-80 layout and size on every board, with the board's name above the display and its key labels (Reset, Ex, Reg, Br, Ad, L, –S, dA on the Savia, whose missing interrupt key is a blank cap). Savia-84 options: an eight-digit display as in the book by default, or nine digits; the keyboard as on the PMI-80 or "4×6 – Wolf's Savia-84" (full-size keys with the spacing and edges of the PMI-80 layout).
- The demo programs are offered by board and monitor. COSMOS and TENIS3 from the STONE-PMI EPROM are moved to the Savia-84 (`programs/cosmos/`, `programs/tenis3/`): the same code with its own copies of the tables and routines it took from the ROM, checked to write to the 8255 exactly what the originals write; on the Stone 1 with STONE-PMI they start from the ROM.
- Tahák, Instrukce and Ladění follow the board: the monitor's commands, services, scratchpad and memory map; the 8080 or the Z80 instruction table; the Z80 registers and flags in the debugger, the memory view coloured after the board's map.
- The memory view in Ladění has darker ROM and RAM backgrounds in the dark theme, so that the values read better.
- "About the computer" has the Stone 1; the book is cited with its ISBN.
- **PMI-80 C** as the second monitor of the PMI-80: Nostalcomp's monitor (with the maintainer's text, as in his EPROM) and its second EPROM with a game menu, COSMOS and TENIS3, which the program list offers for it. Its debounced keys need a longer press, so programs are started and clicked keys held for 100 ms. Mikrovarhany waits until no key is held at its start, so the = that started it no longer switches the scale. `docs/hardware-tests.md` has checks for the maintainer's working unit no. 1452.
- Each board and monitor offers each game once, and everywhere Nostalcomp's COSMOS and TENIS3 (the maintainer's preference): from the ROM where the monitor carries them (PMI-80 C, STONE-PMI), otherwise as RAM ports of the same code (PMI-80 with the factory monitor, Savia-84, Stone 1 with its own monitor), each checked to write to the 8255 what the original does. Šutera's original COSMOS and TENIS are no longer offered. Světelný had runs on the Savia-84 (its own Savia version) and the Stone 1 too.
- The program notes in the side panel are in the chosen language, their authors included (they were English in the Czech UI too), and Mikrovarhany and Světelný had are called Micro Organ and Light Snake in English.
- A program's notes can have paragraphs (an empty line in the catalogue's help) and a program can carry its own version, shown beside its name (`version` in `programs/catalog.json`).
- **Ship, Captain, Crew** (Loď, kapitán, posádka), the maintainer's dice game written for this project, on the PMI-80, the Savia-84 and the Stone 1, version 0.1.0: 1–9 players and 1–8 rounds with a running total, the six, five and four set aside by themselves, a roll counter, the player, the dice set aside and the total blinking together; signature on the Savia-84 and the Stone 1 (`programs/ship-captain-crew/`).
- **Bagels** (Jim Butterfield's code-guessing game for the KIM-1) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.1: written anew after *The First Book of KIM*, with a guess counter, and beeping on the PMI-80; signature (`programs/bagels/`).
- **Rock Climbing** (two-player dice climbing game from the Japanese book *Maikon Game 21* for the NEC TK-80) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.1: written anew from the rules, with a pause after a fall, and beeping on the PMI-80; signature (`programs/rock-climbing/`).
- **Odd Couples** (M. Kishida's memory game for the NEC TK-80) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.1: written anew from the rules, with the score shown by itself after a win, and beeping on the PMI-80; signature (`programs/odd-couples/`).
- **Wumpus** (Stan Ockers's KIM-1 version of Hunt the Wumpus) on the Savia-84 and the Stone 1, version 0.1.2: written anew after *The First Book of KIM*, with each message standing still for 1.5 s before it scrolls, faster scrolling while a key is held and a new game without a reset; each message also stands still for 1.5 s at its end, W drawn with segments f b g d, signature (`programs/wumpus/`).
- **Duck Shoot (Acorn)** (the shooting game from the Acorn System 1 manual) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.2: written anew, with rounds that speed up, and beeping on the PMI-80; a shot lights the bottom segment of its digit for 0.1 s; signature (`programs/duck-shoot/`).
- **Duck Shoot (MK14)** (the duck game from the MK14 kit manual, where a miss adds a duck) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.2: written anew, beeping on the PMI-80; a shot lights the bottom segment of its digit for 0.1 s; signature (`programs/duck-shoot-mk14/`).
- **Spiraal** (A. W. den Hartog's two-player reaction duel for the KIM-1) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.1: written anew from the rules, with a lit display and a key that starts a new match, beeping on the PMI-80; the signature at the end of the program (`programs/spiraal/`).
- **Silver Dollar** (the coin game from the MK14 kit manual, where the computer plays a perfect Nim) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.2: written anew from the rules, announcing who lost, with random later positions, beeping on the PMI-80; the game ends as soon as nobody can move; the signature at the end of the program (`programs/silver-dollar/`).
- **Lunar Lander** (Jim Butterfield's KIM-1 moon landing) on the PMI-80, the Savia-84 and the Stone 1, version 0.1.1: written anew after *The First Book of KIM*, showing the thrust, beeping on the PMI-80; signature (not on the PMI-80, where it does not fit) (`programs/lunar-lander/`).
- Export WAV (tape) in Memory: load and export: a range of memory as a tape recording in the format of the factory monitor's S (SAVE) command, to be played from a PC or a player into MG IN on K3 of a real PMI-80 and loaded with its L (LOAD) command. Works whatever monitor the emulator runs. SAVE records to the end of the 256-byte page, so a range is split into numbered blocks with 20 s of silence between them; the message after the export says what to type on the PMI-80. Tests compare the signal with the factory SAVE state for state and load it with the factory LOAD. Not yet tried on a real board (`docs/hardware-tests.md`).
- Measured on a real PMI-80 (see `docs/hardware-tests.md`): an empty memory address or port now returns the last value on the data bus instead of FFh (reading 0800h or 4000h with the monitor's `MOV A,M` gives 7Eh, `IN 0Ch` gives 0Ch), and the RAM starts with the 44h/BBh pattern a real board showed instead of zeros.
- Light and dark theme: buttons Světlý / Tmavý / Podle systému (Light / Dark / System) under the language switch, dark by default, remembered per browser. Only the page around the computer changes; the computer keeps its colours.
- Samsung Internet's dark mode, which recolours pages whatever they declare, made the display unreadable (unlit segments turned light grey). In that browser only, the unlit segments are drawn in the lit colour at low opacity, which it leaves readable; the page also declares its colour scheme (`color-scheme`) for browsers that honour it.
- Fixed: on a phone the page jumped back while scrolling (when the browser showed or hid its address bar) and after switching the language; resizing the computer no longer moves the scroll position.
- The PMI-80 board in the yellow case is a light greyish khaki (`--board` in `style.css`), closer to the bare laminate of a real board than the former dark olive; the cream wordmark keeps its colour.
- Credits: "About the emulator" names the authors and sources of the factory monitor, COSMOS and TENIS and thanks Nostalcomp, with a link; `roms/README.md` and `programs/README.md` give the origins in more detail (TENIS comes from a Slovak microelectronics application sheet transcribed by Nostalcomp).
- The GUI texts no longer decline Savia-84 (Czech "Savii-84" and "Savie-84" are now "Savia-84"), the maintainer's decision (`src/ui/i18n.js`, `programs/catalog.json`).
- Keys of the emulated computer in a program's notes are drawn as small keycaps in the colours of the real ones (blue function keys, dark digits and letters), written `<kbd>=</kbd>` in `programs/catalog.json`; where the PC key differs (Esc for RE, Enter for = or dA, S for –S) a tooltip names it.

## 0.1.0 – 2026-10-20

The first release: the PMI-80 with its factory monitor, as a web page, a single-file offline HTML and a desktop EXE for Windows.

- The emulation keeps running while the page is hidden (minimised window, another tab), ticked by a worker (page timers are throttled in the background), sound included; the old pause stays in the code behind `PAUSE_WHEN_HIDDEN` in `src/ui/app.js`.
- Intel 8080A core (the TESLA MHB8080A of the PMI-80): all documented instructions with the state counts of the Intel 8080 manual, the undocumented opcodes as copies of NOP, JMP, RET and CALL, interrupts with the EI delay, and HLT.
- Unit tests of the core and a runner for CP/M CPU test programs (`tools/cpu-exercise.mjs`).
- PMI-80 board: memory map with mirrors, the 8255 in mode 0, the nine-digit multiplexed display with per-segment on-time, the key matrix, RE and I. Runs the factory monitor, which is included in `roms/`.
- First web UI: the PMI-80 in a yellow case with a nine-digit display whose brightness follows the real multiplex timing and a clickable keyboard; work-area tabs Tahák (monitor reference), Instrukce (8080 opcode table) and Ladění (registers, 8255, disassembly, memory); run, pause, step and power cycle; loading Intel HEX, BIN and hex text and saving memory ranges.
- Demo programs from `programs/catalog.json`: COSMOS, TENIS and Světelný had, started through the monitor's EX command.
- Sound: a virtual amplifier on the tape output K3 (MG OUT = NAND of PA6 and PA7), on by default, with a switch in the side panel.
- A two-pass 8080 assembler (Intel syntax, TASM-style directives); demo programs may be 8080 source.
- Mikrovarhany, a one-voice organ written for this project: keys 0–F play c1 to d3 through K3; = switches to semitones (c1 to d♯2).
- AION Buzzer 80 1.0.1 among the demo programs: the RAM edition with the AAA DBF P display from the distribution ZIP, with its source and info text; a two-voice music demo with bass and drums through K3. A Savia-84 version needs a port first.
- The page fits any window without a horizontal scroll bar: the computer panel scales with the window.
- Small screens, phones included: in a window narrower than 900 px or lower than 500 px the side panel becomes the first work-area tab, Ovládání (Controls), and the page scrolls. On a portrait screen the computer is on top and the tabs under it; on a landscape one the computer is on the left, and on a phone on its side it is scaled so that the display and the keyboard fill the height and stays in place while the page scrolls.
- Darker unlit segments, brighter lit segments with a slight glow.
- Instrukce tab: a list of code, instruction, bytes and states, sorted by code or by name, with search; the 16×16 grid stays as an extra view.
- Ladění memory view: ROM and RAM are told apart by the background of whole rows instead of the text colour, with two ROM and RAM chips in the same colours as the legend; unpopulated space has no background and dim values.
- The Ladění memory view has −1 KiB and +1 KiB buttons, and its ROM and RAM chips jump to the start of ROM (0000) and RAM (1C00).
- The Běh controls (pause, step, power cycle) and the status line moved from the side panel to the top of the Ladění tab.
- The message after loading a file shows merged address ranges (e.g. "1C00–1E54") instead of every Intel HEX record.
- The memory section is split into "Načíst do paměti" and "Exportovat z paměti"; the buttons are now "Exportovat Intel HEX" and "Exportovat BIN", and the Od – do range is labelled as the export range.
- Buttons sink in while pressed and flash a short ring after a click. Enter and Space activate a button reached with Tab; after a mouse click they stay the computer's keys.
- Display brightness is smoothed over 30 ms of simulated time, as in SFMT, so software PWM does not beat against the screen's frame rate; the picture is held while paused.
- "O počítači" in the side panel: the history and the main features of the PMI-80 and the Savia-84, following the selected board, with sources.
- In "O počítači" the list of sources is no longer shown; the source numbers in the text, e.g. [1, 2], show the source as a tooltip on hover or keyboard focus.
- `docs/savia84.md`: the Savia-84 key matrix and what the factory monitor does with each control key, for the coming Savia UI.
- English and Czech user interface: English by default, a switch at the bottom of the side panel, the choice remembered; all texts in `src/ui/i18n.js`. The language buttons carry a small inline SVG flag, the sound button 🔊 / 🔇. The case header subtitle is translated too.
- Keycaps with the bevel of the real ones drawn as flat light and dark bands; a held key sinks.
- The grey keyboard panel has the outline of the real one: notches on both sides, sharp top corners, rounded bottom corners and a square tab at the bottom.
- Application icon for the coming desktop EXE, `assets/icon/wolf80.ico`: a close-up of the display and the keyboard on the yellow case, drawn by `tools/make-icon.mjs` from flat rectangles in the UI colours (no image files); each size from 16 to 256 px is laid out separately so small sizes stay crisp. Preview in `docs/img/icon.png`.
- Desktop version for Windows x64: one EXE, `dist/desktop/Wolf80.exe`, built by `tools/build-desktop.mjs` with a C++ wrapper around WebView2 as in SFMT (`desktop/wolf80_desktop.cpp`, `docs/desktop.md`). The memory export uses the native "Save as" dialog there and shows the saved path; the wrapper's own messages are English, Czech on a Czech or Slovak Windows.
- `tools/build.mjs` builds `dist/web` and `dist/Wolf80-offline.html`; `tools/serve.mjs` serves the web version locally.
