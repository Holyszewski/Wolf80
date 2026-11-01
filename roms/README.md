# ROM images

The ROM images in this folder are **not** the work of this project's author and are **not** covered by the project license (GPL-3.0-or-later). They are firmware of the emulated computers, included with credit so that the emulator can run them. Each entry names its author and origin as far as known.

## PMI-80

| File | Size | SHA-256 | Content |
|---|---|---|---|
| `pmi80/pmi80_monitor.bin` | 1024 | `1717e466e24054ea52722476a82dcc3d471ac218dc144898f376030c64bd12fa` | Factory monitor of the PMI-80 (TESLA Piešťany, 1982). |

| `pmi80/pmi80c_monitor.bin` | 1024 | `1440557a1ccc7669321ddadc8e4313936a73dcea4575a3e22114337f7a360aea` | PMI-80 C monitor by Nostalcomp (2019), with the maintainer's change of the scrolling text. |
| `pmi80/pmi80c_games.bin` | 1024 | `2fbec278bef7fc05c683f8a4e4ad7fcc533f08eb79f57e7003987da893e25fc0` | Second EPROM of PMI-80 C: a game menu, COSMOS and TENIS3. |

The image is the commonly distributed `PMI80.ROM`, as shared by Nostalcomp ([nostalcomp.cz](https://www.nostalcomp.cz/)) on its page about the PMI-80, which is no longer on the redesigned site. Nostalcomp got the file from the internet and compared it with the ROM of an original PMI-80, serial number 2607, finding no difference; the commented disassembly Nostalcomp published reassembles to the identical image.

PMI-80 C is Nostalcomp's adaptation of the factory monitor (TESLA Piešťany, 1982) for the standard PMI-80 at 1.111 MHz: the tape routines (LOAD, SAVE, TIN, TOUT) are replaced by a scrolling text, the key reading is debounced, the digit 9 has its tail and there are more characters; the second EPROM holds a menu with COSMOS (by Jiří Šutera, changed by Nostalcomp) and TENIS3 (Nostalcomp's version of TENIS). Both are from Nostalcomp's distribution `stone_pmi.zip` (`pmi1_c.bin`, `pmi2_c.bin`, with `info.txt` and the PDF "Monitor STONE_PMI", spring 2019), published on the OldComp.cz forum (see STONE-PMI below). The monitor here is the maintainer's variant of `pmi1_c.bin`: its scrolling text shows "PMI-80 C" and the test characters instead of Nostalcomp's "Čau borče" (8 bytes at 03B1h differ); it is what the maintainer's working unit no. 1452 runs.

## Savia-84

| File | Size | SHA-256 | Content |
|---|---|---|---|
| `savia84/savia84_monitor.bin` | 2048 | `3caf3ed02f7fd8bc2484bbfb48df788ef1db01a8098146f9f8bd9e8f61efd031` | Factory monitor of the Savia-84 (1 KiB, followed by 1 KiB of FFh). |

The monitor was written by Ing. Václav Kraus (ČVUT FEL) for the Savia-84 designed by Jaroslav Tomáš Hyan; its hexadecimal listing is printed in the book *Radioamatérské konstrukce 4* (SNTL, Prague 1990, ISBN 80-03-00208-7), table 4.1 on p. 131. The image is the one Nostalcomp ([nostalcomp.cz](https://www.nostalcomp.cz/)) shared on its Savia page, read from a working board and padded to 2 KiB for a 2716 EPROM. It was compared with the book's listing byte by byte (2026-10-24): all 1024 bytes agree (at 021Bh and 03D3h the print is unclear, B7 and 0B, and the image agrees with the reading that fits the code). A partly commented disassembly by Vladimír Tichý circulates with it; it is not included.

## Stone 1

| File | Size | SHA-256 | Content |
|---|---|---|---|
| `stone1/stone_pmi.bin` | 2048 | `528c9d1fc581859daae033d953bac0ddad007cddebccc8789c2a1de5625b26ca` | STONE-PMI monitor by Nostalcomp (2019) for an EPROM 2716: 0000–03FF the monitor, 0400–079F a menu with the games COSMOS and TENIS3. |

The Stone 1 and its own monitor are by Radek Veselý; the computer and the monitor were published on [malecky.cz](http://www.malecky.cz/stone1/) with his consent. The page states no terms of distribution, so the own monitor is not included until its author agrees; the emulator runs the Stone 1 with STONE-PMI (`docs/stone1.md`).

STONE-PMI is Nostalcomp's adaptation of the factory PMI-80 monitor (TESLA Piešťany, 1982) for "the STONE", a Z80 at 2 MHz built in the PMI version (the full Stone 1): the tape routines are replaced by a scrolling text and a game menu, the key reading waits for the keys to be released and is debounced, the digit 9 has its tail, there are more characters, and the Z80 is set to interrupt mode 1 (`ED 56` at 003Bh, so it does not run on an 8080). The second half holds COSMOS (by Jiří Šutera, changed by Nostalcomp) and TENIS3 (Nostalcomp's version of TENIS). The file is `stone_c.bin` from Nostalcomp's distribution `stone_pmi.zip`, described in its PDF "Monitor STONE_PMI" (spring 2019) and in `info.txt`. Nostalcomp published the distribution on 7 May 2019 as an attachment to the thread [Monitor a hry pro PMI-80 a STONE (příp. SAVIA 84)](https://oldcomp.cz/viewtopic.php?p=92671#p92671) on the OldComp.cz forum (reading it may need an account there).
