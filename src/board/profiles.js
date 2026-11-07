// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Machine profiles: what the user interface needs to know about each board and its firmware,
// so that it never reaches into a particular board. A firmware is a choice within a board; its
// create(roms, options) takes the ROM images by their names in globalThis.WOLF80_ASSETS.roms
// (tools/build.mjs), and `roms` lists the names it uses; options are passed on to the board
// ({ customRom }).

import { Pmi80, PMI80_CLOCK_HZ, PMI80_DIGITS, PMI80_LAYOUT, pmi80RunKeys } from './pmi80.js';
import { Savia84, SAVIA84_CLOCK_HZ, SAVIA84_DIGITS, SAVIA84_LAYOUT, SAVIA84_MISSING_DIGIT, savia84RunKeys } from './savia84.js';
import { Stone1, STONE1_CLOCK_HZ, stone1RunKeys } from './stone1.js';

// Each profile:
//   cpu: '8080' or 'z80'; clockHz; digits; layouts: { pmi, board? } (rows of key names);
//   noKeys: keys of the shared PMI-80 layout the board does not have;
//   firmware: [{ id, roms, create(roms, options), runKeys(start), holdMs }], the first is the default;
//   ram: [first, last];
//   tape: the factory PMI-80 tape format applies (WAV export);
//   bootMs: how long the monitor needs after a reset before it takes the first key; holdMs: how
//   long a key is held when a program is started, and the shortest press of a clicked key.
export const BOARD_PROFILES = Object.freeze({
  pmi80: Object.freeze({
    id: 'pmi80', name: 'PMI-80', cpu: '8080', clockHz: PMI80_CLOCK_HZ, digits: PMI80_DIGITS,
    layouts: { pmi: PMI80_LAYOUT }, noKeys: [],
    firmware: [
      { id: 'factory', roms: ['pmi80'], create: (r, o) => new Pmi80({ ...o, rom: r.pmi80 }), runKeys: pmi80RunKeys, holdMs: 40 },
      // Nostalcomp's PMI-80 C with its second EPROM (game menu, COSMOS, TENIS3) at 0400h; its key
      // reading is debounced and takes a key held for about 60 ms or more
      { id: 'pmi80c', roms: ['pmi80c', 'pmi80cgames'], create: (r, o) => new Pmi80({ ...o, rom: r.pmi80c, rom2: r.pmi80cgames }), runKeys: pmi80RunKeys, holdMs: 100 },
    ],
    ram: [0x1c00, 0x1fff], tape: true, bootMs: 50,
  }),
  savia84: Object.freeze({
    id: 'savia84', name: 'Savia-84', cpu: 'z80', clockHz: SAVIA84_CLOCK_HZ, digits: SAVIA84_DIGITS,
    missingDigit: SAVIA84_MISSING_DIGIT,
    layouts: { pmi: PMI80_LAYOUT, board: SAVIA84_LAYOUT }, noKeys: ['I'],
    firmware: [{ id: 'factory', roms: ['savia84'], create: (r, o) => new Savia84({ ...o, rom: r.savia84 }), runKeys: savia84RunKeys, holdMs: 40 }],
    ram: [0x1800, 0x1fff], tape: false, bootMs: 50,
  }),
  stone1: Object.freeze({
    id: 'stone1', name: 'Stone 1', cpu: 'z80', clockHz: STONE1_CLOCK_HZ, digits: PMI80_DIGITS,
    layouts: { pmi: PMI80_LAYOUT }, noKeys: [],
    firmware: [
      // The board's own monitor (Radek Veselý) is withheld until its author agrees to its publication:
      // its ROM is not in the repository or the builds. To bring it back, see docs/stone1.md ("The own
      // monitor, withheld"). It takes a key after five equal samples of about 10 ms each.
      // { id: 'stone1', roms: ['stone1'], create: (r, o) => new Stone1({ ...o, rom: r.stone1 }), runKeys: stone1RunKeys, holdMs: 100 },
      { id: 'stone-pmi', roms: ['stonepmi'], create: (r, o) => new Stone1({ ...o, rom: r.stonepmi }), runKeys: stone1RunKeys, holdMs: 40 },
    ],
    ram: [0x1800, 0x1fff], tape: false, bootMs: 50,
  }),
});

// Whether a catalogue entry runs on this board and firmware: its `board` must match, and its
// optional `firmware` list must name the firmware (no list: every firmware of the board).
export function programFits(entry, boardId, firmwareId) {
  return entry.board === boardId && (!entry.firmware || entry.firmware.includes(firmwareId));
}
