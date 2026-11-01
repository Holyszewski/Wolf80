// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// The programs in extras/: the PMI-80 clocks keep exact seconds on their own monitor and roll
// over into minutes, hours and a new day.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { Pmi80, pmi80RunKeys } from '../src/board/pmi80.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const rom = name => fs.readFileSync(new URL(`roms/pmi80/${name}`, root));
const SECOND = 1111111; // 10 MHz / 9, rounded down
const at = ms => Math.round(ms * SECOND / 1000);
const DIGITS = { 0x3f: '0', 0x06: '1', 0x5b: '2', 0x4f: '3', 0x66: '4', 0x6d: '5', 0x7d: '6', 0x07: '7', 0x7f: '8', 0x6f: '9', 0x40: '-', 0: ' ' };

// Types the clock and the time into the board, starts it with EX 1C00 =, and returns the lengths
// of the seconds (from one pass of LOOP to the next) over `seconds`, the time and the display.
function runClock({ create, holdMs }, file, time, seconds) {
  const m = create();
  const r = assemble(fs.readFileSync(new URL(`extras/clock/${file}`, root), 'utf8'));
  assert.deepEqual(r.errors, []);
  m.reset();
  m.run(at(50));
  for (const { addr, bytes } of r.blocks) bytes.forEach((v, i) => m.write(addr + i, v));
  time.forEach((v, i) => m.write(0x1d00 + i, v));
  for (const key of pmi80RunKeys('1C00')) {
    m.pressKey(key);
    m.run(at(holdMs));
    m.releaseKey(key);
    m.run(at(holdMs));
  }
  const loop = r.symbols.LOOP;
  const passes = [];
  const end = m.cycles + seconds * SECOND + 20000;
  while (m.cycles < end) {
    if (m.cpu.pc === loop) passes.push(m.cycles);
    m.cpu.step();
  }
  m.display.takeFrame(m.cycles);
  m.run(200000);
  const shown = litMasks(m.display.takeFrame(m.cycles), 9).map(x => DIGITS[x] ?? '?').join('');
  return { lengths: passes.slice(1).map((t, i) => t - passes[i]), time: [0, 1, 2].map(i => m.read(0x1d00 + i)), shown };
}

// The monitors, with how long a key is held to be taken (as in src/board/profiles.js).
const factory = { create: () => new Pmi80({ rom: rom('pmi80_monitor.bin') }), holdMs: 40 };
const pmi80c = { create: () => new Pmi80({ rom: rom('pmi80c_monitor.bin'), rom2: rom('pmi80c_games.bin') }), holdMs: 100 };

for (const [file, board, other] of [
  ['clock-pmi80.asm', factory, pmi80c],
  ['clock-pmi80c.asm', pmi80c, factory],
]) {
  test(`${file}: exact seconds on its monitor, over midnight`, () => {
    const { lengths, time, shown } = runClock(board, file, [0x23, 0x59, 0x58], 4);
    assert.equal(lengths.length, 3);
    for (const n of lengths) assert.equal(n, SECOND);
    assert.deepEqual(time, [0x00, 0x00, 0x02]);
    assert.equal(shown, '00-00-02 ');
  });

  test(`${file}: carries into minutes and hours`, () => {
    const { time, shown } = runClock(board, file, [0x09, 0x59, 0x59], 1.5);
    assert.deepEqual(time, [0x10, 0x00, 0x00]);
    assert.equal(shown, '10-00-00 ');
  });

  test(`${file}: about a tenth off on the other monitor`, () => {
    const { lengths } = runClock(other, file, [0x12, 0x00, 0x00], 3);
    const off = Math.abs(lengths[0] / SECOND - 1);
    assert.ok(off > 0.08 && off < 0.11, `${(off * 100).toFixed(1)} %`);
  });
}
