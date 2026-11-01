# To do

A living list of things to look into or implement. Done items are removed or moved to `CHANGELOG.md`.

## Publication

- **Where** (the maintainer, 2026-11-01): a GitHub repository, the web version on GitHub Pages and the EXE as a download (GitHub releases); announced on Facebook, forums and similar channels too.
- **Stone 1 monitor withheld** (the maintainer, 2026-11-01): until Radek Veselý agrees to its publication, the Stone 1's own monitor is not in the repository or the builds; the Stone 1 runs STONE-PMI. How to bring it back: [stone1.md](stone1.md), "The own monitor, withheld".
- **Link to the source code** (the maintainer, 2026-10-29): the GPL asks that whoever gets the built program (offline HTML, web version, EXE) can get its source. "About the emulator" links to https://github.com/Holyszewski/Wolf80, and so does `desktop/README-desktop.txt`.
- **Web version on GitHub Pages** (the maintainer, 2026-11-01): deployed automatically by GitHub Actions at each release (tests, `node tools/build.mjs`, `dist/web`). Releases carry `Wolf80.exe`, a ZIP of `dist/desktop` and `Wolf80-offline.html`; the button "Download Wolf80 offline" in About the emulator (web version only) downloads the latter from the latest release.

## Desktop EXE

- The EXE is built (`docs/desktop.md`). Still to check: a PC without the WebView2 Runtime, a high-DPI monitor, sound in the EXE.
- A repeatable check script like SFMT's `tools/desktop-check.ps1` (start with a debug port, export through the real dialog, minimise, cleanup of `%TEMP%`).

## Assembler and development environment

- **Both 8080 (Intel) and Z80 (Zilog) mnemonics, mixable where possible** (the maintainer's wish, 2026-10-18; some programmers prefer one, some the other). Most mnemonics do not clash (MOV/LD, MVI/LD, JMP/JP nn …), but some mean different things: Intel `JP addr` is "jump if positive", Zilog `JP addr` is an unconditional jump; Intel `CP addr` is "call if positive", Zilog `CP n` is "compare". Mixing therefore needs a default dialect (e.g. directives `.8080` / `.Z80`, switchable within a file) that decides the ambiguous mnemonics; the assembler should warn when a line could be read both ways. Z80-only instructions are refused when the target CPU is the 8080 (PMI-80).

- **When the editor or a source view is built: the demo programs' sources.** Since 2026-10-29 the builds carry only the assembled demo programs, not their sources (the maintainer's decision; background in `programs/README.md`, "Sources in the builds"). Showing a game's source in the app, or opening it in the editor as an example, needs them back: `node tools/build.mjs --with-sources` already embeds them gzipped (field `source`, unpacked by `programSource()` in `src/machine/programs.js`); make that the default, or load the files on demand in the web version, as part of that work. Not a task on its own.

## User interface


- **Core error messages are English only**: the errors thrown by `src/machine/memfile.js` (and later the assembler) reach the Czech UI untranslated after "Chyba:". Give them codes and parameters and translate them in the UI, as planned for SFMT (its `docs/PUBLIKACE.md`, D2).

- **"O počítači"**: the maintainer accepted the single-source facts (price, number made, prototype date, the full name of J. T. Hyan, the Litronix 2230 origin of the OKU 205) as sufficiently confirmed (2026-10-19); a better source for each is still welcome.

- **First person in "About the computer" and "About the emulator"**: the paragraph on the game ports is written in the maintainer's first person ("I chose them…"); the maintainer wants to consider the first person for the whole of both sections (2026-10-28).

## Savia-84 and Stone 1

- **Nostalcomp's simplified Savia** (the maintainer, 2026-10-24): the board model has it (`decoder: 'nostalcomp'` in `src/board/savia84.js`: 2716 at 0000–07FF, 2 KiB blocks, see [savia84.md](savia84.md)); a control in the UI to switch to it is still missing.
- **Savia firmware with the tailed 9** (the maintainer, 2026-10-24): Nostalcomp's proposed change of one byte (03CAh: 18h to 10h, untested by him) as an alternative firmware of the Savia-84, later if wanted.
- **The eight LEDs on PB** of the Savia-84 (LD1–LD8 in the circuit diagram, "for demonstrations"): not shown yet. Where and how to draw them is the maintainer's decision.
- **Clock of the Savia-84**: the book allows crystals of 1–8 MHz; the emulator runs at 2 MHz (the book's diagram and the maintainer's board). A choice of clock may come later.
- **U880**: collect the known differences of the East German U880 from the Zilog Z80 and check whether any concerns the emulated programs (as for the MHB8080A).
- **Stone 1 monitor, permission to distribute** (the maintainer, 2026-10-26): the maintainer will contact Radek Veselý, the author of the Stone 1 and its monitor, and ask for permission to distribute the monitor with the emulator. Until then the monitor is withheld (see Publication above). **Remind the maintainer when a release is being prepared.**
- **Stone 1 details**: the circuit diagram and board drawings on malecky.cz are images that were not read for the model; the port decoding (A2 = 0 assumed from "repeated every 8 addresses"), the pull-ups for the I key and the variants PMI and SAVIA could be checked on them ([stone1.md](stone1.md)).
- **AION Buzzer 80 for the Savia-84** (the maintainer's wish, 2026-10-19): the demo is to be among the Savia's programs too, but it has to be ported first; the PMI-80 build in `programs/aion-buzzer-80/` cannot simply be loaded. What the port has to change: the memory map (it occupies 1C00–1FD8 and sets SP=1FD9; the Savia's RAM is 1800–1FFF with a different monitor workspace), the digit select (PMI writes the inverted index to PC, the Savia the index itself, and PC=0 as the "no digit" blanking value would select a real digit there), the 8255 setup (PMI 8Ah, Savia 88h) and the sound output (on the PMI it is K3 = NAND of PA6 and PA7; which Savia output, if any, can carry it is to be found from the schematic). The tone increments and the 132-state sample loop are computed for 10 MHz / 9 on an 8080, while the Savia runs a Z80 at a build-dependent clock with different instruction timings, so the timing slots and the frequency table have to be recomputed. The sound output is chosen: the emulator's virtual amplifier is on PA7 of the Savia (where the maintainer would connect a speaker), and catalogue entries take `board: "savia84"`; the Savia starts programs with `Ex address dA` (`savia84RunKeys`).

## Sound and tape

- **Export of the K3 output (MG OUT) as an audio file**, requested by the maintainer on 2026-10-18. *The tape recording is done (2026-10-24): Export WAV (tape) in Memory: load and export writes a range as the factory SAVE records it, see `docs/pmi80.md`.* Still open: a recording of what the virtual amplifier plays (any program's sound), and MP3 maybe later.
- **Loading an audio file into MG IN (PC7)**: playing a WAV (maybe MP3) recording into the emulator, so the monitor's L command loads programs from real tape recordings. Needs a model of the input shaper (transistors T2, T3) and a threshold.

## Games from other trainers

- The maintainer plays each game and decides whether it stays; when it does, its version becomes 1.0.0 (`programs/README.md`, section Games from other single-board trainers).
- Odd Couples: the original blanks a mismatched pair at once, so the second symbol is hardly seen; the port keeps that. The maintainer tries whether it suits, or whether the second symbol should stay visible for a moment (0.25 or 0.5 s).
- **Games from trainers with other CPUs** (the maintainer, 2026-10-29): the games so far come from the 6502 (KIM-1, Acorn System 1), the SC/MP (MK14) and the 8080 (TK-80). The maintainer is interested in three more CPUs; for none of them is a particular game with a known author and source found yet, so the first step is research (a game, its author, where it was published, its terms):
  - **RCA 1802**: COSMAC Elf, Netronics ELF II. Only two hex digits, so only simple games fit (e.g. Hi-Lo); the COSMAC VIP's CHIP-8 games need a screen and do not fit.
  - **Signetics 2650**: Signetics Instructor 50 (1978), eight digits and a hex keypad. Its example programs are in the *Instructor 50 Software Applications Manual* (on ztpe.nl); which of them are games is to be checked.
  - **Motorola 6800**: Heathkit ET-3400 (six digits), Motorola MEK6800D2. Look in the Heathkit manuals (classiccmp.org) and the ET-3400 user group's files.

## Known behaviour

- **Wrong colours in Samsung Internet on Samsung phones** (the maintainer, 2026-10-21, offline HTML on a Galaxy A56 and a Galaxy S25 Ultra; Chrome on the same phones shows the page correctly). The browser's own dark mode recolours the page: the yellow case turns dark brown, the board almost black, the keys darker, and the unlit display segments, which were dark, were turned light grey, so every digit looked like a lit 8 and the display could not be read. Declaring the page dark (`color-scheme: only dark`, kept in `index.html` and on `:root`) did not help on the A56: by Samsung's own statements its dark mode cannot be switched off by the page; it honours the page's declared scheme only when the user turns on *Labs → Use website dark theme* ([Samsung's dark mode article](https://developer.samsung.com/internet/blog/en/2020/12/15/dark-mode-in-samsung-internet), [developer forum](https://forum.developer.samsung.com/t/websites-dark-mode-gets-overridden-by-samsung-internets-dark-mode/22937)). **Workaround in place (2026-10-21, confirmed on the A56):** in Samsung Internet only (recognised by `SamsungBrowser` in the user agent, class `samsung-internet` set in `index.html`) the unlit segments are drawn in the lit colour at 10 % opacity instead of a dark colour of their own (the same shade on the bezel); the recolouring keeps them faint red and the display is readable. Kept to that browser at the maintainer's wish, so that the display stays exactly as it was everywhere else. The other colours of the case stay changed by the browser. For the user: *Labs → Use website dark theme*, or dark mode off for websites, shows the page as intended.

- **Short sound glitch when a minimised page is restored** (seen in Firefox with the AION-Buzzer-80 demo, 2026-10-19). While the page is hidden the emulation and the sound keep running, ticked by a worker; on return the animation-frame loop takes over and the sound queue is trimmed from 0.3 s to 0.09 s, which is audible as a click. The maintainer can live with it; fix only if it turns out to be simple (for example, fade the queue instead of cutting it).
