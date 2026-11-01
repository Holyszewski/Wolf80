// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// The Stone 1 with its own monitor and with Nostalcomp's STONE-PMI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Stone1, STONE1_CLOCK_HZ, stone1RunKeys } from '../src/board/stone1.js';
import { Z80 } from '../src/core/z80.js';
import { parseIntelHex } from '../src/machine/memfile.js';
import { litMasks } from '../src/machine/display.js';
import { startProgram } from '../src/machine/programs.js';

const read = p => fs.readFileSync(new URL(`../roms/stone1/${p}`, import.meta.url));
// The own monitor is withheld (docs/stone1.md): its tests run only when its ROM is back in roms/stone1/.
const OWN = fs.existsSync(new URL('../roms/stone1/stone1_monitor.bin', import.meta.url));
const MONITOR = OWN ? read('stone1_monitor.bin') : null;
const own = { skip: !OWN && 'the own monitor is withheld' };
const PMI = read('stone_pmi.bin');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const ms = t => Math.round(t * STONE1_CLOCK_HZ / 1000);

function shown(board) {
  board.display.takeFrame(board.cycles);
  board.run(ms(40));
  return litMasks(board.display.takeFrame(board.cycles), 9);
}
// segments of character codes from a monitor's table (active low)
const lit = (rom, table, codes) => codes.map(c => (~rom[table + c]) & 0x7f);

test('the image of the own monitor from its published HEX', own, () => {
  assert.equal(sha(read('stone1.hex')), '37d72a3b845f49c56b5bf02710ab629a76f3296ee45d247ebfaeddd41e7839bc');
  const image = new Uint8Array(0x800).fill(0xff);
  for (const b of parseIntelHex(read('stone1.hex').toString('utf8'))) image.set(b.bytes, b.addr);
  assert.deepEqual([...MONITOR], [...image]);
  assert.equal(sha(MONITOR), 'c040cfc4fb211b21a459e5740e3abb119621aac8535c03a6993ce5004d3e3d7b');
});

test('the STONE-PMI image', () => {
  assert.equal(sha(PMI), '528c9d1fc581859daae033d953bac0ddad007cddebccc8789c2a1de5625b26ca');
  assert.deepEqual([...PMI.subarray(0x3b, 0x3d)], [0xed, 0x56]); // IM 1: not for an 8080
});

test('a Z80 and full address decoding: no mirrors', () => {
  const s = new Stone1({ rom: PMI });
  assert.ok(s.cpu instanceof Z80);
  assert.equal(s.read(0x0440), PMI[0x440]);
  assert.equal(s.populated(0x8000), false);
  assert.equal(s.populated(0x2440), false);
  s.write(0x1800, 0x5a);
  assert.equal(s.read(0x1800), 0x5a);
  assert.equal(s.read(0x9800), 0xff);
});

test('the own monitor greets with Stone 1, a key gives the prompt ?', own, () => {
  const s = new Stone1({ rom: MONITOR });
  s.run(ms(50));
  assert.deepEqual(shown(s), lit(MONITOR, 0x16c, [0x27, 0x05, 0x1c, 0x18, 0x17, 0x0e, 0x27, 0x01, 0x27]));
  s.pressKey('=');
  s.run(ms(100));
  s.releaseKey('=');
  s.run(ms(100));
  assert.deepEqual(shown(s), lit(MONITOR, 0x16c, [0x25, 0x27, 0x27, 0x27, 0x27, 0x27, 0x27, 0x27, 0x27]));
});

test('the digit index is inverted on PC0-PC3, as on the PMI-80', () => {
  const s = new Stone1({ rom: PMI });
  s.output(0xfb, 0x8a);
  s.output(0xfa, 0xfd); // ~2
  assert.equal(s.selectedColumn(), 2);
});

for (const [name, rom, holdMs] of [['own monitor', MONITOR, 100], ['STONE-PMI', PMI, 40]]) {
  test(`${name}: EX, address and = start a program`, rom ? {} : own, () => {
    const s = new Stone1({ rom });
    startProgram(s, { id: 't', format: 'bin', load: '1C00', start: '1C00' }, Uint8Array.of(0x3e, 0x5a, 0x32, 0x00, 0x1d, 0x76), {
      bootStates: ms(50), holdStates: ms(holdMs), runKeys: stone1RunKeys,
    });
    s.run(ms(10));
    assert.equal(s.read(0x1d00), 0x5a);
  });
}

test('STONE-PMI greets with StonE-PMI', () => {
  const s = new Stone1({ rom: PMI });
  s.run(ms(50));
  assert.deepEqual(shown(s), lit(PMI, 0x1be, [0x05, 0x10, 0x11, 0x1b, 0x0e, 0x1f, 0x13, 0x16, 0x01]));
});

test('the I key: IM 1 of STONE-PMI through 0038h to 1FE6h', () => {
  const s = new Stone1({ rom: PMI });
  s.run(ms(50));
  assert.equal(s.cpu.im, 1);
  [0xfb, 0x18, 0xfe].forEach((v, i) => s.write(0x1c00 + i, v)); // EI / JR $
  [0x3e, 0x77, 0x76].forEach((v, i) => s.write(0x1fe6 + i, v)); // LD A,77h / HALT
  s.cpu.pc = 0x1c00;
  s.cpu.sp = 0x1f80;
  s.run(100);
  s.pressKey('I');
  s.run(200);
  assert.deepEqual([s.cpu.halted, s.cpu.a], [true, 0x77]);
});

test('the I key: IM 0 of the own monitor, RST 38h through 0038h to the vector 1FEFh', own, () => {
  const s = new Stone1({ rom: MONITOR });
  s.run(ms(50));
  [0xfb, 0x18, 0xfe].forEach((v, i) => s.write(0x1c00 + i, v));
  [0xc3, 0x00, 0x1d].forEach((v, i) => s.write(0x1fef + i, v)); // JP 1D00h
  [0x3e, 0x77, 0x76].forEach((v, i) => s.write(0x1d00 + i, v));
  s.cpu.pc = 0x1c00;
  s.cpu.sp = 0x1f80;
  s.run(100);
  s.pressKey('I');
  s.run(200);
  assert.deepEqual([s.cpu.halted, s.cpu.a], [true, 0x77]);
});
