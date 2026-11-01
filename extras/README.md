# Extras

Small programs to try on the emulated boards and on the real ones. They come with the emulator's source, for interest, but they are not part of the emulator: they are not in the program list in the app (`programs/catalog.json`) and the builds do not carry them. To try one in the emulator, type it in through the monitor as on the real board, or load its Intel HEX file.

## Layout

One folder per program, named after it; in it one source per board or monitor, named `<program>-<board>.asm` (`-pmi80`, `-pmi80c` for the PMI-80 C monitor, `-savia`, `-stone1`). The source's header says what the program does, which board and monitor it needs, how to start and use it, its RAM and its version; a README in the folder only when that is not enough.

Beside every source there are two listings, made by `node tools/make-listings.mjs` and kept up to date by a test, as in `programs/`: an Intel HEX file (`<name>.hex`) and a list of bytes to type in by hand (`<name>-bytes.txt`, 16 to a line after the address).

A program by another author names its author and source, with a link, in its header and in the table below, and is not covered by the project licence. The others are the project author's, GPL-3.0-or-later.

## Programs

| Program | Board, monitor | What it is |
|---|---|---|
| `clock/clock-pmi80.asm` | PMI-80, factory monitor | A clock showing HH-MM-SS, 60 bytes from 1C00, the start time at 1D00-1D02. Exact to the state at 10 MHz / 9: it counts the length of the monitor's DISP routine. |
| `clock/clock-pmi80c.asm` | PMI-80, PMI-80 C monitor | The same clock trimmed for the shorter DISP of the PMI-80 C, 61 bytes. |
