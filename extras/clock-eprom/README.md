# A clock in an EPROM for the PMI-80

`clock-eprom-pmi80.asm` is a clock showing hours, minutes and seconds as HH-MM-SS for a 1 KiB EPROM (MHB8708, 2708) in the **second socket of the PMI-80**, addresses 0400h–07FFh, with an alarm and a stopwatch. Nothing is typed into memory: it asks for everything on its own display. It does not depend on the monitor, which only starts it.

| File | What it is |
|---|---|
| `clock-eprom-pmi80.bin` | The whole EPROM, 1024 bytes; the first byte belongs to address 0400h. |
| `clock-eprom-pmi80.hex` | The same in Intel HEX, with the addresses 0400h–07FFh. |
| `clock-eprom-pmi80-bytes.txt` | The same as a list of bytes with addresses. |
| `clock-eprom-pmi80.asm` | The source. |

SHA-256 of the `.bin`: `f8245ba0c96726eb6b03b117c626a72bc919130526cba0a92494eade37808825`

To program it, use the `.bin` if the programmer counts addresses from zero (byte 000h of the file is address 0400h). The `.hex` carries the computer's addresses; if the programmer takes them as addresses in the chip, set an offset of −0400h.

## Setting and starting

Start it with `EX 0400 =` (in another monitor: its command that runs a program from an address). Then it asks three things:

| | On the display | What to do |
|---|---|---|
| 1 | `CAS` for a second, then `00-00-00` | The time ("čas"). Type six digits, HHMMSS, and confirm with `=`. |
| 2 | `50-00-CAL` | The correction for the board's crystal: the one used last, or the one in the EPROM. `50-00` corrects nothing; above 50 slows the clock down by that many seconds a day, below 50 speeds it up. Confirm it with `=`, or type four digits first. |
| 3 | `StArt =` | The clock stands and waits. It starts at the moment `=` is pressed. |

- **Typing.** Digits go in from the left. The place being typed shows an underscore in turns with its digit. After the last place comes the first again, so a mistake is corrected by typing on. Only 0–9 are taken.
- **A time that cannot be,** such as 25-00-00 or 12-60-00, shows `Err` and is asked for again.
- **An exact start.** Set a time a little ahead and press `=` at `StArt =` at the moment that time comes.
- **Stopping.** RE. The time, the correction and the alarm stay in RAM while the board is on: the next `EX 0400 =` offers the time at which the clock was stopped and the correction used last. After power on it offers `00-00-00` and the correction in the EPROM.

## While it runs

| Key | What it does |
|---|---|
| `B` | The alarm ("budík"). |
| `S` | The stopwatch ("stopky"), and back to the clock. |

Other keys do nothing. No key disturbs the clock, whether pressed or held: every second takes exactly as long as it would untouched.

**The alarm.** `B` shows its time as `07-30-bUd`. Type four digits, HHMM, as when setting the clock.

- `=` sets the alarm and turns it **on**. With the time as it is, `B` and `=` just turn it on.
- `B` once more turns it **off**.
- While the alarm is on, the top right segment of the last digit is lit, beside the seconds.
- At its time the clock beeps on MG OUT of the tape connector K3 (pin 3, ground pin 2; an amplifier or an active speaker is needed) for a minute, or until any key is pressed. That key does nothing else. The alarm stays on for the next day.
- The time of the alarm is not checked: one that cannot be, such as 25-00, never comes.
- While it beeps, the middle segments of the digits are dark in the rhythm of the beeps: the same output drives them and the sound.

**The stopwatch.** `S` shows it as minutes, seconds and hundredths, `00-00-00`.

- `=` starts and stops it. Stopped, it keeps its value; `=` goes on from there.
- `0` clears it and stops it.
- `S` returns to the clock. The stopwatch goes on meanwhile, and the clock goes on behind the stopwatch.
- It counts to 99 minutes 59.99 seconds and then from zero again. A hundredth is one round of the program, so it is as exact as the clock.

## The correction in the EPROM

The correction the clock offers after power on is two bytes at **0403h and 0404h** (bytes 3 and 4 of the `.bin`), as it reads: `50 00` in the files here, which corrects nothing. To have the clock offer your board's correction, work it out as described in [`../clock/README.md`](../clock/README.md) and change these two bytes before programming the EPROM: in the programmer's editor, or in the source (`CORR: DB 50h,00h`) followed by `node tools/make-listings.mjs`. For the board of the first example there they would be `70 81`.

To find the correction without programming twice, run the clock with `50-00`, measure how much it gains or loses a day, and type the result in at `CAL` on the next start. It is offered again at every start until the board is switched off; once it is right, program it.

## What it uses

RAM 1F00h–1F2Bh (the display, variables, the time at 1F22h–1F24h) and the stack below 1FC0h. The rest of the RAM is left alone.

## How it keeps time with keys in use

A second is a hundred rounds of the main loop, about 10 ms each. Every round is exactly as long as every other, whatever is shown and whatever is pressed: the scan of the display and the keys, the stopwatch and the picture are written without conditional jumps, and each of the thirteen ways through the handling of a key ends in a wait that makes it as long as the longest. The waits were set by measuring every path in the emulator. A test presses keys at random for forty seconds and checks the length of every round and every second.

## How far it is tested

In the emulator, with the factory monitor and with PMI-80 C (`tests/extras.test.mjs`): the questions and the typing, the refused times, the length of every second with 50.00 and with other corrections, the carries over midnight, random keys while it runs, the stopwatch, the alarm with its sound, and what is kept over RE. It has not been tried on a real board. The timing is for the PMI-80's 8080 at 10 MHz / 9.
