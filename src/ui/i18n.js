// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// User interface texts in English and Czech. English is the reference: a key missing from the
// Czech catalogue falls back to it. Texts are plain strings with {name} parameters; keys ending
// in "Html" hold markup and are only ever filled from this file. In index.html an element names
// its text with data-i18n (text), data-i18n-html, data-i18n-title, data-i18n-placeholder or
// data-i18n-aria (aria-label); the code uses uiText().

export const UI_LANGS = ['en', 'cs'];

const PMI80_ABOUT_EN = `
<p><b>PMI-80</b> is a school single-board microcomputer developed and, from 1982, made by TESLA Piešťany [1, 2]. Ing. Roman Kišš designed the prototype at the turn of 1980 and 1981 [2, 3]. It served for teaching and demonstrating microcomputers with the 8080 processor [4] and came in an A4 case together with its user's manual [4]. It cost 4,770 Kčs and about 5,000 were made [2].</p>
<ul>
  <li>MHB8080A processor, 10 MHz crystal, 1.111 MHz clock (900 ns period).</li>
  <li>1 KB ROM with the monitor (MHB 8608), a socket for another 1 KB EPROM.</li>
  <li>1 KB RAM (2× MHB 2114) at 1C00–1FFF.</li>
  <li>Nine-digit seven-segment LED display VQD30, multiplexed.</li>
  <li>25 keys: 16 hexadecimal, 7 function keys, RESET and interrupt.</li>
  <li>An MHB 8255A with eight user lines on connector K2; a second 8255 can be added.</li>
  <li>Tape recorder interface (output K3, about 5 kHz).</li>
  <li>Power +5 V / 0.7 A, +12 V / 0.2 A, −5 V / 0.1 A; board 145 × 245 mm.</li>
</ul>
<p>Trivia: the display, its MH1082 decoder and a slightly modified keyboard come from the TESLA OKU 205 calculator [2, 5], a clone of the American Litronix 2230 calculator [6].</p>
<ol class="refs">
  <li>TESLA Piešťany: Školský mikropočítač PMI 80, Užívateľská príručka, part I, 1982.</li>
  <li>Wikipédia (sk): PMI-80.</li>
  <li>R. Kadlec: an article on the PMD 85 and Roman Kišš, touchit.sk, 9 June 2015.</li>
  <li>Š. Tóth: a description of the PMI-80, Amatérské radio 7/1984, p. 257 (continued in issues 8 and 11).</li>
  <li>nostalcomp.cz, the Rarity page (archived 2017).</li>
  <li>Calcuseum (calcuseum.com): descriptions of the Litronix 2230 and TESLA OKU205 calculators with matching specifications.</li>
</ol>`;

const PMI80_ABOUT_CS = `
<p><b>PMI-80</b> je školní jednodeskový mikropočítač, který vyvinul a od roku 1982 vyráběl k. p. TESLA Piešťany [1, 2]. Prototyp navrhl na přelomu let 1980 a 1981 Ing. Roman Kišš [2, 3]. Sloužil k výuce a předvádění mikropočítačů s procesorem 8080 [4] a dodával se v kufříku formátu A4 spolu s uživatelskou příručkou [4]. Stál 4 770 Kčs a vyrobilo se ho asi 5 000 kusů [2].</p>
<ul>
  <li>Procesor MHB8080A, krystal 10 MHz, takt 1,111 MHz (perioda 900 ns).</li>
  <li>ROM 1 KB s monitorem (MHB 8608), patice pro další 1 KB EPROM.</li>
  <li>RAM 1 KB (2× MHB 2114) na adresách 1C00–1FFF.</li>
  <li>Devítimístný sedmisegmentový displej LED VQD30, multiplexovaný.</li>
  <li>25 kláves: 16 šestnáctkových, 7 funkčních, RESET a přerušení.</li>
  <li>Obvod MHB 8255A s osmi linkami pro uživatele na konektoru K2; druhý 8255 lze doplnit.</li>
  <li>Připojení magnetofonu (výstup K3, kmitočet asi 5 kHz).</li>
  <li>Napájení +5 V / 0,7 A, +12 V / 0,2 A, −5 V / 0,1 A; deska 145 × 245 mm.</li>
</ul>
<p>Zajímavost: displej, jeho dekodér MH1082 a mírně upravená klávesnice pocházejí z kalkulačky TESLA OKU 205 [2, 5], která je klonem americké kalkulačky Litronix 2230 [6].</p>
<ol class="refs">
  <li>TESLA Piešťany: Školský mikropočítač PMI 80, Užívateľská príručka, časť I, 1982.</li>
  <li>Wikipédia (sk): PMI-80.</li>
  <li>R. Kadlec: článek o PMD 85 a Romanu Kiššovi, touchit.sk, 9. 6. 2015.</li>
  <li>Š. Tóth: popis PMI-80, Amatérské radio 7/1984, s. 257 (pokračování v č. 8 a 11).</li>
  <li>nostalcomp.cz, stránka Rarity (archiv 2017).</li>
  <li>Calcuseum (calcuseum.com): popisy kalkulaček Litronix 2230 a TESLA OKU205 se shodnými parametry.</li>
</ol>`;

const SAVIA84_ABOUT_EN = `
<p><b>Savia-84</b> is a single-board microcomputer with the Z80 processor, meant for school and demonstration use [1]. Its designer is Jaroslav Tomáš Hyan [2]; the construction guide was published in the book Radioamatérské konstrukce 4 (SNTL, 1990) [1, 2]. The service program (monitor) was written by Ing. Václav Kraus of ČVUT-FEL [1, p. 132]. The computer probably dates from 1984 [2].</p>
<ul>
  <li>Z80 processor; per the schematic a 4 MHz crystal divided by two, i.e. 2 MHz. The book allows 1–8 MHz crystals, so the real clock depends on the build.</li>
  <li>The basic version has ten integrated circuits.</li>
  <li>1 KB EPROM (2758) at 0000–03FF, 2 KB RAM (6116) at 1800–1FFF; A15 is not decoded.</li>
  <li>An 8255A: display segments, port B with eight LEDs for demonstrations, digit select through a 74145, and the keyboard.</li>
  <li>The book describes an eight-digit LED display and the message SAVIA 84; the factory monitor drives nine positions and shows SLAVIA 84.</li>
  <li>24 keys: 16 hexadecimal, Ad, dA, Ex, Br, R, L, S and Reset.</li>
  <li>The tape interface was dropped (the book suggests PC7 for input, PA6 and PA7 for output); the space for its program in the ROM stayed empty.</li>
  <li>Power +5 V / 0.5 A.</li>
</ul>
<ol class="refs">
  <li>Radioamatérské konstrukce 4, SNTL, Prague 1990, ISBN 80-03-00208-7, the chapter on the Savia microcomputer, pp. 124–145.</li>
  <li>nostalcomp.cz, the Savia page (archived 2017).</li>
</ol>`;

const SAVIA84_ABOUT_CS = `
<p><b>Savia-84</b> je jednodeskový mikropočítač s procesorem Z80, určený pro školní a předváděcí účely [1]. Autorem konstrukce je Jaroslav Tomáš Hyan [2]; návod ke stavbě vyšel v knize Radioamatérské konstrukce 4 (SNTL, 1990) [1, 2]. Autorem obslužného programu je Ing. Václav Kraus z ČVUT-FEL [1, s. 132]. Počítač pravděpodobně pochází z roku 1984 [2].</p>
<ul>
  <li>Procesor Z80; podle schématu krystal 4 MHz dělený dvěma, tedy 2 MHz. Kniha připouští krystaly 1–8 MHz, skutečný takt záleží na stavbě.</li>
  <li>Základní provedení má deset integrovaných obvodů.</li>
  <li>EPROM 1 KB (2758) na 0000–03FF, RAM 2 KB (6116) na 1800–1FFF; A15 se nedekóduje.</li>
  <li>Obvod 8255A: segmenty displeje, port B s osmi LED pro předvádění, výběr číslice přes 74145 a klávesnice.</li>
  <li>Kniha popisuje osmimístný displej LED a nápis SAVIA 84; tovární monitor obsluhuje devět pozic a ukazuje SLAVIA 84.</li>
  <li>24 kláves: 16 šestnáctkových, Ad, dA, Ex, Br, R, L, S a Reset.</li>
  <li>Od připojení magnetofonu se upustilo (kniha pro ně navrhuje vstup PC7, výstup PA6 a PA7); místo pro jeho program v ROM zůstalo prázdné.</li>
  <li>Napájení +5 V / 0,5 A.</li>
</ul>
<ol class="refs">
  <li>Radioamatérské konstrukce 4, SNTL, Praha 1990, ISBN 80-03-00208-7, kapitola o mikropočítači Savia, s. 124–145.</li>
  <li>nostalcomp.cz, stránka Savia (archiv 2017).</li>
</ol>`;

const STONE1_ABOUT_EN = `
<p><b>Stone 1</b> is a single-board computer by Radek Veselý, "a retro computer from the Stone Age", crossed from the PMI-80 and its cousin the Savia-84; it was published on malecky.cz with his consent, with its own monitor [1, 2].</p>
<ul>
  <li>Z80 processor, 2 MHz crystal.</li>
  <li>2 KB EPROM 2716 at 0000–07FF, 2 KB RAM 6116 at 1800–1FFF; the address decoder is complete, so unlike the models the memories are not mirrored.</li>
  <li>An 8255 wired as on the models, repeated every 8 port addresses (F8–FB as usual).</li>
  <li>Nine-digit seven-segment display and 25 keys, RESET and interrupt included; the digit select is inverted as on the PMI-80.</li>
  <li>Board 197 × 113 mm, power 5 V / about 350 mA.</li>
  <li>A PMI variant (a 1 MHz crystal, tape circuits added, pull-ups on the data bus for the interrupt key) and a Savia variant (four wire links instead of IC9, without the second digit and the I key).</li>
  <li>The own monitor (573 bytes) filters the keys, returns properly from editing, keeps its own stack and has no tape routines yet; the monitors of both models can be used too.</li>
  <li>STONE-PMI, Nostalcomp's adaptation of the PMI-80 monitor for the Z80 with a game menu (COSMOS, TENIS3), is another monitor for it.</li>
</ul>
<ol class="refs">
  <li>malecky.cz: Stone 1 (updated 2018).</li>
  <li>malecky.cz: Monitor pro Stone 1, with the commented listing.</li>
</ol>`;

const STONE1_ABOUT_CS = `
<p><b>Stone 1</b> je jednodeskový počítač Radka Veselého, „retro počítač z doby kamenné“, kříženec PMI-80 a jeho bratránka Savia-84; s jeho souhlasem byl zveřejněn na malecky.cz, i s vlastním monitorem [1, 2].</p>
<ul>
  <li>Procesor Z80, krystal 2 MHz.</li>
  <li>EPROM 2716 o 2 KB na 0000–07FF, RAM 6116 o 2 KB na 1800–1FFF; adresový dekodér je úplný, takže se paměti na rozdíl od předloh nezrcadlí.</li>
  <li>Obvod 8255 zapojený jako u předloh, opakuje se po 8 adresách portů (obvykle F8–FB).</li>
  <li>Devítimístný sedmisegmentový displej a 25 tlačítek včetně RESET a přerušení; výběr číslice je invertovaný jako u PMI-80.</li>
  <li>Deska 197 × 113 mm, napájení 5 V / asi 350 mA.</li>
  <li>Varianta PMI (krystal 1 MHz, doplněné obvody pro magnetofon, pull-up rezistory na datové sběrnici pro tlačítko přerušení) a varianta SAVIA (čtyři drátové propojky místo IC9, bez druhé číslice a tlačítka I).</li>
  <li>Vlastní monitor (573 bajtů) filtruje klávesy, korektně se vrací z editace, má vlastní zásobník a zatím neumí magnetofon; použít lze i monitory obou předloh.</li>
  <li>Dalším monitorem pro něj je STONE-PMI, Nostalcompova úprava monitoru PMI-80 pro Z80 s nabídkou her (COSMOS, TENIS3).</li>
</ul>
<ol class="refs">
  <li>malecky.cz: Stone 1 (aktualizace 2018).</li>
  <li>malecky.cz: Monitor pro Stone 1, s komentovaným výpisem.</li>
</ol>`;

export const UI_TEXT = {
  en: {
    'work.aria': 'Work area',
    'tab.ovladani': 'Controls',
    'tab.tahak': 'Cheat sheet',
    'tab.instrukce': 'Instructions',
    'tab.ladeni': 'Debug',
    'case.aria': '{name} microcomputer',
    'display.aria': 'Display',
    'keyboard.aria': 'Keyboard',

    'run.title': 'Run',
    'run.pause': 'Pause',
    'run.run': 'Run',
    'run.runTip': 'Runs or pauses the emulation (Space steps while paused).',
    'run.step': 'Step',
    'run.stepTip': 'Executes one processor instruction. Only while paused.',
    'run.power': 'Power off and on',
    'run.powerTip': 'Switches the computer off and on again: the RAM contents are lost and the monitor starts again.',
    'status.running': 'Running',
    'status.paused': 'Paused',

    'sound.on': '🔊 Sound from {out}: on',
    'sound.off': '🔇 Sound from {out}: off',
    'sound.tip': 'A virtual amplifier connected to the tape output (K3, a NAND gate of PA6 and PA7). The emulation runs without sound too; the choice is remembered.',
    'sound.tipSavia': 'A virtual amplifier on PA7 of the 8255. The Savia-84 has no sound output of its own (the book suggests PA6 and PA7 for a tape recorder); a speaker with an amplifier can be connected to PA7. The emulation runs without sound too; the choice is remembered.',
    'sound.tipStone': 'A virtual amplifier on PA7 of the 8255. The Stone 1 has no sound output of its own; a speaker with an amplifier can be connected to PA7. The emulation runs without sound too; the choice is remembered.',

    'board.title': 'Board and firmware',
    'board.board': 'Board',
    'board.monitor': 'Monitor',
    'board.clock': 'Clock',
    'board.pmiMonitor': 'PMI-80 factory monitor',
    'board.pmiCMonitor': 'PMI-80 C (Nostalcomp)',
    'board.saviaMonitor': 'Savia-84 factory monitor',
    'board.stone1Monitor': 'Stone 1 monitor (R. Veselý)',
    'board.stoneMonitor': 'STONE-PMI (Nostalcomp)',
    'board.pmiClock': '1.111 MHz',
    'board.saviaClock': '2 MHz',
    'board.stoneClock': '2 MHz',
    'board.nineDigits': '9-digit display',
    'board.nineDigitsTip': 'Nine digits, as the monitor drives them and as some boards are built. The book builds the Savia-84 with eight: output 1 of the 74145 has none, so the L of SLAVIA 84 is not seen.',
    'board.layout': 'Keyboard',
    'board.layoutPmi': 'as on the PMI-80',
    'board.layoutBoard': '4×6 – Wolf\'s Savia-84',

    'prog.title': 'Programs and games',
    'prog.help': 'A button restarts the monitor, loads the program into memory and starts it, as if you typed {keys}.',
    'prog.none': 'No programs for this board and monitor yet.',
    'prog.runPmi': 'EX address =',
    'prog.runSavia': 'Ex address dA',
    'prog.startTip': 'Start {addr}',
    'prog.version': 'version {v}',

    'keys.title': "The computer's keyboard",
    'keys.pcTip': 'On the PC keyboard: {key}',
    'keys.helpHtml': '<kbd>0</kbd>–<kbd>9</kbd>, <kbd>A</kbd>–<kbd>F</kbd> hex · <kbd>Enter</kbd> or <kbd>=</kbd> = · <kbd>M</kbd> M · <kbd>X</kbd> EX · <kbd>R</kbd> R · <kbd>P</kbd> BR · <kbd>L</kbd> L · <kbd>S</kbd> S · <kbd>I</kbd> interrupt · <kbd>Esc</kbd> RE',
    'keys.helpSaviaHtml': '<kbd>0</kbd>–<kbd>9</kbd>, <kbd>A</kbd>–<kbd>F</kbd> hex · <kbd>Enter</kbd> or <kbd>=</kbd> dA · <kbd>M</kbd> Ad · <kbd>X</kbd> Ex · <kbd>R</kbd> Reg · <kbd>P</kbd> Br · <kbd>L</kbd> L · <kbd>S</kbd> –S · <kbd>Esc</kbd> Reset',

    'mem.summary': 'Memory: load and export',
    'mem.loadTitle': 'Load into memory',
    'mem.loadHelp': 'Intel HEX goes to its own addresses. BIN and plain hex text are written from the given address. The program is not started; start it with the monitor ({keys}).',
    'mem.addr': 'Address',
    'mem.addrAria': 'Address for BIN and hex text',
    'mem.loadFile': 'Load file',
    'mem.loadFileTip': 'Loads a .hex (Intel HEX) or .bin file into memory.',
    'mem.hexPlaceholder': 'Plain hex text, e.g. 3E 55 32 00 1D 76',
    'mem.writeHex': 'Write hex text',
    'mem.exportTitle': 'Export from memory',
    'mem.exportHelp': 'The range of addresses saved to the file.',
    'mem.fromTo': 'From – to',
    'mem.fromAria': 'Export from address',
    'mem.toAria': 'Export to address',
    'mem.expHex': 'Export Intel HEX',
    'mem.expHexTip': 'Saves the chosen memory range as a .hex file (Intel HEX).',
    'mem.expBin': 'Export BIN',
    'mem.expBinTip': 'Saves the chosen memory range as a .bin file (raw bytes).',
    'mem.wavHelp': "WAV: a tape recording made as the factory monitor's S (SAVE) command makes it, to be played into MG IN on K3 of a real PMI-80 and loaded there with L (LOAD) of the factory monitor. SAVE always goes on to the end of the 256-byte page, so the range is split at page boundaries into blocks, numbered from the given block number (hex), with 20 s of silence between them. While LOAD listens, the left digit shows t; when a block is in, the display shows \"MG Stop\": then type the next L (pause the player if you need more time). The input of a real PMI-80 needs a strong signal (the original circuit about 3 V RMS): play at full volume, through an amplifier if needed.",
    'mem.tapeNumber': 'Block no.',
    'mem.tapeNumberAria': 'Number of the first tape block (hex, 00–FF)',
    'mem.expWav': 'Export WAV (tape)',
    'mem.expWavTip': 'Saves the range as a tape recording (.wav) in the format of the factory monitor.',
    'mem.wavDone': 'Recording {seconds} s. On the PMI-80 with the factory monitor: {steps}.',
    'mem.wavStep': 'L {addr} = {number} =, any key, play block {number}',
    'mem.wavThen': '; then ',
    'mem.badNumber': 'invalid block number "{value}"',
    'mem.wavTooLong': 'too long for a tape recording: at most {max} blocks of 256 bytes',
    'mem.written': 'Written {n} B: {where}. Bytes outside RAM ({ram}) are not written.',
    'mem.error': 'Error: {msg}',
    'mem.badAddr': 'invalid address "{value}"',
    'mem.endBeforeStart': 'the end is before the start',
    'mem.saved': 'Saved: {path}',
    'mem.saveCancelled': 'Saving cancelled.',
    'mem.saveFailed': 'Saving failed: {err}',
    'mem.hostDialog': 'the save dialog failed (code {code})',
    'mem.hostWrite': 'the file could not be written',

    'aboutPc.summary': 'About the computer',
    'aboutPc.pmi80Html': PMI80_ABOUT_EN,
    'aboutPc.savia84Html': SAVIA84_ABOUT_EN,
    'aboutPc.stone1Html': STONE1_ABOUT_EN,
    'aboutEmu.summary': 'About the emulator',
    'aboutEmu.licenseHtml': 'Copyright © 2026 Matěj "Wolf" Holyszewski. Wolf80 is free software: you may share and change it under the terms of the GNU General Public License, version 3 or (at your option) any later version. It comes with <b>no warranty</b>. The monitors and the programs by other authors are not covered by this licence. The source code is on <a href="https://github.com/Holyszewski/Wolf80" target="_blank" rel="noopener">GitHub</a>.',
    'aboutEmu.licenseFull': 'Full text of the licence (GNU GPL 3, in English)',
    'aboutEmu.offline': 'Download Wolf80 offline',
    'aboutEmu.offlineNote': 'One HTML file that runs in the browser without a connection. The Windows EXE and earlier versions are on the <a href="https://github.com/Holyszewski/Wolf80/releases/latest" target="_blank" rel="noopener">releases page</a>.',
    'aboutEmu.html': '<p><b>Wolf80</b> {version} is an emulator of Czechoslovak single-board computers: the educational PMI-80 and Savia-84 and the Stone 1. It has its own 8080 and Z80 processor cores, written after the Intel and Zilog manuals; the original monitors run on them.</p><p>Not the work of this project, included with credit: the factory monitor of the PMI-80 (TESLA Piešťany, 1982) as shared by <a href="https://www.nostalcomp.cz/" target="_blank" rel="noopener">Nostalcomp</a> (Ing. Jiří Koutný); the factory monitor of the Savia-84 by Ing. Václav Kraus, printed in the book Radioamatérské konstrukce 4 (SNTL, 1990); the PMI-80 C and STONE-PMI monitors with the games COSMOS and TENIS3, adapted by Nostalcomp (2019). COSMOS is a game by Jiří Šutera; TENIS3 is Nostalcomp\'s version of TENIS by an unnamed author, published as a Slovak microelectronics application sheet and transcribed into electronic form by Nostalcomp. Thanks to Nostalcomp for preserving and sharing them. Mikrovarhany, Světelný had and AION Buzzer 80 are by the author of this emulator.</p><p>The emulator also includes its own ports of several games from similar single-board computers of the time: the KIM-1 (MOS Technology, USA), the NEC TK-80 (Japan), and the Acorn System 1 and the MK14 by Science of Cambridge (both UK). I chose them to be representative of what was played on such machines, fun to play today, and drawn from as many different computers as possible. They were written anew for this emulator after the originals, as a compromise between close faithfulness to the original and small improvements for comfortable play and fixes of its bugs.</p><p>The brightness of the digits comes from how long the program keeps each segment lit, as on a real multiplexed display.</p><p>The emulator was made with the help of the AI Claude (the Claude Opus 5.5 model by Anthropic).</p>',
    'lang.aria': 'Language',
    'theme.aria': 'Appearance',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.system': 'System',
    'theme.systemTip': 'Follow the light or dark setting of the system',
    'brand.subHtml': 'SINGLE-BOARD<br>MICROCOMPUTER',

    'tahak.commands': 'Monitor commands',
    'tahak.reTxt': 'reset, back to the monitor (display "PMI -80")',
    'tahak.mKey': 'M addr = data = …',
    'tahak.mTxt': 'view and write memory; = moves to the next address',
    'tahak.exKey': 'EX addr =',
    'tahak.exTxt': 'run a program from the address',
    'tahak.rTxt': 'registers; chosen with the keys SP, HL, AF, BC, DE',
    'tahak.brKey': 'BR bp = start =',
    'tahak.brTxt': 'breakpoint (instruction RST 1) and run; after the stop the registers can be viewed',
    'tahak.iTxt': 'hardware interrupt: RST 7, the monitor jumps to 1FE6h; the program must have EI',
    'tahak.lsTxt': 'tape: load / save (not in the emulator yet)',
    'tahak.services': 'Monitor services (CALL)',
    'tahak.clear': 'A = code of the first character, the other positions blank',
    'tahak.outad': 'address from 1FF8–1FF9 as 4 digits',
    'tahak.modad': 'address entry from the keyboard into 1FF8–1FF9',
    'tahak.outda': 'byte from 1FFA as 2 digits',
    'tahak.modda': 'byte entry into 1FFA',
    'tahak.outke': 'displays and waits for a key press and release; code in A',
    'tahak.disp': 'one pass of the display and keyboard; CY = key pressed',
    'tahak.tout': 'byte from C to the tape',
    'tahak.tin': 'byte from the tape into C',
    'tahak.scratch': 'Monitor scratchpad in RAM',
    'tahak.stack': 'top of the monitor stack (grows down)',
    'tahak.intr': 'interrupt handler (jump from 0038h)',
    'tahak.bpAddr': 'breakpoint address',
    'tahak.bpByte': 'original byte at the breakpoint',
    'tahak.codes': 'character codes of the nine digits',
    'tahak.inAdr': 'address (IN_ADR)',
    'tahak.inData': 'data (IN_DATA)',
    'tahak.textPtr': 'pointer to the text shown',
    'tahak.keyCode': 'code of the pressed key',
    'tahak.map': 'Memory map',
    'tahak.mapRom': 'monitor (ROM)',
    'tahak.mapRom2': 'second EPROM (not fitted)',
    'tahak.mapRam': 'RAM 1 KiB; for programs roughly 1C00–1F00',
    'tahak.mapMirror': 'mirror of 0000–1FFF',
    'tahak.mapPorts': '8255 ports: PA segments, PB, PC digit and keyboard select, control word',
    'tahak.note': 'For the PMI-80 factory monitor. Addresses are hexadecimal.',
    'tahak.sReset': 'reset, back to the monitor (display "SLAVIA 84")',
    'tahak.sAdKey': 'Ad addr dA data …',
    'tahak.sAd': 'view and write memory; dA next address, –S previous',
    'tahak.sExKey': 'Ex addr dA',
    'tahak.sEx': 'run a program from the address',
    'tahak.sBrKey': 'Br bp1 dA bp2 dA start dA',
    'tahak.sBr': 'two breakpoints (instruction RST 1) and run',
    'tahak.sReg': 'registers AF, BC, DE, HL, SP; dA moves on',
    'tahak.sLS': 'tape: missing from the ROM; the monitor starts again',
    'tahak.s014f': 'HL as four digits into 1FF9–1FFC (kept in 1FF4–1FF5)',
    'tahak.s0160': 'A as two digits into 1FFE–1FFF (kept in 1FF6)',
    'tahak.s0179': 'shows the buffer at 1FF7 for DE passes',
    'tahak.s0188': 'clears the buffer: A into 1FF7, blanks after it',
    'tahak.s0196': 'shows 1FF7 and waits for a key press and release; code in A, Z = dA, CY = hex key',
    'tahak.s0199': 'the same with the buffer at HL',
    'tahak.s01fd': 'one pass of the display (buffer 1FF7) and keyboard',
    'tahak.s0200': 'one pass with the buffer at HL; CY = key pressed, its code rotated left in A',
    'tahak.sTables': 'tables of the character segments and the key codes',
    'tahak.sStack': 'top of the stack (grows down); 1FD9–1FE1 hold jumps for RST 28h, 30h, 38h',
    'tahak.sBp': 'the two breakpoints: address and original byte',
    'tahak.sRegs': 'registers of the stopped program: PC, AF, BC, DE, HL, SP',
    'tahak.sWork': 'working address and byte',
    'tahak.sMapEmpty': 'empty (a read returns the last value on the data bus)',
    'tahak.sMapRam': 'RAM 2 KiB; for programs 1800 to about 1F80',
    'tahak.sMapMirror': 'mirror of 0000–7FFF (A15 is not decoded)',
    'tahak.sMapPorts': '8255 (any port with A2 = 0): PA segments (PA7 free: sound), PB eight LEDs (not shown yet), PC digit and keyboard select, control word',
    'tahak.noteSavia': 'For the factory monitor of the Savia-84, from the ROM and the book. Addresses are hexadecimal. Ad, dA, –S and Reg are the keys M, =, S and R of the PMI-80.',
    'tahak.tRe': 'reset, back to the monitor (display StonE-PMI)',
    'tahak.tI': 'interrupt: the Z80 runs in IM 1, 0038h jumps to 1FE6h; the program must have EI',
    'tahak.tL': 'scrolling text',
    'tahak.tS': 'game menu: 0 COSMOS, 1 TENIS3',
    'tahak.tOutke': 'waits until no key is held, then for a press; code in A',
    'tahak.tGames': 'COSMOS and TENIS3 (EX 0440 =, EX 0660 =)',
    'tahak.tMapGames': 'game menu, COSMOS and TENIS3 (the second half of the 2716)',
    'tahak.noteStone': "For Nostalcomp's STONE-PMI monitor (2019): the PMI-80 monitor without the tape routines. Addresses are hexadecimal.",
    'tahak.cRe': 'reset, back to the monitor (display "PMI -80 C")',
    'tahak.cMapGames': 'second EPROM: game menu, COSMOS and TENIS3',
    'tahak.notePmiC': "For Nostalcomp's PMI-80 C monitor (2019): the factory monitor without the tape routines, with debounced keys. Its scrolling text shows PMI-80 C (Wolf's change of Nostalcomp's text). Addresses are hexadecimal.",
    'tahak.oRe': 'reset, back to the monitor (display "Stone 1")',
    'tahak.oM': 'view and write memory; = writes and moves on',
    'tahak.oEx': 'run a program from the address',
    'tahak.oR': 'registers AF, BC, DE, HL, SP, PC; = moves on',
    'tahak.oBr': 'breakpoint (instruction RST 1) and run; the stop shows br-StoP',
    'tahak.oI': 'interrupt: RST 7, 0038h jumps to 1FEFh; the program puts a jump there and must have EI',
    'tahak.oModad': 'edits HL from the keyboard; Z = ended with =',
    'tahak.oModda': 'edits A from the keyboard; Z = ended with =',
    'tahak.oOutad': 'HL as 4 digits on the display',
    'tahak.oOutda': 'A as 2 digits on the display',
    'tahak.oOuthex': 'A as 2 digits to the address in BC',
    'tahak.oGetc': 'displays and waits for a key; code in A, Z = the = key, CY = hex digit',
    'tahak.oMpx': 'one pass of the display and keyboard; A = key code or 0 (Z)',
    'tahak.oStack': 'the monitor\'s own stack',
    'tahak.oRegs': 'the program\'s registers AF, BC, DE, HL, SP, PC',
    'tahak.oBp': 'breakpoint address and the byte it replaced',
    'tahak.oVector': 'interrupt vector: a jump to the handler',
    'tahak.oKeys': 'key filter: valid key, last sample, count of matches',
    'tahak.oMapRom': 'EPROM 2716: the monitor up to 023C, the rest free',
    'tahak.oMapRam': 'RAM 2 KiB; no mirrors (full address decoding)',
    'tahak.oMapPorts': '8255 (repeated every 8 ports): PA segments, PB input, PC digit and keyboard select, control word',
    'tahak.noteStone1': 'For the Stone 1\'s own monitor. Its character codes differ from the PMI-80\'s (blank 27h). Addresses are hexadecimal.',

    'ops.title': '8080 instructions',
    'ops.byCode': 'by code',
    'ops.byName': 'by name',
    'ops.grid': '16×16 grid',
    'ops.find': 'search: MOV, 3E, JMP …',
    'ops.findAria': 'Search for an instruction',
    'ops.titleZ80': 'Z80 instructions',
    'ops.findZ80': 'search: LD, 3E, DJNZ, DD …',
    'ops.noteZ80': 'Codes are hexadecimal, prefixes included (CB, DD, ED, FD). n is a byte, nn a two-byte address or number (low byte first in memory), d the signed displacement of (IX+d) and (IY+d), e the target of a relative jump. B = length in bytes, T = number of states; "7/12" means condition not met / met (for the repeating block instructions: last pass / another pass). Grey italics are undocumented instructions; of DD CB and FD CB only the forms without a copy into a register are listed. The grid shows the codes without a prefix.',
    'ops.note': 'Codes are hexadecimal. nn is a byte, nnnn a two-byte address or number (low byte first in memory). B = length in bytes, T = number of states; conditional jumps and calls take the longer time when the condition is met. Grey italics are undocumented copies of other instructions.',

    'dbg.regs': 'Registers',
    'dbg.ppi': '8255 (F8–FB)',
    'dbg.dis': 'Program at PC',
    'dbg.mem': 'Memory',
    'dbg.addr': 'Address',
    'dbg.rom': 'ROM',
    'dbg.ram': 'RAM',
    'dbg.romTip': 'Go to the start of ROM (0000)',
    'dbg.ramTip': 'Go to the start of RAM ({addr})',
    'dbg.memNote': 'the mouse wheel scrolls',
    'dbg.memPrev': '−1 KiB',
    'dbg.memPrevTip': 'Show the previous kilobyte',
    'dbg.memNext': '+1 KiB',
    'dbg.memNextTip': 'Show the next kilobyte',
    'dbg.later': 'Editing registers and memory, breakpoints and stepping over subroutines will come later.',
    'dbg.states': 'states',
    'dbg.digit': 'digit',
  },

  cs: {
    'work.aria': 'Pracovní plocha',
    'tab.ovladani': 'Ovládání',
    'tab.tahak': 'Tahák',
    'tab.instrukce': 'Instrukce',
    'tab.ladeni': 'Ladění',
    'case.aria': 'Mikropočítač {name}',
    'display.aria': 'Displej',
    'keyboard.aria': 'Klávesnice',

    'run.title': 'Běh',
    'run.pause': 'Pauza',
    'run.run': 'Spustit',
    'run.runTip': 'Spustí nebo pozastaví emulaci (mezerník při pozastavení krokuje).',
    'run.step': 'Krok',
    'run.stepTip': 'Provede jednu instrukci procesoru. Jen při pozastavení.',
    'run.power': 'Vypnout a zapnout',
    'run.powerTip': 'Vypne a znovu zapne počítač: obsah RAM se ztratí, monitor naběhne znovu.',
    'status.running': 'Běží',
    'status.paused': 'Pozastaveno',

    'sound.on': '🔊 Zvuk z {out}: zapnut',
    'sound.off': '🔇 Zvuk z {out}: vypnut',
    'sound.tip': 'Virtuální zesilovač připojený na výstup pro magnetofon (K3, hradlo NAND z PA6 a PA7). Emulace běží i bez zvuku; volba se pamatuje.',
    'sound.tipSavia': 'Virtuální zesilovač na PA7 obvodu 8255. Savia-84 vlastní zvukový výstup nemá (kniha navrhuje PA6 a PA7 pro magnetofon); na PA7 lze připojit reproduktor se zesilovačem. Emulace běží i bez zvuku; volba se pamatuje.',
    'sound.tipStone': 'Virtuální zesilovač na PA7 obvodu 8255. Stone 1 vlastní zvukový výstup nemá; na PA7 lze připojit reproduktor se zesilovačem. Emulace běží i bez zvuku; volba se pamatuje.',

    'board.title': 'Deska a firmware',
    'board.board': 'Deska',
    'board.monitor': 'Monitor',
    'board.clock': 'Takt',
    'board.pmiMonitor': 'Tovární monitor PMI-80',
    'board.pmiCMonitor': 'PMI-80 C (Nostalcomp)',
    'board.saviaMonitor': 'Tovární monitor Savia-84',
    'board.stone1Monitor': 'Monitor Stone 1 (R. Veselý)',
    'board.stoneMonitor': 'STONE-PMI (Nostalcomp)',
    'board.pmiClock': '1,111 MHz',
    'board.saviaClock': '2 MHz',
    'board.stoneClock': '2 MHz',
    'board.nineDigits': '9místný displej',
    'board.nineDigitsTip': 'Devět číslic, jak je obsluhuje monitor a jak jsou některé desky postavené. Kniha staví Savia-84 s osmi: výstup 1 obvodu 74145 žádnou nemá, takže L z nápisu SLAVIA 84 není vidět.',
    'board.layout': 'Klávesnice',
    'board.layoutPmi': 'jako na PMI-80',
    'board.layoutBoard': '4×6 – Wolfova Savia-84',

    'prog.title': 'Programy a hry',
    'prog.help': 'Tlačítko spustí monitor znovu, nahraje program do paměti a spustí ho, jako byste zadali {keys}.',
    'prog.none': 'Pro tuto desku a monitor zatím žádné programy nejsou.',
    'prog.runPmi': 'EX adresa =',
    'prog.runSavia': 'Ex adresa dA',
    'prog.startTip': 'Start {addr}',
    'prog.version': 'verze {v}',

    'keys.title': 'Klávesnice počítače',
    'keys.pcTip': 'Na klávesnici PC: {key}',
    'keys.helpHtml': '<kbd>0</kbd>–<kbd>9</kbd>, <kbd>A</kbd>–<kbd>F</kbd> hex · <kbd>Enter</kbd> nebo <kbd>=</kbd> = · <kbd>M</kbd> M · <kbd>X</kbd> EX · <kbd>R</kbd> R · <kbd>P</kbd> BR · <kbd>L</kbd> L · <kbd>S</kbd> S · <kbd>I</kbd> přerušení · <kbd>Esc</kbd> RE',
    'keys.helpSaviaHtml': '<kbd>0</kbd>–<kbd>9</kbd>, <kbd>A</kbd>–<kbd>F</kbd> hex · <kbd>Enter</kbd> nebo <kbd>=</kbd> dA · <kbd>M</kbd> Ad · <kbd>X</kbd> Ex · <kbd>R</kbd> Reg · <kbd>P</kbd> Br · <kbd>L</kbd> L · <kbd>S</kbd> –S · <kbd>Esc</kbd> Reset',

    'mem.summary': 'Paměť: načíst a exportovat',
    'mem.loadTitle': 'Načíst do paměti',
    'mem.loadHelp': 'Intel HEX se zapíše na své adresy. BIN a prostý hex text se zapíšou od zadané adresy. Program se nespouští; spustíte ho monitorem ({keys}).',
    'mem.addr': 'Adresa',
    'mem.addrAria': 'Adresa pro BIN a hex text',
    'mem.loadFile': 'Načíst soubor',
    'mem.loadFileTip': 'Načte soubor .hex (Intel HEX) nebo .bin do paměti.',
    'mem.hexPlaceholder': 'Prostý hex text, např. 3E 55 32 00 1D 76',
    'mem.writeHex': 'Zapsat hex text',
    'mem.exportTitle': 'Exportovat z paměti',
    'mem.exportHelp': 'Rozsah adres, které se uloží do souboru.',
    'mem.fromTo': 'Od – do',
    'mem.fromAria': 'Export od adresy',
    'mem.toAria': 'Export do adresy',
    'mem.expHex': 'Exportovat Intel HEX',
    'mem.expHexTip': 'Uloží zvolený rozsah paměti jako soubor .hex (Intel HEX).',
    'mem.expBin': 'Exportovat BIN',
    'mem.expBinTip': 'Uloží zvolený rozsah paměti jako soubor .bin (holé bajty).',
    'mem.wavHelp': 'WAV: záznam na pásku, jaký vytvoří příkaz S (SAVE) továrního monitoru, k přehrání do MG IN konektoru K3 skutečného PMI-80 a načtení příkazem L (LOAD) továrního monitoru. SAVE nahrává vždy až do konce 256bajtové stránky, proto se rozsah rozdělí na hranicích stránek do bloků, očíslovaných od zadaného čísla bloku (hex), s 20 s ticha mezi nimi. Když LOAD poslouchá, svítí vlevo t; po načtení bloku displej ukáže „MG Stop“: pak zadejte další L (potřebujete-li víc času, pozastavte přehrávač). Vstup skutečného PMI-80 potřebuje silný signál (původní zapojení asi 3 V efektivní hodnoty): přehrávejte naplno, případně přes zesilovač.',
    'mem.tapeNumber': 'Č. bloku',
    'mem.tapeNumberAria': 'Číslo prvního bloku na pásce (hex, 00–FF)',
    'mem.expWav': 'Exportovat WAV (páska)',
    'mem.expWavTip': 'Uloží rozsah jako záznam na pásku (.wav) ve formátu továrního monitoru.',
    'mem.wavDone': 'Záznam {seconds} s. Na PMI-80 s továrním monitorem: {steps}.',
    'mem.wavStep': 'L {addr} = {number} =, libovolná klávesa, přehrát blok {number}',
    'mem.wavThen': '; potom ',
    'mem.badNumber': 'neplatné číslo bloku „{value}“',
    'mem.wavTooLong': 'na záznam příliš dlouhé: nejvýše {max} bloků po 256 bajtech',
    'mem.written': 'Zapsáno {n} B: {where}. Bajty mimo RAM ({ram}) se nezapíšou.',
    'mem.error': 'Chyba: {msg}',
    'mem.badAddr': 'neplatná adresa „{value}“',
    'mem.endBeforeStart': 'konec je před začátkem',
    'mem.saved': 'Uloženo: {path}',
    'mem.saveCancelled': 'Ukládání zrušeno.',
    'mem.saveFailed': 'Uložení selhalo: {err}',
    'mem.hostDialog': 'dialog pro uložení selhal (kód {code})',
    'mem.hostWrite': 'soubor se nepodařilo zapsat',

    'aboutPc.summary': 'O počítači',
    'aboutPc.pmi80Html': PMI80_ABOUT_CS,
    'aboutPc.savia84Html': SAVIA84_ABOUT_CS,
    'aboutPc.stone1Html': STONE1_ABOUT_CS,
    'aboutEmu.summary': 'O emulátoru',
    'aboutEmu.licenseHtml': 'Copyright © 2026 Matěj „Wolf“ Holyszewski. Wolf80 je svobodný software: můžete ho šířit a upravovat za podmínek licence GNU General Public License verze 3, nebo (podle své volby) kterékoli pozdější verze. Je poskytován <b>bez jakékoli záruky</b>. Monitory a programy jiných autorů pod tuto licenci nespadají. Zdrojový kód je na <a href="https://github.com/Holyszewski/Wolf80" target="_blank" rel="noopener">GitHub</a>.',
    'aboutEmu.licenseFull': 'Plné znění licence (GNU GPL 3, anglicky)',
    'aboutEmu.offline': 'Stáhni si Wolf80 offline',
    'aboutEmu.offlineNote': 'Jeden soubor HTML, který běží v prohlížeči i bez připojení. EXE pro Windows a starší verze jsou na <a href="https://github.com/Holyszewski/Wolf80/releases/latest" target="_blank" rel="noopener">stránce vydání</a>.',
    'aboutEmu.html': '<p><b>Wolf80</b> {version} je emulátor československých jednodeskových počítačů: výukových PMI-80 a Savia-84 a počítače Stone 1. Má vlastní jádra procesorů 8080 a Z80, napsaná podle příruček Intel a Zilog; na nich běží původní monitory.</p><p>Dílem tohoto projektu nejsou a jsou zde s uvedením autorů: tovární monitor PMI-80 (TESLA Piešťany, 1982) v podobě, jak ho šíří <a href="https://www.nostalcomp.cz/" target="_blank" rel="noopener">Nostalcomp</a> (Ing. Jiří Koutný); tovární monitor Savia-84 od Ing. Václava Krause, otištěný v knize Radioamatérské konstrukce 4 (SNTL, 1990); monitory PMI-80 C a STONE-PMI s hrami COSMOS a TENIS3 v úpravě Nostalcompu (2019). COSMOS je hra Jiřího Šutery, TENIS3 je Nostalcompova verze hry TENIS od neuvedeného autora, vydané jako slovenský aplikační list mikroelektroniky a do elektronické podoby převedené Nostalcompem. Díky Nostalcompu za jejich uchování a šíření. Mikrovarhany, Světelný had a AION Buzzer 80 jsou od autora tohoto emulátoru.</p><p>Emulátor obsahuje i vlastní porty několika her z podobných jednodeskových počítačů té doby: KIM-1 (MOS Technology, USA), NEC TK-80 (Japonsko), Acorn System 1 a MK14 od Science of Cambridge (oba Velká Británie). Vybíral jsem je tak, aby byly zároveň reprezentativní pro to, co se na takových strojích hrálo, zábavné i dnes a aby pocházely z co nejvíce různých počítačů. Pro tento emulátor byly napsány znovu podle originálů jako kompromis mezi co největší věrností předloze a drobnými vylepšeními pro pohodlnější hraní a opravami chyb.</p><p>Jas číslic vychází z toho, jak dlouho program nechá každý segment svítit, stejně jako u skutečného multiplexního displeje.</p><p>Emulátor byl vytvořen s pomocí AI Claude (model Claude Opus 5.5 od společnosti Anthropic).</p>',
    'lang.aria': 'Jazyk',
    'theme.aria': 'Vzhled',
    'theme.light': 'Světlý',
    'theme.dark': 'Tmavý',
    'theme.system': 'Podle systému',
    'theme.systemTip': 'Řídit se světlým nebo tmavým nastavením systému',
    'brand.subHtml': 'JEDNODESKOVÝ<br>MIKROPOČÍTAČ',

    'tahak.commands': 'Příkazy monitoru',
    'tahak.reTxt': 'reset, návrat do monitoru (displej „PMI -80“)',
    'tahak.mKey': 'M adr = data = …',
    'tahak.mTxt': 'prohlížení a zápis paměti; = přejde na další adresu',
    'tahak.exKey': 'EX adr =',
    'tahak.exTxt': 'spuštění programu od adresy',
    'tahak.rTxt': 'registry; vyberou se klávesami SP, HL, AF, BC, DE',
    'tahak.brKey': 'BR zar = start =',
    'tahak.brTxt': 'zarážka (instrukce RST 1) a spuštění; po zastavení lze prohlížet registry',
    'tahak.iTxt': 'hardwarové přerušení: RST 7, monitor skočí na 1FE6h; program musí mít EI',
    'tahak.lsTxt': 'magnetofon: načíst / uložit (v emulátoru zatím není)',
    'tahak.services': 'Služby monitoru (CALL)',
    'tahak.clear': 'A = kód prvního znaku, ostatní pozice mezera',
    'tahak.outad': 'adresa z 1FF8–1FF9 jako 4 číslice',
    'tahak.modad': 'zadání adresy z klávesnice do 1FF8–1FF9',
    'tahak.outda': 'bajt z 1FFA jako 2 číslice',
    'tahak.modda': 'zadání bajtu do 1FFA',
    'tahak.outke': 'zobrazuje a čeká na stisk a uvolnění klávesy; kód v A',
    'tahak.disp': 'jeden průchod displejem a klávesnicí; CY = stisk',
    'tahak.tout': 'bajt z C na magnetofon',
    'tahak.tin': 'bajt z magnetofonu do C',
    'tahak.scratch': 'Zápisník monitoru v RAM',
    'tahak.stack': 'vrchol zásobníku monitoru (roste dolů)',
    'tahak.intr': 'obsluha přerušení (skok z 0038h)',
    'tahak.bpAddr': 'adresa zarážky',
    'tahak.bpByte': 'původní bajt na zarážce',
    'tahak.codes': 'kódy znaků devíti číslic',
    'tahak.inAdr': 'adresa (IN_ADR)',
    'tahak.inData': 'data (IN_DATA)',
    'tahak.textPtr': 'ukazatel na zobrazovaný text',
    'tahak.keyCode': 'kód stisknuté klávesy',
    'tahak.map': 'Mapa paměti',
    'tahak.mapRom': 'monitor (ROM)',
    'tahak.mapRom2': 'druhá EPROM (neosazena)',
    'tahak.mapRam': 'RAM 1 KiB; pro programy zhruba 1C00–1F00',
    'tahak.mapMirror': 'zrcadlo 0000–1FFF',
    'tahak.mapPorts': 'porty 8255: PA segmenty, PB, PC výběr číslice a klávesnice, řídicí slovo',
    'tahak.note': 'Platí pro tovární monitor PMI-80. Adresy jsou šestnáctkové.',
    'tahak.sReset': 'reset, návrat do monitoru (displej „SLAVIA 84“)',
    'tahak.sAdKey': 'Ad adr dA data …',
    'tahak.sAd': 'prohlížení a zápis paměti; dA další adresa, –S předchozí',
    'tahak.sExKey': 'Ex adr dA',
    'tahak.sEx': 'spuštění programu od adresy',
    'tahak.sBrKey': 'Br zar1 dA zar2 dA start dA',
    'tahak.sBr': 'dvě zarážky (instrukce RST 1) a spuštění',
    'tahak.sReg': 'registry AF, BC, DE, HL, SP; dA přejde dál',
    'tahak.sLS': 'magnetofon: v ROM chybí; monitor naběhne znovu',
    'tahak.s014f': 'HL jako čtyři číslice do 1FF9–1FFC (uloží do 1FF4–1FF5)',
    'tahak.s0160': 'A jako dvě číslice do 1FFE–1FFF (uloží do 1FF6)',
    'tahak.s0179': 'zobrazuje buffer od 1FF7 po DE průchodů',
    'tahak.s0188': 'vymaže buffer: A do 1FF7, za ním mezery',
    'tahak.s0196': 'zobrazuje 1FF7 a čeká na stisk a uvolnění klávesy; kód v A, Z = dA, CY = hex klávesa',
    'tahak.s0199': 'totéž s bufferem od HL',
    'tahak.s01fd': 'jeden průchod displejem (buffer 1FF7) a klávesnicí',
    'tahak.s0200': 'jeden průchod s bufferem od HL; CY = stisk, kód klávesy otočený doleva v A',
    'tahak.sTables': 'tabulky segmentů znaků a kódů kláves',
    'tahak.sStack': 'vrchol zásobníku (roste dolů); 1FD9–1FE1 skoky pro RST 28h, 30h, 38h',
    'tahak.sBp': 'dvě zarážky: adresa a původní bajt',
    'tahak.sRegs': 'registry zastaveného programu: PC, AF, BC, DE, HL, SP',
    'tahak.sWork': 'pracovní adresa a bajt',
    'tahak.sMapEmpty': 'prázdné (čtení vrátí poslední hodnotu na datové sběrnici)',
    'tahak.sMapRam': 'RAM 2 KiB; pro programy 1800 až zhruba 1F80',
    'tahak.sMapMirror': 'zrcadlo 0000–7FFF (A15 se nedekóduje)',
    'tahak.sMapPorts': '8255 (každý port s A2 = 0): PA segmenty (PA7 volný: zvuk), PB osm LED (zatím nezobrazeno), PC výběr číslice a klávesnice, řídicí slovo',
    'tahak.noteSavia': 'Platí pro tovární monitor Savia-84, podle ROM a knihy. Adresy jsou šestnáctkové. Ad, dA, –S a Reg jsou klávesy M, =, S a R na PMI-80.',
    'tahak.tRe': 'reset, návrat do monitoru (displej „StonE-PMI“)',
    'tahak.tI': 'přerušení: Z80 běží v IM 1, 0038h skočí na 1FE6h; program musí mít EI',
    'tahak.tL': 'běžící text',
    'tahak.tS': 'nabídka her: 0 COSMOS, 1 TENIS3',
    'tahak.tOutke': 'čeká, až není držena žádná klávesa, pak na stisk; kód v A',
    'tahak.tGames': 'COSMOS a TENIS3 (EX 0440 =, EX 0660 =)',
    'tahak.tMapGames': 'nabídka her, COSMOS a TENIS3 (druhá polovina 2716)',
    'tahak.noteStone': 'Platí pro Nostalcompův monitor STONE-PMI (2019): monitor PMI-80 bez rutin pro magnetofon. Adresy jsou šestnáctkové.',
    'tahak.cRe': 'reset, návrat do monitoru (displej „PMI -80 C“)',
    'tahak.cMapGames': 'druhá EPROM: nabídka her, COSMOS a TENIS3',
    'tahak.notePmiC': 'Platí pro Nostalcompův monitor PMI-80 C (2019): tovární monitor bez rutin pro magnetofon, s ošetřením zákmitů kláves. Běžící text ukazuje PMI-80 C (Wolfova úprava Nostalcompova textu). Adresy jsou šestnáctkové.',
    'tahak.oRe': 'reset, návrat do monitoru (displej „Stone 1“)',
    'tahak.oM': 'prohlížení a zápis paměti; = zapíše a přejde dál',
    'tahak.oEx': 'spuštění programu od adresy',
    'tahak.oR': 'registry AF, BC, DE, HL, SP, PC; = přejde dál',
    'tahak.oBr': 'zarážka (instrukce RST 1) a spuštění; při zastavení svítí br-StoP',
    'tahak.oI': 'přerušení: RST 7, 0038h skočí na 1FEFh; program tam zapíše skok a musí mít EI',
    'tahak.oModad': 'úprava HL z klávesnice; Z = ukončeno klávesou =',
    'tahak.oModda': 'úprava A z klávesnice; Z = ukončeno klávesou =',
    'tahak.oOutad': 'HL jako 4 číslice na displej',
    'tahak.oOutda': 'A jako 2 číslice na displej',
    'tahak.oOuthex': 'A jako 2 číslice na adresu v BC',
    'tahak.oGetc': 'zobrazuje a čeká na klávesu; kód v A, Z = klávesa =, CY = hex číslice',
    'tahak.oMpx': 'jeden průchod displejem a klávesnicí; A = kód klávesy nebo 0 (Z)',
    'tahak.oStack': 'vlastní zásobník monitoru',
    'tahak.oRegs': 'registry programu AF, BC, DE, HL, SP, PC',
    'tahak.oBp': 'adresa zarážky a bajt, který nahradila',
    'tahak.oVector': 'vektor přerušení: skok na obsluhu',
    'tahak.oKeys': 'filtr kláves: platná klávesa, poslední vzorek, počet shod',
    'tahak.oMapRom': 'EPROM 2716: monitor do 023C, zbytek volný',
    'tahak.oMapRam': 'RAM 2 KiB; bez zrcadel (úplné dekódování adres)',
    'tahak.oMapPorts': '8255 (opakuje se po 8 portech): PA segmenty, PB vstup, PC výběr číslice a klávesnice, řídicí slovo',
    'tahak.noteStone1': 'Platí pro vlastní monitor Stone 1. Kódy znaků se liší od PMI-80 (mezera 27h). Adresy jsou šestnáctkové.',

    'ops.title': 'Instrukce 8080',
    'ops.byCode': 'podle kódu',
    'ops.byName': 'podle názvu',
    'ops.grid': 'mřížka 16×16',
    'ops.find': 'hledat: MOV, 3E, JMP …',
    'ops.findAria': 'Hledat instrukci',
    'ops.titleZ80': 'Instrukce Z80',
    'ops.findZ80': 'hledat: LD, 3E, DJNZ, DD …',
    'ops.noteZ80': 'Kód je šestnáctkově i s prefixy (CB, DD, ED, FD). n je bajt, nn dvoubajtová adresa nebo číslo (v paměti nejdřív nižší bajt), d posunutí se znaménkem u (IX+d) a (IY+d), e cíl relativního skoku. B = délka v bajtech, T = počet taktů; „7/12“ znamená podmínka nesplněna / splněna (u opakujících se blokových instrukcí: poslední průchod / další průchod). Šedou kurzívou jsou nedokumentované instrukce; z DD CB a FD CB jsou uvedeny jen tvary bez kopie do registru. Mřížka ukazuje kódy bez prefixu.',
    'ops.note': 'Kód je šestnáctkově. nn je bajt, nnnn dvoubajtová adresa nebo číslo (v paměti nejdřív nižší bajt). B = délka v bajtech, T = počet taktů; u podmíněných skoků a volání platí delší čas, když se podmínka splní. Šedou kurzívou jsou nedokumentované kopie jiných instrukcí.',

    'dbg.regs': 'Registry',
    'dbg.ppi': '8255 (F8–FB)',
    'dbg.dis': 'Program od PC',
    'dbg.mem': 'Paměť',
    'dbg.addr': 'Adresa',
    'dbg.rom': 'ROM',
    'dbg.ram': 'RAM',
    'dbg.romTip': 'Přejít na začátek ROM (0000)',
    'dbg.ramTip': 'Přejít na začátek RAM ({addr})',
    'dbg.memNote': 'kolečko myši posouvá',
    'dbg.memPrev': '−1 KiB',
    'dbg.memPrevTip': 'Ukázat předchozí kilobajt',
    'dbg.memNext': '+1 KiB',
    'dbg.memNextTip': 'Ukázat následující kilobajt',
    'dbg.later': 'Úpravy registrů a paměti, zarážky a krokování přes podprogram přibudou později.',
    'dbg.states': 'takty',
    'dbg.digit': 'číslice',
  },
};

// The text of `key` in `lang` with {name} parameters filled in; English when the language has
// no such key, the key itself when English has none either.
export function uiText(lang, key, params = {}) {
  const s = UI_TEXT[lang]?.[key] ?? UI_TEXT.en[key];
  if (s === undefined) return key;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}
