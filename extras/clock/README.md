# Clocks for the PMI-80

A clock showing hours, minutes and seconds as HH-MM-SS, in four versions:

| File | Monitor | Bytes |
|---|---|---|
| `clock-pmi80.asm` | factory | 60 |
| `clock-pmi80c.asm` | PMI-80 C | 61 |
| `clock-cal-pmi80.asm` | factory, with a correction | 93 |
| `clock-cal-pmi80c.asm` | PMI-80 C, with a correction | 93 |

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
