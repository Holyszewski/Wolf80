// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// The programs in extras/: AION Buzzer 80 in an EPROM sounds as its RAM edition; the PMI-80 clocks keep exact seconds on their own monitor and roll
// over into minutes, hours and a new day; the calibrated ones lengthen their seconds by the
// correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { Pmi80, pmi80RunKeys } from '../src/board/pmi80.js';
import { litMasks } from '../src/machine/display.js';
import { parseIntelHex } from '../src/machine/memfile.js';
import { epromBlocks, epromImage } from '../tools/make-listings.mjs';

const root = new URL('../', import.meta.url);
const rom = name => fs.readFileSync(new URL(`roms/pmi80/${name}`, root));
const SECOND = 1111111; // 10 MHz / 9, rounded down
const at = ms => Math.round(ms * SECOND / 1000);
const DIGITS = { 0x3f: '0', 0x06: '1', 0x5b: '2', 0x4f: '3', 0x66: '4', 0x6d: '5', 0x7d: '6', 0x07: '7', 0x7f: '8', 0x6f: '9', 0x40: '-', 0: ' ' };

// Types the clock and the time into the board (with the calibrated clocks, the correction into the
// program as BCD, if given, and a fraction that is not BCD, which the clock clears), starts it
// with EX 1C00 =, and returns the lengths of the seconds (from one pass of LOOP to the
// next) over `seconds`, the fraction (as a number) at each pass, the time and the display.
function runClock({ create, holdMs }, file, time, seconds, correction) {
  const m = create();
  const r = assemble(fs.readFileSync(new URL(`extras/clock/${file}`, root), 'utf8'));
  assert.deepEqual(r.errors, []);
  m.reset();
  m.run(at(50));
  for (const { addr, bytes } of r.blocks) bytes.forEach((v, i) => m.write(addr + i, v));
  time.forEach((v, i) => m.write(0x1d00 + i, v));
  if (correction !== undefined) {
    m.write(r.symbols.CORR, parseInt(correction.slice(0, 2), 16));
    m.write(r.symbols.CORR + 1, parseInt(correction.slice(2), 16));
  }
  m.write(0x1d03, 0xf9);
  m.write(0x1d04, 0x9a);
  for (const key of pmi80RunKeys('1C00')) {
    m.pressKey(key);
    m.run(at(holdMs));
    m.releaseKey(key);
    m.run(at(holdMs));
  }
  const loop = r.symbols.LOOP;
  const bcd = v => (v >> 4) * 10 + (v & 15);
  const passes = [], fractions = [];
  const end = m.cycles + seconds * SECOND + 20000;
  while (m.cycles < end) {
    if (m.cpu.pc === loop) {
      passes.push(m.cycles);
      fractions.push(bcd(m.read(0x1d03)) * 100 + bcd(m.read(0x1d04)));
    }
    m.cpu.step();
  }
  m.display.takeFrame(m.cycles);
  m.run(200000);
  const shown = litMasks(m.display.takeFrame(m.cycles), 9).map(x => DIGITS[x] ?? '?').join('');
  return { lengths: passes.slice(1).map((t, i) => t - passes[i]), fractions, time: [0, 1, 2].map(i => m.read(0x1d00 + i)), shown };
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

// The calibrated clocks: a second is SHORT states, plus LEAP when the correction (in hundredths of
// a second a day, BCD, 5000 as typed in) added to the fraction passes 9999.
const SHORT = 1110468, LEAP = 1286;
function assertCorrected({ lengths, fractions }, correction) {
  lengths.forEach((n, i) => {
    const sum = fractions[i] + correction;
    assert.equal(fractions[i + 1], sum % 10000);
    assert.equal(n, SHORT + (sum >= 10000 ? LEAP : 0), `second ${i}`);
  });
}

for (const [file, board, other] of [
  ['clock-cal-pmi80.asm', factory, pmi80c],
  ['clock-cal-pmi80c.asm', pmi80c, factory],
]) {
  test(`${file}: as typed in, exact seconds on average on its monitor, over midnight`, () => {
    const run = runClock(board, file, [0x23, 0x59, 0x58], 4);
    const { lengths, time, shown } = run;
    assertCorrected(run, 5000);
    assert.equal(lengths[0] + lengths[1], 2 * SECOND);
    assert.deepEqual(time, [0x00, 0x00, 0x02]);
    assert.equal(shown, '00-00-02 ');
  });

  test(`${file}: carries into minutes and hours`, () => {
    const { time, shown } = runClock(board, file, [0x09, 0x59, 0x59], 1.5);
    assert.deepEqual(time, [0x10, 0x00, 0x00]);
    assert.equal(shown, '10-00-00 ');
  });

  test(`${file}: 70.81 slows it by 20.81 s a day`, () => {
    const run = runClock(board, file, [0x12, 0x00, 0x00], 6, '7081');
    assert.equal(run.lengths.length, 5);
    assertCorrected(run, 7081);
    // In the long run a second is SHORT + LEAP * 0.7081 states, 20.81 s a day more than SECOND.
    const perDay = (LEAP * 0.7081 + SHORT - SECOND) / SECOND * 86400;
    assert.ok(Math.abs(perDay - 20.81) < 0.01, perDay.toFixed(3));
  });

  test(`${file}: about a tenth off on the other monitor`, () => {
    const { lengths } = runClock(other, file, [0x12, 0x00, 0x00], 4);
    const off = Math.abs((lengths[0] + lengths[1]) / 2 / SECOND - 1);
    assert.ok(off > 0.08 && off < 0.11, `${(off * 100).toFixed(1)} %`);
  });
}

// AION Buzzer 80 in the second EPROM: the image is the one tried on a real board, and after
// EX 0400 = it gives the same sound as the RAM edition of the program list, under both monitors.
const AION_SHA256 = 'a171f618b26197aa33278587c0af64b76918daf2e9c003146eed0b9b6a54ae6b';
const aionImage = () => {
  const r = assemble(fs.readFileSync(new URL('extras/aion-buzzer-80-eprom/aion-buzzer-80-eprom-pmi80.asm', root), 'utf8'));
  assert.deepEqual(r.errors, []);
  return epromImage(epromBlocks(r));
};

test('aion-buzzer-80-eprom: one kibibyte from 0400, the image tried on the real board, signed at its end', async () => {
  const image = aionImage();
  assert.equal(image.length, 1024);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', image)).toString('hex');
  assert.equal(hash, AION_SHA256);
  assert.equal(Buffer.from(image.subarray(1012)).toString('latin1'), 'Wolf2026v101');
});

for (const [name, monitor, holdMs] of [['factory monitor', 'pmi80_monitor.bin', 40], ['PMI-80 C', 'pmi80c_monitor.bin', 100]]) {
  test(`aion-buzzer-80-eprom, ${name}: the sound of the RAM edition`, () => {
    const ram = parseIntelHex(fs.readFileSync(new URL('programs/aion-buzzer-80/AION-Buzzer-80-RAM-display.hex', root), 'utf8'));
    const EDGES = 12000; // about a sixth of the song
    const play = (m, start, load = []) => {
      m.reset();
      m.run(at(50));
      for (const { addr, bytes } of load) bytes.forEach((v, i) => m.write(addr + i, v));
      m.takeAudio();
      for (const key of pmi80RunKeys(start)) {
        m.pressKey(key);
        m.run(at(holdMs));
        m.releaseKey(key);
        m.run(at(holdMs));
      }
      m.run(at(15000));
      const edges = m.takeAudio().edges;
      return Array.from(edges.slice(1, EDGES + 1), (t, i) => t - edges[i]);
    };
    const inRom = play(new Pmi80({ rom: rom(monitor), rom2: aionImage() }), '0400');
    const inRam = play(new Pmi80({ rom: rom(monitor) }), '1C00', ram);
    assert.equal(inRom.length, EDGES);
    assert.deepEqual(inRom, inRam);
  });
}
