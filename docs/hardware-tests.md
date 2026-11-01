# Checks waiting for a physical board

The emulator is built from documentation and ROM analysis. The points below can only be settled on a real machine. They are collected here and checked in batches, not one by one. Each entry says what to do, what is expected and what it decides. The expected values were produced by running exactly these key sequences on the emulator (both the factory monitor and the PMI-80 C monitor).

## PMI-80: one session, keyboard only

For a board with the PMI-80 C monitor and the extra EPROM, no tape recorder, everything typed by hand. The tests use only the monitor's M and EX commands and hardware, which behave the same in the factory monitor and in PMI-80 C. The emulator in the UI runs the **factory** monitor, so what differs on the real board is cosmetic: the greeting reads `PMI -80 C` instead of `PMI -80`, and a separator glyph (a bar made of segments d and g, shown here as `=`) sits between the address and the data. The values are the same.

### How to enter things (identical for all tests)

- `RE`, then any key (for example `=`), leaves the greeting and gives the command prompt. This is also the way out of any mode.
- **Type a program:** `M`, the four-digit address, `=`; then for each byte its two hex digits and `=` (the `=` stores it and moves to the next address). After a typing slip use `RE` and start again.
- **Read a byte:** `M`, address, `=` shows it; `=` again shows the next address.
- **Run:** `RE`, any key, `EX`, address, `=`. While a program runs the leftmost digit shows `E`. A program that ends with `RST 1` (byte `CF`) stops and the display shows `br-StoP`.
- Check what you typed before running: `RE`, any key, `M`, address, `=` and `=` through the bytes.

### A. Memory map (no program, 4 reads)

| Do | Expected | Decides |
|---|---|---|
| `M 0800 =` | `0800 7E` (first guess FF; measured 7E) | what an unpopulated address returns |
| `RE`, any key, `M 4000 =` | `4000 7E` | the same above the blocked decoder |
| `RE`, any key, `M 1C00 =`, `5`, `A`, `=` (writes 5A), then `RE`, any key, `M 3C00 =` | `3C00 5A` | RAM is mirrored at 2000h–3FFFh (A13 not decoded) |
| `RE`, any key, `M 2000 =` | `2000 3E` (the same as `M 0000 =`) | the ROM is mirrored too |

If you have the extra EPROM, `M 2400 =` must also show the same as `M 0400 =`.

### B. Input ports (24 bytes, once)

Reads four I/O ports and stores the bytes at 1D00h and up. Type at 1C00:

```text
21 00 1D        LXI H,1D00h
DB F8 77 23     IN F8h   / MOV M,A / INX H
DB 08 77 23     IN 08h   / MOV M,A / INX H
DB 00 77 23     IN 00h   / MOV M,A / INX H
DB 0C 77 23     IN 0Ch   / MOV M,A / INX H
DB F5 77 23     IN F5h   / MOV M,A / INX H
CF              RST 1
```

Run it (`EX 1C00 =`, the display shows `br-StoP`), then read `M 1D00 =` and press `=` four times.

| Address | Port | Emulator | Meaning |
|---|---|---|---|
| 1D00 | F8h | `06` | the system 8255, port A, reads back the output latch; the `06` is the monitor's last write, so it also depends on the monitor (PMI-80 C may differ, write down what you see) |
| 1D01 | 08h | `06` | the emulator decodes only bits 3 and 2 of the port, so 08h is the same as F8h; `FF` here means the real board does not alias |
| 1D02 | 00h | `00` | a port nothing answers: the stale bus value, the port number (first guess was FF, measured 00) |
| 1D03 | 0Ch | `0C` | the same, other decoder state |
| 1D04 | F5h | `F5` (real board with the second 8255: `00`) | port B of the optional second 8255, **fitted on your board** (the emulator has none); inputs after reset, so the value tells what its pins read |

Decides: whether the port aliases are right and what an empty port returns.

### C. Interrupt key I (5 bytes)

Type `FB C3 01 1C` at 1C00 (EI, then a jump that loops on itself) and `CF` at 1FE6h (the monitor jumps there from the interrupt vector). Run `EX 1C00 =`: the display shows `E`. Press `I`.

Expected: the display changes to `br-StoP`. Nothing happening means the interrupt does not reach the CPU or it reads another vector from the bus (the emulator assumes FFh, that is RST 7). Press `RE` at the end.

### D. Tone on K3 (15 bytes, optional, needs an amplifier or headphones on MG OUT)

```text
1C00  3E FF        MVI A,FFh
1C02  EE 80        XRI 80h        toggles PA7, PA0–PA6 stay high, no segment lights
1C04  D3 F8        OUT F8h
1C06  06 40        MVI B,40h
1C08  05           DCR B
1C09  C2 08 1C     JNZ 1C08
1C0C  C3 02 1C     JMP 1C02
```

Expected: a square tone of **559 Hz** (the board runs at the factory 1.111 MHz), the display dark. A phone tuner app is enough to read the pitch. `RE` ends it. Decides the output level and shape of K3 (the emulator's 5 kHz low-pass and the AC coupling are assumed).

### E. RAM contents after power on (done, see the results)

Switch on, press any key, `M`, `1C00`, `=` and step through some addresses with `=`; switch off and on and repeat. Write down the bytes. Decides the default RAM fill (00h in the emulator).

### F. RE and the 8255

Hard to see without instruments; low priority.

### Results (the maintainer's working unit no. 1452, PMI-80 C monitor, second EPROM and second 8255 fitted, 2026-10-24)

| Test | Result | Verdict |
|---|---|---|
| A | `0800` and the following 4Fh bytes read **7E**, `4000` reads 7E; `3C00` 5A, `2000` 3E, `2400` = `0400` | Empty space does **not** read FFh: the data bus keeps the last value, here the opcode 7E of `MOV A,M`. The emulator now does the same. The mirrors are as expected. |
| B | 1D00 = 06, 1D01 = 06, 1D02 = **00**, 1D03 = **0C**, 1D04 = **00** | The port 08h alias is confirmed. An empty port returns the port number just fetched (00 and 0C: the same stale bus). The second 8255 answers F5h with 00. |
| C | as expected | The interrupt gets RST 7; the vector is supplied by the hardware. |
| D | not done (optional) | |
| E | from 1C00: 04 AB 44 BB 44 BB 40 BB 44 BB 44 BB 44 BB 44 BB C4 AA 44 B9 44 BB 44 BB 44 BB 44 BB 44 BB 44 BB, then 00 at 1C20 | Alternating 44/BB with a few flipped bits. Reading on through hundreds more bytes showed the same pattern with occasional single-bit flips. The emulator now starts with the clean pattern. |

## PMI-80 C (the maintainer's working unit no. 1452): monitor and the game EPROM

The emulator now has PMI-80 C (Monitor: PMI-80 C (Nostalcomp)) with the maintainer's text change (the scrolling text says PMI-80 C instead of Nostalcomp's "Čau borče", as in his EPROM) and the second EPROM with the games. The checks are about what the board shows and does; timing is not checked by hand, because the emulator's speed follows from the crystal and the state counts of the instructions (checked against the manual by the core's tests), and a stopwatch on events of about a second could only catch errors that are plain to see anyway (the maintainer, 2026-10-26).

| Do | Expected (emulator) | Decides |
|---|---|---|
| Switch on | `PMI -80 C`, the rightmost digit clearly brighter than the others (the emulator keeps it lit about twice as long) | the greeting and the "last digit lit longer" of PMI-80 C |
| Any key | `?` on the left digit | the prompt |
| `L` | a scrolling text from the right: `PMI-80 C`, then `tESt CHArS = 0123456789 …` (the character set) | the scrolling text and the characters |
| `RE`, any key, `S` | `CO=0 tE=1` | the game menu in the second EPROM |
| then `0` (COSMOS) | `COSMOS`, `StArt`, then the game; the score counts up on the right | COSMOS from the EPROM |
| `RE`, any key, `S`, `1` (TENIS3), touch nothing | `tEnIS 3`, then the ball moves from the left; without a hit `00 bodou` | TENIS3 |
| `RE`, any key, `EX`, `0440`, `=` | COSMOS starts the same way (`G 0440` before =) | the start addresses of the games |

**Results (the maintainer's working unit no. 1452, 2026-10-26):** the greeting with the brighter right digit, the prompt, the scrolling text, the menu, COSMOS and TENIS3 from the menu: all as in the emulator. The EX test was typed as `EX 0400 =` by mistake and showed the game menu, which is what the emulator does at 0400h too (the menu's entry). A check that a very short tap is ignored was dropped: such a short contact cannot be made on purpose by hand.

If you also have a moment for the board with the factory monitor: the optional test D above (the 559 Hz tone on K3) and the WAV loading below are still open.

## PMI-80 with the factory monitor: loading an exported WAV

Needs a board with the **factory** monitor (PMI-80 C has no tape commands), a cable from a PC or player to K3 (pin 1 MG IN, pin 2 GND) and the emulator's Export WAV (tape). Decides whether the WAV export loads on a real board and how loud it has to be.

1. In the emulator, write a short program at 1C00, for example `3E 23 D3 F8 3E 0F D3 FA 76` (shows a character on the left digit and halts; any program will do), and export the range 1C00–1C08 as WAV with block 00. The recording holds the whole page 1C00–1CFF, about 20 s.
2. On the board: `L 1C00 = 00 =`, then any key; the left digit shows a small t (LOAD is listening). Start playback at full volume.
3. Expected: after about 22 s the monitor shows its end message; `M 1C00 =` shows `3E`, then `23`, `D3` … as written; `EX 1C00 =` runs the program.
4. If nothing happens or the data are wrong: note the player and its volume, try a louder output (the book: the original input needs about 3 V RMS, a headphone output gives much less) or an amplifier, and whether the display changes during playback.

## Savia-84

Settled on the maintainer's board (2026-10-24, USER): a **2 MHz crystal without the divider** (the 7474 left out as Nostalcomp describes, so the CPU runs at 2 MHz), the **7400 fitted** (the book's decoder), a Soviet equivalent of the 2716 as the EPROM, nine digits, the digit 9 without its tail (the factory ROM), `Ad 0400 dA` to 0488 reads **7E** (the stale data bus: block 1 does not select the EPROM, so the upper half of the 2716 cannot be reached), and the RAM after power on (FFh with some noise at 1800). See [savia84.md](savia84.md).

### One session, keyboard only (done 2026-10-26)

Power on, then each test from the greeting SLAVIA 84 (it is the prompt; Reset brings it back). `Ad`, four digits, `dA` shows a byte; hex keys write it, `dA` moves on.

| Do | Expected (emulator) | Result on the board | Decides |
|---|---|---|---|
| `Ad 8000 dA` | `F3` (the first byte of the ROM) | `F3` | A15 is not decoded: 8000h mirrors 0000h. Confirmed. |
| `Ad 2000 dA` | `7E` | `7E` | A13 blocks the decoder; the stale bus. Confirmed. |
| `Ad 1810 dA`, `5`, `A`, then Reset, `Ad 9810 dA` | `5A` | the byte appears at 9810 | The RAM is mirrored at 9800h too. Confirmed. |
| `Ad 1FDF dA` right after power on | `FF` (the emulator's power-on fill) | `FF` | What L runs into on this board: RST 38h again. Confirmed. |
| Switch off and on, press `L` at the greeting, wait 2 s | the display goes wrong for a moment, then SLAVIA 84 again after about 0.3 s; `Ad 1800 dA` then shows `E0`, next `1F`, `E0`, `1F` … | as expected | The factory ROM's empty tape command: RST 38h repeats until the stack has run over the whole RAM and the monitor starts again. Confirmed. |

### Optional

- **The upper half of the EPROM.** Only with the chip out of the board in an EPROM programmer: read all 2 KiB and send the file (or its SHA-256). Decides whether the board's EPROM is the image in `roms/savia84/` (the lower half must be identical) and what the unused half holds.
- **Sound on PA7.** A speaker with an amplifier on PA7 and ground, a program that toggles PA7: it should play what the emulator plays through its virtual amplifier.
