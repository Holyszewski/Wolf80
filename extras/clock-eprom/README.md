# A clock in an EPROM for the PMI-80

*Česky: [níže](#cesky), nebo v souboru `CTIMNE.txt`.*

**Version 0.2.0.** A clock showing hours, minutes and seconds as HH-MM-SS, with an alarm and a stopwatch, for a 1 KiB EPROM in the **second socket of the PMI-80**, addresses 0400h–07FFh. Nothing is typed into memory: it asks for everything on its own display. It can be corrected for the board's own crystal, and no key pressed while it runs disturbs its seconds.

| File | What it is |
|---|---|
| `clock-eprom-pmi80.bin` | The whole EPROM, 1024 bytes; the first byte belongs to address 0400h. |
| `clock-eprom-pmi80.hex` | The same in Intel HEX, with the addresses 0400h–07FFh. |
| `clock-eprom-pmi80-bytes.txt` | The same as a list of bytes with addresses. |
| `clock-eprom-pmi80.asm` | The source. |

SHA-256 of the `.bin`: `f8245ba0c96726eb6b03b117c626a72bc919130526cba0a92494eade37808825`

## What you need

- A PMI-80 with a free second EPROM socket (on a board with the PMI-80 C monitor the socket holds its EPROM with the games; this one takes its place). The clock is timed for the PMI-80's 8080 at 10 MHz / 9.
- An EPROM of the type the board takes, 1 KiB (MHB8708, 2708), and a programmer for it.
- For the alarm, an amplifier or an active speaker on MG OUT of the tape connector K3: signal on pin 3, ground on pin 2.

The monitor does not matter: the clock calls nothing of it. All it needs from a monitor is a way to start a program at 0400h.

## Programming the EPROM

Use the `.bin` if the programmer counts addresses from zero: byte 000h of the file is address 0400h of the computer. The `.hex` carries the computer's addresses; if the programmer takes them as addresses in the chip, set an offset of −0400h.

The last twelve bytes, 07F4h–07FFh, are the signature `Wolf2026v020`.

## Setting and starting

Start it with `EX 0400 =` (in another monitor: its command that runs a program from an address). Then it asks three things:

| | On the display | What to do |
|---|---|---|
| 1 | `CAS` for a second, then `00-00-00` | The time ("čas"). Type six digits, HHMMSS, and confirm with `=`. |
| 2 | `50-00-CAL` | The correction for the board's crystal: the one used last, or the one in the EPROM. `50-00` corrects nothing. Confirm it with `=`, or type four digits first. |
| 3 | `StArt =` | The clock stands and waits. It starts at the moment `=` is pressed. |

- **Typing.** Digits go in from the left. The place being typed shows an underscore in turns with its digit. After the last place comes the first again, so a mistake is corrected by typing on. Only 0–9 are taken.
- **A time that cannot be,** such as 25-00-00 or 12-60-00, shows `Err` and is asked for again.
- **An exact start.** Set a time a little ahead and press `=` at `StArt =` at the moment that time comes.
- **Stopping.** `RE`. The time, the correction and the alarm stay in RAM while the board is on: the next `EX 0400 =` offers the time at which the clock was stopped and the correction used last. After power on it offers `00-00-00` and the correction in the EPROM.

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
- At its time the clock beeps on MG OUT for a minute, or until any key is pressed. That key does nothing else. The alarm stays on for the next day.
- The time of the alarm is not checked: one that cannot be, such as 25-00, never comes.
- While it beeps, the middle segments of the digits are dark in the rhythm of the beeps: the same output drives them and the sound.

**The stopwatch.** `S` shows it as minutes, seconds and hundredths, `00-00-00`.

- `=` starts and stops it. Stopped, it keeps its value; `=` goes on from there.
- `0` clears it and stops it.
- `S` returns to the clock. The stopwatch goes on meanwhile, and the clock goes on behind the stopwatch.
- It counts to 99 minutes 59.99 seconds and then from zero again.

## The correction

No crystal is exactly 10 MHz, and an old one can be off by a few hundred millionths: then the clock gains or loses some seconds a day. The correction makes up for that. It reads as a number with two decimals: `50-00` is 50.00.

- **50.00** corrects nothing.
- **Above 50** slows the clock down, for a board on which it gains.
- **Below 50** speeds it up, for a board on which it loses.

The difference from 50 is in seconds a day, so the correction is **50 plus the seconds a day the clock gains** (minus the seconds it loses). It can go from 00.00 to 99.99.

To work it out:

1. Start the clock with `50-00`, set by an accurate clock, on the exact second.
2. Let it run for a few days, the longer the better, with the board where it usually stands.
3. Compare it with the accurate clock. Divide the seconds it is ahead (or behind) by the days it ran: that is what it gains (or loses) a day.
4. Add what it gains a day to the correction, or subtract what it loses, and type the result in at `CAL` on the next start.

An example: the clock is 163 seconds ahead after 7.83 days. 163 ÷ 7.83 = 20.81 seconds a day; 50 + 20.81 = 70.81; the correction is `70-81`. If it then still gains 1.2 seconds in 4 days, that is 0.30 a day more: `71-11`.

The crystal's frequency moves a little with its temperature, so measure with the board running in its usual place for at least an hour beforehand.

**The correction in the EPROM.** The correction typed at `CAL` is offered again at every start until the board is switched off. The one offered after power on is two bytes at **0403h and 0404h** (bytes 3 and 4 of the `.bin`), as it reads: `50 00` in the files here. Once you know your board's correction, change these two bytes before programming the EPROM: in the programmer's editor, or in the source (`CORR: DB 50h,00h`). For the example above they would be `70 81`.

## Memory it uses

RAM 1F00h–1F2Bh (the display, variables, the time at 1F22h–1F24h) and the stack below 1FC0h. The rest of the RAM is left alone.

## How it keeps time with keys in use

A second is a hundred rounds of the main loop, about 10 ms each. Every round is exactly as long as every other, whatever is shown and whatever is pressed: the scan of the display and the keys, the stopwatch and the picture are written without conditional jumps, and each of the thirteen ways through the handling of a key ends in a wait that makes it as long as the longest. A hundredth of the stopwatch is one round, so it is as exact as the clock.

## Author and licence

Matěj "Wolf" Holyszewski, 2026; written with the help of AI. GPL-3.0-or-later. The clock is a part of the extras of the emulator Wolf80, where it can also be tried as a custom ROM: https://github.com/Holyszewski/Wolf80

---

<a id="cesky"></a>

# Hodiny do EPROM pro PMI-80

**Verze 0.2.0.** Hodiny, které ukazují hodiny, minuty a sekundy jako HH-MM-SS, s budíkem a stopkami, pro 1KiB EPROM ve **druhé patici PMI-80**, adresy 0400h–07FFh. Nic se neťuká do paměti: na všechno se zeptají na vlastním displeji. Dají se zkalibrovat podle krystalu konkrétní desky a žádná klávesa stisknutá za běhu jim nenaruší délku sekundy.

| Soubor | Co to je |
|---|---|
| `clock-eprom-pmi80.bin` | Celá EPROM, 1024 bajtů; první bajt patří na adresu 0400h. |
| `clock-eprom-pmi80.hex` | Totéž ve formátu Intel HEX, s adresami 0400h–07FFh. |
| `clock-eprom-pmi80-bytes.txt` | Totéž jako výpis bajtů s adresami. |
| `clock-eprom-pmi80.asm` | Zdrojový text. |

SHA-256 souboru `.bin`: `f8245ba0c96726eb6b03b117c626a72bc919130526cba0a92494eade37808825`

## Co je potřeba

- PMI-80 s volnou druhou paticí pro EPROM (na desce s monitorem PMI-80 C je v ní EPROM s hrami; tahle přijde na její místo). Hodiny jsou časované pro PMI-80 s procesorem 8080 na 10 MHz / 9.
- EPROM typu, který deska bere, 1 KiB (MHB8708, 2708), a programátor.
- Pro budík zesilovač nebo aktivní reproduktor na výstupu MG OUT magnetofonového konektoru K3: signál na špičce 3, zem na špičce 2.

Na monitoru nezáleží: hodiny z něj nic nevolají. Od monitoru potřebují jen to, aby uměl spustit program od adresy 0400h.

## Programování EPROM

Použij `.bin`, pokud programátor počítá adresy od nuly: bajt 000h souboru je adresa 0400h počítače. Soubor `.hex` nese adresy počítače; pokud je programátor bere jako adresy v čipu, nastav posun −0400h.

Posledních dvanáct bajtů, 07F4h–07FFh, je podpis `Wolf2026v020`.

## Nastavení a spuštění

Spusť je příkazem `EX 0400 =` (v jiném monitoru jeho příkazem pro spuštění programu od adresy). Pak se zeptají na tři věci:

| | Na displeji | Co udělat |
|---|---|---|
| 1 | na sekundu `CAS`, pak `00-00-00` | Čas. Naťukej šest číslic, HHMMSS, a potvrď `=`. |
| 2 | `50-00-CAL` | Korekce podle krystalu desky: ta naposledy použitá, nebo ta z EPROM. `50-00` neopravuje nic. Potvrď ji `=`, nebo předtím naťukej čtyři číslice. |
| 3 | `StArt =` | Hodiny stojí a čekají. Rozběhnou se v okamžiku stisku `=`. |

- **Psaní.** Číslice se zadávají zleva. Na místě, které se právě píše, se střídá podtržítko s číslicí. Po posledním místě přijde zase první, takže chybu opravíš tím, že píšeš dál. Berou se jen číslice 0–9.
- **Čas, který nemůže být,** například 25-00-00 nebo 12-60-00, ukáže `Err` a hodiny se zeptají znovu.
- **Přesný start.** Nastav čas o chvilku napřed a u `StArt =` stiskni `=` ve chvíli, kdy ten čas nastane.
- **Zastavení.** `RE`. Čas, korekce i budík zůstávají v RAM, dokud je deska zapnutá: další `EX 0400 =` nabídne čas, ve kterém byly hodiny zastaveny, a naposledy použitou korekci. Po zapnutí napájení nabídnou `00-00-00` a korekci z EPROM.

## Za běhu

| Klávesa | Co dělá |
|---|---|
| `B` | Budík. |
| `S` | Stopky, a zpět na hodiny. |

Ostatní klávesy nedělají nic. Žádná klávesa hodiny neruší, ať je stisknutá krátce, nebo držená: každá sekunda trvá přesně stejně, jako kdyby ses jich nedotkl.

**Budík.** `B` ukáže jeho čas jako `07-30-bUd`. Naťukej čtyři číslice, HHMM, stejně jako při nastavení hodin.

- `=` budík nastaví a **zapne**. Když čas neměníš, `B` a `=` ho jen zapnou.
- Další stisk `B` ho **vypne**.
- Když je budík zapnutý, svítí vpravo nahoře segment poslední číslice, vedle sekund.
- Ve svůj čas hodiny pípají na výstupu MG OUT, minutu nebo do stisku libovolné klávesy. Ta klávesa nic jiného neudělá. Budík zůstane zapnutý i na další den.
- Čas budíku se nekontroluje: čas, který nemůže být, například 25-00, nikdy nenastane.
- Při pípání pohasínají v rytmu pípání prostřední segmenty číslic: stejný výstup řídí je i zvuk.

**Stopky.** `S` je ukáže jako minuty, sekundy a setiny, `00-00-00`.

- `=` je spouští a zastavuje. Zastavené si drží hodnotu; `=` pokračuje od ní.
- `0` je vynuluje a zastaví.
- `S` se vrátí na hodiny. Stopky mezitím běží dál a hodiny běží dál za stopkami.
- Počítají do 99 minut 59,99 sekundy a pak znovu od nuly.

## Korekce

Žádný krystal nemá přesně 10 MHz a starý může být vedle o pár set miliontin: hodiny se pak za den o několik sekund předběhnou nebo zpozdí. Korekce to vyrovnává. Čte se jako číslo se dvěma desetinnými místy: `50-00` je 50,00.

- **50,00** neopravuje nic.
- **Nad 50** hodiny zpomaluje, pro desku, na které se předbíhají.
- **Pod 50** hodiny zrychluje, pro desku, na které se zpožďují.

Rozdíl od 50 je v sekundách za den, takže korekce je **50 plus počet sekund, o které se hodiny za den předběhnou** (minus počet sekund, o které se zpozdí). Může být od 00,00 do 99,99.

Jak ji zjistit:

1. Spusť hodiny s `50-00`, nastavené podle přesných hodin, přesně na sekundu.
2. Nech je běžet několik dní, čím déle, tím lépe. Deska ať stojí tam, kde obvykle.
3. Porovnej je s přesnými hodinami. Vyděl sekundy, o které jsou napřed (nebo pozadu), počtem dní běhu: tolik se za den předběhnou (nebo zpozdí).
4. Přičti ke korekci to, o co se za den předběhnou, nebo odečti to, o co se zpozdí, a výsledek naťukej při dalším spuštění u `CAL`.

Příklad: hodiny jsou po 7,83 dne o 163 sekund napřed. 163 ÷ 7,83 = 20,81 sekundy za den; 50 + 20,81 = 70,81; korekce je `70-81`. Když se pak ještě za 4 dny předběhnou o 1,2 sekundy, je to dalších 0,30 za den: `71-11`.

Kmitočet krystalu se trochu mění s teplotou, takže měř s deskou, která už aspoň hodinu běží na svém obvyklém místě.

**Korekce v EPROM.** Korekci naťukanou u `CAL` hodiny nabízejí při každém spuštění, dokud desku nevypneš. Ta, kterou nabídnou po zapnutí napájení, jsou dva bajty na adresách **0403h a 0404h** (bajty 3 a 4 souboru `.bin`), tak jak se čte: v souborech zde `50 00`. Až budeš znát korekci své desky, změň tyto dva bajty před programováním EPROM: v editoru programátoru, nebo ve zdrojovém textu (`CORR: DB 50h,00h`). Pro příklad výše by to bylo `70 81`.

## Využitá paměť

RAM 1F00h–1F2Bh (displej, proměnné, čas na 1F22h–1F24h) a zásobník pod 1FC0h. Zbytek RAM zůstává nedotčený.

## Jak drží čas i při mačkání kláves

Sekunda je sto průchodů hlavní smyčkou, každý asi 10 ms. Každý průchod trvá přesně stejně jako všechny ostatní, ať se ukazuje cokoli a mačká cokoli: obsluha displeje a kláves, stopky i obraz jsou napsané bez podmíněných skoků a každá ze třinácti cest obsluhou klávesy končí čekáním, které ji dorovná na délku té nejdelší. Setina stopek je jeden průchod, takže stopky jsou stejně přesné jako hodiny.

## Autor a licence

Matěj „Wolf“ Holyszewski, 2026; napsáno s pomocí AI. GPL-3.0-or-later. Hodiny jsou součástí doplňků (extras) emulátoru Wolf80, ve kterém se dají vyzkoušet i jako vlastní ROM: https://github.com/Holyszewski/Wolf80
