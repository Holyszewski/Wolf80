# Ship, Captain, Crew / Loď, kapitán, posádka — 0.1.0

Original Wolf80 implementation of the traditional five-dice game. GPL-3.0-or-later. No historical game code was copied; the display/keyboard routines derive from this project's Bagels.

Rules reference: https://users.sussex.ac.uk/~ph77/BarDiceOnePlayer/rules.html . The maintainer selected a fixed match of 1–9 players and 1–8 rounds, with accumulated scores and no target score. Maximum total is 96.

## Setup and controls

SHIP begins at the third digit from the left. PLAYErS asks for 1–9 players, then roundS asks for 1–8 rounds. Each chosen number blinks on the rightmost digit before continuing. A held selection key cannot select the next setting.

| Key | Action |
|---|---|
| = (dA on Savia) | Roll; at End, replay with the same settings |
| S (−S on Savia) | Accept cargo early, after obtaining 6/5/4 |
| A | Show blinking r and the round number instead of the total for about 2 seconds, then automatically restore the total |
| F | Abandon the match and choose players/rounds again |
| Reset | Exit |

Each player has at most three rolls. A 6 (ship), then 5 (captain), then 4 (crew) are banked automatically at the left. They may all come from one roll regardless of their original positions. The two remaining dice are cargo. Both are rerolled together, and a lower replacement must be accepted. Without all three qualifying dice the turn adds zero points.

The nine display positions are: player, roll counter, five dice, two-digit **cumulative total**. The player, banked dice and cumulative total blink together; the roll counter and unbanked dice remain steady. The counter is blank before the first roll; it shows segment d after roll one, d+g after roll two, and d+g+a after roll three. It stays visible during turn-end animations and clears for the next player or round. A and early banking with S do not increment it. Unrolled dice are dashes. The total excludes the current unaccepted cargo.

After the third roll or S, the two cargo positions blink slowly first, but only when the trio is complete. With an incomplete trio this animation is skipped and the score is unchanged. Then the cargo is credited and the new cumulative total blinks at the same rate. The next player follows automatically without an extra keypress. Keys during these animations cannot spill into the next turn. The last player's completion advances the round automatically. At End, position 4 is the winner (0 = tie or all-zero results) and the last two positions show the best total. The result is steady. Individual score browsing from the earlier implementation was removed to fit the requested animations in original PMI RAM. No sound.

## Targets and files

| Suffix | Board / monitors | Entry | Code | Variables |
|---|---|---|---|---|
| pmi80 | PMI-80 factory / PMI-80 C | 1C00h | 1C00h–1FC6h (967 bytes) | 1FC7h–1FEDh |
| savia | Savia-84 factory, nine digits | 1800h | 1800h–1BD1h (978 bytes) | 1BD2h–1BF8h |
| stone1 | Stone 1 original / STONE-PMI | 1800h | 1800h–1BD2h (979 bytes) | 1BD3h–1BF9h |

Stack reservation 1FF0h–1FFFh, initial SP=2000h, descending. Only documented 8080 instructions in Intel/Wolf80 assembler syntax. The game owns its I/O and disables interrupts; it does not call the monitor or preserve its scratchpad. Reset exits. Savia uses direct digit selection, PMI and Stone inverted selection. The display buffer's high bit marks blinking internally; it is masked before output, so PA7 always stays low. Timings target the existing 1.111 MHz PMI and 2 MHz Savia/Stone profiles.

Launch from the catalog, or load HEX/ASM and start with `= EX 1 C 0 0 =` on PMI, `Ex 1 8 0 0 dA` on Savia, `EX 1 8 0 0 =` on Stone. BIN loads at the listed entry. Manual bytes are in `*-bytes.txt` and after END in each ASM. Variables are initialized on entry, not emitted into BIN/HEX.

Rebuild standalone files with `node programs/ship-captain-crew/build.mjs`, then build the emulator with `node tools/build.mjs`. The build checks RAM bounds and page-local font/score indexing. The PMI image, variables and stack reservation fit the original 1 KiB RAM; no RAM expansion is required. The monitors' own stack reaches down to 1FCBh (PMI-80 C) or 1FCDh (factory) while the program is typed in and started, above the image's end at 1FC6h. The Savia and Stone images end with the maintainer's signature `Wolf2026v010` (the year and the version); the PMI-80 has no room for it.

## Randomness and verification

An 8-bit timing accumulator advances every display scan, including setup and waits. Rolls mix it with scan timing and force a nonzero seed for an 8-bit LFSR. Rejecting 253–255 gives 42 accepted states per face over a full LFSR cycle. This does not imply independent rolls: it is a small deterministic game PRNG with repeatable/colliding seeds, not a cryptographic random source. Waiting before the first player selection remains influential after confirmation animations.

`node --test tests/game-ship-captain-crew.test.mjs`: 48 checks cover all five board/firmware combinations, actual monitor launch, keyboard mapping and held keys, selection limits, 9×8 matches and total 96, cumulative score, banking rules, real animation ordering, transient round display, both display-port blink phases for bank sizes 0–3, memory-write bounds, RNG timing influence, and ASM/BIN/HEX consistency. Bulk match tests shorten only animation dwell by changing its loop counter; dedicated animation tests run at real emulated timing. Emulator evidence only, no physical hardware test.


An idle blink desynchronization was reported in an offline Firefox session on Savia. Continuous 15-second port traces and the UI brightness filter currently remain synchronized in regression tests; the reported browser state has not yet been reproduced. Do not treat the failed-cargo fix as a verified fix for that separate report.

The reporter later could no longer reproduce the idle desynchronization and will report a recurrence. Its cause remains unknown; no speculative display change was made.

## Versions

- **0.1.0** — first numbered game version (2026-10-27): includes the horizontal roll counter, cumulative scoring and the corrected qualified-cargo animation. The preceding development builds had no version number. Source headers and all three catalog entries share this version. Emulator release numbering is independent.
