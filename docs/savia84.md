# Savia-84: how the emulator models the board

Implementation: `src/board/savia84.js` (wiring), `src/core/z80.js` (CPU), `src/machine/i8255.js`, `src/machine/display.js`. Tests: `tests/savia84.test.mjs`, `tests/z80.test.mjs`. Checks waiting for the maintainer's board are in [hardware-tests.md](hardware-tests.md).

Levels of certainty as in [pmi80.md](pmi80.md): **DOC** documented in the book, **ROM** follows from the factory monitor's code, **SCH** from the circuit diagram, **USER** measured or seen by the maintainer on his own board, **ASSUMED** a reasoned choice not checked on a physical board.

## Sources

- *Radioamatérské konstrukce 4* (SNTL, Prague 1990, ISBN 80-03-00208-7), the chapter on the Savia microcomputer, pp. 124–145: description, circuit diagram, the monitor's hexadecimal listing (table 4.1, p. 131). The maintainer has the book on paper.
- The factory monitor ROM (`roms/savia84/savia84_monitor.bin`, SHA-256 `3caf3ed02f7fd8bc2484bbfb48df788ef1db01a8098146f9f8bd9e8f61efd031`, 2 KiB with the upper half FFh), identical with the book's listing (compared byte by byte on 2026-10-24), and a commented disassembly of it.
- Nostalcomp's Savia page: the image, a simplification of the board (below), a proposed change of the digit 9.
- The maintainer's Savia-84 (USER): a 2 MHz crystal without the divider, the 7400 fitted, a Soviet equivalent of the 2716 as the EPROM, nine digits, the label "ROM: 0000h-03FFh, RAM: 1800h-1FFFh" on the board.
- The key labels of a real board (photo and a label sheet): hex keys `7 8 9 F / 4 5 6 E / 1 2 3 D / 0 A B C`, control keys `Reg Reset / Ad dA / L –S / Br Ex`.

## CPU and clock

- U880 or Z80 (DOC). The Z80 core is written after the Zilog manual and passes ZEXDOC and ZEXALL, the undocumented flags included. No difference of the U880 that a program could see is modelled (ASSUMED; known U880 quirks are still to be collected).
- Clock 2 MHz (DOC, USER): the book's diagram has a 4 MHz crystal and a 7474 dividing by two; with a 2 MHz crystal the divider can be left out, as Nostalcomp describes and as the maintainer's board is built. The book allows crystals of 1–8 MHz, so other builds may run at another clock.
- The factory monitor uses only instructions of the 8080 subset (ROM), but it runs on the Z80 core: the Z80 needs fewer states for many instructions (`LD r,r` 4 against 5 for `MOV r,r`), and the display timing follows the states.
- No wait states (ASSUMED). /INT and /NMI are not used; the board has no interrupt key (SCH).

## Memory

The book's decoder (a 3205, SCH): A10–A12 select 1 KiB blocks, the decoder works only while A13 and A14 are 0 and /MREQ is active (gated through the 7400); A15 is not decoded.

| Range | Content | Certainty |
|---|---|---|
| 0000–03FF | monitor EPROM 2758, 1 KiB (block 0) | DOC, SCH |
| 0400–17FF | nothing (blocks 1–5) | SCH; USER: 0400–0488 read 7E |
| 1800–1FFF | RAM 6116, 2 KiB (blocks 6 and 7 together) | DOC, SCH, USER (the board's label) |
| 2000–7FFF | nothing (A13 or A14 is 1) | SCH; USER: 2000 reads 7E |
| 8000–FFFF | mirror of 0000–7FFF (A15 not decoded) | SCH; USER: 8000 reads F3, a byte written at 1810 reads back at 9810 |

- **An empty address returns the last value on the data bus** (USER, 2026-10-24): `Ad 0400 dA` and on to 0488 show 7E everywhere, the opcode of the monitor's `LD A,(HL)`, as on the PMI-80. The emulator does the same (`busRead`); the debug view shows FFh there.
- The maintainer's EPROM is a 2716 equivalent in the place of the 2758. 0400 reading 7E shows that block 1 does not select the EPROM, so its upper half cannot be reached, as the maintainer thought (USER, derived). What the upper half holds is not known; reading it needs a programmer.
- **Power-on RAM** (USER, 2026-10-24): from 1800 `00 FF 5C FF 7B F7 BD FF 9F FF BD FF 8C FF 77 FF 00 00 FF FB`, then mostly FFh with a different byte here and there. The emulator starts with FFh throughout (`SAVIA84_POWER_ON_RAM`); the first bytes looked random and are not modelled.

### Nostalcomp's simplification (a variant, not the default)

Nostalcomp describes how to leave out the 7474 (2 MHz crystal) and the 7400: /MREQ goes straight to an enable of the 3205, E3 is tied high through 4k7, and the decoder moves up to A11–A13, so it decodes 2 KiB blocks: the EPROM, now a whole 2716, on /CS0 (0000–07FF), the RAM on /CS3 (1800–1FFF). The other low enable is assumed to stay on A14, so 4000–7FFF is empty and A15 is still not decoded (ASSUMED). The board model has it as `decoder: 'nostalcomp'`; the UI has no switch for it yet ([TODO](TODO.md)).

## Ports

- The 8255's /CS is wired to A2 alone (SCH), A0 and A1 select the register, A3–A7 (and the upper byte the Z80 puts on the address bus) are not decoded: the 8255 answers on every port with A2 = 0. The monitor uses F8–FB and writes the control word 88h: PA output, PB output, PC0–3 output, PC4–7 input (ROM, DOC).
- A port with A2 = 1 returns the stale data bus, as on the PMI-80 (ASSUMED; for `IN A,(n)` that is n).
- **PA0–PA6** drive the segments a–g through PNP drivers, a 0 lights the segment (SCH, ROM).
- **PA7** is free. The book suggests PA6 and PA7 as a tape output and PC7 as a tape input (DOC), but the board has no sound or tape circuit. The emulator connects its virtual amplifier to PA7, where the maintainer would connect a speaker with an amplifier (the maintainer's suggestion, not part of the original board).
- **PB0–PB7** drive eight LEDs LD1–LD8 (VQA 15) through 1k5 resistors, "for demonstrations" (SCH, DOC). The emulator does not show them yet ([TODO](TODO.md)).
- **PC0–PC3** carry the digit index straight to the BCD inputs of the 74145 (no inversion, unlike the PMI-80: the monitor writes E to FAh without CMA at 020Bh). **PC4–PC6** read the three key rows with 6k8 pull-ups, a pressed key reads 0 (SCH, ROM).

## Display

- Nine positions on outputs 0–8 of the 74145 (ROM: the monitor shows SLAVIA 84 on nine positions and scans E = 0–9, ten passes like the PMI-80).
- The book's build has **eight** digits (TIL 702, common cathode): output 0 goes to digit 1, **output 1 has no digit** (its line goes only to the keyboard), outputs 2–8 go to digits 2–8 (SCH, checked on the diagram on 2026-10-24). So an eight-digit board shows SAVIA 84: the L of SLAVIA 84 is on output 1. The maintainer's board has all nine (USER).
- The UI shows **eight digits by default, as in the book** (the maintainer's decision, 2026-10-26): position 1 is hidden and the other eight close up in the same frame. The option "9-digit display" shows all nine.
- The digit 9 of the factory monitor has no tail (segment d off, 18h at 03CAh; ROM); the maintainer's board shows it so (USER). Nostalcomp proposes 10h there, untested; it may come as another firmware ([TODO](TODO.md)).

## Keyboard

The monitor writes the column index E = 0…9 to PC0–PC3 without inversion; a 74145 decodes it (ROM, SCH). After each column it reads PC and tests PC6, then PC5, then PC4; a pressed key reads 0. The first key found wins: the lowest column, and within a column PC6 before PC5 before PC4 (ROM). The key code comes from the table at 03E5h + row × 9 + E (row PC6 = 0, PC5 = 1, PC4 = 2):

| Row \ column | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| PC6 | 0 (80) | 4 (84) | 8 (88) | Ex (91) | D (8D) | C (8C) | 9 (89) | 5 (85) | 1 (81) |
| PC5 | 2 (82) | 6 (86) | A (8A) | Reg (9A) | F (8F) | E (8E) | B (8B) | 7 (87) | 3 (83) |
| PC4 | – | –S (94) | L (93) | – | Br (97) | Ad (92) | – | – | dA (90) |

- 23 keys are in the matrix; "–" (code FFh) is an empty position. Column 9 is scanned but drives no keys (ROM, SCH).
- **Reset** is a separate switch on the RESET line (also to the 8255), outside the matrix (SCH). There is **no interrupt key**, unlike the I key of the PMI-80 (SCH, ROM).
- The schematic labels the keys R, AD, DA and S; the real board says Reg, Ad, dA and –S.

### What the control keys do (factory monitor)

The main loop looks the key up in the command table at 038Dh (ROM):

| Key | Code | Entry | Function |
|---|---|---|---|
| Reg | 9Ah | 00CEh | register pairs AF, BC, DE, HL, SP one by one; hex keys edit, dA goes to the next |
| Ad | 92h | 0105h | address entry (hex keys, dA), then memory editing: hex keys write, dA next address, –S previous address |
| Ex | 91h | 00A7h | run: address (default the saved PC), dA starts the program |
| Br | 97h | 0089h | two breakpoint addresses (RST 08h is written there), then continues as Ex |
| L | 93h | 0305h | tape load: points into an area filled with FFh |
| –S | 94h | 0285h | tape save: points into the same FFh area; in memory editing it is "previous address" |
| dA | 90h | – | not a command: confirms an entry or moves on, like = on the PMI-80 |

- The tape routines are missing from the factory ROM: L and –S at the prompt execute FFh = RST 38h, which jumps through 0038h to the RAM vector at 1FDFh that nothing has set up (ROM). The emulator does the same, it does not "fix" it. With the power-on RAM full of FFh, 1FDFh is RST 38h again: every pass pushes the return address 1FE0h, the stack runs down through the whole address space and over the RAM (twice, A15 is not decoded) until 1FDFh itself is overwritten, and the code that follows ends up at 0000h. In the emulator the monitor starts again about 0.3 s after L, with the RAM full of E0h 1Fh (`tests/savia84.test.mjs`); the maintainer's board does the same (USER, 2026-10-26).
- During number entry any key other than a hex key or dA restarts the monitor at 0000h (ROM).

### On-screen layout

The UI uses the PMI-80 layout for all boards, with the Savia's labels (the maintainer's decision, 2026-10-24): Reset in place of RE, Ex, Reg, Br, Ad in place of M, L, –S in place of S, dA in place of =; the PMI-80's interrupt key I is a blank cap. The matrix is wired the same on both boards and the key codes are the same, so inside the emulator the keys keep their PMI-80 names (`SAVIA84_MATRIX` is `PMI80_MATRIX`). The PC keyboard: Enter or = is dA, M Ad, X Ex, R Reg, P Br, L, S –S, Esc Reset.

The option "Keyboard: 4×6 – Wolf's Savia-84" switches to the arrangement of the maintainer's board (`SAVIA84_LAYOUT`), which groups the control keys sensibly, with Reset where it is:

```text
7 8 9 F   Reg  Reset
4 5 6 E   Ad   dA
1 2 3 D   L    –S
0 A B C   Br   Ex
```

Rows: inspection next to the hardware Reset; the address and data pair; the tape pair; the run pair.

## Running a program

The greeting SLAVIA 84 is itself the command prompt: the monitor waits for a key with the greeting in its buffer and looks the key up in the command table (ROM, 006Bh). A program is started with `Ex`, four address digits and `dA` (`savia84RunKeys`); Ex offers the PC saved at the last stop, and four digits replace it. While the program runs, the left digit shows E (the monitor writes 06h to PA with digit 0 selected before it jumps).
