# SFMT80: the Science Fair Microcomputer Trainer on the PMI-80

The Science Fair Microcomputer Trainer (Radio Shack 28-260) is a 4-bit teaching computer of the 1980s: seven LEDs, one hexadecimal digit, a small speaker, a keyboard of twenty keys and a program memory of nibbles. SFMT80 turns a PMI-80 into one. It holds the trainer's panel, its monitor, its virtual machine with every instruction and service routine, and its seven built-in programs, in **the two 1 KiB EPROMs of the board**, in place of the PMI-80's monitor.

It was written anew for the 8080 after the behaviour of the original and holds no part of the trainer's own ROM. Programs from the trainer's manual are keyed in and run as on the trainer.

| File | What it is |
|---|---|
| `sfmt80-pmi80-0000.bin` | The EPROM for the monitor's socket, 0000h–03FFh, 1024 bytes. |
| `sfmt80-pmi80-0400.bin` | The EPROM for the second socket, 0400h–07FFh, 1024 bytes. |
| `sfmt80-pmi80.bin` | Both in one file, 2048 bytes (for the emulator, or for one 2 KiB memory on an adapted board). |
| `sfmt80-pmi80.hex` | The same in Intel HEX, with the addresses 0000h–07FFh. |
| `sfmt80-pmi80-bytes.txt` | The same as a list of bytes with addresses. |
| `sfmt80-pmi80.asm` | The source. |

SHA-256:

    571a69d32c2227d0167c0bef703ffd821b016c12df4463fdb3b2caa5d1c9efd2  sfmt80-pmi80-0000.bin
    d31d2b79b3dd127d77ee5162fe5a4f144b6d4c22c650d13648ac2f8d950c1748  sfmt80-pmi80-0400.bin

## What you need

- A PMI-80 with both EPROM sockets. **Both EPROMs of the board are replaced**, the monitor too: keep the original ones for the way back to the PMI-80.
- Two EPROMs of the type the board takes, 1 KiB each (MHB8708, 2708), and a programmer for them.
- An amplifier or an active speaker on MG OUT of the tape connector K3: signal on pin 3, ground on pin 2. The board has no speaker of its own. Without one everything works, silently.

## Programming the EPROMs

Each of the two `.bin` files is programmed from address 000h of its chip. The `.hex` carries the computer's addresses 0000h–07FFh for both; split it at 0400h, or use the two `.bin` files.

The image fills 0000h–07FEh; the last byte, 07FFh, is empty (FFh). There is no signature in it: the code needs the room.

## Starting and the keys

After power on, or after RE, the right digit shows **F**: the trainer's monitor at address 00, the memory full of F. RE on a running board keeps the program in the memory; switching off and on fills it with F again.

| PMI-80 | Trainer |
|---|---|
| `0`–`F` | `0`–`F` |
| `=` | RESET |
| `S` | RUN |
| `L` | INCR |
| `M` | ADRS SET |

The display, from the left: the trainer's LEDs 6 to 0 as the bottom segments of seven digits, one dark digit, and the hexadecimal digit.

Everything is done as on the trainer, so its manual applies:

- A program is keyed in as `=`, then each nibble followed by `L`. Two digits and `M` set the address.
- `= 1 S` runs the program in the memory; `= 2 S` runs it with the address on the LEDs; `= 5 S` and `= 6 S` step through it with `L`. `=` stops a program.
- The built-in programs: `= 9 S` the organ, `= A S` the automatic tune from the memory, `= B S` the guessing game, `= C S` rat bashing, `= D S` tennis, `= E S` the timer, `= F S` Morse code from the memory.

## Trying it in the emulator

Choose the PMI-80, open Memory and, at its end, Custom ROM; load `sfmt80-pmi80.hex` (or `sfmt80-pmi80.bin` at address 0000). The image lies over the whole monitor, so the computer starts as the trainer, whichever monitor is chosen. The keys of the emulated keyboard keep their PMI-80 labels; the table above says which is which. Removing the custom ROM brings the PMI-80 back.

## What differs from the trainer

Chosen on purpose, to fit the two EPROMs or to make it nicer to use:

- **Speed of a program.** Every instruction takes the same time, about 2.2 ms (3 ms with the address LEDs); on the trainer they differ a little from one another. Tones, the timer and the built-in programs keep the trainer's timing, within a few per cent.
- **Chance.** The guessing game and rat bashing draw their numbers their own way; the sequences are not those of the trainer.
- **RESET** also leaves rat bashing, tennis and the timer, which on the trainer end only by switching off.
- **The LEDs stay lit while a tone plays.** On the trainer LED 3 shares its output with the speaker; here a change of it from a program gives a short tick on MG OUT.
- **Brightness.** The PMI-80's display is multiplexed and the same processor makes the sound: a running program shows at about half the brightness of the monitor, and the middle segment of the digit dims during a tone.

Known small differences that did not fit (one byte is left):

- Tennis: after a swing made too early the trainer's ball flies 12 % slower; here its speed stays. A serve needs a new press of the key; on the trainer a held key serves by itself.
- Rat bashing: after the tenth rat the trainer waits a second before the final tune; here the tune comes at once. The trainer clicks when the speed is chosen; here that key is silent.
- The organ with two keys down: the trainer plays the first tone until both are up; here the tone ends with the first. The keys 0 and F, which give no tone, show when pressed on the trainer and when released here; ADRS SET lights LED 3 on the trainer and nothing here.
- The timer: after it has run down, RUN darkens the digit on the trainer and does nothing here.
- Monitor: after setting an address above 6F the trainer shows the digit typed last, here the contents of the cell. Key presses shorter than about 40 ms are sometimes lost on the trainer and all counted here.

## Memory it uses

EPROMs 0000h–07FEh. RAM: 1C00h–1C7Fh the trainer's memory 00–7F, one nibble a byte (the registers A at 6F, B at 6C, Y at 6E, Z at 6B, the flag at 6D); 1C80h–1C9Bh variables; 1F00h–1F20h the display, the picture of the keys and the warm start mark; the stack below 1F00h, up to 20 bytes deep. Interrupts stay disabled. The 8255 at F8h–FBh is set to 8Ah as the monitor sets it.

## How far it is tested

- Against the original: the same keys were played on an emulation of the trainer running its own ROM and on this program in Wolf80, and what is seen and heard was compared: the monitor, the run modes, every instruction and service routine, the tones, the timer and the seven built-in programs, with wrong and held keys too. Those tests need the trainer's ROM and are not in this repository.
- In this repository (`tests/extras.test.mjs`): the image is the one above; it starts, takes keys with the click of the trainer, stores and runs a program, and behaves the same loaded as a custom ROM.
- On a real PMI-80, from two programmed EPROMs: it works (the author's board, November 2026).

The timing is for the PMI-80's 8080 at 10 MHz / 9. On another clock, or on a Z80 board (Savia-84, Stone 1), the pitch and the timing would be different; it is not made for them.

## Author and licence

Matěj "Wolf" Holyszewski, 2026; created with the help of AI (Claude by Anthropic). GPL-3.0-or-later, as the rest of the project. "Science Fair" and "Radio Shack" are names of the original's maker, used here only to say what the program imitates.
