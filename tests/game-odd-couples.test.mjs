// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Independently specified vectors and real matrix input on every supported monitor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const romNames = {
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
};
const roms = Object.fromEntries(Object.entries(romNames).map(([k, v]) =>
  [k, fs.readFileSync(new URL(`roms/${v}`, root))]));
const vector = [0x3e, 0x37, 0x37, 0x0f, 0x39, 0x0f, 0x3e, 0x39];
const title = [0x3f, 0x5e, 0x5e, 0, 0x39, 0x5c, 0x1c, 0x73, 0x38, 0x79, 0x6d];
const digits = [0x3f, 6, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 7, 0x7f, 0x6f];

for (const [board, suffix] of [['pmi80', 'pmi80'], ['savia84', 'savia'], ['stone1', 'stone1']]) {
  const profile = BOARD_PROFILES[board];
  const source = fs.readFileSync(new URL(`programs/odd-couples/odd-couples-${suffix}.asm`, root));
  const asm = assemble(source.toString('utf8'));
  const s = asm.symbols;
  const positions = board === 'savia84' ? [0, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3, 4, 5, 6, 7];
  const entry = { id: `odd-couples-${suffix}`, board, format: 'asm', start: board === 'pmi80' ? '1C00' : '1800' };
  test(`${board}: assembles inside user RAM with the trailing version signature`, () => {
    assert.deepEqual(asm.errors, []);
    assert.equal(s.START, parseInt(entry.start, 16));
    assert.ok(s.CODE_END <= s.VARS, `code ends at ${s.CODE_END?.toString(16)}`);
    assert.ok(s.VARS_END <= 0x1fb9);
    for (const b of asm.blocks) {
      assert.ok(b.addr >= s.START && b.addr + b.bytes.length <= s.VARS);
    }
    const lastBlock = [...asm.blocks].sort((a, b) => a.addr - b.addr).at(-1);
    assert.equal(lastBlock.addr + lastBlock.bytes.length, s.CODE_END);
    assert.deepEqual(Buffer.from(lastBlock.bytes.slice(-12)), Buffer.from('Wolf2026v011', 'ascii'));
    const version = /^; Odd Couples .*version (\d+\.\d+\.\d+):/m.exec(source.toString('utf8'))?.[1];
    assert.equal(version, '0.1.1');
    assert.equal(Buffer.from(lastBlock.bytes.slice(-4)).toString('ascii'), `v${version.replaceAll('.', '')}`);
    console.log(`${board}: code ${s.CODE_END - s.START} bytes, variables ${s.VARS_END - s.VARS}`);
  });

  for (const fw of profile.firmware) test(`${board}/${fw.id}: title, RAND7, rules, score and memory`, () => {
    assert.deepEqual(asm.errors, []);
    const m = fw.create(roms);
    const at = ms => Math.round(ms * profile.clockHz / 1000);
    const run = ms => m.run(at(ms));
    const get = name => m.read(s[name]);
    const word = name => get(name) | (m.read(s[name] + 1) << 8);
    const putWord = (name, v) => { m.write(s[name], v & 255); m.write(s[name] + 1, v >> 8); };
    const bytes = (name, n) => Array.from({ length: n }, (_, i) => m.read(s[name] + i));
    const tap = key => { m.pressKey(key); run(board === 'pmi80' ? 40 : 25); m.releaseKey(key); run(board === 'pmi80' ? 40 : 25); };
    const shown = () => {
      m.display.takeFrame(m.cycles);
      run(25);
      return litMasks(m.display.takeFrame(m.cycles), 9);
    };
    const image = cards => {
      const result = Array(9).fill(0);
      positions.forEach((p, i) => { result[p] = cards[i]; });
      return result;
    };
    const until = (predicate, maxMs = 6000) => {
      const end = m.cycles + at(maxMs);
      while (!predicate() && m.cycles < end) m.cpu.step();
      assert.ok(predicate(), `timeout at PC=${m.cpu.pc.toString(16)}`);
    };

    // Observe CPU writes only once the monitor transfers control to START.
    const write = m.cpu.bus.write;
    let active = false, ownStack = false, minSp = 0x1fd9;
    const titleTimes = [];
    let titleDoneAt;
    let tone;
    const bursts = [];
    const checkTone = (burst, hz) => {
      const duration = (burst.end - burst.start) * 1000 / profile.clockHz;
      assert.ok(Math.abs(duration - 30) < 1, `tone duration ${duration} ms`);
      assert.equal(burst.edges.length, hz === 1000 ? 60 : 30);
      // SOUND_END cuts the final high half-period short when returning PA7 low.
      for (let i = 1; i < burst.edges.length - 1; i++) {
        const halfPeriod = (burst.edges[i] - burst.edges[i - 1]) / profile.clockHz;
        assert.ok(Math.abs(halfPeriod * 2 * hz - 1) < 0.01, `tone half-period ${halfPeriod}`);
      }
      const tail = (burst.edges.at(-1) - burst.edges.at(-2)) * 2 * hz / profile.clockHz;
      assert.ok(tail > 0.85 && tail <= 1.01, `final tone half-period ${tail}`);
      assert.equal(burst.columns.size, 9, 'multiplex must scan every digit during sound');
      console.log(`${board}/${fw.id}: ${hz} Hz beep, ${duration.toFixed(3)} ms, ${burst.edges.length} K3 edges`);
    };
    m.cpu.bus.write = (a, v) => {
      if (active) assert.ok((a >= s.VARS && a < s.VARS_END) || (a >= 0x1fb9 && a < 0x1fd9),
        `write outside owned RAM: ${a.toString(16)}`);
      write(a, v);
    };
    const output = m.cpu.bus.output;
    m.cpu.bus.output = (p, v) => {
      if (active && (p & 255) === 0xf8) {
        if (tone) assert.equal(v & 0x40, 0x40, 'segment g must be off throughout a tone');
        else assert.equal(v & 0x80, 0, 'PA7 must stay silent outside PMI-80 tones');
      }
      output(p, v);
      if (tone && m.display.digit >= 0) {
        tone.columns.add(m.display.digit);
        assert.equal(m.display.lit & 0x40, 0, 'no physical digit may light g during sound');
      }
    };
    const step = m.cpu.step.bind(m.cpu);
    m.cpu.step = () => {
      if (m.cpu.pc === s.START) active = true;
      if (active && m.cpu.pc === s.START + 4) ownStack = true;
      if (active && m.cpu.pc === s.TITLE_WAIT) titleTimes.push(m.cycles);
      if (active && m.cpu.pc === s.TITLE_DONE) titleDoneAt = m.cycles;
      if (board === 'pmi80' && m.cpu.pc === s.SOUND_INIT) {
        m.takeAudio();
        tone = { start: m.cycles, columns: new Set() };
      }
      if (board === 'pmi80' && m.cpu.pc === s.SOUND_RETURN) {
        bursts.push({ ...tone, end: m.cycles, edges: m.takeAudio().edges });
        tone = undefined;
        assert.equal(m.k3.level, 1, 'K3 must return to silence');
      }
      const result = step();
      if (active) {
        if (ownStack) minSp = Math.min(minSp, m.cpu.sp);
        assert.equal(m.cpu.halted, false);
        assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END, `left program at ${m.cpu.pc.toString(16)}`);
      }
      return result;
    };
    // Keep the monitor's final launch key physically down throughout the title.
    const releaseKey = m.releaseKey.bind(m);
    m.releaseKey = key => { if (!active) releaseKey(key); };
    startProgram(m, entry, source, { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
    m.releaseKey = releaseKey;
    m.pressKey('=');
    assert.deepEqual(shown(), [0, 0, ...title.slice(0, 7)]);
    for (let offset = 1; offset <= 4; offset++) {
      until(() => get('OFFSET') === offset && m.cpu.pc === s.TITLE_WAIT);
      assert.deepEqual(shown(), [0, 0, ...title.slice(offset, offset + 7)]);
    }
    until(() => m.cpu.pc === s.READY);
    assert.equal(titleTimes.length, 5);
    for (let i = 1; i < 5; i++) {
      const elapsed = (titleTimes[i] - titleTimes[i - 1]) * 1000 / profile.clockHz;
      const expected = i === 1 ? 1500 : 250;
      assert.ok(Math.abs(elapsed - expected) < expected * 0.02, `title step ${i}: ${elapsed} ms`);
    }
    const lastMs = (titleDoneAt - titleTimes[4]) * 1000 / profile.clockHz;
    const blankMs = (m.cycles - titleDoneAt) * 1000 / profile.clockHz;
    assert.ok(Math.abs(lastMs - 1000) < 20);
    assert.ok(Math.abs(blankMs - 400) < 8);
    console.log(`${board}/${fw.id}: title first ${((titleTimes[1] - titleTimes[0]) * 1000 / profile.clockHz).toFixed(3)}, step ${((titleTimes[2] - titleTimes[1]) * 1000 / profile.clockHz).toFixed(3)}, last ${lastMs.toFixed(3)}, blank ${blankMs.toFixed(3)} ms`);
    assert.deepEqual(shown(), Array(9).fill(0));
    assert.equal(get('ATTEMPTS'), 0, 'held launch key must not start a game');
    m.releaseKey('='); run(25);

    // Seed at the actual keyboard-triggered NEW_GAME boundary, before any shuffle frame.
    m.pressKey('=');
    until(() => m.cpu.pc === s.NEW_GAME);
    putWord('RNG', 0x365a);
    let iterations = 0;
    while (m.cpu.pc !== s.CLEAR_SERIES) {
      if (m.cpu.pc === s.FRAME_RNG) iterations++;
      m.cpu.step();
      assert.ok(iterations <= 100);
    }
    assert.deepEqual(bytes('BOARD', 8), vector);
    assert.equal(word('RNG'), 0x946e);
    assert.equal(iterations, 37);
    m.releaseKey('='); run(25);
    assert.equal(get('ATTEMPTS'), 1);
    if (board === 'pmi80') {
      // A g marker on the unused ninth digit proves suppression and restoration.
      m.write(s.DISPLAY + 8, 0x40);
      assert.equal(shown()[8], 0x40);
    }
    tap('2'); tap('3');
    if (board === 'pmi80') {
      assert.equal(bursts.length, 1, 'one H for a regular match');
      checkTone(bursts[0], 1000);
      assert.equal(shown()[8], 0x40, 'segment g must resume after the tone');
      m.write(s.DISPLAY + 8, 0);
    }
    assert.equal(get('PAIRS'), 3);
    assert.equal(get('ATTEMPTS'), 2);
    assert.deepEqual(shown(), image([0, 0x37, 0x37, 0, 0, 0, 0, 0]));
    tap('1');
    m.pressKey('4');
    until(() => m.cpu.pc === (board === 'pmi80' ? s.BAD_PAIR : s.CLEAR_SERIES), 100);
    const failedAt = m.cycles;
    if (board === 'pmi80') {
      until(() => m.cpu.pc === s.BEEP_LOW, 20);
      assert.deepEqual(bytes('DISPLAY', 9), Array(9).fill(0), 'cards dark before mismatch beep');
    }
    const darkAt = m.cycles;
    assert.ok((darkAt - failedAt) / profile.clockHz < 0.002, 'no mismatch hold');
    until(() => m.cpu.pc === s.CLEAR_SERIES, 100);
    until(() => m.cpu.pc === s.NEXT_PAIR, 20);
    if (board === 'pmi80') {
      assert.equal(bursts.length, 2, 'one L for a mismatch');
      checkTone(bursts[1], 500);
    }
    assert.deepEqual(bytes('DISPLAY', 9), Array(9).fill(0));
    m.releaseKey('4'); run(25);
    assert.equal(get('ATTEMPTS'), 3);
    assert.equal(get('PAIRS'), 4);
    assert.deepEqual(bytes('BOARD', 8), vector);
    assert.deepEqual(shown(), Array(9).fill(0));
    tap('2'); tap('2');
    assert.equal(get('ATTEMPTS'), 4);
    assert.deepEqual(shown(), Array(9).fill(0));
    m.pressKey('2'); run(200);
    assert.equal(get('SECOND'), 1, 'held key must not select twice');
    assert.equal(get('ATTEMPTS'), 4);
    m.releaseKey('2'); run(25); tap('3');
    tap('2'); // Selecting an earlier matched card also clears all matches.
    assert.equal(get('ATTEMPTS'), 6);
    assert.deepEqual(shown(), Array(9).fill(0));
    for (const key of ['0', '9', 'A', 'F', '=', 'S', 'EX']) tap(key);
    assert.equal(get('ATTEMPTS'), 6);
    assert.deepEqual(shown(), Array(9).fill(0));

    // Two held keys: column 0 / PC5 (2) wins over column 8 / PC6 (1).
    m.pressKey('1'); m.pressKey('2'); run(40);
    assert.deepEqual(shown(), image([0, 0x37, 0, 0, 0, 0, 0, 0]));
    m.releaseKey('2'); run(40);
    assert.equal(get('SECOND'), 1, 'switching held keys cannot create another press');
    m.releaseKey('1'); run(25); tap('2');
    assert.deepEqual(shown(), Array(9).fill(0));

    // Decimal wrap is checked in the assembled CPU code, on both CPU types.
    m.write(s.ATTEMPTS, 0x99); tap('2'); tap('2');
    assert.equal(get('ATTEMPTS'), 0);
    m.write(s.ATTEMPTS, 0x09); tap('2'); tap('2');
    assert.equal(get('ATTEMPTS'), 0x10, 'decimal 09 -> 10');
    // Restore the first-attempt counter for an ideal four-pair finish.
    m.write(s.ATTEMPTS, 1);
    for (const key of ['2', '3', '4', '6', '1', '7', '5']) tap(key);
    const beforeWin = bursts.length;
    m.pressKey('8');
    until(() => m.cpu.pc === (board === 'pmi80' ? s.WON : s.WIN_WAIT), 200);
    const wonAt = m.cycles;
    m.releaseKey('8');
    until(() => m.cpu.pc === s.WIN_WAIT, 200);
    if (board === 'pmi80') {
      assert.equal(bursts.length - beforeWin, 2, 'HH replaces H on the fourth pair');
      checkTone(bursts.at(-2), 1000);
      checkTone(bursts.at(-1), 1000);
      const gap = (bursts.at(-1).start - bursts.at(-2).end) * 1000 / profile.clockHz;
      assert.ok(Math.abs(gap - 40) < 1, `HH gap ${gap} ms`);
      console.log(`${board}/${fw.id}: HH gap ${gap.toFixed(3)} ms`);
    }
    assert.deepEqual(shown(), image(vector));
    run(1750);
    assert.deepEqual(shown(), image(vector));
    until(() => m.cpu.pc === s.SCORE, 1200);
    const winMs = (m.cycles - wonAt) * 1000 / profile.clockHz;
    console.log(`${board}/${fw.id}: win ${winMs.toFixed(3)} ms, stack minimum ${minSp.toString(16)}`);
    assert.ok(Math.abs(winMs - 2000) < 10, `win time ${winMs} ms`);
    run(25);
    assert.equal(get('ATTEMPTS'), 4);
    assert.deepEqual(shown(), image([0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, digits[4]]));
    tap('S');
    assert.deepEqual(shown(), image([0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, digits[4]]));
    tap('=');
    until(() => get('ATTEMPTS') === 1, 3000);
    assert.equal(get('PAIRS'), 4);
    assert.deepEqual(shown(), Array(9).fill(0));
    assert.deepEqual(bytes('BOARD', 8).sort((a, b) => a - b), [...vector].sort((a, b) => a - b));
    // Exercise the real shuffle entry with further seeds, including its zero guard.
    for (const seed of [0, 1, 0x1234, 0xffff]) {
      m.cpu.pc = s.NEW_GAME;
      m.cpu.sp = 0x1fd9;
      putWord('RNG', seed);
      until(() => m.cpu.pc === s.CLEAR_SERIES, 6000);
      assert.notEqual(word('RNG'), 0);
      const boardBytes = bytes('BOARD', 8);
      assert.deepEqual([...boardBytes].sort((a, b) => a - b), [...vector].sort((a, b) => a - b));
      if (seed === 0) assert.deepEqual(boardBytes, vector);
    }
    assert.ok(minSp >= 0x1fb9);
  });
}
