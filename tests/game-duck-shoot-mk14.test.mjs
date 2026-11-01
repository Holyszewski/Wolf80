// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Exercise the new MK14 rules through each real monitor and keyboard matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const ROMS = Object.fromEntries(Object.entries({
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
}).map(([id, file]) => [id, fs.readFileSync(new URL(`roms/${file}`, root))]));
const title = [0x5e, 0x3e, 0x39, 0x76, 0, 0x6d, 0x74, 0x3f, 0x3f, 0x78];
const variants = [['pmi80', 'pmi80', 0x1c00], ['savia84', 'savia', 0x1800], ['stone1', 'stone1', 0x1800]];
const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
const rotate = n => (n >>> 1) | ((n & 1) << 7);

function until(g, condition, limit = 30) {
  const end = g.m.cycles + g.at(limit);
  while (!condition()) {
    assert.ok(g.m.cycles < end, `timeout at ${hex(g.m.cpu.pc)}`);
    assert.equal(g.m.cpu.halted, false);
    g.m.cpu.step();
  }
}
function cycle(g, key) {
  assert.equal(g.m.cpu.pc, g.s.MAIN);
  if (key) g.m.pressKey(key);
  g.m.cpu.step();
  until(g, () => g.m.cpu.pc === g.s.MAIN, 150);
}
function shown(g, ms = 12) {
  g.m.run(g.at(ms)); // discard a partial scan left by a preceding screen change
  g.m.display.takeFrame(g.m.cycles);
  g.m.run(g.at(ms));
  return litMasks(g.m.display.takeFrame(g.m.cycles), 9);
}
function screen(g) { return Array.from({ length: 9 }, (_, i) => g.m.read(g.s.SCREEN + i)); }
function expected(g, ducks) {
  const r = Array(9).fill(0);
  for (let i = 0; i < 8; i++) if (ducks & (1 << i)) r[g.board === 'savia84' ? (i ? i + 1 : 0) : i + 1] = 0x61;
  return r;
}
function launch(board, origin, fw, a, source) {
  const profile = BOARD_PROFILES[board], m = fw.create(ROMS), s = a.symbols;
  const g = { board, profile, m, s, at: ms => Math.round(ms * profile.clockHz / 1000),
    violations: [], moves: [], windows: [], minSP: 0x1fc0, starts: [], soundSlots: [] };
  let armed = false;
  const write = m.cpu.bus.write;
  m.cpu.bus.write = (addr, value) => {
    if (m.cpu.pc >= origin && m.cpu.pc < s.CODE_END) armed = true;
    if (armed) {
      if (!((addr >= s.DUCKS && addr < s.SIGNATURE) || (addr >= s.SCREEN && addr < s.VARIABLE_END) ||
        (addr >= s.FLASH && addr < s.DATA_END) ||
        (addr >= 0x1fa0 && addr < 0x1fc0)))
        g.violations.push(`write ${hex(addr)}`);
      if (addr >= 0x1fa0 && addr < 0x1fc0) g.minSP = Math.min(g.minSP, addr);
      if (addr === s.DUCKS && ((m.cpu.pc >= s.MOVE && m.cpu.pc < s.DRAW) ||
        (s.SMOVE && m.cpu.pc >= s.SMOVE && m.cpu.pc < s.MASKS))) g.moves.push({ t: m.cycles, value });
      if (addr === s.DUCKS && m.cpu.pc >= s.NEW && m.cpu.pc < s.MAIN) g.starts.push(m.cycles);
      if (addr === s.SCREEN + 8 && m.cpu.pc >= s.COPY && m.cpu.pc < s.TITLEWAIT)
        g.windows.push({ t: m.cycles, offset: m.read(s.OFFSET) });
      if (addr === s.SCREEN + 8 && m.cpu.pc >= s.CLS && m.cpu.pc < s.WAIT && m.read(s.OFFSET) === 4 && !g.starts.length)
        g.blankTime = m.cycles;
    }
    write(addr, value);
  };
  const read = m.cpu.bus.read;
  m.cpu.bus.read = addr => {
    if (armed && !((addr >= origin && addr < s.VARIABLE_END) || (addr >= s.FLASH && addr < s.DATA_END) ||
      (addr >= 0x1fa0 && addr < 0x1fc0)))
      g.violations.push(`read/execute ${hex(addr)}`);
    return read(addr);
  };
  const output = m.cpu.bus.output;
  m.cpu.bus.output = (port, value) => {
    if (armed && (port & 255) === 0xf8) {
      if (board !== 'pmi80' && (value & 128)) g.violations.push('PA7 high on a silent board');
      if (board === 'pmi80' && m.cpu.pc >= s.SLOOP && m.cpu.pc < s.SPHASE && m.cpu.d === 0x40) {
        if (!(value & 0x40)) g.violations.push('segment g lit during a tone');
        g.soundSlots.push({ t: m.cycles, column: m.cpu.e, value });
      }
    }
    output(port, value);
    if (armed && g.trace && (port & 255) === 0xfa) {
      const column = board === 'savia84' ? value & 15 : (~value) & 15;
      if (column < 9) g.trace.push({ t: m.cycles, column, mask: (~m.ppi.outputA()) & 0x7f });
    }
  };
  startProgram(m, { id: 'duck-shoot-mk14', board, format: 'asm', start: hex(origin) }, Buffer.from(source), {
    bootStates: g.at(profile.bootMs), holdStates: g.at(fw.holdMs), runKeys: fw.runKeys,
  });
  return g;
}
function check(g) {
  assert.deepEqual(g.violations, []);
  assert.equal(g.m.cpu.halted, false);
  assert.ok(g.minSP >= 0x1fa0);
}

for (const [board, suffix, origin] of variants) {
  const source = fs.readFileSync(new URL(`programs/duck-shoot-mk14/duck-shoot-mk14-${suffix}.asm`, root), 'utf8');
  const a = assemble(source), s = a.symbols;
  test(`${board}: assembly and RAM bounds`, () => {
    assert.deepEqual(a.errors, []);
    assert.equal(s.START, origin);
    assert.ok(s.DATA_END <= 0x1fa0);
    assert.equal(s.FLASH, 0x1f90);
    assert.ok(s.VARIABLE_END <= s.FLASH);
    assert.equal(s.DATA_END, s.FLASH + 9);
    assert.match(source, /version 0\.1\.3:/);
    if (board === 'pmi80') assert.ok((s.MASKS & 255) <= 247, 'bitmap lookup does not cross a page');
    for (const b of a.blocks) { assert.ok(b.addr >= origin); assert.ok(b.addr + b.bytes.length <= s.IMAGE_END); }
    assert.doesNotMatch(source, /\b(?:JPE|JPO|CPE|CPO|RPE|RPO|HLT)\b/);
    console.log(`${board}: ${a.blocks.reduce((n, b) => n + b.bytes.length, 0)} emitted bytes, RAM ${hex(origin)}..${hex(s.DATA_END - 1)}`);
  });
  test(`${board}: the complete versioned signature is the final emitted data before DS storage`, () => {
    assert.deepEqual(a.errors, []);
    const version = source.match(/version (\d+)\.(\d+)\.(\d+):/);
    assert.ok(version);
    const signature = Buffer.from(`Wolf2026v${version.slice(1).join('')}`, 'ascii');
    assert.equal(signature.toString('ascii'), 'Wolf2026v013');
    const blocks = [...a.blocks].sort((left, right) => left.addr - right.addr);
    const last = blocks.at(-1);
    assert.ok(last && last.bytes.length >= signature.length);
    assert.deepEqual(Buffer.from(last.bytes.slice(-signature.length)), signature);
    assert.equal(last.addr + last.bytes.length, s.IMAGE_END);
    assert.equal(s.SIGNATURE + signature.length, s.IMAGE_END);
    assert.equal(s.IMAGE_END, s.SCREEN, 'DS storage starts immediately after the signature');
    assert.equal(blocks.reduce((n, b) => n + b.bytes.length, 0), s.IMAGE_END - origin,
      'initialized state precedes the signature, with no DS hole in the image');
    assert.ok(s.SCREEN + 9 <= s.FLASH && s.FLASH + 9 <= 0x1fa0, 'the full signature fits RAM');
  });
  for (const fw of BOARD_PROFILES[board].firmware) {
    test(`${board}/${fw.id}: each fresh shot flashes d for 100 ms, including blocked and overlapping shots`, () => {
      const g = launch(board, origin, fw, a, source);
      until(g, () => g.m.cpu.pc === s.MAIN, 4000);
      const columnOf = key => board === 'savia84' ? (key ? key + 1 : 0) : key + 1;
      const prime = () => {
        g.m.write(s.SHOT, 1); // indicator must also work when no toggle is allowed
        g.m.write(s.TIMER, 360 & 255); g.m.write(s.TIMER + 1, 360 >> 8);
      };
      const duration = column => {
        until(g, () => g.trace.some(v => v.column === column && (v.mask & 8)), 15);
        const on = g.trace.find(v => v.column === column && (v.mask & 8));
        until(g, () => g.trace.some(v => v.column === column && v.t > on.t && !(v.mask & 8)), 120);
        const off = g.trace.find(v => v.column === column && v.t > on.t && !(v.mask & 8));
        const elapsed = (off.t - on.t) * 1000 / g.profile.clockHz;
        assert.ok(elapsed >= 90 && elapsed <= 110, `indicator lasted ${elapsed.toFixed(3)} ms`);
        return elapsed;
      };
      const durations = [];
      for (let key = 0; key < 8; key++) {
        prime(); g.trace = [];
        cycle(g, String(key));
        durations.push(duration(columnOf(key)));
        assert.equal(g.m.read(s.DUCKS), 0x80, 'blocked shot does not toggle a duck');
        assert.ok(g.trace.filter(v => v.mask & 8).every(v => v.column === columnOf(key)), 'only the targeted digit flashes');
        g.m.run(g.at(20));
        until(g, () => g.m.cpu.pc === s.MAIN);
        assert.equal(g.m.read(s.FLASH + columnOf(key)), 0, 'holding the key does not restart the indicator');
        g.m.releaseKey(String(key)); cycle(g);
      }
      prime(); g.trace = [];
      cycle(g, '0'); g.m.releaseKey('0'); cycle(g);
      cycle(g, '1');
      g.m.run(g.at(15));
      assert.ok(g.trace.some(v => v.column === columnOf(0) && (v.mask & 8)));
      assert.ok(g.trace.some(v => v.column === columnOf(1) && (v.mask & 8)));
      assert.ok(g.m.read(s.FLASH + columnOf(0)) > 0 && g.m.read(s.FLASH + columnOf(1)) > 0,
        'overlapping indicators have independent countdowns');
      g.m.releaseKey('1');
      until(g, () => g.m.cpu.pc === s.MAIN);
      g.m.run(g.at(120)); until(g, () => g.m.cpu.pc === s.MAIN);

      // A real miss flashes at the fixed target while its duck rotates during L.
      g.m.write(s.DUCKS, 0); g.m.write(s.SHOT, 0);
      g.m.write(s.TIMER, 38); g.m.write(s.TIMER + 1, 0);
      g.trace = []; const before = g.moves.length;
      cycle(g, '0');
      until(g, () => g.trace.some(v => v.column === columnOf(0) && (v.mask & 8)), 15);
      until(g, () => g.moves.length > before, 30);
      assert.ok(g.moves.length > before, 'ducks keep moving while the target flashes');
      assert.equal(g.m.read(s.DUCKS), 0x80);
      durations.push(duration(columnOf(0)));
      assert.ok(g.trace.some(v => v.column === columnOf(7) && (v.mask & 0x21) === 0x21),
        'the duck moves to the right edge while d stays at the left edge');
      g.m.releaseKey('0');
      console.log(`${board}/${fw.id}: indicator ms ${durations.map(v => v.toFixed(3)).join(', ')}`);
      check(g);
    });
    test(`${board}/${fw.id}: scrolling title, MK14 flight and keyboard rules, memory safety`, () => {
      const g = launch(board, origin, fw, a, source);
      assert.equal(g.windows.length, 1, 'held monitor start key must not skip the title');
      assert.deepEqual(shown(g).slice(2), title.slice(0, 7));
      for (let offset = 1; offset <= 3; offset++) {
        until(g, () => g.m.read(s.OFFSET) === offset, 1600);
        until(g, () => g.m.cpu.pc === s.WAITLOOP);
        assert.deepEqual(shown(g).slice(2), title.slice(offset, offset + 7));
        assert.deepEqual(screen(g).slice(0, 2), [0, 0]);
      }
      until(g, () => g.m.read(s.OFFSET) === 4, 1100);
      until(g, () => g.m.cpu.pc === s.WAITLOOP);
      assert.deepEqual(shown(g), Array(9).fill(0));
      until(g, () => g.m.cpu.pc === s.MAIN, 500);
      const titleTimes = [...g.windows.slice(1).map((v, i) => v.t - g.windows[i].t),
        g.blankTime - g.windows[3].t, g.starts[0] - g.blankTime].map(t => t * 1000 / g.profile.clockHz);
      console.log(`${board}/${fw.id}: title ms ${titleTimes.map(t => t.toFixed(3)).join(', ')}`);
      [1500, 250, 250, 1000, 400].forEach((target, i) => assert.ok(Math.abs(titleTimes[i] - target) < 20, `title ${i}: ${titleTimes[i]}`));
      assert.equal(g.m.read(s.DUCKS), 0x80, 'one duck starts on the right');
      assert.deepEqual(screen(g), expected(g, 0x80));
      while (g.moves.length < 100) cycle(g);
      const periods = g.moves.slice(1).map((v, i) => (v.t - g.moves[i].t) * 1000 / g.profile.clockHz);
      const average = periods.reduce((n, t) => n + t, 0) / periods.length;
      console.log(`${board}/${fw.id}: move ms min ${Math.min(...periods).toFixed(3)}, max ${Math.max(...periods).toFixed(3)}, mean ${average.toFixed(3)}`);
      assert.ok(periods.every(t => Math.abs(t - 87) < 10), '87 ms flight within one refresh frame');
      assert.ok(Math.abs(average - 87) < 1, '87 ms mean flight period');
      console.log(`${board}/${fw.id}: first move ms ${((g.moves[0].t - g.starts[0]) * 1000 / g.profile.clockHz).toFixed(3)}`);
      assert.ok(Math.abs((g.moves[0].t - g.starts[0]) * 1000 / g.profile.clockHz - 87) < 10,
        'first duck also moves after 87 ms');
      for (let i = 1; i < g.moves.length; i++) assert.equal(g.moves[i].value, rotate(g.moves[i - 1].value));

      // Set only the flight state, then use real panel input for all shots.
      const set = (ducks, timer = 360) => {
        for (let i = 0; i < 9; i++) g.m.write(s.FLASH + i, 0);
        g.m.write(s.DUCKS, ducks); g.m.write(s.SHOT, 0);
        g.m.write(s.TIMER, timer & 255); g.m.write(s.TIMER + 1, timer >> 8);
      };
      set(0x80);
      cycle(g, '7');
      assert.equal(g.m.read(s.DUCKS), 0, 'hit removes the duck without ending the game');
      assert.deepEqual(screen(g), expected(g, 0));
      cycle(g); // still held, cannot shoot again
      assert.equal(g.m.read(s.DUCKS), 0);
      g.m.releaseKey('7'); cycle(g);
      cycle(g, '0'); // fresh edge, but same movement window
      assert.equal(g.m.read(s.DUCKS), 0, 'second shot in one movement window is ignored');
      g.m.releaseKey('0'); cycle(g);
      const n = g.moves.length;
      while (g.moves.length === n) cycle(g);
      assert.equal(g.m.read(s.DUCKS), 0, 'empty sky continues running');
      cycle(g, '0');
      assert.equal(g.m.read(s.DUCKS), 1, 'miss adds a duck');
      assert.deepEqual(screen(g), expected(g, 1));
      g.m.releaseKey('0'); cycle(g);

      set(0x84, 4); // the next frame rotates both ducks at once
      cycle(g);
      assert.equal(g.m.read(s.DUCKS), 0x42);
      assert.deepEqual(screen(g), expected(g, 0x42));
      assert.deepEqual(shown(g), expected(g, 0x42));
      until(g, () => g.m.cpu.pc === s.MAIN);
      // Every hex key 0..7 maps to its display position, including Savia's gap.
      for (let key = 0; key < 8; key++) {
        set(0xff, 360);
        cycle(g, String(key));
        assert.equal(g.m.read(s.DUCKS), 0xff ^ (1 << key), `position ${key}`);
        assert.deepEqual(screen(g), expected(g, 0xff ^ (1 << key)));
        g.m.releaseKey(String(key)); cycle(g);
      }
      for (const key of ['8', '9', 'A', 'B', 'C', 'D', 'E', 'F', '=', 'EX', 'R', 'M', 'L', 'S', 'BR', ...(board === 'savia84' ? [] : ['I'])]) {
        set(0x55);
        cycle(g, key);
        assert.equal(g.m.read(s.DUCKS), 0x55, `ignored ${key}`);
        assert.equal(g.m.read(s.SHOT), 0);
        g.m.releaseKey(key); cycle(g);
      }
      // Changing held keys without a complete release cannot create a shot.
      set(0x80);
      cycle(g, '8');
      g.m.releaseKey('8'); cycle(g, '7');
      assert.equal(g.m.read(s.DUCKS), 0x80);
      g.m.releaseKey('7'); cycle(g);
      cycle(g, '7');
      assert.equal(g.m.read(s.DUCKS), 0);
      const heldMoves = g.moves.length;
      while (g.moves.length < heldMoves + 2) cycle(g);
      assert.equal(g.m.read(s.DUCKS), 0, 'holding a shot across movement boundaries must not fire again');
      g.m.releaseKey('7'); cycle(g);
      check(g);
      console.log(`${board}/${fw.id}: deepest stack ${hex(g.minSP)}`);
    });
    if (board === 'pmi80') test(`${board}/${fw.id}: HH and L on K3, live multiplex and flight during sound`, () => {
      const g = launch(board, origin, fw, a, source);
      until(g, () => g.m.cpu.pc === s.MAIN, 4000);
      g.m.write(s.TIMER, 360 & 255); g.m.write(s.TIMER + 1, 360 >> 8);
      g.trace = [];
      g.m.takeAudio();
      cycle(g, '7');
      const audio = g.m.takeAudio();
      const gaps = audio.edges.slice(1).map((t, i) => (t - audio.edges[i]) * 1000 / g.profile.clockHz);
      const short = gaps.filter(t => t < 2);
      console.log(`${board}/${fw.id}: HH edges ${audio.edges.length}, short gaps ${Math.min(...short).toFixed(4)}..${Math.max(...short).toFixed(4)} ms, longest ${Math.max(...gaps).toFixed(3)}`);
      assert.ok(audio.edges.length >= 116 && audio.edges.length <= 122);
      assert.ok(short.every(t => Math.abs(t - 0.5) < 0.01));
      assert.ok(gaps.some(t => Math.abs(t - 40.5) < 1));
      for (const begin of [0, 60]) {
        const span = (audio.edges[begin + 59] - audio.edges[begin]) * 1000 / g.profile.clockHz;
        assert.ok(Math.abs(span - 29.5) < 0.1, `high burst edge span ${span} ms (first transition after one half-period)`);
      }
      assert.deepEqual([...new Set(g.soundSlots.map(v => v.column))].sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const indicatorOn = g.trace.find(v => v.column === 8 && (v.mask & 8));
      assert.ok(indicatorOn, 'a hit leaves d visible at the removed duck during HH');
      until(g, () => g.trace.some(v => v.column === 8 && v.t > indicatorOn.t && !(v.mask & 8)), 20);
      const indicatorOff = g.trace.find(v => v.column === 8 && v.t > indicatorOn.t && !(v.mask & 8));
      const hitIndicatorMs = (indicatorOff.t - indicatorOn.t) * 1000 / g.profile.clockHz;
      assert.ok(hitIndicatorMs >= 90 && hitIndicatorMs <= 110, `hit indicator ${hitIndicatorMs} ms`);
      console.log(`${board}/${fw.id}: hit indicator ${hitIndicatorMs.toFixed(3)} ms`);
      until(g, () => g.m.cpu.pc === s.MAIN);
      g.m.releaseKey('7'); cycle(g);
      g.m.write(s.SHOT, 0);
      // An imminent move must happen inside the low tone, without waiting for it.
      g.m.write(s.TIMER, 38); g.m.write(s.TIMER + 1, 0);
      const before = g.moves.length;
      g.m.takeAudio();
      cycle(g, '0');
      const low = g.m.takeAudio();
      const lowGaps = low.edges.slice(1).map((t, i) => (t - low.edges[i]) * 1000 / g.profile.clockHz);
      console.log(`${board}/${fw.id}: L edges ${low.edges.length}, gaps ${Math.min(...lowGaps).toFixed(4)}..${Math.max(...lowGaps).toFixed(4)} ms`);
      assert.equal(g.moves.length, before + 1);
      assert.ok(g.moves.at(-1).t > low.edges[0] && g.moves.at(-1).t < low.edges.at(-1), 'flight advances during tone');
      assert.ok(Math.abs((g.moves.at(-1).t - low.edges[0]) * 1000 / g.profile.clockHz - 9) < 0.5,
        'movement deadline is serviced inside the tone, without a redraw stall');
      assert.equal(g.m.read(s.DUCKS), 0x80, 'new duck wraps while sounding');
      assert.ok(low.edges.length >= 28 && low.edges.length <= 32);
      assert.ok(lowGaps.every(t => Math.abs(t - 1) < 0.01));
      assert.ok(Math.abs((low.edges.at(-1) - low.edges[0]) * 1000 / g.profile.clockHz - 29) < 0.1);
      assert.ok(g.soundSlots.some(v => ((~v.value) & 0x21) === 0x21), 'duck segments a/f remain visible during tone');
      g.m.releaseKey('0');
      g.m.takeAudio(); g.m.run(g.at(60));
      assert.equal(g.m.takeAudio().edges.length, 0, 'PA7 returns low and remains silent');
      check(g);
    });
  }
}
