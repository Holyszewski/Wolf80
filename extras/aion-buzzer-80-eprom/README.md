# AION Buzzer 80 in an EPROM for the PMI-80

The music demo AION Buzzer 80 (version 1.0.1, with the display) for a 1 KiB EPROM in the **second socket of the PMI-80**, addresses 0400h–07FFh. It plays as soon as it is started: two voices and drums, about 76 seconds, then again from the beginning, while the display shows what is being played.

It is the same program as the RAM edition among the emulator's demo programs (`programs/aion-buzzer-80`), which needs 976 bytes typed or loaded into RAM each time. In the EPROM it is there after every power on.

| File | What it is |
|---|---|
| `aion-buzzer-80-eprom-pmi80.bin` | The whole EPROM, 1024 bytes; the first byte belongs to address 0400h. |
| `aion-buzzer-80-eprom-pmi80.hex` | The same in Intel HEX, with the addresses 0400h–07FFh. |
| `aion-buzzer-80-eprom-pmi80-bytes.txt` | The same as a list of bytes with addresses. |
| `aion-buzzer-80-eprom-pmi80.asm` | The source. |

SHA-256 of the `.bin`: `a171f618b26197aa33278587c0af64b76918daf2e9c003146eed0b9b6a54ae6b`

## What you need

- A PMI-80 with a free second EPROM socket (on a board with the PMI-80 C monitor the socket holds its EPROM with the games COSMOS and TENIS3; this one takes its place).
- An EPROM of the type the board takes, 1 KiB (MHB8708, 2708), and a programmer for it.
- An amplifier or an active speaker on MG OUT of the tape connector K3: signal on pin 3, ground on pin 2. The board has no speaker of its own.

The monitor does not matter: the program calls nothing of it and reads nothing the monitor has prepared. All it needs from a monitor is a way to start a program at 0400h.

## Programming the EPROM

Use the `.bin` if the programmer counts addresses from zero: byte 000h of the file is address 0400h of the computer, byte 3FFh is 07FFh. The `.hex` carries the computer's addresses, 0400h–07FFh; if the programmer takes them as addresses in the chip, set an offset of −0400h or use the `.bin`.

The bytes 07E1h–07F3h are empty (FFh). The last twelve, 07F4h–07FFh, are the signature `Wolf2026v101`.

## Starting

With the EPROM in the second socket: `EX 0400 =` in the factory monitor and in PMI-80 C; in another monitor, its command that runs a program from an address, with 0400. RE stops it and returns to the monitor.

To check the EPROM first, read a few bytes with the monitor, `M 0400 =`: F3, 31, D9, 1F, 21, B9, 06, 11.

## Memory it uses

While it plays it uses RAM 1C00h–1D2Eh: at the start it copies 296 bytes of its own code there (the parts it changes as it plays) and keeps seven bytes of variables behind them. A program typed into that part of RAM is overwritten. The stack is at 1FD5h–1FD8h.

## The display

Left to right `AAA D B F P`: AAA is the address in the EPROM of the step being played (without its first digit, 0), D the drum (1 kick, 2 snare, 3 hi-hat), B the bass note (1–9, from the lowest), F the melody note (0–F, from the lowest), P the pattern (0–B). A voice that is silent shows nothing.

The digits flicker with the music and go dark for a moment at every drum: the processor makes the sound and lights the display in turns.

## Trying it in the emulator

Choose the PMI-80, open Memory and, at its end, Custom ROM; load the `.hex` (or the `.bin` at address 0400) and start it with `EX 0400 =`.

## How far it is tested

- In the emulator, with the factory monitor and with PMI-80 C: after `EX 0400 =` it plays the same sound, edge for edge, as the RAM edition (`tests/extras.test.mjs`).
- On a real PMI-80, from a programmed EPROM in the second socket: it plays (the author's board, November 2026).

The timing is for the PMI-80's 8080 at 10 MHz / 9. On another clock, or on a Z80 board (Savia-84, Stone 1), the pitch and the tempo would be different; it is not made for them.

## Author and licence

Matěj "Wolf" Holyszewski, 2026; created with the help of AI (OpenAI Codex). GPL-3.0-or-later, as the rest of the project.
