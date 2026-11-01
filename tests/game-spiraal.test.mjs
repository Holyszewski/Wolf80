// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Independent spiral vectors and physical matrix input on every supported monitor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const roms = Object.fromEntries(Object.entries({
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
}).map(([key, path]) => [key, fs.readFileSync(new URL(`roms/${path}`, root))]));
const title = [0, 0, 0x6d, 0x73, 6, 0x50, 0x77, 0x77, 0x38];
const complete = [0, 0, 0x69, 0x49, 0x49, 0x49, 0x49, 0x4d, 0];
const path = [
  ...[7, 6, 5, 4, 3, 2].map(p => [p, 1]), [2, 0x20],
  ...[2, 3, 4, 5, 6, 7].map(p => [p, 0x40]), [7, 4],
  ...[7, 6, 5, 4, 3, 2].map(p => [p, 8]),
];

for (const [board, suffix] of [['pmi80', 'pmi80'], ['savia84', 'savia'], ['stone1', 'stone1']]) {
  const profile = BOARD_PROFILES[board];
  const source = fs.readFileSync(new URL(`programs/spiraal/spiraal-${suffix}.asm`, root));
  const asm = assemble(source.toString('utf8')), s = asm.symbols;
  const entry = { id: `spiraal-${suffix}`, board, format: 'asm', start: board === 'pmi80' ? '1C00' : '1800' };
  test(`${board}: documented 8080 assembly fits owned RAM and ends with its version signature`, () => {
    assert.deepEqual(asm.errors, []);
    assert.equal(s.START, parseInt(entry.start, 16));
    assert.ok(s.CODE_END <= s.VARS);
    assert.ok(s.VARS_END <= 0x1f60);
    for (const b of asm.blocks) assert.ok(b.addr >= s.START && b.addr + b.bytes.length <= s.VARS);
    const signature = Buffer.from('Wolf2026v011', 'ascii');
    const imageEnd = Math.max(...asm.blocks.map(b => b.addr + b.bytes.length));
    assert.equal(imageEnd, s.CODE_END, 'no initialized bytes may follow CODE_END');
    assert.equal(s.SIGNATURE, imageEnd - signature.length);
    const tail = asm.blocks.find(b => b.addr <= s.SIGNATURE && b.addr + b.bytes.length === imageEnd);
    assert.ok(tail, 'the complete signature must be the final initialized bytes');
    assert.deepEqual(Buffer.from(tail.bytes.slice(-signature.length)), signature);
    assert.match(source.toString('utf8'), /^; Spiraal .*version 0\.1\.1:/);
    assert.match(source.toString('utf8'), /^; 0\.1\.1\s+/m);
    assert.doesNotMatch(source.toString(), /^\s*(?:JPE|JPO|CPE|CPO|RPE|RPO)\b/m);
    console.log(`${board}: ${s.CODE_END - s.START} code/table bytes, ${s.VARS_END - s.VARS} variable bytes`);
  });

  for (const fw of profile.firmware) test(`${board}/${fw.id}: title, spiral, reactions, scores, restart and I/O`, () => {
    assert.deepEqual(asm.errors, []);
    const m = fw.create(roms);
    const at = ms => Math.round(ms * profile.clockHz / 1000);
    const ms = states => states * 1000 / profile.clockHz;
    const run = duration => m.run(at(duration));
    const get = name => m.read(s[name]);
    const bytes = () => Array.from({ length: 9 }, (_, i) => m.read(s.DISPLAY + i));
    const until = (predicate, limit = 8000) => {
      const end = m.cycles + at(limit);
      while (!predicate() && m.cycles < end) m.cpu.step();
      assert.ok(predicate(), `timeout at PC=${m.cpu.pc.toString(16)}`);
      assert.equal(m.cpu.halted, false);
    };
    const boundary = (name, limit) => until(() => m.cpu.pc === s[name], limit);
    const shown = () => {
      run(45); // Drain the previous digit and any 30-ms event tone.
      m.display.takeFrame(m.cycles);
      run(20);
      return litMasks(m.display.takeFrame(m.cycles), 9);
    };
    let active = false, minSP = 0x1f80, paWrites = 0, starts = 0, titleAt, titleUntil;
    let lastSlot, slotTimes = [], audioWrites = [];
    const write = m.cpu.bus.write;
    m.cpu.bus.write = (a, v) => {
      if (active) {
        assert.ok((a >= s.VARS && a < s.VARS_END) || (a >= 0x1f60 && a < 0x1f80),
          `write outside owned RAM: ${a.toString(16)}`);
        if (a < 0x1f80 && a >= 0x1f60) minSP = Math.min(minSP, a);
      }
      write(a, v);
    };
    const output = m.cpu.bus.output;
    m.cpu.bus.output = (p, v) => {
      if (active && (p & 255) === 0xf8) {
        paWrites++;
        if (board !== 'pmi80') assert.equal(v & 128, 0, 'PA7 must stay low');
        if (board === 'pmi80' && get('TONE_MASK') === 0)
          assert.equal(v & 128, 0, 'PA7 must stay low outside a tone');
        if (get('TONE_LEFT') || (v & 128)) {
          assert.equal(v & 0x40, 0x40, 'segment g must be off throughout a tone');
          audioWrites.push([m.cycles, v]);
        }
      }
      output(p, v);
    };
    const step = m.cpu.step.bind(m.cpu);
    m.cpu.step = () => {
      if (m.cpu.pc === s.START) active = true;
      if (active) {
        if (m.cpu.pc === s.NEW_GAME) starts++;
        if (m.cpu.pc === s.TITLE_WAIT) titleAt = m.cycles;
        if (m.cpu.pc === s.RELEASE && titleUntil === undefined) titleUntil = m.cycles;
        assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END, 'CPU must remain in the game');
        if (m.cpu.pc === s.SLOT) {
          if (lastSlot !== undefined) slotTimes.push(ms(m.cycles - lastSlot));
          lastSlot = m.cycles;
        }
      }
      return step();
    };
    // Keep the final panel launch key down: it must never become the start press.
    const release = m.releaseKey.bind(m);
    m.releaseKey = key => { if (!active) release(key); };
    startProgram(m, entry, source, {
      bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys,
    });
    m.releaseKey = release;
    assert.deepEqual(shown(), title);
    run(1800);
    const titleMs = ms(titleUntil - titleAt);
    console.log(`${board}/${fw.id}: title ${titleMs.toFixed(4)} ms`);
    assert.ok(Math.abs(titleMs - 1500) < 15);
    assert.equal(get('STARTED'), 0, 'held launch key cannot start the match');
    assert.deepEqual(shown(), title);
    release('='); boundary('READY', 100);
    m.pressKey('4'); boundary('DRAW', 100); // Column one must also count as any key.
    release('4'); run(20);
    assert.equal(get('PLAYER'), 0);
    assert.equal(get('SPEED'), 255);
    assert.equal(get('LOCK'), 0);

    function draw(reverse = false) {
      const expected = Array(9).fill(0), periods = [];
      const vector = reverse ? [...path].reverse() : path;
      let before = m.cycles;
      for (let i = 0; i < 20; i++) {
        boundary('ADD_SEGMENT');
        const writesBefore = paWrites;
        periods.push(ms(m.cycles - before));
        m.cpu.step();
        boundary(i === 19 ? 'EARLY' : 'DRAW', 5);
        assert.equal(paWrites, writesBefore, 'no refresh before the early-key check');
        const [p, mask] = vector[i];
        expected[p] |= mask;
        assert.deepEqual(bytes(), expected, `segment ${i}, ${reverse ? 'right' : 'left'} player`);
        before = m.cycles;
      }
      assert.deepEqual(bytes(), complete);
      return periods;
    }
    const slow = draw();
    console.log(`${board}/${fw.id}: initial drawing step ${slow[1].toFixed(4)} ms`);
    assert.ok(slow.slice(1).every(t => Math.abs(t - 261.12) < 2.62));
    const beforeEarlyCheck = paWrites;
    boundary('WINDOW', 5);
    assert.equal(paWrites, beforeEarlyCheck, 'OWN must run before the first completed-spiral refresh');
    assert.deepEqual(shown(), complete);
    boundary('WINDOW', 20);
    const quantumBegin = m.cycles;
    for (let i = 0; i < 30; i++) { m.cpu.step(); boundary('WINDOW', 20); }
    const quantum = ms(m.cycles - quantumBegin) / 30;
    console.log(`${board}/${fw.id}: mean reaction quantum ${quantum} ms`);
    assert.ok(Math.abs(quantum - 6.656) < 0.067, '13-tick mean must be within one percent');
    const oldSpeed = get('SPEED');
    m.pressKey('0'); boundary('NEXT', 50);
    const fastSpeed = get('SPEED');
    assert.ok(fastSpeed < oldSpeed && fastSpeed > 0);
    release('0'); boundary('DRAW', 5);
    assert.equal(get('PLAYER'), 255);
    if (board === 'pmi80') {
      m.takeAudio(); audioWrites = [];
      run(40);
      const edges = m.takeAudio().edges;
      const spans = edges.slice(1).map((t, i) => ms(t - edges[i]));
      console.log(`H: ${edges.length} edges, median half-period ${spans.sort((a,b)=>a-b)[spans.length>>1]} ms`);
      assert.ok(edges.length >= 50);
      assert.ok(audioWrites.length >= 50);
      assert.ok(Math.abs(ms(edges.at(-1) - edges[0]) - 29.5) < 1);
      assert.ok(spans.every(t => Math.abs(t - 0.5) < 0.06));
    }
    const quicker = draw(true);
    assert.ok(quicker[1] < slow[1]);
    boundary('WINDOW', 5);
    const windowStart = m.cycles;
    const beforeQuantum = get('SPEED');
    m.cpu.step(); boundary('WINDOW', 30);
    assert.equal(get('SPEED'), beforeQuantum - 1);
    console.log(`${board}/${fw.id}: reaction quantum ${ms(m.cycles-windowStart).toFixed(4)} ms`);
    // No reaction: the left player scores, and then plays next at speed 255.
    boundary('SCORE_WAIT', 3000);
    const scoreAt = m.cycles;
    assert.equal(get('SCORE_L'), 1);
    assert.equal(get('SCORE_R'), 0);
    assert.deepEqual(shown(), [0, 0, 0x3f, 6, 0, 0, 0x3f, 0x3f, 0]);
    boundary('NEXT', 2000);
    const scoreMs = ms(m.cycles - scoreAt);
    console.log(`${board}/${fw.id}: score hold ${scoreMs.toFixed(4)} ms`);
    assert.ok(Math.abs(scoreMs - 1568.256) < 16);
    m.cpu.step(); boundary('DRAW', 5);
    assert.equal(get('PLAYER'), 0);
    assert.equal(get('SPEED'), 255);

    function restart() {
      const startsBefore = starts;
      m.pressKey('='); boundary('NEW_GAME', 30); m.cpu.step(); boundary('DRAW', 5);
      assert.equal(get('SCORE_L'), 0);
      assert.equal(get('SCORE_R'), 0);
      assert.equal(get('SPEED'), 255);
      assert.equal(get('PLAYER'), 0);
      run(20); // Holding '=' must not keep restarting the draw.
      assert.equal(starts, startsBefore + 1);
      assert.ok(get('COLUMN') < 9);
      release('='); run(15);
    }
    restart();
    // A brief press during drawing, released before completion, is ignored.
    m.write(s.SPEED, 16);
    m.pressKey('0'); run(20); release('0'); run(15);
    draw(); boundary('WINDOW', 5);
    assert.equal(get('SCORE_R'), 0);
    m.pressKey('0'); m.pressKey('3'); // Independent own-side test despite the other key.
    boundary('NEXT', 50); release('0'); release('3');
    m.cpu.step(); boundary('DRAW', 5);
    run(15);
    // Hold both keys through the end of the right player's draw: early loss.
    m.pressKey('0'); m.pressKey('3');
    boundary('LOSS', 1000);
    m.takeAudio(); audioWrites = [];
    boundary('SCORE_WAIT', 5);
    assert.equal(get('SCORE_L'), 1);
    assert.equal(get('SCORE_R'), 0);
    if (board === 'pmi80') {
      run(40);
      const edges = m.takeAudio().edges;
      const spans = edges.slice(1).map((t, i) => ms(t - edges[i]));
      console.log(`L: ${edges.length} edges, median half-period ${spans.sort((a,b)=>a-b)[spans.length>>1]} ms`);
      assert.equal(edges.length, 30);
      assert.ok(spans.every(t => Math.abs(t - 1) < 0.07));
      assert.ok(Math.abs(ms(edges.at(-1) - edges[0]) - 29) < 1);
      assert.ok(audioWrites.length >= 50);
    }
    release('0'); release('3');
    // Decimal carry/wrap and the two blank separator positions.
    restart(); m.write(s.SCORE_R, 0x99); m.write(s.SCORE_L, 0x09);
    m.write(s.SPEED, 8); run(20); m.pressKey('0');
    boundary('SCORE_WAIT', 1000);
    assert.equal(get('SCORE_R'), 0);
    release('0');
    assert.deepEqual(shown(), [0, 0, 0x3f, 0x6f, 0, 0, 0x3f, 0x3f, 0]);
    boundary('NEXT', 2000); m.cpu.step(); boundary('DRAW', 5);
    m.write(s.SPEED, 8); run(20); m.pressKey('3');
    boundary('SCORE_WAIT', 1000); release('3');
    assert.equal(get('SCORE_L'), 0x10);
    assert.deepEqual(shown(), [0, 0, 6, 0x3f, 0, 0, 0x3f, 0x3f, 0]);
    // The explicit score example: a left-side early press changes 05/11 to 05/12.
    restart(); m.write(s.SCORE_L, 5); m.write(s.SCORE_R, 0x11);
    m.write(s.SPEED, 4); run(15); m.pressKey('0');
    boundary('SCORE_WAIT', 1000); release('0');
    assert.deepEqual(shown(), [0, 0, 0x3f, 0x6d, 0, 0, 6, 0x5b, 0]);
    // At S=1 the decrement wins over even a physically pressed reaction key.
    restart(); m.write(s.SPEED, 4); run(15);
    boundary('WINDOW', 1000); m.write(s.SPEED, 1);
    m.pressKey('0'); boundary('SCORE_WAIT', 30); release('0');
    assert.equal(get('SCORE_R'), 1);
    assert.equal(get('SPEED'), 0);
    restart();
    // Fastest drawing progresses during H; sound must not block the game for 30 ms.
    m.write(s.SPEED, 4); run(15);
    boundary('WINDOW', 1000);
    m.pressKey('0'); boundary('NEXT', 30); release('0');
    const soundAt = m.cycles;
    if (board === 'pmi80') m.takeAudio();
    m.cpu.step(); boundary('DRAW', 5);
    const fastTimes = [];
    for (let i = 0; i < 7; i++) {
      boundary('ADD_SEGMENT', 10);
      fastTimes.push(m.cycles);
      if (i === 0 && board === 'pmi80') assert.ok(get('TONE_LEFT') > 0);
      m.cpu.step(); boundary('DRAW', 5);
    }
    assert.ok(ms(fastTimes[0] - soundAt) < 8);
    const minimumStep = ms(fastTimes.at(-1) - fastTimes[0]) / 6;
    console.log(`${board}/${fw.id}: minimum drawing step ${minimumStep.toFixed(4)} ms`);
    assert.ok(Math.abs(minimumStep - 4.096) < 0.41);
    if (board === 'pmi80') {
      run(10);
      const edges = m.takeAudio().edges;
      const longest = Math.max(...edges.slice(1).map((t, i) => ms(t - edges[i])));
      const duration = ms(edges.at(-1) - edges[0]);
      console.log(`H during fastest drawing: ${duration.toFixed(4)} ms, longest half-period ${longest.toFixed(4)} ms`);
      assert.ok(edges.length >= 48 && edges.length <= 60);
      assert.ok(Math.abs(duration - 30) < 2 && longest < 1.3);
    }
    assert.ok(minSP >= 0x1f60);
    assert.equal(m.cpu.halted, false);
    slotTimes.sort((a,b)=>a-b);
    console.log(`${board}/${fw.id}: slot median ${slotTimes[slotTimes.length>>1].toFixed(4)} ms; minimum stack ${minSP.toString(16)}`);
  });
}
