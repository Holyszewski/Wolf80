# AION Buzzer 80 in an EPROM for the PMI-80

*Česky: [níže](#cesky), nebo v souboru `CTIMNE.txt`.*

**Version 1.0.1.** A music demo for a 1 KiB EPROM in the **second socket of the PMI-80**, addresses 0400h–07FFh. It plays as soon as it is started: two voices and drums, about 76 seconds, then again from the beginning, while the display shows what is being played.

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

The timing is for the PMI-80's 8080 at 10 MHz / 9. On another clock, or on a Z80 board (Savia-84, Stone 1), the pitch and the tempo would be different; it is not made for them.

## Programming the EPROM

Use the `.bin` if the programmer counts addresses from zero: byte 000h of the file is address 0400h of the computer, byte 3FFh is 07FFh. The `.hex` carries the computer's addresses, 0400h–07FFh; if the programmer takes them as addresses in the chip, set an offset of −0400h or use the `.bin`.

The bytes 07E1h–07F3h are empty (FFh). The last twelve, 07F4h–07FFh, are the signature `Wolf2026v101`.

## Starting

With the EPROM in the second socket: `EX 0400 =` in the factory monitor and in PMI-80 C; in another monitor, its command that runs a program from an address, with 0400. `RE` stops it and returns to the monitor.

To check the EPROM first, read a few bytes with the monitor, `M 0400 =`: F3, 31, D9, 1F, 21, B9, 06, 11.

## The display

Left to right `AAA D B F P`: AAA is the address in the EPROM of the step being played (without its first digit, 0), D the drum (1 kick, 2 snare, 3 hi-hat), B the bass note (1–9, from the lowest), F the melody note (0–F, from the lowest), P the pattern (0–B). A voice that is silent shows nothing.

The digits flicker with the music and go dark for a moment at every drum: the processor makes the sound and lights the display in turns.

## Memory it uses

While it plays it uses RAM 1C00h–1D2Eh: at the start it copies 296 bytes of its own code there (the parts it changes as it plays) and keeps seven bytes of variables behind them. A program typed into that part of RAM is overwritten. The stack is at 1FD5h–1FD8h.

## Trying it in the emulator

In Wolf80 choose the PMI-80, open Memory and, at its end, Custom ROM; load the `.hex` (or the `.bin` at address 0400) and start it with `EX 0400 =`.

## Author and licence

Matěj "Wolf" Holyszewski, 2026; created with the help of AI (OpenAI Codex). GPL-3.0-or-later. The program is a part of the extras of the emulator Wolf80, whose program list has the same demo for RAM: https://github.com/Holyszewski/Wolf80

---

<a id="cesky"></a>

# AION Buzzer 80 v EPROM pro PMI-80

**Verze 1.0.1.** Hudební demo pro 1KiB EPROM ve **druhé patici PMI-80**, adresy 0400h–07FFh. Hraje hned po spuštění: dva hlasy a bicí, asi 76 sekund, pak znovu od začátku. Displej přitom ukazuje, co se právě hraje.

| Soubor | Co to je |
|---|---|
| `aion-buzzer-80-eprom-pmi80.bin` | Celá EPROM, 1024 bajtů; první bajt patří na adresu 0400h. |
| `aion-buzzer-80-eprom-pmi80.hex` | Totéž ve formátu Intel HEX, s adresami 0400h–07FFh. |
| `aion-buzzer-80-eprom-pmi80-bytes.txt` | Totéž jako výpis bajtů s adresami. |
| `aion-buzzer-80-eprom-pmi80.asm` | Zdrojový text. |

SHA-256 souboru `.bin`: `a171f618b26197aa33278587c0af64b76918daf2e9c003146eed0b9b6a54ae6b`

## Co je potřeba

- PMI-80 s volnou druhou paticí pro EPROM (na desce s monitorem PMI-80 C je v ní EPROM s hrami COSMOS a TENIS3; tahle přijde na její místo).
- EPROM typu, který deska bere, 1 KiB (MHB8708, 2708), a programátor.
- Zesilovač nebo aktivní reproduktor na výstupu MG OUT magnetofonového konektoru K3: signál na špičce 3, zem na špičce 2. Deska vlastní reproduktor nemá.

Na monitoru nezáleží: program z něj nic nevolá a nečte nic, co monitor připravil. Od monitoru potřebuje jen to, aby uměl spustit program od adresy 0400h.

Časování je pro PMI-80 s procesorem 8080 na 10 MHz / 9. Na jiném taktu nebo na desce se Z80 (Savia-84, Stone 1) by výška tónů i tempo vyšly jinak; pro ně program není.

## Programování EPROM

Použij `.bin`, pokud programátor počítá adresy od nuly: bajt 000h souboru je adresa 0400h počítače, bajt 3FFh je 07FFh. Soubor `.hex` nese adresy počítače, 0400h–07FFh; pokud je programátor bere jako adresy v čipu, nastav posun −0400h, nebo použij `.bin`.

Bajty 07E1h–07F3h jsou prázdné (FFh). Posledních dvanáct, 07F4h–07FFh, je podpis `Wolf2026v101`.

## Spuštění

S EPROM ve druhé patici: `EX 0400 =` v továrním monitoru i v PMI-80 C; v jiném monitoru jeho příkazem pro spuštění programu od adresy, s adresou 0400. `RE` program zastaví a vrátí se do monitoru.

Chceš-li EPROM napřed zkontrolovat, přečti monitorem pár bajtů, `M 0400 =`: F3, 31, D9, 1F, 21, B9, 06, 11.

## Displej

Zleva doprava `AAA D B F P`: AAA je adresa právě hraného kroku v EPROM (bez první číslice 0), D bicí (1 kopák, 2 virbl, 3 hi-hat), B tón basu (1–9, od nejnižšího), F tón melodie (0–F, od nejnižšího), P pattern (0–B). Hlas, který mlčí, neukazuje nic.

Číslice blikají s hudbou a při každém úderu bicích na okamžik zhasnou: procesor střídavě dělá zvuk a rozsvěcí displej.

## Využitá paměť

Při hraní používá RAM 1C00h–1D2Eh: na začátku si tam zkopíruje 296 bajtů vlastního kódu (části, které za hraní mění) a za nimi má sedm bajtů proměnných. Program naťukaný do této části RAM se přepíše. Zásobník je na 1FD5h–1FD8h.

## Vyzkoušení v emulátoru

Ve Wolf80 zvol PMI-80, otevři Paměť a na jejím konci Vlastní ROM; načti `.hex` (nebo `.bin` od adresy 0400) a spusť `EX 0400 =`.

## Autor a licence

Matěj „Wolf“ Holyszewski, 2026; vytvořeno s pomocí AI (OpenAI Codex). GPL-3.0-or-later. Program je součástí doplňků (extras) emulátoru Wolf80, který má v seznamu programů stejné demo pro RAM: https://github.com/Holyszewski/Wolf80
