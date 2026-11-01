// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Real monitor launches, matrix input and an independent coin-game oracle.
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
const initial = [3, 5, 8, 9, 15];
const title = [0x6d, 0x30, 0x38, 0x3e, 0x79, 0x50, 0, 0x5e, 0x3f, 0x38, 0x38, 0x77, 0x50];
const iLose = [0, 0x30, 0, 0x38, 0x5c, 0x6d, 0x79, 0];
const youLose = [0x6e, 0x3f, 0x3e, 0, 0x38, 0x5c, 0x6d, 0x79];
const nim = p => p[0] ^ (p[2] - p[1] - 1) ^ (p[4] - p[3] - 1);
const packed = [0, 1, 2, 3, 4];
const legal = p => p.length === 5 && p.every((v, k) => v >= 0 && v < 16 && (k === 0 || v > p[k - 1]));

function computer(p) {
  p = [...p];
  const ns = nim(p);
  if (ns) {
    for (const k of [0, 2, 4]) {
      const gap = p[k] - (k ? p[k - 1] : -1) - 1;
      if ((gap ^ ns) < gap) { p[k] -= gap - (gap ^ ns); return p; }
    }
    assert.fail('a nonzero nim sum must have a reducing move');
  }
  for (let k = 4; k >= 0; k--) if (p[k] > (k ? p[k - 1] : -1) + 1) {
    p[k]--; return p;
  }
  return null;
}

// This oracle solves the finite game by legal moves, without the nim formula.
const memo = new Map();
function winning(p) {
  const key = p.join(',');
  if (memo.has(key)) return memo.get(key);
  for (let k = 0; k < 5; k++) for (let target = k ? p[k - 1] + 1 : 0; target < p[k]; target++) {
    const next = [...p]; next[k] = target;
    if (!winning(next)) { memo.set(key, true); return true; }
  }
  memo.set(key, false); return false;
}

for (const [board, suffix] of [['pmi80', 'pmi80'], ['savia84', 'savia'], ['stone1', 'stone1']]) {
  const profile = BOARD_PROFILES[board];
  const source = fs.readFileSync(new URL(`programs/silver-dollar/silver-dollar-${suffix}.asm`, root));
  const asm = assemble(source.toString('utf8'));
  const s = asm.symbols;
  const entry = { id: `silver-dollar-${suffix}`, board, format: 'asm', start: board === 'pmi80' ? '1C00' : '1800' };
  const positions = board === 'savia84' ? [0, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8];
  const image = masks => {
    const display = Array(9).fill(0);
    masks.forEach((v, k) => { display[positions[k]] = v; });
    return display;
  };
  const track = p => {
    const masks = Array(8).fill(8);
    for (const v of p) masks[7 - (v >> 1)] |= v & 1 ? 0x30 : 6;
    return image(masks);
  };
  test(`${board}: source assembles entirely inside owned RAM`, () => {
    assert.deepEqual(asm.errors, []);
    assert.equal(s.START, parseInt(entry.start, 16));
    assert.ok(s.CODE_END <= s.VARS);
    assert.ok(s.VARS_END <= 0x1fb9);
    for (const block of asm.blocks) assert.ok(block.addr >= s.START && block.addr + block.bytes.length <= s.VARS);
    assert.doesNotMatch(source.toString(), /\b(?:JPE|JPO|CPE|CPO|RPE|RPO)\b/);
    console.log(`${board}: code/data ${s.CODE_END - s.START} B, variables ${s.VARS_END - s.VARS} B, reserved stack 32 B`);
  });

  test(`${board}: image ends with Wolf2026 and the header version`, () => {
    assert.deepEqual(asm.errors, []);
    const version = source.toString('utf8').match(/version (\d+)\.(\d+)\.(\d+):/);
    assert.ok(version);
    assert.equal(version[0], 'version 0.1.2:');
    const signature = Buffer.from(`Wolf2026v${version.slice(1).join('')}`, 'ascii');
    const last = asm.blocks.at(-1);
    assert.equal(last.addr + last.bytes.length, s.CODE_END, 'no emitted bytes may follow the signature');
    assert.equal(s.SIGNATURE, s.CODE_END - signature.length);
    assert.deepEqual(Buffer.from(last.bytes.slice(-signature.length)), signature);
    assert.ok(s.CODE_END <= s.VARS, 'the full signature must fit before variables');
  });

  test(`${board}: assembled computer is exact and optimal in all 4368 positions`, () => {
    assert.deepEqual(asm.errors, []);
    const m = profile.firmware[0].create(roms);
    for (const { addr, bytes } of asm.blocks) bytes.forEach((v, i) => m.write(addr + i, v));
    let total = 0, won = 0;
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 13; b++)
      for (let c = b + 1; c < 14; c++) for (let d = c + 1; d < 15; d++) for (let e = d + 1; e < 16; e++) {
        const p = [a, b, c, d, e], expected = computer(p);
        [255, ...p].forEach((v, k) => m.write(s.P + k, v));
        m.write(s.SELECTED, 1); m.write(s.RESULT, 0);
        m.cpu.pc = s.MACHINE; m.cpu.sp = 0x1fd9;
        let steps = 0;
        while (m.cpu.pc !== s.MACHINE_DONE && m.read(s.RESULT) !== 1) {
          m.cpu.step(); assert.ok(++steps < 1000);
        }
        const actual = Array.from({ length: 5 }, (_, k) => m.read(s.P + 1 + k));
        if (expected) {
          assert.deepEqual(actual, expected, p.join(','));
          assert.ok(legal(actual));
          if (winning(p)) { won++; assert.equal(winning(actual), false, p.join(',')); }
        } else assert.deepEqual(p, packed);
        assert.equal(winning(p), nim(p) !== 0);
        total++;
      }
    assert.equal(total, 4368); assert.equal(won, 3771);
  });

  test(`${board}: random starts match independently filtered 16-bit bitboards`, () => {
    const m = profile.firmware[0].create(roms);
    for (const { addr, bytes } of asm.blocks) bytes.forEach((v, k) => m.write(addr + k, v));
    // 6E51h first produces the original bitboard, which must be rejected.
    for (const seed of [0, 1, 0x365a, 0xffff, 0x6e51]) {
      let r = seed, expected;
      for (let tries = 0; tries < 65535; tries++) {
        r ||= 0x365a;
        r = (r >>> 1) ^ (r & 1 ? 0xb400 : 0);
        const p = Array.from({ length: 16 }, (_, k) => k).filter(k => r & (1 << k));
        if (p.length === 5 && nim(p) && p.join() !== initial.join()) { expected = p; break; }
      }
      assert.ok(expected);
      m.write(s.P, 255); m.write(s.RNG, seed & 255); m.write(s.RNG + 1, seed >>> 8);
      m.cpu.pc = s.RANDOM_GAME; m.cpu.sp = 0x1fd9;
      let steps = 0;
      while (m.cpu.pc !== s.REDRAW) { m.cpu.step(); assert.ok(++steps < 1000000); }
      assert.deepEqual(Array.from({ length: 5 }, (_, k) => m.read(s.P + k + 1)), expected);
      assert.equal(m.read(s.RNG) | m.read(s.RNG + 1) << 8, r);
    }
  });

  for (const fw of profile.firmware) test(`${board}/${fw.id}: panel start, title, rules, complete victory, restart, timing and sound`, () => {
    assert.deepEqual(asm.errors, []);
    const m = fw.create(roms);
    const at = ms => Math.round(ms * profile.clockHz / 1000);
    const run = ms => m.run(at(ms));
    const get = name => m.read(s[name]);
    const bytes = (name, n) => Array.from({ length: n }, (_, k) => m.read(s[name] + k));
    const coins = () => bytes('P', 6).slice(1);
    const until = (predicate, ms = 6000) => {
      const end = m.cycles + at(ms);
      while (!predicate() && m.cycles < end) m.cpu.step();
      assert.ok(predicate(), `timeout PC=${m.cpu.pc.toString(16)}`);
    };
    const tap = key => { m.pressKey(key); run(65); m.releaseKey(key); run(65); };
    const shown = () => {
      m.display.takeFrame(m.cycles); run(30);
      return litMasks(m.display.takeFrame(m.cycles), 9);
    };
    const setCoins = p => {
      until(() => m.cpu.pc === s.HUMAN, 100);
      [255, ...p].forEach((v, k) => m.write(s.P + k, v));
      m.write(s.SELECTED, 0); m.write(s.RESULT, 0);
      m.cpu.pc = s.REDRAW;
      run(45);
      assert.deepEqual(shown(), track(p));
    };
    let active = false, ownStack = false, minSp = 0x1fd9;
    let tone, silenceStart, titleDoneAt;
    const bursts = [], gaps = [], titleTimes = [], slots = [];
    const write = m.cpu.bus.write;
    m.cpu.bus.write = (a, v) => {
      if (active) assert.ok((a >= s.VARS && a < s.VARS_END) || (a >= 0x1fb9 && a < 0x1fd9),
        `write outside owned RAM: ${a.toString(16)}`);
      write(a, v);
    };
    const output = m.cpu.bus.output;
    m.cpu.bus.output = (p, v) => {
      if (active && (p & 255) === 0xf8) {
        if (tone) assert.equal(v & 0x40, 0x40, 'g must be off during tones');
        else assert.equal(v & 0x80, 0, 'PA7 must be low outside PMI-80 tones');
      }
      output(p, v);
      if (tone && m.display.digit >= 0) {
        tone.columns.add(m.display.digit);
        assert.equal(m.display.lit & 0x40, 0);
      }
    };
    const step = m.cpu.step.bind(m.cpu);
    m.cpu.step = () => {
      if (m.cpu.pc === s.START) active = true;
      if (active && m.cpu.pc === s.START + 4) ownStack = true;
      if (active && m.cpu.pc === s.TITLE_WAIT) titleTimes.push(m.cycles);
      if (active && m.cpu.pc === s.TITLE_DONE) titleDoneAt = m.cycles;
      if (active && m.cpu.pc === s.SLOT && slots.length < 90) slots.push(m.cycles);
      if (board === 'pmi80' && m.cpu.pc === s.SOUND_INIT) {
        if (silenceStart !== undefined) { gaps.push(m.cycles - silenceStart); silenceStart = undefined; }
        m.takeAudio(); tone = { start: m.cycles, columns: new Set() };
      }
      if (board === 'pmi80' && m.cpu.pc === s.SOUND_RETURN) {
        bursts.push({ ...tone, end: m.cycles, edges: m.takeAudio().edges });
        tone = undefined;
        assert.equal(m.k3.level, 1);
      }
      if (board === 'pmi80' && m.cpu.pc === s.SOUND_GAP && silenceStart === undefined) silenceStart = m.cycles;
      const value = step();
      if (active) {
        assert.equal(m.cpu.halted, false);
        assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END, `left code: ${m.cpu.pc.toString(16)}`);
        if (ownStack) minSp = Math.min(minSp, m.cpu.sp);
      }
      return value;
    };
    const checkTone = (burst, hz) => {
      const duration = (burst.end - burst.start) * 1000 / profile.clockHz;
      assert.ok(Math.abs(duration - 30) < 1, `tone duration ${duration} ms`);
      assert.equal(burst.edges.length, hz === 1000 ? 60 : 30);
      for (let k = 1; k < burst.edges.length - 1; k++) {
        const dt = burst.edges[k] - burst.edges[k - 1];
        assert.ok(Math.abs(dt * 2 * hz / profile.clockHz - 1) < 0.01, `half-period ${dt} states`);
        assert.equal(dt, hz === 1000 ? 553 : 1108);
      }
      assert.equal(burst.columns.size, 9, 'all digits must be refreshed during tones');
    };

    // Leave the monitor's final confirmation key down throughout the title.
    const release = m.releaseKey.bind(m);
    m.releaseKey = key => { if (!active) release(key); };
    startProgram(m, entry, source, { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
    m.releaseKey = release;
    m.pressKey('=');
    assert.deepEqual(shown(), [0, 0, ...title.slice(0, 7)]);
    for (let offset = 1; offset <= 6; offset++) {
      until(() => get('OFFSET') === offset && m.cpu.pc === s.TITLE_WAIT);
      assert.deepEqual(shown(), [0, 0, ...title.slice(offset, offset + 7)]);
    }
    until(() => m.cpu.pc === s.READY);
    assert.deepEqual(shown(), Array(9).fill(0));
    assert.equal(get('PLAYED'), 0, 'held launch key must prevent play');
    const durations = titleTimes.slice(1).map((t, k) => (t - titleTimes[k]) * 1000 / profile.clockHz);
    durations.forEach((t, k) => assert.ok(Math.abs(t - (k ? 250 : 1500)) < (k ? 5 : 30), `title window ${k}: ${t} ms`));
    const lastMs = (titleDoneAt - titleTimes[6]) * 1000 / profile.clockHz;
    assert.ok(Math.abs(lastMs - 1000) < 20, `last title window ${lastMs} ms`);
    const blankMs = (m.cycles - at(30) - titleDoneAt) * 1000 / profile.clockHz;
    assert.ok(Math.abs(blankMs - 400) < 8, `title blank ${blankMs} ms`);
    // The ninth slot also contains the frame's fixed bookkeeping; lit dwell is uniform.
    const slotMs = (slots[1] - slots[0]) * 1000 / profile.clockHz;
    for (let k = 1; k < slots.length; k++) if (k % 9 !== 0)
      assert.equal(slots[k] - slots[k - 1], slots[1] - slots[0], 'ordinary slots must be equal');
    console.log(`${board}/${fw.id}: slot ${slotMs.toFixed(4)} ms, title ${durations.map(v => v.toFixed(2)).join('/')} + ${lastMs.toFixed(2)}, blank ${blankMs.toFixed(2)} ms`);
    release('='); run(70);
    assert.deepEqual(coins(), initial);
    assert.deepEqual(shown(), image([0x38, 8, 8, 0x3e, 8, 0x38, 0x38, 8]));

    tap('='); assert.deepEqual(coins(), initial);
    if (board === 'pmi80') {
      m.write(s.DISPLAY, 0x40);
      assert.equal(shown()[0], 0x40);
    }
    tap('4'); assert.deepEqual(coins(), initial);
    if (board === 'pmi80') assert.equal(shown()[0], 0x40, 'g must resume after sound');
    if (board === 'pmi80') { assert.equal(bursts.length, 1); checkTone(bursts[0], 500); }
    for (const key of ['0', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'M', 'L', 'S', 'R', 'BR']) tap(key);
    assert.deepEqual(coins(), initial);
    tap('1'); tap('2'); assert.deepEqual(coins(), [2, 5, 8, 9, 15]);
    tap('='); assert.deepEqual(coins(), [2, 5, 8, 9, 10]);
    if (board === 'pmi80') checkTone(bursts.at(-1), 1000);

    setCoins(initial);
    until(() => m.cpu.pc === s.HUMAN, 100);
    const oneFrame = () => { m.cpu.step(); until(() => m.cpu.pc === s.HUMAN, 100); };
    m.pressKey('5');
    oneFrame(); assert.deepEqual(coins(), initial);
    oneFrame(); assert.deepEqual(coins(), initial);
    oneFrame(); assert.deepEqual(coins(), [3, 5, 8, 9, 14]);
    release('5');
    oneFrame(); assert.equal(get('LOCK'), 1);
    oneFrame(); assert.equal(get('LOCK'), 1);
    oneFrame(); assert.equal(get('LOCK'), 0);
    setCoins(initial);
    // A short pulse, a held key and changing held keys all exercise the interlock.
    m.pressKey('5'); run(8); release('5'); run(70);
    assert.deepEqual(coins(), initial);
    m.pressKey('5'); run(220); assert.deepEqual(coins(), [3, 5, 8, 9, 14]);
    m.pressKey('1'); release('5'); run(80);
    assert.deepEqual(coins(), [3, 5, 8, 9, 14]);
    release('1'); run(70);
    setCoins(initial);
    m.pressKey('1'); m.pressKey('5'); run(80);
    assert.deepEqual(coins(), initial, 'multiple keys must be rejected');
    release('1'); run(80);
    assert.deepEqual(coins(), initial, 'a chord requires full release');
    release('5'); run(70);
    m.pressKey('1'); m.pressKey('3'); run(80);
    assert.deepEqual(coins(), initial, 'two keys in one column must be rejected');
    release('1'); release('3'); run(70);
    for (let k = 0; k < 4; k++) tap('5');
    assert.deepEqual(coins(), [3, 5, 8, 9, 11]);
    tap('='); assert.deepEqual(coins(), [3, 5, 8, 9, 10]);

    // Continue the unique winning opening with a minimax player until I LoSE.
    let turns = 1;
    while (get('RESULT') === 0) {
      const p = coins();
      let move;
      for (let k = 0; k < 5 && !move; k++) for (let target = k ? p[k - 1] + 1 : 0; target < p[k]; target++) {
        const next = [...p]; next[k] = target;
        if (!winning(next)) { move = [k, p[k] - target]; break; }
      }
      assert.ok(move, `no winning player move from ${p}`);
      for (let n = 0; n < move[1]; n++) tap(String(move[0] + 1));
      if (coins().join() === packed.join()) {
        assert.equal(get('RESULT'), 1, 'the packing player push must win without confirmation');
      } else {
        assert.equal(get('RESULT'), 0);
        tap('=');
      }
      assert.ok(++turns <= 30);
    }
    assert.equal(get('RESULT'), 1);
    assert.deepEqual(coins(), packed);
    assert.deepEqual(shown(), image(iLose));
    if (board === 'pmi80') {
      checkTone(bursts.at(-2), 1000); checkTone(bursts.at(-1), 1000);
      assert.ok(Math.abs(gaps.at(-1) * 1000 / profile.clockHz - 40) < 1);
    }
    until(() => m.cpu.pc === s.END_WAIT && bytes('DISPLAY', 9).join() === track(packed).join(), 2000);
    assert.deepEqual(shown(), track(packed));
    tap('A');
    assert.ok(legal(coins())); assert.notDeepEqual(coins(), initial); assert.notEqual(nim(coins()), 0);
    assert.equal(get('SELECTED'), 0);
    assert.equal(get('OFFSET'), 7, 'restart must not repeat the title');
    tap('EX'); assert.ok(legal(coins())); assert.notEqual(nim(coins()), 0);

    setCoins([0, 1, 2, 3, 5]);
    const previousBursts = bursts.length;
    m.pressKey('5');
    until(() => get('RESULT') === 1, 50);
    assert.deepEqual(coins(), packed, 'packing must end the game while the push key is still held');
    until(() => bytes('DISPLAY', 9).join() === image(iLose).join(), 2);
    assert.equal(bursts.length, previousBursts, 'the win message must precede completion of the win sound');
    // Keep the final coin key down: no confirmation, repeat, or new game is allowed.
    run(200);
    assert.equal(get('RESULT'), 1);
    assert.deepEqual(shown(), image(iLose));
    if (board === 'pmi80') {
      assert.equal(bursts.length, previousBursts + 2, 'the immediate win must play exactly HH');
      checkTone(bursts.at(-2), 1000); checkTone(bursts.at(-1), 1000);
    }
    release('5'); run(70);
    tap('EX');
    setCoins([0, 1, 2, 4, 5]);
    tap('4'); tap('=');
    assert.equal(get('RESULT'), 2);
    assert.deepEqual(shown(), image(youLose));
    if (board === 'pmi80') checkTone(bursts.at(-1), 500);
    tap('0'); assert.ok(legal(coins())); assert.notEqual(nim(coins()), 0);

    // Vary the precise frame boundary used as entropy; all new games stay winning.
    const starts = new Set();
    for (let k = 0; k < 12; k++) {
      run(k * 13); tap('EX');
      until(() => m.cpu.pc === s.HUMAN, 1000);
      assert.ok(legal(coins())); assert.notEqual(nim(coins()), 0);
      starts.add(coins().join(','));
    }
    assert.ok(starts.size > 5, `only ${starts.size} random starts`);
    assert.ok(minSp >= 0x1fb9);
    if (board === 'pmi80') for (const edges of [60, 30]) {
      const burst = bursts.find(b => b.edges.length === edges);
      console.log(`${board}/${fw.id}: ${edges === 60 ? 'H' : 'L'} ${(1000 * (burst.end - burst.start) / profile.clockHz).toFixed(4)} ms, half-period ${burst.edges[1] - burst.edges[0]} states`);
    }
    console.log(`${board}/${fw.id}: full victory ${turns} player turns, min SP=${minSp.toString(16)}, ${starts.size} random starts`);
  });
}
