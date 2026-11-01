// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// New Acorn Duck Shoot implementations, exercised through each actual monitor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const romPaths = {
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
};
const roms = Object.fromEntries(Object.entries(romPaths).map(([k, f]) =>
  [k, fs.readFileSync(new URL('roms/' + f, root))]));
const title = [0x5e, 0x3e, 0x39, 0x76, 0, 0x6d, 0x74, 0x3f, 0x3f, 0x78];

function setup(board, fw, launchHoldMs = null) {
  const profile = BOARD_PROFILES[board];
  const suffix = board === 'savia84' ? 'savia' : board;
  const data = fs.readFileSync(new URL('programs/duck-shoot/duck-shoot-' + suffix + '.asm', root));
  const asm = assemble(data.toString('utf8'));
  assert.deepEqual(asm.errors, []);
  const s = asm.symbols;
  const first = board === 'pmi80' ? 0x1c00 : 0x1800;
  assert.equal(s.START, first);
  assert.ok(s.DATA_END <= 0x1fa0, 'code/data must leave room for the private stack');
  for (const b of asm.blocks) {
    assert.ok(b.addr >= first && b.addr + b.bytes.length <= 0x1fa0);
  }
  assert.match(data.toString('utf8'), /^; .*version 0.1.3:/m);
  assert.equal(asm.blocks.length, 1, 'the signed image must precede all DS buffers');
  const image = asm.blocks[0];
  const imageEnd = image.addr + image.bytes.length;
  assert.equal(imageEnd, s.IMAGE_END);
  assert.equal(imageEnd, s.SCREEN, 'no emitted bytes may follow the signature');
  assert.equal(s.SIGNATURE, imageEnd - 12);
  assert.equal(Buffer.from(image.bytes.slice(-12)).toString('ascii'), 'Wolf2026v013',
    'the image must end with the complete signature matching version 0.1.3');
  const m = fw.create(roms);
  const at = t => Math.round(t * profile.clockHz / 1000);
  const run = t => m.run(at(t));
  const writes = [];
  let running = false;
  const startup = [];
  const refreshes = [];
  const startupWrite = m.cpu.bus.write;
  m.cpu.bus.write = (a, v) => {
    running ||= m.cpu.pc >= first && m.cpu.pc < s.DATA_END;
    if (running) {
      assert.ok((a >= first && a < s.DATA_END) || (a >= 0x1fa0 && a < 0x1fc0),
        'unexpected CPU write at ' + a.toString(16));
      writes.push(a);
    }
    if (a === s.OFFSET || a === s.SCREEN + 2) startup.push([a, v, m.cycles]);
    if (a === s.AGEOP + 1 && v === 4) refreshes.push(m.cycles);
    startupWrite(a, v);
  };
  const runKeys = launchHoldMs === null ? fw.runKeys : start => fw.runKeys(start).slice(0, -1);
  startProgram(m, { id: 'duck-shoot', board, format: 'asm', start: first.toString(16) }, data,
    { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys });
  if (launchHoldMs !== null) {
    m.pressKey('=');
    run(launchHoldMs);
    // Some factory monitors themselves wait for release before entering user code.
    if (m.cpu.pc >= first && m.cpu.pc < s.DATA_END) {
      assert.deepEqual(Array.from({ length: 9 }, (_, i) => m.read(s.SCREEN + i)), Array(9).fill(0),
        'the title must wait for release of the launch key');
    }
    m.releaseKey('=');
    run(40);
  }
  const read = name => m.read(s[name]);
  const word = name => read(name) | (m.read(s[name] + 1) << 8);
  const screen = () => Array.from({ length: 9 }, (_, i) => m.read(s.SCREEN + i));
  const masks = (duration = 12) => {
    m.display.takeFrame(m.cycles);
    run(duration);
    return litMasks(m.display.takeFrame(m.cycles), 9);
  };
  const until = (condition, limit = 5000) => {
    const end = m.cycles + at(limit);
    while (!condition() && m.cycles < end) run(0.2);
    assert.ok(condition(), 'condition did not become true within ' + limit + ' ms');
  };
  // Guard all writes from the first instruction in user RAM onward.
  // Test fixtures and panel loading use machine.write, not this CPU bus.
  const pa = [];
  const pixels = [];
  const output = m.cpu.bus.output;
  m.cpu.bus.output = (p, v) => {
    if ((p & 0xff) === 0xf8) {
      if (board !== 'pmi80') assert.equal(v & 0x80, 0, 'PA7 must stay low');
      pa.push([m.cycles, v]);
    }
    output(p, v);
    if ((p & 0xff) === 0xfa && m.selectedColumn() < 9) {
      pixels.push([m.cycles, m.selectedColumn(), (~m.ppi.outputA()) & 0x7f]);
    }
  };
  return { m, s, at, run, read, word, screen, masks, until, writes, pa, pixels, refreshes, profile, startup,
    ms: cycles => cycles * 1000 / profile.clockHz,
    physical: p => board === 'savia84' && p === 0 ? 0 : p + 1 };
}

function checkTone(c, chunk, hz, count) {
  const edges = chunk.edges;
  assert.equal(edges.length, count, 'number of K3 edges');
  const halfMs = 500 / hz;
  for (let i = 1; i < edges.length; i++) {
    assert.ok(Math.abs(c.ms(edges[i] - edges[i - 1]) - halfMs) < 0.03,
      'tone half-period: ' + c.ms(edges[i] - edges[i - 1]));
  }
  const duration = c.ms(edges.at(-1) - edges[0]) + halfMs;
  assert.ok(Math.abs(duration - 30) < 1, 'tone duration: ' + duration);
  const pa = c.pa.filter(([t]) => t >= edges[0] && t <= edges.at(-1));
  assert.ok(pa.length >= count - 1);
  assert.ok(pa.every(([, v]) => v & 0x40), 'g must be off during a tone');
  assert.ok(pa.some(([, v]) => (v & 0x3f) !== 0x3f), 'other segments must keep lighting');
}

for (const board of ['pmi80', 'savia84', 'stone1']) {
  for (const fw of BOARD_PROFILES[board].firmware) {
    test(board + ' / ' + fw.id + ': title, flight, hit, rounds, misses and restart', context => {
      const c = setup(board, fw);
      const { m, s, run, read, word, until, ms } = c;
      const expectedTitle = [0, 0, ...title.slice(0, 7)];
      assert.deepEqual(c.screen(), expectedTitle);
      assert.deepEqual(c.masks(), expectedTitle);
      until(() => read('OFFSET') === 4);
      until(() => c.screen()[7] === 0x61);
      const offsets = c.startup.filter(([a, v]) => a === s.OFFSET && v > 0);
      const firstTitle = c.startup.find(([a, v]) => a === s.SCREEN + 2 && v === title[0])[2];
      const times = [firstTitle, ...offsets.map(x => x[2])];
      const titleDurations = [];
      for (const [i, target] of [1500, 250, 250, 1000].entries()) {
        const duration = ms(times[i + 1] - times[i]);
        titleDurations.push(duration.toFixed(2));
        assert.ok(Math.abs(duration - target) <= 12, 'title window duration: ' + duration);
      }
      const dark = c.startup.find(([a, v, t]) => a === s.SCREEN + 2 && v === 0 && t >= times[4]);
      assert.ok(Math.abs(ms(m.cycles - dark[2]) - 400) < 10, '400 ms dark interval');
      assert.equal(read('POS'), 6);
      assert.equal(read('SCORE'), 0);
      const moves = [];
      let pos = read('POS');
      let t = m.cycles;
      until(() => {
        if (read('POS') !== pos) {
          moves.push(ms(m.cycles - t)); t = m.cycles; pos = read('POS');
        }
        return moves.length === 9;
      }, 4000);
      run(1);
      assert.deepEqual(c.screen(), Array.from({ length: 9 }, (_, i) =>
        i === c.physical(read('POS')) ? 0x61 : 0));
      assert.deepEqual(c.masks(), c.screen());
      for (const duration of moves.slice(1)) assert.ok(Math.abs(duration - 320) <= 2, 'step: ' + duration);
      // An unrelated control key must neither shoot nor start a new series.
      m.pressKey('EX'); run(12); m.releaseKey('EX'); run(12);
      assert.equal(read('STATE'), 0);
      assert.equal(read('SCORE'), 0);
      // A wrong shot, held across movement, must not turn into another shot.
      const beforeMiss = read('POS');
      until(() => read('POS') !== beforeMiss);
      const missStart = m.cycles;
      const miss = (read('POS') + 7) & 7;
      m.takeAudio();
      m.pressKey(String(miss)); run(40);
      assert.equal(read('STATE'), 0);
      assert.equal(read('SCORE'), 0);
      until(() => read('POS') === miss, 450);
      assert.ok(Math.abs(ms(m.cycles - missStart) - 320) < 10,
        'a miss must debit its sound time from the flight clock: ' + ms(m.cycles - missStart));
      run(12);
      assert.equal(read('STATE'), 0, 'a held key must not shoot on the next position');
      const missAudio = m.takeAudio();
      m.releaseKey(String(miss)); run(12);
      if (board === 'pmi80') {
        checkTone(c, missAudio, 500, 30);
      }
      // Wait for a fresh movement to provide an entire shot window.
      const old = read('POS');
      until(() => read('POS') !== old);
      const shot = read('POS');
      m.takeAudio();
      m.pressKey(String(shot));
      until(() => read('STATE') === 1, 50);
      const hitTime = m.cycles;
      run(120);
      assert.deepEqual(c.screen(), Array.from({ length: 9 }, (_, i) =>
        i === c.physical(shot) ? 0x1c : 0));
      assert.deepEqual(c.masks(), c.screen());
      const hitAudio = m.takeAudio();
      if (board === 'pmi80') {
        assert.equal(hitAudio.edges.length, 120);
        checkTone(c, { edges: hitAudio.edges.slice(0, 60) }, 1000, 60);
        checkTone(c, { edges: hitAudio.edges.slice(60) }, 1000, 60);
        const gap = ms(hitAudio.edges[60] - hitAudio.edges[59]) - 0.5;
        assert.ok(Math.abs(gap - 40) < 2, 'HH gap: ' + gap);
      }
      m.releaseKey(String(shot));
      until(() => read('STATE') === 2, 1200);
      const deadMs = ms(m.cycles - hitTime);
      assert.ok(Math.abs(deadMs - 1000) < 45, 'dead duck duration: ' + deadMs);
      // Let the score renderer finish.
      run(2);
      assert.equal(read('SCORE'), 1);
      assert.deepEqual(c.screen(), [0, 0, 0, 0, 0, 0, 0, 0x3f, 0x06]);
      assert.deepEqual(c.masks(), c.screen());
      const roundTime = m.cycles;
      until(() => read('STATE') === 0, 1200);
      const roundMs = ms(m.cycles - roundTime);
      assert.ok(Math.abs(roundMs - 988) < 25, 'round duration after display sampling: ' + roundMs);
      assert.equal(word('SPEED'), 288);
      const p = read('POS'), next = m.cycles;
      until(() => read('POS') !== p, 450);
      assert.ok(Math.abs(ms(m.cycles - next) - 288) < 10);
      // Holding = may reset only once, and must restore the original speed/round.
      m.pressKey('=');
      until(() => read('SCORE') === 0 && word('SPEED') === 320, 60);
      assert.equal(word('SPEED'), 320);
      run(400);
      assert.notEqual(read('POS'), 6);
      m.releaseKey('='); run(12);
      // A second key, even the restart key, cannot override a key still held.
      m.write(s.SCORE, 7);
      m.pressKey('EX'); run(12);
      m.pressKey('='); run(12);
      m.releaseKey('EX'); run(12);
      assert.equal(read('SCORE'), 7);
      m.releaseKey('='); run(12);
      m.pressKey('='); run(12); m.releaseKey('='); run(12);
      assert.equal(read('SCORE'), 0);
      // Deterministic boundary fixtures exercise BCD carry and the speed floor.
      m.write(s.SCORE, 0x09);
      m.write(s.STATE, 1);
      m.write(s.TIMER, 4); m.write(s.TIMER + 1, 0);
      until(() => read('STATE') === 2, 20); run(1);
      assert.equal(read('SCORE'), 0x10);
      assert.deepEqual(c.screen().slice(7), [0x06, 0x3f]);
      m.write(s.SPEED, 41); m.write(s.SPEED + 1, 0);
      m.write(s.TIMER, 4); m.write(s.TIMER + 1, 0);
      until(() => read('STATE') === 0, 20); run(1);
      assert.equal(word('SPEED'), 40);
      const floorMoves = [];
      let previousPos = read('POS'), previousTime = m.cycles;
      until(() => {
        if (read('POS') !== previousPos) {
          floorMoves.push(ms(m.cycles - previousTime));
          previousPos = read('POS'); previousTime = m.cycles;
        }
        return floorMoves.length === 9;
      }, 450);
      for (const duration of floorMoves.slice(1)) assert.ok(Math.abs(duration - 40) < 2);
      m.write(s.SCORE, 0x99); m.write(s.STATE, 1);
      m.write(s.TIMER, 4); m.write(s.TIMER + 1, 0);
      until(() => read('STATE') === 2, 20); run(1);
      assert.equal(read('SCORE'), 0);
      assert.deepEqual(c.screen().slice(7), [0x3f, 0x3f]);
      assert.equal(m.cpu.halted, false);
      assert.ok(c.writes.length > 100);
      context.diagnostic('RAM ' + s.START.toString(16) + '-' + (s.DATA_END - 1).toString(16) +
        '; stack minimum ' + Math.min(...c.writes.filter(a => a >= 0x1fa0)).toString(16) +
        '; flight ' + moves.slice(1).map(x => x.toFixed(2)).join('/') + ' ms' +
        '; title ' + titleDurations.join('/') + ' ms' +
        '; dead ' + deadMs.toFixed(2) + ' ms; round ' + (roundMs + 12).toFixed(2) + ' ms');
    });
    test(board + ' / ' + fw.id + ': held launch key is released before the title', () => {
      const c = setup(board, fw, 350);
      assert.deepEqual(c.screen(), [0, 0, ...title.slice(0, 7)]);
      assert.equal(c.read('LOCK'), 0);
      assert.equal(c.m.cpu.halted, false);
    });
    test(board + ' / ' + fw.id + ': 100 ms shots preserve flight and base pixels', context => {
      const c = setup(board, fw);
      const { m, s, run, read, until, ms } = c;
      until(() => c.screen()[7] === 0x61);
      const durations = [];
      for (let key = 0; key < 8; key++) {
        const old = read('POS');
        until(() => read('POS') !== old && read('POS') !== key);
        const col = c.physical(key), from = c.pixels.length;
        m.pressKey(String(key));
        run(40);
        const expected = c.screen();
        expected[col] |= 0x08;
        assert.deepEqual(c.masks(8), expected, 'shot key ' + key + ' must add d to its digit');
        assert.equal(read('STATE'), 0);
        assert.equal(read('SCORE'), 0);
        run(90); // Keep the key held beyond the indicator lifetime.
        const samples = c.pixels.slice(from).filter(([, digit]) => digit === col);
        const first = samples.find(([,, mask]) => mask & 8);
        assert.ok(first, 'missing shot for key ' + key);
        const off = samples.find(([time,, mask]) => time > first[0] && !(mask & 8));
        assert.ok(off, 'a held key must not keep the indicator lit');
        const duration = ms(off[0] - first[0]);
        assert.ok(Math.abs(duration - 100) < 9, 'shot duration ' + duration);
        durations.push(duration.toFixed(2));
        assert.equal(m.read(s.SHOTS + col), 0);
        assert.equal(read('STATE'), 0);
        m.releaseKey(String(key)); run(12);
      }
      // Fast shots remain independent and add to existing segments (including g).
      m.write(s.STATE, 2);
      m.write(s.TIMER, 0xe8); m.write(s.TIMER + 1, 3);
      m.write(s.SCREEN + c.physical(0), 0x61);
      m.write(s.SCREEN + c.physical(1), 0x06);
      m.pressKey('0'); run(8); m.releaseKey('0'); run(8);
      m.pressKey('1'); run(8); m.releaseKey('1'); run(8);
      const both = c.masks(8);
      assert.equal(both[c.physical(0)], 0x69);
      assert.equal(both[c.physical(1)], 0x0e);
      run(100);
      const restored = c.masks(8);
      assert.equal(restored[c.physical(0)], 0x61);
      assert.equal(restored[c.physical(1)], 0x06);
      // Empty and active overlay paths must consume the same number of states.
      const interval = active => {
        for (let i = 0; i < 9; i++) m.write(s.SHOTS + i, active ? 100 : 0);
        const from = c.refreshes.length;
        run(50);
        const times = c.refreshes.slice(from);
        const gaps = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
        return gaps[Math.floor(gaps.length / 2)];
      };
      assert.equal(interval(true), interval(false), 'active overlays must not slow the game clock');
      assert.equal(m.cpu.halted, false);
      context.diagnostic('shot d durations for 0..7: ' + durations.join('/') + ' ms');
    });
    if (board === 'pmi80') test(board + ' / ' + fw.id + ': restart survives the HH pause', () => {
      const c = setup(board, fw);
      c.until(() => c.screen()[7] === 0x61);
      c.m.pressKey('6');
      c.until(() => c.read('STATE') === 1, 30);
      c.run(35);
      c.m.releaseKey('6');
      c.run(10);
      c.m.pressKey('=');
      c.run(100);
      assert.equal(c.read('STATE'), 0);
      assert.equal(c.read('SCORE'), 0);
      assert.equal(c.word('SPEED'), 320);
      c.m.releaseKey('=');
      c.run(12);
      // A numeric key consumed by WAIT during HH must still show its shot.
      const pos = c.read('POS');
      c.m.pressKey(String(pos));
      c.until(() => c.read('STATE') === 1, 30);
      c.run(35);
      c.m.releaseKey(String(pos));
      c.run(10);
      const miss = (pos + 4) & 7;
      c.m.pressKey(String(miss));
      c.run(12);
      c.m.releaseKey(String(miss));
      c.run(12);
      assert.ok(c.masks(8)[c.physical(miss)] & 0x08, 'a shot during HH must be visible');
      assert.equal(c.read('STATE'), 1);
      assert.equal(c.m.cpu.halted, false);
    });
  }
}
