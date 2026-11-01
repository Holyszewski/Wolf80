AION BUZZER 80 — 1.0.1
ČESKY

Autor: Matěj „Wolf“ Holyszewski, 2026.
Program, hudební data a dokumentaci jsem vytvořil s použitím AI — OpenAI Codex.
Licence: GNU GPL, verze 3 nebo libovolná novější (GPL-3.0-or-later).
Úplné znění licence je v LICENSE.txt. Program je poskytován bez záruky.
Při dalším šíření zachovejte autorské oznámení, licenci a odpovídající zdroje.

CO JE V BALÍČKU
Dvě varianty stejného dema, obě s displejem AAA DBF P:
  ram-display-AAA-DBF-P/AION-Buzzer-80-RAM-display.*
  eprom2708-display-AAA-DBF-P/AION-Buzzer-80-ROM2708-display.*
Každá má Intel HEX, surový BIN, komentovaný zdroj ASM a listing.txt.
Listing obsahuje adresované bajty pro ruční zadání, mapování bloků a úplný
zdroj mezi BEGIN SOURCE a END SOURCE. Přípona ASM je rovněž prostý text.
Společné soubory jsou pouze tento README.txt a LICENSE.txt: celkem 10 souborů.
Balíček neobsahuje verze bez displeje, buildovací nástroje ani soubory MD/JSON.

CÍLOVÝ POČÍTAČ A ZVUK
PMI-80 s Intel 8080 a CPU 10 MHz / 9, přibližně 1,111 MHz; původní monitor.
Program používá pouze dokumentované instrukce 8080, nevolá služby monitoru
a obsahuje vlastní font. Inicializuje 8255 slovem 8Ah a zakáže přerušení.
Jiný takt nebo Z80 změní ladění a tempo. Toto není port na Savii 84.
Ověření proběhlo v emulátoru na PC; fyzická deska ani vypálená 2708 tím
nejsou ověřeny. Jiné monitory nejsou tímto balíčkem potvrzeny.
Zvuk vede z MG OUT magnetofonového konektoru K3 (pin 3, zem pin 2)
do vhodného externího zesilovače. PMI-80 nemá vlastní reproduktor.
V emulátoru musí být zvuk zapnutý.

RAM: NAHRÁNÍ A SPUŠTĚNÍ
HEX obsahuje adresy. Nahrajte jej paměťovým loaderem; nejde o magnetofonový
formát příkazu L. BIN načtěte na 1C00h. Start je vždy 1C00h.
Po nahrání v původním monitoru zadejte = EX 1 C 0 0 =.
Demo se opakuje, RE jej ukončí resetem.
Na skutečném PMI lze bajty z RAM listingu zadat po adresách ručně.
Obraz BIN má 976 bajtů, kód a data: 1C00h–1FCFh. RAM verze nemá podpis.
Pracovní proměnné: 1FD0h–1FD4h, normální SP=1FD9h, skutečný zásobník
1FD5h–1FD8h. Celkově demo při běhu používá oblast 1C00h–1FD8h;
od 1FD9h je zápisník monitoru, který distribuční obraz neobsahuje.

DRUHÁ EPROM 2708: PROGRAMOVÁNÍ A SPUŠTĚNÍ
BIN má přesně 1024 bajtů pro druhou 2708, CPU adresy 0400h–07FFh.
Offset 000h v programátoru odpovídá CPU 0400h; offset 3FFh odpovídá 07FFh.
HEX používá CPU adresy. Pro programátor s adresami od nuly použijte BIN
nebo HEX posuňte o −0400h. Obraz nenahrazuje monitor v první EPROM.
Musí být skutečně přítomná/dekódovaná druhá ROM. Obyčejný import do RAM
ji nenainstaluje. Aktuální UI Wolf80 ji běžným RAM loaderem neosazuje.
Po osazení spusťte = EX 0 4 0 0 =. RE resetuje.
Řadič a skladba zůstávají v ROM, do RAM se při startu kopíruje jen 296 bajtů
měněných šablon (1C00h–1D27h). Proměnné: 1D28h–1D2Eh; workspace 303 bajtů.
SP=1FD9h, stack 1FD5h–1FD8h. ROM obsahuje 993 bajtů původního programu,
25 bajtů FF výplně a závěrečný šestibajtový podpis na 07FAh–07FFh.
Po jednorázovém zavedení šablon má tato verze stejné audio a časování kroků
jako RAM verze. AAA ukazuje adresu dat v ROM, ne adresu kopie šablony v RAM.

PODPIS A FORMÁTY
Pouze BIN pro EPROM 2708 končí šesti bajty 57 4F 4C 46 20 26:
ASCII WOLF a rok 2026 ve dvou bajtech packed BCD (20h, 26h).
RAM verze podpis nemá. Stejné podpisové bajty jsou na nejvyšších adresách
dat v EPROM HEX, ASM i listingu.
HEX musí končit standardním EOF záznamem :00000001FF; podpis patří do dat,
nikoli za tento záznam jako text. Podpis není instrukční sekvence ke spuštění.

DISPLEJ
Zleva: AAA, mezera, D, B, F, mezera, P (celkem devět pozic).
AAA = adresa právě hraného komprimovaného kroku bez horní číslice:
u RAM je implicitní 1, u EPROM 0. D = 1 kopák, 2 virbl, 3 hi-hat.
B = pořadí basového tónu 1–9; F = pořadí melodického tónu 0–F.
Pauza D/B/F je prázdná; F=0 je skutečný tón A3. P = pattern 0–B.
Pořadí B: F2 G2 G#2 A2 C3 F3 G3 A3 C4.
Pořadí F: A3 E4 F4 G4 G#4 A4 B4 C5 D5 E5 F5 G5 G#5 A5 B5 C6.
Použito mezinárodní značení C4=MIDI 60; B odpovídá českému H.

JAK DEMO FUNGUJE
Dva 16bitové fázové akumulátory (DDS) tvoří melodii a basu. Ke každé fázi
se přičítá tabulkový přírůstek; nulový přírůstek znamená pauzu. Nejvyšší bity
obou fází se míchají logickým OR. Jde o nelineární jednobitový mix,
nikoli součet dvou PCM signálů: souzvuky vytvářejí i kombinační složky.
Vzorek trvá 132 taktů, fs=(10 MHz/9)/132 ≈ 8417,508 Hz.
Přírůstek ≈ round(f × 65536 × 132 / CPU_takt); A4 má přírůstek 3426,
tedy přibližně 440,04 Hz. Každý krok má 768 tónových vzorků.
Osm ručně vyvážených slotů K0,K1,K2,K3,K5,K6,K4,K7 současně obnovuje displej;
96 průchodů dává 768 vzorků. BC a dočasně SP nesou přírůstky oscilátorů,
HL a DE fáze. Dokud SP nese přírůstek, nesmí se použít CALL/PUSH/POP/RET.
Normální zásobník se obnoví před návratem do řídicí části.
Sebemodifikace nastavuje operandy tónů, segmentů, čítačů a bicí instrukce.
Proto EPROM varianta kopíruje tyto části do RAM, ale nekopíruje celé demo.

Port F8h je PA 8255, FAh výběr číslice, FBh řídicí registr. Segmenty svítí
v logické nule; PMI vybírá pozici negovaným indexem. PC=0 dočasně vybírá
neplatnou pozici a zhasíná displej před změnou segmentů, aby nevznikaly duchy.
Zvuk na K3 je NAND(PA6,PA7); PA6 současně ovládá segment g. Výstupní maska
proto koordinuje zvuk i segmenty. Při požadované nízké úrovni MG OUT zapíše
FFh, jinak aktivní segmentovou masku s PA7=0. Tím segment g nezkreslí zvuk.

Skladba: 12 patternů × 16 kroků, pořadí 40 položek, celkem 640 kroků.
FF na konci pořadí spustí skladbu znovu; cyklus trvá přibližně 76,105 s.
Jeden bajt kroku: bity 0–4 index melodie, bit 5 volba basy, bity 6–7 bicí.
Čtyři basové indexy na pattern určují dvojice pro jeho první a druhou polovinu.
Tabulka tónů má pauzu a 24 použitých výšek. Před tónovou částí běží 256vzorkový
bicí prefix přibližně 26 ms: klesající oscilátor kopáku nebo posuvný šum
virblu/hi-hat. Hi-hat má zkrácenou obálku. Bicí a tóny tedy nezačínají
současně; během bicích jsou tóny přerušeny a displej zhasnutý.

Verze 1.0.1 omezuje jasné špičky pulzy 53/34/17 taktů pro 2/1/0 aktivních
tónových hlasů. Je to korekce pro tuto skladbu. Průměrná aktivita segmentů P
je asi 78,72 % verze 1.0.0, tónový zvuk se nemění. Tmavé výpadky až asi
103 ms zůstávají; nejde o výpadky zvuku ani o regulátor zcela stálého jasu.

ZDROJ A ZNOVUSESTAVENÍ
ASM používá syntaxi Intel 8080: ORG, EQU, DB, DW, END, hex čísla s h,
LOW/HIGH pro dolní/horní bajt adresy. Zdroj i listing jsou UTF-8.
RAM: sestavte ASM, plochý BIN od 1C00h, mezery vyplňte 00h. HEX nese CPU adresy.
EPROM: sestavte bloky se zdrojovými běhovými adresami. Bloky v intervalu
RAM_BEGIN až RAM_END (konec nezahrnut) uložte fyzicky od
ROM_END + běhová_adresa − RAM_BEGIN; jejich operandy ponechte v RAM adresách.
Ostatní bloky uložte na jejich ORG. Obraz 0400h–07FFh vyplňte FFh, BIN offset
je CPU_adresa − 0400h. Přesné mapování bloků je přímo v listingu. Nepoužívejte
prostý plochý export EPROM zdroje, který by zahrnul blok na 1C00h jako ROM.
Při úpravách zachovejte časování slotů, adresy operandů sebemodifikace,
stránkové tabulky a oddělení šablon, proměnných, zásobníku a zápisníku monitoru.

STRUČNÝ CHANGELOG
Úprava distribuce: odstraněn podpis z RAM verzí; podpis ponechán pouze v 2708.
1.0.1, úprava distribuce: ponechány dvě verze s displejem pro RAM a 2708;
sjednocen návod a technický popis do česko-anglického TXT; zachovány ASM,
HEX, BIN a listing; doplněn podpis WOLF/2026 pouze v 2708; odstraněny distribuční nástroje.
1.0.1: omezeny jasné špičky displeje; doplněna odpovídající verze pro 2708.
1.0.0: přidán displej AAA DBF P a provedení pro RAM a druhou EPROM 2708.

======================================================================
ENGLISH
AION BUZZER 80 — 1.0.1

Author: Matěj “Wolf” Holyszewski, 2026.
I created the program, music data and documentation using AI — OpenAI Codex.
License: GNU GPL version 3 or any later version (GPL-3.0-or-later).
See LICENSE.txt for the full terms. This program comes without warranty.
Redistribution must retain the copyright notice, license and corresponding source.

CONTENTS AND TARGET
Two editions, both with the AAA DBF P display:
  ram-display-AAA-DBF-P/AION-Buzzer-80-RAM-display.*
  eprom2708-display-AAA-DBF-P/AION-Buzzer-80-ROM2708-display.*
Each has Intel HEX, raw BIN, commented ASM source and listing.txt containing
addressed image bytes, block mapping and full source between BEGIN SOURCE and
END SOURCE. README.txt and LICENSE.txt are shared: 10 files in total.
No audio-only editions, build tools or MD/JSON files are included.
Target: PMI-80, Intel 8080, CPU 10 MHz / 9 ≈ 1.111 MHz, original monitor.
Only documented 8080 instructions are used. The demo has its own font and
does not call monitor services. It disables interrupts and configures 8255 with 8Ah.
Other clocks or a Z80 change pitch and tempo. This is not a Savia 84 port.
PC emulator verification does not establish physical-board or programmed-EPROM
operation. Other monitors have not been established by this package.
Connect K3 MG OUT (pin 3, ground pin 2) to a suitable external amplifier;
PMI-80 has no built-in speaker. Enable sound in the emulator.

RAM: LOADING AND STARTING
Import HEX with a memory loader, not the monitor's cassette L command.
Load BIN at 1C00h. Start directly at 1C00h after loading:
= EX 1 C 0 0 = in the original monitor.
The demo loops automatically; RE resets it. Addressed bytes in the RAM listing
can also be entered manually on a physical PMI.
BIN: 976 bytes, code/data at 1C00h–1FCFh. The RAM edition has no signature.
Runtime variables: 1FD0h–1FD4h. Normal SP=1FD9h; actual stack=1FD5h–1FD8h.
Runtime use extends through 1FD8h; monitor workspace starts at 1FD9h
and is excluded from the distributed image.

SECOND 2708 EPROM: PROGRAMMING AND STARTING
BIN is exactly 1024 bytes for the second 2708, CPU 0400h–07FFh.
Programmer offset 000h maps to CPU 0400h; offset 3FFh maps to 07FFh.
HEX uses CPU addresses. Use BIN for a programmer addressing from zero,
or relocate HEX by −0400h. This does not replace the first monitor EPROM.
The second ROM must actually be installed and decoded. An ordinary RAM import
does not install it; the current Wolf80 UI does not do so through its RAM loader.
Start with = EX 0 4 0 0 =; RE resets.
Controller/music stay in ROM. Only 296 bytes of mutable templates are copied
to RAM 1C00h–1D27h at startup. Variables: 1D28h–1D2Eh, total workspace
303 bytes. SP=1FD9h, actual stack=1FD5h–1FD8h.
ROM contains 993 original program bytes, 25 FF padding bytes and the signature
at 07FAh–07FFh. After the one-time template copy, audio and row timing match
the RAM edition. AAA shows the ROM music-data address, not a RAM template.

SIGNATURE AND FILE FORMATS
Only the 2708 EPROM BIN image ends with 57 4F 4C 46 20 26: ASCII WOLF and the year
2026 in two packed-BCD bytes, 20h and 26h. The RAM edition has no signature.
The same signature data occupies the highest image addresses in EPROM HEX,
ASM and listing. Intel HEX still ends with the standard
EOF record :00000001FF: the signature belongs in image data, not trailing text.
The signature is data, not an instruction sequence to execute.

DISPLAY
Left to right: AAA, space, D, B, F, space, P; nine positions overall.
AAA is the current packed-row address with its highest digit omitted:
implicit 1 for RAM, 0 for EPROM. D=1 kick, 2 snare, 3 hi-hat.
B=ascending bass rank 1–9; F=ascending melody rank 0–F. D/B/F rests are blank.
F=0 is the actual pitch A3. P=pattern ID 0–B.
B ranks: F2 G2 G#2 A2 C3 F3 G3 A3 C4.
F ranks: A3 E4 F4 G4 G#4 A4 B4 C5 D5 E5 F5 G5 G#5 A5 B5 C6.
Scientific pitch notation: C4=MIDI 60, English B corresponds to Czech H.

TECHNICAL PRINCIPLE
Two 16-bit DDS phase accumulators produce melody and bass. Each adds a
table increment; zero means a rest. Their sign bits are combined by logical OR.
This is nonlinear one-bit mixing rather than additive PCM and produces
combination components. Each sample takes 132 CPU states:
fs=(10 MHz/9)/132 ≈ 8417.508 Hz. Increment ≈ round(f × 65536 × 132 / CPU_clock).
A4 uses 3426, approximately 440.04 Hz. Each row has 768 pitched samples.
Eight balanced slots K0,K1,K2,K3,K5,K6,K4,K7 also refresh the display;
96 passes yield 768 samples. BC and temporarily SP carry the two increments;
HL/DE carry phases. CALL/PUSH/POP/RET must not execute while SP is an increment.
The normal stack is restored before controller calls. Self-modification patches
frequency, glyph and counter operands and percussion instructions. The EPROM
edition therefore copies mutable templates into RAM, not the whole program.

8255 ports: F8h PA, FAh digit select, FBh control. Segments are active-low;
PMI digit selection uses the complemented index. PC=0 selects an invalid digit,
blanking selection before changing PA to prevent ghosting.
K3 audio is NAND(PA6,PA7); PA6 also drives segment g. The output mask coordinates
both: FFh when MG OUT must be low, otherwise the active segment mask with PA7=0.
This prevents segment g from corrupting the requested sound level.

The song has 12 patterns × 16 rows, arranged in 40 entries: 640 rows.
An FF order terminator restarts it; a loop lasts approximately 76.105 seconds.
A packed row stores lead ID in bits 0–4, bass selection in bit 5 and drums in
bits 6–7. Four bass IDs per pattern supply two pairs for its two halves.
The pitch dictionary contains a rest and 24 used pitches.
Each row starts with a 256-sample percussion prefix, about 26 ms: descending
kick oscillator or shift-register noise for snare/hi-hat, with a shorter hi-hat
envelope. Pitched voices pause and the display is blank during percussion,
so percussion and pitched notes do not begin simultaneously.

Version 1.0.1 limits brightness peaks using 53/34/17-state pulses for 2/1/0
active pitched voices. This correction is tailored to this song. Mean P segment
activity remains about 78.72% of 1.0.0 and pitched audio is unchanged.
Dark intervals up to about 103 ms remain; these are not audio dropouts.
This is not a fully constant-brightness controller.

SOURCE AND REBUILDING
ASM uses Intel 8080 syntax: ORG, EQU, DB, DW, END, hexadecimal h suffix,
LOW/HIGH byte operators. Source and listing are UTF-8.
RAM: assemble ASM, export flat BIN from 1C00h with 00h gaps; HEX uses CPU addresses.
EPROM: assemble blocks at source runtime addresses. For blocks within RAM_BEGIN
through RAM_END (exclusive), place bytes at physical ROM_END + runtime_address
− RAM_BEGIN, retaining RAM addresses in operands. Other blocks retain their ORG.
Fill CPU 0400h–07FFh with FFh; BIN offset = CPU_address − 0400h.
The listing gives exact mappings. A plain flat export of the EPROM source is
incorrect because it would treat its 1C00h runtime block as ROM image space.
Changes must preserve sample timing, self-modification targets, page-local
lookups and separation of templates, variables, stack and monitor workspace.

BRIEF CHANGELOG
Distribution revision: removed signature from RAM editions; retained it only in 2708.
1.0.1 distribution revision: retained two display editions for RAM and 2708;
combined instructions and technical description into Czech/English TXT;
retained ASM, HEX, BIN and listing; added WOLF/2026 signature only to 2708; removed bundled tools.
1.0.1: limited display brightness peaks; added the corresponding 2708 edition.
1.0.0: added AAA DBF P display and editions for RAM and a second 2708 EPROM.
