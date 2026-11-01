# Stone 1: how the emulator models the board

Implementation: `src/board/stone1.js` (it extends the Savia-84 model, `src/board/savia84.js`), `src/core/z80.js`. Tests: `tests/stone1.test.mjs`.

Levels of certainty as in [pmi80.md](pmi80.md): **DOC** stated on the pages of the Stone 1, **ROM** follows from a monitor's code, **ASSUMED** a reasoned choice not checked on a physical board. The maintainer has no Stone 1.

## Sources

- [Stone 1](http://www.malecky.cz/stone1/) on malecky.cz (updated 2018-11-23): the computer is by Radek Veselý and was published there with his consent; description, parts list, the circuit diagram and board drawings (images on the page, not read for this model).
- [Monitor pro Stone 1](http://www.malecky.cz/stone1/stone1.htm): the board's own monitor, its commands, character and key codes, variables and entry points, and `stone1.zip` with the monitor as Intel HEX and a commented listing (`stone1.hex`, `stone1.lst`, 2018-11-18).
- Nostalcomp: *Monitor STONE_PMI* (PDF, spring 2019) and `info.txt` of its distribution `stone_pmi.zip`, attached to the forum post [Monitor a hry pro PMI-80 a STONE (příp. SAVIA 84)](https://oldcomp.cz/viewtopic.php?p=92671#p92671) (OldComp.cz, 2019-05-07; reading it may need an account): the STONE-PMI monitor, written for "the STONE" built in the PMI version. The post gives one monitor for a Z80 at 2 MHz ("STONE, a modified SAVIA 84") and one for an 8080 at 1.111 MHz (the PMI-80 and its replicas), and asks the owners of a STONE for feedback.

## The computer

"A retro computer from the Stone Age": a cross between the PMI-80 and the Savia-84 (DOC).

| Part | Model | Certainty |
|---|---|---|
| CPU | Z80, crystal 2.000 MHz, so 2 MHz | DOC |
| EPROM | 2716, 0000–07FF | DOC |
| RAM | 6116, 1800–1FFF | DOC |
| Address decoder | 74LS138, **full decoding**: the memories are not mirrored, unlike on the models | DOC |
| Everything else in memory | nothing; a read returns the last value on the data bus, as measured on the PMI-80 and the Savia-84 | ASSUMED |
| 8255 | wired as on the models, repeated every 8 port addresses (so selected by A2 = 0, like the Savia); the monitors use F8–FB | DOC |
| Display | nine digits LD-S028G-CC (common cathode), segments through BC556 | DOC |
| Digit select | PC0–PC3 through four gates of a 74LS00 (IC9) to the 74145, so inverted as on the PMI-80; the board's monitor writes `CMA` before `OUT PC` | DOC (the Savia variant replaces IC9 by links), ROM |
| Keyboard | 25 keys like the PMI-80: 23 in the matrix with the same key codes, Re and I wired to the hardware | DOC |
| I key | /INT. The page says that the PMI variant needs pull-up resistors on the data bus for the interrupt key; the emulator supplies FFh (RST 38h) during the acknowledge | ASSUMED |
| Power | 5 V, about 350 mA; board 197 × 113 mm | DOC |
| Sound, tape | none; the emulator's virtual amplifier is on PA7, as on the Savia-84 | ASSUMED |
| RAM after power on | FFh, as on the Savia's 6116 | ASSUMED |

The page also describes two variants, not modelled: **PMI** (a 1 MHz crystal or a divider to come near the PMI-80's 1.111 MHz, the tape circuits of the original, pull-ups on the data bus for the I key) and **SAVIA** (IC9 replaced by four wire links, no second digit, no I key).

## Firmware

### The board's own monitor (withheld)

Withheld from the repository and the builds for now, see Distribution below. `roms/stone1/stone1_monitor.bin`: the published `stone1.hex` (573 bytes, 0000–023C) in a 2716 image filled with FFh. The author wrote it because the monitors of the models do not debounce the keys, end editing with an error message and a restart, and overwrite the user's stack at a breakpoint (DOC).

- 8080 code (ROM: written in Intel mnemonics). It does not set an interrupt mode, so the Z80 stays in IM 0, and RST 38h at 0038h jumps to the vector at 1FEFh.
- Control word 8Ah (PB input), its own stack at 1FC8–1FDF, registers of the program at 1FE0–1FEB, display buffer 1FF4–1FFC with the pointer 1FF2.
- A key counts after five equal samples (the counter is set to 4 on a change), one sample per pass of the display; a pass takes about 10 ms (a 0.95 ms delay per digit), so a key has to be held for about 50 ms or more. The program buttons of the UI hold each key for 100 ms.
- Commands M, R, Br, Ex as on the PMI-80; = confirms, any other key cancels without an error. The greeting is `Stone 1`; any key gives the prompt `?`. Its own character codes (40, blank = 27h), the PMI-80's key codes.

### STONE-PMI (the only firmware while the own monitor is withheld)

`roms/stone1/stone_pmi.bin`: Nostalcomp's adaptation of the PMI-80's factory monitor for "the STONE", a Z80 at 2 MHz, built in the PMI version: inverters in front of the 74145 and all nine digits fitted, which is the full Stone 1 (DOC). It sets IM 1, so the I key goes to 0038h and on to 1FE6h as on the PMI-80; the tape routines are replaced by a scrolling text (L) and a menu of games (S): COSMOS at 0440h and TENIS3 at 0660h. It uses only RAM from 1C00h, which the Stone 1 has.

Nostalcomp tried it on its PMI-80 replica with a Z80 at 2 MHz (DOC); whether it is the same "STONE" as Radek Veselý's Stone 1 is not stated, but everything it needs matches the Stone 1.

## Distribution

The monitor of the Stone 1 is published on malecky.cz with no terms of distribution. The maintainer will ask its author for permission ([TODO](TODO.md)).

### The own monitor, withheld

Until Radek Veselý agrees, the own monitor is not published with the emulator (the maintainer's decision, 2026-11-01): its two files are not in the repository and the builds do not carry it, so the Stone 1 starts with STONE-PMI and offers no choice of firmware. Everything else stays in place, so that it can come back without new work:

- the board model (`src/board/stone1.js`), the UI texts of the firmware (`board.stone1Monitor` in `src/ui/i18n.js`, the cheat sheet), and the tests of the own monitor in `tests/stone1.test.mjs`, which are skipped while its ROM is missing;
- the ports COSMOS and TENIS3 for the own monitor (`programs/cosmos/cosmos-stone1.asm`, `programs/tenis3/tenis3-stone1.asm`, with their listings), set aside in the catalogue's `withheld` list; their tests against the originals run on the Stone 1 with STONE-PMI.

To bring it back, once the author agrees:

1. Put `stone1.hex` (SHA-256 `37d72a3b845f49c56b5bf02710ab629a76f3296ee45d247ebfaeddd41e7839bc`) and `stone1_monitor.bin` (`c040cfc4fb211b21a459e5740e3abb119621aac8535c03a6993ce5004d3e3d7b`) back into `roms/stone1/` and add them to git.
2. Uncomment the `stone1` firmware in `src/board/profiles.js` (first, so that it is the default again) and the `stone1` ROM in `tools/build.mjs`.
3. Add `stone1: 'stone1/stone1_monitor.bin'` back to the ROM tables of `tests/game-*.test.mjs` and `tests/programs.test.mjs` (`readFileSync`), and let the Stone 1 ports in `PORTS` of `tests/programs.test.mjs` run on `['stone1', 'stone1']` again.
4. Move the two entries of `withheld` in `programs/catalog.json` back into `programs`, each in front of its STONE-PMI counterpart.
5. Restore the credits: the Stone 1 monitor in `roms/README.md`, `desktop/CREDITS-desktop.txt` and `aboutEmu.html` in `src/ui/i18n.js`; drop this section and the item in `docs/TODO.md`.
6. `npm test`: the skipped tests of the own monitor must run and pass.
