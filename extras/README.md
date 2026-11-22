# Extras

Small programs to try on the emulated boards and on the real ones. They come with the emulator's source, for interest, but they are not part of the emulator: they are not in the program list in the app (`programs/catalog.json`) and the builds do not carry them. To try one in the emulator, type it in through the monitor as on the real board, or load its Intel HEX file.

## Layout

One folder per program, named after it; in it one source per board or monitor, named `<program>-<board>.asm` (`-pmi80`, `-pmi80c` for the PMI-80 C monitor, `-savia`, `-stone1`). The source's header says what the program does, which board and monitor it needs, how to start and use it, its RAM and its version; a README in the folder says the rest.

The README of a program is in English and, below that, in Czech, and names the program's version. The Czech half is also beside it as plain text, `CTIMNE.txt` (made by `node tools/make-listings.mjs`), so that a folder can be handed out on its own.

Beside every source there are two listings, made by `node tools/make-listings.mjs` and kept up to date by a test, as in `programs/`: an Intel HEX file (`<name>.hex`) and a list of bytes to type in by hand (`<name>-bytes.txt`, 16 to a line after the address).

A program for an EPROM has the label `ROM_END` in its source (`epromBlocks` in `tools/make-listings.mjs`; one that copies a part of itself to RAM marks that part too); its listings hold the contents of the EPROM, and a third file beside them, `<name>.bin`, is the whole EPROM for a programmer. A program that fills both EPROMs of the PMI-80 also has one file for each, named after its first address (`<name>-0000.bin`, `<name>-0400.bin`).

A program by another author names its author and source, with a link, in its header and in the table below, and is not covered by the project licence. The others are the project author's, GPL-3.0-or-later.

## Programs

| Program | Board, monitor | What it is |
|---|---|---|
| `clock/clock-cal-pmi80.asm`, `clock/clock-cal-pmi80c.asm` | PMI-80, factory or PMI-80 C monitor | A clock showing HH-MM-SS to type in by hand, 93 bytes from 1C00, the start time at 1D00-1D02. It counts the length of the monitor's DISP routine, so each monitor has its version. With a correction for the board's own crystal: the program's last two bytes, 50 00 as typed in, which is exact at 10 MHz / 9, or 50.00 plus the seconds a day the clock gains on that board (minus those it loses), in steps of 0.01 s a day. How to work it out: `clock/README.md`. |
| `clock-eprom/clock-eprom-pmi80.asm` | PMI-80, any monitor | The clock for a 1 KiB EPROM in the second socket, 0400h–07FFh, with the image to program (`.bin`, `.hex`). Start `EX 0400 =`; it asks for the time (typed from the left, checked) and for the correction (the one in the EPROM is bytes 0403h–0404h, `50 00`), and starts on `=`. While it runs, `B` sets an alarm that beeps on MG OUT and `S` shows a stopwatch; keys do not disturb its seconds. `clock-eprom/README.md`. |
| `sfmt80/sfmt80-pmi80.asm` | PMI-80, in place of the monitor | The Science Fair Microcomputer Trainer (Radio Shack 28-260) on the PMI-80: its panel, monitor, 4-bit virtual machine and seven built-in programs (organ, tune, guessing game, rat bashing, tennis, timer, Morse) in the board's two 1 KiB EPROMs, 0000h–07FFh, with the images to program. Written anew after the behaviour of the original, compared with it key for key in emulation; tried on a real board. Keys, programming and the differences: `sfmt80/README.md`. |
| `aion-buzzer-80-eprom/aion-buzzer-80-eprom-pmi80.asm` | PMI-80, any monitor | The music demo AION Buzzer 80 (1.0.1, the same as in the program list) for a 1 KiB EPROM in the second socket, 0400h–07FFh, with the image to program (`.bin`, `.hex`). Start `EX 0400 =`; uses RAM 1C00h–1D2Eh while it plays. How to program and start it: `aion-buzzer-80-eprom/README.md`. |
