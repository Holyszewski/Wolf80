# PMI-80: how the emulator models the board

Implementation: `src/board/pmi80.js` (wiring), `src/machine/i8255.js` (8255), `src/machine/display.js` (multiplexed display), `src/core/i8080.js` (CPU). Tests: `tests/pmi80.test.mjs`, `tests/i8255.test.mjs`, `tests/i8080.test.mjs`.

Levels of certainty used below: **DOC** documented in a manual, **ROM** follows from the factory monitor's code, **ASSUMED** a reasoned choice that has not been checked on a physical board (listed in [hardware-tests.md](hardware-tests.md)).

## Sources

- PMI-80 user's manual, parts I and II (TESLA Piešťany, 1982).
- J. Vlach: *Mikropočítač PMI-80 – co s ním?* (Svazarm), chapters 2.1 and 3.1, the memory map table.
- The factory monitor ROM (`roms/pmi80/pmi80_monitor.bin`) and its commented disassembly by nostalcomp.cz (2014); the DISP routine is also commented in Amatérské radio 11/1984.
- Intel 8080 Microcomputer Systems User's Manual, 98-153B, September 1975: CPU instruction set and timing (page 5-19), the 8255 (chapter on the 8255 PPI).

## CPU and clock

- MHB8080A, a clone of the Intel 8080A (DOC). The core follows the Intel manual; no difference of the MHB8080A is known. The undocumented opcodes behave as on the Intel 8080 (ASSUMED for the MHB8080A).
- Clock: 10 MHz crystal, divided by 9 in the MH8224, i.e. 1.111 MHz, one state = 0.9 µs (DOC).
- No wait states (ASSUMED).

## Memory

| Range | Content | Certainty |
|---|---|---|
| 0000–03FF | monitor ROM | DOC |
| 0400–07FF | optional second EPROM (not fitted by default) | DOC |
| 0800–1BFF | five 1 KiB selects on the bus connector, nothing fitted | DOC |
| 1C00–1FFF | RAM, 2 × 2114 | DOC |
| 2000–3FFF | mirror of 0000–1FFF (A13 is not decoded) | DOC |
| 4000–FFFF | decoder blocked | DOC |

- Reads from unpopulated space return the **last value on the data bus**, not FFh: nothing drives the bus, so it keeps the previous transfer. Measured on a real board (2026-10-24): `M 0800` and `M 4000` show 7Eh, the opcode of the monitor's `MOV A,M` that had just been fetched. The CPU gets this value; the debug view (`read()`) shows FFh for empty space because it has no bus history. (MEASURED, one unit.)
- RAM contents at power on: 44h at even and BBh at odd offsets (as read from the first 32 bytes of a real board, with a few flipped bits); the pattern goes on through hundreds of further bytes, with now and then a single flipped bit (for example A4, B4, AB, 0B, 74, 7B, 54, C4, EB). The emulator uses the clean pattern; the flips are random and not modelled. Real 2114 chips start differently from unit to unit (MEASURED, one unit).

## I/O

- The system 8255 answers on ports x8h–xBh, any upper nibble (DOC). The optional second 8255 at x4h–x7h is not fitted. Other ports ignore writes and read the stale bus value, in practice the port number just fetched as the operand of `IN` (MEASURED: `IN 00h` gives 00h, `IN 0Ch` gives 0Ch). `IN 08h` reads the same as `IN F8h`, so the decoding of bits 3 and 2 only is MEASURED. A board with the optional second 8255 reads 00h from its idle `IN F5h` (not modelled).
- The monitor sets the control word 8Ah at reset: PA output, PB input, PC0–3 output, PC4–7 input (ROM).
- Only mode 0 of the 8255 is modelled. RESET puts all ports into input mode, every mode change clears the output latches (DOC). A line in input mode is seen as high by the board (ASSUMED).

## Display

- Nine digits. PA0–PA6 drive the segments a–g, a 0 lights the segment; PA7 is not a segment (DOC, ROM).
- PC0–PC3 select the digit and the keyboard column through a decoder. The PMI-80 sends the inverted index, `(~index) & 0Fh` (ROM: `MOV A,E / CMA / OUT FAh` in DISP). Index 9 is selected by the monitor's tenth scan step but has no digit; 10–15 select nothing (ASSUMED for the decoder outputs).
- Brightness: the display accumulates how long each segment is lit (`MuxDisplay`). A change is timestamped with the CPU state count at the start of the OUT instruction; the real write happens a few states later, the same for every OUT, so the shares are unaffected.
- With the factory monitor every digit is lit 158 of about 2700 states of a scan (5.85 %), counted from the DISP code and confirmed by the test.

## Keyboard

- PC4, PC5, PC6 are inputs with pull-ups; a pressed key connects its row to the selected column and reads 0 (DOC). The matrix, derived from DISP and the key table at 01A3h (ROM):

  | Column | PC6 | PC5 | PC4 |
  |---|---|---|---|
  | 0 | 0 | 2 | – |
  | 1 | 4 | 6 | S |
  | 2 | 8 | A | L |
  | 3 | EX | R | – |
  | 4 | D | F | BR |
  | 5 | C | E | M |
  | 6 | 9 | B | – |
  | 7 | 5 | 7 | – |
  | 8 | 1 | 3 | = |

- RE is the hardware reset: it resets the CPU and the 8255 and holds them in reset while pressed (ASSUMED that the 8255 shares the reset line).
- I raises the INT line while pressed. Nothing drives the data bus during the interrupt acknowledge, so the CPU reads FFh, which is RST 7, and the monitor jumps from 0038h to 1FE6h in RAM (ROM; MEASURED: pressing I stops a program waiting with EI, through a handler at 1FE6h, on a real board). This is not the stale bus value of the other empty reads, so the hardware supplies RST 7 during the acknowledge.
- PC7 is the tape input, idle high (ASSUMED). Loading from tape is not emulated yet.

## Firmware

- **Factory monitor** (default): `roms/pmi80/pmi80_monitor.bin`, the 1 KiB ROM; no second EPROM.
- **PMI-80 C** (Nostalcomp, 2019): `roms/pmi80/pmi80c_monitor.bin` in place of the monitor and `roms/pmi80/pmi80c_games.bin` as the second EPROM at 0400h, as on the maintainer's working unit no. 1452. The monitor is the factory one without the tape routines (L is a scrolling text, S a game menu), with a debounced key reading (OUTKE waits until no key is held, then for a key held through several scans), nine scans instead of ten (the last digit stays lit longer, so it is brighter), the tailed 9 and more characters (ROM; P5). The scrolling text says `PMI-80 C` (the maintainer's change; Nostalcomp's own text is "Čau borče"). The second EPROM holds the menu (0400h), COSMOS (0440h) and TENIS3 (0660h).
- PMI-80 C takes a key only when it is held for about 60 ms or more at 1.111 MHz (emulator); the side panel holds the keys for 100 ms when it starts a program, and a clicked key at least as long.
- The catalogue offers Nostalcomp's COSMOS and TENIS3 on every board (the maintainer, 2026-10-26): with PMI-80 C from its second EPROM, with the factory monitor as RAM ports of the same code (`programs/cosmos/cosmos-pmi80.asm`, `programs/tenis3/tenis3-pmi80.asm`). Šutera's original COSMOS and TENIS are kept only locally, outside the repository (`.gitignore`, `programs/README.md`); TENIS would not run on PMI-80 C anyway (it calls 011Ch inside the factory OUTKE).

## Tape output K3 and the virtual amplifier

- MG OUT on K3 is the NAND of PA6 (the 5 kHz burst) and PA7 (data), gate IO11 pin 8; the signal is then shaped to a roughly sinusoidal wave for the tape recorder (DOC: J. Vlach, chapter 2.3). The factory monitor's TOUT toggles PA6 with `XRI 40h` while PA7 carries the bit (ROM).
- The book's sound programs (dice 5.7.1, micro organ 5.7.4) play through K3 into an amplifier or a tape recorder with monitoring (DOC). The emulator does the same: a **virtual amplifier** on MG OUT. This is hardware, so it works with every firmware, including PMI-80 C, which only removed the tape routines.
- While the display is scanned, PA7 is 0 in every segment pattern, so MG OUT stays high and silent (ROM: all masks are below 80h).
- Writing FFh and 7Fh to PA toggles MG OUT while PA0–PA6 stay 1, so no segment lights up (used by Mikrovarhany).
- The board records every change of MG OUT with its time in states (`EdgeRecorder`); `renderEdges` averages each audio sample, applies a one-pole low-pass (5 kHz) for the shaping and a DC blocker for the AC-coupled amplifier input. Both filter corners are ASSUMED; the real RC values were not taken from the schematic.

## Tape format of the factory monitor and the WAV export

The factory monitor's `S` (SAVE, 034Ch) and `L` (LOAD, 038Ch) commands; PMI-80 C has neither. Everything here is ROM unless marked; J. Vlach's book (chapter 2.3 and the commented listing) describes the same (DOC).

- **The tone.** The loop at 02F0h writes PA, waits and flips PA6 with `XRI 40h`: 99 states per half period, 89 µs, a burst of about **5.6 kHz** at 10 MHz / 9 (the book says "5 kHz" and "about 90 µs"). A tone call writes 32 half periods (`MVI D,20h`), 2.85 ms.
- **A recording (block).** After `S address = number =` and any key: PA = 23h (silence), a **leader** of 240 half periods (21.4 ms), the **block number** (the byte typed after the address), then the bytes from the address **to the end of its 256-byte page** (the loop stops when L wraps to 00h), so a block holds 1 to 256 bytes and its length is not recorded.
- **A byte** (TOUT, 02D4h) is nine cells, bits 0 to 7 and then a 0 that LOAD uses to find the next byte. A cell is three tone calls: start with the burst (PA7 = 1), data with the burst for 1 and without it for 0, stop without it (PA7 = 0). A 1 is the burst for two thirds of the cell, a 0 for one third. A byte takes 87 000 states, 78.3 ms (the book: 24 × 3.2 ms = 76.8 ms, 13 bytes/s); a full block about 20 s.
- **Gaps between tone calls**, from the last write of one to the first write of the next, in states: start → data 158, data → stop 140, stop → next start 155, byte → byte 211, leader → block number 182, block number → first byte 676 (it includes CLEAR at 00ABh, 457 states).
- **LOAD** (`L address = number =` shows `"MG  run"`; any key starts it, the display then shows only `t` on the left digit) waits for 160 samples without the burst, then reads with TIN (0300h): PC7 is sampled about every 84 µs; it reads **1 while the burst is on** and 0 in silence (ROM: a bit is 1 when the 1-period is longer than the 0-period; DOC: the book's comments). The leader is read as part of the first start cell: 240 × 99 states are almost exactly 256 samples, so the 8-bit counter wraps back to where it started. The block number is compared with the typed one: on a mismatch LOAD shows `F` and the number found (smaller number) or a message (greater number) and waits for a key. At the end LOAD shows `"MG Stop"` and waits for a key, back to the prompt; a recording that comes too late is skipped (a block holds no silence of 160 samples, so LOAD waits for the next gap) and the next block's greater number gives `"MG SPAt"`. The bytes go from the **address typed at LOAD** to the end of its page, so the same recording can be loaded elsewhere, but only into a page offset that gives the same count. LOAD into 1Fxx overwrites the monitor's stack and work area (1FD5–1FFF), so those bytes do not survive.
- **MG IN** (DOC): transistors T2 and T3 turn the tape signal into a logic level for PC7; the original circuit needs at least 3 V RMS from the tape recorder, the book's improvement (chapter 6.1) works from 1.5 V peak to peak. How the circuit turns the burst into a steady 1 is not modelled.

The **WAV export** (`src/board/pmi80-tape.js`, button in Memory: load and export) computes this signal from the code above, state by state, without running a monitor, so it works whatever firmware the emulator runs. Tests check it against the factory monitor in the emulator: the same MG OUT edges as its SAVE, state for state, and its LOAD reads the signal back. Choices that are the emulator's (ASSUMED): the burst is a square wave at 90 % of full scale around zero and silence is zero, as a tape recorder would play it back (no DC, no shaping into a sine, for the strongest signal into MG IN); 44.1 kHz, 16 bits, mono; each sample is the mean over its interval. A range is split into blocks at page boundaries, as separate SAVEs would record it, numbered upwards from the given number, with 2 s of silence before, 20 s between the blocks (time to type the next `L`, about eleven keys) and 1 s after. Whether a real board loads it from a PC or a player is in `docs/hardware-tests.md`.
