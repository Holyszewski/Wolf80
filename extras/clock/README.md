# A clock for the PMI-80

*Česky: [níže](#cesky), nebo v souboru `CTIMNE.txt`.*

**Version 0.1.0.** A clock showing hours, minutes and seconds as HH-MM-SS, small enough to type into RAM by hand: 93 bytes from 1C00. It can be corrected for the board's own crystal.

| File | Monitor |
|---|---|
| `clock-cal-pmi80.asm` | factory |
| `clock-cal-pmi80c.asm` | PMI-80 C |

The two differ only in their trimming: the clock counts the length of the monitor's display routine, which is not the same in the two monitors, and on the other monitor it would be about a tenth off. Beside each source there are its Intel HEX (`.hex`) and its list of bytes to type in (`-bytes.txt`).

The clock is made for the PMI-80's 8080 at 10 MHz / 9. A bigger clock for an EPROM, which asks for the time itself and has an alarm and a stopwatch, is `clock-eprom` in the same collection.

## Typing it in and starting

1. Type the bytes in from 1C00: `M 1C00 =`, then each byte followed by `=`.
2. Write the start time at 1D00–1D02, as it reads: hours at 1D00, minutes at 1D01, seconds at 1D02. For 14:30:00 that is `14`, `30`, `00`.
3. `RE`, `=` and then `EX 1C00 =`. The clock starts at the last `=`.

`RE` stops it; the time stays at 1D00–1D02. Do not press other keys while it runs: a key held down makes the clock gain for as long as it is held.

## The correction

As typed in, the clock runs exactly at 10 MHz / 9. But no crystal is exactly 10 MHz, and an old one can be off by a few hundred millionths: then the clock gains or loses some seconds a day. The correction is for that.

The last two bytes of the clock, at 1C5B and 1C5C, are the correction. It reads as a number with two decimals: `50 00` is 50.00, `70 81` is 70.81.

- **50.00** (`50 00`, as typed in) corrects nothing.
- **Above 50** slows the clock down, for a board on which it gains.
- **Below 50** speeds it up, for a board on which it loses.

The difference from 50 is in seconds a day: 70.81 makes the clock 20.81 seconds a day slower than 50.00 would, and 45.50 makes it 4.5 seconds a day faster. So the correction is simply **50 plus the seconds a day the clock gains** (minus the seconds it loses).

## Working it out

1. Type in the clock with the correction as it is (`50 00`).
2. Set it by an accurate clock (a phone, a radio-controlled clock) and start it on the exact second.
3. Let it run for a few days, the longer the better, with the board where it usually stands and without pressing keys.
4. Compare it with the accurate clock again. Write down how many seconds it is **ahead** (or **behind**) and how long it ran, in days (hours divided by 24).
5. Divide the seconds by the days: that is how much it **gains a day** (or loses).
6. The correction is the old one plus what it gains a day (minus what it loses), rounded to two decimals. Starting from `50 00`, that is 50 plus the gain.
7. Stop the clock with `RE`, write the two bytes from 1C5B (`M 1C5B =`, then each byte and `=`), set the time again and start it as before.

If the clock still gains or loses afterwards, repeat from step 4 and correct the correction the same way: add what it gains a day, subtract what it loses.

The correction can go from 00.00 to 99.99, that is from 50 seconds a day faster to 49.99 seconds a day slower. A board that needs more than that has a crystal far out of its tolerance (more than about 580 millionths).

## Examples

**A board on which the clock gains.** With the correction `50 00` the clock ran for 7 days, 19 hours and 58 minutes, which is 7.83 days. It was 163 seconds ahead.

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

The clock waits by showing the time a fixed number of times through the monitor's display routine, whose length is known to the state. It makes every second slightly shorter than it should be, 1 110 468 states instead of 1 111 111, and adds 1286 states (one hundredth of a second a day) to some of them. Every second it adds the correction to a running sum at 1D03–1D04, and lengthens the second each time that sum passes 99.99. With 50.00 that is every other second, which gives exactly 1 111 111 states on average. With 70.81, 7081 seconds out of 10 000 are lengthened. The details are in the comments of the sources.

## Memory it uses

The program at 1C00h–1C5Ch, the time at 1D00h–1D02h, the running sum at 1D03h–1D04h. The stack stays where the monitor left it.

## Author and licence

Matěj "Wolf" Holyszewski, 2026; written with the help of AI. GPL-3.0-or-later. The clock is a part of the extras of the emulator Wolf80: https://github.com/Holyszewski/Wolf80

---

<a id="cesky"></a>

# Hodiny pro PMI-80

**Verze 0.1.0.** Hodiny, které ukazují hodiny, minuty a sekundy jako HH-MM-SS a jsou tak malé, že se dají do paměti RAM naťukat ručně: 93 bajtů od adresy 1C00. Dají se zkalibrovat podle krystalu konkrétní desky.

| Soubor | Monitor |
|---|---|
| `clock-cal-pmi80.asm` | tovární |
| `clock-cal-pmi80c.asm` | PMI-80 C |

Obě verze se liší jen doladěním: hodiny počítají délku zobrazovací rutiny monitoru a ta je v každém monitoru jiná. Na druhém monitoru by se hodiny rozcházely asi o desetinu. U každého zdroje je i Intel HEX (`.hex`) a výpis bajtů k naťukání (`-bytes.txt`).

Hodiny jsou určené pro PMI-80 s procesorem 8080 na 10 MHz / 9. Větší hodiny do EPROM, které se na čas zeptají samy a mají budík a stopky, jsou ve stejné sbírce jako `clock-eprom`.

## Zadání a spuštění

1. Naťukej bajty od adresy 1C00: `M 1C00 =`, pak každý bajt a `=`.
2. Na adresy 1D00–1D02 zapiš výchozí čas tak, jak se čte: hodiny na 1D00, minuty na 1D01, sekundy na 1D02. Pro 14:30:00 je to `14`, `30`, `00`.
3. `RE`, `=` a potom `EX 1C00 =`. Hodiny se rozběhnou posledním `=`.

`RE` hodiny zastaví; čas zůstane na 1D00–1D02. Za běhu nemačkej jiné klávesy: držená klávesa hodiny zrychluje po celou dobu, co ji držíš.

## Korekce

Tak, jak se hodiny naťukají, běží přesně pro 10 MHz / 9. Žádný krystal ale nemá přesně 10 MHz a starý může být vedle o pár set miliontin: hodiny se pak za den o několik sekund předběhnou nebo zpozdí. Na to je korekce.

Korekce jsou poslední dva bajty programu, na adresách 1C5B a 1C5C. Čte se jako číslo se dvěma desetinnými místy: `50 00` je 50,00, `70 81` je 70,81.

- **50,00** (`50 00`, jak je ve výpisu) neopravuje nic.
- **Nad 50** hodiny zpomaluje, pro desku, na které se předbíhají.
- **Pod 50** hodiny zrychluje, pro desku, na které se zpožďují.

Rozdíl od 50 je v sekundách za den: s 70,81 jdou hodiny o 20,81 sekundy za den pomaleji než s 50,00, se 45,50 o 4,5 sekundy za den rychleji. Korekce je tedy prostě **50 plus počet sekund, o které se hodiny za den předběhnou** (minus počet sekund, o které se zpozdí).

## Jak korekci zjistit

1. Naťukej hodiny s korekcí tak, jak je (`50 00`).
2. Nastav je podle přesných hodin (telefon, rádiem řízené hodiny) a spusť je přesně na sekundu.
3. Nech je běžet několik dní, čím déle, tím lépe. Deska ať stojí tam, kde obvykle, a nemačkej klávesy.
4. Porovnej je znovu s přesnými hodinami. Zapiš si, o kolik sekund jsou **napřed** (nebo **pozadu**) a jak dlouho běžely, ve dnech (hodiny děleno 24).
5. Vyděl sekundy dny: tolik se hodiny **předběhnou za den** (nebo zpozdí).
6. Nová korekce je ta stará plus to, o co se hodiny za den předběhnou (minus to, o co se zpozdí), zaokrouhleno na dvě desetinná místa. Když začínáš z `50 00`, je to 50 plus předbíhání.
7. Zastav hodiny klávesou `RE`, zapiš dva bajty od 1C5B (`M 1C5B =`, pak každý bajt a `=`), nastav znovu čas a spusť je jako předtím.

Když se hodiny i potom předbíhají nebo zpožďují, opakuj postup od kroku 4 a korekci oprav stejně: přičti, o co se za den předběhnou, odečti, o co se zpozdí.

Korekce může být od 00,00 do 99,99, tedy od zrychlení o 50 sekund za den po zpomalení o 49,99 sekundy za den. Deska, která potřebuje víc, má krystal daleko mimo toleranci (víc než asi 580 miliontin).

## Příklady

**Deska, na které se hodiny předbíhají.** S korekcí `50 00` běžely hodiny 7 dní, 19 hodin a 58 minut, tedy 7,83 dne. Byly o 163 sekund napřed.

- 163 ÷ 7,83 = 20,81 sekundy za den napřed
- 50 + 20,81 = 70,81
- na 1C5B zapiš `70`, na 1C5C `81`

**Deska, na které se zpožďují.** Hodiny jsou po 2 dnech o 9 sekund pozadu.

- 9 ÷ 2 = 4,5 sekundy za den pozadu
- 50 − 4,5 = 45,50
- na 1C5B `45`, na 1C5C `50`

**Doladění.** S korekcí 70,81 se hodiny za 4 dny předběhnou ještě o 1,2 sekundy.

- 1,2 ÷ 4 = 0,30 sekundy za den napřed
- 70,81 + 0,30 = 71,11
- na 1C5B `71`, na 1C5C `11`

## Jak přesné to může být

Jeden krok korekce je 0,01 sekundy za den, mnohem jemnější, než dokážeš změřit. Přesnost hodin omezuje měření a krystal:

- **Měření.** Když odečteš rozdíl na sekundu za týden, znáš předbíhání asi na 0,15 sekundy za den; za měsíc na pár setin.
- **Teplota.** Kmitočet krystalu se trochu mění s teplotou. Na PMI-80 sedí krystal hned vedle teplého obvodu MH8224, takže měř s deskou, která už aspoň hodinu běží na svém obvyklém místě. Místnost o pár stupňů teplejší nebo chladnější pak hodiny pořád může posunout asi o desetinu sekundy za den.
- **Klávesy.** Klávesa držená za běhu hodiny zrychluje po celou dobu, co ji držíš.

## Jak to funguje

Hodiny čekají tak, že čas ukážou pevně daným počtem průchodů zobrazovací rutinou monitoru, jejíž délka je známá na takt přesně. Každou sekundu dělají o něco kratší, než má být, 1 110 468 taktů místo 1 111 111, a k některým přidají 1286 taktů (jednu setinu sekundy za den). Každou sekundu přičtou korekci k průběžnému součtu na 1D03–1D04, a kdykoli součet přeteče přes 99,99, sekundu prodlouží. S 50,00 je to každá druhá sekunda, což dává v průměru přesně 1 111 111 taktů. Se 70,81 se prodlouží 7081 sekund z 10 000. Podrobnosti jsou v komentářích zdrojů.

## Využitá paměť

Program na 1C00h–1C5Ch, čas na 1D00h–1D02h, průběžný součet na 1D03h–1D04h. Zásobník zůstává tam, kde ho nechal monitor.

## Autor a licence

Matěj „Wolf“ Holyszewski, 2026; napsáno s pomocí AI. GPL-3.0-or-later. Hodiny jsou součástí doplňků (extras) emulátoru Wolf80: https://github.com/Holyszewski/Wolf80
