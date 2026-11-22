# Clocks for the PMI-80

A clock showing hours, minutes and seconds as HH-MM-SS, in four versions to type into RAM and one for an EPROM:

| File | Monitor | Bytes |
|---|---|---|
| `clock-pmi80.asm` | factory | 60 |
| `clock-pmi80c.asm` | PMI-80 C | 61 |
| `clock-cal-pmi80.asm` | factory, with a correction | 93 |
| `clock-cal-pmi80c.asm` | PMI-80 C, with a correction | 93 |
| `clock-eprom-pmi80.asm` | any; an EPROM in the second socket, with a correction, an alarm and a stopwatch | 1010 |

The clock for the EPROM asks for the time and the correction itself; it has its own chapter below, "The clock in an EPROM". The rest of this page, up to that chapter, is about the four clocks for RAM, but the correction means the same in all of them and is worked out the same way.

How to type a clock in and start it is at the top of each file. The plain versions run exactly at 10 MHz / 9, but no crystal is exactly 10 MHz, and an old one can be off by a few hundred millionths: then the clock gains or loses some seconds a day. The calibrated versions correct for that.

## The correction

The last two bytes of a calibrated clock, at 1C5B and 1C5C, are the correction. It reads as a number with two decimals: `50 00` is 50.00, `70 81` is 70.81.

- **50.00** (`50 00`, as typed in) corrects nothing: the clock runs exactly as the plain one.
- **Above 50** slows the clock down, for a board on which it gains.
- **Below 50** speeds it up, for a board on which it loses.

The difference from 50 is in seconds a day: 70.81 makes the clock 20.81 seconds a day slower than 50.00 would, and 45.50 makes it 4.5 seconds a day faster. So the correction is simply **50 plus the seconds a day the clock gains** (minus the seconds it loses).

## Working it out

1. Type in the calibrated clock with the correction as it is (`50 00`), or the plain clock.
2. Set it by an accurate clock (a phone, a radio-controlled clock) and start it on the exact second.
3. Let it run for a few days, the longer the better, with the board where it usually stands and without pressing keys.
4. Compare it with the accurate clock again. Write down how many seconds it is **ahead** (or **behind**) and how long it ran, in days (hours divided by 24).
5. Divide the seconds by the days: that is how much it **gains a day** (or loses).
6. The correction is the old one plus what it gains a day (minus what it loses), rounded to two decimals. Starting from `50 00`, that is 50 plus the gain.
7. Stop the clock with RE, write the two bytes from 1C5B (`M 1C5B =`, then each byte and `=`), set the time again and start it as before.

If the calibrated clock still gains or loses afterwards, repeat from step 4 and correct the correction the same way: add what it gains a day, subtract what it loses.

The correction can go from 00.00 to 99.99, that is from 50 seconds a day faster to 49.99 seconds a day slower. A board that needs more than that has a crystal far out of its tolerance (more than about 580 millionths).

## Examples

**A board on which the clock gains.** On the PMI-80 no. 1452, with the PMI-80 C monitor, the plain clock ran from 29 October, 21:09 to 6 November, 17:07: 7 days, 19 hours and 58 minutes, which is 7.83 days. It was 163 seconds ahead.

- 163 ÷ 7.83 = 20.81 seconds a day gained
- 50 + 20.81 = 70.81
- at 1C5B write `70`, at 1C5C write `81`

**A board on which it loses.** The clock is 9 seconds behind after 2 days.

- 9 ÷ 2 = 4.5 seconds a day lost
- 50 − 4.5 = 45.50
- at 1C5B `45`, at 1C5C `50`

**Fine tuning.** With 70.81 the clock still gains 1.2 seconds in 4 days.

- 1.2 ÷ 4 = 0.30 seconds a day gained
- 70.81 + 0.30 = 71.11
- at 1C5B `71`, at 1C5C `11`

## How exact it gets

One step of the correction is 0.01 second a day, much finer than you can measure. What limits the clock is the measurement and the crystal:

- **The measurement.** Reading the difference to a second over a week gives the gain to about 0.15 second a day; over a month, to a few hundredths.
- **Temperature.** The crystal's frequency moves a little with its temperature. On the PMI-80 the crystal sits next to the warm MH8224, so measure with the board running in its usual place for at least an hour beforehand. A room a few degrees warmer or colder can then still shift the clock by about a tenth of a second a day.
- **Keys.** A key held down while the clock runs makes it gain for as long as it is held.

## How it works

The plain clock waits for one second by showing the time a fixed number of times through the monitor's display routine, whose length is known to the state. The calibrated one makes every second slightly shorter, 1 110 468 states instead of 1 111 111, and adds 1286 states (one hundredth of a second a day) to some of them. Every second it adds the correction to a running sum at 1D03-1D04, and lengthens the second each time that sum passes 99.99. With 50.00 that is every other second, which gives exactly 1 111 111 states on average. With 70.81, 7081 seconds out of 10 000 are lengthened. The details are in the comments of the sources.

## The clock in an EPROM

`clock-eprom-pmi80.asm` is the clock for a 1 KiB EPROM (MHB8708, 2708) in the **second socket of the PMI-80**, addresses 0400h–07FFh, with an alarm and a stopwatch. Nothing is typed into memory: it asks for everything on its own display. It does not depend on the monitor, which only starts it.

| File | What it is |
|---|---|
| `clock-eprom-pmi80.bin` | The whole EPROM, 1024 bytes; the first byte belongs to address 0400h. |
| `clock-eprom-pmi80.hex` | The same in Intel HEX, with the addresses 0400h–07FFh. |
| `clock-eprom-pmi80-bytes.txt` | The same as a list of bytes with addresses. |
| `clock-eprom-pmi80.asm` | The source. |

SHA-256 of the `.bin`: `f8245ba0c96726eb6b03b117c626a72bc919130526cba0a92494eade37808825`

To program it, use the `.bin` if the programmer counts addresses from zero (byte 000h of the file is address 0400h). The `.hex` carries the computer's addresses; if the programmer takes them as addresses in the chip, set an offset of −0400h.

### Setting and starting

Start it with `EX 0400 =` (in another monitor: its command that runs a program from an address). Then it asks three things:

| | On the display | What to do |
|---|---|---|
| 1 | `CAS` for a second, then `00-00-00` | The time ("čas"). Type six digits, HHMMSS, and confirm with `=`. |
| 2 | `50-00-CAL` | The correction: the one used last, or the one in the EPROM. Confirm it with `=`, or type four digits first. |
| 3 | `StArt =` | The clock stands and waits. It starts at the moment `=` is pressed. |

- **Typing.** Digits go in from the left. The place being typed shows an underscore in turns with its digit. After the last place comes the first again, so a mistake is corrected by typing on. Only 0–9 are taken.
- **A time that cannot be,** such as 25-00-00 or 12-60-00, shows `Err` and is asked for again.
- **An exact start.** Set a time a little ahead and press `=` at `StArt =` at the moment that time comes.
- **Stopping.** RE. The time, the correction and the alarm stay in RAM while the board is on: the next `EX 0400 =` offers the time at which the clock was stopped and the correction used last. After power on it offers `00-00-00` and the correction in the EPROM.

### While it runs

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

### The correction in the EPROM

The correction the clock offers after power on is two bytes at **0403h and 0404h** (bytes 3 and 4 of the `.bin`), as it reads: `50 00` in the files here, which corrects nothing. To have the clock offer your board's correction, work it out as described above and change these two bytes before programming the EPROM: in the programmer's editor, or in the source (`CORR: DB 50h,00h`) followed by `node tools/make-listings.mjs`. For the board of the first example above they would be `70 81`.

To find the correction without programming twice, run the clock with `50-00`, measure how much it gains or loses a day, and type the result in at `CAL` on the next start. It is offered again at every start until the board is switched off; once it is right, program it.

### What it uses

RAM 1F00h–1F2Bh (the display, variables, the time at 1F22h–1F24h) and the stack below 1FC0h. The rest of the RAM is left alone.

### How it keeps time with keys in use

A second is a hundred rounds of the main loop, about 10 ms each. Every round is exactly as long as every other, whatever is shown and whatever is pressed: the scan of the display and the keys, the stopwatch and the picture are written without conditional jumps, and each of the thirteen ways through the handling of a key ends in a wait that makes it as long as the longest. The waits were set by measuring every path in the emulator. A test presses keys at random for forty seconds and checks the length of every round and every second.

### How far it is tested

In the emulator, with the factory monitor and with PMI-80 C (`tests/extras.test.mjs`): the questions and the typing, the refused times, the length of every second with 50.00 and with other corrections, the carries over midnight, random keys while it runs, the stopwatch, the alarm with its sound, and what is kept over RE. It has not been tried on a real board. The timing is for the PMI-80's 8080 at 10 MHz / 9.
