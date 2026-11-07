// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// A custom ROM over the boards' own ROMs (src/machine/custom-rom.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pmi80 } from '../src/board/pmi80.js';
import { Savia84 } from '../src/board/savia84.js';
import { Stone1 } from '../src/board/stone1.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';

const rom = p => new Uint8Array(fs.readFileSync(new URL(`../roms/${p}`, import.meta.url)));
const PMI80 = rom('pmi80/pmi80_monitor.bin');
const SAVIA84 = rom('savia84/savia84_monitor.bin');
const STONEPMI = rom('stone1/stone_pmi.bin');
const block = (addr, ...bytes) => ({ addr, bytes: Uint8Array.from(bytes) });

test('the custom ROM wins over the monitor where it has bytes, the monitor stays elsewhere', () => {
  const m = new Pmi80({ rom: PMI80, customRom: [block(0x0001, 0xaa, 0xbb)] });
  assert.equal(m.read(0x0000), PMI80[0]);
  assert.equal(m.read(0x0001), 0xaa);
  assert.equal(m.read(0x0002), 0xbb);
  assert.equal(m.read(0x0003), PMI80[3]);
  assert.equal(m.region(0x0001), 'rom');
  assert.deepEqual(m.customRom.overRom, [{ from: 0x0001, to: 0x0002 }]);
});

test('PMI-80: the custom ROM shows in the mirror at 2000h, as a chip would', () => {
  const m = new Pmi80({ rom: PMI80, customRom: [block(0x2005, 0x12)] });
  assert.equal(m.read(0x0005), 0x12);
  assert.equal(m.read(0x2005), 0x12);
  assert.deepEqual(m.customRom.overRom, [{ from: 0x0005, to: 0x0005 }]);
});

test('PMI-80: an empty area becomes ROM, bytes meant for RAM are left out', () => {
  const m = new Pmi80({ rom: PMI80, customRom: [block(0x0800, 1, 2), block(0x1c00, 3), block(0x8000, 4)] });
  assert.equal(m.read(0x0800), 1);
  assert.ok(m.populated(0x0801));
  assert.equal(m.region(0x0800), 'rom');
  assert.equal(m.region(0x8000), 'rom');
  assert.equal(m.read(0x8000), 4);
  assert.notEqual(m.read(0x1c00), 3);
  assert.deepEqual(m.customRom.empty, [{ from: 0x0800, to: 0x0801 }, { from: 0x8000, to: 0x8000 }]);
  assert.deepEqual(m.customRom.leftOut, [{ from: 0x1c00, to: 0x1c00 }]);
  assert.equal(m.customRom.size, 3);
  assert.equal(m.customRom.start, 0x0800);
  m.write(0x1c00, 0x5a); // RAM stays writable
  assert.equal(m.read(0x1c00), 0x5a);
});

test('the CPU runs the custom ROM: a reset starts at 0000h', () => {
  // 0000: MVI A,42h; STA 1C00h; HLT
  const m = new Pmi80({ rom: PMI80, customRom: [block(0x0000, 0x3e, 0x42, 0x32, 0x00, 0x1c, 0x76)] });
  m.run(200);
  assert.equal(m.read(0x1c00), 0x42);
});

test('Savia-84: A15 is ignored, so the custom ROM shows from 8000h too', () => {
  const m = new Savia84({ rom: SAVIA84, customRom: [block(0x0400, 0x77)] });
  assert.equal(m.read(0x0400), 0x77);
  assert.equal(m.read(0x8400), 0x77);
  assert.deepEqual(m.customRom.empty, [{ from: 0x0400, to: 0x0400 }]);
});

test('Stone 1: full decoding, no mirrors', () => {
  const m = new Stone1({ rom: STONEPMI, customRom: [block(0x0000, 0x00)] });
  assert.equal(m.read(0x0000), 0x00);
  assert.equal(m.read(0x8000), m.read(0x8001)); // unpopulated: FFh
  assert.equal(m.read(0x8000), 0xff);
});

test('profiles pass the custom ROM on to the board, and nothing without it', () => {
  const roms = { pmi80: PMI80 };
  const factory = BOARD_PROFILES.pmi80.firmware[0];
  assert.equal(factory.create(roms).customRom, null);
  assert.equal(factory.create(roms, { customRom: [block(0, 0x55)] }).read(0), 0x55);
});
